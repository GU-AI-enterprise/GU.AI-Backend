import { Router } from 'express';
import { AdminController } from '../controllers/admin.controller';
import { requireAuth, requireAdmin, requireStaff } from '../middlewares/auth.middleware';
import { AdminEventService } from '../services/adminEvent.service';
import { sendSuccess } from '../utils/response';

const router = Router();
const ctrl = new AdminController();

router.use(requireAuth);

// GET /api/admin/events — events by date with pagination + daily stats
router.get('/events', requireStaff, async (req, res) => {
  try {
    const today = new Date().toISOString().slice(0, 10); // YYYY-MM-DD UTC
    const date   = (req.query.date   as string) || today;
    const limit  = Math.min(100, parseInt((req.query.limit  as string) || '20'));
    const offset = Math.max(0,   parseInt((req.query.offset as string) || '0'));

    const result = await AdminEventService.query({ date, limit, offset });
    sendSuccess(res, { data: result });
  } catch (err: any) {
    // Fallback to in-memory if DB not ready
    sendSuccess(res, { data: { events: AdminEventService.getRecent(20), stats: { total: 0, job_created: 0, job_completed: 0, job_failed: 0 }, hasMore: false } });
  }
});

/**
 * @openapi
 * /api/admin/stats:
 *   get:
 *     summary: Lấy thống kê tổng quan hệ thống
 *     description: Trả về tổng số người dùng, số lượng theo trạng thái (active/locked) và theo vai trò (customer/staff/admin).
 *     tags:
 *       - Admin
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Thống kê người dùng thành công.
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
 *                     total:
 *                       type: integer
 *                       example: 150
 *                     active:
 *                       type: integer
 *                       example: 140
 *                     locked:
 *                       type: integer
 *                       example: 10
 *                     byRole:
 *                       type: object
 *                       properties:
 *                         customer:
 *                           type: integer
 *                           example: 145
 *                         staff:
 *                           type: integer
 *                           example: 4
 *                         admin:
 *                           type: integer
 *                           example: 1
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
router.get('/stats', requireStaff, ctrl.getStats.bind(ctrl));

/**
 * @openapi
 * /api/admin/users:
 *   get:
 *     summary: Lấy danh sách người dùng (có phân trang & lọc)
 *     description: Trả về danh sách người dùng có hỗ trợ tìm kiếm theo tên/email, lọc theo role/status, và phân trang.
 *     tags:
 *       - Admin
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: search
 *         schema:
 *           type: string
 *         description: Tìm kiếm theo tên hoặc email.
 *       - in: query
 *         name: role
 *         schema:
 *           type: string
 *           enum: [all, customer, staff, admin]
 *         description: Lọc theo vai trò.
 *       - in: query
 *         name: status
 *         schema:
 *           type: string
 *           enum: [all, active, locked]
 *         description: Lọc theo trạng thái.
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *           minimum: 1
 *           default: 1
 *         description: Trang hiện tại.
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           minimum: 1
 *           maximum: 100
 *           default: 20
 *         description: Số lượng kết quả mỗi trang.
 *     responses:
 *       200:
 *         description: Danh sách người dùng.
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
 *                     users:
 *                       type: array
 *                       items:
 *                         $ref: '#/components/schemas/User'
 *                     total:
 *                       type: integer
 *                       example: 50
 *                     page:
 *                       type: integer
 *                       example: 1
 *                     limit:
 *                       type: integer
 *                       example: 20
 *                     totalPages:
 *                       type: integer
 *                       example: 3
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
router.get('/users', requireStaff, ctrl.listUsers.bind(ctrl));

/**
 * @openapi
 * /api/admin/users/{id}/role:
 *   patch:
 *     summary: Cập nhật vai trò của người dùng
 *     description: Thay đổi role của một user. Không thể thay đổi role của chính mình. Yêu cầu quyền admin.
 *     tags:
 *       - Admin
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *         description: UUID của người dùng cần cập nhật.
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - role
 *             properties:
 *               role:
 *                 type: string
 *                 enum: [customer, staff, admin]
 *                 description: Vai trò mới.
 *             example:
 *               role: staff
 *     responses:
 *       200:
 *         description: Cập nhật role thành công.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 data:
 *                   $ref: '#/components/schemas/User'
 *       400:
 *         description: Role không hợp lệ hoặc cố thay đổi role của chính mình.
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
 *         description: Không có quyền truy cập (yêu cầu admin).
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       404:
 *         description: Không tìm thấy người dùng.
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
router.patch('/users/:id/role', requireAdmin, ctrl.updateRole.bind(ctrl));

/**
 * @openapi
 * /api/admin/users/{id}/status:
 *   patch:
 *     summary: Cập nhật trạng thái của người dùng
 *     description: Khóa hoặc mở khóa tài khoản người dùng. Không thể thay đổi trạng thái của chính mình. Yêu cầu quyền staff hoặc admin.
 *     tags:
 *       - Admin
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *         description: UUID của người dùng cần cập nhật.
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
 *                 enum: [active, locked]
 *                 description: Trạng thái mới.
 *             example:
 *               status: locked
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
 *                   $ref: '#/components/schemas/User'
 *       400:
 *         description: Trạng thái không hợp lệ hoặc cố thay đổi của chính mình.
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
 *         description: Không tìm thấy người dùng.
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
router.patch('/users/:id/status', requireStaff, ctrl.updateStatus.bind(ctrl));

/**
 * @openapi
 * /api/admin/users/{id}:
 *   delete:
 *     summary: Xóa tài khoản người dùng
 *     description: Xóa vĩnh viễn tài khoản người dùng khỏi database và Supabase Auth. Không thể xóa tài khoản của chính mình. Yêu cầu quyền admin.
 *     tags:
 *       - Admin
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *         description: UUID của người dùng cần xóa.
 *     responses:
 *       200:
 *         description: Xóa tài khoản thành công.
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
 *                   example: Đã xóa tài khoản thành công.
 *       400:
 *         description: Cố xóa tài khoản của chính mình.
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
 *         description: Không có quyền truy cập (yêu cầu admin).
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
router.delete('/users/:id', requireAdmin, ctrl.deleteUser.bind(ctrl));

/**
 * @openapi
 * /api/admin/users/{id}/credits:
 *   post:
 *     summary: Cộng credits cho người dùng
 *     description: Admin/Staff thủ công cộng credits vào tài khoản người dùng. Mỗi lần cộng sẽ ghi một bản ghi vào credit_ledger và gửi thông báo cho người dùng.
 *     tags:
 *       - Admin
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *         description: UUID của người dùng được cộng credits.
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - amount
 *             properties:
 *               amount:
 *                 type: integer
 *                 minimum: 1
 *                 description: Số credits cần cộng (số nguyên dương).
 *               reason:
 *                 type: string
 *                 description: Lý do cộng credits (tùy chọn).
 *             example:
 *               amount: 50
 *               reason: Bù credits do lỗi hệ thống ngày 01/06/2026
 *     responses:
 *       200:
 *         description: Cộng credits thành công.
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
 *                   example: Đã cộng 50 credits cho user thành công.
 *                 data:
 *                   type: object
 *                   properties:
 *                     userId:
 *                       type: string
 *                       format: uuid
 *                     amount:
 *                       type: integer
 *                       example: 50
 *                     newBalance:
 *                       type: integer
 *                       example: 150
 *       400:
 *         description: amount không hợp lệ (phải là số nguyên dương).
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
 *         description: Không tìm thấy người dùng.
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
router.post('/users/:id/credits', requireStaff, ctrl.awardCredits.bind(ctrl));

export default router;
