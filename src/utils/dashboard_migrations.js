const pool = require('../config/db');

async function runDashboardMigrations() {
  const migrations = [
    {
      name: 'Create deposits table',
      sql: `CREATE TABLE IF NOT EXISTS deposits (
        deposit_id INT AUTO_INCREMENT PRIMARY KEY,
        student_id INT NOT NULL,
        amount DECIMAL(10,2) NOT NULL,
        proof_url VARCHAR(512),
        status ENUM('pending', 'approved', 'rejected') DEFAULT 'pending',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        CONSTRAINT fk_deposit_student FOREIGN KEY (student_id) REFERENCES students(student_id) ON DELETE CASCADE
      ) ENGINE=InnoDB;`
    },
    {
      name: 'Add balance to students',
      sql: 'ALTER TABLE students ADD COLUMN IF NOT EXISTS balance DECIMAL(10,2) DEFAULT 0.00 AFTER enrollment_date;'
    }
  ];

  try {
    for (const migration of migrations) {
      console.log(`Executing: ${migration.name}...`);
      try {
        await pool.execute(migration.sql);
        console.log(`Successfully executed: ${migration.name}`);
      } catch (err) {
        if (err.code === 'ER_DUP_FIELD_ERROR' || err.code === 'ER_TABLE_EXISTS_ERROR') {
          console.log(`Already exists, skipping: ${migration.name}`);
        } else {
          throw err;
        }
      }
    }
    console.log('Dashboard migrations completed successfully.');
  } catch (error) {
    console.error('Dashboard migration failed:', error);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

runDashboardMigrations();
