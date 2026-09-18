const mongoose = require('mongoose');

const deviceCommandSchema = new mongoose.Schema({
  deviceId: { type: String, required: true },
  command: { 
    type: String, 
    enum: ['enable_protection', 'disable_protection', 'enforce_pinning', 'stop_pinning'], 
    required: true 
  },
  status: { type: String, enum: ['pending', 'acknowledged', 'failed'], default: 'pending' },
  createdAt: { type: Date, default: Date.now },
  acknowledgedAt: { type: Date },
});

module.exports = mongoose.model('DeviceCommand', deviceCommandSchema);
