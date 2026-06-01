import { Router } from 'express';
import { notificationController } from '../controllers/notification.controller';
import { requireAuth } from '../middlewares/auth.middleware';

const router = Router();

router.use(requireAuth);

/**
 * @openapi
 * /api/notifications:
 *   get:
 *     summary: Lấy danh sách thông báo
 *     description: Trả về danh sách thông báo của người dùng đang đăng nhập, có hỗ trợ phân trang.
 *     tags:
 *       - Notifications
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           minimum: 1
 *           maximum: 50
 *           default: 20
 *         description: Số lượng thông báo mỗi trang (tối đa 50).
 *       - in: query
 *         name: offset
 *         schema:
 *           type: integer
 *           minimum: 0
 *           default: 0
 *         description: Vị trí bắt đầu (dùng để phân trang).
 *     responses:
 *       200:
 *         description: Danh sách thông báo.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 data:
 *                   type: object
 *                   properties:
 *                     notifications:
 *                       type: array
 *                       items:
 *                         $ref: '#/components/schemas/Notification'
 *                     total:
 *                       type: integer
 *       401:
 *         description: Chưa xác thực.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       500:
 *         description: Lỗi máy chủ nội bộ.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 */
router.get('/', notificationController.getNotifications.bind(notificationController));

/**
 * @openapi
 * /api/notifications/unread-count:
 *   get:
 *     summary: Lấy số thông báo chưa đọc
 *     description: Trả về tổng số thông báo chưa đọc của người dùng đang đăng nhập.
 *     tags:
 *       - Notifications
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Số thông báo chưa đọc.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 data:
 *                   type: object
 *                   properties:
 *                     count:
 *                       type: integer
 *                       example: 3
 *       401:
 *         description: Chưa xác thực.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       500:
 *         description: Lỗi máy chủ nội bộ.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 */
router.get('/unread-count', notificationController.getUnreadCount.bind(notificationController));

/**
 * @openapi
 * /api/notifications/read-all:
 *   patch:
 *     summary: Đánh dấu tất cả thông báo là đã đọc
 *     description: Cập nhật trạng thái tất cả thông báo chưa đọc của người dùng đang đăng nhập thành đã đọc.
 *     tags:
 *       - Notifications
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Đánh dấu tất cả đã đọc thành công.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 message:
 *                   type: string
 *                   example: Đã đánh dấu tất cả đã đọc.
 *       401:
 *         description: Chưa xác thực.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       500:
 *         description: Lỗi máy chủ nội bộ.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 */
router.patch('/read-all', notificationController.markAllRead.bind(notificationController));

/**
 * @openapi
 * /api/notifications/{id}/read:
 *   patch:
 *     summary: Đánh dấu một thông báo là đã đọc
 *     description: Cập nhật trạng thái một thông báo cụ thể thành đã đọc.
 *     tags:
 *       - Notifications
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *         description: UUID của thông báo cần đánh dấu đã đọc.
 *     responses:
 *       200:
 *         description: Đánh dấu đã đọc thành công.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 message:
 *                   type: string
 *                   example: Đã đánh dấu đã đọc.
 *       401:
 *         description: Chưa xác thực.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       500:
 *         description: Lỗi máy chủ nội bộ.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 */
router.patch('/:id/read', notificationController.markRead.bind(notificationController));

export default router;
