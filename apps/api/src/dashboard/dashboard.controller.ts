import { Controller, Get, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { DashboardService } from './dashboard.service';
import { Permissions } from '../auth/decorators/permissions.decorator';

@ApiTags('Dashboard')
@ApiBearerAuth()
@Controller('dashboard')
export class DashboardController {
  constructor(private readonly service: DashboardService) {}

  @Get()
  @Permissions('dashboard.view')
  @ApiOperation({ summary: 'Dashboard KPIs' })
  overview() {
    return this.service.overview();
  }

  @Get('sales-trend')
  @Permissions('dashboard.view')
  @ApiOperation({ summary: 'Sales vs purchase trend' })
  salesTrend(@Query('days') days = '14') {
    return this.service.salesTrend(Number(days));
  }
}