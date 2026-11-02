const router = require('express').Router();
const Transaction = require('../models/Transaction');
const { protect } = require('../middleware/auth');
const { asyncHandler } = require('../utils/helpers');

// FR13: stored transaction records
router.get(
  '/',
  protect,
  asyncHandler(async (req, res) => {
    const filter = {};
    if (req.user.role === 'buyer') filter.buyer = req.user._id;
    if (req.user.role === 'farmer') filter.farmer = req.user._id;
    const list = await Transaction.find(filter)
      .sort('-createdAt')
      .limit(200)
      .populate('order', 'orderNumber productName quantity unit status')
      .populate('buyer', 'name')
      .populate('farmer', 'name');
    res.json(list);
  })
);

module.exports = router;
