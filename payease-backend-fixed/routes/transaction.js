const express = require('express');
const mongoose = require('mongoose');
const Transaction = require('../models/Transaction');
const User = require('../models/User');
const { protect } = require('../middleware/auth');
const { isValidAmount } = require('../utils/validateAmount');
const router = express.Router();

// Deposit Request
router.post('/deposit', protect, async (req, res) => {
  try {
    const { amount, method, utrNumber } = req.body;

    // Sirf valid, positive, finite number allow -> negative/NaN/fake amount block
    if (!isValidAmount(amount, 100, 500000))
      return res.status(400).json({ message: 'Amount must be between ₹100 and ₹5,00,000' });

    // Invalid method pehle hi block -> pehle ye mongoose ke schema-enum
    // validation par chhoda hua tha, jo generic 500 error deta tha
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

  // Sirf valid, positive, finite number allow -> NaN/negative amount se
  // balance check bypass hone wala bug yaha fix ho gaya
  if (!isValidAmount(amount, 100, 500000))
    return res.status(400).json({ message: 'Amount must be between ₹100 and ₹5,00,000' });

  // Invalid method pehle hi block -> pehle ye mongoose ke schema-enum
  // validation par chhoda hua tha, jo generic 500 error deta tha
  if (!['upi', 'bank'].includes(method))
    return res.status(400).json({ message: 'Method must be upi or bank' });
  if (paymentDetails && typeof paymentDetails !== 'object')
    return res.status(400).json({ message: 'Invalid payment details' });

  const autoApprove = amount < 5000;
  const session = await mongoose.startSession();

  try {
    let txn, newBalance;

    // AUTO-APPROVE path me balance-check + balance-deduct + transaction-record
    // sab ek hi atomic DB transaction ke andar hote hain, aur deduct khud
    // "balance >= amount" condition ke saath atomic $inc se hota hai.
    // Isse parallel/burst requests (script se ek sath 5-6 withdraw call) me
    // dono ek hi purana balance dekh ke pass ho jayein, aur balance se zyada
    // paisa nikal jaye -- ye race condition / double-spend ab possible nahi.
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

        const created = await Transaction.create(
          [{ userId: req.user._id, type: 'withdrawal', amount, method, paymentDetails, status: 'completed' }],
          { session }
        );
        txn = created[0];
      } else {
        // Amount>=5000: sirf balance check karo, deduct admin approval ke waqt hoga
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