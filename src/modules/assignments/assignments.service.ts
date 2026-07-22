// AssignmentsService — handles assignment CRUD and review logic
import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { DatabaseService } from '../../core/database/database.service';
import { StorageService } from '../../core/storage/storage.service';
import { EventEmitter2 } from '@nestjs/event-emitter';

@Injectable()
export class AssignmentsService implements OnModuleInit {
  private readonly logger = new Logger(AssignmentsService.name);

  constructor(
    private readonly db: DatabaseService,
    private readonly storage: StorageService,
    private eventEmitter: EventEmitter2
  ) { }

  async onModuleInit() {
    this.logger.log('Normalizing proposed_due_date for Pending_Timeline and Timeline_Review assignments...');
    try {
      await this.db.query(`
        UPDATE assignment_task
        SET proposed_due_date = NULL
        WHERE proposed_due_date = due_date
          AND assignment_id IN (
            SELECT id FROM assignment 
            WHERE status = 'Pending_Timeline' OR status = 'Timeline_Review'
          )
      `);
      this.logger.log('proposed_due_date normalization complete.');
    } catch (err) {
      this.logger.error('Failed to normalize proposed_due_date on startup:', err);
    }
  }

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
        INSERT INTO assignment_task (assignment_id, task_id, status, due_date, proposed_due_date)
        SELECT $1, tsm.task_id, 'PENDING', COALESCE(tsm.due_date, $3::DATE), NULL
        FROM task_set_mapping tsm
        WHERE tsm.task_set_id = $2
      `;
      await this.db.query(tasksQuery, [assignment.id, taskSetId, proposedTimeline]);
    }
    return assignments;
  }

  async getAssignmentsByBranch(branchId: number) {
    const query = `
      SELECT 
        a.id, a.proposed_timeline, a.status, a.created_at,
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
        at.compliance_status,
        at.remarks,
        at.review_status,
        at.review_remark,
        at.due_date::TEXT as due_date,
        at.proposed_due_date::TEXT as proposed_due_date,
        at.proposed_remark,
        at.timeline_review_remark,
        ct.id as task_id, 
        ct.description,
        ct.file_url,
        th.name as header_name,
        a.id as assignment_id,
        a.status as assignment_status,
        a.proposed_timeline,
        a.review_remark as assignment_review_remark,
        a.timeline_remark as assignment_timeline_remark,
        ts.name as task_set_name,
        ts.frequency,
        ts.start_date,
        ts.end_date,
        bd.name as branch_name,
        c.reference_no as circular_reference_no,
        c.title as circular_title,
        auth.name as authority_name,
        e.file_url as evidence_url,
        e.remark as evidence_remark,
        CASE WHEN e.id IS NOT NULL THEN true ELSE false END as has_evidence
      FROM assignment_task at
      JOIN assignment a ON a.id = at.assignment_id
      JOIN task_set ts ON ts.id = a.task_set_id
      JOIN branch_dept bd ON bd.id = a.branch_id
      JOIN compliance_task ct ON ct.id = at.task_id
      LEFT JOIN circular c ON c.id = ct.circular_id
      LEFT JOIN authority auth ON auth.id = c.authority_id
      LEFT JOIN task_header th ON ct.header_id = th.id
      LEFT JOIN LATERAL (
        SELECT id, file_url, remark FROM evidence
        WHERE assignment_task_id = at.id
        ORDER BY submitted_at DESC LIMIT 1
      ) e ON true
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

  async proposeCustomTimeline(id: number, date: string, taskTimelines: { assignment_task_id: number; proposed_due_date: string }[]) {
    const query = `
      UPDATE assignment
      SET proposed_timeline = $1, status = 'Timeline_Review'
      WHERE id = $2
      RETURNING *
    `;
    const result = await this.db.query(query, [date, id]);

    for (const t of taskTimelines) {
      const taskQuery = `
        UPDATE assignment_task
        SET proposed_due_date = $1
        WHERE id = $2 AND assignment_id = $3
      `;
      await this.db.query(taskQuery, [t.proposed_due_date, t.assignment_task_id, id]);
    }

    return result.rows[0];
  }

  async proposeTaskTimeline(assignmentId: number, assignmentTaskId: number, proposedDueDate: string, proposedRemark?: string) {
    const taskQuery = `
      UPDATE assignment_task
      SET proposed_due_date = $1, proposed_remark = $2
      WHERE id = $3 AND assignment_id = $4
    `;
    await this.db.query(taskQuery, [proposedDueDate, proposedRemark || null, assignmentTaskId, assignmentId]);

    // Automatically transition the main assignment status to 'Timeline_Review' when a task due date is proposed/modified.
    const query = `
      UPDATE assignment
      SET status = 'Timeline_Review'
      WHERE id = $1 AND (status = 'Pending_Timeline' OR status = 'Timeline_Review')
    `;
    await this.db.query(query, [assignmentId]);

    return { success: true };
  }

  async reviewTaskTimeline(assignmentId: number, assignmentTaskId: number, status: 'APPROVED' | 'REJECTED', remark?: string) {
    const reviewStatus = status === 'APPROVED' ? 'APPROVED' : 'REJECTED';
    
    // If approved, update due_date to proposed_due_date
    if (status === 'APPROVED') {
      const taskQuery = `
        UPDATE assignment_task
        SET due_date = COALESCE(proposed_due_date, due_date),
            timeline_review_remark = $1,
            review_status = $2
        WHERE id = $3 AND assignment_id = $4
      `;
      await this.db.query(taskQuery, [remark || null, reviewStatus, assignmentTaskId, assignmentId]);
    } else {
      // If rejected, set timeline_review_remark and set review_status to REJECTED
      const taskQuery = `
        UPDATE assignment_task
        SET timeline_review_remark = $1,
            review_status = $2
        WHERE id = $3 AND assignment_id = $4
      `;
      await this.db.query(taskQuery, [remark || null, reviewStatus, assignmentTaskId, assignmentId]);
    }

    // Check if we need to auto-transition the assignment status.
    // If rejected, change assignment status back to 'Pending_Timeline' so branch can correct it.
    if (status === 'REJECTED') {
      const query = `
        UPDATE assignment
        SET status = 'Pending_Timeline'
        WHERE id = $1
      `;
      await this.db.query(query, [assignmentId]);
    } else {
      // If all tasks are approved, transition assignment status to 'In_Progress'
      const checkTasksQuery = `
        SELECT COUNT(*) as total,
               COUNT(CASE WHEN review_status = 'APPROVED' THEN 1 END) as approved
        FROM assignment_task
        WHERE assignment_id = $1
      `;
      const checkRes = await this.db.query(checkTasksQuery, [assignmentId]);
      const { total, approved } = checkRes.rows[0];
      if (parseInt(total, 10) === parseInt(approved, 10)) {
        await this.db.query(`UPDATE assignment SET status = 'In_Progress' WHERE id = $1`, [assignmentId]);
      }
    }

    // Fetch metadata and emit notification event
    try {
      const infoQuery = `
        SELECT a.branch_id, ts.name as task_set_name, ct.description as task_description
        FROM assignment a
        JOIN task_set ts ON ts.id = a.task_set_id
        JOIN assignment_task at ON at.assignment_id = a.id
        JOIN compliance_task ct ON ct.id = at.task_id
        WHERE at.id = $1 AND a.id = $2
      `;
      const infoRes = await this.db.query(infoQuery, [assignmentTaskId, assignmentId]);
      const info = infoRes.rows[0];
      if (info) {
        this.eventEmitter.emit('timeline.task_reviewed', {
          assignmentId,
          assignmentTaskId,
          status,
          remark: remark || '',
          branchId: info.branch_id,
          taskSetName: info.task_set_name,
          taskDescription: info.task_description
        });
      }
    } catch (e) {
      this.logger.error('Failed to emit task timeline review event: ' + e.message);
    }

    return { success: true };
  }

  async acceptTimeline(id: number) {
    const updateTasksQuery = `
      UPDATE assignment_task
      SET due_date = COALESCE(proposed_due_date, due_date)
      WHERE assignment_id = $1
    `;
    await this.db.query(updateTasksQuery, [id]);

    const query = `
      UPDATE assignment
      SET status = 'In_Progress'
      WHERE id = $1
      RETURNING *
    `;
    const result = await this.db.query(query, [id]);
    const updated = result.rows[0];

    if (updated) {
      const taskSetQuery = `SELECT name FROM task_set ts JOIN assignment a ON a.task_set_id = ts.id WHERE a.id = $1`;
      const tsRes = await this.db.query(taskSetQuery, [id]);
      this.eventEmitter.emit('assignment.updated', {
        assignmentId: id,
        status: 'In_Progress',
        branchId: updated.branch_id || updated.branchId,
        taskSetName: tsRes.rows[0]?.name || 'Unknown Task Set'
      });
    }

    return updated;
  }

  async acceptTimelineWithChanges(id: number, date?: string, taskTimelines?: { assignment_task_id: number; proposed_due_date: string }[]) {
    if (date) {
      await this.db.query(`
        UPDATE assignment
        SET proposed_timeline = $1
        WHERE id = $2
      `, [date, id]);
    }

    if (taskTimelines && taskTimelines.length > 0) {
      for (const t of taskTimelines) {
        await this.db.query(`
          UPDATE assignment_task
          SET proposed_due_date = $1
          WHERE id = $2 AND assignment_id = $3
        `, [t.proposed_due_date, t.assignment_task_id, id]);
      }
    }

    const updateTasksQuery = `
      UPDATE assignment_task
      SET due_date = COALESCE(proposed_due_date, due_date)
      WHERE assignment_id = $1
    `;
    await this.db.query(updateTasksQuery, [id]);

    const query = `
      UPDATE assignment
      SET status = 'In_Progress'
      WHERE id = $1
      RETURNING *
    `;
    const result = await this.db.query(query, [id]);
    const updated = result.rows[0];

    if (updated) {
      const taskSetQuery = `SELECT name FROM task_set ts JOIN assignment a ON a.task_set_id = ts.id WHERE a.id = $1`;
      const tsRes = await this.db.query(taskSetQuery, [id]);
      this.eventEmitter.emit('assignment.updated', {
        assignmentId: id,
        status: 'In_Progress',
        branchId: updated.branch_id || updated.branchId,
        taskSetName: tsRes.rows[0]?.name || 'Unknown Task Set'
      });
    }

    return updated;
  }
  async getAllAssignments(userRole?: string, userId?: string) {
    let query = `
      SELECT 
        a.id, a.proposed_timeline, a.status, a.created_at,
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

  async findAllPaginated(params: { page: number; limit: number; branchId?: number; search?: string; status?: string }) {
    const { page, limit, branchId, search, status } = params;
    const offset = (page - 1) * limit;

    let conditions = ['1=1'];
    const values: any[] = [];
    let paramIndex = 1;

    if (branchId) {
      conditions.push(`a.branch_id = $${paramIndex++}`);
      values.push(branchId);
    }

    if (status) {
      conditions.push(`a.status = $${paramIndex++}`);
      values.push(status);
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
        a.id, a.proposed_timeline, a.status, a.created_at,
        ts.id as task_set_id, ts.name as task_set_name, ts.default_due_date,
        bd.name as branch_name,
        (
          SELECT json_agg(json_build_object('id', ct.id, 'description', ct.description, 'file_url', ct.file_url))
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
    const updated = result.rows[0];

    if (updated && status === 'REVIEW_PENDING') {
      const taskSetQuery = `SELECT name FROM task_set ts JOIN assignment a ON a.task_set_id = ts.id WHERE a.id = $1`;
      const tsRes = await this.db.query(taskSetQuery, [id]);

      this.eventEmitter.emit('assignment.updated', {
        assignmentId: id,
        status: 'REVIEW_PENDING',
        branchId: updated.branch_id || updated.branchId,
        taskSetName: tsRes.rows[0]?.name || 'Unknown Task Set'
      });
    }

    return updated;
  }

  async addTaskEvidences(assignmentTaskId: number, assignmentId: number, filesData: { buffer: Buffer, filename: string }[], remark: string) {
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
    await this.db.query(`UPDATE assignment_task SET status = 'COMPLETED', compliance_status = 'COMPLIED', completed_at = NOW() WHERE id = $1`, [assignmentTaskId]);

    return lastResult;
  }

  async completeTaskDirectly(assignmentTaskId: number, assignmentId: number, complianceStatus: 'COMPLIED' | 'NOT_COMPLIED', remarks: string) {
    const query = `
      UPDATE assignment_task
      SET compliance_status = $1,
          remarks = $2,
          status = 'COMPLETED',
          completed_at = NOW()
      WHERE id = $3 AND assignment_id = $4
      RETURNING *
    `;
    const result = await this.db.query(query, [complianceStatus, remarks, assignmentTaskId, assignmentId]);
    const updatedTask = result.rows[0];
    return updatedTask;
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
      // Get current status before update
      const currentRes = await client.query(`SELECT status FROM assignment WHERE id = $1`, [assignmentId]);
      const previousStatus = currentRes.rows[0]?.status;

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
        // Only reset tasks flagged as NEEDS_REDO (or all if none were flagged)
        const flaggedCount = await client.query(
          `SELECT COUNT(*) FROM assignment_task WHERE assignment_id = $1 AND review_status = 'NEEDS_REDO'`,
          [assignmentId]
        );
        const hasFlagged = parseInt(flaggedCount.rows[0].count, 10) > 0;

        if (hasFlagged) {
          // Reset only flagged tasks
          await client.query(
            `UPDATE assignment_task
             SET status = 'PENDING', completed_at = NULL, compliance_status = 'PENDING', remarks = NULL
             WHERE assignment_id = $1 AND review_status = 'NEEDS_REDO'`,
            [assignmentId]
          );
          // Clear review_status on all tasks
          await client.query(
            `UPDATE assignment_task SET review_status = NULL WHERE assignment_id = $1`,
            [assignmentId]
          );
        } else {
          // No per-task flags set — reset all tasks
          await client.query(
            `UPDATE assignment_task
             SET status = 'PENDING', completed_at = NULL, compliance_status = 'PENDING', remarks = NULL, review_status = NULL
             WHERE assignment_id = $1`,
            [assignmentId]
          );
        }
      }

      return { updated, previousStatus };
    });

    const { updated, previousStatus } = result;

    const taskSetQuery = `SELECT name FROM task_set ts JOIN assignment a ON a.task_set_id = ts.id WHERE a.id = $1`;
    const tsRes = await this.db.query(taskSetQuery, [assignmentId]);
    const taskSetName = tsRes.rows[0]?.name || 'Unknown Task Set';

    this.eventEmitter.emit('assignment.updated', {
      assignmentId,
      status: updated.status,
      branchId: updated.branch_id || updated.branchId,
      taskSetName,
      previousStatus
    });

    // Emit re-compliance notification for branch when rejected
    if (updated.status === 'REJECTED') {
      this.eventEmitter.emit('assignment.rejected', {
        assignmentId,
        branchId: updated.branch_id || updated.branchId,
        taskSetName,
        reviewRemark: remark,
        previousStatus
      });
    }

    return updated;
  }

  async reviewTaskStatus(assignmentTaskId: number, reviewStatus: 'APPROVED' | 'NEEDS_REDO', reviewRemark?: string) {
    const query = `
      UPDATE assignment_task
      SET review_status = $1, review_remark = $2
      WHERE id = $3
      RETURNING *
    `;
    const result = await this.db.query(query, [reviewStatus, reviewRemark || null, assignmentTaskId]);
    return result.rows[0];
  }
}