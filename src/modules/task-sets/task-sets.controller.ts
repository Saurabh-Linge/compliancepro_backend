import { Controller, Get, Post, Body, Patch, Param, Delete, Req, BadRequestException } from '@nestjs/common';
import type { FastifyRequest } from 'fastify';
import { TaskSetsService } from './task-sets.service';
import { CreateTaskSetDto } from './dto/create-task-set.dto';
import { UpdateTaskSetDto } from './dto/update-task-set.dto';

@Controller('task-sets')
export class TaskSetsController {
  constructor(private readonly taskSetsService: TaskSetsService) {}

  @Post()
  create(@Body() createTaskSetDto: CreateTaskSetDto) {
    return this.taskSetsService.create(createTaskSetDto);
  }

  /**
   * POST /task-sets/bulk-upload
   * Accepts a multipart/form-data request with a single file field named "file".
   * Parses the XLSX sheet and creates one Internal Task Set per unique set_name.
   */
  @Post('bulk-upload')
  async bulkUpload(@Req() req: FastifyRequest) {
    const fastifyReq = req as any;
    if (typeof fastifyReq.isMultipart !== 'function' || !fastifyReq.isMultipart()) {
      throw new BadRequestException('Request must be multipart/form-data');
    }
    const part = await fastifyReq.file();
    if (!part) {
      throw new BadRequestException('No file uploaded');
    }
    // Read stream into a buffer
    const chunks: Buffer[] = [];
    for await (const chunk of part.file) {
      chunks.push(chunk);
    }
    const buffer = Buffer.concat(chunks);
    return this.taskSetsService.processBulkUpload(buffer);
  }

  @Get()
  findAll() {
    return this.taskSetsService.findAll();
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.taskSetsService.findOne(+id);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() updateTaskSetDto: UpdateTaskSetDto) {
    return this.taskSetsService.update(+id, updateTaskSetDto);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.taskSetsService.remove(+id);
  }

  @Post(':id/tasks')
  mapTasks(
    @Param('id') id: string,
    @Body('taskIds') taskIds: number[],
    @Body('taskTimelines') taskTimelines?: { task_id: number; due_date: string | null }[]
  ) {
    return this.taskSetsService.mapTasks(+id, taskIds, taskTimelines);
  }

  @Post(':id/branches')
  mapBranches(@Param('id') id: string, @Body('branchIds') branchIds: number[]) {
    return this.taskSetsService.mapBranches(+id, branchIds);
  }

  @Post(':id/reopen')
  reopen(@Param('id') id: string) {
    return this.taskSetsService.reopen(+id);
  }
}
