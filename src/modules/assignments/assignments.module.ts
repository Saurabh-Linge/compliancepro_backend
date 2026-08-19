import { Module } from '@nestjs/common';
import { AssignmentsService } from './assignments.service';
import { AssignmentsController } from './assignments.controller';
import { AssignmentsSchedulerService } from './assignments-scheduler.service';
import { HolidaysModule } from '../holidays/holidays.module';

@Module({
  imports: [HolidaysModule],
  controllers: [AssignmentsController],
  providers: [AssignmentsService, AssignmentsSchedulerService],
  exports: [AssignmentsService, AssignmentsSchedulerService]
})
export class AssignmentsModule {}

