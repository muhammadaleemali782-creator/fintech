const mongoose = require('mongoose');

const deviceAlertSchema = new mongoose.Schema({
  deviceId: { type: String, required: true },
  type: { type: String, required: true }, // e.g. 'admin_disable_requested', 'pin_failed', 'protection_disabled', 'settings_opened'
  message: { type: String },
  timestamp: { type: Date, default: Date.now },
  metadata: { type: Object, default: {} },
});

module.exports = mongoose.model('DeviceAlert', deviceAlertSchema);
