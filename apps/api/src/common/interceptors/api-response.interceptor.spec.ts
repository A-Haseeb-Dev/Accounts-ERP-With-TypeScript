import { describe, it, expect } from 'vitest';
import { ApiResponseInterceptor } from './api-response.interceptor';
import { CallHandler, ExecutionContext } from '@nestjs/common';
import { firstValueFrom, of } from 'rxjs';

function createMockContext() {
  return {} as ExecutionContext;
}

function createMockCallHandler(data: unknown): CallHandler {
  return { handle: () => of(data) } as CallHandler;
}

describe('ApiResponseInterceptor', () => {
  it('wraps plain data in success envelope', async () => {
    const interceptor = new ApiResponseInterceptor();
    const context = createMockContext();
    const callHandler = createMockCallHandler({ name: 'test' });

    const result = await firstValueFrom(interceptor.intercept(context, callHandler));
    expect(result).toEqual({
      success: true,
      data: { name: 'test' },
      message: 'Operation successful',
    });
  });

  it('wraps array data in success envelope', async () => {
    const interceptor = new ApiResponseInterceptor();
    const context = createMockContext();
    const callHandler = createMockCallHandler([1, 2, 3]);

    const result = await firstValueFrom(interceptor.intercept(context, callHandler));
    expect(result).toEqual({
      success: true,
      data: [1, 2, 3],
      message: 'Operation successful',
    });
  });

  it('does not wrap data that already has success: false', async () => {
    const interceptor = new ApiResponseInterceptor();
    const context = createMockContext();
    const errorData = { success: false, error: { code: 'ERR', message: 'fail' } };
    const callHandler = createMockCallHandler(errorData);

    const result = await firstValueFrom(interceptor.intercept(context, callHandler));
    expect(result).toBe(errorData);
  });

  it('wraps null data', async () => {
    const interceptor = new ApiResponseInterceptor();
    const context = createMockContext();
    const callHandler = createMockCallHandler(null);

    const result = await firstValueFrom(interceptor.intercept(context, callHandler));
    expect(result).toEqual({
      success: true,
      data: null,
      message: 'Operation successful',
    });
  });
});
