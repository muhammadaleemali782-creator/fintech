const mongoose = require('mongoose');
const {
  DEFAULT_LOAN_DEPARTMENT_COMMISSION_PERCENT,
  DEFAULT_AGENT_COMMISSION_PERCENT
} = require('../constants/loanSettingsDefaults');

const agentLoanCommissionSettingSchema = new mongoose.Schema({
  agent_id: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, unique: true },
  loan_department_user_id: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  agent_commission_percent: {
    type: Number,
    default: DEFAULT_AGENT_COMMISSION_PERCENT,
    min: 0,
    max: DEFAULT_LOAN_DEPARTMENT_COMMISSION_PERCENT
  },
  loan_department_commission_percent: {
    type: Number,
    default: DEFAULT_LOAN_DEPARTMENT_COMMISSION_PERCENT,
    min: 0
  },
  created_at: { type: Date, default: Date.now },
  updated_at: { type: Date, default: Date.now }
}, {
  collection: 'agent_loan_commission_settings'
});

agentLoanCommissionSettingSchema.pre('save', function (next) {
  this.updated_at = new Date();
  next();
});

module.exports = mongoose.model('AgentLoanCommissionSetting', agentLoanCommissionSettingSchema);
