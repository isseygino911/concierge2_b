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
      const { notification_ids, all, is_read } = req.body;
      const pool = require('../config/db');

      if (all) {
        await pool.execute(
          'UPDATE notifications SET is_read = TRUE WHERE user_id = ?',
          [userId]
        );
      } else if (Array.isArray(notification_ids) && notification_ids.length > 0) {
        const placeholders = notification_ids.map(() => '?').join(',');
        const readValue = is_read === false ? 0 : 1;
        await pool.execute(
          `UPDATE notifications SET is_read = ? WHERE notification_id IN (${placeholders}) AND user_id = ?`,
          [readValue, ...notification_ids, userId]
        );
      } else {
        return res.status(400).json({ success: false, message: 'notification_ids array or all:true required' });
      }

      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ success: false, message: 'Error updating notifications', error: error.message });
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
