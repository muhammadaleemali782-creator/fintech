const mongoose = require('mongoose');

const loanSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  amount: { type: Number, required: true },
  interestRate: { type: Number, required: true },
  tenure: { type: Number, required: true }, // months
  emiAmount: { type: Number, required: true },
  totalPayable: { type: Number, required: true },
  paidAmount: { type: Number, default: 0 },
  remainingAmount: { type: Number },
  status: { 
    type: String, 
    enum: ['pending', 'approved', 'rejected', 'active', 'closed'], 
    default: 'pending' 
  },
  emiSchedule: [{
    month: Number,
    dueDate: Date,
    amount: Number,
    status: { type: String, enum: ['pending', 'paid', 'overdue'], default: 'pending' },
    paidOn: Date
  }],
  purpose: String,
  createdAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model('Loan', loanSchema);