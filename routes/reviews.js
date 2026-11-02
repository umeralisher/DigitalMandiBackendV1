const router = require('express').Router();
const Review = require('../models/Review');
const Order = require('../models/Order');
const Product = require('../models/Product');
const User = require('../models/User');
const { protect, authorize } = require('../middleware/auth');
const { asyncHandler, httpError, notify } = require('../utils/helpers');

async function recompute(model, id, field) {
  const [agg] = await Review.aggregate([
    { $match: { [field]: id } },
    { $group: { _id: null, avg: { $avg: '$rating' }, n: { $sum: 1 } } },
  ]);
  await model.findByIdAndUpdate(id, {
    ratingAvg: agg ? Math.round(agg.avg * 10) / 10 : 0,
    ratingCount: agg ? agg.n : 0,
  });
}

// FR11: buyer rates a delivered order (product + seller)
router.post(
  '/',
  protect,
  authorize('buyer'),
  asyncHandler(async (req, res) => {
    const { orderId, comment } = req.body;
    const rating = Number(req.body.rating);
    if (!(rating >= 1 && rating <= 5)) throw httpError(400, 'Rating must be between 1 and 5');
    const order = await Order.findById(orderId);
    if (!order || String(order.buyer) !== String(req.user._id)) throw httpError(404, 'Order not found');
    if (order.status !== 'delivered') throw httpError(400, 'You can review an order only after it is delivered');
    if (order.reviewed) throw httpError(409, 'You have already reviewed this order');

    const review = await Review.create({
      order: order._id,
      buyer: req.user._id,
      farmer: order.farmer,
      product: order.product,
      rating,
      comment,
    });
    order.reviewed = true;
    await order.save();
    await Promise.all([recompute(Product, order.product, 'product'), recompute(User, order.farmer, 'farmer')]);
    await notify(order.farmer, {
      type: 'review',
      title: 'You received a new review',
      message: `${req.user.name} rated ${order.productName} ${rating}/5.`,
      link: `/farmers/${order.farmer}`,
    });
    res.status(201).json(review);
  })
);

router.get(
  '/product/:id',
  asyncHandler(async (req, res) => {
    res.json(await Review.find({ product: req.params.id }).sort('-createdAt').limit(50).populate('buyer', 'name'));
  })
);

router.get(
  '/farmer/:id',
  asyncHandler(async (req, res) => {
    res.json(
      await Review.find({ farmer: req.params.id })
        .sort('-createdAt')
        .limit(50)
        .populate('buyer', 'name')
        .populate('product', 'name')
    );
  })
);

module.exports = router;
