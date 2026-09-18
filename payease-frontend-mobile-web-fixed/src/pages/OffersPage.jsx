import { Link } from "react-router-dom";
import PageLayout from "../components/PageLayout";

export default function OffersPage() {
  const offers = [
    {
      title: "Refer & Earn ₹50 Cash",
      tag: "Referral Promo",
      desc: "Apne dosto ko Educa Fintech par invite karein. Har referral par aapko milenge flat ₹50 direct wallet me.",
      code: "REFER50",
      cta: "Share Referral Code",
      color: "border-blue-200 bg-blue-50/50",
    },
    {
      title: "12% APY Welcome Boost",
      tag: "Account Opening",
      desc: "Aaj hi naya account kholein aur pehle hi din se apne savings balance par flat 12% annual interest paayein.",
      code: "SAVE12",
      cta: "Open Account",
      color: "border-emerald-200 bg-emerald-50/50",
    },
    {
      title: "0% Interest on ₹199 Loan",
      tag: "Micro Recharge",
      desc: "Pehle ₹199 recharge loan par 15 din tak zero interest. Repay on time and boost your VIP credit score.",
      code: "RECHARGE199",
      cta: "Claim ₹199",
      color: "border-amber-200 bg-amber-50/50",
    },
    {
      title: "Platinum VIP 2.5% Cashback",
      tag: "Card Spends",
      desc: "Platinum Card holders ke liye sabhi grocery, fuel, aur online shopping spends par flat 2.5% instant cashback.",
      code: "VIPCASH",
      cta: "Unlock Platinum",
      color: "border-purple-200 bg-purple-50/50",
    },
  ];

  return (
    <PageLayout title="Offers & Rewards — Cashback & Referral Bonus">
      <section className="py-16 bg-gradient-to-b from-blue-50 to-white text-center px-4">
        <div className="max-w-4xl mx-auto space-y-4">
          <span className="inline-block px-3 py-1 bg-amber-100 text-amber-900 text-xs font-black rounded-full uppercase tracking-wider">
            Active Deals & Bonuses
          </span>
          <h1 className="text-3xl sm:text-5xl font-black text-[#0A192F] tracking-tight">
            Educa <span className="text-[#1D6AE5]">Rewards & Offers</span>
          </h1>
          <p className="text-gray-600 max-w-2xl mx-auto text-sm sm:text-base">
            Har transaction par cashback, referral bonuses, aur zero-fee festival loan offers.
          </p>
        </div>
      </section>

      <section className="py-12 max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="grid md:grid-cols-2 gap-8">
          {offers.map((off, i) => (
            <div key={i} className={`p-8 rounded-3xl border ${off.color} flex flex-col justify-between shadow-sm hover:shadow-md transition`}>
              <div>
                <span className="text-[10px] font-black uppercase tracking-wider px-2.5 py-1 rounded-full bg-white border border-gray-200 text-gray-700">
                  {off.tag}
                </span>
                <h3 className="text-2xl font-black text-gray-900 mt-4 mb-2">{off.title}</h3>
                <p className="text-xs text-gray-600 mb-6 leading-relaxed">{off.desc}</p>
              </div>
              <div className="flex items-center justify-between pt-4 border-t border-gray-200/60">
                <div className="text-xs font-mono font-bold bg-white px-3 py-1.5 rounded-lg border border-dashed border-gray-300">
                  CODE: {off.code}
                </div>
                <Link
                  to="/login"
                  className="px-5 py-2 bg-[#1D6AE5] hover:bg-[#1558cc] text-white text-xs font-extrabold rounded-xl shadow-sm transition"
                >
                  {off.cta} →
                </Link>
              </div>
            </div>
          ))}
        </div>
      </section>
    </PageLayout>
  );
}
