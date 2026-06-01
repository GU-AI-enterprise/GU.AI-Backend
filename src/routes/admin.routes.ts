import { Router } from 'express';
import { AdminController } from '../controllers/admin.controller';
import { requireAuth, requireAdmin, requireStaff } from '../middlewares/auth.middleware';

const router = Router();
const ctrl = new AdminController();

router.use(requireAuth);

router.get('/stats', requireStaff, ctrl.getStats.bind(ctrl));
router.get('/users', requireStaff, ctrl.listUsers.bind(ctrl));
router.patch('/users/:id/role', requireAdmin, ctrl.updateRole.bind(ctrl));
router.patch('/users/:id/status', requireStaff, ctrl.updateStatus.bind(ctrl));
router.delete('/users/:id', requireAdmin, ctrl.deleteUser.bind(ctrl));
router.post('/users/:id/credits', requireStaff, ctrl.awardCredits.bind(ctrl));

export default router;
