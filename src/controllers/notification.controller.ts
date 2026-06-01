import { Response } from 'express';
import { AuthRequest } from '../middlewares/auth.middleware';
import { NotificationService } from '../services/notification.service';
import { sendSuccess, sendError } from '../utils/response';

export class NotificationController {
  async getNotifications(req: AuthRequest, res: Response): Promise<void> {
    try {
      const userId = req.user!.id;
      const limit = Math.min(50, parseInt(req.query.limit as string) || 20);
      const offset = Math.max(0, parseInt(req.query.offset as string) || 0);
      const result = await NotificationService.getUserNotifications(userId, limit, offset);
      sendSuccess(res, { data: result });
    } catch (err: any) {
      sendError(res, 500, err.message);
    }
  }

  async getUnreadCount(req: AuthRequest, res: Response): Promise<void> {
    try {
      const count = await NotificationService.getUnreadCount(req.user!.id);
      sendSuccess(res, { data: { count } });
    } catch (err: any) {
      sendError(res, 500, err.message);
    }
  }

  async markRead(req: AuthRequest, res: Response): Promise<void> {
    try {
      await NotificationService.markRead(req.params.id, req.user!.id);
      sendSuccess(res, { message: 'Đã đánh dấu đã đọc.' });
    } catch (err: any) {
      sendError(res, 500, err.message);
    }
  }

  async markAllRead(req: AuthRequest, res: Response): Promise<void> {
    try {
      await NotificationService.markAllRead(req.user!.id);
      sendSuccess(res, { message: 'Đã đánh dấu tất cả đã đọc.' });
    } catch (err: any) {
      sendError(res, 500, err.message);
    }
  }
}

export const notificationController = new NotificationController();
