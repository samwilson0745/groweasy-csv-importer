import { test } from "node:test";
import assert from "node:assert/strict";
import { mapWithConcurrencyLimit } from "../services/aiExtractor";

test("mapWithConcurrencyLimit never runs more than `limit` tasks at once", async () => {
  const items = Array.from({ length: 20 }, (_, i) => i);
  let inFlight = 0;
  let maxInFlight = 0;

  const results = await mapWithConcurrencyLimit(items, 3, async (item) => {
    inFlight += 1;
    maxInFlight = Math.max(maxInFlight, inFlight);
    await new Promise((resolve) => setTimeout(resolve, 5));
    inFlight -= 1;
    return item * 2;
  });

  assert.ok(maxInFlight <= 3, `expected max 3 concurrent, saw ${maxInFlight}`);
  assert.deepEqual(results, items.map((i) => i * 2));
});

test("mapWithConcurrencyLimit preserves result order even when tasks finish out of order", async () => {
  const items = [50, 10, 30, 5, 40];
  const results = await mapWithConcurrencyLimit(items, 2, async (delayMs) => {
    await new Promise((resolve) => setTimeout(resolve, delayMs));
    return delayMs;
  });
  assert.deepEqual(results, items);
});

test("mapWithConcurrencyLimit handles an empty list without hanging", async () => {
  const results = await mapWithConcurrencyLimit<number, number>([], 5, async (item) => item);
  assert.deepEqual(results, []);
});
