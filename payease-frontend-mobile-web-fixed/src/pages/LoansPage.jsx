import { useState } from "react";
import { Link } from "react-router-dom";
import PageLayout from "../components/PageLayout";

export default function LoansPage() {
  const [loanType, setLoanType] = useState("personal"); // 'personal' | 'micro_business'

  // Personal Loan Calculator State
  const [loanAmount, setLoanAmount] = useState(10000);
  const [installmentsCount, setInstallmentsCount] = useState(15);
  const ratePerInstallment = 1.34;

  const principalPerInstallment = loanAmount / installmentsCount;
  const interestPerInstallment = (loanAmount * ratePerInstallment) / 100;
  const installmentAmount = Math.round(principalPerInstallment + interestPerInstallment);
  const totalPayable = installmentAmount * installmentsCount;
  const totalInterest = totalPayable - loanAmount;

  const processingFee = Math.round(loanAmount * 0.05); // 5%
  const upiCharges = Math.round(loanAmount * 0.01); // 1%
  const netDisbursal = Math.max(0, loanAmount - (processingFee + upiCharges));

  // Micro Business Loan Calculator State
  const [mblAmount, setMblAmount] = useState(10000);
  const [mblDays, setMblDays] = useState(60);
  const mblRateMap = { 60: 18, 80: 24, 100: 30, 120: 36 };
  const mblRate = mblRateMap[mblDays] || 18;
  const mblInterest = Math.round((mblAmount * mblRate) / 100);
  const mblTotal = mblAmount + mblInterest;
  const mblDaily = Math.round(mblTotal / mblDays);

  const loans = [
    {
      title: "Personal Loan Account",
      amount: "₹5,000 to ₹50,000",
      interest: "1.34% per Easy Installment",
      badge: "10-Day Cycle",
      desc: "1st time ₹5k without cheque, ₹10k with cheque. Min 15 Easy Installments. 9th installment se pehle close karne par agent ko 1:1 profit reward.",
      icon: "🏦",
    },
    {
      title: "Micro Business Loan (Daily)",
      amount: "₹5,000 to ₹50,000",
      interest: "18% to 36% (Daily Kist)",
      badge: "Daily Collection",
      desc: "Dukandaaro aur vendors ke liye rozana collection: 60 din (18%), 80 din (24%), 100 din (30%), 120 din (36%). Same-day disbursal.",
      icon: "🏬",
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
      title: "Bike & Two-Wheeler Loan",
      amount: "Up to ₹1,50,000",
      interest: "Starting @ 9.5% p.a.",
      badge: "Fast Sanction",
      desc: "Apni nayi bike ya scooter kharidein aasaan Easy Installments par. Minimal documentation aur zero hidden charges.",
      icon: "🏍️",
    },
  ];

  return (
    <PageLayout title="Loans — Personal (10-Day Cycle) & Micro Business (Daily Collection)">
      {/* HERO */}
      <section className="py-16 bg-gradient-to-b from-blue-50 to-white text-center px-4">
        <div className="max-w-4xl mx-auto space-y-4">
          <span className="inline-block px-3 py-1 bg-blue-100 text-blue-800 text-xs font-black rounded-full uppercase tracking-wider">
            10-Day Easy Installments & Daily Collections
          </span>
          <h1 className="text-3xl sm:text-5xl font-black text-[#0A192F] tracking-tight">
            Transparent Loans with <span className="text-[#1D6AE5]">Flexible Collection Cycles</span>
          </h1>
          <p className="text-gray-600 max-w-2xl mx-auto text-sm sm:text-base">
            Personal Loans (10-din cycle: 1st, 11th, 21st) aur Micro Business Loans (Daily Collection 60-120 Days). Bina kisi hidden charge ke.
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
                  Terms: <span className="text-emerald-600">{loan.interest}</span>
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

      {/* INTERACTIVE CALCULATOR (TOGGLE BETWEEN PERSONAL 10-DAY & BUSINESS DAILY) */}
      <section className="py-14 bg-gradient-to-br from-blue-900 to-indigo-950 text-white">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-8">
            <h2 className="text-2xl sm:text-4xl font-black mb-2">Live Loan Calculator</h2>
            <p className="text-gray-300 text-xs sm:text-sm mb-4">
              Apni zaroorat ke mutabiq loan type select karein aur exact kist janein
            </p>
            <div className="inline-flex p-1 bg-white/10 rounded-2xl border border-white/20">
              <button
                type="button"
                onClick={() => setLoanType("personal")}
                className={`px-4 py-2 rounded-xl text-xs font-bold transition ${
                  loanType === "personal" ? "bg-white text-gray-900 shadow-md" : "text-gray-300 hover:text-white"
                }`}
              >
                🏦 Personal Loan (10-Day Cycle)
              </button>
              <button
                type="button"
                onClick={() => setLoanType("micro_business")}
                className={`px-4 py-2 rounded-xl text-xs font-bold transition ${
                  loanType === "micro_business" ? "bg-amber-500 text-gray-950 shadow-md font-black" : "text-gray-300 hover:text-white"
                }`}
              >
                🏬 Micro Business (Daily Collection)
              </button>
            </div>
          </div>

          {loanType === "personal" ? (
            /* 10-DAY CYCLE PERSONAL LOAN CALCULATOR */
            <div className="bg-white/10 backdrop-blur-xl p-6 sm:p-10 rounded-3xl border border-white/20 grid md:grid-cols-2 gap-8 items-center">
              <div className="space-y-6">
                <div>
                  <div className="flex justify-between text-xs sm:text-sm font-bold mb-2">
                    <span>Loan Amount:</span>
                    <span className="text-emerald-400 font-mono text-base">₹{loanAmount.toLocaleString("en-IN")}</span>
                  </div>
                  <input
                    type="range"
                    min="5000"
                    max="50000"
                    step="1000"
                    value={loanAmount}
                    onChange={(e) => setLoanAmount(Number(e.target.value))}
                    className="w-full accent-emerald-400 cursor-pointer"
                  />
                  <div className="flex justify-between text-[11px] text-gray-400 mt-1">
                    <span>Min ₹5,000 (1st time no cheque)</span>
                    <span>₹10,000 (Cheque)</span>
                    <span>Max ₹50,000</span>
                  </div>
                </div>

                <div>
                  <div className="flex justify-between text-xs sm:text-sm font-bold mb-2">
                    <span>Easy Installments (10-Day Cycle):</span>
                    <span className="text-cyan-300 font-mono text-base">{installmentsCount} Installments</span>
                  </div>
                  <input
                    type="range"
                    min="15"
                    max="30"
                    step="1"
                    value={installmentsCount}
                    onChange={(e) => setInstallmentsCount(Number(e.target.value))}
                    className="w-full accent-cyan-400 cursor-pointer"
                  />
                  <div className="flex justify-between text-[11px] text-gray-400 mt-1">
                    <span>Min 15 Installments</span>
                    <span>Max 30 Installments</span>
                  </div>
                </div>

                <div className="text-xs text-gray-300 bg-black/20 p-3.5 rounded-xl border border-white/10 space-y-1">
                  <div>⚡ <strong>1.34% per installment</strong> interest rate.</div>
                  <div>📅 Collection strictly on <strong>1st, 11th & 21st</strong> of every month.</div>
                  <div>🔄 <strong>Early Closure:</strong> 9th installment se pehle close karne par agent ko 1:1 profit bonus.</div>
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
                    <span>- 1% UPI/Cash Charge:</span>
                    <span className="font-bold text-white">₹{upiCharges}</span>
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
                  Apply for Personal Loan →
                </Link>
              </div>
            </div>
          ) : (
            /* DAILY COLLECTION MICRO BUSINESS CALCULATOR */
            <div className="bg-white/10 backdrop-blur-xl p-6 sm:p-10 rounded-3xl border border-white/20 grid md:grid-cols-2 gap-8 items-center">
              <div className="space-y-6">
                <div>
                  <div className="flex justify-between text-xs sm:text-sm font-bold mb-2">
                    <span>Business Working Capital:</span>
                    <span className="text-amber-400 font-mono text-base">₹{mblAmount.toLocaleString("en-IN")}</span>
                  </div>
                  <input
                    type="range"
                    min="5000"
                    max="50000"
                    step="1000"
                    value={mblAmount}
                    onChange={(e) => setMblAmount(Number(e.target.value))}
                    className="w-full accent-amber-400 cursor-pointer"
                  />
                  <div className="flex justify-between text-[11px] text-gray-400 mt-1">
                    <span>Min ₹5,000</span>
                    <span>Max ₹50,000</span>
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-bold text-gray-300 mb-2">Daily Tenure & Interest Tiers:</label>
                  <div className="grid grid-cols-4 gap-2">
                    {[
                      { days: 60, rate: "18%" },
                      { days: 80, rate: "24%" },
                      { days: 100, rate: "30%" },
                      { days: 120, rate: "36%" }
                    ].map(t => (
                      <button
                        key={t.days}
                        type="button"
                        onClick={() => setMblDays(t.days)}
                        className={`p-2.5 rounded-xl border text-center font-bold text-xs transition ${
                          mblDays === t.days
                            ? "bg-amber-500 text-gray-950 border-amber-400 shadow-md font-black"
                            : "bg-black/20 text-gray-300 border-white/20 hover:bg-black/40"
                        }`}
                      >
                        <div>{t.days} Days</div>
                        <div className="text-[10px] opacity-80">{t.rate}</div>
                      </button>
                    ))}
                  </div>
                </div>

                <div className="text-xs text-gray-300 bg-black/20 p-3.5 rounded-xl border border-white/10 space-y-1">
                  <div>🏬 <strong>Daily Collection Mode:</strong> Har roz aasan collection bina kisi monthly load ke.</div>
                  <div>⚡ <strong>Same-Day Payout:</strong> 24 ghante ke andar direct business account me transfer.</div>
                </div>
              </div>

              <div className="bg-white/10 p-6 rounded-2xl border border-white/15 text-center space-y-4">
                <div className="text-xs uppercase tracking-widest text-gray-300">Daily Kist (Har Roz)</div>
                <div className="text-3xl sm:text-5xl font-black text-amber-400 font-mono">
                  ₹{mblDaily}
                  <span className="text-xs font-normal text-gray-300"> / day</span>
                </div>

                <div className="bg-black/20 rounded-xl p-3.5 text-xs text-left space-y-1.5 border border-white/10">
                  <div className="flex justify-between text-gray-300">
                    <span>Principal Capital:</span>
                    <span className="font-bold text-white">₹{mblAmount.toLocaleString("en-IN")}</span>
                  </div>
                  <div className="flex justify-between text-gray-300">
                    <span>Total Interest ({mblRate}%):</span>
                    <span className="font-bold text-amber-300">₹{mblInterest.toLocaleString("en-IN")}</span>
                  </div>
                  <div className="pt-2 border-t border-white/20 flex justify-between items-center text-sm">
                    <span className="font-black text-cyan-300">Total Repayment:</span>
                    <span className="font-black text-white text-lg">₹{mblTotal.toLocaleString("en-IN")}</span>
                  </div>
                </div>

                <Link
                  to="/login"
                  className="w-full py-3 bg-amber-500 hover:bg-amber-600 text-gray-950 font-black rounded-xl text-xs block transition shadow-lg"
                >
                  Apply for Daily Business Loan →
                </Link>
              </div>
            </div>
          )}
        </div>
      </section>
    </PageLayout>
  );
}
