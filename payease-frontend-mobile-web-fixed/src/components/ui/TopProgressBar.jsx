import { useEffect, useState, useRef } from "react";
import { useLocation } from "react-router-dom";

export default function TopProgressBar() {
  const location = useLocation();
  const [progress, setProgress] = useState(0);
  const [visible, setVisible] = useState(false);
  const timerRef = useRef(null);

  const start = () => {
    setVisible(true);
    setProgress(30);
    if (timerRef.current) clearInterval(timerRef.current);
    timerRef.current = setInterval(() => {
      setProgress((prev) => {
        if (prev >= 85) {
          clearInterval(timerRef.current);
          return 85;
        }
        return prev + 15;
      });
    }, 120);
  };

  const done = () => {
    if (timerRef.current) clearInterval(timerRef.current);
    setProgress(100);
    setTimeout(() => {
      setVisible(false);
      setProgress(0);
    }, 250);
  };

  // Expose global triggers for API fetches, file uploads, etc.
  useEffect(() => {
    window.__startTopProgress = start;
    window.__doneTopProgress = done;

    // Lightweight fetch interceptor for foreground network actions across website & app
    let pendingCount = 0;
    const originalFetch = window.fetch;

    window.fetch = async function (...args) {
      const url = typeof args[0] === "string" ? args[0] : args[0]?.url || "";
      const isBackground =
        url.includes("/bootstrap/pulse") ||
        url.includes("/pulse") ||
        args[1]?.headers?.["x-silent"];

      if (!isBackground) {
        pendingCount++;
        if (pendingCount === 1) {
          start();
        }
      }

      try {
        const response = await originalFetch.apply(this, args);
        return response;
      } finally {
        if (!isBackground) {
          pendingCount = Math.max(0, pendingCount - 1);
          if (pendingCount === 0) {
            done();
          }
        }
      }
    };

    return () => {
      window.fetch = originalFetch;
      delete window.__startTopProgress;
      delete window.__doneTopProgress;
    };
  }, []);

  // Trigger on route change
  useEffect(() => {
    start();
    const t = setTimeout(() => {
      done();
    }, 180);
    return () => clearTimeout(t);
  }, [location.pathname, location.search]);

  if (!visible && progress === 0) return null;

  return (
    <div
      className="fixed top-0 left-0 right-0 h-[3px] z-[99999999] pointer-events-none select-none transition-all duration-200"
      style={{
        opacity: visible ? 1 : 0
      }}
    >
      <div
        className="h-full bg-gradient-to-r from-blue-600 via-cyan-400 to-indigo-600 shadow-[0_0_12px_rgba(37,99,235,0.9)] transition-all duration-200 ease-out"
        style={{
          width: `${progress}%`
        }}
      />
    </div>
  );
}
