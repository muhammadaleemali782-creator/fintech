const mongoose = require('mongoose');

const agentCommissionRequestSchema = new mongoose.Schema({
  agent_id: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  commission_type: { type: String, enum: ['loan', 'investment'], default: 'loan', index: true },
  requested_by: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  current_percent: { type: Number, required: true },
  requested_percent: { type: Number, required: true },
  reason: { type: String, required: true, trim: true },
  status: { type: String, enum: ['pending', 'approved', 'rejected'], default: 'pending', index: true },
  reviewed_by: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  reviewed_at: { type: Date, default: null },
  review_remarks: { type: String, default: '' },
  created_at: { type: Date, default: Date.now }
}, {
  collection: 'agent_commission_requests'
});

module.exports = mongoose.model('AgentCommissionRequest', agentCommissionRequestSchema);
