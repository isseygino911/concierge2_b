const notificationService = require('../services/notificationService');

const notificationController = {
  /**
   * GET /notifications
   * Fetch paginated list of notifications for the authenticated user.
   */
  async getNotifications(req, res) {
    try {
      const userId = req.user.userId;
      const limit = parseInt(req.query.limit) || 20;
      const offset = parseInt(req.query.offset) || 0;

      const notifications = await notificationService.getNotificationsForUser(userId, limit, offset);
      res.json({ success: true, data: notifications });
    } catch (error) {
      res.status(500).json({ success: false, message: 'Error fetching notifications', error: error.message });
    }
  },

  /**
   * PATCH /notifications/read
   * Mark specific notifications as read.
   */
  async markAsRead(req, res) {
    try {
      const userId = req.user.userId;
      const { notificationIds } = req.body;

      if (!notificationIds || !Array.isArray(notificationIds)) {
        return res.status(400).json({ success: false, message: 'notificationIds array is required' });
      }

      await notificationService.markNotificationsAsRead(userId, notificationIds);
      res.json({ success: true, message: 'Notifications marked as read' });
    } catch (error) {
      res.status(500).json({ success: false, message: 'Error marking notifications as read', error: error.message });
    }
  },

  /**
   * GET /notifications/unread-count
   * Return the count of unread notifications for the user.
   */
  async getUnreadCount(req, res) {
    try {
      const userId = req.user.userId;
      const count = await notificationService.getUnreadCount(userId);
      res.json({ success: true, count });
    } catch (error) {
      res.status(500).json({ success: false, message: 'Error fetching unread count', error: error.message });
    }
  }
};

module.exports = notificationController;
