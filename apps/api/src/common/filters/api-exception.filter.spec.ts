import { describe, it, expect, vi } from 'vitest';
import { Prisma } from '@prisma/client';
import { ApiExceptionFilter } from './api-exception.filter';
import { ApiException } from '../exceptions/api.exception';
import { HttpException, HttpStatus } from '@nestjs/common';

function createMockHost(_exception: unknown) {
  const response = { status: vi.fn().mockReturnThis(), json: vi.fn() };
  const request = { method: 'GET', url: '/api/test' };
  return {
    host: {
      switchToHttp: () => ({
        getResponse: () => response,
        getRequest: () => request,
      }),
    },
    response,
    request,
  };
}

describe('ApiExceptionFilter', () => {
  it('handles ApiException correctly', () => {
    const filter = new ApiExceptionFilter();
    const exception = ApiException.notFound('User');
    const { host, response } = createMockHost(exception);

    filter.catch(exception, host as any);

    expect(response.status).toHaveBeenCalledWith(404);
    expect(response.json).toHaveBeenCalledWith(
      expect.objectContaining({
        success: false,
        error: expect.objectContaining({ code: 'NOT_FOUND' }),
      }),
    );
  });

  it('handles standard HttpException', () => {
    const filter = new ApiExceptionFilter();
    const exception = new HttpException('Bad request', HttpStatus.BAD_REQUEST);
    const { host, response } = createMockHost(exception);

    filter.catch(exception, host as any);

    expect(response.status).toHaveBeenCalledWith(400);
    expect(response.json).toHaveBeenCalledWith(
      expect.objectContaining({
        success: false,
        error: expect.objectContaining({ code: 'BAD_REQUEST' }),
      }),
    );
  });

  it('handles 404 HttpException', () => {
    const filter = new ApiExceptionFilter();
    const exception = new HttpException('Not found', HttpStatus.NOT_FOUND);
    const { host, response } = createMockHost(exception);

    filter.catch(exception, host as any);

    expect(response.status).toHaveBeenCalledWith(404);
    expect(response.json).toHaveBeenCalledWith(
      expect.objectContaining({
        error: expect.objectContaining({ code: 'NOT_FOUND' }),
      }),
    );
  });

  it('handles unknown errors with 500', () => {
    const filter = new ApiExceptionFilter();
    const exception = new Error('Something broke');
    const { host, response } = createMockHost(exception);

    filter.catch(exception, host as any);

    expect(response.status).toHaveBeenCalledWith(500);
    expect(response.json).toHaveBeenCalledWith(
      expect.objectContaining({
        error: expect.objectContaining({ code: 'INTERNAL_ERROR' }),
      }),
    );
  });

  it('handles HttpException with object response (array messages)', () => {
    const filter = new ApiExceptionFilter();
    const exception = new HttpException(
      { message: ['field1 is required', 'field2 is invalid'] },
      HttpStatus.BAD_REQUEST,
    );
    const { host, response } = createMockHost(exception);

    filter.catch(exception, host as any);

    expect(response.status).toHaveBeenCalledWith(400);
    const body = response.json.mock.calls[0][0];
    expect(body.error.message).toContain('field1 is required');
  });

  it('handles 401 HttpException with object response', () => {
    const filter = new ApiExceptionFilter();
    const exception = new HttpException(
      { message: 'Unauthorized' },
      HttpStatus.UNAUTHORIZED,
    );
    const { host, response } = createMockHost(exception);

    filter.catch(exception, host as any);

    expect(response.status).toHaveBeenCalledWith(401);
    expect(response.json).toHaveBeenCalledWith(
      expect.objectContaining({
        error: expect.objectContaining({ code: 'UNAUTHORIZED' }),
      }),
    );
  });

  /**
   * The raw Prisma text for this class of failure used to reach the browser
   * verbatim, naming internal constraints ("..._fkey (index)") that mean
   * nothing to a user.
   */
  describe('foreign key violations', () => {
    const prismaError = (meta: Record<string, unknown>) =>
      new Prisma.PrismaClientKnownRequestError(
        'Invalid `prisma.voucher.create()` invocation: Foreign key constraint violated: VoucherEntry_mainAccountId_fkey (index)',
        { code: 'P2003', clientVersion: '6.0.0', meta },
      );

    it('translates a named constraint instead of leaking Prisma internals', () => {
      const filter = new ApiExceptionFilter();
      const exception = prismaError({ constraint: 'VoucherEntry_mainAccountId_fkey' });
      const { host, response } = createMockHost(exception);

      filter.catch(exception, host as any);

      expect(response.status).toHaveBeenCalledWith(409);
      const body = response.json.mock.calls[0][0];
      expect(body.error.code).toBe('REFERENCE_ERROR');
      expect(body.error.message).toBe(
        'This record refers to "main account", which no longer exists. Refresh and try again.',
      );
      expect(JSON.stringify(body)).not.toContain('fkey');
      expect(JSON.stringify(body)).not.toContain('Prisma');
    });

    it('uses Prisma field_name when no constraint is supplied', () => {
      const filter = new ApiExceptionFilter();
      const exception = prismaError({ field_name: 'customerId' });
      const { host, response } = createMockHost(exception);

      filter.catch(exception, host as any);

      const body = response.json.mock.calls[0][0];
      expect(body.error.message).toContain('customer');
      expect(JSON.stringify(body)).not.toContain('fkey');
    });

    it('still returns a readable message when the constraint is unrecognisable', () => {
      const filter = new ApiExceptionFilter();
      const exception = prismaError({});
      const { host, response } = createMockHost(exception);

      filter.catch(exception, host as any);

      expect(response.status).toHaveBeenCalledWith(409);
      const body = response.json.mock.calls[0][0];
      expect(body.error.code).toBe('REFERENCE_ERROR');
      expect(body.error.message).not.toMatch(/fkey|Prisma/i);
    });

    it('reports a broken required relation readably (P2014)', () => {
      const filter = new ApiExceptionFilter();
      const exception = new Prisma.PrismaClientKnownRequestError(
        'The change failed because it would break a required relation',
        { code: 'P2014', clientVersion: '6.0.0' },
      );
      const { host, response } = createMockHost(exception);

      filter.catch(exception, host as any);

      expect(response.status).toHaveBeenCalledWith(409);
      const body = response.json.mock.calls[0][0];
      expect(body.error.code).toBe('REFERENCE_ERROR');
      expect(body.error.message).not.toMatch(/Prisma/i);
    });

    it('leaves unrelated Prisma codes as DATABASE_ERROR', () => {
      const filter = new ApiExceptionFilter();
      const exception = new Prisma.PrismaClientKnownRequestError('division by zero', {
        code: 'P2019',
        clientVersion: '6.0.0',
      });
      const { host, response } = createMockHost(exception);

      filter.catch(exception, host as any);

      expect(response.json.mock.calls[0][0].error.code).toBe('DATABASE_ERROR');
    });
  });
});
