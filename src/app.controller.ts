import { Controller, Get } from '@nestjs/common';
import { AppService } from './app.service';
import { Public } from './core/auth/public.decorator';

@Controller()
export class AppController {
  constructor(private readonly appService: AppService) {}

  @Get()
  @Public()
  async getHello() {
    return this.appService.getHello();
  }
}
