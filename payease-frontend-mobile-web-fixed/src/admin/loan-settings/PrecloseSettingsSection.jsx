import React, { useState, useMemo } from "react";
import { calculatePrecloseBreakdown } from "../../utils/precloseCalculator";
import {
  SYSTEM_LOAN_INSTALLMENTS,
  SYSTEM_DAILY_TENURES
} from "../../constants/loanSettingsDefaults";

const LOAN_TYPES = [
  { id: "default", label: "Default (All Loan Types)" },
  { id: "personal", label: "Personal Loan" },
  { id: "student", label: "Student Loan" },
  { id: "micro_business", label: "Micro Business Loan" }
];

export default function PrecloseSettingsSection({
  settings,
  onChangeSettings,
  isDirty
}) {
  const [selectedType, setSelectedType] = useState("default");

  const isDefaultSelected = selectedType === "default";
  const activeTenures = selectedType === "micro_business" ? SYSTEM_DAILY_TENURES : SYSTEM_LOAN_INSTALLMENTS;

  // Resolve current active setting object based on selected loan type
  const currentSetting = useMemo(() => {
    if (isDefaultSelected) {
      return settings?.default || {};
    }
    const override = settings?.overrides?.[selectedType];
    if (override && Object.keys(override).length > 0) {
      return override;
    }
    // Fall back to default values if override not created yet
    return {
      ...(settings?.default || {}),
      loan_type_id: selectedType,
      isCustomOverride: false
    };
  }, [settings, selectedType, isDefaultSelected]);

  const hasCustomOverride = Boolean(settings?.overrides?.[selectedType]);

  const handleFieldChange = (field, val) => {
    if (isDefaultSelected) {
      onChangeSettings({
        ...settings,
        default: {
          ...settings.default,
          [field]: val
        }
      });
    } else {
      const existingOverride = settings?.overrides?.[selectedType] || {
        ...settings.default,
        loan_type_id: selectedType
      };
      onChangeSettings({
        ...settings,
        overrides: {
          ...settings.overrides,
          [selectedType]: {
            ...existingOverride,
            [field]: val
          }
        }
      });
    }
  };

  const handleResetOverrideToDefault = () => {
    if (isDefaultSelected) return;
    const newOverrides = { ...(settings.overrides || {}) };
    delete newOverrides[selectedType];
    onChangeSettings({
      ...settings,
      overrides: newOverrides
    });
  };

  // Agent + Dept Share validation check
  const agentShare = Number(currentSetting.agent_share_percent ?? 50);
  const deptShare = Number(currentSetting.loan_department_share_percent ?? 50);
  const sharesValid = Math.round(agentShare + deptShare) === 100;

  // Live calculation helper generator based on standard 9 remaining installments scenario
  const sampleBreakdown = useMemo(() => {
    return calculatePrecloseBreakdown({
      total_installments: 21,
      paid_installments: 12,
      interest_on_remaining_installments: 9000,
      total_payable_amount: 109000,
      loan_amount: 100000,
      settings: currentSetting
    });
  }, [currentSetting]);

  // System Installment Tenures Preclose Matrix
  const tenureBreakdowns = useMemo(() => {
    const mandatory = Number(currentSetting.mandatory_installments_before_preclose ?? 15);
    return activeTenures.map((t) => {
      const paid = Math.min(t.count, mandatory);
      const res = calculatePrecloseBreakdown({
        total_installments: t.count,
        paid_installments: paid,
        interest_on_remaining_installments: 10000,
        total_payable_amount: 110000,
        loan_amount: 100000,
        loan_type: selectedType,
        settings: currentSetting
      });
      return {
        tenure: t,
        mandatory,
        remaining: res.remaining_installments,
        blocks: res.discount_blocks,
        discountPercent: res.total_discount_percent,
        discountAmount: res.discount_amount,
        agentShare: res.agent_share_amount,
        deptShare: res.loan_department_share_amount
      };
    });
  }, [activeTenures, currentSetting, selectedType]);

  return (
    <div className="space-y-6">
      {/* Overview Banner */}
      <div className="p-5 bg-gradient-to-br from-indigo-950/40 via-slate-900 to-blue-950/30 border border-indigo-500/30 rounded-2xl space-y-2">
        <div className="flex items-center gap-2">
          <span className="text-xl">🏷️</span>
          <h3 className="text-sm font-black text-white uppercase tracking-wider">
            Loan Preclose Interest Discount Policy
          </h3>
        </div>
        <p className="text-xs text-slate-400">
          Jab koi customer samay se pehle loan band (preclose) karta hai, toh bachi hui kiston ke byaaj par chhoot (discount) milti hai. Yeh discount amount Agent aur Loan Department ke beech 50-50 share hota hai.
        </p>
      </div>

      {/* Loan Type Switcher Tabs */}
      <div className="flex items-center gap-2 overflow-x-auto pb-1">
        {LOAN_TYPES.map((lt) => {
          const isSelected = selectedType === lt.id;
          const isOverridden = lt.id !== "default" && Boolean(settings?.overrides?.[lt.id]);
          return (
            <button
              key={lt.id}
              onClick={() => setSelectedType(lt.id)}
              className={`px-3.5 py-2 rounded-xl text-xs font-bold transition flex items-center gap-1.5 whitespace-nowrap cursor-pointer active:scale-95 ${
                isSelected
                  ? "bg-blue-600 text-white shadow-md shadow-blue-600/30 font-black"
                  : "bg-slate-900 text-slate-400 hover:bg-slate-850 hover:text-slate-200 border border-slate-800"
              }`}
            >
              <span>{lt.label}</span>
              {isOverridden && (
                <span className="w-2 h-2 rounded-full bg-amber-400" title="Custom override active" />
              )}
            </button>
          );
        })}
      </div>

      {/* System Loan Installments Badges */}
      <div className="p-3.5 bg-slate-900/90 border border-slate-800 rounded-2xl flex flex-wrap items-center justify-between gap-3 text-xs">
        <div className="flex items-center gap-2">
          <span className="text-sm">🗓️</span>
          <span className="font-bold text-slate-200">
            System Available Installments ({selectedType === "micro_business" ? "Daily Tenures" : "15 - 18 - 21 - 24 Kist"}):
          </span>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {activeTenures.map((t) => (
            <span
              key={t.count}
              className="px-2.5 py-1 rounded-xl bg-slate-950 border border-blue-500/30 text-blue-300 font-mono font-bold text-xs shadow-xs"
            >
              {t.label}
            </span>
          ))}
        </div>
      </div>

      {/* Override Notice if Sub-type is Selected */}
      {!isDefaultSelected && (
        <div className="p-3 bg-slate-900/90 border border-slate-800 rounded-xl flex items-center justify-between text-xs">
          <span className="text-slate-300">
            {hasCustomOverride ? (
              <span className="text-amber-400 font-bold">
                ⚡ Custom Override Active for {LOAN_TYPES.find((t) => t.id === selectedType)?.label}
              </span>
            ) : (
              <span className="text-slate-400">
                Currently using <strong className="text-slate-200">Default (All Loan Types)</strong> rules. Change any field below to set a custom override.
              </span>
            )}
          </span>
          {hasCustomOverride && (
            <button
              onClick={handleResetOverrideToDefault}
              className="text-[11px] text-rose-400 hover:text-rose-300 font-bold underline cursor-pointer"
            >
              Reset to Default
            </button>
          )}
        </div>
      )}

      {/* Settings Grid */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-xl space-y-6">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* 1. Mandatory Installments */}
          <div className="space-y-1.5">
            <label className="text-xs font-bold text-slate-300 block">
              1. Mandatory Installments Before Preclose
            </label>
            <input
              type="number"
              min="0"
              value={currentSetting.mandatory_installments_before_preclose ?? 15}
              onChange={(e) =>
                handleFieldChange("mandatory_installments_before_preclose", Number(e.target.value))
              }
              className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2 text-xs font-mono text-white focus:outline-none focus:border-blue-500"
            />
            {/* Quick Set Buttons for System Installments */}
            <div className="flex flex-wrap items-center gap-1.5 pt-1">
              <span className="text-[10px] text-slate-400 font-bold mr-1">Quick Set:</span>
              {activeTenures.map((t) => (
                <button
                  key={t.count}
                  type="button"
                  onClick={() => handleFieldChange("mandatory_installments_before_preclose", t.count)}
                  className={`px-2 py-0.5 rounded-lg text-[10px] font-bold border transition cursor-pointer active:scale-95 ${
                    Number(currentSetting.mandatory_installments_before_preclose) === t.count
                      ? "bg-blue-600 text-white border-blue-500 shadow-xs"
                      : "bg-slate-950 text-slate-400 border-slate-800 hover:text-white"
                  }`}
                >
                  {t.count} Kist
                </button>
              ))}
            </div>
            <p className="text-[11px] text-slate-400 mt-1">
              Customer ko pehli <strong>{currentSetting.mandatory_installments_before_preclose ?? 15}</strong> kiston ka byaaj bharna mandatory hai.
            </p>
          </div>

          {/* 2. Installment Block Size */}
          <div className="space-y-1.5">
            <label className="text-xs font-bold text-slate-300 block">
              2. Installment Block Size
            </label>
            <input
              type="number"
              min="1"
              value={currentSetting.installment_block_size ?? 3}
              onChange={(e) =>
                handleFieldChange("installment_block_size", Math.max(1, Number(e.target.value)))
              }
              className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2 text-xs font-mono text-white focus:outline-none focus:border-blue-500"
            />
            <p className="text-[11px] text-slate-400">
              Har <strong>{currentSetting.installment_block_size ?? 3}</strong> remaining kiston ka 1 block banega.
            </p>
          </div>

          {/* 3. Discount Percent Per Block */}
          <div className="space-y-1.5">
            <label className="text-xs font-bold text-slate-300 block">
              3. Discount Percent Per Block (%)
            </label>
            <input
              type="number"
              min="0"
              step="0.1"
              value={currentSetting.discount_percent_per_block ?? 1}
              onChange={(e) =>
                handleFieldChange("discount_percent_per_block", Number(e.target.value))
              }
              className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2 text-xs font-mono text-white focus:outline-none focus:border-blue-500"
            />
            <p className="text-[11px] text-slate-400">
              Har block par <strong>{currentSetting.discount_percent_per_block ?? 1}%</strong> ka interest discount milega.
            </p>
          </div>

          {/* 4. Maximum Discount Percent (Optional Cap) */}
          <div className="space-y-1.5">
            <label className="text-xs font-bold text-slate-300 block">
              4. Maximum Discount Percent Cap (% optional)
            </label>
            <input
              type="number"
              min="0"
              placeholder="e.g. 5 (Leave blank for no cap)"
              value={
                currentSetting.maximum_discount_percent !== null &&
                currentSetting.maximum_discount_percent !== undefined
                  ? currentSetting.maximum_discount_percent
                  : ""
              }
              onChange={(e) =>
                handleFieldChange(
                  "maximum_discount_percent",
                  e.target.value === "" ? null : Number(e.target.value)
                )
              }
              className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2 text-xs font-mono text-white placeholder-slate-600 focus:outline-none focus:border-blue-500"
            />
            <p className="text-[11px] text-slate-400">
              {currentSetting.maximum_discount_percent
                ? `Max discount ${currentSetting.maximum_discount_percent}% par cap ho jayega.`
                : "No cap: Blocks ke hisab se poora discount calculate hoga."}
            </p>
          </div>

          {/* 5. Agent Share Percent */}
          <div className="space-y-1.5">
            <label className="text-xs font-bold text-slate-300 block">
              5. Agent Share Percent (%)
            </label>
            <input
              type="number"
              min="0"
              max="100"
              value={agentShare}
              onChange={(e) => {
                const val = Number(e.target.value);
                handleFieldChange("agent_share_percent", val);
                handleFieldChange("loan_department_share_percent", Math.max(0, 100 - val));
              }}
              className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2 text-xs font-mono text-white focus:outline-none focus:border-blue-500"
            />
            <p className="text-[11px] text-slate-400">
              Total discount pool ka <strong>{agentShare}%</strong> hissa sourcing agent ko milega.
            </p>
          </div>

          {/* 6. Loan Department Share Percent */}
          <div className="space-y-1.5">
            <label className="text-xs font-bold text-slate-300 block">
              6. Loan Department Share Percent (%)
            </label>
            <input
              type="number"
              min="0"
              max="100"
              value={deptShare}
              onChange={(e) => {
                const val = Number(e.target.value);
                handleFieldChange("loan_department_share_percent", val);
                handleFieldChange("agent_share_percent", Math.max(0, 100 - val));
              }}
              className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2 text-xs font-mono text-white focus:outline-none focus:border-blue-500"
            />
            <p className="text-[11px] text-slate-400">
              Total discount pool ka <strong>{deptShare}%</strong> hissa Loan Department me retain hoga.
            </p>
          </div>
        </div>

        {/* Validation Error Alert if sum != 100 */}
        {!sharesValid && (
          <div className="p-3 bg-rose-500/10 border border-rose-500/30 rounded-xl text-rose-300 text-xs font-bold flex items-center gap-2">
            <span>⚠️</span>
            <span>Agent Share ({agentShare}%) aur Loan Department Share ({deptShare}%) ka jod hamesha 100% hona chahiye! (Current: {agentShare + deptShare}%)</span>
          </div>
        )}

        {/* Live Calculation Helper Banner */}
        <div className="p-4 bg-slate-950 rounded-xl border border-blue-500/30 space-y-2">
          <div className="flex items-center gap-2 text-xs font-bold text-blue-400">
            <span>💡</span>
            <span>Live Calculation Example (Total 21 installments, 12 paid, 9 remaining):</span>
          </div>
          <div className="text-xs text-slate-300 leading-relaxed font-mono">
            Is value par: remaining <strong>{sampleBreakdown.remaining_installments}</strong> installments →{" "}
            <strong>{sampleBreakdown.discount_blocks}</strong> blocks →{" "}
            <strong>{sampleBreakdown.total_discount_percent}%</strong> discount →{" "}
            user ko chhoot <strong className="text-emerald-400">₹{sampleBreakdown.discount_amount}</strong>,{" "}
            agent ko <strong className="text-blue-400">₹{sampleBreakdown.agent_share_amount}</strong>,{" "}
            loan department ko <strong className="text-indigo-400">₹{sampleBreakdown.loan_department_share_amount}</strong>
          </div>
        </div>
      </div>

      {/* System Installments Preclose Breakdown Matrix Table */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-xl space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <span className="text-base">📊</span>
            <h4 className="text-xs font-black uppercase text-slate-200 tracking-wider">
              System Installments Preclose Matrix ({selectedType === "micro_business" ? "Daily Tenures" : "15 - 18 - 21 - 24 Kist"})
            </h4>
          </div>
          <span className="text-[11px] text-slate-400 font-medium">
            Simulation on ₹10,000 remaining interest (Mandatory: {currentSetting.mandatory_installments_before_preclose ?? 15} kist paid)
          </span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs text-slate-300">
            <thead className="bg-slate-950 text-[10px] uppercase font-bold text-slate-400 border-b border-slate-800">
              <tr>
                <th className="px-3.5 py-2.5">System Installments</th>
                <th className="px-3.5 py-2.5 text-center">Mandatory Paid</th>
                <th className="px-3.5 py-2.5 text-center">Remaining</th>
                <th className="px-3.5 py-2.5 text-center">Discount Blocks</th>
                <th className="px-3.5 py-2.5 text-center">Discount Rate</th>
                <th className="px-3.5 py-2.5 text-right">User Discount</th>
                <th className="px-3.5 py-2.5 text-right">Agent Share ({agentShare}%)</th>
                <th className="px-3.5 py-2.5 text-right">Dept Share ({deptShare}%)</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60 font-mono">
              {tenureBreakdowns.map(({ tenure, mandatory, remaining, blocks, discountPercent, discountAmount, agentShare: aShare, deptShare: dShare }) => (
                <tr key={tenure.count} className="hover:bg-slate-800/40 transition">
                  <td className="px-3.5 py-3 font-sans font-bold text-white flex items-center gap-1.5">
                    <span className="text-blue-400">🏷️</span>
                    <span>{tenure.label}</span>
                  </td>
                  <td className="px-3.5 py-3 text-center text-slate-400">
                    {Math.min(tenure.count, mandatory)}
                  </td>
                  <td className="px-3.5 py-3 text-center font-bold text-white">
                    {remaining}
                  </td>
                  <td className="px-3.5 py-3 text-center text-amber-400 font-bold">
                    {blocks}
                  </td>
                  <td className="px-3.5 py-3 text-center font-bold text-emerald-400">
                    {discountPercent}%
                  </td>
                  <td className="px-3.5 py-3 text-right font-black text-emerald-400">
                    ₹{discountAmount.toLocaleString("en-IN")}
                  </td>
                  <td className="px-3.5 py-3 text-right text-blue-400">
                    ₹{aShare.toLocaleString("en-IN")}
                  </td>
                  <td className="px-3.5 py-3 text-right text-indigo-400">
                    ₹{dShare.toLocaleString("en-IN")}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
