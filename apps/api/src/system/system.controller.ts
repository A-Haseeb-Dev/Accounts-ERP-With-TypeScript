import { Body, Controller, Get, Patch } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { SystemService } from './system.service';
import { UpdateBrandingDto, UpdateSettingsDto } from './dto/system.dto';
import { Permissions } from '../auth/decorators/permissions.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';

@ApiTags('System')
@ApiBearerAuth()
@Controller('system')
export class SystemController {
  constructor(private readonly service: SystemService) {}

  @Get('branding')
  @ApiOperation({ summary: 'Get branding configuration' })
  getBranding() {
    return this.service.getBranding();
  }

  @Patch('branding')
  @Permissions('system.branding.manage')
  @ApiOperation({ summary: 'Update branding configuration' })
  updateBranding(@Body() dto: UpdateBrandingDto, @CurrentUser() actor: any) {
    return this.service.updateBranding(dto, actor?.id);
  }

  @Get('settings')
  @ApiOperation({ summary: 'Get system settings' })
  getSettings() {
    return this.service.getSettings();
  }

  @Patch('settings')
  @Permissions('system.settings.manage')
  @ApiOperation({ summary: 'Update system settings' })
  updateSettings(@Body() dto: UpdateSettingsDto, @CurrentUser() actor: any) {
    return this.service.updateSettings(dto, actor?.id);
  }
}