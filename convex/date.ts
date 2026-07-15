const SINGAPORE_OFFSET = "+08:00";

/** UTC instant bounds for a Singapore calendar date. */
export function singaporeDayBounds(date: string): { start: number; end: number } {
  const start = Date.parse(`${date}T00:00:00${SINGAPORE_OFFSET}`);
  if (!Number.isFinite(start)) throw new Error("Invalid calendar date");
  return { start, end: start + 24 * 60 * 60 * 1000 };
}
