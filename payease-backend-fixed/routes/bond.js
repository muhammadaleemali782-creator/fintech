const express = require('express');
const mongoose = require('mongoose');
const Bond = require('../models/Bond');
const User = require('../models/User');
const Transaction = require('../models/Transaction');
const { protect } = require('../middleware/auth');
const router = express.Router();

// Helper: Calculate bond details strictly on server (Anti-Burp/Anti-Tamper)
const calculateBondTerms = (bondType, amount = 100000) => {
  const principal = Math.max(100000, Math.floor(Number(amount) / 100000) * 100000); // strictly in units of 1 Lakh
  const now = new Date();

  if (bondType === 'debit_365') {
    // 365 Days Bond: 1 Lakh -> 1.18 Lakh into Profit Wallet
    const returnAmount = Math.round(principal * 1.18); // 18% profit
    const maturityDate = new Date(now.getTime() + 365 * 24 * 60 * 60 * 1000);
    return {
      bondType,
      principalAmount: principal,
      returnAmount,
      monthlyPayout: 0,
      tenureDays: 365,
      tenureMonths: 12,
      startDate: now,
      maturityDate,
      nextPayoutDate: maturityDate
    };
  }

  if (bondType === 'lending_40') {
    // 40 Months Lending Bond: 1 Lakh -> 1.4 Lakh total @ 3,500 monthly payout
    const factor = principal / 100000;
    const monthlyPayout = Math.round(3500 * factor);
    const returnAmount = Math.round(140000 * factor);
    const maturityDate = new Date(now);
    maturityDate.setMonth(maturityDate.getMonth() + 40);
    const nextPayoutDate = new Date(now);
    nextPayoutDate.setDate(nextPayoutDate.getDate() + 30);

    return {
      bondType,
      principalAmount: principal,
      returnAmount,
      monthlyPayout,
      tenureDays: 40 * 30,
      tenureMonths: 40,
      startDate: now,
      maturityDate,
      nextPayoutDate
    };
  }

  if (bondType === 'lending_80') {
    // 80 Months Lending Bond: 1 Lakh -> 1.8 Lakh total @ 2,250 monthly payout
    const factor = principal / 100000;
    const monthlyPayout = Math.round(2250 * factor);
    const returnAmount = Math.round(180000 * factor);
    const maturityDate = new Date(now);
    maturityDate.setMonth(maturityDate.getMonth() + 80);
    const nextPayoutDate = new Date(now);
    nextPayoutDate.setDate(nextPayoutDate.getDate() + 30);

    return {
      bondType,
      principalAmount: principal,
      returnAmount,
      monthlyPayout,
      tenureDays: 80 * 30,
      tenureMonths: 80,
      startDate: now,
      maturityDate,
      nextPayoutDate
    };
  }

  throw new Error('Invalid bond type');
};

// Create a new Bond
router.post('/create', protect, async (req, res) => {
  const { bondType, amount = 100000 } = req.body;

  if (!['debit_365', 'lending_40', 'lending_80'].includes(bondType)) {
    return res.status(400).json({ message: 'Invalid bond type' });
  }

  let terms;
  try {
    terms = calculateBondTerms(bondType, amount);
  } catch (err) {
    return res.status(400).json({ message: err.message });
  }

  const session = await mongoose.startSession();
  try {
    let bond;

    await session.withTransaction(async () => {
      // Atomic deduction with balance check
      const updatedUser = await User.findOneAndUpdate(
        { _id: req.user._id, balance: { $gte: terms.principalAmount } },
        { $inc: { balance: -terms.principalAmount } },
        { new: true, session }
      );

      if (!updatedUser) {
        throw Object.assign(
          new Error(`Insufficient wallet balance. ₹${terms.principalAmount.toLocaleString('en-IN')} required.`),
          { status: 400 }
        );
      }

      // Activate corresponding wallet if not yet active
      if (bondType === 'debit_365') {
        updatedUser.wallets.debit.active = true;
      } else {
        updatedUser.wallets.lending.active = true;
      }
      await updatedUser.save({ session });

      const created = await Bond.create([{
        userId: req.user._id,
        ...terms,
        status: 'active'
      }], { session });

      bond = created[0];

      await Transaction.create([{
        userId: req.user._id,
        type: 'bond_created',
        amount: terms.principalAmount,
        method: 'wallet',
        status: 'completed',
        referenceId: bond._id.toString(),
        remarks: `${bondType === 'debit_365' ? '365-Day Fixed Bond (₹1.18L Profit Maturity)' : 'Lending Monthly Bond'} Created`
      }], { session });
    });

    res.json({
      message: '🎉 Bond created successfully! Funds locked safely.',
      bond
    });
  } catch (err) {
    res.status(err.status || 500).json({ message: err.message || 'Bond creation failed' });
  } finally {
    session.endSession();
  }
});

// Get user's bonds + check payouts
router.get('/my', protect, async (req, res) => {
  try {
    const now = new Date();
    const bonds = await Bond.find({ userId: req.user._id }).sort({ createdAt: -1 });

    // Process matured or pending monthly payouts automatically
    for (const b of bonds) {
      if (b.status === 'active') {
        // 1. Check 365-day debit bond maturity
        if (b.bondType === 'debit_365' && b.maturityDate <= now) {
          b.status = 'matured';
          await User.findByIdAndUpdate(req.user._id, {
            $inc: { profitBalance: b.returnAmount, balance: b.principalAmount }
          });
          await Transaction.create({
            userId: req.user._id,
            type: 'bond_payout',
            amount: b.returnAmount,
            method: 'wallet',
            status: 'completed',
            referenceId: b._id.toString(),
            remarks: `365-Day Bond Matured: ₹${b.returnAmount.toLocaleString('en-IN')} credited to Profit Wallet!`
          });
          await b.save();
        }

        // 2. Check lending monthly payouts
        if ((b.bondType === 'lending_40' || b.bondType === 'lending_80') && b.nextPayoutDate <= now && b.payoutsCompleted < b.tenureMonths) {
          b.payoutsCompleted += 1;
          const isFinal = b.payoutsCompleted >= b.tenureMonths;
          if (isFinal) b.status = 'matured';
          else {
            const nextDate = new Date(b.nextPayoutDate);
            nextDate.setDate(nextDate.getDate() + 30);
            b.nextPayoutDate = nextDate;
          }

          await User.findByIdAndUpdate(req.user._id, {
            $inc: { balance: b.monthlyPayout, profitBalance: b.monthlyPayout }
          });
          await Transaction.create({
            userId: req.user._id,
            type: 'bond_payout',
            amount: b.monthlyPayout,
            method: 'wallet',
            status: 'completed',
            referenceId: b._id.toString(),
            remarks: `Monthly Lending Payout (${b.payoutsCompleted}/${b.tenureMonths}): ₹${b.monthlyPayout.toLocaleString('en-IN')}`
          });
          await b.save();
        }
      }
    }

    const updatedBonds = await Bond.find({ userId: req.user._id }).sort({ createdAt: -1 });
    res.json(updatedBonds);
  } catch (err) {
    res.status(500).json({ message: 'Failed to fetch bonds' });
  }
});

module.exports = router;
