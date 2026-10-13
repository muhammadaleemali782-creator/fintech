const jwt = require('jsonwebtoken');

/**
 * Generates signed JWT token with tokenVersion (tv) payload for session revocation
 */
function signAuthToken(user, options = {}) {
  const isStaff = user.role === 'staff';
  // Staff tokens expire in 12h for security; Customer & Admin retain 7-30d persistent access
  const defaultExpiry = isStaff ? '12h' : (options.rememberMe ? '30d' : (options.expiresIn || '30d'));
  const expiresIn = options.expiresIn || defaultExpiry;

  const payload = {
    id: user._id,
    tv: typeof user.tokenVersion === 'number' ? user.tokenVersion : 0,
    role: user.role
  };

  if (options.loginMethod) {
    payload.loginMethod = options.loginMethod;
  }

  return jwt.sign(payload, process.env.JWT_SECRET, {
    expiresIn,
    algorithm: 'HS256'
  });
}

/**
 * Sets secure httpOnly cookie on response
 */
function setAuthCookie(res, token, days = 30) {
  res.cookie('token', token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: days * 24 * 60 * 60 * 1000
  });
}

function verifyAuthToken(token) {
  return jwt.verify(token, process.env.JWT_SECRET);
}

module.exports = {
  signAuthToken,
  verifyAuthToken,
  setAuthCookie
};
