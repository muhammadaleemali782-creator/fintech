import { useState } from "react";
import { useNavigate } from "react-router-dom";

const API = import.meta.env.VITE_API_URL || "http://localhost:5000/api";

export default function Login() {
  const navigate = useNavigate();
  const [tab, setTab] = useState("login"); // "login" | "mail-login" | "register" | "forgot"
  const [msg, setMsg] = useState({ text: "", type: "" });
  const [loading, setLoading] = useState(false);
  const [rememberMe, setRememberMe] = useState(true);

  const [loginData, setLoginData] = useState({ email: "", password: "" });
  const [mailLoginData, setMailLoginData] = useState({ email: "", password: "" });
  const [forgotEmail, setForgotEmail] = useState("");
  const [regData, setRegData] = useState({
    name: "",
    email: "",
    phone: "",
    password: "",
    referralCode: "",
  });

  const showMsg = (text, type = "error") => setMsg({ text, type });

  const handleStandardLogin = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      const res = await fetch(`${API}/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...loginData, rememberMe }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || "Invalid credentials");
      localStorage.setItem("token", data.token);
      localStorage.setItem("user", JSON.stringify(data.user));
      showMsg("Login successful! Redirecting...", "success");
      setTimeout(() => {
        window.location.href = data.user.role === "admin" ? "/admin" : "/dashboard";
      }, 700);
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
      }, 700);
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
      localStorage.setItem("user", JSON.stringify(data.user));
      showMsg("Account & Educa Mail created! Redirecting...", "success");
      setTimeout(() => {
        window.location.href = "/dashboard";
      }, 800);
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
    <div className="min-h-[100dvh] flex flex-col justify-center items-center px-4 py-8 bg-[#FAFBFF] relative font-sans">
      {/* BACKGROUND ACCENTS */}
      <div className="absolute top-0 left-0 right-0 h-80 bg-gradient-to-b from-[#EEF4FF] to-transparent pointer-events-none -z-10" />
      <div className="absolute top-10 right-10 w-96 h-96 bg-blue-400/10 rounded-full blur-3xl pointer-events-none -z-10" />
      <div className="absolute bottom-10 left-10 w-96 h-96 bg-emerald-400/10 rounded-full blur-3xl pointer-events-none -z-10" />

      {/* TOP BACK BUTTON */}
      <div className="w-full max-w-md mb-4 flex items-center justify-between">
        <button
          onClick={() => navigate("/")}
          className="inline-flex items-center gap-2 text-sm font-semibold text-gray-600 hover:text-[#1D6AE5] bg-white px-3.5 py-2 rounded-xl border border-gray-200 shadow-sm transition active:scale-95"
        >
          <span>←</span> Back to Home
        </button>
        <span className="text-xs font-semibold text-emerald-600 bg-emerald-50 border border-emerald-200/60 px-2.5 py-1 rounded-full">
          Educa Fintech
        </span>
      </div>

      <div className="w-full max-w-md">
        {/* LOGO & HEADING */}
        <div className="text-center mb-6">
          <div className="inline-flex items-center justify-center w-14 h-14 bg-gradient-to-tr from-[#1D6AE5] to-[#0DC98A] text-white font-extrabold text-2xl rounded-2xl shadow-lg shadow-blue-500/20 mb-3">
            E
          </div>
          <h1 className="text-2xl sm:text-3xl font-extrabold text-[#0C1B3A] tracking-tight">
            Educa Fintech Portal
          </h1>
          <p className="text-gray-500 mt-1 text-xs sm:text-sm">
            Micro Loans, Investment & Student Fee Financing
          </p>
        </div>

        {/* CARD CONTAINER */}
        <div className="bg-white rounded-3xl shadow-xl shadow-blue-900/5 p-6 sm:p-8 border border-[#E8EDF5]">
          {/* TABS */}
          <div className="grid grid-cols-3 gap-1.5 p-1 bg-gray-100 rounded-2xl mb-6">
            <button
              onClick={() => { setTab("login"); setMsg({ text: "", type: "" }); }}
              className={`py-2 rounded-xl text-xs sm:text-sm font-bold transition ${
                tab === "login" ? "bg-white text-[#1D6AE5] shadow-sm" : "text-gray-500 hover:text-gray-800"
              }`}
            >
              Sign In
            </button>
            <button
              onClick={() => { setTab("mail-login"); setMsg({ text: "", type: "" }); }}
              className={`py-2 rounded-xl text-xs sm:text-sm font-bold transition flex items-center justify-center gap-1 ${
                tab === "mail-login" ? "bg-white text-[#1D6AE5] shadow-sm" : "text-gray-500 hover:text-gray-800"
              }`}
            >
              <span>✉️</span> Educa Mail
            </button>
            <button
              onClick={() => { setTab("register"); setMsg({ text: "", type: "" }); }}
              className={`py-2 rounded-xl text-xs sm:text-sm font-bold transition ${
                tab === "register" ? "bg-white text-[#1D6AE5] shadow-sm" : "text-gray-500 hover:text-gray-800"
              }`}
            >
              Register
            </button>
          </div>

          {/* 1. STANDARD LOGIN */}
          {tab === "login" && (
            <form onSubmit={handleStandardLogin} className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-gray-700 mb-1">Email / Phone</label>
                <input
                  type="email"
                  required
                  value={loginData.email}
                  onChange={(e) => setLoginData({ ...loginData, email: e.target.value })}
                  placeholder="name@email.com"
                  className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-[#1D6AE5] focus:border-transparent outline-none transition text-sm"
                />
              </div>

              <div>
                <div className="flex justify-between items-center mb-1">
                  <label className="block text-xs font-bold text-gray-700">Password</label>
                  <button
                    type="button"
                    onClick={() => { setTab("forgot"); setMsg({ text: "", type: "" }); }}
                    className="text-xs text-[#1D6AE5] font-semibold hover:underline"
                  >
                    Forgot password?
                  </button>
                </div>
                <input
                  type="password"
                  required
                  value={loginData.password}
                  onChange={(e) => setLoginData({ ...loginData, password: e.target.value })}
                  placeholder="••••••••"
                  className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-[#1D6AE5] focus:border-transparent outline-none transition text-sm"
                />
              </div>

              <div className="flex items-center justify-between text-xs text-gray-600">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={rememberMe}
                    onChange={(e) => setRememberMe(e.target.checked)}
                    className="rounded text-[#1D6AE5] focus:ring-[#1D6AE5]"
                  />
                  <span>Stay signed in (30 days)</span>
                </label>
              </div>

              <button
                type="submit"
                disabled={loading}
                className="w-full py-3 bg-[#1D6AE5] hover:bg-[#1558cc] text-white rounded-xl font-bold text-sm shadow-md shadow-blue-500/20 active:scale-95 transition disabled:opacity-60"
              >
                {loading ? "Signing in..." : "Sign In to Account →"}
              </button>

              <div className="text-center pt-2">
                <button
                  type="button"
                  onClick={() => { setTab("mail-login"); setMsg({ text: "", type: "" }); }}
                  className="text-xs text-gray-500 hover:text-[#1D6AE5] flex items-center justify-center gap-1.5 mx-auto font-medium"
                >
                  <span>✉️</span> Or sign in using your <strong>Educa Mail</strong> ID
                </button>
              </div>
            </form>
          )}

          {/* 2. LOGIN WITH EDUCA MAIL (30 Days Login) */}
          {tab === "mail-login" && (
            <form onSubmit={handleMailLogin} className="space-y-4">
              <div className="p-3 bg-blue-50/70 border border-blue-100 rounded-xl text-xs text-[#1D6AE5] leading-relaxed">
                <p className="font-bold flex items-center gap-1">
                  <span>⚡</span> 30-Day Instant Educa Mail Session
                </p>
                <p className="text-gray-600 mt-0.5">
                  Educa Mail se login karne par baar baar password daalne ki zaroorat nahi padegi!
                </p>
              </div>

              <div>
                <label className="block text-xs font-bold text-gray-700 mb-1">
                  Educa Mail Address
                </label>
                <input
                  type="email"
                  required
                  value={mailLoginData.email}
                  onChange={(e) => setMailLoginData({ ...mailLoginData, email: e.target.value })}
                  placeholder="username@educa.com"
                  className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-[#1D6AE5] focus:border-transparent outline-none transition text-sm"
                />
              </div>

              <div>
                <div className="flex justify-between items-center mb-1">
                  <label className="block text-xs font-bold text-gray-700">Educa Password</label>
                  <button
                    type="button"
                    onClick={() => { setTab("forgot"); setMsg({ text: "", type: "" }); }}
                    className="text-xs text-[#1D6AE5] font-semibold hover:underline"
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
                  className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-[#1D6AE5] focus:border-transparent outline-none transition text-sm"
                />
              </div>

              <button
                type="submit"
                disabled={loading}
                className="w-full py-3 bg-gradient-to-r from-[#1D6AE5] to-[#0DC98A] hover:opacity-95 text-white rounded-xl font-bold text-sm shadow-md shadow-blue-500/20 active:scale-95 transition disabled:opacity-60"
              >
                {loading ? "Authenticating..." : "Login with Educa Mail (30 Days) →"}
              </button>

              <div className="text-center pt-2">
                <button
                  type="button"
                  onClick={() => { setTab("login"); setMsg({ text: "", type: "" }); }}
                  className="text-xs text-gray-500 hover:text-gray-800 font-medium"
                >
                  Use standard email instead
                </button>
              </div>
            </form>
          )}

          {/* 3. REGISTER */}
          {tab === "register" && (
            <form onSubmit={handleRegister} className="space-y-3.5">
              <div className="p-2.5 bg-emerald-50 border border-emerald-200/60 rounded-xl text-xs text-emerald-800 flex items-start gap-2">
                <span className="text-base">✨</span>
                <div>
                  <span className="font-bold">Automatic Educa Mail:</span> Id banate hi aapki <strong>Educa Mail</strong> id bhi automatically ready ho jayegi!
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-gray-700 mb-1">Full Name</label>
                <input
                  type="text"
                  required
                  value={regData.name}
                  onChange={(e) => setRegData({ ...regData, name: e.target.value })}
                  placeholder="Rahul Kumar"
                  className="w-full px-4 py-2.5 border border-gray-200 rounded-xl focus:ring-2 focus:ring-[#1D6AE5] outline-none text-sm"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-gray-700 mb-1">Email Address</label>
                <input
                  type="email"
                  required
                  value={regData.email}
                  onChange={(e) => setRegData({ ...regData, email: e.target.value })}
                  placeholder="rahul@email.com"
                  className="w-full px-4 py-2.5 border border-gray-200 rounded-xl focus:ring-2 focus:ring-[#1D6AE5] outline-none text-sm"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-gray-700 mb-1">Phone Number (For Loan)</label>
                <input
                  type="tel"
                  required
                  value={regData.phone}
                  onChange={(e) => setRegData({ ...regData, phone: e.target.value })}
                  placeholder="+91 9876543210"
                  className="w-full px-4 py-2.5 border border-gray-200 rounded-xl focus:ring-2 focus:ring-[#1D6AE5] outline-none text-sm"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-gray-700 mb-1">Password</label>
                <input
                  type="password"
                  required
                  minLength={8}
                  value={regData.password}
                  onChange={(e) => setRegData({ ...regData, password: e.target.value })}
                  placeholder="Min 8 characters"
                  className="w-full px-4 py-2.5 border border-gray-200 rounded-xl focus:ring-2 focus:ring-[#1D6AE5] outline-none text-sm"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-gray-700 mb-1">
                  Referral Code <span className="text-gray-400 font-normal">(Optional)</span>
                </label>
                <input
                  type="text"
                  value={regData.referralCode}
                  onChange={(e) => setRegData({ ...regData, referralCode: e.target.value.toUpperCase() })}
                  placeholder="e.g. EFEDU1234"
                  className="w-full px-4 py-2.5 border border-orange-200 bg-orange-50/50 rounded-xl focus:ring-2 focus:ring-orange-400 outline-none text-sm font-mono"
                />
              </div>

              <button
                type="submit"
                disabled={loading}
                className="w-full py-3 bg-[#1D6AE5] hover:bg-[#1558cc] text-white rounded-xl font-bold text-sm shadow-md shadow-blue-500/20 active:scale-95 transition disabled:opacity-60"
              >
                {loading ? "Creating Account..." : "Create Account & Educa Mail →"}
              </button>
            </form>
          )}

          {/* 4. FORGOT PASSWORD */}
          {tab === "forgot" && (
            <form onSubmit={handleForgotPassword} className="space-y-4">
              <div className="text-center mb-2">
                <span className="text-3xl block mb-1">🔐</span>
                <h3 className="font-bold text-gray-900 text-base">Reset Password</h3>
                <p className="text-xs text-gray-500 mt-1">
                  Apna email daalein, reset link aapke Educa Mail in-box me send kiya jayega.
                </p>
              </div>

              <div>
                <label className="block text-xs font-bold text-gray-700 mb-1">Registered Email</label>
                <input
                  type="email"
                  required
                  value={forgotEmail}
                  onChange={(e) => setForgotEmail(e.target.value)}
                  placeholder="your@email.com"
                  className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-[#1D6AE5] outline-none text-sm"
                />
              </div>

              <button
                type="submit"
                disabled={loading}
                className="w-full py-3 bg-[#1D6AE5] hover:bg-[#1558cc] text-white rounded-xl font-bold text-sm active:scale-95 transition disabled:opacity-60"
              >
                {loading ? "Sending..." : "Send Reset Link to Educa Mail"}
              </button>

              <div className="text-center pt-2">
                <button
                  type="button"
                  onClick={() => { setTab("login"); setMsg({ text: "", type: "" }); }}
                  className="text-xs text-gray-500 hover:text-[#1D6AE5] font-semibold"
                >
                  ← Back to Sign In
                </button>
              </div>
            </form>
          )}

          {/* MESSAGES */}
          {msg.text && (
            <div
              className={`mt-4 p-3 rounded-xl text-xs text-center font-medium ${
                msg.type === "success"
                  ? "bg-emerald-50 text-emerald-800 border border-emerald-200"
                  : "bg-red-50 text-red-700 border border-red-200"
              }`}
            >
              {msg.text}
            </div>
          )}
        </div>

        <p className="text-center text-gray-400 text-xs mt-6">
          🔒 256-bit Encrypted · RBI Registered NBFC Partners · Educa Fintech
        </p>
      </div>
    </div>
  );
}
