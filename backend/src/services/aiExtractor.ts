import { z } from "zod";
import {
  CRM_FIELDS,
  CRM_STATUS_VALUES,
  DATA_SOURCE_VALUES,
  CrmRecord,
  ImportResult,
  RawRow,
  SkippedRecord,
} from "../types/crm";
import { callAi } from "./aiClient";
import { buildBatchUserPrompt, SYSTEM_PROMPT, BatchInputRow } from "./promptBuilder";
import { buildImportSummary } from "./summarize";
import { numFromEnv } from "../utils/env";

// A misconfigured (zero/negative/NaN) batch size would otherwise hang the
// chunking loop forever or silently drop every row, so every value here is
// clamped to a sane range rather than trusted as-is.
const BATCH_SIZE = numFromEnv("AI_BATCH_SIZE", 25, 1, 500);
const MAX_RETRIES = numFromEnv("AI_MAX_RETRIES", 3, 1, 10);
// Caps how many batches are in flight to the AI provider at once. Without
// this, a large CSV (e.g. 3,000 rows / 120 batches) fires every batch
// simultaneously and immediately blows through free-tier rate limits,
// causing most batches to fail and get marked skipped for no data reason.
const MAX_CONCURRENT_BATCHES = numFromEnv("AI_MAX_CONCURRENT_BATCHES", 5, 1, 50);

const crmRecordSchema = z
  .object({
    created_at: z.string().nullable().optional(),
    name: z.string().nullable().optional(),
    email: z.string().nullable().optional(),
    country_code: z.string().nullable().optional(),
    mobile_without_country_code: z.string().nullable().optional(),
    company: z.string().nullable().optional(),
    city: z.string().nullable().optional(),
    state: z.string().nullable().optional(),
    country: z.string().nullable().optional(),
    lead_owner: z.string().nullable().optional(),
    crm_status: z.string().nullable().optional(),
    crm_note: z.string().nullable().optional(),
    data_source: z.string().nullable().optional(),
    possession_time: z.string().nullable().optional(),
    description: z.string().nullable().optional(),
  })
  .passthrough();

const resultItemSchema = z.union([
  z.object({
    index: z.number(),
    status: z.literal("imported"),
    record: crmRecordSchema,
  }),
  z.object({
    index: z.number(),
    status: z.literal("skipped"),
    reason: z.string().optional().default("Missing email and mobile number"),
  }),
]);

const aiResponseSchema = z.object({
  results: z.array(resultItemSchema),
});

/** Strips markdown code fences some models wrap JSON in, despite instructions. */
function extractJson(raw: string): string {
  const trimmed = raw.trim();
  const fenceMatch = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fenceMatch) return fenceMatch[1].trim();

  // Fallback: grab the outermost { ... } block.
  const start = trimmed.indexOf("{");
  const end = trimmed.lastIndexOf("}");
  if (start !== -1 && end !== -1 && end > start) {
    return trimmed.slice(start, end + 1);
  }
  return trimmed;
}

/** Normalizes a record produced by the AI against the hard schema rules. */
export function sanitizeRecord(record: z.infer<typeof crmRecordSchema>): CrmRecord {
  const clean: Record<string, string | null> = {};
  for (const field of CRM_FIELDS) {
    const value = (record as Record<string, unknown>)[field];
    clean[field] = typeof value === "string" && value.trim() !== "" ? value.trim() : null;
  }

  // Enforce enum allow-lists regardless of what the model returned.
  if (clean.crm_status && !CRM_STATUS_VALUES.includes(clean.crm_status as never)) {
    clean.crm_status = "";
  }
  if (clean.data_source && !DATA_SOURCE_VALUES.includes(clean.data_source as never)) {
    clean.data_source = "";
  }
  if (clean.crm_status === null) clean.crm_status = "";
  if (clean.data_source === null) clean.data_source = "";

  // Guard against unparsable dates rather than letting bad data through.
  if (clean.created_at) {
    const parsed = new Date(clean.created_at);
    if (Number.isNaN(parsed.getTime())) {
      clean.created_at = null;
    }
  }

  return clean as unknown as CrmRecord;
}

export function hasContactInfo(record: CrmRecord): boolean {
  return Boolean(record.email?.trim()) || Boolean(record.mobile_without_country_code?.trim());
}

export type AiCallFn = (params: { system: string; user: string }) => Promise<string>;

async function callWithRetry(
  batch: BatchInputRow[],
  batchNumber: number,
  aiCallFn: AiCallFn
): Promise<{
  imported: { index: number; record: CrmRecord }[];
  skipped: { index: number; reason: string }[];
}> {
  let lastError: unknown;

  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      const raw = await aiCallFn({
        system: SYSTEM_PROMPT,
        user: buildBatchUserPrompt(batch),
      });
      const jsonText = extractJson(raw);
      const parsed = aiResponseSchema.parse(JSON.parse(jsonText));

      const imported: { index: number; record: CrmRecord }[] = [];
      const skipped: { index: number; reason: string }[] = [];

      const seenIndexes = new Set<number>();
      for (const item of parsed.results) {
        seenIndexes.add(item.index);
        if (item.status === "imported") {
          const sanitized = sanitizeRecord(item.record);
          if (hasContactInfo(sanitized)) {
            imported.push({ index: item.index, record: sanitized });
          } else {
            // Hard rule enforced in code even if the model tried to import it.
            skipped.push({ index: item.index, reason: "No email or mobile number found" });
          }
        } else {
          skipped.push({ index: item.index, reason: item.reason });
        }
      }

      // Safety net: any row the model forgot to return is treated as skipped
      // rather than silently dropped.
      for (const row of batch) {
        if (!seenIndexes.has(row.index)) {
          skipped.push({ index: row.index, reason: "AI did not return a result for this row" });
        }
      }

      return { imported, skipped };
    } catch (err) {
      lastError = err;
      const isLastAttempt = attempt === MAX_RETRIES;
      console.error(
        `[aiExtractor] batch ${batchNumber} attempt ${attempt}/${MAX_RETRIES} failed:`,
        err instanceof Error ? err.message : err
      );
      if (!isLastAttempt) {
        // Exponential backoff before retrying a failed batch.
        await new Promise((resolve) => setTimeout(resolve, 400 * attempt));
      }
    }
  }

  const reason =
    lastError instanceof Error
      ? lastError.message
      : `AI extraction failed after ${MAX_RETRIES} attempts`;
  return {
    imported: [],
    skipped: batch.map((row) => ({ index: row.index, reason })),
  };
}

function chunk<T>(items: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    chunks.push(items.slice(i, i + size));
  }
  return chunks;
}

/**
 * Runs `task` over every item in `items`, but never more than `limit` tasks
 * concurrently. Results are returned in the same order as `items`, just like
 * Promise.all - callers don't need to know this is throttled under the hood.
 */
export async function mapWithConcurrencyLimit<T, R>(
  items: T[],
  limit: number,
  task: (item: T, index: number) => Promise<R>
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let nextIndex = 0;

  async function worker() {
    while (nextIndex < items.length) {
      const current = nextIndex;
      nextIndex += 1;
      results[current] = await task(items[current], current);
    }
  }

  const workerCount = Math.min(limit, items.length) || 0;
  await Promise.all(Array.from({ length: workerCount }, () => worker()));
  return results;
}

/**
 * Processes all CSV rows through the AI in fixed-size batches, running
 * batches concurrently, and reassembling results (preserving which original
 * row produced which record or skip reason).
 */
export async function extractCrmRecords(
  rows: RawRow[],
  aiCallFn: AiCallFn = callAi
): Promise<ImportResult> {
  const indexedRows: BatchInputRow[] = rows.map((data, index) => ({ index, data }));
  const batches = chunk(indexedRows, BATCH_SIZE);

  const batchResults = await mapWithConcurrencyLimit(
    batches,
    MAX_CONCURRENT_BATCHES,
    (batch, i) => callWithRetry(batch, i + 1, aiCallFn)
  );

  const importedByIndex = new Map<number, CrmRecord>();
  const skippedByIndex = new Map<number, SkippedRecord>();

  batchResults.forEach((result) => {
    result.imported.forEach(({ index, record }) => importedByIndex.set(index, record));
    result.skipped.forEach(({ index, reason }) =>
      skippedByIndex.set(index, { row: rows[index], rowIndex: index, reason })
    );
  });

  // Preserve original row order in the output.
  const imported: CrmRecord[] = [];
  const skipped: SkippedRecord[] = [];
  for (let i = 0; i < rows.length; i++) {
    if (importedByIndex.has(i)) {
      imported.push(importedByIndex.get(i)!);
    } else if (skippedByIndex.has(i)) {
      skipped.push(skippedByIndex.get(i)!);
    } else {
      // Should not happen, but guarantees totals always add up.
      skipped.push({ row: rows[i], rowIndex: i, reason: "Unknown processing error" });
    }
  }

  return {
    imported,
    skipped,
    totalRows: rows.length,
    totalImported: imported.length,
    totalSkipped: skipped.length,
    batches: batches.length,
    summary: buildImportSummary(imported, skipped, rows.length),
  };
}
