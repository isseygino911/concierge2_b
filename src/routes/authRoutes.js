const express = require('express');
const router = express.Router();
const authController = require('../controllers/authController');
const { authenticate, authorize } = require('../middleware/authMiddleware');

// Public routes
router.post('/login', authController.login);
router.post('/signup', authController.signup);
router.post('/request-password-reset', authController.requestPasswordReset);
router.post('/reset-password', authController.resetPassword);
router.post('/reset-password-verify', authController.resetPasswordVerify);
router.get('/validate-token/:token', authController.validateInviteToken);
router.post('/register-from-invite', authController.registerFromInvite);

// Protected routes
router.post('/invite', authenticate, authorize('super_admin', 'admin', 'sales'), authController.createInvitation);
router.get('/invitations', authenticate, authorize('super_admin', 'admin', 'sales'), authController.getInvitations);

module.exports = router;
