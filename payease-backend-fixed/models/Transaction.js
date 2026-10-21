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
      'loan_early_closure',
      'daily_yield',
      'referral_bonus',
      'profit_transfer'
    ],
    required: true
  },
  amount: { type: Number, required: true },
  method: { 
    type: String, 
    enum: ['upi', 'bank', 'wallet', 'internal', 'profit_wallet', 'primary_wallet', 'system', 'admin_override'], 
    default: 'wallet' 
  },
  status: { 
    type: String, 
    enum: ['pending', 'approved', 'rejected', 'completed', 'hold'], 
    default: 'completed' 
  },
  isHold: { type: Boolean, default: false },
  holdReason: { type: String },
  utrNumber: String,
  proofUrl: String,
  screenshotUrl: String,
  adminEvidenceUrl: String,
  adminEvidenceNote: String,
  adminEvidenceDriveUrl: String,
  slaHours: Number,
  slaLabel: String,
  sourceWallet: String,
  paymentDetails: {
    upiId: String,
    qrCodeUrl: String,
    googleDriveQrUrl: String,
    accountNumber: String,
    ifsc: String,
    bankName: String,
    holderName: String
  },
  senderUserId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  receiverUserId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  senderName: String,
  receiverName: String,
  recipientIdentifier: String,
  referenceId: String, // e.g. loanId or bondId
  referralCommissionPaid: { type: Boolean, default: false },
  referralCommissionAmount: { type: Number, default: 0 },
  referralAgentId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  remarks: String,
  approvedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  approvedAt: { type: Date },
  approverName: { type: String },
  approverDevice: { type: String },
  handledBy: {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    name: String,
    role: String,
    department: String,
    action: String,
    at: Date
  },
  claim: {
    claimedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    claimedByName: String,
    claimedAt: Date,
    expiresAt: Date
  },
  history: [{
    action: String,
    actorId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    actorName: String,
    actorRole: String,
    department: String,
    note: String,
    at: { type: Date, default: Date.now }
  }],
  createdAt: { type: Date, default: Date.now }
});

// High-performance compound indexes for instant sorting & filtering
transactionSchema.index({ userId: 1, createdAt: -1 });
transactionSchema.index({ status: 1, createdAt: -1 });
transactionSchema.index({ type: 1, status: 1 });
transactionSchema.index({ type: 1, createdAt: -1 });
transactionSchema.index({ referenceId: 1 }, { sparse: true });
transactionSchema.index({ utrNumber: 1 }, { sparse: true });
transactionSchema.index({ isHold: 1, createdAt: -1 });

module.exports = mongoose.model('Transaction', transactionSchema);