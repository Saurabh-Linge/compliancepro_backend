import { Controller, Get } from '@nestjs/common';
import { AuditAreasService } from './audit-areas.service';

@Controller('audit-areas')
export class AuditAreasController {
  constructor(private readonly auditAreasService: AuditAreasService) {}

  @Get()
  getAll() {
    return this.auditAreasService.findAll();
  }
}
