// =========================================================================
// Educa Fintech: Instant Persistent Cache & Silent Background Sync Engine
// Dual Storage: Synchronous L1 Memory + Native IndexedDB + localStorage Mirror
// Keys are strictly isolated per role & user: role:userId:section
// Zero auto-deletion. Hard-persistent across tab closes, app force-close & reboot.
// =========================================================================

const DB_NAME = "EducaFintechDB";
const DB_VERSION = 1;
const STORE_NAME = "app_cache";

// -------------------------------------------------------------------------
// PERF: persistence must never block taps / scrolling.
//  - Huge base64 strings (KYC photos etc.) are NOT mirrored to localStorage/IndexedDB (they are re-fetched anyway).
//  - Writes are queued and flushed when the browser is idle (or when the page is hidden), one write per key.
// -------------------------------------------------------------------------
const HEAVY_STRING_LIMIT = 20000;
export function slimStringify(value) {
  return JSON.stringify(value, (k, v) =>
    (typeof v === "string" && v.length > HEAVY_STRING_LIMIT && v.startsWith("data:")) ? "" : v
  );
}

const pendingRecords = new Map(); // cache key -> record  (localStorage mirror + IndexedDB)
const pendingLegacy = new Map();  // raw localStorage key -> value (stringified at flush time)
let flushScheduled = false;

function flushPersistQueue() {
  flushScheduled = false;
  if (typeof window === "undefined") return;
  const records = Array.from(pendingRecords.values());
  const legacy = Array.from(pendingLegacy.entries());
  pendingRecords.clear();
  pendingLegacy.clear();

  for (const [k, v] of legacy) {
    try { localStorage.setItem(k, slimStringify(v)); } catch {}
  }
  for (const rec of records) {
    let json;
    try { json = slimStringify(rec); } catch { continue; }
    try { localStorage.setItem(rec.key, json); } catch { try { CacheManager.evictTemporaryStorage(); } catch {} }
    // IndexedDB gets the same slim copy
    getIndexedDB().then((db) => {
      if (!db) return;
      try { db.transaction(STORE_NAME, "readwrite").objectStore(STORE_NAME).put(JSON.parse(json)); } catch {}
    }).catch(() => {});
  }
}

function schedulePersistFlush() {
  if (typeof window === "undefined") return;
  // App already hidden/closing: write NOW (no idle time will come)
  if (typeof document !== "undefined" && document.visibilityState === "hidden") { flushPersistQueue(); return; }
  if (flushScheduled) return;
  flushScheduled = true;
  if (typeof window.requestIdleCallback === "function") {
    window.requestIdleCallback(flushPersistQueue, { timeout: 2500 });
  } else {
    setTimeout(flushPersistQueue, 400);
  }
}

if (typeof window !== "undefined") {
  // Don't lose the last writes when the app is backgrounded / closed
  window.addEventListener("pagehide", flushPersistQueue);
  document.addEventListener("visibilitychange", () => { if (document.visibilityState === "hidden") flushPersistQueue(); });
}

// Synchronous L1 in-memory cache for 0ms immediate React component rendering
const memoryCache = new Map();
const inFlightRequests = new Map();

// Helper to safely access localStorage
const storage = {
  get(k) {
    if (typeof window === "undefined" || !window.localStorage) return null;
    try { return localStorage.getItem(k); } catch { return null; }
  },
  set(k, v) {
    if (typeof window === "undefined" || !window.localStorage) return;
    try { localStorage.setItem(k, v); } catch {}
  },
  remove(k) {
    if (typeof window === "undefined" || !window.localStorage) return;
    try { localStorage.removeItem(k); } catch {}
  }
};

// Initialize memory cache from localStorage synchronously on module evaluation
if (typeof window !== "undefined" && window.localStorage) {
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key && (key.includes(":") || key.startsWith("educa_cached_") || key.startsWith("educa_admin_"))) {
        const raw = localStorage.getItem(key);
        if (raw) {
          try {
            const parsed = JSON.parse(raw);
            memoryCache.set(key, parsed);
            // one-time cleanup: older builds stored multi-MB base64 inside these entries
            if (raw.length > 300000) {
              try { localStorage.setItem(key, slimStringify(parsed)); } catch {}
            }
          } catch {
            memoryCache.set(key, raw);
          }
        }
      }
    }
  } catch {}
}

// Native IndexedDB Promise Helper (Stdlib, Zero external dependencies)
let idbPromise = null;
function getIndexedDB() {
  if (idbPromise) return idbPromise;
  if (typeof window === "undefined" || !window.indexedDB) {
    idbPromise = Promise.resolve(null);
    return idbPromise;
  }
  idbPromise = new Promise((resolve) => {
    try {
      const req = window.indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = (e) => {
        const db = e.target.result;
        if (!db.objectStoreNames.contains(STORE_NAME)) {
          db.createObjectStore(STORE_NAME, { keyPath: "key" });
        }
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
  return idbPromise;
}

// Load full IndexedDB contents into L1 memory cache in background on startup
if (typeof window !== "undefined") {
  getIndexedDB().then((db) => {
    if (!db) return;
    try {
      const tx = db.transaction(STORE_NAME, "readonly");
      const store = tx.objectStore(STORE_NAME);
      const req = store.getAll();
      req.onsuccess = () => {
        const items = req.result || [];
        for (const item of items) {
          if (item && item.key) {
            memoryCache.set(item.key, item);
          }
        }
      };
    } catch {}
  }).catch(() => {});
}

// Deep structural equality check (prevents unnecessary React re-renders)
export function isDataEqual(a, b) {
  if (a === b) return true;
  if (!a || !b) return false;
  if (typeof a !== "object" || typeof b !== "object") return a === b;
  try {
    return JSON.stringify(a) === JSON.stringify(b);
  } catch {
    return false;
  }
}

// Robust numeric parser that handles numbers, strings, and wrapped cache objects without NaN
export function parseCachedNumber(raw, fallback = 0) {
  if (raw === null || raw === undefined) return fallback;
  if (typeof raw === "number") return isFinite(raw) ? raw : fallback;
  if (typeof raw === "string") {
    try {
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === "object" && "data" in parsed) {
        const n = Number(parsed.data);
        return isFinite(n) ? n : fallback;
      }
      const n = Number(parsed);
      return isFinite(n) ? n : fallback;
    } catch {
      const n = Number(raw);
      return isFinite(n) ? n : fallback;
    }
  }
  return fallback;
}

// -------------------------------------------------------------
// Central Cache Manager Singleton
// -------------------------------------------------------------
export const CacheManager = {
  // Format key: role:userId:section
  createKey(role = "user", userId = "guest", section = "general") {
    const cleanRole = String(role || "user").toLowerCase();
    const cleanId = String(userId || "guest");
    const cleanSection = String(section || "general");
    return `${cleanRole}:${cleanId}:${cleanSection}`;
  },

  // Synchronous read (0 ms) for instant useState initializers
  getSync(key, fallback = null) {
    if (!key) return fallback;
    // 1. Try L1 memory cache
    const mem = memoryCache.get(key);
    if (mem !== undefined && mem !== null) {
      if (typeof mem === "object" && "data" in mem) return mem.data;
      return mem;
    }

    // 2. Fallback to localStorage
    const raw = storage.get(key);
    if (raw !== null && raw !== undefined) {
      try {
        const parsed = JSON.parse(raw);
        if (parsed !== null && typeof parsed === "object" && "data" in parsed) {
          memoryCache.set(key, parsed);
          return parsed.data;
        }
        memoryCache.set(key, parsed);
        return parsed !== undefined ? parsed : fallback;
      } catch {
        memoryCache.set(key, raw);
        return raw;
      }
    }
    return fallback;
  },

  // Returns both data and lastUpdated timestamp synchronously
  getWithMetaSync(key, fallback = null) {
    if (!key) return { data: fallback, lastUpdated: 0 };
    const mem = memoryCache.get(key);
    if (mem !== undefined && mem !== null) {
      if (typeof mem === "object" && "data" in mem) {
        return { data: mem.data, lastUpdated: mem.lastUpdated || 0 };
      }
      return { data: mem, lastUpdated: 0 };
    }
    const raw = storage.get(key);
    if (raw !== null && raw !== undefined) {
      try {
        const parsed = JSON.parse(raw);
        if (parsed !== null && typeof parsed === "object" && "data" in parsed) {
          memoryCache.set(key, parsed);
          return { data: parsed.data, lastUpdated: parsed.lastUpdated || 0 };
        }
        memoryCache.set(key, parsed);
        return { data: parsed, lastUpdated: 0 };
      } catch {
        memoryCache.set(key, raw);
        return { data: raw, lastUpdated: 0 };
      }
    }
    return { data: fallback, lastUpdated: 0 };
  },

  // Async get (reads IndexedDB if memory missing)
  async get(key, fallback = null) {
    const syncVal = this.getSync(key, null);
    if (syncVal !== null) return syncVal;

    try {
      const db = await getIndexedDB();
      if (!db) return fallback;
      return new Promise((resolve) => {
        const tx = db.transaction(STORE_NAME, "readonly");
        const store = tx.objectStore(STORE_NAME);
        const req = store.get(key);
        req.onsuccess = () => {
          if (req.result && req.result.data !== undefined) {
            memoryCache.set(key, req.result);
            resolve(req.result.data);
          } else {
            resolve(fallback);
          }
        };
        req.onerror = () => resolve(fallback);
      });
    } catch {
      return fallback;
    }
  },

  // Persistent Write: L1 Memory + localStorage + IndexedDB (Never Auto-Deleted)
  async set(key, data, meta = {}) {
    if (!key || data === undefined) return;
    const record = {
      key,
      data,
      lastUpdated: Date.now(),
      ...meta
    };

    // 1. Update L1 Memory Cache immediately (UI reads from here)
    memoryCache.set(key, record);

    // 2. Persist (localStorage mirror + IndexedDB) later, off the interaction path, one write per key
    pendingRecords.set(key, record);
    schedulePersistFlush();
  },

  // Deferred, slimmed replacement for localStorage.setItem(key, JSON.stringify(value))
  persistLegacy(key, value) {
    if (!key) return;
    pendingLegacy.set(key, value);
    schedulePersistFlush();
  },

  // JSON string without huge base64 blobs (use for the small "user" session object)
  slim(value) {
    return slimStringify(value);
  },

  has(key) {
    if (memoryCache.has(key)) return true;
    return storage.get(key) !== null;
  },

  // Delete a specific key
  async remove(key) {
    if (!key) return;
    memoryCache.delete(key);
    storage.remove(key);
    try {
      const db = await getIndexedDB();
      if (db) {
        const tx = db.transaction(STORE_NAME, "readwrite");
        tx.objectStore(STORE_NAME).delete(key);
      }
    } catch {}
  },

  // Clear ONLY data belonging to a specific user (Called on Logout)
  async clearUser(role, userId) {
    if (!userId) return;
    const prefix = `${String(role || "user").toLowerCase()}:${String(userId)}:`;
    
    // Clear from Memory & localStorage
    for (const k of Array.from(memoryCache.keys())) {
      if (k.startsWith(prefix) || k.includes(`:${userId}:`)) {
        memoryCache.delete(k);
        storage.remove(k);
      }
    }

    // Clear legacy single-user keys
    const legacyKeys = [
      "educa_cached_profile",
      "educa_cached_balance",
      "educa_cached_profit_balance",
      "educa_cached_txns",
      "educa_cached_loans",
      "educa_cached_active_loan",
      "educa_cached_bonds",
      "educa_cached_agent_metrics",
      "educa_cached_profit_history",
      "educa_cached_current_rate",
      "educa_last_profit_tick"
    ];
    legacyKeys.forEach(k => {
      memoryCache.delete(k);
      storage.remove(k);
    });

    // Clear from IndexedDB
    try {
      const db = await getIndexedDB();
      if (db) {
        const tx = db.transaction(STORE_NAME, "readwrite");
        const store = tx.objectStore(STORE_NAME);
        const req = store.openCursor();
        req.onsuccess = (e) => {
          const cursor = e.target.result;
          if (cursor) {
            if (cursor.key.startsWith(prefix) || cursor.key.includes(`:${userId}:`)) {
              cursor.delete();
            }
            cursor.continue();
          }
        };
      }
    } catch {}
  },

  // Clear ALL Saved Data (Triggered ONLY via manual user "Clear saved data" button)
  async clearAll() {
    memoryCache.clear();
    if (typeof window !== "undefined" && window.localStorage) {
      try {
        const keysToRemove = [];
        for (let i = 0; i < localStorage.length; i++) {
          const k = localStorage.key(i);
          if (k && (k.includes(":") || k.startsWith("educa_cached_") || k.startsWith("educa_admin_") || k.startsWith("educa_custom_"))) {
            keysToRemove.push(k);
          }
        }
        keysToRemove.forEach(k => localStorage.removeItem(k));
      } catch {}
    }
    try {
      const db = await getIndexedDB();
      if (db) {
        const tx = db.transaction(STORE_NAME, "readwrite");
        tx.objectStore(STORE_NAME).clear();
      }
    } catch {}
  },

  evictTemporaryStorage() {
    try {
      // Clear non-critical search query cache items if localStorage quota is exceeded
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i);
        if (k && k.includes(":lookup:")) {
          localStorage.removeItem(k);
        }
      }
    } catch {}
  }
};

// -------------------------------------------------------------
// Smart Background Fetch with Render Cold-Start Retry & Dedupe
// -------------------------------------------------------------
export async function smartFetch(url, options = {}, config = {}) {
  const {
    timeoutMs = 75000, // 75s timeout accommodates Render free-tier cold-start
    retries = 2,       // 2 silent retries with backoff
    backoffs = [3000, 8000],
    validateResponse = (data) => data !== null && data !== undefined
  } = config;

  // In-flight Request Deduplication: avoid duplicate simultaneous calls to same URL
  const method = (options.method || "GET").toUpperCase();
  const dedupeKey = `${method}:${url}`;
  if (method === "GET" && inFlightRequests.has(dedupeKey)) {
    return inFlightRequests.get(dedupeKey);
  }

  const exec = async () => {
    let attempt = 0;
    while (attempt <= retries) {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeoutMs);

      try {
        const res = await fetch(url, {
          ...options,
          signal: controller.signal
        });
        clearTimeout(timer);

        if (res.status === 304) {
          return { notModified: true, status: 304, data: null };
        }

        if (res.ok) {
          const data = await res.json();
          if (validateResponse(data)) {
            return { success: true, status: res.status, data };
          }
        }

        // On 401 Unauthorized: Do not retry, report immediately
        if (res.status === 401) {
          return { error: true, status: 401, unauthorized: true, data: null };
        }
      } catch (err) {
        clearTimeout(timer);
      }

      attempt++;
      if (attempt <= retries) {
        const delay = backoffs[attempt - 1] || 3000;
        await new Promise((r) => setTimeout(r, delay));
      }
    }

    return { error: true, data: null };
  };

  const promise = exec().finally(() => {
    inFlightRequests.delete(dedupeKey);
  });

  if (method === "GET") {
    inFlightRequests.set(dedupeKey, promise);
  }

  return promise;
}

// Backward compatible export for appCache interface
export const appCache = {
  get(key, fallback = null) {
    return CacheManager.getSync(key, fallback);
  },
  getWithMeta(key, fallback = null) {
    return CacheManager.getWithMetaSync(key, fallback);
  },
  set(key, data) {
    CacheManager.set(key, data);
  },
  has(key) {
    return CacheManager.has(key);
  },
  remove(key) {
    CacheManager.remove(key);
  },
  delete(key) {
    CacheManager.remove(key);
  },
  clearUserData() {
    CacheManager.clearAll();
  },
  clear() {
    CacheManager.clearAll();
  }
};

// Backward compatible export for silentFetch
export async function silentFetch(url, options = {}, timeoutMs = 35000) {
  const res = await smartFetch(url, options, { timeoutMs, retries: 1 });
  if (res.notModified) return { notModified: true, status: 304, data: null };
  if (res.unauthorized) return { notModified: false, status: 401, error: true, data: null };
  if (res.success) return { notModified: false, status: res.status, data: res.data };
  return { notModified: false, error: true, data: null };
}
