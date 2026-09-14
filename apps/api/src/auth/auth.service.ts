import { Injectable } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { Response } from 'express';
import * as argon2 from 'argon2';
import { generateSecret, generateURI, verify as verifyOtp } from './totp.util';
import { toDataURL as toQrDataURL } from 'qrcode';
import { createHash, randomBytes } from 'crypto';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { ApiException } from '../common/exceptions/api.exception';
import { JwtPayload, JwtRefreshPayload, MfaChallengePayload } from './interfaces/jwt-payload.interface';
import { LoginDto } from './dto/auth.dto';

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
      // Lock window has expired Ã¢â‚¬â€ give the user a fresh set of attempts.
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

    // Two-factor authentication: return a short-lived challenge token instead
    // of session tokens. The second factor must be presented to finish login.
    if (user.twoFactorEnabled) {
      const pendingToken = this.jwt.sign(
        { id: user.id, purpose: 'mfa' } satisfies MfaChallengePayload,
        {
          secret: this.config.get<string>('JWT_ACCESS_SECRET', 'has-erp-access-secret'),
          expiresIn: '10m',
        },
      );

      this.audit.record({
        userId: user.id,
        action: 'LOGIN_2FA_PENDING',
        module: 'AUTH',
        entity: 'User',
        entityId: user.id,
        message: `User ${user.username} passed the password step; waiting for the second factor`,
        ipAddress,
        userAgent,
      });

      return {
        twoFactorRequired: true as const,
        pendingToken,
        user: {
          id: user.id,
          username: user.username,
          fullName: user.fullName,
        },
      };
    }

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

  /**
   * Completes login for a user with 2FA enabled. Accepts either the current
   * TOTP code from their authenticator app or one of their recovery codes.
   */
  async verifyMfaChallenge(pendingToken: string, token: string, ipAddress?: string, userAgent?: string) {
    let payload: MfaChallengePayload;
    try {
      payload = await this.jwt.verifyAsync<MfaChallengePayload>(pendingToken, {
        secret: this.config.get<string>('JWT_ACCESS_SECRET', 'has-erp-access-secret'),
      });
    } catch {
      throw ApiException.unauthorized('Two-factor verification expired. Please sign in again.');
    }

    if (!payload || payload.purpose !== 'mfa') {
      throw ApiException.unauthorized('Invalid two-factor challenge');
    }

    const user = await this.prisma.user.findUnique({
      where: { id: payload.id },
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
    if (!user || user.status !== 'active') {
      throw ApiException.unauthorized('User not found or inactive');
    }
    if (!user.twoFactorEnabled || !user.twoFactorSecret) {
      throw ApiException.unauthorized('Two-factor authentication is not enabled for this account');
    }

    const tokenOk = /^\d{6}$/.test(token)
      ? (await verifyOtp({ token, secret: user.twoFactorSecret, epochTolerance: 30 }).catch(() => ({ valid: false }))).valid
      : false;

    if (!tokenOk) {
      const usedRecovery = await this.consumeRecoveryCode(user.id, token);
      if (!usedRecovery) {
        this.audit.record({
          userId: user.id,
          action: 'LOGIN_FAILED',
          module: 'AUTH',
          entity: 'User',
          entityId: user.id,
          message: `Failed two-factor attempt for ${user.username}`,
          ipAddress,
          userAgent,
        });
        throw ApiException.unauthorized('Invalid verification code');
      }
      this.audit.record({
        userId: user.id,
        action: 'LOGIN_RECOVERY',
        module: 'AUTH',
        entity: 'User',
        entityId: user.id,
        message: `User ${user.username} logged in with a recovery code`,
        ipAddress,
        userAgent,
      });
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
      message: `User ${user.username} logged in with two-factor verification`,
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
      return; // already invalid Ã¢â‚¬â€ nothing to revoke
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

  /**
   * Starts two-factor setup: verifies the password, generates a fresh TOTP
   * secret and returns it with the otpauth URL and QR code. The secret is
   * stored immediately (but not yet enabled) so the enable step can verify the
   * code without the client sending the secret back.
   */
  async setupTwoFactor(userId: string, password: string) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) {
      throw ApiException.notFound('User');
    }
    if (user.twoFactorEnabled) {
      throw ApiException.conflict('Two-factor authentication is already enabled');
    }

    const valid = await argon2.verify(user.passwordHash, password).catch(() => false);
    if (!valid) {
      throw ApiException.unauthorized('Current password is incorrect');
    }

    const secret = generateSecret();
    await this.prisma.user.update({
      where: { id: user.id },
      data: { twoFactorSecret: secret, twoFactorEnabled: false, twoFactorRecoveryCodes: undefined },
    });

    const issuerSetting = await this.prisma.systemSetting.findFirst({ where: { key: 'mfa.issuer' } });
    const issuer = issuerSetting?.value?.trim() || 'HasERP';
    const otpauthUrl = generateURI({ issuer, label: user.username, secret });
    const qrDataUrl = await toQrDataURL(otpauthUrl, { width: 220, margin: 1 });

    return { secret, otpauthUrl, qrDataUrl, username: user.username, issuer };
  }

  /** Confirms setup with a TOTP code, enables 2FA and issues recovery codes. */
  async enableTwoFactor(userId: string, token: string) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) {
      throw ApiException.notFound('User');
    }
    if (user.twoFactorEnabled) {
      throw ApiException.conflict('Two-factor authentication is already enabled');
    }
    if (!user.twoFactorSecret) {
      throw ApiException.invalidTransaction('Start the setup first to obtain a secret');
    }

    if (
      !/^\d{6}$/.test(token) ||
      !(await verifyOtp({ token, secret: user.twoFactorSecret, epochTolerance: 30 }).catch(() => ({ valid: false }))).valid
    ) {
      throw ApiException.unauthorized('Invalid verification code. Check the code in your authenticator app.');
    }

    const recoveryCodes = Array.from({ length: 10 }, () => this.newRecoveryCode());
    const hashes = recoveryCodes.map((c) => this.hashRecoveryCode(c));

    await this.prisma.user.update({
      where: { id: user.id },
      data: { twoFactorEnabled: true, twoFactorRecoveryCodes: hashes },
    });

    this.audit.record({
      userId: user.id,
      action: 'TWO_FACTOR_ENABLED',
      module: 'AUTH',
      entity: 'User',
      entityId: user.id,
      message: `Two-factor authentication enabled for ${user.username}`,
    });

    return { recoveryCodes };
  }

  /** Generates a fresh set of recovery codes after a valid TOTP code. */
  async regenerateRecoveryCodes(userId: string, token: string) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) {
      throw ApiException.notFound('User');
    }
    if (!user.twoFactorEnabled || !user.twoFactorSecret) {
      throw ApiException.conflict('Two-factor authentication is not enabled');
    }

    if (
      !/^\d{6}$/.test(token) ||
      !(await verifyOtp({ token, secret: user.twoFactorSecret, epochTolerance: 30 }).catch(() => ({ valid: false }))).valid
    ) {
      throw ApiException.unauthorized('Invalid verification code');
    }

    const recoveryCodes = Array.from({ length: 10 }, () => this.newRecoveryCode());
    const hashes = recoveryCodes.map((c) => this.hashRecoveryCode(c));

    await this.prisma.user.update({
      where: { id: user.id },
      data: { twoFactorRecoveryCodes: hashes },
    });

    this.audit.record({
      userId: user.id,
      action: 'TWO_FACTOR_RECOVERY_CODES_REGENERATED',
      module: 'AUTH',
      entity: 'User',
      entityId: user.id,
      message: `Recovery codes regenerated for ${user.username}`,
    });

    return { recoveryCodes };
  }

  /** Disables 2FA after a valid TOTP code. */
  async disableTwoFactor(userId: string, token: string) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) {
      throw ApiException.notFound('User');
    }
    if (!user.twoFactorEnabled || !user.twoFactorSecret) {
      throw ApiException.conflict('Two-factor authentication is not enabled');
    }

    if (
      !/^\d{6}$/.test(token) ||
      !(await verifyOtp({ token, secret: user.twoFactorSecret, epochTolerance: 30 }).catch(() => ({ valid: false }))).valid
    ) {
      throw ApiException.unauthorized('Invalid verification code');
    }

    await this.prisma.user.update({
      where: { id: user.id },
      data: { twoFactorEnabled: false, twoFactorSecret: null, twoFactorRecoveryCodes: Prisma.DbNull },
    });

    this.audit.record({
      userId: user.id,
      action: 'TWO_FACTOR_DISABLED',
      module: 'AUTH',
      entity: 'User',
      entityId: user.id,
      message: `Two-factor authentication disabled for ${user.username}`,
    });

    return { message: 'Two-factor authentication disabled' };
  }

  async twoFactorStatus(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { twoFactorEnabled: true, twoFactorSecret: true, twoFactorRecoveryCodes: true },
    });
    if (!user) {
      throw ApiException.notFound('User');
    }
    const codes = user.twoFactorRecoveryCodes as string[] | null;
    return {
      enabled: user.twoFactorEnabled,
      secretConfigured: !!user.twoFactorSecret,
      recoveryCodesRemaining: Array.isArray(codes) ? codes.length : 0,
    };
  }

  /** Consumes a recovery code if it matches; returns true when one was used. */
  private async consumeRecoveryCode(userId: string, token: string): Promise<boolean> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { twoFactorRecoveryCodes: true },
    });
    const codes = (user?.twoFactorRecoveryCodes as string[] | null) ?? [];
    if (!Array.isArray(codes) || codes.length === 0) return false;

    const hash = this.hashRecoveryCode(token);
    if (!codes.includes(hash)) return false;

    await this.prisma.user.update({
      where: { id: userId },
      data: { twoFactorRecoveryCodes: codes.filter((c) => c !== hash) },
    });
    return true;
  }

  private newRecoveryCode(): string {
    const part = () => randomBytes(3).toString('hex').toUpperCase();
    return `${part()}-${part()}-${part()}-${part()}`;
  }

  private hashRecoveryCode(code: string): string {
    return createHash('sha256').update(code.trim().replace(/\s+/g, '').toUpperCase()).digest('hex');
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

