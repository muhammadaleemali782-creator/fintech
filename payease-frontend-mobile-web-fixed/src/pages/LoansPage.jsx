import { useState } from "react";
import { Link } from "react-router-dom";
import PageLayout from "../components/PageLayout";

export default function LoansPage() {
  const [loanAmount, setLoanAmount] = useState(10000);
  const [installmentsCount, setInstallmentsCount] = useState(12);
  const ratePerInstallment = 1.34; // 1.34% per 10-day cycle

  // 10-Day Easy Installments Calculation
  const principalPerInstallment = loanAmount / installmentsCount;
  const interestPerInstallment = (loanAmount * ratePerInstallment) / 100;
  const installmentAmount = Math.round(principalPerInstallment + interestPerInstallment);
  const totalPayable = installmentAmount * installmentsCount;
  const totalInterest = totalPayable - loanAmount;

  // Deductions
  const processingFee = Math.round(loanAmount * 0.05); // 5%
  const upiCharges = Math.round(loanAmount * 0.01); // 1%
  const advanceDeduction = installmentAmount; // 1st installment deducted upfront
  const netDisbursal = Math.max(0, loanAmount - (processingFee + upiCharges + advanceDeduction));

  const loans = [
    {
      title: "Personal Loan Account",
      amount: "Max ₹10,000 1st time (Doubles to 50k)",
      interest: "1.34% per Easy Installment",
      badge: "Instant Disbursal",
      desc: "10-din ki Easy Installment cycle (1st, 11th, 21st). Har repayment par limit double (10k -> 20k -> 40k -> 50k max).",
      icon: "🏦",
    },
    {
      title: "Bike & Two-Wheeler Loan",
      amount: "Up to ₹1,50,000",
      interest: "Starting @ 9.5% p.a.",
      badge: "Fast Sanction",
      desc: "Apni nayi bike ya scooter kharidein aasaan Easy Installments par. Minimal documentation aur fast sanction.",
      icon: "🏍️",
    },
    {
      title: "School & College Fee Loan",
      amount: "Up to ₹1,00,000",
      interest: "Subsidized @ 8.0% p.a.",
      badge: "Student Special",
      desc: "Bachho ki school ya college fee ki chinta chhodein. Direct institute transfer aur aasaan Easy Installments.",
      icon: "🎓",
    },
    {
      title: "Micro Business Working Capital",
      amount: "₹5,000 to ₹50,000",
      interest: "Daily Merchant Rate",
      badge: "Zero Collateral",
      desc: "Dukandaaro aur chhote vendors ke liye daily capital requirement bina kisi collateral guarantee ke.",
      icon: "⚡",
    },
  ];

  return (
    <PageLayout title="Loans — 10-Day Easy Installments & Instant Disbursal">
      {/* HERO */}
      <section className="py-16 bg-gradient-to-b from-blue-50 to-white text-center px-4">
        <div className="max-w-4xl mx-auto space-y-4">
          <span className="inline-block px-3 py-1 bg-blue-100 text-blue-800 text-xs font-black rounded-full uppercase tracking-wider">
            10-Day Easy Installments · Instant Disbursal
          </span>
          <h1 className="text-3xl sm:text-5xl font-black text-[#0A192F] tracking-tight">
            Personal Loans with <span className="text-[#1D6AE5]">10-Day Easy Installments</span>
          </h1>
          <p className="text-gray-600 max-w-2xl mx-auto text-sm sm:text-base">
            Har 10 din me aasaan installment (1st, 11th, 21st). Pehli baar ₹10,000 tak, time par chukane par limit double (10k → 20k → 40k → 50k max).
          </p>
        </div>
      </section>

      {/* LOAN CARDS */}
      <section className="py-12 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-6">
          {loans.map((loan, i) => (
            <div key={i} className="bg-white rounded-3xl p-6 border border-gray-200/80 shadow-md hover:shadow-xl transition flex flex-col justify-between">
              <div>
                <div className="flex justify-between items-center mb-3">
                  <span className="text-3xl">{loan.icon}</span>
                  <span className="text-[10px] font-extrabold px-2.5 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200">
                    {loan.badge}
                  </span>
                </div>
                <h3 className="text-base font-black text-gray-900 mb-1">{loan.title}</h3>
                <div className="text-xs font-extrabold text-[#1D6AE5] mb-2">{loan.amount}</div>
                <p className="text-xs text-gray-500 mb-4">{loan.desc}</p>
                <div className="text-[11px] font-bold text-gray-700 mb-4 bg-gray-50 p-2 rounded-lg">
                  Rate: <span className="text-emerald-600">{loan.interest}</span>
                </div>
              </div>
              <Link
                to="/login"
                className="w-full py-2.5 text-center rounded-xl font-bold text-xs text-white bg-[#1D6AE5] hover:bg-[#1558cc] block transition shadow-sm"
              >
                Apply Now →
              </Link>
            </div>
          ))}
        </div>
      </section>

      {/* INTERACTIVE 10-DAY EASY INSTALLMENT CALCULATOR */}
      <section className="py-14 bg-gradient-to-br from-blue-900 to-indigo-950 text-white">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-10">
            <h2 className="text-2xl sm:text-4xl font-black mb-2">Live Easy Installments Calculator</h2>
            <p className="text-gray-300 text-xs sm:text-sm">
              10-Din ka cycle select karein (1st, 11th, 21st tareekh) aur instant net disbursal janein
            </p>
          </div>

          <div className="bg-white/10 backdrop-blur-xl p-6 sm:p-10 rounded-3xl border border-white/20 grid md:grid-cols-2 gap-8 items-center">
            <div className="space-y-6">
              <div>
                <div className="flex justify-between text-xs sm:text-sm font-bold mb-2">
                  <span>Loan Amount:</span>
                  <span className="text-emerald-400 font-mono text-base">₹{loanAmount.toLocaleString("en-IN")}</span>
                </div>
                <input
                  type="range"
                  min="1000"
                  max="50000"
                  step="1000"
                  value={loanAmount}
                  onChange={(e) => setLoanAmount(Number(e.target.value))}
                  className="w-full accent-emerald-400 cursor-pointer"
                />
                <div className="flex justify-between text-[11px] text-gray-400 mt-1">
                  <span>Min ₹1,000</span>
                  <span>1st Time Max ₹10,000 (Up to ₹50,000)</span>
                </div>
              </div>

              <div>
                <div className="flex justify-between text-xs sm:text-sm font-bold mb-2">
                  <span>Easy Installments (10-Day Cycle):</span>
                  <span className="text-cyan-300 font-mono text-base">{installmentsCount} Installments</span>
                </div>
                <input
                  type="range"
                  min="12"
                  max="30"
                  step="1"
                  value={installmentsCount}
                  onChange={(e) => setInstallmentsCount(Number(e.target.value))}
                  className="w-full accent-cyan-400 cursor-pointer"
                />
                <div className="flex justify-between text-[11px] text-gray-400 mt-1">
                  <span>Min 12 Installments</span>
                  <span>Max 30 Installments</span>
                </div>
              </div>

              <div className="text-xs text-gray-300 bg-black/20 p-3.5 rounded-xl border border-white/10 space-y-1">
                <div>⚡ <strong>1.34% per installment</strong> interest rate.</div>
                <div>📅 Collection strictly on <strong>1st, 11th & 21st</strong> of every month.</div>
                <div>🔄 Limits double upon timely repayment (10k → 20k → 40k → 50k max).</div>
              </div>
            </div>

            <div className="bg-white/10 p-6 rounded-2xl border border-white/15 text-center space-y-4">
              <div className="text-xs uppercase tracking-widest text-gray-300">Per Easy Installment</div>
              <div className="text-3xl sm:text-5xl font-black text-emerald-400 font-mono">
                ₹{installmentAmount.toLocaleString("en-IN")}
                <span className="text-xs font-normal text-gray-300"> / 10 days</span>
              </div>

              <div className="bg-black/20 rounded-xl p-3.5 text-xs text-left space-y-1.5 border border-white/10">
                <div className="flex justify-between text-gray-300">
                  <span>- 5% Processing Fee:</span>
                  <span className="font-bold text-white">₹{processingFee}</span>
                </div>
                <div className="flex justify-between text-gray-300">
                  <span>- 1% UPI Charges:</span>
                  <span className="font-bold text-white">₹{upiCharges}</span>
                </div>
                <div className="flex justify-between text-gray-300">
                  <span>- 1st Advance Installment:</span>
                  <span className="font-bold text-white">₹{advanceDeduction}</span>
                </div>
                <div className="pt-2 border-t border-white/20 flex justify-between items-center text-sm">
                  <span className="font-black text-cyan-300">Net Disbursal:</span>
                  <span className="font-black text-emerald-400 text-lg">₹{netDisbursal.toLocaleString("en-IN")}</span>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3 pt-2 text-xs">
                <div>
                  <div className="text-gray-400">Total Interest</div>
                  <div className="font-bold text-white">₹{totalInterest.toLocaleString("en-IN")}</div>
                </div>
                <div>
                  <div className="text-gray-400">Total Payback</div>
                  <div className="font-bold text-white">₹{totalPayable.toLocaleString("en-IN")}</div>
                </div>
              </div>

              <Link
                to="/login"
                className="w-full py-3 bg-emerald-500 hover:bg-emerald-600 text-gray-950 font-black rounded-xl text-xs block transition shadow-lg"
              >
                Instant Disbursal ke liye Apply Karein →
              </Link>
            </div>
          </div>
        </div>
      </section>
    </PageLayout>
  );
}
