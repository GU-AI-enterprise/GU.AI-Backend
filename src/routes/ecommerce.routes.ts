import { Router } from 'express';
import { generateSeo } from '../controllers/ecommerce.controller';

const router = Router();
router.post('/generate-seo', generateSeo);

export default router;
