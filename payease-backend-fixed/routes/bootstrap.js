const express = require('express');
const { protect, admin, staffOrAdmin } = require('../middleware/auth');
const { hasPermission, getAllowedDepartments } = require('../utils/permissions');
const User = require('../models/User');
const Transaction = require('../models/Transaction');
const Loan = require('../models/Loan');
const Bond = require('../models/Bond');
const Settings = require('../models/Settings');
const Device = require('../models/Device');
const memoryCache = require('../utils/cache');
const { processDailyYield } = require('./user');
const { decryptData } = require('../utils/cryptoHelper');

const router = express.Router();

// Helper to get cached or default deposit details
async function getDepositDetails() {
  const cached = memoryCache.get('settings_deposit_details');
  if (cached) return cached;
  const setting = await Settings.findOne({ key: 'depositDetails' }).lean();
  const defaultDetails = {
    upiId: 'educafinance@upi',
    upiName: 'Educa Finance & Payments',
    accountNumber: '5010045239128',
    ifsc: 'BARB0JHALWA',
    bankName: 'Bank of Baroda',
    branch: 'Jhalwa Branch, Prayagraj',
    accountHolder: 'Educa Fintech Admin',
    instructions: 'UPI App (GPay/PhonePe/Paytm) ya NetBanking se payment karne ke baad 12-digit UTR enter karein.'
  };
  const payload = setting ? setting.value : defaultDetails;
  memoryCache.set('settings_deposit_details', payload, 60);
  return payload;
}

// Helper to get cached or fresh loan department pool
async function getLoanDepartmentPool() {
  const cached = memoryCache.get('loan_dept_pool');
  if (cached) return cached;
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
  const payload = { totalPool, marketDisbursed, availablePool, activeLoansCount, utilizationPercent };
  memoryCache.set('loan_dept_pool', payload, 10);
  return payload;
}

// -------------------------------------------------------------
// 1. COMBINED USER BOOTSTRAP: All Customer Data in 1 Fast Query
// -------------------------------------------------------------
router.get('/user', protect, async (req, res) => {
  try {
    const userId = req.user._id;

    // Auto-deduct due EMIs from primary wallet if balance is available
    try {
      const { autoDeductDueLoanEmis } = require('./loan');
      await autoDeductDueLoanEmis(userId);
    } catch {}

    // Process daily yield in memory before querying
    let user = await User.findById(userId);
    if (!user) user = req.user;
    try {
      user = await processDailyYield(user);
    } catch {}

    const [
      txnsRes,
      loansRes,
      activeLoanRes,
      bondsRes,
      profitHistoryRes,
      depositDetailsRes,
      rateSettingRes,
      poolRes
    ] = await Promise.allSettled([
      Transaction.find({ userId }).sort({ createdAt: -1 }).limit(40).lean(),
      Loan.find({ userId }).sort({ createdAt: -1 }).lean(),
      Loan.findOne({ userId, status: 'active' }).lean(),
      Bond.find({ userId }).sort({ createdAt: -1 }).lean(),
      Transaction.find({
        userId,
        type: { $in: ['daily_yield', 'bond_payout', 'referral_bonus', 'profit_transfer', 'interest'] }
      }).sort({ createdAt: -1 }).limit(50).lean(),
      getDepositDetails(),
      Settings.findOne({ key: 'loanInterestRate' }).lean(),
      getLoanDepartmentPool()
    ]);

    const userObj = user.toObject ? user.toObject() : { ...user };
    userObj.hasWalletPin = !!user.walletPin;
    userObj.serverTime = new Date().toISOString();
    delete userObj.password;
    delete userObj.walletPin;

    const payload = {
      profile: userObj,
      transactions: txnsRes.status === 'fulfilled' ? txnsRes.value : [],
      loans: loansRes.status === 'fulfilled' ? loansRes.value : [],
      activeLoan: activeLoanRes.status === 'fulfilled' ? activeLoanRes.value : null,
      bonds: bondsRes.status === 'fulfilled' ? bondsRes.value : [],
      profitHistory: profitHistoryRes.status === 'fulfilled' ? profitHistoryRes.value : [],
      depositDetails: depositDetailsRes.status === 'fulfilled' ? depositDetailsRes.value : null,
      currentRate: rateSettingRes.status === 'fulfilled' && rateSettingRes.value ? rateSettingRes.value.value : 12,
      loanDepartmentPool: poolRes.status === 'fulfilled' ? poolRes.value : { totalPool: 1000000, marketDisbursed: 0, availablePool: 1000000, activeLoansCount: 0, utilizationPercent: 0 },
      timestamp: Date.now()
    };

    res.json({ success: true, ...payload });
  } catch (err) {
    console.error('Bootstrap user error:', err);
    res.status(500).json({ success: false, message: 'User bootstrap failed' });
  }
});

// -------------------------------------------------------------
// 2. COMBINED AGENT BOOTSTRAP: All Agent Portal Data in 1 Query
// -------------------------------------------------------------
router.get('/agent', protect, async (req, res) => {
  try {
    const agent = req.user;
    const isAgent = agent.role === 'agent' || agent.agentProfile?.status === 'approved';
    if (!isAgent) {
      return res.status(403).json({ success: false, message: 'Agent access required' });
    }

    const [
      customersRes,
      commissionsRes,
      depositDetailsRes,
      rateSettingRes,
      poolRes
    ] = await Promise.allSettled([
      User.find({ referredBy: agent._id })
        .select('name email phone balance duesBalance loansCount createdAt kycStatus loanLimit customQrUrl')
        .sort({ createdAt: -1 })
        .limit(60)
        .lean(),
      Transaction.find({ userId: agent._id, type: 'referral_bonus' })
        .sort({ createdAt: -1 })
        .limit(40)
        .lean(),
      getDepositDetails(),
      Settings.findOne({ key: 'referralCommissionRate' }).lean(),
      getLoanDepartmentPool()
    ]);

    const customers = customersRes.status === 'fulfilled' ? customersRes.value : [];
    const customerIds = customers.map(c => c._id);

    const [depositAgg, loanAgg] = await Promise.allSettled([
      Transaction.aggregate([
        { $match: { userId: { $in: customerIds }, type: 'deposit', status: { $in: ['approved', 'completed'] } } },
        { $group: { _id: null, total: { $sum: '$amount' } } }
      ]),
      Loan.aggregate([
        { $match: { userId: { $in: customerIds }, status: 'active' } },
        { $group: { _id: null, total: { $sum: '$amount' } } }
      ])
    ]);

    const totalVolume = (depositAgg.status === 'fulfilled' ? depositAgg.value[0]?.total : 0) || 0;
    const activeDisbursed = (loanAgg.status === 'fulfilled' ? loanAgg.value[0]?.total : 0) || 0;

    const userObj = agent.toObject ? agent.toObject() : { ...agent };
    delete userObj.password;
    delete userObj.walletPin;

    const payload = {
      profile: userObj,
      agentStats: {
        customersCount: customers.length,
        totalCustomers: customers.length,
        commissionBalance: agent.agentProfile?.commissionBalance || 0,
        commissionRate: agent.agentProfile?.commissionRate || 2,
        commissionModel: agent.agentProfile?.commissionModel || 'percentage',
        totalVolume,
        activeDisbursed,
        customers
      },
      commissions: commissionsRes.status === 'fulfilled' ? commissionsRes.value : [],
      depositDetails: depositDetailsRes.status === 'fulfilled' ? depositDetailsRes.value : null,
      referralRate: rateSettingRes.status === 'fulfilled' && rateSettingRes.value ? rateSettingRes.value.value : 2,
      loanDepartmentPool: poolRes.status === 'fulfilled' ? poolRes.value : { totalPool: 1000000, marketDisbursed: 0, availablePool: 1000000, activeLoansCount: 0, utilizationPercent: 0 },
      timestamp: Date.now()
    };

    res.json({ success: true, ...payload });
  } catch (err) {
    console.error('Bootstrap agent error:', err);
    res.status(500).json({ success: false, message: 'Agent bootstrap failed' });
  }
});

// -------------------------------------------------------------
// 3. COMBINED ADMIN BOOTSTRAP: Full Operations in 1 Query (Role & Dept segregated)
// -------------------------------------------------------------
router.get('/admin', protect, staffOrAdmin, async (req, res) => {
  try {
    const cacheKey = `bootstrap_admin_${req.user.role}_${req.user._id}`;
    if (!req.query.force) {
      const cached = memoryCache.get(cacheKey);
      if (cached) return res.json(cached);
    }

    const [
      usersRes,
      pendingTxnsRes,
      holdTxnsRes,
      loansRes,
      bondsRes,
      agentsRes,
      devicesRes,
      settingsRes,
      depositDetailsRes,
      poolRes
    ] = await Promise.allSettled([
      User.find({ role: { $ne: 'admin' } })
        .select('-password -walletPin -kycDocuments.doc1Url -kycDocuments.doc1BackUrl -kycDocuments.doc2Url -kycDocuments.doc2BackUrl -kycDocuments.chequeUrl -kycDocuments.chequeBackUrl -kycDocuments.docUrl')
        .sort({ createdAt: -1 })
        .limit(100)
        .lean(),
      Transaction.find({ status: 'pending' })
        .populate('userId', 'name email phone accountNumber upiId')
        .sort({ createdAt: -1 })
        .limit(50)
        .lean(),
      Transaction.find({ status: 'hold' })
        .populate('userId', 'name email phone accountNumber upiId')
        .sort({ createdAt: -1 })
        .limit(30)
        .lean(),
      Loan.find()
        .select('-installmentSchedule -emiSchedule -history')
        .populate('userId', 'name email phone accountNumber kycStatus')
        .sort({ createdAt: -1 })
        .limit(60)
        .lean(),
      Bond.find()
        .populate('userId', 'name email phone')
        .sort({ createdAt: -1 })
        .limit(40)
        .lean(),
      User.find({ 'agentProfile.status': { $in: ['pending', 'approved'] } })
        .select('name email phone role agentProfile createdAt')
        .sort({ createdAt: -1 })
        .limit(40)
        .lean(),
      Device.find()
        .sort({ lastActive: -1 })
        .limit(40)
        .lean(),
      Settings.find().lean(),
      getDepositDetails(),
      getLoanDepartmentPool()
    ]);

    // Fast Analytics aggregation
    const users = usersRes.status === 'fulfilled' ? usersRes.value : [];
    const totalUsers = users.length;
    const totalUserBalances = Number(users.reduce((s, u) => s + (u.balance || 0), 0).toFixed(2));
    const totalUserProfits = Number(users.reduce((s, u) => s + (u.profitBalance || 0), 0).toFixed(4));

    const bonds = bondsRes.status === 'fulfilled' ? bondsRes.value : [];
    const totalActiveBonds = Number(bonds.filter(b => b.status === 'active').reduce((s, b) => s + (b.principalAmount || 0), 0).toFixed(2));
    const netFintechReserve = Math.round(totalUserBalances + totalActiveBonds);

    const pendingTxns = pendingTxnsRes.status === 'fulfilled' ? pendingTxnsRes.value : [];
    const loans = loansRes.status === 'fulfilled' ? loansRes.value : [];
    const activeLoansCount = loans.filter(l => l.status === 'active').length;

    const settingsMap = {};
    if (settingsRes.status === 'fulfilled' && Array.isArray(settingsRes.value)) {
      settingsRes.value.forEach(s => settingsMap[s.key] = s.value);
    }

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

    const cleanLoans = loans.map(l => {
      if (l.userId && l.userId.kycDocuments) {
        const {
          doc1Url, doc1BackUrl, doc2Url, doc2BackUrl, chequeUrl, chequeBackUrl, docUrl,
          ...restKyc
        } = l.userId.kycDocuments;
        return {
          ...l,
          userId: {
            ...l.userId,
            kycDocuments: {
              ...restKyc,
              hasDoc1: !!(doc1Url || docUrl),
              hasDoc1Back: !!doc1BackUrl,
              hasDoc2: !!doc2Url,
              hasDoc2Back: !!doc2BackUrl,
              hasCheque: !!chequeUrl,
              hasChequeBack: !!chequeBackUrl
            }
          }
        };
      }
      return l;
    });

    // If caller is Staff, securely segregate datasets to only permitted departments
    if (req.user.role === 'staff') {
      const allowedDepts = getAllowedDepartments(req.user);
      const filteredPending = pendingTxns.filter(t => {
        if (t.type === 'deposit') return allowedDepts.includes('deposit');
        if (t.type === 'withdrawal') return allowedDepts.includes('withdrawal');
        if (t.sourceWallet === 'lending' || (t.type && t.type.includes('lending'))) return allowedDepts.includes('lending');
        return false;
      });
      const rawHold = holdTxnsRes.status === 'fulfilled' ? holdTxnsRes.value : [];
      const filteredHold = rawHold.filter(t => {
        if (t.type === 'deposit') return allowedDepts.includes('deposit');
        if (t.type === 'withdrawal') return allowedDepts.includes('withdrawal');
        if (t.sourceWallet === 'lending' || (t.type && t.type.includes('lending'))) return allowedDepts.includes('lending');
        return false;
      });
      const filteredLoans = allowedDepts.includes('loan') ? cleanLoans : [];
      const filteredBonds = bonds.filter(b => {
        if (['lending_40', 'lending_80'].includes(b.bondType)) return allowedDepts.includes('lending');
        return allowedDepts.includes('bond');
      });
      const filteredUsers = allowedDepts.includes('kyc') ? cleanUsers.filter(u => u.kycStatus === 'pending') : [];

      const staffPayload = {
        success: true,
        allowedDepartments: allowedDepts,
        analytics: {
          pendingTxns: filteredPending.length,
          activeLoans: filteredLoans.filter(l => l.status === 'pending').length,
          pendingKyc: filteredUsers.length
        },
        users: filteredUsers,
        pendingTxns: filteredPending,
        holdTxns: filteredHold,
        loans: filteredLoans,
        bonds: filteredBonds,
        agentApplications: [],
        devices: [],
        settings: { depositDetails: settingsMap.depositDetails },
        depositDetails: depositDetailsRes.status === 'fulfilled' ? depositDetailsRes.value : null,
        loanDepartmentPool: poolRes.status === 'fulfilled' ? poolRes.value : { totalPool: 1000000, marketDisbursed: 0, availablePool: 1000000, activeLoansCount: 0, utilizationPercent: 0 },
        timestamp: Date.now()
      };
      memoryCache.set(cacheKey, staffPayload, 8);
      return res.json(staffPayload);
    }

    const payload = {
      analytics: {
        totalUsers,
        totalDeposits: netFintechReserve,
        fintechReserves: netFintechReserve,
        totalProfitCredited: totalUserProfits,
        pendingTxns: pendingTxns.length,
        activeLoans: activeLoansCount,
        recentUsers: cleanUsers.slice(0, 10)
      },
      users: cleanUsers,
      pendingTxns,
      holdTxns: holdTxnsRes.status === 'fulfilled' ? holdTxnsRes.value : [],
      loans: cleanLoans,
      bonds,
      agentApplications: agentsRes.status === 'fulfilled' ? agentsRes.value : [],
      devices: devicesRes.status === 'fulfilled' ? devicesRes.value : [],
      settings: settingsMap,
      depositDetails: depositDetailsRes.status === 'fulfilled' ? depositDetailsRes.value : null,
      loanDepartmentPool: poolRes.status === 'fulfilled' ? poolRes.value : { totalPool: 1000000, marketDisbursed: 0, availablePool: 1000000, activeLoansCount: 0, utilizationPercent: 0 },
      timestamp: Date.now()
    };

    const finalPayload = { success: true, ...payload };
    memoryCache.set(cacheKey, finalPayload, 8);
    res.json(finalPayload);
  } catch (err) {
    console.error('Bootstrap admin error:', err);
    res.status(500).json({ success: false, message: 'Admin bootstrap failed' });
  }
});

module.exports = router;
