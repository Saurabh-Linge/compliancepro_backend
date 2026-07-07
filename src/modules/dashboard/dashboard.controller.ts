import { Controller, Get, Req } from '@nestjs/common';
import { DashboardService } from './dashboard.service';
import type { FastifyRequest } from 'fastify';

@Controller('dashboard')
export class DashboardController {
  constructor(private readonly dashboardService: DashboardService) {}

  @Get('stats')
  async getStats(@Req() req: FastifyRequest) {
    const user = (req as any).user;
    return this.dashboardService.getStats(user);
  }
}
