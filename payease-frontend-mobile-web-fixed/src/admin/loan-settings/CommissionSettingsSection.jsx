import React, { useState, useEffect, useCallback, useMemo } from "react";
import { usePermissions } from "../../hooks/usePermissions";
import { tokenStorage } from "../../utils/tokenStorage";
import { API_BASE_URL } from "../../config";
import { DEFAULT_LOAN_DEPARTMENT_COMMISSION_PERCENT } from "../../constants/loanSettingsDefaults";

export default function CommissionSettingsSection({ showToast }) {
  const { hasPermission, isAdmin } = usePermissions();
  const getAuthToken = () => tokenStorage.getToken() || localStorage.getItem("token") || "";

  const canView = isAdmin || hasPermission("LOAN_AGENT_COMMISSION_VIEW") || hasPermission("loan.agent_commission_view");
  const canSet = isAdmin || hasPermission("LOAN_AGENT_COMMISSION_SET") || hasPermission("loan.agent_commission_set");

  // Category: 'loan' | 'investment' | 'requests'
  const [commissionCategory, setCommissionCategory] = useState("loan");
  const [loading, setLoading] = useState(false);
  const [agents, setAgents] = useState([]);
  const [searchQuery, setSearchQuery] = useState("");

  // Department Pool % (Loan and Investment)
  const [loanPoolPercent, setLoanPoolPercent] = useState(DEFAULT_LOAN_DEPARTMENT_COMMISSION_PERCENT);
  const [investmentPoolPercent, setInvestmentPoolPercent] = useState(DEFAULT_LOAN_DEPARTMENT_COMMISSION_PERCENT);
  const [isEditingPool, setIsEditingPool] = useState(false);
  const [poolInput, setPoolInput] = useState("");
  const [savingPool, setSavingPool] = useState(false);

  // Rate Change Request Modal (for staff or tracked requests)
  const [requestModal, setRequestModal] = useState({
    isOpen: false,
    agent: null,
    rate: "",
    reason: "",
    submitting: false
  });

  // Direct editing for Admin
  const [adminEditingAgentId, setAdminEditingAgentId] = useState(null);
  const [adminEditRateInput, setAdminEditRateInput] = useState("");
  const [adminSavingAgentId, setAdminSavingAgentId] = useState(null);

  // Commission Requests (for Admin review)
  const [requests, setRequests] = useState([]);
  const [loadingRequests, setLoadingRequests] = useState(false);
  const [processingRequestId, setProcessingRequestId] = useState(null);
  const [pendingCount, setPendingCount] = useState(0);

  // 5k Deposit Referral Commission & Offers State (30-Day Holding & Flat One-Time Reward)
  const [depositReferral, setDepositReferral] = useState({
    enabled: true,
    minDepositAmount: 5000,
    holdingDays: 30,
    flatRewardAmount: 100,
    description: "Agent Flat Reward on ₹5,000 maintained for 30 Days (One-Time Payout)"
  });
  const [loadingDepositRef, setLoadingDepositRef] = useState(false);
  const [savingDepositRef, setSavingDepositRef] = useState(false);

  const [offerForm, setOfferForm] = useState({
    title: "Special ₹5,000 Deposit Bonus Offer 🎁",
    message: "Apne referral se ₹5,000 deposit karwayein aur 30 din maintain karne par payein flat ₹100 instant cash reward!",
    minDeposit: 5000,
    bonusAmount: 100,
    targetAudience: "all"
  });
  const [sendingOffer, setSendingOffer] = useState(false);
  const [latestOffer, setLatestOffer] = useState(null);

  const previewAmount = 100000;
  const isInvestment = commissionCategory === "investment";
  const activePoolPercent = isInvestment ? investmentPoolPercent : loanPoolPercent;

  // 1. Fetch Agent Commissions & Pools
  const fetchAgentCommissions = useCallback(async () => {
    if (!canView) return;
    setLoading(true);
    try {
      const activeToken = getAuthToken();
      const res = await fetch(`${API_BASE_URL}/loan-department/agent-commission`, {
        headers: { Authorization: `Bearer ${activeToken}` }
      });
      const data = await res.json();
      if (!res.ok) {
        if (res.status === 401) {
          throw new Error("Session expired. Please re-login to Admin.");
        }
        throw new Error(data.message || "Failed to load agent commissions");
      }

      setAgents(data.agents || []);
      if (data.loan_department_commission_percent !== undefined) {
        setLoanPoolPercent(Number(data.loan_department_commission_percent));
      }
      if (data.investment_department_commission_percent !== undefined) {
        setInvestmentPoolPercent(Number(data.investment_department_commission_percent));
      }
      if (data.pending_requests_count !== undefined) {
        setPendingCount(data.pending_requests_count);
      }
    } catch (err) {
      if (showToast) showToast(err.message, true);
    } finally {
      setLoading(false);
    }
  }, [canView, showToast]);

  // 2. Fetch Pending Commission Requests
  const fetchCommissionRequests = useCallback(async () => {
    if (!canView) return;
    setLoadingRequests(true);
    try {
      const activeToken = getAuthToken();
      const res = await fetch(`${API_BASE_URL}/loan-department/agent-commission/requests?status=pending`, {
        headers: { Authorization: `Bearer ${activeToken}` }
      });
      const data = await res.json();
      if (!res.ok) {
        if (res.status === 401) {
          throw new Error("Session expired. Please re-login to Admin.");
        }
        throw new Error(data.message || "Failed to load requests");
      }
      setRequests(data.requests || []);
      setPendingCount((data.requests || []).length);
    } catch (err) {
      if (showToast) showToast(err.message, true);
    } finally {
      setLoadingRequests(false);
    }
  }, [canView, showToast]);

  // 2b. Fetch Deposit Referral Settings & Latest Offer
  const fetchDepositReferral = useCallback(async () => {
    if (!canView) return;
    setLoadingDepositRef(true);
    try {
      const activeToken = getAuthToken();
      const [res, offerRes] = await Promise.all([
        fetch(`${API_BASE_URL}/loan-department/deposit-referral`, {
          headers: { Authorization: `Bearer ${activeToken}` }
        }),
        fetch(`${API_BASE_URL}/loan-department/broadcast-offers`, {
          headers: { Authorization: `Bearer ${activeToken}` }
        })
      ]);
      if (res.ok) {
        const data = await res.json();
        if (data.settings) setDepositReferral(data.settings);
      }
      if (offerRes.ok) {
        const oData = await offerRes.json();
        if (oData.offer) setLatestOffer(oData.offer);
      }
    } catch (_) {}
    finally {
      setLoadingDepositRef(false);
    }
  }, [canView]);

  useEffect(() => {
    fetchAgentCommissions();
    fetchCommissionRequests();
    fetchDepositReferral();
  }, [fetchAgentCommissions, fetchCommissionRequests, fetchDepositReferral]);

  // Handle Save 5K Deposit Referral Settings
  const handleSaveDepositReferral = async (e) => {
    if (e) e.preventDefault();
    setSavingDepositRef(true);
    try {
      const activeToken = getAuthToken();
      const res = await fetch(`${API_BASE_URL}/loan-department/deposit-referral`, {
        method: "PUT",
        headers: {
          Authorization: `Bearer ${activeToken}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify(depositReferral)
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || "Failed to update deposit referral settings");
      if (showToast) showToast("₹5,000 Deposit Referral Commission settings successfully saved!", false);
      if (data.settings) setDepositReferral(data.settings);
    } catch (err) {
      if (showToast) showToast(err.message, true);
    } finally {
      setSavingDepositRef(false);
    }
  };

  // Handle Send Offer / Broadcast to Agents
  const handleSendAgentOffer = async (e) => {
    if (e) e.preventDefault();
    if (!offerForm.message || !offerForm.message.trim()) {
      if (showToast) showToast("Offer message likhein!", true);
      return;
    }
    setSendingOffer(true);
    try {
      const activeToken = getAuthToken();
      const res = await fetch(`${API_BASE_URL}/loan-department/broadcast-offers`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${activeToken}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify(offerForm)
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || "Failed to send offer");
      if (showToast) showToast(data.message || "Offer sabhi agents ko bhej diya gaya!", false);
      setLatestOffer({
        title: offerForm.title,
        message: offerForm.message,
        minDeposit: offerForm.minDeposit,
        bonusAmount: offerForm.bonusAmount,
        sentToCount: data.sentCount || agents.length,
        sentAt: new Date(),
        sentBy: "Admin"
      });
    } catch (err) {
      if (showToast) showToast(err.message, true);
    } finally {
      setSendingOffer(false);
    }
  };

  // 3. Save Department Pool (Admin only)
  const handleSavePool = async () => {
    const val = Number(poolInput);
    if (!Number.isFinite(val) || val < 0 || val > 100) {
      if (showToast) showToast("Valid percentage (0 - 100%) dalein", true);
      return;
    }

    setSavingPool(true);
    try {
      const payload = {
        loan_department_commission_percent: isInvestment ? loanPoolPercent : val,
        investment_department_commission_percent: isInvestment ? val : investmentPoolPercent
      };

      const res = await fetch(`${API_BASE_URL}/loan-department/department-pools`, {
        method: "PUT",
        headers: {
          Authorization: `Bearer ${getAuthToken()}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify(payload)
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || "Failed to update department pool");

      if (isInvestment) {
        setInvestmentPoolPercent(val);
      } else {
        setLoanPoolPercent(val);
      }

      setIsEditingPool(false);
      if (showToast) showToast(`${isInvestment ? "Investment" : "Loan"} Department Pool updated to ${val}%!`);
      fetchAgentCommissions();
    } catch (err) {
      if (showToast) showToast(err.message, true);
    } finally {
      setSavingPool(false);
    }
  };

  // 4. Submit Rate Change Request (Staff flow)
  const handleSubmitRateRequest = async (e) => {
    e.preventDefault();
    const rate = Number(requestModal.rate);
    const reason = requestModal.reason.trim();

    if (!Number.isFinite(rate) || rate < 0) {
      if (showToast) showToast("Valid positive percentage dalein", true);
      return;
    }

    if (rate > activePoolPercent) {
      if (showToast) showToast(`Rate (${rate}%) total pool (${activePoolPercent}%) se zyada nahi ho sakta!`, true);
      return;
    }

    if (!reason && !isAdmin) {
      if (showToast) showToast("Kripya commission change karne ka proper reason/explanation likhein", true);
      return;
    }

    setRequestModal((prev) => ({ ...prev, submitting: true }));
    try {
      const res = await fetch(`${API_BASE_URL}/loan-department/agent-commission/request`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${getAuthToken()}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          agent_id: requestModal.agent.agent_id,
          commission_type: commissionCategory,
          requested_percent: rate,
          reason: reason || "Updated by Admin",
          direct_apply: isAdmin
        })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || "Failed to submit request");

      setRequestModal({ isOpen: false, agent: null, rate: "", reason: "", submitting: false });
      if (showToast) showToast(data.message);
      fetchAgentCommissions();
      fetchCommissionRequests();
    } catch (err) {
      if (showToast) showToast(err.message, true);
      setRequestModal((prev) => ({ ...prev, submitting: false }));
    }
  };

  // 5. Admin Direct Inline Save
  const handleAdminDirectSave = async (agentId) => {
    const rate = Number(adminEditRateInput);
    if (!Number.isFinite(rate) || rate < 0 || rate > activePoolPercent) {
      if (showToast) showToast(`Valid rate (0 - ${activePoolPercent}%) enter karein`, true);
      return;
    }

    setAdminSavingAgentId(agentId);
    try {
      const res = await fetch(`${API_BASE_URL}/loan-department/agent-commission/request`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${getAuthToken()}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          agent_id: agentId,
          commission_type: commissionCategory,
          requested_percent: rate,
          direct_apply: true
        })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || "Failed to update commission");

      setAdminEditingAgentId(null);
      if (showToast) showToast(data.message || "Commission updated directly!");
      fetchAgentCommissions();
    } catch (err) {
      if (showToast) showToast(err.message, true);
    } finally {
      setAdminSavingAgentId(null);
    }
  };

  // 6. Admin Approve Request
  const handleApproveRequest = async (requestId) => {
    setProcessingRequestId(requestId);
    try {
      const res = await fetch(`${API_BASE_URL}/loan-department/agent-commission/requests/${requestId}/approve`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${getAuthToken()}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({ remarks: "Approved by Admin" })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || "Failed to approve request");

      if (showToast) showToast(data.message || "Request approved!");
      fetchCommissionRequests();
      fetchAgentCommissions();
    } catch (err) {
      if (showToast) showToast(err.message, true);
    } finally {
      setProcessingRequestId(null);
    }
  };

  // 7. Admin Reject Request
  const handleRejectRequest = async (requestId) => {
    const remarks = window.prompt("Rejection reason / remarks likhein (optional):") || "Rejected by Admin";
    setProcessingRequestId(requestId);
    try {
      const res = await fetch(`${API_BASE_URL}/loan-department/agent-commission/requests/${requestId}/reject`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${getAuthToken()}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({ remarks })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || "Failed to reject request");

      if (showToast) showToast("Commission change request rejected");
      fetchCommissionRequests();
      fetchAgentCommissions();
    } catch (err) {
      if (showToast) showToast(err.message, true);
    } finally {
      setProcessingRequestId(null);
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
      <div className="p-8 text-center bg-white border border-slate-200 rounded-2xl space-y-3">
        <span className="text-3xl">🔒</span>
        <h3 className="text-sm font-bold text-slate-800">Access Restricted</h3>
        <p className="text-xs text-slate-500 max-w-md mx-auto">
          Agent commission dekhne ke liye <code className="text-amber-400">LOAN_AGENT_COMMISSION_VIEW</code> permission zaroori hai.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6 pb-16">
      {/* Commission Category & Requests Tab Selector */}
      <div className="flex flex-wrap items-center gap-2.5 p-1.5 bg-white border border-slate-200 rounded-2xl w-fit">
        <button
          type="button"
          onClick={() => {
            setCommissionCategory("loan");
            setAdminEditingAgentId(null);
          }}
          className={`px-4 py-2 rounded-xl text-xs font-bold transition flex items-center gap-2 cursor-pointer active:scale-95 ${
            commissionCategory === "loan"
              ? "bg-blue-600 text-white font-black shadow-sm"
              : "text-slate-500 hover:text-white hover:bg-slate-100"
          }`}
        >
          <span className="text-base">💼</span>
          <span>Loan Commission</span>
        </button>

        <button
          type="button"
          onClick={() => {
            setCommissionCategory("investment");
            setAdminEditingAgentId(null);
          }}
          className={`px-4 py-2 rounded-xl text-xs font-bold transition flex items-center gap-2 cursor-pointer active:scale-95 ${
            commissionCategory === "investment"
              ? "bg-blue-600 text-white font-black shadow-sm"
              : "text-slate-500 hover:text-white hover:bg-slate-100"
          }`}
        >
          <span className="text-base">📈</span>
          <span>Investment Commission</span>
        </button>

        <button
          type="button"
          onClick={() => {
            setCommissionCategory("deposit_offers");
            setAdminEditingAgentId(null);
          }}
          className={`px-4 py-2 rounded-xl text-xs font-bold transition flex items-center gap-2 cursor-pointer active:scale-95 ${
            commissionCategory === "deposit_offers"
              ? "bg-emerald-400 text-zinc-950 font-black shadow-sm"
              : "text-slate-500 hover:text-white hover:bg-slate-100"
          }`}
        >
          <span className="text-base">🎁</span>
          <span>5k Deposit Commission & Offers</span>
        </button>

        <button
          type="button"
          onClick={() => {
            setCommissionCategory("requests");
            setAdminEditingAgentId(null);
          }}
          className={`px-4 py-2 rounded-xl text-xs font-bold transition flex items-center gap-2 cursor-pointer active:scale-95 ${
            commissionCategory === "requests"
              ? "bg-amber-400 text-zinc-950 font-black shadow-sm"
              : "text-slate-500 hover:text-white hover:bg-slate-100"
          }`}
        >
          <span className="text-base">⏳</span>
          <span>Rate Change Requests</span>
          {pendingCount > 0 && (
            <span className="px-2 py-0.5 rounded-full bg-rose-600 text-white text-[10px] font-black animate-pulse">
              {pendingCount}
            </span>
          )}
        </button>
      </div>

      {/* VIEW: 5K Deposit Commission & Agent Offers */}
      {commissionCategory === "deposit_offers" ? (
        <div className="space-y-6">
          {/* Header Banner */}
          <div className="p-5 rounded-2xl border border-slate-200 bg-white space-y-2 shadow-lg">
            <div className="flex items-center gap-2">
              <span className="text-xl">🎁</span>
              <h3 className="text-sm font-black text-slate-900 uppercase tracking-wider">
                Agent ₹5,000 Deposit Reference Commission & Offers Hub
              </h3>
            </div>
            <p className="text-xs text-slate-500 leading-relaxed">
              Jab kisi agent ke reference se koi customer ₹5,000 ya usse zyada deposit karta hai, to agent ko milne wale reward / commission ko yahan se control karein aur sabhi agents ko direct promotional offers bhein.
            </p>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Card 1: 5k Deposit Referral Commission Controller (30-Day Holding & Flat One-Time Payout) */}
            <form onSubmit={handleSaveDepositReferral} className="p-5 bg-white border border-slate-200 rounded-2xl shadow-xl space-y-4">
              <div className="flex items-center justify-between border-b border-slate-200 pb-3">
                <div className="flex items-center gap-2">
                  <span className="text-lg">⏳</span>
                  <div>
                    <h4 className="text-xs font-black uppercase text-slate-800 tracking-wider">
                      30-Day ₹5,000 Deposit Referral Rule
                    </h4>
                    <span className="text-[10px] text-emerald-400 font-bold block">One-Time Flat Cash Reward (No Percentage)</span>
                  </div>
                </div>
                <label className="flex items-center gap-2 cursor-pointer">
                  <span className="text-xs text-slate-500 font-bold">
                    {depositReferral.enabled ? "Active" : "Disabled"}
                  </span>
                  <input
                    type="checkbox"
                    checked={depositReferral.enabled}
                    onChange={(e) => setDepositReferral(prev => ({ ...prev, enabled: e.target.checked }))}
                    className="w-4 h-4 accent-emerald-500 rounded cursor-pointer"
                  />
                </label>
              </div>

              <div className="space-y-3 text-xs">
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-slate-500 font-bold block mb-1">
                      Min Deposit Target (₹):
                    </label>
                    <input
                      type="number"
                      min="100"
                      step="500"
                      value={depositReferral.minDepositAmount || 5000}
                      onChange={(e) => setDepositReferral(prev => ({ ...prev, minDepositAmount: Number(e.target.value) }))}
                      className="w-full bg-white border border-slate-200 rounded-xl px-3 py-2 text-slate-900 bg-white font-mono font-bold text-sm focus:outline-none focus:border-emerald-400"
                      placeholder="5000"
                    />
                  </div>
                  <div>
                    <label className="text-slate-500 font-bold block mb-1">
                      Holding Requirement (Days):
                    </label>
                    <input
                      type="number"
                      min="1"
                      step="1"
                      value={depositReferral.holdingDays || 30}
                      onChange={(e) => setDepositReferral(prev => ({ ...prev, holdingDays: Number(e.target.value) }))}
                      className="w-full bg-white border border-slate-200 rounded-xl px-3 py-2 text-slate-900 bg-white font-mono font-bold text-sm focus:outline-none focus:border-emerald-400"
                      placeholder="30"
                    />
                  </div>
                </div>

                <div>
                  <label className="text-slate-500 font-bold block mb-1">
                    Agent Flat Cash Reward Amount (₹) <span className="text-emerald-400">(Admin Set Any Amount)</span>:
                  </label>
                  <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 font-black text-emerald-400 text-sm">₹</span>
                    <input
                      type="number"
                      min="0"
                      step="10"
                      value={depositReferral.flatRewardAmount || 100}
                      onChange={(e) => setDepositReferral(prev => ({ ...prev, flatRewardAmount: Number(e.target.value) }))}
                      className="w-full bg-white border border-slate-200 rounded-xl pl-8 pr-3 py-2 text-white font-mono font-black text-sm focus:outline-none focus:border-emerald-400"
                      placeholder="100"
                    />
                  </div>
                  <p className="text-[10px] text-slate-400 mt-1">
                    Admin jitna chahe utna flat amount likhe (e.g. ₹100, ₹250, ₹500). Koi percentage calculation nahi hai.
                  </p>
                </div>

                {/* 3 Strict Rules Highlight Card */}
                <div className="p-3 bg-white/80 rounded-xl border border-slate-200 space-y-2 text-[11px]">
                  <div className="flex items-start gap-2 text-slate-700">
                    <span className="text-amber-400 font-black">1.</span>
                    <span><strong>30 Din Balance Maintenance:</strong> Customer ko kam se kam ₹{(Number(depositReferral.minDepositAmount) || 5000).toLocaleString("en-IN")} balance 30 days tak maintain rakhna hoga tabhi agent ko commission credit hoga.</span>
                  </div>
                  <div className="flex items-start gap-2 text-slate-700">
                    <span className="text-emerald-400 font-black">2.</span>
                    <span><strong>Post-30 Days Safe:</strong> 30 din poore hone ke baad user ka balance kam bhi ho jaye to bhi koi issue nahi (commission revoke nahi hoga).</span>
                  </div>
                  <div className="flex items-start gap-2 text-slate-700">
                    <span className="text-blue-400 font-black">3.</span>
                    <span><strong>One-Time Only:</strong> Referral commission strictly 1 baar hi milega. Customer baar-baar 5k dale to baar-baar nahi milega.</span>
                  </div>
                </div>

                <div>
                  <label className="text-slate-500 font-bold block mb-1">Description / Memo:</label>
                  <input
                    type="text"
                    value={depositReferral.description || ""}
                    onChange={(e) => setDepositReferral(prev => ({ ...prev, description: e.target.value }))}
                    className="w-full bg-white border border-slate-200 rounded-xl px-3 py-2 text-slate-700 text-xs focus:outline-none focus:border-emerald-400"
                    placeholder="Agent Flat Reward on ₹5,000 maintained for 30 Days (One-Time Payout)"
                  />
                </div>
              </div>

              <div className="pt-2 border-t border-slate-200 flex items-center justify-between">
                <span className="text-[11px] text-slate-400">
                  {loadingDepositRef ? "Loading settings..." : "Direct system update"}
                </span>
                <button
                  type="submit"
                  disabled={savingDepositRef}
                  className="px-5 py-2 bg-emerald-600 hover:bg-emerald-500 text-white font-black rounded-xl text-xs cursor-pointer transition active:scale-95 shadow-md disabled:opacity-50 flex items-center gap-1.5"
                > 
                  {savingDepositRef ? "Saving..." : "✓ Save 30-Day Holding Settings"}
                </button>
              </div>
            </form>

            {/* Card 2: Send Offers & Broadcast Messenger to Users & Agents */}
            <form onSubmit={handleSendAgentOffer} className="p-5 bg-white border border-slate-200 rounded-2xl shadow-xl space-y-4">
              <div className="flex items-center justify-between border-b border-slate-200 pb-3">
                <div className="flex items-center gap-2">
                  <span className="text-lg">📢</span>
                  <div>
                    <h4 className="text-xs font-black uppercase text-slate-800 tracking-wider">
                      Broadcast Promotional Offers
                    </h4>
                    <span className="text-[10px] text-blue-400 font-bold block">Send Instant Notifications to Users & Agents</span>
                  </div>
                </div>
                <span className="px-2 py-0.5 rounded-full bg-blue-500/10 text-blue-300 border border-blue-500/20 text-[10px] font-bold">
                  {agents.length} Registered Agents
                </span>
              </div>

              <div className="space-y-3 text-xs">
                <div>
                  <label className="text-slate-500 font-bold block mb-1">
                    Target Audience:
                  </label>
                  <select
                    value={offerForm.targetAudience || "all"}
                    onChange={(e) => setOfferForm(prev => ({ ...prev, targetAudience: e.target.value }))}
                    className="w-full bg-white border border-slate-200 rounded-xl px-3 py-2 text-slate-900 bg-white text-xs font-bold focus:outline-none focus:border-blue-400"
                  >
                    <option value="all">🌐 Sabhi Users & Agents Ko Bhejo (Broadcast All)</option>
                    <option value="agents">🤝 Sirf Agents Ko Bhejo</option>
                    <option value="users">👤 Sirf Customers / Users Ko Bhejo</option>
                  </select>
                </div>

                <div>
                  <label className="text-slate-500 font-bold block mb-1">
                    Offer Title / Headline:
                  </label>
                  <input
                    type="text"
                    required
                    value={offerForm.title}
                    onChange={(e) => setOfferForm(prev => ({ ...prev, title: e.target.value }))}
                    className="w-full bg-white border border-slate-200 rounded-xl px-3 py-2 text-slate-900 bg-white text-xs font-bold focus:outline-none focus:border-blue-400"
                    placeholder="Special ₹5,000 Deposit Bonus Offer 🎁"
                  />
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-slate-500 font-bold block mb-1">
                      Min Deposit Target (₹):
                    </label>
                    <input
                      type="number"
                      min="500"
                      step="500"
                      value={offerForm.minDeposit}
                      onChange={(e) => setOfferForm(prev => ({ ...prev, minDeposit: Number(e.target.value) }))}
                      className="w-full bg-white border border-slate-200 rounded-xl px-3 py-2 text-slate-900 bg-white font-mono text-xs focus:outline-none focus:border-blue-400"
                    />
                  </div>
                  <div>
                    <label className="text-slate-500 font-bold block mb-1">
                      Extra Bonus / Reward (₹):
                    </label>
                    <input
                      type="number"
                      min="0"
                      step="50"
                      value={offerForm.bonusAmount}
                      onChange={(e) => setOfferForm(prev => ({ ...prev, bonusAmount: Number(e.target.value) }))}
                      className="w-full bg-white border border-slate-200 rounded-xl px-3 py-2 text-slate-900 bg-white font-mono text-xs focus:outline-none focus:border-blue-400"
                    />
                  </div>
                </div>

                <div>
                  <label className="text-slate-500 font-bold block mb-1">
                    Offer Message / Details <span className="text-rose-400">*</span>:
                  </label>
                  <textarea
                    rows={3}
                    required
                    value={offerForm.message}
                    onChange={(e) => setOfferForm(prev => ({ ...prev, message: e.target.value }))}
                    placeholder="Apne referral se ₹5,000 deposit karwayein aur 30 din maintain karne par flat ₹100 instant bonus cash reward payein!"
                    className="w-full bg-white border border-slate-200 rounded-xl p-3 text-slate-800 placeholder-zinc-500 text-xs focus:outline-none focus:border-blue-400 resize-none leading-relaxed"
                  />
                  <p className="text-[10px] text-slate-400 mt-1">
                    Yeh offer notification panel aur popup banner me target recipients ko foran deliver hoga.
                  </p>
                </div>

                {latestOffer && (
                  <div className="p-3 bg-white rounded-xl border border-slate-200 space-y-1">
                    <div className="text-[10px] text-slate-500 uppercase font-bold flex items-center justify-between">
                      <span>Last Sent Offer:</span>
                      <span className="text-slate-400 font-mono">
                        {new Date(latestOffer.sentAt).toLocaleDateString("en-IN", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })}
                      </span>
                    </div>
                    <div className="font-bold text-slate-900 text-xs">{latestOffer.title}</div>
                    <p className="text-[11px] text-slate-500 truncate">"{latestOffer.message}"</p>
                  </div>
                )}
              </div>

              <div className="pt-2 border-t border-slate-200 flex items-center justify-end">
                <button
                  type="submit"
                  disabled={sendingOffer}
                  className="px-5 py-2 bg-blue-600 hover:bg-blue-500 text-white font-black rounded-xl text-xs cursor-pointer transition active:scale-95 shadow-md disabled:opacity-50 flex items-center gap-1.5"
                >
                  {sendingOffer ? "Sending..." : "🚀 Broadcast Offer"}
                </button>
              </div>
            </form>
          </div>
        </div>
      ) : commissionCategory === "requests" ? (
        <div className="space-y-4">
          <div className="p-5 rounded-2xl border border-slate-200 bg-white space-y-2 shadow-lg">
            <div className="flex items-center gap-2">
              <span className="text-xl">⏳</span>
              <h3 className="text-sm font-black text-slate-900 uppercase tracking-wider">
                Agent Commission Change Requests ({requests.length})
              </h3>
            </div>
            <p className="text-xs text-slate-500">
              Department staff dwara bheji gayi commission change requests. Admin inka reason aur proposed rate review karke approve ya reject kar sakta hai.
            </p>
          </div>

          <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-xl">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs text-slate-700">
                <thead className="bg-white text-[10px] uppercase font-bold text-slate-500 border-b border-slate-200">
                  <tr>
                    <th className="px-4 py-3">Agent</th>
                    <th className="px-4 py-3">Department</th>
                    <th className="px-4 py-3 text-center">Rate Change</th>
                    <th className="px-4 py-3">Requested By & Date</th>
                    <th className="px-4 py-3">Reason / Explanation</th>
                    <th className="px-4 py-3 text-right">Admin Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-800/60 font-sans">
                  {loadingRequests ? (
                    <tr>
                      <td colSpan={6} className="px-4 py-8 text-center text-slate-500">
                        <div className="inline-block w-4 h-4 border-2 border-zinc-400 border-t-transparent rounded-full animate-spin mr-2" />
                        Loading requests...
                      </td>
                    </tr>
                  ) : requests.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="px-4 py-8 text-center text-slate-400 text-xs">
                        🎉 Koi pending commission change request nahi hai (All clear)
                      </td>
                    </tr>
                  ) : (
                    requests.map((req) => (
                      <tr key={req._id} className="hover:bg-slate-100/30 transition">
                        <td className="px-4 py-3.5">
                          <div className="font-bold text-slate-900">{req.agent_id?.name || "Agent"}</div>
                          <div className="text-[10px] font-mono text-slate-500">
                            Code: {req.agent_id?.referralCode || "—"} | {req.agent_id?.phone || "—"}
                          </div>
                        </td>
                        <td className="px-4 py-3.5">
                          <span
                            className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase ${
                              req.commission_type === "investment"
                                ? "bg-purple-500/10 text-purple-300 border border-purple-500/30"
                                : "bg-blue-500/10 text-blue-300 border border-blue-500/30"
                            }`}
                          >
                            {req.commission_type === "investment" ? "Investment" : "Loan"}
                          </span>
                        </td>
                        <td className="px-4 py-3.5 text-center font-mono">
                          <span className="text-slate-500 line-through mr-1.5">{req.current_percent}%</span>
                          <span className="text-emerald-400 font-black text-sm">➔ {req.requested_percent}%</span>
                        </td>
                        <td className="px-4 py-3.5 text-[11px] text-slate-700">
                          <div className="font-semibold text-white">{req.requested_by?.name || "Staff"}</div>
                          <div className="text-[10px] text-slate-400">
                            {new Date(req.created_at).toLocaleString("en-IN", {
                              day: "2-digit",
                              month: "short",
                              hour: "2-digit",
                              minute: "2-digit"
                            })}
                          </div>
                        </td>
                        <td className="px-4 py-3.5 max-w-xs">
                          <div className="p-2 bg-white rounded-lg border border-slate-200 text-[11px] text-amber-200/90 leading-tight">
                            "{req.reason || "No explanation provided"}"
                          </div>
                        </td>
                        <td className="px-4 py-3.5 text-right whitespace-nowrap">
                          {isAdmin ? (
                            <div className="flex items-center justify-end gap-2">
                              <button
                                onClick={() => handleApproveRequest(req._id)}
                                disabled={processingRequestId === req._id}
                                className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg text-xs font-bold transition active:scale-95 cursor-pointer shadow-xs disabled:opacity-50"
                              >
                                {processingRequestId === req._id ? "..." : "✓ Approve"}
                              </button>
                              <button
                                onClick={() => handleRejectRequest(req._id)}
                                disabled={processingRequestId === req._id}
                                className="px-2.5 py-1.5 bg-slate-100 hover:bg-rose-900/60 text-rose-300 hover:text-white border border-slate-200 hover:border-rose-700 rounded-lg text-xs font-bold transition active:scale-95 cursor-pointer disabled:opacity-50"
                              >
                                ✕ Reject
                              </button>
                            </div>
                          ) : (
                            <span className="text-[11px] text-amber-400 font-bold">Pending Admin Review</span>
                          )}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      ) : (
        /* VIEW 2: Agents Commission Table (Loan / Investment) */
        <>
          {/* Overview Banner with Admin Department Pool Controller */}
          <div className="p-5 rounded-2xl border border-slate-200 bg-white space-y-3 shadow-lg">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <div className="flex items-center gap-2">
                  <span className="text-xl">{isInvestment ? "📈" : "💼"}</span>
                  <h3 className="text-sm font-black text-slate-900 uppercase tracking-wider">
                    {isInvestment
                      ? "Investment & Lending Agent Commission Control"
                      : "Loan Department Agent Commission Control"}
                  </h3>
                </div>
                <p className="text-xs text-slate-500 mt-1">
                  {isInvestment
                    ? `Investment deposit par total gross pool ${activePoolPercent}% hai. Admin ise set karta hai aur department is pool ke tehat agent commission request submit karta hai.`
                    : `Disbursed loan par total department pool ${activePoolPercent}% hai. Admin ise set karta hai aur department is pool ke tehat agent commission request submit karta hai.`}
                </p>
              </div>

              {/* Department Pool Controller (Admin Editable) */}
              <div className="flex items-center gap-3 shrink-0">
                <div className="px-4 py-2.5 rounded-xl bg-white border border-slate-200 text-center flex flex-col justify-center min-w-[120px]">
                  <span className="text-[10px] text-slate-500 block font-bold uppercase">
                    {isInvestment ? "Investment Gross Pool" : "Loan Dept Total Pool"}
                  </span>
                  {isEditingPool ? (
                    <div className="flex items-center justify-center gap-1.5 mt-1">
                      <input
                        type="number"
                        min="0"
                        max="100"
                        step="0.5"
                        value={poolInput}
                        onChange={(e) => setPoolInput(e.target.value)}
                        className="w-16 bg-white border border-slate-300 rounded px-1.5 py-0.5 text-center font-mono font-bold text-sm text-slate-900 focus:outline-none focus:border-emerald-400"
                      />
                      <span className="text-xs font-bold text-slate-500">%</span>
                      <button
                        onClick={handleSavePool}
                        disabled={savingPool}
                        className="px-2 py-0.5 bg-emerald-600 hover:bg-emerald-500 text-white text-[10px] font-bold rounded cursor-pointer"
                      >
                        {savingPool ? "..." : "✓"}
                      </button>
                      <button
                        onClick={() => setIsEditingPool(false)}
                        className="px-1.5 py-0.5 bg-slate-100 text-slate-500 text-[10px] rounded cursor-pointer"
                      >
                        ✕
                      </button>
                    </div>
                  ) : (
                    <div className="flex items-center justify-center gap-2 mt-0.5">
                      <span className="text-xl font-black font-mono text-slate-900">
                        {activePoolPercent}%
                      </span>
                      {isAdmin && (
                        <button
                          type="button"
                          onClick={() => {
                            setPoolInput(String(activePoolPercent));
                            setIsEditingPool(true);
                          }}
                          className="px-1.5 py-0.5 bg-slate-100 hover:bg-slate-200 text-slate-700 hover:text-white rounded text-[10px] font-bold border border-slate-200 cursor-pointer active:scale-95"
                          title="Admin can edit department commission pool"
                        >
                          ✎ Set Pool
                        </button>
                      )}
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Info formula card */}
            <div className="p-3 bg-white rounded-xl border border-slate-200 text-[11px] text-slate-700 flex flex-wrap items-center justify-between gap-2">
              <span className="flex items-center gap-1.5">
                <span className="text-slate-500">ℹ️</span>
                <span>
                  Formula: <strong>{isInvestment ? "Platform Net Share" : "Loan Dept Net Share"}</strong> ={" "}
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
                <h4 className="text-xs font-black uppercase text-slate-700 tracking-wider">
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
                  className="w-full bg-white border border-slate-200 rounded-xl px-3 py-1.5 text-xs text-slate-800 placeholder-zinc-500 focus:outline-none focus:border-zinc-500"
                />
                {searchQuery && (
                  <button
                    onClick={() => setSearchQuery("")}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-700 text-xs cursor-pointer"
                  >
                    ✕
                  </button>
                )}
              </div>
            </div>

            {/* Table */}
            <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-xl">
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs text-slate-700">
                  <thead className="bg-white text-[10px] uppercase font-bold text-slate-500 border-b border-slate-200">
                    <tr>
                      <th className="px-4 py-3">Agent Name & Code</th>
                      <th className="px-4 py-3">Phone</th>
                      <th className="px-4 py-3 text-center">
                        {isInvestment ? "Agent Investment Rate" : "Agent Loan Commission"}
                      </th>
                      <th className="px-4 py-3 text-center">
                        {isInvestment ? "Platform Net Share" : "Dept Net Share"}
                      </th>
                      <th className="px-4 py-3">Status / Last Updated</th>
                      <th className="px-4 py-3 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-zinc-800/60">
                    {filteredAgents.length === 0 ? (
                      <tr>
                        <td colSpan={6} className="px-4 py-8 text-center text-slate-400 text-xs">
                          {loading ? "Loading agents..." : "Koi agent nahi mila"}
                        </td>
                      </tr>
                    ) : (
                      filteredAgents.map((agent) => {
                        const isEditingDirect = isAdmin && adminEditingAgentId === agent.agent_id;
                        const baseRate = isInvestment
                          ? (agent.investment_commission_percent ?? 2)
                          : (agent.agent_commission_percent ?? 2);

                        const currentNetRate = isInvestment
                          ? (agent.investment_department_net_percent ?? Math.max(0, Number((activePoolPercent - baseRate).toFixed(2))))
                          : (agent.loan_department_net_percent ?? Math.max(0, Number((activePoolPercent - baseRate).toFixed(2))));

                        const pendingReq = isInvestment ? agent.pending_investment_request : agent.pending_loan_request;

                        return (
                          <React.Fragment key={agent.agent_id}>
                            <tr className="hover:bg-slate-100/30 transition">
                              <td className="px-4 py-3.5">
                                <div className="font-bold text-slate-900 flex items-center gap-1.5">
                                  <span>👤</span>
                                  <span>{agent.agent_name || "Agent"}</span>
                                </div>
                                <span className="text-[10px] font-mono text-slate-500 font-semibold block mt-0.5">
                                  Code: {agent.referral_code}
                                </span>
                              </td>
                              <td className="px-4 py-3.5 font-mono text-[11px] text-slate-700">
                                {agent.agent_phone || "—"}
                              </td>
                              <td className="px-4 py-3.5 text-center">
                                {isEditingDirect ? (
                                  <div className="inline-flex items-center gap-1">
                                    <input
                                      type="number"
                                      min="0"
                                      max={activePoolPercent}
                                      step="0.1"
                                      value={adminEditRateInput}
                                      onChange={(e) => setAdminEditRateInput(e.target.value)}
                                      className="w-16 bg-white border border-slate-300 rounded-lg px-2 py-1 text-center font-mono font-bold text-slate-900 text-xs focus:outline-none focus:border-zinc-400"
                                    />
                                    <span className="font-bold text-slate-500">%</span>
                                  </div>
                                ) : (
                                  <div className="inline-flex flex-col items-center">
                                    <span
                                      className={`inline-block px-2.5 py-1 rounded-full font-bold font-mono ${
                                        isInvestment
                                          ? "bg-slate-100 text-emerald-400 border border-slate-200"
                                          : "bg-slate-100 text-slate-800 border border-slate-200"
                                      }`}
                                    >
                                      {baseRate}%
                                    </span>
                                    {pendingReq && (
                                      <span className="text-[10px] font-bold text-amber-400 bg-amber-500/10 px-1.5 py-0.5 rounded border border-amber-500/20 mt-1 animate-pulse">
                                        ⏳ Req: {pendingReq.requested_percent}%
                                      </span>
                                    )}
                                  </div>
                                )}
                              </td>
                              <td className="px-4 py-3.5 text-center">
                                <span className="inline-block px-2.5 py-1 rounded-full bg-white text-slate-700 border border-slate-200 font-bold font-mono">
                                  {currentNetRate}%
                                </span>
                              </td>
                              <td className="px-4 py-3.5 text-[11px]">
                                {pendingReq ? (
                                  <div className="space-y-0.5">
                                    <span className="text-amber-400 font-semibold block">
                                      Under Review by Admin
                                    </span>
                                    <span className="text-[10px] text-slate-400 block truncate max-w-[150px]" title={pendingReq.reason}>
                                      "{pendingReq.reason}"
                                    </span>
                                  </div>
                                ) : (
                                  <span className="text-slate-500">
                                    {agent.last_updated
                                      ? new Date(agent.last_updated).toLocaleDateString("en-IN", {
                                          day: "2-digit",
                                          month: "short",
                                          year: "numeric"
                                        })
                                      : "—"}
                                  </span>
                                )}
                              </td>
                              <td className="px-4 py-3.5 text-right">
                                {isEditingDirect ? (
                                  <div className="flex items-center justify-end gap-1.5">
                                    <button
                                      onClick={() => handleAdminDirectSave(agent.agent_id)}
                                      disabled={adminSavingAgentId === agent.agent_id}
                                      className="px-2.5 py-1 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg text-xs font-bold transition active:scale-95 cursor-pointer"
                                    >
                                      {adminSavingAgentId === agent.agent_id ? "Saving..." : "Save"}
                                    </button>
                                    <button
                                      onClick={() => setAdminEditingAgentId(null)}
                                      className="px-2 py-1 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg text-xs transition cursor-pointer"
                                    >
                                      ✕
                                    </button>
                                  </div>
                                ) : (
                                  canSet && (
                                    <div className="inline-flex items-center gap-1.5">
                                      {isAdmin ? (
                                        <>
                                          <button
                                            onClick={() => {
                                              setAdminEditingAgentId(agent.agent_id);
                                              setAdminEditRateInput(String(baseRate));
                                            }}
                                            className="px-2.5 py-1 bg-slate-100 hover:bg-slate-200 text-slate-800 border border-slate-200 rounded-lg text-xs font-bold transition active:scale-95 cursor-pointer"
                                            title="Admin direct edit"
                                          >
                                            Quick Edit
                                          </button>
                                          <button
                                            onClick={() => {
                                              setRequestModal({
                                                isOpen: true,
                                                agent,
                                                rate: String(baseRate),
                                                reason: "",
                                                submitting: false
                                              });
                                            }}
                                            className="px-2.5 py-1 bg-white hover:bg-slate-100 text-amber-400 border border-slate-200 rounded-lg text-xs font-bold transition active:scale-95 cursor-pointer"
                                            title="Formal Change Request with Explanation"
                                          >
                                            Request Flow
                                          </button>
                                        </>
                                      ) : (
                                        <button
                                          onClick={() => {
                                            setRequestModal({
                                              isOpen: true,
                                              agent,
                                              rate: String(baseRate),
                                              reason: "",
                                              submitting: false
                                            });
                                          }}
                                          className="px-3 py-1 bg-slate-100 hover:bg-slate-200 text-amber-300 hover:text-white border border-amber-500/30 rounded-lg text-xs font-bold transition active:scale-95 cursor-pointer flex items-center gap-1"
                                        >
                                          <span>✎</span>
                                          <span>Request Change</span>
                                        </button>
                                      )}
                                    </div>
                                  )
                                )}
                              </td>
                            </tr>
                          </React.Fragment>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </>
      )}

      {/* Staff Commission Change Request Modal (with proper explanation) */}
      {requestModal.isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-xs animate-in fade-in duration-150">
          <div className="bg-white border border-slate-200 rounded-2xl w-full max-w-md p-6 space-y-4 shadow-2xl text-slate-900">
            <div className="flex items-center justify-between border-b border-slate-200 pb-3">
              <div className="flex items-center gap-2">
                <span className="text-xl">📝</span>
                <h3 className="text-sm font-black text-slate-900 uppercase tracking-wider">
                  Request {isInvestment ? "Investment" : "Loan"} Commission Change
                </h3>
              </div>
              <button
                onClick={() => setRequestModal({ isOpen: false, agent: null, rate: "", reason: "", submitting: false })}
                className="text-slate-500 hover:text-white text-xs cursor-pointer"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleSubmitRateRequest} className="space-y-4 text-xs">
              <div className="p-3 bg-white rounded-xl border border-slate-200 space-y-1">
                <div className="text-slate-500 text-[11px]">Selected Agent:</div>
                <div className="font-bold text-slate-900 text-sm">{requestModal.agent?.agent_name}</div>
                <div className="text-[11px] font-mono text-slate-500">
                  Code: {requestModal.agent?.referral_code} | Current Rate:{" "}
                  <strong className="text-white">
                    {isInvestment
                      ? (requestModal.agent?.investment_commission_percent ?? 2)
                      : (requestModal.agent?.agent_commission_percent ?? 2)}%
                  </strong>
                </div>
              </div>

              <div>
                <label className="block text-slate-700 font-bold mb-1">
                  Proposed New Rate (%) — (Max Allowed: {activePoolPercent}%):
                </label>
                <div className="relative">
                  <input
                    type="number"
                    min="0"
                    max={activePoolPercent}
                    step="0.1"
                    required
                    value={requestModal.rate}
                    onChange={(e) => setRequestModal((prev) => ({ ...prev, rate: e.target.value }))}
                    className="w-full bg-white border border-slate-200 rounded-xl px-3 py-2 text-slate-900 bg-white font-mono font-bold text-sm focus:outline-none focus:border-emerald-400"
                    placeholder="e.g. 2.5"
                  />
                  <span className="absolute right-3 top-1/2 -translate-y-1/2 font-bold text-slate-500">%</span>
                </div>
              </div>

              <div>
                <label className="block text-slate-700 font-bold mb-1">
                  Explanation / Reason <span className="text-rose-400">*</span>:
                </label>
                <textarea
                  rows={3}
                  required={!isAdmin}
                  value={requestModal.reason}
                  onChange={(e) => setRequestModal((prev) => ({ ...prev, reason: e.target.value }))}
                  placeholder="Kripya batayein ki commission kyu change kiya ja raha hai (e.g. Agent targeted 100+ loans this month, or promotional rate upgrade)..."
                  className="w-full bg-white border border-slate-200 rounded-xl p-3 text-slate-800 placeholder-zinc-500 text-xs focus:outline-none focus:border-emerald-400 resize-none leading-relaxed"
                />
                <p className="text-[10px] text-slate-400 mt-1">
                  Yeh explanation Admin ke pass review aur approval ke liye jayegi.
                </p>
              </div>

              <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-200">
                <button
                  type="button"
                  onClick={() => setRequestModal({ isOpen: false, agent: null, rate: "", reason: "", submitting: false })}
                  className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl font-bold cursor-pointer transition"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={requestModal.submitting}
                  className="px-5 py-2 bg-emerald-600 hover:bg-emerald-500 text-white font-black rounded-xl cursor-pointer transition active:scale-95 shadow-md disabled:opacity-50 flex items-center gap-1.5"
                >
                  {requestModal.submitting ? "Submitting..." : isAdmin ? "Save / Apply" : "Submit Request to Admin"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
