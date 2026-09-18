const express = require('express');
const mongoose = require('mongoose');
const Transaction = require('../models/Transaction');
const User = require('../models/User');
const Loan = require('../models/Loan');
const { protect, admin } = require('../middleware/auth');
const router = express.Router();

// Helper: MongoDB ObjectId format valid hai ya nahi, ye check karta hai
// (isse galat/fake ID bhejne se CastError crash hone se bach jata hai)
function isValidId(id) {
  return mongoose.Types.ObjectId.isValid(id);
}

// All pending transactions
router.get('/transactions/pending', protect, admin, async (req, res) => {
  try {
    const txns = await Transaction.find({ status: 'pending' })
      .populate('userId', 'name email phone')
      .sort({ createdAt: -1 });
    res.json(txns);
  } catch (err) {
    res.status(500).json({ message: 'Something went wrong. Please try again.' });
  }
});

// Approve transaction
router.post('/transaction/:id/approve', protect, admin, async (req, res) => {
  if (!isValidId(req.params.id)) return res.status(400).json({ message: 'Invalid transaction ID' });

  const session = await mongoose.startSession();
  try {
    let resultTxn;

    // Poora approve-flow ek DB transaction ke andar: agar same transaction
    // par 2 approve request (double-click / race) ek saath aayein, MongoDB
    // dusri request ko pehli ke commit hone tak serialize kar deta hai -- isse
    // double-approve (balance 2 baar credit/debit hona) possible nahi rahta.
    await session.withTransaction(async () => {
      const txn = await Transaction.findById(req.params.id).session(session);
      if (!txn || txn.status !== 'pending') {
        const e = new Error('Invalid transaction');
        e.status = 400;
        throw e;
      }

      if (txn.type === 'deposit') {
        const user = await User.findByIdAndUpdate(
          txn.userId,
          { $inc: { balance: txn.amount } },
          { session, new: true }
        );
        if (!user) {
          const e = new Error('User not found');
          e.status = 404;
          throw e;
        }
        txn.status = 'approved';
      } else {
        // balance sirf tabhi ghatao jab woh abhi bhi (atomically) sufficient ho
        const user = await User.findOneAndUpdate(
          { _id: txn.userId, balance: { $gte: txn.amount } },
          { $inc: { balance: -txn.amount } },
          { session, new: true }
        );
        if (!user) {
          const e = new Error('User has insufficient balance');
          e.status = 400;
          throw e;
        }
        txn.status = 'completed';
      }

      txn.approvedBy = req.user._id;
      await txn.save({ session });
      resultTxn = txn;
    });

    res.json({ message: 'Transaction approved', txn: resultTxn });
  } catch (err) {
    res.status(err.status || 500).json({ message: err.status ? err.message : 'Something went wrong. Please try again.' });
  } finally {
    session.endSession();
  }
});

// Reject transaction
router.post('/transaction/:id/reject', protect, admin, async (req, res) => {
  try {
    if (!isValidId(req.params.id)) return res.status(400).json({ message: 'Invalid transaction ID' });

    // remarks ko string me convert karo -> object/array bhej ke DB corrupt
    // karne ki koshish (NoSQL injection-style) block ho jaye
    const remarks = typeof req.body.remarks === 'string' ? req.body.remarks : 'Rejected by admin';

    // BUG FIX: pehle ye kisi bhi status wali transaction ko 'rejected' bana deta
    // tha -- agar koi transaction already 'approved'/'completed' ho chuki thi
    // (balance already credit/debit ho gaya tha) aur uske baad reject call ho,
    // to status 'rejected' ho jata tha PAR balance kabhi revert nahi hota --
    // ledger aur real balance mismatch ho jata. Ab sirf 'pending' transaction
    // hi reject ho sakti hai, atomic condition ke saath.
    const txn = await Transaction.findOneAndUpdate(
      { _id: req.params.id, status: 'pending' },
      { $set: { status: 'rejected', remarks } },
      { new: true }
    );
    if (!txn) return res.status(400).json({ message: 'Transaction not found or already processed' });

    res.json({ message: 'Transaction rejected', txn });
  } catch (err) {
    res.status(500).json({ message: 'Something went wrong. Please try again.' });
  }
});

// All users
router.get('/users', protect, admin, async (req, res) => {
  try {
    const users = await User.find().select('-password').sort({ createdAt: -1 });
    res.json(users);
  } catch (err) {
    res.status(500).json({ message: 'Something went wrong. Please try again.' });
  }
});

// Block/Unblock user
router.post('/user/:id/toggle-block', protect, admin, async (req, res) => {
  try {
    if (!isValidId(req.params.id)) return res.status(400).json({ message: 'Invalid user ID' });

    // Admin apne aap ko block na kar sake (isse khud hi apna access lock kar sakta tha)
    if (req.params.id === req.user._id.toString())
      return res.status(400).json({ message: 'You cannot block your own account' });

    // Aggregation-pipeline update se toggle atomic hai (isBlocked ke current
    // DB value ko flip karta hai in one step) -- pehle wala read-then-write
    // pattern tha, jisme rapid double-click se galat end-state ban sakta tha
    const user = await User.findOneAndUpdate(
      { _id: req.params.id },
      [{ $set: { isBlocked: { $not: '$isBlocked' } } }],
      { new: true }
    );
    if (!user) return res.status(404).json({ message: 'User not found' });

    res.json({ message: `User ${user.isBlocked ? 'blocked' : 'unblocked'}` });
  } catch (err) {
    res.status(500).json({ message: 'Something went wrong. Please try again.' });
  }
});

// Admin: Set individual user custom interest rate
router.put('/user/:id/interest-rate', protect, admin, async (req, res) => {
  try {
    if (!isValidId(req.params.id)) return res.status(400).json({ message: 'Invalid user ID' });
    const rate = Number(req.body.interestRate);
    if (isNaN(rate) || rate < 1 || rate > 100) {
      return res.status(400).json({ message: 'Interest rate must be between 1% and 100%' });
    }

    const user = await User.findByIdAndUpdate(
      req.params.id,
      { $set: { interestRate: rate } },
      { new: true }
    ).select('-password');

    if (!user) return res.status(404).json({ message: 'User not found' });
    res.json({ message: `Custom interest rate of ${rate}% set for ${user.name}`, user });
  } catch (err) {
    res.status(500).json({ message: 'Failed to update interest rate' });
  }
});

// Admin: Unlock/Lock Platinum Card or change card tier
router.post('/user/:id/card-tier', protect, admin, async (req, res) => {
  try {
    if (!isValidId(req.params.id)) return res.status(400).json({ message: 'Invalid user ID' });
    const { cardTier, unlocked, reason } = req.body;

    const user = await User.findById(req.params.id);
    if (!user) return res.status(404).json({ message: 'User not found' });

    if (!user.cardStatus) {
      user.cardStatus = {
        silver: { unlocked: true, cardNumber: `4532 ${Math.floor(1000 + Math.random() * 9000)} ${Math.floor(1000 + Math.random() * 9000)} 1200` },
        platinum: { unlocked: false, cardNumber: `5421 ${Math.floor(1000 + Math.random() * 9000)} ${Math.floor(1000 + Math.random() * 9000)} 8840` }
      };
    }

    if (cardTier) user.cardTier = cardTier;
    if (typeof unlocked === 'boolean') {
      user.cardStatus.platinum.unlocked = unlocked;
      if (unlocked) {
        user.cardTier = 'platinum';
        user.cardStatus.platinum.unlockReason = reason || 'Unlocked by Admin Privilege';
      } else {
        user.cardTier = 'silver';
      }
    }

    user.markModified('cardStatus');
    await user.save();

    res.json({
      message: `Card updated: ${user.cardTier.toUpperCase()} for ${user.name}`,
      cardTier: user.cardTier,
      cardStatus: user.cardStatus
    });
  } catch (err) {
    res.status(500).json({ message: 'Failed to update card status' });
  }
});

// Dashboard stats
router.get('/stats', protect, admin, async (req, res) => {
  try {
    const totalUsers = await User.countDocuments({ role: 'user' });
    const pendingTxns = await Transaction.countDocuments({ status: 'pending' });
    const totalDeposits = await Transaction.aggregate([
      { $match: { type: 'deposit', status: 'approved' } },
      { $group: { _id: null, total: { $sum: '$amount' } } }
    ]);
    const pendingLoans = await Loan.countDocuments({ status: 'pending' });

    res.json({
      totalUsers,
      pendingTxns,
      totalDeposits: totalDeposits[0]?.total || 0,
      pendingLoans
    });
  } catch (err) {
    res.status(500).json({ message: 'Something went wrong. Please try again.' });
  }
});

// ------------------ REAL-TIME NOTIFICATIONS (SSE & DB) ------------------
const Notification = require('../models/Notification');
const { registerClient, removeClient } = require('../utils/notifier');
const jwt = require('jsonwebtoken');

// SSE stream for Admin
router.get('/notifications/stream', (req, res) => {
  // Extract token from query or auth header
  const token = req.query.token || (req.headers.authorization && req.headers.authorization.split(' ')[1]);
  if (!token) return res.status(401).json({ message: 'Authentication required' });

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    User.findById(decoded.id).then(user => {
      if (!user || user.role !== 'admin') {
        return res.status(403).end();
      }

      res.setHeader('Content-Type', 'text/event-stream');
      res.setHeader('Cache-Control', 'no-cache');
      res.setHeader('Connection', 'keep-alive');
      res.setHeader('X-Accel-Buffering', 'no');
      res.flushHeaders();

      // Initial connection greeting
      res.write(`data: ${JSON.stringify({ type: 'connected', message: 'SSE connected' })}\n\n`);

      registerClient(res);

      const keepAlive = setInterval(() => {
        try {
          res.write(': keepalive\n\n');
        } catch (e) {
          clearInterval(keepAlive);
          removeClient(res);
        }
      }, 25000);

      req.on('close', () => {
        clearInterval(keepAlive);
        removeClient(res);
      });
    }).catch(() => res.status(401).end());
  } catch (err) {
    return res.status(401).json({ message: 'Invalid or expired token' });
  }
});

// Get recent notifications
router.get('/notifications', protect, admin, async (req, res) => {
  try {
    const notifications = await Notification.find().sort({ createdAt: -1 }).limit(50);
    const unreadCount = await Notification.countDocuments({ read: false });
    res.json({ notifications, unreadCount });
  } catch (err) {
    res.status(500).json({ message: 'Something went wrong' });
  }
});

// Mark notification read
router.patch('/notifications/:id/read', protect, admin, async (req, res) => {
  try {
    await Notification.findByIdAndUpdate(req.params.id, { read: true });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ message: 'Something went wrong' });
  }
});

// Mark all read
router.patch('/notifications/read-all', protect, admin, async (req, res) => {
  try {
    await Notification.updateMany({ read: false }, { read: true });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ message: 'Something went wrong' });
  }
});

module.exports = router;

