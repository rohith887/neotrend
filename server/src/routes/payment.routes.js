const router = require('express').Router();
const { protect } = require('../middleware/auth');
const {
  listPayments,
  getSummary,
  getPayment,
  createPayment,
  updatePayment,
  deletePayment,
} = require('../controllers/payment.controller');

router.use(protect);

router.get('/summary',   getSummary);
router.get('/',          listPayments);
router.get('/:id',       getPayment);
router.post('/',         createPayment);
router.patch('/:id',     updatePayment);
router.delete('/:id',    deletePayment);

module.exports = router;
