const mongoose = require('mongoose');

const deviceSchema = new mongoose.Schema({
  deviceId: { type: String, required: true, unique: true },
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  userEmail: { type: String },
  userName: { type: String },
  parentId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  deviceName: { type: String, default: "Android Device" },
  pairingCode: { type: String },
  pairingCodeExpires: { type: Date },
  isPaired: { type: Boolean, default: false },
  deviceToken: { type: String },
  adminStatus: { type: String, enum: ['active', 'inactive', 'pending'], default: 'pending' },
  screenPinned: { type: Boolean, default: false },
  lastSeenAt: { type: Date, default: Date.now },
  pinHash: { type: String },
  pinSalt: { type: String },
  failedAttempts: { type: Number, default: 0 },
  lockedUntil: { type: Date },
  createdAt: { type: Date, default: Date.now },
});

module.exports = mongoose.model('Device', deviceSchema);
