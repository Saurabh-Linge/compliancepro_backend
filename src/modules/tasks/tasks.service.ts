import { Injectable, NotFoundException } from '@nestjs/common';
import { DatabaseService } from '../../core/database/database.service';

@Injectable()
export class TasksService {
  constructor(private readonly db: DatabaseService) {}

  async findAllPaginated(params: { page: number; limit: number; status?: string; circularId?: number; search?: string }) {
    const { page, limit, status, circularId, search } = params;
    const offset = (page - 1) * limit;

    let conditions = ['ct.is_discarded = FALSE'];
    const values: any[] = [];
    let paramIndex = 1;

    if (status === 'Pending') {
      conditions.push(`ct.is_approved = FALSE`);
    } else if (status === 'Approved') {
      conditions.push(`ct.is_approved = TRUE`);
    }

    if (circularId) {
      conditions.push(`ct.circular_id = $${paramIndex++}`);
      values.push(circularId);
    }

    if (search) {
      conditions.push(`(ct.description ILIKE $${paramIndex} OR c.title ILIKE $${paramIndex} OR a.name ILIKE $${paramIndex})`);
      values.push(`%${search}%`);
      paramIndex++;
    }

    const whereClause = conditions.length > 0 ? 'WHERE ' + conditions.join(' AND ') : '';

    const countQuery = `
      SELECT COUNT(*)
      FROM compliance_task ct
      LEFT JOIN circular c ON ct.circular_id = c.id
      LEFT JOIN authority a ON c.authority_id = a.id
      ${whereClause}
    `;
    const countResult = await this.db.query(countQuery, values);
    const total = parseInt(countResult.rows[0].count, 10);

    const query = `
      SELECT ct.*, c.title as circular_title, a.name as authority_name, th.name as header_name
      FROM compliance_task ct
      LEFT JOIN circular c ON ct.circular_id = c.id
      LEFT JOIN authority a ON c.authority_id = a.id
      LEFT JOIN task_header th ON ct.header_id = th.id
      ${whereClause}
      ORDER BY ct.id DESC
      LIMIT $${paramIndex++} OFFSET $${paramIndex++}
    `;
    
    values.push(limit, offset);
    const result = await this.db.query(query, values);

    return {
      data: result.rows,
      total,
      page,
      limit
    };
  }

  async approve(id: number) {
    const query = `
      UPDATE compliance_task
      SET is_approved = TRUE,
          status = 'APPROVED'
      WHERE id = $1
      RETURNING *
    `;
    const result = await this.db.query(query, [id]);
    if (result.rowCount === 0) {
      throw new NotFoundException(`Task with ID ${id} not found`);
    }
    return result.rows[0];
  }

  async approveAll(circularId?: number) {
    let query = `
      UPDATE compliance_task
      SET is_approved = TRUE,
          status = 'APPROVED'
      WHERE is_discarded = FALSE AND is_approved = FALSE
    `;
    const params: any[] = [];
    if (circularId) {
      query += ` AND circular_id = $1`;
      params.push(circularId);
    }
    query += ` RETURNING *`;
    const result = await this.db.query(query, params);
    return { count: result.rowCount, approvedTasks: result.rows };
  }


  async getStats(circularId?: number) {
    let whereClause = 'WHERE is_discarded = FALSE';
    const values: any[] = [];
    if (circularId) {
      whereClause += ' AND circular_id = $1';
      values.push(circularId);
    }
    const totalQuery = `SELECT COUNT(*) FROM compliance_task ${whereClause}`;
    const pendingQuery = `SELECT COUNT(*) FROM compliance_task ${whereClause} AND is_approved = FALSE`;
    const approvedQuery = `SELECT COUNT(*) FROM compliance_task ${whereClause} AND is_approved = TRUE`;

    const [totalRes, pendingRes, approvedRes] = await Promise.all([
      this.db.query(totalQuery, values),
      this.db.query(pendingQuery, values),
      this.db.query(approvedQuery, values),
    ]);

    return {
      total: parseInt(totalRes.rows[0].count, 10),
      pending: parseInt(pendingRes.rows[0].count, 10),
      approved: parseInt(approvedRes.rows[0].count, 10),
    };
  }

  async createManual(
    description: string,
    circularId?: number | null,
    headerId?: number,
    priority?: string,
    riskCategory?: string,
    businessRisk?: string,
    controlRisk?: string,
    auditAreaId?: number,
    fileUrl?: string,
    authorityId?: number | null
  ) {
    const res = await this.db.query(
      `INSERT INTO compliance_task (description, circular_id, header_id, is_approved, status, priority, risk_category, business_risk, control_risk, audit_area_id, file_url, authority_id) 
       VALUES ($1, $2, $3, true, 'APPROVED', $4, $5, $6, $7, $8, $9, $10) 
       RETURNING *`,
      [
        description,
        circularId || null,
        headerId || null,
        priority || null,
        riskCategory || null,
        businessRisk || null,
        controlRisk || null,
        auditAreaId || null,
        fileUrl || null,
        authorityId || null
      ],
    );
    return res.rows[0];
  }

  async update(
    id: number,
    description: string,
    headerId?: number,
    priority?: string,
    riskCategory?: string,
    businessRisk?: string,
    controlRisk?: string,
    auditAreaId?: number,
    fileUrl?: string
  ) {
    const res = await this.db.query(
      `UPDATE compliance_task 
       SET description = $1, 
           header_id = $2, 
           priority = $3, 
           risk_category = $4, 
           business_risk = $5, 
           control_risk = $6, 
           audit_area_id = $7, 
           file_url = CASE 
                        WHEN $8::text = '__REMOVE__' THEN NULL 
                        WHEN $8::text IS NOT NULL AND $8::text != '' THEN $8::text 
                        ELSE file_url 
                      END, 
           updated_at = CURRENT_TIMESTAMP 
       WHERE id = $9 RETURNING *`,
      [description, headerId || null, priority || null, riskCategory || null, businessRisk || null, controlRisk || null, auditAreaId || null, fileUrl !== undefined ? fileUrl : null, id],
    );
    if (res.rowCount === 0) {
      throw new NotFoundException(`Task with ID ${id} not found`);
    }
    return res.rows[0];
  }

  async createBulk(circularId: number, tasks: { description: string }[]) {
    const results: any[] = [];
    for (const t of tasks) {
      const res = await this.createManual(t.description, circularId);
      results.push(res);
    }
    return results;
  }
}
