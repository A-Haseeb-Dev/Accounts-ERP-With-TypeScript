import { Body, Controller, Get, Patch } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { FeaturesService } from './features.service';
import { UpdateFeatureDto, UpdateFeaturesDto } from './dto/update-feature.dto';
import { Permissions } from '../auth/decorators/permissions.decorator';
import { SystemAdmin } from '../auth/decorators/system-admin.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';

@ApiTags('System')
@ApiBearerAuth()
@Controller('system/features')
export class FeaturesController {
  constructor(private readonly features: FeaturesService) {}

  @Get()
  @ApiOperation({ summary: 'Get company feature switch states' })
  getFeatures() {
    return this.features.getState();
  }

  @Patch()
  @Permissions('system.features.manage')
  @SystemAdmin()
  @ApiOperation({ summary: 'Enable/disable a company feature (Developer/Super Admin only)' })
  async setFeature(@Body() dto: UpdateFeatureDto, @CurrentUser() actor: any) {
    return this.features.setEnabled(dto.code, dto.enabled, actor?.id);
  }

  @Patch('bulk')
  @Permissions('system.features.manage')
  @SystemAdmin()
  @ApiOperation({ summary: 'Enable/disable many company features (Developer/Super Admin only)' })
  async setFeatures(@Body() dto: UpdateFeaturesDto, @CurrentUser() actor: any) {
    return this.features.setManyEnabled(dto.codes, dto.enabled, actor?.id);
  }
}