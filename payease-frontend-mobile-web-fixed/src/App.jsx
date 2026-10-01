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
  return null;
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
