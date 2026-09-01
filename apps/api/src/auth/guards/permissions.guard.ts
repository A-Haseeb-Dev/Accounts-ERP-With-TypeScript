import {
  CanActivate,
  ExecutionContext,
  Injectable,
  Logger,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import { PrismaService } from '../../prisma/prisma.service';
import { ApiException } from '../../common/exceptions/api.exception';
import { REQUIRED_PERMISSIONS_KEY } from '../decorators/permissions.decorator';
import { JwtPayload } from '../interfaces/jwt-payload.interface';

/**
 * Guards routes by requiring any/all of the declared permission(s).
 * Annotated with @Permissions('sales.invoice.view', '...') with mode ALL.
 */
@Injectable()
export class PermissionsGuard implements CanActivate {
  private readonly logger = new Logger(PermissionsGuard.name);

  constructor(
    private readonly reflector: Reflector,
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const required = this.reflector.getAllAndOverride<string[]>(REQUIRED_PERMISSIONS_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    // Filter routes only: if a single business rule requires a deeper check it
    // is enforced inside the service layer as well (defense in depth).
    if (!required || required.length === 0) {
      return true;
    }

    const request = context.switchToHttp().getRequest();
    const user = request.user as JwtPayload | undefined;

    if (!user) {
      throw ApiException.unauthorized();
    }

    // Developer role bypasses all permission checks.
    const isDeveloper = await this.isDeveloperRole(user.id);
    if (isDeveloper) {
      return true;
    }

    const permissions = await this.prisma.rolePermission.findMany({
      where: {
        role: {
          users: { some: { userId: user.id } },
        },
      },
      select: { permission: { select: { name: true } } },
    });

    const owned = new Set(permissions.map((p) => p.permission.name));
    const missing = required.filter((perm) => !owned.has(perm));

    if (missing.length > 0) {
      this.logger.warn(
        `User ${user.id} denied on ${required.join(', ')} (missing: ${missing.join(', ')})`,
      );
      throw ApiException.forbidden();
    }

    return true;
  }

  private async isDeveloperRole(userId: string): Promise<boolean> {
    const role = await this.prisma.userRole.findFirst({
      where: { userId, role: { name: 'Developer' } },
    });
    return !!role;
  }
}