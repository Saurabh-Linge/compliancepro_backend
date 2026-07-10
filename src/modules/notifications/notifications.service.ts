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
    const isRoleUser = ['ADMIN', 'CO', 'CCO'].includes(role);

    let query: string;
    let args: any[];

    if (isRoleUser) {
      // Role-level: branch_id IS NULL (notifications sent to CO/ADMIN)
      // or explicitly targeted at this user_id
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

  // Listen for assignment status changes emitted by AssignmentsService
  @OnEvent('assignment.updated')
  async handleAssignmentUpdatedEvent(payload: {
    assignmentId: number;
    status: string;
    branchId: number;
    taskSetName: string;
  }) {
    this.logger.log(`Assignment ${payload.assignmentId} updated to ${payload.status}`);

    let title = '';
    let message = '';
    let emailSubject = '';

    if (payload.status === 'REVIEW_PENDING') {
      title = 'Evidence Submitted';
      message = `Branch submitted evidence for ${payload.taskSetName}. Waiting for CO review.`;
      emailSubject = `[Action Required] Evidence submitted for ${payload.taskSetName}`;
    } else if (payload.status === 'COMPLETED') {
      title = 'Assignment Approved';
      message = `Your assignment for ${payload.taskSetName} was approved by the Compliance Officer.`;
      emailSubject = `[Approved] ${payload.taskSetName}`;
    } else if (payload.status === 'REJECTED') {
      title = 'Assignment Rejected';
      message = `Your assignment for ${payload.taskSetName} was rejected. Please review feedback and resubmit.`;
      emailSubject = `[Action Required] Rejected - ${payload.taskSetName}`;
    } else {
      return; // Not a status we notify for
    }

    try {
      if (payload.status === 'REVIEW_PENDING') {
        // Store as role-level notification (branch_id = NULL so CO/ADMIN bell picks it up)
        await this.db.query(
          `INSERT INTO notification (title, message) VALUES ($1, $2)`,
          [title, message],
        );

        // Email all active CO/ADMIN/CCO users
        const usersResult = await this.db.query(
          `SELECT email FROM users WHERE role IN ('ADMIN', 'CO', 'CCO') AND email IS NOT NULL AND is_active = true`,
          [],
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
        // COMPLETED or REJECTED: notify the branch
        await this.db.query(
          `INSERT INTO notification (branch_id, title, message) VALUES ($1, $2, $3)`,
          [payload.branchId, title, message],
        );

        // Email all active users of that branch
        const usersResult = await this.db.query(
          `SELECT email FROM users WHERE branch_id = $1 AND email IS NOT NULL AND is_active = true`,
          [payload.branchId],
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
  }) {
    this.logger.log(`Assignment ${payload.assignmentId} REJECTED — notifying branch ${payload.branchId}`);

    const remarkPart = payload.reviewRemark
      ? ` Reviewer feedback: "${payload.reviewRemark}"`
      : '';

    const title = '🔴 Re-compliance Required';
    const message = `Your submission for "${payload.taskSetName}" has been returned for re-compliance.${remarkPart} Please login and resubmit the flagged tasks.`;
    const emailSubject = `[Action Required] Re-compliance Needed — ${payload.taskSetName}`;

    try {
      await this.db.query(
        `INSERT INTO notification (branch_id, title, message) VALUES ($1, $2, $3)`,
        [payload.branchId, title, message]
      );

      const usersResult = await this.db.query(
        `SELECT email FROM users WHERE branch_id = $1 AND email IS NOT NULL AND is_active = true`,
        [payload.branchId]
      );
      for (const row of usersResult.rows) {
        this.emailService.sendMail(
          row.email,
          emailSubject,
          message,
          `<p><strong>${title}</strong></p><p>${message}</p><p>Please login to Compliance Pro to view and resubmit.</p>`
        ).catch(err => this.logger.error(`Failed to send rejection email to ${row.email}`, err));
      }
    } catch (error) {
      this.logger.error('Error handling assignment rejected notification', error);
    }
  }
}
