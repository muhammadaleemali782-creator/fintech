import React, { useState, useEffect, useRef } from "react";
import { API } from "../config";

export default function SplashTapGame({ onFinish }) {
  const [score, setScore] = useState(0);
  const [tapCount, setTapCount] = useState(0);
  const [particles, setParticles] = useState([]);
  const [progress, setProgress] = useState(0);
  const [isCoinBouncing, setIsCoinBouncing] = useState(false);
  const [isFadingOut, setIsFadingOut] = useState(false);

  // Silently wake up the Render backend in background while user plays!
  useEffect(() => {
    try {
      const backendBase = API.replace(/\/api$/, "");
      fetch(`${backendBase}/health`, { mode: "no-cors" }).catch(() => {});
    } catch {}
  }, []);

  // Smooth progress bar to auto-load after ~2.6 seconds
  useEffect(() => {
    const startTime = Date.now();
    const duration = 2600;

    const interval = setInterval(() => {
      const elapsed = Date.now() - startTime;
      const pct = Math.min(100, Math.floor((elapsed / duration) * 100));
      setProgress(pct);

      if (pct >= 100) {
        clearInterval(interval);
      }
    }, 50);

    return () => clearInterval(interval);
  }, []);

  const handleFinish = () => {
    if (isFadingOut) return;
    setIsFadingOut(true);
    setTimeout(() => {
      if (onFinish) onFinish();
    }, 350);
  };

  const handleTap = (e) => {
    e.preventDefault();
    setIsCoinBouncing(true);
    setTimeout(() => setIsCoinBouncing(false), 180);

    // Vibration haptic
    if (typeof navigator !== "undefined" && navigator.vibrate) {
      try { navigator.vibrate(20); } catch {}
    }

    const rewardOptions = [10, 20, 50, 100, 250, 500];
    const reward = rewardOptions[Math.floor(Math.random() * rewardOptions.length)];
    const emojiList = ["🪙", "💸", "💰", "✨", "⭐", "🎉"];
    const emoji = emojiList[Math.floor(Math.random() * emojiList.length)];

    const angle = (Math.random() * 360) * (Math.PI / 180);
    const distance = 50 + Math.random() * 60;
    const tx = Math.cos(angle) * distance;
    const ty = -Math.abs(Math.sin(angle) * distance) - 30; // pop upwards

    const id = Date.now() + Math.random();
    const newParticle = {
      id,
      text: `+₹${reward}`,
      emoji,
      tx,
      ty,
    };

    setScore((prev) => prev + reward);
    setTapCount((prev) => prev + 1);
    setParticles((prev) => [...prev.slice(-14), newParticle]);

    setTimeout(() => {
      setParticles((prev) => prev.filter((p) => p.id !== id));
    }, 800);
  };

  const getMilestoneBadge = () => {
    if (tapCount >= 20) return { title: "👑 FinTech Sultan!", color: "from-amber-400 to-yellow-500 text-slate-950" };
    if (tapCount >= 12) return { title: "🚀 Ambani Mode Active!", color: "from-purple-400 to-indigo-500 text-white" };
    if (tapCount >= 6) return { title: "💸 Paisa Hi Paisa Hoga!", color: "from-emerald-400 to-teal-500 text-slate-950" };
    if (tapCount >= 1) return { title: "🪙 Shubh Shuruwat!", color: "from-blue-400 to-cyan-500 text-slate-950" };
    return { title: "👆 Sikke par tap karke cash nikalo!", color: "from-slate-700 to-slate-800 text-slate-300" };
  };

  const milestone = getMilestoneBadge();

  return (
    <div
      className={`fixed inset-0 z-[999999] bg-gradient-to-b from-slate-950 via-slate-900 to-black text-white flex flex-col justify-between items-center p-4 sm:p-6 select-none overflow-hidden transition-opacity duration-350 ${
        isFadingOut ? "opacity-0 pointer-events-none scale-105" : "opacity-100"
      }`}
    >
      {/* SHATTER LOGO AT TOP */}
      <div className="flex flex-col items-center pt-2 sm:pt-4">
        <style>{`
          @keyframes appShatterTL {
            0%, 100% { transform: translate(0, 0) rotate(0deg); opacity: 1; }
            30%, 45% { transform: translate(-22px, -18px) rotate(-22deg); opacity: 0.85; }
            72% { transform: translate(0, 0) rotate(0deg); opacity: 1; }
          }
          @keyframes appShatterTR {
            0%, 100% { transform: translate(0, 0) rotate(0deg); opacity: 1; }
            30%, 45% { transform: translate(22px, -18px) rotate(22deg); opacity: 0.85; }
            72% { transform: translate(0, 0) rotate(0deg); opacity: 1; }
          }
          @keyframes appShatterBL {
            0%, 100% { transform: translate(0, 0) rotate(0deg); opacity: 1; }
            30%, 45% { transform: translate(-18px, 20px) rotate(-18deg); opacity: 0.85; }
            72% { transform: translate(0, 0) rotate(0deg); opacity: 1; }
          }
          @keyframes appShatterBR {
            0%, 100% { transform: translate(0, 0) rotate(0deg); opacity: 1; }
            30%, 45% { transform: translate(18px, 20px) rotate(18deg); opacity: 0.85; }
            72% { transform: translate(0, 0) rotate(0deg); opacity: 1; }
          }
          @keyframes appCorePulse {
            0%, 100% { transform: scale(1); opacity: 0.8; }
            35% { transform: scale(1.5); opacity: 1; filter: drop-shadow(0 0 10px #38bdf8); }
            72% { transform: scale(1); opacity: 0.8; }
          }
          @keyframes floatUpFade {
            0% { transform: translate(0, 0) scale(0.6); opacity: 1; }
            100% { transform: translate(var(--tx), var(--ty)) scale(1.3); opacity: 0; }
          }
          .anim-shard-tl { animation: appShatterTL 1.6s cubic-bezier(0.4, 0, 0.2, 1) infinite; }
          .anim-shard-tr { animation: appShatterTR 1.6s cubic-bezier(0.4, 0, 0.2, 1) infinite; }
          .anim-shard-bl { animation: appShatterBL 1.6s cubic-bezier(0.4, 0, 0.2, 1) infinite; }
          .anim-shard-br { animation: appShatterBR 1.6s cubic-bezier(0.4, 0, 0.2, 1) infinite; }
          .anim-core { animation: appCorePulse 1.6s ease-in-out infinite; }
          .particle-pop { animation: floatUpFade 0.8s cubic-bezier(0.16, 1, 0.3, 1) forwards; }
        `}</style>

        <svg className="w-16 h-16 sm:w-20 sm:h-20 overflow-visible" viewBox="0 0 100 100" fill="none">
          <defs>
            <linearGradient id="gTL" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor="#38bdf8" />
              <stop offset="100%" stopColor="#2563eb" />
            </linearGradient>
            <linearGradient id="gTR" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor="#60a5fa" />
              <stop offset="100%" stopColor="#4f46e5" />
            </linearGradient>
            <linearGradient id="gBL" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor="#0284c7" />
              <stop offset="100%" stopColor="#1d4ed8" />
            </linearGradient>
            <linearGradient id="gBR" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor="#4338ca" />
              <stop offset="100%" stopColor="#06b6d4" />
            </linearGradient>
          </defs>
          <path className="anim-shard-tl" style={{ transformBox: "fill-box", transformOrigin: "center" }} d="M 50 6 L 14 26 L 36 50 L 50 44 Z" fill="url(#gTL)" stroke="#7dd3fc" strokeWidth="1.2" />
          <path className="anim-shard-tr" style={{ transformBox: "fill-box", transformOrigin: "center" }} d="M 50 6 L 86 26 L 64 50 L 50 44 Z" fill="url(#gTR)" stroke="#93c5fd" strokeWidth="1.2" />
          <path className="anim-shard-bl" style={{ transformBox: "fill-box", transformOrigin: "center" }} d="M 14 26 L 36 50 L 50 94 L 24 68 Z" fill="url(#gBL)" stroke="#38bdf8" strokeWidth="1.2" />
          <path className="anim-shard-br" style={{ transformBox: "fill-box", transformOrigin: "center" }} d="M 86 26 L 64 50 L 50 94 L 76 68 Z" fill="url(#gBR)" stroke="#22d3ee" strokeWidth="1.2" />
          <circle className="anim-core" cx="50" cy="50" r="7" fill="#ffffff" stroke="#38bdf8" strokeWidth="2" style={{ transformBox: "fill-box", transformOrigin: "center" }} />
        </svg>

        <h1 className="text-sm sm:text-base font-black tracking-widest uppercase bg-gradient-to-r from-white via-sky-200 to-blue-300 bg-clip-text text-transparent mt-2">
          Educa Fintech
        </h1>
      </div>

      {/* INTERACTIVE TAP-TO-POP COIN GAME */}
      <div className="flex flex-col items-center justify-center my-auto w-full max-w-sm relative">
        {/* Loot Score Display */}
        <div className="mb-4 text-center">
          <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-slate-800/80 border border-slate-700/80 shadow-inner mb-2">
            <span className="text-xs">💰</span>
            <span className="text-xs font-semibold text-slate-300">Tap Bonus Looted:</span>
            <span className="text-sm font-black text-amber-400 font-mono">₹{score.toLocaleString("en-IN")}</span>
          </div>

          <div>
            <span className={`inline-block px-3 py-0.5 rounded-full text-[11px] font-black uppercase tracking-wider bg-gradient-to-r shadow-md transition-all ${milestone.color}`}>
              {milestone.title}
            </span>
          </div>
        </div>

        {/* TAP TARGET COIN */}
        <div className="relative flex items-center justify-center">
          {/* Floating popped money particles */}
          {particles.map((p) => (
            <div
              key={p.id}
              className="absolute pointer-events-none particle-pop flex items-center gap-1 z-30"
              style={{
                "--tx": `${p.tx}px`,
                "--ty": `${p.ty}px`,
              }}
            >
              <span className="text-lg filter drop-shadow">{p.emoji}</span>
              <span className="font-black text-sm font-mono text-amber-300 bg-black/70 px-1.5 py-0.5 rounded-md border border-amber-400/50 shadow-lg">
                {p.text}
              </span>
            </div>
          ))}

          {/* Golden Pulse Rings */}
          <div className="absolute inset-0 -m-6 rounded-full bg-amber-500/10 blur-xl animate-pulse pointer-events-none" />
          <div className="absolute inset-0 -m-2 rounded-full border-2 border-amber-400/30 animate-ping pointer-events-none opacity-30" />

          {/* Interactive Golden Coin Button */}
          <button
            type="button"
            onClick={handleTap}
            className={`relative group w-32 h-32 sm:w-36 sm:h-36 rounded-full bg-gradient-to-br from-yellow-300 via-amber-500 to-yellow-600 p-1.5 shadow-[0_0_35px_rgba(245,158,11,0.45)] border-4 border-yellow-200 cursor-pointer transition-transform duration-150 flex items-center justify-center ${
              isCoinBouncing ? "scale-90 rotate-[-4deg]" : "hover:scale-105 active:scale-95"
            }`}
          >
            <div className="w-full h-full rounded-full bg-gradient-to-tr from-amber-600 via-yellow-500 to-amber-300 border-2 border-dashed border-amber-200/80 flex flex-col items-center justify-center shadow-inner">
              <span className="text-4xl sm:text-5xl font-black text-yellow-950 filter drop-shadow-[0_2px_4px_rgba(255,255,255,0.4)]">
                ₹
              </span>
              <span className="text-[10px] font-black tracking-widest uppercase text-yellow-950/90 mt-0.5">
                TAP ME!
              </span>
            </div>
          </button>
        </div>

        <p className="text-xs text-slate-400 font-medium text-center mt-5">
          {tapCount === 0 ? "👆 Sikke par baar-baar click karke paisa nikalo!" : `🔥 ${tapCount} Taps kiye! Har click par paisa nikal raha hai!`}
        </p>
      </div>

      {/* FOOTER: PROGRESS BAR & ENTER BUTTON */}
      <div className="w-full max-w-sm flex flex-col items-center space-y-3 pb-2 sm:pb-4">
        {/* Progress status */}
        <div className="w-full space-y-1.5">
          <div className="flex justify-between items-center text-[11px] text-slate-400 font-medium px-1">
            <span className="flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-ping inline-block" />
              <span>Backend wakeup & data ready...</span>
            </span>
            <span className="font-mono font-bold text-sky-400">{progress}%</span>
          </div>

          {/* Bar */}
          <div className="w-full h-2 bg-slate-800 rounded-full overflow-hidden border border-slate-700/60 p-0.5">
            <div
              className="h-full bg-gradient-to-r from-sky-400 via-blue-500 to-emerald-400 rounded-full transition-all duration-100 shadow-[0_0_8px_rgba(56,189,248,0.7)]"
              style={{ width: `${progress}%` }}
            />
          </div>
        </div>

        {/* Enter App Button */}
        <button
          type="button"
          onClick={handleFinish}
          className="w-full py-3 px-5 rounded-2xl bg-gradient-to-r from-blue-600 via-indigo-600 to-emerald-600 hover:from-blue-500 hover:to-emerald-500 active:scale-95 text-white text-xs sm:text-sm font-extrabold shadow-lg shadow-blue-500/25 transition cursor-pointer flex items-center justify-center gap-2"
        >
          <span>🚀 Enter App Now</span>
          <span className="text-xs bg-white/20 px-2 py-0.5 rounded-full font-mono">
            {score > 0 ? `+₹${score}` : "Direct"} →
          </span>
        </button>
      </div>
    </div>
  );
}
