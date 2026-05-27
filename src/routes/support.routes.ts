import { Router } from 'express';
import { SupportController } from '../controllers/support.controller';
import { requireAuth, requireStaff } from '../middlewares/auth.middleware';

const router = Router();
const supportController = new SupportController();

router.use(requireAuth);

router.get('/me', supportController.getMyConversation.bind(supportController));
router.get('/conversations', requireStaff, supportController.getConversations.bind(supportController));
router.get('/conversations/:conversationId', supportController.getConversationMessages.bind(supportController));
router.post('/conversations/:conversationId/messages', supportController.sendMessage.bind(supportController));
router.patch('/conversations/:conversationId/status', requireStaff, supportController.updateConversationStatus.bind(supportController));

export default router;
