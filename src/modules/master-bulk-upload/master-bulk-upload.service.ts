import { BadRequestException, Injectable } from '@nestjs/common';
import { DatabaseService } from '../../core/database/database.service';

@Injectable()
export class MasterBulkUploadService {
  constructor(private readonly db: DatabaseService) { }

  async upload(masterKey: string, rows: any[]) {
    const key = String(masterKey || '').trim().toLowerCase();

    if (key !== 'tasks') {
      throw new BadRequestException(`Bulk upload is not configured for master: ${masterKey}`);
    }

    return this.bulkUploadTasks(rows);
  }

  private async bulkUploadTasks(rows: any[]) {
    if (!Array.isArray(rows) || !rows.length) {
      throw new BadRequestException('At least one task row is required.');
    }

    return this.db.transaction(async (client) => {
      const data: any[] = [];
      const errors: string[] = [];

      for (let i = 0; i < rows.length; i++) {
        const row = rows[i];
        const rowNumber = i + 1;

        try {
          const description = String(row?.description || '').trim();
          const circularId = Number(row?.circular_id || 0);

          if (!description) {
            errors.push(`Row ${rowNumber}: Task description is required`);
            continue;
          }
          if (!circularId) {
            errors.push(`Row ${rowNumber}: Circular selection is required`);
            continue;
          }

          const headerId = row?.header_id ? Number(row.header_id) : null;
          const priority = row?.priority ? String(row.priority).trim() : null;

          const query = `
            INSERT INTO compliance_task (
              description, circular_id, header_id, is_approved, status,
              priority
            ) 
            VALUES ($1, $2, $3, false, 'PENDING', $4) 
            RETURNING *
          `;

          const result = await client.query(query, [
            description,
            circularId,
            headerId,
            priority
          ]);

          data.push(result.rows[0]);
        } catch (err: any) {
          errors.push(`Row ${rowNumber}: ${err.message || 'Database error occurred'}`);
        }
      }

      if (errors.length) {
        throw new BadRequestException({ message: 'Bulk task upload failed.', errors });
      }

      return { successCount: data.length, errors: [], data };
    });
  }
}
