const express = require('express');
const User = require('../models/User');
const { protect } = require('../middleware/auth');
const router = express.Router();

router.get('/me', protect, async (req, res) => {
  try {
    res.json(req.user);
  } catch (err) {
    res.status(500).json({ message: 'Something went wrong. Please try again.' });
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
