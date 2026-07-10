import { Module } from '@nestjs/common';
import { AssignmentsService } from './assignments.service';
import { AssignmentsController } from './assignments.controller';
import { AssignmentsSchedulerService } from './assignments-scheduler.service';

@Module({
  controllers: [AssignmentsController],
  providers: [AssignmentsService, AssignmentsSchedulerService],
})
export class AssignmentsModule {}

