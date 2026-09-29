import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { API } from "./config";

export default function Login() {
  const navigate = useNavigate();
  const [tab, setTab] = useState("login"); // "login" | "mail-login" | "register" | "forgot"
  const [msg, setMsg] = useState({ text: "", type: "" });
  const [loading, setLoading] = useState(false);
  const [rememberMe, setRememberMe] = useState(true);
  const [showMailModal, setShowMailModal] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  // Auto-redirect if already logged in (never kick user to login page)
  useEffect(() => {
    const token = localStorage.getItem("token");
    const user = JSON.parse(localStorage.getItem("user") || "null");
    if (token && user) {
      window.location.replace(user.role === "admin" ? "/admin" : "/dashboard");
    }
  }, []);

  const [loginData, setLoginData] = useState({ email: "", password: "" });
  const [mailLoginData, setMailLoginData] = useState({ email: "", password: "" });
  const [forgotEmail, setForgotEmail] = useState("");
  const [regData, setRegData] = useState({
    name: "",
    email: "",
    phone: "",
    password: "",
    referralCode: "",
    isAgent: false,
    agentCommissionModel: "solo_2",
    agentBusinessName: "",
    agentCity: "",
  });

  const showMsg = (text, type = "error") => setMsg({ text, type });

  const handleStandardLogin = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      const res = await fetch(`${API}/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          identifier: loginData.email.trim(),
          email: loginData.email.trim(),
          password: loginData.password,
          rememberMe,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || "Invalid credentials");
      localStorage.setItem("token", data.token);
      localStorage.setItem("user", JSON.stringify(data.user));
      showMsg("Login successful! Redirecting...", "success");
      setTimeout(() => {
        window.location.href = data.user.role === "admin" ? "/admin" : "/dashboard";
      }, 600);
    } catch (err) {
      showMsg(err.message, "error");
    } finally {
      setLoading(false);
    }
  };

  const handleMailLogin = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      const res = await fetch(`${API}/auth/mail-login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(mailLoginData),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || "Educa Mail login failed");
      localStorage.setItem("token", data.token);
      localStorage.setItem("user", JSON.stringify(data.user));
      showMsg("Logged in with Educa Mail (30 Days Active)! Redirecting...", "success");
      setTimeout(() => {
        window.location.href = data.user.role === "admin" ? "/admin" : "/dashboard";
      }, 600);
    } catch (err) {
      showMsg(err.message, "error");
    } finally {
      setLoading(false);
    }
  };

  const handleRegister = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      const res = await fetch(`${API}/auth/register`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(regData),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || "Registration failed");
      localStorage.setItem("token", data.token);
      showMsg(
        regData.isAgent
          ? "🎉 Partner application submitted! Redirecting..."
          : "Account & Educa Mail created! Redirecting...",
        "success"
      );
      setTimeout(() => {
        window.location.href = "/dashboard";
      }, 700);
    } catch (err) {
      showMsg(err.message, "error");
    } finally {
      setLoading(false);
    }
  };

  const handleForgotPassword = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      const res = await fetch(`${API}/auth/forgot-password`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: forgotEmail }),
      });
      const data = await res.json();
      showMsg(data.message || "Password reset instructions sent to your Educa Mail", "success");
    } catch (err) {
      showMsg(err.message || "Failed to send reset link", "error");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-[100dvh] flex flex-col justify-between items-center px-4 py-8 bg-[#090D16] text-white relative font-sans overflow-x-hidden selection:bg-blue-600 selection:text-white">
      {/* AMBIENT LIGHTING BACKGROUND */}
      <div className="absolute top-0 inset-x-0 h-96 bg-gradient-to-b from-blue-600/20 via-cyan-500/10 to-transparent pointer-events-none blur-3xl" />
      <div className="absolute -top-24 -right-24 w-96 h-96 bg-blue-500/15 rounded-full blur-[100px] pointer-events-none" />
      <div className="absolute top-1/2 -left-32 w-80 h-80 bg-cyan-500/10 rounded-full blur-[100px] pointer-events-none" />

      {/* TOP BRAND BAR (NO BACK BUTTON) */}
      <div className="w-full max-w-md pt-2 flex items-center justify-between relative z-10">
        <div className="flex items-center gap-2.5">
          <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-blue-600 to-cyan-500 flex items-center justify-center text-lg font-black text-white shadow-lg shadow-blue-500/25">
            E
          </div>
          <div>
            <span className="font-extrabold text-sm tracking-tight bg-gradient-to-r from-white via-slate-100 to-slate-300 bg-clip-text text-transparent block leading-tight">
              Educa Fintech
            </span>
            <span className="text-[10px] text-cyan-400 font-medium tracking-wide">
              Official Portal
            </span>
          </div>
        </div>

        <div className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-slate-800/80 border border-slate-700/60 backdrop-blur-md text-[11px] text-slate-300">
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
          <span>RBI NBFC Gateway</span>
        </div>
      </div>

      {/* MAIN CARD CONTAINER */}
      <div className="w-full max-w-md my-auto pt-6 pb-4 relative z-10">
        {/* HERO TITLE */}
        <div className="text-center mb-6">
          <h1 className="text-2xl sm:text-3xl font-black tracking-tight text-white font-display">
            Welcome to <span className="bg-gradient-to-r from-blue-400 via-cyan-300 to-emerald-400 bg-clip-text text-transparent">Educa</span>
          </h1>
          <p className="text-xs sm:text-sm text-slate-400 mt-1">
            Micro-credit, 365-day bonds & instant P2P payments
          </p>
        </div>

        {/* GLASS CARD */}
        <div className="bg-slate-900/90 backdrop-blur-2xl rounded-3xl p-6 sm:p-7 border border-slate-800 shadow-2xl shadow-black/60 relative">
          {/* SEGMENTED TAB SELECTOR (Apple-style) */}
          <div className="grid grid-cols-3 gap-1 p-1 bg-slate-950/70 border border-slate-800/80 rounded-2xl mb-6">
            <button
              onClick={() => { setTab("login"); setMsg({ text: "", type: "" }); }}
              className={`py-2 rounded-xl text-xs font-bold transition-all duration-200 ${
                tab === "login"
                  ? "bg-gradient-to-r from-blue-600 to-indigo-600 text-white shadow-md shadow-blue-600/30"
                  : "text-slate-400 hover:text-white"
              }`}
            >
              Sign In
            </button>
            <button
              onClick={() => { setTab("mail-login"); setMsg({ text: "", type: "" }); }}
              className={`py-2 rounded-xl text-xs font-bold transition-all duration-200 flex items-center justify-center gap-1 ${
                tab === "mail-login"
                  ? "bg-gradient-to-r from-blue-600 to-indigo-600 text-white shadow-md shadow-blue-600/30"
                  : "text-slate-400 hover:text-white"
              }`}
            >
              <span>✉️</span> Mail SSO
            </button>
            <button
              onClick={() => { setTab("register"); setMsg({ text: "", type: "" }); }}
              className={`py-2 rounded-xl text-xs font-bold transition-all duration-200 ${
                tab === "register"
                  ? "bg-gradient-to-r from-blue-600 to-indigo-600 text-white shadow-md shadow-blue-600/30"
                  : "text-slate-400 hover:text-white"
              }`}
            >
              Register
            </button>
          </div>

          {/* 1. STANDARD SIGN IN */}
          {tab === "login" && (
            <form onSubmit={handleStandardLogin} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                  Mobile Number / Email Address
                </label>
                <div className="relative">
                  <input
                    type="text"
                    required
                    value={loginData.email}
                    onChange={(e) => setLoginData({ ...loginData, email: e.target.value })}
                    placeholder="9876543210 or name@email.com"
                    className="w-full px-4 py-3 bg-slate-950/60 border border-slate-700/80 rounded-2xl text-white placeholder-slate-500 text-sm focus:border-cyan-400 focus:ring-2 focus:ring-cyan-500/20 outline-none transition"
                  />
                  <span className="absolute right-3.5 top-3.5 text-slate-500 text-sm">👤</span>
                </div>
              </div>

              <div>
                <div className="flex justify-between items-center mb-1.5">
                  <label className="block text-xs font-semibold text-slate-300">
                    Security Password
                  </label>
                  <button
                    type="button"
                    onClick={() => { setTab("forgot"); setMsg({ text: "", type: "" }); }}
                    className="text-xs text-cyan-400 hover:text-cyan-300 font-medium hover:underline"
                  >
                    Forgot password?
                  </button>
                </div>
                <div className="relative">
                  <input
                    type={showPassword ? "text" : "password"}
                    required
                    value={loginData.password}
                    onChange={(e) => setLoginData({ ...loginData, password: e.target.value })}
                    placeholder="••••••••"
                    className="w-full px-4 py-3 bg-slate-950/60 border border-slate-700/80 rounded-2xl text-white placeholder-slate-500 text-sm focus:border-cyan-400 focus:ring-2 focus:ring-cyan-500/20 outline-none transition pr-11"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3.5 top-3 text-slate-400 hover:text-slate-200 text-sm"
                  >
                    {showPassword ? "🙈" : "👁️"}
                  </button>
                </div>
              </div>

              <div className="flex items-center justify-between text-xs text-slate-400 pt-1">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={rememberMe}
                    onChange={(e) => setRememberMe(e.target.checked)}
                    className="w-4 h-4 rounded bg-slate-800 border-slate-700 text-blue-500 focus:ring-0"
                  />
                  <span>Stay logged in (30 days active session)</span>
                </label>
              </div>

              <button
                type="submit"
                disabled={loading}
                className="w-full py-3.5 bg-gradient-to-r from-blue-600 via-indigo-600 to-cyan-500 hover:opacity-95 text-white rounded-2xl font-bold text-sm shadow-lg shadow-blue-500/25 active:scale-[0.98] transition disabled:opacity-50 flex items-center justify-center gap-2"
              >
                {loading ? (
                  <span className="inline-flex items-center gap-2">
                    <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    Signing In...
                  </span>
                ) : (
                  <>
                    <span>Sign In to Account</span>
                    <span>→</span>
                  </>
                )}
              </button>

              <div className="relative my-4">
                <div className="absolute inset-0 flex items-center">
                  <div className="w-full border-t border-slate-800" />
                </div>
                <div className="relative flex justify-center text-[11px] uppercase tracking-wider">
                  <span className="bg-slate-900 px-3 text-slate-500 font-semibold">Or fast access with</span>
                </div>
              </div>

              {/* EDUCA MAIL 1-CLICK SSO BUTTON */}
              <button
                type="button"
                onClick={() => setShowMailModal(true)}
                className="w-full py-3 px-4 bg-slate-800/80 hover:bg-slate-800 border border-slate-700/80 hover:border-cyan-400/50 text-white rounded-2xl font-bold text-xs flex items-center justify-between shadow-xs transition active:scale-[0.98]"
              >
                <div className="flex items-center gap-2.5">
                  <div className="w-7 h-7 rounded-xl bg-gradient-to-tr from-blue-500 to-emerald-400 text-white flex items-center justify-center text-xs font-black">
                    E
                  </div>
                  <span className="text-slate-200">Sign in with Educa Mail</span>
                </div>
                <span className="px-2 py-0.5 bg-blue-500/20 text-blue-300 text-[10px] font-bold rounded-lg border border-blue-500/30">
                  1-Click SSO
                </span>
              </button>
            </form>
          )}

          {/* 2. EDUCA MAIL 30-DAY SSO */}
          {tab === "mail-login" && (
            <form onSubmit={handleMailLogin} className="space-y-4">
              <div className="p-3.5 bg-blue-950/40 border border-blue-500/30 rounded-2xl text-xs text-blue-200 leading-relaxed">
                <div className="flex items-center gap-1.5 font-bold text-cyan-300">
                  <span>⚡</span> 30-Day Instant Educa Mail Session
                </div>
                <p className="text-slate-400 text-[11px] mt-1">
                  Educa Mail se login karne par automatic 30 dino tak active session rahega, baar baar password nahi mangega.
                </p>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                  Educa Mail Address
                </label>
                <input
                  type="email"
                  required
                  value={mailLoginData.email}
                  onChange={(e) => setMailLoginData({ ...mailLoginData, email: e.target.value })}
                  placeholder="username@educa.com"
                  className="w-full px-4 py-3 bg-slate-950/60 border border-slate-700/80 rounded-2xl text-white placeholder-slate-500 text-sm focus:border-cyan-400 focus:ring-2 focus:ring-cyan-500/20 outline-none transition"
                />
              </div>

              <div>
                <div className="flex justify-between items-center mb-1.5">
                  <label className="block text-xs font-semibold text-slate-300">
                    Educa Password
                  </label>
                  <button
                    type="button"
                    onClick={() => { setTab("forgot"); setMsg({ text: "", type: "" }); }}
                    className="text-xs text-cyan-400 hover:text-cyan-300 font-medium hover:underline"
                  >
                    Reset password
                  </button>
                </div>
                <input
                  type="password"
                  required
                  value={mailLoginData.password}
                  onChange={(e) => setMailLoginData({ ...mailLoginData, password: e.target.value })}
                  placeholder="••••••••"
                  className="w-full px-4 py-3 bg-slate-950/60 border border-slate-700/80 rounded-2xl text-white placeholder-slate-500 text-sm focus:border-cyan-400 focus:ring-2 focus:ring-cyan-500/20 outline-none transition"
                />
              </div>

              <button
                type="submit"
                disabled={loading}
                className="w-full py-3.5 bg-gradient-to-r from-blue-600 via-indigo-600 to-emerald-500 hover:opacity-95 text-white rounded-2xl font-bold text-sm shadow-lg shadow-blue-500/25 active:scale-[0.98] transition disabled:opacity-50"
              >
                {loading ? "Authenticating SSO..." : "Login with Educa Mail (30 Days) →"}
              </button>

              <div className="text-center pt-1">
                <button
                  type="button"
                  onClick={() => { setTab("login"); setMsg({ text: "", type: "" }); }}
                  className="text-xs text-slate-400 hover:text-slate-200"
                >
                  Use standard mobile / email instead
                </button>
              </div>
            </form>
          )}

          {/* 3. REGISTER */}
          {tab === "register" && (
            <form onSubmit={handleRegister} className="space-y-3.5">
              <div className="p-3 bg-emerald-950/40 border border-emerald-500/30 rounded-2xl text-xs text-emerald-200 flex items-start gap-2">
                <span className="text-base">✨</span>
                <div>
                  <span className="font-bold text-emerald-300">Auto Educa Mail Provisioning:</span> Registration ke saath aapka official <strong>Educa Mail</strong> account instantly activate ho jayega.
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">Full Legal Name</label>
                <input
                  type="text"
                  required
                  value={regData.name}
                  onChange={(e) => setRegData({ ...regData, name: e.target.value })}
                  placeholder="e.g. Rahul Sharma"
                  className="w-full px-4 py-2.5 bg-slate-950/60 border border-slate-700/80 rounded-xl text-white placeholder-slate-500 text-sm focus:border-cyan-400 outline-none"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">Email Address</label>
                <input
                  type="email"
                  required
                  value={regData.email}
                  onChange={(e) => setRegData({ ...regData, email: e.target.value })}
                  placeholder="rahul@email.com"
                  className="w-full px-4 py-2.5 bg-slate-950/60 border border-slate-700/80 rounded-xl text-white placeholder-slate-500 text-sm focus:border-cyan-400 outline-none"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">Mobile Number (For Loans & OTP)</label>
                <input
                  type="tel"
                  required
                  value={regData.phone}
                  onChange={(e) => setRegData({ ...regData, phone: e.target.value })}
                  placeholder="+91 9876543210"
                  className="w-full px-4 py-2.5 bg-slate-950/60 border border-slate-700/80 rounded-xl text-white placeholder-slate-500 text-sm focus:border-cyan-400 outline-none"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">Create Password</label>
                <input
                  type="password"
                  required
                  minLength={8}
                  value={regData.password}
                  onChange={(e) => setRegData({ ...regData, password: e.target.value })}
                  placeholder="Min 8 characters"
                  className="w-full px-4 py-2.5 bg-slate-950/60 border border-slate-700/80 rounded-xl text-white placeholder-slate-500 text-sm focus:border-cyan-400 outline-none"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">
                  Referral Code <span className="text-slate-500 font-normal">(Optional)</span>
                </label>
                <input
                  type="text"
                  value={regData.referralCode}
                  onChange={(e) => setRegData({ ...regData, referralCode: e.target.value.toUpperCase() })}
                  placeholder="e.g. EFEDU1234"
                  className="w-full px-4 py-2.5 bg-slate-950/60 border border-amber-500/40 rounded-xl text-amber-300 placeholder-slate-600 text-sm font-mono focus:border-amber-400 outline-none"
                />
              </div>

              {/* AGENT PARTNER APPLICATION OPTION */}
              <div className="pt-2 border-t border-slate-800">
                <label className="flex items-center gap-3 p-3 bg-blue-950/30 border border-blue-500/30 rounded-2xl cursor-pointer hover:bg-blue-900/30 transition">
                  <input
                    type="checkbox"
                    checked={regData.isAgent}
                    onChange={(e) => setRegData({ ...regData, isAgent: e.target.checked })}
                    className="w-4 h-4 rounded text-blue-500 focus:ring-0"
                  />
                  <div>
                    <span className="text-xs font-extrabold text-white block">Apply as Educa Agent / Partner 🤝</span>
                    <span className="text-[11px] text-slate-400 block">Earn attractive monthly loan & deposit commissions</span>
                  </div>
                </label>
              </div>

              {regData.isAgent && (
                <div className="p-3.5 bg-slate-950/80 border border-amber-500/40 rounded-2xl space-y-3">
                  <div>
                    <label className="block text-xs font-extrabold text-amber-300 mb-2">Choose Commission Model</label>
                    <div className="space-y-2">
                      <label className={`p-3 rounded-xl border flex items-start gap-2.5 cursor-pointer text-xs transition ${regData.agentCommissionModel === "team_1" ? "border-amber-500 bg-amber-950/30 ring-1 ring-amber-500/50" : "border-slate-800 bg-slate-900/60"}`}>
                        <input
                          type="radio"
                          name="agentModel"
                          value="team_1"
                          checked={regData.agentCommissionModel === "team_1"}
                          onChange={() => setRegData({ ...regData, agentCommissionModel: "team_1" })}
                          className="mt-0.5 text-amber-500"
                        />
                        <div>
                          <span className="font-extrabold text-white block">👥 Team Model (1% Commission + Team Building)</span>
                          <span className="text-[11px] text-slate-400 block mt-0.5">
                            Aapko 1% commission milega aur aap apne neeche team jod sakte hain (team members ko bhi 1% commission milega).
                          </span>
                        </div>
                      </label>

                      <label className={`p-3 rounded-xl border flex items-start gap-2.5 cursor-pointer text-xs transition ${regData.agentCommissionModel === "solo_2" ? "border-amber-500 bg-amber-950/30 ring-1 ring-amber-500/50" : "border-slate-800 bg-slate-900/60"}`}>
                        <input
                          type="radio"
                          name="agentModel"
                          value="solo_2"
                          checked={regData.agentCommissionModel === "solo_2"}
                          onChange={() => setRegData({ ...regData, agentCommissionModel: "solo_2" })}
                          className="mt-0.5 text-amber-500"
                        />
                        <div>
                          <span className="font-extrabold text-white block">👤 Solo Direct Model (2% Direct Commission)</span>
                          <span className="text-[11px] text-slate-400 block mt-0.5">
                            Aapko direct 2% commission milega (isme team nahi bana sakte, solo work rahega).
                          </span>
                        </div>
                      </label>
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-300 mb-1">Business / Shop Name</label>
                    <input
                      type="text"
                      required={regData.isAgent}
                      value={regData.agentBusinessName}
                      onChange={(e) => setRegData({ ...regData, agentBusinessName: e.target.value })}
                      placeholder="e.g. Sharma Mobile & CSC Center"
                      className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-xl text-xs text-white focus:border-amber-400 outline-none"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-300 mb-1">City / Area</label>
                    <input
                      type="text"
                      required={regData.isAgent}
                      value={regData.agentCity}
                      onChange={(e) => setRegData({ ...regData, agentCity: e.target.value })}
                      placeholder="e.g. Lucknow, UP"
                      className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-xl text-xs text-white focus:border-amber-400 outline-none"
                    />
                  </div>

                  <div className="p-2 bg-amber-950/50 border border-amber-500/30 rounded-xl text-[11px] text-amber-200 flex items-start gap-1.5">
                    <span>ℹ️</span>
                    <span>Admin team details verify karke aapka Agent Partner ID activate karegi.</span>
                  </div>
                </div>
              )}

              <button
                type="submit"
                disabled={loading}
                className="w-full py-3.5 bg-gradient-to-r from-blue-600 via-indigo-600 to-cyan-500 hover:opacity-95 text-white rounded-2xl font-bold text-sm shadow-lg shadow-blue-500/25 active:scale-[0.98] transition disabled:opacity-50"
              >
                {loading
                  ? "Creating Account..."
                  : regData.isAgent
                  ? "Submit Agent Application →"
                  : "Create Account & Educa Mail →"}
              </button>

              <div className="relative my-3">
                <div className="absolute inset-0 flex items-center">
                  <div className="w-full border-t border-slate-800" />
                </div>
                <div className="relative flex justify-center text-[10px] uppercase tracking-wider">
                  <span className="bg-slate-900 px-3 text-slate-500 font-semibold">Or instant sign up with</span>
                </div>
              </div>

              <button
                type="button"
                onClick={() => setShowMailModal(true)}
                className="w-full py-2.5 px-4 bg-slate-800/60 hover:bg-slate-800 border border-slate-700 text-slate-200 rounded-xl font-bold text-xs flex items-center justify-center gap-2 transition active:scale-[0.98]"
              >
                <div className="w-5 h-5 rounded-lg bg-gradient-to-tr from-blue-500 to-emerald-400 text-white flex items-center justify-center text-[10px] font-black">
                  E
                </div>
                <span>Fast Sign Up with Educa Mail</span>
              </button>
            </form>
          )}

          {/* 4. FORGOT PASSWORD */}
          {tab === "forgot" && (
            <form onSubmit={handleForgotPassword} className="space-y-4">
              <div className="text-center mb-3">
                <div className="w-12 h-12 rounded-2xl bg-blue-950/60 border border-blue-500/30 text-blue-300 flex items-center justify-center text-xl mx-auto mb-2">
                  🔐
                </div>
                <h3 className="font-extrabold text-white text-base">Reset Password</h3>
                <p className="text-xs text-slate-400 mt-1">
                  Registered email daalein, reset link aapke inbox/Educa Mail par send ho jayegi.
                </p>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                  Registered Email Address
                </label>
                <input
                  type="email"
                  required
                  value={forgotEmail}
                  onChange={(e) => setForgotEmail(e.target.value)}
                  placeholder="your@email.com"
                  className="w-full px-4 py-3 bg-slate-950/60 border border-slate-700/80 rounded-2xl text-white placeholder-slate-500 text-sm focus:border-cyan-400 outline-none"
                />
              </div>

              <button
                type="submit"
                disabled={loading}
                className="w-full py-3.5 bg-gradient-to-r from-blue-600 to-cyan-500 hover:opacity-95 text-white rounded-2xl font-bold text-sm shadow-lg shadow-blue-500/25 active:scale-[0.98] transition disabled:opacity-50"
              >
                {loading ? "Sending..." : "Send Reset Link →"}
              </button>

              <div className="text-center pt-1">
                <button
                  type="button"
                  onClick={() => { setTab("login"); setMsg({ text: "", type: "" }); }}
                  className="text-xs text-cyan-400 hover:text-cyan-300 font-medium"
                >
                  ← Back to Sign In
                </button>
              </div>
            </form>
          )}

          {/* MESSAGES */}
          {msg.text && (
            <div
              className={`mt-4 p-3.5 rounded-2xl text-xs text-center font-medium ${
                msg.type === "success"
                  ? "bg-emerald-950/70 text-emerald-300 border border-emerald-500/40"
                  : "bg-rose-950/70 text-rose-300 border border-rose-500/40"
              }`}
            >
              {msg.text}
            </div>
          )}
        </div>
      </div>

      {/* FOOTER TRUST BADGES */}
      <div className="w-full max-w-md pt-2 pb-2 text-center relative z-10">
        <div className="flex items-center justify-center gap-3 text-[11px] text-slate-500 mb-1">
          <span className="flex items-center gap-1">🔒 256-bit Encrypted</span>
          <span>·</span>
          <span>🏛️ RBI Registered NBFC</span>
          <span>·</span>
          <span>⚡ Instant UPI</span>
        </div>
        <p className="text-[10px] text-slate-600">
          © 2026 Educa Fintech Private Limited · All Rights Reserved
        </p>
      </div>

      {/* EDUCA MAIL SINGLE SIGN-ON POPUP MODAL (APPLE / GOOGLE STYLE) */}
      {showMailModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-fadeIn">
          <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 sm:p-7 w-full max-w-sm shadow-2xl relative text-white">
            <button
              onClick={() => setShowMailModal(false)}
              className="absolute top-4 right-4 text-slate-400 hover:text-white text-sm w-8 h-8 rounded-full flex items-center justify-center bg-slate-800 hover:bg-slate-700 transition"
            >
              ✕
            </button>

            <div className="text-center mb-5">
              <div className="w-12 h-12 bg-gradient-to-tr from-blue-500 to-emerald-400 text-white font-black text-xl rounded-2xl flex items-center justify-center mx-auto shadow-lg shadow-blue-500/25 mb-2">
                E
              </div>
              <h3 className="font-extrabold text-base text-white">Sign in with Educa Mail</h3>
              <p className="text-xs text-slate-400 mt-0.5">
                Instant Single Sign-On across all Educa services
              </p>
            </div>

            <form
              onSubmit={async (e) => {
                await handleMailLogin(e);
                setShowMailModal(false);
              }}
              className="space-y-3.5"
            >
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">Educa Mail ID</label>
                <input
                  type="email"
                  required
                  value={mailLoginData.email}
                  onChange={(e) => setMailLoginData({ ...mailLoginData, email: e.target.value })}
                  placeholder="name@educa.com"
                  className="w-full px-3.5 py-2.5 bg-slate-950 border border-slate-700 rounded-xl text-xs text-white focus:border-cyan-400 outline-none"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">Password</label>
                <input
                  type="password"
                  required
                  value={mailLoginData.password}
                  onChange={(e) => setMailLoginData({ ...mailLoginData, password: e.target.value })}
                  placeholder="••••••••"
                  className="w-full px-3.5 py-2.5 bg-slate-950 border border-slate-700 rounded-xl text-xs text-white focus:border-cyan-400 outline-none"
                />
              </div>

              <button
                type="submit"
                disabled={loading}
                className="w-full py-3 bg-gradient-to-r from-blue-600 via-indigo-600 to-cyan-500 hover:opacity-95 text-white rounded-xl font-bold text-xs shadow-md shadow-blue-500/25 transition active:scale-[0.98]"
              >
                {loading ? "Connecting..." : "Continue with Educa Mail →"}
              </button>

              <div className="p-2.5 bg-blue-950/40 border border-blue-500/20 rounded-xl text-[11px] text-blue-200 flex items-start gap-2">
                <span className="text-sm">✨</span>
                <span>
                  Educa Mail id daalne par bina alag registration ke Fintech account auto-connect ho jayega.
                </span>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
