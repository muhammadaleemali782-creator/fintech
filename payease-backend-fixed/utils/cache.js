// Lightweight In-Memory Cache with TTL and Key Invalidation (Stdlib, Zero dependencies)
const store = new Map();

const memoryCache = {
  get(key) {
    const entry = store.get(key);
    if (!entry) return null;
    if (Date.now() > entry.expiry) {
      store.delete(key);
      return null;
    }
    return entry.value;
  },

  set(key, value, ttlSeconds = 30) {
    store.set(key, {
      value,
      expiry: Date.now() + (ttlSeconds * 1000)
    });
  },

  del(key) {
    store.delete(key);
  },

  delPrefix(prefix) {
    for (const key of store.keys()) {
      if (key.startsWith(prefix)) {
        store.delete(key);
      }
    }
  },

  clear() {
    store.clear();
  }
};

// Periodic garbage collection every 60 seconds
setInterval(() => {
  const now = Date.now();
  for (const [key, entry] of store.entries()) {
    if (now > entry.expiry) {
      store.delete(key);
    }
  }
}, 60000).unref();

module.exports = memoryCache;
