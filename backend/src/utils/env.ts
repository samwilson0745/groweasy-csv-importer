/** Clamps a numeric env var to a safe range, falling back to `fallback` if unset/invalid/non-finite. */
export function numFromEnv(name: string, fallback: number, min: number, max = Infinity): number {
  const raw = process.env[name];
  if (raw === undefined || raw.trim() === "") return fallback;
  const parsed = Number(raw);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(max, Math.max(min, Math.trunc(parsed)));
}
