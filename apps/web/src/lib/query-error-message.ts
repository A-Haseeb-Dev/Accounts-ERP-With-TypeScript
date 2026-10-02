import { ApiError } from './api';

/**
 * Codes that carry machine/diagnostic detail rather than something a user can
 * act on. Showing them verbatim would put raw database text on screen, which is
 * why they fall back to a generic message.
 */
const INTERNAL_CODES = new Set(['DATABASE_ERROR', 'INTERNAL_ERROR']);

/**
 * Picks a message worth showing on a data page.
 *
 * The API already translates known failures ("Cash account — set one in
 * Settings", "This record refers to a main account that no longer exists"),
 * but pages were discarding it in favour of a blanket "something went wrong",
 * which left users with no way to know what to do next. Conversely, internal
 * codes are still opaque, so those stay generic rather than leaking raw
 * database text into the UI.
 */
export function queryErrorMessage(
  error: unknown,
  fallback = 'Something went wrong while loading this data.',
): string {
  if (error instanceof ApiError && error.message && !INTERNAL_CODES.has(error.code ?? '')) {
    return error.message;
  }
  return fallback;
}
