import { Injectable, Logger } from '@nestjs/common';
import { DatabaseService } from '../../core/database/database.service';
import { StorageService } from '../../core/storage/storage.service';
import { EventEmitter2 } from '@nestjs/event-emitter';

@Injectable()
export class AssignmentsService {
  private readonly logger = new Logger(AssignmentsService.name);

  constructor(
    private readonly db: DatabaseService,
    private readonly storage: StorageService,
    private eventEmitter: EventEmitter2
  ) {}

  async create(taskSetId: number, branchIds: number[], proposedTimeline: string) {
    const assignments = [];
    for (const branchId of branchIds) {
      // 1. Create the assignment
      const query = `
        INSERT INTO assignment (task_set_id, branch_id, proposed_timeline, status)
        VALUES ($1, $2, $3, 'Pending_Timeline')
        RETURNING *
      `;
      const result = await this.db.query(query, [taskSetId, branchId, proposedTimeline]);
      const assignment = result.rows[0];
      assignments.push(assignment);

      // 2. Populate assignment_task for each task in the task set
      const tasksQuery = `
        INSERT INTO assignment_task (assignment_id, task_id, status)
        SELECT $1, task_id, 'PENDING'
        FROM task_set_mapping
        WHERE task_set_id = $2
      `;
      await this.db.query(tasksQuery, [assignment.id, taskSetId]);
    }
    return assignments;
  }

  async getAssignmentsByBranch(branchId: number) {
    const query = `
      SELECT 
        a.id, a.proposed_timeline, a.status,
        ts.id as task_set_id, ts.name as task_set_name, ts.default_due_date,
        (
          SELECT json_agg(json_build_object('id', ct.id, 'description', ct.description))
          FROM task_set_mapping tsm
          JOIN compliance_task ct ON ct.id = tsm.task_id
          WHERE tsm.task_set_id = ts.id
        ) as tasks
      FROM assignment a
      JOIN task_set ts ON ts.id = a.task_set_id
      WHERE a.branch_id = $1
      ORDER BY a.id DESC
    `;
    const result = await this.db.query(query, [branchId]);
    return result.rows;
  }
  async getAssignmentTasks(assignmentId: number) {
    const query = `
      SELECT 
        at.id as assignment_task_id, 
        at.status, 
        ct.id as task_id, 
        ct.description,
        ct.circular_id,
        c.title as circular_title,
        th.name as header_name
      FROM assignment_task at
      JOIN compliance_task ct ON ct.id = at.task_id
      JOIN circular c ON c.id = ct.circular_id
      LEFT JOIN task_header th ON ct.header_id = th.id
      WHERE at.assignment_id = $1
      ORDER BY th.id ASC NULLS LAST, at.id ASC
    `;
    const result = await this.db.query(query, [assignmentId]);
    return result.rows;
  }

  async proposeTimeline(id: number, date: string) {
    const query = `
      UPDATE assignment
      SET proposed_timeline = $1, status = 'Timeline_Review'
      WHERE id = $2
      RETURNING *
    `;
    const result = await this.db.query(query, [date, id]);
    return result.rows[0];
  }

  async acceptTimeline(id: number) {
    const query = `
      UPDATE assignment
      SET status = 'In_Progress'
      WHERE id = $1
      RETURNING *
    `;
    const result = await this.db.query(query, [id]);
    return result.rows[0];
  }
  async getAllAssignments(userRole?: string, userId?: string) {
    let query = `
      SELECT 
        a.id, a.proposed_timeline, a.status,
        ts.name as task_set_name,
        bd.name as branch_name
      FROM assignment a
      JOIN task_set ts ON ts.id = a.task_set_id
      JOIN branch_dept bd ON bd.id = a.branch_id
    `;
    const params: any[] = [];
    
    // Temporarily removed authorization completely
    // if (userRole === 'CO' && userId) {
    //   query += ` WHERE bd.co_user_id = $1 `;
    //   params.push(userId);
    // }
    
    query += ` ORDER BY a.id DESC `;
    
    const result = await this.db.query(query, params);
    return result.rows;
  }

  async findAllPaginated(params: { page: number; limit: number; branchId?: number; search?: string }) {
    const { page, limit, branchId, search } = params;
    const offset = (page - 1) * limit;

    let conditions = ['1=1'];
    const values: any[] = [];
    let paramIndex = 1;

    if (branchId) {
      conditions.push(`a.branch_id = $${paramIndex++}`);
      values.push(branchId);
    }

    if (search) {
      conditions.push(`(ts.name ILIKE $${paramIndex} OR bd.name ILIKE $${paramIndex} OR a.status ILIKE $${paramIndex})`);
      values.push(`%${search}%`);
      paramIndex++;
    }

    const whereClause = 'WHERE ' + conditions.join(' AND ');

    const countQuery = `
      SELECT COUNT(*)
      FROM assignment a
      JOIN task_set ts ON ts.id = a.task_set_id
      JOIN branch_dept bd ON bd.id = a.branch_id
      ${whereClause}
    `;
    const countResult = await this.db.query(countQuery, values);
    const total = parseInt(countResult.rows[0].count, 10);

    const query = `
      SELECT 
        a.id, a.proposed_timeline, a.status,
        ts.id as task_set_id, ts.name as task_set_name, ts.default_due_date,
        bd.name as branch_name,
        (
          SELECT json_agg(json_build_object('id', ct.id, 'description', ct.description))
          FROM task_set_mapping tsm
          JOIN compliance_task ct ON ct.id = tsm.task_id
          WHERE tsm.task_set_id = ts.id
        ) as tasks
      FROM assignment a
      JOIN task_set ts ON ts.id = a.task_set_id
      JOIN branch_dept bd ON bd.id = a.branch_id
      ${whereClause}
      ORDER BY a.id DESC
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

  async updateStatus(id: number, status: string) {
    const query = `
      UPDATE assignment
      SET status = $1
      WHERE id = $2
      RETURNING *
    `;
    const result = await this.db.query(query, [status, id]);
    return result.rows[0];
  }

  async addTaskEvidences(assignmentTaskId: number, assignmentId: number, filesData: {buffer: Buffer, filename: string}[], remark: string) {
    let lastResult = null;
    for (const file of filesData) {
      // 1. Upload file to MinIO
      const url = await this.storage.uploadFile(file.buffer, file.filename, 'application/pdf');

      // 2. Save evidence record linked to specific task
      const query = `
        INSERT INTO evidence (assignment_task_id, assignment_id, file_url, remark)
        VALUES ($1, $2, $3, $4)
        RETURNING *
      `;
      const result = await this.db.query(query, [assignmentTaskId, assignmentId, url, remark]);
      lastResult = result.rows[0];
    }
    
    // 3. Mark task as COMPLETED
    await this.db.query(`UPDATE assignment_task SET status = 'COMPLETED', completed_at = NOW() WHERE id = $1`, [assignmentTaskId]);

    // 4. Check if all tasks in the assignment are completed. If so, move assignment to Review_Pending
    const checkQuery = `
      SELECT count(*) as total,
             sum(case when status = 'COMPLETED' then 1 else 0 end) as completed
      FROM assignment_task
      WHERE assignment_id = $1
    `;
    const checkRes = await this.db.query(checkQuery, [assignmentId]);
    const { total, completed } = checkRes.rows[0];
    
    if (total > 0 && total === completed) {
      const updated = await this.updateStatus(assignmentId, 'REVIEW_PENDING');
      
      const taskSetQuery = `SELECT name FROM task_set ts JOIN assignment a ON a.task_set_id = ts.id WHERE a.id = $1`;
      const tsRes = await this.db.query(taskSetQuery, [assignmentId]);

      this.eventEmitter.emit('assignment.updated', {
        assignmentId,
        status: 'REVIEW_PENDING',
        branchId: updated.branch_id,
        taskSetName: tsRes.rows[0]?.name || 'Unknown Task Set'
      });
    }

    return lastResult;
  }

  async getAssignmentEvidence(assignmentId: number) {
    const query = `
      SELECT 
        e.id, 
        e.file_url, 
        e.remark, 
        at.task_id, 
        ct.description
      FROM evidence e
      JOIN assignment_task at ON at.id = e.assignment_task_id
      JOIN compliance_task ct ON ct.id = at.task_id
      WHERE at.assignment_id = $1
      ORDER BY e.submitted_at DESC
    `;
    const result = await this.db.query(query, [assignmentId]);
    return result.rows;
  }

  async reviewAssignment(assignmentId: number, action: 'ACCEPT' | 'REJECT' | 'ESCALATE', remark: string) {
    const result = await this.db.transaction(async (client) => {
      let status = 'COMPLETED';
      if (action === 'REJECT') status = 'REJECTED';
      if (action === 'ESCALATE') status = 'ESCALATED_TO_CCO';

      const updateQuery = `
        UPDATE assignment
        SET status = $1,
            review_remark = $2,
            reviewed_at = NOW()
        WHERE id = $3
        RETURNING *
      `;
      const updatedRes = await client.query(updateQuery, [status, remark || null, assignmentId]);
      const updated = updatedRes.rows[0];

      if (action === 'REJECT') {
        await client.query(
          `
            UPDATE assignment_task
            SET status = 'PENDING',
                completed_at = NULL
            WHERE assignment_id = $1
          `,
          [assignmentId],
        );
      }

      return updated;
    });
    const updated = result;

    const taskSetQuery = `SELECT name FROM task_set ts JOIN assignment a ON a.task_set_id = ts.id WHERE a.id = $1`;
    const tsRes = await this.db.query(taskSetQuery, [assignmentId]);

    this.eventEmitter.emit('assignment.updated', {
      assignmentId,
      status: updated.status,
      branchId: updated.branch_id,
      taskSetName: tsRes.rows[0]?.name || 'Unknown Task Set'
    });

    return updated;
  }
}
