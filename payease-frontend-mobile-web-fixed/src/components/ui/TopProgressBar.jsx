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
    return () => {
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
      className="fixed top-0 left-0 right-0 h-[3px] z-[9999] pointer-events-none select-none transition-all duration-200"
      style={{
        opacity: visible ? 1 : 0
      }}
    >
      <div
        className="h-full bg-gradient-to-r from-blue-500 via-cyan-400 to-indigo-600 shadow-[0_0_10px_rgba(59,130,246,0.8)] transition-all duration-200 ease-out"
        style={{
          width: `${progress}%`
        }}
      />
    </div>
  );
}
