import { useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import Header from "./components/Header";
import Footer from "./components/Footer";
import EvervaultCardScanner from "./components/EvervaultCardScanner";
import { API } from "./config";

/* ═══════════════════════════════════════════════════════════
   ANIMATED COUNTER
═══════════════════════════════════════════════════════════ */
function Counter({ to, suffix = "", prefix = "", decimals = 0 }) {
  const [count, setCount] = useState(0);
  const ref = useRef(null);
  const started = useRef(false);

  useEffect(() => {
    const obs = new IntersectionObserver(
      ([e]) => {
        if (e.isIntersecting && !started.current) {
          started.current = true;
          const duration = 1400;
          const start = performance.now();
          const tick = (now) => {
            const p = Math.min((now - start) / duration, 1);
            const eased = 1 - Math.pow(1 - p, 3);
            setCount(+(eased * to).toFixed(decimals));
            if (p < 1) requestAnimationFrame(tick);
          };
          requestAnimationFrame(tick);
        }
      },
      { threshold: 0.5 }
    );
    if (ref.current) obs.observe(ref.current);
    return () => obs.disconnect();
  }, [to, decimals]);

  return (
    <span ref={ref}>
      {prefix}{decimals ? count.toFixed(decimals) : count.toLocaleString("en-IN")}{suffix}
    </span>
  );
}

/* ═══════════════════════════════════════════════════════════
   LIVE WEALTH SIMULATOR & ACCRUAL CALCULATOR (12% & 18% ONLY)
   (Zero AI slop, high-speed smooth ticking, 100% client-side)
═══════════════════════════════════════════════════════════ */
function InteractiveYieldSpeedometer({ isHindi }) {
  const [deposit, setDeposit] = useState(100000);
  const [tier, setTier] = useState(12); // 12 (Liquid Savings) or 18 (Fixed Bond)
  const [showDetails, setShowDetails] = useState(true);

  // Pure client-side calculations
  const annualReturn = (deposit * tier) / 100;
  const dailyReturn = annualReturn / 365;
  const perMinuteReturn = dailyReturn / 1440;
  const perSecondReturn = dailyReturn / 86400;
  const perMsReturn = perSecondReturn / 1000;

  // Real-time accrued yield starting from midnight (exact same formula as Dashboard & Admin)
  const getElapsedTodayMs = () => {
    const startOfToday = new Date().setHours(0, 0, 0, 0);
    return Math.max(1000, Date.now() - startOfToday);
  };

  const [liveAccrued, setLiveAccrued] = useState(() => getElapsedTodayMs() * perMsReturn);
  const mountRef = useRef(Date.now());
  const baseAccruedRef = useRef(getElapsedTodayMs() * perMsReturn);

  // Recalculate baseline when deposit or tier changes
  useEffect(() => {
    const base = getElapsedTodayMs() * perMsReturn;
    baseAccruedRef.current = base;
    mountRef.current = Date.now();
    setLiveAccrued(base);
  }, [deposit, tier, perMsReturn]);

  // Ultra-fast 40ms high-speed live ledger ticker (25 updates/sec, exactly like AdminPanel)
  useEffect(() => {
    const timer = setInterval(() => {
      const elapsed = Date.now() - mountRef.current;
      setLiveAccrued(baseAccruedRef.current + (elapsed * perMsReturn));
    }, 40);
    return () => clearInterval(timer);
  }, [perMsReturn]);

  // Calibrated Needle Angle:
  // 0% -> -90deg, 6% -> -30deg, 12% -> +30deg, 18% -> +90deg
  const needleAngle = tier === 12 ? 30 : 90;

  return (
    <div className="mt-5 sm:mt-8 mb-6 bg-white rounded-2xl p-4 sm:p-7 border border-slate-200 shadow-sm relative overflow-hidden">
      {/* HEADER ROW */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 sm:gap-4 pb-4 sm:pb-5 border-b border-slate-100">
        <div>
          <div className="flex items-center gap-2 mb-1.5 flex-wrap">
            <span className="text-[10px] sm:text-[11px] font-bold tracking-wider uppercase text-blue-600 bg-blue-50 px-2 sm:px-2.5 py-0.5 rounded-md border border-blue-100">
              {isHindi ? "लाइव वेल्थ कैलकुलेटर" : "Live Wealth Simulator"}
            </span>
            <span className="inline-flex items-center gap-1.5 text-[10px] sm:text-[11px] font-semibold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-md border border-emerald-100">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-ping" />
              {isHindi ? "रियल-टाइम लाइव स्पीड" : "Admin Speed Ticker"}
            </span>
          </div>
          <h3 className="text-lg xs:text-xl sm:text-2xl font-extrabold text-[#0A192F] tracking-tight leading-snug">
            {isHindi
              ? "देखें आपका पैसा सेकंड-दर-सेकंड कैसे बढ़ता है"
              : "Watch Your Savings Compound in Real Time"}
          </h3>
          <p className="text-xs sm:text-sm text-slate-500 mt-0.5 max-w-xl">
            {isHindi
              ? "12% लिक्विड बचत (1% महीना, 0 लॉक-इन) या 18% वेल्थ बॉन्ड (1.5% महीना, 365 दिन) चुनें।"
              : "12% Liquid Savings (1% mo, zero lock-in) vs 18% Fixed Wealth Bond (1.5% mo, 365 days)."}
          </p>
        </div>

        {/* 2-WAY PRODUCT TOGGLE */}
        <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-xl self-start md:self-auto border border-slate-200/80 w-full sm:w-auto justify-between sm:justify-start">
          <button
            type="button"
            onClick={() => { setTier(12); setShowDetails(true); }}
            className={`flex-1 sm:flex-initial px-3 sm:px-3.5 py-2 rounded-lg text-xs font-bold transition-all cursor-pointer text-center ${
              tier === 12
                ? "bg-white text-emerald-700 shadow-xs border border-emerald-200/60"
                : "text-slate-600 hover:text-slate-900"
            }`}
          >
            12% Liquid Savings
          </button>
          <button
            type="button"
            onClick={() => { setTier(18); setShowDetails(true); }}
            className={`flex-1 sm:flex-initial px-3 sm:px-3.5 py-2 rounded-lg text-xs font-bold transition-all cursor-pointer text-center ${
              tier === 18
                ? "bg-white text-blue-700 shadow-xs border border-blue-200/60"
                : "text-slate-600 hover:text-slate-900"
            }`}
          >
            18% Wealth Bond
          </button>
        </div>
      </div>

      {/* MAIN VISUALIZATION: GAUGE + REAL-TIME LEDGER */}
      <div className="grid md:grid-cols-12 gap-5 sm:gap-6 items-center pt-5 sm:pt-6">
        {/* SPEEDOMETER GAUGE (COL 5) */}
        <div className="md:col-span-5 flex flex-col items-center justify-center p-4 sm:p-5 bg-slate-50/70 rounded-2xl border border-slate-100">
          <div className="relative w-48 sm:w-56 h-28 sm:h-32 flex items-center justify-center overflow-hidden">
            {/* SVG GAUGE ARC */}
            <svg viewBox="0 0 200 110" className="w-full h-full">
              <defs>
                <linearGradient id="fintechGaugeGrad" x1="0%" y1="0%" x2="100%" y2="0%">
                  <stop offset="0%" stopColor="#10B981" />
                  <stop offset="66%" stopColor="#059669" />
                  <stop offset="100%" stopColor="#1D6AE5" />
                </linearGradient>
              </defs>
              {/* Background Arc */}
              <path
                d="M 20 100 A 80 80 0 0 1 180 100"
                fill="none"
                stroke="#E2E8F0"
                strokeWidth="12"
                strokeLinecap="round"
              />
              {/* Active Gauge Arc (Calibrated to 18% max) */}
              <path
                d="M 20 100 A 80 80 0 0 1 180 100"
                fill="none"
                stroke="url(#fintechGaugeGrad)"
                strokeWidth="12"
                strokeLinecap="round"
                strokeDasharray="251.2"
                strokeDashoffset={tier === 12 ? "83.7" : "0"}
                className="transition-all duration-500 ease-out"
              />
              {/* Dial Marks (Strict 0% to 18%) */}
              <text x="18" y="108" fontSize="10" fontWeight="700" fill="#64748B">0%</text>
              <text x="65" y="46" fontSize="10" fontWeight="700" fill="#64748B">6%</text>
              <text x="125" y="46" fontSize="11" fontWeight="800" fill="#059669">12%</text>
              <text x="172" y="108" fontSize="11" fontWeight="800" fill="#1D6AE5">18%</text>
            </svg>

            {/* NEEDLE */}
            <div
              className="absolute bottom-0 left-1/2 w-1.5 h-20 sm:h-22 bg-[#0A192F] rounded-full origin-bottom shadow-sm"
              style={{
                transform: `translateX(-50%) rotate(${needleAngle}deg)`,
                transition: "transform 0.5s cubic-bezier(0.34, 1.56, 0.64, 1)",
              }}
            >
              <div className="w-2.5 h-2.5 rounded-full bg-emerald-500 absolute -top-1 -left-[2px] shadow-xs" />
            </div>

            {/* Center Pivot */}
            <div className="absolute bottom-[-5px] left-1/2 -translate-x-1/2 w-4.5 h-4.5 rounded-full bg-[#0A192F] border-2 border-white shadow-sm z-10" />
          </div>

          {/* PRODUCT SPECS PILL */}
          <div className="mt-3 text-center">
            <button
              type="button"
              onClick={() => setShowDetails(!showDetails)}
              className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold transition cursor-pointer ${
                tier === 18
                  ? "bg-blue-50 text-blue-800 border border-blue-200 hover:bg-blue-100"
                  : "bg-emerald-50 text-emerald-800 border border-emerald-200 hover:bg-emerald-100"
              }`}
            >
              <span>{tier === 18 ? "18.0% P.A. FIXED WEALTH BOND" : "12.0% P.A. LIQUID SAVINGS"}</span>
              <span className="text-[10px] underline">ℹ️ Kaise Milega?</span>
            </button>
            <div className="text-[11px] text-slate-500 font-medium mt-1">
              {tier === 18
                ? "365 Din locked • Guaranteed maturity payout"
                : "Real-time daily credit • 24x7 instant withdrawal"}
            </div>
          </div>
        </div>

        {/* METRICS & GROWTH BREAKDOWN (COL 7) */}
        <div className="md:col-span-7 space-y-3.5 sm:space-y-4">
          {/* HIGH-SPEED LIVE TICKING LEDGER (Admin Speed with 6 Decimals) */}
          <div className="p-3.5 sm:p-5 rounded-2xl bg-[#0A192F] text-white shadow-sm flex items-center justify-between">
            <div>
              <div className="text-[10px] sm:text-[11px] font-bold tracking-wider uppercase text-emerald-400 flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-emerald-400 animate-ping shrink-0" />
                <span>Today&apos;s Live Accrued Yield (₹{deposit.toLocaleString("en-IN")})</span>
              </div>
              <div className="font-mono text-xl xs:text-2xl sm:text-3xl font-extrabold mt-1 tracking-tight tabular-nums text-white">
                +₹{Number(liveAccrued).toLocaleString("en-IN", { minimumFractionDigits: 6, maximumFractionDigits: 6 })}
              </div>
              <p className="text-[10px] sm:text-[11px] text-slate-400 mt-0.5">
                High-speed ledger • 25 ticks/sec • Accruing since 12:00 AM
              </p>
            </div>
            <div className="text-right shrink-0 pl-2">
              <span className="text-[9px] sm:text-[10px] font-semibold text-slate-400 block uppercase tracking-wider">
                Annual Profit
              </span>
              <span className="font-mono text-base sm:text-xl font-extrabold text-emerald-400">
                +₹{Math.round(annualReturn).toLocaleString("en-IN")}
              </span>
            </div>
          </div>

          {/* 3-COLUMN METRICS BREAKDOWN */}
          <div className="grid grid-cols-3 gap-2 sm:gap-2.5 text-center">
            <div className="p-2.5 sm:p-3 bg-slate-50 rounded-xl border border-slate-200/70">
              <span className="text-[9px] sm:text-[10px] text-slate-500 font-bold uppercase block">1 Minute Me</span>
              <div className="text-[11px] sm:text-sm font-bold font-mono text-slate-800 mt-0.5 tabular-nums">
                +₹{perMinuteReturn.toFixed(4)}
              </div>
              <span className="text-[8px] sm:text-[9px] text-emerald-600 font-semibold block mt-0.5">Live Accrual</span>
            </div>

            <div className="p-2.5 sm:p-3 bg-slate-50 rounded-xl border border-slate-200/70">
              <span className="text-[9px] sm:text-[10px] text-slate-500 font-bold uppercase block">1 Din Me</span>
              <div className="text-[11px] sm:text-sm font-bold font-mono text-emerald-700 mt-0.5 tabular-nums">
                +₹{dailyReturn.toFixed(2)}
              </div>
              <span className="text-[8px] sm:text-[9px] text-slate-500 font-medium block mt-0.5">Daily Payout</span>
            </div>

            <div className="p-2.5 sm:p-3 bg-slate-50 rounded-xl border border-slate-200/70">
              <span className="text-[9px] sm:text-[10px] text-slate-500 font-bold uppercase block">Kul Maturity</span>
              <div className="text-[11px] sm:text-sm font-bold font-mono text-blue-700 mt-0.5 tabular-nums">
                ₹{Math.round(deposit + annualReturn).toLocaleString("en-IN")}
              </div>
              <span className="text-[8px] sm:text-[9px] text-slate-500 font-medium block mt-0.5">Principal + Profit</span>
            </div>
          </div>

          {/* QUICK DEPOSIT SELECTOR */}
          <div className="flex items-center gap-1.5 flex-wrap pt-0.5 text-xs">
            <span className="text-[11px] font-bold text-slate-500 mr-1 shrink-0">
              {isHindi ? "जमा राशि:" : "Deposit:"}
            </span>
            {[25000, 50000, 100000, 200000, 500000].map((amt) => (
              <button
                key={amt}
                type="button"
                onClick={() => setDeposit(amt)}
                className={`px-2.5 sm:px-3 py-1 sm:py-1.5 rounded-lg text-[11px] sm:text-xs font-bold transition-all cursor-pointer ${
                  deposit === amt
                    ? "bg-[#0A192F] text-white shadow-xs"
                    : "bg-white border border-slate-200 text-slate-700 hover:bg-slate-50"
                }`}
              >
                ₹{amt >= 100000 ? `${amt / 100000} Lakh` : `${amt / 1000}k`}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* INTERACTIVE "KAISE MILEGA" (HOW TO GET IT) DETAILS CARD */}
      {showDetails && (
        <div className="mt-5 p-4 sm:p-5 rounded-2xl bg-gradient-to-br from-slate-50 via-blue-50/30 to-emerald-50/30 border border-slate-200 transition-all">
          <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
            <div className="flex items-center gap-2">
              <span className="text-base sm:text-lg">💡</span>
              <h4 className="text-xs sm:text-sm font-black text-[#0A192F] uppercase tracking-wide">
                {tier === 18 ? "18% Wealth Bond — Kaise Milega?" : "12% Liquid Savings — Kaise Milega?"}
              </h4>
            </div>
            <span className="text-[10px] sm:text-xs font-bold text-emerald-700 bg-emerald-100/80 px-2.5 py-0.5 rounded-full">
              {tier === 18 ? "18% Guaranteed Payout" : "Daily Credit • 0 Lock-in"}
            </span>
          </div>

          <div className="grid sm:grid-cols-3 gap-2.5 sm:gap-3 text-xs mb-3.5">
            <div className="bg-white p-3 rounded-xl border border-slate-200/80 shadow-2xs">
              <span className="text-[10px] font-bold text-slate-400 uppercase block">1. Shuru Kaise Karein?</span>
              <p className="text-slate-700 font-semibold mt-0.5 text-[11px] sm:text-xs leading-relaxed">
                {tier === 18
                  ? "Login karke ₹1,00,000 (1 Unit) se bond book karein. Flexible multi-unit booking."
                  : "Free zero-balance account kholein. Sirf ₹100 se start karein, zero paper document."}
              </p>
            </div>

            <div className="bg-white p-3 rounded-xl border border-slate-200/80 shadow-2xs">
              <span className="text-[10px] font-bold text-slate-400 uppercase block">2. Munafa Kab Milega?</span>
              <p className="text-slate-700 font-semibold mt-0.5 text-[11px] sm:text-xs leading-relaxed">
                {tier === 18
                  ? "365 din pure hone par guaranteed 18% profit direct aapke wallet me credit hoga."
                  : "Har raat 12:00 AM par daily munafa live Profit Wallet me bina ruke jama hota hai."}
              </p>
            </div>

            <div className="bg-white p-3 rounded-xl border border-slate-200/80 shadow-2xs">
              <span className="text-[10px] font-bold text-slate-400 uppercase block">3. Paisa Kaise Nikalein?</span>
              <p className="text-slate-700 font-semibold mt-0.5 text-[11px] sm:text-xs leading-relaxed">
                {tier === 18
                  ? "Maturity ke turant baad principal + profit UPI/Bank me instant transfer karein."
                  : "Zero lock-in! Apna mool paisa aur munafa kabhee bhi 24x7 instant UPI se nikalein."}
              </p>
            </div>
          </div>

          <div className="flex flex-col sm:flex-row sm:items-center justify-between pt-2 border-t border-slate-200/60 gap-2">
            <div className="text-[11px] text-slate-600 font-medium flex items-center gap-1.5">
              <span>🛡️</span>
              <span>100% Educa Reserve Liquidity Pool se secured • Guaranteed returns</span>
            </div>
            <Link
              to="/login"
              className="px-4 py-2 bg-[#1D6AE5] hover:bg-[#1558cc] text-white text-xs font-bold rounded-xl transition shadow-xs text-center inline-flex items-center justify-center gap-1 self-start sm:self-auto"
            >
              <span>{tier === 18 ? "18% Bond Book Karein" : "12% Free Khata Kholein"}</span>
              <span>→</span>
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════
   HERO SECTION (With Evervault Quantum Card Scanner Stream)
═══════════════════════════════════════════════════════════ */
function HeroSection({ onLogin, isHindi }) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => { setMounted(true); }, []);

  return (
    <section className="relative pt-20 pb-10 sm:pt-28 sm:pb-16 overflow-hidden bg-gradient-to-b from-[#F0F5FF] via-[#FAFBFF] to-[#FFFFFF]">
      {/* GLOW BACKGROUND ACCENTS */}
      <div className="absolute top-1/4 right-0 w-[450px] h-[450px] bg-blue-400/10 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute bottom-0 left-0 w-[350px] h-[350px] bg-emerald-400/10 rounded-full blur-3xl pointer-events-none" />

      <div className="max-w-7xl mx-auto px-4 sm:px-6 md:px-8 relative">
        {/* TOP TAGLINE & CALLOUT */}
        <div className={`text-center max-w-4xl mx-auto transition-all duration-700 ${mounted ? "opacity-100 translate-y-0" : "opacity-0 translate-y-4"}`}>
          
          {/* HEADLINE: CRAFTED OPTICAL HIERARCHY */}
          <h1 className="text-2xl xs:text-3xl sm:text-5xl lg:text-6xl font-black text-[#0A192F] tracking-tight leading-[1.14] mb-3 sm:mb-4">
            {isHindi ? (
              <>
                ₹199 रिचार्ज से लेकर{" "}
                <span className="bg-gradient-to-r from-[#1D6AE5] via-[#0DC98A] to-[#059669] bg-clip-text text-transparent">
                  व्यापार और पर्सनल लोन तक
                </span>
              </>
            ) : (
              <>
                From Instant ₹199 Credit to{" "}
                <span className="bg-gradient-to-r from-[#1D6AE5] via-[#0DC98A] to-[#059669] bg-clip-text text-transparent">
                  Business & Personal Loans
                </span>
              </>
            )}
          </h1>

          {/* REFINED SUBCONTENT */}
          <p className="text-xs sm:text-base text-gray-600 leading-relaxed max-w-xl mx-auto mb-5 px-2">
            {isHindi ? (
              <>
                पारदर्शी वित्तीय सुविधाएं — बिना किसी कागजी झंझट के। साथ ही पाएं{" "}
                <strong className="text-emerald-700 font-bold bg-emerald-50 px-1.5 py-0.5 rounded border border-emerald-200/70 inline-block">
                  12% वार्षिक ब्याज
                </strong>{" "}
                लिक्विड बचत खाते पर!
              </>
            ) : (
              <>
                Next-generation financial infrastructure without bureaucratic paperwork. Earn{" "}
                <strong className="text-emerald-700 font-bold bg-emerald-50 px-1.5 py-0.5 rounded border border-emerald-200/70 inline-block">
                  12% annual compounding yield
                </strong>{" "}
                on liquid savings with instant withdrawals!
              </>
            )}
          </p>

          {/* SINGLE HIGH-CONVERTING FINTECH CTA */}
          <div className="max-w-xs sm:max-w-sm mx-auto mb-6 px-2">
            <button
              onClick={onLogin}
              className="w-full py-3.5 px-6 rounded-2xl font-black text-sm sm:text-base text-white bg-gradient-to-r from-[#1D6AE5] via-[#1558cc] to-[#0DC98A] hover:opacity-95 active:scale-[0.98] transition-all duration-150 shadow-xl shadow-blue-500/25 flex items-center justify-center gap-2 cursor-pointer tracking-tight"
            >
              <span>{isHindi ? "मुफ्त खाता खोलें" : "Open Free Account"}</span>
              <span>→</span>
            </button>
            
            {/* CLEAN TRUST METRICS & EMI LINK */}
            <div className="flex items-center justify-center gap-2.5 sm:gap-4 mt-2.5 text-[11px] sm:text-xs text-gray-500 font-medium">
              <span className="flex items-center gap-1"><span className="text-emerald-500 font-bold">✓</span> Zero Balance</span>
              <span className="text-gray-300">•</span>
              <span className="flex items-center gap-1"><span className="text-emerald-500 font-bold">✓</span> Instant ₹199 Credit</span>
              <span className="text-gray-300">•</span>
              <button
                onClick={() => document.getElementById("emi-calculator")?.scrollIntoView({ behavior: "smooth" })}
                className="text-[#1D6AE5] font-bold hover:underline cursor-pointer flex items-center gap-1"
              >
                <span>📊</span> {isHindi ? "कैलकुलेटर" : "Installments Calc"}
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* ══════════════════════════════════════════════════════
          WALL-TO-WALL EVERVAULT QUANTUM CARD SCANNER
      ══════════════════════════════════════════════════════ */}
      <div className={`w-full relative transition-all duration-800 ${mounted ? "opacity-100 scale-100" : "opacity-0 scale-98"}`}>
        <EvervaultCardScanner onApply={onLogin} />
      </div>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 md:px-8 relative">
        {/* INTERACTIVE YIELD SPEEDOMETER (IMAGE 4 REPLACEMENT) */}
        <InteractiveYieldSpeedometer isHindi={isHindi} />

        {/* BOTTOM QUICK FORM + HIGHLIGHT CARDS */}
        <div className="grid lg:grid-cols-12 gap-8 items-center mt-10">
          <div className="lg:col-span-7 space-y-4">
            <div className="p-5 sm:p-6 bg-white rounded-3xl border border-[#E8EDF5] shadow-lg shadow-blue-900/5">
              <div className="flex items-center gap-3 mb-3">
                <span className="text-3xl">💎</span>
                <div>
                  <h3 className="font-extrabold text-lg text-[#0C1B3A]">
                    {isHindi ? "12% बचत खाता — उच्चतम ब्याज दर" : "12% Savings Account — Highest Liquid Returns"}
                  </h3>
                  <p className="text-xs text-gray-500">
                    {isHindi
                      ? "पारंपरिक बैंक देते हैं 2.7% - 3%, जबकि Educa देता है फ्लैट 12% वार्षिक ब्याज हर सेकंड लाइव!"
                      : "Traditional banks offer only 2.7% - 3%, while Educa delivers flat 12% p.a. calculated and credited live!"}
                  </p>
                </div>
              </div>
              <div className="grid grid-cols-3 gap-3 text-center pt-3 border-t border-gray-100">
                <div className="bg-blue-50/60 p-2.5 rounded-xl">
                  <div className="text-xs text-gray-500">Normal Bank</div>
                  <div className="text-sm font-bold text-gray-700">2.7% - 3%</div>
                </div>
                <div className="bg-amber-50 p-2.5 rounded-xl border border-amber-200">
                  <div className="text-xs text-amber-700 font-semibold">Educa Savings</div>
                  <div className="text-base font-black text-amber-600">12.0% APY</div>
                </div>
                <div className="bg-emerald-50/60 p-2.5 rounded-xl">
                  <div className="text-xs text-gray-500">Withdrawal</div>
                  <div className="text-sm font-bold text-emerald-700">Anytime 24x7</div>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="p-4 bg-white rounded-2xl border border-gray-200 shadow-sm flex items-center gap-3">
                <span className="text-3xl">📱</span>
                <div>
                  <h4 className="font-bold text-sm text-[#0C1B3A]">₹199 Recharge Loan</h4>
                  <p className="text-xs text-gray-500">
                    {isHindi ? "मोबाइल रिचार्ज हेतु त्वरित माइक्रो-क्रेडिट" : "Instant micro-credit for phone recharge"}
                  </p>
                </div>
              </div>
              <div className="p-4 bg-white rounded-2xl border border-gray-200 shadow-sm flex items-center gap-3">
                <span className="text-3xl">🏬</span>
                <div>
                  <h4 className="font-bold text-sm text-[#0C1B3A]">Micro Business & Personal Loan</h4>
                  <p className="text-xs text-gray-500">
                    {isHindi ? "₹5,000 से ₹50,000 आसान 10-दिन या दैनिक किस्तों पर" : "₹5,000 to ₹50,000 on flexible installments"}
                  </p>
                </div>
              </div>
            </div>
          </div>

          <div className="lg:col-span-5">
            <QuickLoanQueryCard isHindi={isHindi} />
          </div>
        </div>

        {/* STATS STRIP */}
        <div className="mt-14 bg-white rounded-3xl p-6 sm:p-8 border border-[#E8EDF5] shadow-lg shadow-blue-900/5 grid grid-cols-2 md:grid-cols-4 gap-6 text-center">
          <div>
            <div className="text-3xl sm:text-4xl font-black text-[#FF7B35]">
              <Counter to={12} suffix="%" />
            </div>
            <div className="text-xs font-semibold text-gray-500 mt-1">Liquid Savings APY</div>
          </div>
          <div>
            <div className="text-3xl sm:text-4xl font-black text-[#0C1B3A]">
              ₹<Counter to={199} prefix="" />
            </div>
            <div className="text-xs font-semibold text-gray-500 mt-1">Starting Micro Recharge Credit</div>
          </div>
          <div>
            <div className="text-3xl sm:text-4xl font-black text-[#0DC98A]">
              <Counter to={18} suffix="%" />
            </div>
            <div className="text-xs font-semibold text-gray-500 mt-1">365-Day Fixed Bond Profit</div>
          </div>
          <div>
            <div className="text-3xl sm:text-4xl font-black text-[#1D6AE5]">
              <Counter to={99} suffix="%" />
            </div>
            <div className="text-xs font-semibold text-gray-500 mt-1">Approval Success Rate</div>
          </div>
        </div>
      </div>
    </section>
  );
}

/* ═══════════════════════════════════════════════════════════
   QUICK LOAN QUERY CARD (Instant SSE Admin Alert)
═══════════════════════════════════════════════════════════ */
function QuickLoanQueryCard({ isHindi }) {
  const [formData, setFormData] = useState({
    name: "",
    phone: "",
    email: "",
    amount: "25000",
    purpose: "Micro Personal Loan (10-Day Cycle)",
  });
  const [status, setStatus] = useState({ state: "idle", msg: "" });

  const handleSubmit = async (e) => {
    e.preventDefault();
    setStatus({ state: "submitting", msg: isHindi ? "भेजा जा रहा है..." : "Submitting query..." });

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 6000);

    try {
      const res = await fetch(`${API}/loan/query`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(formData),
        signal: controller.signal,
      });
      clearTimeout(timeoutId);
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || "Submission failed");

      setStatus({
        state: "success",
        msg: isHindi
          ? "रिक्वेस्ट प्राप्त हुई! हमारी टीम आपसे जल्द संपर्क करेगी।"
          : "Query received! Our advisory team will contact you promptly.",
      });
      setFormData({ name: "", phone: "", email: "", amount: "25000", purpose: "Micro Personal Loan (10-Day Cycle)" });
    } catch (err) {
      clearTimeout(timeoutId);
      const isTimeout = err.name === "AbortError";
      setStatus({
        state: "error",
        msg: isTimeout
          ? (isHindi ? "सर्वर से संपर्क में देरी हो रही है। कृपया पुनः प्रयास करें।" : "Request timed out. Please try again.")
          : (err.message || "Failed to submit query"),
      });
    }
  };

  return (
    <div className="bg-white rounded-3xl p-6 sm:p-8 border border-[#E8EDF5] shadow-xl shadow-blue-900/10 relative">
      <div className="flex items-center justify-between mb-4">
        <div>
          <span className="text-[11px] font-extrabold uppercase tracking-wider text-[#1D6AE5] bg-blue-50 px-2.5 py-1 rounded-md">
            {isHindi ? "त्वरित लोन रिक्वेस्ट" : "Direct Loan Query"}
          </span>
          <h3 className="text-xl font-bold text-[#0C1B3A] mt-2">
            {isHindi ? "लोन चाहिए? यहाँ भेजें" : "Need Quick Credit? Send Query"}
          </h3>
        </div>
        <div className="w-10 h-10 rounded-2xl bg-emerald-50 text-emerald-600 flex items-center justify-center text-xl">
          🔔
        </div>
      </div>

      <p className="text-xs text-gray-500 mb-5">
        {isHindi
          ? "रिक्वेस्ट सबमिट करते ही एडमिन डेस्क पर रियल-टाइम साउंड अलर्ट जाता है!"
          : "Submitting sends a real-time chime notification straight to the admin desk!"}
      </p>

      {status.state === "success" ? (
        <div className="bg-emerald-50 border border-emerald-200 rounded-2xl p-5 text-center">
          <span className="text-3xl block mb-2">🎉</span>
          <h4 className="font-bold text-emerald-800 text-sm">
            {isHindi ? "सफलतापूर्वक सबमिट हुआ!" : "Query Submitted Successfully!"}
          </h4>
          <p className="text-xs text-emerald-700 mt-1">{status.msg}</p>
          <button
            onClick={() => setStatus({ state: "idle", msg: "" })}
            className="mt-4 px-4 py-2 bg-emerald-600 text-white rounded-xl text-xs font-bold"
          >
            {isHindi ? "नई रिक्वेस्ट भेजें" : "Submit Another Query"}
          </button>
        </div>
      ) : (
        <form onSubmit={handleSubmit} className="space-y-3.5">
          <div>
            <label className="block text-xs font-bold text-gray-700 mb-1">
              {isHindi ? "आपका नाम *" : "Your Name *"}
            </label>
            <input
              type="text"
              required
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              placeholder="Rahul Sharma"
              className="w-full px-3.5 py-2.5 border border-gray-200 rounded-xl focus:ring-2 focus:ring-[#1D6AE5] outline-none text-sm"
            />
          </div>

          <div className="grid grid-cols-2 gap-2.5">
            <div>
              <label className="block text-xs font-bold text-gray-700 mb-1">
                {isHindi ? "मोबाइल नंबर *" : "Mobile No *"}
              </label>
              <input
                type="tel"
                required
                value={formData.phone}
                onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                placeholder="9876543210"
                className="w-full px-3.5 py-2.5 border border-gray-200 rounded-xl focus:ring-2 focus:ring-[#1D6AE5] outline-none text-sm"
              />
            </div>
            <div>
              <label className="block text-xs font-bold text-gray-700 mb-1">Loan Amount (₹)</label>
              <input
                type="number"
                min={1000}
                value={formData.amount}
                onChange={(e) => setFormData({ ...formData, amount: e.target.value })}
                placeholder="25000"
                className="w-full px-3.5 py-2.5 border border-gray-200 rounded-xl focus:ring-2 focus:ring-[#1D6AE5] outline-none text-sm font-semibold text-[#1D6AE5]"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-bold text-gray-700 mb-1">
              {isHindi ? "लोन का प्रकार" : "Loan Purpose"}
            </label>
            <select
              value={formData.purpose}
              onChange={(e) => setFormData({ ...formData, purpose: e.target.value })}
              className="w-full px-3.5 py-2.5 border border-gray-200 rounded-xl focus:ring-2 focus:ring-[#1D6AE5] outline-none text-sm bg-white"
            >
              <option value="Micro Personal Loan (10-Day Cycle)">Micro Personal Loan (10-Day Cycle)</option>
              <option value="Micro Business / Shop Loan (Daily Collection)">Micro Business / Shop Loan (Daily Collection)</option>
              <option value="Emergency Instant Micro-Credit (₹199 - ₹5,000)">Emergency Instant Micro-Credit (₹199 - ₹5,000)</option>
              <option value="365-Day Fixed Bond & Wealth Investment">365-Day Fixed Bond & Wealth Investment</option>
            </select>
          </div>

          <button
            type="submit"
            disabled={status.state === "submitting"}
            className="w-full py-3 rounded-xl bg-gradient-to-r from-[#1D6AE5] to-[#0DC98A] text-white font-extrabold text-sm active:scale-95 transition shadow-md shadow-blue-500/20 disabled:opacity-50 cursor-pointer"
          >
            {status.state === "submitting"
              ? (isHindi ? "अलर्ट भेजा जा रहा है..." : "Sending Alert to Admin...")
              : (isHindi ? "लोन रिक्वेस्ट भेजें (मुफ्त) →" : "Submit Loan Query (Free) →")}
          </button>

          {status.state === "error" && (
            <p className="text-xs text-red-600 text-center">{status.msg}</p>
          )}
        </form>
      )}
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════
   INTERACTIVE APP-BASED LOAN INSTALLMENT CALCULATOR
═══════════════════════════════════════════════════════════ */
function EmiCalculatorSection({ onLogin, isHindi }) {
  const [calcType, setCalcType] = useState("personal"); // 'personal' | 'business'
  const [amount, setAmount] = useState(25000);
  const [installments, setInstallments] = useState(18); // 15 or 18
  const [mblDays, setMblDays] = useState(60); // 60, 80, 100, 120

  // Personal Loan calculation: 1.34% per 10-day cycle
  const pRate = 1.34;
  const pPrincipalPerCycle = amount / installments;
  const pInterestPerCycle = (amount * pRate) / 100;
  const pCycleInstallment = Math.round(pPrincipalPerCycle + pInterestPerCycle);
  const pTotalPayable = pCycleInstallment * installments;
  const pTotalInterest = pTotalPayable - amount;

  // Micro Business Loan calculation: 60d@18%, 80d@24%, 100d@30%, 120d@36%
  const mblRateMap = { 60: 18, 80: 24, 100: 30, 120: 36 };
  const bRate = mblRateMap[mblDays] || 18;
  const bInterest = Math.round((amount * bRate) / 100);
  const bTotalPayable = amount + bInterest;
  const bDailyKist = Math.round(bTotalPayable / mblDays);

  return (
    <section id="emi-calculator" className="py-20 md:py-28 bg-[#FAFBFF] relative">
      <div className="max-w-7xl mx-auto px-5 md:px-8">
        <div className="text-center max-w-2xl mx-auto mb-12">
          <span className="text-xs font-extrabold px-3 py-1 rounded-full bg-blue-50 text-[#1D6AE5] border border-blue-200">
            📊 Smart Planning
          </span>
          <h2 className="text-3xl sm:text-4xl font-black text-[#0C1B3A] tracking-tight mt-3 mb-3">
            {isHindi ? "एड्यूका किस्त कैलकुलेटर" : "Educa Easy Installments Calculator"}
          </h2>
          <p className="text-sm sm:text-base text-gray-600">
            {isHindi
              ? "पारदर्शी 10-दिन साइकिल या दैनिक किस्तों का सटीक हिसाब देखें बिना किसी छिपे शुल्क के।"
              : "Transparent 10-day cycle or daily collection calculations matching official app logic."}
          </p>

          {/* CALCULATOR TYPE TABS */}
          <div className="inline-flex items-center gap-1.5 p-1 bg-white rounded-2xl border border-slate-200 shadow-xs mt-6">
            <button
              type="button"
              onClick={() => setCalcType("personal")}
              className={`px-4 py-2 rounded-xl text-xs font-black transition cursor-pointer ${
                calcType === "personal"
                  ? "bg-[#1D6AE5] text-white shadow-xs"
                  : "text-slate-600 hover:text-slate-900"
              }`}
            >
              🏦 Personal Loan (10-Day Cycle)
            </button>
            <button
              type="button"
              onClick={() => setCalcType("business")}
              className={`px-4 py-2 rounded-xl text-xs font-black transition cursor-pointer ${
                calcType === "business"
                  ? "bg-emerald-600 text-white shadow-xs"
                  : "text-slate-600 hover:text-slate-900"
              }`}
            >
              🏬 Micro Business (Daily Kist)
            </button>
          </div>
        </div>

        <div className="bg-white rounded-3xl p-6 sm:p-10 border border-[#E8EDF5] shadow-xl shadow-blue-900/5 max-w-4xl mx-auto">
          <div className="grid md:grid-cols-12 gap-10 items-center">
            {/* SLIDERS */}
            <div className="md:col-span-7 space-y-7">
              {/* AMOUNT */}
              <div>
                <div className="flex justify-between items-center mb-2">
                  <label className="text-xs sm:text-sm font-bold text-gray-700">
                    {isHindi ? "लोन राशि" : "Loan Amount"}
                  </label>
                  <span className="text-lg font-black text-[#1D6AE5]">
                    ₹{amount.toLocaleString("en-IN")}
                  </span>
                </div>
                <input
                  type="range"
                  min={5000}
                  max={50000}
                  step={2500}
                  value={amount}
                  onChange={(e) => setAmount(Number(e.target.value))}
                  className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-[#1D6AE5]"
                />
                <div className="flex justify-between text-[11px] text-gray-400 mt-1">
                  <span>₹5,000 (Min)</span>
                  <span>₹25,000</span>
                  <span>₹50,000 (Max)</span>
                </div>
              </div>

              {/* TENURE SELECTOR */}
              {calcType === "personal" ? (
                <div>
                  <div className="flex justify-between items-center mb-2">
                    <label className="text-xs sm:text-sm font-bold text-gray-700">
                      {isHindi ? "किस्तों की संख्या (10-दिन साइकिल)" : "Installments Count (10-Day Cycle)"}
                    </label>
                    <span className="text-lg font-black text-[#0DC98A]">
                      {installments} Installments
                    </span>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    {[15, 18].map((n) => (
                      <button
                        key={n}
                        type="button"
                        onClick={() => setInstallments(n)}
                        className={`py-2 px-3 rounded-xl text-xs font-bold border transition cursor-pointer ${
                          installments === n
                            ? "bg-emerald-50 border-emerald-500 text-emerald-800 shadow-2xs"
                            : "border-gray-200 text-gray-600 hover:bg-gray-50"
                        }`}
                      >
                        {n} Installments (1.34%/cycle)
                      </button>
                    ))}
                  </div>
                  <p className="text-[11px] text-slate-500 mt-2">
                    Installments scheduled on the 1st, 11th, and 21st of every month. Early closure before 9th installment unlocks 1:1 profit reward!
                  </p>
                </div>
              ) : (
                <div>
                  <div className="flex justify-between items-center mb-2">
                    <label className="text-xs sm:text-sm font-bold text-gray-700">
                      {isHindi ? "दैनिक कलेक्शन अवधि" : "Daily Collection Term"}
                    </label>
                    <span className="text-lg font-black text-[#0DC98A]">
                      {mblDays} Days ({bRate}%)
                    </span>
                  </div>
                  <div className="grid grid-cols-4 gap-2">
                    {[60, 80, 100, 120].map((d) => (
                      <button
                        key={d}
                        type="button"
                        onClick={() => setMblDays(d)}
                        className={`py-2 px-1 rounded-xl text-xs font-bold border text-center transition cursor-pointer ${
                          mblDays === d
                            ? "bg-emerald-50 border-emerald-500 text-emerald-800 shadow-2xs"
                            : "border-gray-200 text-gray-600 hover:bg-gray-50"
                        }`}
                      >
                        {d}d ({mblRateMap[d]}%)
                      </button>
                    ))}
                  </div>
                  <p className="text-[11px] text-slate-500 mt-2">
                    Designed for retailers and merchants with daily business collections.
                  </p>
                </div>
              )}
            </div>

            {/* SUMMARY CARD */}
            <div className="md:col-span-5 bg-gradient-to-br from-[#1D6AE5] to-[#0DC98A] rounded-2xl p-6 text-white text-center shadow-lg shadow-blue-500/20">
              <span className="text-xs uppercase tracking-widest text-white/80 font-bold">
                {calcType === "personal" ? "10-Day Installment" : "Daily Collection Kist"}
              </span>
              <div className="text-3xl sm:text-4xl font-black mt-2 mb-4 tracking-tight">
                ₹{calcType === "personal" ? pCycleInstallment.toLocaleString("en-IN") : bDailyKist.toLocaleString("en-IN")}
                <span className="text-xs font-normal opacity-75">
                  {calcType === "personal" ? " / cycle" : " / day"}
                </span>
              </div>

              <div className="bg-white/15 backdrop-blur-md rounded-xl p-4 text-xs space-y-2 mb-6 text-left">
                <div className="flex justify-between">
                  <span className="text-white/80">Principal Loan:</span>
                  <span className="font-bold">₹{amount.toLocaleString("en-IN")}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-white/80">Total Interest:</span>
                  <span className="font-bold text-amber-200">
                    ₹{calcType === "personal" ? pTotalInterest.toLocaleString("en-IN") : bInterest.toLocaleString("en-IN")}
                  </span>
                </div>
                <div className="flex justify-between pt-2 border-t border-white/20 font-bold text-sm">
                  <span>Total Payable:</span>
                  <span>
                    ₹{calcType === "personal" ? pTotalPayable.toLocaleString("en-IN") : bTotalPayable.toLocaleString("en-IN")}
                  </span>
                </div>
              </div>

              <button
                onClick={onLogin}
                className="w-full py-3 bg-white text-[#1D6AE5] hover:bg-gray-50 rounded-xl font-extrabold text-sm active:scale-95 transition shadow-md cursor-pointer"
              >
                Apply for Loan Now →
              </button>
              <p className="text-[10px] text-white/75 mt-2">
                *First time ₹5,000 without cheque / ₹10,000 with cheque
              </p>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

/* ═══════════════════════════════════════════════════════════
   CORE FINTECH PRODUCTS SECTION (APP-ALIGNED)
═══════════════════════════════════════════════════════════ */
function ServicesSection({ onLogin, isHindi }) {
  const cards = [
    {
      id: "savings-card",
      icon: "🏦",
      badge: "12% ANNUAL INTEREST",
      badgeColor: "bg-amber-100 text-amber-800 border border-amber-300",
      title: "12% Liquid Savings Account",
      desc: isHindi
        ? "जहाँ सामान्य बैंक सिर्फ 2.7% - 3% देते हैं, एड्यूका देता है फ्लैट 12% वार्षिक ब्याज हर सेकंड लाइव कैलकुलेशन के साथ।"
        : "Earn 12% p.a. compounding returns with real-time second-by-second live calculation credited directly to your Profit Wallet.",
      points: [
        "12.0% Annual yield with daily live credit",
        "Zero withdrawal lock-in & zero penalties",
        "Instant 24x7 UPI & IMPS transfers",
        "4x higher returns than standard bank accounts",
      ],
      btnText: isHindi ? "12% खाता खोलें →" : "Open 12% Account →",
    },
    {
      id: "fixed-bond-card",
      icon: "📜",
      badge: "18% FIXED PROFIT",
      badgeColor: "bg-emerald-100 text-emerald-800 border border-emerald-300",
      title: "365-Day Fixed Bond (18% Profit)",
      desc: isHindi
        ? "1 लाख प्रति यूनिट 365 दिनों के लिए लॉक करें और मैच्योरिटी पर निश्चित 18% लाभ (₹1,18,000) प्राप्त करें।"
        : "Lock ₹1,00,000 (1 Lakh) per unit for 365 days and receive guaranteed 18% annual profit directly upon maturity.",
      points: [
        "Guaranteed 18% annual maturity payout",
        "Multi-unit support: ₹1L, ₹2L, ₹3L or more",
        "100% backed by fintech liquid capital reserves",
        "Auto-credited on day 365",
      ],
      btnText: isHindi ? "18% बॉन्ड देखें →" : "Explore 18% Bonds →",
    },
    {
      id: "lending-bond-card",
      icon: "💎",
      badge: "MONTHLY CASHFLOW",
      badgeColor: "bg-indigo-100 text-indigo-800 border border-indigo-200",
      title: "Monthly Lending Bonds (40 & 80 Mo)",
      desc: isHindi
        ? "निश्चित मासिक आय प्राप्त करें: 40 महीने (₹3,500/माह) या 80 महीने (₹2,500/माह = 2x पैसा) गारंटीड कैशफ्लो।"
        : "Secure steady monthly cashflow: 40 Months (₹3,500/mo = ₹1.4L return) or 80 Months (₹2,500/mo = ₹2L return / 2x money).",
      points: [
        "40 Months: ₹3,500/month (Total ₹1,40,000 return)",
        "80 Months: ₹2,500/month (Total ₹2,00,000 return - 2x money)",
        "Fixed monthly payouts straight to your bank",
        "Scalable multi-unit allocation",
      ],
      btnText: isHindi ? "लेंडिंग बॉन्ड देखें →" : "Explore Lending Bonds →",
    },
    {
      id: "loans-card",
      icon: "🏬",
      badge: "MICRO-CREDIT & LOANS",
      badgeColor: "bg-blue-100 text-[#1D6AE5] border border-blue-200",
      title: "Personal & Business Loans",
      desc: isHindi
        ? "₹5,000 से ₹50,000 तक पारदर्शी लोन 10-दिन की किस्तों (1.34%) या दुकानदारों के लिए दैनिक कलेक्शन (18%-36%) पर।"
        : "Transparent loans from ₹5,000 to ₹50,000 with 10-day cycle installments (1.34%) or daily collections for local merchants.",
      points: [
        "Personal Loans: 18 installments scheduled on 1st, 11th, 21st",
        "Daily Collection: 60d@18%, 80d@24%, 100d@30%, 120d@36%",
        "Instant ₹199 micro-recharge loans with 0% interest",
        "Zero CIBIL friction & same-day fast processing",
      ],
      btnText: isHindi ? "लोन हेतु आवेदन करें →" : "Apply for Loan →",
    },
  ];

  return (
    <section id="loans" className="py-20 md:py-28 bg-white relative">
      <div className="max-w-7xl mx-auto px-5 md:px-8">
        <div className="text-center max-w-3xl mx-auto mb-16">
          <span className="text-xs font-extrabold px-3 py-1 rounded-full bg-amber-50 text-amber-800 border border-amber-300">
            🔥 Everything Under One Roof
          </span>
          <h2 className="text-3xl sm:text-4xl font-black text-[#0C1B3A] tracking-tight mt-3 mb-3">
            {isHindi
              ? "12% लिक्विड बचत, 18% बॉन्ड और ₹50,000 तक आसान लोन"
              : "12% Liquid Savings, 18% Bonds & Instant Loans"}
          </h2>
          <p className="text-sm sm:text-base text-gray-600">
            {isHindi
              ? "एड्यूका फिनटेक हर आम इंसान की वित्तीय जरूरतों को समझता है — पारदर्शी निवेश और आसान लोन।"
              : "Comprehensive wealth generation and transparent credit infrastructure designed for real growth."}
          </p>
        </div>

        <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-6">
          {cards.map((c, i) => (
            <div
              key={i}
              className="bg-[#FAFBFF] rounded-3xl p-6 border border-[#E8EDF5] hover:border-blue-400 hover:shadow-xl hover:shadow-blue-900/10 transition-all duration-300 flex flex-col justify-between"
            >
              <div>
                <div className="flex items-center justify-between mb-4">
                  <span className="text-4xl">{c.icon}</span>
                  <span className={`text-[10px] font-extrabold px-2 py-0.5 rounded-md ${c.badgeColor}`}>
                    {c.badge}
                  </span>
                </div>
                <h3 className="text-lg font-bold text-[#0C1B3A] mb-2">{c.title}</h3>
                <p className="text-xs text-gray-600 leading-relaxed mb-5">{c.desc}</p>

                <ul className="space-y-2 mb-6">
                  {c.points.map((p, j) => (
                    <li key={j} className="flex items-start gap-1.5 text-xs text-gray-700 font-medium">
                      <span className="text-emerald-500 font-bold">✓</span>
                      <span>{p}</span>
                    </li>
                  ))}
                </ul>
              </div>

              <button
                onClick={onLogin}
                className="w-full py-2.5 rounded-xl border border-[#1D6AE5] text-[#1D6AE5] font-bold text-xs hover:bg-[#1D6AE5] hover:text-white transition active:scale-95 cursor-pointer"
              >
                {c.btnText}
              </button>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

/* ═══════════════════════════════════════════════════════════
   ABOUT US SECTION
═══════════════════════════════════════════════════════════ */
function AboutSection({ onLogin, isHindi }) {
  return (
    <section id="about" className="py-20 md:py-28 bg-[#FAFBFF] relative">
      <div className="max-w-7xl mx-auto px-5 md:px-8">
        <div className="grid lg:grid-cols-2 gap-12 items-center">
          <div>
            <span className="text-xs font-extrabold px-3 py-1 rounded-full bg-blue-50 text-[#1D6AE5] border border-blue-200">
              ✦ About Educa Fintech
            </span>
            <h2 className="text-3xl sm:text-4xl font-black text-[#0C1B3A] tracking-tight mt-3 mb-5 leading-snug">
              {isHindi
                ? "फिनटेक जो हर आम इंसान और छोटे व्यापारी के साथ खड़ा है"
                : "Empowering Everyday Earners with Verifiable Wealth & Credit"}
            </h2>
            <div className="space-y-4 text-sm sm:text-base text-gray-600 leading-relaxed">
              <p>
                {isHindi
                  ? "अक्सर पारंपरिक बैंक उन लोगों को लोन देने से मना कर देते हैं जिनके पास भारी कोलैटरल या अत्यधिक सिबिल स्कोर नहीं होता।"
                  : "Traditional banks often gatekeep credit from hard-working individuals and small shopkeepers who lack high CIBIL scores or complex collateral."}
              </p>
              <p>
                {isHindi ? (
                  <>
                    <strong>एड्यूका फिनटेक</strong> इसी व्यवस्था को बदलने के लिए शुरू हुआ — चाहे किसी को तत्काल <strong>₹199 का रिचार्ज लोन</strong> चाहिए हो या ₹50,000 का व्यापार लोन, पारदर्शी शर्तों पर सहायता मिलती है।
                  </>
                ) : (
                  <>
                    <strong>Educa Fintech</strong> was built to transform this paradigm. From an instant <strong>₹199 recharge micro-loan</strong> to ₹50,000 structured business funding, we deliver accessible credit without bureaucratic delays.
                  </>
                )}
              </p>
              <p>
                {isHindi
                  ? "साथ ही 12% वार्षिक लिक्विड बचत और 18% फिक्स्ड बॉन्ड के साथ आपके पैसों को उच्चतम सुरक्षित रिटर्न मिलता है।"
                  : "Paired with our hallmark 12% p.a. daily compounding liquid savings and 18% fixed bonds, your capital compounds at industry-leading benchmarks."}
              </p>
            </div>

            <div className="mt-8 flex flex-wrap gap-4">
              <div className="flex items-center gap-3 bg-white px-4 py-3 rounded-2xl border border-gray-200 shadow-sm">
                <span className="text-2xl">🔒</span>
                <div>
                  <div className="text-xs font-bold text-[#0C1B3A]">RBI Guidelines</div>
                  <div className="text-[10px] text-gray-400">Strict Compliance</div>
                </div>
              </div>
              <div className="flex items-center gap-3 bg-white px-4 py-3 rounded-2xl border border-gray-200 shadow-sm">
                <span className="text-2xl">⚡</span>
                <div>
                  <div className="text-xs font-bold text-[#0C1B3A]">Instant Payout</div>
                  <div className="text-[10px] text-gray-400">Direct to Bank / UPI</div>
                </div>
              </div>
              <div className="flex items-center gap-3 bg-white px-4 py-3 rounded-2xl border border-gray-200 shadow-sm">
                <span className="text-2xl">📈</span>
                <div>
                  <div className="text-xs font-bold text-[#0C1B3A]">12% Annual Yield</div>
                  <div className="text-[10px] text-gray-400">Daily Accrual</div>
                </div>
              </div>
            </div>
          </div>

          <div className="bg-white rounded-3xl p-8 border border-[#E8EDF5] shadow-xl shadow-blue-900/5">
            <h3 className="text-xl font-bold text-[#0C1B3A] mb-4">
              {isHindi ? "एड्यूका फिनटेक को क्यों चुनें?" : "Why Choose Educa Fintech?"}
            </h3>

            <div className="space-y-4">
              {[
                {
                  label: isHindi ? "12% दैनिक लिक्विड ब्याज" : "12% Daily Liquid Interest",
                  desc: isHindi ? "हर सेकंड आपके प्रॉफिट वॉलेट में जुड़ने वाला पारदर्शी मुनाफा" : "Transparent live accrual credited second-by-second to your Profit Wallet",
                },
                {
                  label: isHindi ? "18% 365-दिन फिक्स्ड बॉन्ड" : "18% 365-Day Fixed Bonds",
                  desc: isHindi ? "मैच्योरिटी पर निश्चित 18% वार्षिक लाभ गारंटी के साथ" : "Guaranteed flat 18% profit on maturity backed by liquidity reserves",
                },
                {
                  label: isHindi ? "मासिक लेंडिंग बॉन्ड (40 और 80 माह)" : "Monthly Lending Bonds (40 & 80 Mo)",
                  desc: isHindi ? "₹3,500/माह या ₹2,500/माह का स्थिर पैसिव कैशफ्लो" : "₹3,500/mo or ₹2,500/mo predictable passive cashflow",
                },
                {
                  label: isHindi ? "लचीली किस्तें (10-दिन साइकिल)" : "Flexible 10-Day Installments",
                  desc: isHindi ? "महीने की 1, 11 और 21 तारीख को आसान किस्तों का भुगतान" : "Scheduled installments on 1st, 11th, and 21st with zero hidden fees",
                },
              ].map((item, i) => (
                <div key={i} className="flex items-start gap-3.5 p-3 rounded-xl bg-gray-50/70">
                  <div className="w-6 h-6 rounded-full bg-emerald-100 text-emerald-700 flex items-center justify-center text-xs font-bold shrink-0 mt-0.5">
                    ✓
                  </div>
                  <div>
                    <div className="text-sm font-bold text-[#0C1B3A]">{item.label}</div>
                    <div className="text-xs text-gray-500 mt-0.5">{item.desc}</div>
                  </div>
                </div>
              ))}
            </div>

            <button
              onClick={onLogin}
              className="mt-8 w-full py-3 bg-[#1D6AE5] hover:bg-[#1558cc] text-white rounded-xl font-bold text-sm shadow-md transition active:scale-95 cursor-pointer"
            >
              {isHindi ? "आज ही एड्यूका से जुड़ें →" : "Get Started with Educa Today →"}
            </button>
          </div>
        </div>
      </div>
    </section>
  );
}

/* ═══════════════════════════════════════════════════════════
   MAIN LANDING PAGE EXPORT
═══════════════════════════════════════════════════════════ */
export default function LandingPage() {
  const navigate = useNavigate();
  const handleLogin = () => navigate("/login");

  const [siteLang, setSiteLang] = useState(() => {
    try {
      return localStorage.getItem("educa_site_lang") || "en";
    } catch {
      return "en";
    }
  });

  useEffect(() => {
    const onLangChange = () => {
      try {
        setSiteLang(localStorage.getItem("educa_site_lang") || "en");
      } catch {}
    };
    window.addEventListener("site_language_changed", onLangChange);
    return () => window.removeEventListener("site_language_changed", onLangChange);
  }, []);

  const isHindi = siteLang === "hi";

  return (
    <div className="font-sans text-[#0C1B3A] bg-[#FAFBFF] min-h-screen">
      <Header />
      <HeroSection onLogin={handleLogin} isHindi={isHindi} />
      <EmiCalculatorSection onLogin={handleLogin} isHindi={isHindi} />
      <ServicesSection onLogin={handleLogin} isHindi={isHindi} />
      <AboutSection onLogin={handleLogin} isHindi={isHindi} />
      <Footer />
    </div>
  );
}
