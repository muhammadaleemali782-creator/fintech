const test = require('node:test');
const assert = require('node:assert');

process.env.JWT_SECRET = process.env.JWT_SECRET || 'j'.repeat(48);
const jwt = require('jsonwebtoken');
const { signAuthToken } = require('../utils/token');

const hours = (user, opts) => {
  const t = jwt.decode(signAuthToken({ _id: '507f1f77bcf86cd799439011', tokenVersion: 0, ...user }, opts));
  return (t.exp - t.iat) / 3600;
};

test('admin tokens default to 30d and respect rememberMe', () => {
  assert.strictEqual(hours({ role: 'admin' }, {}), 24 * 30);
  assert.strictEqual(hours({ role: 'admin' }, { rememberMe: true }), 24 * 30);
});

test('staff tokens default to 7d and support rememberMe 14d', () => {
  assert.strictEqual(hours({ role: 'staff' }, {}), 24 * 7);
  assert.strictEqual(hours({ role: 'staff' }, { rememberMe: true }), 24 * 14);
});

test('customers and agents keep persistent sessions', () => {
  assert.strictEqual(hours({ role: 'user' }, {}), 24 * 7);
  assert.strictEqual(hours({ role: 'agent' }, { rememberMe: true }), 24 * 30);
});
