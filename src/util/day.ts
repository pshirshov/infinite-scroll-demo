/** Returns a stable day key (YYYY-MM-DD in browser local TZ) for a unix-ms timestamp. */
export function dayKey(tsMs: number): string {
  const d = new Date(tsMs);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/** Returns a human-readable label for a day key — "Today", "Yesterday", or "Mon, Apr 3, 2025" style. */
export function dayLabel(key: string, nowMs: number = Date.now()): string {
  const todayKey = dayKey(nowMs);
  if (key === todayKey) return "Today";

  const yesterdayMs = nowMs - 86_400_000;
  const yesterdayKey = dayKey(yesterdayMs);
  if (key === yesterdayKey) return "Yesterday";

  // Parse the YYYY-MM-DD into a local-midnight Date.
  const [yearStr, monthStr, dayStr] = key.split("-");
  const d = new Date(Number(yearStr), Number(monthStr) - 1, Number(dayStr));
  return new Intl.DateTimeFormat(undefined, {
    weekday: "short",
    year: "numeric",
    month: "short",
    day: "numeric",
  }).format(d);
}

/** True iff the two timestamps fall on different local-TZ days. */
export function isDifferentDay(a: number, b: number): boolean {
  return dayKey(a) !== dayKey(b);
}
