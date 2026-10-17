const express = require('express');
const mongoose = require('mongoose');
const Transaction = require('../models/Transaction');
const User = require('../models/User');
const Loan = require('../models/Loan');
const Bond = require('../models/Bond');
const Settings = require('../models/Settings');
const AuditLog = require('../models/AuditLog');
const { protect, admin, staffOrAdmin, requirePermission } = require('../middleware/auth');
const { sendNotification, notifyPermissionsChanged } = require('../utils/notifier');
const { hasPermission, getAllowedDepartments } = require('../utils/permissions');
const { generateAccountNumber } = require('../utils/accountNumber');
const memoryCache = require('../utils/cache');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const { updateEducaMailPassword, sendEducaMailMessage } = require('../utils/educaMail');
const { encryptData, decryptData } = require('../utils/cryptoHelper');
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
router.get('/transactions/pending', protect, staffOrAdmin, async (req, res) => {
  try {
    const query = { status: 'pending' };
    if (req.user.role === 'staff') {
      const allowedTypes = [];
      if (hasPermission(req.user, 'deposit.view')) allowedTypes.push('deposit');
      if (hasPermission(req.user, 'withdrawal.view')) allowedTypes.push('withdrawal');
      if (hasPermission(req.user, 'lending.view')) allowedTypes.push('lending_created', 'lending_payout');
      if (allowedTypes.length === 0 && !hasPermission(req.user, 'lending.view')) {
        return res.json([]);
      }
      query.$or = [{ type: { $in: allowedTypes } }];
      if (hasPermission(req.user, 'lending.view')) {
        query.$or.push({ sourceWallet: 'lending' });
      }
    }

    const txns = await Transaction.find(query)
      .populate('userId', 'name email phone')
      .sort({ createdAt: -1 });
    res.json(txns);
  } catch (err) {
    res.status(500).json({ message: 'Something went wrong. Please try again.' });
  }
});

// All Hold transactions grouped by UTR with matching history comparison
router.get('/transactions/hold', protect, staffOrAdmin, async (req, res) => {
  try {
    const baseQuery = { $or: [{ status: 'hold' }, { isHold: true }] };
    if (req.user.role === 'staff') {
      const allowedTypes = [];
      if (hasPermission(req.user, 'deposit.view')) allowedTypes.push('deposit');
      if (hasPermission(req.user, 'withdrawal.view')) allowedTypes.push('withdrawal');
      if (hasPermission(req.user, 'lending.view')) allowedTypes.push('lending_created', 'lending_payout');
      if (allowedTypes.length === 0 && !hasPermission(req.user, 'lending.view')) {
        return res.json({ holdCount: 0, groups: [] });
      }
      baseQuery.$and = [
        {
          $or: [
            { type: { $in: allowedTypes } },
            ...(hasPermission(req.user, 'lending.view') ? [{ sourceWallet: 'lending' }] : [])
          ]
        }
      ];
    }

    const holdTxns = await Transaction.find(baseQuery)
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
router.post('/transaction/:id/approve', protect, staffOrAdmin, async (req, res) => {
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

      // Department Permission Check
      const dept = txn.type === 'deposit' ? 'deposit' : (txn.type === 'withdrawal' ? 'withdrawal' : 'lending');
      if (req.user.role === 'staff') {
        const requiredPerm = `${dept}.process`;
        if (!hasPermission(req.user, requiredPerm)) {
          const e = new Error(`Access denied. Requires permission: ${requiredPerm}`);
          e.status = 403;
          throw e;
        }

        // Self-approval guard
        if (String(txn.userId) === String(req.user._id)) {
          const e = new Error('Self-approval is forbidden.');
          e.status = 403;
          throw e;
        }
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
      } else {
        txn.status = 'completed';
        txn.isHold = false;
      }

      txn.approvedBy = req.user._id;
      txn.approvedAt = new Date();
      txn.approverName = req.body.approverName || req.user.name || (req.user.role === 'staff' ? 'Staff' : 'Admin');
      txn.approverDevice = req.body.approverDevice || parseServerUserAgent(req.headers['user-agent']);
      txn.handledBy = {
        userId: req.user._id,
        name: req.user.name,
        role: req.user.role,
        department: dept,
        action: 'approve',
        at: new Date()
      };
      txn.claim = null;
      if (!txn.history) txn.history = [];
      txn.history.push({
        action: 'approve',
        actorId: req.user._id,
        actorName: req.user.name,
        actorRole: req.user.role,
        department: dept,
        note: req.body.remarks || req.body.adminEvidenceNote || '',
        at: new Date()
      });

      if (req.body.utrNumber && typeof req.body.utrNumber === 'string') {
        txn.utrNumber = req.body.utrNumber.trim();
      }
      if (req.body.adminEvidenceUrl && typeof req.body.adminEvidenceUrl === 'string') {
        const checkEv = validateBase64Upload(req.body.adminEvidenceUrl);
        if (checkEv.valid || req.body.adminEvidenceUrl.startsWith('http')) {
          txn.adminEvidenceUrl = req.body.adminEvidenceUrl;
        }
      }
      if (req.body.adminEvidenceNote && typeof req.body.adminEvidenceNote === 'string') {
        txn.adminEvidenceNote = req.body.adminEvidenceNote.trim();
      }
      if (req.body.remarks && typeof req.body.remarks === 'string') {
        txn.remarks = req.body.remarks.trim();
      }
      txn.handledBy = {
        userId: req.user._id,
        name: req.user.name,
        role: req.user.role,
        department: dept,
        action: 'approve',
        at: new Date()
      };
      txn.claim = null;
      if (!Array.isArray(txn.history)) txn.history = [];
      txn.history.push({
        action: 'approved',
        by: req.user._id,
        name: req.user.name,
        role: req.user.role,
        department: dept,
        note: req.body.remarks || req.body.adminEvidenceNote || '',
        at: new Date()
      });
      await txn.save({ session });

      // Audit Trail
      await AuditLog.create([{
        actorId: req.user._id,
        actorName: req.user.name,
        actorRole: req.user.role,
        department: dept,
        action: `${dept}.approve`,
        entityType: 'transaction',
        entityId: txn._id.toString(),
        userId: txn.userId,
        amount: txn.amount,
        fromStatus: 'pending',
        toStatus: txn.status,
        note: req.body.remarks || req.body.adminEvidenceNote || '',
        ip: req.ip || '',
        userAgent: req.headers['user-agent'] || ''
      }], { session });

      resultTxn = txn;
    });

    if (resultTxn && resultTxn.type === 'deposit') {
      memoryCache.del(`user_me_${resultTxn.userId}`);
      memoryCache.delPrefix('user_me_' + resultTxn.userId);
      memoryCache.del('admin_analytics');
      memoryCache.del('admin_stats');
      try {
        const { autoDeductDueLoanEmis } = require('./loan');
        await autoDeductDueLoanEmis(resultTxn.userId);
      } catch (_) {}
      try {
        const { checkAndUpdatePremiumStatus } = require('../utils/premium');
        await checkAndUpdatePremiumStatus(resultTxn.userId);
      } catch (_) {}
    }

    // Background Google Drive sync for Admin Payout Evidence Screenshot
    if (resultTxn && resultTxn.adminEvidenceUrl && resultTxn.adminEvidenceUrl.startsWith('data:')) {
      try {
        const adminDriveSetting = await Settings.findOne({ key: 'googleDriveUrl' });
        const adminDriveUrl = adminDriveSetting?.value;
        if (adminDriveUrl && adminDriveUrl.startsWith('https://script.google.com/')) {
          fetch(adminDriveUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              action: 'admin_payout_evidence',
              transactionId: resultTxn._id.toString(),
              type: resultTxn.type,
              amount: resultTxn.amount,
              utrNumber: resultTxn.utrNumber || '',
              adminEvidenceUrl: resultTxn.adminEvidenceUrl,
              adminEvidenceNote: resultTxn.adminEvidenceNote || '',
              approvedBy: req.user.email || req.user.name || 'Admin',
              submittedAt: new Date().toISOString()
            })
          })
          .then(r => r.json())
          .then(async (driveData) => {
            if (driveData && (driveData.fileUrl || driveData.folderUrl)) {
              await Transaction.findByIdAndUpdate(resultTxn._id, {
                adminEvidenceDriveUrl: driveData.fileUrl || driveData.folderUrl
              });
            }
          })
          .catch(e => console.warn('Admin evidence Drive sync warning:', e.message));
        }
      } catch (_) {}
    }

    res.json({ message: 'Transaction approved', txn: resultTxn });
  } catch (err) {
    res.status(err.status || 500).json({ message: err.status ? err.message : 'Something went wrong. Please try again.' });
  } finally {
    session.endSession();
  }
});

// Reject transaction (supports both pending and hold)
router.post('/transaction/:id/reject', protect, staffOrAdmin, async (req, res) => {
  if (!isValidId(req.params.id)) return res.status(400).json({ message: 'Invalid transaction ID' });

  const session = await mongoose.startSession();
  try {
    const remarks = typeof req.body.remarks === 'string' ? req.body.remarks : 'Rejected by administrator';
    let resultTxn;

    await session.withTransaction(async () => {
      const existing = await Transaction.findById(req.params.id).session(session);
      if (!existing || !['pending', 'hold'].includes(existing.status)) {
        const e = new Error('Transaction not found or already processed');
        e.status = 400;
        throw e;
      }

      // Department Permission Check
      const dept = existing.type === 'deposit' ? 'deposit' : (existing.type === 'withdrawal' ? 'withdrawal' : 'lending');
      if (req.user.role === 'staff') {
        const requiredPerm = `${dept}.process`;
        if (!hasPermission(req.user, requiredPerm)) {
          const e = new Error(`Access denied. Requires permission: ${requiredPerm}`);
          e.status = 403;
          throw e;
        }

        // Self-approval guard
        if (String(existing.userId) === String(req.user._id)) {
          const e = new Error('Self-approval is forbidden.');
          e.status = 403;
          throw e;
        }
      }

      const txn = await Transaction.findOneAndUpdate(
        { _id: req.params.id, status: { $in: ['pending', 'hold'] } },
        {
          $set: {
            status: 'rejected',
            isHold: false,
            remarks,
            handledBy: {
              userId: req.user._id,
              name: req.user.name,
              role: req.user.role,
              department: dept,
              action: 'reject',
              at: new Date()
            },
            claim: null
          },
          $push: {
            history: {
              action: 'reject',
              actorId: req.user._id,
              actorName: req.user.name,
              actorRole: req.user.role,
              department: dept,
              note: remarks,
              at: new Date()
            }
          }
        },
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

      // Audit Trail
      await AuditLog.create([{
        actorId: req.user._id,
        actorName: req.user.name,
        actorRole: req.user.role,
        department: dept,
        action: `${dept}.reject`,
        entityType: 'transaction',
        entityId: txn._id.toString(),
        userId: txn.userId,
        amount: txn.amount,
        fromStatus: 'pending',
        toStatus: 'rejected',
        note: remarks,
        ip: req.ip || '',
        userAgent: req.headers['user-agent'] || ''
      }], { session });

      resultTxn = txn;
    });

    res.json({ message: 'Transaction rejected', txn: resultTxn });
  } catch (err) {
    res.status(err.status || 500).json({ message: err.status ? err.message : 'Something went wrong. Please try again.' });
  } finally {
    session.endSession();
  }
});

// Cheap change-detector for the KYC tab (a few bytes instead of re-sending every user)
router.get('/users/kyc-fingerprint', protect, admin, async (req, res) => {
  try {
    const groups = await User.aggregate([
      { $match: { role: { $ne: 'admin' } } },
      { $group: { _id: '$kycStatus', n: { $sum: 1 }, latest: { $max: '$updatedAt' } } },
      { $sort: { _id: 1 } }
    ]);
    res.json({ groups });
  } catch (err) {
    res.status(500).json({ message: 'Failed to compute KYC fingerprint' });
  }
});

// All users (With in-memory decrypted KYC documents for 0ms instant display)
router.get('/users', protect, admin, async (req, res) => {
  try {
    const users = await User.find({ role: { $ne: 'admin' } })
      .select('-password -walletPin')
      .populate('referredBy', 'name email phone referralCode agentProfile')
      .sort({ createdAt: -1 })
      .lean();

    const cleanUsers = users.map(u => {
      if (u.kycDocuments) {
        const {
          doc1Url, doc1BackUrl, doc2Url, doc2BackUrl, chequeUrl, chequeBackUrl, docUrl,
          ...restKyc
        } = u.kycDocuments;
        return {
          ...u,
          kycDocuments: {
            ...restKyc,
            hasDoc1: !!(doc1Url || docUrl),
            hasDoc1Back: !!doc1BackUrl,
            hasDoc2: !!doc2Url,
            hasDoc2Back: !!doc2BackUrl,
            hasCheque: !!chequeUrl,
            hasChequeBack: !!chequeBackUrl
          }
        };
      }
      return u;
    });

    res.json(cleanUsers);
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
      .select('-password -walletPin')
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

    const nominatorIds = applicants.map(a => a.agentProfile?.nominatedBy).filter(Boolean);
    const nominators = await User.find({ _id: { $in: nominatorIds } }).select('_id name phone referralCode');

    const enrichedApplicants = applicants.map(a => {
      const aObj = a.toObject();
      const aBonus = bonusTxns.filter(t => t.userId.toString() === a._id.toString());
      const aMembers = referredUsers.filter(u => u.referredBy && u.referredBy.toString() === a._id.toString());

      if (aObj.agentProfile?.nominatedBy) {
        const nom = nominators.find(n => n._id.toString() === aObj.agentProfile.nominatedBy.toString());
        if (nom) {
          aObj.nominatedBy = {
            id: nom._id,
            name: nom.name,
            phone: nom.phone,
            referralCode: nom.referralCode
          };
        }
      }

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
      const defRate = (a.agentProfile?.commissionModel === 'team_1' || a.agentProfile?.commissionModel === 'team') ? 1 : 2;
      aObj.agentProfile.commissions = {
        loan: a.agentProfile?.commissions?.loan ?? defRate,
        lending: a.agentProfile?.commissions?.lending ?? defRate,
        investment: a.agentProfile?.commissions?.investment ?? defRate,
        bond: a.agentProfile?.commissions?.bond ?? defRate
      };
      aObj.agentProfile.loanLimit = a.agentProfile?.loanLimit !== undefined ? a.agentProfile.loanLimit : 100000;
      aObj.loanLimit = aObj.agentProfile.loanLimit;

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

    const { commissionRate, commissions, loanLimit } = req.body;
    user.role = 'agent';
    if (!user.agentProfile) user.agentProfile = {};
    user.agentProfile.status = 'approved';
    user.agentProfile.approvedAt = new Date();

    if (!user.referralCode) {
      const cleanPrefix = (user.name || 'EF').replace(/[^a-zA-Z]/g, '').slice(0, 3).toUpperCase() || 'EF';
      const randomDigits = Math.floor(1000 + Math.random() * 9000);
      user.referralCode = `EF${cleanPrefix}${randomDigits}`;
    }

    if (user.agentProfile.nominatedBy) {
      user.referredBy = user.agentProfile.nominatedBy;
      const nomAgent = await User.findById(user.agentProfile.nominatedBy);
      if (nomAgent) {
        user.referredByCode = nomAgent.referralCode || undefined;
        await User.findByIdAndUpdate(nomAgent._id, { $inc: { referralCount: 1 } });
        sendNotification({
          type: 'sub_agent_approved',
          title: 'Sub-Agent Approved! 🎉',
          message: `Aapke dwara nominate kiye gaye Sub-Agent ${user.name} (${user.phone}) ko Admin ne approve kar diya hai.`,
          data: { subAgentId: user._id, subAgentName: user.name }
        });
      }
    }

    if (!user.agentProfile.commissions) {
      const defRate = (user.agentProfile?.commissionModel === 'team_1' || user.agentProfile?.commissionModel === 'team') ? 1 : 2;
      user.agentProfile.commissions = { loan: defRate, lending: defRate, investment: defRate, bond: defRate };
    }
    if (commissions) {
      if (commissions.loan !== undefined && !isNaN(parseFloat(commissions.loan))) user.agentProfile.commissions.loan = Math.max(0, parseFloat(commissions.loan));
      if (commissions.lending !== undefined && !isNaN(parseFloat(commissions.lending))) user.agentProfile.commissions.lending = Math.max(0, parseFloat(commissions.lending));
      if (commissions.investment !== undefined && !isNaN(parseFloat(commissions.investment))) user.agentProfile.commissions.investment = Math.max(0, parseFloat(commissions.investment));
      if (commissions.bond !== undefined && !isNaN(parseFloat(commissions.bond))) user.agentProfile.commissions.bond = Math.max(0, parseFloat(commissions.bond));
    }

    if (loanLimit !== undefined && loanLimit !== null && loanLimit !== '') {
      const parsedLimit = parseFloat(loanLimit);
      if (!isNaN(parsedLimit) && parsedLimit >= 0) {
        user.agentProfile.loanLimit = parsedLimit;
      }
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
      const defRate = (user.agentProfile?.commissionModel === 'team_1' || user.agentProfile?.commissionModel === 'team') ? 1 : 2;
      user.agentProfile.commissions = { loan: defRate, lending: defRate, investment: defRate, bond: defRate };
    }

    const { commissionRate, commissions, loanCommission, lendingCommission, investmentCommission, bondCommission, loanLimit } = req.body;

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

    if (loanLimit !== undefined && loanLimit !== null && loanLimit !== '') {
      const parsedLimit = parseFloat(loanLimit);
      if (!isNaN(parsedLimit) && parsedLimit >= 0) {
        user.agentProfile.loanLimit = parsedLimit;
      }
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
    if (user.role !== 'agent') {
      user.role = 'agent';
      user.agentProfile.status = 'approved';
      user.agentProfile.applied = true;
      if (!user.agentProfile.businessName) user.agentProfile.businessName = (user.name || 'Agent') + ' Business';
    }
    if (!user.referralCode) {
      const cleanPrefix = (user.name || 'EF').replace(/[^a-zA-Z]/g, '').slice(0, 3).toUpperCase() || 'EF';
      const randomDigits = Math.floor(1000 + Math.random() * 9000);
      user.referralCode = `EF${cleanPrefix}${randomDigits}`;
    }
    await user.save();

    res.json({
      success: true,
      message: `${user.name} ko ${targetModel === 'team_1' ? 'Team System' : 'Solo Direct'} me safaltapoorvak convert kar diya gaya hai!`,
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

// Admin: Reset any user password (temporary password + forced change + Educa Mail sync)
router.post('/user/:id/reset-password', protect, admin, async (req, res) => {
  try {
    if (!isValidId(req.params.id)) return res.status(400).json({ message: 'Invalid user ID' });

    const { tempPassword, mustChangePassword = true, syncEducaMail = true } = req.body;

    const user = await User.findById(req.params.id);
    if (!user) return res.status(404).json({ message: 'User not found' });

    const finalPassword = (tempPassword && tempPassword.trim())
      ? tempPassword.trim()
      : 'Educa@' + Math.floor(1000 + Math.random() * 9000);

    if (finalPassword.length < 6) {
      return res.status(400).json({ message: 'Password must be at least 6 characters' });
    }

    const hashed = await bcrypt.hash(finalPassword, 10);
    user.password = hashed;
    user.mustChangePassword = Boolean(mustChangePassword);
    user.tempPasswordAssigned = true;
    await user.save();

    memoryCache.del(`user_me_${user._id}`);

    let educaSynced = false;
    if (syncEducaMail) {
      educaSynced = await updateEducaMailPassword(user.email, finalPassword, user.phone, user.upiId);

      const mailNotice = `Namaste ${user.name},\n\nAapka password Admin dwara reset kar diya gaya hai.\n\nTemporary Password: ${finalPassword}\n\nKripya login karein aur apna personal password set karein.\n\nTeam Educa Fintech`;
      sendEducaMailMessage(user.email, 'Educa Fintech — Temporary Password Assigned', mailNotice).catch(() => {});
    }

    res.json({
      success: true,
      message: `Password reset successfully for ${user.name}!`,
      tempPassword: finalPassword,
      mustChangePassword: user.mustChangePassword,
      educaSynced,
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        phone: user.phone,
        accountNumber: user.accountNumber,
        mustChangePassword: user.mustChangePassword
      }
    });
  } catch (err) {
    console.error('Admin reset password error:', err);
    res.status(500).json({ message: 'Failed to reset password: ' + err.message });
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
    ).select('-password -walletPin');

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
router.post('/kyc/:id/approve', protect, requirePermission('kyc.process'), async (req, res) => {
  try {
    if (!isValidId(req.params.id)) return res.status(400).json({ message: 'Invalid user ID' });
    const user = await User.findById(req.params.id);
    if (!user) return res.status(404).json({ message: 'User not found' });

    // Self-approval guard
    if (req.user.role === 'staff' && String(user._id) === String(req.user._id)) {
      return res.status(403).json({ message: 'Self-approval is forbidden.' });
    }

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
      name: req.body.approverName || req.user.name || (req.user.role === 'staff' ? 'Staff' : 'Admin'),
      device: req.body.approverDevice || parseServerUserAgent(req.headers['user-agent']),
      userId: req.user._id,
      role: req.user.role,
      at: new Date()
    };
    if (!user.kycDocuments) user.kycDocuments = {};
    if (remarks) user.kycDocuments.adminRemarks = remarks.trim();
    user.kycDocuments.isNoteLocked = true;

    // Lock submitted bank details into permanent registered bank account
    if (user.kycDocuments?.bankAccountNumber) {
      user.bankAccount = {
        ...(user.bankAccount || {}),
        accountNumber: user.kycDocuments.bankAccountNumber,
        ifsc: user.kycDocuments.bankIfsc || user.bankAccount?.ifsc || '',
        bankName: user.kycDocuments.bankName || user.bankAccount?.bankName || '',
        holderName: user.kycDocuments.bankHolderName || user.bankAccount?.holderName || user.name || '',
        upiId: user.kycDocuments.bankUpiId || user.bankAccount?.upiId || ''
      };
      if (user.kycDocuments.bankUpiId) {
        user.upiId = user.kycDocuments.bankUpiId;
      }
      user.markModified('bankAccount');
    }

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

    // Audit Trail
    await AuditLog.create({
      actorId: req.user._id,
      actorName: req.user.name,
      actorRole: req.user.role,
      department: 'kyc',
      action: 'kyc.approve',
      entityType: 'user',
      entityId: user._id.toString(),
      userId: user._id,
      fromStatus: 'pending',
      toStatus: 'verified',
      note: remarks || '',
      ip: req.ip || '',
      userAgent: req.headers['user-agent'] || ''
    });

    res.json({ message: `User ${user.name} KYC verified successfully!`, user });
  } catch (err) {
    res.status(500).json({ message: 'Failed to verify KYC: ' + err.message });
  }
});

router.post('/kyc/:id/reject', protect, requirePermission('kyc.process'), async (req, res) => {
  try {
    if (!isValidId(req.params.id)) return res.status(400).json({ message: 'Invalid user ID' });
    const user = await User.findById(req.params.id);
    if (!user) return res.status(404).json({ message: 'User not found' });

    // Self-approval guard
    if (req.user.role === 'staff' && String(user._id) === String(req.user._id)) {
      return res.status(403).json({ message: 'Self-approval is forbidden.' });
    }

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

    // Audit Trail
    await AuditLog.create({
      actorId: req.user._id,
      actorName: req.user.name,
      actorRole: req.user.role,
      department: 'kyc',
      action: 'kyc.reject',
      entityType: 'user',
      entityId: user._id.toString(),
      userId: user._id,
      fromStatus: 'pending',
      toStatus: 'rejected',
      note: remarks || '',
      ip: req.ip || '',
      userAgent: req.headers['user-agent'] || ''
    });

    res.json({ message: `User ${user.name} KYC marked as rejected.`, user });
  } catch (err) {
    res.status(500).json({ message: 'Failed to reject KYC: ' + err.message });
  }
});

// Bank Change Requests Review (KYC Department)
router.get('/bank-change-requests', protect, staffOrAdmin, async (req, res) => {
  try {
    const { status = 'pending' } = req.query;
    const filter = {};
    if (status && status !== 'all') {
      filter['bankChangeRequest.status'] = status;
    } else {
      filter['bankChangeRequest.status'] = { $in: ['pending', 'approved', 'rejected'] };
    }

    const users = await User.find(filter)
      .select('name email phone accountNumber kycStatus bankAccount bankChangeRequest createdAt')
      .sort({ 'bankChangeRequest.requestedAt': -1 })
      .lean();

    const items = users.map(u => ({
      _id: u._id,
      userId: u._id,
      userName: u.name,
      name: u.name,
      userEmail: u.email,
      email: u.email,
      userPhone: u.phone,
      phone: u.phone,
      accountNumber: u.accountNumber || '—',
      kycStatus: u.kycStatus,
      currentBank: u.bankAccount || {},
      bankAccount: u.bankAccount || {},
      bankChangeRequest: u.bankChangeRequest || {},
      status: u.bankChangeRequest?.status || 'none',
      requestedAt: u.bankChangeRequest?.requestedAt || u.createdAt,
      createdAt: u.bankChangeRequest?.requestedAt || u.createdAt
    }));

    res.json({ success: true, count: items.length, requests: items });
  } catch (err) {
    res.status(500).json({ message: 'Failed to fetch bank change requests: ' + err.message });
  }
});

router.post('/bank-change/:id/approve', protect, requirePermission('kyc.process'), async (req, res) => {
  try {
    if (!isValidId(req.params.id)) return res.status(400).json({ message: 'Invalid user ID' });
    const user = await User.findById(req.params.id);
    if (!user) return res.status(404).json({ message: 'User not found' });

    if (!user.bankChangeRequest || user.bankChangeRequest.status !== 'pending') {
      return res.status(400).json({ message: 'Is user ki koi pending bank change request nahi hai.' });
    }

    const { remarks } = req.body;
    const changeReq = user.bankChangeRequest;

    // Apply new bank details to user's registered bank account
    user.bankAccount = {
      accountNumber: changeReq.accountNumber,
      ifsc: changeReq.ifsc,
      holderName: changeReq.holderName,
      bankName: changeReq.bankName,
      upiId: changeReq.upiId || user.bankAccount?.upiId || '',
      qrCodeUrl: user.bankAccount?.qrCodeUrl || '',
      googleDriveQrUrl: user.bankAccount?.googleDriveQrUrl || ''
    };
    if (changeReq.upiId) {
      user.upiId = changeReq.upiId;
    }

    user.bankChangeRequest.status = 'approved';
    user.bankChangeRequest.reviewedAt = new Date();
    user.bankChangeRequest.reviewedBy = {
      userId: req.user._id,
      name: req.body.approverName || req.user.name || (req.user.role === 'staff' ? 'Staff' : 'Admin'),
      role: req.user.role
    };
    user.bankChangeRequest.adminRemarks = remarks ? remarks.trim() : 'Approved by KYC Department';

    user.markModified('bankAccount');
    user.markModified('bankChangeRequest');
    await user.save();
    memoryCache.delPrefix('user_me_' + user._id);

    // Audit Log
    await AuditLog.create({
      actorId: req.user._id,
      actorName: req.user.name,
      actorRole: req.user.role,
      department: 'kyc',
      action: 'bank_change.approve',
      entityType: 'user',
      entityId: user._id.toString(),
      userId: user._id,
      fromStatus: 'pending',
      toStatus: 'approved',
      note: `New Bank: ${changeReq.bankName} - ${changeReq.accountNumber}. Remarks: ${remarks || ''}`,
      ip: req.ip || '',
      userAgent: req.headers['user-agent'] || ''
    });

    sendNotification({
      type: 'bank_change_approved',
      title: 'Bank Change Request Approved ✅',
      message: `Aapki registered bank details successfully update ho gayi hain (${changeReq.bankName} - ${changeReq.accountNumber}).`,
      data: { userId: user._id }
    });

    res.json({
      success: true,
      message: `User ${user.name} ki bank change request approve ho gayi hai! Registered bank details update ho gayi hain.`,
      user: {
        _id: user._id,
        bankAccount: user.bankAccount,
        bankChangeRequest: user.bankChangeRequest
      }
    });
  } catch (err) {
    res.status(500).json({ message: 'Failed to approve bank change request: ' + err.message });
  }
});

router.post('/bank-change/:id/reject', protect, requirePermission('kyc.process'), async (req, res) => {
  try {
    if (!isValidId(req.params.id)) return res.status(400).json({ message: 'Invalid user ID' });
    const user = await User.findById(req.params.id);
    if (!user) return res.status(404).json({ message: 'User not found' });

    if (!user.bankChangeRequest || user.bankChangeRequest.status !== 'pending') {
      return res.status(400).json({ message: 'Is user ki koi pending bank change request nahi hai.' });
    }

    const { remarks } = req.body;
    user.bankChangeRequest.status = 'rejected';
    user.bankChangeRequest.reviewedAt = new Date();
    user.bankChangeRequest.reviewedBy = {
      userId: req.user._id,
      name: req.body.approverName || req.user.name || (req.user.role === 'staff' ? 'Staff' : 'Admin'),
      role: req.user.role
    };
    user.bankChangeRequest.adminRemarks = remarks ? remarks.trim() : 'Rejected by KYC Department';

    user.markModified('bankChangeRequest');
    await user.save();
    memoryCache.delPrefix('user_me_' + user._id);

    // Audit Log
    await AuditLog.create({
      actorId: req.user._id,
      actorName: req.user.name,
      actorRole: req.user.role,
      department: 'kyc',
      action: 'bank_change.reject',
      entityType: 'user',
      entityId: user._id.toString(),
      userId: user._id,
      fromStatus: 'pending',
      toStatus: 'rejected',
      note: remarks || 'Rejected by KYC Department',
      ip: req.ip || '',
      userAgent: req.headers['user-agent'] || ''
    });

    sendNotification({
      type: 'bank_change_rejected',
      title: 'Bank Change Request Rejected ❌',
      message: `Aapki bank change request reject kar di gayi hai. Kaaran: ${remarks || 'Details mismatch'}`,
      data: { userId: user._id }
    });

    res.json({
      success: true,
      message: `User ${user.name} ki bank change request reject kar di gayi hai.`,
      user: {
        _id: user._id,
        bankChangeRequest: user.bankChangeRequest
      }
    });
  } catch (err) {
    res.status(500).json({ message: 'Failed to reject bank change request: ' + err.message });
  }
});

// Dashboard stats
router.get('/stats', protect, admin, async (req, res) => {
  try {
    const [
      users,
      pendingTxns,
      holdTxns,
      totalDeposits,
      totalYield,
      activeBonds,
      pendingLoans,
      totalLoans
    ] = await Promise.all([
      User.find({ role: { $ne: 'admin' } }).select('balance profitBalance').lean(),
      Transaction.countDocuments({ status: 'pending' }),
      Transaction.countDocuments({ $or: [{ status: 'hold' }, { isHold: true }] }),
      Transaction.aggregate([
        { $match: { type: 'deposit', status: { $in: ['approved', 'completed'] } } },
        { $group: { _id: null, total: { $sum: '$amount' } } }
      ]),
      Transaction.aggregate([
        { $match: { type: 'daily_yield' } },
        { $group: { _id: null, total: { $sum: '$amount' } } }
      ]),
      Bond.find({ status: 'active' }).select('principalAmount').lean(),
      Loan.countDocuments({ status: 'pending' }),
      Loan.countDocuments({ status: { $in: ['active', 'approved'] } })
    ]);

    const totalUsers = users.length;
    const totalUserBalances = Number(users.reduce((sum, u) => sum + (u.balance || 0), 0).toFixed(2));
    const totalUserProfits = Number(users.reduce((sum, u) => sum + (u.profitBalance || 0), 0).toFixed(4));
    const totalActiveBonds = Number(activeBonds.reduce((sum, b) => sum + (b.principalAmount || 0), 0).toFixed(2));
    const netFintechReserve = Math.round(totalUserBalances + totalActiveBonds);

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
    const isForce = req.query.force === 'true' || req.headers['cache-control'] === 'no-cache';
    if (!isForce) {
      const cached = memoryCache.get('admin_analytics');
      if (cached) return res.json(cached);
    }



    // 1. Parallel lean queries with projected fields (eliminates 50s timeouts from huge base64 fields)
    const Bond = require('../models/Bond');
    const [
      users,
      activeBonds,
      depositTxnsRaw,
      yieldTxnsRaw,
      withdrawalTxns,
      activeLoans,
      pendingTxnsCount,
      pendingLoansCount
    ] = await Promise.all([
      User.find({ role: { $ne: 'admin' } })
        .select('name email phone balance profitBalance lowestBalance24h createdAt accountNumber interestRate')
        .lean(),
      Bond.find({ status: 'active' })
        .select('principalAmount status')
        .lean(),
      Transaction.find({ type: 'deposit', status: { $in: ['approved', 'completed'] } })
        .select('userId amount type status createdAt method utrNumber referenceId')
        .sort({ createdAt: 1 })
        .lean(),
      Transaction.find({ type: 'daily_yield' })
        .select('userId amount type status createdAt referenceId remarks')
        .sort({ createdAt: 1 })
        .lean(),
      Transaction.find({ type: 'withdrawal', status: { $in: ['approved', 'completed'] } })
        .select('amount status')
        .lean(),
      Loan.find({ status: { $in: ['approved', 'active'] } })
        .select('amount status')
        .lean(),
      Transaction.countDocuments({ status: 'pending' }),
      Loan.countDocuments({ status: 'pending' })
    ]);

    const totalUsers = users.length;
    const totalUserBalances = Number(users.reduce((sum, u) => sum + (u.balance || 0), 0).toFixed(2));
    const totalUserProfits = Number(users.reduce((sum, u) => sum + (u.profitBalance || 0), 0).toFixed(4));
    const totalActiveBonds = Number(activeBonds.reduce((sum, b) => sum + (b.principalAmount || 0), 0).toFixed(2));
    const netFintechReserve = Math.round(totalUserBalances + totalActiveBonds);
    const totalWithdrawals = Number(withdrawalTxns.reduce((sum, w) => sum + (w.amount || 0), 0).toFixed(2));
    const totalLoansDisbursed = Number(activeLoans.reduce((sum, l) => sum + (l.amount || 0), 0).toFixed(2));

    // Fast in-memory user map (0ms)
    const userMap = new Map(users.map(u => [String(u._id), u]));

    const depositTxns = depositTxnsRaw.map(d => ({
      ...d,
      userId: userMap.get(String(d.userId)) || null
    }));

    const yieldTxns = yieldTxnsRaw.map(y => ({
      ...y,
      userId: userMap.get(String(y.userId)) || null
    }));

    const totalDeposits = Number(depositTxns.reduce((sum, d) => sum + (d.amount || 0), 0).toFixed(2));
    const totalYieldTxns = Number(yieldTxns.reduce((sum, y) => sum + (y.amount || 0), 0).toFixed(4));
    const totalYieldCredited = Math.max(totalUserProfits, totalYieldTxns);

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
        proofUrl: '', // On-demand via /txn-proof/:id prevents megabyte payload crashing mobile app
        hasProof: true
      });
    }

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

    // Ensure today's live accrued yield is accurately reflected in dailyMap without blocking DB operations
    const now = new Date();
    const todayStr = now.toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });
    const istMidnight = new Date(`${todayStr}T00:00:00+05:30`);
    const msElapsedToday = Math.max(0, now.getTime() - istMidnight.getTime());
    const dayProgress = Math.min(1, msElapsedToday / (24 * 3600 * 1000));
    const liveAccruedToday = Number(((totalDeposits * 0.12 / 365) * dayProgress).toFixed(2));

    if (!dailyMap[todayStr]) {
      const [y, m, d] = todayStr.split('-').map(Number);
      const dateObj = new Date(Date.UTC(y, m - 1, d, 12, 0, 0));
      dailyMap[todayStr] = {
        date: todayStr,
        displayDate: dateObj.toLocaleDateString('en-IN', { timeZone: 'Asia/Kolkata', day: '2-digit', month: 'short' }),
        amount: liveAccruedToday,
        txnCount: 1,
        users: new Set()
      };
    } else {
      dailyMap[todayStr].amount = Math.max(dailyMap[todayStr].amount, liveAccruedToday);
    }

    // Ensure all completed past calendar days reflect the full 12% p.a. daily compounding yield
    const fullDayCompoundingYield = Number(((totalDeposits * 0.12) / 365).toFixed(2));
    if (fullDayCompoundingYield > 0) {
      for (const dKey of Object.keys(dailyMap)) {
        if (dKey < todayStr && dKey >= '2026-10-09') {
          dailyMap[dKey].amount = Math.max(dailyMap[dKey].amount, fullDayCompoundingYield);
        }
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

    if (sortedDailyList.length === 0 && (totalYieldCredited > 0 || totalDeposits > 0)) {
      const todayStr = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });
      const [y, m, d] = todayStr.split('-').map(Number);
      const dateObj = new Date(Date.UTC(y, m - 1, d, 12, 0, 0));
      sortedDailyList.push({
        date: todayStr,
        displayDate: dateObj.toLocaleDateString('en-IN', { timeZone: 'Asia/Kolkata', day: '2-digit', month: 'short' }),
        amount: totalYieldCredited,
        txnCount: 1,
        users: new Set()
      });
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

    const payload = {
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
        totalLoans: activeLoans.length,
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
    };
    memoryCache.set('admin_analytics', payload, 5);
    res.json(payload);
  } catch (err) {
    console.error('Analytics fetch error:', err);
    res.status(500).json({ message: 'Failed to fetch fintech analytics' });
  }
});

// ------------------ REAL-TIME NOTIFICATIONS (SSE & DB) ------------------
const Notification = require('../models/Notification');
const { registerClient, removeClient } = require('../utils/notifier');
const jwt = require('jsonwebtoken');

// ---- SSE authentication -----------------------------------------------------------------
// The browser's EventSource cannot send headers, so the old code put the long-lived login
// token in the URL (?token=...) where it leaks into server logs, proxies and browser history.
// Now the client first calls POST /notifications/ticket (normal Bearer auth) and gets a
// 60-second, single-purpose ticket (signed with a DIFFERENT secret, so it can never be used
// as a normal login token) and opens the stream with ?ticket=...
const sseSecret = () => `${process.env.JWT_SECRET}::sse-ticket`;

router.post('/notifications/ticket', protect, staffOrAdmin, (req, res) => {
  const ticket = jwt.sign(
    { id: String(req.user._id), tv: req.user.tokenVersion || 0, purpose: 'sse' },
    sseSecret(),
    { expiresIn: '60s', algorithm: 'HS256' }
  );
  res.json({ ticket });
});

// SSE stream for Admin / Staff
router.get('/notifications/stream', (req, res) => {
  // CORS is already handled (with a strict whitelist) by the app-level cors() middleware.
  // The old code re-added Access-Control-Allow-Origin for ANY origin here - removed.
  const ticket = typeof req.query.ticket === 'string' ? req.query.ticket : null;
  const rawToken = typeof req.query.token === 'string' ? req.query.token : null;
  const bearer = req.headers.authorization && req.headers.authorization.startsWith('Bearer ')
    ? req.headers.authorization.split(' ')[1]
    : null;
  const tokenCandidate = rawToken || bearer;
  if (!ticket && !tokenCandidate) return res.status(401).json({ message: 'Authentication required' });

  try {
    const decoded = ticket
      ? jwt.verify(ticket, sseSecret(), { algorithms: ['HS256'] })
      : jwt.verify(tokenCandidate, process.env.JWT_SECRET, { algorithms: ['HS256'] });
    if (ticket && decoded.purpose !== 'sse') return res.status(401).json({ message: 'Invalid ticket' });
    User.findById(decoded.id).then(user => {
      if (!user || (user.role !== 'admin' && user.role !== 'staff')) {
        return res.status(403).end();
      }

      if (user.role === 'staff' && user.staffProfile?.isActive === false) {
        return res.status(403).end();
      }

      if ((typeof decoded.tv === 'number' ? decoded.tv : 0) !== (typeof user.tokenVersion === 'number' ? user.tokenVersion : 0)) {
        return res.status(401).end();
      }

      res.setHeader('Content-Type', 'text/event-stream');
      res.setHeader('Cache-Control', 'no-cache');
      res.setHeader('Connection', 'keep-alive');
      res.setHeader('X-Accel-Buffering', 'no');
      res.flushHeaders();

      // Initial connection greeting
      res.write(`data: ${JSON.stringify({ type: 'connected', message: 'SSE connected', role: user.role })}\n\n`);

      registerClient(res, user);

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

// Get recent notifications (Admin specific only - never user personal notifications)
router.get('/notifications', protect, admin, async (req, res) => {
  try {
    const adminFilter = {
      $or: [
        { targetRole: 'admin' },
        { targetRole: 'all' },
        { targetRole: { $exists: false }, userId: null }
      ]
    };
    const notifications = await Notification.find(adminFilter).sort({ createdAt: -1 }).limit(50);
    const unreadCount = await Notification.countDocuments({ ...adminFilter, read: false });
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

// Mark all read (Admin specific only)
router.patch('/notifications/read-all', protect, admin, async (req, res) => {
  try {
    const adminFilter = {
      $or: [
        { targetRole: 'admin' },
        { targetRole: 'all' },
        { targetRole: { $exists: false }, userId: null }
      ]
    };
    await Notification.updateMany({ ...adminFilter, read: false }, { read: true });
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

// On-demand KYC Document Fetch (Instant, lightweight - prevents transferring megabytes in lists)
router.get('/kyc-doc/:userId/:docKey', protect, requirePermission('kyc.view_documents'), async (req, res) => {
  try {
    const user = await User.findById(req.params.userId).select('kycDocuments');
    if (!user || !user.kycDocuments) return res.status(404).json({ message: 'User or documents not found' });
    const keyMap = {
      doc1: 'doc1Url',
      doc1Url: 'doc1Url',
      doc1Back: 'doc1BackUrl',
      doc1BackUrl: 'doc1BackUrl',
      doc2: 'doc2Url',
      doc2Url: 'doc2Url',
      doc2Back: 'doc2BackUrl',
      doc2BackUrl: 'doc2BackUrl',
      cheque: 'chequeUrl',
      chequeUrl: 'chequeUrl'
    };
    const field = keyMap[req.params.docKey] || req.params.docKey;
    let url = user.kycDocuments[field] || '';
    if (url) url = decryptData(url);
    res.json({ success: true, url, googleDriveLink: user.kycDocuments.googleDriveLink || '' });
  } catch (err) {
    res.status(500).json({ message: 'Failed to fetch KYC document' });
  }
});

// On-demand Transaction Proof Fetch (Prevents base64 bloat in bulk audit query)
router.get('/txn-proof/:id', protect, requirePermission('deposit.view_proof'), async (req, res) => {
  try {
    const txn = await Transaction.findById(req.params.id).select('proofUrl screenshotUrl adminEvidenceUrl paymentDetails');
    if (!txn) return res.status(404).json({ message: 'Transaction not found' });
    let url = txn.adminEvidenceUrl || txn.proofUrl || txn.screenshotUrl || '';
    if (url) url = decryptData(url);
    res.json({
      success: true,
      url,
      proofUrl: decryptData(txn.proofUrl || txn.screenshotUrl || ''),
      adminEvidenceUrl: decryptData(txn.adminEvidenceUrl || ''),
      qrCodeUrl: txn.paymentDetails?.qrCodeUrl || ''
    });
  } catch (err) {
    res.status(500).json({ message: 'Failed to fetch transaction proof' });
  }
});

// Comprehensive Multi-Category Audit History Endpoint (Ultra-fast metadata-only projection)
router.get('/audit-history', protect, admin, async (req, res) => {
  try {
    const { category = 'all', status = 'all', search = '', limit = 150 } = req.query;
    const limitNum = Math.min(parseInt(limit) || 150, 300);

    const historyItems = [];

    // 1. Transactions (Deposits, Withdrawals, P2P Transfers, Yields)
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

      const txns = await Transaction.aggregate([
        { $match: txQuery },
        { $sort: { createdAt: -1 } },
        { $limit: limitNum },
        {
          $lookup: {
            from: 'users',
            localField: 'userId',
            foreignField: '_id',
            as: 'userDoc'
          }
        },
        { $unwind: { path: '$userDoc', preserveNullAndEmptyArrays: true } },
        {
          $project: {
            type: 1, amount: 1, status: 1, createdAt: 1, approvedAt: 1, approverName: 1, approverDevice: 1, remarks: 1, utrNumber: 1, referenceId: 1, method: 1,
            'userId._id': '$userDoc._id',
            'userId.name': '$userDoc.name',
            'userId.email': '$userDoc.email',
            'userId.phone': '$userDoc.phone',
            'userId.accountNumber': '$userDoc.accountNumber',
            adminEvidenceNote: 1,
            paymentDetails: 1,
            hasProof: {
              $or: [
                { $gt: [{ $strLenCP: { $ifNull: ['$proofUrl', ''] } }, 0] },
                { $gt: [{ $strLenCP: { $ifNull: ['$screenshotUrl', ''] } }, 0] }
              ]
            },
            hasAdminEvidence: {
              $gt: [{ $strLenCP: { $ifNull: ['$adminEvidenceUrl', ''] } }, 0]
            },
            hasUserQr: {
              $gt: [{ $strLenCP: { $ifNull: ['$paymentDetails.qrCodeUrl', ''] } }, 0]
            },
            proofUrl: {
              $cond: [
                { $regexMatch: { input: { $ifNull: ['$proofUrl', ''] }, regex: '^https?://' } },
                '$proofUrl',
                ''
              ]
            },
            adminEvidenceUrl: {
              $cond: [
                { $regexMatch: { input: { $ifNull: ['$adminEvidenceUrl', ''] }, regex: '^https?://' } },
                '$adminEvidenceUrl',
                ''
              ]
            }
          }
        }
      ]);

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
        const proof = t.proofUrl || '';

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
          hasProof: Boolean(t.hasProof),
          hasAdminEvidence: Boolean(t.hasAdminEvidence),
          adminEvidenceUrl: t.adminEvidenceUrl || '',
          adminEvidenceNote: t.adminEvidenceNote || '',
          hasUserQr: Boolean(t.hasUserQr),
          paymentDetails: t.paymentDetails || null,
          utrNumber: t.utrNumber || '',
          reference: ref,
          referenceId: ref,
          notes: t.remarks || (isTransfer ? 'Peer-to-Peer Wallet Transfer' : t.method ? `Mode: ${t.method}` : 'Platform record'),
          remarks: t.remarks || ref
        });
      }
    }

    // 2. KYC History (Ultra-fast projection without multi-megabyte base64 images)
    if (category === 'all' || category === 'kyc' || category === 'normal_kyc' || category === 'loan_kyc') {
      const kycUsers = await User.aggregate([
        {
          $match: {
            $or: [
              { kycStatus: { $in: ['verified', 'rejected', 'pending'] } },
              { 'kycDocuments.submittedAt': { $ne: null } }
            ]
          }
        },
        {
          $project: {
            name: 1, email: 1, phone: 1, accountNumber: 1, kycStatus: 1, kycVerifiedAt: 1, kycApprovedBy: 1, createdAt: 1,
            'kycDocuments.docType': 1, 'kycDocuments.doc1Type': 1, 'kycDocuments.doc2Type': 1,
            'kycDocuments.aadharNumber': 1, 'kycDocuments.panNumber': 1, 'kycDocuments.chequeNumber': 1,
            'kycDocuments.submittedAt': 1, 'kycDocuments.adminRemarks': 1,
            hasDoc1: { $gt: [{ $strLenCP: { $ifNull: ['$kycDocuments.doc1Url', ''] } }, 0] },
            hasDoc1Back: { $gt: [{ $strLenCP: { $ifNull: ['$kycDocuments.doc1BackUrl', ''] } }, 0] },
            hasDoc2: { $gt: [{ $strLenCP: { $ifNull: ['$kycDocuments.doc2Url', ''] } }, 0] },
            hasDoc2Back: { $gt: [{ $strLenCP: { $ifNull: ['$kycDocuments.doc2BackUrl', ''] } }, 0] }
          }
        }
      ]);

      const userIds = kycUsers.map(u => u._id);
      const [loansForUsers, bondsForUsers] = await Promise.all([
        Loan.find({ userId: { $in: userIds } }).select('userId amount status loanType').lean(),
        Bond.find({ userId: { $in: userIds } }).select('userId principalAmount planName monthlyPayout status documents.chequeUrl').lean()
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

        const hasBondCheque = userBonds.length > 0 && !!(userBonds[0].documents?.chequeUrl);
        const isLoanLending = docs.doc2Type === 'cheque' || !!docs.chequeNumber || userLoans.length > 0 || userBonds.length > 0;

        if (category === 'normal_kyc' && isLoanLending) continue;
        if (category === 'loan_kyc' && !isLoanLending) continue;

        const ts = u.kycVerifiedAt || docs.submittedAt || u.createdAt;
        const aadharNo = docs.aadharNumber || '';
        const panNo = docs.panNumber || '';
        const chequeNo = docs.chequeNumber || '';
        const hasPhotos = Boolean(u.hasDoc1 || u.hasDoc1Back || u.hasDoc2 || u.hasDoc2Back || hasBondCheque);

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
          proofUrl: '',
          screenshotUrl: '',
          hasProof: hasPhotos,
          reference: kycRef,
          referenceId: kycRef,
          notes: detailsNote,
          remarks: detailsNote,
          hasPhotos,
          documents: {
            doc1Url: u.hasDoc1 ? 'doc1Url' : '',
            doc1BackUrl: u.hasDoc1Back ? 'doc1BackUrl' : '',
            doc2Url: (u.hasDoc2 || hasBondCheque) ? 'doc2Url' : '',
            doc2BackUrl: u.hasDoc2Back ? 'doc2BackUrl' : ''
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
      }).select('name email phone accountNumber agentProfile createdAt').lean();

      for (const a of agentUsers) {
        const aStatus = a.agentProfile?.status || 'approved';
        if (status !== 'all' && aStatus !== status && !(status === 'approved' && aStatus === 'approved')) continue;

        const ts = a.agentProfile?.approvedAt || a.agentProfile?.appliedAt || a.createdAt;
        const rawComms = a.agentProfile?.commissions || null;
        const baseRate = a.agentProfile?.commissionRate;
        const hasBase = typeof baseRate === 'number' && !isNaN(baseRate);
        const comms = {
          loan: rawComms?.loan !== undefined ? rawComms.loan : (hasBase ? baseRate : 1),
          lending: rawComms?.lending !== undefined ? rawComms.lending : (hasBase ? baseRate : 4),
          investment: rawComms?.investment !== undefined ? rawComms.investment : (hasBase ? baseRate : 1),
          bond: rawComms?.bond !== undefined ? rawComms.bond : (hasBase ? baseRate : 4)
        };
        const agentRef = a.accountNumber ? `A/C: ${a.accountNumber}` : `Agent: ${a.phone}`;
        const agentNote = `${a.agentProfile?.businessName || 'Business Partner'} • Loan: ${comms.loan}% | Lend: ${comms.lending}% | Bond: ${comms.bond}%`;

        historyItems.push({
          id: 'agent_' + a._id,
          category: 'agent',
          type: 'agent_application',
          title: `Agent Partner (${a.agentProfile?.businessName || a.name || 'Partner'})`,
          userName: a.name,
          userEmail: a.email,
          userPhone: a.phone,
          accountNumber: a.accountNumber || '—',
          amount: 0,
          commissions: comms,
          commissionRate: hasBase ? baseRate : (comms.loan || 1),
          status: aStatus === 'approved' ? 'approved' : aStatus,
          timestamp: ts,
          createdAt: ts,
          requestedAt: a.agentProfile?.appliedAt || a.createdAt,
          approvedAt: a.agentProfile?.approvedAt || (aStatus === 'approved' ? ts : null),
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
        .select('accountNumber loanType amount status installmentsCount interestRate disbursalAmount totalPayable remainingAmount createdAt approvedAt approverName approverDevice userId documents.chequeNumber')
        .populate('userId', 'name email phone accountNumber')
        .sort({ createdAt: -1 })
        .limit(limitNum)
        .lean();

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
        const proof = (l.documents?.chequeUrl && (l.documents.chequeUrl.startsWith('http://') || l.documents.chequeUrl.startsWith('https://'))) ? l.documents.chequeUrl : '';

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
          hasProof: Boolean(l.documents?.chequeUrl || l.documents?.doc1Url),
          reference: loanRef,
          referenceId: loanRef,
          notes: loanNote,
          remarks: loanNote
        });
      }
    }

    // 5. Corporate / Lending Bonds History
    if (category === 'all' || category === 'bond') {
      const bondQuery = {};
      if (status !== 'all') {
        if (status === 'approved') bondQuery.status = { $in: ['active', 'matured'] };
        else bondQuery.status = status;
      }

      const allBonds = await Bond.find(bondQuery)
        .select('accountNumber planName principalAmount monthlyPayout status createdAt userId documents.chequeNumber')
        .populate('userId', 'name email phone accountNumber')
        .sort({ createdAt: -1 })
        .limit(limitNum)
        .lean();

      for (const b of allBonds) {
        const ts = b.createdAt || new Date();
        const bondRef = b.accountNumber || `BOND_${b._id.toString().slice(-6).toUpperCase()}`;
        const bondNote = `${b.planName || 'Corporate'} Bond • Monthly Payout: ₹${Number(b.monthlyPayout || 0).toLocaleString('en-IN')} • Principal: ₹${Number(b.principalAmount || 0).toLocaleString('en-IN')}`;
        const isApprovedBond = ['active', 'matured'].includes(b.status);
        const reqDate = b.createdAt || new Date();
        const appDate = isApprovedBond ? b.createdAt : null;

        historyItems.push({
          id: 'bond_' + b._id,
          category: 'bond',
          type: 'bond_investment',
          title: `${b.planName || 'Corporate'} Lending Bond`,
          userName: b.userId?.name || 'Investor',
          userEmail: b.userId?.email || 'N/A',
          userPhone: b.userId?.phone || 'N/A',
          accountNumber: b.accountNumber || b.userId?.accountNumber || '—',
          amount: b.principalAmount || 0,
          status: b.status === 'active' ? 'approved' : b.status,
          timestamp: ts,
          createdAt: ts,
          requestedAt: reqDate,
          approvedAt: appDate,
          turnaround: '',
          approverName: isApprovedBond ? 'Admin' : '',
          approverDevice: isApprovedBond ? '💻 Windows PC • Chrome' : '',
          proofUrl: '',
          screenshotUrl: '',
          hasProof: Boolean(b.documents?.chequeUrl),
          reference: bondRef,
          referenceId: bondRef,
          notes: bondNote,
          remarks: bondNote
        });
      }
    }

    // Sort descending by timestamp
    historyItems.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

    // Search filter if provided (with safe null guards)
    let filtered = historyItems;
    if (search && search.trim()) {
      const s = search.trim().toLowerCase();
      filtered = filtered.filter(item =>
        (item.userName || '').toLowerCase().includes(s) ||
        (item.userEmail || '').toLowerCase().includes(s) ||
        (item.userPhone || '').toLowerCase().includes(s) ||
        (item.accountNumber || '').toLowerCase().includes(s) ||
        (item.remarks || '').toLowerCase().includes(s)
      );
    }

    res.json({
      success: true,
      total: filtered.length,
      history: filtered.slice(0, limitNum)
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

// Instant Lightweight Encrypted System Backup Export
router.get('/backup/export', protect, admin, async (req, res) => {
  try {
    const [users, loans, bonds, txns, settings] = await Promise.all([
      User.find({ role: { $ne: 'admin' } }).select('name email phone role balance profitBalance kycStatus loanLimit createdAt').lean(),
      Loan.find().select('userId amount status totalPayable paidAmount remainingAmount installmentAmount installmentsCount loanType createdAt').lean(),
      Bond.find().select('userId principalAmount status interestRate maturityMonths accruedInterest createdAt').lean(),
      Transaction.find().sort({ createdAt: -1 }).limit(100).select('userId type amount status utrNumber referenceId remarks createdAt').lean(),
      Settings.find().lean()
    ]);

    const summary = {
      timestamp: Date.now(),
      dateStr: new Date().toISOString(),
      usersCount: users.length,
      loansCount: loans.length,
      bondsCount: bonds.length,
      txnsCount: txns.length,
      activeLoansVolume: loans.filter(l => l.status === 'active').reduce((s, l) => s + (l.amount || 0), 0),
      totalBondPrincipal: bonds.filter(b => b.status === 'active').reduce((s, b) => s + (b.principalAmount || 0), 0)
    };

    const rawPayload = JSON.stringify({ summary, users, loans, bonds, txns, settings });
    const encryptedString = encryptData(rawPayload);
    const sizeKb = +(Buffer.byteLength(encryptedString, 'utf8') / 1024).toFixed(1);
    const dateFormatted = new Date().toISOString().slice(0, 10).replace(/-/g, '');

    res.json({
      success: true,
      filename: `educa_backup_${dateFormatted}_${Date.now().toString().slice(-4)}.enc`,
      summary,
      sizeKb,
      payload: encryptedString
    });
  } catch (err) {
    console.error('Backup export error:', err);
    res.status(500).json({ success: false, message: 'Failed to create encrypted backup' });
  }
});

// Unified Capital Portfolio & Fund Flow Hub Metrics
router.get('/capital-portfolio', protect, admin, async (req, res) => {
  try {
    const [loans, bonds, withdrawalAgg, depositAgg, pendingWithdrawals, withdrawalList, depositList, profitList] = await Promise.all([
      Loan.find().populate('userId', 'name email phone').sort({ createdAt: -1 }).lean(),
      Bond.find().populate('userId', 'name email phone').sort({ createdAt: -1 }).lean(),
      Transaction.aggregate([
        { $match: { type: 'withdrawal', status: { $in: ['approved', 'completed'] } } },
        { $group: { _id: null, totalAmount: { $sum: '$amount' }, count: { $sum: 1 }, uniqueUsers: { $addToSet: '$userId' } } }
      ]),
      Transaction.aggregate([
        { $match: { type: 'deposit', status: { $in: ['approved', 'completed'] } } },
        { $group: { _id: null, totalAmount: { $sum: '$amount' }, count: { $sum: 1 } } }
      ]),
      Transaction.find({ type: 'withdrawal', status: 'pending' }).lean(),
      Transaction.find({ type: 'withdrawal' }).populate('userId', 'name email phone').sort({ createdAt: -1 }).limit(100).lean(),
      Transaction.find({ type: 'deposit' }).populate('userId', 'name email phone').sort({ createdAt: -1 }).limit(100).lean(),
      Transaction.find({ type: { $in: ['daily_yield', 'profit_transfer', 'referral_bonus'] } }).populate('userId', 'name email phone').sort({ createdAt: -1 }).limit(100).lean()
    ]);

    // 1. Loans Metrics
    const uniqueBorrowerIds = new Set(loans.map(l => String(l.userId?._id || l.userId)));
    const totalLoanDisbursed = loans.reduce((s, l) => s + (l.amount || 0), 0);
    const totalLoanRecovered = loans.reduce((s, l) => s + (l.paidAmount || 0), 0);
    const activeLoanDue = loans.filter(l => l.status === 'active').reduce((s, l) => s + (l.remainingAmount || 0), 0);
    const activeLoans = loans.filter(l => l.status === 'active');

    // 2. Bonds & Investments Metrics
    const uniqueInvestorIds = new Set(bonds.map(b => String(b.userId?._id || b.userId)));
    const totalBondPrincipal = bonds.reduce((s, b) => s + (b.principalAmount || 0), 0);
    const totalBondYield = bonds.reduce((s, b) => s + (b.accruedInterest || 0), 0);
    const activeBonds = bonds.filter(b => b.status === 'active');

    // 3. Cash-out Metrics
    const approvedWithdrawalData = withdrawalAgg[0] || { totalAmount: 0, count: 0, uniqueUsers: [] };
    const pendingWithdrawalAmount = pendingWithdrawals.reduce((s, t) => s + (t.amount || 0), 0);

    // 4. Net Platform Flow & Deposits
    const totalDeposited = depositAgg[0]?.totalAmount || 0;
    const totalProfitYield = profitList.reduce((s, p) => s + (p.amount || 0), 0);

    res.json({
      success: true,
      loans: {
        totalLoans: loans.length,
        activeLoansCount: activeLoans.length,
        borrowersCount: uniqueBorrowerIds.size,
        totalDisbursed: totalLoanDisbursed,
        totalRecovered: totalLoanRecovered,
        activeOutstanding: activeLoanDue,
        items: loans.slice(0, 100)
      },
      investments: {
        totalBonds: bonds.length,
        activeBondsCount: activeBonds.length,
        investorsCount: uniqueInvestorIds.size,
        totalPrincipal: totalBondPrincipal,
        totalYieldDistributed: totalBondYield,
        items: bonds.slice(0, 100)
      },
      cashOut: {
        totalCashOutAmount: approvedWithdrawalData.totalAmount,
        totalCashOutCount: approvedWithdrawalData.count,
        cashOutUsersCount: (approvedWithdrawalData.uniqueUsers || []).length,
        pendingAmount: pendingWithdrawalAmount,
        pendingCount: pendingWithdrawals.length,
        items: withdrawalList
      },
      deposits: {
        totalDeposited,
        count: depositAgg[0]?.count || 0,
        items: depositList
      },
      profit: {
        totalYieldDistributed: totalProfitYield,
        count: profitList.length,
        items: profitList
      },
      flow: {
        totalInflow: totalDeposited + totalLoanRecovered,
        totalOutflow: totalLoanDisbursed + approvedWithdrawalData.totalAmount,
        systemNetReserve: (totalDeposited + totalLoanRecovered) - (totalLoanDisbursed + approvedWithdrawalData.totalAmount)
      }
    });
  } catch (err) {
    console.error('Capital portfolio error:', err);
    res.status(500).json({ success: false, message: 'Failed to fetch capital portfolio metrics: ' + err.message });
  }
});

// ============================================================================
// STAFF DESKS & PERMISSIONS SYSTEM ENDPOINTS
// ============================================================================

// Desk Queues: High-performance aggregated queue fetch for staff & admin desks
router.get('/desk/queues', protect, staffOrAdmin, async (req, res) => {
  try {
    const isStaff = req.user.role === 'staff';
    const allowedDepts = getAllowedDepartments(req.user);
    const deptsKey = allowedDepts.slice().sort().join('_');
    const cacheKey = `desk_queues_${isStaff ? req.user._id : 'admin'}_${deptsKey}`;

    // Return in-memory cache instantly (sub-millisecond) if fresh within 8 seconds
    const cached = memoryCache.get(cacheKey);
    if (cached && !req.headers['x-force-refresh']) {
      res.setHeader('X-Cache', 'HIT');
      res.setHeader('Cache-Control', 'private, max-age=4');
      return res.json(cached);
    }

    const queues = {
      deposit: [],
      withdrawal: [],
      loan: [],
      kyc: [],
      bankChanges: [],
      lending: [],
      bond: [],
      counts: { deposit: 0, withdrawal: 0, loan: 0, kyc: 0, lending: 0, bond: 0, bankChanges: 0 }
    };

    const promises = [];

    // Deposits, Withdrawals & Lending Transactions (Optimized projection: pending first + recent past)
    if (allowedDepts.includes('deposit') || allowedDepts.includes('withdrawal') || allowedDepts.includes('lending')) {
      const typeConditions = [];
      if (allowedDepts.includes('deposit') || !isStaff) typeConditions.push({ type: 'deposit' });
      if (allowedDepts.includes('withdrawal') || !isStaff) typeConditions.push({ type: 'withdrawal' });
      if (allowedDepts.includes('lending') || !isStaff) {
        typeConditions.push({ sourceWallet: 'lending' });
        typeConditions.push({ type: /lending/i });
      }

      const txQuery = typeConditions.length === 1 ? typeConditions[0] : (typeConditions.length > 1 ? { $or: typeConditions } : {});

      promises.push(
        Transaction.find(txQuery)
          .select('userId type amount status isHold sourceWallet referenceId utrNumber method upiId accountNumber remarks createdAt claim approvedAt handledBy updatedAt')
          .populate('userId', 'name email phone accountNumber')
          .sort({ createdAt: -1 })
          .limit(80)
          .maxTimeMS(8000)
          .lean()
          .then(txns => {
            // Sort: pending & hold on top, followed by recent approved/completed/rejected
            const sortedTxns = [...txns].sort((a, b) => {
              const aPending = ['pending', 'hold'].includes(a.status) ? 1 : 0;
              const bPending = ['pending', 'hold'].includes(b.status) ? 1 : 0;
              if (aPending !== bPending) return bPending - aPending;
              return new Date(b.createdAt) - new Date(a.createdAt);
            });

            sortedTxns.forEach(t => {
              t.hasProof = Boolean(t.utrNumber || t.referenceId);
              if (t.type === 'deposit' && (allowedDepts.includes('deposit') || !isStaff)) {
                queues.deposit.push(t);
              } else if (t.type === 'withdrawal' && (allowedDepts.includes('withdrawal') || !isStaff)) {
                queues.withdrawal.push(t);
              } else if ((t.sourceWallet === 'lending' || (t.type && t.type.includes('lending'))) && (allowedDepts.includes('lending') || !isStaff)) {
                queues.lending.push(t);
              }
            });
            queues.counts.deposit = queues.deposit.filter(t => ['pending', 'hold'].includes(t.status)).length;
            queues.counts.withdrawal = queues.withdrawal.filter(t => ['pending', 'hold'].includes(t.status)).length;
            queues.counts.lending = queues.lending.filter(t => ['pending', 'hold'].includes(t.status)).length;
          })
          .catch(err => console.warn('Desk tx queue notice:', err.message))
      );
    }

    // Loans Queue (Exclude heavy 30-item subdocument schedules for 10x query speed)
    if (allowedDepts.includes('loan')) {
      promises.push(
        Loan.find({ status: { $in: ['pending', 'active'] } })
          .select('-installmentSchedule -emiSchedule -history')
          .populate('userId', 'name email phone accountNumber aadharNumber panNumber address bankAccount kycStatus')
          .sort({ createdAt: -1 })
          .limit(60)
          .maxTimeMS(8000)
          .lean()
          .then(loans => {
            queues.loan = loans;
            queues.counts.loan = loans.filter(l => l.status === 'pending').length;
          })
          .catch(err => console.warn('Desk loan queue notice:', err.message))
      );
    }

    // KYC Verification & Bank Change Request Queue
    if (allowedDepts.includes('kyc')) {
      promises.push(
        User.find({
          role: { $ne: 'admin' },
          $or: [
            { kycStatus: { $in: ['pending', 'verified', 'rejected'] } },
            { 'kycDocuments.submittedAt': { $ne: null } },
            { 'kycDocuments.doc1Url': { $exists: true, $ne: '' } },
            { aadharNumber: { $exists: true, $ne: null, $ne: '' } }
          ]
        })
          .select('name email phone aadharNumber panNumber address bankAccount kycStatus kycDocuments createdAt accountNumber upiId cardStatus avatar photoUrl approvedAt kycApprovedAt kycVerifiedAt kycApprovedBy updatedAt')
          .sort({ 'kycDocuments.submittedAt': -1, createdAt: -1 })
          .limit(100)
          .maxTimeMS(8000)
          .lean()
          .then(users => {
            queues.kyc = users;
            queues.counts.kyc = users.filter(u => u.kycStatus === 'pending').length;
          })
          .catch(err => console.warn('Desk kyc queue notice:', err.message))
      );

      promises.push(
        User.find({ 'bankChangeRequest.status': 'pending', role: { $ne: 'admin' } })
          .select('name email phone accountNumber kycStatus bankAccount bankChangeRequest createdAt')
          .sort({ 'bankChangeRequest.requestedAt': -1 })
          .limit(50)
          .maxTimeMS(8000)
          .lean()
          .then(users => {
            queues.bankChanges = users.map(u => ({
              _id: u._id,
              userId: u._id,
              userName: u.name,
              name: u.name,
              userEmail: u.email,
              email: u.email,
              userPhone: u.phone,
              phone: u.phone,
              accountNumber: u.accountNumber || '—',
              kycStatus: u.kycStatus,
              currentBank: u.bankAccount || {},
              bankAccount: u.bankAccount || {},
              bankChangeRequest: u.bankChangeRequest || {},
              status: 'pending',
              department: 'kyc',
              type: 'bank_change_request',
              requestedAt: u.bankChangeRequest?.requestedAt || u.createdAt,
              createdAt: u.bankChangeRequest?.requestedAt || u.createdAt
            }));
            queues.counts.bankChanges = queues.bankChanges.length;
          })
          .catch(err => console.warn('Desk bankChange queue notice:', err.message))
      );
    }

    // Bonds & Fixed Returns
    if (allowedDepts.includes('bond') || allowedDepts.includes('lending')) {
      promises.push(
        Bond.find({ status: 'pending' })
          .select('userId bondType amount tenure interestRate status createdAt')
          .populate('userId', 'name email phone accountNumber')
          .sort({ createdAt: -1 })
          .limit(60)
          .maxTimeMS(8000)
          .lean()
          .then(bonds => {
            bonds.forEach(b => {
              if (['lending_40', 'lending_80'].includes(b.bondType)) {
                if (allowedDepts.includes('lending')) {
                  queues.lending.push(b);
                  queues.counts.lending++;
                }
              } else {
                if (allowedDepts.includes('bond')) {
                  queues.bond.push(b);
                  queues.counts.bond++;
                }
              }
            });
          })
          .catch(err => console.warn('Desk bond queue notice:', err.message))
      );
    }

    await Promise.all(promises);

    let deptPool = null;
    if (allowedDepts.includes('loan')) {
      const poolSetting = await Settings.findOne({ key: 'loanDepartmentPool' }).lean();
      const totalPool = poolSetting ? Number(poolSetting.value) || 1000000 : 1000000;
      const activeLoansAgg = await Loan.aggregate([
        { $match: { status: { $in: ['active', 'approved'] } } },
        { $group: { _id: null, totalDisbursed: { $sum: '$amount' }, count: { $sum: 1 } } }
      ]);
      const marketDisbursed = activeLoansAgg[0]?.totalDisbursed || 0;
      const activeLoansCount = activeLoansAgg[0]?.count || 0;
      const availablePool = Math.max(0, totalPool - marketDisbursed);
      const utilizationPercent = totalPool > 0 ? Math.min(100, Number(((marketDisbursed / totalPool) * 100).toFixed(1))) : 0;
      deptPool = { totalPool, marketDisbursed, availablePool, activeLoansCount, utilizationPercent, success: true };
    }

    const payload = {
      success: true,
      allowedDepartments: allowedDepts,
      counts: queues.counts,
      queues,
      deptPool
    };

    // Cache in memory for 8 seconds
    memoryCache.set(cacheKey, payload, 8);

    res.setHeader('X-Cache', 'MISS');
    res.setHeader('Cache-Control', 'private, max-age=4');
    res.json(payload);
  } catch (err) {
    res.status(500).json({ message: 'Failed to load desk queues: ' + err.message });
  }
});

// On-demand proof fetching (zero queue bloat, instant response)
router.get('/transaction/:id/proof', protect, staffOrAdmin, async (req, res) => {
  try {
    if (!isValidId(req.params.id)) return res.status(400).json({ success: false, message: 'Invalid ID' });
    const tx = await Transaction.findById(req.params.id).select('proofUrl screenshotUrl adminEvidenceUrl');
    if (!tx) return res.status(404).json({ success: false, message: 'Transaction not found' });
    res.json({
      success: true,
      proofUrl: tx.proofUrl || tx.screenshotUrl || '',
      screenshotUrl: tx.screenshotUrl || tx.proofUrl || '',
      adminEvidenceUrl: tx.adminEvidenceUrl || ''
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// Claim an item (prevents concurrent handling collisions between staff)
router.post('/claim/:type/:id', protect, staffOrAdmin, async (req, res) => {
  try {
    const { type, id } = req.params;
    if (!['transaction', 'loan', 'bond'].includes(type) || !isValidId(id)) {
      return res.status(400).json({ message: 'Invalid claim parameters' });
    }

    const Model = type === 'transaction' ? Transaction : (type === 'loan' ? Loan : Bond);
    const item = await Model.findById(id);
    if (!item) return res.status(404).json({ message: 'Item not found' });

    const now = new Date();
    if (item.claim && item.claim.claimedBy && item.claim.expiresAt > now) {
      if (item.claim.claimedBy.toString() !== req.user._id.toString()) {
        return res.status(409).json({
          message: `Already claimed by ${item.claim.claimedByName || 'another staff member'}`,
          claimedBy: item.claim.claimedByName,
          expiresAt: item.claim.expiresAt
        });
      }
    }

    const expiresAt = new Date(now.getTime() + 5 * 60 * 1000); // 5 min lease
    item.claim = {
      claimedBy: req.user._id,
      claimedByName: req.user.name,
      claimedAt: now,
      expiresAt
    };
    await item.save();
    memoryCache.delPrefix('desk_queues');

    res.json({ success: true, message: 'Item claimed successfully', claim: item.claim });
  } catch (err) {
    res.status(500).json({ message: 'Failed to claim item: ' + err.message });
  }
});

// Release an item claim
router.post('/release-claim/:type/:id', protect, staffOrAdmin, async (req, res) => {
  try {
    const { type, id } = req.params;
    if (!['transaction', 'loan', 'bond'].includes(type) || !isValidId(id)) {
      return res.status(400).json({ message: 'Invalid claim parameters' });
    }

    const Model = type === 'transaction' ? Transaction : (type === 'loan' ? Loan : Bond);
    const item = await Model.findById(id);
    if (!item) return res.status(404).json({ message: 'Item not found' });

    if (item.claim?.claimedBy && item.claim.claimedBy.toString() !== req.user._id.toString() && req.user.role !== 'admin') {
      return res.status(403).json({ message: 'Cannot release claim held by another staff member' });
    }

    item.claim = null;
    await item.save();
    memoryCache.delPrefix('desk_queues');

    res.json({ success: true, message: 'Claim released successfully' });
  } catch (err) {
    res.status(500).json({ message: 'Failed to release claim: ' + err.message });
  }
});

// Staff Management: List all staff (Admin only)
router.get('/staff', protect, admin, async (req, res) => {
  try {
    const staffMembers = await User.find({ role: 'staff' })
      .select('name email phone role staffProfile createdAt isBlocked lastYieldCalculatedAt tokenVersion')
      .sort({ createdAt: -1 })
      .lean();

    const staffIds = staffMembers.map(s => s._id);
    const counts = await AuditLog.aggregate([
      { $match: { actorId: { $in: staffIds } } },
      { $group: { _id: '$actorId', totalActions: { $sum: 1 }, lastActionAt: { $max: '$createdAt' } } }
    ]);
    const countsMap = {};
    counts.forEach(c => { countsMap[c._id.toString()] = c; });

    const enriched = staffMembers.map(s => ({
      ...s,
      stats: {
        totalActions: countsMap[s._id.toString()]?.totalActions || 0,
        lastActionAt: countsMap[s._id.toString()]?.lastActionAt || null
      }
    }));

    res.json({ success: true, staff: enriched });
  } catch (err) {
    res.status(500).json({ message: 'Failed to fetch staff list: ' + err.message });
  }
});

// Staff Management: Create new staff member (Admin only)
router.post('/staff', protect, admin, async (req, res) => {
  try {
    const { name, email, phone, departments = [], permissions = [], limits = {}, tempPassword } = req.body;
    if (!name || !email) {
      return res.status(400).json({ message: 'Name and email are required.' });
    }

    const cleanEmail = email.trim().toLowerCase();
    const cleanPhone = (phone && phone.trim()) || ('EM' + Math.floor(1000000000 + Math.random() * 9000000000));

    const exists = await User.findOne({
      $or: [{ email: cleanEmail }, { phone: cleanPhone }]
    });
    if (exists) {
      if (exists.role === 'admin') {
        return res.status(400).json({ message: 'Cannot convert Super Admin account to staff.' });
      }
      exists.role = 'staff';
      if (name && name.trim()) exists.name = name.trim();
      exists.tokenVersion = (exists.tokenVersion || 0) + 1;
      exists.staffProfile = {
        departments: Array.isArray(departments) ? departments : [],
        permissions: Array.isArray(permissions) ? permissions : [],
        isActive: true,
        createdBy: req.user._id,
        createdAt: exists.staffProfile?.createdAt || new Date(),
        limits: {
          maxApprovalAmount: Number(limits?.maxApprovalAmount) || 0
        },
        lastActiveAt: new Date()
      };

      let rawPassword = tempPassword;
      if (tempPassword && tempPassword.trim().length >= 6) {
        exists.password = await bcrypt.hash(tempPassword.trim(), 12);
        exists.mustChangePassword = true;
      }

      await exists.save();

      // Clear caches
      memoryCache.del(`user_me_${exists._id}`);
      memoryCache.delPrefix('user_me_' + exists._id);
      try {
        const { notifyPermissionsChanged } = require('../utils/notifier');
        notifyPermissionsChanged(exists._id);
      } catch (_) {}

      await AuditLog.create({
        actorId: req.user._id,
        actorName: req.user.name,
        actorRole: req.user.role,
        department: 'staff',
        action: 'staff.role_assigned',
        entityType: 'staff',
        entityId: exists._id.toString(),
        userId: exists._id,
        note: `Existing user upgraded to staff with departments: ${(departments || []).join(', ')}`,
        ip: req.ip || '',
        userAgent: req.headers['user-agent'] || ''
      });

      return res.json({
        success: true,
        message: 'Existing user upgraded to staff successfully.',
        temporaryPassword: rawPassword || '(existing user password retained)',
        staff: {
          id: exists._id,
          name: exists.name,
          email: exists.email,
          phone: exists.phone,
          role: exists.role,
          staffProfile: exists.staffProfile
        }
      });
    }

    const rawPassword = tempPassword && tempPassword.trim().length >= 6
      ? tempPassword.trim()
      : 'EFS@' + crypto.randomBytes(4).toString('hex').toUpperCase();

    const hashedPassword = await bcrypt.hash(rawPassword, 12);

    const staffUser = await User.create({
      name: name.trim(),
      email: cleanEmail,
      phone: cleanPhone,
      password: hashedPassword,
      role: 'staff',
      tokenVersion: 0,
      mustChangePassword: true,
      tempPasswordAssigned: true,
      staffProfile: {
        departments: Array.isArray(departments) ? departments : [],
        permissions: Array.isArray(permissions) ? permissions : [],
        isActive: true,
        createdBy: req.user._id,
        createdAt: new Date(),
        limits: {
          maxApprovalAmount: Number(limits?.maxApprovalAmount ?? req.body.maxApprovalAmount) || 0
        },
        lastActiveAt: null
      }
    });

    await AuditLog.create({
      actorId: req.user._id,
      actorName: req.user.name,
      actorRole: req.user.role,
      department: 'staff',
      action: 'staff.create',
      entityType: 'staff',
      entityId: staffUser._id.toString(),
      userId: staffUser._id,
      note: `Staff member created with departments: ${staffUser.staffProfile.departments.join(', ')}`,
      ip: req.ip || '',
      userAgent: req.headers['user-agent'] || ''
    });

    res.json({
      success: true,
      message: 'Staff member created successfully.',
      tempPassword: rawPassword,
      staff: {
        id: staffUser._id,
        name: staffUser.name,
        email: staffUser.email,
        phone: staffUser.phone,
        role: staffUser.role,
        staffProfile: staffUser.staffProfile
      }
    });
  } catch (err) {
    res.status(500).json({ message: 'Failed to create staff member: ' + err.message });
  }
});

// Assign Role & Desks to Any Existing User or Update Staff Profile
router.post('/user/:id/assign-role', protect, admin, async (req, res) => {
  if (!isValidId(req.params.id)) return res.status(400).json({ message: 'Invalid user ID' });
  try {
    const { role = 'staff', departments = [], permissions = [], limits = {}, isActive = true } = req.body;

    const user = await User.findById(req.params.id);
    if (!user) return res.status(404).json({ message: 'User not found' });
    if (user.role === 'admin') return res.status(400).json({ message: 'Cannot modify Super Admin role' });

    user.role = role === 'staff' ? 'staff' : 'user';
    user.tokenVersion = (user.tokenVersion || 0) + 1; // Invalidate active session to force reload permissions

    if (user.role === 'staff') {
      user.staffProfile = {
        departments: Array.isArray(departments) ? departments : [],
        permissions: Array.isArray(permissions) ? permissions : [],
        isActive: isActive !== false,
        createdBy: req.user._id,
        createdAt: user.staffProfile?.createdAt || new Date(),
        limits: {
          maxApprovalAmount: Number(limits?.maxApprovalAmount ?? req.body.maxApprovalAmount) || 0
        },
        lastActiveAt: new Date()
      };
    } else {
      if (user.staffProfile) {
        user.staffProfile.isActive = false;
      }
    }

    await user.save();

    memoryCache.del(`user_me_${user._id}`);
    memoryCache.delPrefix('user_me_' + user._id);
    try {
      const { notifyPermissionsChanged } = require('../utils/notifier');
      notifyPermissionsChanged(user._id);
    } catch (_) {}

    await AuditLog.create({
      actorId: req.user._id,
      actorName: req.user.name,
      actorRole: req.user.role,
      department: 'staff',
      action: user.role === 'staff' ? 'staff.role_assigned' : 'staff.role_revoked',
      entityType: 'user',
      entityId: user._id.toString(),
      userId: user._id,
      note: `Assigned role ${user.role} with departments: ${(departments || []).join(', ')}`,
      ip: req.ip || '',
      userAgent: req.headers['user-agent'] || ''
    });

    res.json({
      success: true,
      message: `User role updated to ${user.role} successfully`,
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        phone: user.phone,
        role: user.role,
        staffProfile: user.staffProfile
      }
    });
  } catch (err) {
    res.status(500).json({ message: 'Failed to assign role: ' + err.message });
  }
});

// Staff Management: Update permissions (Admin only)
router.patch('/staff/:id/permissions', protect, admin, async (req, res) => {
  try {
    if (!isValidId(req.params.id)) return res.status(400).json({ message: 'Invalid staff ID' });
    const { departments, permissions, limits, maxApprovalAmount } = req.body;

    const staffUser = await User.findOne({ _id: req.params.id, role: 'staff' });
    if (!staffUser) return res.status(404).json({ message: 'Staff member not found' });

    if (!staffUser.staffProfile) staffUser.staffProfile = {};
    if (Array.isArray(departments)) staffUser.staffProfile.departments = departments;
    if (Array.isArray(permissions)) staffUser.staffProfile.permissions = permissions;
    
    const resolvedLimit = limits?.maxApprovalAmount !== undefined
      ? limits.maxApprovalAmount
      : (maxApprovalAmount !== undefined ? maxApprovalAmount : undefined);

    if (resolvedLimit !== undefined) {
      if (!staffUser.staffProfile.limits) staffUser.staffProfile.limits = {};
      staffUser.staffProfile.limits.maxApprovalAmount = Number(resolvedLimit) || 0;
    }

    memoryCache.del(`user_me_${staffUser._id}`);
    staffUser.markModified('staffProfile');
    await staffUser.save();

    notifyPermissionsChanged(staffUser._id);

    await AuditLog.create({
      actorId: req.user._id,
      actorName: req.user.name,
      actorRole: req.user.role,
      department: 'staff',
      action: 'staff.update_permissions',
      entityType: 'staff',
      entityId: staffUser._id.toString(),
      userId: staffUser._id,
      note: `Updated permissions: ${staffUser.staffProfile.permissions.length} perms, [${staffUser.staffProfile.departments.join(', ')}]`,
      ip: req.ip || '',
      userAgent: req.headers['user-agent'] || ''
    });

    res.json({
      success: true,
      message: 'Staff permissions updated successfully',
      staff: staffUser
    });
  } catch (err) {
    res.status(500).json({ message: 'Failed to update permissions: ' + err.message });
  }
});

// Staff Management: Toggle active / suspended (Admin only)
router.post('/staff/:id/toggle-active', protect, admin, async (req, res) => {
  try {
    if (!isValidId(req.params.id)) return res.status(400).json({ message: 'Invalid staff ID' });

    const staffUser = await User.findOne({ _id: req.params.id, role: 'staff' });
    if (!staffUser) return res.status(404).json({ message: 'Staff member not found' });

    if (!staffUser.staffProfile) staffUser.staffProfile = { isActive: true };
    const currentActive = staffUser.staffProfile.isActive !== false;
    const nextActive = !currentActive;
    staffUser.staffProfile.isActive = nextActive;

    if (!nextActive) {
      staffUser.tokenVersion = (staffUser.tokenVersion || 0) + 1;
    }

    memoryCache.del(`user_me_${staffUser._id}`);
    staffUser.markModified('staffProfile');
    await staffUser.save();

    notifyPermissionsChanged(staffUser._id);

    await AuditLog.create({
      actorId: req.user._id,
      actorName: req.user.name,
      actorRole: req.user.role,
      department: 'staff',
      action: nextActive ? 'staff.activate' : 'staff.deactivate',
      entityType: 'staff',
      entityId: staffUser._id.toString(),
      userId: staffUser._id,
      note: nextActive ? 'Staff account activated' : 'Staff account deactivated & sessions revoked',
      ip: req.ip || '',
      userAgent: req.headers['user-agent'] || ''
    });

    res.json({
      success: true,
      message: nextActive ? 'Staff account activated' : 'Staff account deactivated',
      isActive: nextActive
    });
  } catch (err) {
    res.status(500).json({ message: 'Failed to toggle staff status: ' + err.message });
  }
});

// Staff Management: Force logout / invalidate all tokens (Admin only)
router.post('/staff/:id/force-logout', protect, admin, async (req, res) => {
  try {
    if (!isValidId(req.params.id)) return res.status(400).json({ message: 'Invalid staff ID' });

    const staffUser = await User.findOne({ _id: req.params.id, role: 'staff' });
    if (!staffUser) return res.status(404).json({ message: 'Staff member not found' });

    staffUser.tokenVersion = (staffUser.tokenVersion || 0) + 1;
    memoryCache.del(`user_me_${staffUser._id}`);
    await staffUser.save();

    notifyPermissionsChanged(staffUser._id);

    await AuditLog.create({
      actorId: req.user._id,
      actorName: req.user.name,
      actorRole: req.user.role,
      department: 'staff',
      action: 'staff.force_logout',
      entityType: 'staff',
      entityId: staffUser._id.toString(),
      userId: staffUser._id,
      note: 'Admin initiated force logout / session invalidation',
      ip: req.ip || '',
      userAgent: req.headers['user-agent'] || ''
    });

    res.json({
      success: true,
      message: 'All active sessions for this staff member have been terminated.'
    });
  } catch (err) {
    res.status(500).json({ message: 'Failed to invalidate staff sessions: ' + err.message });
  }
});

// Activity Log: Paginated Audit Log & CSV Export (Admin only)
router.get('/activity-log', protect, admin, async (req, res) => {
  try {
    const { page = 1, limit = 50, actorId, department, action, startDate, endDate, format } = req.query;

    const query = {};
    if (actorId && isValidId(actorId)) query.actorId = actorId;
    if (department && department !== 'all') query.department = department;
    if (action) query.action = new RegExp(action, 'i');
    if (startDate || endDate) {
      query.createdAt = {};
      if (startDate) query.createdAt.$gte = new Date(startDate);
      if (endDate) query.createdAt.$lte = new Date(endDate);
    }

    if (format === 'csv') {
      const logs = await AuditLog.find(query).sort({ createdAt: -1 }).limit(1000).lean();
      let csv = 'Timestamp,Actor Name,Role,Department,Action,Entity Type,Entity ID,Target User ID,Amount,From Status,To Status,Note\n';
      logs.forEach(l => {
        const safe = str => `"${String(str || '').replace(/"/g, '""')}"`;
        csv += [
          l.createdAt ? new Date(l.createdAt).toISOString() : '',
          safe(l.actorName),
          safe(l.actorRole),
          safe(l.department),
          safe(l.action),
          safe(l.entityType),
          safe(l.entityId),
          safe(l.userId),
          l.amount !== null && l.amount !== undefined ? l.amount : '',
          safe(l.fromStatus),
          safe(l.toStatus),
          safe(l.note)
        ].join(',') + '\n';
      });

      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', 'attachment; filename="activity_log.csv"');
      return res.send(csv);
    }

    const pageNum = Math.max(1, parseInt(page, 10));
    const limitNum = Math.min(100, Math.max(1, parseInt(limit, 10)));
    const skip = (pageNum - 1) * limitNum;

    const [total, logs] = await Promise.all([
      AuditLog.countDocuments(query),
      AuditLog.find(query).sort({ createdAt: -1 }).skip(skip).limit(limitNum).lean()
    ]);

    res.json({
      success: true,
      total,
      page: pageNum,
      pages: Math.ceil(total / limitNum),
      logs
    });
  } catch (err) {
    res.status(500).json({ message: 'Failed to fetch activity log: ' + err.message });
  }
});

// Lightweight Paginated Agents List (Rule 5: Pagination 10-20, low bandwidth)
router.get('/agents-paginated', protect, admin, async (req, res) => {
  try {
    const page = Math.max(1, parseInt(req.query.page) || 1);
    const limit = Math.min(50, Math.max(1, parseInt(req.query.limit) || 15));
    const search = (req.query.search || '').trim();

    const query = {
      $or: [
        { role: 'agent' },
        { 'agentProfile.applied': true },
        { 'agentProfile.status': { $in: ['approved', 'pending'] } }
      ]
    };

    if (search) {
      query.$and = [{
        $or: [
          { name: { $regex: search, $options: 'i' } },
          { phone: { $regex: search, $options: 'i' } },
          { referralCode: { $regex: search, $options: 'i' } }
        ]
      }];
    }

    const total = await User.countDocuments(query);
    const agents = await User.find(query)
      .select('name phone email referralCode referralCount referralEarnings role agentProfile.status agentProfile.businessName agentProfile.commissionModel createdAt')
      .sort({ referralEarnings: -1, referralCount: -1, createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .lean();

    res.json({
      success: true,
      agents,
      total,
      page,
      totalPages: Math.ceil(total / limit) || 1
    });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Failed to fetch paginated agents' });
  }
});

module.exports = router;

