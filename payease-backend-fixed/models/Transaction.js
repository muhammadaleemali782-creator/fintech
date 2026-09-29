const mongoose = require('mongoose');

const transactionSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  type: {
    type: String,
    enum: [
      'deposit',
      'withdrawal',
      'transfer_sent',
      'transfer_received',
      'bond_created',
      'bond_payout',
      'loan_disbursal',
      'loan_installment',
      'loan_early_closure'
    ],
    required: true
  },
  amount: { type: Number, required: true },
  method: { type: String, enum: ['upi', 'bank', 'wallet', 'internal'], default: 'wallet' },
  status: { 
    type: String, 
    enum: ['pending', 'approved', 'rejected', 'completed'], 
    default: 'completed' 
  },
  utrNumber: String,
  paymentDetails: {
    upiId: String,
    accountNumber: String,
    ifsc: String
  },
  senderUserId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  receiverUserId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  senderName: String,
  receiverName: String,
  recipientIdentifier: String,
  referenceId: String, // e.g. loanId or bondId
  remarks: String,
  approvedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  createdAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model('Transaction', transactionSchema);