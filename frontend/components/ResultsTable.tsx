"use client";

import { useState } from "react";
import { CRM_FIELDS, ImportResult } from "@/lib/types";
import { statusStyle } from "@/lib/statusStyles";
import { ResultsSummary } from "./ResultsSummary";

function StatCard({ label, value, tone }: { label: string; value: number; tone: "good" | "bad" | "neutral" }) {
  const toneClass =
    tone === "good"
      ? "text-emerald-600 dark:text-emerald-400"
      : tone === "bad"
      ? "text-rose-600 dark:text-rose-400"
      : "text-slate-700 dark:text-slate-200";
  return (
    <div className="flex-1 rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
      <p className="text-xs font-medium uppercase tracking-wide text-slate-400 dark:text-slate-500">{label}</p>
      <p className={`mt-1 text-2xl font-bold ${toneClass}`}>{value}</p>
    </div>
  );
}

export function ResultsTable({ result }: { result: ImportResult }) {
  const [tab, setTab] = useState<"imported" | "skipped">("imported");

  return (
    <div className="space-y-4">
      <ResultsSummary summary={result.summary} />

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatCard label="Total Rows" value={result.totalRows} tone="neutral" />
        <StatCard label="Imported" value={result.totalImported} tone="good" />
        <StatCard label="Skipped" value={result.totalSkipped} tone="bad" />
        <StatCard label="AI Batches" value={result.batches} tone="neutral" />
      </div>

      <div className="flex gap-1 rounded-lg bg-slate-100 p-1 text-sm font-medium dark:bg-slate-800">
        <button
          onClick={() => setTab("imported")}
          className={`flex-1 rounded-md px-3 py-1.5 transition ${
            tab === "imported"
              ? "bg-white text-slate-900 shadow-sm dark:bg-slate-900 dark:text-white"
              : "text-slate-500 dark:text-slate-400"
          }`}
        >
          Imported ({result.totalImported})
        </button>
        <button
          onClick={() => setTab("skipped")}
          className={`flex-1 rounded-md px-3 py-1.5 transition ${
            tab === "skipped"
              ? "bg-white text-slate-900 shadow-sm dark:bg-slate-900 dark:text-white"
              : "text-slate-500 dark:text-slate-400"
          }`}
        >
          Skipped ({result.totalSkipped})
        </button>
      </div>

      {tab === "imported" ? (
        result.imported.length === 0 ? (
          <EmptyState message="No records were successfully imported." />
        ) : (
          <div className="relative max-h-[480px] overflow-auto rounded-xl border border-slate-200 dark:border-slate-800">
            <table className="w-full min-w-max border-collapse text-left text-sm">
              <thead className="sticky top-0 z-10 bg-slate-100 dark:bg-slate-800">
                <tr>
                  {CRM_FIELDS.map((field) => (
                    <th
                      key={field}
                      className="whitespace-nowrap border-b border-slate-200 px-4 py-2.5 font-mono text-xs font-semibold text-slate-600 dark:border-slate-700 dark:text-slate-300"
                    >
                      {field}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {result.imported.map((record, i) => (
                  <tr
                    key={i}
                    className="odd:bg-white even:bg-slate-50 dark:odd:bg-slate-900 dark:even:bg-slate-900/60"
                  >
                    {CRM_FIELDS.map((field) => {
                      const value = record[field];
                      if (field === "crm_status" && value) {
                        return (
                          <td key={field} className="whitespace-nowrap border-b border-slate-100 px-4 py-2 dark:border-slate-800">
                            <span
                              className={`rounded-full px-2 py-0.5 text-xs font-semibold ${statusStyle(value)}`}
                            >
                              {value}
                            </span>
                          </td>
                        );
                      }
                      return (
                        <td
                          key={field}
                          className="whitespace-nowrap border-b border-slate-100 px-4 py-2 text-slate-600 dark:border-slate-800 dark:text-slate-300"
                        >
                          {value || <span className="text-slate-300 dark:text-slate-600">—</span>}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )
      ) : result.skipped.length === 0 ? (
        <EmptyState message="Nothing was skipped - every row had an email or phone number." />
      ) : (
        <div className="relative max-h-[480px] overflow-auto rounded-xl border border-slate-200 dark:border-slate-800">
          <table className="w-full min-w-max border-collapse text-left text-sm">
            <thead className="sticky top-0 z-10 bg-slate-100 dark:bg-slate-800">
              <tr>
                <th className="whitespace-nowrap border-b border-slate-200 px-4 py-2.5 font-semibold text-slate-600 dark:border-slate-700 dark:text-slate-300">
                  Row #
                </th>
                <th className="whitespace-nowrap border-b border-slate-200 px-4 py-2.5 font-semibold text-slate-600 dark:border-slate-700 dark:text-slate-300">
                  Reason
                </th>
                <th className="whitespace-nowrap border-b border-slate-200 px-4 py-2.5 font-semibold text-slate-600 dark:border-slate-700 dark:text-slate-300">
                  Raw Row Data
                </th>
              </tr>
            </thead>
            <tbody>
              {result.skipped.map((s) => (
                <tr key={s.rowIndex} className="odd:bg-white even:bg-slate-50 dark:odd:bg-slate-900 dark:even:bg-slate-900/60">
                  <td className="whitespace-nowrap border-b border-slate-100 px-4 py-2 font-mono text-xs text-slate-400 dark:border-slate-800">
                    {s.rowIndex + 1}
                  </td>
                  <td className="whitespace-nowrap border-b border-slate-100 px-4 py-2 text-rose-600 dark:border-slate-800 dark:text-rose-400">
                    {s.reason}
                  </td>
                  <td className="max-w-[420px] truncate border-b border-slate-100 px-4 py-2 font-mono text-xs text-slate-500 dark:border-slate-800 dark:text-slate-400">
                    {JSON.stringify(s.row)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function EmptyState({ message }: { message: string }) {
  return (
    <div className="rounded-xl border border-dashed border-slate-300 p-8 text-center text-sm text-slate-500 dark:border-slate-700 dark:text-slate-400">
      {message}
    </div>
  );
}
