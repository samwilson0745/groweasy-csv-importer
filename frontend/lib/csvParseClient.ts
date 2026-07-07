import Papa from "papaparse";
import { RawRow } from "./types";

export class ClientCsvError extends Error {}

export interface ParsedCsv {
  headers: string[];
  rows: RawRow[];
}

const MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024; // 10MB, matches backend limit

/**
 * Client-side CSV parsing used purely for the Step 2 preview. This never
 * talks to the AI - it just lets the user see their data before confirming.
 * The backend re-parses the file independently when Confirm is pressed.
 */
export function parseCsvFile(file: File): Promise<ParsedCsv> {
  return new Promise((resolve, reject) => {
    if (!file.name.toLowerCase().endsWith(".csv") && file.type !== "text/csv") {
      reject(new ClientCsvError("Please upload a .csv file."));
      return;
    }
    if (file.size === 0) {
      reject(new ClientCsvError("This file is empty."));
      return;
    }
    if (file.size > MAX_FILE_SIZE_BYTES) {
      reject(new ClientCsvError("File is too large (max 10MB)."));
      return;
    }

    Papa.parse<RawRow>(file, {
      header: true,
      skipEmptyLines: true,
      transformHeader: (h) => h.trim(),
      complete: (results) => {
        if (results.errors.length > 0) {
          const critical = results.errors.filter((e) => e.type !== "FieldMismatch");
          if (critical.length > 0) {
            reject(new ClientCsvError(critical[0].message));
            return;
          }
        }
        const headers = results.meta.fields?.map((f) => f.trim()) ?? [];
        if (headers.length === 0 || results.data.length === 0) {
          reject(new ClientCsvError("No data rows found in this CSV."));
          return;
        }
        resolve({ headers, rows: results.data });
      },
      error: (err: Error) => reject(new ClientCsvError(err.message)),
    });
  });
}
