const pool = require('../config/db');
const { uploadToS3 } = require('../utils/s3Utils');
const notificationService = require('../services/notificationService');

// --- Sales Dashboard Logic ---

exports.getPendingDeposits = async (req, res) => {
  try {
    const [rows] = await pool.execute(
      `SELECT d.*, u.first_name, u.last_name, s.grade_level 
       FROM deposits d 
       JOIN students s ON d.student_id = s.student_id 
       JOIN users u ON s.user_id = u.user_id 
       WHERE d.status = 'pending' 
       ORDER BY d.created_at DESC`
    );
    res.json(rows);
  } catch (error) {
    res.status(500).json({ message: 'Error fetching pending deposits', error: error.message });
  }
};

exports.updateDepositStatus = async (req, res) => {
  const { id } = req.params;
  const { status, reason } = req.body;

  if (!['approved', 'rejected'].includes(status)) {
    return res.status(400).json({ message: 'Invalid status' });
  }

  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();

    await connection.execute(
      'UPDATE deposits SET status = ?, reject_reason = ?, reviewed_by = ? WHERE deposit_id = ?',
      [status, reason || null, req.user.userId, id]
    );

    if (status === 'approved') {
      const [deposit] = await connection.execute('SELECT student_id, amount FROM deposits WHERE deposit_id = ?', [id]);
      if (deposit.length === 0) throw new Error('Deposit not found');
      await connection.execute(
        'UPDATE students SET balance = balance + ? WHERE student_id = ?',
        [deposit[0].amount, deposit[0].student_id]
      );
    }

    await connection.commit();
    res.json({ message: `Deposit ${status} successfully` });
  } catch (error) {
    await connection.rollback();
    res.status(500).json({ message: 'Error updating deposit status', error: error.message });
  } finally {
    connection.release();
  }
};

exports.getOrganizations = async (req, res) => {
  try {
    const [rows] = await pool.execute(
      `SELECT o.*,
        (SELECT COUNT(*) FROM students s WHERE s.org_id = o.org_id) AS student_count
       FROM organizations o
       ORDER BY o.created_at DESC`
    );
    res.json(rows);
  } catch (error) {
    res.status(500).json({ message: 'Error fetching organizations', error: error.message });
  }
};

exports.createOrganization = async (req, res) => {
  const { name, city, province, address, contact_email, contact_phone } = req.body;
  if (!name || !contact_email) {
    return res.status(400).json({ message: 'Organization name and contact email are required' });
  }
  try {
    const [result] = await pool.execute(
      'INSERT INTO organizations (name, city, province, address, contact_email, contact_phone, status) VALUES (?, ?, ?, ?, ?, ?, ?)',
      [name, city || null, province || null, address || null, contact_email, contact_phone || null, 'active']
    );
    const [newOrg] = await pool.execute('SELECT * FROM organizations WHERE org_id = ?', [result.insertId]);
    res.status(201).json(newOrg[0]);
  } catch (error) {
    res.status(500).json({ message: 'Error creating organization', error: error.message });
  }
};

exports.updateOrganization = async (req, res) => {
  const { id } = req.params;
  const { name, city, province, address, contact_email, contact_phone, status } = req.body;
  try {
    await pool.execute(
      'UPDATE organizations SET name = ?, city = ?, province = ?, address = ?, contact_email = ?, contact_phone = ?, status = ? WHERE org_id = ?',
      [name, city || null, province || null, address || null, contact_email, contact_phone || null, status || 'active', id]
    );
    await notificationService.notifyEvent('ORG_PROFILE_UPDATED', { orgName: name });
    res.json({ message: 'Organization updated successfully' });
  } catch (error) {
    res.status(500).json({ message: 'Error updating organization', error: error.message });
  }
};

exports.getStudents = async (req, res) => {
  const { org_id } = req.query;
  try {
    const where = org_id ? 'WHERE s.org_id = ?' : '';
    const params = org_id ? [org_id] : [];
    const [rows] = await pool.execute(
      `SELECT s.student_id, u.first_name, u.last_name, u.email, u.status,
              s.grade_level, s.balance, s.org_id, o.name AS org_name, s.enrollment_date, s.external_student_id
       FROM students s
       JOIN users u ON s.user_id = u.user_id
       LEFT JOIN organizations o ON s.org_id = o.org_id
       ${where}
       ORDER BY u.last_name ASC`,
      params
    );
    res.json(rows);
  } catch (error) {
    res.status(500).json({ message: 'Error fetching students', error: error.message });
  }
};

exports.updateStudentStatus = async (req, res) => {
  const { id } = req.params;
  const { status } = req.body; // 'active', 'inactive', 'suspended'
  try {
    // Student status is actually on the users table
    const [student] = await pool.execute('SELECT user_id FROM students WHERE student_id = ?', [id]);
    if (student.length === 0) return res.status(404).json({ message: 'Student not found' });

    await pool.execute('UPDATE users SET status = ? WHERE user_id = ?', [status, student[0].user_id]);
    res.json({ message: 'Student status updated successfully' });
  } catch (error) {
    res.status(500).json({ message: 'Error updating student status', error: error.message });
  }
};

// --- Organization Dashboard Logic ---

exports.getOrgRoster = async (req, res) => {
  try {
    const orgId = req.user.org_id; // Assumes org_id is in token for 'organization' role
    const [rows] = await pool.execute(
      `SELECT s.*, u.first_name, u.last_name, u.email 
       FROM students s 
       JOIN users u ON s.user_id = u.user_id 
       WHERE s.org_id = ?`,
      [orgId]
    );
    res.json(rows);
  } catch (error) {
    res.status(500).json({ message: 'Error fetching roster', error: error.message });
  }
};

exports.getOrgStats = async (req, res) => {
  try {
    const orgId = req.user.org_id;
    const [ticketCount] = await pool.execute(
      'SELECT COUNT(*) as count FROM tickets WHERE org_id = ?', [orgId]
    );
    const [spend] = await pool.execute(
      `SELECT COALESCE(SUM(tc.cost), 0) AS total_spend
       FROM tickets t
       JOIN ticket_categories tc ON t.category_id = tc.category_id
       WHERE t.org_id = ?`,
      [orgId]
    );
    res.json({ ticketCount: ticketCount[0].count, totalSpend: spend[0].total_spend });
  } catch (error) {
    res.status(500).json({ message: 'Error fetching stats', error: error.message });
  }
};

// --- Parent Dashboard Logic ---

exports.getChildrenStats = async (req, res) => {
  try {
    const [children] = await pool.execute(
      `SELECT s.student_id, u.first_name, u.last_name,
              s.external_student_id, s.grade_level, s.intended_program, s.balance,
              (SELECT COUNT(*) FROM tickets WHERE student_id = s.student_id) AS ticket_count
       FROM parents p
       JOIN students s ON s.parent_id = p.parent_id
       JOIN users u ON s.user_id = u.user_id
       WHERE p.user_id = ?`,
      [req.user.userId]
    );

    // For cost breakdown, we would need to join with tickets and ticket_categories.
    // Since tickets lack category_id, we return placeholders.
    const results = children.map(child => ({
      ...child,
      costBreakdown: {
        total: 0,
        paid: 0,
        unpaid: 0
      }
    }));

    res.json(results);
  } catch (error) {
    res.status(500).json({ message: 'Error fetching children stats', error: error.message });
  }
};

exports.createDeposit = async (req, res) => {
  try {
    const { student_id, amount } = req.body;
    const file = req.file;

    if (!file) {
      return res.status(400).json({ message: 'Deposit proof file is required' });
    }

    const proofUrl = await uploadToS3(file);

    await pool.execute(
      'INSERT INTO deposits (student_id, amount, proof_url, status) VALUES (?, ?, ?, ?)',
      [student_id, amount, proofUrl, 'pending']
    );

    // Get student name for the notification
    const [studentRows] = await pool.execute(
      'SELECT u.first_name, u.last_name FROM students s JOIN users u ON s.user_id = u.user_id WHERE s.student_id = ?',
      [student_id]
    );
    const studentName = studentRows.length > 0 ? `${studentRows[0].first_name} ${studentRows[0].last_name}` : 'Unknown';

    await notificationService.notifyEvent('DEPOSIT_UPLOADED', { studentName, amount });

    res.status(201).json({ message: 'Deposit request submitted successfully', proofUrl });
  } catch (error) {
    res.status(500).json({ message: 'Error creating deposit', error: error.message });
  }
};

// --- Student Routes ---

exports.getStudentBalance = async (req, res) => {
  try {
    const [rows] = await pool.execute(
      'SELECT s.balance, s.external_student_id, u.first_name, u.last_name FROM students s JOIN users u ON s.user_id = u.user_id WHERE s.user_id = ?',
      [req.user.userId]
    );
    if (rows.length === 0) return res.status(404).json({ message: 'Student not found' });
    const s = rows[0];
    res.json({ balance: parseFloat(s.balance), student_id: s.external_student_id, name: `${s.first_name} ${s.last_name}` });
  } catch (error) {
    res.status(500).json({ message: 'Error fetching balance', error: error.message });
  }
};

exports.getEmergencyContacts = async (req, res) => {
  try {
    const [students] = await pool.execute('SELECT student_id FROM students WHERE user_id = ?', [req.user.userId]);
    if (students.length === 0) return res.status(404).json({ message: 'Student not found' });
    const [rows] = await pool.execute(
      'SELECT * FROM emergency_contacts WHERE student_id = ? ORDER BY created_at ASC',
      [students[0].student_id]
    );
    res.json(rows);
  } catch (error) {
    res.status(500).json({ message: 'Error fetching emergency contacts', error: error.message });
  }
};

exports.addEmergencyContact = async (req, res) => {
  const { name, relationship, phone, wechat_id } = req.body;
  if (!name || !phone) return res.status(400).json({ message: 'Name and phone are required' });
  try {
    const [students] = await pool.execute('SELECT student_id FROM students WHERE user_id = ?', [req.user.userId]);
    if (students.length === 0) return res.status(404).json({ message: 'Student not found' });
    const [result] = await pool.execute(
      'INSERT INTO emergency_contacts (student_id, name, relationship, phone, wechat_id) VALUES (?, ?, ?, ?, ?)',
      [students[0].student_id, name, relationship || null, phone, wechat_id || null]
    );
    const [newContact] = await pool.execute('SELECT * FROM emergency_contacts WHERE contact_id = ?', [result.insertId]);
    res.status(201).json(newContact[0]);
  } catch (error) {
    res.status(500).json({ message: 'Error adding emergency contact', error: error.message });
  }
};

exports.deleteEmergencyContact = async (req, res) => {
  const { id } = req.params;
  try {
    const [students] = await pool.execute('SELECT student_id FROM students WHERE user_id = ?', [req.user.userId]);
    if (students.length === 0) return res.status(404).json({ message: 'Student not found' });
    const [result] = await pool.execute(
      'DELETE FROM emergency_contacts WHERE contact_id = ? AND student_id = ?',
      [id, students[0].student_id]
    );
    if (result.affectedRows === 0) return res.status(404).json({ message: 'Contact not found' });
    res.json({ message: 'Contact deleted' });
  } catch (error) {
    res.status(500).json({ message: 'Error deleting emergency contact', error: error.message });
  }
};
