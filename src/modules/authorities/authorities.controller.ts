import { Controller, Get, Post, Body, Patch, Param, Delete } from '@nestjs/common';
import { AuthoritiesService } from './authorities.service';
import { CreateAuthorityDto } from './dto/create-authority.dto';
import { UpdateAuthorityDto } from './dto/update-authority.dto';

@Controller('authorities')
export class AuthoritiesController {
  constructor(private readonly authoritiesService: AuthoritiesService) {}

  @Post()
  create(@Body() createAuthorityDto: CreateAuthorityDto) {
    return this.authoritiesService.create(createAuthorityDto);
  }

  @Get()
  findAll() {
    return this.authoritiesService.findAll();
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.authoritiesService.findOne(+id);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() updateAuthorityDto: UpdateAuthorityDto) {
    return this.authoritiesService.update(+id, updateAuthorityDto);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.authoritiesService.remove(+id);
  }
}
