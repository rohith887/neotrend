const { body } = require('express-validator');

const whatsappStudentSubmitRules = [
  body('studentName')
    .trim()
    .notEmpty().withMessage('Student name is required')
    .isLength({ min: 2, max: 200 }).withMessage('Student name must be between 2 and 200 characters'),
  body('mobile')
    .trim()
    .notEmpty().withMessage('Mobile number is required'),
  body('email')
    .trim()
    .notEmpty().withMessage('Email is required')
    .isEmail().withMessage('Please enter a valid email address')
    .normalizeEmail(),
  body('preferredCountry')
    .trim()
    .notEmpty().withMessage('Preferred country is required'),
  body('preferredIntake')
    .trim()
    .notEmpty().withMessage('Preferred intake is required'),
];

module.exports = { whatsappStudentSubmitRules };