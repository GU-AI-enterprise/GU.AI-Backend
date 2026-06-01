import { Router } from 'express';
import { SupportController } from '../controllers/support.controller';
import { requireAuth, requireStaff } from '../middlewares/auth.middleware';

const router = Router();
const supportController = new SupportController();

router.use(requireAuth);

/**
 * @openapi
 * /api/support/me:
 *   get:
 *     summary: Lấy cuộc hội thoại hỗ trợ của người dùng hiện tại
 *     description: |
 *       Trả về cuộc hội thoại hỗ trợ đang mở (status: open hoặc pending) của người dùng.
 *       Nếu chưa có cuộc hội thoại nào, hệ thống sẽ tự động tạo một cuộc hội thoại mới.
 *       Kết quả bao gồm đầy đủ thông tin conversation và danh sách tin nhắn.
 *     tags:
 *       - Support
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Cuộc hội thoại và danh sách tin nhắn.
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
 *                     conversation:
 *                       $ref: '#/components/schemas/SupportConversation'
 *                     messages:
 *                       type: array
 *                       items:
 *                         $ref: '#/components/schemas/SupportMessage'
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
router.get('/me', supportController.getMyConversation.bind(supportController));

/**
 * @openapi
 * /api/support/conversations:
 *   get:
 *     summary: Lấy danh sách tất cả cuộc hội thoại hỗ trợ
 *     description: Trả về tất cả cuộc hội thoại hỗ trợ trong hệ thống, có thể lọc theo trạng thái. Yêu cầu quyền staff hoặc admin.
 *     tags:
 *       - Support
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: status
 *         schema:
 *           type: string
 *           enum: [all, open, pending, resolved, closed]
 *         description: Lọc theo trạng thái cuộc hội thoại.
 *     responses:
 *       200:
 *         description: Danh sách cuộc hội thoại hỗ trợ.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 data:
 *                   type: array
 *                   items:
 *                     $ref: '#/components/schemas/SupportConversation'
 *       401:
 *         description: Chưa xác thực.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       403:
 *         description: Không có quyền truy cập (yêu cầu staff hoặc admin).
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
router.get('/conversations', requireStaff, supportController.getConversations.bind(supportController));

/**
 * @openapi
 * /api/support/conversations/{conversationId}:
 *   get:
 *     summary: Lấy chi tiết cuộc hội thoại và tin nhắn
 *     description: |
 *       Trả về thông tin chi tiết của một cuộc hội thoại cùng toàn bộ tin nhắn.
 *       Người dùng customer chỉ có thể xem cuộc hội thoại của mình; staff/admin có thể xem tất cả.
 *     tags:
 *       - Support
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: conversationId
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *         description: UUID của cuộc hội thoại.
 *     responses:
 *       200:
 *         description: Chi tiết cuộc hội thoại và danh sách tin nhắn.
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
 *                     conversation:
 *                       $ref: '#/components/schemas/SupportConversation'
 *                     messages:
 *                       type: array
 *                       items:
 *                         $ref: '#/components/schemas/SupportMessage'
 *       401:
 *         description: Chưa xác thực.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       403:
 *         description: Không có quyền truy cập cuộc hội thoại này.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       404:
 *         description: Không tìm thấy cuộc hội thoại.
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
router.get('/conversations/:conversationId', supportController.getConversationMessages.bind(supportController));

/**
 * @openapi
 * /api/support/conversations/{conversationId}/messages:
 *   post:
 *     summary: Gửi tin nhắn trong cuộc hội thoại
 *     description: |
 *       Gửi một tin nhắn văn bản vào cuộc hội thoại hỗ trợ.
 *
 *       **Quy tắc phân công:**
 *       - Khi staff/admin gửi tin nhắn đầu tiên vào một cuộc hội thoại chưa được phân công, họ sẽ tự động được gán là người phụ trách.
 *       - Nếu cuộc hội thoại đã được phân công cho staff khác, chỉ staff đó (hoặc admin) mới có thể trả lời.
 *
 *       Tin nhắn được broadcast realtime qua Socket.IO.
 *     tags:
 *       - Support
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: conversationId
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *         description: UUID của cuộc hội thoại.
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - content
 *             properties:
 *               content:
 *                 type: string
 *                 description: Nội dung tin nhắn.
 *             example:
 *               content: Xin chào, tôi cần hỗ trợ về credits của mình.
 *     responses:
 *       201:
 *         description: Gửi tin nhắn thành công.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 data:
 *                   $ref: '#/components/schemas/SupportMessage'
 *       400:
 *         description: Thiếu nội dung tin nhắn.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       401:
 *         description: Chưa xác thực.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       403:
 *         description: Không có quyền gửi tin nhắn trong cuộc hội thoại này.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       404:
 *         description: Không tìm thấy cuộc hội thoại.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       409:
 *         description: Cuộc hội thoại đã được nhận bởi staff khác.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: false
 *                 error:
 *                   type: string
 *                   example: Cuộc hội thoại này đã được nhận bởi một staff khác.
 *                 data:
 *                   type: object
 *                   properties:
 *                     assigned_staff_id:
 *                       type: string
 *                       format: uuid
 *       500:
 *         description: Lỗi máy chủ nội bộ.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 */
router.post('/conversations/:conversationId/messages', supportController.sendMessage.bind(supportController));

/**
 * @openapi
 * /api/support/conversations/{conversationId}/status:
 *   patch:
 *     summary: Cập nhật trạng thái cuộc hội thoại
 *     description: Thay đổi trạng thái của cuộc hội thoại hỗ trợ (vd. chuyển sang resolved hoặc closed). Yêu cầu quyền staff hoặc admin.
 *     tags:
 *       - Support
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: conversationId
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *         description: UUID của cuộc hội thoại.
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - status
 *             properties:
 *               status:
 *                 type: string
 *                 enum: [open, pending, resolved, closed]
 *                 description: Trạng thái mới của cuộc hội thoại.
 *             example:
 *               status: resolved
 *     responses:
 *       200:
 *         description: Cập nhật trạng thái thành công.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 data:
 *                   $ref: '#/components/schemas/SupportConversation'
 *       400:
 *         description: Trạng thái không hợp lệ.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       401:
 *         description: Chưa xác thực.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       403:
 *         description: Không có quyền truy cập (yêu cầu staff hoặc admin).
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       404:
 *         description: Không tìm thấy cuộc hội thoại.
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
router.patch('/conversations/:conversationId/status', requireStaff, supportController.updateConversationStatus.bind(supportController));

export default router;
