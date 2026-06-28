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

/**
 * GET /api/library/search?q=keyword
 * Semantic search using pgvector
 */
router.get('/search', async (req: AuthRequest, res: Response) => {
  try {
    const q = req.query.q as string;
    if (!q) {
      const items = await LibraryService.getAll();
      return res.json({ success: true, data: items });
    }
    const matches = await LibraryService.searchSimilar(q, 15, 0.6); // Lấy top 15 kết quả có similarity >= 0.6
    res.json({ success: true, data: matches });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

export default router;
