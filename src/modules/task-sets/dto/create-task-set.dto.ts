import { IsString, IsOptional, IsArray, IsNumber, IsDateString } from 'class-validator';

export class CreateTaskSetDto {
  @IsString()
  name: string;

  @IsOptional()
  @IsDateString()
  default_due_date?: Date;

  @IsOptional()
  @IsDateString()
  start_date?: Date;

  @IsOptional()
  @IsDateString()
  end_date?: Date;

  @IsOptional()
  @IsString()
  frequency?: string;

  @IsOptional()
  @IsDateString()
  reporting_date?: Date;

  @IsOptional()
  @IsArray()
  @IsNumber({}, { each: true })
  taskIds?: number[];
}
