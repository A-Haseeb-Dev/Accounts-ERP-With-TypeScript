import { ExtractJwt, Strategy } from 'passport-jwt';
import { PassportStrategy } from '@nestjs/passport';
import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../prisma/prisma.service';
import { JwtPayload } from '../interfaces/jwt-payload.interface';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy, 'jwt') {
  constructor(
    config: ConfigService,
    private readonly prisma: PrismaService,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromExtractors([
        (request: any) => {
          let token = request?.cookies?.access_token ?? null;
          if (!token && request?.headers?.authorization?.startsWith('Bearer ')) {
            token = request.headers.authorization.split(' ')[1];
          }
          return token;
        },
      ]),
      ignoreExpiration: false,
      secretOrKey: config.get<string>('JWT_ACCESS_SECRET', 'has-erp-access-secret'),
    });
  }

  async validate(payload: JwtPayload) {
    // The MFA challenge token is signed with the SAME secret as the access token
    // so it must never be usable as one. Without this check a password-only
    // login (2FA enabled) yields a working bearer token, bypassing 2FA.
    if ((payload as unknown as Record<string, unknown>).purpose) {
      throw new UnauthorizedException('Two-factor challenge token cannot be used to authenticate');
    }

    const user = await this.prisma.user.findUnique({
      where: { id: payload.id },
      include: {
        roles: {
          include: {
            role: {
              include: {
                permissions: { include: { permission: true } },
              },
            },
          },
        },
      },
    });

    if (!user || user.status !== 'active') {
      throw new UnauthorizedException('User is not active');
    }

    const roles = user.roles.map((r) => r.role.name);
    const permissions = user.roles.flatMap((r) =>
      r.role.permissions.map((p) => p.permission.name),
    );

    return {
      id: user.id,
      username: user.username,
      fullName: user.fullName,
      organizationId: user.organizationId,
      roles,
      permissions,
    };
  }
}