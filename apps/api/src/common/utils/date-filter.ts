/**
 * Shared date-filter helpers for list/report queries.
 *
 * The UI sends dates as `YYYY-MM-DD` from `<input type="date">`. `new Date(to)`
 * on such a value is midnight UTC, so a `lte: new Date(to)` bound silently
 * drops every entry later that same day. `endOfDay` widens the upper bound to
 * the last millisecond of the day, making the "to" filter inclusive as users
 * expect. Both bounds are UTC so a date-only filter is stable regardless of
 * the server's timezone.
 */

/** Start of the given UTC day. */
export function startOfDay(dateStr: string): Date {
  return new Date(`${dateStr}T00:00:00.000Z`);
}

/** End of the given UTC day — the inclusive upper bound for a "to" filter. */
export function endOfDay(dateStr: string): Date {
  return new Date(`${dateStr}T23:59:59.999Z`);
}

/**
 * Prisma date filter for an optional `from` / `to` pair. Either bound may be
 * omitted; an empty object means "no date filter".
 */
export function dateRange(from?: string, to?: string): { gte?: Date; lte?: Date } {
  return {
    ...(from ? { gte: startOfDay(from) } : {}),
    ...(to ? { lte: endOfDay(to) } : {}),
  };
}
