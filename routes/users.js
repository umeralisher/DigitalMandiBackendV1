const router = require('express').Router();
const User = require('../models/User');
const Product = require('../models/Product');
const { protect } = require('../middleware/auth');
const { asyncHandler, httpError } = require('../utils/helpers');

// FR2: Update own profile
router.put(
  '/me',
  protect,
  asyncHandler(async (req, res) => {
    const u = req.user;
    const { name, phone, address, city, coords, farm } = req.body;
    if (name !== undefined) {
      if (!String(name).trim()) throw httpError(400, 'Name cannot be empty');
      u.name = name;
    }
    if (phone !== undefined) u.phone = phone;
    if (address !== undefined) u.address = address;
    if (city !== undefined) u.city = city;
    if (coords && Number.isFinite(+coords.lat) && Number.isFinite(+coords.lng)) {
      u.coords = { lat: +coords.lat, lng: +coords.lng };
    }
    if (u.role === 'farmer' && farm) {
      u.farm = {
        name: farm.name || '',
        size: farm.size || '',
        description: farm.description || '',
        crops: Array.isArray(farm.crops)
          ? farm.crops.map((c) => String(c).trim()).filter(Boolean)
          : String(farm.crops || '').split(',').map((c) => c.trim()).filter(Boolean),
      };
    }
    await u.save();
    res.json({ user: u });
  })
);

router.put(
  '/me/password',
  protect,
  asyncHandler(async (req, res) => {
    const { currentPassword, newPassword } = req.body;
    if (!newPassword || newPassword.length < 6) throw httpError(400, 'New password must be at least 6 characters');
    const user = await User.findById(req.user._id).select('+password');
    if (!(await user.matchPassword(currentPassword || ''))) throw httpError(400, 'Current password is incorrect');
    user.password = newPassword;
    await user.save();
    res.json({ message: 'Password updated' });
  })
);

// Public farmer profile + their active listings (contact details are NOT exposed here)
router.get(
  '/:id/public',
  asyncHandler(async (req, res) => {
    const user = await User.findById(req.params.id).select('name role city farm ratingAvg ratingCount createdAt status');
    if (!user || user.role === 'admin' || user.status === 'blocked') throw httpError(404, 'User not found');
    const products = user.role === 'farmer' ? await Product.find({ farmer: user._id, isActive: true }).sort('-createdAt') : [];
    res.json({ user, products });
  })
);

module.exports = router;
