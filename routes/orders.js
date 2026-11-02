const router = require('express').Router();
const Order = require('../models/Order');
const Product = require('../models/Product');
const Transaction = require('../models/Transaction');
const { protect, authorize } = require('../middleware/auth');
const { asyncHandler, httpError, notify } = require('../utils/helpers');

const POPULATE = [
  { path: 'buyer', select: 'name phone city' },
  { path: 'farmer', select: 'name city ratingAvg' },
];

const orderNumber = () => `DM-${Date.now().toString(36).toUpperCase()}${Math.floor(Math.random() * 90 + 10)}`;

const isParticipant = (order, user) =>
  user.role === 'admin' ||
  String(order.buyer._id || order.buyer) === String(user._id) ||
  String(order.farmer._id || order.farmer) === String(user._id);

// FR5 + FR8: place an order (buyer)
router.post(
  '/',
  protect,
  authorize('buyer'),
  asyncHandler(async (req, res) => {
    const { productId, deliveryAddress, buyerPhone, note, paymentMethod } = req.body;
    const quantity = Number(req.body.quantity);
    if (!productId) throw httpError(400, 'Select a product');
    if (!(quantity > 0)) throw httpError(400, 'Quantity must be greater than zero');
    if (!deliveryAddress || !String(deliveryAddress).trim()) throw httpError(400, 'Delivery address is required');
    const phone = buyerPhone || req.user.phone;
    const method = paymentMethod === 'ONLINE' ? 'ONLINE' : 'COD';

    // Atomically reserve stock so two buyers cannot over-order the same stock
    const product = await Product.findOneAndUpdate(
      { _id: productId, isActive: true, quantity: { $gte: quantity } },
      { $inc: { quantity: -quantity } },
      { new: true }
    );
    if (!product) throw httpError(400, 'This product is unavailable or does not have enough stock');

    try {
      const order = await Order.create({
        orderNumber: orderNumber(),
        buyer: req.user._id,
        farmer: product.farmer,
        product: product._id,
        productName: product.name,
        productImage: product.images[0] || '',
        unit: product.unit,
        unitPrice: product.price,
        quantity,
        totalAmount: product.price * quantity,
        deliveryAddress,
        buyerPhone: phone,
        note: note || '',
        paymentMethod: method,
        // Online payment is simulated: marked as paid immediately with a reference number
        paymentStatus: method === 'ONLINE' ? 'paid' : 'unpaid',
        statusHistory: [{ status: 'pending' }],
      });
      await Transaction.create({
        order: order._id,
        buyer: order.buyer,
        farmer: order.farmer,
        amount: order.totalAmount,
        method,
        reference: method === 'ONLINE' ? `SIM-${Date.now().toString(36).toUpperCase()}` : '',
        status: 'pending',
      });
      await notify(order.farmer, {
        type: 'order',
        title: 'New order received',
        message: `${req.user.name} ordered ${quantity} ${product.unit} of ${product.name}.`,
        link: `/orders/${order._id}`,
      });
      res.status(201).json(await order.populate(POPULATE));
    } catch (err) {
      await Product.updateOne({ _id: product._id }, { $inc: { quantity } }); // roll back stock
      throw err;
    }
  })
);

// FR6 + FR13: order history (buyer: own orders, farmer: incoming orders, admin: all)
router.get(
  '/',
  protect,
  asyncHandler(async (req, res) => {
    const filter = {};
    if (req.user.role === 'buyer') filter.buyer = req.user._id;
    if (req.user.role === 'farmer') filter.farmer = req.user._id;
    if (req.query.status) filter.status = req.query.status;
    res.json(await Order.find(filter).sort('-createdAt').limit(200).populate(POPULATE));
  })
);

router.get(
  '/:id',
  protect,
  asyncHandler(async (req, res) => {
    const order = await Order.findById(req.params.id).populate(POPULATE);
    if (!order || !isParticipant(order, req.user)) throw httpError(404, 'Order not found');
    res.json(order);
  })
);

// FR6: accept / reject / deliver (farmer) or cancel (buyer)
router.patch(
  '/:id/status',
  protect,
  asyncHandler(async (req, res) => {
    const { status } = req.body;
    const order = await Order.findById(req.params.id);
    if (!order) throw httpError(404, 'Order not found');
    const isFarmer = String(order.farmer) === String(req.user._id);
    const isBuyer = String(order.buyer) === String(req.user._id);

    const allowed = {
      farmer: { pending: ['confirmed', 'rejected'], confirmed: ['delivered', 'cancelled'] },
      buyer: { pending: ['cancelled'] },
    };
    const role = isFarmer ? 'farmer' : isBuyer ? 'buyer' : null;
    if (!role || !(allowed[role][order.status] || []).includes(status)) {
      throw httpError(400, `You cannot change this order from "${order.status}" to "${status}"`);
    }

    order.status = status;
    order.statusHistory.push({ status });
    const tx = await Transaction.findOne({ order: order._id });

    if (['rejected', 'cancelled'].includes(status)) {
      await Product.updateOne({ _id: order.product }, { $inc: { quantity: order.quantity } }); // release stock
      if (order.paymentStatus === 'paid') order.paymentStatus = 'refunded';
      if (tx) tx.status = 'cancelled';
    }
    if (status === 'delivered') {
      order.paymentStatus = 'paid'; // COD cash collected on delivery
      if (tx) tx.status = 'completed';
    }
    await order.save();
    if (tx) await tx.save();

    const other = isFarmer ? order.buyer : order.farmer;
    const labels = {
      confirmed: 'confirmed',
      rejected: 'rejected',
      delivered: 'marked as delivered',
      cancelled: 'cancelled',
    };
    await notify(other, {
      type: 'order',
      title: `Order ${labels[status]}`,
      message: `Order ${order.orderNumber} (${order.productName}) was ${labels[status]}.`,
      link: `/orders/${order._id}`,
    });
    res.json(await order.populate(POPULATE));
  })
);

module.exports = router;
