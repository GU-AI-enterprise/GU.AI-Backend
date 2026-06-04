import { Router } from 'express';
import { paymentController } from '../controllers/payment.controller';
import { requireAuth } from '../middlewares/auth.middleware';

const router = Router();

// Get active credit packages (public)
router.get('/packages', paymentController.getPackages.bind(paymentController));

// Create PayOS payment link
router.post('/create', requireAuth, paymentController.createPaymentLink.bind(paymentController));

// Get payment status by orderCode
router.get('/:orderCode', requireAuth, paymentController.getPaymentInfo.bind(paymentController));

// Verify with PayOS and credit the user (called from return URL — fallback for when webhook didn't fire)
router.post('/:orderCode/process', requireAuth, paymentController.processPayment.bind(paymentController));

// Cancel a pending payment
router.post('/:orderCode/cancel', requireAuth, paymentController.cancelPayment.bind(paymentController));

// Register/update PayOS webhook URL (admin only)
router.post('/confirm-webhook', requireAuth, paymentController.confirmWebhook.bind(paymentController));

export default router;
