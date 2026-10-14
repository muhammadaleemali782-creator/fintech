const mongoose = require('mongoose');

// Distributed lock / idempotency record. Works across multiple server instances
// because uniqueness is enforced by MongoDB, not by process memory.
const lockSchema = new mongoose.Schema({
  key: { type: String, required: true, unique: true },
  expiresAt: { type: Date, required: true }
});

// Mongo's TTL monitor removes stale docs (runs ~every 60s). acquire() also checks expiry itself.
lockSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 3600 });

module.exports = mongoose.model('Lock', lockSchema);
