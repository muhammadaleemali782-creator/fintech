import { Link } from "react-router-dom";
import PageLayout from "../components/PageLayout";

export default function InvestmentsPage() {
  const plans = [
    {
      title: "25-Month Fixed Wealth Bond",
      returns: "+40.0% Guaranteed Profit",
      min: "₹25,000 (Flexible)",
      lockIn: "25 Months",
      risk: "Capital + 40% Guaranteed",
      features: [
        "₹1,00,000 becomes ₹1,40,000 lump sum at 25 months",
        "Flexible investment: starting at ₹25,000 (yields ₹35,000)",
        "100% capital guaranteed upon maturity",
        "Direct lump-sum credit to your account on month 25",
      ],
      badge: "40% Wealth Growth",
    },
    {
      title: "50-Month Fixed Wealth Bond",
      returns: "2.0x Double Your Money (100% Profit)",
      min: "₹25,000 (Flexible)",
      lockIn: "50 Months",
      risk: "2x Capital Guaranteed",
      features: [
        "₹1,00,000 becomes ₹2,00,000 lump sum at 50 months (Double Money)",
        "Flexible investment: starting at ₹25,000 (yields ₹50,000)",
        "Flat 2x multiplier backed by verified liquidity reserves",
        "Direct lump-sum credit to your account on month 50",
      ],
      badge: "Double Capital (2x)",
    },
    {
      title: "Monthly Lending Bonds (40 & 80 Months)",
      returns: "Regular Monthly Payouts",
      min: "₹25,000 (Flexible)",
      lockIn: "40 or 80 Months",
      risk: "Passive Monthly Cashflow",
      features: [
        "40 Months Option: ₹3,500/month per ₹1L (Total ₹1,40,000)",
        "80 Months Option: ₹2,500/month per ₹1L (Total ₹2,00,000)",
        "Monthly cashflow on any amount ≥ ₹25,000 (e.g. ₹875/mo on ₹25k)",
        "Flexible Early Exit: Refund of remaining principal anytime",
      ],
      badge: "Monthly Passive Income",
    },
  ];

  return (
    <PageLayout title="Investments — Fixed Wealth Bonds & Monthly Lending">
      <section className="py-16 bg-gradient-to-b from-blue-50 to-white text-center px-4">
        <div className="max-w-4xl mx-auto space-y-4">
          <span className="inline-block px-3 py-1 bg-emerald-100 text-emerald-800 text-xs font-black rounded-full uppercase tracking-wider">
            Wealth & Passive Income
          </span>
          <h1 className="text-3xl sm:text-5xl font-black text-[#0A192F] tracking-tight">
            Grow Your Wealth with <span className="text-emerald-600">Fixed Bonds & Monthly Lending</span>
          </h1>
          <p className="text-gray-600 max-w-2xl mx-auto text-sm sm:text-base">
            Choose between lump-sum Fixed Wealth Bonds (25 & 50 Months) or regular monthly cashflow with our Lending Bonds (40 & 80 Months). Starting from just ₹25,000.
          </p>
        </div>
      </section>

      {/* PLANS GRID */}
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
                <div className="text-2xl sm:text-3xl font-black text-emerald-600 mb-4">{p.returns}</div>
                <div className="space-y-2 py-3 border-y border-gray-100 text-xs mb-6 text-gray-600">
                  <div className="flex justify-between"><span>Minimum Deposit:</span> <strong>{p.min}</strong></div>
                  <div className="flex justify-between"><span>Tenure / Lock-in:</span> <strong>{p.lockIn}</strong></div>
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

      {/* READ ME / PREMATURE EXIT POLICY SECTION */}
      <section className="py-12 bg-slate-50 border-t border-gray-200 px-4 sm:px-6 lg:px-8">
        <div className="max-w-4xl mx-auto bg-white rounded-3xl p-6 sm:p-8 border border-slate-200 shadow-sm space-y-5">
          <div className="flex items-center gap-3">
            <span className="w-9 h-9 rounded-xl bg-indigo-50 border border-indigo-200 flex items-center justify-center text-lg">
              📖
            </span>
            <div>
              <h3 className="text-lg font-black text-gray-900">Read Me: Lending Lock-in & Early Stop Policy</h3>
              <p className="text-xs text-gray-500">पारदर्शी नियम: अगर आप समय से पहले लेंडिंग रोकते हैं तो रिफंड कैसे मिलता है?</p>
            </div>
          </div>

          <div className="space-y-3 text-xs text-gray-700 leading-relaxed">
            <p>
              Lending Program (40 व 80 महीने) में आपका पैसा लॉक-इन अवधि के लिए निर्धारित होता है जहाँ आपको हर महीने निश्चित पेआउट मिलता है। यदि किसी कारणवश आपको बीच में लेंडिंग रोकनी है, तो आप <strong>Request Early Stop</strong> डाल सकते हैं।
            </p>

            <div className="p-4 bg-indigo-50/70 border border-indigo-200 rounded-2xl font-mono text-[11px] space-y-1.5 text-indigo-950">
              <div className="font-bold text-xs text-indigo-900">Early Stop Refund Formula:</div>
              <div>Refund Amount = max(0, Principal Deposited - Total Monthly Payouts Received)</div>
            </div>

            <div className="grid sm:grid-cols-2 gap-3 pt-2">
              <div className="p-3.5 bg-emerald-50 border border-emerald-200 rounded-xl space-y-1">
                <span className="font-extrabold text-emerald-900 block">Example 1: शुरुआती महीनों में एग्जिट</span>
                <p className="text-[11px] text-emerald-800">
                  आपने ₹1,00,000 की 40 महीने की लेंडिंग की। 10 महीने में आपको कुल ₹35,000 (या ₹30,000) मिला। यदि आप 10वें महीने रोकते हैं, तो आपको बची हुई मूलधन राशि <strong>₹65,000 (या ₹70,000)</strong> तुरंत रिफंड मिल जाएगी।
                </p>
              </div>

              <div className="p-3.5 bg-amber-50 border border-amber-200 rounded-xl space-y-1">
                <span className="font-extrabold text-amber-900 block">Example 2: मूलधन से अधिक प्राप्त होने पर एग्जिट</span>
                <p className="text-[11px] text-amber-800">
                  यदि आप 38वें महीने में रोकते हैं और आपको ऑलरेडी ₹1,30,000 मिल चुका है (जो कि आपके लगाए ₹1,00,000 से अधिक है), तो आपकी लेंडिंग रुक जाएगी और अतिरिक्त रिफंड <strong>₹0</strong> होगा क्योंकि आपकी मूल पूंजी पहले ही मुनाफा सहित वापस मिल चुकी है।
                </p>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="py-10 bg-gray-50 border-t border-gray-200 text-center px-4">
        <div className="max-w-3xl mx-auto space-y-2">
          <p className="text-xs text-gray-500">
            <strong>Risk & Transparency Disclosure:</strong> All investment accounts are audited and backed by verifiable capital reserves and structured lending portfolios. Minimum investment ₹25,000 across all bond & lending tiers.
          </p>
        </div>
      </section>
    </PageLayout>
  );
}
