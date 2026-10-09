const mongoose = require('mongoose');

const userSchema = new mongoose.Schema({
  name: { type: String, required: true },
  email: { type: String, required: true, unique: true },
  phone: { type: String, required: true, unique: true, sparse: true },
  password: { type: String, required: true },
  balance: { type: Number, default: 0 },
  lowestBalance24h: { type: Number, default: 0 }, // Lowest balance in active 24h window
  lastYieldCalculatedAt: { type: Date, default: Date.now }, // Timestamp of last 24h yield distribution
  profitBalance: { type: Number, default: 0 }, // Capitalised profits
  duesBalance: { type: Number, default: 0 }, // Total pending loan installments & card dues
  loanLimit: { type: Number, default: 5000 }, // Initial ₹5,000; doubles on loan completion (5k -> 10k -> 20k -> 40k -> 50k max)
  role: { type: String, enum: ['user', 'admin', 'agent'], default: 'user' },
  agentProfile: {
    applied: { type: Boolean, default: false },
    status: { type: String, enum: ['none', 'pending', 'approved', 'rejected'], default: 'none' },
    commissionModel: { type: String, enum: ['team_1', 'solo_2', 'team', 'solo'], default: 'solo_2' },
    commissionRate: { type: Number, default: 0 }, // Admin assigns commission percentage (legacy/fallback)
    commissions: {
      loan: { type: Number, default: 1 },
      lending: { type: Number, default: 4 },
      investment: { type: Number, default: 1 },
      bond: { type: Number, default: 4 }
    },
    earningsBreakdown: {
      loan: { type: Number, default: 0 },
      lending: { type: Number, default: 0 },
      investment: { type: Number, default: 0 },
      bond: { type: Number, default: 0 }
    },
    businessName: { type: String, default: '' },
    city: { type: String, default: '' },
    appliedAt: { type: Date, default: null },
    approvedAt: { type: Date, default: null }
  },
  accountNumber: { type: String, unique: true, sparse: true }, // e.g. EFS0000001
  upiId: { type: String },
  bankAccount: {
    accountNumber: String,
    ifsc: String,
    holderName: String
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
  walletPin: { type: String, default: null },
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
    panNumber: { type: String, default: '' },
    chequeNumber: { type: String, default: '' },
    chequeUrl: { type: String, default: '' },
    chequeBackUrl: { type: String, default: '' },
    address: { type: String, default: '' },
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

  // Custom UPI / App QR (GPay, PhonePe, Paytm, etc.) - Persists across app uninstalls
  customQrUrl: { type: String, default: '' },
  customQrUpi: { type: String, default: '' },
  customQrApp: { type: String, default: '' },

  // Referral System
  referralCode: { type: String, unique: true, sparse: true },
  referredBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  referredByCode: { type: String, default: null },
  referralEarnings: { type: Number, default: 0 },
  referralCount: { type: Number, default: 0 },
  fcmToken: { type: String, default: null },

  createdAt: { type: Date, default: Date.now }
});

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
  } else if (!isAgent && this.role !== 'admin') {
    // Normal users never have a referral code
    this.referralCode = undefined;
  }

  if (!this.accountNumber && this.role !== 'admin') {
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

module.exports = mongoose.model('User', userSchema);
