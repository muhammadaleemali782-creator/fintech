const express = require('express');
const mongoose = require('mongoose');
const Transaction = require('../models/Transaction');
const User = require('../models/User');
const { protect } = require('../middleware/auth');
const { isValidAmount } = require('../utils/validateAmount');
const { validateBase64Upload } = require('../utils/validateUpload');
const bcrypt = require('bcryptjs');
const router = express.Router();

// 1. Lookup Recipient by Phone, Email, or Unique ID / Referral Code
router.get('/lookup/:identifier', protect, async (req, res) => {
  try {
    const rawId = req.params.identifier.trim();
    if (!rawId) return res.status(400).json({ message: 'Identifier required' });

    // Clean prefix if entered like EDUCA-EFUSR1234 or EFUSR1234
    const cleanId = rawId.replace(/^EDUCA-/i, '').trim();

    const recipient = await User.findOne({
      $or: [
        { phone: cleanId },
        { email: cleanId.toLowerCase() },
        { referralCode: cleanId.toUpperCase() },
        { accountNumber: cleanId.toUpperCase() },
        { upiId: cleanId.toLowerCase() }
      ]
    }).select('name phone email referralCode accountNumber upiId');

    if (!recipient) {
      return res.status(404).json({ message: 'User not found with this Phone / Account No / UPI ID / Email' });
    }

    if (recipient._id.equals(req.user._id)) {
      return res.status(400).json({ message: 'Khud ko paise transfer nahi kar sakte.' });
    }

    const uniqueId = recipient.accountNumber || `EDUCA-${recipient.referralCode || recipient.phone}`;
    res.json({
      name: recipient.name,
      uniqueId,
      phone: recipient.phone,
      accountNumber: recipient.accountNumber,
      upiId: recipient.upiId,
      id: recipient._id
    });
  } catch (err) {
    res.status(500).json({ message: 'Error looking up recipient' });
  }
});

// 2. Instant App-to-App P2P Wallet Transfer (Anti-Burp / Anti-Tamper Security)
// In-memory transfer lock to prevent double transfers from double-clicks or rapid retransmissions
const transferLocks = new Map();

router.post('/transfer', protect, async (req, res) => {
  const { recipient: rawRecipient, amount: rawAmount, notes, pin, sourceWallet = 'main' } = req.body;

  const senderUser = await User.findById(req.user._id);
  if (!senderUser) return res.status(404).json({ message: 'User not found' });
  if (senderUser.kycStatus !== 'verified') {
    return res.status(403).json({
      message: 'KYC Verification zaroori hai! Paise transfer karne ke liye kripya pehle apna KYC document submit aur verify karwayein.',
      requireKyc: true
    });
  }

  // Mandatory 6-Digit UPI PIN Check
  if (!senderUser.walletPin) {
    return res.status(400).json({
      message: 'Kripya pehle apna 6-digit UPI PIN banayein.',
      needsSetup: true
    });
  }

  if (!pin || !/^\d{6}$/.test(String(pin))) {
    return res.status(400).json({ message: 'Transfer ke liye 6-digit UPI PIN daalna anivarya hai.' });
  }

  const isPinValid = await bcrypt.compare(String(pin), senderUser.walletPin);
  if (!isPinValid) {
    return res.status(400).json({ message: 'Galat 6-digit UPI PIN enter kiya gaya hai.' });
  }

  const amount = Number(rawAmount);
  // Strict Positive Finite Integer Validation
  if (!Number.isFinite(amount) || amount < 1 || amount > 200000 || !Number.isInteger(amount)) {
    return res.status(400).json({ message: 'Valid transfer amount daalein (₹1 se ₹2,00,000 ke beech, bina decimals).' });
  }

  if (!rawRecipient || typeof rawRecipient !== 'string') {
    return res.status(400).json({ message: 'Recipient Phone, Email ya Unique ID zaroori hai.' });
  }

  const cleanRecipient = rawRecipient.replace(/^EDUCA-/i, '').trim();
  const recipientUser = await User.findOne({
    $or: [
      { phone: cleanRecipient },
      { email: cleanRecipient.toLowerCase() },
      { referralCode: cleanRecipient.toUpperCase() },
      { accountNumber: cleanRecipient.toUpperCase() },
      { upiId: cleanRecipient.toLowerCase() }
    ]
  });

  if (!recipientUser) {
    return res.status(404).json({ message: 'Praptkarta (Recipient) nahi mila.' });
  }

  if (recipientUser._id.equals(req.user._id)) {
    return res.status(400).json({ message: 'Aap khud ke account me transfer nahi kar sakte.' });
  }

  // Duplicate transfer / rapid tap prevention (6-second idempotency window)
  const transferLockKey = `${req.user._id}_${recipientUser._id}_${amount}_${sourceWallet}`;
  const lastTransferTime = transferLocks.get(transferLockKey);
  if (lastTransferTime && (Date.now() - lastTransferTime < 6000)) {
    return res.status(429).json({
      message: 'Yeh transfer pehle se process ho raha hai. Kripya thoda intezar karein.'
    });
  }
  transferLocks.set(transferLockKey, Date.now());
  setTimeout(() => transferLocks.delete(transferLockKey), 10000);

  const isProfitSource = sourceWallet === 'profit';
  const session = await mongoose.startSession();
  try {
    let senderTxn, receiverTxn, senderNewBalance, senderNewProfitBalance;

    await session.withTransaction(async () => {
      let updatedSender;

      if (isProfitSource) {
        updatedSender = await User.findOneAndUpdate(
          { _id: req.user._id, profitBalance: { $gte: amount } },
          { $inc: { profitBalance: -amount } },
          { new: true, session }
        );

        if (!updatedSender) {
          throw Object.assign(
            new Error(`Aapke Profit Wallet me paryapt balance nahi hai. Available: ₹${(req.user.profitBalance || 0).toFixed(2)}`),
            { status: 400 }
          );
        }
      } else {
        // Atomic deduction with balance guard on sender
        updatedSender = await User.findOneAndUpdate(
          { _id: req.user._id, balance: { $gte: amount } },
          { $inc: { balance: -amount } },
          { new: true, session }
        );

        if (!updatedSender) {
          throw Object.assign(
            new Error(`Aapke Primary Wallet me paryapt balance nahi hai. Available: ₹${req.user.balance || 0}`),
            { status: 400 }
          );
        }

        // Track lowest balance in 24h window for yield calculation (minimum-balance rule)
        if (updatedSender.lowestBalance24h === undefined || updatedSender.lowestBalance24h === null ||
            updatedSender.balance < updatedSender.lowestBalance24h) {
          await User.findByIdAndUpdate(req.user._id, { $min: { lowestBalance24h: updatedSender.balance } }, { session });
        }
      }

      senderNewBalance = updatedSender.balance;
      senderNewProfitBalance = updatedSender.profitBalance;

      // Atomic addition to receiver
      const updatedReceiver = await User.findByIdAndUpdate(
        recipientUser._id,
        { $inc: { balance: amount } },
        { new: true, session }
      );
      if (!updatedReceiver) {
        throw Object.assign(new Error('Recipient account update failed'), { status: 500 });
      }

      const senderIdStr = `EDUCA-${updatedSender.referralCode || updatedSender.phone}`;
      const receiverIdStr = `EDUCA-${recipientUser.referralCode || recipientUser.phone}`;
      const sourceName = isProfitSource ? 'Profit Wallet' : 'Primary Wallet';

      // 1. Transaction record for SENDER
      const sTxnArr = await Transaction.create([{
        userId: req.user._id,
        type: 'transfer_sent',
        amount,
        method: 'wallet',
        status: 'completed',
        receiverUserId: recipientUser._id,
        receiverName: recipientUser.name,
        recipientIdentifier: receiverIdStr,
        remarks: notes ? `Transfer from ${sourceName} to ${recipientUser.name}: ${notes}` : `Sent from ${sourceName} to ${recipientUser.name} (${receiverIdStr})`
      }], { session });
      senderTxn = sTxnArr[0];

      // 2. Transaction record for RECEIVER
      const rTxnArr = await Transaction.create([{
        userId: recipientUser._id,
        type: 'transfer_received',
        amount,
        method: 'wallet',
        status: 'completed',
        senderUserId: req.user._id,
        senderName: req.user.name,
        recipientIdentifier: senderIdStr,
        remarks: notes ? `Received from ${req.user.name}: ${notes}` : `Received from ${req.user.name} (${senderIdStr})`
      }], { session });
      receiverTxn = rTxnArr[0];
    });

    res.json({
      message: `🎉 ₹${amount.toLocaleString('en-IN')} successfully sent to ${recipientUser.name}!`,
      txn: senderTxn,
      newBalance: senderNewBalance,
      newProfitBalance: senderNewProfitBalance
    });
  } catch (err) {
    res.status(err.status || 500).json({ message: err.message || 'Transfer failed' });
  } finally {
    session.endSession();
  }
});

// Deposit Request (Money In - Infinite Range, Evidence Attached)
router.post('/deposit', protect, async (req, res) => {
  try {
    const { amount, method, utrNumber, proofUrl, screenshotUrl } = req.body;

    const numAmount = Number(amount);
    if (!amount || isNaN(numAmount) || numAmount < 1)
      return res.status(400).json({ message: 'Amount kam se kam ₹1 hona chahiye (Koi maximum limit nahi hai - Infinite Range)' });

    if (!['upi', 'bank'].includes(method))
      return res.status(400).json({ message: 'Method must be upi or bank' });

    if (utrNumber && typeof utrNumber !== 'string')
      return res.status(400).json({ message: 'Invalid UTR number' });

    const finalProof = proofUrl || screenshotUrl || '';
    if (finalProof) {
      const checkProof = validateBase64Upload(finalProof);
      if (!checkProof.valid) {
        return res.status(400).json({ message: 'Invalid deposit proof file: ' + checkProof.error });
      }
    }

    const cleanUtr = utrNumber ? String(utrNumber).trim() : '';
    if (cleanUtr && cleanUtr.length > 50) {
      return res.status(400).json({ message: 'UTR number is too long (maximum 50 characters)' });
    }

    if (cleanUtr) {
      // Check if this UTR has already been submitted in any approved, completed, pending, or hold transaction
      const escapedUtr = cleanUtr.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const existingMatch = await Transaction.findOne({
        utrNumber: { $regex: new RegExp(`^${escapedUtr}$`, 'i') },
        status: { $in: ['approved', 'completed', 'pending', 'hold'] }
      });

      if (existingMatch) {
        return res.status(400).json({
          message: 'Aap already is UTR ki request bhej chuke ho. Kripya verification ka intezar karein.'
        });
      }
    }

    const txn = await Transaction.create({
      userId: req.user._id,
      type: 'deposit',
      amount: numAmount,
      method,
      utrNumber: cleanUtr,
      proofUrl: finalProof,
      screenshotUrl: finalProof,
      status: 'pending',
      isHold: false,
      holdReason: '',
      remarks: `Deposit Request (UTR: ${cleanUtr || 'Evidence attached'})`
    });
    
    res.json({
      message: '✅ Deposit request with evidence submitted. Awaiting admin approval.',
      txn
    });
  } catch (err) {
    res.status(500).json({ message: 'Something went wrong. Please try again.' });
  }
});

// Withdrawal Request (Money Out - 24 Hours SLA for <= ₹5000, 72 Hours SLA for > ₹5000)
router.post('/withdraw', protect, async (req, res) => {
  const { amount, method, paymentDetails, sourceWallet = 'main' } = req.body;

  const user = await User.findById(req.user._id);
  if (!user) return res.status(404).json({ message: 'User not found' });
  if (user.kycStatus !== 'verified') {
    return res.status(403).json({
      message: 'Withdrawal karne ke liye KYC Verification zaroori hai. Kripya pehle apna KYC document submit aur verify karwayein.',
      requireKyc: true
    });
  }

  const numAmount = Number(amount);
  if (!amount || isNaN(numAmount) || numAmount < 1)
    return res.status(400).json({ message: 'Withdrawal amount must be at least ₹1' });

  if (!['upi', 'bank'].includes(method))
    return res.status(400).json({ message: 'Method must be upi or bank' });
  if (paymentDetails && typeof paymentDetails !== 'object')
    return res.status(400).json({ message: 'Invalid payment details' });

  const isProfitSource = sourceWallet === 'profit';
  const field = isProfitSource ? 'profitBalance' : 'balance';
  const available = user[field] || 0;
  if (available < numAmount) {
    return res.status(400).json({
      message: `Insufficient balance in ${isProfitSource ? 'Profit Wallet' : 'Primary Wallet'}. Available: ₹${available}`
    });
  }

  // SLA based on request amount:
  // <= ₹5,000 => Admin processes within 24 hours
  // > ₹5,000 => Admin processes within 72 hours
  const isUnder5k = numAmount <= 5000;
  const slaHours = isUnder5k ? 24 : 72;
  const slaLabel = isUnder5k ? '24 Hours SLA (Under ₹5,000)' : '72 Hours SLA (Above ₹5,000)';

  const session = await mongoose.startSession();

  try {
    let txn, newBalance, newProfitBalance;

    await session.withTransaction(async () => {
      // Hold/deduct balance atomically so user cannot double-spend
      const updatedUser = await User.findOneAndUpdate(
        { _id: req.user._id, [field]: { $gte: numAmount } },
        { $inc: { [field]: -numAmount } },
        { new: true, session }
      );
      if (!updatedUser) {
        const e = new Error('Insufficient balance');
        e.status = 400;
        throw e;
      }
      newBalance = updatedUser.balance;
      newProfitBalance = updatedUser.profitBalance;

      if (!isProfitSource) {
        await User.findByIdAndUpdate(req.user._id, { $min: { lowestBalance24h: newBalance } }, { session });
      }

      const created = await Transaction.create(
        [{
          userId: req.user._id,
          type: 'withdrawal',
          amount: numAmount,
          method,
          paymentDetails,
          sourceWallet: isProfitSource ? 'profit' : 'main',
          slaHours,
          slaLabel,
          status: 'pending',
          remarks: `Money Out to ${method.toUpperCase()} [${slaLabel}]`
        }],
        { session }
      );
      txn = created[0];
    });

    const successMessage = isUnder5k
      ? '✅ Withdrawal request submitted! ₹5,000 tak ki request 24 ghante ke andar Admin dwara approve aur transfer kar di jayegi.'
      : '🛡️ High-value withdrawal request submitted! ₹5,000 se upar ki request verification ke baad 72 ghante ke darmiyan Admin dwara approve aur transfer kar di jayegi.';

    res.json({
      message: successMessage,
      txn,
      slaHours,
      newBalance,
      newProfitBalance
    });
  } catch (err) {
    res.status(err.status || 500).json({ message: err.status ? err.message : 'Something went wrong. Please try again.' });
  } finally {
    session.endSession();
  }
});

// Get My Transactions
router.get('/my', protect, async (req, res) => {
  try {
    let user = await User.findById(req.user._id);
    if (user) {
      const { processDailyYield } = require('./user');
      if (processDailyYield) await processDailyYield(user);
    }
    const txns = await Transaction.find({ userId: req.user._id }).sort({ createdAt: -1 });
    res.json(txns);
  } catch (err) {
    res.status(500).json({ message: 'Something went wrong. Please try again.' });
  }
});

module.exports = router;