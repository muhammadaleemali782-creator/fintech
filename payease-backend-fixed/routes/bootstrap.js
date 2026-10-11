const express = require('express');
const { protect, admin } = require('../middleware/auth');
const User = require('../models/User');
const Transaction = require('../models/Transaction');
const Loan = require('../models/Loan');
const Bond = require('../models/Bond');
const Settings = require('../models/Settings');
const Device = require('../models/Device');
const memoryCache = require('../utils/cache');
const { processDailyYield } = require('./user');

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

// -------------------------------------------------------------
// 1. COMBINED USER BOOTSTRAP: All Customer Data in 1 Fast Query
// -------------------------------------------------------------
router.get('/user', protect, async (req, res) => {
  try {
    const userId = req.user._id;

    // Process daily yield in memory before querying
    let user = req.user;
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
      rateSettingRes
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
      Settings.findOne({ key: 'loanInterestRate' }).lean()
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
      rateSettingRes
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
      Settings.findOne({ key: 'referralCommissionRate' }).lean()
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
      timestamp: Date.now()
    };

    res.json({ success: true, ...payload });
  } catch (err) {
    console.error('Bootstrap agent error:', err);
    res.status(500).json({ success: false, message: 'Agent bootstrap failed' });
  }
});

// -------------------------------------------------------------
// 3. COMBINED ADMIN BOOTSTRAP: Full Admin Operations in 1 Query
// -------------------------------------------------------------
router.get('/admin', protect, admin, async (req, res) => {
  try {
    const [
      usersRes,
      pendingTxnsRes,
      holdTxnsRes,
      loansRes,
      bondsRes,
      agentsRes,
      devicesRes,
      settingsRes,
      depositDetailsRes
    ] = await Promise.allSettled([
      User.find({ role: { $ne: 'admin' } })
        .select('name email phone balance profitBalance lowestBalance24h role kycStatus isBlocked cardTier uninstallProtection loanLimit referredBy createdAt')
        .sort({ createdAt: -1 })
        .limit(60)
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
        .populate('userId', 'name email phone')
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
      getDepositDetails()
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

    const payload = {
      analytics: {
        totalUsers,
        totalDeposits: netFintechReserve,
        fintechReserves: netFintechReserve,
        totalProfitCredited: totalUserProfits,
        pendingTxns: pendingTxns.length,
        activeLoans: activeLoansCount,
        recentUsers: users.slice(0, 10)
      },
      users,
      pendingTxns,
      holdTxns: holdTxnsRes.status === 'fulfilled' ? holdTxnsRes.value : [],
      loans,
      bonds,
      agentApplications: agentsRes.status === 'fulfilled' ? agentsRes.value : [],
      devices: devicesRes.status === 'fulfilled' ? devicesRes.value : [],
      settings: settingsMap,
      depositDetails: depositDetailsRes.status === 'fulfilled' ? depositDetailsRes.value : null,
      timestamp: Date.now()
    };

    res.json({ success: true, ...payload });
  } catch (err) {
    console.error('Bootstrap admin error:', err);
    res.status(500).json({ success: false, message: 'Admin bootstrap failed' });
  }
});

module.exports = router;
