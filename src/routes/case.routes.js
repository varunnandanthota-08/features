const express = require('express');
const {
  createCase,
  getActiveCases,
  acknowledgeCase,
  resolveCase,
  escalateCase
} = require('../controllers/case.controller');

const router = express.Router();

router.post('/', createCase);
router.get('/active', getActiveCases);
router.post('/:caseId/acknowledge', acknowledgeCase);
router.post('/:caseId/escalate', escalateCase);
router.post('/:caseId/resolve', resolveCase);

module.exports = router;
