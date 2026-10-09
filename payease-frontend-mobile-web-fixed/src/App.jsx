import { Suspense, lazy, useState, useEffect } from "react";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import ErrorBoundary from "./components/ErrorBoundary";
import { tokenStorage } from "./utils/tokenStorage";

// Self-healing lazy importer: Retries and refreshes if a chunk is 404 (due to new Vercel deployment)
function lazyWithRetry(componentImport) {
  return lazy(async () => {
    try {
      return await componentImport();
    } catch (error) {
      const reloadKey = "educa_chunk_retry";
      const alreadyRetried = sessionStorage.getItem(reloadKey);
      if (!alreadyRetried) {
        sessionStorage.setItem(reloadKey, "true");
        window.location.reload();
        return;
      }
      throw error;
    }
  });
}

// Core Pages (Lazy loaded with self-healing retry)
const LandingPage = lazyWithRetry(() => import("./LandingPage"));
const Login = lazyWithRetry(() => import("./Login"));
const ResetPassword = lazyWithRetry(() => import("./ResetPassword"));
const Dashboard = lazyWithRetry(() => import("./Dashboard"));
const AdminPanel = lazyWithRetry(() => import("./AdminPanel"));

// Instant background prefetch for active users (cold-start acceleration)
if (typeof window !== "undefined") {
  const hasToken = tokenStorage.getToken();
  const user = JSON.parse(localStorage.getItem("user") || "{}");
  if (hasToken) {
    if (user.role === "admin") {
      import("./AdminPanel").catch(() => {});
    } else {
      import("./Dashboard").catch(() => {});
    }
  } else {
    import("./Login").catch(() => {});
  }
}

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


function PrivateRoute({ children, adminOnly = false }) {
  const token = tokenStorage.getToken();
  const user = JSON.parse(localStorage.getItem("user") || "{}");

  if (!token) return <Navigate to="/login" replace />;
  if (adminOnly && user.role !== "admin") return <Navigate to="/dashboard" replace />;
  return children;
}

function LoadingScreen() {
  const [showSpinner, setShowSpinner] = useState(false);

  useEffect(() => {
    const t = setTimeout(() => setShowSpinner(true), 1600);
    return () => clearTimeout(t);
  }, []);

  return (
    <div className="fixed inset-0 flex flex-col items-center justify-center bg-white z-50 select-none">
      <div className="flex flex-col items-center justify-center">
        <img
          src="/icon-192.png"
          alt="Educa Fintech Logo"
          className="w-24 h-24 object-contain mb-3"
        />
        <h2 className="text-2xl font-extrabold bg-gradient-to-r from-blue-600 to-cyan-600 bg-clip-text text-transparent">
          Educa Fintech
        </h2>
        <p className="text-xs font-semibold text-slate-500 mt-1">
          NextGen Financial Hub
        </p>
      </div>

      {/* Subtle loader: appears ONLY after 1.6s if network/chunk download is slow */}
      <div className={`mt-7 transition-opacity duration-300 ${showSpinner ? "opacity-100" : "opacity-0"}`}>
        <div className="w-7 h-7 border-2.5 border-slate-200 border-t-blue-600 rounded-full animate-spin" />
      </div>

      {/* Bottom Side Branding (Still) */}
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

  // In App Mode: Direct login / admin / dashboard, zero landing page
  if (isApp) {
    if (token) {
      return <Navigate to={user.role === "admin" ? "/admin" : "/dashboard"} replace />;
    }
    return <Login isApp={true} />;
  }

  // In Website Mode: Beautiful Landing Home Page
  return <LandingPage />;
}

export default function App() {
  return (
    <BrowserRouter>
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

