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

// Helper: Parse User-Agent string to clean device & browser label
function parseServerUserAgent(ua = '') {
  let device = '💻 Desktop PC';
  if (/iPhone/i.test(ua)) device = '📱 iPhone';
  else if (/iPad/i.test(ua)) device = '📱 iPad';
  else if (/Android/i.test(ua)) {
    const match = ua.match(/Android[^;]+; ([^;)]+)\)/i);
    const model = match && match[1] && !match[1].includes('Build') ? match[1].split('Build')[0].trim() : '';
    device = model ? `📱 Android (${model})` : '📱 Android Phone';
  } else if (/Windows/i.test(ua)) device = '💻 Windows PC';
  else if (/Macintosh|Mac OS X/i.test(ua)) device = '💻 Mac Desktop';
  else if (/Linux/i.test(ua)) device = '💻 Linux PC';

  let browser = 'Web';
  if (/Chrome|CriOS/i.test(ua) && !/Edg|OPR/i.test(ua)) browser = 'Chrome';
  else if (/Safari/i.test(ua) && !/Chrome|CriOS/i.test(ua)) browser = 'Safari';
  else if (/Firefox|FxiOS/i.test(ua)) browser = 'Firefox';
  else if (/Edg/i.test(ua)) browser = 'Edge';
  return `${device} • ${browser}`;
}

// All pending transactions (strictly active non-hold)
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

// All Hold transactions grouped by UTR with matching history comparison
router.get('/transactions/hold', protect, admin, async (req, res) => {
  try {
    const holdTxns = await Transaction.find({
      $or: [{ status: 'hold' }, { isHold: true }]
    })
      .populate('userId', 'name email phone accountNumber referralCode')
      .sort({ createdAt: -1 });

    if (holdTxns.length === 0) {
      return res.json({ holdCount: 0, groups: [] });
    }

    const rawUtrs = holdTxns.map(t => t.utrNumber ? String(t.utrNumber).trim() : '').filter(Boolean);
    const uniqueUtrs = [...new Set(rawUtrs)];

    // Fetch all records sharing these UTRs across the system
    const allMatches = await Transaction.find({
      utrNumber: { $in: uniqueUtrs }
    })
      .populate('userId', 'name email phone accountNumber referralCode')
      .populate('approvedBy', 'name email')
      .sort({ createdAt: -1 });

    const groupsMap = {};
    for (const utr of uniqueUtrs) {
      groupsMap[utr] = {
        utrNumber: utr,
        holdCount: 0,
        approvedCount: 0,
        pendingCount: 0,
        rejectedCount: 0,
        totalCount: 0,
        items: []
      };
    }

    for (const t of allMatches) {
      const u = t.utrNumber ? String(t.utrNumber).trim() : '';
      if (!groupsMap[u]) continue;

      groupsMap[u].totalCount++;
      if (t.status === 'hold' || t.isHold) groupsMap[u].holdCount++;
      else if (t.status === 'approved' || t.status === 'completed') groupsMap[u].approvedCount++;
      else if (t.status === 'pending') groupsMap[u].pendingCount++;
      else if (t.status === 'rejected') groupsMap[u].rejectedCount++;

      groupsMap[u].items.push(t);
    }

    // Sort items inside each group: hold first, then pending, then approved, then rejected
    const statusOrder = { hold: 1, pending: 2, approved: 3, completed: 4, rejected: 5 };
    Object.values(groupsMap).forEach(g => {
      g.items.sort((a, b) => {
        const orderA = statusOrder[a.status] || 99;
        const orderB = statusOrder[b.status] || 99;
        if (orderA !== orderB) return orderA - orderB;
        return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
      });
    });

    const groups = Object.values(groupsMap).sort((a, b) => b.holdCount - a.holdCount);

    res.json({
      holdCount: holdTxns.length,
      groups
    });
  } catch (err) {
    res.status(500).json({ message: 'Something went wrong fetching hold transactions' });
  }
});

// Approve transaction (supports both pending and hold)
router.post('/transaction/:id/approve', protect, admin, async (req, res) => {
  if (!isValidId(req.params.id)) return res.status(400).json({ message: 'Invalid transaction ID' });

  const session = await mongoose.startSession();
  try {
    let resultTxn;

    await session.withTransaction(async () => {
      const txn = await Transaction.findById(req.params.id).session(session);
      if (!txn || !['pending', 'hold'].includes(txn.status)) {
        const e = new Error('Invalid transaction or already processed');
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
        txn.isHold = false;

        // Agent Referral Commission on Investment / Deposit
        if (user.referredBy) {
          try {
            const agentUser = await User.findById(user.referredBy).session(session);
            if (agentUser && (agentUser.role === 'agent' || agentUser.agentProfile?.status === 'approved')) {
              const invRate = agentUser.agentProfile?.commissions?.investment !== undefined && agentUser.agentProfile?.commissions?.investment !== null && !isNaN(agentUser.agentProfile.commissions.investment)
                ? Number(agentUser.agentProfile.commissions.investment)
                : 1;

              if (invRate > 0) {
                const commAmount = Number(((txn.amount * invRate) / 100).toFixed(2));
                if (commAmount > 0) {
                  agentUser.balance = Number(((agentUser.balance || 0) + commAmount).toFixed(2));
                  agentUser.profitBalance = Number(((agentUser.profitBalance || 0) + commAmount).toFixed(2));
                  agentUser.referralEarnings = Number(((agentUser.referralEarnings || 0) + commAmount).toFixed(2));
                  if (!agentUser.agentProfile) agentUser.agentProfile = {};
                  if (!agentUser.agentProfile.earningsBreakdown) {
                    agentUser.agentProfile.earningsBreakdown = { loan: 0, lending: 0, investment: 0, bond: 0 };
                  }
                  agentUser.agentProfile.earningsBreakdown.investment = Number(((agentUser.agentProfile.earningsBreakdown.investment || 0) + commAmount).toFixed(2));
                  await agentUser.save({ session });

                  await Transaction.create([{
                    userId: agentUser._id,
                    type: 'referral_bonus',
                    amount: commAmount,
                    method: 'system',
                    status: 'completed',
                    sourceWallet: 'investment',
                    referenceId: txn._id.toString(),
                    remarks: `Agent Investment Commission (${invRate}%) for deposit of ₹${txn.amount.toLocaleString('en-IN')} by ${user.name}`
                  }], { session });
                }
              }
            }
          } catch (agentErr) {
            console.error('Agent investment commission credit error:', agentErr);
          }
        }
      } else {
        txn.status = 'completed';
        txn.isHold = false;
      }

      txn.approvedBy = req.user._id;
      txn.approvedAt = new Date();
      txn.approverName = req.body.approverName || req.user.name || 'Admin';
      txn.approverDevice = req.body.approverDevice || parseServerUserAgent(req.headers['user-agent']);
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

// Reject transaction (supports both pending and hold)
router.post('/transaction/:id/reject', protect, admin, async (req, res) => {
  if (!isValidId(req.params.id)) return res.status(400).json({ message: 'Invalid transaction ID' });

  const session = await mongoose.startSession();
  try {
    const remarks = typeof req.body.remarks === 'string' ? req.body.remarks : 'Rejected by admin';
    let resultTxn;

    await session.withTransaction(async () => {
      const txn = await Transaction.findOneAndUpdate(
        { _id: req.params.id, status: { $in: ['pending', 'hold'] } },
        { $set: { status: 'rejected', isHold: false, remarks } },
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

// Assign or update user's referring agent
router.post('/users/:id/assign-agent', protect, admin, async (req, res) => {
  try {
    if (!isValidId(req.params.id)) return res.status(400).json({ message: 'Invalid user ID' });
    const { agentId } = req.body;
    const user = await User.findById(req.params.id);
    if (!user) return res.status(404).json({ message: 'User not found' });

    const prevAgentId = user.referredBy ? String(user.referredBy) : null;
    const targetAgentId = agentId ? String(agentId) : null;

    if (targetAgentId) {
      const newAgent = await User.findById(targetAgentId);
      if (!newAgent) return res.status(404).json({ message: 'Selected agent not found' });
      user.referredBy = newAgent._id;
      user.referredByCode = newAgent.referralCode || undefined;
    } else {
      user.referredBy = null;
      user.referredByCode = undefined;
    }
    await user.save();

    // Adjust referral counts
    if (prevAgentId && prevAgentId !== targetAgentId) {
      await User.findByIdAndUpdate(prevAgentId, { $inc: { referralCount: -1 } });
    }
    if (targetAgentId && prevAgentId !== targetAgentId) {
      await User.findByIdAndUpdate(targetAgentId, { $inc: { referralCount: 1 } });
    }

    res.json({
      message: targetAgentId ? 'Customer safaltapoorvak naye agent se link ho gaya hai!' : 'Customer ko direct bana diya gaya hai (No Agent).',
      user: {
        _id: user._id,
        name: user.name,
        referredBy: user.referredBy,
        referredByCode: user.referredByCode
      }
    });
  } catch (err) {
    res.status(500).json({ message: 'Failed to update referral agent' });
  }
});

// Agent Applications & Registered Agents List with 4-Category Commissions & Live Earnings Breakdown
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

    const agentIds = applicants.map(a => a._id);

    // Fetch referral bonus transactions for all agents
    const bonusTxns = await Transaction.find({
      userId: { $in: agentIds },
      type: 'referral_bonus'
    }).select('userId amount sourceWallet remarks createdAt');

    // Fetch customer members referred by each agent
    const referredUsers = await User.find({
      referredBy: { $in: agentIds }
    }).select('_id name phone email referredBy balance duesBalance loansCount createdAt');

    const enrichedApplicants = applicants.map(a => {
      const aObj = a.toObject();
      const aBonus = bonusTxns.filter(t => t.userId.toString() === a._id.toString());
      const aMembers = referredUsers.filter(u => u.referredBy && u.referredBy.toString() === a._id.toString());

      let loanEarnings = 0;
      let lendingEarnings = 0;
      let investmentEarnings = 0;
      let bondEarnings = 0;

      aBonus.forEach(t => {
        const sw = (t.sourceWallet || '').toLowerCase();
        const rem = (t.remarks || '').toLowerCase();
        if (sw === 'loan' || rem.includes('loan')) loanEarnings += (t.amount || 0);
        else if (sw === 'lending' || rem.includes('lending')) lendingEarnings += (t.amount || 0);
        else if (sw === 'bond' || rem.includes('bond')) bondEarnings += (t.amount || 0);
        else if (sw === 'investment' || rem.includes('deposit') || rem.includes('investment')) investmentEarnings += (t.amount || 0);
        else loanEarnings += (t.amount || 0);
      });

      const pb = a.agentProfile?.earningsBreakdown || {};
      loanEarnings = Math.max(loanEarnings, pb.loan || 0);
      lendingEarnings = Math.max(lendingEarnings, pb.lending || 0);
      investmentEarnings = Math.max(investmentEarnings, pb.investment || 0);
      bondEarnings = Math.max(bondEarnings, pb.bond || 0);
      const totalEarnings = Number((loanEarnings + lendingEarnings + investmentEarnings + bondEarnings).toFixed(2));

      if (!aObj.agentProfile) aObj.agentProfile = {};
      aObj.agentProfile.commissions = {
        loan: a.agentProfile?.commissions?.loan ?? 1,
        lending: a.agentProfile?.commissions?.lending ?? 4,
        investment: a.agentProfile?.commissions?.investment ?? 1,
        bond: a.agentProfile?.commissions?.bond ?? 4
      };

      aObj.earningsBreakdown = {
        loan: Number(loanEarnings.toFixed(2)),
        lending: Number(lendingEarnings.toFixed(2)),
        investment: Number(investmentEarnings.toFixed(2)),
        bond: Number(bondEarnings.toFixed(2)),
        total: totalEarnings || a.referralEarnings || 0
      };

      aObj.referredCount = aMembers.length;
      aObj.referredMembers = aMembers.map(m => ({
        id: m._id,
        name: m.name,
        phone: m.phone,
        email: m.email,
        balance: m.balance,
        duesBalance: m.duesBalance,
        loansCount: m.loansCount || 0,
        joinedAt: m.createdAt
      }));
      aObj.recentCommissions = aBonus.slice(-5).reverse();

      return aObj;
    });

    res.json(enrichedApplicants);
  } catch (err) {
    res.status(500).json({ message: 'Failed to fetch agent applications' });
  }
});

router.post('/agent-applications/:id/approve', protect, admin, async (req, res) => {
  try {
    if (!isValidId(req.params.id)) return res.status(400).json({ message: 'Invalid user ID' });
    const user = await User.findById(req.params.id);
    if (!user) return res.status(404).json({ message: 'User not found' });

    const { commissionRate, commissions } = req.body;
    user.role = 'agent';
    if (!user.agentProfile) user.agentProfile = {};
    user.agentProfile.status = 'approved';
    user.agentProfile.approvedAt = new Date();

    if (!user.agentProfile.commissions) {
      user.agentProfile.commissions = { loan: 1, lending: 4, investment: 1, bond: 4 };
    }
    if (commissions) {
      if (commissions.loan !== undefined && !isNaN(parseFloat(commissions.loan))) user.agentProfile.commissions.loan = Math.max(0, parseFloat(commissions.loan));
      if (commissions.lending !== undefined && !isNaN(parseFloat(commissions.lending))) user.agentProfile.commissions.lending = Math.max(0, parseFloat(commissions.lending));
      if (commissions.investment !== undefined && !isNaN(parseFloat(commissions.investment))) user.agentProfile.commissions.investment = Math.max(0, parseFloat(commissions.investment));
      if (commissions.bond !== undefined && !isNaN(parseFloat(commissions.bond))) user.agentProfile.commissions.bond = Math.max(0, parseFloat(commissions.bond));
    }

    if (commissionRate !== undefined && commissionRate !== null && commissionRate !== '') {
      const parsedRate = parseFloat(commissionRate);
      if (!isNaN(parsedRate) && parsedRate >= 0) {
        user.agentProfile.commissionRate = parsedRate;
      }
    }
    user.markModified('agentProfile');
    await user.save();

    res.json({
      message: `Agent approved successfully! Permanent ID: EDUCA-${user.referralCode || user.phone}`,
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

    if (!user.agentProfile) user.agentProfile = {};
    if (!user.agentProfile.commissions) {
      user.agentProfile.commissions = { loan: 1, lending: 4, investment: 1, bond: 4 };
    }

    const { commissionRate, commissions, loanCommission, lendingCommission, investmentCommission, bondCommission } = req.body;

    const newLoan = commissions?.loan !== undefined ? commissions.loan : loanCommission;
    const newLending = commissions?.lending !== undefined ? commissions.lending : lendingCommission;
    const newInvestment = commissions?.investment !== undefined ? commissions.investment : investmentCommission;
    const newBond = commissions?.bond !== undefined ? commissions.bond : bondCommission;

    if (newLoan !== undefined && !isNaN(parseFloat(newLoan))) {
      user.agentProfile.commissions.loan = Math.max(0, parseFloat(newLoan));
    }
    if (newLending !== undefined && !isNaN(parseFloat(newLending))) {
      user.agentProfile.commissions.lending = Math.max(0, parseFloat(newLending));
    }
    if (newInvestment !== undefined && !isNaN(parseFloat(newInvestment))) {
      user.agentProfile.commissions.investment = Math.max(0, parseFloat(newInvestment));
    }
    if (newBond !== undefined && !isNaN(parseFloat(newBond))) {
      user.agentProfile.commissions.bond = Math.max(0, parseFloat(newBond));
    }

    if (commissionRate !== undefined && !isNaN(parseFloat(commissionRate))) {
      user.agentProfile.commissionRate = Math.max(0, parseFloat(commissionRate));
    }

    user.markModified('agentProfile');
    await user.save();

    res.json({
      success: true,
      message: 'Agent commissions updated successfully!',
      user
    });
  } catch (err) {
    res.status(500).json({ message: 'Failed to update commission rates: ' + err.message });
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
    user.kycApprovedBy = {
      name: req.body.approverName || req.user.name || 'Admin',
      device: req.body.approverDevice || parseServerUserAgent(req.headers['user-agent']),
      at: new Date()
    };
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
    if (processDailyYield && users.length > 0) {
      Promise.all(users.slice(0, 15).map(u => processDailyYield(u).catch(() => {}))).catch(() => {});
    }

    const totalUsers = users.length;
    const pendingTxns = await Transaction.countDocuments({ status: 'pending' });
    const holdTxns = await Transaction.countDocuments({ $or: [{ status: 'hold' }, { isHold: true }] });
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
    const totalLoans = await Loan.countDocuments({ status: { $in: ['active', 'approved'] } });

    res.json({
      totalUsers,
      pendingTxns,
      holdTxns,
      totalDeposits: totalDeposits[0]?.total || 0,
      totalYield: totalUserProfits || totalYield[0]?.total || 0,
      totalUserBalances,
      totalUserProfits,
      totalActiveBonds,
      netFintechReserve,
      pendingLoans,
      totalLoans,
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

    // 2. Deposits (Enriched with user info & populated for daily breakup display)
    const depositTxns = await Transaction.find({ type: 'deposit', status: 'approved' })
      .populate('userId', 'name email phone accountNumber interestRate')
      .sort({ createdAt: 1 });
    const totalDeposits = Number(depositTxns.reduce((sum, d) => sum + (d.amount || 0), 0).toFixed(2));

    // Group Deposits by dateKey (IST Calendar) for daily cards breakup & totals
    const dayDepositsMap = {};
    for (const dt of depositTxns) {
      const dKey = new Date(dt.createdAt).toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });
      if (!dayDepositsMap[dKey]) dayDepositsMap[dKey] = [];
      const rate = dt.userId?.interestRate || 12;
      const dailyYieldForAmount = Number(((dt.amount * (rate / 100)) / 365).toFixed(2));
      dayDepositsMap[dKey].push({
        id: dt._id,
        amount: dt.amount,
        createdAt: dt.createdAt,
        time: new Date(dt.createdAt).toLocaleTimeString('en-IN', { timeZone: 'Asia/Kolkata', hour: '2-digit', minute: '2-digit', hour12: true }),
        user: dt.userId?.name || 'User',
        userName: dt.userId?.name || 'User',
        userPhone: dt.userId?.phone || '',
        userEmail: dt.userId?.email || '',
        accountNumber: dt.userId?.accountNumber || `A/C: ${String(dt.userId?._id || '').slice(-6).toUpperCase()}`,
        method: dt.method || 'wallet',
        utr: dt.utrNumber || dt.referenceId || 'Direct',
        utrNumber: dt.utrNumber || dt.referenceId || 'Direct',
        rateText: `${rate}% p.a. • +₹${dailyYieldForAmount}/day profit`,
        dailyYieldForAmount,
        proofUrl: dt.proofUrl || dt.screenshotUrl || '',
        hasProof: Boolean(dt.proofUrl || dt.screenshotUrl)
      });
    }

    // 3. Daily Yield / Profits
    const yieldTxns = await Transaction.find({ type: 'daily_yield' }).sort({ createdAt: 1 }).populate('userId', 'name email');
    const totalYieldTxns = Number(yieldTxns.reduce((sum, y) => sum + (y.amount || 0), 0).toFixed(4));
    const totalYieldCredited = Math.max(totalUserProfits, totalYieldTxns);

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

    // Also ensure any dates with deposits are included in dailyMap
    for (const dKey of Object.keys(dayDepositsMap)) {
      if (!dailyMap[dKey]) {
        const [y, m, d] = dKey.split('-').map(Number);
        const dateObj = new Date(Date.UTC(y, m - 1, d, 12, 0, 0));
        dailyMap[dKey] = {
          date: dKey,
          displayDate: dateObj.toLocaleDateString('en-IN', { timeZone: 'Asia/Kolkata', day: '2-digit', month: 'short' }),
          amount: 0,
          txnCount: 0,
          users: new Set()
        };
      }
    }

    let runningYieldSum = 0;
    let runningDepositSum = 0;
    const sortedDailyList = Object.values(dailyMap).sort((a, b) => a.date.localeCompare(b.date));

    // Calculate any deposits that occurred prior to the first chart date
    const earliestDate = sortedDailyList[0]?.date;
    if (earliestDate) {
      for (const [dKey, depList] of Object.entries(dayDepositsMap)) {
        if (dKey < earliestDate) {
          runningDepositSum += depList.reduce((sum, item) => sum + (item.amount || 0), 0);
        }
      }
    }

    const dailyProfitChart = sortedDailyList.map(d => {
      runningYieldSum = Number((runningYieldSum + d.amount).toFixed(2));
      const dayDeposits = dayDepositsMap[d.date] || [];
      const dayTotalDeposit = Number(dayDeposits.reduce((sum, item) => sum + (item.amount || 0), 0).toFixed(2));
      runningDepositSum = Number((runningDepositSum + dayTotalDeposit).toFixed(2));

      return {
        date: d.date,
        displayDate: d.displayDate,
        amount: d.amount,
        cumulativeYield: runningYieldSum,
        txnCount: d.txnCount,
        uniqueUsers: d.users.size,
        dayTotalDeposit,
        cumulativeDeposit: runningDepositSum,
        estimatedCapital: runningDepositSum,
        depositsCount: dayDeposits.length,
        deposits: dayDeposits
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
        totalLoans: await Loan.countDocuments({ status: { $in: ['active', 'approved'] } }),
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
    const decoded = jwt.verify(token, process.env.JWT_SECRET, { algorithms: ['HS256'] });
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
        const isApproved = t.status === 'approved' || t.status === 'completed';

        const reqDate = t.createdAt || new Date();
        const appDate = t.approvedAt || (isApproved ? t.createdAt : null);
        let turnaround = '';
        if (reqDate && appDate) {
          const diffMs = Math.max(0, new Date(appDate).getTime() - new Date(reqDate).getTime());
          const diffSec = Math.round(diffMs / 1000);
          if (diffSec < 60) turnaround = `${diffSec}s`;
          else if (diffSec < 3600) turnaround = `${Math.round(diffSec / 60)}m`;
          else turnaround = `${(diffSec / 3600).toFixed(1)}h`;
        }
        const proof = t.proofUrl || t.screenshotUrl || '';

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
          requestedAt: reqDate,
          approvedAt: appDate,
          turnaround,
          approverName: t.approverName || (isApproved ? 'Admin' : ''),
          approverDevice: t.approverDevice || (isApproved ? '💻 Windows PC • Chrome' : ''),
          proofUrl: proof,
          screenshotUrl: proof,
          hasProof: Boolean(proof),
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
      }).select('name email phone accountNumber kycStatus kycDocuments kycVerifiedAt kycApprovedBy createdAt');

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

        const isVerifiedKyc = u.kycStatus === 'verified';
        const reqDate = docs.submittedAt || u.createdAt;
        const appDate = u.kycVerifiedAt || (isVerifiedKyc ? ts : null);
        let turnaround = '';
        if (reqDate && appDate) {
          const diffMs = Math.max(0, new Date(appDate).getTime() - new Date(reqDate).getTime());
          const diffSec = Math.round(diffMs / 1000);
          if (diffSec < 60) turnaround = `${diffSec}s`;
          else if (diffSec < 3600) turnaround = `${Math.round(diffSec / 60)}m`;
          else turnaround = `${(diffSec / 3600).toFixed(1)}h`;
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
          requestedAt: reqDate,
          approvedAt: appDate,
          turnaround,
          approverName: u.kycApprovedBy?.name || (isVerifiedKyc ? 'Admin' : ''),
          approverDevice: u.kycApprovedBy?.device || (isVerifiedKyc ? '💻 Windows PC • Chrome' : ''),
          proofUrl: doc1Front || doc2Front || '',
          screenshotUrl: doc1Front || doc2Front || '',
          hasProof: hasPhotos,
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

        const isApprovedLoan = ['approved', 'active', 'closed'].includes(l.status);
        const reqDate = l.createdAt || new Date();
        const appDate = l.approvedAt || (isApprovedLoan ? l.createdAt : null);
        let turnaround = '';
        if (reqDate && appDate) {
          const diffMs = Math.max(0, new Date(appDate).getTime() - new Date(reqDate).getTime());
          const diffSec = Math.round(diffMs / 1000);
          if (diffSec < 60) turnaround = `${diffSec}s`;
          else if (diffSec < 3600) turnaround = `${Math.round(diffSec / 60)}m`;
          else turnaround = `${(diffSec / 3600).toFixed(1)}h`;
        }
        const proof = l.documents?.chequeUrl || l.documents?.doc1Url || '';

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
          requestedAt: reqDate,
          approvedAt: appDate,
          turnaround,
          approverName: l.approverName || (isApprovedLoan ? 'Admin' : ''),
          approverDevice: l.approverDevice || (isApprovedLoan ? '💻 Windows PC • Chrome' : ''),
          proofUrl: proof,
          screenshotUrl: proof,
          hasProof: Boolean(proof),
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

