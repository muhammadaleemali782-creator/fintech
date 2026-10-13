const crypto = require('crypto');

const ALGORITHM = 'aes-256-cbc';
const SECRET = process.env.ENCRYPTION_KEY || process.env.JWT_SECRET || 'payease-secret-encryption-key-32-chars-min';
// Derive a 32-byte key using sha256
const KEY = crypto.createHash('sha256').update(String(SECRET)).digest();

/**
 * Encrypt sensitive text or base64 documents with AES-256-CBC
 * @param {string} text
 * @returns {string}
 */
function encryptData(text) {
  if (!text || typeof text !== 'string') return text;
  if (text.startsWith('enc::')) return text; // already encrypted
  try {
    const iv = crypto.randomBytes(16);
    const cipher = crypto.createCipheriv(ALGORITHM, KEY, iv);
    let encrypted = cipher.update(text, 'utf8', 'base64');
    encrypted += cipher.final('base64');
    return `enc::${iv.toString('hex')}::${encrypted}`;
  } catch (err) {
    console.warn('Encryption warning:', err.message);
    return text;
  }
}

/**
 * Decrypt AES-256-CBC encrypted string. Legacy/unencrypted data returns as-is.
 * @param {string} text
 * @returns {string}
 */
function decryptData(text) {
  if (!text || typeof text !== 'string') return text;
  if (!text.startsWith('enc::')) return text; // plain unencrypted string
  try {
    const parts = text.split('::');
    if (parts.length !== 3) return text;
    const iv = Buffer.from(parts[1], 'hex');
    const encryptedText = parts[2];
    const decipher = crypto.createDecipheriv(ALGORITHM, KEY, iv);
    let decrypted = decipher.update(encryptedText, 'base64', 'utf8');
    decrypted += decipher.final('utf8');
    return decrypted;
  } catch (err) {
    console.warn('Decryption warning:', err.message);
    return text;
  }
}

/**
 * Check if text is encrypted
 * @param {string} text
 * @returns {boolean}
 */
function isEncrypted(text) {
  return typeof text === 'string' && text.startsWith('enc::');
}

module.exports = { encryptData, decryptData, isEncrypted };
