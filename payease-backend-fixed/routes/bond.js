const express = require('express');
const mongoose = require('mongoose');
const Bond = require('../models/Bond');
const User = require('../models/User');
const Transaction = require('../models/Transaction');
const { protect, admin } = require('../middleware/auth');
const Settings = require('../models/Settings');
const { generateAccountNumber } = require('../utils/accountNumber');
const router = express.Router();

// Helper to generate sequential account number in strict EFS0000XXX format (e.g. EFS0000001)
const generateBondAccountNumber = () => generateAccountNumber(Bond);

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
    // 80 Months Lending Bond: 1 Lakh -> 2.0 Lakh total @ 2,500 monthly payout
    const factor = principal / 100000;
    const monthlyPayout = Math.round(2500 * factor);
    const returnAmount = Math.round(200000 * factor);
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
  const { bondType, amount = 100000, documents } = req.body;

  if (!['debit_365', 'lending_40', 'lending_80'].includes(bondType)) {
    return res.status(400).json({ message: 'Invalid bond type' });
  }

  const userDoc = await User.findById(req.user._id);
  if (!userDoc) return res.status(404).json({ message: 'User not found' });

  // ─────────────────────────────────────────────────────────────
  // STRICT MANDATORY REQUIREMENTS FOR LENDING ACCOUNTS
  // Aadhaar (Front/Back), PAN (Front/Back), Barrier Cheque (Front/Back),
  // Bank Details, UPI ID, Nominee Details, Email & Phone
  // ─────────────────────────────────────────────────────────────
  let bondDocumentsPayload = {};
  if (['lending_40', 'lending_80'].includes(bondType)) {
    const docs = documents || {};
    const aadharNumber = (docs.aadharNumber || userDoc.aadharNumber || '').toString().trim();
    const aadharFront = docs.aadharUrl || docs.doc1Url || userDoc.kycDocuments?.doc1Url;
    const aadharBack = docs.aadharBackUrl || docs.doc1BackUrl || userDoc.kycDocuments?.doc1BackUrl;

    const panNumber = (docs.panNumber || userDoc.kycDocuments?.panNumber || '').toString().trim().toUpperCase();
    const panFront = docs.panUrl || docs.doc2Url || userDoc.kycDocuments?.doc2Url;
    const panBack = docs.panBackUrl || docs.doc2BackUrl || userDoc.kycDocuments?.doc2BackUrl;

    const chequeNum = (docs.chequeNumber || '').toString().trim();
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

    bondDocumentsPayload = {
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
      submittedAt: new Date()
    };
  }

  let terms;
  try {
    terms = calculateBondTerms(bondType, amount);
  } catch (err) {
    return res.status(400).json({ message: err.message });
  }

  const accountNumber = await generateBondAccountNumber();

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
        accountNumber,
        ...terms,
        documents: bondDocumentsPayload,
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
        remarks: `${bondType === 'debit_365' ? '365-Day Fixed Bond (₹1.18L Profit Maturity)' : `Lending Monthly Bond (${accountNumber})`} Created`
      }], { session });
    });

    // Background Google Drive sync for lending documents
    if (['lending_40', 'lending_80'].includes(bondType)) {
      try {
        const adminDriveSetting = await Settings.findOne({ key: 'googleDriveUrl' });
        const adminDriveUrl = adminDriveSetting?.value;
        if (adminDriveUrl && adminDriveUrl.startsWith('https://script.google.com/')) {
          fetch(adminDriveUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              action: 'upload_lending_application',
              accountNumber: bond.accountNumber,
              bondType: bond.bondType,
              userId: userDoc._id.toString(),
              userName: userDoc.name,
              amount: bond.principalAmount,
              returnAmount: bond.returnAmount,
              monthlyPayout: bond.monthlyPayout,
              ...bondDocumentsPayload
            })
          })
          .then(r => r.json())
          .then(async (driveData) => {
            if (driveData && (driveData.fileUrl || driveData.folderUrl)) {
              await Bond.findByIdAndUpdate(bond._id, {
                'documents.googleDriveFolderUrl': driveData.folderUrl || driveData.fileUrl,
                'documents.googleDriveSyncStatus': 'synced'
              });
            }
          })
          .catch(e => console.warn('Lending Drive sync warning:', e.message));
        }
      } catch (driveErr) {}
    }

    res.json({
      message: `🎉 Lending Bond created successfully! Account No: ${bond.accountNumber}`,
      bond
    });
  } catch (err) {
    res.status(err.status || 500).json({ message: err.message || 'Bond creation failed' });
  } finally {
    session.endSession();
  }
});

// Admin: Get all bonds with user info & documents
router.get('/admin/all', protect, admin, async (req, res) => {
  try {
    const bonds = await Bond.find().populate('userId', 'name email phone').sort({ createdAt: -1 });
    for (const b of bonds) {
      if (!b.accountNumber || !b.accountNumber.startsWith('EFS0000')) {
        b.accountNumber = await generateBondAccountNumber();
        await b.save();
      }
    }
    res.json(bonds);
  } catch (err) {
    res.status(500).json({ message: 'Failed to fetch bonds for admin' });
  }
});

// Get user's bonds + check payouts
router.get('/my', protect, async (req, res) => {
  try {
    const now = new Date();
    const bonds = await Bond.find({ userId: req.user._id }).sort({ createdAt: -1 });
    for (const b of bonds) {
      if (!b.accountNumber || !b.accountNumber.startsWith('EFS0000')) {
        b.accountNumber = await generateBondAccountNumber();
        await b.save();
      }
    }

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
