import { CountBreakdown, ImportSummary } from "@/lib/types";
import { statusStyle } from "@/lib/statusStyles";

const NEUTRAL_CHIP_STYLE = "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300";

function Chip({ label, count, colorClass }: CountBreakdown & { colorClass?: string }) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium ${
        colorClass ?? NEUTRAL_CHIP_STYLE
      }`}
    >
      {label}
      <span className="rounded-full bg-white/70 px-1.5 text-current dark:bg-black/20">{count}</span>
    </span>
  );
}

function ChipRow({
  title,
  items,
  colorize,
}: {
  title: string;
  items: CountBreakdown[];
  /** When true, colors each chip the same way crm_status badges are colored elsewhere in the app. */
  colorize?: boolean;
}) {
  if (items.length === 0) return null;
  return (
    <div>
      <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-slate-400 dark:text-slate-500">
        {title}
      </p>
      <div className="flex flex-wrap gap-1.5">
        {items.map((item) => (
          <Chip key={item.label} {...item} colorClass={colorize ? statusStyle(item.label) : undefined} />
        ))}
      </div>
    </div>
  );
}

/** Plain-English recap of an import run, shown above the detailed tables on the Results step. */
export function ResultsSummary({ summary }: { summary: ImportSummary }) {
  return (
    <div className="space-y-4 rounded-xl border border-slate-200 bg-slate-50 p-4 dark:border-slate-800 dark:bg-slate-900/60">
      <p className="text-sm text-slate-700 dark:text-slate-200">{summary.headline}</p>
      <div className="grid gap-4 sm:grid-cols-3">
        <ChipRow title="Lead status" items={summary.statusBreakdown} colorize />
        <ChipRow title="Data source" items={summary.dataSourceBreakdown} />
        <ChipRow title="Skip reasons" items={summary.skipReasons} />
      </div>
    </div>
  );
}
