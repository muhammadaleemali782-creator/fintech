import { Link } from "react-router-dom";
import PageLayout from "../components/PageLayout";

export default function PlatinumCardPage() {
  return (
    <PageLayout title="Platinum VIP Metal Card — Luxury & High Limit">
      <section className="py-16 bg-[#080B10] text-white text-center px-4 border-b border-gray-800">
        <div className="max-w-4xl mx-auto space-y-4">
          <span className="inline-block px-3.5 py-1 bg-amber-500/20 text-amber-400 border border-amber-500/40 text-xs font-black rounded-full uppercase tracking-wider">
            👑 Exclusive Obsidian Metal Card
          </span>
          <h1 className="text-3xl sm:text-5xl font-black tracking-tight text-white">
            Educa <span className="bg-gradient-to-r from-amber-300 via-amber-400 to-amber-600 bg-clip-text text-transparent">Platinum VIP Card</span>
          </h1>
          <p className="text-gray-400 max-w-2xl mx-auto text-sm sm:text-base">
            Elite members ke liye crafted. 4 loans successfully complete karne par ya direct Admin VIP invite dwara unlock hota hai.
          </p>
        </div>
      </section>

      <section className="py-12 max-w-5xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="grid md:grid-cols-2 gap-10 items-center">
          {/* OBSIDIAN PLATINUM CARD MOCKUP */}
          <div className="h-64 rounded-3xl bg-gradient-to-br from-black via-zinc-900 to-neutral-900 p-8 text-white flex flex-col justify-between shadow-2xl border border-amber-500/50 relative overflow-hidden">
            <div className="absolute top-0 right-0 w-32 h-32 bg-amber-500/10 rounded-full blur-2xl pointer-events-none" />
            <div className="flex justify-between items-center">
              <span className="text-sm font-black tracking-widest text-amber-400">EDUCA PLATINUM VIP</span>
              <span className="text-xs font-black px-2.5 py-1 rounded bg-amber-500/20 text-amber-300 border border-amber-500/40">VIP TIER</span>
            </div>
            <div>
              <div className="text-[10px] uppercase text-amber-200/60 tracking-wider">Card Number</div>
              <div className="font-mono text-xl tracking-widest font-bold text-amber-300">8840 •••• •••• 9999</div>
            </div>
            <div className="flex justify-between items-end text-xs text-gray-300">
              <div>
                <span className="text-[9px] block uppercase text-gray-500">Card Holder</span>
                <span className="font-bold text-white uppercase tracking-wider">VIP Elite Member</span>
              </div>
              <div>
                <span className="text-[9px] block uppercase text-gray-500">Class</span>
                <span className="font-bold text-amber-400">OBSIDIAN METAL</span>
              </div>
            </div>
          </div>

          {/* SPECIFICATIONS */}
          <div className="space-y-6">
            <h3 className="text-2xl font-black text-gray-900">VIP Privileges & Perks</h3>
            <div className="space-y-3 text-xs sm:text-sm text-gray-700">
              <div className="p-3 bg-white rounded-xl border border-gray-200 flex justify-between">
                <span className="text-gray-500">Monthly Spending Limit</span>
                <strong className="text-amber-600 font-mono text-base">₹1,50,000 / month</strong>
              </div>
              <div className="p-3 bg-white rounded-xl border border-gray-200 flex justify-between">
                <span className="text-gray-500">Reward Cashback</span>
                <strong className="text-emerald-600">2.5% Flat Unlimited Cashback</strong>
              </div>
              <div className="p-3 bg-white rounded-xl border border-gray-200 flex justify-between">
                <span className="text-gray-500">Lounge Access</span>
                <strong>Free 2 Domestic Airport Lounges/Quarter</strong>
              </div>
              <div className="p-3 bg-white rounded-xl border border-gray-200 flex justify-between">
                <span className="text-gray-500">How to Unlock?</span>
                <strong className="text-blue-700">Complete 4 Loans OR Admin Invite</strong>
              </div>
            </div>

            <div className="p-4 bg-amber-50 rounded-2xl border border-amber-200 text-xs text-amber-900">
              💡 <strong>Instant Unlock Tip:</strong> Time par apne ₹199 micro-loans ya school loans repay karke aapka VIP meter 4/4 loans complete hote hi Platinum VIP card unlock ho jata hai!
            </div>

            <Link
              to="/login"
              className="w-full py-3.5 bg-gradient-to-r from-amber-500 to-amber-600 hover:opacity-95 text-gray-950 font-black text-sm rounded-xl text-center block transition shadow-xl"
            >
              Login to Check Platinum Eligibility →
            </Link>
          </div>
        </div>
      </section>
    </PageLayout>
  );
}
