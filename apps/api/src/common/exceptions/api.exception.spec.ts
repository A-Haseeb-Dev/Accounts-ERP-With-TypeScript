import { describe, it, expect } from 'vitest';
import { ApiException, ErrorCode } from './api.exception';
import { HttpStatus } from '@nestjs/common';

function getErrorResponse(err: ApiException) {
  return err.getResponse() as { success: boolean; error: { code: ErrorCode; message: string; details: unknown[] } };
}

describe('ApiException', () => {
  it('creates a validation error with 400 status', () => {
    const err = ApiException.validation('Field required');
    expect(err.getStatus()).toBe(HttpStatus.BAD_REQUEST);
    expect(getErrorResponse(err).error.code).toBe('VALIDATION_ERROR');
    expect(getErrorResponse(err).error.message).toBe('Field required');
  });

  it('creates an unauthorized error with 401 status', () => {
    const err = ApiException.unauthorized('Not logged in');
    expect(err.getStatus()).toBe(HttpStatus.UNAUTHORIZED);
    expect(getErrorResponse(err).error.code).toBe('UNAUTHORIZED');
  });

  it('creates a forbidden error with 403 status', () => {
    const err = ApiException.forbidden();
    expect(err.getStatus()).toBe(HttpStatus.FORBIDDEN);
    expect(getErrorResponse(err).error.code).toBe('FORBIDDEN');
  });

  it('creates a not found error with 404 status', () => {
    const err = ApiException.notFound('User');
    expect(err.getStatus()).toBe(HttpStatus.NOT_FOUND);
    expect(getErrorResponse(err).error.message).toBe('User not found');
  });

  it('creates a conflict error with 409 status', () => {
    const err = ApiException.conflict('Duplicate entry');
    expect(err.getStatus()).toBe(HttpStatus.CONFLICT);
    expect(getErrorResponse(err).error.code).toBe('CONFLICT');
  });

  it('creates a duplicate code error with 409 status', () => {
    const err = ApiException.duplicateCode('Username');
    expect(err.getStatus()).toBe(HttpStatus.CONFLICT);
    expect(getErrorResponse(err).error.code).toBe('DUPLICATE_CODE');
    expect(getErrorResponse(err).error.message).toBe('Username already exists');
  });

  it('creates an insufficient stock error with 422 status', () => {
    const err = ApiException.insufficientStock('Widget', 5, 10);
    expect(err.getStatus()).toBe(HttpStatus.UNPROCESSABLE_ENTITY);
    expect(getErrorResponse(err).error.code).toBe('INSUFFICIENT_STOCK');
    expect(getErrorResponse(err).error.message).toContain('Available: 5');
  });

  it('creates an unbalanced voucher error with 422 status', () => {
    const err = ApiException.unbalancedVoucher(100, 80);
    expect(err.getStatus()).toBe(HttpStatus.UNPROCESSABLE_ENTITY);
    expect(getErrorResponse(err).error.code).toBe('UNBALANCED_VOUCHER');
    expect(getErrorResponse(err).error.message).toContain('100');
    expect(getErrorResponse(err).error.message).toContain('80');
  });

  it('creates an invalid transaction error with 422 status', () => {
    const err = ApiException.invalidTransaction('Cannot post');
    expect(err.getStatus()).toBe(HttpStatus.UNPROCESSABLE_ENTITY);
    expect(getErrorResponse(err).error.code).toBe('INVALID_TRANSACTION');
  });

  it('creates a rate limited error with 429 status', () => {
    const err = ApiException.rateLimited();
    expect(err.getStatus()).toBe(HttpStatus.TOO_MANY_REQUESTS);
    expect(getErrorResponse(err).error.code).toBe('RATE_LIMITED');
  });

  it('creates a references exist error with 409 status and reference list', () => {
    const err = ApiException.referencesExist('Customer "ABC"', ['3 sale invoices', '1 sales return']);
    expect(err.getStatus()).toBe(HttpStatus.CONFLICT);
    const resp = getErrorResponse(err);
    expect(resp.error.code).toBe('REFERENCES_EXIST');
    expect(resp.error.details).toEqual(['3 sale invoices', '1 sales return']);
  });

  it('creates a delete blocked error with 422 status and reference list', () => {
    const err = ApiException.deleteBlocked('Main account "Cash"', ['4 voucher entries']);
    expect(err.getStatus()).toBe(HttpStatus.UNPROCESSABLE_ENTITY);
    const resp = getErrorResponse(err);
    expect(resp.error.code).toBe('DELETE_BLOCKED');
    expect(resp.error.details).toEqual(['4 voucher entries']);
  });

  it('includes details array when provided', () => {
    const err = ApiException.validation('Error', ['field1 is wrong']);
    expect(getErrorResponse(err).error.details).toEqual(['field1 is wrong']);
  });

  it('defaults to empty details array', () => {
    const err = ApiException.notFound();
    expect(getErrorResponse(err).error.details).toEqual([]);
  });
});
