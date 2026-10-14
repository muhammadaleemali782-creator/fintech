const test = require('node:test');
const assert = require('node:assert');

process.env.JWT_SECRET = process.env.JWT_SECRET || 'j'.repeat(48);
const jwt = require('jsonwebtoken');
const { signAuthToken } = require('../utils/token');

const hours = (user, opts) => {
  const t = jwt.decode(signAuthToken({ _id: '507f1f77bcf86cd799439011', tokenVersion: 0, ...user }, opts));
  return (t.exp - t.iat) / 3600;
};

test('admin tokens last 24h and cannot be stretched by rememberMe / expiresIn', () => {
  assert.strictEqual(hours({ role: 'admin' }, {}), 24);
  assert.strictEqual(hours({ role: 'admin' }, { rememberMe: true }), 24);
  assert.strictEqual(hours({ role: 'admin' }, { expiresIn: '365d' }), 24);
});

test('staff tokens last 12h regardless of options', () => {
  assert.strictEqual(hours({ role: 'staff' }, {}), 12);
  assert.strictEqual(hours({ role: 'staff' }, { rememberMe: true, expiresIn: '30d' }), 12);
});

test('customers and agents keep 30d sessions', () => {
  assert.strictEqual(hours({ role: 'user' }, {}), 24 * 30);
  assert.strictEqual(hours({ role: 'agent' }, { rememberMe: true }), 24 * 30);
});
