const express = require('express');
const { register, login, logout, getMe, changePassword } = require('../controllers/auth.controller');
const { authenticate } = require('../middleware/auth.middleware');

const router = express.Router();

router.post('/register', register);
router.post('/login', login);
router.post('/logout', logout);
router.get('/me', authenticate, getMe);
router.put('/password', authenticate, changePassword);
router.post('/change-password', authenticate, changePassword);

module.exports = router;
