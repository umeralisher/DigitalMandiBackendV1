const jwt = require('jsonwebtoken');
const User = require('../models/User');
const { asyncHandler, httpError } = require('../utils/helpers');

exports.protect = asyncHandler(async (req, res, next) => {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) throw httpError(401, 'Please log in to continue');
  let decoded;
  try {
    decoded = jwt.verify(token, process.env.JWT_SECRET);
  } catch {
    throw httpError(401, 'Your session has expired. Please log in again');
  }
  const user = await User.findById(decoded.id);
  if (!user) throw httpError(401, 'This account no longer exists');
  if (user.status === 'blocked') throw httpError(403, 'Your account has been blocked. Please contact the admin');
  req.user = user;
  next();
});

// Role-based access control
exports.authorize = (...roles) => (req, res, next) =>
  roles.includes(req.user.role) ? next() : next(httpError(403, 'You do not have permission to do this'));

// Farmers must be approved by the admin before they can list products
exports.requireApproved = (req, res, next) =>
  req.user.status === 'approved' ? next() : next(httpError(403, 'Your account is awaiting admin approval'));
