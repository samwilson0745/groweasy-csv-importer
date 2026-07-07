import { test } from "node:test";
import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import { guardConnection } from "../utils/connectionGuard";
import type { Request, Response } from "express";

function fakeReq(): Request {
  return new EventEmitter() as unknown as Request;
}

function fakeRes() {
  const calls: { status?: number; json?: unknown; ended: boolean } = { ended: false };
  const emitter = new EventEmitter();
  const res = Object.assign(emitter, {
    headersSent: false,
    writableEnded: false,
    status(code: number) {
      calls.status = code;
      return res;
    },
    json(body: unknown) {
      calls.json = body;
      res.headersSent = true;
      res.writableEnded = true;
      return res;
    },
    end() {
      calls.ended = true;
      res.writableEnded = true;
      return res;
    },
  });
  return { res: res as unknown as Response & EventEmitter, calls };
}

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

test("guardConnection lets a fast handler settle before the timeout fires", async () => {
  const req = fakeReq();
  const { res, calls } = fakeRes();
  const guard = guardConnection(req, res, 30, "too slow");

  assert.equal(guard.isSettled(), false);
  guard.settle();
  res.json({ ok: true });
  guard.dispose();

  await wait(60);
  assert.deepEqual(calls.json, { ok: true });
  assert.equal(calls.status, undefined, "timeout should not have fired after settle()");
});

test("guardConnection sends a clean 504 if the handler never settles in time", async () => {
  const req = fakeReq();
  const { res, calls } = fakeRes();
  const guard = guardConnection(req, res, 20, "took too long");

  await wait(50);

  assert.equal(guard.isSettled(), true);
  assert.equal(calls.status, 504);
  assert.deepEqual(calls.json, { error: "took too long" });
  guard.dispose();
});

test("guardConnection marks settled when the client disconnects early, without writing a response", async () => {
  const req = fakeReq();
  const { res, calls } = fakeRes();
  const guard = guardConnection(req, res, 30, "too slow");

  // Simulates the response's underlying connection dying before we ever
  // call res.json()/res.end() - a genuine client abort.
  res.emit("close");
  assert.equal(guard.isSettled(), true);
  assert.equal(guard.wasClientDisconnect(), true);

  await wait(60);
  assert.equal(calls.status, undefined);
  assert.equal(calls.json, undefined);
  guard.dispose();
});

test("guardConnection ignores req's own close event (fires early for buffered uploads, unrelated to the client)", async () => {
  const req = fakeReq();
  const { res, calls } = fakeRes();
  const guard = guardConnection(req, res, 30, "too slow");

  // multer fully reads the request body before the handler runs, so req's
  // "close" fires almost immediately - well before any response is sent -
  // regardless of whether the client is still there. The guard must not
  // treat this as a disconnect.
  (req as unknown as EventEmitter).emit("close");
  assert.equal(guard.isSettled(), false);

  guard.settle();
  res.json({ ok: true });
  guard.dispose();

  assert.deepEqual(calls.json, { ok: true });
});

test("guardConnection does not flag a normal completed response as a client disconnect", async () => {
  const req = fakeReq();
  const { res, calls } = fakeRes();
  const guard = guardConnection(req, res, 30, "too slow");

  guard.settle();
  res.json({ ok: true });
  // res "close" still fires after a normal response finishes (socket
  // teardown), but writableEnded is already true by then, so it must not be
  // mistaken for a client disconnect.
  res.emit("close");

  assert.equal(guard.isSettled(), true);
  assert.equal(guard.wasClientDisconnect(), false);
  assert.deepEqual(calls.json, { ok: true });
  guard.dispose();
});

test("guardConnection.dispose() stops the timeout from firing at all", async () => {
  const req = fakeReq();
  const { res, calls } = fakeRes();
  const guard = guardConnection(req, res, 20, "took too long");

  guard.dispose();
  await wait(50);

  assert.equal(calls.status, undefined);
  assert.equal(calls.json, undefined);
});
