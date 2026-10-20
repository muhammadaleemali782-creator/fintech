const { test, describe } = require('node:test');
const assert = require('node:assert/strict');

// Replicate core bond logic for pure unit testing without DB dependency
function calculateBondTerms(bondType, amount = 25000) {
  const principal = Math.max(25000, Math.floor(Number(amount) || 25000));
  const now = new Date();

  if (bondType === 'bond_25') {
    const returnAmount = Math.round(principal * 1.40);
    const maturityDate = new Date(now);
    maturityDate.setMonth(maturityDate.getMonth() + 25);
    return {
      bondType,
      principalAmount: principal,
      returnAmount,
      monthlyPayout: 0,
      tenureDays: 25 * 30,
      tenureMonths: 25,
      startDate: now,
      maturityDate,
      nextPayoutDate: maturityDate
    };
  }

  if (bondType === 'bond_50') {
    const returnAmount = Math.round(principal * 2.00);
    const maturityDate = new Date(now);
    maturityDate.setMonth(maturityDate.getMonth() + 50);
    return {
      bondType,
      principalAmount: principal,
      returnAmount,
      monthlyPayout: 0,
      tenureDays: 50 * 30,
      tenureMonths: 50,
      startDate: now,
      maturityDate,
      nextPayoutDate: maturityDate
    };
  }

  if (bondType === 'lending_40') {
    const returnAmount = Math.round(principal * 1.40);
    const monthlyPayout = Math.round((principal * 1.40) / 40);
    const maturityDate = new Date(now);
    maturityDate.setMonth(maturityDate.getMonth() + 40);
    const nextPayoutDate = new Date(now);
    nextPayoutDate.setDate(nextPayoutDate.getDate() + 30);
    return {
      bondType,
      principalAmount: principal,
      returnAmount,
      monthlyPayout,
      tenureDays: 40 * 30,
      tenureMonths: 40,
      startDate: now,
      maturityDate,
      nextPayoutDate
    };
  }

  if (bondType === 'lending_80') {
    const returnAmount = Math.round(principal * 2.00);
    const monthlyPayout = Math.round((principal * 2.00) / 80);
    const maturityDate = new Date(now);
    maturityDate.setMonth(maturityDate.getMonth() + 80);
    const nextPayoutDate = new Date(now);
    nextPayoutDate.setDate(nextPayoutDate.getDate() + 30);
    return {
      bondType,
      principalAmount: principal,
      returnAmount,
      monthlyPayout,
      tenureDays: 80 * 30,
      tenureMonths: 80,
      startDate: now,
      maturityDate,
      nextPayoutDate
    };
  }

  throw new Error('Invalid bond type');
}

function calculateEarlyStopRefund(principalAmount, monthlyPayout, payoutsCompleted) {
  const totalPaidOut = Math.round(monthlyPayout * payoutsCompleted);
  return {
    totalPaidOut,
    refundAmount: Math.max(0, principalAmount - totalPaidOut)
  };
}

describe('Fixed Wealth Bonds & Monthly Lending Terms Calculation', () => {
  test('25 Months Bond: 1 Lakh yields 1.40 Lakh lump sum', () => {
    const terms = calculateBondTerms('bond_25', 100000);
    assert.equal(terms.principalAmount, 100000);
    assert.equal(terms.returnAmount, 140000);
    assert.equal(terms.monthlyPayout, 0);
    assert.equal(terms.tenureMonths, 25);
  });

  test('50 Months Bond: 1 Lakh yields 2.00 Lakh lump sum (2x Double)', () => {
    const terms = calculateBondTerms('bond_50', 100000);
    assert.equal(terms.principalAmount, 100000);
    assert.equal(terms.returnAmount, 200000);
    assert.equal(terms.monthlyPayout, 0);
    assert.equal(terms.tenureMonths, 50);
  });

  test('40 Months Lending: 1 Lakh yields 1.40 Lakh total @ 3,500/mo', () => {
    const terms = calculateBondTerms('lending_40', 100000);
    assert.equal(terms.principalAmount, 100000);
    assert.equal(terms.returnAmount, 140000);
    assert.equal(terms.monthlyPayout, 3500);
    assert.equal(terms.tenureMonths, 40);
    assert.equal(terms.monthlyPayout * 40, terms.returnAmount);
  });

  test('80 Months Lending: 1 Lakh yields 2.00 Lakh total @ 2,500/mo', () => {
    const terms = calculateBondTerms('lending_80', 100000);
    assert.equal(terms.principalAmount, 100000);
    assert.equal(terms.returnAmount, 200000);
    assert.equal(terms.monthlyPayout, 2500);
    assert.equal(terms.tenureMonths, 80);
    assert.equal(terms.monthlyPayout * 80, terms.returnAmount);
  });

  test('Minimum deposit boundary of ₹25,000 enforced for all plans', () => {
    const b25 = calculateBondTerms('bond_25', 5000); // requested less than min
    assert.equal(b25.principalAmount, 25000);
    assert.equal(b25.returnAmount, 35000);

    const b50 = calculateBondTerms('bond_50', 10000);
    assert.equal(b50.principalAmount, 25000);
    assert.equal(b50.returnAmount, 50000);

    const l40 = calculateBondTerms('lending_40', 25000);
    assert.equal(l40.principalAmount, 25000);
    assert.equal(l40.returnAmount, 35000);
    assert.equal(l40.monthlyPayout, 875);
    assert.equal(l40.monthlyPayout * 40, 35000);

    const l80 = calculateBondTerms('lending_80', 25000);
    assert.equal(l80.principalAmount, 25000);
    assert.equal(l80.returnAmount, 50000);
    assert.equal(l80.monthlyPayout, 625);
    assert.equal(l80.monthlyPayout * 80, 50000);
  });

  test('Flexible arbitrary amounts above ₹25,000 calculate proportionally', () => {
    const custom40 = calculateBondTerms('lending_40', 50000);
    assert.equal(custom40.principalAmount, 50000);
    assert.equal(custom40.returnAmount, 70000);
    assert.equal(custom40.monthlyPayout, 1750);

    const custom80 = calculateBondTerms('lending_80', 50000);
    assert.equal(custom80.principalAmount, 50000);
    assert.equal(custom80.returnAmount, 100000);
    assert.equal(custom80.monthlyPayout, 1250);
  });
});

describe('Lending Early Stop / Lock-in Exit Formula', () => {
  test('User gets remaining principal back if total paid out < principal (User Example: 1L deposited, 30k received => 70k refund)', () => {
    const res = calculateEarlyStopRefund(100000, 3000, 10);
    assert.equal(res.totalPaidOut, 30000);
    assert.equal(res.refundAmount, 70000);
  });

  test('40 Months Plan: 1L deposited, 10 months received @ 3,500/mo (35k received) => 65k refund', () => {
    const res = calculateEarlyStopRefund(100000, 3500, 10);
    assert.equal(res.totalPaidOut, 35000);
    assert.equal(res.refundAmount, 65000);
  });

  test('User gets 0 additional refund if total paid out >= principal (User Example: 1.3L received on 1L deposit)', () => {
    const res = calculateEarlyStopRefund(100000, 3500, 38);
    assert.equal(res.totalPaidOut, 133000);
    assert.equal(res.refundAmount, 0);
  });

  test('Immediate early exit with 0 payouts gives 100% principal refund', () => {
    const res = calculateEarlyStopRefund(100000, 3500, 0);
    assert.equal(res.totalPaidOut, 0);
    assert.equal(res.refundAmount, 100000);
  });

  test('₹25k min lending plan early exit math', () => {
    const res = calculateEarlyStopRefund(25000, 875, 10);
    assert.equal(res.totalPaidOut, 8750);
    assert.equal(res.refundAmount, 16250);
  });
});
