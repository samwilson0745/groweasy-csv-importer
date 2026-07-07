import { RawRow } from "@/lib/types";

interface PreviewTableProps {
  headers: string[];
  rows: RawRow[];
  maxHeightClassName?: string;
}

/**
 * Renders raw, unprocessed CSV rows exactly as uploaded (Step 2 of the
 * spec) - no AI mapping has happened yet at this point.
 */
export function PreviewTable({ headers, rows, maxHeightClassName = "max-h-[420px]" }: PreviewTableProps) {
  return (
    <div
      className={`relative overflow-auto rounded-xl border border-slate-200 dark:border-slate-800 ${maxHeightClassName}`}
    >
      <table className="w-full min-w-max border-collapse text-left text-sm">
        <thead className="sticky top-0 z-10 bg-slate-100 dark:bg-slate-800">
          <tr>
            <th className="sticky left-0 z-20 whitespace-nowrap border-b border-slate-200 bg-slate-100 px-3 py-2.5 font-semibold text-slate-500 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-400">
              #
            </th>
            {headers.map((header) => (
              <th
                key={header}
                className="whitespace-nowrap border-b border-slate-200 px-4 py-2.5 font-semibold text-slate-700 dark:border-slate-700 dark:text-slate-200"
              >
                {header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr
              key={i}
              className="odd:bg-white even:bg-slate-50 hover:bg-brand-50/60 dark:odd:bg-slate-900 dark:even:bg-slate-900/60 dark:hover:bg-brand-900/10"
            >
              <td className="sticky left-0 z-[5] whitespace-nowrap border-b border-slate-100 bg-inherit px-3 py-2 font-mono text-xs text-slate-400 dark:border-slate-800">
                {i + 1}
              </td>
              {headers.map((header) => (
                <td
                  key={header}
                  className="whitespace-nowrap border-b border-slate-100 px-4 py-2 text-slate-600 dark:border-slate-800 dark:text-slate-300"
                >
                  {row[header] ?? ""}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
