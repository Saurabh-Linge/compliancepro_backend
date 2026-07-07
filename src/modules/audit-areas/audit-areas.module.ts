import { Module } from '@nestjs/common';
import { AuditAreasController } from './audit-areas.controller';
import { AuditAreasService } from './audit-areas.service';

@Module({
  controllers: [AuditAreasController],
  providers: [AuditAreasService],
  exports: [AuditAreasService],
})
export class AuditAreasModule {}
