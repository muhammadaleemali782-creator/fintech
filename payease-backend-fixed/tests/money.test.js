/**
 * Money-path integration tests: wallet transfers + daily yield.
 *
 * Needs a MongoDB **replica set** (transfers use multi-document transactions, which a plain
 * standalone `mongod` rejects). A free Atlas test cluster works, or locally:
 *     mongod --replSet rs0 --dbpath /tmp/rs0 &   &&   mongosh --eval 'rs.initiate()'
 *
 *     TEST_MONGO_URI="mongodb://127.0.0.1:27017/educa_test?replicaSet=rs0" npm test
 *
 * The database name MUST contain "test". Without TEST_MONGO_URI these tests are skipped.
 */
const test = require('node:test');
const assert = require('node:assert');

const URI = process.env.TEST_MONGO_URI;
if (!URI) {
  test('money tests skipped (set TEST_MONGO_URI to run)', { skip: true }, () => {});
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
const Transaction = require('../models/Transaction');
const { signAuthToken } = require('../utils/token');

let server, base;
const created = [];

async function makeUser(extra = {}) {
  const n = Math.random().toString(36).slice(2, 10);
  const u = await User.create({
    name: 'Test ' + n,
    email: `m_${n}@test.local`,
    phone: '9' + String(Math.floor(Math.random() * 1e9)).padStart(9, '0'),
    password: await bcrypt.hash('Password123', 4),
    ...extra
  });
  created.push(u._id);
  return u;
}

const kycUser = async (extra = {}) =>
  makeUser({ kycStatus: 'verified', walletPin: await bcrypt.hash('123456', 4), ...extra });

test.before(async () => {
  await mongoose.connect(URI);
  await Lock.init();
  const app = express();
  app.use(express.json());
  app.use('/api/transaction', require('../routes/transaction'));
  app.use((err, req, res, next) => res.status(err.status || 500).json({ message: err.message }));
  await new Promise(r => { server = app.listen(0, r); });
  base = `http://127.0.0.1:${server.address().port}/api/transaction`;
});

test.after(async () => {
  await Transaction.deleteMany({ userId: { $in: created } });
  await User.deleteMany({ _id: { $in: created } });
  await Lock.deleteMany({ key: /^transfer:/ });
  server && server.close();
  await mongoose.disconnect();
});

const transfer = (sender, body) => fetch(base + '/transfer', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${signAuthToken(sender)}` },
  body: JSON.stringify({ pin: '123456', ...body })
});

// ---------------------------------------------------------------- transfers

test('transfer: 10 parallel DIFFERENT-amount transfers can never overdraw, and money is conserved', async () => {
  const sender = await kycUser({ balance: 100 });
  const receiver = await kycUser({ balance: 0 });
  // distinct amounts so the 6-second duplicate-tap lock does not short-circuit the race
  const amounts = [31, 32, 33, 34, 35, 36, 37, 38, 39, 40];
  const results = await Promise.all(amounts.map(a => transfer(sender, { recipient: receiver.phone, amount: a })));

  const okAmounts = amounts.filter((_, i) => results[i].status === 200);
  const spent = okAmounts.reduce((s, a) => s + a, 0);
  const s = await User.findById(sender._id);
  const r = await User.findById(receiver._id);

  assert.ok(okAmounts.length >= 1 && okAmounts.length <= 3, `succeeded: ${okAmounts.length}`);
  assert.ok(s.balance >= 0, `sender balance went negative: ${s.balance}`);
  assert.strictEqual(s.balance, 100 - spent, 'sender lost exactly what succeeded');
  assert.strictEqual(r.balance, spent, 'receiver gained exactly what sender lost');
  assert.strictEqual(await Transaction.countDocuments({ userId: sender._id, type: 'transfer_sent' }), okAmounts.length);
  assert.strictEqual(await Transaction.countDocuments({ userId: receiver._id, type: 'transfer_received' }), okAmounts.length);
});

test('transfer: identical rapid taps are de-duplicated (only one goes through)', async () => {
  const sender = await kycUser({ balance: 1000 });
  const receiver = await kycUser({ balance: 0 });
  const results = await Promise.all(Array.from({ length: 6 }, () => transfer(sender, { recipient: receiver.phone, amount: 50 })));
  assert.strictEqual(results.filter(r => r.status === 200).length, 1);
  assert.strictEqual((await User.findById(sender._id)).balance, 950);
  assert.strictEqual((await User.findById(receiver._id)).balance, 50);
});

test('transfer: wrong PIN, missing KYC, insufficient funds, self-transfer and bad amounts all leave balances untouched', async () => {
  const sender = await kycUser({ balance: 500 });
  const receiver = await kycUser({ balance: 0 });
  const noKyc = await makeUser({ balance: 500, walletPin: await bcrypt.hash('123456', 4) }); // kycStatus: none

  assert.strictEqual((await transfer(sender, { recipient: receiver.phone, amount: 10, pin: '000000' })).status, 400);
  assert.strictEqual((await transfer(noKyc, { recipient: receiver.phone, amount: 10 })).status, 403);
  assert.strictEqual((await transfer(sender, { recipient: receiver.phone, amount: 501 })).status, 400); // > balance
  assert.strictEqual((await transfer(sender, { recipient: sender.phone, amount: 10 })).status, 400);    // self
  for (const bad of [0, -5, 1.5, 200001, 'abc', null]) {
    assert.strictEqual((await transfer(sender, { recipient: receiver.phone, amount: bad })).status, 400, `amount ${bad}`);
  }
  assert.strictEqual((await User.findById(sender._id)).balance, 500);
  assert.strictEqual((await User.findById(noKyc._id)).balance, 500);
  assert.strictEqual((await User.findById(receiver._id)).balance, 0);
});

test('transfer: profit wallet source is guarded the same way', async () => {
  const sender = await kycUser({ balance: 0, profitBalance: 60 });
  const receiver = await kycUser({ balance: 0 });
  const results = await Promise.all([41, 42, 43].map(a =>
    transfer(sender, { recipient: receiver.phone, amount: a, sourceWallet: 'profit' })));
  const ok = [41, 42, 43].filter((_, i) => results[i].status === 200);
  const s = await User.findById(sender._id);
  assert.strictEqual(ok.length, 1, 'only one of three can fit in 60');
  assert.ok(s.profitBalance >= 0);
  assert.strictEqual(s.profitBalance, 60 - ok[0]);
});

// ---------------------------------------------------------------- daily yield

test('yield: credits roughly balance x rate x elapsed time (10% p.a., 12h on 36,500 = ~5.00)', async () => {
  const { processDailyYield } = require('../routes/user');
  const u = await makeUser({ balance: 36500, interestRate: 10, profitBalance: 0, lastYieldCalculatedAt: new Date(Date.now() - 12 * 3600 * 1000) });
  const after = await processDailyYield(await User.findById(u._id));
  assert.ok(Math.abs(after.profitBalance - 5) < 0.05, `profitBalance was ${after.profitBalance}`);
  assert.strictEqual(after.balance, 36500, 'principal must not change');
});

test('yield: 10 parallel settlements of the same period credit it exactly once', async () => {
  const { processDailyYield } = require('../routes/user');
  const u = await makeUser({ balance: 36500, interestRate: 10, profitBalance: 0, lastYieldCalculatedAt: new Date(Date.now() - 12 * 3600 * 1000) });
  const stale = await User.findById(u._id); // every caller starts from the same stale snapshot
  await Promise.all(Array.from({ length: 10 }, () => processDailyYield(stale)));
  const after = await User.findById(u._id);
  assert.ok(after.profitBalance > 4.9 && after.profitBalance < 5.1, `double credit! profitBalance was ${after.profitBalance}`);
});

test('yield: admins and zero-balance users earn nothing', async () => {
  const { processDailyYield } = require('../routes/user');
  const old = new Date(Date.now() - 48 * 3600 * 1000);
  const admin = await makeUser({ role: 'admin', balance: 36500, profitBalance: 0, lastYieldCalculatedAt: old });
  const empty = await makeUser({ balance: 0, profitBalance: 0, lastYieldCalculatedAt: old });
  assert.strictEqual((await processDailyYield(await User.findById(admin._id))).profitBalance, 0);
  assert.strictEqual((await processDailyYield(await User.findById(empty._id))).profitBalance, 0);
});
