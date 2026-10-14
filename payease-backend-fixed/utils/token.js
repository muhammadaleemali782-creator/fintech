const jwt = require('jsonwebtoken');

const PRIVILEGED_EXPIRY = { admin: '24h', staff: '12h' };

/**
 * Generates signed JWT token with tokenVersion (tv) payload for session revocation
 */
function signAuthToken(user, options = {}) {
  const isStaff = user.role === 'staff';
  const isAdmin = user.role === 'admin';
  // Privileged roles get SHORT sessions and cannot be stretched by rememberMe / options.expiresIn:
  //   admin = 24h, staff = 12h.  Customers & agents keep persistent 7-30d access.
  let expiresIn;
  if (isAdmin) expiresIn = PRIVILEGED_EXPIRY.admin;
  else if (isStaff) expiresIn = PRIVILEGED_EXPIRY.staff;
  else expiresIn = options.expiresIn || '30d';

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
  return jwt.verify(token, process.env.JWT_SECRET, { algorithms: ['HS256'] });
}

module.exports = {
  PRIVILEGED_EXPIRY,
  signAuthToken,
  verifyAuthToken,
  setAuthCookie
};
