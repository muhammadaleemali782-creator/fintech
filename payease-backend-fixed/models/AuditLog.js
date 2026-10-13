const mongoose = require('mongoose');

const auditLogSchema = new mongoose.Schema({
  actorId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  actorName: { type: String, required: true },
  actorRole: { type: String, enum: ['admin', 'staff', 'system'], required: true },
  department: {
    type: String,
    enum: ['loan', 'kyc', 'deposit', 'withdrawal', 'lending', 'bond', 'staff', 'system', 'general'],
    required: true
  },
  action: { type: String, required: true },
  entityType: {
    type: String,
    enum: ['transaction', 'loan', 'bond', 'user', 'staff', 'system'],
    required: true
  },
  entityId: { type: String, default: null },
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  amount: { type: Number, default: null },
  fromStatus: { type: String, default: null },
  toStatus: { type: String, default: null },
  note: { type: String, default: '' },
  ip: { type: String, default: '' },
  userAgent: { type: String, default: '' },
  metadata: { type: Object, default: {} },
  createdAt: { type: Date, default: Date.now, immutable: true }
}, {
  versionKey: false
});

// Enforce append-only invariant: disallow updates or deletions
const disallowMutation = function () {
  throw new Error('AuditLog entries are immutable and cannot be updated or deleted');
};

auditLogSchema.pre('updateOne', disallowMutation);
auditLogSchema.pre('updateMany', disallowMutation);
auditLogSchema.pre('findOneAndUpdate', disallowMutation);
auditLogSchema.pre('deleteOne', disallowMutation);
auditLogSchema.pre('deleteMany', disallowMutation);
auditLogSchema.pre('findOneAndDelete', disallowMutation);

// High performance compound indexes for audit filtering & CSV exports
auditLogSchema.index({ createdAt: -1 });
auditLogSchema.index({ department: 1, createdAt: -1 });
auditLogSchema.index({ actorId: 1, createdAt: -1 });
auditLogSchema.index({ entityType: 1, entityId: 1 });
auditLogSchema.index({ userId: 1, createdAt: -1 });
auditLogSchema.index({ action: 1, createdAt: -1 });

module.exports = mongoose.model('AuditLog', auditLogSchema);
