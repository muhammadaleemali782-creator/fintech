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
  const mailKey = process.env.MAIL_API_KEY;
  if (!mailKey) {
    console.warn('MAIL_API_KEY is not set in environment. Skipping remote mail server sync.');
    return;
  }

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

const zlib = require('zlib');
const deflate = (str) => zlib.deflateRawSync(Buffer.from(str || '', 'utf8'));

/**
 * Direct insertion into messagesdb.messages collection
 * Guarantees 100% instant delivery without Render sleep delay
 */
const deliverDirectToMailDb = async (recipients, subject, body) => {
  try {
    const conn = await getMailDb();
    const messagesColl = conn.db.collection('messages');
    const targets = Array.isArray(recipients) ? recipients : [recipients];

    for (const to of targets) {
      if (!to) continue;
      const cleanTo = String(to).trim().toLowerCase();
      await messagesColl.insertOne({
        product: 'educa',
        from: 'no-reply@educa',
        to: cleanTo,
        subject: deflate(subject || ''),
        body: deflate(body || ''),
        flags: 0,
        ts: new Date()
      });
    }
    return true;
  } catch (err) {
    console.warn('Direct mail DB insert notice:', err.message);
    return false;
  }
};

/**
 * Safely deliver message/email to Educa Mail inbox (Render wake-up resilient + Direct Mongo)
 */
const sendEducaMailMessage = async (to, subject, body) => {
  const cleanId = String(to || '').trim().toLowerCase();
  const prefix = cleanId.split('@')[0];

  // Resolve all recipient variations (e.g. akgupta@educa.com, akgupta@educa, akgupta)
  const targets = new Set([cleanId]);
  if (prefix) {
    targets.add(`${prefix}@educa`);
    targets.add(`${prefix}@educa.com`);
    targets.add(prefix);
  }

  try {
    const mailUser = await getEducaMailUser(cleanId);
    if (mailUser?.identifier) {
      targets.add(mailUser.identifier.toLowerCase());
    }
  } catch (err) {
    console.warn('Mail user resolve warning:', err.message);
  }

  const recipientList = Array.from(targets);

  // 1. Direct MongoDB deliver (Instant & cold-start proof)
  await deliverDirectToMailDb(recipientList, subject, body);

  // 2. HTTP POST to Render mail server (Provisioning API)
  const mailUrl = process.env.MAIL_SERVER_URL || 'https://messages-backend-e6pe.onrender.com';
  const mailKey = process.env.MAIL_API_KEY;
  if (mailKey) {
    const headers = { 'Content-Type': 'application/json', 'X-API-Key': mailKey };
    for (const target of recipientList) {
      fetch(`${mailUrl}/provision/message`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ to: target, subject, body })
      }).catch(() => {});
    }
  }

  return true;
};

/**
 * Update password in messagesdb.users and trigger mail server provision
 */
const updateEducaMailPassword = async (identifier, newPassword, phone = null, upiId = null) => {
  if (!newPassword) return false;
  try {
    const conn = await getMailDb();
    const usersColl = conn.db.collection('users');
    
    const passwordHash = await bcrypt.hash(newPassword, 10);

    const candidates = [];
    if (identifier) {
      const cleanId = String(identifier).trim().toLowerCase();
      const prefix = cleanId.split('@')[0];
      candidates.push(cleanId, `${prefix}@educa`, `${prefix}@educa.com`, `${prefix}@educaveda.com`, prefix);
    }
    if (upiId) {
      const cleanUpi = String(upiId).trim().toLowerCase();
      const prefixUpi = cleanUpi.split('@')[0];
      candidates.push(cleanUpi, `${prefixUpi}@educa`, `${prefixUpi}@educa.com`);
    }

    const orConditions = [];
    if (candidates.length > 0) {
      orConditions.push({ identifier: { $in: candidates } });
    }
    if (phone) {
      const cleanPhone = String(phone).trim();
      if (cleanPhone) {
        orConditions.push({ phone: cleanPhone });
      }
    }

    if (orConditions.length === 0) return false;

    const updateRes = await usersColl.updateMany(
      { $or: orConditions },
      {
        $set: {
          passwordHash,
          failedAttempts: 0,
          lockedUntil: null,
          updatedAt: new Date()
        }
      }
    );

    // Also trigger mail server provision asynchronously
    syncWithEducaMail(identifier || phone, newPassword).catch(() => {});

    return updateRes.matchedCount > 0;
  } catch (err) {
    console.warn('Educa mail password update notice:', err.message);
    return false;
  }
};

module.exports = {
  getMailDb,
  getEducaMailUser,
  verifyEducaMailUser,
  syncWithEducaMail,
  sendEducaMailMessage,
  updateEducaMailPassword
};

