import { describe, it, expect, vi } from 'vitest';
import { RolesService } from './roles.service';
import { ApiException } from '../common/exceptions/api.exception';

const mockRole = {
  id: 'r1',
  name: 'Manager',
  description: 'Can manage stuff',
  isSystem: false,
  permissions: [],
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

function buildService(overrides?: { prisma?: Record<string, unknown> }) {
  const prisma = overrides?.prisma ?? {
    role: {
      findFirst: vi.fn().mockResolvedValue(null),
      findUnique: vi.fn(),
      findMany: vi.fn().mockResolvedValue([]),
      create: vi.fn().mockResolvedValue(mockRole),
      update: vi.fn().mockResolvedValue(mockRole),
      delete: vi.fn(),
    },
    rolePermission: {
      deleteMany: vi.fn(),
      createMany: vi.fn(),
    },
  };
  const audit = { record: vi.fn() };
  const svc = new RolesService(prisma as never, audit as never);
  return { svc, prisma, audit };
}

describe('RolesService.create', () => {
  it('creates a role and records audit', async () => {
    const { svc, audit } = buildService();
    const result = await svc.create({ name: 'Manager' }, 'admin');
    expect(result.name).toBe('Manager');
    expect(audit.record).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'CREATE', module: 'ROLE' }),
    );
  });

  it('rejects duplicate role names', async () => {
    const prisma = {
      role: { findFirst: vi.fn().mockResolvedValue({ id: 'existing' }) },
    };
    const { svc } = buildService({ prisma });
    const err = await extractError(svc.create({ name: 'Manager' }));
    expect(err.status).toBe(409);
    expect(err.code).toBe('DUPLICATE_CODE');
    expect(err.message).toMatch(/Role name/);
  });
});

describe('RolesService.findOne', () => {
  it('returns role with permissions', async () => {
    const prisma = {
      role: { findUnique: vi.fn().mockResolvedValue(mockRole) },
    };
    const { svc } = buildService({ prisma });
    const result = await svc.findOne('r1');
    expect(result.id).toBe('r1');
  });

  it('throws NOT_FOUND for missing role', async () => {
    const prisma = { role: { findUnique: vi.fn().mockResolvedValue(null) } };
    const { svc } = buildService({ prisma });
    const err = await extractError(svc.findOne('ghost'));
    expect(err.status).toBe(404);
    expect(err.message).toMatch(/not found/i);
  });
});

describe('RolesService.update', () => {
  it('updates a role', async () => {
    const prisma = {
      role: {
        findUnique: vi.fn().mockResolvedValue(mockRole),
        update: vi.fn().mockResolvedValue({ ...mockRole, name: 'Updated' }),
      },
      rolePermission: { deleteMany: vi.fn(), createMany: vi.fn() },
    };
    const { svc } = buildService({ prisma });
    const result = await svc.update('r1', { name: 'Updated' });
    expect(result.name).toBe('Updated');
  });

  it('prevents renaming system roles', async () => {
    const prisma = {
      role: {
        findUnique: vi.fn().mockResolvedValue({ ...mockRole, isSystem: true, name: 'Admin' }),
      },
      rolePermission: { deleteMany: vi.fn(), createMany: vi.fn() },
    };
    const { svc } = buildService({ prisma });
    const err = await extractError(svc.update('r1', { name: 'Renamed' }));
    expect(err.status).toBe(422);
    expect(err.message).toMatch(/System roles cannot be renamed/);
  });

  it('throws NOT_FOUND for missing role', async () => {
    const prisma = { role: { findUnique: vi.fn().mockResolvedValue(null) } };
    const { svc } = buildService({ prisma });
    const err = await extractError(svc.update('ghost', { name: 'X' }));
    expect(err.status).toBe(404);
    expect(err.message).toMatch(/not found/i);
  });
});

describe('RolesService.remove', () => {
  it('deletes a non-system role with no users', async () => {
    const prisma = {
      role: {
        findUnique: vi.fn().mockResolvedValue({ ...mockRole, _count: { users: 0 } }),
        delete: vi.fn(),
      },
      rolePermission: { deleteMany: vi.fn() },
    };
    const { svc, audit } = buildService({ prisma });
    const result = await svc.remove('r1');
    expect(result.deleted).toBe(true);
    expect(audit.record).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'DELETE' }),
    );
  });

  it('prevents deleting system roles', async () => {
    const prisma = {
      role: {
        findUnique: vi.fn().mockResolvedValue({ ...mockRole, isSystem: true, _count: { users: 0 } }),
      },
      rolePermission: { deleteMany: vi.fn() },
    };
    const { svc } = buildService({ prisma });
    const err = await extractError(svc.remove('r1'));
    expect(err.status).toBe(422);
    expect(err.message).toMatch(/System roles cannot be deleted/);
  });

  it('prevents deleting roles assigned to users', async () => {
    const prisma = {
      role: {
        findUnique: vi.fn().mockResolvedValue({ ...mockRole, _count: { users: 5 } }),
      },
      rolePermission: { deleteMany: vi.fn() },
    };
    const { svc } = buildService({ prisma });
    const err = await extractError(svc.remove('r1'));
    expect(err.status).toBe(422);
    expect(err.message).toMatch(/assigned to 5 user/);
  });
});

describe('RolesService.assignPermissions', () => {
  it('replaces permissions and returns updated role', async () => {
    const prisma = {
      role: {
        findUnique: vi.fn()
          .mockResolvedValueOnce(mockRole)
          .mockResolvedValueOnce({ ...mockRole, permissions: [{ permission: { name: 'test.perm' } }] }),
      },
      rolePermission: {
        deleteMany: vi.fn(),
        createMany: vi.fn(),
      },
    };
    const { svc, audit } = buildService({ prisma });
    const result = await svc.assignPermissions('r1', ['perm-1', 'perm-2']);
    expect(audit.record).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'PERMISSIONS_CHANGED' }),
    );
  });

  it('throws NOT_FOUND for missing role', async () => {
    const prisma = { role: { findUnique: vi.fn().mockResolvedValue(null) } };
    const { svc } = buildService({ prisma });
    const err = await extractError(svc.assignPermissions('ghost', []));
    expect(err.status).toBe(404);
    expect(err.message).toMatch(/not found/i);
  });
});
