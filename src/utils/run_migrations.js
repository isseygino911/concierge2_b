const pool = require('../config/db');

async function runMigrations() {
  const migrations = [
    {
      name: 'Add external_student_id to students',
      sql: 'ALTER TABLE students ADD COLUMN IF NOT EXISTS external_student_id VARCHAR(255) UNIQUE AFTER student_id;'
    },
    {
      name: 'Add external_parent_id to parents',
      sql: 'ALTER TABLE parents ADD COLUMN IF NOT EXISTS external_parent_id VARCHAR(255) UNIQUE AFTER parent_id;'
    },
    {
      name: 'Create ticket_categories table',
      sql: `CREATE TABLE IF NOT EXISTS ticket_categories (
        category_id INT AUTO_INCREMENT PRIMARY KEY,
        category_name VARCHAR(100) NOT NULL UNIQUE,
        cost DECIMAL(10, 2) DEFAULT 0.00,
        description TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      ) ENGINE=InnoDB;`
    },
    {
      name: 'Create ticket_comments table',
      sql: `CREATE TABLE IF NOT EXISTS ticket_comments (
        comment_id INT AUTO_INCREMENT PRIMARY KEY,
        ticket_id INT NOT NULL,
        user_id INT NOT NULL,
        user_role ENUM('student', 'admin', 'vendor', 'super_admin') NOT NULL,
        comment TEXT NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (ticket_id) REFERENCES tickets(ticket_id) ON DELETE CASCADE
      ) ENGINE=InnoDB;`
    },
    {
      name: 'Add assigned_vendor_id to tickets',
      sql: 'ALTER TABLE tickets ADD COLUMN IF NOT EXISTS assigned_vendor_id INT AFTER assigned_admin_id;'
    }
  ];

  try {
    for (const migration of migrations) {
      console.log(`Executing: ${migration.name}...`);
      try {
        await pool.execute(migration.sql);
        console.log(`Successfully executed: ${migration.name}`);
      } catch (err) {
        if (err.code === 'ER_DUP_FIELD_ERROR') {
          console.log(`Column already exists, skipping: ${migration.name}`);
        } else {
          throw err;
        }
      }
    }
    
    console.log('\n--- Verifying Table Structures ---');
    
    const tables = ['students', 'parents', 'ticket_categories', 'tickets', 'ticket_comments'];
    for (const table of tables) {
      try {
        const [rows] = await pool.execute(`DESCRIBE ${table}`);
        console.log(`\nTable: ${table}`);
        console.table(rows);
      } catch (e) {
        console.log(`\nTable ${table} not found or error: ${e.message}`);
      }
    }

  } catch (error) {
    console.error('Migration failed:', error);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

runMigrations();
