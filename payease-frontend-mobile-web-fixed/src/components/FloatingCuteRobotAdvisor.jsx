import { useState, useEffect } from "react";

/**
 * FloatingCuteRobotAdvisor
 * 
 * Floating 24/7 AI Advisor widget designed according to /animate & /awesome-design-md.
 * - Floats in bottom-right corner, stays fixed across scroll.
 * - Click robot body -> opens AI Advisor chat (onOpen).
 * - Click '✕' button -> slides off-screen into the right margin, leaving a cute waving hand peeking out.
 * - Click peeking hand -> springs back into full view with delightful bounce animation.
 */
export default function FloatingCuteRobotAdvisor({ onOpen, isOpen }) {
  const [isPeek, setIsPeek] = useState(false);
  const [showSpeechBubble, setShowSpeechBubble] = useState(true);

  // Auto-hide speech bubble on scroll or after 8 seconds of idle to keep UI clean
  useEffect(() => {
    const timer = setTimeout(() => {
      setShowSpeechBubble(false);
    }, 8000);
    return () => clearTimeout(timer);
  }, []);

  // When AI chat sheet is open, tuck robot away
  if (isOpen) return null;

  return (
    <div
      className={`fixed bottom-24 sm:bottom-8 right-3 sm:right-6 z-40 transition-transform duration-500 ease-[cubic-bezier(0.34,1.56,0.64,1)] select-none ${
        isPeek ? "translate-x-[calc(100%-34px)]" : "translate-x-0"
      }`}
      style={{ willChange: "transform" }}
    >
      <div className="relative flex items-end">
        {/* 1. SPEECH BUBBLE (Visible only when not in peek mode) */}
        {!isPeek && (
          <div
            onClick={onOpen}
            className={`cursor-pointer mr-2.5 mb-2 px-3 py-1.5 bg-white/95 backdrop-blur-md rounded-2xl shadow-lg border border-cyan-100/90 text-left transition-all duration-300 hover:scale-105 active:scale-95 group ${
              showSpeechBubble ? "opacity-100 translate-y-0" : "opacity-90 hover:opacity-100"
            }`}
          >
            <div className="flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
              <p className="text-[11px] font-black tracking-tight text-slate-800 flex items-center gap-1">
                Kuch bhi poochhein! <span className="text-amber-500">✨</span>
              </p>
            </div>
            <p className="text-[9px] font-semibold text-cyan-700 font-mono mt-0.5">
              24/7 AI Sahayak
            </p>

            {/* Bubble arrow pointing to robot */}
            <div className="absolute right-[-6px] bottom-3 w-0 h-0 border-t-[5px] border-t-transparent border-b-[5px] border-b-transparent border-l-[6px] border-l-white/95" />
          </div>
        )}

        {/* 2. MAIN ROBOT CONTAINER */}
        <div className="relative group">
          {/* Close / Dismiss Button (Small pill on top right) */}
          {!isPeek && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                setIsPeek(true);
              }}
              aria-label="Tuck robot away"
              className="absolute -top-2 -left-2 z-10 w-5 h-5 rounded-full bg-slate-800/80 hover:bg-slate-900 text-white flex items-center justify-center text-[10px] font-black shadow-md border border-white/40 transition active:scale-75 cursor-pointer"
              title="Screen side me chupayein"
            >
              ✕
            </button>
          )}

          {/* CUTE ROBOT BODY (Click to Open AI Advisor) */}
          <div
            onClick={() => {
              if (isPeek) {
                setIsPeek(false);
              } else {
                onOpen();
              }
            }}
            className={`cursor-pointer relative flex items-center justify-center transition-all duration-300 ${
              isPeek ? "hover:scale-110 active:scale-95" : "hover:scale-105 active:scale-95"
            }`}
          >
            {/* Soft Ambient Glow */}
            <div className="absolute inset-0 bg-gradient-to-r from-cyan-400 to-blue-500 rounded-full blur-md opacity-35 group-hover:opacity-55 transition" />

            {/* ROBOT SVG / AVATAR */}
            <div className="relative w-14 h-14 sm:w-16 sm:h-16 rounded-2xl bg-gradient-to-b from-white via-slate-50 to-cyan-50 border-2 border-white shadow-xl shadow-cyan-500/25 flex flex-col items-center justify-center p-1.5 overflow-hidden">
              {/* Antenna with Glowing LED Orb */}
              <div className="absolute -top-0.5 flex flex-col items-center">
                <div className="w-2 h-2 rounded-full bg-cyan-400 shadow-[0_0_8px_rgba(34,211,238,0.9)] animate-ping" />
                <div className="w-0.5 h-1.5 bg-slate-300" />
              </div>

              {/* Robot Face Screen / Visor */}
              <div className="w-10 h-7 sm:w-12 sm:h-8 bg-slate-900 rounded-xl flex items-center justify-center gap-2 px-1.5 border border-cyan-400/40 shadow-inner relative overflow-hidden mt-1.5">
                {/* Glowing Eyes */}
                <div className="w-2 h-2.5 sm:w-2.5 sm:h-3 rounded-full bg-cyan-400 shadow-[0_0_6px_#22d3ee] animate-pulse" />
                <div className="w-2 h-2.5 sm:w-2.5 sm:h-3 rounded-full bg-cyan-400 shadow-[0_0_6px_#22d3ee] animate-pulse" />

                {/* Subtle digital scanline */}
                <div className="absolute inset-0 bg-gradient-to-b from-transparent via-cyan-400/10 to-transparent pointer-events-none opacity-40 animate-pulse" />
              </div>

              {/* Cute Metallic Chest Badge */}
              <div className="mt-1 flex items-center gap-0.5">
                <span className="w-1 h-1 rounded-full bg-emerald-500" />
                <span className="text-[7px] font-black text-cyan-700 tracking-tighter uppercase font-mono">
                  EDUCA AI
                </span>
                <span className="w-1 h-1 rounded-full bg-emerald-500" />
              </div>
            </div>

            {/* 3. PEEKING HAND (Always anchored on the left side of the robot, visible when tucked off-screen) */}
            <div
              onClick={(e) => {
                e.stopPropagation();
                setIsPeek(false);
              }}
              title="AI Sahayak se baat karein"
              className={`absolute -left-3 top-1/2 -translate-y-1/2 flex items-center cursor-pointer transition-all ${
                isPeek ? "opacity-100 scale-110" : "opacity-0 pointer-events-none"
              }`}
            >
              {/* Cute Waving Arm & Hand */}
              <div className="flex items-center bg-white/95 border border-cyan-300 shadow-lg px-2 py-1.5 rounded-l-full gap-1 animate-pulse hover:bg-cyan-50">
                <span className="text-base sm:text-lg inline-block animate-bounce" style={{ transformOrigin: "bottom right" }}>
                  👋
                </span>
                <span className="text-[9px] font-black text-cyan-800 font-mono tracking-tight pr-0.5">
                  AI
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
