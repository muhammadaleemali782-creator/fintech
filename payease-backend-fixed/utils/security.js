const crypto = require('crypto');

/** Escape user text before it goes into a RegExp / $regex (prevents regex injection + ReDoS). */
function escapeRegex(input, maxLen = 64) {
  return String(input == null ? '' : input)
    .slice(0, maxLen)
    .replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** Constant-time string comparison (tokens, PIN hashes). */
function safeEqual(a, b) {
  const x = Buffer.from(String(a == null ? '' : a));
  const y = Buffer.from(String(b == null ? '' : b));
  if (x.length !== y.length) {
    // still burn the same amount of time, then fail
    crypto.timingSafeEqual(x, x);
    return false;
  }
  return crypto.timingSafeEqual(x, y);
}

/** Short, non-reversible id of a bearer token (used as a rate-limit bucket key). */
function tokenBucket(req) {
  const h = req.headers && req.headers.authorization;
  if (typeof h === 'string' && h.startsWith('Bearer ') && h.length > 24) {
    return 't:' + crypto.createHash('sha1').update(h.slice(7)).digest('hex').slice(0, 20);
  }
  return null;
}

module.exports = { escapeRegex, safeEqual, tokenBucket };
