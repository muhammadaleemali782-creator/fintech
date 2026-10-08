import React, { useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { API } from "./config";

export default function ResetPassword() {
  const [searchParams] = useSearchParams();
  const token = searchParams.get("token") || "";
  const navigate = useNavigate();

  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState({ text: "", type: "" });
  const [isSuccess, setIsSuccess] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!token) {
      return setMessage({
        text: "Invalid ya missing reset token. Kripya login page se dobara link mangwayein.",
        type: "error",
      });
    }
    if (!newPassword || newPassword.length < 8) {
      return setMessage({
        text: "Password kam se kam 8 characters ka hona chahiye.",
        type: "error",
      });
    }
    if (newPassword !== confirmPassword) {
      return setMessage({
        text: "Dono passwords match nahi kar rahe hain.",
        type: "error",
      });
    }

    setLoading(true);
    setMessage({ text: "", type: "" });

    try {
      const res = await fetch(`${API}/auth/reset-password`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, newPassword }),
      });
      const data = await res.json();

      if (res.ok) {
        setIsSuccess(true);
        setMessage({
          text: data.message || "Password successfully update ho gaya!",
          type: "success",
        });
        setTimeout(() => {
          navigate("/login");
        }, 2200);
      } else {
        setMessage({
          text: data.message || "Password reset fail ho gaya. Link expire ho sakti hai.",
          type: "error",
        });
      }
    } catch {
      setMessage({
        text: "Network error. Kripya internet check karein.",
        type: "error",
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-[100dvh] flex flex-col justify-center items-center px-4 py-8 bg-[#F8FAFC] text-slate-900 font-sans relative">
      <div className="absolute top-0 inset-x-0 h-72 bg-gradient-to-b from-blue-50 to-transparent pointer-events-none -z-10" />

      {/* Brand Header */}
      <div className="w-full max-w-md mb-6 flex items-center justify-center gap-3">
        <img
          src="/icon-192.png"
          alt="Educa Fintech Logo"
          className="w-11 h-11 rounded-2xl object-contain shadow-xs border border-slate-200 bg-white p-1"
        />
        <div>
          <span className="font-extrabold text-base tracking-tight text-slate-900 block leading-tight">
            Educa Fintech
          </span>
          <span className="text-[11px] text-blue-600 font-semibold tracking-wide">
            Secure Account Recovery
          </span>
        </div>
      </div>

      {/* Main Card */}
      <div className="w-full max-w-md bg-white border border-slate-200 rounded-3xl p-6 sm:p-8 shadow-sm">
        <div className="text-center mb-6">
          <div className="w-12 h-12 bg-blue-50 text-blue-600 rounded-2xl flex items-center justify-center text-xl mx-auto mb-3 shadow-inner">
            🔐
          </div>
          <h1 className="text-xl font-black text-slate-900">
            Naya Password Banayein
          </h1>
          <p className="text-xs text-slate-500 mt-1">
            Apna naya password enter karein. Old password ki zaroorat nahi hai.
          </p>
        </div>

        {message.text && (
          <div
            className={`p-3.5 rounded-2xl text-xs font-semibold mb-5 flex items-center gap-2 ${
              message.type === "success"
                ? "bg-emerald-50 text-emerald-800 border border-emerald-200"
                : "bg-rose-50 text-rose-800 border border-rose-200"
            }`}
          >
            <span>{message.type === "success" ? "✓" : "⚠️"}</span>
            <span className="flex-1">{message.text}</span>
          </div>
        )}

        {!token ? (
          <div className="text-center py-4">
            <p className="text-sm text-rose-600 font-medium mb-4">
              Reset token nahi mila ya link adhoori hai.
            </p>
            <Link
              to="/login"
              className="inline-block py-2.5 px-6 bg-blue-600 text-white rounded-xl font-bold text-xs shadow-md hover:bg-blue-700 transition"
            >
              ← Back to Sign In
            </Link>
          </div>
        ) : isSuccess ? (
          <div className="text-center py-4 space-y-4">
            <p className="text-sm text-emerald-700 font-bold">
              ✓ Password successfully badal gaya hai!
            </p>
            <button
              onClick={() => navigate("/login")}
              className="w-full py-3 bg-gradient-to-r from-blue-600 to-indigo-600 text-white rounded-xl font-bold text-sm shadow-md active:scale-95 transition"
            >
              Sign In Now →
            </button>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1.5">
                New Password (कम से कम 8 अक्षर)
              </label>
              <div className="relative">
                <input
                  type={showPassword ? "text" : "password"}
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  placeholder="Naya secret password"
                  required
                  minLength={8}
                  className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-sm font-semibold text-slate-900 focus:bg-white focus:border-blue-600 focus:ring-2 focus:ring-blue-100 outline-none transition"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-xs font-bold text-slate-400 hover:text-slate-600 p-1"
                >
                  {showPassword ? "Hide" : "Show"}
                </button>
              </div>
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1.5">
                Confirm New Password
              </label>
              <input
                type={showPassword ? "text" : "password"}
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="Naya password dobara enter karein"
                required
                minLength={8}
                className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-sm font-semibold text-slate-900 focus:bg-white focus:border-blue-600 focus:ring-2 focus:ring-blue-100 outline-none transition"
              />
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full py-3.5 bg-gradient-to-r from-blue-600 to-indigo-600 text-white rounded-xl font-bold text-sm shadow-md active:scale-95 transition disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
            >
              {loading ? "Updating Password..." : "Save New Password →"}
            </button>

            <div className="text-center pt-2">
              <Link
                to="/login"
                className="text-xs font-semibold text-slate-500 hover:text-blue-600 transition"
              >
                ← Cancel and Return to Sign In
              </Link>
            </div>
          </form>
        )}
      </div>

      <div className="text-center text-[11px] text-slate-400 mt-6">
        🔒 256-bit Bank Grade Encrypted Recovery System
      </div>
    </div>
  );
}
