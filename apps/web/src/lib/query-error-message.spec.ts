import { describe, it, expect } from 'vitest';
import { ApiError } from './api';
import { queryErrorMessage } from './query-error-message';

/**
 * Data pages used to discard the API's message and show "Something went wrong
 * while loading this data." even when the API had said exactly what to fix.
 * The message is now surfaced — but internal codes must stay generic, or raw
 * database text would end up on screen.
 */
describe('queryErrorMessage', () => {
  it('shows the API message when it is actionable', () => {
    const error = new ApiError(404, 'Cash account — set one in Settings › Accounting', 'NOT_FOUND');
    expect(queryErrorMessage(error)).toBe('Cash account — set one in Settings › Accounting');
  });

  it('shows a translated foreign key message', () => {
    const error = new ApiError(
      409,
      'This record refers to "main account", which no longer exists. Refresh and try again.',
      'REFERENCE_ERROR',
    );
    expect(queryErrorMessage(error)).toContain('main account');
  });

  it('keeps DATABASE_ERROR generic so raw database text is not leaked', () => {
    const raw =
      'Invalid `prisma.voucher.create()` invocation: Foreign key constraint violated: VoucherEntry_mainAccountId_fkey (index)';
    const error = new ApiError(500, raw, 'DATABASE_ERROR');
    expect(queryErrorMessage(error)).toBe('Something went wrong while loading this data.');
    expect(queryErrorMessage(error)).not.toContain('fkey');
  });

  it('keeps INTERNAL_ERROR generic', () => {
    const error = new ApiError(500, 'An unexpected error occurred', 'INTERNAL_ERROR');
    expect(queryErrorMessage(error)).toBe('Something went wrong while loading this data.');
  });

  it('falls back when there is no error at all', () => {
    expect(queryErrorMessage(undefined)).toBe('Something went wrong while loading this data.');
    expect(queryErrorMessage(null)).toBe('Something went wrong while loading this data.');
  });

  it('falls back for a non-API error such as a network failure', () => {
    expect(queryErrorMessage(new Error('Failed to fetch'))).toBe(
      'Something went wrong while loading this data.',
    );
  });

  it('falls back when an API error carries no message', () => {
    expect(queryErrorMessage(new ApiError(500, '', 'DATABASE_ERROR'))).toBe(
      'Something went wrong while loading this data.',
    );
  });

  it('honours an explicit message override', () => {
    expect(queryErrorMessage(new ApiError(500, 'x', 'DATABASE_ERROR'), 'Custom')).toBe('Custom');
  });
});
