import { Body, Controller, Get, HttpCode, HttpStatus, Post, Req, Res } from '@nestjs/common';
import { Request, Response } from 'express';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { AuthService } from './auth.service';
import {
  LoginDto,
  RefreshDto,
  TwoFactorDisableDto,
  TwoFactorEnableDto,
  TwoFactorSetupDto,
  TwoFactorVerifyDto,
} from './dto/auth.dto';
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
    const result = await this.authService.login(dto, ip, ua);
    if ('twoFactorRequired' in result) {
      return {
        twoFactorRequired: true,
        pendingToken: result.pendingToken,
        user: result.user,
        message: 'Two-factor verification required',
      };
    }
    this.authService.setAuthCookies(res, result);
    return {
      accessToken: result.accessToken,
      refreshToken: result.refreshToken,
      user: result.user,
      message: 'Login successful',
    };
  }

  @Public()
  @Throttle({ default: { limit: 5, ttl: 15 * 60_000 } })
  @Post('two-factor/verify')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Verify the second factor to complete a 2FA login' })
  async verifyTwoFactor(
    @Body() dto: TwoFactorVerifyDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const tokens = await this.authService.verifyMfaChallenge(
      dto.pendingToken,
      dto.token,
      req.ip,
      req.get('user-agent'),
    );
    this.authService.setAuthCookies(res, tokens);
    return {
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken,
      user: tokens.user,
      message: 'Login successful',
    };
  }

  @Post('two-factor/setup')
  @HttpCode(HttpStatus.OK)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Start two-factor setup (returns TOTP secret + QR code)' })
  async setupTwoFactor(
    @Body() dto: TwoFactorSetupDto,
    @CurrentUser() user: Record<string, unknown>,
  ) {
    return this.authService.setupTwoFactor(user.id as string, dto.password);
  }

  @Post('two-factor/enable')
  @HttpCode(HttpStatus.OK)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Confirm setup with a TOTP code and enable 2FA' })
  async enableTwoFactor(
    @Body() dto: TwoFactorEnableDto,
    @CurrentUser() user: Record<string, unknown>,
  ) {
    return this.authService.enableTwoFactor(user.id as string, dto.token);
  }

  @Post('two-factor/disable')
  @HttpCode(HttpStatus.OK)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Disable two-factor authentication with a TOTP code' })
  async disableTwoFactor(
    @Body() dto: TwoFactorDisableDto,
    @CurrentUser() user: Record<string, unknown>,
  ) {
    return this.authService.disableTwoFactor(user.id as string, dto.token);
  }

  @Get('two-factor/status')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get the current user two-factor status' })
  twoFactorStatus(@CurrentUser() user: Record<string, unknown>) {
    return this.authService.twoFactorStatus(user.id as string);
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