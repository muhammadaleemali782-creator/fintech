const express = require('express');
const bcrypt = require('bcryptjs');
const User = require('../models/User');
const { protect } = require('../middleware/auth');
const router = express.Router();

router.get('/me', protect, async (req, res) => {
  try {
    const user = await User.findById(req.user._id).select('-password');
    if (!user) return res.status(404).json({ message: 'User not found' });
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

module.exports = router;
