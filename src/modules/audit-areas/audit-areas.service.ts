import { Injectable } from '@nestjs/common';
import { DatabaseService } from '../../core/database/database.service';

@Injectable()
export class AuditAreasService {
  constructor(private readonly db: DatabaseService) {}

  async findAll() {
    const res = await this.db.query('SELECT id, name FROM audit_area ORDER BY id ASC');
    return res.rows;
  }
}
