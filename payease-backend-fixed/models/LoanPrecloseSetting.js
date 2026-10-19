const mongoose = require('mongoose');
const {
  DEFAULT_MANDATORY_INSTALLMENTS,
  DEFAULT_INSTALLMENT_BLOCK_SIZE,
  DEFAULT_DISCOUNT_PERCENT_PER_BLOCK,
  DEFAULT_MAXIMUM_DISCOUNT_PERCENT,
  DEFAULT_AGENT_SHARE_PERCENT,
  DEFAULT_LOAN_DEPARTMENT_SHARE_PERCENT
} = require('../constants/loanSettingsDefaults');

const loanPrecloseSettingSchema = new mongoose.Schema({
  loan_type_id: { type: String, default: null, index: true }, // null = default for all loan types
  mandatory_installments_before_preclose: { type: Number, default: DEFAULT_MANDATORY_INSTALLMENTS, min: 0 },
  installment_block_size: { type: Number, default: DEFAULT_INSTALLMENT_BLOCK_SIZE, min: 1 },
  discount_percent_per_block: { type: Number, default: DEFAULT_DISCOUNT_PERCENT_PER_BLOCK, min: 0 },
  maximum_discount_percent: { type: Number, default: DEFAULT_MAXIMUM_DISCOUNT_PERCENT, min: 0 },
  agent_share_percent: { type: Number, default: DEFAULT_AGENT_SHARE_PERCENT, min: 0, max: 100 },
  loan_department_share_percent: { type: Number, default: DEFAULT_LOAN_DEPARTMENT_SHARE_PERCENT, min: 0, max: 100 },
  created_at: { type: Date, default: Date.now },
  updated_at: { type: Date, default: Date.now }
}, {
  collection: 'loan_preclose_settings'
});

loanPrecloseSettingSchema.pre('save', function (next) {
  this.updated_at = new Date();
  next();
});

module.exports = mongoose.model('LoanPrecloseSetting', loanPrecloseSettingSchema);
