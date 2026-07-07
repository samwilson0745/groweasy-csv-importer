import { Request, Response, NextFunction } from "express";

/**
 * Minimal request logger - prints one line per request when it finishes,
 * with method, path, status code, and duration. This is deliberately simple
 * (no external dependency like morgan) but is the single most useful thing
 * to have visible in the terminal when diagnosing "it just says something
 * went wrong" reports: it tells you whether the request arrived at all,
 * and what status it eventually resolved with.
 */
export function requestLogger(req: Request, res: Response, next: NextFunction) {
  const start = Date.now();
  console.log(`[req] --> ${req.method} ${req.originalUrl}`);

  res.on("finish", () => {
    const durationMs = Date.now() - start;
    const marker = res.statusCode >= 500 ? "✗" : res.statusCode >= 400 ? "!" : "✓";
    console.log(`[req] ${marker} ${req.method} ${req.originalUrl} -> ${res.statusCode} (${durationMs}ms)`);
  });

  next();
}
