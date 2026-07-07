import { Module } from '@nestjs/common';
import { ScraperService } from './scraper.service';
import { CircularsModule } from '../circulars/circulars.module';
import { DatabaseModule } from '../../core/database/database.module';

@Module({
  imports: [CircularsModule, DatabaseModule],
  providers: [ScraperService],
})
export class ScraperModule {}
