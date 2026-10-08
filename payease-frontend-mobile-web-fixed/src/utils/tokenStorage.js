/**
 * Secure Token Storage Manager
 * Removes auth tokens from permanent localStorage to protect against persistent XSS token theft.
 * Uses sessionStorage (isolated per tab, cleared on close) and memory cache,
 * actively purging legacy tokens from localStorage.
 */

let inMemoryToken = null;

export const tokenStorage = {
  getToken: () => {
    if (inMemoryToken) return inMemoryToken;
    if (typeof window === 'undefined') return null;

    // Check sessionStorage
    try {
      const sessionTok = sessionStorage.getItem('token');
      if (sessionTok) {
        inMemoryToken = sessionTok;
        // Purge any lingering token from localStorage
        if (localStorage.getItem('token')) localStorage.removeItem('token');
        return sessionTok;
      }

      // One-time migration: If user had token in localStorage, migrate to sessionStorage then delete from localStorage
      const legacyTok = localStorage.getItem('token');
      if (legacyTok) {
        sessionStorage.setItem('token', legacyTok);
        localStorage.removeItem('token');
        inMemoryToken = legacyTok;
        return legacyTok;
      }
    } catch (e) {
      // Fallback to inMemoryToken if storage is blocked
    }
    return null;
  },

  setToken: (token) => {
    inMemoryToken = token;
    if (typeof window === 'undefined') return;
    try {
      if (token) {
        sessionStorage.setItem('token', token);
      } else {
        sessionStorage.removeItem('token');
      }
      // Guarantee token is NOT in localStorage
      localStorage.removeItem('token');
    } catch (e) {
      // Storage unavailable fallback
    }
  },

  removeToken: () => {
    inMemoryToken = null;
    if (typeof window === 'undefined') return;
    try {
      sessionStorage.removeItem('token');
      localStorage.removeItem('token');
    } catch (e) {}
  },

  hasToken: () => {
    return Boolean(tokenStorage.getToken());
  }
};
