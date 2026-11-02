const mongoose = require('mongoose');

const CATEGORIES = ['Vegetables', 'Fruits', 'Grains', 'Pulses', 'Dairy', 'Livestock', 'Spices', 'Other'];
const UNITS = ['kg', 'maund (40 kg)', 'dozen', 'piece', 'liter', 'bag'];

const productSchema = new mongoose.Schema(
  {
    farmer: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    name: { type: String, required: true, trim: true, maxlength: 100 },
    category: { type: String, enum: CATEGORIES, required: true },
    description: { type: String, trim: true, default: '' },
    price: { type: Number, required: true, min: 0 }, // price per unit (PKR)
    unit: { type: String, enum: UNITS, default: 'kg' },
    quantity: { type: Number, required: true, min: 0 }, // units in stock
    location: { type: String, required: true, trim: true }, // human readable, e.g. "Sahiwal, Punjab"
    geo: {
      type: { type: String, enum: ['Point'] },
      coordinates: { type: [Number], default: undefined }, // [lng, lat]
    },
    images: [String],
    harvestDate: { type: Date, default: Date.now }, // used for the "freshness" filter
    isActive: { type: Boolean, default: true }, // admin can deactivate a listing
    ratingAvg: { type: Number, default: 0 },
    ratingCount: { type: Number, default: 0 },
  },
  { timestamps: true }
);

productSchema.index({ geo: '2dsphere' });
productSchema.index({ name: 1, category: 1 });

module.exports = mongoose.model('Product', productSchema);
module.exports.CATEGORIES = CATEGORIES;
module.exports.UNITS = UNITS;
