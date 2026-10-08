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

    // algorithms explicitly pin kiya hai -- isse koi bhi token jo HS256 se
    // sign nahi hua (jaise alg:none ya kisi doosre algorithm ka), verify
    // step par hi reject ho jayega (algorithm-confusion attack se bachne
    // ke liye best practice)
    const decoded = jwt.verify(token, process.env.JWT_SECRET, { algorithms: ['HS256'] });
    req.user = await User.findById(decoded.id).select('-password');

    if (!req.user)
      return res.status(401).json({ message: 'Session expired ya account reset ho chuka hai. Kripya login ya register karein.' });

    if (req.user.isBlocked)
      return res.status(403).json({ message: 'Account is blocked by administrator' });

    next();
  } catch (err) {
    res.status(401).json({ message: 'Invalid or expired token' });
  }
};

exports.admin = (req, res, next) => {
  if (!req.user || req.user.role !== 'admin') 
    return res.status(403).json({ message: 'Admin access required' });
  next();
};