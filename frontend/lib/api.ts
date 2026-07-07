import { ImportResult } from "./types";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000";
// Generous by design - a large CSV can legitimately take a while to work
// through AI batches. This exists so a hung backend/provider doesn't leave
// the user staring at "Running AI extraction..." forever with no recourse.
const REQUEST_TIMEOUT_MS = Number(process.env.NEXT_PUBLIC_API_TIMEOUT_MS) || 120_000;

export class ApiError extends Error {}

/**
 * Sends the confirmed CSV file to the backend for AI-powered CRM field
 * extraction. Only called after the user explicitly clicks "Confirm Import".
 */
export async function confirmImport(file: File): Promise<ImportResult> {
  const formData = new FormData();
  formData.append("file", file);

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  console.log(`[groweasy] POST ${API_URL}/api/import/confirm - "${file.name}" (${file.size} bytes)`);

  let response: Response;
  try {
    response = await fetch(`${API_URL}/api/import/confirm`, {
      method: "POST",
      body: formData,
      signal: controller.signal,
    });
  } catch (err) {
    console.error(`[groweasy] request to ${API_URL} failed before getting a response:`, err);
    if (err instanceof DOMException && err.name === "AbortError") {
      throw new ApiError(
        `The import took longer than ${Math.round(REQUEST_TIMEOUT_MS / 1000)}s and was cancelled. Try a smaller file or check the backend logs.`
      );
    }
    throw new ApiError(
      `Could not reach the backend at ${API_URL}. Is the server running? (Open the browser console for details - this is usually a CORS/FRONTEND_ORIGIN mismatch or the backend not running.)`
    );
  } finally {
    clearTimeout(timer);
  }

  if (!response.ok) {
    let message = `Import failed (HTTP ${response.status}).`;
    let rawBody: unknown;
    try {
      rawBody = await response.json();
      if (rawBody && typeof rawBody === "object" && "error" in rawBody) {
        message = String((rawBody as { error: unknown }).error);
      }
    } catch {
      // response wasn't JSON - keep the default message, but still log what we got.
      rawBody = await response.text().catch(() => "<unreadable body>");
    }
    console.error(`[groweasy] backend responded with HTTP ${response.status}:`, rawBody);
    throw new ApiError(message);
  }

  const result = (await response.json()) as ImportResult;
  console.log(
    `[groweasy] import succeeded: ${result.totalImported}/${result.totalRows} imported, ${result.totalSkipped} skipped`
  );
  return result;
}
