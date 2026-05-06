const pool = require('../config/db');

const migrate = async () => {
  try {
    console.log('Starting migration...');
    await pool.query('ALTER TABLE students ADD COLUMN external_student_id VARCHAR(255)');
    await pool.query('ALTER TABLE parents ADD COLUMN external_parent_id VARCHAR(255)');
    console.log('Migration completed successfully.');
  } catch (err) {
    if (err.code === 'ER_DUP_FIELD_ERROR') {
      console.log('Columns already exist, skipping migration.');
    } else {
      console.error('Migration failed:', err);
      process.exit(1);
    }
  }
};

migrate();
