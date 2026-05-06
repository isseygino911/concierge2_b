const PDFDocument = require('pdfkit');
const fs = require('fs');
const path = require('path');

const generateIntakePDF = async (studentData, questionnaireData) => {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument();
    const filename = `intake_${studentData.user_id}_${Date.now()}.pdf`;
    const filepath = path.join('/tmp', filename);
    const stream = fs.createWriteStream(filepath);

    doc.pipe(stream);

    doc.fontSize(20).text('Student Intake Form', { align: 'center' });
    doc.moveDown();
    doc.fontSize(12).text(`Student Name: ${studentData.first_name} ${studentData.last_name}`);
    doc.text(`Date of Birth: ${studentData.date_of_birth}`);
    doc.text(`Grade Level: ${studentData.grade_level}`);
    doc.moveDown();

    doc.fontSize(16).text('Questionnaire Responses:');
    doc.moveDown(0.5);

    Object.entries(questionnaireData).forEach(([question, answer]) => {
      doc.fontSize(12).text(`${question}:`, { underline: true });
      doc.text(`${answer}`);
      doc.moveDown(0.5);
    });

    doc.end();

    stream.on('finish', () => resolve({ filename, filepath }));
    stream.on('error', reject);
  });
};

module.exports = { generateIntakePDF };
