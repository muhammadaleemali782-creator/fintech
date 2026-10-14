/**
 * Integration tests for the money-safety fixes (race conditions, PIN lockout, locks).
 * They need a MongoDB. Set TEST_MONGO_URI to a THROWAWAY database whose name contains "test":
 *
 *     TEST_MONGO_URI="mongodb://127.0.0.1:27017/educa_test" npm test
 *
 * Without TEST_MONGO_URI these tests are skipped.
 */
const test = require('node:test');
const assert = require('node:assert');

const URI = process.env.TEST_MONGO_URI;
if (!URI) {
  test('db tests skipped (set TEST_MONGO_URI to run)', { skip: true }, () => {});
  return;
}
if (!/test/i.test(URI)) throw new Error('Refusing to run: TEST_MONGO_URI database name must contain "test"');

process.env.JWT_SECRET = process.env.JWT_SECRET || 'j'.repeat(48);
process.env.ENCRYPTION_KEY = process.env.ENCRYPTION_KEY || 'e'.repeat(48);
require('express-async-errors');

const mongoose = require('mongoose');
const express = require('express');
const bcrypt = require('bcryptjs');
const User = require('../models/User');
const Lock = require('../models/Lock');
const { signAuthToken } = require('../utils/token');
const { acquireLock } = require('../utils/lock');

let server, base;
const created = [];

async function makeUser(extra = {}) {
  const n = Math.random().toString(36).slice(2, 10);
  const u = await User.create({
    name: 'Test ' + n,
    email: `t_${n}@test.local`,
    phone: '9' + String(Math.floor(Math.random() * 1e9)).padStart(9, '0'),
    password: await bcrypt.hash('Password123', 4),
    ...extra
  });
  created.push(u._id);
  return u;
}

test.before(async () => {
  await mongoose.connect(URI);
  await Lock.init();
  const app = express();
  app.use(express.json());
  app.use('/api/user', require('../routes/user'));
  app.use((err, req, res, next) => res.status(err.status || 500).json({ message: err.message }));
  await new Promise(r => { server = app.listen(0, r); });
  base = `http://127.0.0.1:${server.address().port}/api/user`;
});

test.after(async () => {
  await User.deleteMany({ _id: { $in: created } });
  await Lock.deleteMany({ key: /^test:/ });
  server && server.close();
  await mongoose.disconnect();
});

const post = (path, token, body = {}) => fetch(base + path, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
  body: JSON.stringify(body)
});

test('profit -> wallet: 10 parallel requests move the money exactly once', async () => {
  const u = await makeUser({ balance: 1000, profitBalance: 50 });
  const token = signAuthToken(u);
  const results = await Promise.all(Array.from({ length: 10 }, () => post('/transfer-profit-to-wallet', token)));
  const ok = results.filter(r => r.status === 200).length;
  assert.strictEqual(ok, 1, 'exactly one request may succeed');
  const after = await User.findById(u._id);
  assert.ok(after.balance >= 1049.99 && after.balance < 1051, `balance was ${after.balance}`);
  assert.ok(after.profitBalance < 0.5, `profit left ${after.profitBalance}`);
});

test('PIN locks after 5 wrong attempts, and the right PIN is refused while locked', async () => {
  const u = await makeUser({ walletPin: await bcrypt.hash('123456', 4) });
  const token = signAuthToken(u);
  let last;
  for (let i = 0; i < 5; i++) last = await post('/pin/verify', token, { pin: '000000' });
  assert.strictEqual(last.status, 429);
  const good = await post('/pin/verify', token, { pin: '123456' });
  assert.strictEqual(good.status, 429);
});

test('PIN reset is refused when no Aadhaar is on record (old code accepted any number)', async () => {
  const u = await makeUser({ phone: '9876543210', walletPin: await bcrypt.hash('123456', 4) });
  const token = signAuthToken(u);
  const r = await post('/pin/reset', token, { phone: '9876543210', aadharNumber: '123412341234', newPin: '654321' });
  assert.strictEqual(r.status, 400);
  const after = await User.findById(u._id);
  assert.ok(await bcrypt.compare('123456', after.walletPin), 'PIN must be unchanged');
});

test('acquireLock: second caller is refused until the lock expires', async () => {
  const key = 'test:' + Math.random();
  assert.strictEqual(await acquireLock(key, 300), true);
  assert.strictEqual(await acquireLock(key, 300), false);
  await new Promise(r => setTimeout(r, 400));
  assert.strictEqual(await acquireLock(key, 300), true);
});

test('acquireLock: of 20 simultaneous callers exactly one wins', async () => {
  const key = 'test:' + Math.random();
  const res = await Promise.all(Array.from({ length: 20 }, () => acquireLock(key, 5000)));
  assert.strictEqual(res.filter(Boolean).length, 1);
});
