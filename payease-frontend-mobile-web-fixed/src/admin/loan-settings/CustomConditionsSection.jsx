import React, { useState } from "react";

const CONDITION_FIELDS = [
  { value: "remaining_installments", label: "Remaining Installments" },
  { value: "loan_amount", label: "Loan Amount (₹)" },
  { value: "paid_installments", label: "Paid Installments" },
  { value: "total_installments", label: "Total Installments" }
];

const OPERATORS = [
  { value: ">=", label: ">= (Greater than or equal to)" },
  { value: ">", label: "> (Greater than)" },
  { value: "=", label: "= (Equal to)" },
  { value: "<=", label: "<= (Less than or equal to)" },
  { value: "<", label: "< (Less than)" }
];

const ACTION_FIELDS = [
  { value: "discount_percent_per_block", label: "Discount Percent Per Block (%)" },
  { value: "agent_share_percent", label: "Agent Share Percent (%)" },
  { value: "maximum_discount_percent", label: "Maximum Discount Percent Cap (%)" },
  { value: "installment_block_size", label: "Installment Block Size" }
];

export default function CustomConditionsSection({
  conditions = [],
  onChangeConditions
}) {
  const [modalOpen, setModalOpen] = useState(false);
  const [editingIndex, setEditingIndex] = useState(null);
  const [formData, setFormData] = useState({
    condition_name: "",
    condition_field: "remaining_installments",
    operator: ">=",
    condition_value: 9,
    action_field: "discount_percent_per_block",
    action_value: 1.5,
    is_active: true,
    priority: 1
  });

  const handleOpenAdd = () => {
    setEditingIndex(null);
    setFormData({
      condition_name: "",
      condition_field: "remaining_installments",
      operator: ">=",
      condition_value: 9,
      action_field: "discount_percent_per_block",
      action_value: 1.5,
      is_active: true,
      priority: conditions.length + 1
    });
    setModalOpen(true);
  };

  const handleOpenEdit = (idx) => {
    setEditingIndex(idx);
    setFormData({ ...conditions[idx] });
    setModalOpen(true);
  };

  const handleSaveCondition = (e) => {
    e.preventDefault();
    if (!formData.condition_name.trim()) return;

    const updated = [...conditions];
    const item = {
      ...formData,
      condition_name: formData.condition_name.trim(),
      condition_value: Number(formData.condition_value) || 0,
      action_value: Number(formData.action_value) || 0,
      priority: Number(formData.priority) || 1
    };

    if (editingIndex !== null) {
      updated[editingIndex] = item;
    } else {
      updated.push(item);
    }

    // Sort by priority ascending
    updated.sort((a, b) => (Number(a.priority) || 0) - (Number(b.priority) || 0));
    onChangeConditions(updated);
    setModalOpen(false);
  };

  const handleDelete = (idx) => {
    const updated = conditions.filter((_, i) => i !== idx);
    onChangeConditions(updated);
  };

  const handleToggleActive = (idx) => {
    const updated = conditions.map((c, i) => (i === idx ? { ...c, is_active: !c.is_active } : c));
    onChangeConditions(updated);
  };

  const handleMove = (idx, direction) => {
    const targetIdx = idx + direction;
    if (targetIdx < 0 || targetIdx >= conditions.length) return;
    const updated = [...conditions];
    const temp = updated[idx];
    updated[idx] = updated[targetIdx];
    updated[targetIdx] = temp;

    // Re-assign priorities based on new array order
    updated.forEach((c, i) => {
      c.priority = i + 1;
    });

    onChangeConditions(updated);
  };

  return (
    <div className="space-y-6">
      {/* Overview Banner */}
      <div className="p-5 bg-gradient-to-br from-amber-950/30 via-slate-900 to-slate-950 border border-amber-500/30 rounded-2xl flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <span className="text-xl">⚡</span>
            <h3 className="text-sm font-black text-white uppercase tracking-wider">
              Custom Dynamic Preclose Conditions
            </h3>
          </div>
          <p className="text-xs text-slate-400 mt-1">
            Vishesh paristhitiyon me standard rules ko override karne ke liye dynamic rules set karein (jaise remaining installments {'>='} 9 hone par zyada discount).
          </p>
        </div>
        <button
          onClick={handleOpenAdd}
          className="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-xl text-xs font-bold transition flex items-center justify-center gap-1.5 shadow-md shadow-blue-600/30 shrink-0 cursor-pointer active:scale-95"
        >
          <span>＋</span>
          <span>Add New Condition</span>
        </button>
      </div>

      {/* Conditions List */}
      <div className="space-y-3">
        {conditions.length === 0 ? (
          <div className="p-8 text-center bg-slate-900 border border-slate-800 rounded-2xl text-slate-500 text-xs">
            Abhi koi custom condition nahi banayi gayi hai. "Add New Condition" par click karke naya rule jodein.
          </div>
        ) : (
          conditions.map((cond, idx) => {
            const fieldLabel = CONDITION_FIELDS.find((f) => f.value === cond.condition_field)?.label || cond.condition_field;
            const actionLabel = ACTION_FIELDS.find((a) => a.value === cond.action_field)?.label || cond.action_field;

            return (
              <div
                key={idx}
                className={`p-4 rounded-2xl border transition ${
                  cond.is_active
                    ? "bg-slate-900 border-slate-800 hover:border-slate-700"
                    : "bg-slate-900/50 border-slate-800/40 opacity-60"
                }`}
              >
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div className="space-y-1.5">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="px-2 py-0.5 rounded-md bg-slate-800 text-slate-400 text-[10px] font-mono font-bold">
                        Priority #{cond.priority || idx + 1}
                      </span>
                      <h4 className="text-xs font-black text-white">{cond.condition_name}</h4>
                      {!cond.is_active && (
                        <span className="px-2 py-0.5 rounded-full bg-slate-800 text-slate-400 text-[10px] font-bold">
                          Disabled
                        </span>
                      )}
                    </div>

                    {/* Formula statement */}
                    <div className="text-xs text-blue-400 font-mono font-bold flex items-center gap-1.5 flex-wrap">
                      <span className="text-slate-400 font-normal">RULE:</span>
                      <span>IF</span>
                      <span className="text-white underline">{fieldLabel}</span>
                      <span className="text-amber-400">{cond.operator}</span>
                      <span className="text-emerald-400">{cond.condition_value}</span>
                      <span>THEN</span>
                      <span className="text-white underline">{actionLabel}</span>
                      <span className="text-amber-400">=</span>
                      <span className="text-emerald-400">{cond.action_value}</span>
                    </div>

                    {/* Live Calculation Preview Note */}
                    <p className="text-[11px] text-slate-400">
                      💡 Is condition se result: Jab bhi <strong>{fieldLabel}</strong> {cond.operator} <strong>{cond.condition_value}</strong> hoga, system automatically <strong>{actionLabel}</strong> ko <strong>{cond.action_value}</strong> set kar dega.
                    </p>
                  </div>

                  {/* Actions & Reorder */}
                  <div className="flex items-center gap-1.5 self-end sm:self-center shrink-0">
                    {/* Reorder Buttons */}
                    <button
                      disabled={idx === 0}
                      onClick={() => handleMove(idx, -1)}
                      className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 disabled:opacity-30 disabled:cursor-not-allowed text-xs transition"
                      title="Move Up"
                    >
                      ▲
                    </button>
                    <button
                      disabled={idx === conditions.length - 1}
                      onClick={() => handleMove(idx, 1)}
                      className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 disabled:opacity-30 disabled:cursor-not-allowed text-xs transition"
                      title="Move Down"
                    >
                      ▼
                    </button>

                    {/* Toggle Active */}
                    <button
                      onClick={() => handleToggleActive(idx)}
                      className={`px-2.5 py-1 rounded-lg text-[11px] font-bold transition ${
                        cond.is_active
                          ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/30 hover:bg-emerald-500/20"
                          : "bg-slate-800 text-slate-400 hover:bg-slate-700"
                      }`}
                    >
                      {cond.is_active ? "Active" : "Enable"}
                    </button>

                    {/* Edit */}
                    <button
                      onClick={() => handleOpenEdit(idx)}
                      className="px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-blue-400 text-[11px] font-bold transition"
                    >
                      Edit
                    </button>

                    {/* Delete */}
                    <button
                      onClick={() => handleDelete(idx)}
                      className="p-1 rounded-lg bg-slate-800 hover:bg-rose-500/20 text-rose-400 text-xs transition"
                      title="Delete"
                    >
                      🗑️
                    </button>
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* Add / Edit Modal */}
      {modalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-xs" onClick={() => setModalOpen(false)} />
          <div className="relative w-full max-w-lg bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-2xl z-10 space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-slate-800">
              <h3 className="text-sm font-black text-white">
                {editingIndex !== null ? "Edit Condition" : "Add New Condition"}
              </h3>
              <button onClick={() => setModalOpen(false)} className="text-slate-400 hover:text-white text-sm">
                ✕
              </button>
            </div>

            <form onSubmit={handleSaveCondition} className="space-y-4 text-xs">
              <div>
                <label className="text-slate-300 font-bold block mb-1">Condition Name</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Higher Remaining Installments Bonus"
                  value={formData.condition_name}
                  onChange={(e) => setFormData({ ...formData, condition_name: e.target.value })}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-white focus:outline-none focus:border-blue-500"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                <div>
                  <label className="text-slate-300 font-bold block mb-1">IF Field</label>
                  <select
                    value={formData.condition_field}
                    onChange={(e) => setFormData({ ...formData, condition_field: e.target.value })}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-white focus:outline-none focus:border-blue-500"
                  >
                    {CONDITION_FIELDS.map((f) => (
                      <option key={f.value} value={f.value}>
                        {f.label}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="text-slate-300 font-bold block mb-1">Operator</label>
                  <select
                    value={formData.operator}
                    onChange={(e) => setFormData({ ...formData, operator: e.target.value })}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-white focus:outline-none focus:border-blue-500"
                  >
                    {OPERATORS.map((op) => (
                      <option key={op.value} value={op.value}>
                        {op.label}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="text-slate-300 font-bold block mb-1">Value</label>
                  <input
                    type="number"
                    step="any"
                    required
                    value={formData.condition_value}
                    onChange={(e) => setFormData({ ...formData, condition_value: e.target.value })}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-white font-mono focus:outline-none focus:border-blue-500"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                <div>
                  <label className="text-slate-300 font-bold block mb-1">THEN Action Field</label>
                  <select
                    value={formData.action_field}
                    onChange={(e) => setFormData({ ...formData, action_field: e.target.value })}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-white focus:outline-none focus:border-blue-500"
                  >
                    {ACTION_FIELDS.map((a) => (
                      <option key={a.value} value={a.value}>
                        {a.label}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="text-slate-300 font-bold block mb-1">Action Value</label>
                  <input
                    type="number"
                    step="any"
                    required
                    value={formData.action_value}
                    onChange={(e) => setFormData({ ...formData, action_value: e.target.value })}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-white font-mono focus:outline-none focus:border-blue-500"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2.5 pt-1">
                <div>
                  <label className="text-slate-300 font-bold block mb-1">Priority</label>
                  <input
                    type="number"
                    min="1"
                    value={formData.priority}
                    onChange={(e) => setFormData({ ...formData, priority: Number(e.target.value) })}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-white font-mono focus:outline-none focus:border-blue-500"
                  />
                </div>

                <div className="flex items-center gap-2 pt-6">
                  <input
                    type="checkbox"
                    id="condActive"
                    checked={formData.is_active}
                    onChange={(e) => setFormData({ ...formData, is_active: e.target.checked })}
                    className="w-4 h-4 rounded text-blue-600 bg-slate-950 border-slate-700"
                  />
                  <label htmlFor="condActive" className="text-slate-300 font-bold cursor-pointer">
                    Enable Condition
                  </label>
                </div>
              </div>

              <div className="pt-3 flex items-center justify-end gap-2 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setModalOpen(false)}
                  className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl font-bold cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-xl font-bold shadow-md shadow-blue-600/30 cursor-pointer"
                >
                  {editingIndex !== null ? "Save Changes" : "Create Condition"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
