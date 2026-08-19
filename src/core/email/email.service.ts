import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as nodemailer from 'nodemailer';

@Injectable()
export class EmailService {
  private readonly logger = new Logger(EmailService.name);
  private transporter: nodemailer.Transporter;

  constructor(private readonly configService: ConfigService) {
    this.initTransporter();
  }

  private initTransporter() {
    const host = this.configService.get<string>('SMTP_HOST');
    const port = this.configService.get<number>('SMTP_PORT');
    const user = this.configService.get<string>('SMTP_USER');
    const pass = this.configService.get<string>('SMTP_PASS');

    this.transporter = nodemailer.createTransport({
      host,
      port,
      secure: port === 465, // true for 465, false for other ports
      auth: {
        user,
        pass,
      },
    });
  }

  async sendMail(
    to: string,
    subject: string,
    text: string,
    html?: string,
  ): Promise<boolean> {
    const isEnabled = this.configService.get<string>('EMAIL_NOTIFICATIONS_ENABLED') === 'true';
    if (!isEnabled) {
      this.logger.log(`[EmailService] Email notifications are disabled in .env. Skipping email to ${to}`);
      return true;
    }
    const fromEmail = this.configService.get<string>(
      'SMTP_FROM_EMAIL',
      'lukman@kredpool.com',
    );
    const fromName = this.configService.get<string>(
      'SMTP_FROM_NAME',
      'AuditPro Security',
    );

    const mailOptions = {
      from: `"${fromName}" <${fromEmail}>`,
      to,
      subject,
      text,
      html: html || text,
    };

    try {
      this.logger.log(
        `[EmailService] Contacting SMTP host to send email to "${to}"...`,
      );
      const info = await this.transporter.sendMail(mailOptions);
      this.logger.log(
        `[EmailService] SMTP sendMail success! Message ID: ${info.messageId}, Response: ${info.response}`,
      );
      return true;
    } catch (error) {
      this.logger.error(
        `[EmailService] Failed to send email to "${to}":`,
        error,
      );
      throw new Error(`Email sending failed: ${error.message}`);
    }
  }
}
