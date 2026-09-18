const mongoose = require('mongoose');

const notificationSchema = new mongoose.Schema({
  type: {
    type: String,
    enum: ['new_user', 'loan_query', 'loan_apply', 'general'],
    default: 'general'
  },
  title: { type: String, required: true },
  message: { type: String, required: true },
  data: { type: Object, default: {} },
  read: { type: Boolean, default: false },
  createdAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model('Notification', notificationSchema);
