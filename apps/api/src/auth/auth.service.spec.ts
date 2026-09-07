import { describe, it, expect, vi, beforeEach } from 'vitest';
import { AuthService } from './auth.service';
import { ApiException } from '../common/exceptions/api.exception';
import type { Response } from 'express';

vi.mock('argon2', () => ({
  verify: vi.fn(),
  hash: vi.fn(),
}));

import * as argon2 from 'argon2';
const argon2VerifyMock = argon2.verify as ReturnType<typeof vi.fn>;

const mockUser = {
  id: 'u1',
  fullName: 'Admin User',
  username: 'admin',
  email: 'admin@test.com',
  phone: '12345',
  passwordHash: '$argon2id$v=19$m=65536,t=3,p=4$fakehash',
  status: 'active',
  organizationId: 'default-org',
  tokenVersion: 1,
  failedLoginAttempts: 0,
  lockedUntil: null,
  roles: [
    {
      role: {
        name: 'admin',
        permissions: [{ permission: { name: 'users.view' } }, { permission: { name: 'users.manage' } }],
      },
    },
  ],
};

function extractError(p: Promise<unknown>): Promise<{ status: number; code: string; message: string }> {
  return p.catch((err) => {
    if (err instanceof ApiException) {
      const resp = err.getResponse() as { error: { code: string; message: string } };
      return { status: err.getStatus(), code: resp.error.code, message: resp.error.message };
    }
    throw err;
  }) as never;
}

function buildService(overrides?: { prisma?: Record<string, unknown>; jwt?: Record<string, unknown> }) {
  const prisma = overrides?.prisma ?? {
    user: {
      findUnique: vi.fn().mockResolvedValue(mockUser),
      update: vi.fn().mockResolvedValue({}),
    },
  };
  const jwt = overrides?.jwt ?? {
    signAsync: vi.fn().mockResolvedValue('mock-jwt-token'),
    verifyAsync: vi.fn().mockResolvedValue({ id: 'u1', tokenVersion: 1 }),
    sign: vi.fn().mockReturnValue('mock-jwt-token'),
  };
  const config = {
    get: vi.fn((key: string, fallback?: string) => {
      const map: Record<string, string> = {
        JWT_ACCESS_SECRET: 'test-access-secret',
        JWT_REFRESH_SECRET: 'test-refresh-secret',
        JWT_ACCESS_EXPIRES_IN: '15m',
        JWT_REFRESH_EXPIRES_IN: '7d',
      };
      return map[key] ?? fallback;
    }),
  };
  const audit = { record: vi.fn() };

  const svc = new AuthService(prisma as never, jwt as never, config as never, audit as never);
  return { svc, prisma, jwt, config, audit };
}

describe('AuthService.login', () => {
  beforeEach(() => {
    argon2VerifyMock.mockReset();
  });

  it('throws UNAUTHORIZED on non-existent user', async () => {
    const prisma = {
      user: {
        findUnique: vi.fn().mockResolvedValue(null),
        update: vi.fn(),
      },
    };
    const { svc } = buildService({ prisma });
    const err = await extractError(svc.login({ username: 'ghost', password: 'pass' }));
    expect(err.status).toBe(401);
    expect(err.code).toBe('UNAUTHORIZED');
    expect(err.message).toMatch(/Invalid username or password/);
  });

  it('throws UNAUTHORIZED on inactive user', async () => {
    const prisma = {
      user: {
        findUnique: vi.fn().mockResolvedValue({ ...mockUser, status: 'inactive' }),
        update: vi.fn(),
      },
    };
    const { svc } = buildService({ prisma });
    const err = await extractError(svc.login({ username: 'admin', password: 'pass' }));
    expect(err.status).toBe(401);
    expect(err.message).toMatch(/not active/);
  });

  it('returns tokens on valid login', async () => {
    argon2VerifyMock.mockResolvedValue(true);

    const { svc, audit } = buildService();
    const result = await svc.login({ username: 'admin', password: 'correct' });

    expect(result.accessToken).toBeDefined();
    expect(result.refreshToken).toBeDefined();
    expect(result.user.username).toBe('admin');
    expect(result.user.roles).toEqual(['admin']);
    expect(result.user.permissions).toEqual(['users.view', 'users.manage']);
    expect(audit.record).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'LOGIN', module: 'AUTH' }),
    );
  });

  it('throws UNAUTHORIZED on wrong password', async () => {
    argon2VerifyMock.mockResolvedValue(false);

    const { svc } = buildService();
    const err = await extractError(svc.login({ username: 'admin', password: 'wrong' }));
    expect(err.status).toBe(401);
    expect(err.message).toMatch(/Invalid username or password/);
  });

  it('throws UNAUTHORIZED when the account is locked out after failed attempts', async () => {
    argon2VerifyMock.mockResolvedValue(false);
    const prisma = {
      user: {
        findUnique: vi.fn().mockResolvedValue({
          ...mockUser,
          failedLoginAttempts: 5,
          lockedUntil: new Date(Date.now() + 5 * 60_000),
        }),
        update: vi.fn(),
      },
    };
    const { svc } = buildService({ prisma });
    const err = await extractError(svc.login({ username: 'admin', password: 'wrong' }));
    expect(err.status).toBe(401);
    expect(err.message).toMatch(/locked/);
  });

  it('throws UNAUTHORIZED on wrong password and bumps the failed-attempt counter', async () => {
    argon2VerifyMock.mockResolvedValue(false);
    const update = vi.fn().mockResolvedValue({});
    const prisma = {
      user: {
        findUnique: vi.fn().mockResolvedValue({ ...mockUser, failedLoginAttempts: 4 }),
        update,
      },
    };
    const { svc, audit } = buildService({ prisma });
    const err = await extractError(svc.login({ username: 'admin', password: 'wrong' }));
    expect(err.status).toBe(401);
    expect(err.message).toMatch(/locked for 15 minutes/);
    expect(update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ failedLoginAttempts: 5, lockedUntil: expect.any(Date) }),
      }),
    );
    expect(audit.record).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'LOGIN_FAILED', module: 'AUTH' }),
    );
  });

  it('resets the failed-attempt counter once the lock window has expired', async () => {
    argon2VerifyMock.mockResolvedValue(true);
    const update = vi.fn().mockResolvedValue({});
    const prisma = {
      user: {
        findUnique: vi.fn().mockResolvedValue({
          ...mockUser,
          failedLoginAttempts: 5,
          lockedUntil: new Date(Date.now() - 60_000),
        }),
        update,
      },
    };
    const { svc } = buildService({ prisma });
    const result = await svc.login({ username: 'admin', password: 'correct' });
    expect(result.accessToken).toBeDefined();
    expect(update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ failedLoginAttempts: 0, lockedUntil: null, lastLoginAt: expect.any(Date) }),
      }),
    );
  });
});

describe('AuthService.refresh', () => {
  it('throws UNAUTHORIZED on missing token', async () => {
    const { svc } = buildService();
    const err = await extractError(svc.refresh(''));
    expect(err.status).toBe(401);
    expect(err.message).toMatch(/Refresh token missing/);
  });

  it('throws UNAUTHORIZED on invalid token', async () => {
    const jwt = { verifyAsync: vi.fn().mockRejectedValue(new Error('invalid')), sign: vi.fn() };
    const { svc } = buildService({ jwt });
    const err = await extractError(svc.refresh('bad-token'));
    expect(err.status).toBe(401);
    expect(err.message).toMatch(/Invalid or expired refresh token/);
  });

  it('returns tokens for a valid refresh token', async () => {
    const { svc } = buildService();
    const result = await svc.refresh('valid-token');
    expect(result.accessToken).toBeDefined();
    expect(result.refreshToken).toBeDefined();
  });

  it('rejects a replayed/stale refresh token after rotation', async () => {
    const prisma = {
      user: {
        findUnique: vi.fn().mockResolvedValue({ ...mockUser, tokenVersion: 3 }),
        update: vi.fn(),
      },
    };
    const { svc } = buildService({ prisma });
    const err = await extractError(svc.refresh('stale-issued-at-version-2'));
    expect(err.status).toBe(401);
    expect(err.message).toMatch(/no longer valid/);
  });

  it('rotates the refresh token by bumping the stored token version', async () => {
    const update = vi.fn().mockResolvedValue({});
    const prisma = {
      user: {
        findUnique: vi.fn().mockResolvedValue(mockUser),
        update,
      },
    };
    const { svc } = buildService({ prisma });
    await svc.refresh('valid-token');
    expect(update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ tokenVersion: 2 }) }),
    );
  });
});

describe('AuthService.setAuthCookies / clearAuthCookies', () => {
  it('sets access and refresh cookies', () => {
    const { svc } = buildService();
    const res = {
      cookie: vi.fn(),
    } as unknown as Response;

    svc.setAuthCookies(res, { accessToken: 'at', refreshToken: 'rt' });

    expect(res.cookie).toHaveBeenCalledTimes(2);
    expect(res.cookie).toHaveBeenCalledWith('access_token', 'at', expect.objectContaining({ httpOnly: true }));
    expect(res.cookie).toHaveBeenCalledWith('refresh_token', 'rt', expect.objectContaining({ httpOnly: true }));
  });

  it('clears both cookies', () => {
    const { svc } = buildService();
    const res = {
      clearCookie: vi.fn(),
    } as unknown as Response;

    svc.clearAuthCookies(res);

    expect(res.clearCookie).toHaveBeenCalledTimes(2);
    expect(res.clearCookie).toHaveBeenCalledWith('access_token', { path: '/' });
    expect(res.clearCookie).toHaveBeenCalledWith('refresh_token', { path: '/' });
  });
});
