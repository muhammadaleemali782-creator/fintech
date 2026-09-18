import { useState, useEffect } from "react";

export default function EvervaultCardScanner({ onApply }) {
  const [activeIndex, setActiveIndex] = useState(0);

  const cardDefs = [
    {
      id: "savings",
      type: "12% SAVINGS ACCOUNT",
      badge: "WORLD'S HIGHEST",
      bg: "linear-gradient(135deg, #0F2027 0%, #203A43 50%, #2C5364 100%)",
      accent: "#00E5FF",
      name: "12% Interest Savings",
      tagline: "No bank in the world offers 12% on savings",
      number: "•••• •••• •••• 1200",
      valid: "PERPETUAL",
      icon: "🏦",
    },
    {
      id: "recharge",
      type: "₹199 RECHARGE MICRO LOAN",
      badge: "ZERO CIBIL NEEDED",
      bg: "linear-gradient(135deg, #1A1C29 0%, #162447 60%, #1F4068 100%)",
      accent: "#00F5D4",
      name: "Mobile Recharge Loan",
      tagline: "Instant ₹199 UPI credit for your phone",
      number: "•••• •••• •••• 0199",
      valid: "INSTANT",
      icon: "📱",
    },
    {
      id: "bike",
      type: "BIKE & VEHICLE LOAN",
      badge: "UP TO ₹1,50,000",
      bg: "linear-gradient(135deg, #232526 0%, #414345 100%)",
      accent: "#FFB703",
      name: "Two-Wheeler Easy EMI",
      tagline: "Apni bike ka sapna pura karein",
      number: "•••• •••• •••• 8840",
      valid: "36 MONTHS",
      icon: "🏍️",
    },
    {
      id: "school",
      type: "SCHOOL FEES LOAN",
      badge: "PARENT RELIEF",
      bg: "linear-gradient(135deg, #111E25 0%, #1D6AE5 100%)",
      accent: "#70E000",
      name: "Student Education EMI",
      tagline: "Direct school fee payment with 0% advance",
      number: "•••• •••• •••• 5521",
      valid: "QUARTERLY",
      icon: "🎒",
    },
    {
      id: "investment",
      type: "EDUCA WEALTH POOL",
      badge: "18% ANNUAL YIELD",
      bg: "linear-gradient(135deg, #141E30 0%, #243B55 100%)",
      accent: "#FF007F",
      name: "High-Yield Investment",
      tagline: "Earn monthly passive fintech returns",
      number: "•••• •••• •••• 9999",
      valid: "PREMIUM",
      icon: "📈",
    },
  ];

  // Auto-cycle through cards smoothly without canvas lag
  useEffect(() => {
    const timer = setInterval(() => {
      setActiveIndex((prev) => (prev + 1) % cardDefs.length);
    }, 4500);
    return () => clearInterval(timer);
  }, [cardDefs.length]);

  const activeCard = cardDefs[activeIndex];

  return (
    <div className="w-full bg-[#0A101D] py-8 sm:py-12 border-y border-white/5 relative overflow-hidden">
      {/* Background Ambient Glow */}
      <div
        className="absolute -top-24 left-1/2 -translate-x-1/2 w-96 h-96 rounded-full blur-3xl opacity-20 pointer-events-none transition-all duration-1000"
        style={{ backgroundColor: activeCard.accent }}
      />

      <div className="max-w-6xl mx-auto px-4 sm:px-6">
        {/* Header Badges */}
        <div className="flex flex-wrap items-center justify-between gap-3 mb-6">
          <div className="flex items-center gap-2">
            <span className="inline-block w-2.5 h-2.5 rounded-full bg-emerald-400 animate-pulse" />
            <span className="text-xs font-mono tracking-widest text-gray-300 uppercase">
              Educa Verified Digital Cards
            </span>
          </div>

          <div className="flex items-center gap-1.5">
            {cardDefs.map((c, idx) => (
              <button
                key={c.id}
                onClick={() => setActiveIndex(idx)}
                className={`h-2 rounded-full transition-all duration-300 ${
                  idx === activeIndex ? "w-8 bg-[#38BDF8]" : "w-2 bg-white/20 hover:bg-white/40"
                }`}
                aria-label={`Go to card ${idx + 1}`}
              />
            ))}
          </div>
        </div>

        {/* Featured Card + Quick Details Grid */}
        <div className="grid md:grid-cols-12 gap-6 items-center">
          {/* Card Visual with 3D Depth */}
          <div className="md:col-span-6 lg:col-span-5 flex justify-center">
            <div
              className="w-full max-w-sm h-56 sm:h-60 rounded-3xl p-6 text-white shadow-2xl relative flex flex-col justify-between transition-all duration-500 transform hover:scale-[1.02]"
              style={{
                background: activeCard.bg,
                border: `1px solid ${activeCard.accent}44`,
                boxShadow: `0 20px 40px -15px ${activeCard.accent}33`,
              }}
            >
              {/* Card Top: Logo & Type */}
              <div className="flex justify-between items-start">
                <div>
                  <span
                    className="text-[10px] font-extrabold uppercase px-2.5 py-1 rounded-full tracking-wider"
                    style={{ backgroundColor: `${activeCard.accent}22`, color: activeCard.accent }}
                  >
                    {activeCard.badge}
                  </span>
                  <p className="text-xs font-mono text-gray-300 mt-2 tracking-wider">
                    {activeCard.type}
                  </p>
                </div>
                <span className="text-3xl">{activeCard.icon}</span>
              </div>

              {/* Card Middle: Number */}
              <div>
                <p className="font-mono text-lg tracking-widest text-white/90 font-semibold">
                  {activeCard.number}
                </p>
              </div>

              {/* Card Bottom: Holder Name & Valid */}
              <div className="flex justify-between items-end text-xs">
                <div>
                  <p className="text-[9px] uppercase tracking-wider text-gray-400">Cardholder</p>
                  <p className="font-bold text-white tracking-wide text-sm">{activeCard.name}</p>
                </div>
                <div className="text-right">
                  <p className="text-[9px] uppercase tracking-wider text-gray-400">Status</p>
                  <p className="font-bold tracking-wide" style={{ color: activeCard.accent }}>
                    {activeCard.valid}
                  </p>
                </div>
              </div>
            </div>
          </div>

          {/* Card Info & Quick CTA */}
          <div className="md:col-span-6 lg:col-span-7 space-y-4">
            <div>
              <span className="text-xs font-mono uppercase tracking-widest text-[#38BDF8]">
                Featured Product
              </span>
              <h2 className="text-2xl sm:text-3xl font-extrabold text-white mt-1">
                {activeCard.name}
              </h2>
              <p className="text-sm text-gray-400 mt-2 leading-relaxed">
                {activeCard.tagline}. Open your account in 2 minutes with instant verification and guaranteed returns.
              </p>
            </div>

            <div className="flex flex-wrap gap-2 pt-2">
              {cardDefs.map((c, idx) => (
                <button
                  key={c.id}
                  onClick={() => setActiveIndex(idx)}
                  className={`px-3 py-1.5 rounded-xl text-xs font-medium transition ${
                    idx === activeIndex
                      ? "bg-white text-gray-900 font-bold shadow"
                      : "bg-white/5 text-gray-400 hover:bg-white/10 hover:text-white"
                  }`}
                >
                  {c.icon} {c.name.split(" ")[0]}
                </button>
              ))}
            </div>

            <div className="pt-2 flex items-center gap-3">
              <button
                onClick={onApply}
                className="px-6 py-3 bg-[#1D6AE5] hover:bg-[#1557bf] text-white rounded-xl font-bold text-sm shadow-lg shadow-blue-500/20 transition active:scale-95"
              >
                Apply / Open Account →
              </button>
              <span className="text-xs text-gray-400 font-mono">
                100% Paperless • Zero CIBIL
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
