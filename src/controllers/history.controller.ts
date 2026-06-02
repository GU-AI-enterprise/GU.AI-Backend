import { Response } from 'express';
import { AuthRequest } from '../middlewares/auth.middleware';
import { HistoryService } from '../services/history.service';
import { sendSuccess, sendError } from '../utils/response';

export class HistoryController {
  public async getHistory(req: AuthRequest, res: Response): Promise<void> {
    try {
      const userId = req.user?.id;
      if (!userId) {
        sendError(res, 401, 'Không tìm thấy thông tin xác thực người dùng.');
        return;
      }

      const jobPage = Math.max(1, parseInt(req.query.job_page as string) || 1);
      const jobLimit = Math.min(50, Math.max(1, parseInt(req.query.job_limit as string) || 10));
      const jobDateFrom = (req.query.job_date_from as string) || undefined;
      const jobDateTo = (req.query.job_date_to as string) || undefined;

      const history = await HistoryService.getUserHistory(userId, {
        jobPage,
        jobLimit,
        jobDateFrom,
        jobDateTo,
      });

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
