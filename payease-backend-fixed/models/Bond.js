const mongoose = require('mongoose');

const bondSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  bondType: {
    type: String,
    enum: ['debit_365', 'lending_40', 'lending_80'],
    required: true
  },
  principalAmount: { type: Number, required: true },
  returnAmount: { type: Number, required: true },
  monthlyPayout: { type: Number, default: 0 },
  tenureDays: { type: Number },
  tenureMonths: { type: Number },
  payoutsCompleted: { type: Number, default: 0 },
  startDate: { type: Date, default: Date.now },
  maturityDate: { type: Date, required: true },
  nextPayoutDate: { type: Date },
  accountNumber: { type: String, unique: true, sparse: true }, // e.g. EFS0000001
  status: {
    type: String,
    enum: ['active', 'matured', 'cancelled', 'pending', 'rejected'],
    default: 'active'
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
    nomineeName: String,
    nomineeRelation: String,
    nomineePhone: String,
    applicantEmail: String,
    applicantPhone: String,
    googleDriveFolderUrl: String,
    googleDriveSyncStatus: String,
    submittedAt: { type: Date, default: Date.now }
  },
  notes: { type: String },
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
bondSchema.index({ userId: 1, createdAt: -1 });
bondSchema.index({ status: 1, createdAt: -1 });
bondSchema.index({ bondType: 1, status: 1 });

module.exports = mongoose.model('Bond', bondSchema);
