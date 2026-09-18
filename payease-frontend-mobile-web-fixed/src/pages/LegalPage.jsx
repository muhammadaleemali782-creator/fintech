import { useState, useEffect } from "react";
import { useLocation, Link } from "react-router-dom";
import PageLayout from "../components/PageLayout";

export default function LegalPage({ defaultTab = "privacy" }) {
  const location = useLocation();
  const [tab, setTab] = useState(defaultTab);

  useEffect(() => {
    if (location.pathname.includes("terms")) setTab("terms");
    else if (location.pathname.includes("disclaimer")) setTab("disclaimer");
    else if (location.pathname.includes("grievance")) setTab("grievance");
    else setTab("privacy");
  }, [location.pathname]);

  return (
    <PageLayout title="Legal & Compliance Policies">
      <section className="py-12 bg-gradient-to-b from-blue-50 to-white text-center px-4">
        <div className="max-w-4xl mx-auto space-y-3">
          <span className="inline-block px-3 py-1 bg-gray-100 text-gray-800 text-xs font-black rounded-full uppercase tracking-wider">
            Regulatory Compliance & Terms
          </span>
          <h1 className="text-3xl sm:text-4xl font-black text-[#0A192F] tracking-tight">
            Policies & <span className="text-[#1D6AE5]">Legal Disclosures</span>
          </h1>
          <p className="text-xs sm:text-sm text-gray-500">
            Last updated: September 2026 · Compliant with Digital Personal Data Protection (DPDP) Act
          </p>
        </div>
      </section>

      <section className="py-8 max-w-5xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* TABS */}
        <div className="flex flex-wrap gap-2 border-b border-gray-200 pb-4 mb-8">
          {[
            { id: "privacy", label: "Privacy Policy", path: "/privacy" },
            { id: "terms", label: "Terms & Conditions", path: "/terms" },
            { id: "disclaimer", label: "Financial Disclaimer", path: "/disclaimer" },
            { id: "grievance", label: "Grievance & Complaints", path: "/grievance" },
          ].map((t) => (
            <Link
              key={t.id}
              to={t.path}
              onClick={() => setTab(t.id)}
              className={`px-4 py-2 rounded-xl text-xs sm:text-sm font-extrabold transition ${
                tab === t.id
                  ? "bg-[#1D6AE5] text-white shadow-sm"
                  : "bg-gray-100 text-gray-600 hover:bg-gray-200"
              }`}
            >
              {t.label}
            </Link>
          ))}
        </div>

        {/* TAB CONTENTS */}
        <div className="bg-white p-6 sm:p-10 rounded-3xl border border-gray-200 shadow-sm text-gray-700 leading-relaxed text-xs sm:text-sm space-y-6">
          {tab === "privacy" && (
            <div className="space-y-4">
              <h2 className="text-xl font-black text-gray-900">Privacy & Data Protection Policy</h2>
              <p>
                Educa Fintech Private Limited ("Company", "we", "us") values your privacy and ensures the highest degree of security for customer information.
              </p>
              <h3 className="text-base font-bold text-gray-900 pt-2">1. Data We Collect</h3>
              <p>
                We collect personal identity data including name, phone number, email address, Aadhaar/PAN details for KYC verification, bank account details for loan disbursal and savings interest credit, and transaction logs.
              </p>
              <h3 className="text-base font-bold text-gray-900 pt-2">2. Usage of Data</h3>
              <p>
                Collected data is exclusively used for opening your zero-balance account, processing ₹199 micro-loans and bike loans, calculating your 12% daily interest returns, and complying with anti-money laundering (AML) guidelines.
              </p>
              <h3 className="text-base font-bold text-gray-900 pt-2">3. Security Standards</h3>
              <p>
                All data transmission is encrypted using 256-Bit Transport Layer Security (TLS/SSL). We never sell, rent, or lease your private information to third-party telemarketers.
              </p>
            </div>
          )}

          {tab === "terms" && (
            <div className="space-y-4">
              <h2 className="text-xl font-black text-gray-900">Terms of Service & Loan Agreement</h2>
              <p>
                By registering an account with Educa Fintech or applying for our micro-loan services, you agree to these Terms and Conditions.
              </p>
              <h3 className="text-base font-bold text-gray-900 pt-2">1. Eligibility</h3>
              <p>
                Users must be 18 years of age or older (16+ for Student accounts with parental consent) and hold valid Indian citizenship.
              </p>
              <h3 className="text-base font-bold text-gray-900 pt-2">2. Loan Disbursal & Repayment</h3>
              <p>
                Approved loans (including ₹199 recharge loans and two-wheeler loans) are disbursed directly to your designated bank account or UPI address. Repayments must be completed on or before the due date shown in your Customer Dashboard.
              </p>
              <h3 className="text-base font-bold text-gray-900 pt-2">3. 12% Interest Terms</h3>
              <p>
                The 12.0% annual interest rate applies to active balances in your Savings Wallet, calculated on a daily reducing balance basis and credited each night at 00:00 IST.
              </p>
            </div>
          )}

          {tab === "disclaimer" && (
            <div className="space-y-4">
              <h2 className="text-xl font-black text-gray-900">Financial & Regulatory Disclaimer</h2>
              <p>
                Educa Fintech operates as a digital technology platform facilitating access to credit, digital savings, and payment services in partnership with registered banking partners and RBI-regulated NBFCs.
              </p>
              <h3 className="text-base font-bold text-gray-900 pt-2">1. Lending Partnership</h3>
              <p>
                Credit facilities are underwritten and disbursed by our certified financial partners. All loan approvals are subject to successful verification and eligibility assessment.
              </p>
              <h3 className="text-base font-bold text-gray-900 pt-2">2. Returns Disclaimer</h3>
              <p>
                Annualized percentage yield (12% APY) information is indicative and subject to prevailing partner terms. Past performance does not guarantee future financial outcomes.
              </p>
            </div>
          )}

          {tab === "grievance" && (
            <div className="space-y-4">
              <h2 className="text-xl font-black text-gray-900">Grievance Redressal & Complaints Escalation</h2>
              <p>
                We are committed to resolving your concerns promptly. If you have any dispute or unresolved grievance regarding your account or loan, please follow our 3-tier escalation matrix:
              </p>
              
              <div className="p-4 bg-gray-50 rounded-2xl border border-gray-200 space-y-2">
                <h4 className="font-bold text-gray-900">Level 1: Customer Support</h4>
                <p className="text-xs text-gray-600">Email: <strong>support@educafintech.com</strong> · Turnaround Time: 24 Hours</p>
              </div>

              <div className="p-4 bg-blue-50 rounded-2xl border border-blue-200 space-y-2">
                <h4 className="font-bold text-blue-950">Level 2: Principal Grievance Officer</h4>
                <div className="text-xs text-gray-700 space-y-1">
                  <p><strong>Name:</strong> Grievance Redressal Officer, Educa Fintech</p>
                  <p><strong>Address:</strong> Vihar Gali No. 3, Utthan Road, Jhalwa, Prayagraj, UP — 211012</p>
                  <p><strong>Email:</strong> grievance@educafintech.com</p>
                  <p><strong>Resolution TAT:</strong> Maximum 3 working days</p>
                </div>
              </div>
            </div>
          )}
        </div>
      </section>
    </PageLayout>
  );
}
