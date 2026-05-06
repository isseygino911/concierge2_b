const pool = require('../config/db');

const createNotificationsTable = async () => {
  try {
    console.log('Creating notifications table...');
    await pool.query(`
      CREATE TABLE IF NOT EXISTS notifications (
        id INT AUTO_INCREMENT PRIMARY KEY,
        recipient_id INT NOT NULL,
        role VARCHAR(50),
        type VARCHAR(100),
        read BOOLEAN DEFAULT FALSE,
        payload JSON,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);
    console.log('Notifications table created successfully.');
  } catch (err) {
    console.error('Failed to create notifications table:', err);
    process.exit(1);
  }
};

createNotificationsTable();
