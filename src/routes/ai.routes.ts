import { Router } from 'express';
import multer from 'multer';
import { aiController } from '../controllers/ai.controller';
import { requireAuth } from '../middlewares/auth.middleware';

const router = Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });

// Tất cả AI endpoints đều cần auth
router.use(requireAuth);

// Test tất cả 4 API key
router.post('/test', aiController.testKeys.bind(aiController));

// Generate ảnh từ prompt
router.post('/generate', aiController.generateImage.bind(aiController));

// Edit ảnh (upload file + prompt)
router.post('/edit', upload.single('image'), aiController.editImage.bind(aiController));

export default router;
