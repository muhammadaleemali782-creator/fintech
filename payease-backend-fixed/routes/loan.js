const express = require('express');
const mongoose = require('mongoose');
const Loan = require('../models/Loan');
const User = require('../models/User');
const Transaction = require('../models/Transaction');
const Settings = require('../models/Settings');
const { protect, admin } = require('../middleware/auth');
const { isValidAmount } = require('../utils/validateAmount');
const { generateAccountNumber } = require('../utils/accountNumber');
const router = express.Router();

// Helper to generate sequential account number in strict EFS0000XXX format (e.g. EFS0000001)
const generateLoanAccountNumber = () => generateAccountNumber(Loan);

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
  const advanceDeduction = 0; // Optional - decided by Admin upon approval
  const totalDeductions = processingFee + upiCharges;
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

// 3. Student Loan Quote (Subsidized: 8% p.a., 10-day cycle)
const calculateStudentLoanQuote = (amount, installmentsCount = 15) => {
  const amt = Math.min(Math.max(Number(amount) || 5000, 5000), 50000);
  const count = Math.min(Math.max(Number(installmentsCount) || 15, 15), 30);
  const ratePerInstallment = 0.67; // Subsidized student rate (~8% p.a.)

  const principalPerInstallment = amt / count;
  const interestPerInstallment = (amt * ratePerInstallment) / 100;
  const installmentAmount = Math.round(principalPerInstallment + interestPerInstallment);
  const totalPayable = installmentAmount * count;

  const processingFee = Math.round((amt * 2) / 100); // Subsidized 2%
  const upiCharges = Math.round((amt * 1) / 100); // 1%
  const totalDeductions = processingFee + upiCharges;
  const disbursalAmount = Math.max(0, amt - totalDeductions);

  return {
    loanType: 'student',
    amount: amt,
    installmentsCount: count,
    cycleDays: 10,
    interestRatePerInstallment: ratePerInstallment,
    installmentAmount,
    totalPayable,
    processingFee,
    upiCharges,
    advanceDeduction: 0,
    disbursalAmount
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

  if (loanType === 'student') {
    const quote = calculateStudentLoanQuote(amount, installmentsCount);
    const dates = getCollectionDates(new Date(), quote.installmentsCount);
    const schedule = dates.map((dueDate, idx) => ({
      installmentNo: idx + 1,
      dueDate,
      amount: quote.installmentAmount,
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
    status: 'pending'
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

    if (userDoc.kycStatus !== 'verified') {
      return res.status(403).json({
        message: 'Loan lene ke liye KYC verification zaroori hai. Kripya pehle KYC documents submit aur verify karwayein.',
        requireKyc: true
      });
    }

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

    // First-Time vs Repeat Borrower Rule: Applies to ALL loan types!
    const isFirstTimeBorrower = (userDoc.loansCount || 0) === 0;
    if (isFirstTimeBorrower) {
      if (numAmount > 5000) {
        return res.status(400).json({
          message: 'Pehli baar kisi bhi loan (Personal, Micro Business, ya Student Loan) ke liye maximum eligible limit ₹5,000 hai. Purana loan clear karne par limit double ho jayegi.'
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

    // ─────────────────────────────────────────────────────────────
    // STRICT MANDATORY REQUIREMENTS FOR ALL LOANS
    // Aadhaar (Front/Back), PAN (Front/Back), Barrier Cheque (Front/Back),
    // Bank Details, UPI ID, Nominee Details, Email & Phone
    // ─────────────────────────────────────────────────────────────
    const docs = documents || {};
    const aadharNumber = (docs.aadharNumber || userDoc.aadharNumber || '').toString().trim();
    const aadharFront = docs.aadharUrl || docs.doc1Url || userDoc.kycDocuments?.doc1Url;
    const aadharBack = docs.aadharBackUrl || docs.doc1BackUrl || userDoc.kycDocuments?.doc1BackUrl;

    const panNumber = (docs.panNumber || userDoc.kycDocuments?.panNumber || '').toString().trim().toUpperCase();
    const panFront = docs.panUrl || docs.doc2Url || userDoc.kycDocuments?.doc2Url;
    const panBack = docs.panBackUrl || docs.doc2BackUrl || userDoc.kycDocuments?.doc2BackUrl;

    const chequeNum = (docs.chequeNumber || chequeNumber || '').toString().trim();
    const chequeFront = docs.chequeUrl || docs.chequeFrontUrl;
    const chequeBack = docs.chequeBackUrl;

    const bankName = (docs.bankName || '').toString().trim();
    const bankAccount = (docs.bankAccountNumber || '').toString().trim();
    const bankIfsc = (docs.bankIfsc || '').toString().trim().toUpperCase();

    const upiId = (docs.upiId || '').toString().trim();

    const nomineeName = (docs.nomineeName || '').toString().trim();
    const nomineeRelation = (docs.nomineeRelation || '').toString().trim();
    const nomineePhone = (docs.nomineePhone || '').toString().trim();

    const applicantEmail = (docs.applicantEmail || docs.email || userDoc.email || '').toString().trim();
    const applicantPhone = (docs.applicantPhone || docs.phone || userDoc.phone || '').toString().trim();

    // 1. AADHAAR VALIDATION (Compulsory)
    if (!aadharNumber || aadharNumber.replace(/\D/g, '').length !== 12) {
      return res.status(400).json({ message: '12-digit Aadhaar Card number darj karna anivarya (mandatory) hai.' });
    }
    if (!aadharFront) {
      return res.status(400).json({ message: 'Aadhaar Card Front photo upload/capture karna anivarya (mandatory) hai.' });
    }
    if (!aadharBack) {
      return res.status(400).json({ message: 'Aadhaar Card Back photo upload/capture karna anivarya (mandatory) hai.' });
    }

    // 2. PAN VALIDATION (Compulsory)
    if (!panNumber || panNumber.length !== 10) {
      return res.status(400).json({ message: 'Valid 10-character PAN Card number darj karna anivarya (mandatory) hai.' });
    }
    if (!panFront) {
      return res.status(400).json({ message: 'PAN Card Front photo upload/capture karna anivarya (mandatory) hai.' });
    }
    if (!panBack) {
      return res.status(400).json({ message: 'PAN Card Back photo upload/capture karna anivarya (mandatory) hai.' });
    }

    // 3. BARRIER CHEQUE VALIDATION (Compulsory)
    if (!chequeNum) {
      return res.status(400).json({ message: 'Barrier Cheque number darj karna anivarya (mandatory) hai.' });
    }
    if (!chequeFront) {
      return res.status(400).json({ message: 'Barrier Cheque Front photo upload/capture karna anivarya (mandatory) hai.' });
    }
    if (!chequeBack) {
      return res.status(400).json({ message: 'Barrier Cheque Back photo upload/capture karna anivarya (mandatory) hai.' });
    }

    // 4. BANKING DETAILS VALIDATION (Compulsory)
    if (!bankName) {
      return res.status(400).json({ message: 'Bank ka naam (Bank Name) darj karna anivarya (mandatory) hai.' });
    }
    if (!bankAccount || bankAccount.length < 8) {
      return res.status(400).json({ message: 'Valid Bank Account Number darj karna anivarya (mandatory) hai.' });
    }
    if (!bankIfsc || bankIfsc.length < 9) {
      return res.status(400).json({ message: 'Valid Bank IFSC Code darj karna anivarya (mandatory) hai.' });
    }

    // 5. UPI DETAILS VALIDATION (Compulsory)
    if (!upiId || !upiId.includes('@')) {
      return res.status(400).json({ message: 'Valid UPI ID (jaise mobile@upi ya name@bank) darj karna anivarya (mandatory) hai.' });
    }

    // 6. NOMINEE DETAILS VALIDATION (Compulsory)
    if (!nomineeName) {
      return res.status(400).json({ message: 'Nominee ka pura naam darj karna anivarya (mandatory) hai.' });
    }
    if (!nomineeRelation) {
      return res.status(400).json({ message: 'Nominee ke sath rishta (Relation) chunna anivarya (mandatory) hai.' });
    }
    if (!nomineePhone || nomineePhone.replace(/\D/g, '').length < 10) {
      return res.status(400).json({ message: 'Nominee ka 10-digit mobile number darj karna anivarya (mandatory) hai.' });
    }

    // 7. APPLICANT CONTACT VALIDATION (Compulsory)
    if (!applicantEmail || !applicantEmail.includes('@')) {
      return res.status(400).json({ message: 'Valid E-mail address darj karna anivarya (mandatory) hai.' });
    }
    if (!applicantPhone || applicantPhone.replace(/\D/g, '').length < 10) {
      return res.status(400).json({ message: 'Valid phone number darj karna anivarya (mandatory) hai.' });
    }

    // Consolidated documents payload
    const loanDocumentsPayload = {
      aadharNumber,
      aadharUrl: aadharFront,
      aadharBackUrl: aadharBack,
      doc1Url: aadharFront,
      doc1BackUrl: aadharBack,
      panNumber,
      panUrl: panFront,
      panBackUrl: panBack,
      doc2Url: panFront,
      doc2BackUrl: panBack,
      chequeNumber: chequeNum,
      chequeUrl: chequeFront,
      chequeBackUrl: chequeBack,
      bankName,
      bankAccountNumber: bankAccount,
      bankIfsc,
      upiId,
      nomineeName,
      nomineeRelation,
      nomineePhone,
      applicantEmail,
      applicantPhone,
      businessName: docs.businessName || '',
      studentProofUrl: docs.studentProofUrl || '',
      studentProofBackUrl: docs.studentProofBackUrl || ''
    };

    const nomineePayload = {
      name: nomineeName,
      relation: nomineeRelation,
      phone: nomineePhone
    };

    // Save/Sync documents to borrower profile KYC record
    if (!userDoc.kycDocuments) userDoc.kycDocuments = {};
    userDoc.aadharNumber = aadharNumber;
    userDoc.kycDocuments.aadharNumber = aadharNumber;
    userDoc.kycDocuments.doc1Url = aadharFront;
    userDoc.kycDocuments.doc1BackUrl = aadharBack;
    userDoc.kycDocuments.panNumber = panNumber;
    userDoc.kycDocuments.doc2Url = panFront;
    userDoc.kycDocuments.doc2BackUrl = panBack;
    userDoc.kycDocuments.chequeNumber = chequeNum;
    await userDoc.save();

    let createdLoan = null;

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

      createdLoan = await Loan.create({
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
        hasChequeFacility: true,
        chequeNumber: chequeNum,
        nominee: nomineePayload,
        documents: loanDocumentsPayload,
        installmentSchedule: schedule,
        emiSchedule: schedule,
        purpose: purpose || 'Micro Business Working Capital'
      });
    } else if (loanType === 'student') {
      // Student Loan (Subsidized: 8% p.a., 10-day cycles)
      const count = Number(installmentsCount) || 15;
      const quote = calculateStudentLoanQuote(numAmount, count);
      const accountNumber = await generateLoanAccountNumber('student');
      const collectionDates = getCollectionDates(new Date(), count);
      const schedule = collectionDates.map((dueDate, idx) => ({
        installmentNo: idx + 1,
        month: idx + 1,
        dueDate,
        amount: quote.installmentAmount,
        status: 'pending'
      }));

      createdLoan = await Loan.create({
        userId: req.user._id,
        accountNumber,
        loanType: 'student',
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
        advanceDeduction: 0,
        disbursalAmount: quote.disbursalAmount,
        totalPayable: quote.totalPayable,
        remainingAmount: quote.totalPayable,
        hasChequeFacility: true,
        chequeNumber: chequeNum,
        nominee: nomineePayload,
        documents: loanDocumentsPayload,
        installmentSchedule: schedule,
        emiSchedule: schedule,
        purpose: purpose || 'Student Fee / College Loan'
      });
    } else {
      // Personal Loan Engine
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

      createdLoan = await Loan.create({
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
        hasChequeFacility: true,
        chequeNumber: chequeNum,
        nominee: nomineePayload,
        documents: loanDocumentsPayload,
        installmentSchedule: schedule,
        emiSchedule: schedule,
        purpose: purpose || 'Personal Loan'
      });
    }

    // ─────────────────────────────────────────────────────────────
    // BACKGROUND GOOGLE DRIVE SYNC (Saves complete loan bundle to Drive)
    // ─────────────────────────────────────────────────────────────
    try {
      const adminDriveSetting = await Settings.findOne({ key: 'googleDriveUrl' });
      const adminDriveUrl = adminDriveSetting?.value;
      if (adminDriveUrl && adminDriveUrl.startsWith('https://script.google.com/')) {
        fetch(adminDriveUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            action: 'upload_loan_application',
            loanAccount: createdLoan.accountNumber,
            loanType: createdLoan.loanType,
            userId: userDoc._id.toString(),
            userName: userDoc.name,
            email: applicantEmail,
            phone: applicantPhone,
            amount: createdLoan.amount,
            aadharNumber,
            doc1Url: aadharFront,
            doc1BackUrl: aadharBack,
            panNumber,
            doc2Url: panFront,
            doc2BackUrl: panBack,
            chequeNumber: chequeNum,
            chequeUrl: chequeFront,
            chequeBackUrl: chequeBack,
            bankName,
            bankAccountNumber: bankAccount,
            bankIfsc,
            upiId,
            nomineeName,
            nomineeRelation,
            nomineePhone,
            submittedAt: new Date().toISOString()
          })
        })
        .then(res => res.json())
        .then(async (driveData) => {
          if (driveData && (driveData.fileUrl || driveData.folderUrl)) {
            const directLink = driveData.fileUrl || driveData.folderUrl;
            await Loan.findByIdAndUpdate(createdLoan._id, {
              'documents.googleDriveLink': directLink
            });
          }
        })
        .catch(e => console.warn('Drive loan webhook sync warning:', e.message));
      }
    } catch (driveErr) {
      console.warn('Drive sync initiation failed:', driveErr.message);
    }

    res.json({
      message: `${createdLoan.loanType === 'micro_business' ? 'Micro Business' : createdLoan.loanType === 'student' ? 'Student' : 'Personal'} Loan application submitted successfully! Sabhi documents aur details verify hone ke baad sanction hogi.`,
      loan: createdLoan
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

      // 1st Installment option: Optional - controlled by Admin on approval!
      // advanceOption: 'none' (Default - regular schedule, no advance deduction)
      //               'deduct' (Deduct 1st installment upfront from payout & mark paid)
      //               'waive'  (Waive/free 1st installment & disburse standard payout)
      const { advanceOption = 'none' } = req.body;
      const installmentAmt = loan.installmentAmount || loan.emiAmount || 0;
      const baseDisbursal = Math.max(0, loan.amount - (loan.processingFee || 0) - (loan.upiCharges || 0));

      let payout = baseDisbursal;

      if (advanceOption === 'deduct') {
        payout = Math.max(0, baseDisbursal - installmentAmt);
        if (loan.installmentSchedule && loan.installmentSchedule.length > 0) {
          loan.installmentSchedule[0].status = 'paid';
          loan.installmentSchedule[0].paidOn = new Date();
          loan.installmentSchedule[0].adminEvidenceNote = 'Advance deducted on disbursal';
        }
        if (loan.emiSchedule && loan.emiSchedule.length > 0) {
          loan.emiSchedule[0].status = 'paid';
          loan.emiSchedule[0].paidOn = new Date();
          loan.emiSchedule[0].adminEvidenceNote = 'Advance deducted on disbursal';
        }
        loan.advanceDeduction = installmentAmt;
        loan.paidAmount = installmentAmt;
        loan.remainingAmount = Math.max(0, loan.totalPayable - installmentAmt);
      } else if (advanceOption === 'waive') {
        payout = baseDisbursal;
        if (loan.installmentSchedule && loan.installmentSchedule.length > 0) {
          loan.installmentSchedule[0].status = 'paid';
          loan.installmentSchedule[0].paidOn = new Date();
          loan.installmentSchedule[0].adminEvidenceNote = 'Waived by Admin';
        }
        if (loan.emiSchedule && loan.emiSchedule.length > 0) {
          loan.emiSchedule[0].status = 'paid';
          loan.emiSchedule[0].paidOn = new Date();
          loan.emiSchedule[0].adminEvidenceNote = 'Waived by Admin';
        }
        loan.advanceDeduction = 0;
        loan.paidAmount = installmentAmt;
        loan.remainingAmount = Math.max(0, loan.totalPayable - installmentAmt);
      } else {
        // 'none' (Default) - No advance deduction, regular schedule starting at installment 1
        payout = baseDisbursal;
        loan.advanceDeduction = 0;
        loan.paidAmount = 0;
        loan.remainingAmount = loan.totalPayable;
      }

      loan.disbursalAmount = payout;
      // Loan disbursal money is credited directly to Profit Wallet as requested
      user.profitBalance = Number(((user.profitBalance || 0) + payout).toFixed(2));
      user.loansCount = (user.loansCount || 0) + 1;
      user.duesBalance = (user.duesBalance || 0) + loan.remainingAmount;

      await user.save({ session });
      loan.status = 'active';

      await loan.save({ session });

      await Transaction.create([{
        userId: user._id,
        type: 'loan_disbursal',
        amount: payout,
        method: 'profit_wallet',
        status: 'completed',
        referenceId: loan._id.toString(),
        remarks: `Disbursal for ${loan.accountNumber || 'Loan'} (Net ₹${payout}) credited to Profit Wallet`
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
    for (const l of loans) {
      if (!l.accountNumber || !l.accountNumber.startsWith('EFS0000')) {
        l.accountNumber = await generateLoanAccountNumber();
        await l.save();
      }
    }
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
    for (const l of loans) {
      if (!l.accountNumber || !l.accountNumber.startsWith('EFS0000')) {
        l.accountNumber = await generateLoanAccountNumber();
        await l.save();
      }
    }
    res.json(loans);
  } catch (err) {
    res.status(500).json({ message: 'Something went wrong. Please try again.' });
  }
});

// User submits installment payment proof (UTR + Screenshot)
router.post('/:id/submit-installment', protect, async (req, res) => {
  try {
    if (!mongoose.Types.ObjectId.isValid(req.params.id))
      return res.status(400).json({ message: 'Invalid loan ID' });

    const { utrNumber, proofUrl, proofBackUrl, installmentNo } = req.body;
    if (!utrNumber || String(utrNumber).trim().length < 6) {
      return res.status(400).json({ message: 'Valid UTR / Transaction Reference number zaroori hai (min 6 characters).' });
    }
    if (!proofUrl) {
      return res.status(400).json({ message: 'Payment screenshot / receipt upload zaroori hai.' });
    }

    const loan = await Loan.findOne({ _id: req.params.id, userId: req.user._id, status: 'active' });
    if (!loan) return res.status(404).json({ message: 'Active loan nahi mila' });

    const list = loan.installmentSchedule.length > 0 ? loan.installmentSchedule : loan.emiSchedule;
    let target = installmentNo
      ? list.find(x => x.installmentNo === Number(installmentNo) && x.status !== 'paid')
      : list.find(x => x.status === 'pending' || x.status === 'overdue');

    if (!target) return res.status(400).json({ message: 'Koi pending installment nahi mili jise pay kiya ja sake.' });

    target.status = 'submitted';
    target.utrNumber = String(utrNumber).trim();
    target.proofUrl = proofUrl;
    target.proofBackUrl = proofBackUrl || '';
    target.submittedAt = new Date();
    target.paymentMethod = 'upi_qr';

    loan.markModified('installmentSchedule');
    loan.markModified('emiSchedule');
    await loan.save();

    // Silently upload proof to User's Google Drive folder if configured
    try {
      const adminDriveSetting = await Settings.findOne({ key: 'googleDriveUrl' });
      if (adminDriveSetting && adminDriveSetting.value) {
        fetch(adminDriveSetting.value, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            action: 'loan_installment_proof',
            userId: req.user._id,
            userName: req.user.name,
            loanAccount: loan.accountNumber,
            installmentNo: target.installmentNo,
            amount: target.amount,
            utrNumber: target.utrNumber,
            proofUrl: proofUrl,
            submittedAt: new Date()
          })
        }).catch(() => {});
      }
    } catch (_) {}

    res.json({
      success: true,
      message: `Installment #${target.installmentNo} (₹${target.amount}) ka UTR verify ke liye submit ho gaya hai! Admin approval ke baad status update hoga.`,
      loan
    });
  } catch (err) {
    console.error('Submit installment error:', err);
    res.status(500).json({ message: 'Failed to submit installment proof' });
  }
});

// Admin approves user's submitted installment payment
router.post('/admin/:loanId/installment/:installmentNo/approve', protect, admin, async (req, res) => {
  const session = await mongoose.startSession();
  try {
    let updatedLoan;
    await session.withTransaction(async () => {
      const loan = await Loan.findById(req.params.loanId).session(session);
      if (!loan) throw Object.assign(new Error('Loan not found'), { status: 404 });

      const list = loan.installmentSchedule.length > 0 ? loan.installmentSchedule : loan.emiSchedule;
      const target = list.find(x => x.installmentNo === Number(req.params.installmentNo));
      if (!target) throw Object.assign(new Error('Installment not found'), { status: 404 });
      if (target.status === 'paid') throw Object.assign(new Error('Installment already marked as paid'), { status: 400 });

      target.status = 'paid';
      target.paidOn = new Date();
      target.approvedBy = req.user.email;

      loan.paidAmount = (loan.paidAmount || 0) + target.amount;
      loan.remainingAmount = Math.max(0, (loan.remainingAmount || loan.totalPayable) - target.amount);

      if (loan.remainingAmount <= 0 || loan.paidAmount >= loan.totalPayable) {
        loan.status = 'closed';
        const borrower = await User.findById(loan.userId).session(session);
        if (borrower) {
          borrower.loanLimit = Math.min((borrower.loanLimit || 5000) * 2, 50000);
          await borrower.save({ session });
        }
      }

      loan.markModified('installmentSchedule');
      loan.markModified('emiSchedule');
      await loan.save({ session });

      // Reduce user duesBalance
      await User.findByIdAndUpdate(
        loan.userId,
        { $inc: { duesBalance: -target.amount } },
        { session }
      );

      await Transaction.create([{
        userId: loan.userId,
        type: 'loan_installment',
        amount: target.amount,
        method: target.paymentMethod || 'upi_qr',
        status: 'completed',
        referenceId: `${loan._id}_inst_${target.installmentNo}`,
        remarks: `Installment #${target.installmentNo} approved by Admin (UTR: ${target.utrNumber || 'N/A'})`
      }], { session });

      updatedLoan = loan;
    });

    res.json({
      success: true,
      message: `Installment #${req.params.installmentNo} approve ho gayi aur loan balance update ho gaya!`,
      loan: updatedLoan
    });
  } catch (err) {
    res.status(err.status || 500).json({ message: err.message || 'Approval failed' });
  } finally {
    session.endSession();
  }
});

// Admin marks an installment as paid directly with evidence/note
router.post('/admin/:loanId/installment/:installmentNo/admin-pay', protect, admin, async (req, res) => {
  const session = await mongoose.startSession();
  try {
    const { evidenceNote, utrNumber, proofUrl } = req.body;
    let updatedLoan;
    await session.withTransaction(async () => {
      const loan = await Loan.findById(req.params.loanId).session(session);
      if (!loan) throw Object.assign(new Error('Loan not found'), { status: 404 });

      const list = loan.installmentSchedule.length > 0 ? loan.installmentSchedule : loan.emiSchedule;
      const target = list.find(x => x.installmentNo === Number(req.params.installmentNo));
      if (!target) throw Object.assign(new Error('Installment not found'), { status: 404 });
      if (target.status === 'paid') throw Object.assign(new Error('Installment already paid'), { status: 400 });

      target.status = 'paid';
      target.paidOn = new Date();
      target.paymentMethod = 'admin_override';
      target.adminEvidenceNote = evidenceNote || 'Paid via Admin offline verification';
      target.utrNumber = utrNumber || target.utrNumber || 'OFFLINE_VERIFIED';
      if (proofUrl) target.proofUrl = proofUrl;
      target.approvedBy = req.user.email;

      loan.paidAmount = (loan.paidAmount || 0) + target.amount;
      loan.remainingAmount = Math.max(0, (loan.remainingAmount || loan.totalPayable) - target.amount);

      if (loan.remainingAmount <= 0 || loan.paidAmount >= loan.totalPayable) {
        loan.status = 'closed';
        const borrower = await User.findById(loan.userId).session(session);
        if (borrower) {
          borrower.loanLimit = Math.min((borrower.loanLimit || 5000) * 2, 50000);
          await borrower.save({ session });
        }
      }

      loan.markModified('installmentSchedule');
      loan.markModified('emiSchedule');
      await loan.save({ session });

      await User.findByIdAndUpdate(
        loan.userId,
        { $inc: { duesBalance: -target.amount } },
        { session }
      );

      await Transaction.create([{
        userId: loan.userId,
        type: 'loan_installment',
        amount: target.amount,
        method: 'admin_override',
        status: 'completed',
        referenceId: `${loan._id}_admin_inst_${target.installmentNo}`,
        remarks: `Installment #${target.installmentNo} marked paid by Admin. Note: ${target.adminEvidenceNote}`
      }], { session });

      updatedLoan = loan;
    });

    res.json({
      success: true,
      message: `Installment #${req.params.installmentNo} successfully marked as PAID with evidence!`,
      loan: updatedLoan
    });
  } catch (err) {
    res.status(err.status || 500).json({ message: err.message || 'Payment failed' });
  } finally {
    session.endSession();
  }
});

// Get detailed active loan with 5-day upcoming due calculation & installment history
router.get('/active-details', protect, async (req, res) => {
  try {
    const loan = await Loan.findOne({ userId: req.user._id, status: 'active' }).sort({ createdAt: -1 });
    if (!loan) return res.json({ hasActiveLoan: false, duesBalance: req.user.duesBalance || 0 });

    const list = loan.installmentSchedule.length > 0 ? loan.installmentSchedule : loan.emiSchedule;
    const nextPending = list.find(x => x.status === 'pending' || x.status === 'submitted' || x.status === 'overdue');

    let isUpcomingSoon = false;
    let daysUntilDue = null;
    if (nextPending && nextPending.dueDate) {
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const due = new Date(nextPending.dueDate);
      due.setHours(0, 0, 0, 0);
      const diffTime = due.getTime() - today.getTime();
      daysUntilDue = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
      // Alert if due within 5 days or already overdue
      if (daysUntilDue <= 5) {
        isUpcomingSoon = true;
      }
    }

    res.json({
      hasActiveLoan: true,
      loan,
      nextInstallment: nextPending,
      isUpcomingSoon,
      daysUntilDue,
      installments: list,
      duesBalance: req.user.duesBalance || loan.remainingAmount || 0
    });
  } catch (err) {
    res.status(500).json({ message: 'Failed to fetch active loan details' });
  }
});

module.exports = router;
