import { Router } from 'express';
import { imageController } from '../controllers/image.controller';
import { requireAuth } from '../middlewares/auth.middleware';

const router = Router();

router.use(requireAuth);

// ── Collection-level (phải đặt TRƯỚC /:id) ───────────────────────────────────
router.get('/archived',      imageController.getArchivedImages.bind(imageController));
router.delete('/archive',    imageController.emptyArchive.bind(imageController));
router.post('/bulk-archive', imageController.bulkArchive.bind(imageController));

// ── Base CRUD ─────────────────────────────────────────────────────────────────
router.get('/',  imageController.getImages.bind(imageController));
router.post('/', imageController.createImage.bind(imageController));

// ── Single-item actions ───────────────────────────────────────────────────────
router.patch('/:id/archive',   imageController.archiveImage.bind(imageController));
router.patch('/:id/restore',   imageController.restoreFromArchive.bind(imageController));
router.delete('/:id/permanent',imageController.permanentlyDeleteImage.bind(imageController));

// DELETE /:id — backward-compat: soft delete vào Archive
router.delete('/:id', imageController.deleteImage.bind(imageController));

export default router;
