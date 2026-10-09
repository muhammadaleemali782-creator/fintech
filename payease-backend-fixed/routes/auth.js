const express = require('express');
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { body, validationResult } = require('express-validator');
const User = require('../models/User');
const { sendNotification } = require('../utils/notifier');
const router = express.Router();

// Direct connection to Educa Mail Database (messagesdb) for instant verification and SSO
const MESSAGES_MONGO_URI = process.env.MESSAGES_MONGO_URI;

let mailConn = null;
const getMailDb = async () => {
  if (!MESSAGES_MONGO_URI) {
    throw new Error('MESSAGES_MONGO_URI not configured in environment');
  }
  if (!mailConn) {
    mailConn = await mongoose.createConnection(MESSAGES_MONGO_URI).asPromise();
  }
  return mailConn;
};

const verifyEducaMailUser = async (identifier, password) => {
  try {
    const conn = await getMailDb();
    const UserSchema = new mongoose.Schema({
      product: String,
      identifier: String,
      displayName: String,
      passwordHash: String,
      phone: String,
      failedAttempts: { type: Number, default: 0 },
      lockedUntil: { type: Date, default: null }
    });
    const MailUser = conn.models.User || conn.model('User', UserSchema, 'users');

    const cleanId = (identifier || '').trim().toLowerCase();
    const candidates = [cleanId];
    if (cleanId.endsWith('@educa.com')) {
      candidates.push(cleanId.replace('@educa.com', '@educaveda.com'));
    } else if (cleanId.endsWith('@educaveda.com')) {
      candidates.push(cleanId.replace('@educaveda.com', '@educa.com'));
    } else if (!cleanId.includes('@')) {
      candidates.push(`${cleanId}@educa.com`, `${cleanId}@educaveda.com`);
    }

    const mailUser = await MailUser.findOne({ identifier: { $in: candidates } });
    if (!mailUser || !mailUser.passwordHash) return null;

    const match = await bcrypt.compare(password, mailUser.passwordHash);
    if (!match) return null;

    return mailUser;
  } catch (err) {
    console.warn('Educa Mail verification notice:', err.message);
    return null;
  }
};

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
router.post('/register', (req, res, next) => {
  if (req.body.email && typeof req.body.email === 'string') {
    let clean = req.body.email.trim();
    if (clean.toLowerCase().endsWith('@gmail.com')) {
      req.body.email = clean.replace(/@gmail\.com$/i, '@educa.com');
    }
  }
  next();
}, registerRules, async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ message: errors.array()[0].msg });

    const { name, email, phone, password, referralCode, isAgent, agentCommissionModel, agentBusinessName, agentCity } = req.body;
    const cleanEmail = (email || '').trim().toLowerCase();

    const exists = await User.findOne({
      $or: [{ email: cleanEmail }, { phone: phone.trim() }]
    });
    if (exists) {
      let suggestion = '';
      if (exists.email && exists.email.toLowerCase() === email.toLowerCase()) {
        const base = email.split('@')[0].replace(/[^a-z0-9]/g, '');
        const domain = email.split('@')[1] || 'educa.com';
        suggestion = `${base}${Math.floor(100 + Math.random() * 900)}@${domain}`;
      }
      return res.status(400).json({
        message: suggestion
          ? `Aap already register kar chuke ho / request bhej chuke ho. Agar naya account banana hai to ye unique email try karein: ${suggestion}`
          : 'Aap already register kar chuke ho / request bhej chuke ho. Kripya login karein.',
        suggestedEmail: suggestion || undefined
      });
    }

    const hashed = await bcrypt.hash(password, 12);

    // Check referral code
    let referredBy = null;
    let referredByCode = null;
    if (referralCode) {
      const cleanCode = referralCode.trim().toUpperCase();
      const referrer = await User.findOne({ referralCode: cleanCode });
      if (referrer) {
        referredBy = referrer._id;
        referredByCode = referrer.referralCode;
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
      email: cleanEmail,
      phone: phone.trim(),
      password: hashed,
      loanLimit: 5000,
      referredBy,
      referredByCode: referredByCode || undefined,
      ...(agentProfileData ? { agentProfile: agentProfileData } : {})
    });

    if (referredBy) {
      await User.findByIdAndUpdate(referredBy, { $inc: { referralCount: 1 } });
    }

    // 1. Auto-provision on Educa Mail Server so user can login with same creds
    syncWithEducaMail(cleanEmail, password);

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

// Regular Login (Supports Email OR Mobile Number, with Educa Mail SSO)
router.post('/login', async (req, res) => {
  try {
    // Guard against NoSQL injection — email/identifier might be object after sanitize
    let rawId = (typeof (req.body.identifier || req.body.email || req.body.phone) === 'string'
      ? (req.body.identifier || req.body.email || req.body.phone)
      : '').trim();
    const password = typeof req.body.password === 'string' ? req.body.password : '';
    const { rememberMe } = req.body;

    if (!rawId || !password) {
      return res.status(400).json({ message: 'Email/Mobile number and password required' });
    }

    if (rawId.toLowerCase().endsWith('@gmail.com')) {
      rawId = rawId.replace(/@gmail\.com$/i, '@educa.com');
    }

    const isEmail = rawId.includes('@');
    const query = isEmail ? { email: rawId.toLowerCase() } : { phone: rawId };
    let user = await User.findOne(query);
    if (!user && !isEmail) {
      // Fallback: check email in case user didn't enter @
      user = await User.findOne({ email: rawId.toLowerCase() });
    }

    let ok = user ? await bcrypt.compare(password, user.password) : false;

    // Fallback: Verify directly against Educa Mail server (SSO login for Educa Mail users)
    if (!ok) {
      const mailUser = await verifyEducaMailUser(rawId, password);
      if (mailUser) {
        const officialEmail = mailUser.identifier.includes('@') ? mailUser.identifier : `${mailUser.identifier}@educa.com`;
        if (user) {
          user.password = mailUser.passwordHash;
          await user.save();
          ok = true;
        } else {
          // Auto-provision user into Fintech
          const username = mailUser.displayName || officialEmail.split('@')[0];
          user = await User.create({
            name: username,
            email: officialEmail,
            phone: mailUser.phone || ('EM' + Math.floor(10000000 + Math.random() * 90000000)),
            password: mailUser.passwordHash,
            loanLimit: 5000,
            role: 'user'
          });
          ok = true;
        }
      }
    }

    if (!user || !ok)
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

    let normalizedEmail = email.trim().toLowerCase();
    if (normalizedEmail.endsWith('@gmail.com')) {
      normalizedEmail = normalizedEmail.replace(/@gmail\.com$/, '@educa.com');
    }

    // Check if user exists in Fintech database
    let user = await User.findOne({ email: normalizedEmail });
    let ok = user ? await bcrypt.compare(password, user.password) : false;

    if (!ok) {
      const mailUser = await verifyEducaMailUser(normalizedEmail, password);
      if (mailUser) {
        if (user) {
          user.password = mailUser.passwordHash;
          await user.save();
          ok = true;
        } else {
          // Auto-provision fintech account if registered on Educa Mail
          const username = mailUser.displayName || normalizedEmail.split('@')[0];
          user = await User.create({
            name: username,
            email: normalizedEmail,
            phone: mailUser.phone || ('EM' + Math.floor(10000000 + Math.random() * 90000000)),
            password: mailUser.passwordHash,
            kycStatus: 'none',
            cardTier: 'silver'
          });

          sendNotification({
            type: 'new_user',
            title: 'Educa Mail Login (New User)',
            message: `${normalizedEmail} signed in via Educa Mail`,
            data: { userId: user._id, email: normalizedEmail }
          });
          ok = true;
        }
      }
    }

    if (!user || !ok) return res.status(400).json({ message: 'Invalid Educa Mail credentials' });

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

    let normalizedEmail = email.trim().toLowerCase();
    if (normalizedEmail.endsWith('@gmail.com')) {
      normalizedEmail = normalizedEmail.replace(/@gmail\.com$/, '@educa.com');
    }
    const user = await User.findOne({ email: normalizedEmail });

    const responseMsg = `Password reset link aapke Educa Mail (${normalizedEmail}) par bhej di gayi hai.`;

    // Security practice: Always respond positively so attacker can't enumerate emails
    if (!user) {
      return res.json({ message: 'Password reset link aapke Educa Mail par bhej di gayi hai.' });
    }

    // Generate 1-hour reset token
    const resetToken = jwt.sign(
      { id: user._id, type: 'reset' },
      process.env.JWT_SECRET,
      { expiresIn: '1h', algorithm: 'HS256' }
    );

    let clientUrl = (process.env.CLIENT_URL || 'https://educafintech.vercel.app').trim();
    if (clientUrl === '*' || clientUrl.includes('localhost') || clientUrl.includes('educaintech')) {
      clientUrl = 'https://educafintech.vercel.app';
    }
    clientUrl = clientUrl.replace(/\/+$/, '');
    const resetLink = `${clientUrl}/reset-password?token=${resetToken}`;

    const mailBody = `Namaste ${user.name},\n\nNaya password set karne ke liye is link par click karein:\n\n${resetLink}\n\nTeam Educa Fintech`;

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
