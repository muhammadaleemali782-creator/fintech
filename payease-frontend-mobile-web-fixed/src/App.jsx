import { Suspense, lazy, useState, useEffect } from "react";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import ErrorBoundary from "./components/ErrorBoundary";
import { tokenStorage } from "./utils/tokenStorage";

// Self-healing lazy importer: Retries up to 3 times before failing
function lazyWithRetry(componentImport) {
  return lazy(async () => {
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        return await componentImport();
      } catch (error) {
        if (attempt === 2) {
          // If 3 attempts failed (e.g. new build deployed), force refresh once
          if (typeof window !== "undefined") {
            const reloadKey = "educa_chunk_retry_ts";
            const lastReload = Number(sessionStorage.getItem(reloadKey) || 0);
            if (Date.now() - lastReload > 15000) {
              sessionStorage.setItem(reloadKey, String(Date.now()));
              window.location.href = window.location.pathname + "?v=" + Date.now();
              return new Promise(() => {}); // never resolve undefined to prevent React lazy crash
            }
          }
          throw error;
        }
        // Wait before retry (300ms, 600ms)
        await new Promise((r) => setTimeout(r, 300 * (attempt + 1)));
      }
    }
  });
}

// Core Pages (Lazy loaded with self-healing retry)
const LandingPage = lazyWithRetry(() => import("./LandingPage"));
const Login = lazyWithRetry(() => import("./Login"));
const ResetPassword = lazyWithRetry(() => import("./ResetPassword"));
const Dashboard = lazyWithRetry(() => import("./Dashboard"));
const AdminPanel = lazyWithRetry(() => import("./AdminPanel"));
const StaffDesk = lazyWithRetry(() => import("./desk/StaffDesk"));
const AgentDesk = lazyWithRetry(() => import("./desk/AgentDesk"));

// Product & Information Pages
const AboutPage = lazyWithRetry(() => import("./pages/AboutPage"));
const AccountsPage = lazyWithRetry(() => import("./pages/AccountsPage"));
const LoansPage = lazyWithRetry(() => import("./pages/LoansPage"));
const InvestmentsPage = lazyWithRetry(() => import("./pages/InvestmentsPage"));
const CardsPage = lazyWithRetry(() => import("./pages/CardsPage"));
const SilverCardPage = lazyWithRetry(() => import("./pages/SilverCardPage"));
const PlatinumCardPage = lazyWithRetry(() => import("./pages/PlatinumCardPage"));
const OffersPage = lazyWithRetry(() => import("./pages/OffersPage"));
const RatesPage = lazyWithRetry(() => import("./pages/RatesPage"));
const FaqPage = lazyWithRetry(() => import("./pages/FaqPage"));
const ContactPage = lazyWithRetry(() => import("./pages/ContactPage"));
const KycPage = lazyWithRetry(() => import("./pages/KycPage"));
const LegalPage = lazyWithRetry(() => import("./pages/LegalPage"));


import TopProgressBar from "./components/ui/TopProgressBar";

function PrivateRoute({ children, adminOnly = false, staffOrAdmin = false, agentOnly = false }) {
  const token = tokenStorage.getToken();
  let user = {};
  try {
    user = JSON.parse(localStorage.getItem("user") || "{}") || {};
  } catch {}

  if (!token) return <Navigate to="/login" replace />;
  if (adminOnly && user?.role !== "admin") return <Navigate to="/dashboard" replace />;
  if (staffOrAdmin && !["admin", "staff"].includes(user?.role)) return <Navigate to="/dashboard" replace />;
  if (agentOnly && !["admin", "agent"].includes(user?.role) && user?.agentProfile?.status !== "approved") {
    return <Navigate to="/dashboard" replace />;
  }
  return children;
}

function LoadingScreen() {
  return (
    <div className="fixed inset-0 flex flex-col items-center justify-center bg-white z-50 select-none">
      <div className="flex flex-col items-center justify-center">
        <img
          src="/icon-192.png"
          alt="Educa Fintech Logo"
          className="w-20 h-20 object-contain mb-3 animate-pulse"
        />
        <h2 className="text-xl sm:text-2xl font-black bg-gradient-to-r from-blue-600 to-cyan-600 bg-clip-text text-transparent">
          Educa Fintech
        </h2>
        <p className="text-xs font-semibold text-slate-500 mt-1">
          NextGen Financial Hub
        </p>
      </div>

      {/* Immediate visual feedback spinner */}
      <div className="mt-6 flex items-center gap-2.5">
        <div className="w-5 h-5 border-2.5 border-slate-200 border-t-blue-600 rounded-full animate-spin" />
        <span className="text-xs font-bold text-slate-600">Loading...</span>
      </div>

      {/* Bottom Side Branding */}
      <div className="absolute bottom-7 left-0 right-0 flex flex-col items-center justify-center gap-0.5 pointer-events-none text-center">
        <span className="text-xs font-extrabold tracking-wider text-slate-900 uppercase">
          12% Per Year
        </span>
        <span className="text-[10px] font-semibold text-slate-400 tracking-wide">
          Compounding Returns on Savings
        </span>
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
  const token = tokenStorage.getToken();
  const user = JSON.parse(localStorage.getItem("user") || "{}");

  // In App Mode: Direct login / admin / desk / dashboard, zero landing page
  if (isApp) {
    if (token) {
      if (user.role === "staff") return <Navigate to="/desk" replace />;
      return <Navigate to={user.role === "admin" ? "/admin" : "/dashboard"} replace />;
    }
    return <Login isApp={true} />;
  }

  // In Website Mode: Beautiful Landing Home Page
  return <LandingPage />;
}

function OfflineNotice() {
  const [isOffline, setIsOffline] = useState(() => (typeof navigator !== "undefined" ? !navigator.onLine : false));

  useEffect(() => {
    const handleOnline = () => setIsOffline(false);
    const handleOffline = () => setIsOffline(true);
    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);
    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
    };
  }, []);

  if (!isOffline) return null;

  return (
    <div
      role="alert"
      aria-live="assertive"
      className="fixed top-0 inset-x-0 z-[1000] bg-rose-600 text-white text-xs font-bold py-2.5 px-4 text-center flex items-center justify-center gap-2 shadow-lg select-none"
    >
      <span className="w-2.5 h-2.5 rounded-full bg-white animate-pulse" />
      <span>Aap offline hain. Kripya apna internet connection check karein.</span>
      <button
        type="button"
        onClick={() => window.location.reload()}
        className="ml-2 bg-white/25 hover:bg-white/40 active:scale-95 text-white text-[11px] font-bold px-2.5 py-1 rounded-md transition cursor-pointer"
      >
        Retry 
      </button>
    </div>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <TopProgressBar />
      <OfflineNotice />
      <ErrorBoundary>
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

          {/* 13. Login / Register & Reset Password */}
          <Route path="/login" element={<Login isApp={checkIsAppClient()} />} />
          <Route path="/register" element={<Login isApp={checkIsAppClient()} initialTab="register" />} />
          <Route path="/reset-password" element={<ResetPassword />} />

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

          {/* Staff Desk */}
          <Route
            path="/desk"
            element={
              <PrivateRoute staffOrAdmin>
                <StaffDesk />
              </PrivateRoute>
            }
          />

          {/* Agent Desk Dedicated Page */}
          <Route
            path="/agent-desk"
            element={
              <PrivateRoute agentOnly>
                <AgentDesk />
              </PrivateRoute>
            }
          />
          <Route
            path="/agent"
            element={
              <PrivateRoute agentOnly>
                <AgentDesk />
              </PrivateRoute>
            }
          />
          <Route
            path="/desk/agent"
            element={
              <PrivateRoute agentOnly>
                <AgentDesk />
              </PrivateRoute>
            }
          />

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
    </ErrorBoundary>
  </BrowserRouter>
  );
}

