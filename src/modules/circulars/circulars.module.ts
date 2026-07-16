import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { CircularsService } from './circulars.service';
import { CircularsController } from './circulars.controller';
import { CircularsProcessor } from './circulars.processor';

@Module({
  imports: [
    BullModule.registerQueue({
      name: 'circulars',
      prefix: process.env.BULL_PREFIX || 'bull',
    }),
  ],
  controllers: [CircularsController],
  providers: [CircularsService, CircularsProcessor],
  exports: [CircularsService],
})
export class CircularsModule {}
