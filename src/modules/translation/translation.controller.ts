import { Controller, Post, Body, Get, Query } from '@nestjs/common';
import { TranslationService } from './translation.service';
import { Public } from '../../core/auth/public.decorator';

@Controller('translate')
export class TranslationController {
  constructor(private readonly translationService: TranslationService) {}

  @Post()
  async translate(
    @Body() body: { text: string | string[]; source: string; target: string },
  ) {
    return this.translationService.translate(body.text, body.source, body.target);
  }

  @Public()
  @Get('all')
  async getAllTranslations(@Query('target') target: string) {
    return this.translationService.getAllTranslations(target);
  }
}
