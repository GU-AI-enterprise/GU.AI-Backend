import { Router } from 'express';
import multer from 'multer';
import { aiController } from '../controllers/ai.controller';
import { requireAuth } from '../middlewares/auth.middleware';

const router = Router();

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 15 * 1024 * 1024 }, // 15 MB mỗi file
});

router.use(requireAuth);

/**
 * @openapi
 * /api/ai/test:
 *   post:
 *     summary: Kiểm tra kết nối Fashn.ai
 *     description: Xác minh API key Fashn.ai đang được cấu hình và kết nối hoạt động bình thường.
 *     tags:
 *       - AI
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Kết quả kiểm tra kết nối.
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
 *                   example: Kết nối Fashn.ai thành công.
 *                 data:
 *                   type: object
 *                   properties:
 *                     ok:
 *                       type: boolean
 *                       description: true nếu kết nối thành công.
 *                     configured:
 *                       type: boolean
 *                       description: true nếu API key đã được cấu hình.
 *                     error:
 *                       type: string
 *                       nullable: true
 *                       description: Thông tin lỗi nếu kết nối thất bại.
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
router.post('/test', aiController.testConnection.bind(aiController));

/**
 * @openapi
 * /api/ai/credits:
 *   get:
 *     summary: Lấy số credits còn lại trên tài khoản Fashn.ai
 *     description: Trả về thông tin về credits Fashn.ai của hệ thống (không phải credits của người dùng).
 *     tags:
 *       - AI
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Thông tin credits Fashn.ai.
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
 *                   example: Lấy credits Fashn.ai thành công.
 *                 data:
 *                   type: object
 *                   description: Thông tin credits từ Fashn.ai API.
 *       401:
 *         description: Chưa xác thực.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       500:
 *         description: Lỗi máy chủ hoặc không kết nối được Fashn.ai.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 */
router.get('/credits', aiController.getCredits.bind(aiController));

/**
 * @openapi
 * /api/ai/try-on:
 *   post:
 *     summary: Virtual try-on – ghép trang phục lên ảnh người mẫu
 *     description: |
 *       Thực hiện virtual try-on bằng Fashn.ai: ghép ảnh trang phục lên ảnh người mẫu.
 *
 *       **Chi phí:** 10 credits / lần.
 *
 *       **Cung cấp ảnh theo một trong hai cách:**
 *       - Upload file trực tiếp qua `modelImage` / `garmentImage` (multipart/form-data)
 *       - Cung cấp URL qua `modelImageUrl` / `garmentImageUrl` trong body
 *
 *       File upload được ưu tiên nếu cả hai đều có. Giới hạn kích thước file: **15 MB**.
 *     tags:
 *       - AI
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             required:
 *               - category
 *             properties:
 *               modelImage:
 *                 type: string
 *                 format: binary
 *                 description: Ảnh người mẫu (file upload, tối đa 15 MB). Bắt buộc nếu không cung cấp modelImageUrl.
 *               garmentImage:
 *                 type: string
 *                 format: binary
 *                 description: Ảnh trang phục (file upload, tối đa 15 MB). Bắt buộc nếu không cung cấp garmentImageUrl.
 *               modelImageUrl:
 *                 type: string
 *                 description: URL ảnh người mẫu (dùng khi không upload file).
 *               garmentImageUrl:
 *                 type: string
 *                 description: URL ảnh trang phục (dùng khi không upload file).
 *               category:
 *                 type: string
 *                 enum: [tops, bottoms, one-pieces]
 *                 description: Loại trang phục.
 *               mode:
 *                 type: string
 *                 enum: [quality, balanced, speed]
 *                 default: balanced
 *                 description: Chế độ xử lý – quality (chất lượng cao), balanced (cân bằng), speed (nhanh).
 *     responses:
 *       201:
 *         description: Virtual try-on thành công.
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
 *                   example: Virtual try-on thành công.
 *                 data:
 *                   type: object
 *                   properties:
 *                     imageUrl:
 *                       type: string
 *                       description: URL ảnh kết quả đã lưu lên Supabase Storage.
 *                     assetId:
 *                       type: string
 *                       format: uuid
 *                       description: ID bản ghi asset trong database.
 *                     jobId:
 *                       type: string
 *                       format: uuid
 *                       description: ID AI job.
 *                     predictionId:
 *                       type: string
 *                       description: ID prediction từ Fashn.ai.
 *                     creditsUsed:
 *                       type: integer
 *                       example: 10
 *                       description: Số credits đã tiêu.
 *       400:
 *         description: Thiếu hoặc sai tham số (category, mode, ảnh).
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
 *       402:
 *         description: Không đủ credits.
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
 *                   example: Credit không đủ. Cần 10, hiện có 5.
 *       500:
 *         description: Lỗi máy chủ hoặc Fashn.ai.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 */
router.post(
  '/try-on',
  upload.fields([
    { name: 'modelImage', maxCount: 1 },
    { name: 'garmentImage', maxCount: 1 },
  ]),
  aiController.tryOn.bind(aiController)
);

export default router;
