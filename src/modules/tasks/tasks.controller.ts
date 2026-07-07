import { Controller, Get, Post, Patch, Put, Param, Body, ParseIntPipe, Query } from '@nestjs/common';
import { TasksService } from './tasks.service';

@Controller('tasks')
export class TasksController {
  constructor(private readonly tasksService: TasksService) {}

  @Get()
  async getTasks(
    @Query('page') page: string = '1',
    @Query('limit') limit: string = '10',
    @Query('status') status?: string,
    @Query('circular_id') circularId?: string,
    @Query('search') search?: string,
  ) {
    return this.tasksService.findAllPaginated({
      page: parseInt(page, 10),
      limit: parseInt(limit, 10),
      status,
      circularId: circularId ? parseInt(circularId, 10) : undefined,
      search,
    });
  }

  @Patch(':id/approve')
  approveTask(@Param('id', ParseIntPipe) id: number) {
    return this.tasksService.approve(id);
  }

  @Post('manual')
  createManualTask(
    @Body('description') description: string,
    @Body('circular_id', ParseIntPipe) circularId: number,
    @Body('header_id') headerId?: number,
    @Body('priority') priority?: string,
    @Body('risk_category') riskCategory?: string,
    @Body('business_risk') businessRisk?: string,
    @Body('control_risk') controlRisk?: string,
    @Body('audit_area_id') auditAreaId?: number
  ) {
    return this.tasksService.createManual(description, circularId, headerId, priority, riskCategory, businessRisk, controlRisk, auditAreaId);
  }

  @Put(':id')
  updateTask(
    @Param('id', ParseIntPipe) id: number, 
    @Body('description') description: string,
    @Body('header_id') headerId?: number,
    @Body('priority') priority?: string,
    @Body('risk_category') riskCategory?: string,
    @Body('business_risk') businessRisk?: string,
    @Body('control_risk') controlRisk?: string,
    @Body('audit_area_id') auditAreaId?: number
  ) {
    return this.tasksService.update(id, description, headerId, priority, riskCategory, businessRisk, controlRisk, auditAreaId);
  }
}
