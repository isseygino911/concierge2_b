const pool = require('../config/db');
const { checkEmergencyContacts, checkBalance } = require('../utils/ticketGates');

/**
 * Middleware to enforce hard gates before ticket creation.
 */
const verifyStudentGates = async (req, res, next) => {
  const studentId = req.user ? req.user.userId : req.body.student_id;
  
  if (!studentId) {
    return res.status(400).json({ error: 'Student ID is required for gate verification.' });
  }

  try {
    // Gate 1: Emergency Contacts
    const hasEnoughContacts = await checkEmergencyContacts(studentId);
    if (!hasEnoughContacts) {
      return res.status(403).json({ 
        error: 'Hard Gate Violation: Student must have at least 3 emergency contacts on file before creating a ticket.' 
      });
    }

    // Gate 2: Balance Check
    // If it's a standard ticket, we check balance. Emergency quick-actions might bypass this or have 0 cost.
    const { category } = req.body;
    if (category && req.path !== '/emergency') {
      // In a real system, we would fetch cost by category. 
      // For this implementation, we'll assume a mock cost lookup.
      const categoryCosts = {
        'technical': 10,
        'billing': 0,
        'academic': 20,
        'general': 5
      };
      const cost = categoryCosts[category] || 0;
      const hasBalance = await checkBalance(studentId, cost);
      
      if (!hasBalance) {
        return res.status(403).json({ 
          error: `Hard Gate Violation: Insufficient balance for category '${category}'.` 
        });
      }
    }

    next();
  } catch (error) {
    console.error('Gate verification error:', error);
    res.status(500).json({ error: 'Internal server error during gate verification.' });
  }
};

module.exports = { verifyStudentGates };
