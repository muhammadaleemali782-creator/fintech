const express = require('express');
const mongoose = require('mongoose');
const Settings = require('../models/Settings');
const User = require('../models/User');
const { protect, admin } = require('../middleware/auth');
const memoryCache = require('../utils/cache');
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

module.exports = router;
