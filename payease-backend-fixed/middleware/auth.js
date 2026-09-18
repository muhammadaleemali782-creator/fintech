const jwt = require('jsonwebtoken');
const User = require('../models/User');

exports.protect = async (req, res, next) => {
  try {
    const token = req.headers.authorization?.split(' ')[1];
    if (!token) return res.status(401).json({ message: 'Not authorized' });
    
    // algorithms explicitly pin kiya hai -- isse koi bhi token jo HS256 se
    // sign nahi hua (jaise alg:none ya kisi doosre algorithm ka), verify
    // step par hi reject ho jayega (algorithm-confusion attack se bachne
    // ke liye best practice)
    const decoded = jwt.verify(token, process.env.JWT_SECRET, { algorithms: ['HS256'] });
    req.user = await User.findById(decoded.id).select('-password');
    
    if (!req.user || req.user.isBlocked) 
      return res.status(401).json({ message: 'Access denied' });
    
    next();
  } catch (err) {
    res.status(401).json({ message: 'Invalid token' });
  }
};

exports.admin = (req, res, next) => {
  if (req.user.role !== 'admin') 
    return res.status(403).json({ message: 'Admin access required' });
  next();
};