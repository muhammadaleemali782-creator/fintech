import { Link } from "react-router-dom";
import PageLayout from "../components/PageLayout";

export default function InvestmentsPage() {
  const plans = [
    {
      title: "12% Daily Liquid Savings",
      returns: "12.0% p.a.",
      min: "₹100",
      lockIn: "Zero (Anytime Withdrawal)",
      risk: "Low Risk",
      features: ["Daily interest credit", "Zero penalty on withdrawal", "Automated compounding", "Direct UPI payout"],
      badge: "Most Liquid",
    },
    {
      title: "14% Wealth Growth Term",
      returns: "14.0% p.a.",
      min: "₹1,000",
      lockIn: "12 Months",
      risk: "Guaranteed Return",
      features: ["Fixed quarterly payouts", "14% flat annualized yield", "Senior citizen +0.5% extra", "Reinvestment option"],
      badge: "Highest Return",
    },
    {
      title: "Student Goal Builder",
      returns: "11.5% p.a.",
      min: "₹50 / week",
      lockIn: "Flexible",
      risk: "Super Safe",
      features: ["Round-up micro savings", "Laptop & fee goal tracker", "Bonus ₹100 on completing goal", "Zero account charges"],
      badge: "Student Special",
    },
  ];

  return (
    <PageLayout title="Investments — 12% to 14% Annual Returns">
      <section className="py-16 bg-gradient-to-b from-blue-50 to-white text-center px-4">
        <div className="max-w-4xl mx-auto space-y-4">
          <span className="inline-block px-3 py-1 bg-emerald-100 text-emerald-800 text-xs font-black rounded-full uppercase tracking-wider">
            Wealth & Passive Income
          </span>
          <h1 className="text-3xl sm:text-5xl font-black text-[#0A192F] tracking-tight">
            Apne Paise Ko Badhao, <span className="text-emerald-600">12% Se 14% Return</span> Ke Sath
          </h1>
          <p className="text-gray-600 max-w-2xl mx-auto text-sm sm:text-base">
            Inflation 6% hai, aur traditional bank FD deti hai sirf 6.5%. Educa Fintech ke sath payein safe aur transparent returns.
          </p>
        </div>
      </section>

      <section className="py-12 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="grid md:grid-cols-3 gap-8">
          {plans.map((p, i) => (
            <div key={i} className="bg-white rounded-3xl p-8 border border-gray-200 shadow-md hover:shadow-xl transition flex flex-col justify-between">
              <div>
                <div className="flex justify-between items-center mb-4">
                  <span className="text-xs font-bold px-3 py-1 bg-emerald-50 text-emerald-700 rounded-full border border-emerald-200">
                    {p.badge}
                  </span>
                  <span className="text-xs font-semibold text-gray-500">{p.risk}</span>
                </div>
                <h3 className="text-xl font-black text-gray-900 mb-2">{p.title}</h3>
                <div className="text-3xl font-black text-emerald-600 mb-4">{p.returns}</div>
                <div className="space-y-2 py-3 border-y border-gray-100 text-xs mb-6 text-gray-600">
                  <div className="flex justify-between"><span>Minimum Deposit:</span> <strong>{p.min}</strong></div>
                  <div className="flex justify-between"><span>Lock-in Period:</span> <strong>{p.lockIn}</strong></div>
                </div>
                <div className="space-y-2.5 mb-6">
                  {p.features.map((f, j) => (
                    <div key={j} className="flex items-center gap-2 text-xs font-semibold text-gray-700">
                      <span className="text-emerald-500 font-bold">✓</span> {f}
                    </div>
                  ))}
                </div>
              </div>
              <Link
                to="/login"
                className="w-full py-3 bg-[#1D6AE5] hover:bg-[#1558cc] text-white font-bold text-xs rounded-xl text-center block transition shadow-md"
              >
                Invest Now →
              </Link>
            </div>
          ))}
        </div>
      </section>

      <section className="py-10 bg-gray-50 border-t border-gray-200 text-center px-4">
        <div className="max-w-3xl mx-auto space-y-2">
          <p className="text-xs text-gray-500">
            ⚠️ <strong>Risk Disclosure:</strong> All investment strategies are audited and backed by diversified lending protocols. Past performance does not guarantee future results. Please read the scheme information document carefully before investing.
          </p>
        </div>
      </section>
    </PageLayout>
  );
}
