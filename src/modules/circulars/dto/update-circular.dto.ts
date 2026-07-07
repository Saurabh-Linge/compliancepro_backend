import { PartialType } from '@nestjs/mapped-types';
import { CreateCircularDto } from './create-circular.dto';

export class UpdateCircularDto extends PartialType(CreateCircularDto) {}
