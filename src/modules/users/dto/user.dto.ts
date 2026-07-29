import { IsString, IsOptional, IsBoolean, IsNumber, IsArray } from 'class-validator';

export class CreateUserDto {
  @IsString()
  username: string;

  @IsOptional()
  @IsString()
  password?: string;

  @IsString()
  full_name: string;

  @IsOptional()
  @IsString()
  email?: string;

  @IsOptional()
  @IsString()
  mobile_number?: string;

  @IsString()
  role: string;

  @IsOptional()
  @IsNumber()
  branch_id?: number;

  @IsOptional()
  @IsArray()
  managed_branch_ids?: number[];

  @IsOptional()
  @IsBoolean()
  is_active?: boolean;
}

export class UpdateUserDto {
  @IsOptional()
  @IsString()
  username?: string;

  @IsOptional()
  @IsString()
  password?: string;

  @IsOptional()
  @IsString()
  full_name?: string;

  @IsOptional()
  @IsString()
  email?: string;

  @IsOptional()
  @IsString()
  mobile_number?: string;

  @IsOptional()
  @IsString()
  role?: string;

  @IsOptional()
  @IsNumber()
  branch_id?: number;

  @IsOptional()
  @IsArray()
  managed_branch_ids?: number[];

  @IsOptional()
  @IsBoolean()
  is_active?: boolean;
}
