import { Body, Controller, Param, Post } from '@nestjs/common';
import { MasterBulkUploadService } from './master-bulk-upload.service';

export class MasterBulkUploadDto {
  rows: any[];
}

@Controller('master-bulk-upload')
export class MasterBulkUploadController {
  constructor(private readonly masterBulkUploadService: MasterBulkUploadService) {}

  @Post(':masterKey')
  upload(
    @Param('masterKey') masterKey: string,
    @Body() body: MasterBulkUploadDto,
  ) {
    return this.masterBulkUploadService.upload(masterKey, body.rows || []);
  }
}
