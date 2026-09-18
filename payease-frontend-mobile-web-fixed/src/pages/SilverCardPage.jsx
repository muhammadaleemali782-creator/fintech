import { Link } from "react-router-dom";
import PageLayout from "../components/PageLayout";

export default function SilverCardPage() {
  return (
    <PageLayout title="Silver Virtual Card — Free Instant Card">
      <section className="py-16 bg-gradient-to-b from-slate-100 to-white text-center px-4">
        <div className="max-w-4xl mx-auto space-y-4">
          <span className="inline-block px-3 py-1 bg-slate-200 text-slate-800 text-xs font-black rounded-full uppercase tracking-wider">
            Standard Tier · 100% Free
          </span>
          <h1 className="text-3xl sm:text-5xl font-black text-[#0A192F] tracking-tight">
            Educa <span className="text-slate-600">Silver Virtual Card</span>
          </h1>
          <p className="text-gray-600 max-w-2xl mx-auto text-sm sm:text-base">
            Account kholte hi bina kisi fees ke turant activate karein. Online shopping, Swiggy, Zomato, Amazon, aur bill payment ke liye instant card.
          </p>
        </div>
      </section>

      <section className="py-12 max-w-5xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="grid md:grid-cols-2 gap-10 items-center">
          {/* 3D SILVER CARD MOCKUP */}
          <div className="h-64 rounded-3xl bg-gradient-to-br from-slate-800 via-slate-600 to-gray-400 p-8 text-white flex flex-col justify-between shadow-2xl border border-white/20 relative">
            <div className="flex justify-between items-center">
              <span className="text-sm font-black tracking-widest text-slate-200">EDUCA SILVER</span>
              <span className="text-xs font-extrabold px-2.5 py-1 rounded bg-white/25 text-white">ACTIVE</span>
            </div>
            <div>
              <div className="text-[10px] uppercase text-gray-300 tracking-wider">Card Number</div>
              <div className="font-mono text-xl tracking-widest font-bold">4290 •••• •••• 1200</div>
            </div>
            <div className="flex justify-between items-end text-xs text-gray-300">
              <div>
                <span className="text-[9px] block uppercase text-gray-400">Card Holder</span>
                <span className="font-bold text-white uppercase">Valued Member</span>
              </div>
              <div>
                <span className="text-[9px] block uppercase text-gray-400">Valid Thru</span>
                <span className="font-bold text-white">PERPETUAL</span>
              </div>
            </div>
          </div>

          {/* SPECIFICATIONS */}
          <div className="space-y-6">
            <h3 className="text-2xl font-black text-gray-900">Card Specifications & Benefits</h3>
            <div className="space-y-3 text-xs sm:text-sm text-gray-700">
              <div className="p-3 bg-white rounded-xl border border-gray-200 flex justify-between">
                <span className="text-gray-500">Joining & Annual Fee</span>
                <strong className="text-emerald-600">₹0 (Completely Free)</strong>
              </div>
              <div className="p-3 bg-white rounded-xl border border-gray-200 flex justify-between">
                <span className="text-gray-500">Monthly Spending Limit</span>
                <strong>₹25,000 / month</strong>
              </div>
              <div className="p-3 bg-white rounded-xl border border-gray-200 flex justify-between">
                <span className="text-gray-500">Cashback on Food & Utility</span>
                <strong className="text-[#1D6AE5]">1.0% Instant Cashback</strong>
              </div>
              <div className="p-3 bg-white rounded-xl border border-gray-200 flex justify-between">
                <span className="text-gray-500">ATM / Online Status</span>
                <strong>Instant in-app Toggle</strong>
              </div>
            </div>

            <Link
              to="/login"
              className="w-full py-3.5 bg-[#1D6AE5] hover:bg-[#1558cc] text-white font-extrabold text-sm rounded-xl text-center block transition shadow-lg"
            >
              Claim Free Silver Card Now →
            </Link>
          </div>
        </div>
      </section>
    </PageLayout>
  );
}
