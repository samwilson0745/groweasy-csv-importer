import { test } from "node:test";
import assert from "node:assert/strict";
import { extractErrorMessage, AiClientError } from "../services/aiClient";

test("extractErrorMessage pulls the human message out of a Gemini/OpenAI-style error body", () => {
    const body = JSON.stringify({
          error: {
                  code: 503,
                  message: "This model is currently experiencing high demand. Please try again later.",
                  status: "UNAVAILABLE",
          },
    });
    assert.equal(
          extractErrorMessage(body),
          "This model is currently experiencing high demand. Please try again later."
        );
});

test("extractErrorMessage handles a plain string error field", () => {
    const body = JSON.stringify({ error: "rate limited" });
    assert.equal(extractErrorMessage(body), "rate limited");
});

test("extractErrorMessage falls back to a trimmed raw body when the shape is unexpected", () => {
    assert.equal(extractErrorMessage("  plain text failure  "), "plain text failure");
    assert.equal(extractErrorMessage(""), "no response body");
    assert.equal(extractErrorMessage("not json at all {"), "not json at all {");
});

test("extractErrorMessage truncates very long bodies instead of dumping them whole", () => {
    const long = "x".repeat(500);
    const result = extractErrorMessage(long);
    assert.ok(result.length <= 304);
    assert.ok(result.endsWith("..."));
});

test("AiClientError defaults to retryable unless told otherwise", () => {
    const retryableByDefault = new AiClientError("transient");
    assert.equal(retryableByDefault.retryable, true);

       const permanent = new AiClientError("bad key", { retryable: false });
    assert.equal(permanent.retryable, false);

       const withStatus = new AiClientError("overloaded", { status: 503, retryable: true });
    assert.equal(withStatus.status, 503);
    assert.equal(withStatus.retryable, true);
});
