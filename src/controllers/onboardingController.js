const db = require('../config/db');
const { generateUniqueId } = require('../utils/idUtils');
const { generateIntakePDF } = require('../utils/pdfUtils');
const { uploadToS3, getPresignedUrl } = require('../utils/s3Utils');
const notificationService = require('../services/notificationService');
const fs = require('fs');
const bcrypt = require('bcryptjs');

exports.completeOnboarding = async (req, res) => {
  const userId = req.user.userId;
  const voiceFile = req.file;

  if (!voiceFile) {
    return res.status(400).json({ message: 'Voice recording is required' });
  }

  let bioData, questionnaireData, parentInfo;
  try {
    bioData = JSON.parse(req.body.bio || '{}');
    questionnaireData = JSON.parse(req.body.questionnaire || '{}');
    parentInfo = JSON.parse(req.body.parent || '{}');
  } catch {
    return res.status(400).json({ message: 'Invalid form data. Please try again.' });
  }

  const { signature_data, org_id: orgIdFromClient, invite_token } = req.body;

  const {
    first_name, last_name, phone, dob, date_of_birth: date_of_birth_raw, grade_level,
    chinese_name, passport_number, wechat_id, intended_program,
  } = bioData;
  const date_of_birth = dob || date_of_birth_raw || null;

  if (!first_name || !last_name) {
    return res.status(400).json({ message: 'Student name is required.' });
  }

  try {
    // 1. Upload voice to S3 first — if this fails, nothing is written to DB
    const voiceS3Key = await uploadToS3(voiceFile);

    // 2. Resolve org_id — prefer invite_token lookup, fall back to client-supplied value
    let org_id = null;
    if (invite_token) {
      const [tokenRows] = await db.execute(
        'SELECT org_id FROM invitation_tokens WHERE token = ? AND org_id IS NOT NULL LIMIT 1',
        [invite_token]
      );
      org_id = tokenRows?.[0]?.org_id || null;
    }
    if (!org_id) org_id = orgIdFromClient || null;

    if (!org_id) {
      return res.status(400).json({ message: 'Organization could not be determined. Please use the original invitation link.' });
    }

    // 3. Generate external IDs before any inserts
    const externalStudentId = generateUniqueId('STU');
    const externalParentId = generateUniqueId('PAR');

    // 4. Update users row (name, phone)
    await db.execute(
      'UPDATE users SET first_name = ?, last_name = ?, phone = ? WHERE user_id = ?',
      [first_name, last_name, phone || null, userId]
    );

    // 5. Upsert students row with bio + external ID
    await db.execute(
      `INSERT INTO students
         (user_id, org_id, date_of_birth, grade_level, chinese_name,
          passport_number, wechat_id, intended_program, external_student_id)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE
         date_of_birth      = VALUES(date_of_birth),
         grade_level        = VALUES(grade_level),
         chinese_name       = VALUES(chinese_name),
         passport_number    = VALUES(passport_number),
         wechat_id          = VALUES(wechat_id),
         intended_program   = VALUES(intended_program),
         external_student_id = VALUES(external_student_id)`,
      [
        userId, org_id,
        date_of_birth || null, grade_level || null,
        chinese_name || null, passport_number || null,
        wechat_id || null, intended_program || null,
        externalStudentId,
      ]
    );

    const [studentRows] = await db.execute(
      'SELECT s.*, u.first_name, u.last_name FROM students s JOIN users u ON s.user_id = u.user_id WHERE s.user_id = ?',
      [userId]
    );
    const student = studentRows[0];

    // 6. Insert questionnaire into cold_data
    await db.execute(
      'INSERT INTO cold_data (student_id, form_version, response_json) VALUES (?, ?, ?)',
      [student.student_id, '1.0', JSON.stringify(questionnaireData)]
    );

    // 7. Generate + upload intake PDF
    const { filepath, filename } = await generateIntakePDF(student, questionnaireData, signature_data);
    const pdfBuffer = fs.readFileSync(filepath);
    const pdfS3Key = await uploadToS3({ originalname: filename, buffer: pdfBuffer, mimetype: 'application/pdf' });
    fs.unlinkSync(filepath);

    // 8. Create parent user + parents row (with external ID)
    const {
      parent_first_name, parent_last_name, parent_email, parent_phone,
      parent_wechat, relationship, parent_occupation, address, parent_password,
    } = parentInfo;

    if (!parent_email) {
      return res.status(400).json({ message: 'Parent email is required.' });
    }

    const [existingParent] = await db.execute('SELECT user_id FROM users WHERE email = ?', [parent_email]);
    let parentUserId;

    if (existingParent.length > 0) {
      parentUserId = existingParent[0].user_id;
    } else {
      const parentHash = await bcrypt.hash(parent_password || Math.random().toString(36), 10);
      const [parentUserResult] = await db.execute(
        'INSERT INTO users (role_id, email, password_hash, first_name, last_name, phone, status) VALUES (?, ?, ?, ?, ?, ?, ?)',
        [6, parent_email, parentHash, parent_first_name || '', parent_last_name || '', parent_phone || null, 'active']
      );
      parentUserId = parentUserResult.insertId;
    }

    const [parentEntry] = await db.execute(
      'INSERT INTO parents (user_id, org_id, relationship, wechat_id, occupation, address, external_parent_id) VALUES (?, ?, ?, ?, ?, ?, ?)',
      [parentUserId, org_id, relationship || null, parent_wechat || null, parent_occupation || null, address || null, externalParentId]
    );

    await db.execute('UPDATE students SET parent_id = ? WHERE student_id = ?', [parentEntry.insertId, student.student_id]);

    // 9. Activate student user + save intake record
    await db.execute('UPDATE users SET status = ? WHERE user_id = ?', ['active', userId]);

    await db.execute(
      'INSERT INTO intake_records (student_id, voice_s3_key, pdf_s3_key, signature_data) VALUES (?, ?, ?, ?)',
      [student.student_id, voiceS3Key, pdfS3Key, signature_data || null]
    );

    // 10. Mark invitation as used now that onboarding is fully complete
    if (invite_token) {
      await db.execute(
        'UPDATE invitation_tokens SET is_used = TRUE WHERE token = ?',
        [invite_token]
      );
    }

    // 11. Notify sales
    await notificationService.notifyEvent('STUDENT_REGISTRATION_COMPLETE', {
      studentName: `${first_name} ${last_name}`,
      studentId: student.student_id,
    });

    res.status(200).json({
      message: 'Onboarding completed successfully',
      studentId: externalStudentId,
      parentId: externalParentId,
      pdfUrl: getPresignedUrl(pdfS3Key, 900),
    });
  } catch (error) {
    console.error('Onboarding completion error:', error);
    res.status(500).json({ message: 'Internal server error during registration. Please try again.' });
  }
};
