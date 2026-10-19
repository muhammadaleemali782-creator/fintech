import React, { useState, useEffect, useCallback, useMemo } from "react";
import { usePermissions } from "../../hooks/usePermissions";
import { tokenStorage } from "../../utils/tokenStorage";
import { API_BASE_URL } from "../../config";
import { DEFAULT_LOAN_DEPARTMENT_COMMISSION_PERCENT } from "../../constants/loanSettingsDefaults";

export default function CommissionSettingsSection({ showToast }) {
  const { hasPermission, isAdmin } = usePermissions();
  const token = tokenStorage.getToken();

  const canView = isAdmin || hasPermission("LOAN_AGENT_COMMISSION_VIEW") || hasPermission("loan.agent_commission_view");
  const canSet = isAdmin || hasPermission("LOAN_AGENT_COMMISSION_SET") || hasPermission("loan.agent_commission_set");

  const [commissionCategory, setCommissionCategory] = useState("loan"); // 'loan' | 'investment'
  const [loading, setLoading] = useState(false);
  const [agents, setAgents] = useState([]);
  const [deptCommissionPercent, setDeptCommissionPercent] = useState(DEFAULT_LOAN_DEPARTMENT_COMMISSION_PERCENT);
  const [searchQuery, setSearchQuery] = useState("");
  const [editingAgentId, setEditingAgentId] = useState(null);
  const [editRateInput, setEditRateInput] = useState("");
  const [savingAgentId, setSavingAgentId] = useState(null);

  // Example amount for live calculation preview (₹1,00,000)
  const previewAmount = 100000;

  const isInvestment = commissionCategory === "investment";
  const activePoolPercent = 5; // Standard 5% gross pool for both Loan Department and Investment

  const fetchAgentCommissions = useCallback(async () => {
    if (!canView) return;
    setLoading(true);
    try {
      const res = await fetch(`${API_BASE_URL}/loan-department/agent-commission`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || "Failed to load agent commissions");
      setAgents(data.agents || []);
      if (data.loan_department_commission_percent !== undefined) {
        setDeptCommissionPercent(Number(data.loan_department_commission_percent));
      }
    } catch (err) {
      if (showToast) showToast(err.message, true);
    } finally {
      setLoading(false);
    }
  }, [canView, token, showToast]);

  useEffect(() => {
    fetchAgentCommissions();
  }, [fetchAgentCommissions]);

  const handleStartEdit = (agent) => {
    setEditingAgentId(agent.agent_id);
    const currentRate = isInvestment
      ? (agent.investment_commission_percent ?? 2)
      : (agent.agent_commission_percent ?? 2);
    setEditRateInput(String(currentRate));
  };

  const handleCancelEdit = () => {
    setEditingAgentId(null);
    setEditRateInput("");
  };

  const handleSaveCommission = async (agentId) => {
    const rate = Number(editRateInput);
    if (!Number.isFinite(rate) || rate < 0) {
      if (showToast) showToast("Valid positive commission percentage dalein", true);
      return;
    }

    if (rate > activePoolPercent) {
      if (showToast) {
        showToast(
          `Agent commission (${rate}%) total pool (${activePoolPercent}%) se zyada nahi ho sakta!`,
          true
        );
      }
      return;
    }

    setSavingAgentId(agentId);
    try {
      const res = await fetch(`${API_BASE_URL}/loan-department/agent-commission`, {
        method: "PUT",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          agent_id: agentId,
          commission_type: commissionCategory,
          agent_commission_percent: rate
        })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || "Failed to update commission");

      setAgents((prev) =>
        prev.map((a) => {
          if (a.agent_id !== agentId) return a;
          if (isInvestment) {
            return {
              ...a,
              investment_commission_percent: rate,
              investment_department_net_percent: Math.max(0, Number((activePoolPercent - rate).toFixed(2))),
              last_updated: new Date()
            };
          }
          return {
            ...a,
            agent_commission_percent: rate,
            loan_department_net_percent: Math.max(0, Number((activePoolPercent - rate).toFixed(2))),
            last_updated: new Date()
          };
        })
      );

      setEditingAgentId(null);
      if (showToast) showToast(data.message || `${isInvestment ? "Investment" : "Loan"} commission updated successfully!`);
    } catch (err) {
      if (showToast) showToast(err.message, true);
    } finally {
      setSavingAgentId(null);
    }
  };

  // Filtered agents
  const filteredAgents = useMemo(() => {
    if (!searchQuery.trim()) return agents;
    const q = searchQuery.toLowerCase();
    return agents.filter(
      (a) =>
        (a.agent_name || "").toLowerCase().includes(q) ||
        (a.referral_code || "").toLowerCase().includes(q) ||
        (a.agent_phone || "").toLowerCase().includes(q)
    );
  }, [agents, searchQuery]);

  if (!canView) {
    return (
      <div className="p-8 text-center bg-zinc-900 border border-zinc-800 rounded-2xl space-y-3">
        <span className="text-3xl">🔒</span>
        <h3 className="text-sm font-bold text-zinc-200">Access Restricted</h3>
        <p className="text-xs text-zinc-400 max-w-md mx-auto">
          Agent commission dekhne ke liye <code className="text-amber-400">LOAN_AGENT_COMMISSION_VIEW</code> permission zaroori hai.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6 pb-16">
      {/* Commission Category Selector (Loan vs Investment) */}
      <div className="flex flex-wrap items-center gap-2.5 p-1.5 bg-zinc-900 border border-zinc-800 rounded-2xl w-fit">
        <button
          type="button"
          onClick={() => {
            setCommissionCategory("loan");
            setEditingAgentId(null);
          }}
          className={`px-4 py-2 rounded-xl text-xs font-bold transition flex items-center gap-2 cursor-pointer active:scale-95 ${
            commissionCategory === "loan"
              ? "bg-zinc-100 text-zinc-950 font-black shadow-sm"
              : "text-zinc-400 hover:text-white hover:bg-zinc-800/60"
          }`}
        >
          <span className="text-base">💼</span>
          <span>Loan Commission</span>
        </button>

        <button
          type="button"
          onClick={() => {
            setCommissionCategory("investment");
            setEditingAgentId(null);
          }}
          className={`px-4 py-2 rounded-xl text-xs font-bold transition flex items-center gap-2 cursor-pointer active:scale-95 ${
            commissionCategory === "investment"
              ? "bg-zinc-100 text-zinc-950 font-black shadow-sm"
              : "text-zinc-400 hover:text-white hover:bg-zinc-800/60"
          }`}
        >
          <span className="text-base">📈</span>
          <span>Investment Commission</span>
        </button>
      </div>

      {/* Overview Banner - Clean Neutral Zinc */}
      <div className="p-5 rounded-2xl border border-zinc-800 bg-zinc-900 space-y-3 shadow-lg">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <div className="flex items-center gap-2">
              <span className="text-xl">{isInvestment ? "📈" : "💼"}</span>
              <h3 className="text-sm font-black text-white uppercase tracking-wider">
                {isInvestment
                  ? "Investment & Lending Agent Commission Control"
                  : "Loan Department Agent Commission Control"}
              </h3>
            </div>
            <p className="text-xs text-zinc-400 mt-1">
              {isInvestment
                ? `Customer ke investment / lending deposit par total gross pool ${activePoolPercent}% hai. Yahan se aap har agent ka investment referral commission set kar sakte hain.`
                : `Loan Department ko har disbursed loan par total ${activePoolPercent}% commission milta hai. Department is me se apne registered agents ko commission distribute karta hai.`}
            </p>
          </div>
          <div className="flex items-center gap-3 shrink-0">
            <div className="px-3.5 py-2 rounded-xl bg-zinc-950 border border-zinc-800 text-center">
              <span className="text-[10px] text-zinc-400 block font-bold uppercase">
                {isInvestment ? "Gross Pool" : "Dept Total Pool"}
              </span>
              <span className="text-lg font-black font-mono text-zinc-100">
                {activePoolPercent}%
              </span>
            </div>
          </div>
        </div>

        {/* Info formula card */}
        <div className="p-3 bg-zinc-950 rounded-xl border border-zinc-800 text-[11px] text-zinc-300 flex flex-wrap items-center justify-between gap-2">
          <span className="flex items-center gap-1.5">
            <span className="text-zinc-400">ℹ️</span>
            <span>
              Formula: <strong>{isInvestment ? "Net Platform/Dept Share" : "Loan Dept Net Share"}</strong> ={" "}
              {activePoolPercent}% - Agent Commission %
            </span>
          </span>
          <span className="text-emerald-400 font-semibold text-[10px]">
            ✓ Agent share cannot exceed {activePoolPercent}%
          </span>
        </div>
      </div>

      {/* Agents Table Header & Search */}
      <div className="space-y-3">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <h4 className="text-xs font-black uppercase text-zinc-300 tracking-wider">
              {isInvestment ? "Investment Agents" : "Registered Loan Agents"} ({filteredAgents.length})
            </h4>
            {loading && <span className="w-3.5 h-3.5 border-2 border-zinc-400 border-t-transparent rounded-full animate-spin" />}
          </div>

          <div className="relative w-full sm:w-64">
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search agent name, code, phone..."
              className="w-full bg-zinc-900 border border-zinc-800 rounded-xl px-3 py-1.5 text-xs text-zinc-200 placeholder-zinc-500 focus:outline-none focus:border-zinc-500"
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery("")}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-zinc-500 hover:text-zinc-300 text-xs"
              >
                ✕
              </button>
            )}
          </div>
        </div>

        {/* Table */}
        <div className="bg-zinc-900 border border-zinc-800 rounded-2xl overflow-hidden shadow-xl">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs text-zinc-300">
              <thead className="bg-zinc-950 text-[10px] uppercase font-bold text-zinc-400 border-b border-zinc-800">
                <tr>
                  <th className="px-4 py-3">Agent Name & Code</th>
                  <th className="px-4 py-3">Phone</th>
                  <th className="px-4 py-3 text-center">
                    {isInvestment ? "Agent Investment Rate" : "Agent Loan Commission"}
                  </th>
                  <th className="px-4 py-3 text-center">
                    {isInvestment ? "Platform Net Share" : "Dept Net Share"}
                  </th>
                  <th className="px-4 py-3">Last Updated</th>
                  <th className="px-4 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-800/60">
                {filteredAgents.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="px-4 py-8 text-center text-zinc-500 text-xs">
                      {loading ? "Loading agents..." : "Koi agent nahi mila"}
                    </td>
                  </tr>
                ) : (
                  filteredAgents.map((agent) => {
                    const isEditing = editingAgentId === agent.agent_id;
                    const parsedInput = Number(editRateInput);

                    const baseRate = isInvestment
                      ? (agent.investment_commission_percent ?? 2)
                      : (agent.agent_commission_percent ?? 2);

                    const effectiveRate = isEditing
                      ? (Number.isFinite(parsedInput) ? parsedInput : 0)
                      : baseRate;

                    const agentAmount = (previewAmount * effectiveRate) / 100;
                    const totalPoolAmount = (previewAmount * activePoolPercent) / 100;
                    const netShareAmount = Math.max(0, totalPoolAmount - agentAmount);

                    const currentNetRate = isInvestment
                      ? (isEditing
                          ? Math.max(0, Number((activePoolPercent - effectiveRate).toFixed(2)))
                          : (agent.investment_department_net_percent ?? Math.max(0, Number((activePoolPercent - baseRate).toFixed(2)))))
                      : (isEditing
                          ? Math.max(0, Number((activePoolPercent - effectiveRate).toFixed(2)))
                          : (agent.loan_department_net_percent ?? Math.max(0, Number((activePoolPercent - baseRate).toFixed(2)))));

                    return (
                      <React.Fragment key={agent.agent_id}>
                        <tr className="hover:bg-zinc-800/30 transition">
                          <td className="px-4 py-3.5">
                            <div className="font-bold text-white flex items-center gap-1.5">
                              <span>👤</span>
                              <span>{agent.agent_name || "Agent"}</span>
                            </div>
                            <span className="text-[10px] font-mono text-zinc-400 font-semibold block mt-0.5">
                              Code: {agent.referral_code}
                            </span>
                          </td>
                          <td className="px-4 py-3.5 font-mono text-[11px] text-zinc-300">
                            {agent.agent_phone || "—"}
                          </td>
                          <td className="px-4 py-3.5 text-center">
                            {isEditing ? (
                              <div className="inline-flex items-center gap-1">
                                <input
                                  type="number"
                                  min="0"
                                  max={activePoolPercent}
                                  step="0.1"
                                  value={editRateInput}
                                  onChange={(e) => setEditRateInput(e.target.value)}
                                  className="w-16 bg-zinc-950 border border-zinc-600 rounded-lg px-2 py-1 text-center font-mono font-bold text-white text-xs focus:outline-none focus:border-zinc-400"
                                />
                                <span className="font-bold text-zinc-400">%</span>
                              </div>
                            ) : (
                              <span
                                className={`inline-block px-2.5 py-1 rounded-full font-bold font-mono ${
                                  isInvestment
                                    ? "bg-zinc-800 text-emerald-400 border border-zinc-700"
                                    : "bg-zinc-800 text-zinc-200 border border-zinc-700"
                                }`}
                              >
                                {baseRate}%
                              </span>
                            )}
                          </td>
                          <td className="px-4 py-3.5 text-center">
                            <span className="inline-block px-2.5 py-1 rounded-full bg-zinc-950 text-zinc-300 border border-zinc-800 font-bold font-mono">
                              {currentNetRate}%
                            </span>
                          </td>
                          <td className="px-4 py-3.5 text-[11px] text-zinc-400">
                            {agent.last_updated
                              ? new Date(agent.last_updated).toLocaleDateString("en-IN", {
                                  day: "2-digit",
                                  month: "short",
                                  year: "numeric"
                                })
                              : "—"}
                          </td>
                          <td className="px-4 py-3.5 text-right">
                            {isEditing ? (
                              <div className="flex items-center justify-end gap-1.5">
                                <button
                                  onClick={() => handleSaveCommission(agent.agent_id)}
                                  disabled={savingAgentId === agent.agent_id}
                                  className="px-2.5 py-1 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg text-xs font-bold transition active:scale-95 cursor-pointer"
                                >
                                  {savingAgentId === agent.agent_id ? "Saving..." : "Save"}
                                </button>
                                <button
                                  onClick={handleCancelEdit}
                                  className="px-2 py-1 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 rounded-lg text-xs transition cursor-pointer"
                                >
                                  ✕
                                </button>
                              </div>
                            ) : (
                              canSet && (
                                <button
                                  onClick={() => handleStartEdit(agent)}
                                  className="px-3 py-1 bg-zinc-800 hover:bg-zinc-700 text-zinc-200 hover:text-white border border-zinc-700 rounded-lg text-xs font-bold transition active:scale-95 cursor-pointer"
                                >
                                  Edit Rate
                                </button>
                              )
                            )}
                          </td>
                        </tr>

                        {/* Inline Live Calculation Preview when editing */}
                        {isEditing && (
                          <tr className="bg-zinc-950/90 border-b border-zinc-800">
                            <td colSpan={6} className="px-4 py-2.5">
                              <div className="flex flex-wrap items-center justify-between gap-2 text-[11px]">
                                <div className="text-zinc-300 flex items-center gap-1.5">
                                  <span className="text-amber-400">💡</span>
                                  <span>
                                    {isInvestment ? "Investment" : "Loan"} amount <strong>₹{previewAmount.toLocaleString("en-IN")}</strong> par:
                                    {" "}total pool <strong>₹{totalPoolAmount.toLocaleString("en-IN")}</strong>,
                                    agent ko <strong className="text-white">₹{agentAmount.toLocaleString("en-IN")}</strong>,
                                    net share <strong className="text-emerald-400">₹{netShareAmount.toLocaleString("en-IN")}</strong>
                                  </span>
                                </div>
                                {effectiveRate > activePoolPercent && (
                                  <span className="text-rose-400 font-bold">
                                    ⚠️ Rate cannot exceed {activePoolPercent}%
                                  </span>
                                )}
                              </div>
                            </td>
                          </tr>
                        )}
                      </React.Fragment>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}
