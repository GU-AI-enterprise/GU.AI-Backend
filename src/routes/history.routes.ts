import { Router } from 'express';
import { historyController } from '../controllers/history.controller';
import { requireAuth } from '../middlewares/auth.middleware';

const router = Router();

router.use(requireAuth);

/**
 * @openapi
 * /api/history:
 *   get:
 *     summary: Lấy lịch sử tác vụ AI của người dùng
 *     description: Trả về toàn bộ lịch sử các tác vụ AI (virtual try-on, v.v.) của người dùng đang đăng nhập, bao gồm trạng thái, credit đã dùng và ảnh kết quả.
 *     tags:
 *       - History
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Lịch sử tác vụ AI.
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
 *                   example: Lấy lịch sử tác vụ thành công.
 *                 data:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       id:
 *                         type: string
 *                         format: uuid
 *                       user_id:
 *                         type: string
 *                         format: uuid
 *                       type:
 *                         type: string
 *                         enum: [try_on, generate, edit, remove_bg, upscale]
 *                       status:
 *                         type: string
 *                         enum: [processing, completed, failed, cancelled]
 *                       provider:
 *                         type: string
 *                         enum: [fashn, nano_banana, remove_bg]
 *                       credit_cost:
 *                         type: integer
 *                       input_params:
 *                         type: object
 *                         nullable: true
 *                       started_at:
 *                         type: string
 *                         format: date-time
 *                       completed_at:
 *                         type: string
 *                         format: date-time
 *                         nullable: true
 *                       error_message:
 *                         type: string
 *                         nullable: true
 *                       assets:
 *                         type: array
 *                         items:
 *                           $ref: '#/components/schemas/Asset'
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
router.get('/', historyController.getHistory);

export default router;
