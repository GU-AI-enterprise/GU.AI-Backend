import { Response } from 'express';
import { AuthRequest } from '../middlewares/auth.middleware';
import { HistoryService } from '../services/history.service';
import { sendSuccess, sendError } from '../utils/response';

export class HistoryController {
  // Lấy toàn bộ lịch sử tác vụ kết hợp của người dùng hiện tại
  public async getHistory(req: AuthRequest, res: Response): Promise<void> {
    try {
      const userId = req.user?.id;
      if (!userId) {
        sendError(res, 401, 'Không tìm thấy thông tin xác thực người dùng.');
        return;
      }

      const history = await HistoryService.getUserHistory(userId);
      sendSuccess(res, {
        message: 'Lấy lịch sử tác vụ thành công.',
        data: history,
      });
    } catch (err: any) {
      sendError(res, 500, err.message);
    }
  }
}
export const historyController = new HistoryController();
