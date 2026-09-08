import { Body, Controller, Get, Patch } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { FeaturesService } from './features.service';
import { UpdateFeatureDto } from './dto/update-feature.dto';
import { Permissions } from '../auth/decorators/permissions.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { ApiException } from '../common/exceptions/api.exception';

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
  @ApiOperation({ summary: 'Enable/disable a company feature (Developer role only)' })
  async setFeature(@Body() dto: UpdateFeatureDto, @CurrentUser() actor: any) {
    // Deliberately stricter than a normal permission: feature switches are only
    // ever controllable by the Developer role, never by Super Admin or others.
    if (!actor?.roles?.includes('Developer')) {
      throw ApiException.forbidden('Only the Developer role can change company features');
    }
    return this.features.setEnabled(dto.code, dto.enabled, actor?.id);
  }
}