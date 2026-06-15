import { Router } from 'express';
import { AuthController } from '../controllers/auth.controller';

const router = Router();
const authController = new AuthController();

/**
 * @openapi
 * /api/auth/oauth/{provider}:
 *   get:
 *     summary: Khởi đầu luồng đăng nhập OAuth qua Supabase
 *     description: Tự động chuyển hướng (Redirect) trình duyệt của client đến trang xác thực của nhà cung cấp bên thứ ba (vd. Google).
 *     tags:
 *       - Authentication
 *     parameters:
 *       - in: path
 *         name: provider
 *         required: true
 *         schema:
 *           type: string
 *           enum: [google, facebook, apple, github]
 *         description: Nhà cung cấp OAuth muốn sử dụng.
 *     responses:
 *       302:
 *         description: Chuyển hướng thành công sang trang đăng nhập của Provider.
 *       400:
 *         description: Yêu cầu không hợp lệ hoặc lỗi kết nối Supabase.
 *       500:
 *         description: Lỗi máy chủ nội bộ.
 */
router.post('/register', authController.register);
router.post('/resend-verification', authController.resendVerification);

router.get('/oauth/:provider', authController.signInWithOAuth);

/**
 * @openapi
 * /api/auth/callback:
 *   get:
 *     summary: Điểm nhận kết quả (Callback) OAuth từ Supabase
 *     description: Tiếp nhận tham số mã `code` từ luồng đăng nhập OAuth trên URL để đổi lấy phiên đăng nhập (session/tokens) và chuyển hướng về frontend.
 *     tags:
 *       - Authentication
 *     parameters:
 *       - in: query
 *         name: code
 *         required: true
 *         schema:
 *           type: string
 *         description: Mã auth code do nhà cung cấp trả về.
 *     responses:
 *       302:
 *         description: Chuyển hướng người dùng về trang chủ frontend kèm trạng thái thành công/thất bại.
 */
router.get('/callback', authController.oauthCallback);

/**
 * @openapi
 * /api/auth/refresh-token:
 *   post:
 *     summary: Làm mới Access Token đã hết hạn
 *     description: Tiếp nhận refresh token từ Cookie httpOnly hoặc từ request body để cấp lại một access token mới.
 *     tags:
 *       - Authentication
 *     requestBody:
 *       required: false
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               refresh_token:
 *                 type: string
 *                 description: Refresh token (chỉ cần thiết nếu không lưu qua Cookie).
 *     responses:
 *       200:
 *         description: Làm mới token thành công.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 access_token:
 *                   type: string
 *                 refresh_token:
 *                   type: string
 *                 user:
 *                   type: object
 *       401:
 *         description: Refresh token không hợp lệ hoặc đã hết hạn.
 *       500:
 *         description: Lỗi máy chủ nội bộ.
 */
router.post('/refresh-token', authController.refreshToken);

/**
 * @openapi
 * /api/auth/logout:
 *   post:
 *     summary: Đăng xuất người dùng
 *     description: Hủy phiên hoạt động hiện tại trên Supabase Auth và xóa các cookies xác thực đang lưu trữ tại client.
 *     tags:
 *       - Authentication
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Đăng xuất thành công.
 *       500:
 *         description: Lỗi máy chủ nội bộ.
 */
router.post('/logout', authController.logout);

export default router;
