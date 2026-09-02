import { describe, it, expect, vi } from 'vitest';
import { ApiExceptionFilter } from './api-exception.filter';
import { ApiException } from '../exceptions/api.exception';
import { HttpException, HttpStatus } from '@nestjs/common';

function createMockHost(exception: unknown) {
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
});
