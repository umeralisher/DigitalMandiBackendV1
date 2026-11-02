const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const userSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true, maxlength: 80 },
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    phone: { type: String, required: true, trim: true },
    password: { type: String, required: true, minlength: 6, select: false },
    role: { type: String, enum: ['farmer', 'buyer', 'admin'], default: 'buyer' },
    // pending = waiting for admin approval, blocked = cannot log in
    status: { type: String, enum: ['pending', 'approved', 'blocked'], default: 'approved' },
    address: { type: String, trim: true, default: '' },
    city: { type: String, trim: true, default: '' },
    coords: { lat: Number, lng: Number },
    farm: {
      name: { type: String, trim: true, default: '' },
      size: { type: String, trim: true, default: '' }, // e.g. "12 acres"
      crops: [{ type: String, trim: true }],
      description: { type: String, trim: true, default: '' },
    },
    ratingAvg: { type: Number, default: 0 },
    ratingCount: { type: Number, default: 0 },
  },
  { timestamps: true }
);

userSchema.pre('save', async function () {
  if (!this.isModified('password')) return;
  this.password = await bcrypt.hash(this.password, 10);
});

userSchema.methods.matchPassword = function (plain) {
  return bcrypt.compare(plain, this.password);
};

userSchema.set('toJSON', {
  transform: (doc, ret) => {
    delete ret.password;
    delete ret.__v;
    return ret;
  },
});

module.exports = mongoose.model('User', userSchema);
