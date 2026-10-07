const mongoose = require('mongoose');

const loanSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  accountNumber: { type: String, unique: true, sparse: true }, // e.g. EFSPL0001
  loanType: { type: String, enum: ['personal', 'student', 'micro_business'], default: 'personal' },
  collectionFrequency: { type: String, enum: ['10_days', 'daily'], default: '10_days' },
  dailyTenureDays: { type: Number }, // 60, 80, 100, 120 for micro_business
  amount: { type: Number, required: true },
  interestRate: { type: Number, default: 1.34 }, // % per installment or total interest %
  interestRatePerInstallment: { type: Number, default: 1.34 },
  cycleDays: { type: Number, default: 10 },
  installmentsCount: { type: Number, required: true },
  tenure: { type: Number }, // fallback tenure in months or installments
  installmentAmount: { type: Number, required: true },
  emiAmount: { type: Number }, // legacy alias for installmentAmount
  processingFee: { type: Number, default: 0 }, // 5%
  upiCharges: { type: Number, default: 0 }, // 1%
  advanceDeduction: { type: Number, default: 0 }, // advance installment deducted upfront
  disbursalAmount: { type: Number, required: true }, // Net payout
  totalPayable: { type: Number, required: true },
  paidAmount: { type: Number, default: 0 },
  remainingAmount: { type: Number },
  hasChequeFacility: { type: Boolean, default: false },
  chequeNumber: { type: String },
  earlyClosed: { type: Boolean, default: false },
  earlyClosedAt: { type: Date },
  agentProfitPaid: { type: Boolean, default: false },
  agentProfitAmount: { type: Number, default: 0 },
  penaltyDue: { type: Number, default: 0 }, // Active penalty amount due
  penaltyPaid: { type: Number, default: 0 }, // Cumulative penalty amount paid
  penaltyCount: { type: Number, default: 0 }, // Number of penalty doubling cycles
  lastPenaltyAppliedAt: { type: Date },
  accumulatedDue: { type: Number, default: 0 }, // Total rolled-over unpaid EMIs + penalty
  nominee: {
    name: String,
    relation: String,
    phone: String
  },
  documents: {
    aadharNumber: String,
    aadharUrl: String,
    aadharBackUrl: String,
    doc1Url: String,
    doc1BackUrl: String,
    panNumber: String,
    panUrl: String,
    panBackUrl: String,
    doc2Url: String,
    doc2BackUrl: String,
    chequeNumber: String,
    chequeUrl: String,
    chequeBackUrl: String,
    bankName: String,
    bankAccountNumber: String,
    bankIfsc: String,
    upiId: String,
    upiQrUrl: String,
    nomineeName: String,
    nomineeRelation: String,
    nomineePhone: String,
    applicantEmail: String,
    applicantPhone: String,
    businessName: String,
    studentProofUrl: String,
    studentProofBackUrl: String,
    googleDriveLink: String
  },
  status: { 
    type: String, 
    enum: ['pending', 'approved', 'rejected', 'active', 'closed'], 
    default: 'pending' 
  },
  installmentSchedule: [{
    installmentNo: Number,
    month: Number,
    dueDate: Date,
    amount: Number,
    status: { type: String, enum: ['pending', 'submitted', 'paid', 'overdue'], default: 'pending' },
    paidOn: Date,
    utrNumber: String,
    proofUrl: String,
    proofBackUrl: String,
    submittedAt: Date,
    paymentMethod: { type: String, default: 'wallet' },
    approvedBy: String,
    adminEvidenceNote: String
  }],
  emiSchedule: [{
    installmentNo: Number,
    month: Number,
    dueDate: Date,
    amount: Number,
    status: { type: String, enum: ['pending', 'submitted', 'paid', 'overdue'], default: 'pending' },
    paidOn: Date,
    utrNumber: String,
    proofUrl: String,
    proofBackUrl: String,
    submittedAt: Date,
    paymentMethod: { type: String, default: 'wallet' },
    approvedBy: String,
    adminEvidenceNote: String
  }],
  purpose: { type: String, default: 'Personal Loan' },
  referralCommissionPaid: { type: Boolean, default: false },
  referralCommissionAmount: { type: Number, default: 0 },
  createdAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model('Loan', loanSchema);