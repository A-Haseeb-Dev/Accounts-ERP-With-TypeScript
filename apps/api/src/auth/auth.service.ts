import { Injectable } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { Response } from 'express';
import * as argon2 from 'argon2';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { ApiException } from '../common/exceptions/api.exception';
import { JwtPayload, JwtRefreshPayload } from './interfaces/jwt-payload.interface';
import { LoginDto, RefreshDto } from './dto/auth.dto';

export const MAX_LOGIN_ATTEMPTS = 5;

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
    private readonly audit: AuditService,
  ) {}

  async login(dto: LoginDto, ipAddress?: string, userAgent?: string) {
    const user = await this.prisma.user.findUnique({
      where: { username: dto.username },
      include: {
        roles: {
          include: {
            role: {
              include: { permissions: { include: { permission: true } } },
            },
          },
        },
      },
    });

    if (!user) {
      throw ApiException.unauthorized('Invalid username or password');
    }

    if (user.status !== 'active') {
      throw ApiException.unauthorized('This account is not active');
    }

    // Brute-force lockout: block the account for 15 minutes after 5 failures.
    if (user.lockedUntil) {
      if (user.lockedUntil > new Date()) {
        const mins = Math.ceil((user.lockedUntil.getTime() - Date.now()) / 60_000);
        throw ApiException.unauthorized(
          `Account temporarily locked due to too many failed attempts. Try again in ${mins} minute(s).`,
        );
      }
      // Lock window has expired — give the user a fresh set of attempts.
      await this.prisma.user.update({
        where: { id: user.id },
        data: { failedLoginAttempts: 0, lockedUntil: null },
      });
    }

    const valid = await argon2.verify(user.passwordHash, dto.password).catch(() => false);
    if (!valid) {
      const attempts = user.failedLoginAttempts + 1;
      const lockedUntil = attempts >= MAX_LOGIN_ATTEMPTS ? new Date(Date.now() + 15 * 60_000) : null;
      await this.prisma.user.update({
        where: { id: user.id },
        data: { failedLoginAttempts: attempts, lockedUntil: lockedUntil ?? user.lockedUntil },
      });

      this.audit.record({
        userId: user.id,
        action: 'LOGIN_FAILED',
        module: 'AUTH',
        entity: 'User',
        entityId: user.id,
        message: `Failed login attempt ${attempts} of ${MAX_LOGIN_ATTEMPTS} for ${user.username}`,
        ipAddress,
        userAgent,
      });

      throw ApiException.unauthorized(
        lockedUntil
          ? `Too many failed attempts. Account locked for 15 minutes.`
          : 'Invalid username or password',
      );
    }

    await this.prisma.user.update({
      where: { id: user.id },
      data: { lastLoginAt: new Date(), failedLoginAttempts: 0, lockedUntil: null },
    });

    this.audit.record({
      userId: user.id,
      action: 'LOGIN',
      module: 'AUTH',
      entity: 'User',
      entityId: user.id,
      message: `User ${user.username} logged in`,
      ipAddress,
      userAgent,
    });

    const roles = user.roles.map((r) => r.role.name);
    const permissions = user.roles.flatMap((r) => r.role.permissions.map((p) => p.permission.name));

    return this.buildAuthResponse(
      user.id,
      user.username,
      user.fullName,
      user.organizationId,
      {
        id: user.id,
        fullName: user.fullName,
        username: user.username,
        email: user.email,
        phone: user.phone,
        roles,
        permissions,
      },
      user.tokenVersion,
    );
  }

  async refresh(refreshToken: string, ipAddress?: string, userAgent?: string) {
    if (!refreshToken) {
      throw ApiException.unauthorized('Refresh token missing');
    }

    let payload: JwtRefreshPayload;
    try {
      payload = await this.jwt.verifyAsync<JwtRefreshPayload>(refreshToken, {
        secret: this.config.get<string>('JWT_REFRESH_SECRET', 'has-erp-refresh-secret'),
      });
    } catch {
      throw ApiException.unauthorized('Invalid or expired refresh token');
    }

    const user = await this.prisma.user.findUnique({ where: { id: payload.id } });
    if (!user || user.status !== 'active') {
      throw ApiException.unauthorized('User not found or inactive');
    }

    // Refresh-token rotation + revocation: the version in the stored token must
    // match the user's current version. Every successful refresh bumps the
    // version, so the just-used token cannot be replayed, and a password change
    // or logout bumps it again to invalidate all outstanding refresh tokens.
    if (!payload.tokenVersion || payload.tokenVersion !== user.tokenVersion) {
      throw ApiException.unauthorized('Refresh token is no longer valid. Please log in again.');
    }

    await this.prisma.user.update({
      where: { id: user.id },
      data: { tokenVersion: user.tokenVersion + 1 },
    });

    this.audit.record({
      userId: user.id,
      action: 'TOKEN_REFRESH',
      module: 'AUTH',
      entity: 'User',
      entityId: user.id,
      message: `Access token refreshed for ${user.username}`,
      ipAddress,
      userAgent,
    });

    return this.buildAuthResponse(user.id, user.username, user.fullName, user.organizationId, {}, user.tokenVersion + 1);
  }

  /** Revokes every outstanding refresh token for a user (version bump). */
  async revokeAllRefreshTokens(userId: string) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) return;
    await this.prisma.user.update({
      where: { id: userId },
      data: { tokenVersion: user.tokenVersion + 1 },
    });
  }

  /** Revokes a user's refresh tokens from a presented (still valid) refresh token. */
  async revokeByRefreshToken(refreshToken: string) {
    let payload: JwtRefreshPayload | undefined;
    try {
      payload = await this.jwt.verifyAsync<JwtRefreshPayload>(refreshToken, {
        secret: this.config.get<string>('JWT_REFRESH_SECRET', 'has-erp-refresh-secret'),
      });
    } catch {
      return; // already invalid — nothing to revoke
    }
    if (payload) {
      await this.revokeAllRefreshTokens(payload.id);
    }
  }

  /**
   * Self-service password change. Verifies the current password, stores the new
   * one, bumps the token version (which logs every other session out) and
   * re-issues fresh tokens for the current session.
   */
  async changePassword(
    userId: string,
    currentPassword: string,
    newPassword: string,
    ipAddress?: string,
    userAgent?: string,
  ) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: {
        roles: {
          include: { role: { include: { permissions: { include: { permission: true } } } } },
        },
      },
    });
    if (!user) {
      throw ApiException.notFound('User');
    }

    const valid = await argon2.verify(user.passwordHash, currentPassword).catch(() => false);
    if (!valid) {
      throw ApiException.unauthorized('Current password is incorrect');
    }
    if (currentPassword === newPassword) {
      throw ApiException.unauthorized('New password must be different from the current password');
    }

    const passwordHash = await argon2.hash(newPassword);
    await this.prisma.user.update({
      where: { id: user.id },
      data: { passwordHash, failedLoginAttempts: 0, lockedUntil: null },
    });

    this.audit.record({
      userId: user.id,
      action: 'PASSWORD_CHANGE',
      module: 'AUTH',
      entity: 'User',
      entityId: user.id,
      message: `User ${user.username} changed their password`,
      ipAddress,
      userAgent,
    });

    const version = user.tokenVersion + 1;
    await this.revokeAllRefreshTokens(user.id);

    return this.buildAuthResponse(
      user.id,
      user.username,
      user.fullName,
      user.organizationId,
      {
        id: user.id,
        fullName: user.fullName,
        username: user.username,
        email: user.email,
        phone: user.phone,
        roles: user.roles.map((r) => r.role.name),
        permissions: user.roles.flatMap((r) => r.role.permissions.map((p) => p.permission.name)),
      },
      version,
    );
  }

  private buildAuthResponse(
    userId: string,
    username: string,
    fullName: string,
    organizationId: string,
    extra: Record<string, unknown> = {},
    tokenVersion?: number,
  ) {
    const accessPayload: JwtPayload = { id: userId, username, fullName, organizationId };
    const refreshPayload: JwtRefreshPayload = { id: userId, tokenVersion: tokenVersion ?? 1 };

    const accessToken = this.jwt.sign(accessPayload, {
      secret: this.config.get<string>('JWT_ACCESS_SECRET', 'has-erp-access-secret'),
      expiresIn: this.config.get<string>('JWT_ACCESS_EXPIRES_IN', '15m'),
    });

    const refreshToken = this.jwt.sign(refreshPayload, {
      secret: this.config.get<string>('JWT_REFRESH_SECRET', 'has-erp-refresh-secret'),
      expiresIn: this.config.get<string>('JWT_REFRESH_EXPIRES_IN', '7d'),
    });

    return {
      accessToken,
      refreshToken,
      user: extra,
    };
  }

  setAuthCookies(response: Response, tokens: { accessToken: string; refreshToken: string }) {
    const isProd = process.env.NODE_ENV === 'production';
    response.cookie('access_token', tokens.accessToken, {
      httpOnly: true,
      secure: isProd,
      sameSite: 'lax',
      maxAge: 15 * 60 * 1000,
      path: '/',
    });
    response.cookie('refresh_token', tokens.refreshToken, {
      httpOnly: true,
      secure: isProd,
      sameSite: 'lax',
      maxAge: 7 * 24 * 60 * 60 * 1000,
      path: '/',
    });
  }

  clearAuthCookies(response: Response) {
    response.clearCookie('access_token', { path: '/' });
    response.clearCookie('refresh_token', { path: '/' });
  }
}

// Re-export to satisfy DTO import references
export { JwtPayload, JwtRefreshPayload };