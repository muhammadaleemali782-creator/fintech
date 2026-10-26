import React, { useState, useMemo } from "react";
import { calculatePrecloseBreakdown } from "../../utils/precloseCalculator";

export default function CalculatorPreviewSection({ settings, conditions, onOpenReadme }) {
  // Calculator Interactive Inputs
  const [loanAmount, setLoanAmount] = useState(100000);
  const [totalInstallments, setTotalInstallments] = useState(21);
  const [paidInstallments, setPaidInstallments] = useState(12);
  const [remainingInterest, setRemainingInterest] = useState(9000);
  const [totalPayable, setTotalPayable] = useState(109000);
  const [penaltyAmount, setPenaltyAmount] = useState(0);
  const [selectedLoanType, setSelectedLoanType] = useState("default");

  // Resolve active setting based on selected loan type
  const activeSetting = useMemo(() => {
    if (selectedLoanType === "default" || !settings?.overrides?.[selectedLoanType]) {
      return settings?.default || {};
    }
    return settings.overrides[selectedLoanType];
  }, [settings, selectedLoanType]);

  // Run calculation via shared utility
  const result = useMemo(() => {
    return calculatePrecloseBreakdown({
      total_installments: Number(totalInstallments) || 0,
      paid_installments: Number(paidInstallments) || 0,
      interest_on_remaining_installments: Number(remainingInterest) || 0,
      total_payable_amount: Number(totalPayable) || 0,
      loan_amount: Number(loanAmount) || 0,
      penalty_amount: Number(penaltyAmount) || 0,
      loan_type: selectedLoanType,
      settings: activeSetting,
      conditions: conditions || []
    });
  }, [
    totalInstallments,
    paidInstallments,
    remainingInterest,
    totalPayable,
    loanAmount,
    penaltyAmount,
    selectedLoanType,
    activeSetting,
    conditions
  ]);

  const mandatoryThreshold = result.applied_settings.mandatory_installments_before_preclose ?? 15;
  const isEarlyPreclose = Number(paidInstallments) < mandatoryThreshold;

  return (
    <div className="space-y-6 pb-16">
      {/* Banner */}
      <div className="p-5 bg-white border border-slate-200 rounded-2xl shadow-lg space-y-2">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <span className="text-xl">🧮</span>
            <h3 className="text-sm font-black text-slate-900 uppercase tracking-wider">
              Live Preclose Calculator & Simulation
            </h3>
          </div>
          {onOpenReadme && (
            <button
              type="button"
              onClick={onOpenReadme}
              className="px-3.5 py-1.5 rounded-xl bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 hover:text-emerald-300 border border-emerald-500/30 font-bold text-xs flex items-center gap-1.5 transition active:scale-95 cursor-pointer shadow-xs self-start sm:self-auto"
            >
              <span>📖</span>
              <span>Read Me / Policy Guide</span>
            </button>
          )}
        </div>
        <p className="text-xs text-slate-500">
          Niche diye gaye test values badal kar live test karein ki customer ke early close karne par discount, mandatory interest lock-in, penalty, agent share aur department profit kaise calculate honge.
        </p>
      </div>

      {/* Early Preclose Mandatory Rule Callout if paid < mandatory */}
      {isEarlyPreclose && (
        <div className="p-4 bg-white border border-amber-500/40 rounded-2xl space-y-1.5 shadow-md">
          <div className="flex items-center gap-2 text-xs font-bold text-amber-400">
            <span>⚠️</span>
            <span>Mandatory Lock-in Active: Customer has paid only {paidInstallments} of {totalInstallments} installments</span>
          </div>
          <p className="text-xs text-slate-700 leading-relaxed">
            Niyam ke mutabiq customer ko pehli <strong>{mandatoryThreshold}</strong> kiston tak ka byaaj bharna anivarya hai. Bachi hui <strong>{result.mandatory_remaining_installments}</strong> mandatory kiston ka byaaj (<strong className="text-amber-300 font-mono">₹{result.mandatory_interest_amount.toLocaleString("en-IN")}</strong>) customer ko pay karna hoga. Iske aage ki <strong>{result.discount_eligible_installments}</strong> kiston par discount/waiver calculate kiya gaya hai.
          </p>
        </div>
      )}

      {/* Inputs Card */}
      <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-xl space-y-4">
        <h4 className="text-xs font-black uppercase text-slate-700 tracking-wider flex items-center gap-2">
          <span>⚙️</span>
          <span>Simulation Inputs</span>
        </h4>

        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4 text-xs">
          <div>
            <label className="text-slate-500 font-bold block mb-1">Loan Type</label>
            <select
              value={selectedLoanType}
              onChange={(e) => setSelectedLoanType(e.target.value)}
              className="w-full bg-white border border-slate-200 rounded-xl px-3 py-2 text-slate-900 bg-white focus:outline-none focus:border-zinc-500"
            >
              <option value="default">Default Rules</option>
              <option value="personal">Personal Loan</option>
              <option value="student">Student Loan</option>
              <option value="micro_business">Micro Business Loan</option>
            </select>
          </div>

          <div>
            <label className="text-slate-500 font-bold block mb-1">Loan Principal Amount (₹)</label>
            <input
              type="number"
              min="0"
              value={loanAmount}
              onChange={(e) => setLoanAmount(Number(e.target.value))}
              className="w-full bg-white border border-slate-200 rounded-xl px-3 py-2 text-slate-900 bg-white font-mono focus:outline-none focus:border-zinc-500"
            />
          </div>

          <div>
            <label className="text-slate-500 font-bold block mb-1">Total Installments Count</label>
            <input
              type="number"
              min="1"
              value={totalInstallments}
              onChange={(e) => setTotalInstallments(Number(e.target.value))}
              className="w-full bg-white border border-slate-200 rounded-xl px-3 py-2 text-slate-900 bg-white font-mono focus:outline-none focus:border-zinc-500"
            />
            <div className="flex flex-wrap items-center gap-1 mt-1.5">
              {(selectedLoanType === "micro_business" ? [60, 80, 100, 120] : [15, 18, 21, 24, 26, 30]).map((k) => (
                <button
                  key={k}
                  type="button"
                  onClick={() => {
                    setTotalInstallments(k);
                    if (paidInstallments > k) setPaidInstallments(Math.min(15, k));
                  }}
                  className={`px-2 py-0.5 rounded-lg text-[10px] font-bold border transition cursor-pointer active:scale-95 ${
                    totalInstallments === k
                      ? "bg-blue-600 text-white border-white shadow-xs font-black"
                      : "bg-white text-slate-500 border-slate-200 hover:text-white"
                  }`}
                >
                  {k} Kist
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="text-slate-500 font-bold block mb-1">Paid Installments Count</label>
            <input
              type="number"
              min="0"
              max={totalInstallments}
              value={paidInstallments}
              onChange={(e) => setPaidInstallments(Number(e.target.value))}
              className="w-full bg-white border border-slate-200 rounded-xl px-3 py-2 text-slate-900 bg-white font-mono focus:outline-none focus:border-zinc-500"
            />
          </div>

          <div>
            <label className="text-slate-500 font-bold block mb-1">Remaining Installments Interest (₹)</label>
            <input
              type="number"
              min="0"
              value={remainingInterest}
              onChange={(e) => setRemainingInterest(Number(e.target.value))}
              className="w-full bg-white border border-slate-200 rounded-xl px-3 py-2 text-slate-900 bg-white font-mono focus:outline-none focus:border-zinc-500"
            />
          </div>

          <div>
            <label className="text-slate-500 font-bold block mb-1">Late Penalty / Overdue Fee (₹)</label>
            <input
              type="number"
              min="0"
              value={penaltyAmount}
              onChange={(e) => setPenaltyAmount(Number(e.target.value))}
              className="w-full bg-white border border-slate-200 rounded-xl px-3 py-2 text-slate-900 bg-white font-mono focus:outline-none focus:border-zinc-500"
            />
          </div>

          <div>
            <label className="text-slate-500 font-bold block mb-1">Total Payable Amount (₹)</label>
            <input
              type="number"
              min="0"
              value={totalPayable}
              onChange={(e) => setTotalPayable(Number(e.target.value))}
              className="w-full bg-white border border-slate-200 rounded-xl px-3 py-2 text-slate-900 bg-white font-mono focus:outline-none focus:border-zinc-500"
            />
          </div>
        </div>
      </div>

      {/* Output Metric Cards */}
      <div className="space-y-3">
        <h4 className="text-xs font-black uppercase text-slate-700 tracking-wider flex items-center gap-2">
          <span>📊</span>
          <span>Calculated Breakdown Results</span>
        </h4>

        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
          {/* 1. Remaining Installments */}
          <div className="p-4 bg-white border border-slate-200 rounded-2xl space-y-1">
            <span className="text-[10px] uppercase font-bold text-slate-500 block">Remaining Installments</span>
            <span className="text-xl font-black text-slate-900 font-mono block">
              {result.remaining_installments}
            </span>
            <span className="text-[10px] text-slate-400 block">
              {totalInstallments} - {paidInstallments}
            </span>
          </div>

          {/* 2. Kist Factor (x / 3) */}
          <div className="p-4 bg-white border border-slate-200 rounded-2xl space-y-1">
            <span className="text-[10px] uppercase font-bold text-slate-500 block">Kist Factor (x / 3)</span>
            <span className="text-xl font-black text-amber-400 font-mono block">
              {result.kist_factor ?? result.discount_blocks}
            </span>
            <span className="text-[10px] text-slate-400 block">
              x = {result.x_installments ?? Math.max(0, totalInstallments - 15)} (Total - 15)
            </span>
          </div>

          {/* 3. Total Discount % */}
          <div className="p-4 bg-white border border-slate-200 rounded-2xl space-y-1">
            <span className="text-[10px] uppercase font-bold text-slate-500 block">Total Discount Rate</span>
            <span className="text-xl font-black text-emerald-400 font-mono block">
              {result.total_discount_percent}%
            </span>
            <span className="text-[10px] text-slate-400 block">
              ({result.kist_factor ?? result.discount_blocks}) × {result.applied_settings.discount_percent_per_block}%
              {result.applied_settings.maximum_discount_percent ? ` (Capped)` : ""}
            </span>
          </div>

          {/* 4. Total Discount Amount */}
          <div className="p-4 bg-white border border-slate-200 rounded-2xl space-y-1">
            <span className="text-[10px] uppercase font-bold text-emerald-400 block">Customer Discount Pool</span>
            <span className="text-xl font-black text-emerald-400 font-mono block">
              ₹{result.discount_amount.toLocaleString("en-IN")}
            </span>
            <span className="text-[10px] text-slate-500 block">
              {result.total_discount_percent}% of base amount
            </span>
          </div>

          {/* 5. Agent Profit */}
          <div className="p-4 bg-white border border-slate-200 rounded-2xl space-y-1">
            <span className="text-[10px] uppercase font-bold text-slate-500 block">Agent Profit (Company Paid)</span>
            <span className="text-xl font-black text-slate-900 font-mono block">
              ₹{(result.agent_profit ?? result.agent_share_amount).toLocaleString("en-IN")}
            </span>
            <span className="text-[10px] text-slate-500 block font-mono">
              {result.agent_profit_percent !== undefined ? `${result.agent_profit_percent}%` : "50%"} of loan (Company Paid)
            </span>
          </div>

          {/* 6. Department Profit */}
          <div className="p-4 bg-white border border-slate-200 rounded-2xl space-y-1">
            <span className="text-[10px] uppercase font-bold text-slate-500 block">Department Profit (Company Paid)</span>
            <span className="text-xl font-black text-slate-800 font-mono block">
              ₹{(result.department_profit ?? result.loan_department_share_amount).toLocaleString("en-IN")}
            </span>
            <span className="text-[10px] text-slate-500 block font-mono">
              {result.department_profit_percent !== undefined ? `${result.department_profit_percent}%` : "50%"} of loan (Company Paid)
            </span>
          </div>

          {/* 7. Penalty Due (if any) */}
          <div className="p-4 bg-white border border-slate-200 rounded-2xl space-y-1">
            <span className="text-[10px] uppercase font-bold text-rose-400 block">Penalty / Late Charges</span>
            <span className="text-xl font-black text-rose-400 font-mono block">
              ₹{result.penalty_amount.toLocaleString("en-IN")}
            </span>
            <span className="text-[10px] text-slate-400 block">
              {result.penalty_amount > 0 ? "Added to settlement amount" : "No overdue penalty"}
            </span>
          </div>

          {/* 8. Final User Settlement Amount */}
          <div className="col-span-2 sm:col-span-1 md:col-span-2 p-4 bg-white border border-slate-200 rounded-2xl space-y-1 shadow-lg">
            <span className="text-[10px] uppercase font-bold text-slate-500 block">Final User Settlement Amount</span>
            <span className="text-2xl font-black text-slate-900 font-mono block">
              ₹{result.user_payable_amount.toLocaleString("en-IN")}
            </span>
            <div className="text-[11px] text-slate-500 flex flex-wrap items-center justify-between gap-1 pt-1 border-t border-slate-200">
              <span className="text-emerald-400 font-bold">
                ✓ Customer saves ₹{result.discount_amount.toLocaleString("en-IN")}
              </span>
              {result.penalty_amount > 0 && (
                <span className="text-amber-400 text-[10px]">
                  (Includes ₹{result.penalty_amount.toLocaleString("en-IN")} penalty)
                </span>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
