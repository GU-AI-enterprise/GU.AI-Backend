import { Router } from 'express';
import { webhookController } from '../controllers/webhook.controller';

const router = Router();

/**
 * POST /api/webhooks/fashn
 * Called by Fashn.ai when a prediction completes or fails.
 * No auth required — Fashn sends raw JSON payload.
 */
router.post('/fashn', webhookController.fashn.bind(webhookController));

export default router;
