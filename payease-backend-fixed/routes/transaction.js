const express = require('express');
const mongoose = require('mongoose');
const Transaction = require('../models/Transaction');
const User = require('../models/User');
const { protect } = require('../middleware/auth');
const { isValidAmount } = require('../utils/validateAmount');
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
router.post('/transfer', protect, async (req, res) => {
  const { recipient: rawRecipient, amount: rawAmount, notes } = req.body;

  const senderUser = await User.findById(req.user._id);
  if (!senderUser) return res.status(404).json({ message: 'User not found' });
  if (senderUser.kycStatus !== 'verified') {
    return res.status(403).json({
      message: 'KYC Verification zaroori hai! Paise transfer karne ke liye kripya pehle apna KYC document submit aur verify karwayein.',
      requireKyc: true
    });
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

  const session = await mongoose.startSession();
  try {
    let senderTxn, receiverTxn, senderNewBalance;

    await session.withTransaction(async () => {
      // Atomic deduction with balance guard on sender
      const updatedSender = await User.findOneAndUpdate(
        { _id: req.user._id, balance: { $gte: amount } },
        { $inc: { balance: -amount } },
        { new: true, session }
      );

      if (!updatedSender) {
        throw Object.assign(
          new Error(`Aapke wallet me paryapt balance nahi hai. Available: ₹${req.user.balance || 0}`),
          { status: 400 }
        );
      }
      senderNewBalance = updatedSender.balance;

      // Track lowest balance in 24h window for yield calculation (minimum-balance rule)
      if (updatedSender.lowestBalance24h === undefined || updatedSender.lowestBalance24h === null ||
          senderNewBalance < updatedSender.lowestBalance24h) {
        await User.findByIdAndUpdate(req.user._id, { $min: { lowestBalance24h: senderNewBalance } }, { session });
      }

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
        remarks: notes ? `Transfer to ${recipientUser.name}: ${notes}` : `Sent to ${recipientUser.name} (${receiverIdStr})`
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
      newBalance: senderNewBalance
    });
  } catch (err) {
    res.status(err.status || 500).json({ message: err.message || 'Transfer failed' });
  } finally {
    session.endSession();
  }
});

// Deposit Request
router.post('/deposit', protect, async (req, res) => {
  try {
    const { amount, method, utrNumber } = req.body;

    if (!isValidAmount(amount, 100, 500000))
      return res.status(400).json({ message: 'Amount must be between ₹100 and ₹5,00,000' });

    if (!['upi', 'bank'].includes(method))
      return res.status(400).json({ message: 'Method must be upi or bank' });

    if (utrNumber && typeof utrNumber !== 'string')
      return res.status(400).json({ message: 'Invalid UTR number' });

    const txn = await Transaction.create({
      userId: req.user._id,
      type: 'deposit',
      amount,
      method,
      utrNumber,
      status: 'pending'
    });
    
    res.json({ message: 'Deposit request submitted. Awaiting admin approval.', txn });
  } catch (err) {
    res.status(500).json({ message: 'Something went wrong. Please try again.' });
  }
});

// Withdrawal Request
router.post('/withdraw', protect, async (req, res) => {
  const { amount, method, paymentDetails } = req.body;

  const user = await User.findById(req.user._id);
  if (!user) return res.status(404).json({ message: 'User not found' });
  if (user.kycStatus !== 'verified') {
    return res.status(403).json({
      message: 'Withdrawal karne ke liye KYC Verification zaroori hai. Kripya pehle apna KYC document submit aur verify karwayein.',
      requireKyc: true
    });
  }

  if (!isValidAmount(amount, 100, 500000))
    return res.status(400).json({ message: 'Amount must be between ₹100 and ₹5,00,000' });

  if (!['upi', 'bank'].includes(method))
    return res.status(400).json({ message: 'Method must be upi or bank' });
  if (paymentDetails && typeof paymentDetails !== 'object')
    return res.status(400).json({ message: 'Invalid payment details' });

  const autoApprove = amount < 5000;
  const session = await mongoose.startSession();

  try {
    let txn, newBalance;

    await session.withTransaction(async () => {
      if (autoApprove) {
        const updatedUser = await User.findOneAndUpdate(
          { _id: req.user._id, balance: { $gte: amount } },
          { $inc: { balance: -amount } },
          { new: true, session }
        );
        if (!updatedUser) {
          const e = new Error('Insufficient balance');
          e.status = 400;
          throw e;
        }
        newBalance = updatedUser.balance;

        // Track lowest balance for yield calculation (minimum-balance rule)
        await User.findByIdAndUpdate(req.user._id, { $min: { lowestBalance24h: newBalance } }, { session });

        const created = await Transaction.create(
          [{ userId: req.user._id, type: 'withdrawal', amount, method, paymentDetails, status: 'completed' }],
          { session }
        );
        txn = created[0];
      } else {
        const user = await User.findById(req.user._id).session(session);
        if (user.balance < amount) {
          const e = new Error('Insufficient balance');
          e.status = 400;
          throw e;
        }

        const created = await Transaction.create(
          [{ userId: req.user._id, type: 'withdrawal', amount, method, paymentDetails, status: 'pending' }],
          { session }
        );
        txn = created[0];
      }
    });

    if (autoApprove) {
      return res.json({ message: '✅ Withdrawal processed automatically!', txn, newBalance });
    }
    res.json({ message: '⏳ Amount above ₹5000 requires admin approval.', txn });
  } catch (err) {
    res.status(err.status || 500).json({ message: err.status ? err.message : 'Something went wrong. Please try again.' });
  } finally {
    session.endSession();
  }
});

// Get My Transactions
router.get('/my', protect, async (req, res) => {
  try {
    const txns = await Transaction.find({ userId: req.user._id }).sort({ createdAt: -1 });
    res.json(txns);
  } catch (err) {
    res.status(500).json({ message: 'Something went wrong. Please try again.' });
  }
});

module.exports = router;