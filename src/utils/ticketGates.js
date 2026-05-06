const pool = require('../config/db');

const checkEmergencyContacts = async (userId) => {
  const [students] = await pool.query('SELECT student_id FROM students WHERE user_id = ?', [userId]);
  if (students.length === 0) return false;
  const [rows] = await pool.query(
    'SELECT COUNT(*) as count FROM emergency_contacts WHERE student_id = ?',
    [students[0].student_id]
  );
  return rows[0].count >= 3;
};

const checkBalance = async (userId, cost) => {
  if (!cost || cost <= 0) return true;
  const [rows] = await pool.query('SELECT balance FROM students WHERE user_id = ?', [userId]);
  if (rows.length === 0) return false;
  return parseFloat(rows[0].balance) >= parseFloat(cost);
};

module.exports = { checkEmergencyContacts, checkBalance };
