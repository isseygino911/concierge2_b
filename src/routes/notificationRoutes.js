const express = require('express');
const router = express.Router();
const notificationController = require('../controllers/notificationController');
const { authenticate: authMiddleware } = require('../middleware/authMiddleware');

// All notification routes require authentication
router.use(authMiddleware);

router.get('/', notificationController.getNotifications);
router.get('/unread-count', notificationController.getUnreadCount);
router.patch('/read', notificationController.markAsRead);

module.exports = router;
