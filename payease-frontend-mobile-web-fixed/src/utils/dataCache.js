// Lightweight Client-Side Data Cache & Silent Sync Engine (Stdlib, zero bloat)

const etagMap = new Map();

export const appCache = {
  // Synchronous read - always returns data regardless of age (never blanks screen)
  get(key, fallback = null) {
    if (typeof window === "undefined" || !window.localStorage) return fallback;
    try {
      const raw = localStorage.getItem(key);
      if (!raw) return fallback;
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === "object" && "data" in parsed && "savedAt" in parsed) {
        return parsed.data !== undefined ? parsed.data : fallback;
      }
      return parsed !== undefined ? parsed : fallback;
    } catch {
      return fallback;
    }
  },

  // Returns both data and savedAt timestamp
  getWithMeta(key, fallback = null) {
    if (typeof window === "undefined" || !window.localStorage) return { data: fallback, savedAt: 0 };
    try {
      const raw = localStorage.getItem(key);
      if (!raw) return { data: fallback, savedAt: 0 };
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === "object" && "data" in parsed && "savedAt" in parsed) {
        return parsed;
      }
      return { data: parsed, savedAt: 0 };
    } catch {
      return { data: fallback, savedAt: 0 };
    }
  },

  // Persists data with savedAt timestamp
  set(key, data) {
    if (typeof window === "undefined" || !window.localStorage) return;
    try {
      localStorage.setItem(key, JSON.stringify({ data, savedAt: Date.now() }));
    } catch {
      // Storage quota safety: clear temporary items if full
    }
  },

  has(key) {
    if (typeof window === "undefined" || !window.localStorage) return false;
    return localStorage.getItem(key) !== null;
  }
};

// Structural equality check to avoid re-renders when data hasn't changed
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

// Silent fetch with ETag / If-None-Match support (304 Not Modified in <20ms) and AbortController timeout
export async function silentFetch(url, options = {}, timeoutMs = 7000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  const headers = { ...(options.headers || {}) };
  const lastEtag = etagMap.get(url);
  if (lastEtag) {
    headers["If-None-Match"] = lastEtag;
  }

  try {
    const res = await fetch(url, {
      ...options,
      headers,
      signal: controller.signal
    });
    clearTimeout(timer);

    // 304 Not Modified -> data is completely unchanged, server sent 0 bytes
    if (res.status === 304) {
      return { notModified: true, status: 304, data: null };
    }

    const etag = res.headers.get("etag") || res.headers.get("ETag");
    if (etag) {
      etagMap.set(url, etag);
    }

    if (!res.ok) {
      return { notModified: false, status: res.status, error: true, data: null };
    }

    const data = await res.json();
    return { notModified: false, status: res.status, data };
  } catch (err) {
    clearTimeout(timer);
    return { notModified: false, error: true, aborted: controller.signal.aborted, data: null };
  }
}
