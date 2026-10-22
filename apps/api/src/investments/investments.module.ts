import { Module } from '@nestjs/common';
import { InvestorsController, InvestmentsController } from './investments.controller';
import { InvestorsService } from './investors.service';
import { InvestmentsService } from './investments.service';

@Module({
  controllers: [InvestorsController, InvestmentsController],
  providers: [InvestorsService, InvestmentsService],
  exports: [InvestorsService, InvestmentsService],
})
export class InvestmentsModule {}
