const PDFDocument = require('pdfkit');
const fs = require('fs');
const path = require('path');

// NotoSansSC supports full CJK + Latin — bundled in backend/src/assets/fonts/
const FONT_PATH = path.join(__dirname, '../assets/fonts/NotoSansSC-Regular.otf');

const QUESTION_SECTIONS = [
  {
    section: '第一部分：基本信息 (Basic Information)',
    questions: [
      { key: 'relationship',   label: '与学生的关系 (Relationship)' },
      { key: 'study_stage',    label: '留学阶段 (Study Stage)' },
      { key: 'target_country', label: '目标国家/地区 (Target Country)' },
      { key: 'expected_time',  label: '预计出国时间 (Expected Time)' },
    ],
  },
  {
    section: '第二部分：海外日常生活需求 (Overseas Daily Life Needs)',
    questions: [
      { key: 'accommodation_preference', label: '住宿偏好 (Accommodation Preference)' },
      { key: 'life_support_needs',       label: '生活支持需求 (Life Support Needs)' },
      { key: 'daily_challenges',         label: '日常生活挑战 (Daily Challenges)' },
      { key: 'driving_ability',          label: '驾驶能力 (Driving Ability)' },
      { key: 'communication_method',     label: '沟通方式 (Communication Method)' },
    ],
  },
  {
    section: '第三部分：风险保障与安全担忧 (Risk Protection & Safety Concerns)',
    questions: [
      { key: 'safety_concerns',      label: '安全担忧 (Safety Concerns)' },
      { key: 'insurance_priorities', label: '保险优先考虑 (Insurance Priorities)' },
      { key: 'additional_coverage',  label: '额外保障 (Additional Coverage)' },
      { key: 'safety_resources',     label: '安全资源 (Safety Resources)' },
      { key: 'budget_planning',      label: '预算规划 (Budget Planning)' },
      { key: 'support_needs',        label: '支持需求 (Support Needs)' },
      { key: 'english_level',        label: '英语水平 (English Level)' },
      { key: 'help_seeking',         label: '求助能力 (Help Seeking)' },
      { key: 'adventurous',          label: '冒险精神 (Adventurous)' },
      { key: 'stress_response',      label: '压力应对 (Stress Response)' },
    ],
  },
  {
    section: '第四部分：信息获取与支付偏好 (Information Access & Payment Preferences)',
    questions: [
      { key: 'information_channels', label: '信息获取渠道 (Information Channels)' },
      { key: 'payment_willingness',  label: '付费意愿 (Payment Willingness)' },
      { key: 'additional_comments',  label: '其他建议 (Additional Comments)' },
    ],
  },
];

const MARGIN   = 50;
const GOLD     = '#B8860B';
const BLACK    = '#1a1a1a';
const MUTED    = '#777777';
const BORDER   = '#cccccc';
const COL_Q_W  = 200; // question column width
const ROW_PAD  = 7;

const generateIntakePDF = async (studentData, questionnaireData, signatureData) => {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ margin: MARGIN, size: 'A4' });
    const filename = `intake_${studentData.student_id}_${Date.now()}.pdf`;
    const filepath = path.join('/tmp', filename);
    const stream = fs.createWriteStream(filepath);
    doc.pipe(stream);

    const font = FONT_PATH;
    const pageW   = doc.page.width;
    const contentW = pageW - MARGIN * 2;   // usable width
    const COL_A_W  = contentW - COL_Q_W;  // answer column fills remaining width

    const today = new Date().toLocaleDateString('en-US', {
      month: 'numeric', day: 'numeric', year: 'numeric',
    });

    // ── helpers ────────────────────────────────────────────────
    const rule = () => {
      doc.moveTo(MARGIN, doc.y)
         .lineTo(MARGIN + contentW, doc.y)
         .strokeColor(BORDER).lineWidth(0.5).stroke();
    };

    // Draw a two-column table row; returns the row height used
    const drawRow = (num, label, answer) => {
      const hasAnswer = answer && String(answer).trim();
      const displayAnswer = hasAnswer ? String(answer).trim() : 'No response provided';
      const qText = `${num}.  ${label}`;

      // Measure heights using the loaded font
      const qH = doc.font(font).fontSize(9).heightOfString(qText,   { width: COL_Q_W  - ROW_PAD * 2 });
      const aH = doc.font(font).fontSize(9).heightOfString(displayAnswer, { width: COL_A_W - ROW_PAD * 2 });
      const rowH = Math.max(qH, aH) + ROW_PAD * 2;

      const rowTop = doc.y;

      // Borders
      doc.rect(MARGIN,           rowTop, COL_Q_W,  rowH).strokeColor(BORDER).lineWidth(0.4).stroke();
      doc.rect(MARGIN + COL_Q_W, rowTop, COL_A_W,  rowH).strokeColor(BORDER).lineWidth(0.4).stroke();

      // Question text (bold-ish via slightly larger size)
      doc.font(font).fontSize(9).fillColor(BLACK)
         .text(qText,
               MARGIN + ROW_PAD,
               rowTop + ROW_PAD,
               { width: COL_Q_W - ROW_PAD * 2, lineBreak: true });

      // Answer text
      doc.font(font).fontSize(9).fillColor(hasAnswer ? BLACK : MUTED)
         .text(displayAnswer,
               MARGIN + COL_Q_W + ROW_PAD,
               rowTop + ROW_PAD,
               { width: COL_A_W - ROW_PAD * 2, lineBreak: true });

      doc.y = rowTop + rowH;
    };

    // ── Title ──────────────────────────────────────────────────
    doc.font(font).fontSize(18).fillColor(BLACK)
       .text('出国留学家庭需求与保障调查问卷', MARGIN, doc.y, { align: 'center', width: contentW });
    doc.moveDown(0.3);
    doc.font(font).fontSize(11).fillColor(MUTED)
       .text('Overseas Study Family Needs and Protection Survey', MARGIN, doc.y, { align: 'center', width: contentW });
    doc.moveDown(0.4);
    doc.font(font).fontSize(9).fillColor(MUTED)
       .text(`Date: ${today}`, MARGIN, doc.y, { align: 'center', width: contentW });
    doc.font(font).fontSize(9).fillColor(MUTED)
       .text(`Name: ${studentData.first_name} ${studentData.last_name}`, MARGIN, doc.y, { align: 'center', width: contentW });
    doc.moveDown(0.7);
    rule();
    doc.moveDown(0.6);

    // ── Student summary ────────────────────────────────────────
    const dob = studentData.date_of_birth
      ? new Date(studentData.date_of_birth).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })
      : '—';
    doc.font(font).fontSize(10).fillColor(BLACK)
       .text(`Student Name: ${studentData.first_name} ${studentData.last_name}`, MARGIN, doc.y)
       .text(`Date of Birth: ${dob}`)
       .text(`Grade Level: ${studentData.grade_level || '—'}`)
       .text(`Passport Number: ${studentData.passport_number || '—'}`)
       .text(`Intended Program: ${studentData.intended_program || '—'}`);
    doc.moveDown(0.7);
    rule();
    doc.moveDown(0.7);

    // ── Questionnaire ──────────────────────────────────────────
    let idx = 0;
    QUESTION_SECTIONS.forEach((section) => {
      if (doc.y > doc.page.height - 150) doc.addPage();

      // Section heading
      doc.font(font).fontSize(11).fillColor(GOLD)
         .text(section.section, MARGIN, doc.y, { width: contentW });
      doc.moveDown(0.4);

      section.questions.forEach((q) => {
        idx++;
        if (doc.y > doc.page.height - 80) doc.addPage();
        drawRow(idx, q.label, questionnaireData[q.key]);
      });

      doc.moveDown(0.8);
    });

    // ── Declaration & Signature ────────────────────────────────
    if (doc.y > doc.page.height - 240) doc.addPage();

    rule();
    doc.moveDown(0.7);

    doc.font(font).fontSize(13).fillColor(GOLD)
       .text('Declaration & Signature', MARGIN, doc.y, { width: contentW });
    doc.moveDown(0.5);

    doc.font(font).fontSize(9).fillColor(BLACK)
       .text(
         'I declare that the information provided in this form is accurate and complete to the best of my knowledge.',
         MARGIN, doc.y, { width: contentW, italics: false }
       );
    doc.moveDown(0.8);

    doc.font(font).fontSize(10).fillColor(BLACK).text('Signature:', MARGIN, doc.y);
    doc.moveDown(0.3);

    const sigTop = doc.y;
    const sigW = 200;
    const sigH = 65;

    if (signatureData) {
      try {
        const base64 = signatureData.replace(/^data:image\/\w+;base64,/, '');
        const imgBuffer = Buffer.from(base64, 'base64');
        // Draw a light border behind the signature area, then overlay the image
        doc.rect(MARGIN, sigTop, sigW, sigH).strokeColor(BORDER).lineWidth(0.4).stroke();
        doc.image(imgBuffer, MARGIN, sigTop, { fit: [sigW, sigH] });
      } catch {
        doc.rect(MARGIN, sigTop, sigW, sigH).strokeColor(BORDER).lineWidth(0.4).stroke();
      }
    } else {
      doc.rect(MARGIN, sigTop, sigW, sigH).strokeColor(BORDER).lineWidth(0.4).stroke();
    }

    // Manually advance cursor past the signature box
    doc.y = sigTop + sigH + 10;
    doc.font(font).fontSize(10).fillColor(BLACK)
       .text(`Date: ${today}`, MARGIN, doc.y)
       .text(`Name: ${studentData.first_name} ${studentData.last_name}`);
    doc.moveDown(1.5);

    doc.font(font).fontSize(8).fillColor(MUTED)
       .text('VS Concierge Service', MARGIN, doc.y, { align: 'center', width: contentW })
       .text(`Generated on ${today}`, MARGIN, doc.y, { align: 'center', width: contentW });

    doc.end();
    stream.on('finish', () => resolve({ filename, filepath }));
    stream.on('error', reject);
  });
};

module.exports = { generateIntakePDF };
