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

    const authorityReportsQuery = `
      SELECT 
        a.id, 
        a.name,
        (SELECT count(*) FROM circular c WHERE c.authority_id = a.id) as applicable_circulars,
        (SELECT count(at.id) 
         FROM assignment_task at 
         JOIN compliance_task ct ON at.task_id = ct.id 
         JOIN circular c ON ct.circular_id = c.id 
         WHERE c.authority_id = a.id) as total_tasks,
        (SELECT count(at.id) 
         FROM assignment_task at 
         JOIN compliance_task ct ON at.task_id = ct.id 
         JOIN circular c ON ct.circular_id = c.id 
         WHERE c.authority_id = a.id AND at.status = 'COMPLETED') as completed_tasks,
        (SELECT count(at.id) 
         FROM assignment_task at 
         JOIN compliance_task ct ON at.task_id = ct.id 
         JOIN circular c ON ct.circular_id = c.id 
         WHERE c.authority_id = a.id AND at.status = 'PENDING') as pending_tasks,
        (SELECT count(at.id) 
         FROM assignment_task at 
         JOIN compliance_task ct ON at.task_id = ct.id 
         JOIN circular c ON ct.circular_id = c.id 
         JOIN assignment assign ON at.assignment_id = assign.id
         WHERE c.authority_id = a.id AND at.status = 'PENDING' AND assign.proposed_timeline < CURRENT_DATE AND assign.status != 'COMPLETED') as overdue_tasks,
        (SELECT COALESCE(sum(c.penalty_amount), 0) FROM circular c WHERE c.authority_id = a.id AND c.is_penalty_applicable = TRUE) as total_penalty
      FROM authority a
      ORDER BY a.id ASC
    `;

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
      authorityStats,
      branchesCountRes,
      headOfficeCountRes,
      pendingComplianceTasksRes,
      overdueTasksRes,
      authorityReportsRes
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
      this.db.query(`SELECT a.name, count(c.id) as count FROM authority a LEFT JOIN circular c ON c.authority_id = a.id GROUP BY a.name`),
      this.db.query("SELECT count(*) as count FROM branch_dept WHERE type = 'BRANCH'"),
      this.db.query("SELECT count(*) as count FROM branch_dept WHERE type = 'DEPARTMENT'"),
      this.db.query("SELECT count(*) as count FROM assignment WHERE status = 'ESCALATED_TO_CCO'"),
      this.db.query(`
        SELECT count(at.id) as count 
        FROM assignment_task at 
        JOIN assignment a ON at.assignment_id = a.id 
        WHERE at.status = 'PENDING' AND a.proposed_timeline < CURRENT_DATE AND a.status != 'COMPLETED'
      `),
      this.db.query(authorityReportsQuery)
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
      authorityStats: authorityStats.rows,
      coMetrics: role === 'CO' && userId ? await (async () => {
        const [
          coBranchesCount,
          coHeadOfficeCount,
          coPendingCompliance,
          coOverdue,
          coBranchReports,
          coAwaitingAction
        ] = await Promise.all([
          this.db.query("SELECT count(*) as count FROM branch_dept WHERE co_user_id = $1 AND type = 'BRANCH'", [userId]),
          this.db.query("SELECT count(*) as count FROM branch_dept WHERE co_user_id = $1 AND type = 'DEPARTMENT'", [userId]),
          this.db.query(`
            SELECT count(at.id) as count
            FROM assignment_task at
            JOIN assignment a ON at.assignment_id = a.id
            JOIN branch_dept bd ON a.branch_id = bd.id
            WHERE bd.co_user_id = $1 AND at.status = 'PENDING'
          `, [userId]),
          this.db.query(`
            SELECT count(at.id) as count
            FROM assignment_task at
            JOIN assignment a ON at.assignment_id = a.id
            JOIN branch_dept bd ON a.branch_id = bd.id
            WHERE bd.co_user_id = $1 AND at.status = 'PENDING' AND a.proposed_timeline < CURRENT_DATE AND a.status != 'COMPLETED'
          `, [userId]),
          this.db.query(`
            SELECT 
              bd.id,
              bd.name,
              bd.type,
              (SELECT count(*) FROM assignment a WHERE a.branch_id = bd.id) as total_assignments,
              (SELECT count(*) FROM assignment a WHERE a.branch_id = bd.id AND a.status = 'COMPLETED') as completed_assignments,
              (SELECT count(*) FROM assignment a WHERE a.branch_id = bd.id AND a.status = 'REVIEW_PENDING') as review_pending_assignments,
              (SELECT count(*) FROM assignment a WHERE a.branch_id = bd.id AND a.status = 'In_Progress') as active_assignments,
              (SELECT count(*) FROM assignment a WHERE a.branch_id = bd.id AND a.proposed_timeline < CURRENT_DATE AND a.status != 'COMPLETED') as overdue_assignments
            FROM branch_dept bd
            WHERE bd.co_user_id = $1
            ORDER BY bd.name ASC
          `, [userId]),
          this.db.query(`
            SELECT 
              a.id as assignment_id,
              ts.name as task_set_name,
              bd.name as branch_name,
              a.status,
              a.proposed_timeline::TEXT as proposed_timeline
            FROM assignment a
            JOIN task_set ts ON ts.id = a.task_set_id
            JOIN branch_dept bd ON bd.id = a.branch_id
            WHERE bd.co_user_id = $1 AND a.status IN ('Timeline_Review', 'REVIEW_PENDING')
            ORDER BY a.id DESC
            LIMIT 10
          `, [userId])
        ]);

        return {
          totalBranches: parseInt(coBranchesCount.rows[0]?.count || '0', 10),
          totalHeadOffice: parseInt(coHeadOfficeCount.rows[0]?.count || '0', 10),
          pendingCompliance: parseInt(coPendingCompliance.rows[0]?.count || '0', 10),
          totalOverdue: parseInt(coOverdue.rows[0]?.count || '0', 10),
          branchReports: coBranchReports.rows.map((row: any) => ({
            ...row,
            total_assignments: parseInt(row.total_assignments || '0', 10),
            completed_assignments: parseInt(row.completed_assignments || '0', 10),
            review_pending_assignments: parseInt(row.review_pending_assignments || '0', 10),
            active_assignments: parseInt(row.active_assignments || '0', 10),
            overdue_assignments: parseInt(row.overdue_assignments || '0', 10)
          })),
          awaitingActionQueue: coAwaitingAction.rows
        };
      })() : null,
      ccoMetrics: {
        totalBranches: parseInt(branchesCountRes.rows[0]?.count || '0', 10),
        totalHeadOffice: parseInt(headOfficeCountRes.rows[0]?.count || '0', 10),
        pendingCompliance: parseInt(pendingComplianceTasksRes.rows[0]?.count || '0', 10),
        totalOverdue: parseInt(overdueTasksRes.rows[0]?.count || '0', 10),
        authorityReports: authorityReportsRes.rows.map((row: any) => ({
          ...row,
          applicable_circulars: parseInt(row.applicable_circulars || '0', 10),
          total_tasks: parseInt(row.total_tasks || '0', 10),
          completed_tasks: parseInt(row.completed_tasks || '0', 10),
          pending_tasks: parseInt(row.pending_tasks || '0', 10),
          overdue_tasks: parseInt(row.overdue_tasks || '0', 10),
          total_penalty: parseFloat(row.total_penalty || '0')
        }))
      }
    };
  }
}
