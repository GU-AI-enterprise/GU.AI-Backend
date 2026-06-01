import { Router } from 'express';
import { UserController } from '../controllers/user.controller';
import { requireAuth } from '../middlewares/auth.middleware';

const router = Router();
const userController = new UserController();

router.use(requireAuth);

/**
 * @openapi
 * /api/users/profile:
 *   get:
 *     summary: Lấy thông tin hồ sơ người dùng hiện tại
 *     description: Trả về thông tin hồ sơ đầy đủ của người dùng đang đăng nhập.
 *     tags:
 *       - Users
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Thông tin hồ sơ người dùng.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/User'
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
router.get('/profile', userController.getProfile.bind(userController));

/**
 * @openapi
 * /api/users/profile:
 *   put:
 *     summary: Cập nhật thông tin hồ sơ người dùng
 *     description: Cập nhật tên hiển thị và/hoặc URL ảnh đại diện của người dùng đang đăng nhập.
 *     tags:
 *       - Users
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               name:
 *                 type: string
 *                 description: Tên hiển thị mới.
 *               avatar_url:
 *                 type: string
 *                 description: URL ảnh đại diện mới.
 *             example:
 *               name: Nguyễn Văn A
 *               avatar_url: https://example.com/avatar.jpg
 *     responses:
 *       200:
 *         description: Cập nhật hồ sơ thành công.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/User'
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
router.put('/profile', userController.updateProfile.bind(userController));

/**
 * @openapi
 * /api/users/profile/password:
 *   put:
 *     summary: Đổi mật khẩu
 *     description: Xác thực mật khẩu hiện tại rồi cập nhật mật khẩu mới cho người dùng đang đăng nhập.
 *     tags:
 *       - Users
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - current_password
 *               - new_password
 *             properties:
 *               current_password:
 *                 type: string
 *                 format: password
 *                 description: Mật khẩu hiện tại.
 *               new_password:
 *                 type: string
 *                 format: password
 *                 description: Mật khẩu mới.
 *             example:
 *               current_password: OldPass123!
 *               new_password: NewPass456!
 *     responses:
 *       200:
 *         description: Đổi mật khẩu thành công.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: Password updated successfully
 *       400:
 *         description: Thiếu tham số hoặc mật khẩu hiện tại không đúng.
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
 *       500:
 *         description: Lỗi máy chủ nội bộ.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 */
router.put('/profile/password', userController.changePassword.bind(userController));

/**
 * @openapi
 * /api/users/profile:
 *   delete:
 *     summary: Xóa tài khoản người dùng
 *     description: Xác thực mật khẩu rồi xóa vĩnh viễn tài khoản của người dùng đang đăng nhập khỏi database và Supabase Auth.
 *     tags:
 *       - Users
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - password
 *             properties:
 *               password:
 *                 type: string
 *                 format: password
 *                 description: Mật khẩu hiện tại để xác nhận xóa tài khoản.
 *             example:
 *               password: MyPassword123!
 *     responses:
 *       200:
 *         description: Xóa tài khoản thành công.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: Account deleted successfully
 *       400:
 *         description: Thiếu mật khẩu hoặc mật khẩu không đúng.
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
 *       500:
 *         description: Lỗi máy chủ nội bộ.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 */
router.delete('/profile', userController.deleteAccount.bind(userController));

export default router;
