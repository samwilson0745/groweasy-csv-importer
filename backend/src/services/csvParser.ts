import { parse } from "csv-parse/sync";
import { RawRow } from "../types/crm";

export class CsvParseError extends Error {}

const CANDIDATE_DELIMITERS = [",", ";", "\t", "|"] as const;

/**
 * csv-parse defaults to comma-only, which silently mis-parses semicolon- or
 * tab-delimited exports (common from some regional/Excel locales) into one
 * giant column instead of rejecting or handling them. This picks whichever
 * candidate delimiter appears most consistently across the first few lines.
 */
function detectDelimiter(csvText: string): string {
  const sampleLines = csvText.split(/\r\n|\r|\n/).filter((l) => l.trim() !== "").slice(0, 5);
  if (sampleLines.length === 0) return ",";

  let bestDelimiter: string = ",";
  let bestScore = -1;
  for (const delimiter of CANDIDATE_DELIMITERS) {
    const counts = sampleLines.map((line) => line.split(delimiter).length - 1);
    const min = Math.min(...counts);
    // Require the delimiter to actually appear, and consistently, on every
    // sampled line - otherwise a stray character in free text could win.
    if (min > 0 && min > bestScore) {
      bestScore = min;
      bestDelimiter = delimiter;
    }
  }
  return bestDelimiter;
}

/** Renames duplicate header names (e.g. two "Phone" columns) so later ones don't silently overwrite earlier ones. */
function dedupeHeaders(headers: string[]): string[] {
  const seen = new Map<string, number>();
  return headers.map((header) => {
    const count = seen.get(header) ?? 0;
    seen.set(header, count + 1);
    return count === 0 ? header : `${header}_${count + 1}`;
  });
}

/**
 * Parses raw CSV text into an array of row objects keyed by header name.
 * Column names are NOT assumed - whatever headers exist in the file become
 * the object keys, and it is the AI extraction stage's job to map them.
 */
export function parseCsv(csvText: string): { headers: string[]; rows: RawRow[] } {
  if (!csvText || !csvText.trim()) {
    throw new CsvParseError("The uploaded file is empty.");
  }

  const delimiter = detectDelimiter(csvText);

  let records: Record<string, string>[];
  try {
    records = parse(csvText, {
      columns: (header: string[]) => dedupeHeaders(header.map((h) => h.trim())),
      delimiter,
      skip_empty_lines: true,
      trim: true,
      relax_column_count: true,
      bom: true,
    });
  } catch (err) {
    throw new CsvParseError(
      `Could not parse CSV file: ${err instanceof Error ? err.message : "unknown error"}`
    );
  }

  if (records.length === 0) {
    throw new CsvParseError("No data rows found in the CSV file.");
  }

  const headers = Object.keys(records[0]);

  // Drop rows that are entirely blank (all values empty strings/whitespace).
  const rows = records.filter((row) =>
    Object.values(row).some((v) => v !== undefined && v !== null && String(v).trim() !== "")
  );

  return { headers, rows };
}
