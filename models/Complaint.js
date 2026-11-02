const mongoose = require('mongoose');

const complaintSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    against: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    order: { type: mongoose.Schema.Types.ObjectId, ref: 'Order' },
    type: { type: String, enum: ['complaint', 'dispute', 'feedback'], default: 'complaint' },
    subject: { type: String, required: true, trim: true, maxlength: 150 },
    description: { type: String, required: true, trim: true, maxlength: 3000 },
    status: { type: String, enum: ['open', 'in_review', 'resolved', 'rejected'], default: 'open' },
    adminResponse: { type: String, default: '' },
  },
  { timestamps: true }
);

module.exports = mongoose.model('Complaint', complaintSchema);
