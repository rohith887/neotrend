const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const userSchema = new mongoose.Schema(
  {
    firstName: { type: String, required: true, trim: true },
    lastName: { type: String, trim: true },
    email: { type: String, required: true, trim: true, lowercase: true, unique: true, index: true },
    password: { type: String, minlength: 6, select: false },
    role: { type: mongoose.Schema.Types.ObjectId, ref: 'Role', required: true },
    mobile: { type: String, trim: true },
    avatar: { type: String, trim: true },
    status: { type: String, enum: ['active', 'inactive'], default: 'active' },
    availability: {
      type: String,
      enum: ['offline', 'available', 'break'],
      default: 'offline',
    },
    isOnCall: { type: Boolean, default: false },
    lastActiveAt: { type: Date },
    sipExtension: { type: Number, default: null },
    sipUsername: { type: String, trim: true, select: false },
    sipPassword:  { type: String, trim: true, select: false, default: '' },
    sipDomain: { type: String, trim: true, default: '' },
    sipWssUrl: { type: String, trim: true, default: '' },
    sipProvisionStatus: {
      type: String,
      enum: ['unknown', 'provisioned', 'failed', 'disabled'],
      default: 'unknown',
    },
    sipProvisionedAt: { type: Date, default: null },
  },
  { timestamps: true, toJSON: { virtuals: true }, toObject: { virtuals: true } }
);

userSchema.index(
  { sipExtension: 1 },
  { unique: true, partialFilterExpression: { sipExtension: { $type: 'number' } } }
);

userSchema.virtual('fullName').get(function () {
  return [this.firstName, this.lastName].filter(Boolean).join(' ');
});

userSchema.pre('save', async function (next) {
  if (!this.isModified('password') || !this.password) return next();
  this.password = await bcrypt.hash(this.password, 10);
  return next();
});

userSchema.methods.comparePassword = function (candidate) {
  if (!this.password || typeof candidate !== 'string') return Promise.resolve(false);
  return bcrypt.compare(candidate, this.password);
};

userSchema.methods.toSafeJSON = function () {
  const obj = this.toJSON();
  delete obj.password;
  delete obj.sipUsername;
  delete obj.sipPassword;
  return obj;
};

module.exports = mongoose.model('User', userSchema);
