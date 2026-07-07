import { test } from "node:test";
import assert from "node:assert/strict";
import { buildImportSummary } from "../services/summarize";
import { CrmRecord, SkippedRecord } from "../types/crm";

function record(overrides: Partial<CrmRecord> = {}): CrmRecord {
  return {
    created_at: null,
    name: "Test",
    email: "test@example.com",
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
    ...overrides,
  };
}

test("buildImportSummary handles a fully successful import", () => {
  const imported = [
    record({ crm_status: "SALE_DONE", data_source: "eden_park" }),
    record({ crm_status: "SALE_DONE", data_source: "eden_park" }),
  ];
  const summary = buildImportSummary(imported, [], 2);

  assert.equal(summary.successRate, 100);
  assert.equal(summary.skipReasons.length, 0);
  assert.match(summary.headline, /No rows were skipped/);
  assert.deepEqual(summary.statusBreakdown, [{ label: "SALE_DONE", count: 2 }]);
  assert.deepEqual(summary.dataSourceBreakdown, [{ label: "eden_park", count: 2 }]);
});

test("buildImportSummary handles a fully skipped import", () => {
  const skipped: SkippedRecord[] = [
    { row: { name: "A" }, rowIndex: 0, reason: "No email or mobile number found" },
    { row: { name: "B" }, rowIndex: 1, reason: "No email or mobile number found" },
  ];
  const summary = buildImportSummary([], skipped, 2);

  assert.equal(summary.successRate, 0);
  assert.match(summary.headline, /0 of 2 rows imported \(0%\)/);
  assert.deepEqual(summary.skipReasons, [
    { label: "No email or mobile number found", count: 2 },
  ]);
});

test("buildImportSummary groups multiple distinct skip reasons, most common first", () => {
  const skipped: SkippedRecord[] = [
    { row: {}, rowIndex: 0, reason: "No email or mobile number found" },
    { row: {}, rowIndex: 1, reason: "No email or mobile number found" },
    { row: {}, rowIndex: 2, reason: "AI did not return a result for this row" },
  ];
  const summary = buildImportSummary([], skipped, 3);

  assert.deepEqual(summary.skipReasons, [
    { label: "No email or mobile number found", count: 2 },
    { label: "AI did not return a result for this row", count: 1 },
  ]);
  assert.match(summary.headline, /mostly "No email or mobile number found"/);
});

test("buildImportSummary buckets blank crm_status/data_source as Unspecified", () => {
  const imported = [record({ crm_status: "", data_source: "" }), record({ crm_status: null, data_source: null })];
  const summary = buildImportSummary(imported, [], 2);

  assert.deepEqual(summary.statusBreakdown, [{ label: "Unspecified", count: 2 }]);
  assert.deepEqual(summary.dataSourceBreakdown, [{ label: "Unspecified", count: 2 }]);
});

test("buildImportSummary handles zero rows without dividing by zero", () => {
  const summary = buildImportSummary([], [], 0);
  assert.equal(summary.successRate, 0);
  assert.match(summary.headline, /0 of 0 rows imported/);
});
