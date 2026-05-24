import { Router } from 'express';
import { imageController } from '../controllers/image.controller';
import { requireAuth } from '../middlewares/auth.middleware';

const router = Router();

// Tất cả các tuyến đường liên quan đến ảnh đều cần được xác thực
router.use(requireAuth);

router.get('/', imageController.getImages);
router.post('/', imageController.createImage);
router.delete('/:id', imageController.deleteImage);

export default router;
