import { describe, it, expect } from 'vitest';
import { parseDeleteGuard, deleteErrorMessage } from './delete-guard';
import { ApiError } from './api';

describe('parseDeleteGuard', () => {
  it('recognises a references-exist guard', () => {
    const e = new ApiError(409, 'Customer "Ali" is referenced', 'REFERENCES_EXIST', ['2 sale invoices']);
    expect(parseDeleteGuard(e)).toEqual({
      forceable: true,
      code: 'REFERENCES_EXIST',
      labels: ['2 sale invoices'],
    });
  });

  it('treats a blocked delete as not forceable', () => {
    const e = new ApiError(409, 'Blocked', 'DELETE_BLOCKED', ['salary component']);
    expect(parseDeleteGuard(e)?.forceable).toBe(false);
  });

  it('ignores unrelated failures so they fall through to the plain error path', () => {
    // A 403 must not be mistaken for "still referenced" — the user needs the
    // real reason, not a force-delete dialog.
    expect(parseDeleteGuard(new ApiError(403, 'Forbidden', 'FORBIDDEN'))).toBeNull();
    expect(parseDeleteGuard(new ApiError(500, 'Boom'))).toBeNull();
    expect(parseDeleteGuard(new Error('network'))).toBeNull();
  });
});

describe('deleteErrorMessage', () => {
  it('passes a real API message through', () => {
    expect(deleteErrorMessage(new ApiError(403, 'You do not have permission'), 'User')).toBe(
      'You do not have permission',
    );
  });

  it('never returns empty, so a failed delete is never silent', () => {
    // These are the cases that used to leave the user clicking Confirm with no
    // response at all.
    expect(deleteErrorMessage(new ApiError(500, 'Request failed'), 'User')).toBe('Could not delete user.');
    expect(deleteErrorMessage(new ApiError(500, 'Request failed (500)'), 'Customer')).toBe(
      'Could not delete customer.',
    );
    expect(deleteErrorMessage(new Error('   '), 'Role')).toBe('Could not delete role.');
    expect(deleteErrorMessage(undefined, 'Item')).toBe('Could not delete item.');
  });
});