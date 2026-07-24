import { Module } from '@nestjs/common';
import { TaskSetsService } from './task-sets.service';
import { TaskSetsController } from './task-sets.controller';
import { AssignmentsModule } from '../assignments/assignments.module';

@Module({
  imports: [AssignmentsModule],
  controllers: [TaskSetsController],
  providers: [TaskSetsService],
})
export class TaskSetsModule {}
