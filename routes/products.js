const router = require('express').Router();
const fs = require('fs');
const path = require('path');
const jwt = require('jsonwebtoken');
const Product = require('../models/Product');
const User = require('../models/User');
const { protect, authorize, requireApproved } = require('../middleware/auth');
const upload = require('../middleware/upload');
const { asyncHandler, httpError, escapeRegex } = require('../utils/helpers');

const FARMER_FIELDS = 'name city farm ratingAvg ratingCount';

function removeFiles(urls = []) {
  urls.forEach((u) => {
    if (u && u.startsWith('/uploads/')) fs.unlink(path.join(__dirname, '..', u), () => {});
  });
}

// Builds the Mongo filter for FR4 (keyword, category, location, price range, availability, freshness)
function buildFilter(q) {
  const f = { isActive: true };
  const and = [];
  if (q.q) {
    const rx = new RegExp(escapeRegex(q.q), 'i');
    and.push({ $or: [{ name: rx }, { description: rx }, { category: rx }] });
  }
  if (q.location) and.push({ location: new RegExp(escapeRegex(q.location), 'i') });
  if (and.length) f.$and = and;
  if (q.category) f.category = q.category;
  if (q.minPrice || q.maxPrice) {
    f.price = {};
    if (q.minPrice) f.price.$gte = Number(q.minPrice);
    if (q.maxPrice) f.price.$lte = Number(q.maxPrice);
  }
  if (q.inStock === 'true') f.quantity = { $gt: 0 };
  if (q.freshDays) f.harvestDate = { $gte: new Date(Date.now() - Number(q.freshDays) * 864e5) };
  return f;
}

const SORTS = {
  newest: { createdAt: -1 },
  price_asc: { price: 1 },
  price_desc: { price: -1 },
  rating: { ratingAvg: -1, ratingCount: -1 },
};

// FR4 + FR12: browse / search / filter / nearby
router.get(
  '/',
  asyncHandler(async (req, res) => {
    const page = Math.max(1, parseInt(req.query.page) || 1);
    const limit = Math.min(48, parseInt(req.query.limit) || 12);
    const skip = (page - 1) * limit;
    const filter = buildFilter(req.query);
    const lat = parseFloat(req.query.lat);
    const lng = parseFloat(req.query.lng);
    let items, total;

    if (Number.isFinite(lat) && Number.isFinite(lng)) {
      // FR12: nearest first, within `radius` km
      const radiusKm = Number(req.query.radius) || 50;
      const [r] = await Product.aggregate([
        {
          $geoNear: {
            near: { type: 'Point', coordinates: [lng, lat] },
            distanceField: 'distance',
            maxDistance: radiusKm * 1000,
            spherical: true,
            query: filter,
          },
        },
        { $facet: { items: [{ $skip: skip }, { $limit: limit }], total: [{ $count: 'n' }] } },
      ]);
      items = r.items;
      total = r.total[0]?.n || 0;
      await Product.populate(items, { path: 'farmer', select: FARMER_FIELDS });
      items.forEach((i) => (i.distanceKm = Math.round(i.distance / 100) / 10));
    } else {
      [items, total] = await Promise.all([
        Product.find(filter)
          .sort(SORTS[req.query.sort] || SORTS.newest)
          .skip(skip)
          .limit(limit)
          .populate('farmer', FARMER_FIELDS),
        Product.countDocuments(filter),
      ]);
    }
    res.json({ items, total, page, pages: Math.ceil(total / limit) || 1 });
  })
);

// FR3: farmer's own listings
router.get(
  '/mine',
  protect,
  authorize('farmer'),
  asyncHandler(async (req, res) => {
    res.json(await Product.find({ farmer: req.user._id }).sort('-createdAt'));
  })
);

router.get(
  '/meta/options',
  (req, res) => res.json({ categories: Product.CATEGORIES, units: Product.UNITS })
);

router.get(
  '/:id',
  asyncHandler(async (req, res) => {
    const product = await Product.findById(req.params.id).populate('farmer', FARMER_FIELDS);
    if (!product) throw httpError(404, 'Product not found');
    if (!product.isActive) {
      // Hidden listings are only visible to their owner and to admins
      let allowed = false;
      try {
        const token = (req.headers.authorization || '').replace('Bearer ', '');
        const { id } = jwt.verify(token, process.env.JWT_SECRET);
        const me = await User.findById(id);
        allowed = me && (me.role === 'admin' || String(me._id) === String(product.farmer._id));
      } catch { /* not logged in */ }
      if (!allowed) throw httpError(404, 'Product not found');
    }
    res.json(product);
  })
);

function parseBody(body) {
  const out = {};
  ['name', 'category', 'description', 'unit', 'location'].forEach((k) => {
    if (body[k] !== undefined) out[k] = String(body[k]).trim();
  });
  if (body.price !== undefined) out.price = Number(body.price);
  if (body.quantity !== undefined) out.quantity = Number(body.quantity);
  if (body.harvestDate) out.harvestDate = new Date(body.harvestDate);
  const lat = parseFloat(body.lat);
  const lng = parseFloat(body.lng);
  if (Number.isFinite(lat) && Number.isFinite(lng)) out.geo = { type: 'Point', coordinates: [lng, lat] };
  return out;
}

function validate(data, isCreate) {
  if (isCreate && (!data.name || !data.category || data.price === undefined || data.quantity === undefined || !data.location)) {
    throw httpError(400, 'Name, category, price, quantity and location are required');
  }
  if (data.price !== undefined && !(data.price >= 0)) throw httpError(400, 'Price must be a positive number');
  if (data.quantity !== undefined && !(data.quantity >= 0)) throw httpError(400, 'Quantity must be zero or more');
  if (data.category && !Product.CATEGORIES.includes(data.category)) throw httpError(400, 'Invalid category');
  if (data.unit && !Product.UNITS.includes(data.unit)) throw httpError(400, 'Invalid unit');
}

// FR3: create listing with images
router.post(
  '/',
  protect,
  authorize('farmer'),
  requireApproved,
  upload.array('images', 5),
  asyncHandler(async (req, res) => {
    const data = parseBody(req.body);
    try {
      validate(data, true);
    } catch (e) {
      removeFiles((req.files || []).map((f) => `/uploads/${f.filename}`));
      throw e;
    }
    const product = await Product.create({
      ...data,
      farmer: req.user._id,
      images: (req.files || []).map((f) => `/uploads/${f.filename}`),
    });
    res.status(201).json(product);
  })
);

// FR3: edit listing
router.put(
  '/:id',
  protect,
  authorize('farmer'),
  upload.array('images', 5),
  asyncHandler(async (req, res) => {
    const product = await Product.findById(req.params.id);
    const newFiles = (req.files || []).map((f) => `/uploads/${f.filename}`);
    if (!product || String(product.farmer) !== String(req.user._id)) {
      removeFiles(newFiles);
      throw httpError(404, 'Product not found');
    }
    const data = parseBody(req.body);
    try {
      validate(data, false);
    } catch (e) {
      removeFiles(newFiles);
      throw e;
    }
    let remove = [];
    try { remove = JSON.parse(req.body.removeImages || '[]'); } catch { /* ignore */ }
    remove = remove.filter((u) => product.images.includes(u));
    product.images = product.images.filter((u) => !remove.includes(u)).concat(newFiles).slice(0, 5);
    Object.assign(product, data);
    await product.save();
    removeFiles(remove);
    res.json(product);
  })
);

// FR3 / FR10: delete listing (owner or admin)
router.delete(
  '/:id',
  protect,
  authorize('farmer', 'admin'),
  asyncHandler(async (req, res) => {
    const product = await Product.findById(req.params.id);
    if (!product) throw httpError(404, 'Product not found');
    if (req.user.role !== 'admin' && String(product.farmer) !== String(req.user._id)) throw httpError(403, 'Not your listing');
    removeFiles(product.images);
    await product.deleteOne();
    res.json({ message: 'Listing deleted' });
  })
);

module.exports = router;
