import React, { useEffect } from "react";

export default function LoanSettingsReadmeModal({ isOpen, onClose }) {
  // Close on Escape key press
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6 overflow-y-auto select-none">
      {/* Dark Backdrop */}
      <div
        className="fixed inset-0 bg-black/80 backdrop-blur-sm transition-opacity"
        onClick={onClose}
      />

      {/* Modal Dialog Card */}
      <div className="relative w-full max-w-4xl bg-white border border-slate-200 rounded-3xl shadow-2xl text-slate-900 overflow-hidden flex flex-col max-h-[90vh] z-10 animate-in fade-in zoom-in-95 duration-150">
        {/* Header */}
        <div className="p-5 sm:p-6 border-b border-slate-200 bg-white/60 flex items-start sm:items-center justify-between gap-4 shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center text-xl shrink-0">
              📖
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-base sm:text-lg font-black text-slate-900 tracking-wide">
                  Loan Settings & Preclose Policy — READ ME
                </h2>
                <span className="px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-400 text-[10px] font-bold border border-emerald-500/30">
                  Business Logic & Fund Flow
                </span>
              </div>
              <p className="text-xs text-slate-500 mt-0.5">
                Preclose calculation, paisa kahan jayega (Customer, Agent, Department), aur 15-kist lock-in rule
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-500 hover:text-white flex items-center justify-center text-sm font-bold transition active:scale-95 cursor-pointer shrink-0"
            title="Close modal"
          >
            ✕
          </button>
        </div>

        {/* Modal Scrollable Body */}
        <div className="p-5 sm:p-6 space-y-6 overflow-y-auto text-xs leading-relaxed">
          {/* Section 1: Preclose Formula */}
          <div className="space-y-3">
            <div className="flex items-center gap-2 text-sm font-black text-slate-900 uppercase tracking-wider">
              <span>📐</span>
              <h3>1. Preclose Discount Formula (Exact Calculation)</h3>
            </div>
            <div className="p-4 bg-white rounded-2xl border border-slate-200 space-y-3 font-sans">
              <div className="p-3 bg-white rounded-xl border border-emerald-500/30 font-mono text-[11px] space-y-1.5">
                <div className="text-emerald-300 font-bold">
                  Step 1: x = Total Installments - 15 (Extra Kiston ki ginti)
                </div>
                <div className="text-slate-800">
                  Step 2: Customer Discount % = (x / 3)% of Loan Amount
                </div>
                <div className="text-amber-300 pt-1 font-semibold">
                  Step 3: Company Paid Reward = Customer Discount Pool (50% Agent + 50% Department)
                </div>
              </div>
              <ul className="list-disc list-inside space-y-1.5 text-slate-700 text-[11px]">
                <li>
                  <strong>Lock-in Base (15 Kist):</strong> Agar loan 15 kist ka hai ya borrower ne 15 se kam kiston par preclose kiya, toh Extra Kist <span className="font-mono text-emerald-400 font-bold">x = 0</span> hota hai, isliye discount <span className="font-mono text-emerald-400 font-bold">0%</span> rehta hai.
                </li>
                <li>
                  <strong>18 Kist Loan:</strong> Extra Kist <span className="font-mono text-emerald-400 font-bold">x = 18 - 15 = 3</span>. Discount = <span className="font-mono text-emerald-400 font-bold">3 / 3 = 1.0%</span> of Loan Amount.
                </li>
                <li>
                  <strong>21 Kist Loan:</strong> Extra Kist <span className="font-mono text-emerald-400 font-bold">x = 21 - 15 = 6</span>. Discount = <span className="font-mono text-emerald-400 font-bold">6 / 3 = 2.0%</span> of Loan Amount.
                </li>
                <li>
                  <strong>24 Kist Loan:</strong> Extra Kist <span className="font-mono text-emerald-400 font-bold">x = 24 - 15 = 9</span>. Discount = <span className="font-mono text-emerald-400 font-bold">9 / 3 = 3.0%</span> of Loan Amount.
                </li>
              </ul>
            </div>
          </div>

          {/* Section 2: Paisa Kahan-Kahan Jayega */}
          <div className="space-y-3">
            <div className="flex items-center gap-2 text-sm font-black text-slate-900 uppercase tracking-wider">
              <span>💰</span>
              <h3>2. Paisa Kahan-Kahan Jayega? (Exact Fund Flow & Routing)</h3>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              {/* Party 1: Customer */}
              <div className="p-4 bg-white rounded-2xl border border-emerald-500/30 flex flex-col justify-between space-y-3">
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-black uppercase text-emerald-400 flex items-center gap-1.5">
                      <span>🟢</span> 1. Customer
                    </span>
                    <span className="px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-300 text-[10px] font-bold border border-emerald-500/20">
                      Bill Discount
                    </span>
                  </div>
                  <p className="text-[11px] text-slate-700 leading-normal">
                    Customer ko preclose settlement ke time direct chhoot milti hai.
                  </p>
                  <div className="text-[11px] text-slate-500 space-y-1 bg-white/60 p-2.5 rounded-xl border border-slate-200">
                    <div><strong>Kitna:</strong> (x / 3)% of Loan Amount</div>
                    <div><strong>Kahan kata:</strong> Loan payoff bill me se seedhe minus hota hai</div>
                    <div><strong>Fayda:</strong> Customer ko loan band karne me utne kam paise dene padte hain.</div>
                  </div>
                </div>
                <div className="text-[10px] text-emerald-400 font-mono font-bold pt-1">
                  Payoff Amount = Total Due - Discount + Penalty
                </div>
              </div>

              {/* Party 2: Agent */}
              <div className="p-4 bg-white rounded-2xl border border-sky-500/30 flex flex-col justify-between space-y-3">
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-black uppercase text-sky-400 flex items-center gap-1.5">
                      <span>🔵</span> 2. Agent
                    </span>
                    <span className="px-2 py-0.5 rounded bg-sky-500/10 text-sky-300 text-[10px] font-bold border border-sky-500/20">
                      Real Cash Wallet
                    </span>
                  </div>
                  <p className="text-[11px] text-slate-700 leading-normal">
                    Agent ke account me instant cash bonus reward add hota hai.
                  </p>
                  <div className="text-[11px] text-slate-500 space-y-1 bg-white/60 p-2.5 rounded-xl border border-slate-200">
                    <div><strong>Kitna:</strong> 50% of Discount % (e.g. 1% me se 0.5%)</div>
                    <div><strong>Kahan gaya:</strong> Agent ke <code className="text-sky-300">Wallet Balance</code> me credit</div>
                    <div><strong>Ledger Type:</strong> <code className="text-sky-300">referral_bonus</code> Transaction record</div>
                  </div>
                </div>
                <div className="text-[10px] text-sky-400 font-semibold pt-1">
                  Agent is cash ko direct bank me withdraw kar sakta hai.
                </div>
              </div>

              {/* Party 3: Loan Department / Company */}
              <div className="p-4 bg-white rounded-2xl border border-amber-500/30 flex flex-col justify-between space-y-3">
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-black uppercase text-amber-400 flex items-center gap-1.5">
                      <span>🟣</span> 3. Loan Dept / Company
                    </span>
                    <span className="px-2 py-0.5 rounded bg-amber-500/10 text-amber-300 text-[10px] font-bold border border-amber-500/20">
                      Company Profit Ledger
                    </span>
                  </div>
                  <p className="text-[11px] text-slate-700 leading-normal">
                    Company revenue aur loan portfolio profit ledger me jama hota hai.
                  </p>
                  <div className="text-[11px] text-slate-500 space-y-1 bg-white/60 p-2.5 rounded-xl border border-slate-200">
                    <div><strong>Kitna:</strong> 50% of Discount % (e.g. 1% me se 0.5%)</div>
                    <div><strong>Kahan gaya:</strong> Internal Loan Settlement Ledger (<code className="text-amber-300">precloseCompanyProfit</code>)</div>
                    <div><strong>Fayda:</strong> Early recovered capital se company ka cashflow aur net margin surakshit rehta hai.</div>
                  </div>
                </div>
                <div className="text-[10px] text-amber-400 font-semibold pt-1">
                  Company audit & balance sheet me profit book hota hai.
                </div>
              </div>
            </div>

            {/* Note about Company Paid Source */}
            <div className="p-3.5 bg-white rounded-xl border border-slate-200 text-[11px] text-slate-700 flex items-start gap-2.5">
              <span className="text-base text-amber-400 shrink-0">💡</span>
              <p>
                <strong className="text-white">Zaroori Niyam (Company Paid Policy):</strong> Customer ke discount me se koi katauti nahi hoti! Customer ko poora discount (jaise 1% ya ₹1,000) milta hai. Agent aur Loan Department ka commission (0.5% + 0.5%) <strong>Company apni taraf se alag se deti hai</strong>.
              </p>
            </div>
          </div>

          {/* Section 3: Mandatory 15-Kist Lock-in Scenario */}
          <div className="space-y-3">
            <div className="flex items-center gap-2 text-sm font-black text-slate-900 uppercase tracking-wider">
              <span>🔒</span>
              <h3>3. Mandatory 15-Kist Lock-in Rule (0 ya 1st Kist Preclose Scenario)</h3>
            </div>
            <div className="p-4 bg-white rounded-2xl border border-slate-200 space-y-2.5 text-slate-700 text-[11px]">
              <p>
                <strong>Sawaal:</strong> Agar kisi borrower ne 18 kiston ka loan liya aur sirf 1 kist bharkar (ya pehli kist se pehle hi) bola ki loan band karna hai, toh calculation kaise hoga?
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 pt-1">
                <div className="p-3 bg-slate-50 rounded-xl border border-slate-200 space-y-1">
                  <div className="text-rose-400 font-bold">❌ Kya Maaf NAHI Hoga:</div>
                  <p className="text-slate-500">
                    Customer ko <strong>pehli 15 kiston tak ka byaaj dena hi padega</strong>. Chaahe usne 1 hi kist bhari ho, mandatory lock-in rule ke tehat company 15 kist tak ka byaaj recover karti hai.
                  </p>
                </div>
                <div className="p-3 bg-slate-50 rounded-xl border border-slate-200 space-y-1">
                  <div className="text-emerald-400 font-bold">✓ Kya Maaf (Discount) Hoga:</div>
                  <p className="text-slate-500">
                    15 kist ke baad ki extra kiston (16th, 17th, 18th) ka byaaj maaf ho jayega + 1% discount (3 kist extra hone ke kaaran) customer ke total payable se minus hoga.
                  </p>
                </div>
              </div>
              <div className="p-2.5 bg-white rounded-xl border border-slate-200 font-mono text-[11px] text-slate-800">
                Final Preclose Payoff = Remaining Principal Amount + (15 Kist tak ka Byaaj) + Penalty (agar ho) - Customer Discount
              </div>
            </div>
          </div>

          {/* Section 4: Full Numerical Table (₹10,000 & ₹1,00,000 Loans) */}
          <div className="space-y-3">
            <div className="flex items-center gap-2 text-sm font-black text-slate-900 uppercase tracking-wider">
              <span>📊</span>
              <h3>4. Complete Rate & Amount Reference Table</h3>
            </div>
            <div className="overflow-x-auto rounded-2xl border border-slate-200">
              <table className="w-full text-[11px] text-left border-collapse">
                <thead className="bg-white text-slate-500 text-[10px] uppercase font-bold tracking-wider border-b border-slate-200">
                  <tr>
                    <th className="py-2.5 px-3">Total Kist</th>
                    <th className="py-2.5 px-3">Extra Kist (x)</th>
                    <th className="py-2.5 px-3 text-emerald-400">Customer Discount</th>
                    <th className="py-2.5 px-3 text-sky-400">Agent Profit (Company Paid)</th>
                    <th className="py-2.5 px-3 text-amber-400">Dept Profit (Company Paid)</th>
                    <th className="py-2.5 px-3">₹10,000 Loan</th>
                    <th className="py-2.5 px-3">₹1,00,000 Loan</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-800/60 bg-white/40 font-mono">
                  <tr className="hover:bg-slate-100/50">
                    <td className="py-2 px-3 font-bold text-slate-900 font-sans">15 Kist</td>
                    <td className="py-2 px-3 text-slate-500">0 (Base)</td>
                    <td className="py-2 px-3 text-slate-500">0% (Lock-in)</td>
                    <td className="py-2 px-3 text-slate-500">0%</td>
                    <td className="py-2 px-3 text-slate-500">0%</td>
                    <td className="py-2 px-3 text-slate-500">₹0</td>
                    <td className="py-2 px-3 text-slate-500">₹0</td>
                  </tr>
                  <tr className="hover:bg-slate-100/50">
                    <td className="py-2 px-3 font-bold text-slate-900 font-sans">18 Kist</td>
                    <td className="py-2 px-3 text-emerald-400">+3 Kist</td>
                    <td className="py-2 px-3 text-emerald-400 font-bold">1.0%</td>
                    <td className="py-2 px-3 text-sky-400 font-bold">0.5% (Wallet)</td>
                    <td className="py-2 px-3 text-amber-400 font-bold">0.5% (Ledger)</td>
                    <td className="py-2 px-3 text-slate-800">
                      Cust: -₹100 | Ag: ₹50 | Dept: ₹50
                    </td>
                    <td className="py-2 px-3 text-slate-800">
                      Cust: -₹1,000 | Ag: ₹500 | Dept: ₹500
                    </td>
                  </tr>
                  <tr className="hover:bg-slate-100/50">
                    <td className="py-2 px-3 font-bold text-slate-900 font-sans">21 Kist</td>
                    <td className="py-2 px-3 text-emerald-400">+6 Kist</td>
                    <td className="py-2 px-3 text-emerald-400 font-bold">2.0%</td>
                    <td className="py-2 px-3 text-sky-400 font-bold">1.0% (Wallet)</td>
                    <td className="py-2 px-3 text-amber-400 font-bold">1.0% (Ledger)</td>
                    <td className="py-2 px-3 text-slate-800">
                      Cust: -₹200 | Ag: ₹100 | Dept: ₹100
                    </td>
                    <td className="py-2 px-3 text-slate-800">
                      Cust: -₹2,000 | Ag: ₹1,000 | Dept: ₹1,000
                    </td>
                  </tr>
                  <tr className="hover:bg-slate-100/50">
                    <td className="py-2 px-3 font-bold text-slate-900 font-sans">24 Kist</td>
                    <td className="py-2 px-3 text-emerald-400">+9 Kist</td>
                    <td className="py-2 px-3 text-emerald-400 font-bold">3.0%</td>
                    <td className="py-2 px-3 text-sky-400 font-bold">1.5% (Wallet)</td>
                    <td className="py-2 px-3 text-amber-400 font-bold">1.5% (Ledger)</td>
                    <td className="py-2 px-3 text-slate-800">
                      Cust: -₹300 | Ag: ₹150 | Dept: ₹150
                    </td>
                    <td className="py-2 px-3 text-slate-800">
                      Cust: -₹3,000 | Ag: ₹1,500 | Dept: ₹1,500
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>

          {/* Section 5: Daily Loans (Micro Business) */}
          <div className="space-y-2">
            <div className="flex items-center gap-2 text-xs font-black text-slate-900 uppercase tracking-wider">
              <span>📅</span>
              <h4>5. Daily Loan Tenures (Micro Business)</h4>
            </div>
            <p className="text-[11px] text-slate-500">
              Micro Business daily loan tenures (60, 90, 120, 180, 240, 365 din) ke liye har 30 din ka cycle extra kist scale se map hota hai, jisse daily borrowers aur agents ko bhi unke tenure anusaar transparent discount aur profit milta hai.
            </p>
          </div>
        </div>

        {/* Footer with Close Button */}
        <div className="p-4 bg-white border-t border-slate-200 flex items-center justify-between shrink-0">
          <span className="text-[11px] text-slate-500 font-medium">
            System Config: Mandatory Lock-in 15 Kist | Divider: 3 Kist | Max Cap: 15%
          </span>
          <button
            onClick={onClose}
            className="px-4 py-2 bg-zinc-100 hover:bg-white text-zinc-950 font-black rounded-xl text-xs transition active:scale-95 cursor-pointer shadow-sm"
          >
            Samajh Gaya (Close)
          </button>
        </div>
      </div>
    </div>
  );
}
