const router = require('express').Router();
const Notification = require('../models/Notification');
const { protect } = require('../middleware/auth');
const { asyncHandler, httpError } = require('../utils/helpers');

// FR9
router.get(
  '/',
  protect,
  asyncHandler(async (req, res) => {
    const [items, unread] = await Promise.all([
      Notification.find({ user: req.user._id }).sort('-updatedAt').limit(50),
      Notification.countDocuments({ user: req.user._id, read: false }),
    ]);
    res.json({ items, unread });
  })
);

router.patch(
  '/read-all',
  protect,
  asyncHandler(async (req, res) => {
    await Notification.updateMany({ user: req.user._id, read: false }, { read: true });
    res.json({ message: 'All notifications marked as read' });
  })
);

router.patch(
  '/:id/read',
  protect,
  asyncHandler(async (req, res) => {
    const n = await Notification.findOneAndUpdate({ _id: req.params.id, user: req.user._id }, { read: true }, { new: true });
    if (!n) throw httpError(404, 'Notification not found');
    res.json(n);
  })
);

module.exports = router;
