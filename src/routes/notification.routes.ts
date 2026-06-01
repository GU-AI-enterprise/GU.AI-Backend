import { Router } from 'express';
import { notificationController } from '../controllers/notification.controller';
import { requireAuth } from '../middlewares/auth.middleware';

const router = Router();

router.use(requireAuth);

router.get('/',                notificationController.getNotifications.bind(notificationController));
router.get('/unread-count',    notificationController.getUnreadCount.bind(notificationController));
router.patch('/read-all',      notificationController.markAllRead.bind(notificationController));
router.patch('/:id/read',      notificationController.markRead.bind(notificationController));

export default router;
