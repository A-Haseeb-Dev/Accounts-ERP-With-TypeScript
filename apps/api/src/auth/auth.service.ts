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

    const valid = await argon2.verify(user.passwordHash, dto.password).catch(() => false);
    if (!valid) {
      throw ApiException.unauthorized('Invalid username or password');
    }

    await this.prisma.user.update({
      where: { id: user.id },
      data: { lastLoginAt: new Date() },
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

    return this.buildAuthResponse(user.id, user.username, user.fullName, user.organizationId, {
      id: user.id,
      fullName: user.fullName,
      username: user.username,
      email: user.email,
      phone: user.phone,
      roles,
      permissions,
    });
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

    return this.buildAuthResponse(user.id, user.username, user.fullName, user.organizationId);
  }

  private buildAuthResponse(
    userId: string,
    username: string,
    fullName: string,
    organizationId: string,
    extra: Record<string, unknown> = {},
  ) {
    const accessPayload: JwtPayload = { id: userId, username, fullName, organizationId };
    const refreshPayload: JwtRefreshPayload = { id: userId, tokenVersion: 1 };

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