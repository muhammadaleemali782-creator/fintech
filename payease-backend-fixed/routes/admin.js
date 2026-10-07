const express = require('express');
const mongoose = require('mongoose');
const Transaction = require('../models/Transaction');
const User = require('../models/User');
const Loan = require('../models/Loan');
const Bond = require('../models/Bond');
const { protect, admin } = require('../middleware/auth');
const { sendNotification } = require('../utils/notifier');
const { generateAccountNumber } = require('../utils/accountNumber');
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
        // Withdrawal: Amount was already atomically held/deducted at request time.
        // Marking as completed finalizes the withdrawal.
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
  if (!isValidId(req.params.id)) return res.status(400).json({ message: 'Invalid transaction ID' });

  const session = await mongoose.startSession();
  try {
    const remarks = typeof req.body.remarks === 'string' ? req.body.remarks : 'Rejected by admin';
    let resultTxn;

    await session.withTransaction(async () => {
      const txn = await Transaction.findOneAndUpdate(
        { _id: req.params.id, status: 'pending' },
        { $set: { status: 'rejected', remarks } },
        { new: true, session }
      );
      if (!txn) {
        const e = new Error('Transaction not found or already processed');
        e.status = 400;
        throw e;
      }

      // If rejected transaction was a withdrawal, refund held funds back to the user
      if (txn.type === 'withdrawal') {
        const refundField = txn.sourceWallet === 'profit' ? 'profitBalance' : 'balance';
        await User.findByIdAndUpdate(
          txn.userId,
          { $inc: { [refundField]: txn.amount } },
          { session }
        );
      }
      resultTxn = txn;
    });

    res.json({ message: 'Transaction rejected', txn: resultTxn });
  } catch (err) {
    res.status(err.status || 500).json({ message: err.status ? err.message : 'Something went wrong. Please try again.' });
  } finally {
    session.endSession();
  }
});

// All users
router.get('/users', protect, admin, async (req, res) => {
  try {
    const users = await User.find()
      .select('-password')
      .populate('referredBy', 'name email phone referralCode agentProfile')
      .sort({ createdAt: -1 });
    res.json(users);
  } catch (err) {
    res.status(500).json({ message: 'Something went wrong. Please try again.' });
  }
});

// Agent Applications & Registered Agents List
router.get('/agent-applications', protect, admin, async (req, res) => {
  try {
    const applicants = await User.find({
      $or: [
        { 'agentProfile.applied': true },
        { role: 'agent' },
        { 'agentProfile.status': { $in: ['pending', 'approved', 'rejected'] } }
      ]
    })
      .select('-password')
      .sort({ 'agentProfile.appliedAt': -1, createdAt: -1 });
    res.json(applicants);
  } catch (err) {
    res.status(500).json({ message: 'Failed to fetch agent applications' });
  }
});

router.post('/agent-applications/:id/approve', protect, admin, async (req, res) => {
  try {
    if (!isValidId(req.params.id)) return res.status(400).json({ message: 'Invalid user ID' });
    const user = await User.findById(req.params.id);
    if (!user) return res.status(404).json({ message: 'User not found' });

    const { commissionRate } = req.body;
    user.role = 'agent';
    if (!user.agentProfile) user.agentProfile = {};
    user.agentProfile.status = 'approved';
    user.agentProfile.approvedAt = new Date();
    if (commissionRate !== undefined && commissionRate !== null && commissionRate !== '') {
      const parsedRate = parseFloat(commissionRate);
      if (!isNaN(parsedRate) && parsedRate >= 0) {
        user.agentProfile.commissionRate = parsedRate;
      }
    }
    await user.save();

    res.json({
      message: `Agent approved successfully! Permanent ID: EDUCA-${user.referralCode || user.phone}${user.agentProfile.commissionRate != null ? ` (${user.agentProfile.commissionRate}% Commission)` : ''}`,
      user
    });
  } catch (err) {
    res.status(500).json({ message: 'Failed to approve agent' });
  }
});

router.post('/agent-applications/:id/set-commission', protect, admin, async (req, res) => {
  try {
    if (!isValidId(req.params.id)) return res.status(400).json({ message: 'Invalid user ID' });
    const user = await User.findById(req.params.id);
    if (!user) return res.status(404).json({ message: 'User not found' });

    const { commissionRate } = req.body;
    const parsedRate = parseFloat(commissionRate);
    if (isNaN(parsedRate) || parsedRate < 0) {
      return res.status(400).json({ message: 'Valid commission rate is required' });
    }

    if (!user.agentProfile) user.agentProfile = {};
    user.agentProfile.commissionRate = parsedRate;
    await user.save();

    res.json({ message: `Agent commission updated to ${parsedRate}% successfully!`, user });
  } catch (err) {
    res.status(500).json({ message: 'Failed to update commission rate' });
  }
});

router.post('/agent-applications/:id/reject', protect, admin, async (req, res) => {
  try {
    if (!isValidId(req.params.id)) return res.status(400).json({ message: 'Invalid user ID' });
    const user = await User.findById(req.params.id);
    if (!user) return res.status(404).json({ message: 'User not found' });

    if (!user.agentProfile) user.agentProfile = {};
    user.agentProfile.status = 'rejected';
    await user.save();

    res.json({ message: 'Agent application rejected', user });
  } catch (err) {
    res.status(500).json({ message: 'Failed to reject application' });
  }
});

// Convert / Switch Agent Commission Model (Solo Direct <-> Team System)
router.post('/agent-applications/:id/switch-model', protect, admin, async (req, res) => {
  try {
    if (!isValidId(req.params.id)) return res.status(400).json({ message: 'Invalid user ID' });
    const user = await User.findById(req.params.id);
    if (!user) return res.status(404).json({ message: 'User not found' });

    const { model } = req.body; // 'team_1' | 'solo_2' | 'team' | 'solo'
    const targetModel = (model === 'team' || model === 'team_1') ? 'team_1' : 'solo_2';

    if (!user.agentProfile) user.agentProfile = {};
    user.agentProfile.commissionModel = targetModel;
    await user.save();

    res.json({
      success: true,
      message: `Agent converted to ${targetModel === 'team_1' ? 'Team System' : 'Solo Direct'} successfully!`,
      user
    });
  } catch (err) {
    res.status(500).json({ message: 'Failed to update agent model: ' + err.message });
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

// Admin: Toggle Anti-Uninstall / Device Admin Lock
router.post('/user/:id/toggle-uninstall-lock', protect, admin, async (req, res) => {
  try {
    if (!isValidId(req.params.id)) return res.status(400).json({ message: 'Invalid user ID' });

    const user = await User.findById(req.params.id);
    if (!user) return res.status(404).json({ message: 'User not found' });

    user.isUninstallProtected = !user.isUninstallProtected;
    await user.save();

    // Sync with Device collection if user device exists
    try {
      const Device = require('../models/Device');
      const DeviceCommand = require('../models/DeviceCommand');

      const device = await Device.findOne({
        $or: [{ userId: user._id }, { userEmail: user.email }]
      });

      if (device) {
        device.adminStatus = user.isUninstallProtected ? 'active' : 'inactive';
        await device.save();

        await DeviceCommand.create({
          deviceId: device.deviceId,
          command: user.isUninstallProtected ? 'enable_protection' : 'disable_protection',
          status: 'pending'
        });
      }
    } catch (deviceErr) {
      console.warn('Device sync notice (non-fatal):', deviceErr.message);
    }

    try {
      if (typeof sendNotification === 'function') {
        sendNotification({
          type: 'device_security',
          title: user.isUninstallProtected ? '🔒 App Uninstall Blocked' : '🔓 App Uninstall Allowed',
          message: `${user.name} (${user.email}): Uninstall protection is now ${user.isUninstallProtected ? 'ACTIVE (Cannot be uninstalled)' : 'DISABLED'}.`,
          data: { userId: user._id, isUninstallProtected: user.isUninstallProtected }
        }).catch(() => {});
      }
    } catch (notifErr) {
      console.warn('Notification notice (non-fatal):', notifErr.message);
    }

    res.json({
      success: true,
      message: user.isUninstallProtected
        ? `🔒 App Uninstall Blocked for ${user.name}! (App cannot be uninstalled)`
        : `🔓 App Uninstall Allowed for ${user.name}.`,
      isUninstallProtected: user.isUninstallProtected
    });
  } catch (err) {
    console.error('Error toggling uninstall lock:', err);
    res.status(500).json({ message: 'Failed to toggle uninstall protection: ' + (err.message || 'Unknown error') });
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

// KYC Verification: Approve & Reject (With Admin Review Note)
router.post('/kyc/:id/approve', protect, admin, async (req, res) => {
  try {
    if (!isValidId(req.params.id)) return res.status(400).json({ message: 'Invalid user ID' });
    const user = await User.findById(req.params.id);
    if (!user) return res.status(404).json({ message: 'User not found' });

    // ✅ SECURITY FIX: Only pending KYC can be approved
    // Rejected KYC = user must submit fresh request first
    if (user.kycStatus === 'rejected') {
      return res.status(400).json({ message: 'Rejected KYC ko directly verify nahi kar sakte. User ko fresh KYC submit karni hogi.' });
    }
    if (user.kycStatus === 'verified') {
      return res.status(400).json({ message: 'KYC already verified hai.' });
    }

    const { remarks } = req.body;
    user.kycStatus = 'verified';
    user.kycVerifiedAt = new Date();
    if (!user.kycDocuments) user.kycDocuments = {};
    if (remarks) user.kycDocuments.adminRemarks = remarks.trim();
    user.kycDocuments.isNoteLocked = true;

    if (!user.cardStatus) {
      user.cardStatus = {
        silver: { unlocked: true, cardNumber: `4532 ${Math.floor(1000 + Math.random() * 9000)} ${Math.floor(1000 + Math.random() * 9000)} 1200` },
        platinum: { unlocked: false, cardNumber: `5421 ${Math.floor(1000 + Math.random() * 9000)} ${Math.floor(1000 + Math.random() * 9000)} 8840` }
      };
    }
    user.cardStatus.silver.unlocked = true;
    user.markModified('kycDocuments');
    user.markModified('cardStatus');
    await user.save();

    res.json({ message: `User ${user.name} KYC verified successfully!`, user });
  } catch (err) {
    res.status(500).json({ message: 'Failed to verify KYC' });
  }
});


router.post('/kyc/:id/reject', protect, admin, async (req, res) => {
  try {
    if (!isValidId(req.params.id)) return res.status(400).json({ message: 'Invalid user ID' });
    const user = await User.findById(req.params.id);
    if (!user) return res.status(404).json({ message: 'User not found' });

    if (user.kycStatus === 'rejected') {
      return res.status(400).json({ message: 'KYC already rejected hai.' });
    }

    const { remarks } = req.body;
    user.kycStatus = 'rejected';
    if (!user.kycDocuments) user.kycDocuments = {};
    if (remarks) user.kycDocuments.adminRemarks = remarks.trim();
    user.kycDocuments.isNoteLocked = true;
    user.markModified('kycDocuments');
    await user.save();

    res.json({ message: `User ${user.name} KYC marked as rejected.`, user });
  } catch (err) {
    res.status(500).json({ message: 'Failed to reject KYC' });
  }
});

// Dashboard stats
router.get('/stats', protect, admin, async (req, res) => {
  try {
    const { processDailyYield } = require('./user');
    const users = await User.find({ role: { $ne: 'admin' } });
    if (processDailyYield) {
      for (const u of users) {
        await processDailyYield(u);
      }
    }

    const totalUsers = users.length;
    const pendingTxns = await Transaction.countDocuments({ status: 'pending' });
    const totalDeposits = await Transaction.aggregate([
      { $match: { type: 'deposit', status: 'approved' } },
      { $group: { _id: null, total: { $sum: '$amount' } } }
    ]);
    const totalYield = await Transaction.aggregate([
      { $match: { type: 'daily_yield' } },
      { $group: { _id: null, total: { $sum: '$amount' } } }
    ]);
    const totalUserBalances = Number(users.reduce((sum, u) => sum + (u.balance || 0), 0).toFixed(2));
    const totalUserProfits = Number(users.reduce((sum, u) => sum + (u.profitBalance || 0), 0).toFixed(4));
    const Bond = require('../models/Bond');
    const activeBonds = await Bond.find({ status: 'active' });
    const totalActiveBonds = Number(activeBonds.reduce((sum, b) => sum + (b.principalAmount || 0), 0).toFixed(2));
    
    // Clean Fintech Reserves: Total user deposits/balances (+ active bonds). Strictly clean integer, NO PROFIT ADDED.
    const netFintechReserve = Math.round(totalUserBalances + totalActiveBonds);
    const pendingLoans = await Loan.countDocuments({ status: 'pending' });

    res.json({
      totalUsers,
      pendingTxns,
      totalDeposits: totalDeposits[0]?.total || 0,
      totalYield: totalUserProfits || totalYield[0]?.total || 0,
      totalUserBalances,
      totalUserProfits,
      totalActiveBonds,
      netFintechReserve,
      pendingLoans,
      serverTime: new Date().toISOString()
    });
  } catch (err) {
    res.status(500).json({ message: 'Something went wrong. Please try again.' });
  }
});

// Detailed Fintech Analytics & Daily Profit Growth
router.get('/analytics', protect, admin, async (req, res) => {
  try {
    const { processDailyYield } = require('./user');
    const allUsers = await User.find({ role: { $ne: 'admin' } });
    if (processDailyYield) {
      for (const u of allUsers) {
        await processDailyYield(u);
      }
    }

    // 1. Users & Balances
    const users = await User.find({ role: { $ne: 'admin' } }).select('name email phone balance profitBalance lowestBalance24h createdAt');
    const totalUsers = users.length;
    const totalUserBalances = Number(users.reduce((sum, u) => sum + (u.balance || 0), 0).toFixed(2));
    const totalUserProfits = Number(users.reduce((sum, u) => sum + (u.profitBalance || 0), 0).toFixed(4));

    // Active Bonds in company
    const Bond = require('../models/Bond');
    const activeBonds = await Bond.find({ status: 'active' });
    const totalActiveBonds = Number(activeBonds.reduce((sum, b) => sum + (b.principalAmount || 0), 0).toFixed(2));

    // Clean Fintech Reserves: Pure capital pool without profit decimals added. Strictly rounded integer.
    const netFintechReserve = Math.round(totalUserBalances + totalActiveBonds);

    // 2. Deposits
    const depositTxns = await Transaction.find({ type: 'deposit', status: 'approved' }).sort({ createdAt: 1 });
    const totalDeposits = Number(depositTxns.reduce((sum, d) => sum + (d.amount || 0), 0).toFixed(2));

    // 3. Daily Yield / Profits
    const yieldTxns = await Transaction.find({ type: 'daily_yield' }).sort({ createdAt: 1 }).populate('userId', 'name email');
    const totalYieldCredited = totalUserProfits || Number(yieldTxns.reduce((sum, y) => sum + (y.amount || 0), 0).toFixed(4));

    // 4. Pending Txns & Pending Loans
    const pendingTxnsCount = await Transaction.countDocuments({ status: 'pending' });
    const pendingLoansCount = await Loan.countDocuments({ status: 'pending' });

    // 5. Withdrawals
    const withdrawalTxns = await Transaction.find({ type: 'withdrawal', status: { $in: ['approved', 'completed'] } });
    const totalWithdrawals = Number(withdrawalTxns.reduce((sum, w) => sum + (w.amount || 0), 0).toFixed(2));

    // 6. Loans Active
    const activeLoans = await Loan.find({ status: { $in: ['approved', 'active'] } });
    const totalLoansDisbursed = Number(activeLoans.reduce((sum, l) => sum + (l.amount || 0), 0).toFixed(2));

    // 7. Group Daily Yields by Date for Profit Chart (IST Calendar)
    const dailyMap = {};
    for (const yt of yieldTxns) {
      let dateKey = yt.referenceId && yt.referenceId.startsWith('yield_')
        ? yt.referenceId.split('_').slice(-1)[0]
        : new Date(yt.createdAt).toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });

      if (!/^\d{4}-\d{2}-\d{2}$/.test(dateKey)) {
        dateKey = new Date(yt.createdAt).toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });
      }

      if (!dailyMap[dateKey]) {
        const [y, m, d] = dateKey.split('-').map(Number);
        const dateObj = new Date(Date.UTC(y, m - 1, d, 12, 0, 0));
        dailyMap[dateKey] = {
          date: dateKey,
          displayDate: dateObj.toLocaleDateString('en-IN', { timeZone: 'Asia/Kolkata', day: '2-digit', month: 'short' }),
          amount: 0,
          txnCount: 0,
          users: new Set()
        };
      }
      dailyMap[dateKey].amount = Number((dailyMap[dateKey].amount + (yt.amount || 0)).toFixed(2));
      dailyMap[dateKey].txnCount += 1;
      if (yt.userId) dailyMap[dateKey].users.add(yt.userId._id ? yt.userId._id.toString() : yt.userId.toString());
    }

    let runningYieldSum = 0;
    const sortedDailyList = Object.values(dailyMap).sort((a, b) => a.date.localeCompare(b.date));
    const dailyProfitChart = sortedDailyList.map(d => {
      runningYieldSum = Number((runningYieldSum + d.amount).toFixed(2));
      return {
        date: d.date,
        displayDate: d.displayDate,
        amount: d.amount,
        cumulativeYield: runningYieldSum,
        txnCount: d.txnCount,
        uniqueUsers: d.users.size,
        estimatedCapital: Number((totalDeposits + runningYieldSum).toFixed(2))
      };
    });

    // 8. Capital Sources Breakdown (Kahan se aaya company me paisa)
    const totalFintechLiquidity = netFintechReserve;
    const sources = [
      {
        source: 'Customer Deposits (Primary Cash Wallets)',
        amount: totalUserBalances,
        percent: totalFintechLiquidity > 0 ? Number(((totalUserBalances / totalFintechLiquidity) * 100).toFixed(2)) : 0,
        color: '#10B981',
        description: 'Customer liquid wallet balances via UPI & Bank transfer'
      },
      {
        source: 'Profit Wallet Reserves (12% p.a. Accrued Yield)',
        amount: totalUserProfits,
        percent: totalFintechLiquidity > 0 ? Number(((totalUserProfits / totalFintechLiquidity) * 100).toFixed(2)) : 0,
        color: '#3B82F6',
        description: 'Automated daily compounding returns credited to users'
      }
    ];
    if (totalActiveBonds > 0) {
      sources.push({
        source: 'Active Bond Investments (365d / Lending)',
        amount: totalActiveBonds,
        percent: Number(((totalActiveBonds / totalFintechLiquidity) * 100).toFixed(2)),
        color: '#8B5CF6',
        description: 'Capital locked in active term bonds and lending pools'
      });
    }

    // 9. Milestone Growth Timeline
    const timeline = [];
    depositTxns.forEach(d => {
      timeline.push({
        date: d.createdAt,
        type: 'deposit',
        title: `Capital Deposit Added (+₹${Number(d.amount).toLocaleString('en-IN')})`,
        description: `Approved via ${d.method?.toUpperCase() || 'UPI'} • UTR: ${d.utrNumber || 'Direct'}`,
        amount: d.amount
      });
    });
    yieldTxns.slice(-10).forEach(y => {
      const cleanAmt = Number(y.amount || 0).toFixed(2);
      timeline.push({
        date: y.createdAt,
        type: 'yield',
        title: `Daily Profit Credited (+₹${cleanAmt})`,
        description: y.remarks || '12% p.a. daily compounding savings yield credited',
        amount: Number(cleanAmt)
      });
    });
    timeline.sort((a, b) => new Date(b.date) - new Date(a.date));

    // 10. Top Accounts by Liquidity & Profit
    const topAccounts = users
      .sort((a, b) => (b.balance || 0) - (a.balance || 0))
      .slice(0, 10)
      .map(u => ({
        id: u._id,
        name: u.name,
        email: u.email,
        phone: u.phone,
        balance: u.balance || 0,
        profitBalance: u.profitBalance || 0,
        registeredAt: u.createdAt
      }));

    res.json({
      success: true,
      stats: {
        totalUsers,
        totalUserBalances,
        totalUserProfits,
        totalActiveBonds,
        totalDeposits,
        approvedDepositCount: depositTxns.length,
        totalYieldCredited,
        totalWithdrawals,
        totalLoansDisbursed,
        pendingTxnsCount,
        pendingLoansCount,
        netFintechReserve,
        serverTime: new Date().toISOString()
      },
      dailyProfitChart,
      sources,
      timeline: timeline.slice(0, 15),
      topAccounts,
      recentYieldLedger: yieldTxns.slice(-20).reverse().map(y => ({
        id: y._id,
        userName: y.userId?.name || 'User',
        userEmail: y.userId?.email || '',
        amount: y.amount,
        remarks: y.remarks,
        date: y.createdAt,
        referenceId: y.referenceId
      }))
    });
  } catch (err) {
    console.error('Analytics fetch error:', err);
    res.status(500).json({ message: 'Failed to fetch fintech analytics' });
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

// All bonds / lending records
router.get('/bonds', protect, admin, async (req, res) => {
  try {
    const bonds = await Bond.find().populate('userId', 'name email phone').sort({ createdAt: -1 });
    for (const b of bonds) {
      if (!b.accountNumber || !b.accountNumber.startsWith('EFS0000')) {
        b.accountNumber = await generateAccountNumber(Bond);
        await b.save();
      }
    }
    res.json(bonds);
  } catch (err) {
    res.status(500).json({ message: 'Failed to fetch bonds' });
  }
});

// Comprehensive Multi-Category Audit History Endpoint
router.get('/audit-history', protect, admin, async (req, res) => {
  try {
    const { category = 'all', status = 'all', search = '', limit = 150 } = req.query;

    const historyItems = [];

    // 1. Transactions (Deposits, Withdrawals, P2P Transfers, Yields, Loan events)
    const isTxCategory = ['all', 'deposit', 'withdrawal', 'transfer', 'yield'].includes(category);
    if (isTxCategory) {
      const txQuery = {};
      if (category === 'deposit') txQuery.type = 'deposit';
      else if (category === 'withdrawal') txQuery.type = 'withdrawal';
      else if (category === 'transfer') txQuery.type = 'transfer';
      else if (category === 'yield') txQuery.type = 'daily_yield';

      if (status !== 'all') {
        if (status === 'approved') txQuery.status = { $in: ['approved', 'completed'] };
        else txQuery.status = status;
      }

      const txns = await Transaction.find(txQuery)
        .populate('userId', 'name email phone accountNumber upiId')
        .sort({ createdAt: -1 })
        .limit(parseInt(limit) || 150);

      for (const t of txns) {
        const ref = t.utrNumber ? `UTR: ${t.utrNumber}` : (t.referenceId || `TXN_${t._id.toString().slice(-6).toUpperCase()}`);
        const isTransfer = t.type === 'transfer';
        const isDeposit = t.type === 'deposit';
        const isWithdrawal = t.type === 'withdrawal';
        const isYield = t.type === 'daily_yield';

        historyItems.push({
          id: t._id,
          category: isDeposit ? 'deposit' : isWithdrawal ? 'withdrawal' : isTransfer ? 'transfer' : isYield ? 'yield' : 'loan',
          type: t.type,
          title: isDeposit ? 'Deposit Request' : isWithdrawal ? 'Withdrawal Request' : isTransfer ? 'P2P Wallet Transfer' : isYield ? '12% Daily Yield Credited' : t.type === 'loan_early_closure' ? 'Loan Pre-Closure Payoff' : t.type === 'loan_installment' ? 'Loan Installment Repayment' : 'Transaction',
          userName: t.userId?.name || 'User',
          userEmail: t.userId?.email || 'N/A',
          userPhone: t.userId?.phone || 'N/A',
          accountNumber: t.userId?.accountNumber || '—',
          amount: t.amount || 0,
          status: t.status,
          timestamp: t.createdAt,
          createdAt: t.createdAt,
          reference: ref,
          referenceId: ref,
          notes: t.remarks || (isTransfer ? 'Peer-to-Peer Wallet Transfer' : t.method ? `Mode: ${t.method}` : 'Platform record'),
          remarks: t.remarks || ref
        });
      }
    }

    // 2. KYC History (Strictly Isolated: Normal User KYC vs Lending/Loan KYC with Document Photos)
    if (category === 'all' || category === 'kyc' || category === 'normal_kyc' || category === 'loan_kyc') {
      const kycUsers = await User.find({
        $or: [
          { kycStatus: { $in: ['verified', 'rejected', 'pending'] } },
          { 'kycDocuments.submittedAt': { $ne: null } }
        ]
      }).select('name email phone accountNumber kycStatus kycDocuments kycVerifiedAt createdAt');

      const userIds = kycUsers.map(u => u._id);
      const [loansForUsers, bondsForUsers] = await Promise.all([
        Loan.find({ userId: { $in: userIds } }).select('userId amount status loanType').lean(),
        Bond.find({ userId: { $in: userIds } }).select('userId principalAmount planName monthlyPayout status documents').lean()
      ]);

      const loanMap = {};
      for (const l of loansForUsers) {
        const uid = String(l.userId);
        if (!loanMap[uid]) loanMap[uid] = [];
        loanMap[uid].push(l);
      }

      const bondMap = {};
      for (const b of bondsForUsers) {
        const uid = String(b.userId);
        if (!bondMap[uid]) bondMap[uid] = [];
        bondMap[uid].push(b);
      }

      for (const u of kycUsers) {
        if (status !== 'all' && u.kycStatus !== status && !(status === 'approved' && u.kycStatus === 'verified')) continue;

        const uIdStr = String(u._id);
        const userLoans = loanMap[uIdStr] || [];
        const userBonds = bondMap[uIdStr] || [];
        const docs = u.kycDocuments || {};

        const doc1Front = docs.doc1Url || docs.docUrl || docs.aadharUrl || '';
        const doc1Back = docs.doc1BackUrl || docs.aadharBackUrl || '';
        const doc2Front = docs.doc2Url || docs.panUrl || docs.chequeUrl || '';
        const doc2Back = docs.doc2BackUrl || docs.panBackUrl || docs.chequeBackUrl || '';

        let bondCheque = '';
        let bondChequeBack = '';
        if (userBonds.length > 0 && userBonds[0].documents) {
          bondCheque = userBonds[0].documents.chequeUrl || '';
          bondChequeBack = userBonds[0].documents.chequeBackUrl || '';
        }

        const isLoanLending = docs.doc2Type === 'cheque' || !!docs.chequeNumber || userLoans.length > 0 || userBonds.length > 0;

        if (category === 'normal_kyc' && isLoanLending) continue;
        if (category === 'loan_kyc' && !isLoanLending) continue;

        const ts = u.kycVerifiedAt || docs.submittedAt || u.createdAt;
        const aadharNo = docs.aadharNumber || '';
        const panNo = docs.panNumber || '';
        const chequeNo = docs.chequeNumber || '';
        const hasPhotos = !!(doc1Front || doc1Back || doc2Front || doc2Back || bondCheque);

        const refParts = [];
        if (aadharNo) refParts.push(`UID: ${aadharNo}`);
        if (panNo) refParts.push(`PAN: ${panNo}`);
        if (chequeNo) refParts.push(`Cheque: ${chequeNo}`);
        const kycRef = refParts.join(' • ') || (u.accountNumber || `KYC_${u._id.toString().slice(-6)}`);

        let detailsNote = '';
        if (isLoanLending) {
          const loanSummary = userLoans.map(l => `Loan ₹${Number(l.amount || 0).toLocaleString('en-IN')} (${l.status})`).join(', ');
          const bondSummary = userBonds.map(b => `Lending ₹${Number(b.principalAmount || 0).toLocaleString('en-IN')} (${b.status})`).join(', ');
          detailsNote = [loanSummary, bondSummary, docs.adminRemarks ? `Admin: ${docs.adminRemarks}` : ''].filter(Boolean).join(' • ');
          if (!detailsNote) detailsNote = 'Lending / Loan Barrier Cheque KYC';
        } else {
          detailsNote = docs.adminRemarks ? `Admin: ${docs.adminRemarks}` : (hasPhotos ? 'Aadhaar + PAN Documents Attached' : 'Details Submitted (No photos uploaded)');
        }

        historyItems.push({
          id: 'kyc_' + u._id,
          category: 'kyc',
          subCategory: isLoanLending ? 'loan_lending_kyc' : 'normal_kyc',
          type: 'kyc_verification',
          title: isLoanLending ? 'Lending / Loan KYC' : 'Normal User KYC',
          userName: u.name,
          userEmail: u.email,
          userPhone: u.phone,
          accountNumber: u.accountNumber || '—',
          amount: 0,
          status: u.kycStatus === 'verified' ? 'approved' : u.kycStatus,
          timestamp: ts,
          createdAt: ts,
          reference: kycRef,
          referenceId: kycRef,
          notes: detailsNote,
          remarks: detailsNote,
          hasPhotos,
          documents: {
            doc1Url: doc1Front,
            doc1BackUrl: doc1Back,
            doc2Url: doc2Front || bondCheque,
            doc2BackUrl: doc2Back || bondChequeBack
          },
          docLabels: {
            doc1: 'Aadhaar Front',
            doc1Back: 'Aadhaar Back',
            doc2: isLoanLending ? 'Cheque / PAN Front' : 'PAN Front',
            doc2Back: isLoanLending ? 'Cheque / PAN Back' : 'PAN Back'
          }
        });
      }
    }

    // 3. Agent Application History
    if (category === 'all' || category === 'agent') {
      const agentUsers = await User.find({
        $or: [
          { 'agentProfile.status': { $in: ['approved', 'rejected', 'pending'] } },
          { role: 'agent' }
        ]
      }).select('name email phone accountNumber agentProfile createdAt');

      for (const a of agentUsers) {
        const aStatus = a.agentProfile?.status || 'approved';
        if (status !== 'all' && aStatus !== status && !(status === 'approved' && aStatus === 'approved')) continue;

        const ts = a.agentProfile?.approvedAt || a.agentProfile?.appliedAt || a.createdAt;
        const agentRef = a.accountNumber ? `A/C: ${a.accountNumber}` : `Agent: ${a.phone}`;
        const agentNote = `${a.agentProfile?.businessName || 'Business Partner'} • ${a.agentProfile?.commissionModel === 'team_1' ? 'Team System' : 'Solo Direct'} (${a.agentProfile?.commissionRate || 2}% rate)`;

        historyItems.push({
          id: 'agent_' + a._id,
          category: 'agent',
          type: 'agent_application',
          title: `Agent Partner (${a.agentProfile?.commissionModel === 'team_1' ? 'Team System' : 'Solo Direct'})`,
          userName: a.name,
          userEmail: a.email,
          userPhone: a.phone,
          accountNumber: a.accountNumber || '—',
          amount: a.agentProfile?.commissionRate || 0,
          status: aStatus === 'approved' ? 'approved' : aStatus,
          timestamp: ts,
          createdAt: ts,
          reference: agentRef,
          referenceId: agentRef,
          notes: agentNote,
          remarks: agentNote
        });
      }
    }

    // 4. Loans History
    if (category === 'all' || category === 'loan') {
      const loanQuery = {};
      if (status !== 'all') {
        if (status === 'approved') loanQuery.status = { $in: ['approved', 'active', 'closed'] };
        else loanQuery.status = status;
      }

      const allLoans = await Loan.find(loanQuery)
        .populate('userId', 'name email phone accountNumber')
        .sort({ createdAt: -1 })
        .limit(parseInt(limit) || 100);

      for (const l of allLoans) {
        const ts = l.createdAt || new Date();
        const loanRef = l.accountNumber || `LOAN_${l._id.toString().slice(-6).toUpperCase()}`;
        const loanNote = `${l.installmentsCount || 15} Kist @ ${l.interestRate}% • Disbursed: ₹${(l.disbursalAmount || l.amount).toLocaleString('en-IN')} • Dues: ₹${(l.remainingAmount ?? l.totalPayable).toLocaleString('en-IN')}`;

        historyItems.push({
          id: 'loan_' + l._id,
          category: 'loan',
          type: 'loan_application',
          title: `${l.loanType === 'micro_business' ? 'Micro Business' : l.loanType === 'student' ? 'Student' : 'Personal'} Loan`,
          userName: l.userId?.name || 'Borrower',
          userEmail: l.userId?.email || 'N/A',
          userPhone: l.userId?.phone || 'N/A',
          accountNumber: l.accountNumber || l.userId?.accountNumber || '—',
          amount: l.amount || 0,
          status: l.status,
          timestamp: ts,
          createdAt: ts,
          reference: loanRef,
          referenceId: loanRef,
          notes: loanNote,
          remarks: loanNote
        });
      }
    }

    // Sort descending by timestamp
    historyItems.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

    // Search filter if provided
    let filtered = historyItems;
    if (search && search.trim()) {
      const s = search.trim().toLowerCase();
      filtered = filtered.filter(item =>
        item.userName.toLowerCase().includes(s) ||
        item.userEmail.toLowerCase().includes(s) ||
        item.userPhone.toLowerCase().includes(s) ||
        item.accountNumber.toLowerCase().includes(s) ||
        item.remarks.toLowerCase().includes(s)
      );
    }

    res.json({
      success: true,
      total: filtered.length,
      history: filtered.slice(0, parseInt(limit) || 150)
    });
  } catch (err) {
    console.error('Audit history error:', err);
    res.status(500).json({ message: 'Failed to fetch audit history' });
  }
});

// Trigger 24h Daily Yield Distribution & Dispatch Phone Alerts to all depositors
router.post('/distribute-yield-notifications', protect, admin, async (req, res) => {
  try {
    const { distribute24hYieldAndNotifyAll } = require('../utils/yieldNotifier');
    const result = await distribute24hYieldAndNotifyAll();
    res.json({
      success: true,
      message: `24h daily profit calculated! ${result.notificationsSent} users notified on their phones.`,
      ...result
    });
  } catch (err) {
    console.error('Trigger yield notifications error:', err);
    res.status(500).json({ message: 'Failed to distribute yield notifications', error: err.message });
  }
});

module.exports = router;

