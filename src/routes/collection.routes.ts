import { Router } from 'express';
import { collectionController } from '../controllers/collection.controller';
import { requireAuth } from '../middlewares/auth.middleware';

const router = Router();

// Tất cả các tuyến đường liên quan đến bộ sưu tập đều cần được xác thực
router.use(requireAuth);

router.get('/', collectionController.getCollections);
router.post('/', collectionController.createCollection);
router.delete('/:id', collectionController.deleteCollection);

router.post('/:id/items', collectionController.addCollectionItem);
router.get('/:id/items', collectionController.getCollectionItems);

export default router;
