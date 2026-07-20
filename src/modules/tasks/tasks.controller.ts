import { Controller, Get, Post, Patch, Put, Param, Body, ParseIntPipe, Query } from '@nestjs/common';
import { TasksService } from './tasks.service';
import { AiService } from '../../core/ai/ai.service';

@Controller('tasks')
export class TasksController {
  constructor(
    private readonly tasksService: TasksService,
    private readonly aiService: AiService,
  ) {}

  @Get('stats')
  async getStats(@Query('circular_id') circularId?: string) {
    return this.tasksService.getStats(circularId ? parseInt(circularId, 10) : undefined);
  }

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

  @Post('extract-from-text')
  async extractFromText(@Body('text') text: string) {
    const tasks = await this.aiService.extractTasksFromChatText(text);
    return { tasks };
  }

  @Post('bulk')
  async createBulk(
    @Body('circular_id', ParseIntPipe) circularId: number,
    @Body('tasks') tasks: { description: string }[],
  ) {
    return this.tasksService.createBulk(circularId, tasks);
  }
}
