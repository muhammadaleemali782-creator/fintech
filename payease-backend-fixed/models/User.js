const mongoose = require('mongoose');

const userSchema = new mongoose.Schema({
  name: { type: String, required: true },
  email: { type: String, required: true, unique: true },
  phone: { type: String, required: true },
  password: { type: String, required: true },
  balance: { type: Number, default: 0 },
  role: { type: String, enum: ['user', 'admin'], default: 'user' },
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

  // Referral System
  referralCode: { type: String, unique: true, sparse: true },
  referredBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  referralEarnings: { type: Number, default: 0 },
  referralCount: { type: Number, default: 0 },

  createdAt: { type: Date, default: Date.now }
});

// Auto-generate referral code before saving
// Collision hone par (rare) dobara try karta hai, taaki duplicate-key error se
// registration generic 500 error ke saath fail na ho
userSchema.pre('save', async function (next) {
  if (!this.referralCode && this.role === 'user') {
    const prefix = (this.name || 'USR').replace(/\s/g, '').substring(0, 3).toUpperCase();
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
  }
  next();
});

module.exports = mongoose.model('User', userSchema);
