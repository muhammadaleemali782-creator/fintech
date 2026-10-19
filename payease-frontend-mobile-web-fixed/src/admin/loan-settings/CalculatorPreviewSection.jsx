import React, { useState, useMemo } from "react";
import { calculatePrecloseBreakdown } from "../../utils/precloseCalculator";

export default function CalculatorPreviewSection({ settings, conditions }) {
  // Calculator Interactive Inputs
  const [loanAmount, setLoanAmount] = useState(100000);
  const [totalInstallments, setTotalInstallments] = useState(21);
  const [paidInstallments, setPaidInstallments] = useState(12);
  const [remainingInterest, setRemainingInterest] = useState(9000);
  const [totalPayable, setTotalPayable] = useState(109000);
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
    selectedLoanType,
    activeSetting,
    conditions
  ]);

  return (
    <div className="space-y-6">
      {/* Banner */}
      <div className="p-5 bg-gradient-to-br from-emerald-950/40 via-slate-900 to-slate-950 border border-emerald-500/30 rounded-2xl">
        <div className="flex items-center gap-2">
          <span className="text-xl">🧮</span>
          <h3 className="text-sm font-black text-white uppercase tracking-wider">
            Live Preclose Calculator & Simulation
          </h3>
        </div>
        <p className="text-xs text-slate-400 mt-1">
          Niche diye gaye test values badal kar live test karein ki customer ke early close karne par discount, agent share aur department profit kaise calculate honge.
        </p>
      </div>

      {/* Inputs Card */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-xl space-y-4">
        <h4 className="text-xs font-black uppercase text-slate-300 tracking-wider flex items-center gap-2">
          <span>⚙️</span>
          <span>Simulation Inputs</span>
        </h4>

        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4 text-xs">
          <div>
            <label className="text-slate-400 font-bold block mb-1">Loan Type</label>
            <select
              value={selectedLoanType}
              onChange={(e) => setSelectedLoanType(e.target.value)}
              className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-white focus:outline-none focus:border-blue-500"
            >
              <option value="default">Default Rules</option>
              <option value="personal">Personal Loan</option>
              <option value="student">Student Loan</option>
              <option value="micro_business">Micro Business Loan</option>
            </select>
          </div>

          <div>
            <label className="text-slate-400 font-bold block mb-1">Loan Principal Amount (₹)</label>
            <input
              type="number"
              min="0"
              value={loanAmount}
              onChange={(e) => setLoanAmount(Number(e.target.value))}
              className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-white font-mono focus:outline-none focus:border-blue-500"
            />
          </div>

          <div>
            <label className="text-slate-400 font-bold block mb-1">Total Installments Count</label>
            <input
              type="number"
              min="1"
              value={totalInstallments}
              onChange={(e) => setTotalInstallments(Number(e.target.value))}
              className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-white font-mono focus:outline-none focus:border-blue-500"
            />
          </div>

          <div>
            <label className="text-slate-400 font-bold block mb-1">Paid Installments Count</label>
            <input
              type="number"
              min="0"
              max={totalInstallments}
              value={paidInstallments}
              onChange={(e) => setPaidInstallments(Number(e.target.value))}
              className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-white font-mono focus:outline-none focus:border-blue-500"
            />
          </div>

          <div>
            <label className="text-slate-400 font-bold block mb-1">Remaining Installments Interest (₹)</label>
            <input
              type="number"
              min="0"
              value={remainingInterest}
              onChange={(e) => setRemainingInterest(Number(e.target.value))}
              className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-white font-mono focus:outline-none focus:border-blue-500"
            />
          </div>

          <div>
            <label className="text-slate-400 font-bold block mb-1">Total Payable Amount (₹)</label>
            <input
              type="number"
              min="0"
              value={totalPayable}
              onChange={(e) => setTotalPayable(Number(e.target.value))}
              className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-white font-mono focus:outline-none focus:border-blue-500"
            />
          </div>
        </div>
      </div>

      {/* Output Metric Cards */}
      <div className="space-y-3">
        <h4 className="text-xs font-black uppercase text-slate-300 tracking-wider flex items-center gap-2">
          <span>📊</span>
          <span>Calculated Breakdown Results</span>
        </h4>

        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
          {/* 1. Remaining Installments */}
          <div className="p-4 bg-slate-900 border border-slate-800 rounded-2xl space-y-1">
            <span className="text-[10px] uppercase font-bold text-slate-400 block">Remaining Installments</span>
            <span className="text-xl font-black text-white font-mono block">
              {result.remaining_installments}
            </span>
            <span className="text-[10px] text-slate-500 block">
              {totalInstallments} - {paidInstallments}
            </span>
          </div>

          {/* 2. Discount Blocks */}
          <div className="p-4 bg-slate-900 border border-slate-800 rounded-2xl space-y-1">
            <span className="text-[10px] uppercase font-bold text-slate-400 block">Discount Blocks</span>
            <span className="text-xl font-black text-amber-400 font-mono block">
              {result.discount_blocks}
            </span>
            <span className="text-[10px] text-slate-500 block">
              Floor({result.remaining_installments} / {result.applied_settings.installment_block_size})
            </span>
          </div>

          {/* 3. Total Discount % */}
          <div className="p-4 bg-slate-900 border border-slate-800 rounded-2xl space-y-1">
            <span className="text-[10px] uppercase font-bold text-slate-400 block">Total Discount Rate</span>
            <span className="text-xl font-black text-emerald-400 font-mono block">
              {result.total_discount_percent}%
            </span>
            <span className="text-[10px] text-slate-500 block">
              {result.discount_blocks} × {result.applied_settings.discount_percent_per_block}%
              {result.applied_settings.maximum_discount_percent ? ` (Capped)` : ""}
            </span>
          </div>

          {/* 4. Total Discount Amount */}
          <div className="p-4 bg-emerald-950/30 border border-emerald-500/30 rounded-2xl space-y-1">
            <span className="text-[10px] uppercase font-bold text-emerald-400 block">Total Discount Pool</span>
            <span className="text-xl font-black text-emerald-300 font-mono block">
              ₹{result.discount_amount.toLocaleString("en-IN")}
            </span>
            <span className="text-[10px] text-emerald-500/80 block">
              ₹{remainingInterest} ka {result.total_discount_percent}%
            </span>
          </div>

          {/* 5. Agent Share */}
          <div className="p-4 bg-blue-950/30 border border-blue-500/30 rounded-2xl space-y-1">
            <span className="text-[10px] uppercase font-bold text-blue-400 block">Agent Share Amount</span>
            <span className="text-xl font-black text-blue-300 font-mono block">
              ₹{result.agent_share_amount.toLocaleString("en-IN")}
            </span>
            <span className="text-[10px] text-blue-500/80 block">
              {result.applied_settings.agent_share_percent}% of discount pool
            </span>
          </div>

          {/* 6. Loan Department Share */}
          <div className="p-4 bg-indigo-950/30 border border-indigo-500/30 rounded-2xl space-y-1">
            <span className="text-[10px] uppercase font-bold text-indigo-400 block">Loan Dept Net Share</span>
            <span className="text-xl font-black text-indigo-300 font-mono block">
              ₹{result.loan_department_share_amount.toLocaleString("en-IN")}
            </span>
            <span className="text-[10px] text-indigo-500/80 block">
              {result.applied_settings.loan_department_share_percent}% of discount pool
            </span>
          </div>

          {/* 7. Final User Payable */}
          <div className="col-span-2 sm:col-span-1 md:col-span-2 p-4 bg-gradient-to-br from-slate-900 to-slate-950 border border-blue-500/40 rounded-2xl space-y-1">
            <span className="text-[10px] uppercase font-bold text-slate-400 block">Final User Settlement Amount</span>
            <span className="text-2xl font-black text-white font-mono block">
              ₹{result.user_payable_amount.toLocaleString("en-IN")}
            </span>
            <span className="text-[10px] text-emerald-400 font-bold block">
              ✓ Customer saves ₹{result.discount_amount.toLocaleString("en-IN")} on preclose
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
