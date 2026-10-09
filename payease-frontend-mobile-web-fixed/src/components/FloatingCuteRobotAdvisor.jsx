import { useState } from "react";

/**
 * FloatingCuteRobotAdvisor
 * 
 * Clean, minimal floating AI advisor using user's 3D robot image.
 * - Zero extra text/badges.
 * - Floats in bottom-right corner, stays fixed across scroll.
 * - Click robot -> opens AI Advisor chat (onOpen).
 * - Click '✕' -> robot hides completely off-screen, left hand deeply tucked with only a subtle hint peeking out (no white background box).
 * - Click peeking hand -> robot springs back into view.
 */
export default function FloatingCuteRobotAdvisor({ onOpen, isOpen }) {
  const [isPeek, setIsPeek] = useState(false);

  // When full AI chat sheet is open, hide floating widget
  if (isOpen) return null;

  return (
    <div className="fixed bottom-24 sm:bottom-8 right-2 sm:right-5 z-40 select-none pointer-events-auto">
      {/* 1. FULL ROBOT (Visible when not tucked) */}
      <div
        className={`relative transition-all duration-400 ease-[cubic-bezier(0.34,1.56,0.64,1)] ${
          isPeek
            ? "translate-x-[calc(100%+40px)] opacity-0 pointer-events-none scale-90"
            : "translate-x-0 opacity-100 scale-100"
        }`}
        style={{ willChange: "transform, opacity" }}
      >
        {/* Subtle close button '✕' to tuck away */}
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            setIsPeek(true);
          }}
          aria-label="Screen side me chupayein"
          className="absolute -top-1 -left-1 z-20 w-5 h-5 rounded-full bg-slate-900/80 hover:bg-slate-900 text-white flex items-center justify-center text-[10px] font-black shadow-md border border-white/60 transition active:scale-75 cursor-pointer"
          title="Chupayein"
        >
          ✕
        </button>

        {/* Robot Image (Click to open chat) */}
        <div
          onClick={onOpen}
          className="cursor-pointer relative group transition-transform duration-200 hover:scale-105 active:scale-95"
          title="AI Advisor"
        >
          {/* Soft ambient glow */}
          <div className="absolute inset-2 bg-cyan-400/30 rounded-full blur-md group-hover:bg-cyan-400/50 transition pointer-events-none" />

          <img
            src="/ai-robot.png"
            alt="AI Advisor Robot"
            className="w-16 h-16 sm:w-20 sm:h-20 object-contain drop-shadow-[0_8px_16px_rgba(34,211,238,0.35)] relative z-10"
            draggable={false}
          />
        </div>
      </div>

      {/* 2. PEEKING LEFT HAND ONLY (Deeply tucked into right edge, no white bg box) */}
      <div
        onClick={() => setIsPeek(false)}
        title="AI Sahayak"
        aria-label="AI Sahayak"
        className={`fixed bottom-28 sm:bottom-12 right-0 z-40 cursor-pointer transition-all duration-300 ease-out select-none flex items-center ${
          isPeek
            ? "translate-x-[60%] opacity-90 hover:translate-x-[45%] hover:opacity-100 scale-95 hover:scale-105 active:scale-90"
            : "translate-x-full opacity-0 pointer-events-none scale-75"
        }`}
      >
        <img
          src="/ai-robot-hand-left.png"
          alt="AI Hand"
          className="w-7 h-7 sm:w-8 sm:h-8 object-contain drop-shadow-[0_2px_10px_rgba(34,211,238,0.7)] animate-pulse"
          draggable={false}
        />
      </div>
    </div>
  );
}
