import { Request, Response } from "express";

export interface ConnectionGuard {
  /** True once the response has been sent, the request timed out, or the client disconnected. */
  isSettled(): boolean;
  /** True if settled specifically because the client disconnected early (not a timeout, not our own response). */
  wasClientDisconnect(): boolean;
  /** Call right before you write a response, to claim ownership and stop the timeout timer. */
  settle(): void;
  /** Clean up the timer/listener - call in a `finally` block once the handler is done. */
  dispose(): void;
}

/**
 * Guards a route handler against two ways a slow request can go wrong:
 *
 *  - The handler takes too long (e.g. AI extraction on a huge CSV). Instead
 *    of the connection hanging indefinitely or getting abruptly reset by a
 *    hosting platform's own proxy timeout, the client gets a clean JSON 504
 *    and the connection is closed on our terms.
 *  - The client disconnects first (their own fetch timeout fired, they
 *    closed the tab, etc.). We stop trying to write to a dead socket
 *    instead of throwing/logging a write-after-end style error, and the
 *    in-flight work's eventual result is just quietly discarded.
 *
 * Usage: call `guard.settle()` immediately before every response you send,
 * and check `guard.isSettled()` before sending anything, since a timeout or
 * client disconnect may have already claimed the response.
 */
export function guardConnection(
  req: Request,
  res: Response,
  timeoutMs: number,
  timeoutMessage = "The request took too long and was stopped."
): ConnectionGuard {
  let settled = false;
  let clientDisconnected = false;

  const timer = setTimeout(() => {
    if (settled) return;
    settled = true;
    if (!res.headersSent) {
      res.status(504).json({ error: timeoutMessage });
    } else {
      res.end();
    }
  }, timeoutMs);

  // IMPORTANT: this listens on `res`, not `req`. For a buffered upload
  // (multer reads the whole body into memory before the handler even runs),
  // `req`'s own "close" event fires as soon as the request stream has been
  // fully consumed - which happens almost immediately, completely unrelated
  // to whether the client is still connected. Using `req.on("close")` here
  // previously caused every request to look "disconnected" within about a
  // second, so a slower-but-successful AI extraction would finish, find
  // `isSettled() === true`, and silently discard a perfectly good result.
  // `res`'s "close" event fires when the response's underlying connection
  // actually ends - either after we finish writing (writableEnded === true,
  // a normal completion we should ignore) or because the client genuinely
  // went away before we could respond (writableEnded === false).
  const onClose = () => {
    if (res.writableEnded) return;
    clientDisconnected = true;
    settled = true;
    clearTimeout(timer);
  };
  res.on("close", onClose);

  return {
    isSettled: () => settled,
    wasClientDisconnect: () => clientDisconnected,
    settle: () => {
      settled = true;
      clearTimeout(timer);
    },
    dispose: () => {
      clearTimeout(timer);
      res.off("close", onClose);
    },
  };
}
