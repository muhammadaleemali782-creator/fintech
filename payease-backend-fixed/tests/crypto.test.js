const test = require('node:test');
const assert = require('node:assert');
const crypto = require('crypto');

process.env.JWT_SECRET = 'j'.repeat(48);
process.env.ENCRYPTION_KEY = 'e'.repeat(48);
const { encryptData, decryptData, isEncrypted } = require('../utils/cryptoHelper');

// The OLD (previous version) encryption, reproduced here to prove old DB rows still decrypt.
function legacyEncrypt(text, secret) {
  const key = crypto.createHash('sha256').update(String(secret)).digest();
  const iv = crypto.randomBytes(16);
  const c = crypto.createCipheriv('aes-256-cbc', key, iv);
  let enc = c.update(text, 'utf8', 'base64');
  enc += c.final('base64');
  return `enc::${iv.toString('hex')}::${enc}`;
}

test('GCM round trip', () => {
  const plain = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAA';
  const enc = encryptData(plain);
  assert.ok(enc.startsWith('enc2::'));
  assert.ok(isEncrypted(enc));
  assert.strictEqual(decryptData(enc), plain);
});

test('encrypting twice does not double-encrypt', () => {
  const once = encryptData('hello');
  assert.strictEqual(encryptData(once), once);
});

test('tampered GCM ciphertext is rejected (not silently decrypted)', () => {
  const enc = encryptData('secret value');
  const parts = enc.split('::');
  const data = Buffer.from(parts[3], 'base64');
  data[0] ^= 0xff;
  parts[3] = data.toString('base64');
  const tampered = parts.join('::');
  // decryptData never throws; on auth failure it returns the input unchanged, never the plaintext
  assert.notStrictEqual(decryptData(tampered), 'secret value');
});

test('legacy rows encrypted with JWT_SECRET still decrypt', () => {
  const legacy = legacyEncrypt('old kyc doc', process.env.JWT_SECRET);
  assert.strictEqual(decryptData(legacy), 'old kyc doc');
});

test('legacy rows encrypted with the old hardcoded key still decrypt', () => {
  const legacy = legacyEncrypt('older kyc doc', 'payease-secret-encryption-key-32-chars-min');
  assert.strictEqual(decryptData(legacy), 'older kyc doc');
});

test('plain (never encrypted) values pass through', () => {
  assert.strictEqual(decryptData('just text'), 'just text');
  assert.strictEqual(decryptData(''), '');
  assert.strictEqual(decryptData(null), null);
});
