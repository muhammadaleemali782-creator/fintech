const Lock = require('../models/Lock');

/**
 * Try to acquire a lock. Returns true if acquired, false if somebody else holds it.
 * Safe across multiple instances (unique index on `key`).
 */
async function acquireLock(key, ttlMs = 30000) {
  const now = new Date();
  const expiresAt = new Date(now.getTime() + ttlMs);
  try {
    const doc = await Lock.findOneAndUpdate(
      { key, expiresAt: { $lte: now } },        // only matches if missing-or-expired...
      { $set: { expiresAt } },
      { upsert: true, new: true }               // ...missing => insert; live lock => dup-key error
    );
    return !!doc;
  } catch (err) {
    if (err && err.code === 11000) return false; // live lock exists
    throw err;
  }
}

async function releaseLock(key) {
  try { await Lock.deleteOne({ key }); } catch (_) { /* best effort */ }
}

module.exports = { acquireLock, releaseLock };
