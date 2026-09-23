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

// Helper to generate sequential account number like EFSPL0001
const generateLoanAccountNumber = async (type = 'personal') => {
  const count = await Loan.countDocuments({ loanType: type });
  const num = (count + 1).toString().padStart(4, '0');
  return `EFSPL${num}`;
};

// Helper: Collection dates on 1st, 11th, and 21st of months (10-day cycle)
const getCollectionDates = (startDate, count) => {
  const dates = [];
  let current = new Date(startDate);
  while (dates.length < count) {
    current.setDate(current.getDate() + 1);
    const d = current.getDate();
    if (d === 1 || d === 11 || d === 21) {
      dates.push(new Date(current));
    }
  }
  return dates;
};

// Calculate 10-day Easy Installment details
const calculateLoanQuote = (amount, installmentsCount = 12) => {
  const count = Math.min(Math.max(Number(installmentsCount) || 12, 12), 30);
  const amt = Number(amount) || 10000;
  const ratePerInstallment = 1.34; // 1.34% per 10-day cycle

  const principalPerInstallment = amt / count;
  const interestPerInstallment = (amt * ratePerInstallment) / 100;
  const installmentAmount = Math.round(principalPerInstallment + interestPerInstallment);
  const totalPayable = installmentAmount * count;

  const processingFee = Math.round((amt * 5) / 100); // 5%
  const upiCharges = Math.round((amt * 1) / 100); // 1%
  const advanceDeduction = installmentAmount; // 1st installment deducted upfront
  const totalDeductions = processingFee + upiCharges + advanceDeduction;
  const disbursalAmount = Math.max(0, amt - totalDeductions);

  return {
    amount: amt,
    installmentsCount: count,
    cycleDays: 10,
    interestRatePerInstallment: ratePerInstallment,
    installmentAmount,
    totalPayable,
    processingFee,
    upiCharges,
    advanceDeduction,
    disbursalAmount
  };
};

// Public/Live Calculator Quote
router.post('/calculate', (req, res) => {
  const { amount, installmentsCount } = req.body;
  const quote = calculateLoanQuote(amount, installmentsCount);
  const dates = getCollectionDates(new Date(), quote.installmentsCount);
  const schedule = dates.map((dueDate, idx) => ({
    installmentNo: idx + 1,
    dueDate,
    amount: quote.installmentAmount,
    status: idx === 0 ? 'advance_deducted' : 'pending'
  }));

  res.json({ ...quote, schedule });
});

// Apply Personal Loan Account
router.post('/apply', protect, async (req, res) => {
  try {
    const { amount, installmentsCount = 12, purpose, documents } = req.body;
    const userDoc = await User.findById(req.user._id);
    if (!userDoc) return res.status(404).json({ message: 'User not found' });

    // 1. Enforce: One Person One Active Loan Only
    const existingActive = await Loan.findOne({
      userId: req.user._id,
      status: { $in: ['pending', 'approved', 'active'] }
    });
    if (existingActive) {
      return res.status(400).json({
        message: 'Aapka pehle se ek loan active/pending hai. Ek samay me sirf ek loan le sakte hain.'
      });
    }

    // 2. Enforce: Max Limit (10k first time, doubling on repayment, max 50k)
    const currentLimit = userDoc.loanLimit || 10000;
    const numAmount = Number(amount);
    if (!numAmount || numAmount < 1000 || numAmount > currentLimit) {
      return res.status(400).json({
        message: `Loan amount ₹1,000 se aapki limit ₹${currentLimit.toLocaleString('en-IN')} ke beech hona chahiye.`
      });
    }

    const count = Number(installmentsCount);
    if (!count || count < 12 || count > 30) {
      return res.status(400).json({ message: 'Easy Installments 12 se 30 ke beech honi chahiye (10-din cycle).' });
    }

    // 3. Auto-calculate disbursal & deductions
    const quote = calculateLoanQuote(numAmount, count);
    const accountNumber = await generateLoanAccountNumber('personal');

    // 4. Generate collection dates (1st, 11th, 21st)
    const collectionDates = getCollectionDates(new Date(), count);
    const schedule = collectionDates.map((dueDate, idx) => ({
      installmentNo: idx + 1,
      month: idx + 1,
      dueDate,
      amount: quote.installmentAmount,
      status: 'pending'
    }));

    const loan = await Loan.create({
      userId: req.user._id,
      accountNumber,
      loanType: 'personal',
      amount: quote.amount,
      interestRate: quote.interestRatePerInstallment,
      interestRatePerInstallment: quote.interestRatePerInstallment,
      cycleDays: 10,
      installmentsCount: quote.installmentsCount,
      tenure: quote.installmentsCount,
      installmentAmount: quote.installmentAmount,
      emiAmount: quote.installmentAmount,
      processingFee: quote.processingFee,
      upiCharges: quote.upiCharges,
      advanceDeduction: quote.advanceDeduction,
      disbursalAmount: quote.disbursalAmount,
      totalPayable: quote.totalPayable,
      remainingAmount: quote.totalPayable,
      installmentSchedule: schedule,
      emiSchedule: schedule,
      documents: documents || {},
      purpose: purpose || 'Personal Loan'
    });

    // Real-time alert to admin
    const { sendNotification } = require('../utils/notifier');
    sendNotification({
      type: 'loan_apply',
      title: 'New Personal Loan Account Applied 📄',
      message: `${req.user.name} applied for ₹${quote.amount} (Acc: ${accountNumber}, Net Disbursal: ₹${quote.disbursalAmount})`,
      data: { loanId: loan._id, accountNumber, amount: quote.amount }
    });

    res.json({
      message: 'Personal Loan application submitted successfully!',
      loan
    });
  } catch (err) {
    console.error('Loan apply error:', err);
    res.status(500).json({ message: 'Something went wrong. Please try again.' });
  }
});

// Pay Easy Installment
router.post('/:id/pay-installment', protect, async (req, res) => {
  if (!mongoose.Types.ObjectId.isValid(req.params.id))
    return res.status(400).json({ message: 'Invalid loan ID' });

  const session = await mongoose.startSession();
  try {
    let resultLoan, newBalance;

    await session.withTransaction(async () => {
      const loan = await Loan.findById(req.params.id).session(session);
      if (!loan) throw Object.assign(new Error('Loan not found'), { status: 404 });
      if (loan.userId.toString() !== req.user._id.toString()) throw Object.assign(new Error('Unauthorized'), { status: 403 });

      const pending = loan.installmentSchedule.find(x => x.status === 'pending') || loan.emiSchedule.find(x => x.status === 'pending');
      if (!pending) throw Object.assign(new Error('No pending Easy Installment'), { status: 400 });

      const installmentAmt = loan.installmentAmount || loan.emiAmount;
      const updatedUser = await User.findOneAndUpdate(
        { _id: req.user._id, balance: { $gte: installmentAmt } },
        {
          $inc: {
            balance: -installmentAmt,
            duesBalance: -installmentAmt
          }
        },
        { new: true, session }
      );
      if (!updatedUser) throw Object.assign(new Error('Insufficient balance in wallet to pay installment'), { status: 400 });
      newBalance = updatedUser.balance;

      pending.status = 'paid';
      pending.paidOn = new Date();
      loan.paidAmount = (loan.paidAmount || 0) + installmentAmt;
      loan.remainingAmount = Math.max(0, (loan.remainingAmount || loan.totalPayable) - installmentAmt);

      // Check if loan completed
      if (loan.paidAmount >= loan.totalPayable) {
        loan.status = 'closed';
        // Double user limit on completion: 10k -> 20k -> 40k -> 50k max!
        const newLimit = Math.min((updatedUser.loanLimit || 10000) * 2, 50000);
        await User.findByIdAndUpdate(req.user._id, { $set: { loanLimit: newLimit } }, { session });
      }

      await loan.save({ session });
      resultLoan = loan;
    });

    res.json({ message: 'Easy Installment paid successfully!', loan: resultLoan, newBalance });
  } catch (err) {
    res.status(err.status || 500).json({ message: err.message || 'Payment failed' });
  } finally {
    session.endSession();
  }
});

// Legacy Pay EMI alias (calls pay-installment)
router.post('/:id/pay-emi', protect, async (req, res) => {
  req.url = `/${req.params.id}/pay-installment`;
  return router.handle(req, res);
});

// Admin: Approve loan + Disburse Net Amount
router.post('/:id/approve', protect, admin, async (req, res) => {
  if (!mongoose.Types.ObjectId.isValid(req.params.id))
    return res.status(400).json({ message: 'Invalid loan ID' });

  const session = await mongoose.startSession();
  try {
    let resultLoan, commission = 0;

    await session.withTransaction(async () => {
      const loan = await Loan.findById(req.params.id).session(session);
      if (!loan) throw Object.assign(new Error('Loan not found'), { status: 404 });
      if (loan.status !== 'pending') throw Object.assign(new Error('Loan already processed'), { status: 400 });

      const user = await User.findById(loan.userId).session(session);
      if (!user) throw Object.assign(new Error('Borrower not found'), { status: 404 });

      // Disburse NET amount (after 5% proc fee, 1% UPI, and 1st advance installment deduction)
      const payout = loan.disbursalAmount || loan.amount;
      user.balance = (user.balance || 0) + payout;
      user.loansCount = (user.loansCount || 0) + 1;

      // Mark advance installment as paid
      if (loan.installmentSchedule && loan.installmentSchedule.length > 0) {
        loan.installmentSchedule[0].status = 'paid';
        loan.installmentSchedule[0].paidOn = new Date();
      }
      if (loan.emiSchedule && loan.emiSchedule.length > 0) {
        loan.emiSchedule[0].status = 'paid';
        loan.emiSchedule[0].paidOn = new Date();
      }

      const advanceAmt = loan.advanceDeduction || loan.installmentAmount || 0;
      loan.paidAmount = advanceAmt;
      loan.remainingAmount = Math.max(0, loan.totalPayable - advanceAmt);

      // Add remaining dues to user's dues wallet
      user.duesBalance = (user.duesBalance || 0) + loan.remainingAmount;

      await user.save({ session });
      loan.status = 'active';

      // Referral commission
      if (user.referredBy && !loan.referralCommissionPaid) {
        const commissionRate = await getReferralCommissionRate();
        const commissionAmount = Math.round((loan.amount * commissionRate) / 100);
        const referrer = await User.findOneAndUpdate(
          { _id: user.referredBy },
          { $inc: { balance: commissionAmount, referralEarnings: commissionAmount, profitBalance: commissionAmount } },
          { session, new: true }
        );
        if (referrer) {
          loan.referralCommissionPaid = true;
          loan.referralCommissionAmount = commissionAmount;
          commission = commissionAmount;
        }
      }

      await loan.save({ session });
      resultLoan = loan;
    });

    res.json({
      message: `Loan approved! Net amount ₹${resultLoan.disbursalAmount || resultLoan.amount} disbursed to user wallet.`,
      loan: resultLoan,
      referralCommission: commission
    });
  } catch (err) {
    res.status(err.status || 500).json({ message: err.message || 'Something went wrong.' });
  } finally {
    session.endSession();
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
