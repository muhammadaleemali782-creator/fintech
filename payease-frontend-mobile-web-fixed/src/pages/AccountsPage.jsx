import { Link } from "react-router-dom";
import PageLayout from "../components/PageLayout";

export default function AccountsPage() {
  const accounts = [
    {
      title: "12% High-Yield Savings Account",
      badge: "Most Popular",
      rate: "12.0% Flat APY",
      desc: "World's highest interest savings account. Daily interest calculation directly credited to your account with zero lock-in period.",
      features: ["12% Annual Interest", "Daily Interest Calculation", "Zero Minimum Balance", "Instant UPI & IMPS 24x7"],
      color: "from-blue-600 to-emerald-600",
    },
    {
      title: "Student Zero-Balance Khata",
      badge: "For Students",
      rate: "10.5% APY",
      desc: "Specially designed for students and learners. Get micro recharge loans, pocket money savings, and special college fee discounts.",
      features: ["Zero Maintenance Fees", "Instant ₹199 Recharge Loan", "Free Virtual Silver Card", "Student ID Accepted"],
      color: "from-indigo-600 to-blue-500",
    },
    {
      title: "Debit & Smart Pay Wallet",
      badge: "Instant Payments",
      rate: "2% Cashback",
      desc: "All-in-one digital wallet for daily bills, mobile recharge, metro cards, and shopping with instant rewards on every transaction.",
      features: ["Fast Scan & Pay", "Automated Bill Reminders", "Virtual Card Integration", "Up to ₹1 Lakh Wallet Limit"],
      color: "from-emerald-600 to-teal-500",
    },
  ];

  return (
    <PageLayout title="Accounts — 12% Interest Savings">
      {/* HERO */}
      <section className="py-16 bg-gradient-to-b from-blue-50 to-white text-center px-4">
        <div className="max-w-4xl mx-auto space-y-4">
          <span className="inline-block px-3 py-1 bg-emerald-100 text-emerald-800 text-xs font-black rounded-full uppercase tracking-wider">
            Smart Savings Accounts
          </span>
          <h1 className="text-3xl sm:text-5xl font-black text-[#0A192F] tracking-tight">
            Apna Khata Kholein, <span className="text-[#1D6AE5]">12% Saal Ka Interest</span> Paayein
          </h1>
          <p className="text-gray-600 max-w-2xl mx-auto text-sm sm:text-base">
            Baki banks dete hain sirf 2.5% - 3%. Educa Fintech me apna digital khata kholen sirf 2 minute me bina kisi paperwork ke.
          </p>
          <div className="pt-2">
            <Link
              to="/login"
              className="inline-flex items-center gap-2 px-8 py-3.5 bg-[#1D6AE5] hover:bg-[#1558cc] text-white font-extrabold rounded-xl shadow-lg shadow-blue-500/25 transition"
            >
              <span>Open Free 12% Account</span>
              <span>→</span>
            </Link>
          </div>
        </div>
      </section>

      {/* ACCOUNT CARDS */}
      <section className="py-12 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="grid md:grid-cols-3 gap-8">
          {accounts.map((acc, i) => (
            <div key={i} className="bg-white rounded-3xl p-6 sm:p-8 border border-gray-200/80 shadow-lg hover:shadow-xl transition flex flex-col justify-between">
              <div>
                <div className="flex justify-between items-start mb-4">
                  <span className="text-xs font-extrabold px-3 py-1 bg-blue-50 text-blue-700 rounded-full border border-blue-200">
                    {acc.badge}
                  </span>
                  <div className="text-right font-black text-lg text-emerald-600">{acc.rate}</div>
                </div>
                <h3 className="text-xl font-black text-gray-900 mb-2">{acc.title}</h3>
                <p className="text-xs text-gray-600 leading-relaxed mb-6">{acc.desc}</p>
                <div className="space-y-2.5 mb-6">
                  {acc.features.map((f, j) => (
                    <div key={j} className="flex items-center gap-2 text-xs font-semibold text-gray-700">
                      <span className="text-emerald-500 font-black">✓</span>
                      <span>{f}</span>
                    </div>
                  ))}
                </div>
              </div>
              <Link
                to="/login"
                className="w-full py-3 text-center rounded-xl font-extrabold text-xs text-white bg-gradient-to-r from-[#1D6AE5] to-[#0DC98A] hover:opacity-95 shadow-md block"
              >
                Apply for this Account →
              </Link>
            </div>
          ))}
        </div>
      </section>

      {/* ELIGIBILITY & DOCUMENTS */}
      <section className="py-12 bg-white border-y border-gray-100">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid md:grid-cols-2 gap-10">
            <div className="bg-blue-50/50 p-6 sm:p-8 rounded-3xl border border-blue-100">
              <h3 className="text-xl font-extrabold text-blue-950 mb-4 flex items-center gap-2">
                <span>🎯</span> Eligibility Criteria
              </h3>
              <ul className="space-y-3 text-sm text-gray-700">
                <li className="flex items-center gap-2"><span className="text-blue-600 font-bold">•</span> Age must be 18 years or above (Student accounts from 16+).</li>
                <li className="flex items-center gap-2"><span className="text-blue-600 font-bold">•</span> Resident Indian Citizen with valid mobile number.</li>
                <li className="flex items-center gap-2"><span className="text-blue-600 font-bold">•</span> No prior CIBIL score required for account opening.</li>
                <li className="flex items-center gap-2"><span className="text-blue-600 font-bold">•</span> Active UPI or bank account for instant verification.</li>
              </ul>
            </div>

            <div className="bg-emerald-50/50 p-6 sm:p-8 rounded-3xl border border-emerald-100">
              <h3 className="text-xl font-extrabold text-emerald-950 mb-4 flex items-center gap-2">
                <span>📄</span> Documents Required
              </h3>
              <ul className="space-y-3 text-sm text-gray-700">
                <li className="flex items-center gap-2"><span className="text-emerald-600 font-bold">•</span> Aadhaar Card (For fast e-KYC verification).</li>
                <li className="flex items-center gap-2"><span className="text-emerald-600 font-bold">•</span> PAN Card or Form 60 declaration.</li>
                <li className="flex items-center gap-2"><span className="text-emerald-600 font-bold">•</span> Live selfie capture (for anti-fraud face match).</li>
                <li className="flex items-center gap-2"><span className="text-emerald-600 font-bold">•</span> Student ID (Only for special student discounts).</li>
              </ul>
            </div>
          </div>
        </div>
      </section>
    </PageLayout>
  );
}
