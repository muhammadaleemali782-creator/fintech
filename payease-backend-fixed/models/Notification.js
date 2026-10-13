const mongoose = require('mongoose');

const notificationSchema = new mongoose.Schema({
  type: {
    type: String,
    enum: [
      'new_user', 'loan_query', 'loan_apply', 'general',
      'kyc_submitted', 'device_alert', 'device_online', 'device_security',
      'sub_agent_nomination', 'daily_yield', 'loan_approved', 'loan_completed',
      'bond_approved', 'bond_payout', 'agent_broadcast'
    ],
    default: 'general'
  },
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  targetRole: { type: String, enum: ['admin', 'user', 'all'], default: 'admin' },
  title: { type: String, required: true },
  message: { type: String, required: true },
  data: { type: Object, default: {} },
  read: { type: Boolean, default: false },
  createdAt: { type: Date, default: Date.now }
});

notificationSchema.index({ targetRole: 1, read: 1, createdAt: -1 });
notificationSchema.index({ userId: 1, createdAt: -1 });

module.exports = mongoose.model('Notification', notificationSchema);
