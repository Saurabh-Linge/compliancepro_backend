import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { DatabaseService } from '../../core/database/database.service';

@Injectable()
export class AssignmentsSchedulerService {
  private readonly logger = new Logger(AssignmentsSchedulerService.name);

  constructor(private readonly db: DatabaseService) {}

  // Run every night at midnight (00:00)
  @Cron(CronExpression.EVERY_DAY_AT_MIDNIGHT)
  async handleDailyAssignmentGeneration() {
    this.logger.log('Starting daily auto-generation of compliance assignments...');
    await this.generateAssignmentsForActiveTaskSets();
    this.logger.log('Daily auto-generation completed.');
  }

  // Business logic to run calculation and generation
  async generateAssignmentsForActiveTaskSets(specificTaskSetId?: number): Promise<{ generated: number; skipped: number }> {
    let query = `
      SELECT id, name, default_due_date, start_date, end_date, frequency, reporting_date
      FROM task_set
      WHERE 1=1
    `;
    const params: any[] = [];

    if (specificTaskSetId) {
      query += ` AND id = $1`;
      params.push(specificTaskSetId);
    } else {
      // Find task sets that are currently active
      query += ` AND (start_date IS NULL OR start_date <= CURRENT_DATE)
                 AND (end_date IS NULL OR end_date >= CURRENT_DATE)`;
    }

    const taskSetsResult = await this.db.query(query, params);
    const taskSets = taskSetsResult.rows;

    let generatedCount = 0;
    let skippedCount = 0;

    for (const ts of taskSets) {
      // Get all branches mapped to this task set
      const branchesResult = await this.db.query(
        `SELECT branch_id FROM task_set_branch WHERE task_set_id = $1`,
        [ts.id]
      );
      const branchIds = branchesResult.rows.map(r => r.branch_id);

      if (branchIds.length === 0) {
        this.logger.warn(`Task set "${ts.name}" (ID: ${ts.id}) has no assigned branches. Skipping.`);
        continue;
      }

      // Calculate period and due dates
      const { periodStart, periodEnd, dueDate } = this.calculatePeriodAndDueDate(
        ts.frequency,
        ts.start_date,
        ts.default_due_date
      );

      this.logger.log(
        `Processing task set "${ts.name}" (ID: ${ts.id}): Period ${periodStart} to ${periodEnd}, Due ${dueDate}`
      );

      for (const branchId of branchIds) {
        // Check if assignment already exists for this branch and due date
        const checkResult = await this.db.query(
          `SELECT id FROM assignment 
           WHERE task_set_id = $1 
             AND branch_id = $2 
             AND proposed_timeline = $3::DATE`,
          [ts.id, branchId, dueDate]
        );

        if (checkResult.rows.length > 0) {
          skippedCount++;
          continue;
        }

        // Create assignment record in 'Pending_Timeline' state
        const insertRes = await this.db.query(
          `INSERT INTO assignment (task_set_id, branch_id, proposed_timeline, status)
           VALUES ($1, $2, $3, 'Pending_Timeline')
           RETURNING id`,
          [ts.id, branchId, dueDate]
        );
        const newAssignmentId = insertRes.rows[0].id;

        // Populate assignment_task mapping table
        await this.db.query(
          `INSERT INTO assignment_task (assignment_id, task_id, status, due_date, proposed_due_date)
           SELECT $1, task_id, 'PENDING', $3::DATE, $3::DATE
           FROM task_set_mapping
           WHERE task_set_id = $2`,
          [newAssignmentId, ts.id, dueDate]
        );

        generatedCount++;
      }
    }

    return { generated: generatedCount, skipped: skippedCount };
  }

  // Calculate start/end dates of current compliance period and its due date
  calculatePeriodAndDueDate(
    frequency: string | null,
    startDateStr: string | null,
    defaultDueDateStr: string | null,
    refDate: Date = new Date()
  ) {
    const y = refDate.getFullYear();
    const m = refDate.getMonth(); // 0-indexed
    const d = refDate.getDate();

    let periodStart: Date;
    let periodEnd: Date;
    let dueDate: Date;

    const defaultOffsetDay = defaultDueDateStr ? new Date(defaultDueDateStr).getDate() : 15;
    const freq = frequency ? String(frequency).trim() : '6';

    switch (freq) {
      case '1': // FORTNIGHT
        if (d <= 15) {
          periodStart = new Date(y, m, 1);
          periodEnd = new Date(y, m, 15);
          dueDate = new Date(y, m, 15);
        } else {
          periodStart = new Date(y, m, 16);
          periodEnd = new Date(y, m + 1, 0); // Last day of month
          dueDate = new Date(y, m + 1, 0);
        }
        break;

      case '2': // MONTHLY
        periodStart = new Date(y, m, 1);
        periodEnd = new Date(y, m + 1, 0);
        dueDate = new Date(y, m, defaultOffsetDay);
        if (dueDate < periodStart) {
          dueDate = new Date(y, m, 15);
        }
        break;

      case '3': // QUARTERLY
        const quarter = Math.floor(m / 3);
        periodStart = new Date(y, quarter * 3, 1);
        periodEnd = new Date(y, (quarter + 1) * 3, 0);
        dueDate = new Date(y, quarter * 3, defaultOffsetDay || 30);
        break;

      case '4': // SEMI-ANNUAL
        const half = Math.floor(m / 6);
        periodStart = new Date(y, half * 6, 1);
        periodEnd = new Date(y, (half + 1) * 6, 0);
        dueDate = new Date(y, half * 6 + 1, defaultOffsetDay || 15);
        break;

      case '5': // YEARLY
        periodStart = new Date(y, 0, 1);
        periodEnd = new Date(y, 11, 31);
        dueDate = new Date(y, 2, defaultOffsetDay || 31); // E.g., Mar 31
        break;

      case '6': // ONE-TIME
      default:
        periodStart = startDateStr ? new Date(startDateStr) : new Date(y, m, d);
        periodEnd = new Date(y + 1, m, d);
        dueDate = defaultDueDateStr ? new Date(defaultDueDateStr) : new Date(y, m, d + 30);
        break;
    }

    return {
      periodStart: periodStart.toISOString().split('T')[0],
      periodEnd: periodEnd.toISOString().split('T')[0],
      dueDate: dueDate.toISOString().split('T')[0],
    };
  }
}
