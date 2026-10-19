import React, { useState, useMemo } from "react";
import { calculatePrecloseBreakdown } from "../../utils/precloseCalculator";

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
                  ? "bg-blue-600 text-white shadow-md shadow-blue-600/30"
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
            <p className="text-[11px] text-slate-400">
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
    </div>
  );
}
