import { Controller, Get, Post, Put, Delete, Body, Param } from '@nestjs/common';
import { TaskHeadersService } from './task-headers.service';

@Controller('task-headers')
export class TaskHeadersController {
  constructor(private readonly taskHeadersService: TaskHeadersService) {}

  @Get()
  findAll() {
    return this.taskHeadersService.findAll();
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.taskHeadersService.findOne(+id);
  }

  @Post()
  create(@Body('name') name: string) {
    return this.taskHeadersService.create(name);
  }

  @Put(':id')
  update(@Param('id') id: string, @Body('name') name: string) {
    return this.taskHeadersService.update(+id, name);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.taskHeadersService.remove(+id);
  }
}
