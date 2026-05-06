const pool = require('../config/db');

/**
 * notificationService handles the logic for triggering and managing
 * in-app notifications based on system events and user roles.
 */
const notificationService = {
  /**
   * General method to create a notification for a specific user.
   * @param {number} userId - The ID of the user to notify.
   * @param {string} title - The notification title.
   * @param {string} message - The notification body.
   * @param {object} payload - Additional data (optional).
   */
  async sendNotification(userId, title, message, type = 'general') {
    try {
      const [result] = await pool.query(
        'INSERT INTO notifications (user_id, type, title, message) VALUES (?, ?, ?, ?)',
        [userId, type, title, message]
      );
      return result.insertId;
    } catch (error) {
      console.error('Error creating notification:', error);
      throw error;
    }
  },

  /**
   * Helper to notify all users of a specific role.
   */
  async notifyRole(roleName, title, message, type = 'general') {
    try {
      const [roles] = await pool.query('SELECT role_id FROM roles WHERE role_name = ?', [roleName]);
      if (roles.length === 0) return;
      const roleId = roles[0].role_id;
      const [users] = await pool.query('SELECT user_id FROM users WHERE role_id = ?', [roleId]);
      await Promise.all(users.map(u => this.sendNotification(u.user_id, title, message, type)));
    } catch (error) {
      console.error(`Error notifying role ${roleName}:`, error);
      throw error;
    }
  },

  /**
   * Trigger notifications based on specific system events mapping to recipients.
   * @param {string} eventType - The event identifier.
   * @param {object} data - Contextual data for the notification.
   */
  async notifyEvent(eventType, data) {
    switch (eventType) {
      case 'STUDENT_REGISTRATION_COMPLETE': {
        const title = 'New Student Registration';
        const message = `Student ${data.studentName || 'Unknown'} has completed registration.`;
        await this.notifyRole('sales', title, message, 'onboarding');
        break;
      }

      case 'ORG_PROFILE_UPDATED': {
        const title = 'Organization Profile Updated';
        const message = `Organization ${data.orgName || 'Unknown'} updated their profile.`;
        await this.notifyRole('sales', title, message, 'organization');
        break;
      }

      case 'TICKET_SUBMITTED': {
        const title = 'New Ticket Submitted';
        const message = `New ticket: ${data.title || 'No Title'}`;
        await this.notifyRole('sales', title, message, 'ticket');
        await this.notifyRole('super_admin', title, message, 'ticket');
        if (data.orgId) {
          const [orgAdmins] = await pool.query('SELECT user_id FROM organization_admins WHERE org_id = ?', [data.orgId]);
          for (const a of orgAdmins) await this.sendNotification(a.user_id, title, message, 'ticket');
        }
        if (data.parentId) {
          const [parent] = await pool.query('SELECT user_id FROM parents WHERE parent_id = ?', [data.parentId]);
          if (parent.length > 0) await this.sendNotification(parent[0].user_id, title, message, 'ticket');
        }
        break;
      }

      case 'TICKET_STATUS_CHANGED': {
        const title = 'Ticket Status Updated';
        const message = `Ticket #${data.id} status changed to: ${data.status}`;
        if (data.orgId) {
          const [orgAdmins] = await pool.query('SELECT user_id FROM organization_admins WHERE org_id = ?', [data.orgId]);
          for (const a of orgAdmins) await this.sendNotification(a.user_id, title, message, 'ticket');
        }
        if (data.studentId) {
          const [student] = await pool.query('SELECT user_id FROM students WHERE student_id = ?', [data.studentId]);
          if (student.length > 0) await this.sendNotification(student[0].user_id, title, message, 'ticket');
        }
        break;
      }

      case 'DEPOSIT_UPLOADED': {
        const title = 'New Deposit Submitted';
        const message = `Deposit uploaded by ${data.studentName || 'Unknown'} — amount: ¥${data.amount}`;
        await this.notifyRole('sales', title, message, 'deposit');
        break;
      }

      case 'BALANCE_INSUFFICIENT': {
        const title = 'Insufficient Balance';
        const message = 'Your account balance is insufficient to submit this ticket. Please top up your balance.';
        if (data.studentId) {
          const [student] = await pool.query('SELECT user_id FROM students WHERE student_id = ?', [data.studentId]);
          if (student.length > 0) await this.sendNotification(student[0].user_id, title, message, 'balance');
        }
        break;
      }

      default:
        console.warn(`Unhandled notification event: ${eventType}`);
    }
  },

  /**
   * Fetch paginated notifications for a user.
   */
  async getNotificationsForUser(userId, limit = 20, offset = 0) {
    const [notifications] = await pool.query(
      'SELECT * FROM notifications WHERE user_id = ? ORDER BY created_at DESC LIMIT ? OFFSET ?',
      [userId, limit, offset]
    );
    return notifications;
  },

  /**
   * Mark specific notifications as read.
   */
  async markNotificationsAsRead(userId, notificationIds) {
    if (!notificationIds || notificationIds.length === 0) return;
    await pool.query(
      'UPDATE notifications SET is_read = TRUE WHERE user_id = ? AND notification_id IN (?)',
      [userId, notificationIds]
    );
  },

  /**
   * Get count of unread notifications.
   */
  async getUnreadCount(userId) {
    const [rows] = await pool.query(
      'SELECT COUNT(*) as count FROM notifications WHERE user_id = ? AND is_read = FALSE',
      [userId]
    );
    return rows[0].count;
  }
};

module.exports = notificationService;
