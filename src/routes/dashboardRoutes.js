const express = require('express');
const router = express.Router();
const dashboardController = require('../controllers/dashboardController');
const { authenticate, authorize } = require('../middleware/authMiddleware');
const multer = require('multer');
const upload = multer({ storage: multer.memoryStorage() });

// --- Sales Routes ---
router.get('/sales/deposits', authenticate, authorize('sales'), dashboardController.getPendingDeposits);
router.patch('/sales/deposits/:id', authenticate, authorize('sales'), dashboardController.updateDepositStatus);
router.get('/sales/organizations', authenticate, authorize('sales', 'super_admin'), dashboardController.getOrganizations);
router.post('/sales/organizations', authenticate, authorize('sales', 'super_admin'), dashboardController.createOrganization);
router.patch('/sales/organizations/:id', authenticate, authorize('sales', 'super_admin'), dashboardController.updateOrganization);
router.get('/sales/students', authenticate, authorize('sales', 'super_admin'), dashboardController.getStudents);
router.patch('/sales/students/:id', authenticate, authorize('sales', 'super_admin'), dashboardController.updateStudentStatus);

// --- Organization Routes ---
router.get('/org/roster', authenticate, authorize('organization'), dashboardController.getOrgRoster);
router.get('/org/stats', authenticate, authorize('organization'), dashboardController.getOrgStats);

// --- Parent Routes ---
router.get('/parent/children', authenticate, authorize('parent'), dashboardController.getChildrenStats);
router.get('/parent/deposits', authenticate, authorize('parent'), dashboardController.getParentDeposits);
router.post('/parent/deposit', authenticate, authorize('parent'), upload.single('proof'), dashboardController.createDeposit);

// --- Student Routes ---
router.get('/student/balance', authenticate, authorize('student'), dashboardController.getStudentBalance);
router.get('/student/emergency-contacts', authenticate, authorize('student'), dashboardController.getEmergencyContacts);
router.post('/student/emergency-contacts', authenticate, authorize('student'), dashboardController.addEmergencyContact);
router.delete('/student/emergency-contacts/:id', authenticate, authorize('student'), dashboardController.deleteEmergencyContact);

module.exports = router;
