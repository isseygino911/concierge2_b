const express = require('express');
const router = express.Router();
const ticketController = require('../controllers/ticketController');
const { authenticate, authorize } = require('../middleware/authMiddleware');
const { verifyStudentGates } = require('../middleware/ticketGatesMiddleware');

// --- Student Ticket Routes ---

router.get(
  '/my-tickets', 
  authenticate, 
  authorize('student'), 
  ticketController.getMyTickets
);

router.post(
  '/create', 
  authenticate,
  authorize('student'), 
  verifyStudentGates, 
  ticketController.createTicket
);

// Route for emergency quick-action ticket
router.post(
  '/emergency', 
  authenticate,
  authorize('student'), 
  verifyStudentGates, 
  ticketController.createEmergencyTicket
);

// --- Collaboration Routes (Comment Thread) ---

router.post(
  '/comments', 
  authenticate,
  authorize('student', 'admin', 'vendor', 'super_admin'), 
  ticketController.addComment
);

router.get(
  '/comments/:ticket_id', 
  authenticate,
  authorize('student', 'admin', 'vendor', 'super_admin'), 
  ticketController.getComments
);

// --- Management Routes (Admin/Super Admin) ---

router.get(
  '/admin/queue', 
  authenticate, 
  authorize('admin', 'super_admin'), 
  ticketController.getAdminQueue
);

router.patch(
  '/status', 
  authenticate,
  authorize('admin', 'super_admin'), 
  ticketController.updateTicketStatus
);

router.patch(
  '/assign', 
  authenticate,
  authorize('admin', 'super_admin'), 
  ticketController.assignTicket
);

// --- Configuration Routes (Super Admin) ---

router.post(
  '/categories', 
  authenticate,
  authorize('super_admin'), 
  ticketController.createCategory
);

router.get(
  '/categories',
  authenticate,
  authorize('super_admin', 'admin', 'student'),
  ticketController.getAllCategories
);

router.put(
  '/categories/:id', 
  authenticate,
  authorize('super_admin'), 
  ticketController.updateCategory
);

router.delete(
  '/categories/:id', 
  authenticate,
  authorize('super_admin'), 
  ticketController.deleteCategory
);

module.exports = router;
