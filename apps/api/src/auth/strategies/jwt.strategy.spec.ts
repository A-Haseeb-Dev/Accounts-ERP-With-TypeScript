import { describe, it, expect, vi } from 'vitest';
import { UnauthorizedException } from '@nestjs/common';
import { JwtStrategy } from './jwt.strategy';

function buildStrategy(user?: Record<string, unknown>) {
  const prisma = {
    user: {
      findUnique: vi.fn().mockResolvedValue(
        user ??
          {
            id: 'user-1',
            username: 'admin',
            fullName: 'Admin',
            organizationId: 'org-1',
            status: 'active',
            roles: [{ role: { name: 'Admin', permissions: [{ permission: { name: 'p' } }] } }],
          },
      ),
    },
  };
  const config = { get: vi.fn().mockReturnValue('test-secret') };
  const strategy = new JwtStrategy(config as never, prisma as never);
  return { strategy, prisma };
}

describe('JwtStrategy.validate', () => {
  it('rejects an MFA challenge token, which is signed with the access secret', async () => {
    const { strategy, prisma } = buildStrategy();

    // A password-only login while 2FA is enabled yields this. It verifies
    // correctly, so without an explicit rejection it authenticates as an
    // access token and the second factor is skipped entirely.
    await expect(
      strategy.validate({ id: 'user-1', purpose: 'mfa_challenge' } as never),
    ).rejects.toBeInstanceOf(UnauthorizedException);
    expect(prisma.user.findUnique).not.toHaveBeenCalled();
  });

  it.each(['mfa_challenge', 'mfa_verify', 'refresh'])(
    'rejects any payload carrying purpose=%s',
    async (purpose) => {
      const { strategy } = buildStrategy();
      await expect(strategy.validate({ id: 'user-1', purpose } as never)).rejects.toBeInstanceOf(
        UnauthorizedException,
      );
    },
  );

  it('accepts a normal access payload and returns the user with permissions', async () => {
    const { strategy } = buildStrategy();

    const result = await strategy.validate({ id: 'user-1' } as never);

    expect(result).toMatchObject({
      id: 'user-1',
      organizationId: 'org-1',
      roles: ['Admin'],
      permissions: ['p'],
    });
  });

  it('rejects a payload for an inactive or missing user', async () => {
    const { strategy } = buildStrategy({
      id: 'user-1',
      username: 'x',
      fullName: 'X',
      organizationId: 'org-1',
      status: 'inactive',
      roles: [],
    });

    await expect(strategy.validate({ id: 'user-1' } as never)).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });
});