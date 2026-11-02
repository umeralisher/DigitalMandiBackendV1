const router = require('express').Router();
const Complaint = require('../models/Complaint');
const Order = require('../models/Order');
const User = require('../models/User');
const { protect, authorize } = require('../middleware/auth');
const { asyncHandler, httpError, notify } = require('../utils/helpers');

// FR10 / FR11: users file complaints, disputes or service feedback
router.post(
  '/',
  protect,
  authorize('farmer', 'buyer'),
  asyncHandler(async (req, res) => {
    const { type, subject, description, orderId } = req.body;
    if (!subject || !description) throw httpError(400, 'Subject and description are required');
    const data = {
      user: req.user._id,
      type: ['complaint', 'dispute', 'feedback'].includes(type) ? type : 'complaint',
      subject,
      description,
    };
    if (orderId) {
      const order = await Order.findById(orderId);
      const mine = order && [String(order.buyer), String(order.farmer)].includes(String(req.user._id));
      if (!mine) throw httpError(404, 'Order not found');
      data.order = order._id;
      data.against = String(order.buyer) === String(req.user._id) ? order.farmer : order.buyer;
    }
    const complaint = await Complaint.create(data);
    const admins = await User.find({ role: 'admin' }).select('_id');
    await Promise.all(
      admins.map((a) =>
        notify(a._id, { type: 'complaint', title: `New ${data.type}`, message: subject, link: '/admin' })
      )
    );
    res.status(201).json(complaint);
  })
);

router.get(
  '/mine',
  protect,
  asyncHandler(async (req, res) => {
    res.json(
      await Complaint.find({ user: req.user._id })
        .sort('-createdAt')
        .populate('order', 'orderNumber productName')
        .populate('against', 'name')
    );
  })
);

module.exports = router;
