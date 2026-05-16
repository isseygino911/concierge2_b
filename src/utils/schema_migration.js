const pool = require('../config/db');

const run = async () => {
  const conn = await pool.getConnection();
  try {
    console.log('Running schema migrations...');

    // --- organizations: add city, province, status ---
    const alterOrg = [
      "ALTER TABLE organizations ADD COLUMN city VARCHAR(100) AFTER address",
      "ALTER TABLE organizations ADD COLUMN province VARCHAR(100) AFTER city",
      "ALTER TABLE organizations ADD COLUMN status ENUM('active','inactive') DEFAULT 'active' AFTER province",
      "ALTER TABLE organizations ADD COLUMN sales_rep_id INT AFTER status",
    ];
    for (const sql of alterOrg) {
      try { await conn.query(sql); console.log('  OK:', sql.slice(0, 60)); }
      catch (e) { if (e.code !== 'ER_DUP_FIELDNAME') throw e; console.log('  SKIP (exists):', sql.slice(0, 60)); }
    }

    // --- tickets: rename subject -> title, add category_id, add balance column to students ---
    const alterTickets = [
      "ALTER TABLE tickets CHANGE subject title VARCHAR(255) NOT NULL",
      "ALTER TABLE tickets ADD COLUMN category_id INT AFTER title",
    ];
    for (const sql of alterTickets) {
      try { await conn.query(sql); console.log('  OK:', sql.slice(0, 60)); }
      catch (e) { if (e.code !== 'ER_DUP_FIELDNAME' && e.code !== 'ER_BAD_FIELD_ERROR') throw e; console.log('  SKIP:', sql.slice(0, 60)); }
    }

    // --- students: add balance ---
    try {
      await conn.query("ALTER TABLE students ADD COLUMN balance DECIMAL(12,2) DEFAULT 0.00 AFTER grade_level");
      console.log('  OK: balance column on students');
    } catch (e) { if (e.code !== 'ER_DUP_FIELDNAME') throw e; console.log('  SKIP: balance exists'); }

    // --- ticket_categories ---
    await conn.query(`
      CREATE TABLE IF NOT EXISTS ticket_categories (
        category_id INT AUTO_INCREMENT PRIMARY KEY,
        category_name VARCHAR(100) NOT NULL,
        cost DECIMAL(10,2) DEFAULT 0,
        description TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      ) ENGINE=InnoDB
    `);
    console.log('  OK: ticket_categories');

    // --- ticket_comments ---
    await conn.query(`
      CREATE TABLE IF NOT EXISTS ticket_comments (
        comment_id INT AUTO_INCREMENT PRIMARY KEY,
        ticket_id INT NOT NULL,
        user_id INT NOT NULL,
        user_role VARCHAR(50),
        comment TEXT NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT fk_tc_ticket FOREIGN KEY (ticket_id) REFERENCES tickets(ticket_id) ON DELETE CASCADE,
        CONSTRAINT fk_tc_user   FOREIGN KEY (user_id)   REFERENCES users(user_id)   ON DELETE CASCADE
      ) ENGINE=InnoDB
    `);
    console.log('  OK: ticket_comments');

    // --- students: balance column (may already exist from above) ---
    // already handled above

    console.log('All migrations complete.');
  } catch (err) {
    console.error('Migration error:', err.message);
    process.exit(1);
  } finally {
    conn.release();
    process.exit(0);
  }
};

run();
