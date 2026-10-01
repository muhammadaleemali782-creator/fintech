import { Suspense, lazy } from "react";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";

// Core Pages (Lazy loaded for blazing performance)
const LandingPage = lazy(() => import("./LandingPage"));
const Login = lazy(() => import("./Login"));
const Dashboard = lazy(() => import("./Dashboard"));
const AdminPanel = lazy(() => import("./AdminPanel"));

// Product & Information Pages
const AboutPage = lazy(() => import("./pages/AboutPage"));
const AccountsPage = lazy(() => import("./pages/AccountsPage"));
const LoansPage = lazy(() => import("./pages/LoansPage"));
const InvestmentsPage = lazy(() => import("./pages/InvestmentsPage"));
const CardsPage = lazy(() => import("./pages/CardsPage"));
const SilverCardPage = lazy(() => import("./pages/SilverCardPage"));
const PlatinumCardPage = lazy(() => import("./pages/PlatinumCardPage"));
const OffersPage = lazy(() => import("./pages/OffersPage"));
const RatesPage = lazy(() => import("./pages/RatesPage"));
const FaqPage = lazy(() => import("./pages/FaqPage"));
const ContactPage = lazy(() => import("./pages/ContactPage"));
const KycPage = lazy(() => import("./pages/KycPage"));
const LegalPage = lazy(() => import("./pages/LegalPage"));

function PrivateRoute({ children, adminOnly = false }) {
  const token = localStorage.getItem("token");
  const user = JSON.parse(localStorage.getItem("user") || "{}");

  if (!token) return <Navigate to="/login" replace />;
  if (adminOnly && user.role !== "admin") return <Navigate to="/dashboard" replace />;
  return children;
}

function LoadingScreen() {
  return (
    <div className="fixed inset-0 bg-gradient-to-b from-slate-900 via-slate-950 to-black flex flex-col items-center justify-center z-[999999] select-none text-white">
      <style>{`
        @keyframes appShatterTL {
          0%, 100% { transform: translate(0, 0) rotate(0deg); opacity: 1; }
          30%, 45% { transform: translate(-26px, -20px) rotate(-26deg); opacity: 0.85; }
          72% { transform: translate(0, 0) rotate(0deg); opacity: 1; }
        }
        @keyframes appShatterTR {
          0%, 100% { transform: translate(0, 0) rotate(0deg); opacity: 1; }
          30%, 45% { transform: translate(26px, -20px) rotate(26deg); opacity: 0.85; }
          72% { transform: translate(0, 0) rotate(0deg); opacity: 1; }
        }
        @keyframes appShatterBL {
          0%, 100% { transform: translate(0, 0) rotate(0deg); opacity: 1; }
          30%, 45% { transform: translate(-22px, 24px) rotate(-20deg); opacity: 0.85; }
          72% { transform: translate(0, 0) rotate(0deg); opacity: 1; }
        }
        @keyframes appShatterBR {
          0%, 100% { transform: translate(0, 0) rotate(0deg); opacity: 1; }
          30%, 45% { transform: translate(22px, 24px) rotate(20deg); opacity: 0.85; }
          72% { transform: translate(0, 0) rotate(0deg); opacity: 1; }
        }
        @keyframes appCorePulse {
          0%, 100% { transform: scale(1); opacity: 0.8; }
          35% { transform: scale(1.6); opacity: 1; filter: drop-shadow(0 0 12px #38bdf8); }
          72% { transform: scale(1); opacity: 0.8; }
        }
        @keyframes appLogoGlow {
          0%, 100% { filter: drop-shadow(0 8px 24px rgba(29, 106, 229, 0.35)); }
          72% { filter: drop-shadow(0 0 32px #06b6d4) brightness(1.3); }
        }
        .anim-shard-tl { animation: appShatterTL 1.4s cubic-bezier(0.4, 0, 0.2, 1) infinite; }
        .anim-shard-tr { animation: appShatterTR 1.4s cubic-bezier(0.4, 0, 0.2, 1) infinite; }
        .anim-shard-bl { animation: appShatterBL 1.4s cubic-bezier(0.4, 0, 0.2, 1) infinite; }
        .anim-shard-br { animation: appShatterBR 1.4s cubic-bezier(0.4, 0, 0.2, 1) infinite; }
        .anim-core { animation: appCorePulse 1.4s ease-in-out infinite; }
        .anim-glow { animation: appLogoGlow 1.4s ease-in-out infinite; }
      `}</style>
      <svg className="w-24 h-24 overflow-visible anim-glow" viewBox="0 0 100 100" fill="none">
        <defs>
          <linearGradient id="appGTL" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#38bdf8" />
            <stop offset="100%" stopColor="#2563eb" />
          </linearGradient>
          <linearGradient id="appGTR" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#60a5fa" />
            <stop offset="100%" stopColor="#4f46e5" />
          </linearGradient>
          <linearGradient id="appGBL" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#0284c7" />
            <stop offset="100%" stopColor="#1d4ed8" />
          </linearGradient>
          <linearGradient id="appGBR" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#4338ca" />
            <stop offset="100%" stopColor="#06b6d4" />
          </linearGradient>
        </defs>

        <path className="anim-shard-tl" style={{ transformBox: "fill-box", transformOrigin: "center" }} d="M 50 6 L 14 26 L 36 50 L 50 44 Z" fill="url(#appGTL)" stroke="#7dd3fc" strokeWidth="1.2" />
        <path className="anim-shard-tr" style={{ transformBox: "fill-box", transformOrigin: "center" }} d="M 50 6 L 86 26 L 64 50 L 50 44 Z" fill="url(#appGTR)" stroke="#93c5fd" strokeWidth="1.2" />
        <path className="anim-shard-bl" style={{ transformBox: "fill-box", transformOrigin: "center" }} d="M 14 26 L 36 50 L 50 94 L 24 68 Z" fill="url(#appGBL)" stroke="#38bdf8" strokeWidth="1.2" />
        <path className="anim-shard-br" style={{ transformBox: "fill-box", transformOrigin: "center" }} d="M 86 26 L 64 50 L 50 94 L 76 68 Z" fill="url(#appGBR)" stroke="#22d3ee" strokeWidth="1.2" />
        <circle className="anim-core" cx="50" cy="50" r="7" fill="#ffffff" stroke="#38bdf8" strokeWidth="2" style={{ transformBox: "fill-box", transformOrigin: "center" }} />
      </svg>

      <div className="mt-6 text-center">
        <h1 className="text-base font-extrabold tracking-widest uppercase bg-gradient-to-r from-white to-blue-200 bg-clip-text text-transparent">
          Educa Fintech
        </h1>
        <p className="text-xs text-slate-400 font-semibold mt-1">
          Loading Secure Finance Portal...
        </p>
      </div>
    </div>
  );
}

export function checkIsAppClient() {
  if (typeof window === "undefined") return false;
  const isStandalone = window.matchMedia("(display-mode: standalone)").matches || window.navigator.standalone === true;
  const urlParams = new URLSearchParams(window.location.search);
  if (urlParams.get("app") === "true") {
    localStorage.setItem("educa_app_mode", "true");
    return true;
  }
  if (localStorage.getItem("educa_app_mode") === "true") return true;
  const ua = (window.navigator.userAgent || "").toLowerCase();
  if (ua.includes("wv") || ua.includes("educafintech") || window.AndroidBiometric) {
    return true;
  }
  return isStandalone;
}

function RootRoute() {
  const isApp = checkIsAppClient();
  const token = localStorage.getItem("token");

  // In App Mode: Direct login / dashboard, zero landing page
  if (isApp) {
    if (token) return <Navigate to="/dashboard" replace />;
    return <Login isApp={true} />;
  }

  // In Website Mode: Beautiful Landing Home Page
  return <LandingPage />;
}

export default function App() {
  return (
    <BrowserRouter>
      <Suspense fallback={<LoadingScreen />}>
        <Routes>
          {/* 1. Smart Root: Landing page for Website, Direct Login for App */}
          <Route path="/" element={<RootRoute />} />
          <Route path="/home" element={<LandingPage />} />

          {/* 2. About Us */}
          <Route path="/about" element={<AboutPage />} />

          {/* 3. Accounts */}
          <Route path="/accounts" element={<AccountsPage />} />

          {/* 4. Loans */}
          <Route path="/loans" element={<LoansPage />} />

          {/* 5. Investments */}
          <Route path="/investments" element={<InvestmentsPage />} />

          {/* 6. Cards Hub */}
          <Route path="/cards" element={<CardsPage />} />

          {/* 7. Silver Card */}
          <Route path="/cards/silver" element={<SilverCardPage />} />

          {/* 8. Platinum VIP Card */}
          <Route path="/cards/platinum" element={<PlatinumCardPage />} />

          {/* 9. Offers & Rewards */}
          <Route path="/offers" element={<OffersPage />} />

          {/* 10. Rates & Charges / Fees */}
          <Route path="/rates-charges" element={<RatesPage />} />
          <Route path="/fees" element={<RatesPage />} />

          {/* 11. FAQs */}
          <Route path="/faq" element={<FaqPage />} />

          {/* 12. Contact Us */}
          <Route path="/contact" element={<ContactPage />} />

          {/* 13. Login / Register */}
          <Route path="/login" element={<Login isApp={checkIsAppClient()} />} />

          {/* 14. Customer Dashboard */}
          <Route
            path="/dashboard"
            element={
              <PrivateRoute>
                <Dashboard />
              </PrivateRoute>
            }
          />

          {/* 15. KYC / Verification */}
          <Route path="/kyc" element={<KycPage />} />

          {/* 16. Privacy Policy */}
          <Route path="/privacy" element={<LegalPage defaultTab="privacy" />} />

          {/* 17. Terms & Conditions */}
          <Route path="/terms" element={<LegalPage defaultTab="terms" />} />

          {/* 18. Disclaimer */}
          <Route path="/disclaimer" element={<LegalPage defaultTab="disclaimer" />} />

          {/* 19. Grievance Redressal */}
          <Route path="/grievance" element={<LegalPage defaultTab="grievance" />} />

          {/* Admin Panel */}
          <Route
            path="/admin"
            element={
              <PrivateRoute adminOnly>
                <AdminPanel />
              </PrivateRoute>
            }
          />

          {/* Unknown URL Fallback */}
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </Suspense>
    </BrowserRouter>
  );
}
