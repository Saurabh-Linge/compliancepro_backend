import { IsString, IsOptional, IsNotEmpty } from 'class-validator';

export class CreateAuthorityDto {
  @IsString()
  @IsNotEmpty()
  name: string;

  @IsString()
  @IsOptional()
  source_url?: string;
}
