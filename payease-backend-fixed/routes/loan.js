const express = require('express');
const mongoose = require('mongoose');
const Loan = require('../models/Loan');
const User = require('../models/User');
const Settings = require('../models/Settings');
const { protect, admin } = require('../middleware/auth');
const { isValidAmount, isValidTenure } = require('../utils/validateAmount');
const router = express.Router();

// EMI Calculator
const calculateEMI = (principal, rate, tenure) => {
  const r = rate / 12 / 100;
  const emi = (principal * r * Math.pow(1 + r, tenure)) / (Math.pow(1 + r, tenure) - 1);
  return Math.round(emi);
};

// Get current interest rate
const getInterestRate = async () => {
  try {
    const setting = await Settings.findOne({ key: 'loanInterestRate' });
    return setting ? setting.value : 12; // default 12%
  } catch {
    return 12;
  }
};

// Get referral commission rate
const getReferralCommissionRate = async () => {
  try {
    const setting = await Settings.findOne({ key: 'referralCommissionRate' });
    return setting ? setting.value : 2; // default 2%
  } catch {
    return 2;
  }
};

// Public/User Loan Query (Inquiry)
router.post('/query', async (req, res) => {
  try {
    const { name, phone, email, amount, purpose, notes } = req.body;
    if (!name || !phone) {
      return res.status(400).json({ message: 'Name and phone number are required' });
    }

    const { sendNotification } = require('../utils/notifier');
    await sendNotification({
      type: 'loan_query',
      title: 'New Loan Query Received 💰',
      message: `${name} (${phone}) requested loan of ₹${amount || 'Custom'} for ${purpose || 'Personal'}.`,
      data: { name, phone, email, amount, purpose, notes, date: new Date() }
    });

    res.json({
      success: true,
      message: 'Aapki loan query submit ho chuki hai! Hamari team aapse jaldi contact karegi.'
    });
  } catch (err) {
    console.error('Loan query error:', err);
    res.status(500).json({ message: 'Failed to submit loan query. Please try again.' });
  }
});

// Apply loan
router.post('/apply', protect, async (req, res) => {
  try {
    const { amount, tenure, purpose } = req.body;

    // Negative amount, 0/negative tenure, NaN, ya bahut bada fake amount
    // sab yaha block ho jayega -> pehle ye check hi nahi tha (crash/exploit risk)
    if (!isValidAmount(amount, 1000, 500000))
      return res.status(400).json({ message: 'Loan amount must be between ₹1,000 and ₹5,00,000' });
    if (!isValidTenure(tenure))
      return res.status(400).json({ message: 'Tenure must be between 1 and 60 months' });

    // Use individual user custom interest rate if assigned by Admin, else global rate
    const userDoc = await User.findById(req.user._id);
    const interestRate = (userDoc && typeof userDoc.interestRate === 'number') ? userDoc.interestRate : (await getInterestRate());

    const emi = calculateEMI(amount, interestRate, tenure);
    const totalPayable = emi * tenure;

    const schedule = [];
    for (let i = 1; i <= tenure; i++) {
      const dueDate = new Date();
      dueDate.setMonth(dueDate.getMonth() + i);
      schedule.push({ month: i, dueDate, amount: emi, status: 'pending' });
    }

    const loan = await Loan.create({
      userId: req.user._id,
      amount,
      interestRate,
      tenure,
      emiAmount: emi,
      totalPayable,
      remainingAmount: totalPayable,
      emiSchedule: schedule,
      purpose
    });

    // Notify admin in real time!
    const { sendNotification } = require('../utils/notifier');
    sendNotification({
      type: 'loan_apply',
      title: 'New Loan Application Submitted 📄',
      message: `${req.user.name} applied for ₹${amount} (${purpose || 'Education / Personal'})`,
      data: { loanId: loan._id, userId: req.user._id, amount, tenure }
    });

    res.json({
      message: 'Loan application submitted successfully',
      loan,
      interestRate
    });
  } catch (err) {
    res.status(500).json({ message: 'Something went wrong. Please try again.' });
  }
});

// My loans
router.get('/my', protect, async (req, res) => {
  try {
    const loans = await Loan.find({ userId: req.user._id }).sort({ createdAt: -1 });
    res.json(loans);
  } catch (err) {
    res.status(500).json({ message: 'Something went wrong. Please try again.' });
  }
});

// Get current interest rate (for frontend EMI preview)
router.get('/current-rate', async (req, res) => {
  try {
    const rate = await getInterestRate();
    res.json({ interestRate: rate });
  } catch (err) {
    res.status(500).json({ message: 'Something went wrong. Please try again.' });
  }
});

// Pay EMI
router.post('/:id/pay-emi', protect, async (req, res) => {
  if (!mongoose.Types.ObjectId.isValid(req.params.id))
    return res.status(400).json({ message: 'Invalid loan ID' });

  const session = await mongoose.startSession();
  try {
    let resultLoan, newBalance;

    // EMI-mark-as-paid aur balance-deduct dono ek DB transaction ke andar,
    // aur deduct "balance >= emiAmount" condition ke saath atomic $inc se hota
    // hai. Isse parallel pay-emi requests se 2 EMI ek saath "paid" nahi ho
    // sakti jabki balance sirf 1 EMI jitna tha (race condition fix).
    await session.withTransaction(async () => {
      const loan = await Loan.findById(req.params.id).session(session);
      if (!loan) {
        const e = new Error('Loan not found');
        e.status = 404;
        throw e;
      }
      if (loan.userId.toString() !== req.user._id.toString()) {
        const e = new Error('Unauthorized');
        e.status = 403;
        throw e;
      }

      const pending = loan.emiSchedule.find(x => x.status === 'pending');
      if (!pending) {
        const e = new Error('No pending EMI');
        e.status = 400;
        throw e;
      }

      const updatedUser = await User.findOneAndUpdate(
        { _id: req.user._id, balance: { $gte: loan.emiAmount } },
        { $inc: { balance: -loan.emiAmount } },
        { new: true, session }
      );
      if (!updatedUser) {
        const e = new Error('Insufficient balance');
        e.status = 400;
        throw e;
      }
      newBalance = updatedUser.balance;

      pending.status = 'paid';
      pending.paidOn = new Date();
      loan.paidAmount += loan.emiAmount;
      loan.remainingAmount -= loan.emiAmount;
      if (loan.paidAmount >= loan.totalPayable) loan.status = 'closed';

      await loan.save({ session });
      resultLoan = loan;
    });

    res.json({ message: 'EMI paid successfully', loan: resultLoan, newBalance });
  } catch (err) {
    res.status(err.status || 500).json({ message: err.status ? err.message : 'Something went wrong. Please try again.' });
  } finally {
    session.endSession();
  }
});

// Admin: Approve loan + pay referral commission
router.post('/:id/approve', protect, admin, async (req, res) => {
  if (!mongoose.Types.ObjectId.isValid(req.params.id))
    return res.status(400).json({ message: 'Invalid loan ID' });

  const session = await mongoose.startSession();
  try {
    let resultLoan, commission = 0;

    // Poora disbursal + referral-commission flow ek DB transaction ke andar.
    // "loan.status !== 'pending'" check zaroori hai -- pehle ye check tha hi
    // nahi, isliye same loan par approve 2 baar call hone par (double-click /
    // race) user ka balance dobara credit ho jata tha. Ab ek hi loan sirf
    // ek baar disburse/commission-pay ho sakta hai.
    await session.withTransaction(async () => {
      const loan = await Loan.findById(req.params.id).session(session);
      if (!loan) {
        const e = new Error('Loan not found');
        e.status = 404;
        throw e;
      }
      if (loan.status !== 'pending') {
        const e = new Error('Loan already processed');
        e.status = 400;
        throw e;
      }

      const user = await User.findById(loan.userId).session(session);
      if (!user) {
        const e = new Error('Borrower not found');
        e.status = 404;
        throw e;
      }

      user.balance += loan.amount;
      user.loansCount = (user.loansCount || 0) + 1;

      // Auto-unlock Platinum VIP Card if milestone (4 loans) reached
      if (user.loansCount >= 4) {
        if (!user.cardStatus) {
          user.cardStatus = {
            silver: { unlocked: true, cardNumber: `4532 ${Math.floor(1000 + Math.random() * 9000)} ${Math.floor(1000 + Math.random() * 9000)} 1200` },
            platinum: { unlocked: false, cardNumber: `5421 ${Math.floor(1000 + Math.random() * 9000)} ${Math.floor(1000 + Math.random() * 9000)} 8840` }
          };
        }
        user.cardStatus.platinum.unlocked = true;
        user.cardStatus.platinum.unlockReason = 'Completed 4+ Loans Milestone';
        user.cardTier = 'platinum';
        user.markModified('cardStatus');
      }

      await user.save({ session });

      loan.status = 'active';

      // Referral commission - give to person who referred this user
      if (user.referredBy && !loan.referralCommissionPaid) {
        const commissionRate = await getReferralCommissionRate();
        const commissionAmount = Math.round((loan.amount * commissionRate) / 100);

        const referrer = await User.findOneAndUpdate(
          { _id: user.referredBy },
          { $inc: { balance: commissionAmount, referralEarnings: commissionAmount } },
          { session, new: true }
        );
        if (referrer) {
          loan.referralCommissionPaid = true;
          loan.referralCommissionAmount = commissionAmount;
          commission = commissionAmount;
          console.log(`💰 Referral commission ₹${commissionAmount} paid to ${referrer.name}`);
        }
      }

      await loan.save({ session });
      resultLoan = loan;
    });

    res.json({
      message: 'Loan approved and disbursed',
      loan: resultLoan,
      referralCommission: commission
    });
  } catch (err) {
    res.status(err.status || 500).json({ message: err.status ? err.message : 'Something went wrong. Please try again.' });
  } finally {
    session.endSession();
  }
});

// Admin: Reject loan
router.post('/:id/reject', protect, admin, async (req, res) => {
  try {
    if (!mongoose.Types.ObjectId.isValid(req.params.id))
      return res.status(400).json({ message: 'Invalid loan ID' });

    // Sirf abhi tak 'pending' loan hi reject ho sakta hai -- already
    // approved/active/closed loan ko galti se reject hone se bachata hai
    const loan = await Loan.findOneAndUpdate(
      { _id: req.params.id, status: 'pending' },
      { $set: { status: 'rejected' } },
      { new: true }
    );
    if (!loan) return res.status(400).json({ message: 'Loan not found or already processed' });
    res.json({ message: 'Loan rejected', loan });
  } catch (err) {
    res.status(500).json({ message: 'Something went wrong. Please try again.' });
  }
});

// Admin: All loans
router.get('/all', protect, admin, async (req, res) => {
  try {
    const loans = await Loan.find()
      .populate('userId', 'name email referralCode')
      .sort({ createdAt: -1 });
    res.json(loans);
  } catch (err) {
    res.status(500).json({ message: 'Something went wrong. Please try again.' });
  }
});

module.exports = router;
