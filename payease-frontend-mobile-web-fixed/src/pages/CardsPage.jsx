import { Link } from "react-router-dom";
import PageLayout from "../components/PageLayout";

export default function CardsPage() {
  return (
    <PageLayout title="Cards — Silver & Platinum VIP Virtual Cards">
      <section className="py-16 bg-gradient-to-b from-blue-50 to-white text-center px-4">
        <div className="max-w-4xl mx-auto space-y-4">
          <span className="inline-block px-3 py-1 bg-indigo-100 text-indigo-800 text-xs font-black rounded-full uppercase tracking-wider">
            Next-Gen Virtual Cards
          </span>
          <h1 className="text-3xl sm:text-5xl font-black text-[#0A192F] tracking-tight">
            Educa <span className="text-[#1D6AE5]">Silver & Platinum</span> Cards
          </h1>
          <p className="text-gray-600 max-w-2xl mx-auto text-sm sm:text-base">
            Online shopping, bill payments, aur international transactions ke liye instant virtual cards. Zero annual fee aur 100% security controls.
          </p>
        </div>
      </section>

      <section className="py-12 max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="grid md:grid-cols-2 gap-10 items-stretch">
          {/* SILVER CARD TEASER */}
          <div className="bg-white rounded-3xl p-8 border border-gray-200 shadow-xl flex flex-col justify-between hover:shadow-2xl transition">
            <div>
              <div className="h-48 rounded-2xl bg-gradient-to-tr from-slate-700 via-gray-500 to-slate-400 p-6 text-white flex flex-col justify-between shadow-lg mb-6 relative overflow-hidden">
                <div className="flex justify-between items-center">
                  <span className="text-xs font-bold tracking-widest text-gray-200">EDUCA SILVER</span>
                  <span className="text-xs font-extrabold px-2 py-0.5 rounded bg-white/20">FREE</span>
                </div>
                <div className="font-mono text-lg tracking-widest font-bold text-gray-100">•••• •••• •••• 4290</div>
                <div className="flex justify-between text-[10px] text-gray-300">
                  <span>LIMIT: ₹25,000 / MO</span>
                  <span>INSTANT VIRTUAL</span>
                </div>
              </div>

              <h3 className="text-2xl font-black text-gray-900 mb-2">Educa Silver Card</h3>
              <p className="text-xs text-gray-600 mb-6">
                Account open karte hi turant free milta hai. Zero balance requirement aur online payments ke liye perfect.
              </p>

              <div className="space-y-2.5 text-xs text-gray-700 mb-8">
                <div className="flex items-center gap-2"><span className="text-emerald-500 font-bold">✓</span> Free with every new account</div>
                <div className="flex items-center gap-2"><span className="text-emerald-500 font-bold">✓</span> ₹25,000 monthly spending limit</div>
                <div className="flex items-center gap-2"><span className="text-emerald-500 font-bold">✓</span> 1% cashback on online food & recharges</div>
                <div className="flex items-center gap-2"><span className="text-emerald-500 font-bold">✓</span> Instant card freeze/unfreeze in app</div>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <Link
                to="/cards/silver"
                className="py-3 text-center border border-gray-300 hover:border-gray-900 text-gray-800 font-bold text-xs rounded-xl transition"
              >
                View Full Details
              </Link>
              <Link
                to="/login"
                className="py-3 text-center bg-[#1D6AE5] hover:bg-[#1558cc] text-white font-bold text-xs rounded-xl transition shadow-md"
              >
                Get Silver Card →
              </Link>
            </div>
          </div>

          {/* PLATINUM CARD TEASER */}
          <div className="bg-[#0D1117] text-white rounded-3xl p-8 border border-amber-500/30 shadow-2xl flex flex-col justify-between hover:shadow-amber-500/10 transition relative">
            <div className="absolute -top-3 right-6 bg-gradient-to-r from-amber-400 to-amber-600 text-gray-950 text-[10px] font-black px-3 py-1 rounded-full shadow-md uppercase">
              👑 VIP Tier
            </div>
            <div>
              <div className="h-48 rounded-2xl bg-gradient-to-tr from-black via-zinc-900 to-neutral-800 p-6 text-white flex flex-col justify-between shadow-xl mb-6 border border-amber-500/40 relative overflow-hidden">
                <div className="flex justify-between items-center">
                  <span className="text-xs font-bold tracking-widest text-amber-400">EDUCA PLATINUM VIP</span>
                  <span className="text-xs font-extrabold px-2 py-0.5 rounded bg-amber-500/20 text-amber-300 border border-amber-500/40">VIP</span>
                </div>
                <div className="font-mono text-lg tracking-widest font-bold text-amber-300">•••• •••• •••• 8840</div>
                <div className="flex justify-between text-[10px] text-amber-200/60">
                  <span>LIMIT: ₹1,50,000 / MO</span>
                  <span>OBSIDIAN METAL</span>
                </div>
              </div>

              <h3 className="text-2xl font-black text-white mb-2">Educa Platinum VIP Card</h3>
              <p className="text-xs text-gray-400 mb-6">
                4 loans complete karne par ya direct Admin VIP invite se unlock hota hai. Premium lifestyle perks aur highest limits.
              </p>

              <div className="space-y-2.5 text-xs text-gray-300 mb-8">
                <div className="flex items-center gap-2"><span className="text-amber-400 font-bold">✓</span> ₹1,50,000 monthly card limit</div>
                <div className="flex items-center gap-2"><span className="text-amber-400 font-bold">✓</span> 2.5% unlimited cashback on all spends</div>
                <div className="flex items-center gap-2"><span className="text-amber-400 font-bold">✓</span> Priority 24x7 Relationship Manager</div>
                <div className="flex items-center gap-2"><span className="text-amber-400 font-bold">✓</span> Free airport domestic lounge access</div>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <Link
                to="/cards/platinum"
                className="py-3 text-center border border-gray-700 hover:border-amber-400 text-gray-200 font-bold text-xs rounded-xl transition"
              >
                View VIP Specs
              </Link>
              <Link
                to="/login"
                className="py-3 text-center bg-gradient-to-r from-amber-400 to-amber-600 hover:opacity-95 text-gray-950 font-black text-xs rounded-xl transition shadow-lg"
              >
                Unlock Platinum →
              </Link>
            </div>
          </div>
        </div>
      </section>
    </PageLayout>
  );
}
