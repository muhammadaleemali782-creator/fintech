const express = require('express');
const bcrypt = require('bcryptjs');
const User = require('../models/User');
const Transaction = require('../models/Transaction');
const Settings = require('../models/Settings');
const { protect } = require('../middleware/auth');
const { sendNotification } = require('../utils/notifier');
const router = express.Router();

// Helper to evaluate and credit daily 1% monthly yield on lowest 24h primary balance
async function processDailyYield(user) {
  if (!user) return user;
  const now = new Date();

  if (!user.lastYieldCalculatedAt) {
    user.lastYieldCalculatedAt = now;
    user.lowestBalance24h = user.balance || 0;
    await user.save();
    return user;
  }

  // Ensure lowestBalance24h is tracked accurately
  if (user.lowestBalance24h === undefined || user.lowestBalance24h === null) {
    user.lowestBalance24h = user.balance || 0;
  } else if (user.balance < user.lowestBalance24h) {
    user.lowestBalance24h = user.balance;
  }

  const msDiff = now.getTime() - new Date(user.lastYieldCalculatedAt).getTime();
  const msInDay = 24 * 60 * 60 * 1000;
  const days = Math.floor(msDiff / msInDay);

  if (days >= 1) {
    const cappedDays = Math.min(days, 30);
    const minBal = Math.max(0, user.lowestBalance24h || 0);
    // 1% ROI per month = 1% / 30 per day
    const dailyRate = 0.01 / 30;
    const dailyAmount = minBal * dailyRate;
    const totalYield = Number((dailyAmount * cappedDays).toFixed(2));

    if (totalYield > 0) {
      user.profitBalance = Number(((user.profitBalance || 0) + totalYield).toFixed(2));
      await Transaction.create({
        userId: user._id,
        type: 'daily_yield',
        amount: totalYield,
        method: 'internal',
        status: 'completed',
        remarks: `Daily Savings Yield (1% monthly ROI on ₹${minBal.toLocaleString('en-IN')} lowest 24h balance for ${cappedDays} day${cappedDays > 1 ? 's' : ''})`
      });
    }

    user.lastYieldCalculatedAt = new Date(new Date(user.lastYieldCalculatedAt).getTime() + cappedDays * msInDay);
    user.lowestBalance24h = user.balance || 0;
    await user.save();
  }

  return user;
}

router.get('/me', protect, async (req, res) => {
  try {
    let user = await User.findById(req.user._id).select('-password');
    if (!user) return res.status(404).json({ message: 'User not found' });
    user = await processDailyYield(user);
    const userObj = user.toObject();
    userObj.hasWalletPin = !!user.walletPin;
    delete userObj.walletPin;
    res.json(userObj);
  } catch (err) {
    res.status(500).json({ message: 'Something went wrong. Please try again.' });
  }
});

// Set 6-Digit Wallet PIN (First Time)
router.post('/pin/set', protect, async (req, res) => {
  try {
    const { pin } = req.body;
    if (!pin || !/^\d{6}$/.test(String(pin))) {
      return res.status(400).json({ message: '6-digit numeric PIN required' });
    }

    const user = await User.findById(req.user._id);
    if (!user) return res.status(404).json({ message: 'User not found' });

    if (user.walletPin) {
      return res.status(400).json({ message: 'PIN already set. Use reset option to change.' });
    }

    user.walletPin = await bcrypt.hash(String(pin), 10);
    await user.save();

    res.json({ message: '6-Digit Wallet PIN set successfully!', hasWalletPin: true });
  } catch (err) {
    res.status(500).json({ message: 'Failed to set PIN' });
  }
});

// Verify 6-Digit Wallet PIN (to reveal balance)
router.post('/pin/verify', protect, async (req, res) => {
  try {
    const { pin } = req.body;
    if (!pin || !/^\d{6}$/.test(String(pin))) {
      return res.status(400).json({ message: '6-digit numeric PIN required' });
    }

    const user = await User.findById(req.user._id);
    if (!user) return res.status(404).json({ message: 'User not found' });

    if (!user.walletPin) {
      return res.status(400).json({ message: 'Please set your 6-digit PIN first', needsSetup: true });
    }

    const isMatch = await bcrypt.compare(String(pin), user.walletPin);
    if (!isMatch) {
      return res.status(400).json({ message: 'Incorrect 6-digit PIN' });
    }

    res.json({ success: true, balance: user.balance });
  } catch (err) {
    res.status(500).json({ message: 'Verification failed' });
  }
});

// Reset / Change 6-Digit Wallet PIN (Requires Phone + Aadhar Card number)
router.post('/pin/reset', protect, async (req, res) => {
  try {
    const { phone, aadharNumber, newPin } = req.body;
    if (!phone || !aadharNumber || !newPin) {
      return res.status(400).json({ message: 'Phone, Aadhar number, and new 6-digit PIN are required' });
    }

    if (!/^\d{6}$/.test(String(newPin))) {
      return res.status(400).json({ message: 'New PIN must be 6 digits' });
    }

    const cleanAadhar = String(aadharNumber).replace(/\s+/g, '');
    if (!/^\d{12}$/.test(cleanAadhar)) {
      return res.status(400).json({ message: 'Valid 12-digit Aadhar number required' });
    }

    const user = await User.findById(req.user._id);
    if (!user) return res.status(404).json({ message: 'User not found' });

    // Validate phone matches
    const cleanUserPhone = (user.phone || '').replace(/\D/g, '');
    const cleanReqPhone = String(phone).replace(/\D/g, '');
    if (!cleanUserPhone.endsWith(cleanReqPhone) && !cleanReqPhone.endsWith(cleanUserPhone)) {
      return res.status(400).json({ message: 'Phone number does not match registered account' });
    }

    // Validate Aadhar if previously stored, or save new
    if (user.aadharNumber && user.aadharNumber !== cleanAadhar) {
      return res.status(400).json({ message: 'Aadhar number does not match records' });
    }

    user.aadharNumber = cleanAadhar;
    user.walletPin = await bcrypt.hash(String(newPin), 10);
    await user.save();

    res.json({ message: 'Wallet PIN successfully updated!', hasWalletPin: true });
  } catch (err) {
    res.status(500).json({ message: 'Failed to reset PIN' });
  }
});

router.put('/update', protect, async (req, res) => {
  try {
    const { upiId, bankAccount } = req.body;

    // upiId sirf string ho, bankAccount sirf expected fields ho
    // (isse galat/malicious data se save() fail ho ke crash hone se bacha)
    if (upiId && typeof upiId !== 'string') {
      return res.status(400).json({ message: 'Invalid UPI ID' });
    }
    if (bankAccount && typeof bankAccount !== 'object') {
      return res.status(400).json({ message: 'Invalid bank account details' });
    }

    const user = await User.findById(req.user._id);
    if (!user) return res.status(404).json({ message: 'User not found' });

    if (upiId) user.upiId = upiId;
    if (bankAccount) {
      user.bankAccount = {
        accountNumber: String(bankAccount.accountNumber || ''),
        ifsc: String(bankAccount.ifsc || ''),
        holderName: String(bankAccount.holderName || '')
      };
    }
    await user.save();

    // password hash kabhi bhi client ko response me nahi jaana chahiye
    const safeUser = user.toObject();
    delete safeUser.password;
    res.json(safeUser);
  } catch (err) {
    res.status(500).json({ message: 'Something went wrong. Please try again.' });
  }
});

// Wallet Activation (Savings, Debit, Lending)
router.post('/wallet/activate', protect, async (req, res) => {
  try {
    const { walletType } = req.body;
    const allowed = ['savings', 'debit', 'lending'];
    if (!allowed.includes(walletType)) {
      return res.status(400).json({ message: 'Invalid wallet type. Must be savings, debit, or lending.' });
    }

    const user = await User.findById(req.user._id);
    if (!user) return res.status(404).json({ message: 'User not found' });

    if (!user.wallets) {
      user.wallets = {
        savings: { active: true, balance: user.balance || 0 },
        debit: { active: false, balance: 0 },
        lending: { active: false, balance: 0 }
      };
    }

    user.wallets[walletType].active = true;
    user.markModified('wallets');
    await user.save();

    res.json({
      message: `${walletType.toUpperCase()} Wallet successfully activated!`,
      wallets: user.wallets
    });
  } catch (err) {
    res.status(500).json({ message: 'Failed to activate wallet' });
  }
});

// Claim / Unlock Platinum VIP Card (if 4+ loans taken or admin pre-approved)
router.post('/card/claim-platinum', protect, async (req, res) => {
  try {
    const user = await User.findById(req.user._id);
    if (!user) return res.status(404).json({ message: 'User not found' });

    const loansTaken = user.loansCount || 0;
    const isPreUnlocked = user.cardStatus?.platinum?.unlocked;

    if (loansTaken < 4 && !isPreUnlocked) {
      return res.status(400).json({
        message: `Platinum Card unlock karne ke liye kam se kam 4 loans zaroori hain (Aapne ${loansTaken}/4 loans liye hain) ya Admin approval chahiye.`
      });
    }

    if (!user.cardStatus) {
      user.cardStatus = {
        silver: { unlocked: true, cardNumber: `4532 ${Math.floor(1000 + Math.random() * 9000)} ${Math.floor(1000 + Math.random() * 9000)} 1200` },
        platinum: { unlocked: true, cardNumber: `5421 ${Math.floor(1000 + Math.random() * 9000)} ${Math.floor(1000 + Math.random() * 9000)} 8840` }
      };
    }

    user.cardStatus.platinum.unlocked = true;
    user.cardStatus.platinum.unlockReason = user.cardStatus.platinum.unlockReason || 'Unlocked via 4+ Loans Milestone';
    user.cardTier = 'platinum';
    user.markModified('cardStatus');
    await user.save();

    res.json({
      message: '🎉 Congratulations! Your Platinum VIP Card is now unlocked!',
      cardTier: user.cardTier,
      cardStatus: user.cardStatus
    });
  } catch (err) {
    res.status(500).json({ message: 'Failed to unlock card' });
  }
});

// Profit Wallet History: Daily Savings Yield, Bond Payouts, Referral Bonuses
router.get('/profit-history', protect, async (req, res) => {
  try {
    let user = await User.findById(req.user._id);
    if (!user) return res.status(404).json({ message: 'User not found' });

    // Process any pending yield before fetching history
    user = await processDailyYield(user);

    const history = await Transaction.find({
      userId: req.user._id,
      type: { $in: ['daily_yield', 'bond_payout', 'referral_bonus'] }
    }).sort({ createdAt: -1 }).limit(100);

    res.json({
      success: true,
      profitBalance: user.profitBalance || 0,
      lowestBalance24h: user.lowestBalance24h || 0,
      history
    });
  } catch (err) {
    res.status(500).json({ message: 'Failed to fetch profit history' });
  }
});

// Trigger yield calculation explicitly
router.post('/yield/calculate', protect, async (req, res) => {
  try {
    let user = await User.findById(req.user._id);
    if (!user) return res.status(404).json({ message: 'User not found' });
    user = await processDailyYield(user);
    res.json({
      success: true,
      profitBalance: user.profitBalance || 0,
      lowestBalance24h: user.lowestBalance24h || 0,
      lastYieldCalculatedAt: user.lastYieldCalculatedAt
    });
  } catch (err) {
    res.status(500).json({ message: 'Failed to calculate yield' });
  }
});

// Submit KYC Verification (Aadhaar, PAN, Address & Document Upload)
router.post('/kyc/submit', protect, async (req, res) => {
  try {
    const { aadharNumber, panNumber, address, docUrl } = req.body;
    if (!aadharNumber && !docUrl) {
      return res.status(400).json({ message: 'Aadhaar number aur Identity document upload zaroori hai.' });
    }

    const cleanAadhaar = aadharNumber ? aadharNumber.replace(/\D/g, '').trim() : '';
    if (cleanAadhaar && cleanAadhaar.length !== 12) {
      return res.status(400).json({ message: 'Aadhaar number must be a valid 12-digit number.' });
    }

    const cleanPan = panNumber ? panNumber.toUpperCase().trim() : '';
    if (cleanPan && !/^[A-Z]{5}[0-9]{4}[A-Z]{1}$/.test(cleanPan)) {
      return res.status(400).json({ message: 'Valid PAN format required (e.g. ABCDE1234F).' });
    }

    // Validate uploaded file (data URL only, max 7MB base64)
    if (docUrl) {
      if (!docUrl.startsWith('data:image/') && !docUrl.startsWith('data:application/pdf')) {
        return res.status(400).json({ message: 'Invalid file format. Please upload JPG, PNG or PDF.' });
      }
      if (docUrl.length > 7 * 1024 * 1024) {
        return res.status(400).json({ message: 'Document size too large. Maximum 5MB allowed.' });
      }
    }

    const user = await User.findById(req.user._id);
    if (!user) return res.status(404).json({ message: 'User not found' });

    user.kycStatus = 'pending';
    if (cleanAadhaar) user.aadharNumber = cleanAadhaar;
    if (address) user.address = address.trim();

    user.kycDocuments = {
      aadharNumber: cleanAadhaar || user.aadharNumber || '',
      panNumber: cleanPan || '',
      address: address ? address.trim() : (user.address || ''),
      googleDriveLink: '',
      docUrl: docUrl || '',
      adminRemarks: '',
      submittedAt: new Date()
    };
    user.markModified('kycDocuments');
    await user.save();

    // Background Drive Webhook sync — 100% server-side (Zero exposure to client/Burp Suite)
    const adminDriveSetting = await Settings.findOne({ key: 'googleDriveUrl' });
    const adminDriveUrl = adminDriveSetting?.value;

    if (adminDriveUrl && adminDriveUrl.startsWith('https://script.google.com/')) {
      fetch(adminDriveUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'upload_kyc',
          userId: user._id.toString(),
          name: user.name,
          email: user.email,
          phone: user.phone,
          address: user.address || '',
          aadharNumber: user.aadharNumber,
          panNumber: user.kycDocuments.panNumber,
          docUrl: docUrl || '',
          submittedAt: user.kycDocuments.submittedAt
        })
      })
      .then(res => res.json())
      .then(async (driveData) => {
        if (driveData && (driveData.fileUrl || driveData.folderUrl)) {
          const directLink = driveData.fileUrl || driveData.folderUrl;
          await User.findByIdAndUpdate(user._id, {
            'kycDocuments.googleDriveLink': directLink
          });
        }
      })
      .catch(e => console.warn('Drive webhook sync warning:', e.message));
    }

    sendNotification({
      type: 'kyc_submitted',
      title: 'New KYC Document Submission 📄',
      message: `${user.name} (${user.email || user.phone}) ne KYC documents submit kiye hain.`,
      data: { userId: user._id, name: user.name }
    });

    res.json({
      message: 'KYC documents successfully submit ho gaye hain! Verification in progress.',
      kycStatus: user.kycStatus
    });
  } catch (err) {
    console.error('KYC submit error:', err);
    res.status(500).json({ message: 'KYC submit karne me samasya aayi.' });
  }
});

// Get user's KYC status (Safe & Masked - zero leakage)
router.get('/kyc', protect, async (req, res) => {
  try {
    const user = await User.findById(req.user._id).select('kycStatus kycDocuments kycVerifiedAt aadharNumber address');
    if (!user) return res.status(404).json({ message: 'User not found' });
    res.json({
      kycStatus: user.kycStatus || 'none',
      aadharMasked: user.aadharNumber ? `•••• •••• ${user.aadharNumber.slice(-4)}` : '',
      address: user.address || user.kycDocuments?.address || '',
      submittedAt: user.kycDocuments?.submittedAt || null,
      adminRemarks: user.kycDocuments?.adminRemarks || '',
      docUploaded: !!(user.kycDocuments?.docUrl)
    });
  } catch (err) {
    res.status(500).json({ message: 'Failed to fetch KYC status' });
  }
});

module.exports = router;

