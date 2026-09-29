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
    <div className="min-h-[100dvh] flex flex-col justify-between items-center px-4 py-8 bg-[#F8FAFC] text-slate-900 relative font-sans">
      {/* SOFT TOP ACCENTS (LIGHT THEME) */}
      <div className="absolute top-0 inset-x-0 h-72 bg-gradient-to-b from-blue-50 to-transparent pointer-events-none -z-10" />

      {/* TOP BRAND BAR (NO BACK BUTTON) */}
      <div className="w-full max-w-md pt-2 flex items-center justify-between relative z-10">
        <div className="flex items-center gap-2.5">
          <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-blue-600 to-indigo-600 flex items-center justify-center text-lg font-black text-white shadow-md shadow-blue-500/20">
            E
          </div>
          <div>
            <span className="font-extrabold text-sm tracking-tight text-slate-900 block leading-tight">
              Educa Fintech
            </span>
            <span className="text-[10px] text-blue-600 font-semibold tracking-wide">
              Official Portal
            </span>
          </div>
        </div>

        <div className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-white border border-slate-200 text-[11px] text-slate-600 shadow-xs">
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
          <span>RBI NBFC Gateway</span>
        </div>
      </div>

      {/* MAIN CARD CONTAINER */}
      <div className="w-full max-w-md my-auto pt-6 pb-4 relative z-10">
        {/* HERO TITLE */}
        <div className="text-center mb-6">
          <h1 className="text-2xl sm:text-3xl font-black tracking-tight text-slate-900 font-display">
            Welcome to <span className="text-blue-600">Educa</span>
          </h1>
          <p className="text-xs sm:text-sm text-slate-500 mt-1">
            Micro-credit, 365-day bonds & instant P2P payments
          </p>
        </div>

        {/* CLEAN WHITE CARD */}
        <div className="bg-white rounded-3xl p-6 sm:p-7 border border-slate-200/90 shadow-xl shadow-slate-200/60 relative">
          {/* SEGMENTED TAB SELECTOR (CLEAN LIGHT PILL) */}
          <div className="grid grid-cols-3 gap-1 p-1 bg-slate-100 rounded-2xl mb-6">
            <button
              onClick={() => { setTab("login"); setMsg({ text: "", type: "" }); }}
              className={`py-2 rounded-xl text-xs font-bold transition ${
                tab === "login"
                  ? "bg-white text-blue-600 shadow-sm"
                  : "text-slate-600 hover:text-slate-900"
              }`}
            >
              Sign In
            </button>
            <button
              onClick={() => { setTab("mail-login"); setMsg({ text: "", type: "" }); }}
              className={`py-2 rounded-xl text-xs font-bold transition flex items-center justify-center gap-1 ${
                tab === "mail-login"
                  ? "bg-white text-blue-600 shadow-sm"
                  : "text-slate-600 hover:text-slate-900"
              }`}
            >
              <span>✉️</span> Mail SSO
            </button>
            <button
              onClick={() => { setTab("register"); setMsg({ text: "", type: "" }); }}
              className={`py-2 rounded-xl text-xs font-bold transition ${
                tab === "register"
                  ? "bg-white text-blue-600 shadow-sm"
                  : "text-slate-600 hover:text-slate-900"
              }`}
            >
              Register
            </button>
          </div>

          {/* 1. STANDARD SIGN IN */}
          {tab === "login" && (
            <form onSubmit={handleStandardLogin} className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1.5">
                  Mobile Number / Email Address
                </label>
                <div className="relative">
                  <input
                    type="text"
                    required
                    value={loginData.email}
                    onChange={(e) => setLoginData({ ...loginData, email: e.target.value })}
                    placeholder="9876543210 ya name@email.com"
                    className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-slate-900 placeholder-slate-400 text-sm focus:bg-white focus:border-blue-600 focus:ring-2 focus:ring-blue-100 outline-none transition"
                  />
                  <span className="absolute right-3.5 top-3.5 text-slate-400 text-sm">👤</span>
                </div>
              </div>

              <div>
                <div className="flex justify-between items-center mb-1.5">
                  <label className="block text-xs font-bold text-slate-700">
                    Security Password
                  </label>
                  <button
                    type="button"
                    onClick={() => { setTab("forgot"); setMsg({ text: "", type: "" }); }}
                    className="text-xs text-blue-600 hover:text-blue-700 font-semibold hover:underline"
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
                    className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-slate-900 placeholder-slate-400 text-sm focus:bg-white focus:border-blue-600 focus:ring-2 focus:ring-blue-100 outline-none transition pr-11"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3.5 top-3 text-slate-400 hover:text-slate-600 text-sm"
                  >
                    {showPassword ? "🙈" : "👁️"}
                  </button>
                </div>
              </div>

              <div className="flex items-center justify-between text-xs text-slate-600 pt-1">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={rememberMe}
                    onChange={(e) => setRememberMe(e.target.checked)}
                    className="w-4 h-4 rounded text-blue-600 focus:ring-0 border-slate-300"
                  />
                  <span>Stay logged in (30 days active session)</span>
                </label>
              </div>

              <button
                type="submit"
                disabled={loading}
                className="w-full py-3.5 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white rounded-xl font-bold text-sm shadow-md shadow-blue-500/20 active:scale-[0.98] transition disabled:opacity-50 flex items-center justify-center gap-2"
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
                  <div className="w-full border-t border-slate-200" />
                </div>
                <div className="relative flex justify-center text-[11px] uppercase tracking-wider">
                  <span className="bg-white px-3 text-slate-400 font-semibold">Or instant sign in with</span>
                </div>
              </div>

              {/* EDUCA MAIL 1-CLICK SSO BUTTON */}
              <button
                type="button"
                onClick={() => setShowMailModal(true)}
                className="w-full py-3 px-4 bg-white hover:bg-blue-50/40 border border-slate-200 hover:border-blue-300 text-slate-800 rounded-xl font-bold text-xs flex items-center justify-between shadow-xs transition active:scale-[0.98]"
              >
                <div className="flex items-center gap-2.5">
                  <div className="w-7 h-7 rounded-lg bg-gradient-to-tr from-blue-600 to-indigo-600 text-white flex items-center justify-center text-xs font-black">
                    E
                  </div>
                  <span className="text-slate-800 font-semibold">Sign in with Educa Mail</span>
                </div>
                <span className="px-2 py-0.5 bg-blue-50 text-blue-700 text-[10px] font-bold rounded-lg border border-blue-200">
                  1-Click SSO
                </span>
              </button>
            </form>
          )}

          {/* 2. EDUCA MAIL 30-DAY SSO */}
          {tab === "mail-login" && (
            <form onSubmit={handleMailLogin} className="space-y-4">
              <div className="p-3.5 bg-blue-50 border border-blue-200 rounded-xl text-xs text-blue-900 leading-relaxed">
                <div className="flex items-center gap-1.5 font-bold text-blue-900">
                  <span>⚡</span> 30-Day Instant Educa Mail Session
                </div>
                <p className="text-blue-800 text-[11px] mt-1">
                  Educa Mail se login karne par automatic 30 dino tak active session rahega, baar baar password nahi mangega.
                </p>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1.5">
                  Educa Mail Address
                </label>
                <input
                  type="email"
                  required
                  value={mailLoginData.email}
                  onChange={(e) => setMailLoginData({ ...mailLoginData, email: e.target.value })}
                  placeholder="username@educa.com"
                  className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-slate-900 placeholder-slate-400 text-sm focus:bg-white focus:border-blue-600 focus:ring-2 focus:ring-blue-100 outline-none transition"
                />
              </div>

              <div>
                <div className="flex justify-between items-center mb-1.5">
                  <label className="block text-xs font-bold text-slate-700">
                    Educa Password
                  </label>
                  <button
                    type="button"
                    onClick={() => { setTab("forgot"); setMsg({ text: "", type: "" }); }}
                    className="text-xs text-blue-600 hover:text-blue-700 font-semibold hover:underline"
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
                  className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-slate-900 placeholder-slate-400 text-sm focus:bg-white focus:border-blue-600 focus:ring-2 focus:ring-blue-100 outline-none transition"
                />
              </div>

              <button
                type="submit"
                disabled={loading}
                className="w-full py-3.5 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white rounded-xl font-bold text-sm shadow-md shadow-blue-500/20 active:scale-[0.98] transition disabled:opacity-50"
              >
                {loading ? "Authenticating SSO..." : "Login with Educa Mail (30 Days) →"}
              </button>

              <div className="text-center pt-1">
                <button
                  type="button"
                  onClick={() => { setTab("login"); setMsg({ text: "", type: "" }); }}
                  className="text-xs text-slate-500 hover:text-slate-800 font-medium"
                >
                  Use standard mobile / email instead
                </button>
              </div>
            </form>
          )}

          {/* 3. REGISTER */}
          {tab === "register" && (
            <form onSubmit={handleRegister} className="space-y-3.5">
              <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-xl text-xs text-emerald-900 flex items-start gap-2">
                <span className="text-base">✨</span>
                <div>
                  <span className="font-bold text-emerald-900">Auto Educa Mail Provisioning:</span> Registration ke saath aapka official <strong>Educa Mail</strong> account automatically activate ho jayega.
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Full Legal Name</label>
                <input
                  type="text"
                  required
                  value={regData.name}
                  onChange={(e) => setRegData({ ...regData, name: e.target.value })}
                  placeholder="e.g. Rahul Sharma"
                  className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-slate-900 placeholder-slate-400 text-sm focus:bg-white focus:border-blue-600 outline-none"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Email Address</label>
                <input
                  type="email"
                  required
                  value={regData.email}
                  onChange={(e) => setRegData({ ...regData, email: e.target.value })}
                  placeholder="rahul@email.com"
                  className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-slate-900 placeholder-slate-400 text-sm focus:bg-white focus:border-blue-600 outline-none"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Mobile Number (For Loans & OTP)</label>
                <input
                  type="tel"
                  required
                  value={regData.phone}
                  onChange={(e) => setRegData({ ...regData, phone: e.target.value })}
                  placeholder="+91 9876543210"
                  className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-slate-900 placeholder-slate-400 text-sm focus:bg-white focus:border-blue-600 outline-none"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Create Password</label>
                <input
                  type="password"
                  required
                  minLength={8}
                  value={regData.password}
                  onChange={(e) => setRegData({ ...regData, password: e.target.value })}
                  placeholder="Min 8 characters"
                  className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-slate-900 placeholder-slate-400 text-sm focus:bg-white focus:border-blue-600 outline-none"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Referral Code <span className="text-slate-400 font-normal">(Optional)</span>
                </label>
                <input
                  type="text"
                  value={regData.referralCode}
                  onChange={(e) => setRegData({ ...regData, referralCode: e.target.value.toUpperCase() })}
                  placeholder="e.g. EFEDU1234"
                  className="w-full px-4 py-2.5 bg-amber-50/60 border border-amber-200 rounded-xl text-amber-900 placeholder-slate-400 text-sm font-mono focus:border-amber-500 outline-none"
                />
              </div>

              {/* AGENT PARTNER APPLICATION OPTION */}
              <div className="pt-2 border-t border-slate-100">
                <label className="flex items-center gap-3 p-3 bg-blue-50/60 border border-blue-200 rounded-2xl cursor-pointer hover:bg-blue-100/50 transition">
                  <input
                    type="checkbox"
                    checked={regData.isAgent}
                    onChange={(e) => setRegData({ ...regData, isAgent: e.target.checked })}
                    className="w-4 h-4 rounded text-blue-600 focus:ring-0 border-slate-300"
                  />
                  <div>
                    <span className="text-xs font-extrabold text-slate-900 block">Apply as Educa Agent / Partner 🤝</span>
                    <span className="text-[11px] text-slate-500 block">Earn attractive monthly loan & deposit commissions</span>
                  </div>
                </label>
              </div>

              {regData.isAgent && (
                <div className="p-3.5 bg-slate-50 border border-amber-300 rounded-2xl space-y-3">
                  <div>
                    <label className="block text-xs font-extrabold text-slate-900 mb-2">Choose Commission Model</label>
                    <div className="space-y-2">
                      <label className={`p-3 rounded-xl border flex items-start gap-2.5 cursor-pointer text-xs transition ${regData.agentCommissionModel === "team_1" ? "border-blue-600 bg-white shadow-xs ring-1 ring-blue-500" : "border-slate-200 bg-white"}`}>
                        <input
                          type="radio"
                          name="agentModel"
                          value="team_1"
                          checked={regData.agentCommissionModel === "team_1"}
                          onChange={() => setRegData({ ...regData, agentCommissionModel: "team_1" })}
                          className="mt-0.5 text-blue-600"
                        />
                        <div>
                          <span className="font-extrabold text-slate-900 block">👥 Team Model (1% Commission + Team Building)</span>
                          <span className="text-[11px] text-slate-500 block mt-0.5">
                            Aapko 1% commission milega aur aap apne neeche team jod sakte hain (team members ko bhi 1% commission milega).
                          </span>
                        </div>
                      </label>

                      <label className={`p-3 rounded-xl border flex items-start gap-2.5 cursor-pointer text-xs transition ${regData.agentCommissionModel === "solo_2" ? "border-blue-600 bg-white shadow-xs ring-1 ring-blue-500" : "border-slate-200 bg-white"}`}>
                        <input
                          type="radio"
                          name="agentModel"
                          value="solo_2"
                          checked={regData.agentCommissionModel === "solo_2"}
                          onChange={() => setRegData({ ...regData, agentCommissionModel: "solo_2" })}
                          className="mt-0.5 text-blue-600"
                        />
                        <div>
                          <span className="font-extrabold text-slate-900 block">👤 Solo Direct Model (2% Direct Commission)</span>
                          <span className="text-[11px] text-slate-500 block mt-0.5">
                            Aapko direct 2% commission milega (isme team nahi bana sakte, solo work rahega).
                          </span>
                        </div>
                      </label>
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">Business / Shop Name</label>
                    <input
                      type="text"
                      required={regData.isAgent}
                      value={regData.agentBusinessName}
                      onChange={(e) => setRegData({ ...regData, agentBusinessName: e.target.value })}
                      placeholder="e.g. Sharma Mobile & CSC Center"
                      className="w-full px-3 py-2 bg-white border border-slate-200 rounded-xl text-xs text-slate-900 focus:border-blue-600 outline-none"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">City / Area</label>
                    <input
                      type="text"
                      required={regData.isAgent}
                      value={regData.agentCity}
                      onChange={(e) => setRegData({ ...regData, agentCity: e.target.value })}
                      placeholder="e.g. Lucknow, UP"
                      className="w-full px-3 py-2 bg-white border border-slate-200 rounded-xl text-xs text-slate-900 focus:border-blue-600 outline-none"
                    />
                  </div>

                  <div className="p-2 bg-amber-50 border border-amber-200 rounded-xl text-[11px] text-amber-900 flex items-start gap-1.5">
                    <span>ℹ️</span>
                    <span>Admin team details verify karke aapka Agent Partner ID activate karegi.</span>
                  </div>
                </div>
              )}

              <button
                type="submit"
                disabled={loading}
                className="w-full py-3.5 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white rounded-xl font-bold text-sm shadow-md shadow-blue-500/20 active:scale-[0.98] transition disabled:opacity-50"
              >
                {loading
                  ? "Creating Account..."
                  : regData.isAgent
                  ? "Submit Agent Application →"
                  : "Create Account & Educa Mail →"}
              </button>

              <div className="relative my-3">
                <div className="absolute inset-0 flex items-center">
                  <div className="w-full border-t border-slate-200" />
                </div>
                <div className="relative flex justify-center text-[10px] uppercase tracking-wider">
                  <span className="bg-white px-3 text-slate-400 font-semibold">Or fast sign up with</span>
                </div>
              </div>

              <button
                type="button"
                onClick={() => setShowMailModal(true)}
                className="w-full py-2.5 px-4 bg-slate-50 hover:bg-slate-100 border border-slate-200 text-slate-800 rounded-xl font-bold text-xs flex items-center justify-center gap-2 transition active:scale-[0.98]"
              >
                <div className="w-5 h-5 rounded-lg bg-gradient-to-tr from-blue-600 to-indigo-600 text-white flex items-center justify-center text-[10px] font-black">
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
                <div className="w-12 h-12 rounded-2xl bg-blue-50 border border-blue-200 text-blue-600 flex items-center justify-center text-xl mx-auto mb-2">
                  🔐
                </div>
                <h3 className="font-extrabold text-slate-900 text-base">Reset Password</h3>
                <p className="text-xs text-slate-500 mt-1">
                  Registered email daalein, reset link aapke inbox/Educa Mail par send ho jayegi.
                </p>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1.5">
                  Registered Email Address
                </label>
                <input
                  type="email"
                  required
                  value={forgotEmail}
                  onChange={(e) => setForgotEmail(e.target.value)}
                  placeholder="your@email.com"
                  className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-slate-900 placeholder-slate-400 text-sm focus:bg-white focus:border-blue-600 outline-none"
                />
              </div>

              <button
                type="submit"
                disabled={loading}
                className="w-full py-3.5 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white rounded-xl font-bold text-sm shadow-md shadow-blue-500/20 active:scale-[0.98] transition disabled:opacity-50"
              >
                {loading ? "Sending..." : "Send Reset Link →"}
              </button>

              <div className="text-center pt-1">
                <button
                  type="button"
                  onClick={() => { setTab("login"); setMsg({ text: "", type: "" }); }}
                  className="text-xs text-blue-600 hover:text-blue-700 font-semibold"
                >
                  ← Back to Sign In
                </button>
              </div>
            </form>
          )}

          {/* MESSAGES */}
          {msg.text && (
            <div
              className={`mt-4 p-3.5 rounded-xl text-xs text-center font-medium ${
                msg.type === "success"
                  ? "bg-emerald-50 text-emerald-800 border border-emerald-200"
                  : "bg-rose-50 text-rose-700 border border-rose-200"
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
          <span>🔒 256-bit Encrypted</span>
          <span>·</span>
          <span>🏛️ RBI Registered NBFC</span>
          <span>·</span>
          <span>⚡ Instant UPI</span>
        </div>
        <p className="text-[10px] text-slate-400">
          © 2026 Educa Fintech Private Limited · All Rights Reserved
        </p>
      </div>

      {/* EDUCA MAIL SINGLE SIGN-ON POPUP MODAL (CLEAN WHITE) */}
      {showMailModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-xs animate-fadeIn">
          <div className="bg-white border border-slate-200 rounded-3xl p-6 sm:p-7 w-full max-w-sm shadow-2xl relative text-slate-900">
            <button
              onClick={() => setShowMailModal(false)}
              className="absolute top-4 right-4 text-slate-400 hover:text-slate-600 text-sm w-8 h-8 rounded-full flex items-center justify-center bg-slate-100 hover:bg-slate-200 transition"
            >
              ✕
            </button>

            <div className="text-center mb-5">
              <div className="w-12 h-12 bg-gradient-to-tr from-blue-600 to-indigo-600 text-white font-black text-xl rounded-2xl flex items-center justify-center mx-auto shadow-md shadow-blue-500/20 mb-2">
                E
              </div>
              <h3 className="font-extrabold text-base text-slate-900">Sign in with Educa Mail</h3>
              <p className="text-xs text-slate-500 mt-0.5">
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
                <label className="block text-xs font-bold text-slate-700 mb-1">Educa Mail ID</label>
                <input
                  type="email"
                  required
                  value={mailLoginData.email}
                  onChange={(e) => setMailLoginData({ ...mailLoginData, email: e.target.value })}
                  placeholder="name@educa.com"
                  className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-900 focus:bg-white focus:border-blue-600 outline-none"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Password</label>
                <input
                  type="password"
                  required
                  value={mailLoginData.password}
                  onChange={(e) => setMailLoginData({ ...mailLoginData, password: e.target.value })}
                  placeholder="••••••••"
                  className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-900 focus:bg-white focus:border-blue-600 outline-none"
                />
              </div>

              <button
                type="submit"
                disabled={loading}
                className="w-full py-3 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white rounded-xl font-bold text-xs shadow-md shadow-blue-500/20 transition active:scale-[0.98]"
              >
                {loading ? "Connecting..." : "Continue with Educa Mail →"}
              </button>

              <div className="p-2.5 bg-blue-50 border border-blue-200 rounded-xl text-[11px] text-blue-900 flex items-start gap-2">
                <span className="text-sm">✨</span>
                <span>
                  Educa Mail id se bina alag registration ke Fintech account auto-connect ho jayega.
                </span>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
