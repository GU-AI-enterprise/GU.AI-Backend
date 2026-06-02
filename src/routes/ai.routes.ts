import { Router } from 'express';
import multer from 'multer';
import { aiController } from '../controllers/ai.controller';
import { requireAuth } from '../middlewares/auth.middleware';

const router = Router();

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 15 * 1024 * 1024 }, // 15 MB per file
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
 *                 success: { type: boolean, example: true }
 *                 data:
 *                   type: object
 *                   properties:
 *                     ok: { type: boolean }
 *                     configured: { type: boolean }
 *                     error: { type: string, nullable: true }
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 */
/**
 * @openapi
 * /api/ai/jobs/{jobId}:
 *   get:
 *     summary: Lấy trạng thái một AI job
 *     description: |
 *       Dùng để polling trạng thái job khi Socket.IO không khả dụng.
 *       Các trạng thái có thể: `processing`, `completed`, `failed`.
 *     tags:
 *       - AI
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: jobId
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *         description: UUID của AI job.
 *     responses:
 *       200:
 *         description: Thông tin trạng thái job.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean, example: true }
 *                 data:
 *                   type: object
 *                   properties:
 *                     jobId: { type: string, format: uuid }
 *                     status: { type: string, enum: [processing, completed, failed] }
 *                     type: { type: string }
 *                     creditsUsed: { type: integer }
 *                     error: { type: string, nullable: true }
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 *       404:
 *         description: Không tìm thấy job.
 */
router.get('/jobs/:jobId', aiController.getJobStatus.bind(aiController));

router.post('/test', aiController.testConnection.bind(aiController));

/**
 * @openapi
 * /api/ai/credits:
 *   get:
 *     summary: Lấy số credits Fashn.ai còn lại của hệ thống
 *     description: Trả về credits trên tài khoản Fashn.ai của hệ thống (khác với credits của người dùng).
 *     tags:
 *       - AI
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Credits Fashn.ai.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean, example: true }
 *                 data:
 *                   type: object
 *                   properties:
 *                     total: { type: integer, example: 234 }
 *                     subscription: { type: integer, example: 100 }
 *                     onDemand: { type: integer, example: 134 }
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 */
router.get('/credits', aiController.getCredits.bind(aiController));

/**
 * @openapi
 * /api/ai/try-on:
 *   post:
 *     summary: Virtual Try-On v1.6 — ghép trang phục lên ảnh người mẫu (nhanh, 10 credits)
 *     description: |
 *       Sử dụng Fashn model **tryon-v1.6**: nhanh, ổn định, tối ưu cho e-commerce realtime.
 *
 *       **Chi phí:** 10 credits / lần.
 *
 *       Cung cấp ảnh bằng một trong hai cách (file upload được ưu tiên):
 *       - Upload file qua `modelImage` / `garmentImage`
 *       - Cung cấp URL qua `modelImageUrl` / `garmentImageUrl`
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
 *             required: [category]
 *             properties:
 *               modelImage:
 *                 type: string
 *                 format: binary
 *                 description: Ảnh người mẫu (file, tối đa 15 MB).
 *               garmentImage:
 *                 type: string
 *                 format: binary
 *                 description: Ảnh trang phục (file, tối đa 15 MB).
 *               modelImageUrl:
 *                 type: string
 *                 description: URL ảnh người mẫu (nếu không upload file).
 *               garmentImageUrl:
 *                 type: string
 *                 description: URL ảnh trang phục (nếu không upload file).
 *               category:
 *                 type: string
 *                 enum: [auto, tops, bottoms, one-pieces]
 *                 description: Loại trang phục. Dùng `auto` để tự nhận diện.
 *               mode:
 *                 type: string
 *                 enum: [quality, balanced, speed]
 *                 default: balanced
 *                 description: "Chế độ xử lý — speed: ~5s, balanced: ~8s, quality: ~12-17s."
 *     responses:
 *       201:
 *         description: Try-on thành công.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/AIJobResult'
 *       400:
 *         $ref: '#/components/responses/BadRequest'
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 *       402:
 *         $ref: '#/components/responses/InsufficientCredits'
 *       500:
 *         $ref: '#/components/responses/ServerError'
 */
router.post(
  '/try-on',
  upload.fields([
    { name: 'modelImage', maxCount: 1 },
    { name: 'garmentImage', maxCount: 1 },
  ]),
  aiController.tryOn.bind(aiController)
);

/**
 * @openapi
 * /api/ai/try-on-max:
 *   post:
 *     summary: Virtual Try-On Max — chất lượng studio cao (20 credits)
 *     description: |
 *       Sử dụng Fashn model **tryon-max**: chất lượng cao nhất, hỗ trợ 4K, phù hợp ảnh catalog / portfolio.
 *
 *       **Chi phí:** 20 credits / lần.
 *
 *       So với v1.6: chậm hơn nhưng cho kết quả thực tế hơn, hỗ trợ nhiều resolution hơn.
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
 *             properties:
 *               productImage:
 *                 type: string
 *                 format: binary
 *                 description: Ảnh sản phẩm/trang phục (file).
 *               modelImage:
 *                 type: string
 *                 format: binary
 *                 description: Ảnh người mẫu (file).
 *               productImageUrl:
 *                 type: string
 *                 description: URL ảnh sản phẩm.
 *               modelImageUrl:
 *                 type: string
 *                 description: URL ảnh người mẫu.
 *               resolution:
 *                 type: string
 *                 enum: ['1k', '2k', '4k']
 *                 default: '1k'
 *                 description: Độ phân giải output.
 *               generationMode:
 *                 type: string
 *                 enum: [balanced, quality]
 *                 default: balanced
 *                 description: Chế độ sinh ảnh.
 *               numImages:
 *                 type: integer
 *                 minimum: 1
 *                 maximum: 4
 *                 default: 1
 *                 description: Số ảnh output (chi phí nhân theo số lượng).
 *     responses:
 *       201:
 *         description: Try-on Max thành công.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/AIJobResult'
 *       400:
 *         $ref: '#/components/responses/BadRequest'
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 *       402:
 *         $ref: '#/components/responses/InsufficientCredits'
 *       500:
 *         $ref: '#/components/responses/ServerError'
 */
router.post(
  '/try-on-max',
  upload.fields([
    { name: 'productImage', maxCount: 1 },
    { name: 'modelImage', maxCount: 1 },
  ]),
  aiController.tryOnMax.bind(aiController)
);

/**
 * @openapi
 * /api/ai/remove-background:
 *   post:
 *     summary: Xóa nền ảnh (3 credits)
 *     description: |
 *       Sử dụng Fashn model **background-remove**: tách nền và trả về PNG trong suốt.
 *
 *       **Chi phí:** 3 credits / lần.
 *
 *       Xử lý nhanh (~1-3 giây). Hỗ trợ ảnh lên đến 4MP.
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
 *             properties:
 *               image:
 *                 type: string
 *                 format: binary
 *                 description: Ảnh cần xóa nền (file, tối đa 15 MB).
 *               imageUrl:
 *                 type: string
 *                 description: URL ảnh (nếu không upload file).
 *     responses:
 *       201:
 *         description: Xóa nền thành công. Trả về PNG transparent.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/AIJobResult'
 *       400:
 *         $ref: '#/components/responses/BadRequest'
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 *       402:
 *         $ref: '#/components/responses/InsufficientCredits'
 *       500:
 *         $ref: '#/components/responses/ServerError'
 */
router.post(
  '/remove-background',
  upload.fields([{ name: 'image', maxCount: 1 }]),
  aiController.removeBackground.bind(aiController)
);

/**
 * @openapi
 * /api/ai/product-to-model:
 *   post:
 *     summary: Product to Model — tạo ảnh model từ ảnh sản phẩm (12 credits)
 *     description: |
 *       Sử dụng Fashn model **product-to-model**: chỉ cần ảnh sản phẩm, tự sinh ra ảnh người mẫu đang mặc sản phẩm.
 *
 *       **Chi phí:** 12 credits / lần.
 *
 *       Hữu ích khi chỉ có ảnh sản phẩm mà không có ảnh người mẫu thật.
 *       Có thể thêm `prompt` để hướng dẫn phong cách, `aspectRatio` để định dạng, và `faceReferenceUrl` để giữ khuôn mặt cụ thể.
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
 *             properties:
 *               productImage:
 *                 type: string
 *                 format: binary
 *                 description: Ảnh sản phẩm (file, tối đa 15 MB).
 *               productImageUrl:
 *                 type: string
 *                 description: URL ảnh sản phẩm (nếu không upload file).
 *               prompt:
 *                 type: string
 *                 description: Mô tả phong cách model/bối cảnh (vd. "professional office setting").
 *               aspectRatio:
 *                 type: string
 *                 enum: ['1:1', '4:5', '3:4', '2:3', '9:16']
 *                 description: Tỉ lệ khung hình output.
 *               resolution:
 *                 type: string
 *                 enum: ['1k', '2k', '4k']
 *                 default: '1k'
 *               generationMode:
 *                 type: string
 *                 enum: [fast, balanced, quality]
 *                 default: balanced
 *               faceReferenceUrl:
 *                 type: string
 *                 description: URL ảnh mặt tham chiếu — giữ identity cụ thể (tốn thêm ~3 Fashn credits).
 *     responses:
 *       201:
 *         description: Tạo ảnh model thành công.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/AIJobResult'
 *       400:
 *         $ref: '#/components/responses/BadRequest'
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 *       402:
 *         $ref: '#/components/responses/InsufficientCredits'
 *       500:
 *         $ref: '#/components/responses/ServerError'
 */
router.post(
  '/product-to-model',
  upload.fields([{ name: 'productImage', maxCount: 1 }]),
  aiController.productToModel.bind(aiController)
);

/**
 * @openapi
 * /api/ai/reframe:
 *   post:
 *     summary: Reframe — đổi aspect ratio ảnh thông minh (5 credits)
 *     description: |
 *       Sử dụng Fashn model **reframe**: đổi tỉ lệ khung hình bằng crop/outpaint thông minh — phân tích nội dung để giữ chủ thể.
 *
 *       **Chi phí:** 5 credits / lần.
 *
 *       Hữu ích khi cần chuyển ảnh dọc → ngang cho banner, hoặc ảnh vuông → story 9:16.
 *
 *       **Lưu ý:** Nếu ảnh đã đúng tỉ lệ, Fashn sẽ báo InputValidationError.
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
 *             required: [aspectRatio]
 *             properties:
 *               image:
 *                 type: string
 *                 format: binary
 *                 description: Ảnh cần reframe (file, tối đa 15 MB).
 *               imageUrl:
 *                 type: string
 *                 description: URL ảnh (nếu không upload file).
 *               aspectRatio:
 *                 type: string
 *                 enum: ['21:9', '1:1', '4:3', '3:2', '2:3', '5:4', '4:5', '3:4', '16:9', '9:16']
 *                 description: Tỉ lệ khung hình mới.
 *               resolution:
 *                 type: string
 *                 enum: ['1k', '2k', '4k']
 *                 default: '1k'
 *     responses:
 *       201:
 *         description: Reframe thành công.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/AIJobResult'
 *       400:
 *         $ref: '#/components/responses/BadRequest'
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 *       402:
 *         $ref: '#/components/responses/InsufficientCredits'
 *       500:
 *         $ref: '#/components/responses/ServerError'
 */
router.post(
  '/reframe',
  upload.fields([{ name: 'image', maxCount: 1 }]),
  aiController.reframe.bind(aiController)
);

/**
 * @openapi
 * /api/ai/edit:
 *   post:
 *     summary: Edit Image — chỉnh sửa ảnh theo prompt (5 credits)
 *     description: |
 *       Sử dụng Fashn model **edit**: sửa ảnh đã có theo hướng dẫn bằng ngôn ngữ tự nhiên — đổi pose, thêm phụ kiện, sửa ánh sáng.
 *
 *       **Chi phí:** 5 credits / lần.
 *
 *       Có thể cung cấp thêm `mask` (PNG cùng kích thước ảnh gốc):
 *       - Pixel **trắng** = vùng muốn chỉnh sửa
 *       - Pixel **đen** = vùng giữ nguyên
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
 *             required: [prompt]
 *             properties:
 *               image:
 *                 type: string
 *                 format: binary
 *                 description: Ảnh gốc cần chỉnh sửa (file, tối đa 15 MB).
 *               imageUrl:
 *                 type: string
 *                 description: URL ảnh gốc (nếu không upload file).
 *               mask:
 *                 type: string
 *                 format: binary
 *                 description: PNG mask (trắng = chỉnh, đen = giữ). Phải cùng kích thước ảnh gốc.
 *               maskUrl:
 *                 type: string
 *                 description: URL mask (nếu không upload file).
 *               prompt:
 *                 type: string
 *                 description: Mô tả thay đổi muốn thực hiện.
 *                 example: turn the model slightly to the left, add a black leather crossbody bag
 *               resolution:
 *                 type: string
 *                 enum: ['1k', '2k', '4k']
 *                 default: '1k'
 *               generationMode:
 *                 type: string
 *                 enum: [fast, balanced, quality]
 *                 default: balanced
 *     responses:
 *       201:
 *         description: Chỉnh sửa ảnh thành công.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/AIJobResult'
 *       400:
 *         $ref: '#/components/responses/BadRequest'
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 *       402:
 *         $ref: '#/components/responses/InsufficientCredits'
 *       500:
 *         $ref: '#/components/responses/ServerError'
 */
router.post(
  '/edit',
  upload.fields([
    { name: 'image', maxCount: 1 },
    { name: 'mask', maxCount: 1 },
  ]),
  aiController.editImage.bind(aiController)
);

export default router;
