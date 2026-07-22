import { Injectable, Logger } from '@nestjs/common';
import { DatabaseService } from '../../core/database/database.service';
import { EmailService } from '../../core/email/email.service';
import { OnEvent } from '@nestjs/event-emitter';

@Injectable()
export class NotificationsService {
  private readonly logger = new Logger(NotificationsService.name);

  constructor(
    private readonly db: DatabaseService,
    private readonly emailService: EmailService
  ) {}

  /**
   * Fetch notifications for a given authenticated user.
   * - ADMIN / CO / CCO  → role-level notifications (branch_id IS NULL)
   * - Branch users      → notifications scoped to their branch_id
   */
  async getNotificationsForUser(userId: string, role: string, branchId: number | null) {
    let query: string;
    let args: any[];

    if (role === 'ADMIN') {
      // ADMIN sees all notifications across the system
      query = `
        SELECT * FROM notification
        ORDER BY created_at DESC
        LIMIT 50
      `;
      args = [];
    } else if (['CO', 'CCO'].includes(role)) {
      // Role-level: branch_id IS NULL (CO/CCO) or targeted user_id
      query = `
        SELECT * FROM notification
        WHERE branch_id IS NULL OR user_id = $1
        ORDER BY created_at DESC
        LIMIT 50
      `;
      args = [userId];
    } else {
      // Branch user: notifications for their branch
      query = `
        SELECT * FROM notification
        WHERE branch_id = $1
        ORDER BY created_at DESC
        LIMIT 50
      `;
      args = [branchId];
    }

    const result = await this.db.query(query, args);
    return result.rows;
  }

  async markAsRead(id: number) {
    const query = `UPDATE notification SET is_read = true WHERE id = $1 RETURNING *`;
    const result = await this.db.query(query, [id]);
    return result.rows[0];
  }

  async markAllAsReadForUser(userId: string, role: string, branchId: number | null) {
    let query: string;
    let args: any[];

    if (role === 'ADMIN') {
      // ADMIN marks all notifications in system as read
      query = `
        UPDATE notification 
        SET is_read = true 
        WHERE is_read = false
      `;
      args = [];
    } else if (['CO', 'CCO'].includes(role)) {
      query = `
        UPDATE notification 
        SET is_read = true 
        WHERE (branch_id IS NULL OR user_id = $1) AND is_read = false
      `;
      args = [userId];
    } else {
      query = `
        UPDATE notification 
        SET is_read = true 
        WHERE branch_id = $1 AND is_read = false
      `;
      args = [branchId];
    }

    await this.db.query(query, args);
    return { success: true };
  }

  @OnEvent('assignment.updated')
  async handleAssignmentUpdatedEvent(payload: {
    assignmentId: number;
    status: string;
    branchId: number;
    taskSetName: string;
    previousStatus?: string;
  }) {
    this.logger.log(`Assignment ${payload.assignmentId} updated to ${payload.status} (previous: ${payload.previousStatus})`);

    let title = '';
    let message = '';
    let emailSubject = '';
    let targetRoles: string[] = [];

    if (payload.status === 'REVIEW_PENDING') {
      title = 'Assignment Submitted';
      message = `Branch submitted assignment for "${payload.taskSetName}". Waiting for CO review.`;
      emailSubject = `[Action Required] Assignment submitted for ${payload.taskSetName}`;
      targetRoles = ['ADMIN', 'CO', 'CCO'];
    } else if (payload.status === 'ESCALATED_TO_CCO') {
      title = 'Assignment Escalated';
      message = `Assignment for "${payload.taskSetName}" has been escalated to CCO for final review.`;
      emailSubject = `[Escalation] Assignment escalated to CCO - ${payload.taskSetName}`;
      targetRoles = ['ADMIN', 'CCO'];
    } else if (payload.status === 'COMPLETED') {
      title = 'Assignment Approved';
      message = `Your assignment for "${payload.taskSetName}" was approved and marked as Completed.`;
      emailSubject = `[Approved] ${payload.taskSetName}`;
    } else if (payload.status === 'In_Progress') {
      title = 'Timeline Approved';
      message = `The proposed due dates/timeline for assignment "${payload.taskSetName}" has been approved. You can now start submitting compliance checklist items.`;
      emailSubject = `[Timeline Approved] ${payload.taskSetName}`;
    } else {
      return; // Not a status we notify for
    }

    try {
      if (payload.status === 'REVIEW_PENDING' || payload.status === 'ESCALATED_TO_CCO') {
        // Store as role-level notification (branch_id = NULL so CO/CCO/ADMIN bell picks it up)
        await this.db.query(
          `INSERT INTO notification (title, message) VALUES ($1, $2)`,
          [title, message],
        );

        // Email targeted active users based on the list
        const usersResult = await this.db.query(
          `SELECT email FROM users WHERE role = ANY($1) AND email IS NOT NULL AND is_active = true`,
          [targetRoles],
        );
        for (const row of usersResult.rows) {
          this.emailService.sendMail(
            row.email,
            emailSubject,
            message,
            `<p><strong>${title}</strong></p><p>${message}</p><p>Please login to Compliance Pro to review.</p>`,
          ).catch(err => this.logger.error(`Failed to send email to ${row.email}`, err));
        }
      } else {
        const branchId = payload.branchId || (payload as any).branch_id || null;
        // COMPLETED: notify the branch
        await this.db.query(
          `INSERT INTO notification (branch_id, title, message) VALUES ($1, $2, $3)`,
          [branchId, title, message],
        );

        // Email all active users of that branch
        const usersResult = await this.db.query(
          `SELECT email FROM users WHERE branch_id = $1 AND email IS NOT NULL AND is_active = true`,
          [branchId],
        );
        for (const row of usersResult.rows) {
          this.emailService.sendMail(
            row.email,
            emailSubject,
            message,
            `<p><strong>${title}</strong></p><p>${message}</p><p>Please login to Compliance Pro to view details.</p>`,
          ).catch(err => this.logger.error(`Failed to send email to ${row.email}`, err));
        }
      }

      // If CCO approved/completed an escalated assignment, also notify CO and ADMIN
      if (payload.status === 'COMPLETED' && payload.previousStatus === 'ESCALATED_TO_CCO') {
        const coTitle = 'Assignment Approved by CCO';
        const coMessage = `Chief Compliance Officer has approved the escalated assignment "${payload.taskSetName}".`;
        const coEmailSubject = `[Approved] CCO approved escalated assignment: ${payload.taskSetName}`;

        await this.db.query(
          `INSERT INTO notification (title, message) VALUES ($1, $2)`,
          [coTitle, coMessage],
        );

        const coUsersResult = await this.db.query(
          `SELECT email FROM users WHERE role IN ('ADMIN', 'CO') AND email IS NOT NULL AND is_active = true`,
          [],
        );
        for (const row of coUsersResult.rows) {
          this.emailService.sendMail(
            row.email,
            coEmailSubject,
            coMessage,
            `<p><strong>${coTitle}</strong></p><p>${coMessage}</p><p>Please login to Compliance Pro to view details.</p>`,
          ).catch(err => this.logger.error(`Failed to send CCO approval email to CO ${row.email}`, err));
        }
      }
    } catch (error) {
      this.logger.error('Error handling assignment update notification', error);
    }
  }

  // Dedicated handler for CO/CCO rejections with review remark included
  @OnEvent('assignment.rejected')
  async handleAssignmentRejectedEvent(payload: {
    assignmentId: number;
    branchId: number;
    taskSetName: string;
    reviewRemark: string;
    previousStatus?: string;
  }) {
    this.logger.log(`Assignment ${payload.assignmentId} REJECTED — notifying branch ${payload.branchId} (previous: ${payload.previousStatus})`);

    const remarkPart = payload.reviewRemark
      ? ` Reviewer feedback: "${payload.reviewRemark}"`
      : '';

    const title = '🔴 Re-compliance Required';
    const message = `Your submission for "${payload.taskSetName}" has been returned for re-compliance.${remarkPart} Please login and resubmit the flagged tasks.`;
    const emailSubject = `[Action Required] Re-compliance Needed — ${payload.taskSetName}`;

    const branchId = payload.branchId || (payload as any).branch_id || null;

    try {
      await this.db.query(
        `INSERT INTO notification (branch_id, title, message) VALUES ($1, $2, $3)`,
        [branchId, title, message]
      );

      const usersResult = await this.db.query(
        `SELECT email FROM users WHERE branch_id = $1 AND email IS NOT NULL AND is_active = true`,
        [branchId]
      );
      for (const row of usersResult.rows) {
        this.emailService.sendMail(
          row.email,
          emailSubject,
          message,
          `<p><strong>${title}</strong></p><p>${message}</p><p>Please login to Compliance Pro to view and resubmit.</p>`
        ).catch(err => this.logger.error(`Failed to send rejection email to ${row.email}`, err));
      }

      // If CCO returned an escalated assignment to branch, also notify CO and ADMIN
      if (payload.previousStatus === 'ESCALATED_TO_CCO') {
        const coTitle = 'Escalated Assignment Returned';
        const coMessage = `Chief Compliance Officer returned the escalated assignment "${payload.taskSetName}" to the branch for re-compliance. Remarks: "${payload.reviewRemark || ''}"`;
        const coEmailSubject = `[Returned] CCO returned escalated assignment: ${payload.taskSetName}`;

        await this.db.query(
          `INSERT INTO notification (title, message) VALUES ($1, $2)`,
          [coTitle, coMessage],
        );

        const coUsersResult = await this.db.query(
          `SELECT email FROM users WHERE role IN ('ADMIN', 'CO') AND email IS NOT NULL AND is_active = true`,
          [],
        );
        for (const row of coUsersResult.rows) {
          this.emailService.sendMail(
            row.email,
            coEmailSubject,
            coMessage,
            `<p><strong>${coTitle}</strong></p><p>${coMessage}</p><p>Please login to Compliance Pro to view details.</p>`,
          ).catch(err => this.logger.error(`Failed to send CCO return email to CO ${row.email}`, err));
        }
      }
    } catch (error) {
      this.logger.error('Error handling assignment rejected notification', error);
    }
  }

  @OnEvent('timeline.task_reviewed')
  async handleTimelineTaskReviewedEvent(payload: {
    assignmentId: number;
    assignmentTaskId: number;
    status: 'APPROVED' | 'REJECTED';
    remark: string;
    branchId: number;
    taskSetName: string;
    taskDescription: string;
  }) {
    this.logger.log(`Task timeline for task ${payload.assignmentTaskId} reviewed: ${payload.status}`);

    const statusText = payload.status === 'APPROVED' ? 'Accepted' : 'Rejected';
    const title = `Task Proposed Date ${statusText}`;
    const message = `The proposed due date for task "${payload.taskDescription}" in "${payload.taskSetName}" has been ${statusText.toLowerCase()}.${payload.remark ? ' Remarks: "' + payload.remark + '"' : ''}`;
    const emailSubject = `[Timeline ${statusText}] ${payload.taskSetName} - ${payload.taskDescription}`;
    
    try {
      const branchId = payload.branchId;
      // Store notification in database for the branch
      await this.db.query(
        `INSERT INTO notification (branch_id, title, message) VALUES ($1, $2, $3)`,
        [branchId, title, message],
      );

      // Email all active users of that branch
      const usersResult = await this.db.query(
        `SELECT email FROM users WHERE branch_id = $1 AND email IS NOT NULL AND is_active = true`,
        [branchId],
      );
      for (const row of usersResult.rows) {
        this.emailService.sendMail(
          row.email,
          emailSubject,
          message,
          `<p><strong>${title}</strong></p><p>${message}</p><p>Please login to Compliance Pro to view details.</p>`,
        ).catch(err => this.logger.error(`Failed to send email to ${row.email}`, err));
      }
    } catch (error) {
      this.logger.error('Failed to send task timeline review notification', error);
    }
  }
}
