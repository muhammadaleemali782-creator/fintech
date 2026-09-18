import { Link } from "react-router-dom";
import PageLayout from "../components/PageLayout";

export default function RatesPage() {
  return (
    <PageLayout title="Rates & Charges — 100% Transparent Fee Structure">
      <section className="py-16 bg-gradient-to-b from-blue-50 to-white text-center px-4">
        <div className="max-w-4xl mx-auto space-y-4">
          <span className="inline-block px-3 py-1 bg-emerald-100 text-emerald-800 text-xs font-black rounded-full uppercase tracking-wider">
            Zero Hidden Charges
          </span>
          <h1 className="text-3xl sm:text-5xl font-black text-[#0A192F] tracking-tight">
            Schedule of <span className="text-[#1D6AE5]">Rates & Transparent Charges</span>
          </h1>
          <p className="text-gray-600 max-w-2xl mx-auto text-sm sm:text-base">
            Koi chhipa hua charge nahi. Har rate, fee aur processing charges 100% transparent hain.
          </p>
        </div>
      </section>

      <section className="py-12 max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 space-y-12">
        {/* 1. SAVINGS ACCOUNT CHARGES */}
        <div className="bg-white rounded-3xl p-6 sm:p-8 border border-gray-200 shadow-sm">
          <h3 className="text-xl font-black text-gray-900 mb-4 flex items-center gap-2">
            <span>🏦</span> Savings & Wallet Charges
          </h3>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs sm:text-sm">
              <thead className="bg-gray-50 border-b border-gray-200 text-gray-600 font-bold uppercase text-[11px]">
                <tr>
                  <th className="py-3 px-4">Service</th>
                  <th className="py-3 px-4">Applicable Rate / Fee</th>
                  <th className="py-3 px-4">Remarks</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 text-gray-700">
                <tr>
                  <td className="py-3 px-4 font-semibold">Annual Interest Rate</td>
                  <td className="py-3 px-4 text-emerald-600 font-bold">12.0% Flat APY</td>
                  <td className="py-3 px-4 text-gray-500">Daily compounding & credit</td>
                </tr>
                <tr>
                  <td className="py-3 px-4 font-semibold">Account Opening Fee</td>
                  <td className="py-3 px-4 text-emerald-600 font-bold">₹0 (Free)</td>
                  <td className="py-3 px-4 text-gray-500">Paperless 2-minute KYC</td>
                </tr>
                <tr>
                  <td className="py-3 px-4 font-semibold">Monthly Maintenance Fee</td>
                  <td className="py-3 px-4 text-emerald-600 font-bold">₹0 (Zero)</td>
                  <td className="py-3 px-4 text-gray-500">Lifetime zero maintenance</td>
                </tr>
                <tr>
                  <td className="py-3 px-4 font-semibold">Minimum Balance Penalty</td>
                  <td className="py-3 px-4 text-emerald-600 font-bold">₹0 (Nil)</td>
                  <td className="py-3 px-4 text-gray-500">True zero-balance account</td>
                </tr>
                <tr>
                  <td className="py-3 px-4 font-semibold">IMPS / UPI Payout Fee</td>
                  <td className="py-3 px-4 text-emerald-600 font-bold">₹0</td>
                  <td className="py-3 px-4 text-gray-500">Instant 24x7 transfers</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>

        {/* 2. LOAN INTEREST & PROCESSING */}
        <div className="bg-white rounded-3xl p-6 sm:p-8 border border-gray-200 shadow-sm">
          <h3 className="text-xl font-black text-gray-900 mb-4 flex items-center gap-2">
            <span>📊</span> Loan Rates & Processing Fees
          </h3>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs sm:text-sm">
              <thead className="bg-gray-50 border-b border-gray-200 text-gray-600 font-bold uppercase text-[11px]">
                <tr>
                  <th className="py-3 px-4">Loan Category</th>
                  <th className="py-3 px-4">Interest Rate (p.a.)</th>
                  <th className="py-3 px-4">Processing Fee</th>
                  <th className="py-3 px-4">Tenure</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 text-gray-700">
                <tr>
                  <td className="py-3 px-4 font-semibold">₹199 Micro Recharge Loan</td>
                  <td className="py-3 px-4 font-bold text-emerald-600">0% (First 15 days)</td>
                  <td className="py-3 px-4 font-bold text-emerald-600">₹0</td>
                  <td className="py-3 px-4 text-gray-500">15 to 30 Days</td>
                </tr>
                <tr>
                  <td className="py-3 px-4 font-semibold">Bike & Vehicle Loan</td>
                  <td className="py-3 px-4 font-bold">9.5% - 14.0%</td>
                  <td className="py-3 px-4">1.5% of loan amount</td>
                  <td className="py-3 px-4 text-gray-500">12 - 36 Months</td>
                </tr>
                <tr>
                  <td className="py-3 px-4 font-semibold">School & Tuition Fee Loan</td>
                  <td className="py-3 px-4 font-bold text-blue-600">8.0% - 11.5%</td>
                  <td className="py-3 px-4 font-bold text-emerald-600">₹0 (Student waiver)</td>
                  <td className="py-3 px-4 text-gray-500">6 - 24 Months</td>
                </tr>
                <tr>
                  <td className="py-3 px-4 font-semibold">Emergency Personal Loan</td>
                  <td className="py-3 px-4 font-bold">12.0% - 16.0%</td>
                  <td className="py-3 px-4">2.0%</td>
                  <td className="py-3 px-4 text-gray-500">3 - 18 Months</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>

        {/* 3. CARD FEES */}
        <div className="bg-white rounded-3xl p-6 sm:p-8 border border-gray-200 shadow-sm">
          <h3 className="text-xl font-black text-gray-900 mb-4 flex items-center gap-2">
            <span>💳</span> Virtual Card Charges
          </h3>
          <div className="grid md:grid-cols-2 gap-6">
            <div className="p-4 bg-slate-50 rounded-2xl border border-slate-200">
              <h4 className="font-bold text-gray-800 mb-1">Silver Card</h4>
              <p className="text-xs text-gray-500 mb-3">Issuance Fee: <strong>₹0</strong> · Annual Fee: <strong>₹0</strong></p>
              <span className="text-xs font-semibold text-emerald-700 bg-emerald-100 px-2 py-0.5 rounded">100% Free Lifetime</span>
            </div>
            <div className="p-4 bg-amber-50 rounded-2xl border border-amber-200">
              <h4 className="font-bold text-amber-950 mb-1">Platinum VIP Metal Card</h4>
              <p className="text-xs text-amber-800 mb-3">Issuance: <strong>Unlocked via 4 Loans</strong> · Annual Fee: <strong>₹0</strong></p>
              <span className="text-xs font-semibold text-amber-900 bg-amber-200 px-2 py-0.5 rounded">No Subscription Fee</span>
            </div>
          </div>
        </div>
      </section>
    </PageLayout>
  );
}
