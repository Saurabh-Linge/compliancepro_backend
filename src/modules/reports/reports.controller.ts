import { Controller, Get, Param, Query, Header } from '@nestjs/common';
import { ReportsService } from './reports.service';

@Controller('reports')
export class ReportsController {
  constructor(private readonly reportsService: ReportsService) {}

  @Get(':reportSlug/definition')
  @Header('Cache-Control', 'no-store')
  getReportDefinition(
    @Param('reportSlug') reportSlug: string,
  ) {
    return this.reportsService.getReportDefinition(reportSlug);
  }

  @Get(':reportSlug/data')
  @Header('Cache-Control', 'no-store')
  getReportData(
    @Param('reportSlug') reportSlug: string,
    @Query() query: any,
  ) {
    return this.reportsService.getReportData(reportSlug, query);
  }
}
