import { Injectable } from '@nestjs/common';
import { DatabaseService } from '../../core/database/database.service';

@Injectable()
export class DashboardService {
  constructor(private readonly db: DatabaseService) {}

  async getStats(user: any) {
    const role = user?.role;
    const userId = user?.sub;
    const branchId = user?.branch_id;

    // Base queries
    let assignmentStatsQuery = `
      SELECT 
        count(*) as total,
        sum(case when status = 'COMPLETED' then 1 else 0 end) as completed,
        sum(case when status = 'In_Progress' then 1 else 0 end) as in_progress,
        sum(case when status = 'REVIEW_PENDING' then 1 else 0 end) as review_pending,
        sum(case when status = 'Pending_Timeline' then 1 else 0 end) as pending_timeline,
        sum(case when status = 'Timeline_Review' then 1 else 0 end) as timeline_review,
        sum(case when status = 'ESCALATED_TO_CCO' then 1 else 0 end) as escalated
      FROM assignment a
    `;
    let assignmentParams: any[] = [];
    
    let recentAssignmentsQuery = `
      SELECT a.id, a.status, a.proposed_timeline, 
             ts.name as task_set_name, bd.name as branch_name
      FROM assignment a
      JOIN task_set ts ON ts.id = a.task_set_id
      JOIN branch_dept bd ON bd.id = a.branch_id
    `;
    let recentAssignmentsParams: any[] = [];

    // Role-based filtering
    if (role === 'CO' && userId) {
      assignmentStatsQuery += ` JOIN branch_dept bd ON bd.id = a.branch_id WHERE bd.co_user_id = $1`;
      assignmentParams.push(userId);
      recentAssignmentsQuery += ` WHERE bd.co_user_id = $1 ORDER BY a.id DESC LIMIT 8`;
      recentAssignmentsParams.push(userId);
    } else if (role === 'BRANCH_USER' && branchId) {
      assignmentStatsQuery += ` WHERE a.branch_id = $1`;
      assignmentParams.push(branchId);
      recentAssignmentsQuery += ` WHERE a.branch_id = $1 ORDER BY a.id DESC LIMIT 8`;
      recentAssignmentsParams.push(branchId);
    } else {
      recentAssignmentsQuery += ` ORDER BY a.id DESC LIMIT 8`;
    }

    const [
      circularCount,
      taskCount,
      pendingTaskCount,
      approvedTaskCount,
      taskSetCount,
      branchCount,
      recentCirculars,
      assignmentStats,
      recentAssignments,
      authorityStats
    ] = await Promise.all([
      this.db.query('SELECT count(*) as count FROM circular'),
      this.db.query('SELECT count(*) as count FROM compliance_task'),
      this.db.query("SELECT count(*) as count FROM compliance_task WHERE status = 'PENDING'"),
      this.db.query("SELECT count(*) as count FROM compliance_task WHERE status = 'APPROVED'"),
      this.db.query('SELECT count(*) as count FROM task_set'),
      this.db.query('SELECT count(*) as count FROM branch_dept'),
      this.db.query(`
        SELECT c.id, c.title, c.published_date, a.name as authority_name
        FROM circular c
        JOIN authority a ON a.id = c.authority_id
        ORDER BY c.id DESC LIMIT 5
      `),
      this.db.query(assignmentStatsQuery, assignmentParams),
      this.db.query(recentAssignmentsQuery, recentAssignmentsParams),
      this.db.query(`SELECT a.name, count(c.id) as count FROM authority a LEFT JOIN circular c ON c.authority_id = a.id GROUP BY a.name`)
    ]);

    const stats = assignmentStats.rows[0] || {};

    return {
      circulars: parseInt(circularCount.rows[0]?.count || '0'),
      tasks: parseInt(taskCount.rows[0]?.count || '0'),
      pendingTasks: parseInt(pendingTaskCount.rows[0]?.count || '0'),
      approvedTasks: parseInt(approvedTaskCount.rows[0]?.count || '0'),
      taskSets: parseInt(taskSetCount.rows[0]?.count || '0'),
      branches: parseInt(branchCount.rows[0]?.count || '0'),
      assignments: {
        total: parseInt(stats.total || '0'),
        completed: parseInt(stats.completed || '0'),
        inProgress: parseInt(stats.in_progress || '0'),
        reviewPending: parseInt(stats.review_pending || '0'),
        pendingTimeline: parseInt(stats.pending_timeline || '0'),
        timelineReview: parseInt(stats.timeline_review || '0'),
        escalated: parseInt(stats.escalated || '0'),
      },
      recentCirculars: recentCirculars.rows,
      recentAssignments: recentAssignments.rows,
      authorityStats: authorityStats.rows
    };
  }
}
