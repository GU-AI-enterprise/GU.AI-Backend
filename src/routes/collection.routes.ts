import { Router } from 'express';
import { collectionController } from '../controllers/collection.controller';
import { requireAuth } from '../middlewares/auth.middleware';

const router = Router();

// Tất cả các tuyến đường liên quan đến bộ sưu tập đều cần được xác thực
router.use(requireAuth);

// Collection CRUD
router.get('/', collectionController.getCollections);
router.post('/', collectionController.createCollection);
router.get('/:id', collectionController.getCollectionById);
router.put('/:id', collectionController.updateCollection);
router.delete('/:id', collectionController.deleteCollection);

// Collection Items CRUD
router.post('/:id/items', collectionController.addCollectionItem);
router.get('/:id/items', collectionController.getCollectionItems);
router.delete('/:id/items', collectionController.removeCollectionItem);

export default router;
