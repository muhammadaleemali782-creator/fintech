const User = require('../models/User');

const PIN_MAX_FAILS = 5;
const PIN_LOCK_MS = 30 * 60 * 1000;      // 30 min
const LOGIN_MAX_FAILS = 10;
const LOGIN_LOCK_MS = 15 * 60 * 1000;    // 15 min

const CONFIG = {
  pin:   { count: 'pinFailCount',   until: 'pinLockedUntil',   max: PIN_MAX_FAILS,   ms: PIN_LOCK_MS },
  login: { count: 'loginFailCount', until: 'loginLockedUntil', max: LOGIN_MAX_FAILS, ms: LOGIN_LOCK_MS }
};

/** Returns remaining lock time in minutes (0 if not locked). Works on any user doc/object. */
function lockedMinutes(user, kind) {
  const c = CONFIG[kind];
  const until = user && user[c.until];
  if (!until) return 0;
  const ms = new Date(until).getTime() - Date.now();
  return ms > 0 ? Math.ceil(ms / 60000) : 0;
}

/**
 * Atomically record a failed attempt. When the limit is reached the account is locked
 * and the counter is reset. Returns { locked, attemptsLeft, minutes }.
 */
async function registerFailure(userId, kind) {
  const c = CONFIG[kind];
  const updated = await User.findByIdAndUpdate(
    userId,
    { $inc: { [c.count]: 1 } },
    { new: true }
  ).select(c.count);
  const fails = (updated && updated[c.count]) || 1;
  if (fails >= c.max) {
    await User.updateOne(
      { _id: userId },
      { $set: { [c.until]: new Date(Date.now() + c.ms), [c.count]: 0 } }
    );
    return { locked: true, attemptsLeft: 0, minutes: Math.ceil(c.ms / 60000) };
  }
  return { locked: false, attemptsLeft: c.max - fails, minutes: 0 };
}

/** Clear the counter after a successful attempt. */
async function registerSuccess(userId, kind) {
  const c = CONFIG[kind];
  await User.updateOne(
    { _id: userId, $or: [{ [c.count]: { $gt: 0 } }, { [c.until]: { $ne: null } }] },
    { $set: { [c.count]: 0, [c.until]: null } }
  );
}

module.exports = { lockedMinutes, registerFailure, registerSuccess };
