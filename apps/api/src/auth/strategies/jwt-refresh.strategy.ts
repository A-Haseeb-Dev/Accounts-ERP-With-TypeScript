import { ExtractJwt, Strategy } from 'passport-jwt';
import { PassportStrategy } from '@nestjs/passport';
import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../prisma/prisma.service';
import { JwtRefreshPayload } from '../interfaces/jwt-payload.interface';

@Injectable()
export class JwtRefreshStrategy extends PassportStrategy(Strategy, 'jwt-refresh') {
  constructor(
    config: ConfigService,
    private readonly prisma: PrismaService,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromExtractors([
        (request: any) => request?.cookies?.refresh_token ?? null,
      ]),
      ignoreExpiration: false,
      secretOrKey: config.get<string>('JWT_REFRESH_SECRET', 'has-erp-refresh-secret'),
    });
  }

  async validate(payload: JwtRefreshPayload) {
    const user = await this.prisma.user.findUnique({
      where: { id: payload.id },
      include: { roles: { include: { role: true } } },
    });

    if (!user || user.status !== 'active') {
      throw new UnauthorizedException('User is not active');
    }

    return { id: user.id, username: user.username, fullName: user.fullName, roles: user.roles.map(r => r.role.name) };
  }
}