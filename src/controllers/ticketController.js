const pool = require('../config/db');
const notificationService = require('../services/notificationService');

/**
 * Ticket Controller
 * Handles ticket creation, comments, management, and category configuration.
 */

// --- TICKET CREATION ---

const createTicket = async (req, res) => {
  const { title, description, priority, category_id } = req.body;
  const userId = req.user.userId;

  if (!title || !description || !priority || !category_id) {
    return res.status(400).json({ error: 'Missing required fields: title, description, priority, category_id' });
  }

  try {
    // Fetch student record for this user
    const [studentRows] = await pool.query(
      'SELECT student_id, org_id, parent_id, balance FROM students WHERE user_id = ?', [userId]
    );
    if (studentRows.length === 0) return res.status(404).json({ error: 'Student record not found' });
    const { student_id, org_id, parent_id, balance } = studentRows[0];

    // Balance check against category cost
    const [catRows] = await pool.query('SELECT cost FROM ticket_categories WHERE category_id = ?', [category_id]);
    const cost = catRows.length > 0 ? parseFloat(catRows[0].cost) : 0;
    if (balance < cost) {
      await notificationService.notifyEvent('BALANCE_INSUFFICIENT', { studentId: student_id });
      return res.status(402).json({ error: 'Insufficient balance to submit this ticket' });
    }

    const [result] = await pool.query(
      'INSERT INTO tickets (student_id, org_id, title, description, priority, category_id, status) VALUES (?, ?, ?, ?, ?, ?, ?)',
      [student_id, org_id, title, description, priority, category_id, 'open']
    );

    await notificationService.notifyEvent('TICKET_SUBMITTED', { title, orgId: org_id, parentId: parent_id });

    res.status(201).json({ message: 'Ticket created successfully', ticketId: result.insertId });
  } catch (error) {
    console.error('Error creating ticket:', error);
    res.status(500).json({ error: 'Internal server error creating ticket' });
  }
};

const createEmergencyTicket = async (req, res) => {
  const { description } = req.body;
  const userId = req.user.userId;

  if (!description) {
    return res.status(400).json({ error: 'Description is required for emergency tickets' });
  }

  try {
    const [studentRows] = await pool.query(
      'SELECT student_id, org_id, parent_id FROM students WHERE user_id = ?', [userId]
    );
    if (studentRows.length === 0) return res.status(404).json({ error: 'Student record not found' });
    const { student_id, org_id, parent_id } = studentRows[0];

    // Auto-assign to an available admin
    const [admins] = await pool.query(
      "SELECT user_id FROM users WHERE role_id = (SELECT role_id FROM roles WHERE role_name = 'admin') AND status = 'active' LIMIT 1"
    );
    const adminId = admins.length > 0 ? admins[0].user_id : null;

    const [result] = await pool.query(
      'INSERT INTO tickets (student_id, org_id, title, description, priority, status, assigned_admin_id) VALUES (?, ?, ?, ?, ?, ?, ?)',
      [student_id, org_id, 'EMERGENCY: Immediate Assistance Required', description, 'urgent', 'open', adminId]
    );

    await notificationService.notifyEvent('TICKET_SUBMITTED', {
      title: 'EMERGENCY: Immediate Assistance Required',
      orgId: org_id,
      parentId: parent_id,
    });

    res.status(201).json({
      message: 'Emergency ticket created and routed to available admin',
      ticketId: result.insertId,
      assignedAdminId: adminId,
    });
  } catch (error) {
    console.error('Error creating emergency ticket:', error);
    res.status(500).json({ error: 'Internal server error creating emergency ticket' });
  }
};

// --- COMMENT THREAD ---

const addComment = async (req, res) => {
  const { ticket_id, comment } = req.body;
    const userId = req.user.userId;
    const userRole = req.user.role;

  if (!ticket_id || !comment) {
    return res.status(400).json({ error: 'Ticket ID and comment are required' });
  }

  try {
    const [ticket] = await pool.query('SELECT * FROM tickets WHERE ticket_id = ?', [ticket_id]);
    if (ticket.length === 0) {
      return res.status(404).json({ error: 'Ticket not found' });
    }

    const ticketData = ticket[0];

    // RBAC for commenting
    let canComment = false;
    if (userRole === 'super_admin') {
      canComment = true;
    } else if (userRole === 'student' && ticketData.student_id === userId) {
      canComment = true;
    } else if (userRole === 'admin' && ticketData.assigned_admin_id === userId) {
      canComment = true;
    } else if (userRole === 'vendor' && ticketData.assigned_vendor_id === userId) {
      canComment = true;
    }

    if (!canComment) {
      return res.status(403).json({ error: 'You do not have permission to comment on this ticket' });
    }

    await pool.query(
      'INSERT INTO ticket_comments (ticket_id, user_id, user_role, comment) VALUES (?, ?, ?, ?)',
      [ticket_id, userId, userRole, comment]
    );

    res.status(201).json({ message: 'Comment added successfully' });
  } catch (error) {
    console.error('Error adding comment:', error);
    res.status(500).json({ error: 'Internal server error adding comment' });
  }
};

const getComments = async (req, res) => {
  const { ticket_id } = req.params;
    const userId = req.user.userId;
    const userRole = req.user.role;

  try {
    const [ticket] = await pool.query('SELECT * FROM tickets WHERE ticket_id = ?', [ticket_id]);
    if (ticket.length === 0) {
      return res.status(404).json({ error: 'Ticket not found' });
    }

    const ticketData = ticket[0];

    // RBAC for viewing comments
    let canView = false;
    if (userRole === 'super_admin') {
      canView = true;
    } else if (userRole === 'student' && ticketData.student_id === userId) {
      canView = true;
    } else if (userRole === 'admin' && ticketData.assigned_admin_id === userId) {
      canView = true;
    } else if (userRole === 'vendor' && ticketData.assigned_vendor_id === userId) {
      canView = true;
    }

    if (!canView) {
      return res.status(403).json({ error: 'You do not have permission to view comments for this ticket' });
    }

    const [comments] = await pool.query(
      'SELECT comment_id, user_id, user_role, comment, created_at FROM ticket_comments WHERE ticket_id = ? ORDER BY created_at ASC',
      [ticket_id]
    );

    res.json(comments);
  } catch (error) {
    console.error('Error retrieving comments:', error);
    res.status(500).json({ error: 'Internal server error retrieving comments' });
  }
};

// --- MANAGEMENT ENDPOINTS ---

const updateTicketStatus = async (req, res) => {
  const { ticket_id, status } = req.body;
  const userRole = req.user.role;

  if (userRole !== 'admin' && userRole !== 'super_admin') {
    return res.status(403).json({ error: 'Access denied. Admin or Super Admin role required' });
  }

  if (!ticket_id || !status) {
    return res.status(400).json({ error: 'Ticket ID and status are required' });
  }

  try {
    const [result] = await pool.query('UPDATE tickets SET status = ? WHERE ticket_id = ?', [status, ticket_id]);
    if (result.affectedRows === 0) {
      return res.status(404).json({ error: 'Ticket not found' });
    }

    // Get ticket details for notification
    const [ticket] = await pool.query('SELECT student_id, org_id FROM tickets WHERE ticket_id = ?', [ticket_id]);
    if (ticket.length > 0) {
      await notificationService.notifyEvent('TICKET_STATUS_CHANGED', {
        id: ticket_id,
        status: status,
        orgId: ticket[0].org_id,
        studentId: ticket[0].student_id
      });
    }

    res.json({ message: 'Ticket status updated successfully' });
  } catch (error) {
    console.error('Error updating ticket status:', error);
    res.status(500).json({ error: 'Internal server error updating ticket status' });
  }
};

const assignTicket = async (req, res) => {
  const { ticket_id, admin_id, vendor_id } = req.body;

  if (!ticket_id) {
    return res.status(400).json({ error: 'Ticket ID is required' });
  }

  try {
    await pool.query(
      'UPDATE tickets SET assigned_admin_id = ?, assigned_vendor_id = ? WHERE ticket_id = ?',
      [admin_id || null, vendor_id || null, ticket_id]
    );
    res.json({ message: 'Ticket assignment updated successfully' });
  } catch (error) {
    console.error('Error assigning ticket:', error);
    res.status(500).json({ error: 'Internal server error assigning ticket' });
  }
};

const getMyTickets = async (req, res) => {
  const userId = req.user.userId;
  try {
    const [tickets] = await pool.query(
      'SELECT * FROM tickets WHERE student_id = ? ORDER BY created_at DESC',
      [userId]
    );
    res.json(tickets);
  } catch (error) {
    console.error('Error retrieving my tickets:', error);
    res.status(500).json({ error: 'Internal server error retrieving tickets' });
  }
};

const getAdminQueue = async (req, res) => {
  const userId = req.user.userId;
  try {
    const [tickets] = await pool.query(
      'SELECT * FROM tickets WHERE assigned_admin_id = ? OR (assigned_admin_id IS NULL AND status = "open") ORDER BY priority DESC, created_at ASC',
      [userId]
    );
    res.json(tickets);
  } catch (error) {
    console.error('Error retrieving admin queue:', error);
    res.status(500).json({ error: 'Internal server error retrieving admin queue' });
  }
};

const createCategory = async (req, res) => {
  const { category_name, cost, description } = req.body;
  const userRole = req.user.role;

  if (userRole !== 'super_admin') {
    return res.status(403).json({ error: 'Access denied. Super Admin role required' });
  }

  if (!category_name) {
    return res.status(400).json({ error: 'Category name is required' });
  }

  try {
    const [result] = await pool.query(
      'INSERT INTO ticket_categories (category_name, cost, description) VALUES (?, ?, ?)',
      [category_name, cost || 0, description || '']
    );
    res.status(201).json({ message: 'Category created successfully', categoryId: result.insertId });
  } catch (error) {
    console.error('Error creating category:', error);
    res.status(500).json({ error: 'Internal server error creating category' });
  }
};

const getAllCategories = async (req, res) => {
  try {
    const [categories] = await pool.query('SELECT * FROM ticket_categories');
    res.json(categories);
  } catch (error) {
    console.error('Error retrieving categories:', error);
    res.status(500).json({ error: 'Internal server error retrieving categories' });
  }
};

const updateCategory = async (req, res) => {
  const { id } = req.params;
  const { category_name, cost, description } = req.body;
  const userRole = req.user.role;

  if (userRole !== 'super_admin') {
    return res.status(403).json({ error: 'Access denied. Super Admin role required' });
  }

  try {
    const [result] = await pool.query(
      'UPDATE ticket_categories SET category_name = ?, cost = ?, description = ? WHERE category_id = ?',
      [category_name, cost, description, id]
    );
    if (result.affectedRows === 0) {
      return res.status(404).json({ error: 'Category not found' });
    }
    res.json({ message: 'Category updated successfully' });
  } catch (error) {
    console.error('Error updating category:', error);
    res.status(500).json({ error: 'Internal server error updating category' });
  }
};

const deleteCategory = async (req, res) => {
  const { id } = req.params;
  const userRole = req.user.role;

  if (userRole !== 'super_admin') {
    return res.status(403).json({ error: 'Access denied. Super Admin role required' });
  }

  try {
    const [result] = await pool.query('DELETE FROM ticket_categories WHERE category_id = ?', [id]);
    if (result.affectedRows === 0) {
      return res.status(404).json({ error: 'Category not found' });
    }
    res.json({ message: 'Category deleted successfully' });
  } catch (error) {
    console.error('Error deleting category:', error);
    res.status(500).json({ error: 'Internal server error deleting category' });
  }
};

module.exports = {
  createTicket,
  createEmergencyTicket,
  addComment,
  getComments,
  updateTicketStatus,
  assignTicket,
  getMyTickets,
  getAdminQueue,
  createCategory,
  getAllCategories,
  updateCategory,
  deleteCategory
};
