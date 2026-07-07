import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { CircularsService } from './circulars.service';
import { CircularsController } from './circulars.controller';
import { CircularsProcessor } from './circulars.processor';

@Module({
  imports: [
    BullModule.registerQueue({
      name: 'circulars',
    }),
  ],
  controllers: [CircularsController],
  providers: [CircularsService, CircularsProcessor],
  exports: [CircularsService],
})
export class CircularsModule {}
