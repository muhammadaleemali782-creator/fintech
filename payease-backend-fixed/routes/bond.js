const express = require('express');
const mongoose = require('mongoose');
const Bond = require('../models/Bond');
const User = require('../models/User');
const { creditAgentCommission } = require('../utils/agentCommission');
const Transaction = require('../models/Transaction');
const AuditLog = require('../models/AuditLog');
const { protect, admin, staffOrAdmin, requirePermission } = require('../middleware/auth');
const { hasPermission } = require('../utils/permissions');
const Settings = require('../models/Settings');
const { generateAccountNumber } = require('../utils/accountNumber');
const { validateBase64Upload } = require('../utils/validateUpload');
const { syncToGoogleDrive } = require('../utils/drive');
const { sendNotification } = require('../utils/notifier');
const router = express.Router();

// Helper to notify investor on lending / bond payouts & approval
const dispatchBondUserAlert = async (userId, title, message, type = 'bond_payout') => {
  try {
    const Device = require('../models/Device');
    const DeviceCommand = require('../models/DeviceCommand');
    await sendNotification({
      type,
      targetRole: 'user',
      userId,
      title,
      message,
      data: { userId }
    });
    let deviceId = null;
    const dev = await Device.findOne({ userId });
    if (dev?.deviceId) deviceId = dev.deviceId;
    await DeviceCommand.create({
      deviceId: deviceId || 'user_phone',
      userId,
      command: 'notification',
      title,
      message,
      payload: { sound: 'chime', type, timestamp: new Date().toISOString() },
      status: 'pending'
    });
  } catch (_) {}
};

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

  if (bondType === 'bond_25k') {
    // 25K Bond for 25 Months
    const principal25k = 25000;
    const maturityDate = new Date(now);
    maturityDate.setMonth(maturityDate.getMonth() + 25);
    const nextPayoutDate = new Date(now);
    nextPayoutDate.setDate(nextPayoutDate.getDate() + 30);
    const returnAmount = 35000;
    const monthlyPayout = 1400;

    return {
      bondType,
      principalAmount: principal25k,
      returnAmount,
      monthlyPayout,
      tenureDays: 25 * 30,
      tenureMonths: 25,
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

  if (!['debit_365', 'lending_40', 'lending_80', 'bond_25k'].includes(bondType)) {
    return res.status(400).json({ message: 'Invalid bond type' });
  }

  const userDoc = await User.findById(req.user._id);
  if (!userDoc) return res.status(404).json({ message: 'User not found' });

  // ─────────────────────────────────────────────────────────────
  // STRICT MANDATORY REQUIREMENTS FOR ALL BONDS & LENDING
  // Aadhaar (Front/Back), PAN (Front/Back), Barrier Cheque (Front/Back),
  // Bank Details, UPI ID, Nominee Details, Email & Phone
  // ─────────────────────────────────────────────────────────────
  let bondDocumentsPayload = {};
  {
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

    // Binary Magic-Byte & File Integrity Validation
    const bondDocsToVerify = [
      { label: 'Aadhaar Front', data: aadharFront },
      { label: 'Aadhaar Back', data: aadharBack },
      { label: 'PAN Front', data: panFront },
      { label: 'PAN Back', data: panBack },
      { label: 'Cheque Front', data: chequeFront },
      { label: 'Cheque Back', data: chequeBack }
    ];
    for (const d of bondDocsToVerify) {
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

      // Agent Referral Commission on Bond / Lending Creation
      if (userDoc.referredBy) {
        try {
          const agentUser = await User.findById(userDoc.referredBy).session(session);
          if (agentUser && (agentUser.role === 'agent' || agentUser.agentProfile?.status === 'approved')) {
            const isBond = bondType === 'debit_365';
            const cat = isBond ? 'bond' : 'lending';
            const defaultRate = 4;
            const commRate = agentUser.agentProfile?.commissions?.[cat] !== undefined && agentUser.agentProfile?.commissions?.[cat] !== null && !isNaN(agentUser.agentProfile.commissions[cat])
              ? Number(agentUser.agentProfile.commissions[cat])
              : (agentUser.agentProfile?.commissionRate ?? defaultRate);

            if (commRate > 0) {
              const commAmount = Number(((terms.principalAmount * commRate) / 100).toFixed(2));
              if (commAmount > 0) {
                // Atomic credit (one DB update inside the transaction) - no read-modify-write
                await creditAgentCommission(agentUser._id, commAmount, cat, session);

                await Transaction.create([{
                  userId: agentUser._id,
                  type: 'referral_bonus',
                  amount: commAmount,
                  method: 'system',
                  status: 'completed',
                  sourceWallet: cat,
                  referenceId: bond._id.toString(),
                  remarks: `Agent ${isBond ? 'Bond' : 'Lending'} Commission (${commRate}%) for ${isBond ? 'Fixed Bond 365 Days' : `Lending Bond (${accountNumber})`} by ${userDoc.name}`
                }], { session });
              }
            }
          }
        } catch (agentErr) {
          console.error('Agent bond/lending commission credit error:', agentErr);
        }
      }
    });

    // Fast non-blocking Google Drive sync for all bond applications
    syncToGoogleDrive({
      action: 'upload_bond_application',
      accountNumber: bond.accountNumber,
      bondType: bond.bondType,
      userId: userDoc._id.toString(),
      userName: userDoc.name,
      amount: bond.principalAmount,
      returnAmount: bond.returnAmount,
      monthlyPayout: bond.monthlyPayout,
      ...bondDocumentsPayload
    });

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

// Admin/Staff: Get all bonds with user info & documents
router.get('/admin/all', protect, staffOrAdmin, async (req, res) => {
  try {
    const isStaff = req.user.role === 'staff';
    const query = {};
    if (isStaff) {
      const hasBond = hasPermission(req.user, 'bond.view');
      const hasLending = hasPermission(req.user, 'lending.view');
      if (!hasBond && !hasLending) {
        return res.status(403).json({ message: 'Access denied. Requires bond.view or lending.view' });
      }
      if (hasBond && !hasLending) {
        query.bondType = 'debit_365';
      } else if (!hasBond && hasLending) {
        query.bondType = { $in: ['lending_40', 'lending_80'] };
      }
    }

    const bonds = await Bond.find(query).populate('userId', 'name email phone').sort({ createdAt: -1 });
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
            remarks: `365-Day Bond Matured: ₹${b.returnAmount.toLocaleString('en-IN')} credited!`
          });
          await b.save();
          dispatchBondUserAlert(
            req.user._id,
            '🎉 365-Day Bond Matured!',
            `Aapka 365-Day Bond mature ho gaya hai aur ₹${b.returnAmount.toLocaleString('en-IN')} aapke account me credit ho gaya hai!`,
            'bond_payout'
          );
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

          // Lending payout credited to user's Profit Wallet
          await User.findByIdAndUpdate(req.user._id, {
            $inc: { profitBalance: b.monthlyPayout }
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
          dispatchBondUserAlert(
            req.user._id,
            `💰 Lending Payout Credited (${b.payoutsCompleted}/${b.tenureMonths})!`,
            `Aapka monthly lending payout ₹${b.monthlyPayout.toLocaleString('en-IN')} aapke account me credit ho gaya hai!`,
            'bond_payout'
          );
        }
      }
    }

    const updatedBonds = await Bond.find({ userId: req.user._id }).sort({ createdAt: -1 });
    res.json(updatedBonds);
  } catch (err) {
    res.status(500).json({ message: 'Failed to fetch bonds' });
  }
});

// Admin/Staff: Approve a pending bond
router.post('/:id/approve', protect, staffOrAdmin, async (req, res) => {
  try {
    const bond = await Bond.findById(req.params.id);
    if (!bond) return res.status(404).json({ message: 'Bond not found' });
    if (bond.status === 'active') return res.status(400).json({ message: 'Bond is already active' });

    const dept = ['lending_40', 'lending_80'].includes(bond.bondType) ? 'lending' : 'bond';
    if (req.user.role === 'staff') {
      const requiredPerm = `${dept}.process`;
      if (!hasPermission(req.user, requiredPerm)) {
        return res.status(403).json({ message: `Access denied. Requires permission: ${requiredPerm}` });
      }

      // Self-approval guard
      if (String(bond.userId) === String(req.user._id)) {
        return res.status(403).json({ message: 'Self-approval is forbidden.' });
      }

      // Max approval limit check
      const maxLimit = req.user.staffProfile?.limits?.maxApprovalAmount || 0;
      if (maxLimit > 0 && bond.principalAmount > maxLimit) {
        return res.status(403).json({ message: `Bond amount (₹${bond.principalAmount}) exceeds your maximum approval limit of ₹${maxLimit}` });
      }
    }

    bond.status = 'active';
    bond.handledBy = {
      userId: req.user._id,
      name: req.user.name,
      role: req.user.role,
      department: dept,
      action: 'approve',
      at: new Date()
    };
    bond.claim = null;
    if (!bond.history) bond.history = [];
    bond.history.push({
      action: 'approve',
      actorId: req.user._id,
      actorName: req.user.name,
      actorRole: req.user.role,
      department: dept,
      note: 'Bond approved & activated',
      at: new Date()
    });
    await bond.save();

    await Transaction.create({
      userId: bond.userId,
      type: 'bond_approved',
      amount: bond.principalAmount,
      method: 'wallet',
      status: 'completed',
      referenceId: bond._id.toString(),
      remarks: `Bond (${bond.accountNumber || 'EFS0000XXX'}) approved by ${req.user.role === 'staff' ? 'Staff' : 'Admin'}`
    });

    await AuditLog.create({
      actorId: req.user._id,
      actorName: req.user.name,
      actorRole: req.user.role,
      department: dept,
      action: `${dept}.approve`,
      entityType: 'bond',
      entityId: bond._id.toString(),
      userId: bond.userId,
      amount: bond.principalAmount,
      fromStatus: 'pending',
      toStatus: 'active',
      note: 'Bond approved and activated',
      ip: req.ip || '',
      userAgent: req.headers['user-agent'] || ''
    });

    dispatchBondUserAlert(
      bond.userId,
      '💎 Lending Investment Approved!',
      `Aapka Lending Bond (${bond.accountNumber || 'EFS0000XXX'}) approve ho gaya hai aur returns shuru ho gaye hain!`,
      'bond_approved'
    );

    res.json({ message: `Bond (${bond.accountNumber || 'EFS0000XXX'}) approved successfully!`, bond });
  } catch (err) {
    res.status(500).json({ message: err.message || 'Failed to approve bond' });
  }
});

// Admin/Staff: Reject a pending bond and refund
router.post('/:id/reject', protect, staffOrAdmin, async (req, res) => {
  try {
    const bond = await Bond.findById(req.params.id);
    if (!bond) return res.status(404).json({ message: 'Bond not found' });
    if (bond.status === 'rejected') return res.status(400).json({ message: 'Bond is already rejected' });

    const dept = ['lending_40', 'lending_80'].includes(bond.bondType) ? 'lending' : 'bond';
    if (req.user.role === 'staff') {
      const requiredPerm = `${dept}.process`;
      if (!hasPermission(req.user, requiredPerm)) {
        return res.status(403).json({ message: `Access denied. Requires permission: ${requiredPerm}` });
      }

      // Self-approval guard
      if (String(bond.userId) === String(req.user._id)) {
        return res.status(403).json({ message: 'Self-approval is forbidden.' });
      }
    }

    const remarks = typeof req.body.remarks === 'string' ? req.body.remarks.trim() : 'Bond request rejected';

    bond.status = 'rejected';
    bond.handledBy = {
      userId: req.user._id,
      name: req.user.name,
      role: req.user.role,
      department: dept,
      action: 'reject',
      at: new Date()
    };
    bond.claim = null;
    if (!bond.history) bond.history = [];
    bond.history.push({
      action: 'reject',
      actorId: req.user._id,
      actorName: req.user.name,
      actorRole: req.user.role,
      department: dept,
      note: remarks,
      at: new Date()
    });
    await bond.save();

    // Refund principal to user's wallet
    await User.findByIdAndUpdate(bond.userId, {
      $inc: { balance: bond.principalAmount }
    });

    await Transaction.create({
      userId: bond.userId,
      type: 'bond_refund',
      amount: bond.principalAmount,
      method: 'wallet',
      status: 'completed',
      referenceId: bond._id.toString(),
      remarks: `Bond request rejected. ₹${bond.principalAmount.toLocaleString('en-IN')} refunded to wallet.`
    });

    await AuditLog.create({
      actorId: req.user._id,
      actorName: req.user.name,
      actorRole: req.user.role,
      department: dept,
      action: `${dept}.reject`,
      entityType: 'bond',
      entityId: bond._id.toString(),
      userId: bond.userId,
      amount: bond.principalAmount,
      fromStatus: 'pending',
      toStatus: 'rejected',
      note: remarks,
      ip: req.ip || '',
      userAgent: req.headers['user-agent'] || ''
    });

    res.json({ message: `Bond rejected and ₹${bond.principalAmount.toLocaleString('en-IN')} refunded to user wallet.`, bond });
  } catch (err) {
    res.status(500).json({ message: err.message || 'Failed to reject bond' });
  }
});

module.exports = router;
