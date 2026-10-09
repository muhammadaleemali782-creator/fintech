/**
 * Token Storage Manager
 * Stores auth token in persistent localStorage so session survives app close,
 * background kills, and phone restarts until user explicitly logs out.
 */

let inMemoryToken = null;

export const tokenStorage = {
  getToken: () => {
    if (inMemoryToken) return inMemoryToken;
    if (typeof window === "undefined") return null;

    try {
      // 1. Primary: Persistent localStorage
      const localTok = localStorage.getItem("token");
      if (localTok) {
        inMemoryToken = localTok;
        return localTok;
      }

      // 2. Fallback: sessionStorage
      const sessionTok = sessionStorage.getItem("token");
      if (sessionTok) {
        inMemoryToken = sessionTok;
        try {
          localStorage.setItem("token", sessionTok);
        } catch (_) {}
        return sessionTok;
      }
    } catch (e) {}
    return null;
  },

  setToken: (token) => {
    inMemoryToken = token;
    if (typeof window === "undefined") return;
    try {
      if (token) {
        localStorage.setItem("token", token);
        sessionStorage.setItem("token", token);
      } else {
        localStorage.removeItem("token");
        sessionStorage.removeItem("token");
      }
    } catch (e) {}
  },

  removeToken: () => {
    inMemoryToken = null;
    if (typeof window === "undefined") return;
    try {
      localStorage.removeItem("token");
      sessionStorage.removeItem("token");
    } catch (e) {}
  },

  hasToken: () => {
    return Boolean(tokenStorage.getToken());
  }
};
