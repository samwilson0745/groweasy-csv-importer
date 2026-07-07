/** Shared color coding for crm_status, used in both the results table badges and the summary chips. */
export const STATUS_STYLES: Record<string, string> = {
  GOOD_LEAD_FOLLOW_UP: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300",
  DID_NOT_CONNECT: "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300",
  BAD_LEAD: "bg-rose-100 text-rose-700 dark:bg-rose-900/40 dark:text-rose-300",
  SALE_DONE: "bg-brand-100 text-brand-700 dark:bg-brand-900/40 dark:text-brand-300",
};

export const STATUS_FALLBACK_STYLE =
  "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300";

export function statusStyle(status: string): string {
  return STATUS_STYLES[status] ?? STATUS_FALLBACK_STYLE;
}
