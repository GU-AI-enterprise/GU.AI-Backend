import { Router } from 'express';
import multer from 'multer';
import { aiController } from '../controllers/ai.controller';
import { requireAuth } from '../middlewares/auth.middleware';
import { aiLimiter, assistLimiter, staffBypass } from '../middlewares/rateLimit.middleware';

const router = Router();

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 15 * 1024 * 1024 }, // 15 MB per file
});

router.use(requireAuth);

/**
 * @openapi
 * /api/ai/suggest-prompt:
 *   post:
 *     summary: Gợi ý prompt tiếng Anh bằng AI (tác vụ phụ, không trừ credit)
 *     description: |
 *       Dùng Gemini viết lại ý tưởng ngắn (có thể bằng tiếng Việt) thành prompt tiếng Anh cho field "prompt" của các tool.
 *       Có thể kèm ảnh (file hoặc URL) để gợi ý bám sát nội dung ảnh thực tế hơn (multimodal).
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
 *             required: [tool]
 *             properties:
 *               tool:
 *                 type: string
 *                 description: Tool đang dùng (vd. product_to_model, face_to_model, edit, create_model, model_swap, try_on_max, image_to_video).
 *               userHint:
 *                 type: string
 *                 description: Ý tưởng ngắn của user (có thể để trống — AI tự đề xuất).
 *               image:
 *                 type: string
 *                 format: binary
 *                 description: Ảnh tham chiếu (tuỳ chọn, file) — giúp gợi ý sát nội dung ảnh thực tế.
 *               imageUrl:
 *                 type: string
 *                 description: URL ảnh tham chiếu (tuỳ chọn, nếu không upload file).
 *     responses:
 *       200:
 *         description: Prompt gợi ý.
 *       400:
 *         $ref: '#/components/responses/BadRequest'
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 *       500:
 *         $ref: '#/components/responses/ServerError'
 */
router.post(
  '/suggest-prompt',
  staffBypass(assistLimiter),
  upload.fields([{ name: 'image', maxCount: 1 }]),
  aiController.suggestPrompt.bind(aiController)
);

/**
 * @openapi
 * /api/ai/verify-image:
 *   post:
 *     summary: Verify ảnh đầu vào bằng AI (tác vụ phụ, không trừ credit, không block)
 *     description: |
 *       Kiểm tra nhanh ảnh có phù hợp với loại mong đợi không (vd. ảnh khuôn mặt phải nhìn rõ mặt người).
 *       Chỉ trả về cảnh báo cho frontend hiển thị — không chặn người dùng chạy job.
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
 *             required: [expectedType]
 *             properties:
 *               image:
 *                 type: string
 *                 format: binary
 *                 description: Ảnh cần kiểm tra (file).
 *               imageUrl:
 *                 type: string
 *                 description: URL ảnh (nếu không upload file).
 *               expectedType:
 *                 type: string
 *                 enum: [face, product, model, background]
 *     responses:
 *       200:
 *         description: Kết quả verify — { ok, issues }.
 *       400:
 *         $ref: '#/components/responses/BadRequest'
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 *       500:
 *         $ref: '#/components/responses/ServerError'
 */
router.post(
  '/verify-image',
  staffBypass(assistLimiter),
  upload.fields([{ name: 'image', maxCount: 1 }]),
  aiController.verifyImage.bind(aiController)
);

router.use(staffBypass(aiLimiter));

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
 *     summary: Virtual Try-On v1.6 — ghép trang phục lên ảnh người mẫu (2 credits)
 *     description: |
 *       Sử dụng Fashn model **tryon-v1.6**: nhanh, ổn định, tối ưu cho e-commerce realtime.
 *
 *       **Chi phí:** 2 credits / lần (cố định).
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
 *                 enum: [quality, balanced, performance]
 *                 default: balanced
 *                 description: "Chế độ xử lý — performance: ~5s, balanced: ~8s, quality: ~12-17s."
 *     responses:
 *       202:
 *         description: Job đã được tạo và đang xử lý.
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
    { name: 'modelImage',   maxCount: 1 },
    { name: 'garmentImage', maxCount: 1 },
  ]),
  aiController.tryOn.bind(aiController)
);

/**
 * @openapi
 * /api/ai/try-on-max:
 *   post:
 *     summary: Virtual Try-On Max — chất lượng studio cao (4–40 credits)
 *     description: |
 *       Sử dụng Fashn model **tryon-max**: chất lượng cao nhất, hỗ trợ 4K, phù hợp ảnh catalog / portfolio.
 *       Hỗ trợ clothing, shoes, hats, jewelry, bags và các wearable fashion items.
 *
 *       **Chi phí** (GU.AI credits, markup ×2):
 *       | mode     | 1k | 2k | 4k |
 *       |----------|----|----|-----|
 *       | balanced |  4 |  6 |  8  |
 *       | quality  |  6 |  8 | 10  |
 *       Chi phí nhân theo `numImages`.
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
 *               prompt:
 *                 type: string
 *                 description: Hướng dẫn tùy chỉnh kết quả (vd. "tuck in shirt, open jacket").
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
 *       202:
 *         description: Job đã được tạo và đang xử lý.
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
    { name: 'modelImage',   maxCount: 1 },
  ]),
  aiController.tryOnMax.bind(aiController)
);

/**
 * @openapi
 * /api/ai/remove-background:
 *   post:
 *     summary: Xóa nền ảnh (2 credits)
 *     description: |
 *       Sử dụng Fashn model **background-remove**: tách nền và trả về PNG trong suốt.
 *
 *       **Chi phí:** 2 credits / lần (cố định).
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
 *       202:
 *         description: Job đã được tạo và đang xử lý. Trả về PNG transparent.
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
 *     summary: Product to Model — tạo ảnh model từ ảnh sản phẩm (2–64 credits)
 *     description: |
 *       Sử dụng Fashn model **product-to-model**: chỉ cần ảnh sản phẩm, tự sinh ra ảnh người mẫu đang mặc sản phẩm.
 *
 *       **Chi phí** (GU.AI credits, markup ×2):
 *       | mode     | 1k | 2k | 4k |
 *       |----------|----|----|-----|
 *       | fast     |  2 |  4 |  6  |
 *       | balanced |  4 |  6 |  8  |
 *       | quality  |  6 |  8 | 10  |
 *       `faceReference` cộng thêm 6 credits/ảnh. Chi phí nhân theo `numImages`.
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
 *               imagePrompt:
 *                 type: string
 *                 format: binary
 *                 description: Ảnh inspiration định hướng pose/môi trường/ánh sáng (file).
 *               imagePromptUrl:
 *                 type: string
 *                 description: URL ảnh inspiration.
 *               faceReference:
 *                 type: string
 *                 format: binary
 *                 description: Ảnh khuôn mặt tham chiếu — giữ identity cụ thể (+6 GU.AI credits/ảnh).
 *               faceReferenceUrl:
 *                 type: string
 *                 description: URL ảnh mặt tham chiếu.
 *               backgroundReference:
 *                 type: string
 *                 format: binary
 *                 description: Ảnh nền tham chiếu.
 *               backgroundReferenceUrl:
 *                 type: string
 *                 description: URL ảnh nền tham chiếu.
 *               prompt:
 *                 type: string
 *                 description: Mô tả phong cách model/bối cảnh (vd. "professional office setting").
 *               aspectRatio:
 *                 type: string
 *                 enum: ['1:1', '4:5', '3:4', '2:3', '9:16', '16:9', '4:3', '3:2']
 *                 description: Tỉ lệ khung hình output.
 *               resolution:
 *                 type: string
 *                 enum: ['1k', '2k', '4k']
 *                 default: '1k'
 *               generationMode:
 *                 type: string
 *                 enum: [fast, balanced, quality]
 *                 default: fast
 *               numImages:
 *                 type: integer
 *                 minimum: 1
 *                 maximum: 4
 *                 default: 1
 *               faceReferenceMode:
 *                 type: string
 *                 enum: [match_base, match_reference]
 *                 default: match_reference
 *     responses:
 *       202:
 *         description: Job đã được tạo và đang xử lý.
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
  upload.fields([
    { name: 'productImage',        maxCount: 1 },
    { name: 'imagePrompt',         maxCount: 1 },
    { name: 'faceReference',       maxCount: 1 },
    { name: 'backgroundReference', maxCount: 1 },
  ]),
  aiController.productToModel.bind(aiController)
);

/**
 * @openapi
 * /api/ai/reframe:
 *   post:
 *     summary: Reframe — đổi aspect ratio ảnh thông minh (2–40 credits)
 *     description: |
 *       Sử dụng Fashn model **reframe**: đổi tỉ lệ khung hình bằng crop/outpaint thông minh — phân tích nội dung để giữ chủ thể.
 *
 *       **Chi phí** (GU.AI credits, markup ×2):
 *       | mode     | 1k | 2k | 4k |
 *       |----------|----|----|-----|
 *       | fast     |  2 |  4 |  6  |
 *       | balanced |  4 |  6 |  8  |
 *       | quality  |  6 |  8 | 10  |
 *       Chi phí nhân theo `numImages`.
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
 *               generationMode:
 *                 type: string
 *                 enum: [fast, balanced, quality]
 *                 default: fast
 *               numImages:
 *                 type: integer
 *                 minimum: 1
 *                 maximum: 4
 *                 default: 1
 *                 description: Nhiều ảnh tăng cơ hội chọn được kết quả tốt nhất.
 *     responses:
 *       202:
 *         description: Job đã được tạo và đang xử lý.
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
 *     summary: Edit Image — chỉnh sửa ảnh theo prompt (2–40 credits)
 *     description: |
 *       Sử dụng Fashn model **edit**: sửa ảnh đã có theo hướng dẫn bằng ngôn ngữ tự nhiên — đổi pose, thêm phụ kiện, sửa ánh sáng.
 *
 *       **Chi phí** (GU.AI credits, markup ×2):
 *       | mode     | 1k | 2k | 4k |
 *       |----------|----|----|-----|
 *       | fast     |  2 |  4 |  6  |
 *       | balanced |  4 |  6 |  8  |
 *       | quality  |  6 |  8 | 10  |
 *       Chi phí nhân theo `numImages`.
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
 *               imageContext:
 *                 type: string
 *                 format: binary
 *                 description: Ảnh tham chiếu ngữ cảnh — dùng khi khó mô tả bằng lời (pose, nền, texture).
 *               imageContextUrl:
 *                 type: string
 *                 description: URL ảnh ngữ cảnh tham chiếu.
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
 *               numImages:
 *                 type: integer
 *                 minimum: 1
 *                 maximum: 4
 *                 default: 1
 *     responses:
 *       202:
 *         description: Job đã được tạo và đang xử lý.
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
    { name: 'image',        maxCount: 1 },
    { name: 'mask',         maxCount: 1 },
    { name: 'imageContext', maxCount: 1 },
  ]),
  aiController.editImage.bind(aiController)
);

/**
 * @openapi
 * /api/ai/face-to-model:
 *   post:
 *     summary: Face to Model — tạo avatar upper-body từ ảnh khuôn mặt (2–40 credits)
 *     description: |
 *       Sử dụng Fashn model **face-to-model**: biến ảnh mặt/headshot/selfie thành avatar upper-body sẵn sàng cho virtual try-on.
 *
 *       **Chi phí** (GU.AI credits, markup ×2):
 *       | mode     | 1k | 2k | 4k |
 *       |----------|----|----|-----|
 *       | fast     |  2 |  4 |  6  |
 *       | balanced |  4 |  6 |  8  |
 *       | quality  |  6 |  8 | 10  |
 *       Chi phí nhân theo `numImages`.
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
 *               faceImage:
 *                 type: string
 *                 format: binary
 *                 description: Ảnh khuôn mặt / headshot (file, tối đa 15 MB).
 *               faceImageUrl:
 *                 type: string
 *                 description: URL ảnh khuôn mặt (nếu không upload file).
 *               prompt:
 *                 type: string
 *                 description: Gợi ý styling/body shape (vd. "athletic build, curvy figure").
 *               aspectRatio:
 *                 type: string
 *                 enum: ['1:1', '4:5', '3:4', '2:3', '9:16']
 *                 description: Chỉ hỗ trợ tỉ lệ dọc; ảnh luôn extend downward. Mặc định 2:3.
 *               resolution:
 *                 type: string
 *                 enum: ['1k', '2k', '4k']
 *                 default: '1k'
 *               generationMode:
 *                 type: string
 *                 enum: [fast, balanced, quality]
 *                 default: fast
 *               numImages:
 *                 type: integer
 *                 minimum: 1
 *                 maximum: 4
 *                 default: 1
 *               seed:
 *                 type: integer
 *                 description: Seed để tái lập kết quả (0 – 4294967295).
 *     responses:
 *       202:
 *         description: Job đã được tạo và đang xử lý.
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
  '/face-to-model',
  upload.fields([{ name: 'faceImage', maxCount: 1 }]),
  aiController.faceToModel.bind(aiController)
);

/**
 * @openapi
 * /api/ai/model-create:
 *   post:
 *     summary: Model Create — tạo người mẫu thời trang từ prompt (2–64 credits)
 *     description: |
 *       Sử dụng Fashn model **model-create**: tạo người mẫu thời trang realistic từ prompt hoặc ảnh tham chiếu.
 *
 *       **Chi phí** (GU.AI credits, markup ×2):
 *       | mode     | 1k | 2k | 4k |
 *       |----------|----|----|-----|
 *       | fast     |  2 |  4 |  6  |
 *       | balanced |  4 |  6 |  8  |
 *       | quality  |  6 |  8 | 10  |
 *       `faceReference` cộng thêm 6 credits/ảnh. Chi phí nhân theo `numImages`.
 *       Lưu ý: dùng `faceReference` giới hạn resolution tối đa ở 2K.
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
 *               prompt:
 *                 type: string
 *                 description: Mô tả người mẫu, trang phục, pose, scene.
 *                 example: Full body shot, woman wearing a white t-shirt and dark blue biker shorts
 *               imageReference:
 *                 type: string
 *                 format: binary
 *                 description: Ảnh tham chiếu guide composition/pose (file).
 *               imageReferenceUrl:
 *                 type: string
 *                 description: URL ảnh tham chiếu.
 *               faceReference:
 *                 type: string
 *                 format: binary
 *                 description: Ảnh khuôn mặt tham chiếu — khóa identity qua nhiều generation (+6 GU.AI credits/ảnh).
 *               faceReferenceUrl:
 *                 type: string
 *                 description: URL ảnh khuôn mặt tham chiếu.
 *               faceReferenceMode:
 *                 type: string
 *                 enum: [match_base, match_reference]
 *                 default: match_reference
 *               aspectRatio:
 *                 type: string
 *                 enum: ['21:9', '16:9', '9:16', '4:3', '3:4', '3:2', '2:3', '4:5', '5:4', '1:1']
 *               resolution:
 *                 type: string
 *                 enum: ['1k', '2k', '4k']
 *                 default: '1k'
 *               generationMode:
 *                 type: string
 *                 enum: [fast, balanced, quality]
 *                 default: fast
 *               numImages:
 *                 type: integer
 *                 minimum: 1
 *                 maximum: 4
 *                 default: 1
 *               seed:
 *                 type: integer
 *                 description: Seed để tái lập kết quả (0 – 4294967295).
 *     responses:
 *       202:
 *         description: Job đã được tạo và đang xử lý.
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
  '/model-create',
  upload.fields([
    { name: 'imageReference', maxCount: 1 },
    { name: 'faceReference',  maxCount: 1 },
  ]),
  aiController.modelCreate.bind(aiController)
);

/**
 * @openapi
 * /api/ai/model-swap:
 *   post:
 *     summary: Model Swap — đổi người mẫu trong ảnh, giữ nguyên outfit (2–64 credits)
 *     description: |
 *       Sử dụng Fashn model **model-swap**: đổi identity người mẫu trong ảnh có sẵn, giữ nguyên outfit, pose, styling.
 *
 *       **Chi phí** (GU.AI credits, markup ×2):
 *       | mode     | 1k | 2k | 4k |
 *       |----------|----|----|-----|
 *       | fast     |  2 |  4 |  6  |
 *       | balanced |  4 |  6 |  8  |
 *       | quality  |  6 |  8 | 10  |
 *       `faceReference` cộng thêm 6 credits/ảnh. Chi phí nhân theo `numImages`.
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
 *               modelImage:
 *                 type: string
 *                 format: binary
 *                 description: Ảnh fashion model nguồn (file).
 *               modelImageUrl:
 *                 type: string
 *                 description: URL ảnh model nguồn.
 *               faceReference:
 *                 type: string
 *                 format: binary
 *                 description: Ảnh tham chiếu identity mới (+6 GU.AI credits/ảnh).
 *               faceReferenceUrl:
 *                 type: string
 *                 description: URL ảnh tham chiếu identity.
 *               prompt:
 *                 type: string
 *                 description: Text guidance cho identity/scene (vd. "Asian woman with blue hair").
 *               faceReferenceMode:
 *                 type: string
 *                 enum: [match_base, match_reference]
 *                 default: match_reference
 *               resolution:
 *                 type: string
 *                 enum: ['1k', '2k', '4k']
 *                 default: '1k'
 *               generationMode:
 *                 type: string
 *                 enum: [fast, balanced, quality]
 *                 default: fast
 *               numImages:
 *                 type: integer
 *                 minimum: 1
 *                 maximum: 4
 *                 default: 1
 *               seed:
 *                 type: integer
 *                 description: Seed để tái lập kết quả (0 – 4294967295).
 *     responses:
 *       202:
 *         description: Job đã được tạo và đang xử lý.
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
  '/model-swap',
  upload.fields([
    { name: 'modelImage',    maxCount: 1 },
    { name: 'faceReference', maxCount: 1 },
  ]),
  aiController.modelSwap.bind(aiController)
);

/**
 * @openapi
 * /api/ai/image-to-video:
 *   post:
 *     summary: Image to Video — biến ảnh thành video ngắn (2–24 credits)
 *     description: |
 *       Sử dụng Fashn model **image-to-video**: tạo motion clip thời trang từ ảnh tĩnh. Output MP4, 5 hoặc 10 giây.
 *
 *       **Chi phí** (GU.AI credits, markup ×2):
 *       | duration | 480p | 720p | 1080p |
 *       |----------|------|------|-------|
 *       | 5s       |   2  |   6  |  12   |
 *       | 10s      |   4  |  12  |  24   |
 *
 *       `endImage` (frame cuối) chỉ hỗ trợ khi `resolution = "1080p"`.
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
 *                 description: Ảnh nguồn cần animate (file, tối đa 15 MB).
 *               imageUrl:
 *                 type: string
 *                 description: URL ảnh nguồn (nếu không upload file).
 *               endImage:
 *                 type: string
 *                 format: binary
 *                 description: Ảnh frame cuối video — chỉ hợp lệ khi resolution="1080p" (file).
 *               endImageUrl:
 *                 type: string
 *                 description: URL ảnh frame cuối — chỉ hợp lệ khi resolution="1080p".
 *               prompt:
 *                 type: string
 *                 description: Motion guidance ngắn gọn (không nên quá chi tiết).
 *               duration:
 *                 type: integer
 *                 enum: [5, 10]
 *                 default: 5
 *                 description: Độ dài video (giây).
 *               resolution:
 *                 type: string
 *                 enum: ['480p', '720p', '1080p']
 *                 default: '1080p'
 *                 description: Độ phân giải video output.
 *     responses:
 *       202:
 *         description: Job đã được tạo và đang xử lý. Output là file MP4.
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
  '/image-to-video',
  upload.fields([
    { name: 'image',    maxCount: 1 },
    { name: 'endImage', maxCount: 1 },
  ]),
  aiController.imageToVideo.bind(aiController)
);

export default router;
