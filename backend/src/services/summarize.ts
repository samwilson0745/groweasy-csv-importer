import { CountBreakdown, CrmRecord, ImportSummary, SkippedRecord } from "../types/crm";

/** Groups items by a key, returning counts sorted highest-first (ties broken alphabetically). */
function countBy<T>(items: T[], keyFn: (item: T) => string): CountBreakdown[] {
  const counts = new Map<string, number>();
  for (const item of items) {
    const key = keyFn(item);
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return Array.from(counts.entries())
    .map(([label, count]) => ({ label, count }))
    .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label));
}

/**
 * Builds a human-readable recap of an import run: success rate, why rows
 * were skipped, and what the imported leads look like (status/source mix).
 * This is computed once on the backend so every client (web, future mobile
 * app, a direct API caller) sees the exact same summary.
 */
export function buildImportSummary(
  imported: CrmRecord[],
  skipped: SkippedRecord[],
  totalRows: number
): ImportSummary {
  const successRate = totalRows === 0 ? 0 : Math.round((imported.length / totalRows) * 1000) / 10;

  const skipReasons = countBy(skipped, (s) => s.reason);
  const statusBreakdown = countBy(imported, (r) => r.crm_status?.trim() || "Unspecified");
  const dataSourceBreakdown = countBy(imported, (r) => r.data_source?.trim() || "Unspecified");

  const headlineParts = [
    `${imported.length} of ${totalRows} row${totalRows === 1 ? "" : "s"} imported (${successRate}%).`,
  ];
  if (skipped.length > 0) {
    const topReason = skipReasons[0];
    const reasonNote =
      skipReasons.length === 1
        ? topReason.label
        : `mostly "${topReason.label}"`;
    headlineParts.push(`${skipped.length} skipped - ${reasonNote}.`);
  } else {
    headlineParts.push("No rows were skipped.");
  }

  return {
    successRate,
    headline: headlineParts.join(" "),
    skipReasons,
    statusBreakdown,
    dataSourceBreakdown,
  };
}
