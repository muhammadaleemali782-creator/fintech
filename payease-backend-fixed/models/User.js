const mongoose = require('mongoose');

const userSchema = new mongoose.Schema({
  name: { type: String, required: true },
  email: { type: String, required: true, unique: true },
  phone: { type: String, required: true, unique: true, sparse: true },
  password: { type: String, required: true },
  balance: { type: Number, default: 0 },
  lowestBalance24h: { type: Number, default: 0 }, // Lowest balance in active 24h window
  lastYieldCalculatedAt: { type: Date, default: Date.now }, // Timestamp of last 24h yield distribution
  lastYieldNotificationAt: { type: Date, default: null }, // Timestamp of last 24h profit notification dispatched
  profitBalance: { type: Number, default: 0 }, // Capitalised profits
  duesBalance: { type: Number, default: 0 }, // Total pending loan installments & card dues
  loanLimit: { type: Number, default: 5000 }, // Initial ₹5,000; doubles on loan completion (5k -> 10k -> 20k -> 40k -> 50k max)
  role: { type: String, enum: ['user', 'admin', 'agent', 'staff'], default: 'user' },
  tokenVersion: { type: Number, default: 0 },
  staffProfile: {
    departments: [{ type: String, enum: ['loan', 'kyc', 'deposit', 'withdrawal', 'lending', 'bond'] }],
    permissions: [{ type: String }],
    isActive: { type: Boolean, default: true },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    createdAt: { type: Date, default: null },
    limits: {
      maxApprovalAmount: { type: Number, default: 0 } // 0 = unlimited
    },
    lastActiveAt: { type: Date, default: null }
  },
  agentProfile: {
    applied: { type: Boolean, default: false },
    status: { type: String, enum: ['none', 'pending', 'approved', 'rejected'], default: 'none' },
    commissionModel: { type: String, enum: ['team_1', 'solo_2', 'team', 'solo'], default: 'solo_2' },
    commissionRate: { type: Number, default: 0 }, // Admin assigns commission percentage (legacy/fallback)
    commissions: {
      loan: { type: Number, default: 2 },
      lending: { type: Number, default: 2 },
      investment: { type: Number, default: 2 },
      bond: { type: Number, default: 2 }
    },
    earningsBreakdown: {
      loan: { type: Number, default: 0 },
      lending: { type: Number, default: 0 },
      investment: { type: Number, default: 0 },
      bond: { type: Number, default: 0 }
    },
    businessName: { type: String, default: '' },
    city: { type: String, default: '' },
    nominatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    appliedAt: { type: Date, default: null },
    approvedAt: { type: Date, default: null }
  },
  accountNumber: { type: String, unique: true, sparse: true }, // e.g. EFS0000001
  upiId: { type: String },
  bankAccount: {
    accountNumber: { type: String, default: '' },
    ifsc: { type: String, default: '' },
    holderName: { type: String, default: '' },
    bankName: { type: String, default: '' },
    upiId: { type: String, default: '' },
    qrCodeUrl: { type: String, default: '' },
    googleDriveQrUrl: { type: String, default: '' }
  },
  // Wallets System (Savings, Debit, Lending)
  wallets: {
    savings: { active: { type: Boolean, default: true }, balance: { type: Number, default: 0 } },
    debit: { active: { type: Boolean, default: false }, balance: { type: Number, default: 0 } },
    lending: { active: { type: Boolean, default: false }, balance: { type: Number, default: 0 } }
  },

  // Custom Interest Rate per user (Admin can set this for individual users)
  interestRate: { type: Number, default: 12 },

  // Card Tiers: Silver (default) & Platinum (VIP after 4 loans or Admin unlock)
  cardTier: { type: String, enum: ['silver', 'platinum'], default: 'silver' },
  cardStatus: {
    silver: {
      unlocked: { type: Boolean, default: true },
      cardNumber: { type: String, default: () => `4532 ${Math.floor(1000 + Math.random() * 9000)} ${Math.floor(1000 + Math.random() * 9000)} 1200` }
    },
    platinum: {
      unlocked: { type: Boolean, default: false },
      cardNumber: { type: String, default: () => `5421 ${Math.floor(1000 + Math.random() * 9000)} ${Math.floor(1000 + Math.random() * 9000)} 8840` },
      unlockReason: { type: String, default: '' }
    }
  },
  loansCount: { type: Number, default: 0 },

  isBlocked: { type: Boolean, default: false },
  isUninstallProtected: { type: Boolean, default: false },
  mustChangePassword: { type: Boolean, default: false },
  tempPasswordAssigned: { type: Boolean, default: false },
  passwordResetNonce: { type: String, default: null },
  passwordResetExpires: { type: Date, default: null },
  walletPin: { type: String, default: null },
  pinFailCount: { type: Number, default: 0 },
  pinLockedUntil: { type: Date, default: null },
  loginFailCount: { type: Number, default: 0 },
  loginLockedUntil: { type: Date, default: null },
  aadharNumber: { type: String, default: null },
  address: { type: String, default: '' },

  // KYC System (2 Mandatory Documents: Doc 1 Aadhaar + Doc 2 PAN / Cheque)
  kycStatus: { type: String, enum: ['none', 'pending', 'verified', 'rejected'], default: 'none' },
  kycDocuments: {
    docType: { type: String, default: 'aadhaar' }, // Primary doc 1
    doc1Type: { type: String, default: 'aadhaar' },
    doc1Url: { type: String, default: '' },
    doc1BackUrl: { type: String, default: '' },
    doc2Type: { type: String, default: 'pan' }, // 'pan', 'cheque'
    doc2Url: { type: String, default: '' },
    doc2BackUrl: { type: String, default: '' },
    aadharNumber: { type: String, default: '' },
    aadhaarName: { type: String, default: '' },
    aadharName: { type: String, default: '' },
    aadhaarPhone: { type: String, default: '' },
    aadharPhone: { type: String, default: '' },
    panNumber: { type: String, default: '' },
    chequeNumber: { type: String, default: '' },
    chequeUrl: { type: String, default: '' },
    chequeBackUrl: { type: String, default: '' },
    address: { type: String, default: '' },
    bankName: { type: String, default: '' },
    bankAccountNumber: { type: String, default: '' },
    bankIfsc: { type: String, default: '' },
    bankHolderName: { type: String, default: '' },
    bankUpiId: { type: String, default: '' },
    googleDriveLink: { type: String, default: '' },
    docUrl: { type: String, default: '' },
    adminRemarks: { type: String, default: '' },
    isNoteLocked: { type: Boolean, default: false },
    submittedAt: { type: Date, default: null }
  },
  kycVerifiedAt: { type: Date, default: null },
  kycApprovedBy: {
    name: { type: String, default: '' },
    device: { type: String, default: '' },
    at: { type: Date, default: null }
  },

  // Bank Details Change Request (Requires KYC Department review & approval)
  bankChangeRequest: {
    status: { type: String, enum: ['none', 'pending', 'approved', 'rejected'], default: 'none' },
    bankName: { type: String, default: '' },
    accountNumber: { type: String, default: '' },
    ifsc: { type: String, default: '' },
    holderName: { type: String, default: '' },
    upiId: { type: String, default: '' },
    reason: { type: String, default: '' },
    requestedAt: { type: Date, default: null },
    reviewedAt: { type: Date, default: null },
    reviewedBy: {
      userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
      name: { type: String, default: '' },
      role: { type: String, default: '' }
    },
    adminRemarks: { type: String, default: '' }
  },

  // Custom UPI / App QR (GPay, PhonePe, Paytm, etc.) - Persists across app uninstalls
  customQrUrl: { type: String, default: '' },
  customQrUpi: { type: String, default: '' },
  customQrApp: { type: String, default: '' },
  customQrDriveUrl: { type: String, default: '' },

  // Referral System
  referralCode: { type: String, unique: true, sparse: true },
  referredBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  referredByCode: { type: String, default: null },
  referralEarnings: { type: Number, default: 0 },
  referralCount: { type: Number, default: 0 },
  holdSince: { type: Date, default: null },
  isPremium: { type: Boolean, default: false },
  commissionPaid: { type: Boolean, default: false },
  fcmToken: { type: String, default: null },

  createdAt: { type: Date, default: Date.now }
});

userSchema.index({ referredBy: 1 });

// Auto-generate referral code ONLY for AGENTS before saving
userSchema.pre('save', async function (next) {
  const isAgent = this.role === 'agent' || this.agentProfile?.status === 'approved';
  if (!this.referralCode && isAgent) {
    const prefix = (this.name || 'AGT').replace(/\s/g, '').substring(0, 3).toUpperCase();
    const Model = this.constructor;

    let code;
    let attempts = 0;
    const maxAttempts = 5;

    do {
      const rand = Math.floor(1000 + Math.random() * 9000);
      code = `EF${prefix}${rand}`;
      attempts++;
      // eslint-disable-next-line no-await-in-loop
      const clash = await Model.findOne({ referralCode: code }).select('_id');
      if (!clash) break;
      code = null;
    } while (attempts < maxAttempts);

    // 5 attempts ke baad bhi clash mile (bahut rare) to timestamp suffix daal do
    // -> guaranteed unique, save kabhi fail nahi hoga
    this.referralCode = code || `EF${prefix}${Date.now().toString().slice(-6)}`;
  } else if (!isAgent && this.role !== 'admin' && this.role !== 'staff') {
    // Normal users never have a referral code
    this.referralCode = undefined;
  }

  if (!this.accountNumber && this.role !== 'admin' && this.role !== 'staff') {
    const Model = this.constructor;
    const count = await Model.countDocuments({ accountNumber: { $exists: true } });
    let seq = count + 1;
    let accNo = `EFS0000${String(seq).padStart(3, '0')}`;
    while (await Model.findOne({ accountNumber: accNo })) {
      seq++;
      accNo = `EFS0000${String(seq).padStart(3, '0')}`;
    }
    this.accountNumber = accNo;
    if (!this.upiId || !this.upiId.includes('@')) {
      this.upiId = `${accNo.toLowerCase()}@educa`;
    }
  } else if (this.accountNumber && (!this.upiId || !this.upiId.includes('@'))) {
    this.upiId = `${this.accountNumber.toLowerCase()}@educa`;
  }
  next();
});

// High-performance compound indexes for user management & agent hierarchy
userSchema.index({ role: 1, createdAt: -1 });
userSchema.index({ 'agentProfile.status': 1 }, { sparse: true });
userSchema.index({ referredBy: 1 }, { sparse: true });
userSchema.index({ kycStatus: 1 });

module.exports = mongoose.model('User', userSchema);
