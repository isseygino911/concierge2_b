const pool = require('../config/db');
const { uploadToS3, getPresignedUrl } = require('../utils/s3Utils');
const notificationService = require('../services/notificationService');

// --- Sales Dashboard Logic ---

exports.getPendingDeposits = async (req, res) => {
  const isSuperAdmin = req.user.role === 'super_admin';
  try {
    const query = isSuperAdmin
      ? `SELECT d.deposit_id, d.student_id, d.amount, d.currency, d.note, d.proof_url,
                d.status, d.reject_reason, d.created_at,
                u.first_name, u.last_name, s.grade_level, o.name AS org_name
         FROM deposits d
         JOIN students s ON d.student_id = s.student_id
         JOIN users u ON s.user_id = u.user_id
         LEFT JOIN organizations o ON s.org_id = o.org_id
         ORDER BY d.created_at DESC`
      : `SELECT d.deposit_id, d.student_id, d.amount, d.currency, d.note, d.proof_url,
                d.status, d.reject_reason, d.created_at,
                u.first_name, u.last_name, s.grade_level, o.name AS org_name
         FROM deposits d
         JOIN students s ON d.student_id = s.student_id
         JOIN users u ON s.user_id = u.user_id
         JOIN organizations o ON s.org_id = o.org_id
         JOIN sales_reps sr ON o.sales_rep_id = sr.sales_rep_id AND sr.user_id = ?
         ORDER BY d.created_at DESC`;
    const params = isSuperAdmin ? [] : [req.user.userId];
    const [rows] = await pool.execute(query, params);
    const result = rows.map(d => ({
      ...d,
      proof_url: d.proof_url ? getPresignedUrl(d.proof_url, 900) : null,
    }));
    res.json(result);
  } catch (error) {
    res.status(500).json({ message: 'Error fetching deposits', error: error.message });
  }
};

exports.updateDepositStatus = async (req, res) => {
  const { id } = req.params;
  const { status, reason } = req.body;
  const isSuperAdmin = req.user.role === 'super_admin';

  if (!['approved', 'rejected'].includes(status)) {
    return res.status(400).json({ message: 'Invalid status' });
  }

  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();

    // Verify the deposit belongs to this sales rep's org (or super_admin bypasses)
    const ownershipQuery = isSuperAdmin
      ? 'SELECT d.student_id, d.amount, d.currency FROM deposits d WHERE d.deposit_id = ?'
      : `SELECT d.student_id, d.amount, d.currency FROM deposits d
         JOIN students s ON d.student_id = s.student_id
         JOIN organizations o ON s.org_id = o.org_id
         JOIN sales_reps sr ON o.sales_rep_id = sr.sales_rep_id AND sr.user_id = ?
         WHERE d.deposit_id = ?`;
    const ownershipParams = isSuperAdmin ? [id] : [req.user.userId, id];
    const [deposit] = await connection.execute(ownershipQuery, ownershipParams);
    if (deposit.length === 0) {
      await connection.rollback();
      return res.status(404).json({ message: 'Deposit not found' });
    }

    await connection.execute(
      'UPDATE deposits SET status = ?, reject_reason = ?, reviewed_by = ? WHERE deposit_id = ?',
      [status, reason || null, req.user.userId, id]
    );

    if (status === 'approved') {
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
  const isSuperAdmin = req.user.role === 'super_admin';
  try {
    const query = isSuperAdmin
      ? `SELECT o.*, (SELECT COUNT(*) FROM students s WHERE s.org_id = o.org_id) AS student_count
         FROM organizations o ORDER BY o.created_at DESC`
      : `SELECT o.*, (SELECT COUNT(*) FROM students s WHERE s.org_id = o.org_id) AS student_count
         FROM organizations o
         JOIN sales_reps sr ON o.sales_rep_id = sr.sales_rep_id AND sr.user_id = ?
         ORDER BY o.created_at DESC`;
    const params = isSuperAdmin ? [] : [req.user.userId];
    const [rows] = await pool.execute(query, params);
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
    const [repRows] = await pool.execute('SELECT sales_rep_id FROM sales_reps WHERE user_id = ?', [req.user.userId]);
    if (repRows.length === 0) return res.status(403).json({ message: 'Sales rep profile not found' });
    const salesRepId = repRows[0].sales_rep_id;

    const [result] = await pool.execute(
      'INSERT INTO organizations (name, city, province, address, contact_email, contact_phone, status, sales_rep_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
      [name, city || null, province || null, address || null, contact_email, contact_phone || null, 'active', salesRepId]
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
  const isSuperAdmin = req.user.role === 'super_admin';
  try {
    // Verify ownership before updating
    const ownerCheck = isSuperAdmin
      ? 'SELECT org_id FROM organizations WHERE org_id = ?'
      : `SELECT o.org_id FROM organizations o
         JOIN sales_reps sr ON o.sales_rep_id = sr.sales_rep_id AND sr.user_id = ?
         WHERE o.org_id = ?`;
    const [owned] = await pool.execute(ownerCheck, isSuperAdmin ? [id] : [req.user.userId, id]);
    if (owned.length === 0) return res.status(404).json({ message: 'Organization not found' });

    await pool.execute(
      'UPDATE organizations SET name = ?, city = ?, province = ?, address = ?, contact_email = ?, contact_phone = ?, status = ? WHERE org_id = ?',
      [name, city || null, province || null, address || null, contact_email, contact_phone || null, status || 'active', id]
    );

    // Fetch the organization again to get the latest name (handles PATCH where name might be undefined)
    const [orgRows] = await pool.execute('SELECT name FROM organizations WHERE org_id = ?', [id]);
    const updatedOrgName = orgRows[0]?.name;

    await notificationService.notifyEvent('ORG_PROFILE_UPDATED', { orgName: updatedOrgName, orgId: parseInt(id) });
    res.json({ message: 'Organization updated successfully' });
  } catch (error) {
    res.status(500).json({ message: 'Error updating organization', error: error.message });
  }
};

exports.getStudents = async (req, res) => {
  const { org_id } = req.query;
  const isSuperAdmin = req.user.role === 'super_admin';
  try {
    let where = '';
    let params = [];

    if (isSuperAdmin) {
      if (org_id) { where = 'WHERE s.org_id = ?'; params = [org_id]; }
    } else {
      if (org_id) {
        where = 'WHERE s.org_id = ? AND sr.user_id = ?';
        params = [org_id, req.user.userId];
      } else {
        where = 'WHERE sr.user_id = ?';
        params = [req.user.userId];
      }
    }

    const orgJoin = isSuperAdmin
      ? 'LEFT JOIN organizations o ON s.org_id = o.org_id'
      : 'JOIN organizations o ON s.org_id = o.org_id JOIN sales_reps sr ON o.sales_rep_id = sr.sales_rep_id';
    const [rows] = await pool.execute(
      `SELECT s.student_id, u.first_name, u.last_name, u.email, u.status,
              s.grade_level, s.balance, s.org_id, o.name AS org_name, s.enrollment_date, s.external_student_id,
              ir.pdf_s3_key, ir.voice_s3_key
       FROM students s
       JOIN users u ON s.user_id = u.user_id
       ${orgJoin}
       LEFT JOIN intake_records ir ON ir.student_id = s.student_id
       ${where}
       ORDER BY u.last_name ASC`,
      params
    );
    const result = rows.map(r => ({
      ...r,
      intake_pdf_url: r.pdf_s3_key ? getPresignedUrl(r.pdf_s3_key, 900) : null,
      intake_voice_url: r.voice_s3_key ? getPresignedUrl(r.voice_s3_key, 900) : null,
      pdf_s3_key: undefined,
      voice_s3_key: undefined,
    }));
    res.json(result);
  } catch (error) {
    res.status(500).json({ message: 'Error fetching students', error: error.message });
  }
};

exports.updateStudentStatus = async (req, res) => {
  const { id } = req.params;
  const { status } = req.body;
  const isSuperAdmin = req.user.role === 'super_admin';
  try {
    const studentQuery = isSuperAdmin
      ? 'SELECT s.user_id FROM students s WHERE s.student_id = ?'
      : `SELECT s.user_id FROM students s
         JOIN organizations o ON s.org_id = o.org_id
         JOIN sales_reps sr ON o.sales_rep_id = sr.sales_rep_id AND sr.user_id = ?
         WHERE s.student_id = ?`;
    const [student] = await pool.execute(studentQuery, isSuperAdmin ? [id] : [req.user.userId, id]);
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
              COALESCE((SELECT currency FROM deposits WHERE student_id = s.student_id AND status = 'approved' ORDER BY created_at DESC LIMIT 1), 'USD') AS currency,
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
    const { student_id, amount, currency, note } = req.body;
    const file = req.file;

    if (!file) return res.status(400).json({ message: 'Deposit proof file is required' });
    if (!student_id || !amount) return res.status(400).json({ message: 'student_id and amount are required' });

    const proofS3Key = await uploadToS3(file);

    await pool.execute(
      'INSERT INTO deposits (student_id, amount, currency, note, proof_url, status) VALUES (?, ?, ?, ?, ?, ?)',
      [student_id, amount, currency || 'CAD', note || null, proofS3Key, 'pending']
    );

    const [studentRows] = await pool.execute(
      'SELECT u.first_name, u.last_name FROM students s JOIN users u ON s.user_id = u.user_id WHERE s.student_id = ?',
      [student_id]
    );
    const studentName = studentRows.length > 0 ? `${studentRows[0].first_name} ${studentRows[0].last_name}` : 'Unknown';
    await notificationService.notifyEvent('DEPOSIT_UPLOADED', { studentName, studentId: student_id, amount, currency: currency || 'CAD' });

    res.status(201).json({ message: 'Deposit request submitted successfully' });
  } catch (error) {
    res.status(500).json({ message: 'Error creating deposit', error: error.message });
  }
};

exports.getParentDeposits = async (req, res) => {
  try {
    const [rows] = await pool.execute(
      `SELECT d.deposit_id, d.student_id, d.amount, d.currency, d.note, d.proof_url, d.status, d.created_at,
              u.first_name, u.last_name
       FROM parents p
       JOIN students s ON s.parent_id = p.parent_id
       JOIN deposits d ON d.student_id = s.student_id
       JOIN users u ON s.user_id = u.user_id
       WHERE p.user_id = ?
       ORDER BY d.created_at DESC`,
      [req.user.userId]
    );
    const result = rows.map(d => ({
      ...d,
      proof_url: d.proof_url ? getPresignedUrl(d.proof_url, 900) : null,
    }));
    res.json(result);
  } catch (error) {
    res.status(500).json({ message: 'Error fetching deposits', error: error.message });
  }
};

// --- Student Routes ---

exports.getStudentBalance = async (req, res) => {
  try {
    const [rows] = await pool.execute(
      `SELECT s.balance, s.external_student_id, u.first_name, u.last_name,
        COALESCE((SELECT currency FROM deposits WHERE student_id = s.student_id AND status = 'approved' ORDER BY created_at DESC LIMIT 1), 'USD') AS currency
       FROM students s JOIN users u ON s.user_id = u.user_id WHERE s.user_id = ?`,
      [req.user.userId]
    );
    if (rows.length === 0) return res.status(404).json({ message: 'Student not found' });
    const s = rows[0];
    res.json({ balance: parseFloat(s.balance), currency: s.currency, student_id: s.external_student_id, name: `${s.first_name} ${s.last_name}` });
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
