const mongoose = require('mongoose');
const Settings = require('../models/Settings');
const memoryCache = require('./cache');

const DEFAULT_PREMIUM_SETTINGS = {
  commissionAmount: 30, // ₹30 one-time
  balanceThreshold: 5000, // ₹5,000 wallet maintenance
  holdDays: 30, // 30 days (0 for instant testing)
  premiumInterestRate: 10, // 10%
  normalInterestRate: 12, // 12%
  offers: 'Instant ₹10,000 Loan Access & 10% Special Interest Rate'
};

const CACHE_KEY = 'premium_settings';
const CACHE_TTL_SECONDS = 300; // 5 minutes cache (zero DB query overhead)

/**
 * Get current premium settings from in-memory cache or DB
 */
async function getPremiumSettings() {
  const cached = memoryCache.get(CACHE_KEY);
  if (cached) return cached;

  try {
    const doc = await Settings.findOne({ key: 'premiumSettings' }).lean();
    const settings = doc?.value ? { ...DEFAULT_PREMIUM_SETTINGS, ...doc.value } : DEFAULT_PREMIUM_SETTINGS;
    memoryCache.set(CACHE_KEY, settings, CACHE_TTL_SECONDS);
    return settings;
  } catch (err) {
    console.error('getPremiumSettings error:', err.message);
    return DEFAULT_PREMIUM_SETTINGS;
  }
}

/**
 * Update premium settings and invalidate in-memory cache
 */
async function updatePremiumSettings(newSettings) {
  const merged = { ...DEFAULT_PREMIUM_SETTINGS, ...(newSettings || {}) };

  // Validate numeric ranges
  merged.commissionAmount = Math.max(0, Number(merged.commissionAmount) || 0);
  merged.balanceThreshold = Math.max(0, Number(merged.balanceThreshold) || 0);
  merged.holdDays = Math.max(0, Number(merged.holdDays) || 0);
  merged.premiumInterestRate = Math.max(1, Math.min(100, Number(merged.premiumInterestRate) || 10));
  merged.normalInterestRate = Math.max(1, Math.min(100, Number(merged.normalInterestRate) || 12));
  merged.offers = (merged.offers || '').toString().trim();

  await Settings.findOneAndUpdate(
    { key: 'premiumSettings' },
    { key: 'premiumSettings', value: merged, updatedAt: new Date() },
    { upsert: true, new: true }
  );

  memoryCache.set(CACHE_KEY, merged, CACHE_TTL_SECONDS);
  return merged;
}

/**
 * Lazy evaluation of user's premium status and referral commission
 * Triggered on: wallet updates (deposit/transfer/payout), user login, app open (/me /bootstrap)
 * No cron, zero background worker load.
 */
async function checkAndUpdatePremiumStatus(userOrDoc) {
  if (!userOrDoc) return null;
  const User = mongoose.model('User');

  const settings = await getPremiumSettings();
  const threshold = Number(settings.balanceThreshold) || 5000;
  const holdDays = Number(settings.holdDays) >= 0 ? Number(settings.holdDays) : 30;
  const commissionAmt = Number(settings.commissionAmount) || 30;

  // Resolve user document
  let user = userOrDoc;
  if (!user._id || typeof user.balance !== 'number' || typeof user.save !== 'function') {
    const userId = user._id || user;
    user = await User.findById(userId);
    if (!user) return null;
  }

  const curBalance = Number(user.balance) || 0;
  let changed = false;

  // Case 1: Balance dropped below threshold -> Reset holdSince if user has not achieved premium yet
  if (curBalance < threshold) {
    if (!user.isPremium && user.holdSince !== null) {
      user.holdSince = null;
      changed = true;
    }
  } else {
    // Case 2: Balance >= threshold
    if (!user.holdSince) {
      user.holdSince = new Date();
      changed = true;
    }

    // Check if hold duration met
    if (user.holdSince && !user.isPremium) {
      const msHeld = Date.now() - new Date(user.holdSince).getTime();
      const daysHeld = msHeld / (1000 * 60 * 60 * 24);

      if (daysHeld >= holdDays) {
        user.isPremium = true;
        changed = true;

        // Atomically pay one-time referral commission if user was referred by agent & commission unpaid
        if (user.referredBy && !user.commissionPaid) {
          // Double payment impossible: Single atomic findOneAndUpdate requiring commissionPaid === false
          const claimedUser = await User.findOneAndUpdate(
            { _id: user._id, referredBy: { $ne: null }, commissionPaid: false },
            { $set: { commissionPaid: true, isPremium: true } },
            { new: true }
          );

          if (claimedUser) {
            user.commissionPaid = true;

            // Credit active agent (skip if agent is blocked or inactive)
            const agent = await User.findOne({ _id: claimedUser.referredBy, isBlocked: { $ne: true } });
            if (agent && agent._id.toString() !== user._id.toString()) {
              await User.findByIdAndUpdate(agent._id, {
                $inc: {
                  referralEarnings: commissionAmt,
                  balance: commissionAmt,
                  profitBalance: commissionAmt,
                  'agentProfile.earningsBreakdown.loan': commissionAmt
                }
              });
            }
          }
        }
      }
    }
  }

  if (changed && typeof user.save === 'function') {
    await user.save();
  }

  return user;
}

module.exports = {
  DEFAULT_PREMIUM_SETTINGS,
  getPremiumSettings,
  updatePremiumSettings,
  checkAndUpdatePremiumStatus
};
