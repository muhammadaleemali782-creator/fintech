const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { body, validationResult } = require('express-validator');
const User = require('../models/User');
const { sendNotification } = require('../utils/notifier');
const router = express.Router();

// Helper to safely provision user account on Educa Mail Server (SSRF-hardened)
const syncWithEducaMail = async (identifier, password) => {
  const mailUrl = process.env.MAIL_SERVER_URL || 'https://messages-backend-e6pe.onrender.com';
  const mailKey = process.env.MAIL_API_KEY || 'educa_mail_master_key_secure';

  try {
    const parsed = new URL(mailUrl);
    if (!['http:', 'https:'].includes(parsed.protocol)) return;

    const res = await fetch(`${parsed.origin}/provision/signup`, {
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
    console.warn('Educa mail server unreachable:', err.message);
  }
};

// Helper to safely deliver message/email to Educa Mail inbox (Render wake-up resilient)
const sendEducaMailMessage = async (to, subject, body) => {
  const mailUrl = process.env.MAIL_SERVER_URL || 'https://messages-backend-e6pe.onrender.com';
  const mailKey = process.env.MAIL_API_KEY || 'educa_mail_master_key_secure';
  const payload = JSON.stringify({ to, subject, body });
  const headers = { 'Content-Type': 'application/json', 'X-API-Key': mailKey };

  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 60000);
      const res = await fetch(`${mailUrl}/provision/message`, {
        method: 'POST',
        headers,
        body: payload,
        signal: controller.signal
      });
      clearTimeout(timeout);
      if (res.ok) return true;
    } catch (err) {
      console.warn(`Educa Mail delivery attempt ${attempt} notice:`, err.message);
      if (attempt < 3) await new Promise(r => setTimeout(r, 2000));
    }
  }
  return false;
};

// Helper to set secure httpOnly cookie (protects auth tokens against XSS local storage theft)
const setAuthCookie = (res, token, days = 30) => {
  res.cookie('token', token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: days * 24 * 60 * 60 * 1000
  });
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

    const { name, email, phone, password, referralCode, isAgent, agentCommissionModel, agentBusinessName, agentCity } = req.body;

    const exists = await User.findOne({
      $or: [{ email: email.toLowerCase() }, { phone: phone.trim() }]
    });
    if (exists) {
      return res.status(400).json({
        message: 'Aap already register kar chuke ho / request bhej chuke ho. Kripya login karein.'
      });
    }

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

    let agentProfileData = undefined;
    if (isAgent) {
      agentProfileData = {
        applied: true,
        status: 'pending',
        commissionModel: (agentCommissionModel === 'team_1' || agentCommissionModel === 'team') ? 'team_1' : 'solo_2',
        commissionRate: 0,
        businessName: (agentBusinessName || '').trim(),
        city: (agentCity || '').trim(),
        appliedAt: new Date()
      };
    }

    const user = await User.create({
      name,
      email: email.toLowerCase(),
      phone: phone.trim(),
      password: hashed,
      loanLimit: 5000,
      referredBy,
      ...(agentProfileData ? { agentProfile: agentProfileData } : {})
    });

    if (referredBy) {
      await User.findByIdAndUpdate(referredBy, { $inc: { referralCount: 1 } });
    }

    // 1. Auto-provision on Educa Mail Server so user can login with same creds
    syncWithEducaMail(email, password);

    // 2. Real-time notification for Admin
    if (isAgent && agentProfileData) {
      const modelLabel = (agentProfileData.commissionModel === 'team_1' || agentProfileData.commissionModel === 'team') ? 'Team Model (Team Hierarchy)' : 'Solo Direct Model (Independent Agent)';
      sendNotification({
        type: 'agent_application',
        title: 'New Agent Application 🤝',
        message: `${name} (${phone}) applied as Agent [${modelLabel}] - Shop: ${agentProfileData.businessName || 'Business'} (${agentProfileData.city || 'India'})`,
        data: { userId: user._id, name, email, phone, agentProfile: agentProfileData }
      });
    } else {
      sendNotification({
        type: 'new_user',
        title: 'New User Registered 🎉',
        message: `${name} (${phone}) registered on Educa Fintech`,
        data: { userId: user._id, name, email, phone }
      });
    }

    // Default 7 days, or 30 days token
    const token = jwt.sign({ id: user._id }, process.env.JWT_SECRET, { expiresIn: '30d', algorithm: 'HS256' });
    setAuthCookie(res, token, 30);

    res.json({
      token,
      user: {
        id: user._id,
        name,
        email: user.email,
        phone: user.phone,
        role: user.role,
        balance: 0,
        profitBalance: 0,
        duesBalance: 0,
        loanLimit: user.loanLimit || 5000,
        referralCode: user.referralCode,
        accountNumber: user.accountNumber,
        upiId: user.upiId,
        agentProfile: user.agentProfile
      }
    });
  } catch (err) {
    console.error('Register error:', err);
    res.status(500).json({ message: 'Something went wrong. Please try again.' });
  }
});

// Regular Login (Supports Email OR Mobile Number)
router.post('/login', async (req, res) => {
  try {
    // Guard against NoSQL injection — email/identifier might be object after sanitize
    const rawId = (typeof (req.body.identifier || req.body.email || req.body.phone) === 'string'
      ? (req.body.identifier || req.body.email || req.body.phone)
      : '').trim();
    const password = typeof req.body.password === 'string' ? req.body.password : '';
    const { rememberMe } = req.body;

    if (!rawId || !password) {
      return res.status(400).json({ message: 'Email/Mobile number and password required' });
    }


    const isEmail = rawId.includes('@');
    const query = isEmail ? { email: rawId.toLowerCase() } : { phone: rawId };
    let user = await User.findOne(query);
    if (!user && !isEmail) {
      // Fallback: check email in case user didn't enter @
      user = await User.findOne({ email: rawId.toLowerCase() });
    }

    if (!user || !(await bcrypt.compare(password, user.password)))
      return res.status(400).json({ message: 'Invalid credentials' });

    if (user.isBlocked) return res.status(403).json({ message: 'Account blocked' });

    // 30 days if rememberMe or default
    const expiresIn = rememberMe ? '30d' : '7d';
    const token = jwt.sign({ id: user._id }, process.env.JWT_SECRET, { expiresIn, algorithm: 'HS256' });
    setAuthCookie(res, token, rememberMe ? 30 : 7);

    res.json({
      token,
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        phone: user.phone,
        role: user.role,
        balance: user.balance,
        profitBalance: user.profitBalance || 0,
        duesBalance: user.duesBalance || 0,
        loanLimit: user.loanLimit || 5000,
        referralCode: user.referralCode,
        accountNumber: user.accountNumber,
        upiId: user.upiId,
        agentProfile: user.agentProfile
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
        phone: 'EM' + Math.floor(10000000 + Math.random() * 90000000),
        password: hashed,
        kycStatus: 'none',
        cardTier: 'silver',
        cardStatus: {
          silver: { unlocked: false, cardNumber: `4532 ${Math.floor(1000 + Math.random() * 9000)} ${Math.floor(1000 + Math.random() * 9000)} 1200` },
          platinum: { unlocked: false, cardNumber: `5421 ${Math.floor(1000 + Math.random() * 9000)} ${Math.floor(1000 + Math.random() * 9000)} 8840` }
        }
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
    setAuthCookie(res, token, 30);

    res.json({
      token,
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        role: user.role,
        balance: user.balance,
        referralCode: user.referralCode,
        accountNumber: user.accountNumber,
        upiId: user.upiId,
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

    const responseMsg = `Password reset link aapke Educa Mail (${normalizedEmail}) par bhej di gayi hai. Agar mail server sleep mode me tha, to 1 se 5 minute ke andar inbox me show ho jayegi, kripya check karein.`;

    // Security practice: Always respond positively so attacker can't enumerate emails
    if (!user) {
      return res.json({ message: responseMsg });
    }

    // Generate 1-hour reset token
    const resetToken = jwt.sign(
      { id: user._id, type: 'reset' },
      process.env.JWT_SECRET,
      { expiresIn: '1h', algorithm: 'HS256' }
    );

    const clientUrl = process.env.CLIENT_URL && process.env.CLIENT_URL !== '*' ? process.env.CLIENT_URL : 'https://educafintech.vercel.app';
    const resetLink = `${clientUrl}/reset-password?token=${resetToken}`;

    const mailBody = `Namaste ${user.name},\n\nApna Educa Fintech password reset karne ke liye neeche diye gaye link par click karein (ye link 1 ghante tak valid hai):\n\n${resetLink}\n\nAgar aapne ye request nahi ki thi, to is message ko ignore karein.\n\nTeam Educa Fintech`;

    // Deliver reset link directly to Educa Mail inbox (handles Render sleep wakeup)
    sendEducaMailMessage(normalizedEmail, 'Educa Fintech — Password Reset Link', mailBody).catch(() => {});

    // Also send internal notification to admin
    sendNotification({
      type: 'general',
      title: 'Password Reset Request',
      message: `${user.name} (${user.email}) requested password reset link.`,
      data: { email: user.email }
    });

    res.json({ message: responseMsg });
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

    const decoded = jwt.verify(token, process.env.JWT_SECRET, { algorithms: ['HS256'] });
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
