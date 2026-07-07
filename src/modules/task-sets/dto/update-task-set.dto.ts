import { PartialType } from '@nestjs/mapped-types';
import { CreateTaskSetDto } from './create-task-set.dto';

export class UpdateTaskSetDto extends PartialType(CreateTaskSetDto) {}
