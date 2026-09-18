import { useState } from "react";
import { Link } from "react-router-dom";
import PageLayout from "../components/PageLayout";

export default function LoansPage() {
  const [loanAmount, setLoanAmount] = useState(50000);
  const [tenure, setTenure] = useState(12);
  const interestRate = 12; // 12% per annum

  const monthlyRate = interestRate / 12 / 100;
  const emi = Math.round(
    (loanAmount * monthlyRate * Math.pow(1 + monthlyRate, tenure)) /
      (Math.pow(1 + monthlyRate, tenure) - 1)
  );
  const totalAmount = emi * tenure;
  const totalInterest = totalAmount - loanAmount;

  const loans = [
    {
      title: "₹199 Instant Recharge Loan",
      amount: "Flat ₹199",
      interest: "0% for first 15 days",
      badge: "Instant Approval",
      desc: "Phone recharge khatam? Bina paise ke turant 2 minute me UPI se recharge karein. No CIBIL check.",
      icon: "📱",
    },
    {
      title: "Bike & Two-Wheeler Loan",
      amount: "Up to ₹1,50,000",
      interest: "Starting @ 9.5% p.a.",
      badge: "Fast Disbursal",
      desc: "Apni nayi bike ya scooter kharidein aasaan monthly EMI par. Minimal documentation aur fast sanction.",
      icon: "🏍️",
    },
    {
      title: "School & College Fee Loan",
      amount: "Up to ₹1,00,000",
      interest: "Subsidized @ 8.0% p.a.",
      badge: "Student Special",
      desc: "Bachho ki school ya college fee ki chinta chhodein. Direct institute transfer aur flexible repayment.",
      icon: "🎓",
    },
    {
      title: "Emergency Personal Micro-Loan",
      amount: "₹5,000 to ₹50,000",
      interest: "12.0% p.a.",
      badge: "Zero Collateral",
      desc: "Medical ya urgent ghar ke kharcho ke liye bina kisi guarantee ke turant bank transfer.",
      icon: "⚡",
    },
  ];

  return (
    <PageLayout title="Loans — Instant ₹199 to ₹1.5L Bike Loans">
      {/* HERO */}
      <section className="py-16 bg-gradient-to-b from-blue-50 to-white text-center px-4">
        <div className="max-w-4xl mx-auto space-y-4">
          <span className="inline-block px-3 py-1 bg-blue-100 text-blue-800 text-xs font-black rounded-full uppercase tracking-wider">
            Fast Disbursals · Zero CIBIL
          </span>
          <h1 className="text-3xl sm:text-5xl font-black text-[#0A192F] tracking-tight">
            ₹199 Recharge Se Leke <span className="text-[#1D6AE5]">Bike & School Loan</span> Tak
          </h1>
          <p className="text-gray-600 max-w-2xl mx-auto text-sm sm:text-base">
            Jise koi loan nahi deta, use Educa Fintech deta hai. Transparent rates aur aasaan monthly EMIs.
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
                  Interest: <span className="text-emerald-600">{loan.interest}</span>
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

      {/* INTERACTIVE EMI CALCULATOR */}
      <section className="py-14 bg-gradient-to-br from-blue-900 to-indigo-950 text-white">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-10">
            <h2 className="text-2xl sm:text-4xl font-black mb-2">Live EMI Calculator</h2>
            <p className="text-gray-300 text-xs sm:text-sm">Apna loan amount aur samay select karein aur monthly kist janein</p>
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
                  max="150000"
                  step="1000"
                  value={loanAmount}
                  onChange={(e) => setLoanAmount(Number(e.target.value))}
                  className="w-full accent-emerald-400 cursor-pointer"
                />
              </div>

              <div>
                <div className="flex justify-between text-xs sm:text-sm font-bold mb-2">
                  <span>Tenure (Mahine):</span>
                  <span className="text-cyan-300 font-mono text-base">{tenure} Months</span>
                </div>
                <input
                  type="range"
                  min="3"
                  max="36"
                  step="1"
                  value={tenure}
                  onChange={(e) => setTenure(Number(e.target.value))}
                  className="w-full accent-cyan-400 cursor-pointer"
                />
              </div>

              <div className="text-xs text-gray-300 bg-black/20 p-3 rounded-xl border border-white/10">
                ⚡ Applicable Interest: <strong>{interestRate}% per annum</strong> (Daily reducing balance)
              </div>
            </div>

            <div className="bg-white/10 p-6 rounded-2xl border border-white/15 text-center space-y-4">
              <div className="text-xs uppercase tracking-widest text-gray-300">Monthly EMI</div>
              <div className="text-3xl sm:text-5xl font-black text-emerald-400 font-mono">
                ₹{emi.toLocaleString("en-IN")}
                <span className="text-xs font-normal text-gray-300"> / month</span>
              </div>
              <div className="grid grid-cols-2 gap-3 pt-4 border-t border-white/10 text-xs">
                <div>
                  <div className="text-gray-400">Total Interest</div>
                  <div className="font-bold text-white">₹{totalInterest.toLocaleString("en-IN")}</div>
                </div>
                <div>
                  <div className="text-gray-400">Total Payback</div>
                  <div className="font-bold text-white">₹{totalAmount.toLocaleString("en-IN")}</div>
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
