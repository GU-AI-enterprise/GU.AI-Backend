import { Router } from 'express';
import multer from 'multer';
import { aiController } from '../controllers/ai.controller';
import { requireAuth } from '../middlewares/auth.middleware';

const router = Router();

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 15 * 1024 * 1024 }, // 15 MB mỗi file
});

// Tất cả AI endpoints đều cần auth
router.use(requireAuth);

// Kiểm tra kết nối Fashn.ai
router.post('/test', aiController.testConnection.bind(aiController));

// Xem số credits còn lại trên tài khoản Fashn.ai
router.get('/credits', aiController.getCredits.bind(aiController));

// Virtual try-on (model photo + garment photo)
// Nhận 2 files: 'modelImage' và 'garmentImage' (hoặc URL qua body)
router.post(
  '/try-on',
  upload.fields([
    { name: 'modelImage', maxCount: 1 },
    { name: 'garmentImage', maxCount: 1 },
  ]),
  aiController.tryOn.bind(aiController)
);

export default router;
