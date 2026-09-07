import { Global, Module } from '@nestjs/common';
import { AuditService } from './audit.service';
import { AuditController } from './audit.controller';
import { AuditCleanupService } from './audit-cleanup.service';

@Global()
@Module({
  providers: [AuditService, AuditCleanupService],
  exports: [AuditService],
  controllers: [AuditController],
})
export class AuditModule {}