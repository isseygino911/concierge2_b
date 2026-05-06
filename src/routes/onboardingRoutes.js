const express = require('express');
const router = express.Router();
const multer = require('multer');
const { authenticate } = require('../middleware/authMiddleware');
const onboardingController = require('../controllers/onboardingController');

const upload = multer({ storage: multer.memoryStorage() });

router.use(authenticate);

router.post('/complete', upload.single('voice'), onboardingController.completeOnboarding);

module.exports = router;
