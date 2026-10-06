const mongoose = require('mongoose');

/**
 * WhatsAppStudent — standalone enquiry submissions captured from the public
 * WhatsApp student form.
 *
 * Deliberately unrelated to referrals: no employee/referee attribution, no
 * referral code, no link to the referral workflow or the WhatsApp Business
 * integration. createdAt comes from `timestamps`.
 */
const whatsappStudentSchema = new mongoose.Schema(
  {
    studentName: { type: String, required: true, trim: true, maxlength: 200 },
    mobile: { type: String, required: true, trim: true },
    email: { type: String, required: true, trim: true, lowercase: true },
    preferredCountry: { type: String, required: true, trim: true },
    preferredIntake: { type: String, required: true, trim: true },
  },
  { timestamps: true }
);

whatsappStudentSchema.index({ createdAt: -1 });

module.exports = mongoose.model('WhatsAppStudent', whatsappStudentSchema);