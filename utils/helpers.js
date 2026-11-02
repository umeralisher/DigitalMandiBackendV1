const jwt = require('jsonwebtoken');
const Notification = require('../models/Notification');

exports.signToken = (id) =>
  jwt.sign({ id }, process.env.JWT_SECRET, { expiresIn: process.env.JWT_EXPIRES_IN || '7d' });

exports.asyncHandler = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

exports.httpError = (status, message) => Object.assign(new Error(message), { status });

exports.escapeRegex = (s) => String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

// Create (or refresh, when dedupe=true) a notification. Never throws.
exports.notify = async (user, { type = 'system', title, message, link = '', dedupe = false }) => {
  try {
    if (dedupe) {
      await Notification.findOneAndUpdate(
        { user, type, link, read: false },
        { $set: { title, message } },
        { upsert: true }
      );
    } else {
      await Notification.create({ user, type, title, message, link });
    }
  } catch (e) {
    console.error('notify failed:', e.message);
  }
};
