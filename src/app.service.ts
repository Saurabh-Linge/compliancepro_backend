import { Injectable } from '@nestjs/common';
import { DatabaseService } from './core/database/database.service';
import { IdService } from './core/id/id.service';

@Injectable()
export class AppService {
  constructor(
    private readonly db: DatabaseService,
    private readonly idService: IdService
  ) {}

  async getHello(): Promise<any> {
    const result = await this.db.findOne('SELECT NOW()::text as "currentTime"');
    return {
      message: 'Database service is active!',
      databaseTime: result?.currentTime || 'N/A',
      sampleGeneratedId: this.idService.generate(),
    };
  }
}
