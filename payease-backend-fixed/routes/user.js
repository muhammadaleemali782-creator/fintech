const express = require('express');
const bcrypt = require('bcryptjs');
const User = require('../models/User');
const Transaction = require('../models/Transaction');
const Settings = require('../models/Settings');
const { protect } = require('../middleware/auth');
const { sendNotification } = require('../utils/notifier');
const { generateAccountNumber } = require('../utils/accountNumber');
const { validateBase64Upload } = require('../utils/validateUpload');
const { getEducaMailUser } = require('../utils/educaMail');
const router = express.Router();

// Helper to evaluate and credit daily profit on primary Savings Account balance (IST Calendar)
async function processDailyYield(user) {
  if (!user || user.role === 'admin') return user;

  const baseBal = Math.max(0, user.balance || 0);
  if (baseBal <= 0) return user;

  const firstDeposit = await Transaction.findOne({ userId: user._id, type: 'deposit', status: 'approved' }).sort({ createdAt: 1 });
  if (!firstDeposit) return user;

  const now = new Date();
  
  // Single source of truth: user.lastYieldCalculatedAt or firstDeposit.createdAt
  const lastCalc = user.lastYieldCalculatedAt ? new Date(user.lastYieldCalculatedAt) : new Date(firstDeposit.createdAt);

  const elapsedMs = Math.max(0, now.getTime() - lastCalc.getTime());
  const annualRate = (user.interestRate || 12) / 100; // default 12% p.a.
  const perMsRate = annualRate / (365 * 86400 * 1000);

  if (elapsedMs >= 100) {
    const totalEarned = Number((baseBal * perMsRate * elapsedMs).toFixed(4));
    if (totalEarned > 0) {
      user.profitBalance = Number(((user.profitBalance || 0) + totalEarned).toFixed(4));
      user.lastYieldCalculatedAt = now;
      user.lowestBalance24h = user.balance;
      await user.save();

      // IST calendar date boundaries (Asia/Kolkata)
      const todayStr = now.toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });
      const startOfTodayIST = new Date(`${todayStr}T00:00:00+05:30`);
      const dailyCap = Number(((baseBal * annualRate) / 365).toFixed(4));

      const recordDailyYield = async (dateStr, earnedToAdd, txnDate) => {
        if (earnedToAdd <= 0) return;
        const refId = `yield_${user._id}_${dateStr}`;
        const existing = await Transaction.findOne({ referenceId: refId });
        const currentAmt = existing ? (existing.amount || 0) : 0;
        const newAmt = Math.min(dailyCap, Number((currentAmt + earnedToAdd).toFixed(4)));
        if (!existing || newAmt > currentAmt) {
          await Transaction.findOneAndUpdate(
            { referenceId: refId },
            {
              $set: { amount: newAmt },
              $setOnInsert: {
                userId: user._id,
                type: 'daily_yield',
                method: 'internal',
                status: 'completed',
                remarks: `Daily Savings Yield (${user.interestRate || 12}% p.a. on ₹${baseBal.toLocaleString('en-IN')})`,
                createdAt: txnDate
              }
            },
            { upsert: true }
          );
        }
      };

      if (lastCalc < startOfTodayIST) {
        // Split: part before midnight IST belongs to previous day, rest to today
        const prevMs = Math.max(0, startOfTodayIST.getTime() - lastCalc.getTime());
        const earnedPrev = Number((baseBal * perMsRate * prevMs).toFixed(4));
        const prevStr = lastCalc.toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });
        await recordDailyYield(prevStr, earnedPrev, new Date(startOfTodayIST.getTime() - 1000));

        const todayMs = Math.max(0, now.getTime() - startOfTodayIST.getTime());
        const earnedToday = Number((baseBal * perMsRate * todayMs).toFixed(4));
        await recordDailyYield(todayStr, earnedToday, now);
      } else {
        await recordDailyYield(todayStr, totalEarned, now);
      }
    }
  }

  return user;
}


router.get('/me', protect, async (req, res) => {
  try {
    let user = await User.findById(req.user._id).select('-password');
    if (!user) return res.status(404).json({ message: 'User not found' });
    if (!user.accountNumber && user.role !== 'admin') {
      user.accountNumber = await generateAccountNumber(User);
      await user.save();
    }
    if ((!user.upiId || !user.upiId.includes('@')) && user.accountNumber) {
      user.upiId = `${user.accountNumber.toLowerCase()}@educa`;
      await user.save();
    }

    // Auto-sync real phone number & name from Educa Mail if placeholder or missing
    if (user.phone && user.phone.startsWith('EM') && user.email) {
      try {
        const mailData = await getEducaMailUser(user.email);
        if (mailData && mailData.phone && mailData.phone.trim()) {
          const cleanPhone = mailData.phone.trim();
          if (/^\+?[0-9\s-]{10,15}$/.test(cleanPhone)) {
            const clash = await User.findOne({ phone: cleanPhone, _id: { $ne: user._id } });
            if (!clash) {
              user.phone = cleanPhone;
              if (mailData.displayName && (!user.name || user.name.includes('@'))) {
                user.name = mailData.displayName.trim();
              }
              await user.save();
            }
          }
        }
      } catch (e) {
        console.warn('Educa sync in GET /me notice:', e.message);
      }
    }

    user = await processDailyYield(user);
    const userObj = user.toObject();
    userObj.hasWalletPin = !!user.walletPin;
    userObj.serverTime = new Date().toISOString();
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
    const { name, phone, address, upiId, bankAccount } = req.body;

    const user = await User.findById(req.user._id);
    if (!user) return res.status(404).json({ message: 'User not found' });

    // 1. Name update
    if (name !== undefined) {
      const cleanName = String(name).trim();
      if (!cleanName) {
        return res.status(400).json({ message: 'Valid name is required' });
      }
      user.name = cleanName;
    }

    // 2. Phone update (with duplicate check)
    if (phone !== undefined) {
      const cleanPhone = String(phone).trim();
      if (!cleanPhone) {
        return res.status(400).json({ message: 'Valid phone number is required' });
      }
      if (cleanPhone !== user.phone) {
        const clash = await User.findOne({ phone: cleanPhone, _id: { $ne: user._id } });
        if (clash) {
          return res.status(400).json({ message: 'Yeh mobile number pehle se kisi doosre account me darj hai' });
        }
        user.phone = cleanPhone;
      }
    }

    // 3. Address / Pata update
    if (address !== undefined) {
      const cleanAddress = String(address).trim();
      user.address = cleanAddress;
      if (user.kycDocuments) {
        user.kycDocuments.address = cleanAddress;
      }
    }

    // upiId validation
    if (upiId) {
      if (typeof upiId !== 'string') return res.status(400).json({ message: 'Invalid UPI ID' });
      user.upiId = upiId.trim();
    }

    // bankAccount validation
    if (bankAccount) {
      if (typeof bankAccount !== 'object') return res.status(400).json({ message: 'Invalid bank account details' });
      user.bankAccount = {
        accountNumber: String(bankAccount.accountNumber || ''),
        ifsc: String(bankAccount.ifsc || ''),
        holderName: String(bankAccount.holderName || '')
      };
    }

    await user.save();

    const safeUser = user.toObject();
    delete safeUser.password;
    safeUser.user = safeUser;
    safeUser.message = 'Profile details updated successfully!';
    res.json(safeUser);
  } catch (err) {
    console.error('Profile update error:', err);
    res.status(500).json({ message: err.message || 'Something went wrong. Please try again.' });
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
      balance: user.balance || 0,
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

// Submit KYC Verification (2 Mandatory Documents: Doc 1 Aadhaar + Doc 2 PAN / Cheque)
router.post('/kyc/submit', protect, async (req, res) => {
  try {
    const {
      aadharNumber,
      aadhaarName,
      aadhaarPhone,
      aadhaarAddress,
      doc1Url,
      doc1BackUrl,
      docUrl, // fallback for doc1
      doc2Type,
      panNumber,
      chequeNumber,
      doc2Url,
      doc2BackUrl,
      address
    } = req.body;

    const file1 = doc1Url || docUrl;
    const file2 = doc2Url;
    const selectedDoc2 = ['pan', 'cheque'].includes(doc2Type) ? doc2Type : 'pan';

    // 1. Mandatory Document 1: Aadhaar Check
    const cleanAadhaar = aadharNumber ? aadharNumber.replace(/\D/g, '').trim() : '';
    if (!cleanAadhaar || cleanAadhaar.length !== 12) {
      return res.status(400).json({ message: 'Document 1: Valid 12-digit Aadhaar number zaroori hai.' });
    }
    if (!file1) {
      return res.status(400).json({ message: 'Document 1: Aadhaar Card (Front) ki photo/document upload zaroori hai.' });
    }

    // 2. Mandatory Document 2: PAN or Cheque Check
    const cleanPan = panNumber ? panNumber.toUpperCase().trim() : '';
    const cleanCheque = chequeNumber ? chequeNumber.trim() : '';

    if (selectedDoc2 === 'pan') {
      if (!cleanPan || !/^[A-Z]{5}[0-9]{4}[A-Z]{1}$/.test(cleanPan)) {
        return res.status(400).json({ message: 'Document 2: Valid 10-digit PAN number zaroori hai (e.g. ABCDE1234F).' });
      }
    } else {
      if (!cleanCheque) {
        return res.status(400).json({ message: 'Document 2: Cheque ya Bank Account number zaroori hai.' });
      }
    }

    if (!file2) {
      return res.status(400).json({
        message: `Document 2: ${selectedDoc2 === 'pan' ? 'PAN Card' : 'Cancelled Cheque'} (Front) ki photo/file upload zaroori hai.`
      });
    }

    // Validate uploaded file sizes and formats
    const filesToValidate = [
      ['Aadhaar Front', file1],
      ['Doc 2 Front', file2]
    ];
    if (doc1BackUrl) filesToValidate.push(['Aadhaar Back', doc1BackUrl]);
    if (doc2BackUrl) filesToValidate.push(['Doc 2 Back', doc2BackUrl]);

    for (const [name, f] of filesToValidate) {
      if (f) {
        const check = validateBase64Upload(f);
        if (!check.valid) {
          return res.status(400).json({ message: `${name}: ${check.error}` });
        }
      }
    }

    const user = await User.findById(req.user._id);
    if (!user) return res.status(404).json({ message: 'User not found' });

    // Validate Aadhaar personal details
    const cleanAadhaarName = aadhaarName ? aadhaarName.trim() : '';
    const cleanAadhaarPhone = aadhaarPhone ? aadhaarPhone.replace(/\D/g, '') : '';
    const cleanAadhaarAddress = aadhaarAddress ? aadhaarAddress.trim() : (address ? address.trim() : '');

    if (!cleanAadhaarName || cleanAadhaarName.length < 3)
      return res.status(400).json({ message: 'Aadhaar par jo naam likha hai woh darj karein.' });
    if (!cleanAadhaarPhone || cleanAadhaarPhone.length !== 10)
      return res.status(400).json({ message: 'Aadhaar se linked 10-digit mobile number zaroori hai.' });
    if (!cleanAadhaarAddress || cleanAadhaarAddress.length < 10)
      return res.status(400).json({ message: 'Aadhaar card par likha hua address darj karein.' });

    user.kycStatus = 'pending';
    user.aadharNumber = cleanAadhaar;
    user.address = cleanAadhaarAddress;

    // Auto-complete and sync user profile from Aadhaar submission
    if (cleanAadhaarName) {
      user.name = cleanAadhaarName;
    }
    if (cleanAadhaarPhone) {
      if (!user.phone || user.phone.startsWith('EM') || user.phone !== cleanAadhaarPhone) {
        const phoneClash = await User.findOne({ phone: cleanAadhaarPhone, _id: { $ne: user._id } });
        if (!phoneClash) {
          user.phone = cleanAadhaarPhone;
        }
      }
    }

    user.kycDocuments = {
      docType: 'aadhaar',
      doc1Type: 'aadhaar',
      doc1Url: file1,
      doc1BackUrl: doc1BackUrl || '',
      doc2Type: selectedDoc2,
      doc2Url: file2,
      doc2BackUrl: doc2BackUrl || '',
      aadharNumber: cleanAadhaar,
      aadhaarName: cleanAadhaarName,
      aadhaarPhone: cleanAadhaarPhone,
      panNumber: cleanPan || user.kycDocuments?.panNumber || '',
      chequeNumber: cleanCheque || user.kycDocuments?.chequeNumber || '',
      address: cleanAadhaarAddress,
      googleDriveLink: '',
      docUrl: file1, // backwards compatibility
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
          doc1Type: 'aadhaar',
          aadharNumber: user.aadharNumber || '',
          doc1Url: file1,
          doc2Type: selectedDoc2,
          panNumber: user.kycDocuments.panNumber || '',
          chequeNumber: user.kycDocuments.chequeNumber || '',
          doc2Url: file2,
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
      message: `${user.name} (${user.email || user.phone}) ne ${selectedDoc2.toUpperCase()} document submit kiya hai.`,
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

// Transfer accrued profit to Primary Wallet for 12% compounding
router.post('/transfer-profit-to-wallet', protect, async (req, res) => {
  try {
    const user = await User.findById(req.user._id);
    if (!user) return res.status(404).json({ message: 'User not found' });

    const profit = Number((user.profitBalance || 0).toFixed(2));
    if (profit <= 0) {
      return res.status(400).json({ message: 'Transfer karne ke liye koi profit balance uplabdh nahi hai (₹0).' });
    }

    user.balance = Number((user.balance + profit).toFixed(2));
    user.profitBalance = 0;
    user.lastYieldCalculatedAt = new Date();
    if (user.wallets?.savings) {
      user.wallets.savings.balance = Number(((user.wallets.savings.balance || 0) + profit).toFixed(2));
    }
    await user.save();

    const txn = await Transaction.create({
      userId: user._id,
      type: 'profit_transfer',
      amount: profit,
      method: 'wallet',
      status: 'completed',
      remarks: 'Profit transferred to Primary Wallet'
    });

    res.json({
      success: true,
      message: `₹${profit.toLocaleString('en-IN', { minimumFractionDigits: 2 })} Primary Wallet me safaltapoorvak transfer ho gaya!`,
      transferredAmount: profit,
      newBalance: user.balance,
      newProfitBalance: 0,
      txn
    });
  } catch (err) {
    console.error('Profit transfer error:', err);
    res.status(500).json({ message: 'Profit transfer karne me samasya aayi.' });
  }
});

// Agent Performance Metrics & Portfolio Dashboard
router.get('/agent/stats', protect, async (req, res) => {
  try {
    const agent = await User.findById(req.user._id);
    if (!agent) return res.status(404).json({ message: 'User not found' });

    const isAgent = agent.role === 'agent' || agent.agentProfile?.status === 'approved';
    if (!isAgent) {
      return res.status(403).json({ message: 'Agent access required' });
    }

    const Loan = require('../models/Loan');

    // 1. Find all customers referred by this agent
    const customers = await User.find({ referredBy: agent._id })
      .select('name email phone balance duesBalance loansCount createdAt kycStatus loanLimit customQrUrl');
    const customerIds = customers.map(c => c._id);

    // 2. Total Deposits from agent's customers
    const depositTxns = await Transaction.find({
      userId: { $in: customerIds },
      type: 'deposit',
      status: 'approved'
    });
    const totalDeposits = Number(depositTxns.reduce((sum, d) => sum + (d.amount || 0), 0).toFixed(2));

    // 3. Total Disbursal to agent's customers
    const disbursals = await Loan.find({
      userId: { $in: customerIds },
      status: { $in: ['approved', 'active', 'closed'] }
    });
    const totalDisbursal = Number(disbursals.reduce((sum, l) => sum + (l.disbursalAmount || l.amount || 0), 0).toFixed(2));

    // 4. Total Collection from agent's customers
    const totalCollection = Number(disbursals.reduce((sum, l) => sum + (l.paidAmount || l.collectedAmount || 0), 0).toFixed(2));

    // 5. Total Pending Due of agent's customers
    const totalDue = Number(customers.reduce((sum, c) => sum + (c.duesBalance || 0), 0).toFixed(2));

    // 6. Pre-closing / Early closure loans
    const preClosedLoans = disbursals.filter(l => l.earlyClosed || l.earlyClosure || (l.status === 'closed' && (l.paidInstallments || 0) < (l.installmentsCount || 10)));
    const preClosingCount = preClosedLoans.length;
    const preClosingAmount = Number(preClosedLoans.reduce((sum, l) => sum + (l.amount || 0), 0).toFixed(2));

    const isTeamModel = agent.agentProfile?.commissionModel === 'team_1' || agent.agentProfile?.commissionModel === 'team';
    const subAgents = await User.find({ referredBy: agent._id, role: 'agent' });

    // Fetch commission earnings breakdown from transactions
    const bonusTxns = await Transaction.find({
      userId: agent._id,
      type: 'referral_bonus'
    }).sort({ createdAt: -1 });

    let loanEarnings = 0;
    let lendingEarnings = 0;
    let investmentEarnings = 0;
    let bondEarnings = 0;

    bonusTxns.forEach(t => {
      const sw = (t.sourceWallet || '').toLowerCase();
      const rem = (t.remarks || '').toLowerCase();
      if (sw === 'loan' || rem.includes('loan')) loanEarnings += (t.amount || 0);
      else if (sw === 'lending' || rem.includes('lending')) lendingEarnings += (t.amount || 0);
      else if (sw === 'bond' || rem.includes('bond')) bondEarnings += (t.amount || 0);
      else if (sw === 'investment' || rem.includes('deposit') || rem.includes('investment')) investmentEarnings += (t.amount || 0);
      else loanEarnings += (t.amount || 0);
    });

    const pb = agent.agentProfile?.earningsBreakdown || {};
    loanEarnings = Math.max(loanEarnings, pb.loan || 0);
    lendingEarnings = Math.max(lendingEarnings, pb.lending || 0);
    investmentEarnings = Math.max(investmentEarnings, pb.investment || 0);
    bondEarnings = Math.max(bondEarnings, pb.bond || 0);
    const totalCommissionEarned = Number((loanEarnings + lendingEarnings + investmentEarnings + bondEarnings).toFixed(2));

    res.json({
      success: true,
      agentInfo: {
        name: agent.name,
        referralCode: agent.referralCode,
        commissionModel: agent.agentProfile?.commissionModel || 'solo_2',
        isTeamModel,
        commissionRate: agent.agentProfile?.commissionRate ?? 0,
        commissions: {
          loan: agent.agentProfile?.commissions?.loan ?? 1,
          lending: agent.agentProfile?.commissions?.lending ?? 4,
          investment: agent.agentProfile?.commissions?.investment ?? 1,
          bond: agent.agentProfile?.commissions?.bond ?? 4
        },
        earningsBreakdown: {
          loan: Number(loanEarnings.toFixed(2)),
          lending: Number(lendingEarnings.toFixed(2)),
          investment: Number(investmentEarnings.toFixed(2)),
          bond: Number(bondEarnings.toFixed(2)),
          total: totalCommissionEarned || agent.referralEarnings || 0
        },
        businessName: agent.agentProfile?.businessName || '',
        city: agent.agentProfile?.city || ''
      },
      commissionHistory: bonusTxns.slice(0, 15).map(t => ({
        id: t._id,
        amount: t.amount,
        source: t.sourceWallet || (t.remarks?.toLowerCase().includes('bond') ? 'bond' : t.remarks?.toLowerCase().includes('lending') ? 'lending' : t.remarks?.toLowerCase().includes('deposit') ? 'investment' : 'loan'),
        remarks: t.remarks,
        createdAt: t.createdAt
      })),
      stats: {
        totalDeposits,
        totalDisbursal,
        totalCollection,
        totalDue,
        preClosingCount,
        preClosingAmount,
        customerCount: customers.length,
        teamMembersCount: subAgents.length
      },
      customers: customers.map((c, idx) => {
        const cDeposits = depositTxns
          .filter(d => d.userId.toString() === c._id.toString())
          .reduce((sum, d) => sum + (d.amount || 0), 0);
        const cLoans = disbursals.filter(l => l.userId.toString() === c._id.toString());
        const cDisbursed = cLoans.reduce((sum, l) => sum + (l.disbursalAmount || l.amount || 0), 0);
        const cCollected = cLoans.reduce((sum, l) => sum + (l.paidAmount || l.collectedAmount || 0), 0);
        const cPre = cLoans.filter(l => l.earlyClosed || l.earlyClosure || (l.status === 'closed' && (l.paidInstallments || 0) < (l.installmentsCount || 10)));
        const cPreCount = cPre.length;
        const cPreAmount = cPre.reduce((sum, l) => sum + (l.amount || 0), 0);

        return {
          id: c._id,
          // Privacy protection: Team system hides customer personal name
          name: isTeamModel ? `Client #${idx + 1}` : c.name,
          phone: isTeamModel ? (c.phone ? `${c.phone.slice(0, 2)}******${c.phone.slice(-2)}` : '******') : c.phone,
          balance: c.balance || 0,
          totalDeposit: Number(cDeposits.toFixed(2)),
          totalDisbursal: Number(cDisbursed.toFixed(2)),
          totalCollection: Number(cCollected.toFixed(2)),
          totalDue: Number((c.duesBalance || 0).toFixed(2)),
          preClosingCount: cPreCount,
          preClosingAmount: Number(cPreAmount.toFixed(2)),
          loansCount: c.loansCount || 0,
          loanLimit: c.loanLimit || 5000,
          kycStatus: c.kycStatus || 'none',
          joinedAt: c.createdAt
        };
      })
    });
  } catch (err) {
    console.error('Agent stats error:', err);
    res.status(500).json({ message: 'Failed to fetch agent metrics' });
  }
});

// Agent Mass Broadcast Message to all referred customers in one click
router.post('/agent/broadcast', protect, async (req, res) => {
  try {
    const agent = await User.findById(req.user._id);
    if (!agent) return res.status(404).json({ message: 'User not found' });
    const isAgent = agent.role === 'agent' || agent.agentProfile?.status === 'approved';
    if (!isAgent) return res.status(403).json({ message: 'Agent access required' });

    const { message, title } = req.body;
    if (!message || !message.trim()) {
      return res.status(400).json({ message: 'Message content is required' });
    }

    const Notification = require('../models/Notification');
    const customers = await User.find({ referredBy: agent._id }).select('_id name phone email');
    if (!customers || customers.length === 0) {
      return res.status(400).json({ message: 'Aapke paas abhi koi registered customer nahi hai jinhe broadcast bheja ja sake.' });
    }

    const notifTitle = title && title.trim() ? title.trim() : `📢 Agent Broadcast (${agent.name})`;
    const notifs = customers.map(c => ({
      userId: c._id,
      title: notifTitle,
      message: message.trim(),
      type: 'general',
      createdAt: new Date()
    }));

    await Notification.insertMany(notifs);

    // Real-time SSE alert
    if (req.app.locals.sseClients) {
      const payload = JSON.stringify({
        type: 'agent_broadcast',
        sender: agent.name,
        title: notifTitle,
        message: message.trim(),
        recipientCount: customers.length
      });
      req.app.locals.sseClients.forEach(client => {
        try { client.write(`data: ${payload}\n\n`); } catch (e) {}
      });
    }

    res.json({
      success: true,
      sentCount: customers.length,
      message: `Safaltapoorvak sabhi ${customers.length} customers ko mass message bhej diya gaya hai!`
    });
  } catch (err) {
    console.error('Agent broadcast error:', err);
    res.status(500).json({ message: 'Broadcast message send karne me error aaya' });
  }
});

// ------------------ CUSTOM UPI / APP QR (PERSISTENT ACROSS UNINSTALLS) ------------------
// Save or update custom QR (Google Pay, PhonePe, Paytm, etc.)
router.post('/custom-qr', protect, async (req, res) => {
  try {
    const { customQrUrl, customQrUpi, customQrApp } = req.body;
    if (customQrUrl) {
      const check = validateBase64Upload(customQrUrl);
      if (!check.valid) {
        return res.status(400).json({ message: 'Invalid custom QR image: ' + check.error });
      }
    }

    const user = await User.findById(req.user._id);
    if (!user) return res.status(404).json({ message: 'User not found' });

    user.customQrUrl = customQrUrl || '';
    user.customQrUpi = (customQrUpi || '').trim();
    user.customQrApp = (customQrApp || 'custom').trim();
    await user.save();

    res.json({
      success: true,
      message: 'Custom QR code safaltapoorvak save ho gaya!',
      customQrUrl: user.customQrUrl,
      customQrUpi: user.customQrUpi,
      customQrApp: user.customQrApp
    });
  } catch (err) {
    console.error('Custom QR save error:', err);
    res.status(500).json({ message: 'Custom QR save karne me error aaya' });
  }
});

// Delete or remove custom QR
router.delete('/custom-qr', protect, async (req, res) => {
  try {
    const user = await User.findById(req.user._id);
    if (!user) return res.status(404).json({ message: 'User not found' });

    user.customQrUrl = '';
    user.customQrUpi = '';
    user.customQrApp = '';
    await user.save();

    res.json({ success: true, message: 'Custom QR safaltapoorvak remove ho gaya!' });
  } catch (err) {
    console.error('Custom QR delete error:', err);
    res.status(500).json({ message: 'Custom QR remove karne me error aaya' });
  }
});

// ------------------ AGENT: UPDATE CUSTOMER LOAN LIMIT ------------------
// Agent can increase loan limit for their referred customers
router.post('/agent/update-loan-limit', protect, async (req, res) => {
  try {
    const agent = await User.findById(req.user._id);
    if (!agent) return res.status(404).json({ message: 'User not found' });

    const isAgent = agent.role === 'agent' || agent.agentProfile?.status === 'approved' || agent.role === 'admin';
    if (!isAgent) return res.status(403).json({ message: 'Agent access required' });

    const { customerId, newLimit } = req.body;
    const limitNum = Number(newLimit);
    if (!limitNum || limitNum < 5000 || limitNum > 100000) {
      return res.status(400).json({ message: 'Loan limit ₹5,000 se ₹1,00,000 ke beech honi chahiye.' });
    }

    const customer = await User.findById(customerId);
    if (!customer) return res.status(404).json({ message: 'Customer not found' });

    // Agent can only update their own referred users (admins can update anyone)
    if (agent.role !== 'admin' && String(customer.referredBy) !== String(agent._id)) {
      return res.status(403).json({ message: 'Aap sirf apne registered customer ki loan limit badha sakte hain.' });
    }

    customer.loanLimit = limitNum;
    await customer.save();

    res.json({
      success: true,
      message: `${customer.name} ki loan limit safaltapoorvak ₹${limitNum.toLocaleString('en-IN')} kar di gayi hai!`,
      customer: {
        _id: customer._id,
        name: customer.name,
        loanLimit: customer.loanLimit
      }
    });
  } catch (err) {
    console.error('Agent update loan limit error:', err);
    res.status(500).json({ message: 'Loan limit update karne me error aaya' });
  }
});

// ------------------ AGENT: ADD / ONBOARD CUSTOMER DIRECTLY UNDER AGENT ------------------
router.post('/agent/add-customer', protect, async (req, res) => {
  try {
    const agent = await User.findById(req.user._id);
    if (!agent) return res.status(404).json({ message: 'User not found' });

    const isAgent = agent.role === 'agent' || agent.agentProfile?.status === 'approved' || agent.role === 'admin';
    if (!isAgent) return res.status(403).json({ message: 'Agent access required' });

    const { name, phone, email, password } = req.body;
    if (!name || name.trim().length < 2) {
      return res.status(400).json({ message: 'Customer name zaroori hai (min 2 characters)' });
    }
    const cleanPhone = phone ? String(phone).trim() : '';
    if (!cleanPhone || !/^[6-9]\d{9}$/.test(cleanPhone)) {
      return res.status(400).json({ message: 'Valid 10-digit mobile number enter karein (6-9 se shuru)' });
    }

    const cleanEmail = email && email.trim() ? email.trim().toLowerCase() : `${cleanPhone}@educa.internal`;
    const cleanPass = password && password.trim().length >= 6 ? password.trim() : '12345678';

    const existingUser = await User.findOne({
      $or: [{ phone: cleanPhone }, { email: cleanEmail }]
    });
    if (existingUser) {
      const msg = existingUser.phone === cleanPhone ? 'Ye mobile number pehle se registered hai.' : 'Ye email pehle se registered hai.';
      return res.status(400).json({ message: msg });
    }

    const bcrypt = require('bcryptjs');
    const hashed = await bcrypt.hash(cleanPass, 12);

    const newUser = await User.create({
      name: name.trim(),
      phone: cleanPhone,
      email: cleanEmail,
      password: hashed,
      referredBy: agent._id,
      loanLimit: 15000,
      balance: 0
    });

    agent.referralCount = (agent.referralCount || 0) + 1;
    await agent.save();

    res.json({
      success: true,
      message: `🎉 Customer ${newUser.name} safaltapoorvak aapke portfolio me add ho gaya hai! (Login Password: ${cleanPass})`,
      customer: {
        _id: newUser._id,
        name: newUser.name,
        phone: newUser.phone,
        email: newUser.email,
        accountNumber: newUser.accountNumber,
        loanLimit: newUser.loanLimit,
        createdAt: newUser.createdAt
      }
    });
  } catch (err) {
    console.error('Add customer error:', err);
    res.status(500).json({ message: 'Customer add karne me error aaya. Kripya dobara try karein.' });
  }
});

router.processDailyYield = processDailyYield;
module.exports = router;
module.exports.processDailyYield = processDailyYield;

