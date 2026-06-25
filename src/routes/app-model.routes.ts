import { Router } from 'express';
import { AppModelController } from '../controllers/app-model.controller';
import { requireAuth } from '../middlewares/auth.middleware';

const router = Router();
const ctrl = new AppModelController();

router.use(requireAuth);

// GET /api/models — danh sách người mẫu của app, kèm cờ unlocked theo tier của user
router.get('/', ctrl.list.bind(ctrl));

export default router;
