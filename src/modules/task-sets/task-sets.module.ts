import { Module } from '@nestjs/common';
import { TaskSetsService } from './task-sets.service';
import { TaskSetsController } from './task-sets.controller';

@Module({
  controllers: [TaskSetsController],
  providers: [TaskSetsService],
})
export class TaskSetsModule {}
