import { Injectable } from '@nestjs/common';
import { DatabaseService } from '../../core/database/database.service';

@Injectable()
export class HolidaysService {
  constructor(private db: DatabaseService) {}

  async getHolidays(year?: number, month?: number) {
    let query = `SELECT id, TO_CHAR(date, 'YYYY-MM-DD') as date, name, type FROM holiday WHERE 1=1`;
    const params: any[] = [];
    let paramIndex = 1;

    if (year) {
      query += ` AND EXTRACT(YEAR FROM date) = $${paramIndex++}`;
      params.push(year);
    }
    if (month) {
      query += ` AND EXTRACT(MONTH FROM date) = $${paramIndex++}`;
      params.push(month);
    }

    const result = await this.db.query(query, params);
    return result.rows;
  }

  async addHoliday(date: string, name: string) {
    const result = await this.db.query(
      `INSERT INTO holiday (date, name, type) VALUES ($1, $2, 'CUSTOM') RETURNING id, TO_CHAR(date, 'YYYY-MM-DD') as date, name, type`,
      [date, name]
    );
    return result.rows[0];
  }

  async deleteHoliday(id: number) {
    await this.db.query(`DELETE FROM holiday WHERE id = $1`, [id]);
    return { success: true };
  }

  async isHoliday(dateStr: string): Promise<boolean> {
    const dateObj = new Date(dateStr);
    if (dateObj.getDay() === 0) return true; // Sunday

    if (dateObj.getDay() === 6) { // Saturday
      const d = dateObj.getDate();
      if ((d > 7 && d <= 14) || (d > 21 && d <= 28)) return true; // 2nd or 4th Sat
    }

    const result = await this.db.query(`SELECT 1 FROM holiday WHERE date = $1`, [dateStr]);
    return result.rows.length > 0;
  }
}
