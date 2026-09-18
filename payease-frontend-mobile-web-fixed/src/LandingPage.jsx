import { useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
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
   NAVBAR
═══════════════════════════════════════════════════════════ */
function Navbar({ onLogin }) {
  const [scrolled, setScrolled] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);

  useEffect(() => {
    const fn = () => setScrolled(window.scrollY > 20);
    window.addEventListener("scroll", fn, { passive: true });
    return () => window.removeEventListener("scroll", fn);
  }, []);

  const navLinks = [
    { label: "12% Savings", id: "savings" },
    { label: "Recharge to Bike Loan", id: "loans" },
    { label: "School Fees Loan", id: "school-loan" },
    { label: "EMI Calculator", id: "emi-calculator" },
    { label: "About Us", id: "about" },
  ];

  const scrollTo = (id) => {
    setMenuOpen(false);
    document.getElementById(id)?.scrollIntoView({ behavior: "smooth" });
  };

  return (
    <header
      className={`fixed top-0 inset-x-0 z-50 transition-all duration-300 ${
        scrolled
          ? "bg-[#FAFBFF]/90 backdrop-blur-xl border-b border-[#E8EDF5] shadow-sm"
          : "bg-transparent border-b border-transparent"
      }`}
    >
      <div className="max-w-7xl mx-auto px-5 md:px-8 h-16 flex items-center justify-between">
        {/* LOGO */}
        <div className="flex items-center gap-2.5 cursor-pointer" onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}>
          <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-[#1D6AE5] to-[#0DC98A] flex items-center justify-center text-white font-black text-lg shadow-md shadow-blue-500/20">
            E
          </div>
          <div>
            <span className="font-extrabold text-xl text-[#0C1B3A] tracking-tight">
              Educa<span className="text-[#1D6AE5]">Fintech</span>
            </span>
            <span className="hidden sm:inline-block ml-2 text-[10px] font-extrabold px-2 py-0.5 rounded-full bg-amber-50 text-amber-800 border border-amber-300">
              🔥 12% Savings APY
            </span>
          </div>
        </div>

        {/* DESKTOP NAV */}
        <nav className="hidden lg:flex items-center gap-6">
          {navLinks.map((l) => (
            <button
              key={l.id}
              onClick={() => scrollTo(l.id)}
              className="text-xs sm:text-sm font-bold text-gray-600 hover:text-[#1D6AE5] transition py-1"
            >
              {l.label}
            </button>
          ))}
        </nav>

        {/* CTA */}
        <div className="hidden sm:flex items-center gap-3">
          <button
            onClick={onLogin}
            className="text-sm font-bold text-gray-700 hover:text-[#1D6AE5] px-3 py-2 transition"
          >
            Sign In
          </button>
          <button
            onClick={onLogin}
            className="px-5 py-2.5 rounded-xl text-xs sm:text-sm font-extrabold text-white bg-[#1D6AE5] hover:bg-[#1558cc] active:scale-95 transition shadow-md shadow-blue-500/25 flex items-center gap-1.5"
          >
            <span>🏦</span> Open 12% Account
          </button>
        </div>

        {/* MOBILE MENU TOGGLE */}
        <button
          onClick={() => setMenuOpen(!menuOpen)}
          className="lg:hidden p-2 rounded-lg bg-gray-100 text-gray-700 text-lg"
          aria-label="Menu"
        >
          {menuOpen ? "✕" : "☰"}
        </button>
      </div>

      {/* MOBILE DRAWER */}
      {menuOpen && (
        <div className="lg:hidden bg-white/95 backdrop-blur-xl border-b border-gray-200 px-6 py-4 space-y-3">
          {navLinks.map((l) => (
            <button
              key={l.id}
              onClick={() => scrollTo(l.id)}
              className="block w-full text-left text-sm font-semibold text-gray-700 py-2 border-b border-gray-50"
            >
              {l.label}
            </button>
          ))}
          <div className="pt-2 flex flex-col gap-2">
            <button
              onClick={onLogin}
              className="w-full py-2.5 rounded-xl text-sm font-bold text-[#1D6AE5] border border-[#1D6AE5]"
            >
              Sign In
            </button>
            <button
              onClick={onLogin}
              className="w-full py-2.5 rounded-xl text-sm font-bold text-white bg-[#1D6AE5]"
            >
              Open 12% Account / Apply Loan
            </button>
          </div>
        </div>
      )}
    </header>
  );
}

/* ═══════════════════════════════════════════════════════════
   HERO SECTION (With Evervault Quantum Card Scanner Stream)
═══════════════════════════════════════════════════════════ */
function HeroSection({ onLogin }) {
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
          
          {/* SLEEK LIVE STATUS BADGE */}
          <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-blue-50/90 border border-blue-200/80 shadow-xs backdrop-blur-md mb-4 text-xs font-semibold text-blue-900 select-none">
            <span className="flex h-2 w-2 relative">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
            </span>
            <span className="font-extrabold text-emerald-700 bg-emerald-100/90 px-2 py-0.5 rounded text-[11px] tracking-wide uppercase">
              12% Saal Ka
            </span>
            <span className="text-gray-800 font-bold">Saving Account Par Paye</span>
          </div>

          {/* HEADLINE: CRAFTED OPTICAL HIERARCHY */}
          <h1 className="text-2xl xs:text-3xl sm:text-5xl lg:text-6xl font-black text-[#0A192F] tracking-tight leading-[1.14] mb-3 sm:mb-4">
            ₹199 Recharge se leke{" "}
            <span className="bg-gradient-to-r from-[#1D6AE5] via-[#0DC98A] to-[#059669] bg-clip-text text-transparent">
              Bike & School Loan tak
            </span>
          </h1>

          {/* REFINED SUBCONTENT */}
          <p className="text-xs sm:text-base text-gray-600 leading-relaxed max-w-xl mx-auto mb-5 px-2">
            Jise koi loan nahi deta, use <strong className="text-gray-950 font-bold">Educa Fintech</strong> deta hai — bina CIBIL jhanjhat ke. Sath me pao{" "}
            <strong className="text-emerald-700 font-bold bg-emerald-50 px-1.5 py-0.5 rounded border border-emerald-200/70 inline-block">
              12% saal ka interest
            </strong>{" "}
            saving account par!
          </p>

          {/* SINGLE HIGH-CONVERTING FINTECH CTA */}
          <div className="max-w-xs sm:max-w-sm mx-auto mb-6 px-2">
            <button
              onClick={onLogin}
              className="w-full py-3.5 px-6 rounded-2xl font-black text-sm sm:text-base text-white bg-gradient-to-r from-[#1D6AE5] via-[#1558cc] to-[#0DC98A] hover:opacity-95 active:scale-[0.98] transition-all duration-150 shadow-xl shadow-blue-500/25 flex items-center justify-center gap-2 cursor-pointer tracking-tight"
            >
              <span>Open Free Account</span>
              <span>→</span>
            </button>
            
            {/* CLEAN TRUST METRICS & EMI LINK */}
            <div className="flex items-center justify-center gap-2.5 sm:gap-4 mt-2.5 text-[11px] sm:text-xs text-gray-500 font-medium">
              <span className="flex items-center gap-1"><span className="text-emerald-500 font-bold">✓</span> Zero Balance</span>
              <span className="text-gray-300">•</span>
              <span className="flex items-center gap-1"><span className="text-emerald-500 font-bold">✓</span> Instant ₹199 Loan</span>
              <span className="text-gray-300">•</span>
              <button
                onClick={() => document.getElementById("emi-calculator")?.scrollIntoView({ behavior: "smooth" })}
                className="text-[#1D6AE5] font-bold hover:underline cursor-pointer flex items-center gap-1"
              >
                <span>📊</span> EMI Calc
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

        {/* BOTTOM QUICK FORM + HIGHLIGHT CARDS */}
        <div className="grid lg:grid-cols-12 gap-8 items-center mt-10">
          <div className="lg:col-span-7 space-y-4">
            <div className="p-5 sm:p-6 bg-white rounded-3xl border border-[#E8EDF5] shadow-lg shadow-blue-900/5">
              <div className="flex items-center gap-3 mb-3">
                <span className="text-3xl">💎</span>
                <div>
                  <h3 className="font-extrabold text-lg text-[#0C1B3A]">
                    12% Saving Account — World's Highest Interest
                  </h3>
                  <p className="text-xs text-gray-500">
                    Baki banks dete hain sirf 2.5% - 3%, Educa deta hai <strong>flat 12% per annum</strong> daily calculation ke saath!
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
                  <p className="text-xs text-gray-500">Phone recharge ke liye turant instant loan</p>
                </div>
              </div>
              <div className="p-4 bg-white rounded-2xl border border-gray-200 shadow-sm flex items-center gap-3">
                <span className="text-3xl">🏍️</span>
                <div>
                  <h4 className="font-bold text-sm text-[#0C1B3A]">Bike & 2-Wheeler Loan</h4>
                  <p className="text-xs text-gray-500">₹20,000 se ₹1,50,000 tak aasan EMI</p>
                </div>
              </div>
            </div>
          </div>

          <div className="lg:col-span-5">
            <QuickLoanQueryCard />
          </div>
        </div>

        {/* STATS STRIP */}
        <div className="mt-14 bg-white rounded-3xl p-6 sm:p-8 border border-[#E8EDF5] shadow-lg shadow-blue-900/5 grid grid-cols-2 md:grid-cols-4 gap-6 text-center">
          <div>
            <div className="text-3xl sm:text-4xl font-black text-[#FF7B35]">
              <Counter to={12} suffix="%" />
            </div>
            <div className="text-xs font-semibold text-gray-500 mt-1">Savings Account Interest (Max)</div>
          </div>
          <div>
            <div className="text-3xl sm:text-4xl font-black text-[#0C1B3A]">
              ₹<Counter to={199} prefix="" />
            </div>
            <div className="text-xs font-semibold text-gray-500 mt-1">Starting Mobile Recharge Loan</div>
          </div>
          <div>
            <div className="text-3xl sm:text-4xl font-black text-[#0DC98A]">
              ₹<Counter to={150000} suffix="" />
            </div>
            <div className="text-xs font-semibold text-gray-500 mt-1">Bike & Vehicle Loan Max</div>
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
function QuickLoanQueryCard() {
  const [formData, setFormData] = useState({
    name: "",
    phone: "",
    email: "",
    amount: "25000",
    purpose: "School Fees / Urgent Personal",
  });
  const [status, setStatus] = useState({ state: "idle", msg: "" });

  const handleSubmit = async (e) => {
    e.preventDefault();
    setStatus({ state: "submitting", msg: "Submitting query..." });

    try {
      const res = await fetch(`${API}/loan/query`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(formData),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || "Submission failed");

      setStatus({
        state: "success",
        msg: "Query received! Admin ko instant alert chala gaya hai, hamari team aapse turant contact karegi.",
      });
      setFormData({ name: "", phone: "", email: "", amount: "25000", purpose: "School Fees / Urgent Personal" });
    } catch (err) {
      setStatus({ state: "error", msg: err.message || "Failed to submit query" });
    }
  };

  return (
    <div className="bg-white rounded-3xl p-6 sm:p-8 border border-[#E8EDF5] shadow-xl shadow-blue-900/10 relative">
      <div className="flex items-center justify-between mb-4">
        <div>
          <span className="text-[11px] font-extrabold uppercase tracking-wider text-[#1D6AE5] bg-blue-50 px-2.5 py-1 rounded-md">
            Direct Loan Query
          </span>
          <h3 className="text-xl font-bold text-[#0C1B3A] mt-2">Loan Chahiye? Yahan Bhejo</h3>
        </div>
        <div className="w-10 h-10 rounded-2xl bg-emerald-50 text-emerald-600 flex items-center justify-center text-xl">
          🔔
        </div>
      </div>

      <p className="text-xs text-gray-500 mb-5">
        Query submit karte hi admin ko <strong>real-time chrome & mobile sound</strong> ke saath alert jata hai!
      </p>

      {status.state === "success" ? (
        <div className="bg-emerald-50 border border-emerald-200 rounded-2xl p-5 text-center">
          <span className="text-3xl block mb-2">🎉</span>
          <h4 className="font-bold text-emerald-800 text-sm">Query Submitted Successfully!</h4>
          <p className="text-xs text-emerald-700 mt-1">{status.msg}</p>
          <button
            onClick={() => setStatus({ state: "idle", msg: "" })}
            className="mt-4 px-4 py-2 bg-emerald-600 text-white rounded-xl text-xs font-bold"
          >
            Nayi Query Bhejo
          </button>
        </div>
      ) : (
        <form onSubmit={handleSubmit} className="space-y-3.5">
          <div>
            <label className="block text-xs font-bold text-gray-700 mb-1">Aapka Naam *</label>
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
              <label className="block text-xs font-bold text-gray-700 mb-1">Mobile No *</label>
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
            <label className="block text-xs font-bold text-gray-700 mb-1">Loan Purpose</label>
            <select
              value={formData.purpose}
              onChange={(e) => setFormData({ ...formData, purpose: e.target.value })}
              className="w-full px-3.5 py-2.5 border border-gray-200 rounded-xl focus:ring-2 focus:ring-[#1D6AE5] outline-none text-sm bg-white"
            >
              <option value="School / College Fees Loan">School / College Fees Loan</option>
              <option value="Micro Personal Loan (Rejected by Banks)">Micro Personal Loan (Rejected by Banks)</option>
              <option value="Small Business / Shop Loan">Small Business / Shop Loan</option>
              <option value="Emergency Medical / Urgent Loan">Emergency Medical / Urgent Loan</option>
            </select>
          </div>

          <button
            type="submit"
            disabled={status.state === "submitting"}
            className="w-full py-3 rounded-xl bg-gradient-to-r from-[#1D6AE5] to-[#0DC98A] text-white font-extrabold text-sm active:scale-95 transition shadow-md shadow-blue-500/20 disabled:opacity-50"
          >
            {status.state === "submitting" ? "Sending Alert to Admin..." : "Submit Loan Query (Free) →"}
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
   INTERACTIVE EMI CALCULATOR SECTION
═══════════════════════════════════════════════════════════ */
function EmiCalculatorSection({ onLogin }) {
  const [amount, setAmount] = useState(50000);
  const [tenure, setTenure] = useState(12); // months
  const [rate, setRate] = useState(14); // % p.a.

  // Formula: EMI = P × r × (1+r)^n / ((1+r)^n - 1)
  const monthlyRate = rate / 12 / 100;
  const emi = Math.round(
    (amount * monthlyRate * Math.pow(1 + monthlyRate, tenure)) /
      (Math.pow(1 + monthlyRate, tenure) - 1)
  ) || 0;
  const totalPayable = emi * tenure;
  const totalInterest = totalPayable - amount;

  return (
    <section id="emi-calculator" className="py-20 md:py-28 bg-[#FAFBFF] relative">
      <div className="max-w-7xl mx-auto px-5 md:px-8">
        <div className="text-center max-w-2xl mx-auto mb-14">
          <span className="text-xs font-extrabold px-3 py-1 rounded-full bg-blue-50 text-[#1D6AE5] border border-blue-200">
            📊 Smart Planning
          </span>
          <h2 className="text-3xl sm:text-4xl font-black text-[#0C1B3A] tracking-tight mt-3 mb-3">
            Educa EMI Calculator
          </h2>
          <p className="text-sm sm:text-base text-gray-600">
            Aapki aamdani ke hisaab se sabse aasan EMI chunein. Har mahine kitna dena hoga, yahan check karein.
          </p>
        </div>

        <div className="bg-white rounded-3xl p-6 sm:p-10 border border-[#E8EDF5] shadow-xl shadow-blue-900/5 max-w-4xl mx-auto">
          <div className="grid md:grid-cols-12 gap-10 items-center">
            {/* SLIDERS */}
            <div className="md:col-span-7 space-y-7">
              {/* 1. AMOUNT */}
              <div>
                <div className="flex justify-between items-center mb-2">
                  <label className="text-xs sm:text-sm font-bold text-gray-700">Loan Amount</label>
                  <span className="text-lg font-black text-[#1D6AE5]">
                    ₹{amount.toLocaleString("en-IN")}
                  </span>
                </div>
                <input
                  type="range"
                  min={5000}
                  max={300000}
                  step={5000}
                  value={amount}
                  onChange={(e) => setAmount(Number(e.target.value))}
                  className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-[#1D6AE5]"
                />
                <div className="flex justify-between text-[11px] text-gray-400 mt-1">
                  <span>₹5,000 (Micro)</span>
                  <span>₹1,50,000</span>
                  <span>₹3,00,000</span>
                </div>
              </div>

              {/* 2. TENURE */}
              <div>
                <div className="flex justify-between items-center mb-2">
                  <label className="text-xs sm:text-sm font-bold text-gray-700">Tenure (Mahine)</label>
                  <span className="text-lg font-black text-[#0DC98A]">
                    {tenure} Months
                  </span>
                </div>
                <input
                  type="range"
                  min={3}
                  max={36}
                  step={1}
                  value={tenure}
                  onChange={(e) => setTenure(Number(e.target.value))}
                  className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-[#0DC98A]"
                />
                <div className="flex justify-between text-[11px] text-gray-400 mt-1">
                  <span>3 Months</span>
                  <span>12 Months</span>
                  <span>36 Months</span>
                </div>
              </div>

              {/* 3. INTEREST RATE */}
              <div>
                <div className="flex justify-between items-center mb-2">
                  <label className="text-xs sm:text-sm font-bold text-gray-700">Interest Rate (% per annum)</label>
                  <span className="text-lg font-black text-[#FF7B35]">{rate}%</span>
                </div>
                <input
                  type="range"
                  min={10}
                  max={24}
                  step={0.5}
                  value={rate}
                  onChange={(e) => setRate(Number(e.target.value))}
                  className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-[#FF7B35]"
                />
                <div className="flex justify-between text-[11px] text-gray-400 mt-1">
                  <span>10% (Subsidized / School)</span>
                  <span>18% (Standard)</span>
                  <span>24%</span>
                </div>
              </div>
            </div>

            {/* SUMMARY CARD */}
            <div className="md:col-span-5 bg-gradient-to-br from-[#1D6AE5] to-[#0DC98A] rounded-2xl p-6 text-white text-center shadow-lg shadow-blue-500/20">
              <span className="text-xs uppercase tracking-widest text-white/80 font-bold">
                Monthly EMI Amount
              </span>
              <div className="text-3xl sm:text-4xl font-black mt-2 mb-4 tracking-tight">
                ₹{emi.toLocaleString("en-IN")}
                <span className="text-xs font-normal opacity-75"> / month</span>
              </div>

              <div className="bg-white/15 backdrop-blur-md rounded-xl p-4 text-xs space-y-2 mb-6 text-left">
                <div className="flex justify-between">
                  <span className="text-white/80">Principal Loan:</span>
                  <span className="font-bold">₹{amount.toLocaleString("en-IN")}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-white/80">Total Interest:</span>
                  <span className="font-bold text-amber-200">₹{totalInterest.toLocaleString("en-IN")}</span>
                </div>
                <div className="flex justify-between pt-2 border-t border-white/20 font-bold text-sm">
                  <span>Total Payable:</span>
                  <span>₹{totalPayable.toLocaleString("en-IN")}</span>
                </div>
              </div>

              <button
                onClick={onLogin}
                className="w-full py-3 bg-white text-[#1D6AE5] hover:bg-gray-50 rounded-xl font-extrabold text-sm active:scale-95 transition shadow-md"
              >
                Apply for Loan Now →
              </button>
              <p className="text-[10px] text-white/75 mt-2">
                *₹199 recharge se lekar school fee tak instant loan disbursal
              </p>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

/* ═══════════════════════════════════════════════════════════
   CORE FINTECH PRODUCTS SECTION
═══════════════════════════════════════════════════════════ */
function ServicesSection({ onLogin }) {
  const cards = [
    {
      id: "savings-card",
      icon: "🏦",
      badge: "12% ANNUAL INTEREST",
      badgeColor: "bg-amber-100 text-amber-800 border border-amber-300",
      title: "12% Interest Savings Account",
      desc: "Duniya ka sabse zyada interest! Jahan SBI aur HDFC sirf 2.7% - 3% dete hain, Educa deta hai flat 12% per annum aapke har ek rupaye par.",
      points: [
        "12% Annual Yield with daily interest calculation",
        "Zero minimum balance penalties",
        "24x7 Instant UPI deposit & withdrawal",
        "Duniya me kisi bhi bank se 4x zyada return",
      ],
      btnText: "Open 12% Account →",
    },
    {
      id: "bike-card",
      icon: "🏍️",
      badge: "UP TO ₹1,50,000",
      badgeColor: "bg-purple-100 text-purple-800 border border-purple-200",
      title: "Bike & Two-Wheeler Loans",
      desc: "Apni manpasand motorcycle ya scooter khareedein. Minimal documentation aur low CIBIL par bhi aasan EMI par bike loan sanctioned.",
      points: [
        "Loan amount from ₹20,000 to ₹1,50,000",
        "Low down payment & flexible 36-month tenure",
        "Direct dealership payment processing",
        "Instant approval on Educa Fintech ID",
      ],
      btnText: "Apply Bike Loan →",
    },
    {
      id: "recharge-card",
      icon: "📱",
      badge: "FROM ₹199 ONLY",
      badgeColor: "bg-blue-100 text-[#1D6AE5] border border-blue-200",
      title: "₹199 Mobile Recharge Loan",
      desc: "Jab jeb me paise na hon aur phone recharge karana ho, to Educa aapko ₹199 ka instant micro-loan deta hai jise koi bank nahi deta.",
      points: [
        "Instant ₹199 - ₹5,000 micro-credit",
        "Direct UPI recharge to Jio, Airtel, Vi",
        "Zero CIBIL score required",
        "Repay conveniently in 15 - 30 days",
      ],
      btnText: "Get ₹199 Loan →",
    },
    {
      id: "school-card",
      icon: "🎒",
      badge: "SCHOOL & COLLEGE",
      badgeColor: "bg-emerald-100 text-emerald-800 border border-emerald-200",
      title: "Bachhon Ki School Fees Loan",
      desc: "Bachhon ki padhai rukni nahi chahiye! Direct school & college admission ya quarterly fees hum pay karte hain aur parents aasan monthly EMIs me chukate hain.",
      points: [
        "Direct school / institute fee disbursement",
        "Zero advance fee requirement",
        "Flexible 3 to 12 months tenure",
        "Admission date se pehle instant transfer",
      ],
      btnText: "Apply School Loan →",
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
            Mobile Recharge se lekar Bike Loan aur 12% Savings
          </h2>
          <p className="text-sm sm:text-base text-gray-600">
            Educa Fintech aam insaan ki aarthik zaroorat samajhta hai — chhote se chhota recharge ho ya badi saving, hum har mod par aapke saath hain.
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
                className="w-full py-2.5 rounded-xl border border-[#1D6AE5] text-[#1D6AE5] font-bold text-xs hover:bg-[#1D6AE5] hover:text-white transition active:scale-95"
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
function AboutSection({ onLogin }) {
  return (
    <section id="about" className="py-20 md:py-28 bg-[#FAFBFF] relative">
      <div className="max-w-7xl mx-auto px-5 md:px-8">
        <div className="grid lg:grid-cols-2 gap-12 items-center">
          <div>
            <span className="text-xs font-extrabold px-3 py-1 rounded-full bg-blue-50 text-[#1D6AE5] border border-blue-200">
              ✦ About Educa Fintech
            </span>
            <h2 className="text-3xl sm:text-4xl font-black text-[#0C1B3A] tracking-tight mt-3 mb-5 leading-snug">
              Fintech jo har aam insaan ke saath khada hai
            </h2>
            <div className="space-y-4 text-sm sm:text-base text-gray-600 leading-relaxed">
              <p>
                Aksar bade banks aur traditional finance companies un logon ko loan dene se mana kar dete hain jinke paas heavy collateral ya high CIBIL score nahi hota.
              </p>
              <p>
                <strong>Educa Fintech</strong> isi soch ko badalne ke liye shuru hua. Chahe kisi ko urgent <strong>₹199 ka mobile recharge</strong> karwana ho ya ₹50,000 ka business loan — hum kisi ko mana nahi karte!
              </p>
              <p>
                Bachhon ke school fees ki timely payment se lekar urgent daily financial support tak — Educa aapka har pal bharosemand saathi hai.
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
            </div>
          </div>

          <div className="bg-white rounded-3xl p-8 border border-[#E8EDF5] shadow-xl shadow-blue-900/5">
            <h3 className="text-xl font-bold text-[#0C1B3A] mb-6">Educa Trust Indicators</h3>
            <div className="space-y-4">
              {[
                { label: "₹199 Recharge Loan Available", desc: "Chhote se chhote mobile recharge ke liye bhi instant loan" },
                { label: "Educa Mail Linked", desc: "Auto-synced mail account for statements & reset links" },
                { label: "Flexible Tenure", desc: "3 mahine se 36 mahine tak ki custom EMI options" },
                { label: "24x7 Real-time Alerts", desc: "Aapke query par turant admin desk ko intimation" },
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
              className="mt-8 w-full py-3 bg-[#1D6AE5] hover:bg-[#1558cc] text-white rounded-xl font-bold text-sm shadow-md transition active:scale-95"
            >
              Get Started with Educa Today →
            </button>
          </div>
        </div>
      </div>
    </section>
  );
}

/* ═══════════════════════════════════════════════════════════
   FOOTER
═══════════════════════════════════════════════════════════ */
function Footer() {
  return (
    <footer className="bg-white border-t border-[#E8EDF5] py-12">
      <div className="max-w-7xl mx-auto px-5 md:px-8">
        <div className="flex flex-col md:flex-row justify-between items-center gap-6">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-gradient-to-tr from-[#1D6AE5] to-[#0DC98A] flex items-center justify-center text-white font-black text-sm">
              E
            </div>
            <span className="font-extrabold text-lg text-[#0C1B3A]">
              Educa<span className="text-[#1D6AE5]">Fintech</span>
            </span>
          </div>

          <p className="text-xs text-gray-400 text-center">
            © 2026 Educa Fintech Pvt. Ltd. · Micro Loans, Investments & School Fee Financing · All Rights Reserved
          </p>

          <div className="flex gap-5 text-xs text-gray-500 font-medium">
            <a href="#" className="hover:text-[#1D6AE5] transition">Privacy Policy</a>
            <a href="#" className="hover:text-[#1D6AE5] transition">Terms of Loan</a>
            <a href="#" className="hover:text-[#1D6AE5] transition">₹199 Policy</a>
            <a href="#" className="hover:text-[#1D6AE5] transition">Contact Us</a>
          </div>
        </div>
      </div>
    </footer>
  );
}

/* ═══════════════════════════════════════════════════════════
   MAIN LANDING PAGE EXPORT
═══════════════════════════════════════════════════════════ */
export default function LandingPage() {
  const navigate = useNavigate();
  const handleLogin = () => navigate("/login");

  return (
    <div className="font-sans text-[#0C1B3A] bg-[#FAFBFF] min-h-screen">
      <Navbar onLogin={handleLogin} />
      <HeroSection onLogin={handleLogin} />
      <EmiCalculatorSection onLogin={handleLogin} />
      <ServicesSection onLogin={handleLogin} />
      <AboutSection onLogin={handleLogin} />
      <Footer />
    </div>
  );
}
