import { Controller, Get, Post, Body, Patch, Param, Delete } from '@nestjs/common';
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
