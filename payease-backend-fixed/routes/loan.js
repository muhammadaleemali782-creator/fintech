const express = require('express');
const mongoose = require('mongoose');
const Loan = require('../models/Loan');
const User = require('../models/User');
const Transaction = require('../models/Transaction');
const Settings = require('../models/Settings');
const { protect, admin } = require('../middleware/auth');
const { isValidAmount } = require('../utils/validateAmount');
const router = express.Router();

// Helper to generate sequential account number like EFSPL0001 or EFSMB0001
const generateLoanAccountNumber = async (type = 'personal') => {
  const prefix = type === 'micro_business' ? 'EFSMB' : type === 'student' ? 'EFSSL' : 'EFSPL';
  const count = await Loan.countDocuments({ loanType: type });
  const num = (count + 1).toString().padStart(4, '0');
  return `${prefix}${num}`;
};

// Collection dates on 1st, 11th, and 21st of months (10-day cycle)
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

// Daily collection dates for Micro Business Loans
const getDailyCollectionDates = (startDate, days) => {
  const dates = [];
  let current = new Date(startDate);
  for (let i = 0; i < days; i++) {
    current.setDate(current.getDate() + 1);
    dates.push(new Date(current));
  }
  return dates;
};

// 1. Personal Loan Quote (₹5k - ₹50k, 10-day cycle, 1.34% per installment, min 15 installments)
const calculatePersonalLoanQuote = (amount, installmentsCount = 15) => {
  const amt = Math.min(Math.max(Number(amount) || 5000, 5000), 50000);
  const count = Math.min(Math.max(Number(installmentsCount) || 15, 15), 30);
  const ratePerInstallment = 1.34; // 1.34% per 10-day installment

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
    loanType: 'personal',
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

// 2. Micro Business Loan Quote (Daily collection: 60d @ 18%, 80d @ 24%, 100d @ 30%, 120d @ 36%)
const calculateMicroBusinessQuote = (amount, days = 60) => {
  const amt = Math.min(Math.max(Number(amount) || 5000, 5000), 50000);
  const validDays = [60, 80, 100, 120];
  const numDays = validDays.includes(Number(days)) ? Number(days) : 60;

  const rateMap = { 60: 18, 80: 24, 100: 30, 120: 36 };
  const totalInterestRate = rateMap[numDays];
  const totalInterest = Math.round((amt * totalInterestRate) / 100);
  const totalPayable = amt + totalInterest;
  const dailyInstallment = Math.round(totalPayable / numDays);

  return {
    loanType: 'micro_business',
    amount: amt,
    dailyTenureDays: numDays,
    collectionFrequency: 'daily',
    interestRate: totalInterestRate,
    totalInterest,
    totalPayable,
    dailyInstallment,
    disbursalAmount: amt // 100% disbursed for micro business capital
  };
};

// Public/Live Calculator Quote
router.post('/calculate', (req, res) => {
  const { loanType = 'personal', amount, installmentsCount, days } = req.body;

  if (loanType === 'micro_business') {
    const quote = calculateMicroBusinessQuote(amount, days);
    const dates = getDailyCollectionDates(new Date(), Math.min(quote.dailyTenureDays, 10)); // preview first 10 days
    const schedule = dates.map((dueDate, idx) => ({
      installmentNo: idx + 1,
      dueDate,
      amount: quote.dailyInstallment,
      status: 'pending'
    }));
    return res.json({ ...quote, schedule });
  }

  // Personal Loan default
  const quote = calculatePersonalLoanQuote(amount, installmentsCount);
  const dates = getCollectionDates(new Date(), quote.installmentsCount);
  const schedule = dates.map((dueDate, idx) => ({
    installmentNo: idx + 1,
    dueDate,
    amount: quote.installmentAmount,
    status: idx === 0 ? 'advance_deducted' : 'pending'
  }));

  res.json({ ...quote, schedule });
});

// Apply Loan Endpoint (Supports Personal Loan & Micro Business Loan)
router.post('/apply', protect, async (req, res) => {
  try {
    const {
      loanType = 'personal',
      amount,
      installmentsCount = 15,
      days = 60,
      hasChequeFacility = false,
      chequeNumber,
      purpose,
      documents
    } = req.body;

    const userDoc = await User.findById(req.user._id);
    if (!userDoc) return res.status(404).json({ message: 'User not found' });

    // 1. One Active Loan Rule
    const existingActive = await Loan.findOne({
      userId: req.user._id,
      status: { $in: ['pending', 'approved', 'active'] }
    });
    if (existingActive) {
      return res.status(400).json({
        message: 'Aapka pehle se ek loan active/pending hai. Ek samay me sirf ek loan le sakte hain.'
      });
    }

    const numAmount = Number(amount);
    if (!numAmount || numAmount < 5000 || numAmount > 50000) {
      return res.status(400).json({
        message: 'Loan amount ₹5,000 se ₹50,000 ke beech hona chahiye.'
      });
    }

    if (loanType === 'micro_business') {
      // Micro Business Loan (Daily Collection)
      const validDays = [60, 80, 100, 120];
      const numDays = Number(days);
      if (!validDays.includes(numDays)) {
        return res.status(400).json({ message: 'Valid tenure select karein: 60, 80, 100, ya 120 din.' });
      }

      const quote = calculateMicroBusinessQuote(numAmount, numDays);
      const accountNumber = await generateLoanAccountNumber('micro_business');
      const collectionDates = getDailyCollectionDates(new Date(), numDays);
      const schedule = collectionDates.map((dueDate, idx) => ({
        installmentNo: idx + 1,
        dueDate,
        amount: quote.dailyInstallment,
        status: 'pending'
      }));

      const loan = await Loan.create({
        userId: req.user._id,
        accountNumber,
        loanType: 'micro_business',
        collectionFrequency: 'daily',
        dailyTenureDays: numDays,
        amount: quote.amount,
        interestRate: quote.interestRate,
        installmentsCount: numDays,
        tenure: numDays,
        installmentAmount: quote.dailyInstallment,
        emiAmount: quote.dailyInstallment,
        processingFee: 0,
        upiCharges: 0,
        advanceDeduction: 0,
        disbursalAmount: quote.disbursalAmount,
        totalPayable: quote.totalPayable,
        remainingAmount: quote.totalPayable,
        installmentSchedule: schedule,
        emiSchedule: schedule,
        documents: documents || {},
        purpose: purpose || 'Micro Business Working Capital'
      });

      return res.json({
        message: `Micro Business Loan (${numDays} Days @ ${quote.interestRate}%) application submitted!`,
        loan
      });
    }

    // Personal Loan Engine
    const isFirstTimeBorrower = (userDoc.loansCount || 0) === 0;
    if (isFirstTimeBorrower) {
      if (!hasChequeFacility && numAmount > 5000) {
        return res.status(400).json({
          message: 'Pehli baar bina cheque facility ke maximum loan limit ₹5,000 hai. ₹10,000 ke liye cheque facility choose karein.'
        });
      }
      if (hasChequeFacility && numAmount > 10000) {
        return res.status(400).json({
          message: 'Pehli baar cheque facility ke sath maximum loan limit ₹10,000 hai.'
        });
      }
    } else {
      const currentLimit = userDoc.loanLimit || 10000;
      if (numAmount > currentLimit) {
        return res.status(400).json({
          message: `Aapki vartamaan eligible loan limit ₹${currentLimit.toLocaleString('en-IN')} hai.`
        });
      }
    }

    const count = Number(installmentsCount);
    if (!count || count < 15 || count > 30) {
      return res.status(400).json({ message: 'Easy Installments minimum 15 aur maximum 30 honi chahiye (10-din cycle).' });
    }

    const quote = calculatePersonalLoanQuote(numAmount, count);
    const accountNumber = await generateLoanAccountNumber('personal');
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
      collectionFrequency: '10_days',
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
      hasChequeFacility: !!hasChequeFacility,
      chequeNumber: chequeNumber || '',
      installmentSchedule: schedule,
      emiSchedule: schedule,
      documents: { ...(documents || {}), chequeNumber },
      purpose: purpose || 'Personal Loan'
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
      if (loan.status !== 'active') throw Object.assign(new Error('Loan is not active'), { status: 400 });

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
      if (loan.paidAmount >= loan.totalPayable || loan.remainingAmount === 0) {
        loan.status = 'closed';
        const newLimit = Math.min((updatedUser.loanLimit || 10000) * 2, 50000);
        await User.findByIdAndUpdate(req.user._id, { $set: { loanLimit: newLimit } }, { session });
      }

      await loan.save({ session });

      await Transaction.create([{
        userId: req.user._id,
        type: 'loan_installment',
        amount: installmentAmt,
        method: 'wallet',
        status: 'completed',
        referenceId: loan._id.toString(),
        remarks: `Easy Installment paid for ${loan.accountNumber || 'Loan'}`
      }], { session });

      resultLoan = loan;
    });

    res.json({ message: 'Easy Installment paid successfully!', loan: resultLoan, newBalance });
  } catch (err) {
    res.status(err.status || 500).json({ message: err.message || 'Payment failed' });
  } finally {
    session.endSession();
  }
});

// Early Loan Closure Endpoint
// User can settle full loan in one click.
// If closed before 9th installment (< 9 paid installments), agent receives 1:1 profit bonus!
router.post('/:id/close-early', protect, async (req, res) => {
  if (!mongoose.Types.ObjectId.isValid(req.params.id))
    return res.status(400).json({ message: 'Invalid loan ID' });

  const session = await mongoose.startSession();
  try {
    let resultLoan, agentBonus = 0;

    await session.withTransaction(async () => {
      const loan = await Loan.findById(req.params.id).session(session);
      if (!loan) throw Object.assign(new Error('Loan not found'), { status: 404 });
      if (loan.userId.toString() !== req.user._id.toString()) throw Object.assign(new Error('Unauthorized'), { status: 403 });
      if (loan.status !== 'active') throw Object.assign(new Error('Loan is not active'), { status: 400 });

      const payoffAmount = loan.remainingAmount || (loan.totalPayable - (loan.paidAmount || 0));
      if (payoffAmount <= 0) throw Object.assign(new Error('Loan has no outstanding balance'), { status: 400 });

      // Atomic balance deduction
      const updatedUser = await User.findOneAndUpdate(
        { _id: req.user._id, balance: { $gte: payoffAmount } },
        {
          $inc: {
            balance: -payoffAmount,
            duesBalance: -payoffAmount
          }
        },
        { new: true, session }
      );
      if (!updatedUser) throw Object.assign(new Error(`Insufficient balance. Payoff requires ₹${payoffAmount.toLocaleString('en-IN')}`), { status: 400 });

      // Count installments paid before closure
      const paidInstallmentsCount = loan.installmentSchedule.filter(s => s.status === 'paid').length;

      // Mark all schedule entries as paid
      loan.installmentSchedule.forEach(s => {
        if (s.status === 'pending') {
          s.status = 'paid';
          s.paidOn = new Date();
        }
      });
      loan.emiSchedule.forEach(s => {
        if (s.status === 'pending') {
          s.status = 'paid';
          s.paidOn = new Date();
        }
      });

      loan.paidAmount = loan.totalPayable;
      loan.remainingAmount = 0;
      loan.status = 'closed';
      loan.earlyClosed = true;
      loan.earlyClosedAt = new Date();

      // Agent 1:1 profit bonus if closed before 9th installment
      if (paidInstallmentsCount < 9 && updatedUser.referredBy) {
        // Agent 1:1 bonus equivalent to 1 full installment amount
        agentBonus = loan.installmentAmount || Math.round(loan.amount * 0.05);
        await User.findByIdAndUpdate(
          updatedUser.referredBy,
          {
            $inc: {
              balance: agentBonus,
              profitBalance: agentBonus,
              referralEarnings: agentBonus
            }
          },
          { session }
        );
        loan.agentProfitPaid = true;
        loan.agentProfitAmount = agentBonus;

        await Transaction.create([{
          userId: updatedUser.referredBy,
          type: 'bond_payout',
          amount: agentBonus,
          method: 'wallet',
          status: 'completed',
          referenceId: loan._id.toString(),
          remarks: `Agent 1:1 Early Closure Profit for loan ${loan.accountNumber} (Closed before 9th installment)`
        }], { session });
      }

      // Upgrade user loan limit (doubles up to 50k)
      const newLimit = Math.min((updatedUser.loanLimit || 10000) * 2, 50000);
      await User.findByIdAndUpdate(req.user._id, { $set: { loanLimit: newLimit } }, { session });

      await loan.save({ session });

      await Transaction.create([{
        userId: req.user._id,
        type: 'loan_early_closure',
        amount: payoffAmount,
        method: 'wallet',
        status: 'completed',
        referenceId: loan._id.toString(),
        remarks: `Full Early Closure & Payoff for loan ${loan.accountNumber || 'Loan'}`
      }], { session });

      resultLoan = loan;
    });

    res.json({
      message: 'Loan successfully closed in full! Limit upgraded.',
      loan: resultLoan,
      agentBonus
    });
  } catch (err) {
    res.status(err.status || 500).json({ message: err.message || 'Early closure failed' });
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
    let resultLoan;

    await session.withTransaction(async () => {
      const loan = await Loan.findById(req.params.id).session(session);
      if (!loan) throw Object.assign(new Error('Loan not found'), { status: 404 });
      if (loan.status !== 'pending') throw Object.assign(new Error('Loan already processed'), { status: 400 });

      const user = await User.findById(loan.userId).session(session);
      if (!user) throw Object.assign(new Error('Borrower not found'), { status: 404 });

      // Disburse NET amount
      const payout = loan.disbursalAmount || loan.amount;
      user.balance = (user.balance || 0) + payout;
      user.loansCount = (user.loansCount || 0) + 1;

      // Mark advance installment as paid (for personal loans)
      if (loan.loanType === 'personal' && loan.advanceDeduction > 0) {
        if (loan.installmentSchedule && loan.installmentSchedule.length > 0) {
          loan.installmentSchedule[0].status = 'paid';
          loan.installmentSchedule[0].paidOn = new Date();
        }
        if (loan.emiSchedule && loan.emiSchedule.length > 0) {
          loan.emiSchedule[0].status = 'paid';
          loan.emiSchedule[0].paidOn = new Date();
        }
        loan.paidAmount = loan.advanceDeduction;
        loan.remainingAmount = Math.max(0, loan.totalPayable - loan.advanceDeduction);
      } else {
        loan.paidAmount = 0;
        loan.remainingAmount = loan.totalPayable;
      }

      user.duesBalance = (user.duesBalance || 0) + loan.remainingAmount;

      await user.save({ session });
      loan.status = 'active';

      await loan.save({ session });

      await Transaction.create([{
        userId: user._id,
        type: 'loan_disbursal',
        amount: payout,
        method: 'wallet',
        status: 'completed',
        referenceId: loan._id.toString(),
        remarks: `Disbursal for ${loan.accountNumber || 'Loan'} (Net ₹${payout})`
      }], { session });

      resultLoan = loan;
    });

    res.json({
      message: `Loan approved! Net amount ₹${resultLoan.disbursalAmount || resultLoan.amount} disbursed to user wallet.`,
      loan: resultLoan
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

// Current Rate
router.get('/current-rate', async (req, res) => {
  try {
    const setting = await Settings.findOne({ key: 'loanInterestRate' });
    res.json({ interestRate: setting ? setting.value : 1.34 });
  } catch {
    res.json({ interestRate: 1.34 });
  }
});

// Admin: Reject loan
router.post('/:id/reject', protect, admin, async (req, res) => {
  try {
    if (!mongoose.Types.ObjectId.isValid(req.params.id))
      return res.status(400).json({ message: 'Invalid loan ID' });

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
      .populate('userId', 'name email phone referralCode')
      .sort({ createdAt: -1 });
    res.json(loans);
  } catch (err) {
    res.status(500).json({ message: 'Something went wrong. Please try again.' });
  }
});

module.exports = router;
