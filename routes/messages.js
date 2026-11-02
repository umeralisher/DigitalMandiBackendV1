const router = require('express').Router();
const Message = require('../models/Message');
const User = require('../models/User');
const { protect } = require('../middleware/auth');
const { asyncHandler, httpError, notify } = require('../utils/helpers');

// FR7: list conversations with last message + unread count
router.get(
  '/conversations',
  protect,
  asyncHandler(async (req, res) => {
    const me = String(req.user._id);
    const msgs = await Message.find({ $or: [{ sender: me }, { receiver: me }] })
      .sort('-createdAt')
      .limit(500)
      .populate('sender receiver', 'name role city');
    const map = new Map();
    for (const m of msgs) {
      const other = String(m.sender._id) === me ? m.receiver : m.sender;
      const key = String(other._id);
      if (!map.has(key)) map.set(key, { user: other, lastMessage: m.text, lastAt: m.createdAt, unread: 0 });
      if (String(m.receiver._id) === me && !m.read) map.get(key).unread++;
    }
    res.json([...map.values()]);
  })
);

// Only farmer <-> buyer (or anyone <-> admin) conversations are allowed
async function getPeer(req) {
  const peer = await User.findById(req.params.userId).select('name role city status');
  if (!peer || peer.status === 'blocked') throw httpError(404, 'User not found');
  if (String(peer._id) === String(req.user._id)) throw httpError(400, 'You cannot message yourself');
  const sameRole = peer.role === req.user.role && peer.role !== 'admin';
  if (sameRole) throw httpError(403, 'Messaging is only available between farmers and buyers');
  return peer;
}

router.get(
  '/with/:userId',
  protect,
  asyncHandler(async (req, res) => {
    const peer = await getPeer(req);
    const messages = await Message.find({
      $or: [
        { sender: req.user._id, receiver: peer._id },
        { sender: peer._id, receiver: req.user._id },
      ],
    }).sort('createdAt').limit(500);
    await Message.updateMany({ sender: peer._id, receiver: req.user._id, read: false }, { read: true });
    res.json({ peer, messages });
  })
);

router.post(
  '/with/:userId',
  protect,
  asyncHandler(async (req, res) => {
    const peer = await getPeer(req);
    let { text, shareContact } = req.body;
    if (shareContact) {
      // Option to share contact details
      text = `My contact details:\nPhone: ${req.user.phone}\nEmail: ${req.user.email}`;
    }
    if (!text || !String(text).trim()) throw httpError(400, 'Message cannot be empty');
    const message = await Message.create({
      sender: req.user._id,
      receiver: peer._id,
      text,
      isContactCard: !!shareContact,
    });
    await notify(peer._id, {
      type: 'message',
      title: `New message from ${req.user.name}`,
      message: String(text).slice(0, 80),
      link: `/messages/${req.user._id}`,
      dedupe: true,
    });
    res.status(201).json(message);
  })
);

module.exports = router;
