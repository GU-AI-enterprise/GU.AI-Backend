import { Router } from 'express';
import { UserController } from '../controllers/user.controller';
import { requireAuth } from '../middlewares/auth.middleware';

const router = Router();
const userController = new UserController();

// All user routes require authentication
router.use(requireAuth);

// Get current user profile
router.get('/profile', userController.getProfile.bind(userController));

// Update user profile
router.put('/profile', userController.updateProfile.bind(userController));

// Change password
router.put('/profile/password', userController.changePassword.bind(userController));

// Delete account
router.delete('/profile', userController.deleteAccount.bind(userController));

export default router;
