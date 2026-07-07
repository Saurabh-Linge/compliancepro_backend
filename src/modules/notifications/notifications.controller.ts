import { Controller, Get, Put, Param, Req } from '@nestjs/common';
import { NotificationsService } from './notifications.service';

@Controller('notifications')
export class NotificationsController {
  constructor(private readonly notificationsService: NotificationsService) {}

  @Get()
  async getNotifications(@Req() req: any) {
    // req.user is set by JwtAuthGuard from the Bearer token
    const user = req.user;
    const userId: string = user?.sub || user?.id || '';
    const role: string = user?.role || '';
    const branchId: number | null = user?.branchId ? Number(user.branchId) : null;

    return this.notificationsService.getNotificationsForUser(userId, role, branchId);
  }

  @Put(':id/read')
  async markAsRead(@Param('id') id: string) {
    return this.notificationsService.markAsRead(parseInt(id, 10));
  }
}
