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


  async getStats() {
    const totalQuery = `SELECT COUNT(*) FROM compliance_task WHERE is_discarded = FALSE`;
    const pendingQuery = `SELECT COUNT(*) FROM compliance_task WHERE is_discarded = FALSE AND is_approved = FALSE`;
    const approvedQuery = `SELECT COUNT(*) FROM compliance_task WHERE is_discarded = FALSE AND is_approved = TRUE`;

    const [totalRes, pendingRes, approvedRes] = await Promise.all([
      this.db.query(totalQuery),
      this.db.query(pendingQuery),
      this.db.query(approvedQuery),
    ]);

    return {
      total: parseInt(totalRes.rows[0].count, 10),
      pending: parseInt(pendingRes.rows[0].count, 10),
      approved: parseInt(approvedRes.rows[0].count, 10),
    };
  }

  async createManual(
    description: string,
    circularId: number,
    headerId?: number,
    priority?: string,
    riskCategory?: string,
    businessRisk?: string,
    controlRisk?: string,
    auditAreaId?: number
  ) {
    const res = await this.db.query(
      `INSERT INTO compliance_task (description, circular_id, header_id, is_approved, status, priority, risk_category, business_risk, control_risk, audit_area_id) 
       VALUES ($1, $2, $3, false, 'PENDING', $4, $5, $6, $7, $8) 
       RETURNING *`,
      [description, circularId, headerId || null, priority || null, riskCategory || null, businessRisk || null, controlRisk || null, auditAreaId || null],
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
    auditAreaId?: number
  ) {
    const res = await this.db.query(
      `UPDATE compliance_task 
       SET description = $1, header_id = $2, priority = $3, risk_category = $4, business_risk = $5, control_risk = $6, audit_area_id = $7, updated_at = CURRENT_TIMESTAMP 
       WHERE id = $8 RETURNING *`,
      [description, headerId || null, priority || null, riskCategory || null, businessRisk || null, controlRisk || null, auditAreaId || null, id],
    );
    if (res.rowCount === 0) {
      throw new NotFoundException(`Task with ID ${id} not found`);
    }
    return res.rows[0];
  }
}
