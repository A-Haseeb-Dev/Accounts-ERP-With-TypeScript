import { Body, Controller, Get, HttpCode, HttpStatus, Post, Req, Res } from '@nestjs/common';
import { Request, Response } from 'express';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { AuthService } from './auth.service';
import { LoginDto, RefreshDto } from './dto/auth.dto';
import { Public } from './decorators/public.decorator';
import { CurrentUser } from './decorators/current-user.decorator';
import { ApiException } from '../common/exceptions/api.exception';
import { ChangePasswordDto } from '../users/dto/users.dto';

@ApiTags('Authentication')
@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Public()
  @Throttle({ default: { limit: 5, ttl: 15 * 60_000 } })
  @Post('login')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Login with username and password' })
  async login(
    @Body() dto: LoginDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const ip = req.ip ?? undefined;
    const ua = req.get('user-agent');
    const tokens = await this.authService.login(dto, ip, ua);
    this.authService.setAuthCookies(res, tokens);
    return {
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken,
      user: tokens.user,
      message: 'Login successful',
    };
  }

  @Public()
  @Throttle({ default: { limit: 10, ttl: 15 * 60_000 } })
  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Refresh access token using refresh token cookie' })
  async refresh(
    @Body() dto: RefreshDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const refreshToken = dto.refreshToken ?? (req.cookies?.refresh_token as string | undefined);
    if (!refreshToken) {
      throw ApiException.unauthorized('Refresh token missing');
    }
    const tokens = await this.authService.refresh(refreshToken, req.ip, req.get('user-agent'));
    this.authService.setAuthCookies(res, tokens);
    return { accessToken: tokens.accessToken, refreshToken: tokens.refreshToken, message: 'Token refreshed' };
  }

  @Public()
  @Post('logout')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Logout and clear auth cookies, revoking all refresh tokens' })
  async logout(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
    const refreshToken = (req.cookies?.refresh_token as string | undefined) ?? undefined;
    if (refreshToken) {
      await this.authService.revokeByRefreshToken(refreshToken);
    }
    this.authService.clearAuthCookies(res);
    return { message: 'Logged out successfully' };
  }

  @Post('change-password')
  @HttpCode(HttpStatus.OK)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Change own password (revokes other sessions)' })
  async changePassword(
    @Body() dto: ChangePasswordDto,
    @CurrentUser() user: Record<string, unknown>,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const tokens = await this.authService.changePassword(
      user.id as string,
      dto.currentPassword,
      dto.newPassword,
      req.ip,
      req.get('user-agent'),
    );
    this.authService.setAuthCookies(res, tokens);
    return { accessToken: tokens.accessToken, refreshToken: tokens.refreshToken, user: tokens.user };
  }

  @Get('me')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get current authenticated user' })
  me(@CurrentUser() user: Record<string, unknown>) {
    return user;
  }
}