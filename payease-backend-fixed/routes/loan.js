const express = require('express');
const mongoose = require('mongoose');
const Loan = require('../models/Loan');
const User = require('../models/User');
const Transaction = require('../models/Transaction');
const Settings = require('../models/Settings');
const { protect, admin } = require('../middleware/auth');
const { isValidAmount } = require('../utils/validateAmount');
const { generateAccountNumber } = require('../utils/accountNumber');
const { validateBase64Upload } = require('../utils/validateUpload');
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

// Sync Overdue Installments & 2% Per Installment Penalty
// Rules requested by client / admin:
// 1. Unpaid EMIs roll over to next EMI.
// 2. Penalty rate: 2% per installment ("Sir penalty lagegi 2% per installment").
// 3. Admin waiver: Admin can waive / hold penalty ("But ye admin chahe to chor sakta hai").
// 4. Cumulative on re-application / next cycle: If penalty was waived/stopped earlier on 1st installment and later applied on 2nd cycle (or admin toggles penalty on), previous overdue installments are included ("jaise 1st installment me penalty roka gya aur dusre baar laga to pehle ka bhi jod ke lagega").
// 5. Payment mandatory with penalty: Payment is always made with active penalty included ("And payment har baar penalty add karke hi hogi").
const syncLoanOverdueAndPenalties = (loan) => {
  if (!loan || loan.status !== 'active') return loan;

  const now = new Date();
  const schedule = loan.installmentSchedule && loan.installmentSchedule.length > 0 
    ? loan.installmentSchedule 
    : (loan.emiSchedule || []);
  let overdueCount = 0;

  schedule.forEach(item => {
    if ((item.status === 'pending' || item.status === 'overdue') && item.dueDate && new Date(item.dueDate) < now) {
      item.status = 'overdue';
      overdueCount++;
    }
  });

  loan.penaltyCount = overdueCount;
  const installmentAmt = loan.installmentAmount || loan.emiAmount || 0;

  if (overdueCount > 0 && !loan.penaltyWaived) {
    // 2% per overdue installment ("pehle ka bhi jod ke lagega")
    const penaltyPerInstallment = Math.round((installmentAmt * 2) / 100);
    loan.penaltyDue = overdueCount * penaltyPerInstallment;
    loan.lastPenaltyAppliedAt = now;
  } else {
    loan.penaltyDue = 0;
  }

  const unpaidItems = schedule.filter(item => item.status === 'pending' || item.status === 'overdue');
  const totalUnpaidEmi = unpaidItems.length * installmentAmt;
  loan.accumulatedDue = totalUnpaidEmi + (loan.penaltyDue || 0);

  return loan;
};

// 1. Personal Loan Quote (10-day cycle, custom rate supported or default 1.34% per installment, min 15 installments)
const calculatePersonalLoanQuote = (amount, installmentsCount = 15, customRate = null) => {
  const amt = Math.min(Math.max(Number(amount) || 5000, 5000), 50000);
  const count = Math.min(Math.max(Number(installmentsCount) || 15, 15), 24);
  
  // Rate: If admin specified any custom rate (e.g. 0%, 0.8%, 1.0%, 1.34%, 2.0%), respect it directly!
  let ratePerInstallment = 1.34;
  if (customRate !== null && customRate !== undefined && !isNaN(Number(customRate)) && Number(customRate) >= 0) {
    ratePerInstallment = Number(Number(customRate).toFixed(2));
  } else if (amt > 20000 && (customRate === 1 || customRate === 1.0 || customRate === '1' || customRate === '1.0' || customRate === '1%')) {
    ratePerInstallment = 1.0;
  }

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
    annualEquivalentRate: Number((ratePerInstallment * 36.5).toFixed(2)),
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
  const count = Math.min(Math.max(Number(installmentsCount) || 15, 15), 24);
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
  const quote = calculatePersonalLoanQuote(amount, installmentsCount, req.query.interestRate || req.query.rate || req.query.interestRateOption);
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
      interestRateOption,
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

    // Loan Limit Rules:
    // Business Loan: Up to ₹20,000 with cheque, up to ₹10,000 without cheque
    // Personal & Student Loans: First-time limit ₹5,000 (unless raised by Agent/Admin), repeat limit up to currentLimit (max ₹50,000)
    const isBusiness = loanType === 'micro_business';
    const hasCheque = Boolean(hasChequeFacility || (documents && (documents.chequeUrl || documents.chequeFrontUrl || documents.chequeNumber)));

    if (isBusiness) {
      const businessLimit = hasCheque ? 20000 : 10000;
      if (numAmount > businessLimit) {
        return res.status(400).json({
          message: hasCheque
            ? 'Business loan cheque ke sath maximum limit ₹20,000 hai.'
            : 'Business loan bina cheque ke maximum limit ₹10,000 hai. ₹20,000 limit ke liye cheque attach karein.'
        });
      }
    } else {
      const isFirstTimeBorrower = (userDoc.loansCount || 0) === 0;
      // If user has higher loanLimit configured by Agent or Admin, respect it! (Capped at ₹50,000)
      const currentLimit = Math.min(userDoc.loanLimit || (isFirstTimeBorrower ? 5000 : 10000), 50000);
      if (numAmount > currentLimit) {
        return res.status(400).json({
          message: `Aapki vartamaan eligible loan limit ₹${currentLimit.toLocaleString('en-IN')} hai. Limit badhane ke liye apne Agent ya Admin se sampark karein.`
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

    // Binary Magic-Byte & File Integrity Validation
    const docsToVerify = [
      { label: 'Aadhaar Front', data: aadharFront },
      { label: 'Aadhaar Back', data: aadharBack },
      { label: 'PAN Front', data: panFront },
      { label: 'PAN Back', data: panBack },
      { label: 'Cheque Front', data: chequeFront },
      { label: 'Cheque Back', data: chequeBack }
    ];
    for (const d of docsToVerify) {
      if (d.data) {
        const check = validateBase64Upload(d.data);
        if (!check.valid) {
          return res.status(400).json({ message: `${d.label} file invalid: ${check.error}` });
        }
      }
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
      if (!count || count < 15 || count > 24) {
        return res.status(400).json({ message: 'Easy Installments minimum 15 aur maximum 24 honi chahiye (10-din cycle).' });
      }

      const quote = calculatePersonalLoanQuote(numAmount, count, interestRateOption);
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

      syncLoanOverdueAndPenalties(loan);

      const schedule = loan.installmentSchedule && loan.installmentSchedule.length > 0 
        ? loan.installmentSchedule 
        : (loan.emiSchedule || []);
      const pending = schedule.find(x => x.status === 'overdue') || schedule.find(x => x.status === 'pending');
      if (!pending) throw Object.assign(new Error('No pending Easy Installment'), { status: 400 });

      const { sourceWallet = 'main' } = req.body;
      const isProfitSource = sourceWallet === 'profit';
      const installmentAmt = loan.installmentAmount || loan.emiAmount || 0;
      const penaltyAmt = loan.penaltyDue || 0;

      // Penalty paid first before EMI ("panely pehle bhari jayegi phir emi")
      const totalRequired = installmentAmt + penaltyAmt;

      const userQuery = isProfitSource
        ? { _id: req.user._id, profitBalance: { $gte: totalRequired } }
        : { _id: req.user._id, balance: { $gte: totalRequired } };

      const userUpdate = isProfitSource
        ? { $inc: { profitBalance: -totalRequired, duesBalance: -totalRequired } }
        : { $inc: { balance: -totalRequired, duesBalance: -totalRequired } };

      const updatedUser = await User.findOneAndUpdate(userQuery, userUpdate, { new: true, session });
      if (!updatedUser) {
        throw Object.assign(
          new Error(isProfitSource 
            ? `Insufficient profit wallet balance. Required: ₹${totalRequired}${penaltyAmt > 0 ? ` (EMI ₹${installmentAmt} + Penalty ₹${penaltyAmt})` : ''}` 
            : `Insufficient primary wallet balance. Required: ₹${totalRequired}${penaltyAmt > 0 ? ` (EMI ₹${installmentAmt} + Penalty ₹${penaltyAmt})` : ''}`),
          { status: 400 }
        );
      }
      newBalance = isProfitSource ? updatedUser.profitBalance : updatedUser.balance;

      // 1. Penalty cleared FIRST
      if (penaltyAmt > 0) {
        loan.penaltyPaid = (loan.penaltyPaid || 0) + penaltyAmt;
        loan.penaltyDue = 0;
        loan.penaltyCount = 0;
      }

      // 2. Installment marked paid
      pending.status = 'paid';
      pending.paidOn = new Date();
      pending.paymentMethod = isProfitSource ? 'profit_wallet' : 'primary_wallet';
      loan.paidAmount = (loan.paidAmount || 0) + installmentAmt;
      loan.remainingAmount = Math.max(0, (loan.remainingAmount || loan.totalPayable) - installmentAmt);

      syncLoanOverdueAndPenalties(loan);

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
        amount: totalRequired,
        method: isProfitSource ? 'profit_wallet' : 'wallet',
        status: 'completed',
        referenceId: loan._id.toString(),
        remarks: penaltyAmt > 0 
          ? `Installment paid (Penalty ₹${penaltyAmt} cleared + EMI ₹${installmentAmt}) for ${loan.accountNumber || 'Loan'}`
          : `Easy Installment paid for ${loan.accountNumber || 'Loan'}`
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

      const borrower = await User.findById(loan.userId).session(session);
      if (!borrower) throw Object.assign(new Error('Borrower not found'), { status: 404 });

      const isBorrower = loan.userId.toString() === req.user._id.toString();
      const isAgentOfBorrower = borrower.referredBy && borrower.referredBy.toString() === req.user._id.toString();
      const isAdmin = req.user.role === 'admin';
      if (!isBorrower && !isAgentOfBorrower && !isAdmin) {
        throw Object.assign(new Error('Unauthorized to close this loan'), { status: 403 });
      }

      if (loan.status !== 'active') throw Object.assign(new Error('Loan is not active'), { status: 400 });

      syncLoanOverdueAndPenalties(loan);

      const paidInstallmentsCount = (loan.installmentSchedule || []).filter(s => s.status === 'paid').length;
      const totalTenure = loan.installmentsCount || loan.tenure || (loan.installmentSchedule || []).length || 15;
      const installmentAmt = loan.installmentAmount || loan.emiAmount || 0;
      const penaltyAmt = loan.penaltyDue || 0;

      // RULE: Borrower MUST pay for at least 15 installments (with interest) even if closing after 1 installment!
      let basePayoffAmount = 0;
      if (paidInstallmentsCount < 15) {
        const installmentsToReach15 = Math.min(15, totalTenure) - paidInstallmentsCount;
        basePayoffAmount = (installmentsToReach15 * installmentAmt);
      } else {
        basePayoffAmount = Math.max(0, loan.remainingAmount || 0);
      }

      // PRE-CLOSURE 3-WAY SPLIT FORMULA:
      // 1. "AGAR 9 SE PEHLE CLOSE HOGA TO HI FAYDA HOGA" (paidInstallmentsCount < 9)
      // 2. "15 KE UPAR JITNA BHI INSTALLMENT HAI, UTNA PERCENT KA CHUT HOGA LOAN AMOUNT SE"
      //    Total installment - 15 = x installment -> x% of loan amount
      // 3. "Jo x percent aaya hai usme 3 part hoga":
      //    1 user ko discount
      //    1 agents ko benefits
      //    1 company ko profit (1:1:1 equal split)
      let xPercent = 0;
      let totalDiscountPool = 0;
      let userDiscount = 0;
      let agentBonus = 0;
      let companyProfit = 0;

      if (paidInstallmentsCount < 9 && totalTenure > 15) {
        xPercent = totalTenure - 15; // e.g. 18-15=3%, 21-15=6%, 24-15=9%, 30-15=15%
        totalDiscountPool = Math.round((loan.amount * xPercent) / 100);
        userDiscount = Math.round(totalDiscountPool / 3);
        agentBonus = Math.round(totalDiscountPool / 3);
        companyProfit = totalDiscountPool - userDiscount - agentBonus;
      }

      const payoffAmount = Math.max(0, basePayoffAmount - userDiscount) + penaltyAmt;

      if (payoffAmount <= 0) throw Object.assign(new Error('Loan has no outstanding balance'), { status: 400 });

      // Atomic balance deduction from borrower
      const updatedUser = await User.findOneAndUpdate(
        { _id: borrower._id, balance: { $gte: payoffAmount } },
        {
          $inc: {
            balance: -payoffAmount,
            duesBalance: -payoffAmount
          }
        },
        { new: true, session }
      );
      if (!updatedUser) {
        throw Object.assign(
          new Error(`Borrower wallet me paryapt balance nahi hai. Payoff ke liye ₹${payoffAmount.toLocaleString('en-IN')} zaroori hai (Base: ₹${basePayoffAmount.toLocaleString('en-IN')}${userDiscount > 0 ? `, Chhoot: -₹${userDiscount.toLocaleString('en-IN')}` : ''}${penaltyAmt > 0 ? `, Penalty: +₹${penaltyAmt.toLocaleString('en-IN')}` : ''}).`),
          { status: 400 }
        );
      }

      // Mark all schedule entries as paid
      (loan.installmentSchedule || []).forEach(s => {
        if (s.status !== 'paid') {
          s.status = 'paid';
          s.paidOn = new Date();
        }
      });
      (loan.emiSchedule || []).forEach(s => {
        if (s.status !== 'paid') {
          s.status = 'paid';
          s.paidOn = new Date();
        }
      });

      loan.paidAmount = loan.totalPayable;
      loan.remainingAmount = 0;
      loan.penaltyDue = 0;
      loan.accumulatedDue = 0;
      loan.status = 'closed';
      loan.earlyClosed = true;
      loan.earlyClosedAt = new Date();
      loan.precloseDiscountPercent = xPercent;
      loan.precloseTotalPool = totalDiscountPool;
      loan.precloseUserDiscount = userDiscount;
      loan.precloseAgentBenefit = agentBonus;
      loan.precloseCompanyProfit = companyProfit;

      const agentId = updatedUser.referredBy;
      if (agentBonus > 0 && agentId) {
        await User.findByIdAndUpdate(
          agentId,
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

        const commissionRemarks = `Early Loan Settlement Bonus for loan ${loan.accountNumber || loan._id}`;

        await Transaction.create([{
          userId: agentId,
          type: 'referral_bonus',
          amount: agentBonus,
          method: 'system',
          status: 'completed',
          referenceId: loan._id.toString(),
          remarks: commissionRemarks
        }], { session });
      }

      // Upgrade user loan limit (doubles up to 50k)
      const newLimit = Math.min((updatedUser.loanLimit || 10000) * 2, 50000);
      await User.findByIdAndUpdate(borrower._id, { $set: { loanLimit: newLimit } }, { session });

      await loan.save({ session });

      // Borrower transaction remarks - clean and simple, no confidential internal splits
      const borrowerRemarks = `Full Early Closure Payoff for loan ${loan.accountNumber || 'Loan'}${userDiscount > 0 ? ` (Early Closure Discount: -₹${userDiscount.toLocaleString('en-IN')})` : ''}${penaltyAmt > 0 ? ` (Penalty: +₹${penaltyAmt.toLocaleString('en-IN')})` : ''}`;

      await Transaction.create([{
        userId: req.user._id,
        type: 'loan_early_closure',
        amount: payoffAmount,
        method: 'wallet',
        status: 'completed',
        referenceId: loan._id.toString(),
        remarks: borrowerRemarks
      }], { session });

      resultLoan = loan;
    });

    const isAdmin = req.user.role === 'admin';
    res.json({
      message: 'Loan successfully closed in full! Limit upgraded.',
      loan: resultLoan,
      userDiscount,
      payoffAmount,
      ...(isAdmin ? {
        xPercent,
        totalDiscountPool,
        agentBonus,
        companyProfit
      } : {})
    });
  } catch (err) {
    res.status(err.status || 500).json({ message: err.message || 'Early closure failed' });
  } finally {
    session.endSession();
  }
});

// Pre-closure Quote & Breakdown Preview Endpoint
router.get('/:id/preclose-quote', protect, async (req, res) => {
  try {
    const loan = await Loan.findById(req.params.id);
    if (!loan) return res.status(404).json({ message: 'Loan not found' });

    // Object-level authorization check (anti-IDOR)
    if (loan.userId.toString() !== req.user._id.toString() && req.user.role !== 'admin') {
      return res.status(403).json({ message: 'Access denied: You do not own this loan' });
    }

    syncLoanOverdueAndPenalties(loan);

    const paidCount = (loan.installmentSchedule || []).filter(s => s.status === 'paid').length;
    const totalTenure = loan.installmentsCount || loan.tenure || (loan.installmentSchedule || []).length || 15;
    const installmentAmt = loan.installmentAmount || loan.emiAmount || 0;
    const penaltyAmt = loan.penaltyDue || 0;

    let basePayoff = 0;
    if (paidCount < 15) {
      const installmentsToPay = Math.min(15, totalTenure) - paidCount;
      basePayoff = installmentsToPay * installmentAmt;
    } else {
      basePayoff = Math.max(0, loan.remainingAmount || 0);
    }

    const isEligible = paidCount < 9 && totalTenure > 15;
    const xPercent = isEligible ? Math.max(0, totalTenure - 15) : 0;
    const totalDiscountPool = Math.round((loan.amount * xPercent) / 100);
    const userDiscount = isEligible ? Math.round(totalDiscountPool / 3) : 0;
    const agentBenefit = isEligible ? Math.round(totalDiscountPool / 3) : 0;
    const companyProfit = isEligible ? (totalDiscountPool - userDiscount - agentBenefit) : 0;

    const finalPayoff = Math.max(0, basePayoff - userDiscount) + penaltyAmt;
    const isAdmin = req.user.role === 'admin';

    res.json({
      success: true,
      loanId: loan._id,
      loanAmount: loan.amount,
      totalTenure,
      paidCount,
      isEligibleForDiscount: isEligible,
      reason: isEligible
        ? 'Early settlement par vishesh fayda uplabdh hai'
        : (paidCount >= 9 ? '9 ya usse zyada kiste bhar chuke hain, isiliye early discount lagu nahi hai' : 'Standard loan payoff rules'),
      userDiscount,
      basePayoff,
      penaltyAmt,
      finalPayoff,
      // Only Admin gets to see confidential 3-part split and company profit metrics
      ...(isAdmin ? {
        xPercent,
        totalDiscountPool,
        agentBenefit,
        companyProfit
      } : {})
    });
  } catch (err) {
    res.status(500).json({ message: 'Failed to calculate pre-close quote' });
  }
});

// Legacy Pay EMI alias (calls pay-installment)
router.post('/:id/pay-emi', protect, async (req, res) => {
  req.url = `/${req.params.id}/pay-installment`;
  return router.handle(req, res);
});

// Admin creates a loan application on behalf of an existing user or newly created user
router.post('/admin/create-on-behalf', protect, admin, async (req, res) => {
  try {
    const {
      borrowerType = 'existing', // 'existing' | 'new'
      userId,
      name,
      phone,
      email,
      address,
      aadharNumber,
      panNumber,
      referredByAgentId,
      referralCode,
      loanType = 'personal',
      amount = 10000,
      installmentsCount = 15,
      interestRateOption = 1.34,
      purpose,
      hasChequeFacility = false,
      chequeNumber,
      adminNote
    } = req.body;

    let targetUser = null;

    // Resolve agent ID if referral code was entered
    let finalReferrerId = referredByAgentId && mongoose.Types.ObjectId.isValid(referredByAgentId) ? referredByAgentId : null;
    if (!finalReferrerId && referralCode) {
      const agentByCode = await User.findOne({ referralCode: String(referralCode).trim().toUpperCase() });
      if (agentByCode) finalReferrerId = agentByCode._id;
    }

    if (borrowerType === 'new') {
      if (!name || !phone) {
        return res.status(400).json({ message: 'New borrower name and phone are required' });
      }

      const cleanPhone = String(phone).replace(/\D/g, '');
      if (cleanPhone.length < 10) {
        return res.status(400).json({ message: 'Valid 10-digit phone number required' });
      }

      // Check if user already exists with this phone or email
      targetUser = await User.findOne({
        $or: [{ phone: cleanPhone }, ...(email ? [{ email: email.toLowerCase() }] : [])]
      });

      if (!targetUser) {
        const bcrypt = require('bcryptjs');
        const tempPassword = `Educa@${cleanPhone.slice(-4)}`;
        const hashedPassword = await bcrypt.hash(tempPassword, 10);
        const userEmail = email ? email.toLowerCase().trim() : `${cleanPhone}@educa.in`;

        targetUser = await User.create({
          name: name.trim(),
          phone: cleanPhone,
          email: userEmail,
          password: hashedPassword,
          role: 'user',
          address: address ? address.trim() : '',
          aadharNumber: aadharNumber ? String(aadharNumber).trim() : '',
          panNumber: panNumber ? String(panNumber).trim().toUpperCase() : '',
          referredBy: finalReferrerId,
          kycStatus: aadharNumber ? 'verified' : 'pending',
          kycDocuments: {
            aadharNumber: aadharNumber ? String(aadharNumber).trim() : '',
            panNumber: panNumber ? String(panNumber).trim().toUpperCase() : '',
            doc2Type: panNumber ? 'pan' : 'cheque',
            address: address ? address.trim() : '',
            adminRemarks: 'Created on behalf by Admin'
          }
        });

        if (finalReferrerId) {
          await User.findByIdAndUpdate(finalReferrerId, { $inc: { referralCount: 1 } });
        }
      }
    } else {
      if (!userId || !mongoose.Types.ObjectId.isValid(userId)) {
        return res.status(400).json({ message: 'Please select a valid user' });
      }
      targetUser = await User.findById(userId);
      if (!targetUser) {
        return res.status(404).json({ message: 'Selected user not found' });
      }
    }

    const numAmount = Number(amount);
    if (!numAmount || numAmount < 5000 || numAmount > 50000) {
      return res.status(400).json({ message: 'Loan amount ₹5,000 to ₹50,000 ke beech hona chahiye.' });
    }

    const count = Math.min(Math.max(Number(installmentsCount) || 15, 15), 24);
    const quote = calculatePersonalLoanQuote(numAmount, count, interestRateOption);
    const accountNumber = await generateLoanAccountNumber();
    const collectionDates = getCollectionDates(new Date(), count);
    const schedule = collectionDates.map((dueDate, idx) => ({
      installmentNo: idx + 1,
      month: idx + 1,
      dueDate,
      amount: quote.installmentAmount,
      status: 'pending'
    }));

    const createdLoan = await Loan.create({
      userId: targetUser._id,
      accountNumber,
      loanType: loanType || 'personal',
      collectionFrequency: '10_days',
      amount: quote.amount,
      interestRate: quote.interestRatePerInstallment,
      interestRatePerInstallment: quote.interestRatePerInstallment,
      cycleDays: 10,
      installmentsCount: count,
      tenure: count,
      installmentAmount: quote.installmentAmount,
      emiAmount: quote.installmentAmount,
      processingFee: quote.processingFee,
      upiCharges: quote.upiCharges,
      advanceDeduction: 0,
      disbursalAmount: quote.disbursalAmount,
      totalPayable: quote.totalPayable,
      remainingAmount: quote.totalPayable,
      hasChequeFacility: Boolean(hasChequeFacility),
      chequeNumber: chequeNumber ? String(chequeNumber).trim() : '',
      status: 'pending', // Pending for review and approval
      purpose: purpose || 'Applied on behalf by Admin',
      installmentSchedule: schedule,
      emiSchedule: schedule,
      documents: {
        applicantEmail: targetUser.email,
        applicantPhone: targetUser.phone,
        aadharNumber: targetUser.aadharNumber || aadharNumber,
        panNumber: targetUser.panNumber || panNumber,
        doc1Url: req.body.documents?.doc1Url || targetUser.kycDocuments?.doc1Url || targetUser.kycDocuments?.docUrl || '',
        doc1BackUrl: req.body.documents?.doc1BackUrl || targetUser.kycDocuments?.doc1BackUrl || '',
        doc2Url: req.body.documents?.doc2Url || targetUser.kycDocuments?.doc2Url || '',
        doc2BackUrl: req.body.documents?.doc2BackUrl || targetUser.kycDocuments?.doc2BackUrl || '',
        chequeNumber: chequeNumber ? String(chequeNumber).trim() : (targetUser.kycDocuments?.chequeNumber || ''),
        chequeUrl: req.body.documents?.chequeUrl || targetUser.kycDocuments?.chequeUrl || '',
        chequeBackUrl: req.body.documents?.chequeBackUrl || targetUser.kycDocuments?.chequeBackUrl || '',
        adminNotes: adminNote || `Loan applied by Admin on behalf of borrower (${borrowerType === 'new' ? 'New User' : 'Existing Customer'})`
      }
    });

    // Sync newly uploaded documents and cheque to targetUser's KYC profile
    const docUpdates = {};
    if (req.body.documents?.doc1Url) docUpdates['kycDocuments.doc1Url'] = req.body.documents.doc1Url;
    if (req.body.documents?.doc1BackUrl) docUpdates['kycDocuments.doc1BackUrl'] = req.body.documents.doc1BackUrl;
    if (req.body.documents?.doc2Url) docUpdates['kycDocuments.doc2Url'] = req.body.documents.doc2Url;
    if (req.body.documents?.doc2BackUrl) docUpdates['kycDocuments.doc2BackUrl'] = req.body.documents.doc2BackUrl;
    if (req.body.documents?.chequeUrl) docUpdates['kycDocuments.chequeUrl'] = req.body.documents.chequeUrl;
    if (req.body.documents?.chequeBackUrl) docUpdates['kycDocuments.chequeBackUrl'] = req.body.documents.chequeBackUrl;
    if (chequeNumber) docUpdates['kycDocuments.chequeNumber'] = String(chequeNumber).trim();
    if (name && String(name).trim() && String(name).trim() !== targetUser.name) {
      docUpdates['name'] = String(name).trim();
      docUpdates['kycDocuments.aadhaarName'] = String(name).trim();
    }
    const cleanBorrowerPhone = phone ? String(phone).replace(/\D/g, '') : '';
    if (cleanBorrowerPhone && cleanBorrowerPhone.length === 10 && cleanBorrowerPhone !== targetUser.phone) {
      docUpdates['phone'] = cleanBorrowerPhone;
      docUpdates['kycDocuments.aadhaarPhone'] = cleanBorrowerPhone;
    }
    if (aadharNumber) { docUpdates['aadharNumber'] = String(aadharNumber).trim(); docUpdates['kycDocuments.aadharNumber'] = String(aadharNumber).trim(); }
    if (panNumber) { docUpdates['panNumber'] = String(panNumber).trim().toUpperCase(); docUpdates['kycDocuments.panNumber'] = String(panNumber).trim().toUpperCase(); }
    if (address) { docUpdates['address'] = String(address).trim(); docUpdates['kycDocuments.address'] = String(address).trim(); }
    if (Object.keys(docUpdates).length > 0) {
      await User.findByIdAndUpdate(targetUser._id, { $set: docUpdates });
    }

    // Notify admins via SSE
    if (req.app.locals.sseClients) {
      const payload = JSON.stringify({
        type: 'loan_apply',
        message: `New Loan Application pending review for ${targetUser.name} (₹${quote.amount})`,
        timestamp: new Date().toISOString()
      });
      req.app.locals.sseClients.forEach(c => {
        try { c.write(`data: ${payload}\n\n`); } catch (e) {}
      });
    }

    // Sync complete loan documents to Google Drive (background non-blocking)
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
            userId: targetUser._id.toString(),
            userName: targetUser.name,
            email: targetUser.email,
            phone: targetUser.phone,
            amount: createdLoan.amount,
            aadharNumber: targetUser.aadharNumber || aadharNumber,
            doc1Url: createdLoan.documents?.doc1Url,
            doc1BackUrl: createdLoan.documents?.doc1BackUrl,
            panNumber: targetUser.panNumber || panNumber,
            doc2Url: createdLoan.documents?.doc2Url,
            doc2BackUrl: createdLoan.documents?.doc2BackUrl,
            chequeNumber: createdLoan.documents?.chequeNumber,
            chequeUrl: createdLoan.documents?.chequeUrl,
            chequeBackUrl: createdLoan.documents?.chequeBackUrl,
            submittedAt: new Date().toISOString()
          })
        })
        .then(r => r.json())
        .then(async (driveData) => {
          if (driveData && (driveData.fileUrl || driveData.folderUrl)) {
            const directLink = driveData.fileUrl || driveData.folderUrl;
            await Loan.findByIdAndUpdate(createdLoan._id, { 'documents.googleDriveLink': directLink });
            await User.findByIdAndUpdate(targetUser._id, { 'kycDocuments.googleDriveLink': directLink });
          }
        })
        .catch(e => console.warn('Drive loan sync warning:', e.message));
      }
    } catch (driveErr) {
      console.warn('Drive sync initiation failed:', driveErr.message);
    }

    res.json({
      success: true,
      message: `Loan application for ${targetUser.name} created successfully! Ab aap ise review karke approve kar sakte hain.`,
      loan: createdLoan,
      user: {
        id: targetUser._id,
        name: targetUser.name,
        phone: targetUser.phone,
        email: targetUser.email
      }
    });
  } catch (err) {
    console.error('Error in create-on-behalf:', err);
    res.status(500).json({ message: err.message || 'Failed to create loan application' });
  }
});

// Admin: Toggle Penalty Waiver for a Loan ("chor sakta hai" / waive or re-apply)
// Rule: When waived, penalty is 0. When applied again, all overdue installments are counted (2% per installment)
router.post('/:id/toggle-penalty-waiver', protect, admin, async (req, res) => {
  try {
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
      return res.status(400).json({ message: 'Invalid loan ID' });
    }

    const loan = await Loan.findById(req.params.id);
    if (!loan) return res.status(404).json({ message: 'Loan not found' });

    const shouldWaive = req.body.waive !== undefined ? Boolean(req.body.waive) : !loan.penaltyWaived;
    loan.penaltyWaived = shouldWaive;
    if (shouldWaive) {
      loan.penaltyWaivedAt = new Date();
      loan.penaltyWaivedBy = req.user.email;
    } else {
      loan.penaltyWaivedAt = null;
      loan.penaltyWaivedBy = null;
    }

    syncLoanOverdueAndPenalties(loan);
    await loan.save();

    res.json({
      success: true,
      message: shouldWaive
        ? 'Penalty waive (rok) di gayi hai. Borrower ko abhi penalty nahi lagegi.'
        : 'Penalty wapas lagu kar di gayi hai (pichli sabhi overdue kisto samet 2% per installment jod kar).',
      loan
    });
  } catch (err) {
    console.error('Toggle penalty waiver error:', err);
    res.status(500).json({ message: 'Failed to update penalty waiver' });
  }
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

      // Agent Referral Commission on Loan Disbursal
      if (user.referredBy && !loan.referralCommissionPaid) {
        const agentUser = await User.findById(user.referredBy).session(session);
        if (agentUser) {
          let commissionRate = 0;
          if (agentUser.agentProfile && agentUser.agentProfile.commissionRate !== undefined && agentUser.agentProfile.commissionRate !== null && !isNaN(agentUser.agentProfile.commissionRate)) {
            commissionRate = Number(agentUser.agentProfile.commissionRate);
          } else {
            const setting = await Settings.findOne({ key: 'referralCommissionRate' }).session(session);
            commissionRate = setting ? Number(setting.value) : 2;
          }

          if (commissionRate > 0) {
            const commissionAmount = Number(((loan.amount * commissionRate) / 100).toFixed(2));
            if (commissionAmount > 0) {
              agentUser.balance = Number(((agentUser.balance || 0) + commissionAmount).toFixed(2));
              agentUser.profitBalance = Number(((agentUser.profitBalance || 0) + commissionAmount).toFixed(2));
              agentUser.referralEarnings = Number(((agentUser.referralEarnings || 0) + commissionAmount).toFixed(2));
              await agentUser.save({ session });

              loan.referralCommissionPaid = true;
              loan.referralCommissionAmount = commissionAmount;

              await Transaction.create([{
                userId: agentUser._id,
                type: 'referral_bonus',
                amount: commissionAmount,
                method: 'system',
                status: 'completed',
                referenceId: loan._id.toString(),
                remarks: `Agent Commission (${commissionRate}%) for loan disbursal of ${user.name} (${loan.accountNumber || loan._id})`
              }], { session });
            }
          }
        }
      }

      loan.approvedAt = new Date();
      loan.approverName = req.body.approverName || req.user.name || 'Admin';
      loan.approverDevice = req.body.approverDevice || '💻 Windows PC • Chrome';
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
      }
      if (l.status === 'active') {
        syncLoanOverdueAndPenalties(l);
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
      }
      if (l.status === 'active') {
        syncLoanOverdueAndPenalties(l);
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
    const checkProof = validateBase64Upload(proofUrl);
    if (!checkProof.valid) {
      return res.status(400).json({ message: 'Invalid payment proof: ' + checkProof.error });
    }
    if (proofBackUrl) {
      const checkBack = validateBase64Upload(proofBackUrl);
      if (!checkBack.valid) {
        return res.status(400).json({ message: 'Invalid receipt back: ' + checkBack.error });
      }
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
