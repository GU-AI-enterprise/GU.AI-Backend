import { Router } from 'express';
import { imageController } from '../controllers/image.controller';
import { requireAuth } from '../middlewares/auth.middleware';

const router = Router();

router.use(requireAuth);

/**
 * @openapi
 * /api/images:
 *   get:
 *     summary: Lấy danh sách ảnh của người dùng
 *     description: Trả về tất cả asset ảnh thuộc về người dùng đang đăng nhập.
 *     tags:
 *       - Images
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Danh sách ảnh.
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
 *                   example: Lấy danh sách ảnh thành công.
 *                 data:
 *                   type: array
 *                   items:
 *                     $ref: '#/components/schemas/Asset'
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
router.get('/', imageController.getImages);

/**
 * @openapi
 * /api/images:
 *   post:
 *     summary: Tạo bản ghi ảnh mới
 *     description: Lưu metadata của một ảnh (đã upload sẵn) vào database. Endpoint này chỉ tạo bản ghi, không thực hiện upload file.
 *     tags:
 *       - Images
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - fileUrl
 *             properties:
 *               fileUrl:
 *                 type: string
 *                 description: URL công khai của ảnh đã upload.
 *               thumbnailUrl:
 *                 type: string
 *                 description: URL thumbnail (tùy chọn).
 *               type:
 *                 type: string
 *                 enum: [image]
 *                 description: Loại asset.
 *               category:
 *                 type: string
 *                 enum: [input, output, garment, model]
 *                 description: Phân loại ảnh.
 *               fileSize:
 *                 type: integer
 *                 description: Kích thước file (bytes).
 *               fileName:
 *                 type: string
 *                 description: Tên file gốc.
 *               mimeType:
 *                 type: string
 *                 description: MIME type (vd. image/png).
 *               width:
 *                 type: integer
 *                 description: Chiều rộng ảnh (px).
 *               height:
 *                 type: integer
 *                 description: Chiều cao ảnh (px).
 *             example:
 *               fileUrl: https://storage.example.com/images/photo.jpg
 *               category: input
 *               mimeType: image/jpeg
 *               width: 1024
 *               height: 1024
 *     responses:
 *       201:
 *         description: Lưu bản ghi ảnh thành công.
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
 *                   example: Lưu bản ghi ảnh thành công.
 *                 data:
 *                   $ref: '#/components/schemas/Asset'
 *       400:
 *         description: Thiếu fileUrl.
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
router.post('/', imageController.createImage);

/**
 * @openapi
 * /api/images/{id}:
 *   delete:
 *     summary: Xóa ảnh
 *     description: Xóa một bản ghi asset theo ID. Người dùng chỉ có thể xóa ảnh của mình.
 *     tags:
 *       - Images
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *         description: UUID của asset cần xóa.
 *     responses:
 *       200:
 *         description: Xóa ảnh thành công.
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
 *                   example: Xóa ảnh thành công.
 *                 data:
 *                   $ref: '#/components/schemas/Asset'
 *       400:
 *         description: Thiếu ID ảnh.
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
router.delete('/:id', imageController.deleteImage);

export default router;
