import { describe, it, expect, vi, beforeEach } from 'vitest';
import { UsersService } from './users.service';
import { ApiException } from '../common/exceptions/api.exception';

vi.mock('argon2', () => ({
  hash: vi.fn(),
  verify: vi.fn(),
}));

import * as argon2 from 'argon2';
const argon2HashMock = argon2.hash as ReturnType<typeof vi.fn>;

const mockCreatedUser = {
  id: 'u1',
  fullName: 'Test User',
  username: 'testuser',
  email: 'test@test.com',
  phone: null,
  passwordHash: 'hashed-pw',
  status: 'active',
  organizationId: 'default-org',
  createdAt: new Date(),
  updatedAt: new Date(),
  roles: [],
};

async function extractError(p: Promise<unknown>): Promise<{ status: number; code: string; message: string }> {
  try {
    await p;
    throw new Error('Expected an ApiException but none was thrown');
  } catch (err) {
    if (err instanceof ApiException) {
      const resp = err.getResponse() as { error: { code: string; message: string } };
      return { status: err.getStatus(), code: resp.error.code, message: resp.error.message };
    }
    throw err;
  }
}

type MockFn = ReturnType<typeof vi.fn>;

interface MockUsersPrisma {
  user: { findUnique?: MockFn; findMany?: MockFn; count?: MockFn; create?: MockFn; update?: MockFn };
  userRole: { deleteMany?: MockFn; createMany?: MockFn };
}

function buildService(overrides?: { prisma?: Partial<MockUsersPrisma> }) {
  const prisma: MockUsersPrisma = {
    user: {
      findUnique: vi.fn(),
      findMany: vi.fn().mockResolvedValue([]),
      count: vi.fn().mockResolvedValue(0),
      create: vi.fn().mockResolvedValue(mockCreatedUser),
      update: vi.fn().mockResolvedValue(mockCreatedUser),
    },
    userRole: {
      deleteMany: vi.fn(),
      createMany: vi.fn(),
    },
    ...(overrides?.prisma ?? {}),
  } as MockUsersPrisma;
  const audit = { record: vi.fn() };
  const svc = new UsersService(prisma as never, audit as never);
  return { svc, prisma, audit };
}

describe('UsersService.create', () => {
  beforeEach(() => {
    argon2HashMock.mockReset();
  });

  it('creates a user with hashed password', async () => {
    argon2HashMock.mockResolvedValue('argon2hashed');

    const { svc, prisma } = buildService();
    (prisma.user.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue(null);

    const result = await svc.create({
      fullName: 'Test User',
      username: 'testuser',
      password: 'secret1234',
    });

    expect(result.username).toBe('testuser');
    expect(result).not.toHaveProperty('passwordHash');
    expect(prisma.user.create).toHaveBeenCalled();
  });

  it('rejects duplicate usernames', async () => {
    const { svc, prisma } = buildService();
    (prisma.user.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue({ id: 'existing' });

    const err = await extractError(
      svc.create({ fullName: 'Test', username: 'taken', password: 'secret1234' }),
    );
    expect(err.status).toBe(409);
    expect(err.code).toBe('DUPLICATE_CODE');
    expect(err.message).toMatch(/Username/);
  });
});

describe('UsersService.findAll', () => {
  it('returns paginated results', async () => {
    const users = [
      { ...mockCreatedUser, id: 'u1' },
      { ...mockCreatedUser, id: 'u2', username: 'user2' },
    ];
    const prisma = {
      user: {
        findMany: vi.fn().mockResolvedValue(users),
        count: vi.fn().mockResolvedValue(2),
      },
    };
    const { svc } = buildService({ prisma });

    const result = await svc.findAll({ page: 1, pageSize: 25 });

    expect(result.items).toHaveLength(2);
    expect(result.total).toBe(2);
    expect(result.totalPages).toBe(1);
    expect(result.page).toBe(1);
  });

  it('filters by search term', async () => {
    const prisma = {
      user: {
        findMany: vi.fn().mockResolvedValue([]),
        count: vi.fn().mockResolvedValue(0),
      },
    };
    const { svc } = buildService({ prisma });

    await svc.findAll({ search: 'admin' });

    expect(prisma.user.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          OR: expect.arrayContaining([
            expect.objectContaining({ username: expect.objectContaining({ contains: 'admin' }) }),
          ]),
        }),
      }),
    );
  });
});

describe('UsersService.findOne', () => {
  it('returns user without passwordHash', async () => {
    const prisma = {
      user: {
        findUnique: vi.fn().mockResolvedValue(mockCreatedUser),
      },
    };
    const { svc } = buildService({ prisma });

    const result = await svc.findOne('u1');
    expect(result).not.toHaveProperty('passwordHash');
    expect(result.username).toBe('testuser');
  });

  it('throws NOT_FOUND for missing user', async () => {
    const prisma = {
      user: { findUnique: vi.fn().mockResolvedValue(null) },
    };
    const { svc } = buildService({ prisma });

    const err = await extractError(svc.findOne('missing'));
    expect(err.status).toBe(404);
    expect(err.message).toMatch(/not found/i);
  });
});

describe('UsersService.remove', () => {
  it('deactivates a user', async () => {
    const prisma = {
      user: {
        findUnique: vi.fn().mockResolvedValue(mockCreatedUser),
        update: vi.fn().mockResolvedValue({}),
      },
      userRole: { deleteMany: vi.fn() },
    };
    const { svc, audit } = buildService({ prisma });

    const result = await svc.remove('u1', 'admin-id');
    expect(result.status).toBe('inactive');
    expect(audit.record).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'DEACTIVATE' }),
    );
  });

  it('prevents self-deactivation', async () => {
    const prisma = {
      user: {
        findUnique: vi.fn().mockResolvedValue(mockCreatedUser),
      },
      userRole: { deleteMany: vi.fn() },
    };
    const { svc } = buildService({ prisma });

    const err = await extractError(svc.remove('u1', 'u1'));
    expect(err.status).toBe(422);
    expect(err.message).toMatch(/cannot deactivate your own account/);
  });

  it('throws NOT_FOUND for missing user', async () => {
    const prisma = {
      user: { findUnique: vi.fn().mockResolvedValue(null) },
      userRole: { deleteMany: vi.fn() },
    };
    const { svc } = buildService({ prisma });

    const err = await extractError(svc.remove('ghost'));
    expect(err.status).toBe(404);
    expect(err.message).toMatch(/not found/i);
  });
});
