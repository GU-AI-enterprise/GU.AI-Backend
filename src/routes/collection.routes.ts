import { Router } from 'express';
import { collectionController } from '../controllers/collection.controller';
import { requireAuth } from '../middlewares/auth.middleware';

const router = Router();

router.use(requireAuth);

/**
 * @openapi
 * /api/collections:
 *   get:
 *     summary: Lấy danh sách bộ sưu tập của người dùng
 *     description: Trả về tất cả bộ sưu tập thuộc về người dùng đang đăng nhập.
 *     tags:
 *       - Collections
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Danh sách bộ sưu tập.
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
 *                   example: Lấy danh sách bộ sưu tập thành công.
 *                 data:
 *                   type: array
 *                   items:
 *                     $ref: '#/components/schemas/Collection'
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
router.get('/', collectionController.getCollections);

/**
 * @openapi
 * /api/collections:
 *   post:
 *     summary: Tạo bộ sưu tập mới
 *     description: Tạo một bộ sưu tập mới cho người dùng đang đăng nhập.
 *     tags:
 *       - Collections
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - name
 *             properties:
 *               name:
 *                 type: string
 *                 description: Tên bộ sưu tập.
 *               description:
 *                 type: string
 *                 description: Mô tả bộ sưu tập (tùy chọn).
 *               coverAssetId:
 *                 type: string
 *                 format: uuid
 *                 description: ID asset dùng làm ảnh bìa (tùy chọn).
 *               visibility:
 *                 type: string
 *                 enum: [private, public]
 *                 default: private
 *                 description: Chế độ hiển thị.
 *             example:
 *               name: Summer Fashion 2026
 *               description: Bộ sưu tập trang phục mùa hè
 *               visibility: private
 *     responses:
 *       201:
 *         description: Tạo bộ sưu tập thành công.
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
 *                   example: Tạo bộ sưu tập thành công.
 *                 data:
 *                   $ref: '#/components/schemas/Collection'
 *       400:
 *         description: Thiếu tên bộ sưu tập.
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
router.post('/', collectionController.createCollection);

/**
 * @openapi
 * /api/collections/{id}:
 *   get:
 *     summary: Lấy chi tiết bộ sưu tập
 *     description: Trả về thông tin chi tiết của một bộ sưu tập theo ID. Người dùng chỉ có thể xem bộ sưu tập của mình.
 *     tags:
 *       - Collections
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *         description: UUID của bộ sưu tập.
 *     responses:
 *       200:
 *         description: Chi tiết bộ sưu tập.
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
 *                 data:
 *                   $ref: '#/components/schemas/Collection'
 *       400:
 *         description: Thiếu ID bộ sưu tập.
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
router.get('/:id', collectionController.getCollectionById);

/**
 * @openapi
 * /api/collections/{id}:
 *   put:
 *     summary: Cập nhật bộ sưu tập
 *     description: Cập nhật thông tin của một bộ sưu tập. Người dùng chỉ có thể cập nhật bộ sưu tập của mình.
 *     tags:
 *       - Collections
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *         description: UUID của bộ sưu tập.
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               name:
 *                 type: string
 *               description:
 *                 type: string
 *               coverAssetId:
 *                 type: string
 *                 format: uuid
 *               visibility:
 *                 type: string
 *                 enum: [private, public]
 *             example:
 *               name: Summer Collection Updated
 *               visibility: public
 *     responses:
 *       200:
 *         description: Cập nhật bộ sưu tập thành công.
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
 *                 data:
 *                   $ref: '#/components/schemas/Collection'
 *       400:
 *         description: Thiếu ID bộ sưu tập.
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
router.put('/:id', collectionController.updateCollection);

/**
 * @openapi
 * /api/collections/{id}:
 *   delete:
 *     summary: Xóa bộ sưu tập
 *     description: Xóa một bộ sưu tập theo ID. Người dùng chỉ có thể xóa bộ sưu tập của mình.
 *     tags:
 *       - Collections
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *         description: UUID của bộ sưu tập cần xóa.
 *     responses:
 *       200:
 *         description: Xóa bộ sưu tập thành công.
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
 *                   example: Xóa bộ sưu tập thành công.
 *       400:
 *         description: Thiếu ID bộ sưu tập.
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
router.delete('/:id', collectionController.deleteCollection);

/**
 * @openapi
 * /api/collections/{id}/items:
 *   post:
 *     summary: Thêm ảnh vào bộ sưu tập
 *     description: Liên kết một asset (ảnh) vào bộ sưu tập theo ID.
 *     tags:
 *       - Collections
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *         description: UUID của bộ sưu tập.
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - assetId
 *             properties:
 *               assetId:
 *                 type: string
 *                 format: uuid
 *                 description: UUID của asset cần thêm vào bộ sưu tập.
 *             example:
 *               assetId: 550e8400-e29b-41d4-a716-446655440000
 *     responses:
 *       200:
 *         description: Thêm ảnh vào bộ sưu tập thành công.
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
 *                   example: Thêm ảnh vào bộ sưu tập thành công.
 *                 data:
 *                   type: object
 *       400:
 *         description: Thiếu ID bộ sưu tập hoặc assetId.
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
router.post('/:id/items', collectionController.addCollectionItem);

/**
 * @openapi
 * /api/collections/{id}/items:
 *   get:
 *     summary: Lấy danh sách ảnh trong bộ sưu tập
 *     description: Trả về tất cả asset (ảnh) trong một bộ sưu tập theo ID.
 *     tags:
 *       - Collections
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *         description: UUID của bộ sưu tập.
 *     responses:
 *       200:
 *         description: Danh sách ảnh trong bộ sưu tập.
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
 *                 data:
 *                   type: array
 *                   items:
 *                     $ref: '#/components/schemas/Asset'
 *       400:
 *         description: Thiếu ID bộ sưu tập.
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
router.get('/:id/items', collectionController.getCollectionItems);

/**
 * @openapi
 * /api/collections/{id}/items:
 *   delete:
 *     summary: Xóa ảnh khỏi bộ sưu tập
 *     description: Gỡ liên kết một asset (ảnh) khỏi bộ sưu tập (không xóa asset gốc).
 *     tags:
 *       - Collections
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *         description: UUID của bộ sưu tập.
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - assetId
 *             properties:
 *               assetId:
 *                 type: string
 *                 format: uuid
 *                 description: UUID của asset cần gỡ khỏi bộ sưu tập.
 *             example:
 *               assetId: 550e8400-e29b-41d4-a716-446655440000
 *     responses:
 *       200:
 *         description: Xóa ảnh khỏi bộ sưu tập thành công.
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
 *                   example: Xóa ảnh khỏi bộ sưu tập thành công.
 *       400:
 *         description: Thiếu ID bộ sưu tập hoặc assetId.
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
router.delete('/:id/items', collectionController.removeCollectionItem);

export default router;
