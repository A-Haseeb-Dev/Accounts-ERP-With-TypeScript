import { Module } from '@nestjs/common';
import { VouchersService } from './vouchers.service';
import { VouchersController } from './vouchers.controller';
import { PaymentsService } from './payments.service';
import { PaymentsController } from './payments.controller';

@Module({
  controllers: [VouchersController, PaymentsController],
  providers: [VouchersService, PaymentsService],
  exports: [VouchersService, PaymentsService],
})
export class AccountsModule {}