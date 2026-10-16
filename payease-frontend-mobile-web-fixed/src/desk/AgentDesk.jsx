import React, { useState, useEffect, useMemo, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { API } from "../config";
import { tokenStorage } from "../utils/tokenStorage";
import Sheet from "../components/Sheet";

export default function AgentDesk() {
  const navigate = useNavigate();
  const token = tokenStorage.getToken();

  // Agent State
  const [userProfile, setUserProfile] = useState(() => {
    try {
      return JSON.parse(localStorage.getItem("user") || "{}");
    } catch {
      return {};
    }
  });

  const [agentMetrics, setAgentMetrics] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [activeTab, setActiveTab] = useState("overview"); // 'overview' | 'commissions' | 'customers'
  const [customerSearch, setCustomerSearch] = useState("");
  const [copied, setCopied] = useState(false);
  const [loanPool, setLoanPool] = useState({
    totalPool: 1000000,
    marketDisbursed: 0,
    availablePool: 1000000,
    activeLoansCount: 0,
    utilizationPercent: 0
  });

  // Notifications
  const [toast, setToast] = useState({ text: "", type: "" });
  const showToast = useCallback((text, type = "info") => {
    setToast({ text, type });
    setTimeout(() => setToast({ text: "", type: "" }), 4000);
  }, []);

  // Inner Modals
  const [addCustomerModalOpen, setAddCustomerModalOpen] = useState(false);
  const [newCustomerForm, setNewCustomerForm] = useState({
    name: "",
    phone: "",
    email: "",
    password: "12345678"
  });
  const [submittingCustomer, setSubmittingCustomer] = useState(false);

  const [nominateSubAgentModalOpen, setNominateSubAgentModalOpen] = useState(false);
  const [subAgentForm, setSubAgentForm] = useState({
    candidateUserId: "",
    name: "",
    phone: "",
    businessName: "",
    city: ""
  });
  const [submittingSubAgent, setSubmittingSubAgent] = useState(false);

  const [broadcastModalOpen, setBroadcastModalOpen] = useState(false);
  const [broadcastTitle, setBroadcastTitle] = useState("");
  const [broadcastMessage, setBroadcastMessage] = useState("");
  const [broadcastSending, setBroadcastSending] = useState(false);

  const [editLoanLimitCustomer, setEditLoanLimitCustomer] = useState(null);
  const [editLimitVal, setEditLimitVal] = useState("");
  const [updatingLimit, setUpdatingLimit] = useState(false);

  // Collapsible accordion states for Loan & Investment
  const [openLoanCollapse, setOpenLoanCollapse] = useState(false);
  const [openInvestCollapse, setOpenInvestCollapse] = useState(false);

  const headers = useMemo(() => ({
    Authorization: `Bearer ${token}`,
    "Content-Type": "application/json"
  }), [token]);

  // Load Agent Metrics & Profile
  const loadAgentMetrics = useCallback(async (isSilent = false) => {
    if (!token) {
      navigate("/login");
      return;
    }
    if (!isSilent) setRefreshing(true);
    try {
      const [metricsRes, profileRes, poolRes] = await Promise.all([
        fetch(`${API}/user/agent/stats`, { headers }),
        fetch(`${API}/user/me`, { headers }),
        fetch(`${API}/loans/department-pool`, { headers }).catch(() => null)
      ]);

      if (metricsRes.status === 401 || profileRes.status === 401) {
        tokenStorage.removeToken();
        localStorage.removeItem("user");
        navigate("/login");
        return;
      }

      if (metricsRes.ok) {
        const data = await metricsRes.json();
        setAgentMetrics(data);
      }

      if (profileRes.ok) {
        const prof = await profileRes.json();
        setUserProfile(prof);
        try {
          const storedUser = JSON.parse(localStorage.getItem("user") || "{}");
          localStorage.setItem("user", JSON.stringify({ ...storedUser, ...prof }));
        } catch {}
      }

      if (poolRes && poolRes.ok) {
        const pData = await poolRes.json();
        if (pData.success) {
          setLoanPool(pData);
        }
      }
    } catch (err) {
      console.error("Agent metrics load error:", err);
      showToast("Data refresh karne me samasya aayi", "error");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [token, headers, navigate, showToast]);

  useEffect(() => {
    loadAgentMetrics(false);

    // Auto-update every 25 seconds silently
    const interval = setInterval(() => {
      loadAgentMetrics(true);
    }, 25000);

    // Immediate re-sync when tab or window becomes visible
    const handleVisibilityOrFocus = () => {
      if (!document.hidden) {
        loadAgentMetrics(true);
      }
    };

    window.addEventListener("focus", handleVisibilityOrFocus);
    document.addEventListener("visibilitychange", handleVisibilityOrFocus);

    return () => {
      clearInterval(interval);
      window.removeEventListener("focus", handleVisibilityOrFocus);
      document.removeEventListener("visibilitychange", handleVisibilityOrFocus);
    };
  }, [loadAgentMetrics]);

  // Copy referral link
  const copyReferralLink = () => {
    const code = agentMetrics?.agentInfo?.referralCode || userProfile.referralCode || "AGENT";
    const link = `${window.location.origin}/register?ref=${code}`;
    navigator.clipboard?.writeText(link).then(() => {
      setCopied(true);
      showToast("Referral Link copy ho gaya!", "success");
      setTimeout(() => setCopied(false), 2500);
    }).catch(() => {
      showToast(link, "info");
    });
  };

  // 1. Add Customer Handler
  const handleAddCustomer = async (e) => {
    e.preventDefault();
    if (!newCustomerForm.name.trim()) {
      showToast("Customer name zaroori hai", "error");
      return;
    }
    const cleanPhone = newCustomerForm.phone ? String(newCustomerForm.phone).trim() : "";
    if (!cleanPhone || !/^[6-9]\d{9}$/.test(cleanPhone)) {
      showToast("Kripya 10-digit mobile number enter karein (6-9 se shuru)", "error");
      return;
    }
    setSubmittingCustomer(true);
    try {
      const res = await fetch(`${API}/user/agent/add-customer`, {
        method: "POST",
        headers,
        body: JSON.stringify(newCustomerForm)
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || "Customer add karne me error aaya");
      showToast(data.message || "Customer safaltapoorvak link ho gaya!", "success");
      setAddCustomerModalOpen(false);
      setNewCustomerForm({ name: "", phone: "", email: "", password: "12345678" });
      loadAgentMetrics(true);
    } catch (err) {
      showToast(err.message, "error");
    } finally {
      setSubmittingCustomer(false);
    }
  };

  // 2. Nominate Sub-Agent Handler
  const handleNominateSubAgent = async (e) => {
    e.preventDefault();
    if (!subAgentForm.candidateUserId && !subAgentForm.name.trim()) {
      showToast("Candidate ka naam ya existing customer select karein", "error");
      return;
    }
    const cleanPhone = subAgentForm.phone ? String(subAgentForm.phone).trim() : "";
    if (!subAgentForm.candidateUserId && (!cleanPhone || cleanPhone.length !== 10)) {
      showToast("Valid 10-digit mobile number enter karein", "error");
      return;
    }
    setSubmittingSubAgent(true);
    try {
      const res = await fetch(`${API}/user/agent/nominate-subagent`, {
        method: "POST",
        headers,
        body: JSON.stringify(subAgentForm)
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || "Sub-agent nomination request fail ho gayi");
      showToast(data.message || "Sub-Agent nomination admin ko bhej di gayi hai!", "success");
      setNominateSubAgentModalOpen(false);
      setSubAgentForm({ candidateUserId: "", name: "", phone: "", businessName: "", city: "" });
      loadAgentMetrics(true);
    } catch (err) {
      showToast(err.message, "error");
    } finally {
      setSubmittingSubAgent(false);
    }
  };

  // 3. Send Mass Broadcast Message
  const handleSendBroadcast = async () => {
    if (!broadcastMessage.trim()) {
      showToast("Kripya broadcast message likhein", "error");
      return;
    }
    setBroadcastSending(true);
    try {
      const res = await fetch(`${API}/user/agent/broadcast`, {
        method: "POST",
        headers,
        body: JSON.stringify({
          title: broadcastTitle.trim() || undefined,
          message: broadcastMessage.trim()
        })
      });
      const data = await res.json();
      if (res.ok) {
        showToast(data.message || "Broadcast sabhi customers ko bhej diya gaya!", "success");
        setBroadcastModalOpen(false);
        setBroadcastMessage("");
        setBroadcastTitle("");
      } else {
        showToast(data.message || "Broadcast bhejne me error aaya", "error");
      }
    } catch {
      showToast("Network issue: Broadcast message send nahi ho saka", "error");
    } finally {
      setBroadcastSending(false);
    }
  };

  // 4. Update Customer Loan Limit
  const handleUpdateCustomerLoanLimit = async () => {
    if (!editLoanLimitCustomer) return;
    const limitNum = Number(editLimitVal);
    if (!limitNum || limitNum < 5000 || limitNum > 100000) {
      showToast("Valid loan limit dalein (₹5,000 se ₹1,00,000)", "error");
      return;
    }
    setUpdatingLimit(true);
    try {
      const res = await fetch(`${API}/user/agent/update-loan-limit`, {
        method: "POST",
        headers,
        body: JSON.stringify({
          customerId: editLoanLimitCustomer.customerId,
          newLimit: limitNum
        })
      });
      const data = await res.json();
      if (res.ok) {
        showToast(data.message || "Customer Loan limit update ho gayi!", "success");
        setAgentMetrics(prev => {
          if (!prev || !prev.customers) return prev;
          return {
            ...prev,
            customers: prev.customers.map(c =>
              (c.id === editLoanLimitCustomer.customerId || c._id === editLoanLimitCustomer.customerId)
                ? { ...c, loanLimit: limitNum }
                : c
            )
          };
        });
        setEditLoanLimitCustomer(null);
        setEditLimitVal("");
      } else {
        showToast(data.message || "Loan limit update failed", "error");
      }
    } catch {
      showToast("Failed to update limit", "error");
    } finally {
      setUpdatingLimit(false);
    }
  };

  const isTeamModel = Boolean(
    agentMetrics?.agentInfo?.isTeamModel ||
    agentMetrics?.isTeamModel ||
    userProfile?.agentProfile?.commissionModel === "team_1" ||
    userProfile?.agentProfile?.commissionModel === "team"
  );

  const baseRate = isTeamModel ? 1 : 2;
  const rawComms = agentMetrics?.agentInfo?.commissions || userProfile?.agentProfile?.commissions;
  const commissions = {
    loan: rawComms?.loan !== undefined && rawComms?.loan !== null ? rawComms.loan : baseRate,
    lending: rawComms?.lending !== undefined && rawComms?.lending !== null ? rawComms.lending : baseRate,
    investment: rawComms?.investment !== undefined && rawComms?.investment !== null ? rawComms.investment : baseRate,
    bond: rawComms?.bond !== undefined && rawComms?.bond !== null ? rawComms.bond : baseRate
  };

  return (
    <div className="min-h-screen bg-gray-50 text-gray-900 flex flex-col font-sans antialiased selection:bg-blue-600 selection:text-white">
      {/* Toast Alert */}
      {toast.text && (
        <div className={`fixed top-4 left-1/2 -translate-x-1/2 z-50 px-4 py-2.5 rounded-xl shadow-2xl flex items-center gap-2.5 text-xs font-bold text-white transition-all ${
          toast.type === "error" ? "bg-rose-600" : toast.type === "success" ? "bg-emerald-600" : "bg-gray-900"
        }`}>
          <span>{toast.type === "error" ? "" : toast.type === "success" ? "" : "ℹ️"}</span>
          <span>{toast.text}</span>
          <button onClick={() => setToast({ text: "", type: "" })} className="ml-2 text-white/80 hover:text-white">✕</button>
        </div>
      )}

      {/* Top Header Bar */}
      <header className="sticky top-0 z-40 bg-white/95 backdrop-blur-md border-b border-gray-200 px-3.5 sm:px-8 py-3 shadow-2xs">
        <div className="w-full max-w-7xl mx-auto flex items-center justify-between gap-3">
          {/* Left Brand & Back */}
          <div className="flex items-center gap-3 min-w-0">
            <button
              onClick={() => navigate("/dashboard")}
              className="px-2.5 py-1.5 bg-gray-100 hover:bg-gray-200 active:scale-95 text-gray-700 text-xs font-bold rounded-xl transition flex items-center gap-1 cursor-pointer"
              title="Dashboard par wapas jayein"
            >
              <span>←</span>
              <span className="hidden sm:inline">Dashboard</span>
            </button>

            <div className="flex items-center gap-2 min-w-0">
              <h1 className="text-sm sm:text-base font-black tracking-tight text-gray-900 truncate">
                Educa Agent Desk
              </h1>
              <span className="px-2 py-0.5 text-[9px] font-black rounded-full uppercase tracking-wider bg-blue-50 text-blue-700 border border-blue-200">
                {isTeamModel ? "Team Model" : "Direct Agent"}
              </span>
            </div>
          </div>
        </div>
      </header>

      {/* Main Page Body */}
      <main className="flex-1 w-full max-w-7xl mx-auto px-3.5 sm:px-8 py-5 space-y-5">
        {/* 2 Slim Side-by-Side Product Buttons: Loan & Investment */}
        <div className="space-y-2.5">
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => {
                setOpenLoanCollapse(!openLoanCollapse);
                if (!openLoanCollapse) setOpenInvestCollapse(false);
              }}
              className={`px-3.5 py-2.5 rounded-xl text-xs sm:text-sm font-extrabold border transition-all flex items-center justify-between gap-1.5 cursor-pointer shadow-2xs ${
                openLoanCollapse
                  ? "bg-blue-600 text-white border-blue-600 ring-2 ring-blue-500/20"
                  : "bg-white text-gray-800 border-gray-200 hover:border-blue-300 hover:bg-blue-50/40"
              }`}
            >
              <div className="flex items-center gap-1.5 min-w-0">
                <span className="truncate">Loan</span>
                <span
                  className={`text-[10px] font-mono px-1.5 py-0.5 rounded-md font-bold shrink-0 ${
                    openLoanCollapse
                      ? "bg-white/20 text-white"
                      : "bg-blue-50 text-blue-700 border border-blue-200"
                  }`}
                >
                  {commissions.loan}%
                </span>
              </div>
              <span className="text-[10px] shrink-0 opacity-70 font-mono">
                {openLoanCollapse ? "▲" : "▼"}
              </span>
            </button>

            <button
              type="button"
              onClick={() => {
                setOpenInvestCollapse(!openInvestCollapse);
                if (!openInvestCollapse) setOpenLoanCollapse(false);
              }}
              className={`px-3.5 py-2.5 rounded-xl text-xs sm:text-sm font-extrabold border transition-all flex items-center justify-between gap-1.5 cursor-pointer shadow-2xs ${
                openInvestCollapse
                  ? "bg-emerald-600 text-white border-emerald-600 ring-2 ring-emerald-500/20"
                  : "bg-white text-gray-800 border-gray-200 hover:border-emerald-300 hover:bg-emerald-50/40"
              }`}
            >
              <div className="flex items-center gap-1.5 min-w-0">
                <span className="truncate">Investment</span>
                <span
                  className={`text-[10px] font-mono px-1.5 py-0.5 rounded-md font-bold shrink-0 ${
                    openInvestCollapse
                      ? "bg-white/20 text-white"
                      : "bg-emerald-50 text-emerald-700 border border-emerald-200"
                  }`}
                >
                  {commissions.lending}%
                </span>
              </div>
              <span className="text-[10px] shrink-0 opacity-70 font-mono">
                {openInvestCollapse ? "▲" : "▼"}
              </span>
            </button>
          </div>

          {/* Option 1: Loan Drawer */}
          {openLoanCollapse && (
            <div className="p-3 bg-white border border-blue-200 rounded-2xl shadow-2xs animate-in fade-in slide-in-from-top-1 duration-150">
              <div className="flex items-center justify-between mb-2">
                <span className="text-[11px] font-extrabold uppercase text-blue-900 tracking-wider">
                  Loan Products
                </span>
                <div className="flex items-center gap-1.5">
                  <span className="text-[10px] font-mono font-bold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200">
                    Avail Pool: ₹{(loanPool.availablePool !== undefined ? loanPool.availablePool : 1000000).toLocaleString("en-IN")}
                  </span>
                  <span className="text-[10px] font-mono font-bold text-blue-700 bg-blue-50 px-2 py-0.5 rounded border border-blue-200">
                    {commissions.loan}% Commission
                  </span>
                </div>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                <div className="bg-blue-50/40 p-2.5 rounded-xl border border-blue-100 flex items-center justify-between">
                  <div>
                    <div className="text-xs font-extrabold text-gray-900">Student Loan</div>
                    <div className="text-[10px] text-gray-400">Padhai & Shiksha</div>
                  </div>
                  <span className="text-[11px] font-mono font-black text-blue-700 bg-white px-2 py-0.5 rounded border border-blue-200 shadow-2xs">
                    {commissions.loan}%
                  </span>
                </div>

                <div className="bg-blue-50/40 p-2.5 rounded-xl border border-blue-100 flex items-center justify-between">
                  <div>
                    <div className="text-xs font-extrabold text-gray-900">Micro Loan</div>
                    <div className="text-[10px] text-gray-400">Chota Vyapar</div>
                  </div>
                  <span className="text-[11px] font-mono font-black text-blue-700 bg-white px-2 py-0.5 rounded border border-blue-200 shadow-2xs">
                    {commissions.loan}%
                  </span>
                </div>

                <div className="bg-blue-50/40 p-2.5 rounded-xl border border-blue-100 flex items-center justify-between">
                  <div>
                    <div className="text-xs font-extrabold text-gray-900">Personal Loan</div>
                    <div className="text-[10px] text-gray-400">Vyaktigat Rin</div>
                  </div>
                  <span className="text-[11px] font-mono font-black text-blue-700 bg-white px-2 py-0.5 rounded border border-blue-200 shadow-2xs">
                    {commissions.loan}%
                  </span>
                </div>
              </div>
            </div>
          )}

          {/* Option 2: Investment Drawer */}
          {openInvestCollapse && (
            <div className="p-3 bg-white border border-emerald-200 rounded-2xl shadow-2xs animate-in fade-in slide-in-from-top-1 duration-150">
              <div className="flex items-center justify-between mb-2">
                <span className="text-[11px] font-extrabold uppercase text-emerald-900 tracking-wider">
                  Investment Products
                </span>
                <span className="text-[10px] font-mono font-bold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200">
                  {commissions.lending}% Commission
                </span>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                <div className="bg-emerald-50/40 p-2.5 rounded-xl border border-emerald-100 flex items-center justify-between">
                  <div>
                    <div className="text-xs font-extrabold text-gray-900">Lending</div>
                    <div className="text-[10px] text-gray-400">Monthly Return Bonds</div>
                  </div>
                  <span className="text-[11px] font-mono font-black text-emerald-700 bg-white px-2 py-0.5 rounded border border-emerald-200 shadow-2xs">
                    {commissions.lending}%
                  </span>
                </div>

                <div className="bg-purple-50/40 p-2.5 rounded-xl border border-purple-100 flex items-center justify-between">
                  <div>
                    <div className="text-xs font-extrabold text-gray-900">Fixed Bonds</div>
                    <div className="text-[10px] text-gray-400">365-Day Lock-in Bond</div>
                  </div>
                  <span className="text-[11px] font-mono font-black text-purple-700 bg-white px-2 py-0.5 rounded border border-purple-200 shadow-2xs">
                    {commissions.bond}%
                  </span>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* 3 Dedicated Page Tabs */}
        <div className="flex items-center gap-1.5 bg-gray-200/80 p-1.5 rounded-2xl border border-gray-300">
          <button
            type="button"
            onClick={() => setActiveTab("overview")}
            className={`flex-1 py-2 px-3 rounded-xl text-xs sm:text-sm font-extrabold transition cursor-pointer flex items-center justify-center gap-1.5 ${
              activeTab === "overview"
                ? "bg-white text-gray-900 shadow-xs"
                : "text-gray-600 hover:text-gray-900 hover:bg-white/50"
            }`}
          >
            Overview & Dues
          </button>
          <button
            type="button"
            onClick={() => setActiveTab("commissions")}
            className={`flex-1 py-2 px-3 rounded-xl text-xs sm:text-sm font-extrabold transition cursor-pointer flex items-center justify-center gap-1.5 ${
              activeTab === "commissions"
                ? "bg-white text-amber-800 shadow-xs"
                : "text-gray-600 hover:text-gray-900 hover:bg-white/50"
            }`}
          >
            Rates & Commission
          </button>
          <button
            type="button"
            onClick={() => setActiveTab("customers")}
            className={`flex-1 py-2 px-3 rounded-xl text-xs sm:text-sm font-extrabold transition cursor-pointer flex items-center justify-center gap-1.5 ${
              activeTab === "customers"
                ? "bg-white text-gray-900 shadow-xs"
                : "text-gray-600 hover:text-gray-900 hover:bg-white/50"
            }`}
          >
            Customer Portfolio ({agentMetrics?.customers?.length || 0})
          </button>
        </div>

        {/* ══════════════════════════════════════════════════════
            TAB 1: OVERVIEW & DUES
        ══════════════════════════════════════════════════════ */}
        {activeTab === "overview" && (
          <div className="space-y-4">
            {/* Central Loan Department Pool Quota Banner */}
            <div className="bg-gradient-to-r from-blue-900 via-indigo-900 to-slate-900 text-white p-4 sm:p-5 rounded-2xl shadow-sm border border-blue-800/60 relative overflow-hidden">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-3">
                <div className="flex items-center gap-2.5">
                  <span className="w-2.5 h-2.5 rounded-full bg-emerald-400 animate-pulse"></span>
                  <div>
                    <div className="text-[10px] sm:text-xs font-black uppercase tracking-widest text-blue-200">
                      Loan Department Central Pool
                    </div>
                    <div className="text-xs text-blue-300 font-medium">
                      All Loan Staff Shared Lending Capital Quota
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-[10px] font-mono px-2.5 py-1 rounded-lg bg-white/10 border border-white/15 text-blue-100 font-bold">
                    Active Loans: {loanPool.activeLoansCount || 0}
                  </span>
                  <span className="text-[10px] font-mono px-2.5 py-1 rounded-lg bg-emerald-500/20 border border-emerald-400/30 text-emerald-300 font-bold">
                    {loanPool.utilizationPercent || 0}% Utilized
                  </span>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-2 border-t border-white/10">
                <div className="bg-white/5 backdrop-blur-xs p-3 rounded-xl border border-white/10">
                  <span className="text-[10px] text-blue-300 uppercase font-bold block">Dept Total Limit</span>
                  <div className="text-xl sm:text-2xl font-black font-mono text-white mt-0.5">
                    ₹{(loanPool.totalPool || 1000000).toLocaleString("en-IN")}
                  </div>
                  <span className="text-[9px] text-blue-300/80">Default ₹10 Lakh Pool</span>
                </div>

                <div className="bg-white/5 backdrop-blur-xs p-3 rounded-xl border border-white/10">
                  <span className="text-[10px] text-rose-300 uppercase font-bold block">Market me Diya Loan</span>
                  <div className="text-xl sm:text-2xl font-black font-mono text-rose-300 mt-0.5">
                    ₹{(loanPool.marketDisbursed || 0).toLocaleString("en-IN")}
                  </div>
                  <span className="text-[9px] text-rose-200/80">Active Disbursed Capital</span>
                </div>

                <div className="bg-emerald-500/10 backdrop-blur-xs p-3 rounded-xl border border-emerald-400/20">
                  <span className="text-[10px] text-emerald-300 uppercase font-bold block">Available Lending Pool</span>
                  <div className="text-xl sm:text-2xl font-black font-mono text-emerald-300 mt-0.5">
                    ₹{(loanPool.availablePool !== undefined ? loanPool.availablePool : 1000000).toLocaleString("en-IN")}
                  </div>
                  <span className="text-[9px] text-emerald-200/80">Available for New Loans</span>
                </div>
              </div>

              {/* Utilization Progress Bar */}
              <div className="mt-3">
                <div className="w-full bg-white/10 rounded-full h-1.5 overflow-hidden">
                  <div
                    className="h-full bg-gradient-to-r from-blue-400 to-emerald-400 transition-all duration-500 rounded-full"
                    style={{ width: `${Math.min(100, Math.max(0, loanPool.utilizationPercent || 0))}%` }}
                  />
                </div>
              </div>
            </div>

            {/* 5 Core Agent Metrics */}
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
              <div className="bg-white border border-gray-200 rounded-2xl p-3.5 shadow-2xs">
                <span className="text-[10px] text-gray-500 uppercase font-bold block mb-1">Total Deposit</span>
                <div className="text-lg sm:text-2xl font-black font-mono text-emerald-600">
                  ₹{(agentMetrics?.stats?.totalDeposits || 0).toLocaleString("en-IN")}
                </div>
                <span className="text-[10px] text-gray-400">Customer Deposits</span>
              </div>

              <div className="bg-white border border-gray-200 rounded-2xl p-3.5 shadow-2xs">
                <span className="text-[10px] text-gray-500 uppercase font-bold block mb-1">Total Disbursal</span>
                <div className="text-lg sm:text-2xl font-black font-mono text-blue-600">
                  ₹{(agentMetrics?.stats?.totalDisbursal || 0).toLocaleString("en-IN")}
                </div>
                <span className="text-[10px] text-gray-400">Loans Disbursed</span>
              </div>

              <div className="bg-white border border-gray-200 rounded-2xl p-3.5 shadow-2xs">
                <span className="text-[10px] text-gray-500 uppercase font-bold block mb-1">Total Collection</span>
                <div className="text-lg sm:text-2xl font-black font-mono text-cyan-700">
                  ₹{(agentMetrics?.stats?.totalCollection || 0).toLocaleString("en-IN")}
                </div>
                <span className="text-[10px] text-gray-400">Repayments Received</span>
              </div>

              <div className="bg-white border border-gray-200 rounded-2xl p-3.5 shadow-2xs">
                <span className="text-[10px] text-gray-500 uppercase font-bold block mb-1">Total Due</span>
                <div className="text-lg sm:text-2xl font-black font-mono text-rose-600">
                  ₹{(agentMetrics?.stats?.totalDue || 0).toLocaleString("en-IN")}
                </div>
                <span className="text-[10px] text-gray-400">Pending Customer Dues</span>
              </div>

              <div className="bg-white border border-gray-200 rounded-2xl p-3.5 shadow-2xs col-span-2 sm:col-span-1">
                <span className="text-[10px] text-gray-500 uppercase font-bold block mb-1">Pre-Closing</span>
                <div className="text-lg sm:text-2xl font-black font-mono text-amber-700">
                  {agentMetrics?.stats?.preClosingCount || 0}
                </div>
                <span className="text-[10px] text-amber-800 font-semibold">
                  ₹{(agentMetrics?.stats?.preClosingAmount || 0).toLocaleString("en-IN")} Closed Early
                </span>
              </div>
            </div>

            {/* Early Settlement Commission Benefit Guide */}
            <div className="p-4 bg-amber-50/90 border border-amber-200 rounded-2xl text-xs space-y-2 text-amber-950">
              <div className="flex items-center justify-between">
                <span className="font-extrabold text-amber-900 flex items-center gap-1.5 text-sm">
                   Early Loan Pre-Closure Benefits
                </span>
                <span className="text-[10px] bg-amber-100 text-amber-800 border border-amber-300 px-2 py-0.5 rounded-full font-bold">
                  Extra Commission
                </span>
              </div>
              <p className="text-xs text-amber-900 leading-relaxed">
                Agar aapka referred borrower loan ko <strong>samay se pehle (9 kiston se pehle)</strong> close karta hai, to borrower ko loan me vishesh discount milta hai aur aapko bhi instant early settlement bonus credit hota hai!
              </p>
              <div className="p-2.5 bg-white rounded-xl border border-amber-200 text-xs text-amber-900 flex items-center justify-between">
                <span>Jitna jaldi pre-close hoga, borrower aur aap dono ko utna fayda milega!</span>
                <span className="text-[10px] bg-emerald-50 text-emerald-700 border border-emerald-200 px-2 py-0.5 rounded-md font-bold">
                  Auto Payout
                </span>
              </div>
            </div>

            {/* Quick Actions Bar */}
            <div className="p-4 bg-white border border-gray-200 rounded-2xl flex flex-wrap items-center justify-between gap-3 shadow-2xs">
              <div className="flex items-center gap-2">
                <span className="text-xs font-bold text-gray-600">Your Referral Code:</span>
                <span className="font-mono font-black text-amber-800 bg-amber-50 px-2.5 py-1 rounded-lg border border-amber-200 text-sm">
                  {agentMetrics?.agentInfo?.referralCode || userProfile.referralCode || "AGENT"}
                </span>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setActiveTab("commissions")}
                  className="px-3 py-1.5 bg-amber-50 hover:bg-amber-100 text-amber-800 border border-amber-200 rounded-xl text-xs font-bold transition cursor-pointer"
                >
                  View Rates & Commission
                </button>
                <button
                  type="button"
                  onClick={() => setActiveTab("customers")}
                  className="px-3 py-1.5 bg-blue-50 hover:bg-blue-100 text-blue-700 border border-blue-200 rounded-xl text-xs font-bold transition cursor-pointer"
                >
                  View Customers ({agentMetrics?.customers?.length || 0})
                </button>
              </div>
            </div>
          </div>
        )}

        {/* ══════════════════════════════════════════════════════
            TAB 2: 4-PRODUCT COMMISSION RATES
        ══════════════════════════════════════════════════════ */}
        {activeTab === "commissions" && (
          <div className="space-y-4">
            <div className="p-4 sm:p-5 bg-white border border-gray-200 rounded-3xl space-y-4 shadow-2xs">
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-gray-200 pb-3">
                <div>
                  <h2 className="font-extrabold text-sm sm:text-base text-gray-900">
                    Product Commission & Earnings Portfolio
                  </h2>
                  <p className="text-xs text-gray-500">Loan aur Investment products par tay ki gayi commission dar aur kul kamai</p>
                </div>
                <div className="text-right">
                  <span className="text-[10px] text-gray-500 block uppercase font-bold">Kul Kamai (Total Commission)</span>
                  <span className="text-base sm:text-xl font-black font-mono text-emerald-600">
                    ₹{(agentMetrics?.agentInfo?.earningsBreakdown?.total || userProfile.referralEarnings || 0).toLocaleString("en-IN")}
                  </span>
                </div>
              </div>

              {/* 1. Loan Category */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-black uppercase text-blue-900">
                    Loan Category (Student, Micro & Personal Loans)
                  </span>
                  <span className="text-[10px] font-bold bg-blue-50 text-blue-700 border border-blue-200 px-2 py-0.5 rounded-full">
                    {commissions.loan}% Agent Rate
                  </span>
                </div>

                <div className="bg-gradient-to-br from-blue-50/60 to-white border border-blue-200 rounded-2xl p-4 shadow-2xs flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <span className="text-[10px] text-gray-500 font-bold block uppercase">Customer Loans Disbursal Commission</span>
                    <div className="text-xl sm:text-2xl font-black font-mono text-blue-700">
                      ₹{(agentMetrics?.agentInfo?.earningsBreakdown?.loan || 0).toLocaleString("en-IN")}
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-1.5 text-[11px] text-gray-600 font-semibold">
                    <span className="bg-white px-2.5 py-1 rounded-lg border border-blue-100 shadow-2xs">Student Loan</span>
                    <span className="bg-white px-2.5 py-1 rounded-lg border border-blue-100 shadow-2xs">Micro Loan</span>
                    <span className="bg-white px-2.5 py-1 rounded-lg border border-blue-100 shadow-2xs">Personal Loan</span>
                  </div>
                </div>
              </div>

              {/* 2. Investment Category */}
              <div className="space-y-2 pt-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-black uppercase text-emerald-900">
                    Investment Category (Lending & Bonds)
                  </span>
                  <span className="text-[10px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200 px-2 py-0.5 rounded-full">
                    {commissions.lending === commissions.bond
                      ? `Lending & Bonds: ${commissions.lending}%`
                      : `Lending: ${commissions.lending}% | Bond: ${commissions.bond}%`}
                  </span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {/* Lending */}
                  <div className="bg-gradient-to-br from-emerald-50/60 to-white border border-emerald-200 rounded-2xl p-4 shadow-2xs">
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-xs text-emerald-700 font-bold uppercase">Lending</span>
                      <span className="text-[10px] font-black px-2 py-0.5 rounded bg-emerald-100 text-emerald-800 border border-emerald-200">
                        {commissions.lending}% Rate
                      </span>
                    </div>
                    <div className="text-lg sm:text-xl font-black font-mono text-emerald-700">
                      ₹{(agentMetrics?.agentInfo?.earningsBreakdown?.lending || 0).toLocaleString("en-IN")}
                    </div>
                    <span className="text-[10px] text-gray-500">Monthly Return Bonds & Capital Allocation</span>
                  </div>

                  {/* Fixed Bonds */}
                  <div className="bg-gradient-to-br from-purple-50/60 to-white border border-purple-200 rounded-2xl p-4 shadow-2xs">
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-xs text-purple-700 font-bold uppercase">Fixed Bonds</span>
                      <span className="text-[10px] font-black px-2 py-0.5 rounded bg-purple-100 text-purple-800 border border-purple-200">
                        {commissions.bond}% Rate
                      </span>
                    </div>
                    <div className="text-lg sm:text-xl font-black font-mono text-purple-700">
                      ₹{(agentMetrics?.agentInfo?.earningsBreakdown?.bond || 0).toLocaleString("en-IN")}
                    </div>
                    <span className="text-[10px] text-gray-500">365-Day Fixed Bond Investment</span>
                  </div>
                </div>
              </div>

              {/* Note */}
              <div className="p-3 bg-gray-50 rounded-xl border border-gray-200 text-xs text-gray-600 flex items-center justify-between">
                <span>Wallet Transfer: <strong className="text-gray-900">0% (Direct User-to-User par koi commission nahi)</strong></span>
                <span className="text-[10px] bg-gray-200/80 px-2 py-0.5 rounded text-gray-700 font-bold">Direct Only</span>
              </div>

              {/* Commission History */}
              {agentMetrics?.commissionHistory && agentMetrics.commissionHistory.length > 0 && (
                <div className="pt-2 border-t border-gray-200 space-y-2">
                  <span className="text-xs font-bold text-gray-700 uppercase tracking-wider block">
                    Halia Commission Credits (Recent Payouts)
                  </span>
                  <div className="space-y-1.5 max-h-56 overflow-y-auto pr-1">
                    {agentMetrics.commissionHistory.map((ch, idx) => (
                      <div
                        key={ch.id || idx}
                        className="bg-gray-50 border border-gray-200 rounded-xl p-2.5 flex items-center justify-between text-xs"
                      >
                        <div className="flex items-center gap-2">
                          <span className={`text-[10px] font-black px-2 py-0.5 rounded-full uppercase ${
                            ch.source === 'loan' ? 'bg-blue-100 text-blue-800 border border-blue-200' :
                            ch.source === 'lending' ? 'bg-emerald-100 text-emerald-800 border border-emerald-200' :
                            ch.source === 'bond' ? 'bg-purple-100 text-purple-800 border border-purple-200' :
                            'bg-amber-100 text-amber-800 border border-amber-200'
                          }`}>
                            {ch.source === 'loan' ? 'Loan' : ch.source === 'lending' ? 'Lending' : ch.source === 'bond' ? 'Bond' : 'Investment'}
                          </span>
                          <span className="text-xs text-gray-800 font-medium">{ch.remarks || 'Referral Bonus'}</span>
                        </div>
                        <span className="font-mono font-black text-emerald-600 text-xs shrink-0 ml-2">
                          +₹{Number(ch.amount || 0).toLocaleString('en-IN')}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* ══════════════════════════════════════════════════════
            TAB 3: CUSTOMERS PORTFOLIO
        ══════════════════════════════════════════════════════ */}
        {activeTab === "customers" && (
          <div className="space-y-4">
            {/* Action Bar */}
            <div className="p-4 bg-white border border-gray-200 rounded-2xl flex flex-wrap items-center justify-between gap-3 shadow-2xs">
              <div className="flex items-center gap-2">
                <span className="text-xs font-bold text-gray-600">Referral Code:</span>
                <span className="font-mono font-black text-amber-800 bg-amber-50 px-2 py-0.5 rounded border border-amber-200">
                  {agentMetrics?.agentInfo?.referralCode || userProfile.referralCode || "AGENT"}
                </span>
              </div>
              <div className="flex items-center gap-2 flex-wrap">
                <button
                  type="button"
                  onClick={() => setAddCustomerModalOpen(true)}
                  className="px-3.5 py-2 bg-emerald-600 hover:bg-emerald-700 active:scale-95 text-white font-extrabold rounded-xl transition text-xs shadow-2xs cursor-pointer"
                >
                  Add Customer
                </button>
                {isTeamModel && (
                  <button
                    type="button"
                    onClick={() => setNominateSubAgentModalOpen(true)}
                    className="px-3.5 py-2 bg-purple-600 hover:bg-purple-700 active:scale-95 text-white font-extrabold rounded-xl transition text-xs shadow-2xs cursor-pointer"
                  >
                    Nominate Sub-Agent
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => setBroadcastModalOpen(true)}
                  className="px-3.5 py-2 bg-amber-500 hover:bg-amber-600 active:scale-95 text-white font-extrabold rounded-xl transition text-xs shadow-2xs cursor-pointer"
                >
                  Send Mass Message
                </button>
                <button
                  type="button"
                  onClick={copyReferralLink}
                  className="px-3.5 py-2 bg-blue-600 hover:bg-blue-700 active:scale-95 text-white font-bold rounded-xl transition text-xs shadow-2xs cursor-pointer"
                >
                  {copied ? "Copied" : "Copy Link"}
                </button>
              </div>
            </div>

            {/* Team Model Sub-Agents Section */}
            {isTeamModel && (
              <div className="p-4 bg-purple-50/70 border border-purple-200 rounded-2xl text-xs space-y-2.5">
                <div className="flex items-center justify-between">
                  <span className="font-extrabold text-purple-900 flex items-center gap-1.5 text-sm">
                     My Sub-Agent Network ({agentMetrics?.subAgents?.length || agentMetrics?.stats?.teamMembersCount || 0})
                  </span>
                  <span className="text-[10px] bg-purple-100 text-purple-800 border border-purple-200 px-2.5 py-0.5 rounded-full font-bold">
                    Team Model
                  </span>
                </div>
                {agentMetrics?.pendingSubAgents && agentMetrics.pendingSubAgents.length > 0 && (
                  <div className="p-3 bg-amber-50 border border-amber-200 rounded-xl text-xs text-amber-900 space-y-1.5">
                    <span className="font-bold block">⏳ Pending Admin Review ({agentMetrics.pendingSubAgents.length}):</span>
                    {agentMetrics.pendingSubAgents.map((p, idx) => (
                      <div key={idx} className="flex justify-between items-center text-xs bg-white px-3 py-1.5 rounded-lg border border-amber-100">
                        <span>{p.name} ({p.phone})</span>
                        <span className="text-amber-800 font-bold">Under Review by Admin</span>
                      </div>
                    ))}
                  </div>
                )}
                {agentMetrics?.subAgents && agentMetrics.subAgents.length > 0 ? (
                  <div className="space-y-1.5">
                    {agentMetrics.subAgents.map((sa, idx) => (
                      <div key={idx} className="flex justify-between items-center text-xs bg-white border border-gray-200 px-3 py-2 rounded-xl">
                        <span className="font-bold text-gray-900">{sa.name} <span className="font-mono text-gray-500 text-[10px]">({sa.phone})</span></span>
                        <span className="text-[10px] bg-emerald-50 text-emerald-700 border border-emerald-200 px-2 py-0.5 rounded font-bold font-mono">Code: {sa.referralCode}</span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-xs text-purple-800">
                    Aapke team me abhi koi sub-agent active nahi hai. Upar diye gaye <strong>Nominate Sub-Agent</strong> button se naye sub-agent ke liye nomination bhej sakte hain.
                  </p>
                )}
              </div>
            )}

            {/* Customers Section */}
            <div className="space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <h3 className="text-sm sm:text-base font-extrabold text-gray-900 flex items-center gap-1.5">
                     Referred Customers ({agentMetrics?.customers?.length || 0})
                  </h3>
                  <span className="text-[10px] text-blue-700 bg-blue-50 px-2.5 py-0.5 rounded-full font-semibold border border-blue-200">
                    Individual Breakdown
                  </span>
                </div>
                {agentMetrics?.customers && agentMetrics.customers.length > 2 && (
                  <input
                    type="text"
                    value={customerSearch}
                    onChange={(e) => setCustomerSearch(e.target.value)}
                    placeholder="Search name or phone..."
                    className="bg-white border border-gray-300 rounded-xl px-3 py-1.5 text-xs text-gray-900 placeholder-gray-400 focus:outline-none focus:border-blue-500 w-full sm:w-56"
                  />
                )}
              </div>

              {/* Customer Cards */}
              {agentMetrics?.customers && agentMetrics.customers.length > 0 ? (
                <div className="space-y-3">
                  {agentMetrics.customers
                    .filter((c) => {
                      if (!customerSearch) return true;
                      const q = customerSearch.toLowerCase();
                      return (
                        (c.name && c.name.toLowerCase().includes(q)) ||
                        (c.phone && c.phone.includes(q))
                      );
                    })
                    .map((c, idx) => (
                      <div
                        key={c.id || idx}
                        className="bg-white hover:bg-gray-50/70 border border-gray-200 rounded-2xl p-4 shadow-2xs transition"
                      >
                        {/* Customer Header */}
                        <div className="flex flex-wrap items-center justify-between gap-2 pb-2.5 mb-3 border-b border-gray-100">
                          <div className="flex items-center gap-2.5">
                            <div className="w-8 h-8 rounded-full bg-blue-600 text-white font-black flex items-center justify-center text-xs shadow-2xs">
                              {c.name ? c.name[0].toUpperCase() : "U"}
                            </div>
                            <div>
                              <div className="text-xs sm:text-sm font-bold text-gray-900 flex items-center gap-1.5">
                                <span>{c.name}</span>
                                {c.phone && (
                                  <span className="text-[11px] text-gray-500 font-mono">({c.phone})</span>
                                )}
                              </div>
                              <div className="text-[10px] text-gray-400">
                                Joined: {c.joinedAt ? new Date(c.joinedAt).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" }) : "-"}
                              </div>
                            </div>
                          </div>

                          <div className="flex items-center gap-1.5">
                            <span className="text-[11px] px-2.5 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200 font-bold font-mono">
                              Wallet: ₹{Number(c.balance || 0).toLocaleString("en-IN")}
                            </span>
                          </div>
                        </div>

                        {/* Customer 5 Metrics */}
                        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2 text-xs">
                          <div className="bg-gray-50 rounded-xl p-2.5 border border-gray-100">
                            <span className="text-[9px] text-gray-500 uppercase font-bold block mb-0.5">Deposit</span>
                            <span className="font-mono font-bold text-emerald-600">
                              ₹{(c.totalDeposit || 0).toLocaleString("en-IN")}
                            </span>
                          </div>

                          <div className="bg-gray-50 rounded-xl p-2.5 border border-gray-100">
                            <span className="text-[9px] text-gray-500 uppercase font-bold block mb-0.5">Disbursed</span>
                            <span className="font-mono font-bold text-blue-600">
                              ₹{(c.totalDisbursal || 0).toLocaleString("en-IN")}
                            </span>
                          </div>

                          <div className="bg-gray-50 rounded-xl p-2.5 border border-gray-100">
                            <span className="text-[9px] text-gray-500 uppercase font-bold block mb-0.5">Collection</span>
                            <span className="font-mono font-bold text-cyan-700">
                              ₹{(c.totalCollection || 0).toLocaleString("en-IN")}
                            </span>
                          </div>

                          <div className="bg-gray-50 rounded-xl p-2.5 border border-gray-100">
                            <span className="text-[9px] text-gray-500 uppercase font-bold block mb-0.5">Total Due</span>
                            <span className="font-mono font-bold text-rose-600">
                              ₹{(c.totalDue || 0).toLocaleString("en-IN")}
                            </span>
                          </div>

                          <div className="bg-gray-50 rounded-xl p-2.5 border border-gray-100 col-span-2 sm:col-span-1">
                            <span className="text-[9px] text-gray-500 uppercase font-bold block mb-0.5">Pre-Closing</span>
                            <span className="font-mono font-bold text-amber-700">
                              {c.preClosingCount || 0}
                            </span>
                            <span className="text-[10px] text-gray-500 block font-normal">
                              ₹{(c.preClosingAmount || 0).toLocaleString("en-IN")}
                            </span>
                          </div>
                        </div>

                        {/* Customer Loan Limit & Actions */}
                        <div className="mt-3 pt-2.5 border-t border-gray-100 flex flex-wrap items-center justify-between gap-2 text-xs">
                          <div className="flex items-center gap-1.5">
                            <span className="text-gray-500 font-bold text-[11px]">Loan Limit:</span>
                            <span className="font-mono font-black text-blue-700 bg-blue-50 px-2 py-0.5 rounded border border-blue-200">
                              ₹{(c.loanLimit || 5000).toLocaleString("en-IN")}
                            </span>
                          </div>

                          <button
                            type="button"
                            onClick={() => {
                              setEditLoanLimitCustomer({ customerId: c.id || c._id, name: c.name, currentLimit: c.loanLimit || 5000 });
                              setEditLimitVal(String(c.loanLimit || 5000));
                            }}
                            className="px-3 py-1.5 rounded-xl bg-amber-50 hover:bg-amber-100 text-amber-900 border border-amber-200 text-xs font-bold transition active:scale-95 cursor-pointer flex items-center gap-1"
                          >
                             Limit Badhayein
                          </button>
                        </div>
                      </div>
                    ))}
                </div>
              ) : (
                <div className="text-center py-8 px-4 bg-white rounded-2xl border border-gray-200 text-xs text-gray-500">
                  {loading
                    ? "Customer data load ho raha hai..."
                    : "Abhi tak koi referred customer onboard nahi hua hai. Upar diye gaye 'Add Customer' button ya Referral Link se customers ko jodein."}
                </div>
              )}
            </div>
          </div>
        )}
      </main>

      {/* ══════════════════════════════════════════════════════
          1. ADD CUSTOMER MODAL (SHEET)
      ══════════════════════════════════════════════════════ */}
      {addCustomerModalOpen && (
        <Sheet
          open={addCustomerModalOpen}
          onClose={() => setAddCustomerModalOpen(false)}
          title="Onboard Customer Under My Portfolio"
          icon=""
        >
          <form onSubmit={handleAddCustomer} className="space-y-4">
            <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-2xl flex items-center justify-between">
              <div>
                <span className="text-[10px] text-emerald-800 uppercase font-black tracking-wider">Direct Referral Linking</span>
                <h4 className="text-sm font-black text-emerald-950">
                  New Customer Addition
                </h4>
              </div>
              <span className="px-2.5 py-1 rounded-full text-[10px] font-black bg-emerald-600 text-white uppercase font-mono">
                Code: {userProfile.referralCode || "AGENT"}
              </span>
            </div>

            <p className="text-xs text-gray-600 leading-relaxed">
              Aap apne referral portfolio me naye customer ko sidhe registered kar sakte hain. Customer ka account turant ban jayega aur aapke desk par dikhne lagega.
            </p>

            <div>
              <label className="block text-xs font-bold text-gray-700 mb-1">
                Customer Full Name <span className="text-rose-500">*</span>
              </label>
              <input
                type="text"
                required
                value={newCustomerForm.name}
                onChange={(e) => setNewCustomerForm({ ...newCustomerForm, name: e.target.value })}
                placeholder="e.g. Ramesh Kumar"
                className="w-full p-2.5 bg-gray-50 border border-gray-200 rounded-xl text-xs font-semibold text-gray-900 outline-none focus:bg-white focus:ring-2 focus:ring-emerald-500"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-gray-700 mb-1">
                10-Digit Mobile Number <span className="text-rose-500">*</span>
              </label>
              <input
                type="tel"
                required
                maxLength={10}
                value={newCustomerForm.phone}
                onChange={(e) => setNewCustomerForm({ ...newCustomerForm, phone: e.target.value.replace(/\D/g, "") })}
                placeholder="e.g. 9876543210"
                className="w-full p-2.5 bg-gray-50 border border-gray-200 rounded-xl text-xs font-mono font-semibold text-gray-900 outline-none focus:bg-white focus:ring-2 focus:ring-emerald-500"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-gray-700 mb-1">
                Email Address (Optional)
              </label>
              <input
                type="email"
                value={newCustomerForm.email}
                onChange={(e) => setNewCustomerForm({ ...newCustomerForm, email: e.target.value })}
                placeholder="agar email na ho to khali chhod dein"
                className="w-full p-2.5 bg-gray-50 border border-gray-200 rounded-xl text-xs font-medium text-gray-900 outline-none focus:bg-white focus:ring-2 focus:ring-emerald-500"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-gray-700 mb-1">
                Initial Login Password
              </label>
              <input
                type="text"
                value={newCustomerForm.password}
                onChange={(e) => setNewCustomerForm({ ...newCustomerForm, password: e.target.value })}
                placeholder="Default: 12345678"
                className="w-full p-2.5 bg-gray-50 border border-gray-200 rounded-xl text-xs font-mono font-semibold text-gray-900 outline-none focus:bg-white focus:ring-2 focus:ring-emerald-500"
              />
            </div>

            <div className="pt-2">
              <button
                type="submit"
                disabled={submittingCustomer}
                className="w-full py-3 bg-emerald-600 hover:bg-emerald-700 text-white font-black rounded-xl text-xs shadow-md transition active:scale-95 disabled:opacity-50 cursor-pointer flex items-center justify-center gap-2"
              >
                {submittingCustomer ? (
                  <span>Registering & Linking Customer...</span>
                ) : (
                  <>
                    <span>✓</span>
                    <span>Create & Link Customer Under Me →</span>
                  </>
                )}
              </button>
            </div>
          </form>
        </Sheet>
      )}

      {/* ══════════════════════════════════════════════════════
          2. NOMINATE SUB-AGENT MODAL (SHEET)
      ══════════════════════════════════════════════════════ */}
      {nominateSubAgentModalOpen && (
        <Sheet
          open={nominateSubAgentModalOpen}
          onClose={() => setNominateSubAgentModalOpen(false)}
          title="Nominate Sub-Agent Under My Team"
          icon=""
        >
          <form onSubmit={handleNominateSubAgent} className="space-y-4">
            <div className="p-3 bg-purple-50 border border-purple-200 rounded-2xl flex items-center justify-between">
              <div>
                <span className="text-[10px] text-purple-800 uppercase font-black tracking-wider">Team Expansion</span>
                <h4 className="text-sm font-black text-purple-950">Sub-Agent Request</h4>
              </div>
              <span className="px-2.5 py-1 rounded-full text-[10px] font-black bg-purple-600 text-white uppercase font-mono">
                Team Model
              </span>
            </div>

            {agentMetrics?.customers && agentMetrics.customers.length > 0 && (
              <div>
                <label className="block text-xs font-bold text-gray-700 mb-1">
                  Existing Customer se chunein (Optional)
                </label>
                <select
                  value={subAgentForm.candidateUserId}
                  onChange={(e) => {
                    const selectedId = e.target.value;
                    const c = agentMetrics.customers.find(item => (item.id === selectedId || item._id === selectedId));
                    if (c) {
                      setSubAgentForm({
                        ...subAgentForm,
                        candidateUserId: selectedId,
                        name: c.name || "",
                        phone: c.phone || ""
                      });
                    } else {
                      setSubAgentForm({ ...subAgentForm, candidateUserId: "" });
                    }
                  }}
                  className="w-full p-2.5 bg-gray-50 border border-gray-200 rounded-xl text-xs text-gray-900 outline-none focus:bg-white focus:ring-2 focus:ring-purple-500"
                >
                  <option value="">-- Customer chunein ya niche details bharein --</option>
                  {agentMetrics.customers.map(c => (
                    <option key={c.id || c._id} value={c.id || c._id}>
                      {c.name} ({c.phone})
                    </option>
                  ))}
                </select>
              </div>
            )}

            <div>
              <label className="block text-xs font-bold text-gray-700 mb-1">
                Candidate Name <span className="text-rose-500">*</span>
              </label>
              <input
                type="text"
                required
                value={subAgentForm.name}
                onChange={(e) => setSubAgentForm({ ...subAgentForm, name: e.target.value })}
                placeholder="Candidate Full Name"
                className="w-full p-2.5 bg-gray-50 border border-gray-200 rounded-xl text-xs font-semibold text-gray-900 outline-none focus:bg-white focus:ring-2 focus:ring-purple-500"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-gray-700 mb-1">
                Candidate Mobile Number <span className="text-rose-500">*</span>
              </label>
              <input
                type="tel"
                required
                maxLength={10}
                value={subAgentForm.phone}
                onChange={(e) => setSubAgentForm({ ...subAgentForm, phone: e.target.value.replace(/\D/g, "") })}
                placeholder="10-digit mobile number"
                className="w-full p-2.5 bg-gray-50 border border-gray-200 rounded-xl text-xs font-mono font-semibold text-gray-900 outline-none focus:bg-white focus:ring-2 focus:ring-purple-500"
              />
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="block text-xs font-bold text-gray-700 mb-1">Business Name</label>
                <input
                  type="text"
                  value={subAgentForm.businessName}
                  onChange={(e) => setSubAgentForm({ ...subAgentForm, businessName: e.target.value })}
                  placeholder="e.g. Sharma Finance"
                  className="w-full p-2.5 bg-gray-50 border border-gray-200 rounded-xl text-xs text-gray-900 outline-none focus:bg-white"
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-gray-700 mb-1">City / Location</label>
                <input
                  type="text"
                  value={subAgentForm.city}
                  onChange={(e) => setSubAgentForm({ ...subAgentForm, city: e.target.value })}
                  placeholder="e.g. Jaipur"
                  className="w-full p-2.5 bg-gray-50 border border-gray-200 rounded-xl text-xs text-gray-900 outline-none focus:bg-white"
                />
              </div>
            </div>

            <div className="pt-2">
              <button
                type="submit"
                disabled={submittingSubAgent}
                className="w-full py-3 bg-purple-600 hover:bg-purple-700 text-white font-black rounded-xl text-xs shadow-md transition active:scale-95 disabled:opacity-50 cursor-pointer flex items-center justify-center gap-2"
              >
                {submittingSubAgent ? (
                  <span>Submitting Nomination to Admin...</span>
                ) : (
                  <>
                    
                    <span>Submit Sub-Agent Nomination to Admin →</span>
                  </>
                )}
              </button>
            </div>
          </form>
        </Sheet>
      )}

      {/* ══════════════════════════════════════════════════════
          3. MASS BROADCAST MESSAGE MODAL (SHEET)
      ══════════════════════════════════════════════════════ */}
      {broadcastModalOpen && (
        <Sheet
          open={broadcastModalOpen}
          onClose={() => setBroadcastModalOpen(false)}
          title="Send Mass Broadcast Message"
          icon=""
        >
          <div className="space-y-4">
            <div className="p-3 bg-amber-50 border border-amber-200 rounded-2xl flex items-center justify-between">
              <div>
                <span className="text-[10px] text-amber-800 uppercase font-black tracking-wider">Recipients</span>
                <h4 className="text-sm font-black text-amber-950">
                  {agentMetrics?.stats?.customerCount || agentMetrics?.customers?.length || 0} Registered Customers
                </h4>
              </div>
              <span className="px-2.5 py-1 rounded-full text-[10px] font-black bg-amber-500 text-white uppercase">
                1-Click Send
              </span>
            </div>

            {/* Quick Templates */}
            <div>
              <span className="text-[11px] font-bold text-gray-500 block mb-1.5">Quick Message Templates:</span>
              <div className="flex flex-wrap gap-1.5">
                {[
                  {
                    label: "⏰ Kist Reminder",
                    title: "⏰ Installment Due Reminder",
                    msg: "Namaste! Aapke loan ki installment date najdeek hai. Kripya samay par kist jama karein taaki aapka account clean rahe."
                  },
                  {
                    label: "Pre-Closure Offer",
                    title: "Pre-Closure Discount Offer",
                    msg: "Special Notice: Aap apna loan samay se pehle pre-close kar sakte hain aur extra interest bacha sakte hain. Turant sampark karein."
                  },
                  {
                    label: "Agent Notice",
                    title: "Official Notice from Agent",
                    msg: "Namaste! Educa Fintech account aur loan payments ke sambandh me kisi bhi sahayata ke liye aap mujhse sidhe sampark kar sakte hain."
                  }
                ].map((tmpl, idx) => (
                  <button
                    key={idx}
                    type="button"
                    onClick={() => {
                      setBroadcastTitle(tmpl.title);
                      setBroadcastMessage(tmpl.msg);
                    }}
                    className="text-[11px] font-bold bg-amber-50 hover:bg-amber-100 text-amber-900 border border-amber-200 px-2.5 py-1 rounded-xl transition active:scale-95 cursor-pointer"
                  >
                    {tmpl.label}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label className="block text-xs font-bold text-gray-700 mb-1">Notice Title (Optional)</label>
              <input
                type="text"
                value={broadcastTitle}
                onChange={(e) => setBroadcastTitle(e.target.value)}
                placeholder="e.g. ⏰ Loan Installment Alert"
                className="w-full px-3 py-2 border border-gray-300 rounded-xl text-xs outline-none focus:border-amber-500 focus:ring-1 focus:ring-amber-500 bg-white"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-gray-700 mb-1">
                Broadcast Message Content <span className="text-rose-500">*</span>
              </label>
              <textarea
                rows={4}
                value={broadcastMessage}
                onChange={(e) => setBroadcastMessage(e.target.value)}
                placeholder="Sabhi referred customers ko bhejne ke liye sandesh yahan likhein..."
                className="w-full p-3 border border-gray-300 rounded-xl text-xs outline-none focus:border-amber-500 focus:ring-1 focus:ring-amber-500 bg-white resize-none"
              />
            </div>

            <div className="pt-2">
              <button
                type="button"
                onClick={handleSendBroadcast}
                disabled={broadcastSending || !broadcastMessage.trim()}
                className="w-full py-3 bg-amber-500 hover:bg-amber-600 text-white font-black rounded-xl text-xs shadow-md transition active:scale-95 disabled:opacity-50 cursor-pointer flex items-center justify-center gap-2"
              >
                {broadcastSending ? (
                  <span>Sending broadcast to all customers...</span>
                ) : (
                  <>
                    
                    <span>Send to All {agentMetrics?.stats?.customerCount || agentMetrics?.customers?.length || 0} Customers (1-Click)</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </Sheet>
      )}

      {/* ══════════════════════════════════════════════════════
          4. EDIT CUSTOMER LOAN LIMIT MODAL
      ══════════════════════════════════════════════════════ */}
      {editLoanLimitCustomer && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-sm w-full p-5 shadow-2xl border border-gray-200 space-y-4 text-gray-900 animate-in fade-in duration-150">
            <div className="flex items-center justify-between border-b border-gray-100 pb-2.5">
              <h4 className="font-extrabold text-sm text-gray-900 flex items-center gap-1.5">
                 Customer Loan Limit Badhayein
              </h4>
              <button
                type="button"
                onClick={() => setEditLoanLimitCustomer(null)}
                className="w-7 h-7 rounded-full bg-gray-100 hover:bg-gray-200 text-gray-600 flex items-center justify-center text-xs font-bold cursor-pointer"
              >
                ✕
              </button>
            </div>

            <div className="text-xs space-y-1 bg-blue-50 border border-blue-200 p-3 rounded-2xl text-blue-950">
              <div>Customer: <strong>{editLoanLimitCustomer.name}</strong></div>
              <div>
                Vartamaan Limit: <strong className="font-mono">₹{Number(editLoanLimitCustomer.currentLimit).toLocaleString("en-IN")}</strong>
              </div>
            </div>

            <div>
              <label className="block text-xs font-bold text-gray-700 mb-1">
                Nayi Loan Limit (₹5,000 - ₹1,00,000)
              </label>
              <div className="relative">
                <span className="absolute left-3 top-2.5 text-gray-400 font-bold text-xs">₹</span>
                <input
                  type="number"
                  min={5000}
                  max={100000}
                  step={1000}
                  value={editLimitVal}
                  onChange={(e) => setEditLimitVal(e.target.value)}
                  placeholder="e.g. 25000"
                  className="w-full pl-7 pr-3 py-2 border border-gray-300 rounded-xl text-xs font-bold font-mono outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 bg-white"
                />
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setEditLoanLimitCustomer(null)}
                className="px-3 py-2 text-xs font-bold text-gray-600 hover:bg-gray-100 rounded-xl cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleUpdateCustomerLoanLimit}
                disabled={updatingLimit}
                className="px-4 py-2 text-xs font-black bg-blue-600 hover:bg-blue-700 text-white rounded-xl shadow-xs transition active:scale-95 disabled:opacity-50 cursor-pointer"
              >
                {updatingLimit ? "Updating..." : "Save Limit"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
