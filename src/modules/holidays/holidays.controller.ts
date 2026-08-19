import { Controller, Get, Post, Delete, Param, Body, Query } from '@nestjs/common';
import { HolidaysService } from './holidays.service';

@Controller('holidays')
export class HolidaysController {
  constructor(private readonly holidaysService: HolidaysService) {}

  @Get()
  async getHolidays(@Query('year') year?: string, @Query('month') month?: string) {
    return this.holidaysService.getHolidays(year ? parseInt(year, 10) : undefined, month ? parseInt(month, 10) : undefined);
  }

  @Post()
  async addHoliday(@Body() body: { date: string; name: string }) {
    return this.holidaysService.addHoliday(body.date, body.name);
  }

  @Delete(':id')
  async deleteHoliday(@Param('id') id: string) {
    return this.holidaysService.deleteHoliday(parseInt(id, 10));
  }
}
