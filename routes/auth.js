const router = require('express').Router();
const User = require('../models/User');
const { protect } = require('../middleware/auth');
const { asyncHandler, httpError, signToken, notify } = require('../utils/helpers');

const EMAIL_RX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// FR1: Register (farmer or buyer)
router.post(
  '/register',
  asyncHandler(async (req, res) => {
    const { name, email, phone, password, role, city, address } = req.body;
    if (!name || !email || !phone || !password) throw httpError(400, 'Name, email, phone and password are required');
    if (!EMAIL_RX.test(email)) throw httpError(400, 'Please enter a valid email address');
    if (String(password).length < 6) throw httpError(400, 'Password must be at least 6 characters');
    if (!['farmer', 'buyer'].includes(role)) throw httpError(400, 'Role must be farmer or buyer');
    if (await User.findOne({ email: email.toLowerCase() })) throw httpError(409, 'An account with this email already exists');

    const needsApproval = role === 'farmer' && process.env.REQUIRE_FARMER_APPROVAL !== 'false';
    const user = await User.create({
      name, email, phone, password, role, city, address,
      status: needsApproval ? 'pending' : 'approved',
    });

    if (needsApproval) {
      const admins = await User.find({ role: 'admin' }).select('_id');
      await Promise.all(
        admins.map((a) =>
          notify(a._id, {
            type: 'account',
            title: 'New farmer awaiting approval',
            message: `${user.name} registered as a farmer.`,
            link: '/admin',
          })
        )
      );
    }
    res.status(201).json({ token: signToken(user._id), user });
  })
);

// FR1: Login
router.post(
  '/login',
  asyncHandler(async (req, res) => {
    const { email, password } = req.body;
    if (!email || !password) throw httpError(400, 'Email and password are required');
    const user = await User.findOne({ email: email.toLowerCase() }).select('+password');
    if (!user || !(await user.matchPassword(password))) throw httpError(401, 'Incorrect email or password');
    if (user.status === 'blocked') throw httpError(403, 'Your account has been blocked. Please contact the admin');
    res.json({ token: signToken(user._id), user });
  })
);

router.get('/me', protect, (req, res) => res.json({ user: req.user }));

module.exports = router;
