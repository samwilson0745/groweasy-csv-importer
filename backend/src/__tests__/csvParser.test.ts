import { test } from "node:test";
import assert from "node:assert/strict";
import { parseCsv, CsvParseError } from "../services/csvParser";

test("parseCsv extracts headers and rows keyed by original column names", () => {
  const csv = "Full Name,Email Address\nJohn Doe,john@example.com\nJane Roe,jane@example.com";
  const { headers, rows } = parseCsv(csv);
  assert.deepEqual(headers, ["Full Name", "Email Address"]);
  assert.equal(rows.length, 2);
  assert.equal(rows[0]["Full Name"], "John Doe");
  assert.equal(rows[1]["Email Address"], "jane@example.com");
});

test("parseCsv throws CsvParseError on empty input", () => {
  assert.throws(() => parseCsv(""), CsvParseError);
  assert.throws(() => parseCsv("   \n  "), CsvParseError);
});

test("parseCsv drops fully blank rows", () => {
  const csv = "name,email\nJohn,john@example.com\n,\nJane,jane@example.com";
  const { rows } = parseCsv(csv);
  assert.equal(rows.length, 2);
});

test("parseCsv tolerates ragged rows (different column counts)", () => {
  const csv = "name,email,phone\nJohn,john@example.com\nJane,jane@example.com,555-1234,extra";
  const { rows } = parseCsv(csv);
  assert.equal(rows.length, 2);
});

test("parseCsv auto-detects a semicolon delimiter", () => {
  const csv = "name;email;phone\nJohn Doe;john@example.com;9876543210\nJane Roe;jane@example.com;9876543211";
  const { headers, rows } = parseCsv(csv);
  assert.deepEqual(headers, ["name", "email", "phone"]);
  assert.equal(rows.length, 2);
  assert.equal(rows[0].email, "john@example.com");
});

test("parseCsv auto-detects a tab delimiter", () => {
  const csv = "name\temail\nJohn Doe\tjohn@example.com\nJane Roe\tjane@example.com";
  const { headers, rows } = parseCsv(csv);
  assert.deepEqual(headers, ["name", "email"]);
  assert.equal(rows.length, 2);
});

test("parseCsv dedupes duplicate column headers instead of dropping data", () => {
  const csv = "name,phone,phone\nJohn,111-111,222-222";
  const { headers, rows } = parseCsv(csv);
  assert.deepEqual(headers, ["name", "phone", "phone_2"]);
  assert.equal(rows[0].phone, "111-111");
  assert.equal(rows[0].phone_2, "222-222");
});
