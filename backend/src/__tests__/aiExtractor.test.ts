import { test } from "node:test";
import assert from "node:assert/strict";
import { extractCrmRecords } from "../services/aiExtractor";
import { AiClientError } from "../services/aiClient";
import { RawRow } from "../types/crm";

function fakeAi(resultsByBatch: Record<string, unknown>[]) {
  let call = 0;
  return async () => {
    const payload = resultsByBatch[call];
    call += 1;
    return JSON.stringify(payload);
  };
}

test("extractCrmRecords maps imported rows and preserves row order", async () => {
  const rows: RawRow[] = [
    { "Full Name": "John Doe", "Email": "john@example.com" },
    { "Full Name": "Jane Roe", "Email": "jane@example.com" },
  ];

  const ai = fakeAi([
    {
      results: [
        {
          index: 0,
          status: "imported",
          record: {
            created_at: "2026-05-13 14:20:48",
            name: "John Doe",
            email: "john@example.com",
            country_code: "+91",
            mobile_without_country_code: "9876543210",
            company: null,
            city: null,
            state: null,
            country: null,
            lead_owner: null,
            crm_status: "GOOD_LEAD_FOLLOW_UP",
            crm_note: null,
            data_source: "meridian_tower",
            possession_time: null,
            description: null,
          },
        },
        {
          index: 1,
          status: "imported",
          record: {
            created_at: "2026-05-13 14:25:30",
            name: "Jane Roe",
            email: "jane@example.com",
            country_code: null,
            mobile_without_country_code: null,
            company: null,
            city: null,
            state: null,
            country: null,
            lead_owner: null,
            crm_status: "NOT_A_REAL_STATUS", // invalid on purpose
            crm_note: null,
            data_source: "not_a_real_source", // invalid on purpose
            possession_time: null,
            description: null,
          },
        },
      ],
    },
  ]);

  const result = await extractCrmRecords(rows, ai);

  assert.equal(result.totalImported, 2);
  assert.equal(result.totalSkipped, 0);
  assert.equal(result.imported[0].name, "John Doe");
  // Invalid enum values must be coerced to "" rather than passed through.
  assert.equal(result.imported[1].crm_status, "");
  assert.equal(result.imported[1].data_source, "");
});

test("extractCrmRecords enforces the skip rule even if the AI tries to import a contactless row", async () => {
  const rows: RawRow[] = [{ "Full Name": "No Contact Person", Notes: "just a name, nothing else" }];

  const ai = fakeAi([
    {
      results: [
        {
          index: 0,
          status: "imported",
          record: {
            created_at: null,
            name: "No Contact Person",
            email: null,
            country_code: null,
            mobile_without_country_code: null,
            company: null,
            city: null,
            state: null,
            country: null,
            lead_owner: null,
            crm_status: "",
            crm_note: "just a name, nothing else",
            data_source: "",
            possession_time: null,
            description: null,
          },
        },
      ],
    },
  ]);

  const result = await extractCrmRecords(rows, ai);

  assert.equal(result.totalImported, 0);
  assert.equal(result.totalSkipped, 1);
  assert.match(result.skipped[0].reason, /email or mobile/i);
});

test("extractCrmRecords marks a batch as skipped (with reason) after AI failures exhaust retries", async () => {
  const rows: RawRow[] = [{ name: "A" }, { name: "B" }];
  const alwaysFails = async () => {
    throw new Error("simulated network failure");
  };

  const result = await extractCrmRecords(rows, alwaysFails);

  assert.equal(result.totalImported, 0);
  assert.equal(result.totalSkipped, 2);
  assert.equal(result.skipped[0].reason, "simulated network failure");
});

test("extractCrmRecords stops after one attempt for a non-retryable error instead of burning all retries", async () => {
    const rows: RawRow[] = [{ name: "A" }, { name: "B" }];
    let calls = 0;
    const failsPermanently = async () => {
          calls += 1;
          throw new AiClientError("GEMINI_API_KEY is not set.", { retryable: false });
    };
  
    const result = await extractCrmRecords(rows, failsPermanently);
  
    assert.equal(calls, 1, "should not retry a non-retryable error");
    assert.equal(result.totalSkipped, 2);
    assert.equal(result.skipped[0].reason, "GEMINI_API_KEY is not set.");
});

test("extractCrmRecords retries a retryable error (e.g. provider overload) the full configured number of times", async () => {
    const rows: RawRow[] = [{ name: "A", email: "a@example.com" }];
    let calls = 0;
    const alwaysOverloaded = async () => {
          calls += 1;
          throw new AiClientError("Gemini request failed (503): model overloaded", {
                  status: 503,
                  retryable: true,
          });
    };
  
    const result = await extractCrmRecords(rows, alwaysOverloaded);
  
    // AI_MAX_RETRIES defaults to 3 - a retryable error should use every attempt.
    assert.equal(calls, 3);
    assert.equal(result.totalSkipped, 1);
    assert.match(result.skipped[0].reason, /model overloaded/);
});

test("extractCrmRecords rejects an invalid created_at rather than passing it through", async () => {
  const rows: RawRow[] = [{ name: "A", email: "a@example.com" }];
  const ai = fakeAi([
    {
      results: [
        {
          index: 0,
          status: "imported",
          record: {
            created_at: "not a real date",
            name: "A",
            email: "a@example.com",
            country_code: null,
            mobile_without_country_code: null,
            company: null,
            city: null,
            state: null,
            country: null,
            lead_owner: null,
            crm_status: "",
            crm_note: null,
            data_source: "",
            possession_time: null,
            description: null,
          },
        },
      ],
    },
  ]);

  const result = await extractCrmRecords(rows, ai);
  assert.equal(result.imported[0].created_at, null);
});

test("extractCrmRecords includes a summary with success rate and breakdowns", async () => {
  const rows: RawRow[] = [
    { name: "A", email: "a@example.com" },
    { name: "B", email: "b@example.com" },
    { name: "C" }, // no contact info -> skipped
  ];

  const ai = fakeAi([
    {
      results: [
        {
          index: 0,
          status: "imported",
          record: {
            created_at: null,
            name: "A",
            email: "a@example.com",
            country_code: null,
            mobile_without_country_code: null,
            company: null,
            city: null,
            state: null,
            country: null,
            lead_owner: null,
            crm_status: "GOOD_LEAD_FOLLOW_UP",
            crm_note: null,
            data_source: "eden_park",
            possession_time: null,
            description: null,
          },
        },
        {
          index: 1,
          status: "imported",
          record: {
            created_at: null,
            name: "B",
            email: "b@example.com",
            country_code: null,
            mobile_without_country_code: null,
            company: null,
            city: null,
            state: null,
            country: null,
            lead_owner: null,
            crm_status: "GOOD_LEAD_FOLLOW_UP",
            crm_note: null,
            data_source: "",
            possession_time: null,
            description: null,
          },
        },
        {
          index: 2,
          status: "skipped",
          reason: "No email or mobile number found",
        },
      ],
    },
  ]);

  const result = await extractCrmRecords(rows, ai);

  assert.equal(result.summary.successRate, 66.7);
  assert.match(result.summary.headline, /2 of 3 rows imported/);
  assert.deepEqual(result.summary.skipReasons, [
    { label: "No email or mobile number found", count: 1 },
  ]);
  assert.deepEqual(result.summary.statusBreakdown, [
    { label: "GOOD_LEAD_FOLLOW_UP", count: 2 },
  ]);
  assert.deepEqual(result.summary.dataSourceBreakdown, [
    { label: "eden_park", count: 1 },
    { label: "Unspecified", count: 1 },
  ]);
});
