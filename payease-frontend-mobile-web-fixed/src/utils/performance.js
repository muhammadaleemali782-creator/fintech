import { useState, useEffect, useRef, useCallback } from "react";

/**
 * Standard debounce utility
 * Delays invoking func until after wait milliseconds have elapsed since the last time it was invoked.
 */
export function debounce(func, wait = 300) {
  let timeout;
  return function executedFunction(...args) {
    const later = () => {
      clearTimeout(timeout);
      func(...args);
    };
    clearTimeout(timeout);
    timeout = setTimeout(later, wait);
  };
}

/**
 * Standard throttle utility
 * Limits the rate at which func can fire over a period of time.
 */
export function throttle(func, limit = 200) {
  let inThrottle = false;
  return function (...args) {
    if (!inThrottle) {
      func.apply(this, args);
      inThrottle = true;
      setTimeout(() => {
        inThrottle = false;
      }, limit);
    }
  };
}

/**
 * React Hook: useDebounce
 * Useful for search bars, filters, and text inputs to prevent recalculation or API spam on every keystroke.
 */
export function useDebounce(value, delay = 250) {
  const [debouncedValue, setDebouncedValue] = useState(value);

  useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedValue(value);
    }, delay);

    return () => {
      clearTimeout(handler);
    };
  }, [value, delay]);

  return debouncedValue;
}

/**
 * React Hook: useActionLock
 * Guarantees that any critical async action (payment, submit, approval, request) cannot be triggered twice
 * while in-flight or within a safety cooldown window (prevents double-tap bugs).
 */
export function useActionLock(cooldownMs = 400) {
  const isLockedRef = useRef(false);
  const [isPending, setIsPending] = useState(false);

  const execute = useCallback(
    async (asyncAction) => {
      if (isLockedRef.current) {
        return { locked: true };
      }

      isLockedRef.current = true;
      setIsPending(true);

      try {
        const result = await asyncAction();
        return { locked: false, result };
      } catch (error) {
        throw error;
      } finally {
        setTimeout(() => {
          isLockedRef.current = false;
          setIsPending(false);
        }, cooldownMs);
      }
    },
    [cooldownMs]
  );

  return { execute, isPending, isLocked: isLockedRef.current };
}

/**
 * Optimistic UI update helper
 * Applies the state change instantly (<1ms), runs backend API in background,
 * and automatically rolls back to previous state if API call fails.
 */
export async function optimisticUpdate(setter, optimisticVal, asyncAction, onError) {
  let previousVal;
  setter((prev) => {
    previousVal = prev;
    return typeof optimisticVal === "function" ? optimisticVal(prev) : optimisticVal;
  });

  try {
    return await asyncAction();
  } catch (err) {
    // Rollback state immediately on failure
    setter(previousVal);
    if (onError) onError(err);
    throw err;
  }
}

/**
 * Route / Chunk prefetcher for faster navigation
 */
export function prefetchChunk(importPromiseFn) {
  if (typeof window !== "undefined" && "requestIdleCallback" in window) {
    window.requestIdleCallback(() => {
      importPromiseFn().catch(() => {});
    });
  } else {
    setTimeout(() => {
      importPromiseFn().catch(() => {});
    }, 100);
  }
}
