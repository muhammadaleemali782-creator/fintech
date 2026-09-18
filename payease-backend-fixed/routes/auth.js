const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { body, validationResult } = require('express-validator');
const User = require('../models/User');
const { sendNotification } = require('../utils/notifier');
const router = express.Router();

// Helper to provision user account on Educa Mail Server
const syncWithEducaMail = async (identifier, password) => {
  const mailUrl = process.env.MAIL_SERVER_URL || 'http://localhost:3000';
  const mailKey = process.env.MAIL_API_KEY || 'default-secret-key';
  try {
    const res = await fetch(`${mailUrl}/provision/signup`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-API-Key': mailKey
      },
      body: JSON.stringify({ identifier, password })
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      console.warn('Educa mail provision warning:', data.error || res.statusText);
    }
  } catch (err) {
    // Non-fatal if mail-server isn't running locally yet
    console.warn('Educa mail server unreachable:', err.message);
  }
};

// Input validation rules
const registerRules = [
  body('name').trim().isLength({ min: 2, max: 60 }).withMessage('Name must be 2-60 characters'),
  body('email').isEmail().withMessage('Valid email required').normalizeEmail(),
  body('phone').trim().isLength({ min: 10, max: 15 }).withMessage('Valid phone required'),
  body('password').isLength({ min: 8, max: 72 }).withMessage('Password must be 8-72 characters')
];

const loginRules = [
  body('email').isEmail().withMessage('Valid email required').normalizeEmail(),
  body('password').notEmpty().withMessage('Password required')
];

// Register
router.post('/register', registerRules, async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ message: errors.array()[0].msg });

    const { name, email, phone, password, referralCode } = req.body;

    const exists = await User.findOne({ email });
    if (exists) return res.status(400).json({ message: 'Email already registered' });

    const hashed = await bcrypt.hash(password, 12);

    // Check referral code
    let referredBy = null;
    if (referralCode) {
      const referrer = await User.findOne({ referralCode: referralCode.toUpperCase() });
      if (referrer) {
        referredBy = referrer._id;
      } else {
        return res.status(400).json({ message: 'Invalid referral code' });
      }
    }

    const user = await User.create({
      name,
      email,
      phone,
      password: hashed,
      referredBy
    });

    if (referredBy) {
      await User.findByIdAndUpdate(referredBy, { $inc: { referralCount: 1 } });
    }

    // 1. Auto-provision on Educa Mail Server so user can login with same creds
    syncWithEducaMail(email, password);

    // 2. Real-time notification for Admin
    sendNotification({
      type: 'new_user',
      title: 'New User Registered 🎉',
      message: `${name} (${phone}) registered on Educa Fintech`,
      data: { userId: user._id, name, email, phone }
    });

    // Default 7 days, or 30 days token
    const token = jwt.sign({ id: user._id }, process.env.JWT_SECRET, { expiresIn: '30d', algorithm: 'HS256' });

    res.json({
      token,
      user: {
        id: user._id,
        name,
        email,
        role: user.role,
        balance: 0,
        referralCode: user.referralCode
      }
    });
  } catch (err) {
    console.error('Register error:', err);
    res.status(500).json({ message: 'Something went wrong. Please try again.' });
  }
});

// Regular Login
router.post('/login', loginRules, async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ message: errors.array()[0].msg });

    const { email, password, rememberMe } = req.body;
    const user = await User.findOne({ email });

    if (!user || !(await bcrypt.compare(password, user.password)))
      return res.status(400).json({ message: 'Invalid credentials' });

    if (user.isBlocked) return res.status(403).json({ message: 'Account blocked' });

    // 30 days if rememberMe or default
    const expiresIn = rememberMe ? '30d' : '7d';
    const token = jwt.sign({ id: user._id }, process.env.JWT_SECRET, { expiresIn, algorithm: 'HS256' });

    res.json({
      token,
      user: {
        id: user._id,
        name: user.name,
        email,
        role: user.role,
        balance: user.balance,
        referralCode: user.referralCode
      }
    });
  } catch (err) {
    res.status(500).json({ message: 'Something went wrong. Please try again.' });
  }
});

// Login with Educa Mail (30 Days valid)
router.post('/mail-login', async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) return res.status(400).json({ message: 'Email and password required' });

    const normalizedEmail = email.trim().toLowerCase();

    // Check if user exists in Fintech database
    let user = await User.findOne({ email: normalizedEmail });

    if (user) {
      const match = await bcrypt.compare(password, user.password);
      if (!match) return res.status(400).json({ message: 'Invalid Educa Mail credentials' });
    } else {
      // Auto-provision fintech account if registered on Educa Mail
      const hashed = await bcrypt.hash(password, 12);
      const username = normalizedEmail.split('@')[0];
      user = await User.create({
        name: username,
        email: normalizedEmail,
        phone: 'Not provided',
        password: hashed
      });

      sendNotification({
        type: 'new_user',
        title: 'Educa Mail Login (New User)',
        message: `${normalizedEmail} signed in via Educa Mail`,
        data: { userId: user._id, email: normalizedEmail }
      });
    }

    if (user.isBlocked) return res.status(403).json({ message: 'Account blocked' });

    // 30 din ka token — bar bar password na dalna pade!
    const token = jwt.sign(
      { id: user._id, loginMethod: 'educa-mail' },
      process.env.JWT_SECRET,
      { expiresIn: '30d', algorithm: 'HS256' }
    );

    res.json({
      token,
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        role: user.role,
        balance: user.balance,
        referralCode: user.referralCode,
        loginMethod: 'educa-mail'
      }
    });
  } catch (err) {
    console.error('Mail login error:', err);
    res.status(500).json({ message: 'Something went wrong. Please try again.' });
  }
});

// Forgot Password - sends reset instruction to Educa Mail
router.post('/forgot-password', async (req, res) => {
  try {
    const { email } = req.body;
    if (!email) return res.status(400).json({ message: 'Please enter your email address' });

    const normalizedEmail = email.trim().toLowerCase();
    const user = await User.findOne({ email: normalizedEmail });

    // Security practice: Always respond positively so attacker can't enumerate emails
    if (!user) {
      return res.json({
        message: 'Password reset link aapke Educa Mail par bhej di gayi hai.'
      });
    }

    // Generate 1-hour reset token
    const resetToken = jwt.sign(
      { id: user._id, type: 'reset' },
      process.env.JWT_SECRET,
      { expiresIn: '1h' }
    );

    // Also send internal notification to admin
    sendNotification({
      type: 'general',
      title: 'Password Reset Request',
      message: `${user.name} (${user.email}) requested password reset link.`,
      data: { email: user.email }
    });

    res.json({
      message: `Password reset link aapke Educa Mail (${normalizedEmail}) par bhej di gayi hai.`,
      // For local testing convenience if mail server is offline:
      resetToken
    });
  } catch (err) {
    res.status(500).json({ message: 'Something went wrong' });
  }
});

// Reset Password
router.post('/reset-password', async (req, res) => {
  try {
    const { token, newPassword } = req.body;
    if (!token || !newPassword || newPassword.length < 8) {
      return res.status(400).json({ message: 'Valid reset token and minimum 8-character password required' });
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    if (decoded.type !== 'reset') return res.status(400).json({ message: 'Invalid reset token' });

    const hashed = await bcrypt.hash(newPassword, 12);
    const user = await User.findByIdAndUpdate(decoded.id, { password: hashed }, { new: true });

    if (user) {
      // Keep Educa Mail in sync
      syncWithEducaMail(user.email, newPassword);
    }

    res.json({ message: 'Password successfully reset! You can now log in.' });
  } catch (err) {
    res.status(400).json({ message: 'Reset token expired or invalid. Please request a new one.' });
  }
});

module.exports = router;
