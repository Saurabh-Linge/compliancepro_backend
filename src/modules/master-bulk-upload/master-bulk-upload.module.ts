import { Module } from '@nestjs/common';
import { DatabaseModule } from '../../core/database/database.module';
import { MasterBulkUploadController } from './master-bulk-upload.controller';
import { MasterBulkUploadService } from './master-bulk-upload.service';

@Module({
  imports: [DatabaseModule],
  controllers: [MasterBulkUploadController],
  providers: [MasterBulkUploadService],
  exports: [MasterBulkUploadService],
})
export class MasterBulkUploadModule {}
