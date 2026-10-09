const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

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

// Safe schema for Educa Mail users collection in messagesdb
const getMailUserModel = async () => {
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
  return conn.models.User || conn.model('User', UserSchema, 'users');
};

/**
 * Find an Educa Mail user by various identifier formats:
 * e.g., 'akgupta@educa.com', 'akgupta@educa', 'akgupta', 'akgupta@educaveda.com'
 */
const getEducaMailUser = async (identifier) => {
  if (!identifier) return null;
  try {
    const MailUser = await getMailUserModel();
    const cleanId = String(identifier).trim().toLowerCase();
    const prefix = cleanId.split('@')[0];
    const candidates = [
      cleanId,
      `${prefix}@educa`,
      `${prefix}@educa.com`,
      `${prefix}@educaveda.com`,
      prefix
    ];

    const mailUser = await MailUser.findOne({ identifier: { $in: candidates } });
    return mailUser;
  } catch (err) {
    console.warn('Educa Mail user lookup error:', err.message);
    return null;
  }
};

/**
 * Verify credentials against Educa Mail database
 */
const verifyEducaMailUser = async (identifier, password) => {
  if (!identifier || !password) return null;
  try {
    const mailUser = await getEducaMailUser(identifier);
    if (!mailUser || !mailUser.passwordHash) return null;

    const match = await bcrypt.compare(password, mailUser.passwordHash);
    if (!match) return null;

    return mailUser;
  } catch (err) {
    console.warn('Educa Mail verification error:', err.message);
    return null;
  }
};

/**
 * Safely provision user account on Educa Mail Server (SSRF-hardened)
 */
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

/**
 * Safely deliver message/email to Educa Mail inbox (Render wake-up resilient)
 */
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

module.exports = {
  getMailDb,
  getEducaMailUser,
  verifyEducaMailUser,
  syncWithEducaMail,
  sendEducaMailMessage
};
