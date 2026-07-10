import { Controller, Get, Req, Header } from '@nestjs/common';
import { DashboardService } from './dashboard.service';
import type { FastifyRequest } from 'fastify';

@Controller('dashboard')
export class DashboardController {
  constructor(private readonly dashboardService: DashboardService) {}

  @Get('stats')
  @Header('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate')
  @Header('Pragma', 'no-cache')
  @Header('Expires', '0')
  async getStats(@Req() req: FastifyRequest) {
    const user = (req as any).user;
    return this.dashboardService.getStats(user);
  }
}
