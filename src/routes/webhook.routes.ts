import { Router } from 'express';
import { webhookController } from '../controllers/webhook.controller';

const router = Router();

/**
 * POST /api/webhooks/fashn
 * Called by Fashn.ai when a prediction completes or fails.
 * No auth required — Fashn sends raw JSON payload.
 */
router.post('/fashn', webhookController.fashn.bind(webhookController));

/**
 * POST /api/webhooks/payos
 * Called by PayOS when a payment is completed or cancelled.
 * No auth required — signature verified inside the handler.
 */
router.post('/payos', webhookController.payos.bind(webhookController));

export default router;
