const mongoose = require('mongoose');

const loanPrecloseConditionSchema = new mongoose.Schema({
  condition_name: { type: String, required: true },
  condition_field: {
    type: String,
    required: true,
    enum: ['remaining_installments', 'loan_amount', 'paid_installments', 'total_installments']
  },
  operator: {
    type: String,
    required: true,
    enum: ['>', '>=', '=', '==', '<', '<=']
  },
  condition_value: { type: Number, required: true },
  action_field: {
    type: String,
    required: true,
    enum: ['discount_percent_per_block', 'agent_share_percent', 'loan_department_share_percent', 'maximum_discount_percent', 'installment_block_size']
  },
  action_value: { type: Number, required: true },
  is_active: { type: Boolean, default: true },
  priority: { type: Number, default: 1 },
  created_at: { type: Date, default: Date.now },
  updated_at: { type: Date, default: Date.now }
}, {
  collection: 'loan_preclose_conditions'
});

loanPrecloseConditionSchema.pre('save', function (next) {
  this.updated_at = new Date();
  next();
});

module.exports = mongoose.model('LoanPrecloseCondition', loanPrecloseConditionSchema);
