const mongoose = require('mongoose');

const orderSchema = new mongoose.Schema(
  {
    orderNumber: { type: String, unique: true },
    buyer: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    farmer: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    product: { type: mongoose.Schema.Types.ObjectId, ref: 'Product', required: true },
    // Snapshot so history stays correct even if the listing is edited/deleted
    productName: String,
    productImage: String,
    unit: String,
    unitPrice: Number,
    quantity: { type: Number, required: true, min: 1 },
    totalAmount: Number,
    deliveryAddress: { type: String, required: true },
    buyerPhone: { type: String, required: true },
    note: { type: String, default: '' },
    paymentMethod: { type: String, enum: ['COD', 'ONLINE'], default: 'COD' },
    paymentStatus: { type: String, enum: ['unpaid', 'paid', 'refunded'], default: 'unpaid' },
    status: {
      type: String,
      enum: ['pending', 'confirmed', 'delivered', 'rejected', 'cancelled'],
      default: 'pending',
      index: true,
    },
    statusHistory: [{ status: String, at: { type: Date, default: Date.now } }],
    reviewed: { type: Boolean, default: false },
  },
  { timestamps: true }
);

module.exports = mongoose.model('Order', orderSchema);
