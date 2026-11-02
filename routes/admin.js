const router = require('express').Router();
const User = require('../models/User');
const Product = require('../models/Product');
const Order = require('../models/Order');
const Complaint = require('../models/Complaint');
const { protect, authorize } = require('../middleware/auth');
const { asyncHandler, httpError, notify, escapeRegex } = require('../utils/helpers');

router.use(protect, authorize('admin'));

// FR10: overview numbers
router.get(
  '/stats',
  asyncHandler(async (req, res) => {
    const [farmers, buyers, pendingFarmers, products, orders, openComplaints, revenue] = await Promise.all([
      User.countDocuments({ role: 'farmer' }),
      User.countDocuments({ role: 'buyer' }),
      User.countDocuments({ role: 'farmer', status: 'pending' }),
      Product.countDocuments(),
      Order.countDocuments(),
      Complaint.countDocuments({ status: { $in: ['open', 'in_review'] } }),
      Order.aggregate([{ $match: { status: 'delivered' } }, { $group: { _id: null, total: { $sum: '$totalAmount' } } }]),
    ]);
    const byStatus = await Order.aggregate([{ $group: { _id: '$status', n: { $sum: 1 } } }]);
    res.json({
      farmers, buyers, pendingFarmers, products, orders, openComplaints,
      deliveredValue: revenue[0]?.total || 0,
      ordersByStatus: Object.fromEntries(byStatus.map((s) => [s._id, s.n])),
    });
  })
);

// Manage users: approve / block
router.get(
  '/users',
  asyncHandler(async (req, res) => {
    const f = { role: { $ne: 'admin' } };
    if (req.query.role) f.role = req.query.role;
    if (req.query.status) f.status = req.query.status;
    if (req.query.q) {
      const rx = new RegExp(escapeRegex(req.query.q), 'i');
      f.$or = [{ name: rx }, { email: rx }, { phone: rx }];
    }
    res.json(await User.find(f).sort('-createdAt').limit(200));
  })
);

router.patch(
  '/users/:id/status',
  asyncHandler(async (req, res) => {
    const { status } = req.body;
    if (!['approved', 'blocked', 'pending'].includes(status)) throw httpError(400, 'Invalid status');
    const user = await User.findById(req.params.id);
    if (!user || user.role === 'admin') throw httpError(404, 'User not found');
    user.status = status;
    await user.save();
    await notify(user._id, {
      type: 'account',
      title: status === 'approved' ? 'Your account is approved' : status === 'blocked' ? 'Your account was blocked' : 'Account under review',
      message:
        status === 'approved'
          ? 'You can now use all features of Digital Mandi.'
          : status === 'blocked'
          ? 'Contact the admin if you think this is a mistake.'
          : 'An admin is reviewing your account.',
      link: '/profile',
    });
    res.json(user);
  })
);

// Monitor product listings
router.get(
  '/products',
  asyncHandler(async (req, res) => {
    const f = {};
    if (req.query.q) f.name = new RegExp(escapeRegex(req.query.q), 'i');
    res.json(await Product.find(f).sort('-createdAt').limit(200).populate('farmer', 'name city status'));
  })
);

router.patch(
  '/products/:id/active',
  asyncHandler(async (req, res) => {
    const product = await Product.findById(req.params.id);
    if (!product) throw httpError(404, 'Product not found');
    product.isActive = !!req.body.isActive;
    await product.save();
    await notify(product.farmer, {
      type: 'system',
      title: product.isActive ? 'Listing re-activated' : 'Listing hidden by admin',
      message: product.name,
      link: '/farmer/products',
    });
    res.json(product);
  })
);

// Complaints and disputes
router.get(
  '/complaints',
  asyncHandler(async (req, res) => {
    const f = req.query.status ? { status: req.query.status } : {};
    res.json(
      await Complaint.find(f)
        .sort('-createdAt')
        .limit(200)
        .populate('user', 'name role email phone')
        .populate('against', 'name role')
        .populate('order', 'orderNumber productName')
    );
  })
);

router.patch(
  '/complaints/:id',
  asyncHandler(async (req, res) => {
    const c = await Complaint.findById(req.params.id);
    if (!c) throw httpError(404, 'Complaint not found');
    if (req.body.status) {
      if (!['open', 'in_review', 'resolved', 'rejected'].includes(req.body.status)) throw httpError(400, 'Invalid status');
      c.status = req.body.status;
    }
    if (req.body.adminResponse !== undefined) c.adminResponse = req.body.adminResponse;
    await c.save();
    await notify(c.user, {
      type: 'complaint',
      title: `Your ${c.type} is ${c.status.replace('_', ' ')}`,
      message: c.adminResponse || c.subject,
      link: '/complaints',
    });
    res.json(c);
  })
);

module.exports = router;
