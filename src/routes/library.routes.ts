import { Router, Response } from 'express';
import { requireAuth, AuthRequest } from '../middlewares/auth.middleware';
import { LibraryService } from '../services/library.service';

const router = Router();
router.use(requireAuth);

/**
 * GET /api/library
 * Danh sách template (model/pose/prompt/background/example) cho trang Library.
 */
router.get('/', async (_req: AuthRequest, res: Response) => {
  try {
    const items = await LibraryService.getAll();
    res.json({ success: true, data: items });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

export default router;
