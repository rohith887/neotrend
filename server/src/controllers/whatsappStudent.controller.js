const asyncHandler = require('../utils/asyncHandler');
const { success } = require('../utils/ApiResponse');
const WhatsAppStudent = require('../models/WhatsAppStudent');

const submitWhatsAppStudent = asyncHandler(async (req, res) => {
  const { studentName, mobile, email, preferredCountry, preferredIntake } = req.body;

  const submission = await WhatsAppStudent.create({
    studentName: String(studentName).trim(),
    mobile: String(mobile).trim(),
    email: String(email).trim().toLowerCase(),
    preferredCountry: String(preferredCountry).trim(),
    preferredIntake: String(preferredIntake).trim(),
  });

  return success(res, submission, 'Student details submitted successfully', 201);
});

module.exports = { submitWhatsAppStudent };

