import { Injectable } from '@nestjs/common';
import { DatabaseService } from '../../core/database/database.service';
import { CreateTaskSetDto } from './dto/create-task-set.dto';
import { UpdateTaskSetDto } from './dto/update-task-set.dto';

@Injectable()
export class TaskSetsService {
  constructor(private readonly db: DatabaseService) {}

  async create(createTaskSetDto: CreateTaskSetDto) {
    const query = `
      INSERT INTO task_set (name, default_due_date, start_date, end_date, frequency, reporting_date)
      VALUES ($1, $2, $3, $4, $5, $6)
      RETURNING *
    `;
    const result = await this.db.query(query, [
      createTaskSetDto.name,
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
    const result = await this.db.query(`SELECT * FROM task_set ORDER BY id ASC`);
    return result.rows;
  }

  async findOne(id: number) {
    const result = await this.db.query(`SELECT * FROM task_set WHERE id = $1`, [id]);
    const taskSet = result.rows[0];
    if (taskSet) {
      const tasksResult = await this.db.query(`
        SELECT t.* FROM compliance_task t
        JOIN task_set_mapping tsm ON t.id = tsm.task_id
        WHERE tsm.task_set_id = $1
      `, [id]);
      taskSet.tasks = tasksResult.rows;
    }
    return taskSet;
  }

  async update(id: number, updateTaskSetDto: UpdateTaskSetDto) {
    const query = `
      UPDATE task_set
      SET name = COALESCE($1, name),
          default_due_date = COALESCE($2, default_due_date),
          start_date = COALESCE($3, start_date),
          end_date = COALESCE($4, end_date),
          frequency = COALESCE($5, frequency),
          reporting_date = COALESCE($6, reporting_date)
      WHERE id = $7
      RETURNING *
    `;
    const result = await this.db.query(query, [
      updateTaskSetDto.name || null,
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

  async mapTasks(id: number, taskIds: number[]) {
    // First clear existing mappings
    await this.db.query(`DELETE FROM task_set_mapping WHERE task_set_id = $1`, [id]);
    
    // Add new mappings
    if (taskIds && taskIds.length > 0) {
      const mappingValues = taskIds.map(taskId => `(${id}, ${taskId})`).join(',');
      await this.db.query(`INSERT INTO task_set_mapping (task_set_id, task_id) VALUES ${mappingValues}`);
    }
    
    return { mapped: true };
  }

  async reopen(id: number) {
    // Set all assignments for this task_set_id to PENDING_RECOMPLIANCE and clear review remarks
    await this.db.query(`
      UPDATE assignment 
      SET status = 'PENDING_RECOMPLIANCE', review_remark = NULL, reviewed_at = NULL
      WHERE task_set_id = $1
    `, [id]);
    
    return { reopened: true };
  }
}
