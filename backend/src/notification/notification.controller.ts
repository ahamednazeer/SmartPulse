import {
  Controller,
  Get,
  Patch,
  Param,
  Post,
  Query,
  Request,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { NotificationService } from './notification.service';
import type { AuthenticatedRequest } from '../auth/types/authenticated-request.type';

@Controller('notification')
@UseGuards(JwtAuthGuard)
export class NotificationController {
  constructor(private readonly notificationService: NotificationService) {}

  @Post('evaluate')
  async evaluate(@Request() req: AuthenticatedRequest) {
    return this.notificationService.evaluateAndGenerate(req.user.id);
  }

  @Get()
  async getList(
    @Request() req: AuthenticatedRequest,
    @Query('limit') limit?: string,
  ) {
    return this.notificationService.getNotifications(
      req.user.id,
      limit ? parseInt(limit, 10) : 30,
    );
  }

  @Get('unread-count')
  async unreadCount(@Request() req: AuthenticatedRequest) {
    return this.notificationService.getUnreadCount(req.user.id);
  }

  @Patch(':id/read')
  async markRead(
    @Request() req: AuthenticatedRequest,
    @Param('id') id: string,
  ) {
    return this.notificationService.markAsRead(req.user.id, id);
  }
}
