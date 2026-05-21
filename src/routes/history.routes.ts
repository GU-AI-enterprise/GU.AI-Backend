import { Router } from 'express';
import { historyController } from '../controllers/history.controller';
import { requireAuth } from '../middlewares/auth.middleware';

const router = Router();

// Tất cả các tuyến đường liên quan đến lịch sử đều cần được xác thực
router.use(requireAuth);

router.get('/', historyController.getHistory);

export default router;
