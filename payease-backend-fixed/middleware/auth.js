const jwt = require('jsonwebtoken');
const User = require('../models/User');

exports.protect = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    let token = null;

    if (authHeader && authHeader.startsWith('Bearer ')) {
      token = authHeader.split(' ')[1];
    } else if (req.cookies && req.cookies.token) {
      token = req.cookies.token;
    }

    if (!token) return res.status(401).json({ message: 'Not authorized' });

    // Algorithms pinned to HS256 to prevent algorithm-confusion attack
    const decoded = jwt.verify(token, process.env.JWT_SECRET, { algorithms: ['HS256'] });
    req.user = await User.findById(decoded.id).select('-password');

    if (!req.user) {
      return res.status(401).json({ message: 'Session expired ya account reset ho chuka hai. Kripya login ya register karein.' });
    }

    if (req.user.isBlocked) {
      return res.status(403).json({ message: 'Account is blocked by administrator' });
    }

    // Token version check for instantaneous session invalidation.
    // Strict: a token without `tv` counts as version 0, so a legacy token can no longer
    // survive a force-logout / password change (which bump tokenVersion).
    const tokenTv = typeof decoded.tv === 'number' ? decoded.tv : 0;
    const currentTv = typeof req.user.tokenVersion === 'number' ? req.user.tokenVersion : 0;
    if (tokenTv !== currentTv) {
      return res.status(401).json({ message: 'Session invalidated. Please log in again.' });
    }

    // Deactivated staff account check
    if (req.user.role === 'staff' && req.user.staffProfile?.isActive === false) {
      return res.status(403).json({ message: 'Staff account has been deactivated.' });
    }

    next();
  } catch (err) {
    res.status(401).json({ message: 'Invalid or expired token' });
  }
};

exports.admin = (req, res, next) => {
  if (!req.user || req.user.role !== 'admin') {
    return res.status(403).json({ message: 'Admin access required' });
  }
  next();
};

exports.staffOrAdmin = (req, res, next) => {
  if (!req.user || (req.user.role !== 'admin' && req.user.role !== 'staff')) {
    return res.status(403).json({ message: 'Staff or Admin access required' });
  }
  next();
};

/**
 * Middleware factory requiring any of the specified permissions.
 * Super Admin (role === 'admin') automatically bypasses this check.
 */
exports.requirePermission = (...permissions) => {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ message: 'Not authorized' });
    }
    // Super admins always retain global permission
    if (req.user.role === 'admin') {
      return next();
    }
    if (req.user.role !== 'staff') {
      return res.status(403).json({ message: 'Staff or Admin access required' });
    }
    if (!req.user.staffProfile || req.user.staffProfile.isActive === false) {
      return res.status(403).json({ message: 'Staff account has been deactivated.' });
    }

    const staffPerms = Array.isArray(req.user.staffProfile.permissions)
      ? req.user.staffProfile.permissions
      : [];

    const isAuthorized = permissions.some(p => staffPerms.includes(p));
    if (!isAuthorized) {
      return res.status(403).json({
        message: `Access denied. Requires permission: ${permissions.join(' or ')}`
      });
    }

    next();
  };
};