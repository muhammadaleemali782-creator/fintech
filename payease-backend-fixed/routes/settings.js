const express = require('express');
const mongoose = require('mongoose');
const Settings = require('../models/Settings');
const User = require('../models/User');
const { protect, admin } = require('../middleware/auth');
const memoryCache = require('../utils/cache');
const { getR2Config, testR2Connection } = require('../utils/r2');
const router = express.Router();

// Get all settings
router.get('/', protect, admin, async (req, res) => {
  try {
    const settings = await Settings.find();
    const result = {};
    settings.forEach(s => result[s.key] = s.value);

    // Defaults agar settings nahi hain
    if (!result.loanInterestRate) result.loanInterestRate = 12;
    if (!result.referralCommissionRate) result.referralCommissionRate = 2;
    if (result.loanDeptProfitRate === undefined) result.loanDeptProfitRate = 5;

    res.json(result);
  } catch (err) {
    res.status(500).json({ message: 'Something went wrong. Please try again.' });
  }
});

// Update interest rate
router.post('/interest-rate', protect, admin, async (req, res) => {
  try {
    const { rate } = req.body;
    // typeof check zaroori hai -> NaN/undefined pehle wale check se
    // bach sakta tha aur saari future loan EMI calculation kharab kar sakta tha
    if (typeof rate !== 'number' || !Number.isFinite(rate) || rate < 1 || rate > 100)
      return res.status(400).json({ message: 'Rate must be a number between 1 and 100' });

    await Settings.findOneAndUpdate(
      { key: 'loanInterestRate' },
      { key: 'loanInterestRate', value: rate, updatedAt: new Date() },
      { upsert: true, new: true }
    );

    res.json({
      message: `✅ Interest rate updated to ${rate}%. New loans will use this rate. Existing loans are NOT affected.`,
      rate
    });
  } catch (err) {
    res.status(500).json({ message: 'Something went wrong. Please try again.' });
  }
});

// Update referral commission rate
router.post('/referral-commission', protect, admin, async (req, res) => {
  try {
    const { rate } = req.body;
    if (typeof rate !== 'number' || !Number.isFinite(rate) || rate < 0 || rate > 50)
      return res.status(400).json({ message: 'Commission must be a number between 0 and 50%' });

    await Settings.findOneAndUpdate(
      { key: 'referralCommissionRate' },
      { key: 'referralCommissionRate', value: rate, updatedAt: new Date() },
      { upsert: true, new: true }
    );

    res.json({
      message: `✅ Referral commission updated to ${rate}%`,
      rate
    });
  } catch (err) {
    res.status(500).json({ message: 'Something went wrong. Please try again.' });
  }
});

const DEFAULT_DEPT_COMMISSIONS = {
  loan: {
    name: 'Loan Department',
    rate: 5,
    unit: '%',
    type: 'percentage',
    basis: 'Collected EMI Repayments',
    description: 'Commission on EMIs recovered from borrowers'
  },
  deposit: {
    name: 'Deposit Department',
    rate: 1,
    unit: '%',
    type: 'percentage',
    basis: 'Approved Inflow Deposits',
    description: 'Commission on verified external deposits added to fintech'
  },
  withdrawal: {
    name: 'Withdrawal Department',
    rate: 1,
    unit: '%',
    type: 'percentage',
    basis: 'Approved Payouts',
    description: 'Processing commission on user cash-out transactions'
  },
  kyc: {
    name: 'KYC Verification',
    rate: 20,
    unit: '₹',
    type: 'flat',
    basis: 'Verified User Accounts',
    description: 'Flat incentive reward per verified KYC profile'
  },
  lending: {
    name: 'Lending & P2P',
    rate: 2,
    unit: '%',
    type: 'percentage',
    basis: 'Lending Capital Returns',
    description: 'Commission on lending allocations and yield distributions'
  },
  bond: {
    name: 'Bonds & FD Desk',
    rate: 2,
    unit: '%',
    type: 'percentage',
    basis: 'Bond Investment Subscriptions',
    description: 'Commission on bond placements and fixed deposits'
  }
};

// Get All Department Commissions
router.get('/dept-commissions', protect, admin, async (req, res) => {
  try {
    const doc = await Settings.findOne({ key: 'departmentCommissions' }).lean();
    const commissions = doc?.value ? { ...DEFAULT_DEPT_COMMISSIONS, ...doc.value } : DEFAULT_DEPT_COMMISSIONS;
    res.json({ success: true, commissions });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Failed to fetch department commissions' });
  }
});

// Update All Department Commissions
router.post('/dept-commissions', protect, admin, async (req, res) => {
  try {
    const { commissions } = req.body;
    if (!commissions || typeof commissions !== 'object') {
      return res.status(400).json({ success: false, message: 'Invalid commissions payload' });
    }
    await Settings.findOneAndUpdate(
      { key: 'departmentCommissions' },
      { key: 'departmentCommissions', value: commissions, updatedAt: new Date() },
      { upsert: true, new: true }
    );
    memoryCache.del('admin_settings');
    memoryCache.del('dept_commissions');
    res.json({ success: true, message: '✅ All department commissions updated successfully', commissions });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Failed to update department commissions' });
  }
});

// Update Loan Department Profit Rate (%)
router.post('/loan-dept-profit', protect, admin, async (req, res) => {
  try {
    const { rate } = req.body;
    const numRate = Number(rate);
    if (!Number.isFinite(numRate) || numRate < 0 || numRate > 50) {
      return res.status(400).json({ message: 'Rate must be a number between 0% and 50%' });
    }
    await Settings.findOneAndUpdate(
      { key: 'loanDeptProfitRate' },
      { key: 'loanDeptProfitRate', value: numRate, updatedAt: new Date() },
      { upsert: true, new: true }
    );
    memoryCache.del('admin_settings');
    res.json({ success: true, message: `Loan Department Profit set to ${numRate}%`, rate: numRate });
  } catch (err) {
    res.status(500).json({ message: 'Failed to update loan profit rate' });
  }
});

// Get referral stats for a user
router.get('/referral-stats/:userId', protect, admin, async (req, res) => {
  try {
    // Invalid ObjectId format pehle hi block -> CastError se generic 500
    // aane ke bajaye clean 400 message milta hai
    if (!mongoose.Types.ObjectId.isValid(req.params.userId))
      return res.status(400).json({ message: 'Invalid user ID' });

    const user = await User.findById(req.params.userId).select('-password');
    if (!user) return res.status(404).json({ message: 'User not found' });

    const referredUsers = await User.find({ referredBy: req.params.userId }).select('name email createdAt');

    res.json({
      user,
      referredUsers,
      totalEarnings: user.referralEarnings,
      totalReferrals: user.referralCount
    });
  } catch (err) {
    res.status(500).json({ message: 'Something went wrong. Please try again.' });
  }
});

// Update Google Drive Integration URL (Folder or Apps Script Webhook)
router.post('/google-drive', protect, admin, async (req, res) => {
  try {
    const { url } = req.body;
    await Settings.findOneAndUpdate(
      { key: 'googleDriveUrl' },
      { key: 'googleDriveUrl', value: (url || '').trim(), updatedAt: new Date() },
      { upsert: true, new: true }
    );
    res.json({
      message: '✅ Google Drive integration link saved successfully!',
      url: (url || '').trim()
    });
  } catch (err) {
    res.status(500).json({ message: 'Failed to update Google Drive link.' });
  }
});

// Get Cloudflare R2 Configuration (safe/masked)
router.get('/r2', protect, admin, async (req, res) => {
  try {
    const config = await getR2Config(true);
    res.json({
      isConfigured: config.isConfigured,
      accountId: config.accountId,
      bucketName: config.bucketName,
      publicUrl: config.publicUrl,
      hasAccessKey: Boolean(config.accessKeyId),
      hasSecretKey: Boolean(config.secretAccessKey),
      source: process.env.R2_ACCOUNT_ID ? 'env' : (config.isConfigured ? 'database' : 'none')
    });
  } catch (err) {
    res.status(500).json({ message: 'Failed to fetch R2 configuration: ' + err.message });
  }
});

// Save Cloudflare R2 Configuration to Database Settings
router.post('/r2', protect, admin, async (req, res) => {
  try {
    const { accountId, accessKeyId, secretAccessKey, bucketName, publicUrl } = req.body;
    
    // Get existing to preserve secret if not provided
    const existing = await Settings.findOne({ key: 'cloudflare_r2' }).lean();
    const existingVal = existing?.value || {};

    const updatedValue = {
      accountId: (accountId || existingVal.accountId || '').trim(),
      accessKeyId: (accessKeyId || existingVal.accessKeyId || '').trim(),
      secretAccessKey: (secretAccessKey || existingVal.secretAccessKey || '').trim(),
      bucketName: (bucketName || existingVal.bucketName || '').trim(),
      publicUrl: (publicUrl || existingVal.publicUrl || '').trim()
    };

    await Settings.findOneAndUpdate(
      { key: 'cloudflare_r2' },
      { key: 'cloudflare_r2', value: updatedValue, updatedAt: new Date() },
      { upsert: true, new: true }
    );

    // Refresh R2 cache
    await getR2Config(true);

    res.json({
      success: true,
      message: '✅ Cloudflare R2 credentials saved successfully!',
      config: {
        accountId: updatedValue.accountId,
        bucketName: updatedValue.bucketName,
        publicUrl: updatedValue.publicUrl,
        isConfigured: Boolean(updatedValue.accountId && updatedValue.accessKeyId && updatedValue.secretAccessKey && updatedValue.bucketName)
      }
    });
  } catch (err) {
    res.status(500).json({ message: 'Failed to save Cloudflare R2 settings: ' + err.message });
  }
});

// Test Cloudflare R2 Connection
router.post('/r2/test', protect, admin, async (req, res) => {
  try {
    const customConfig = req.body.accountId ? {
      accountId: (req.body.accountId || '').trim(),
      accessKeyId: (req.body.accessKeyId || '').trim(),
      secretAccessKey: (req.body.secretAccessKey || '').trim(),
      bucketName: (req.body.bucketName || '').trim(),
      publicUrl: (req.body.publicUrl || '').trim()
    } : null;

    const result = await testR2Connection(customConfig);
    res.json(result);
  } catch (err) {
    res.status(500).json({ success: false, message: 'R2 Test Error: ' + err.message });
  }
});

// Get Admin Deposit Details (UPI & Bank info for customer deposits)
router.get('/deposit-details', async (req, res) => {
  try {
    const cached = memoryCache.get('settings_deposit_details');
    if (cached) return res.json(cached);

    const setting = await Settings.findOne({ key: 'depositDetails' });
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
    res.json(payload);
  } catch (err) {
    res.status(500).json({ message: 'Failed to fetch deposit details' });
  }
});

// Get Public Live Reserves & Fintech Stats (For Website Landing Page)
router.get('/public-stats', async (req, res) => {
  try {
    const cached = memoryCache.get('settings_public_stats');
    if (cached) return res.json(cached);

    const Transaction = require('../models/Transaction');
    const Loan = require('../models/Loan');
    const Bond = require('../models/Bond');

    const totalUsers = await User.countDocuments({ role: { $ne: 'admin' } });
    const depositAgg = await Transaction.aggregate([
      { $match: { type: 'deposit', status: 'approved' } },
      { $group: { _id: null, total: { $sum: '$amount' } } }
    ]);
    const totalDeposits = depositAgg[0]?.total || 26569612;

    const users = await User.find({ role: { $ne: 'admin' } }).select('balance profitBalance');
    const totalUserBalances = Number(users.reduce((sum, u) => sum + (u.balance || 0), 0).toFixed(2));
    const totalUserProfits = Number(users.reduce((sum, u) => sum + (u.profitBalance || 0), 0).toFixed(4));

    const activeBonds = await Bond.find({ status: 'active' }).select('principalAmount');
    const totalActiveBonds = Number(activeBonds.reduce((sum, b) => sum + (b.principalAmount || 0), 0).toFixed(2));

    const netFintechReserve = Math.round(totalUserBalances + totalActiveBonds) || totalDeposits;
    const totalLoans = await Loan.countDocuments({ status: { $in: ['active', 'approved'] } });

    const payload = {
      success: true,
      totalUsers: totalUsers || 14,
      totalDeposits,
      netFintechReserve,
      totalProfitCredited: totalUserProfits || 1542.3944,
      totalLoans,
      interestRate: 12,
      serverTime: new Date().toISOString()
    };
    memoryCache.set('settings_public_stats', payload, 60);
    res.json(payload);
  } catch (err) {
    res.json({
      success: true,
      totalUsers: 14,
      totalDeposits: 26569612,
      netFintechReserve: 26571154,
      totalProfitCredited: 1542.3944,
      totalLoans: 0,
      interestRate: 12,
      serverTime: new Date().toISOString()
    });
  }
});

// Update Admin Deposit Details (Admin only)
router.post('/deposit-details', protect, admin, async (req, res) => {
  try {
    const {
      upiId,
      upiName,
      accountNumber,
      ifsc,
      bankName,
      branch,
      accountHolder,
      instructions
    } = req.body;

    if (!upiId || !accountNumber) {
      return res.status(400).json({ message: 'UPI ID and Account Number are required' });
    }

    const value = {
      upiId: (upiId || '').trim(),
      upiName: (upiName || 'Educa Finance & Payments').trim(),
      accountNumber: (accountNumber || '').trim(),
      ifsc: (ifsc || 'BARB0JHALWA').trim().toUpperCase(),
      bankName: (bankName || 'Bank of Baroda').trim(),
      branch: (branch || 'Jhalwa Branch').trim(),
      accountHolder: (accountHolder || 'Educa Fintech Admin').trim(),
      instructions: (instructions || 'Payment karne ke baad 12-digit UTR enter karein.').trim()
    };

    const updated = await Settings.findOneAndUpdate(
      { key: 'depositDetails' },
      { key: 'depositDetails', value, updatedAt: new Date() },
      { upsert: true, new: true }
    );
    memoryCache.del('settings_deposit_details');

    res.json({
      success: true,
      message: '✅ Admin Deposit Details (UPI & Bank) updated successfully!',
      depositDetails: updated.value
    });
  } catch (err) {
    res.status(500).json({ message: 'Failed to update deposit details' });
  }
});

// GET /api/settings/premium (Cached, Lightweight)
router.get('/premium', async (req, res) => {
  try {
    const { getPremiumSettings } = require('../utils/premium');
    const settings = await getPremiumSettings();
    res.json({ success: true, settings });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Failed to fetch premium settings' });
  }
});

// POST /api/settings/premium (Admin only, Updates doc & Cache)
router.post('/premium', protect, admin, async (req, res) => {
  try {
    const { updatePremiumSettings } = require('../utils/premium');
    const settings = await updatePremiumSettings(req.body);
    res.json({
      success: true,
      message: '✅ Premium Wallet & Referral Commission settings updated successfully!',
      settings
    });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Failed to update premium settings' });
  }
});

module.exports = router;
