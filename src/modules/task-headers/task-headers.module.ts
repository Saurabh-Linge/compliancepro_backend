import { Module } from '@nestjs/common';
import { TaskHeadersService } from './task-headers.service';
import { TaskHeadersController } from './task-headers.controller';

@Module({
  controllers: [TaskHeadersController],
  providers: [TaskHeadersService],
  exports: [TaskHeadersService]
})
export class TaskHeadersModule {}
