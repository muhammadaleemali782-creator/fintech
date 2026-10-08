import { Link } from "react-router-dom";
import PageLayout from "../components/PageLayout";

export default function InvestmentsPage() {
  const plans = [
    {
      title: "12% Daily Liquid Savings",
      returns: "12.0% p.a.",
      min: "₹100",
      lockIn: "Zero (Anytime Withdrawal)",
      risk: "Liquid Compounding",
      features: [
        "Real-time second-by-second live interest credit",
        "Zero lock-in & instant penalty-free withdrawal",
        "Daily automated compounding to Profit Wallet",
        "Direct 24/7 UPI & bank withdrawal",
      ],
      badge: "Most Popular",
    },
    {
      title: "365-Day Fixed Bond (18% Profit)",
      returns: "18.0% Guaranteed",
      min: "₹1,00,000 / Unit",
      lockIn: "365 Days",
      risk: "100% Capital Guaranteed",
      features: [
        "Flat 18% annual profit guaranteed on maturity",
        "Multi-unit flexible investment (₹1L, ₹2L, ₹3L...)",
        "Auto-credited directly to your Profit Wallet",
        "100% backed by fintech liquidity reserves",
      ],
      badge: "18% Fixed Bond",
    },
    {
      title: "Monthly Lending Bonds (40 & 80 Mo)",
      returns: "Up to 100% Total Return",
      min: "₹1,00,000 / Unit",
      lockIn: "40 or 80 Months",
      risk: "Monthly Passive Cashflow",
      features: [
        "40 Months Option: ₹3,500/month (Total ₹1,40,000 return)",
        "80 Months Option: ₹2,500/month (Total ₹2,00,000 return - 2x money)",
        "Guaranteed monthly cashflow to your account",
        "Multi-unit scalable allocation with full transparency",
      ],
      badge: "High Cashflow",
    },
  ];

  return (
    <PageLayout title="Investments — 12% Daily Savings & 18% Fixed Bonds">
      <section className="py-16 bg-gradient-to-b from-blue-50 to-white text-center px-4">
        <div className="max-w-4xl mx-auto space-y-4">
          <span className="inline-block px-3 py-1 bg-emerald-100 text-emerald-800 text-xs font-black rounded-full uppercase tracking-wider">
            Wealth & Passive Income
          </span>
          <h1 className="text-3xl sm:text-5xl font-black text-[#0A192F] tracking-tight">
            Grow Your Wealth with <span className="text-emerald-600">12% to 18% Returns</span>
          </h1>
          <p className="text-gray-600 max-w-2xl mx-auto text-sm sm:text-base">
            While traditional savings accounts offer only 3-4% and fixed deposits 6.5%, Educa Fintech delivers transparent 12% daily compounding savings and up to 18% fixed bonds.
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
            ⚠️ <strong>Risk Disclosure:</strong> All investment accounts are audited and backed by verifiable capital reserves and structured lending portfolios.
          </p>
        </div>
      </section>
    </PageLayout>
  );
}
