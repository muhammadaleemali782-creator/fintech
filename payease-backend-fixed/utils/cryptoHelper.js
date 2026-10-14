const crypto = require('crypto');

/**
 * Field encryption for KYC documents etc.
 *
 *  - New data : AES-256-GCM (authenticated)  ->  "enc2::<iv hex>::<tag hex>::<ciphertext base64>"
 *  - Old data : AES-256-CBC written by the previous version ("enc::<iv hex>::<base64>") is still
 *               readable, so nothing already in the database breaks.
 *
 * Keys:
 *  - ENCRYPTION_KEY (required in production, independent of JWT_SECRET so rotating the JWT
 *    secret never makes documents unreadable).
 *  - Legacy CBC data was encrypted with a key derived from ENCRYPTION_KEY || JWT_SECRET ||
 *    a hardcoded string. We keep trying those (decrypt only) so old rows stay readable.
 */
const GCM_PREFIX = 'enc2::';
const CBC_PREFIX = 'enc::';

function deriveKey(secret) {
  return crypto.createHash('sha256').update(String(secret)).digest();
}

function getPrimaryKey() {
  const secret = process.env.ENCRYPTION_KEY || process.env.JWT_SECRET;
  if (!secret) {
    if (process.env.NODE_ENV === 'production') {
      throw new Error('ENCRYPTION_KEY or JWT_SECRET must be set in production');
    }
    // Development only: stable per-machine fallback so local dev works. Never used in production.
    return deriveKey('dev-only-encryption-key::' + (process.env.JWT_SECRET || 'local'));
  }
  return deriveKey(secret);
}

// Candidate keys for decrypting LEGACY (CBC) data, most likely first.
function getLegacyKeys() {
  const keys = [];
  const seen = new Set();
  const add = (s) => {
    if (!s || seen.has(s)) return;
    seen.add(s);
    keys.push(deriveKey(s));
  };
  add(process.env.ENCRYPTION_KEY);
  add(process.env.LEGACY_ENCRYPTION_KEY);
  add(process.env.JWT_SECRET);
  add('payease-secret-encryption-key-32-chars-min'); // old hardcoded fallback (decrypt-only)
  return keys;
}

function encryptData(text) {
  if (!text || typeof text !== 'string') return text;
  if (text.startsWith(GCM_PREFIX) || text.startsWith(CBC_PREFIX)) return text; // already encrypted
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', getPrimaryKey(), iv);
  const encrypted = Buffer.concat([cipher.update(text, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${GCM_PREFIX}${iv.toString('hex')}::${tag.toString('hex')}::${encrypted.toString('base64')}`;
}

function decryptGcm(text) {
  const parts = text.split('::');
  if (parts.length !== 4) return text;
  const iv = Buffer.from(parts[1], 'hex');
  const tag = Buffer.from(parts[2], 'hex');
  const data = Buffer.from(parts[3], 'base64');
  const decipher = crypto.createDecipheriv('aes-256-gcm', getPrimaryKey(), iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(data), decipher.final()]).toString('utf8');
}

function decryptLegacyCbc(text) {
  const parts = text.split('::');
  if (parts.length !== 3) return text;
  const iv = Buffer.from(parts[1], 'hex');
  for (const key of getLegacyKeys()) {
    try {
      const decipher = crypto.createDecipheriv('aes-256-cbc', key, iv);
      let out = decipher.update(parts[2], 'base64', 'utf8');
      out += decipher.final('utf8');
      return out;
    } catch (_) { /* try next key */ }
  }
  console.warn('Decryption warning: no key could decrypt legacy value');
  return text;
}

function decryptData(text) {
  if (!text || typeof text !== 'string') return text;
  try {
    if (text.startsWith(GCM_PREFIX)) return decryptGcm(text);
    if (text.startsWith(CBC_PREFIX)) return decryptLegacyCbc(text);
  } catch (err) {
    console.warn('Decryption warning:', err.message);
  }
  return text; // plain / unknown => returned as-is (legacy unencrypted rows)
}

function isEncrypted(text) {
  return typeof text === 'string' && (text.startsWith(GCM_PREFIX) || text.startsWith(CBC_PREFIX));
}

module.exports = { encryptData, decryptData, isEncrypted };
