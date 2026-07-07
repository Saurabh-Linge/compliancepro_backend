import { Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { UsersService } from '../users/users.service';
import * as bcrypt from 'bcrypt';
import { EmailService } from '../../core/email/email.service';

@Injectable()
export class AuthService {
  private readonly otpStore = new Map<
    string,
    { code: string; expires: number }
  >();

  constructor(
    private readonly usersService: UsersService,
    private readonly jwtService: JwtService,
    private readonly emailService: EmailService,
  ) {}

  async validateUser(username: string, pass: string): Promise<any> {
    const user = await this.usersService.findByUsername(username);

    if (!user) {
      throw new UnauthorizedException(`User '${username}' not found or inactive`);
    }

    let isValid = false;

    if (
      user.password_hash &&
      (user.password_hash.startsWith('$2a$') ||
        user.password_hash.startsWith('$2b$') ||
        user.password_hash.startsWith('$2y$'))
    ) {
      isValid = await bcrypt.compare(pass, user.password_hash);
    } else {
      isValid = pass === user.password_hash;
    }

    if (!isValid) {
      throw new UnauthorizedException(`Incorrect password for user '${username}'`);
    }

    const { password_hash, ...result } = user;
    return result;
  }

  async login(
    username: string,
    pass: string,
    ipAddress?: string,
    enable2fa?: boolean,
  ) {
    console.log(
      `[AuthService] Login attempt for user: "${username}", enable2fa: ${enable2fa}`,
    );
    const user = await this.validateUser(username, pass);

    if (enable2fa) {
      const email = user.email;
      console.log(
        `[AuthService] User found. Email registered in DB: "${email}"`,
      );
      if (!email) {
        console.warn(
          `[AuthService] Login failed: No email set for user: "${username}"`,
        );
        throw new UnauthorizedException(
          'No email address registered for this account',
        );
      }

      // Generate 6-digit OTP
      const code = Math.floor(100000 + Math.random() * 900000).toString();
      const expires = Date.now() + 5 * 60 * 1000; // 5 minutes expiration
      this.otpStore.set(username, { code, expires });
      console.log(
        `[AuthService] Generated 2FA verification code: "${code}" for user: "${username}". Expires at: ${new Date(expires).toLocaleTimeString()}`,
      );

      // Send the email
      console.log(`[AuthService] Dispatching 2FA email to: "${email}"`);
      const mailHtml = `
        <div style="font-family: Arial, sans-serif; padding: 20px; border: 1px solid #eee; border-radius: 5px;">
          <h2 style="color: #333;">AuditPro Security Verification</h2>
          <p>You are attempting to log in to AuditPro. Use the following verification code to complete your sign-in:</p>
          <div style="font-size: 24px; font-weight: bold; background-color: #f7f7f7; padding: 10px 20px; border-radius: 4px; display: inline-block; letter-spacing: 2px; color: #4F46E5;">
            ${code}
          </div>
          <p style="margin-top: 20px; color: #666; font-size: 12px;">This code will expire in 5 minutes. If you did not request this code, please secure your account immediately.</p>
        </div>
      `;
      await this.emailService.sendMail(
        email,
        'Your 2FA Verification Code',
        `Your verification code is: ${code}. It will expire in 5 minutes.`,
        mailHtml,
      );
      console.log(`[AuthService] 2FA email dispatched successfully.`);

      return {
        requires2fa: true,
        username,
        emailMasked: this.maskEmail(email),
      };
    }

    return this.generateLoginResponse(user, ipAddress);
  }

  async verify2fa(username: string, code: string, ipAddress?: string) {
    const entry = this.otpStore.get(username);
    if (!entry) {
      throw new UnauthorizedException('No active verification code found');
    }

    if (Date.now() > entry.expires) {
      this.otpStore.delete(username);
      throw new UnauthorizedException('Verification code has expired');
    }

    if (entry.code !== code) {
      throw new UnauthorizedException('Invalid verification code');
    }

    this.otpStore.delete(username);

    const user = await this.usersService.findByUsername(username);
    if (!user) {
      throw new UnauthorizedException('User not found');
    }

    return this.generateLoginResponse(user, ipAddress);
  }

  private maskEmail(email: string): string {
    const parts = email.split('@');
    if (parts.length !== 2) return email;
    const name = parts[0];
    const domain = parts[1];
    if (name.length <= 2) return `**@${domain}`;
    return `${name.substring(0, 2)}***${name.substring(name.length - 2)}@${domain}`;
  }

  // Refactored to global EmailService.

  private async generateLoginResponse(user: any, ipAddress?: string) {
    const payload = {
      username: user.username,
      sub: user.id,
      fullName: user.full_name,
      role: user.role,
      branchId: user.branch_id,
    };

    return {
      access_token: this.jwtService.sign(payload),
      user: {
        id: user.id,
        username: user.username,
        full_name: user.full_name,
        fullName: user.full_name,
        name: user.full_name,
        role: user.role,
        designation: user.role,
        branch_id: user.branch_id,
        branchId: user.branch_id,
        branch_name: user.branch_name,
        branchName: user.branch_name,
      },
    };
  }

  async logout(employeeId: number, ipAddress?: string) {
    // Audit log removed
  }
}
