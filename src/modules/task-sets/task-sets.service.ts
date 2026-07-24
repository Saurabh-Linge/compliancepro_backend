import { Injectable } from '@nestjs/common';
import { DatabaseService } from '../../core/database/database.service';
import { CreateTaskSetDto } from './dto/create-task-set.dto';
import { UpdateTaskSetDto } from './dto/update-task-set.dto';
import { AssignmentsSchedulerService } from '../assignments/assignments-scheduler.service';

@Injectable()
export class TaskSetsService {
  constructor(
    private readonly db: DatabaseService,
    private readonly assignmentsScheduler: AssignmentsSchedulerService
  ) { }

  async create(createTaskSetDto: CreateTaskSetDto) {
    const query = `
      INSERT INTO task_set (name, circular_id, default_due_date, start_date, end_date, frequency, reporting_date)
      VALUES ($1, $2, $3, $4, $5, $6, $7)
      RETURNING *
    `;
    const result = await this.db.query(query, [
      createTaskSetDto.name,
      createTaskSetDto.circular_id || null,
      createTaskSetDto.default_due_date || null,
      createTaskSetDto.start_date || null,
      createTaskSetDto.end_date || null,
      createTaskSetDto.frequency || null,
      createTaskSetDto.reporting_date || null,
    ]);

    const taskSet = result.rows[0];

    if (createTaskSetDto.taskIds && createTaskSetDto.taskIds.length > 0) {
      const mappingValues = createTaskSetDto.taskIds.map(id => `(${taskSet.id}, ${id})`).join(',');
      await this.db.query(`INSERT INTO task_set_mapping (task_set_id, task_id) VALUES ${mappingValues}`);
    }

    return taskSet;
  }

  async findAll() {
    const result = await this.db.query(`
      SELECT ts.*,
        c.title AS circular_title,
        c.reference_no AS circular_reference_no
      FROM task_set ts
      LEFT JOIN circular c ON c.id = ts.circular_id
      ORDER BY ts.id DESC
    `);
    return result.rows;
  }

  async findOne(id: number) {
    const result = await this.db.query(`SELECT * FROM task_set WHERE id = $1`, [id]);
    const taskSet = result.rows[0];
    if (taskSet) {
      const tasksResult = await this.db.query(`
        SELECT t.*, tsm.due_date::TEXT as due_date FROM compliance_task t
        JOIN task_set_mapping tsm ON t.id = tsm.task_id
        WHERE tsm.task_set_id = $1
      `, [id]);
      taskSet.tasks = tasksResult.rows;

      const branchesResult = await this.db.query(`
        SELECT b.* FROM branch_dept b
        JOIN task_set_branch tsb ON b.id = tsb.branch_id
        WHERE tsb.task_set_id = $1
      `, [id]);
      taskSet.branches = branchesResult.rows;
    }
    return taskSet;
  }

  async update(id: number, updateTaskSetDto: UpdateTaskSetDto) {
    const query = `
      UPDATE task_set
      SET name = COALESCE($1, name),
          circular_id = COALESCE($2, circular_id),
          default_due_date = COALESCE($3, default_due_date),
          start_date = COALESCE($4, start_date),
          end_date = COALESCE($5, end_date),
          frequency = COALESCE($6, frequency),
          reporting_date = COALESCE($7, reporting_date)
      WHERE id = $8
      RETURNING *
    `;
    const result = await this.db.query(query, [
      updateTaskSetDto.name || null,
      updateTaskSetDto.circular_id || null,
      updateTaskSetDto.default_due_date || null,
      updateTaskSetDto.start_date || null,
      updateTaskSetDto.end_date || null,
      updateTaskSetDto.frequency || null,
      updateTaskSetDto.reporting_date || null,
      id
    ]);
    return result.rows[0];
  }

  async remove(id: number) {
    await this.db.query(`DELETE FROM task_set WHERE id = $1`, [id]);
    return { deleted: true };
  }

  async mapTasks(id: number, taskIds: number[], taskTimelines?: { task_id: number; due_date: string | null }[]) {
    // First clear existing mappings
    await this.db.query(`DELETE FROM task_set_mapping WHERE task_set_id = $1`, [id]);

    // Add new mappings
    if (taskIds && taskIds.length > 0) {
      const dateMap = new Map<number, string | null>();
      if (taskTimelines) {
        taskTimelines.forEach(t => dateMap.set(Number(t.task_id), t.due_date));
      }

      for (const taskId of taskIds) {
        const dueDate = dateMap.get(taskId) || null;
        await this.db.query(
          `INSERT INTO task_set_mapping (task_set_id, task_id, due_date) VALUES ($1, $2, $3)`,
          [id, taskId, dueDate]
        );
      }
    }

    return { mapped: true };
  }

  async mapBranches(id: number, branchIds: number[]) {
    // First clear existing mappings
    await this.db.query(`DELETE FROM task_set_branch WHERE task_set_id = $1`, [id]);

    // Add new mappings
    if (branchIds && branchIds.length > 0) {
      const mappingValues = branchIds.map(branchId => `(${id}, ${branchId})`).join(',');
      await this.db.query(`INSERT INTO task_set_branch (task_set_id, branch_id) VALUES ${mappingValues}`);
      
      // Immediately generate assignments for the newly mapped units
      try {
        await this.assignmentsScheduler.generateAssignmentsForActiveTaskSets(id);
      } catch (err) {
        console.error(`Error auto-generating assignments for task set ID ${id}:`, err);
      }
    }

    return { mapped: true };
  }

  async reopen(id: number) {
    // 1. Update assignment status and clear review details
    await this.db.query(`
      UPDATE assignment 
      SET status = 'PENDING_RECOMPLIANCE', review_remark = NULL, reviewed_at = NULL
      WHERE task_set_id = $1
    `, [id]);

    // 2. Reset status, completed_at, compliance_status, remarks, and review_status for all tasks of these assignments
    await this.db.query(`
      UPDATE assignment_task
      SET status = 'PENDING', completed_at = NULL, compliance_status = 'PENDING', remarks = NULL, review_status = NULL
      WHERE assignment_id IN (
        SELECT id FROM assignment WHERE task_set_id = $1
      )
    `, [id]);

    return { reopened: true };
  }

}
