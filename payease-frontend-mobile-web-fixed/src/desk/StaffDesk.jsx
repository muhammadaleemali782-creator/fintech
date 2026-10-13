import React, { useState, useEffect, useMemo, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { API } from "../config";
import { tokenStorage } from "../utils/tokenStorage";
import usePermissions from "../hooks/usePermissions";
import Can from "../components/Can";

// Department definitions
const DEPT_CONFIG = {
  deposit: { label: "Deposits", icon: "💰", perm: "deposit.view", processPerm: "deposit.process" },
  withdrawal: { label: "Withdrawals", icon: "💸", perm: "withdrawal.view", processPerm: "withdrawal.process" },
  loan: { label: "Loans", icon: "📄", perm: "loan.view", processPerm: "loan.process" },
  kyc: { label: "KYC Verifications", icon: "🪪", perm: "kyc.view", processPerm: "kyc.process" },
  lending: { label: "P2P Lending", icon: "🤝", perm: "lending.view", processPerm: "lending.process" },
  bond: { label: "Bonds & FD", icon: "📈", perm: "bond.view", processPerm: "bond.process" }
};

export default function StaffDesk() {
  const navigate = useNavigate();
  const {
    user,
    role,
    isAdmin,
    isStaff,
    departments: allowedDepts,
    hasPermission,
    canAccessDepartment,
    canApproveAmount,
    maxApprovalAmount
  } = usePermissions();

  const token = tokenStorage.getToken();

  // Active department tab
  const availableTabs = useMemo(() => {
    return Object.keys(DEPT_CONFIG).filter(dept => canAccessDepartment(dept));
  }, [canAccessDepartment]);

  const [activeTab, setActiveTab] = useState(() => availableTabs[0] || "deposit");

  useEffect(() => {
    if (availableTabs.length > 0 && !availableTabs.includes(activeTab)) {
      setActiveTab(availableTabs[0]);
    }
  }, [availableTabs, activeTab]);

  // Data states
  const [queues, setQueues] = useState({
    deposit: [],
    withdrawal: [],
    loan: [],
    kyc: [],
    lending: [],
    bond: []
  });
  const [counts, setCounts] = useState({});
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState("");
  const [successToast, setSuccessToast] = useState("");

  // Filters
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");

  // Selected item for drawer/modal
  const [selectedItem, setSelectedItem] = useState(null);
  const [actionModal, setActionModal] = useState(null); // { item, type: 'approve' | 'reject' }
  const [actionReason, setActionReason] = useState("");
  const [adminEvidenceUrl, setAdminEvidenceUrl] = useState("");
  const [actionLoading, setActionLoading] = useState(false);
  const [enlargedImage, setEnlargedImage] = useState(null);

  const showToast = useCallback((msg, isErr = false) => {
    if (isErr) {
      setErrorMsg(msg);
      setTimeout(() => setErrorMsg(""), 5000);
    } else {
      setSuccessToast(msg);
      setTimeout(() => setSuccessToast(""), 4000);
    }
  }, []);

  // Fetch queues
  const fetchQueues = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const res = await fetch(`${API}/admin/desk/queues`, {
        headers: {
          Authorization: `Bearer ${token}`,
          "Cache-Control": "no-cache"
        }
      });
      if (res.status === 401 || res.status === 403) {
        showToast("Session expired or unauthorized. Please re-login.", true);
        tokenStorage.removeToken();
        localStorage.removeItem("user");
        navigate("/login");
        return;
      }
      const data = await res.json();
      if (data.success && data.queues) {
        setQueues(data.queues);
        setCounts(data.counts || {});
      } else {
        setErrorMsg(data.message || "Failed to load desk queues");
      }
    } catch (err) {
      if (!silent) setErrorMsg("Connection error: " + err.message);
    } finally {
      if (!silent) setLoading(false);
    }
  }, [token, navigate, showToast]);

  useEffect(() => {
    fetchQueues();
  }, [fetchQueues]);

  // Real-time SSE integration
  useEffect(() => {
    if (!token) return;
    let eventSource = null;
    try {
      eventSource = new EventSource(`${API}/admin/notifications/stream?token=${encodeURIComponent(token)}`);
      eventSource.onmessage = (event) => {
        try {
          const payload = JSON.parse(event.data);
          if (payload.type === "permissions_revoked") {
            showToast("Your permissions have been updated. Refreshing...", true);
            setTimeout(() => window.location.reload(), 1500);
            return;
          }
          if (["deposit", "withdrawal", "loan", "kyc", "lending", "bond", "claim"].some(k => (payload.type || "").includes(k))) {
            fetchQueues(true);
          }
        } catch {
          // heartbeat comment or non-json message
        }
      };
      eventSource.onerror = () => {
        // SSE disconnected, will auto-reconnect
      };
    } catch {
      // EventSource fallback
    }

    return () => {
      if (eventSource) eventSource.close();
    };
  }, [token, fetchQueues, showToast]);

  // Claim item lock
  const handleClaim = async (item, itemType) => {
    try {
      const res = await fetch(`${API}/admin/claim/${itemType}/${item._id}`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json"
        }
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || "Failed to claim item");
      showToast("Locked item for your desk processing.");
      fetchQueues(true);
      if (selectedItem && selectedItem._id === item._id) {
        setSelectedItem(prev => ({
          ...prev,
          claim: {
            claimedBy: user?._id || user?.id,
            claimedByName: user?.name,
            claimedAt: new Date().toISOString(),
            expiresAt: new Date(Date.now() + 5 * 60 * 1000).toISOString()
          }
        }));
      }
    } catch (err) {
      showToast(err.message, true);
    }
  };

  // Release claim lock
  const handleReleaseClaim = async (item, itemType) => {
    try {
      const res = await fetch(`${API}/admin/release-claim/${itemType}/${item._id}`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json"
        }
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || "Failed to release lock");
      showToast("Lock released.");
      fetchQueues(true);
      if (selectedItem && selectedItem._id === item._id) {
        setSelectedItem(prev => ({ ...prev, claim: null }));
      }
    } catch (err) {
      showToast(err.message, true);
    }
  };

  // Process Action (Approve / Reject)
  const handleExecuteAction = async () => {
    if (!actionModal) return;
    const { item, type: actionType, department } = actionModal;

    if (actionType === "reject" && !actionReason.trim()) {
      showToast("Rejection reason is required.", true);
      return;
    }

    setActionLoading(true);
    try {
      let endpoint = "";
      let bodyData = {};

      if (department === "deposit" || department === "withdrawal") {
        endpoint = `${API}/admin/transaction/${item._id}/${actionType}`;
        bodyData = {
          remarks: actionReason.trim(),
          adminEvidenceUrl: adminEvidenceUrl.trim()
        };
      } else if (department === "loan") {
        endpoint = `${API}/loan/${item._id}/${actionType}`;
        bodyData = { reason: actionReason.trim() };
      } else if (department === "kyc") {
        endpoint = `${API}/admin/kyc/${item._id}/${actionType}`;
        bodyData = { reason: actionReason.trim() };
      } else if (department === "bond") {
        endpoint = `${API}/bond/${item._id}/${actionType}`;
        bodyData = { reason: actionReason.trim() };
      } else {
        throw new Error("Unsupported department action");
      }

      const res = await fetch(endpoint, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify(bodyData)
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || `Failed to ${actionType} item`);

      showToast(`Item successfully ${actionType}d.`);
      setActionModal(null);
      setActionReason("");
      setAdminEvidenceUrl("");
      setSelectedItem(null);
      fetchQueues(true);
    } catch (err) {
      showToast(err.message, true);
    } finally {
      setActionLoading(false);
    }
  };

  // Filter current queue items
  const currentItems = useMemo(() => {
    const list = queues[activeTab] || [];
    return list.filter(item => {
      if (statusFilter !== "all") {
        const itemStatus = (item.status || "pending").toLowerCase();
        if (statusFilter === "pending" && !["pending", "hold"].includes(itemStatus)) return false;
        if (statusFilter === "approved" && !["approved", "completed", "active"].includes(itemStatus)) return false;
        if (statusFilter === "rejected" && itemStatus !== "rejected") return false;
      }

      if (searchTerm.trim()) {
        const q = searchTerm.toLowerCase();
        const userName = (item.userId?.name || item.userName || "").toLowerCase();
        const userEmail = (item.userId?.email || item.userEmail || "").toLowerCase();
        const userPhone = (item.userId?.phone || item.userPhone || "").toLowerCase();
        const ref = (item.reference || item.accountNumber || item._id || "").toLowerCase();
        const amountStr = String(item.amount || item.principalAmount || "");

        return userName.includes(q) || userEmail.includes(q) || userPhone.includes(q) || ref.includes(q) || amountStr.includes(q);
      }

      return true;
    });
  }, [queues, activeTab, statusFilter, searchTerm]);

  // Check claim status for an item
  const getClaimStatus = (item) => {
    if (!item.claim || !item.claim.claimedBy) return { isClaimed: false };
    const isExpired = new Date(item.claim.expiresAt).getTime() < Date.now();
    if (isExpired) return { isClaimed: false };

    const myId = String(user?._id || user?.id || "");
    const isClaimedByMe = String(item.claim.claimedBy) === myId;
    return {
      isClaimed: true,
      isClaimedByMe,
      claimedByName: item.claim.claimedByName || "Staff",
      expiresAt: item.claim.expiresAt
    };
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col antialiased selection:bg-blue-600 selection:text-white">
      {/* Toast Alert Banner */}
      {errorMsg && (
        <div className="fixed top-4 left-1/2 -translate-x-1/2 z-50 bg-rose-600/95 text-white px-5 py-3 rounded-xl shadow-2xl backdrop-blur-md flex items-center gap-3 border border-rose-500 max-w-md w-full">
          <span className="text-xl">⚠️</span>
          <p className="text-xs font-semibold leading-relaxed flex-1">{errorMsg}</p>
          <button onClick={() => setErrorMsg("")} className="text-white/80 hover:text-white font-bold text-sm">✕</button>
        </div>
      )}
      {successToast && (
        <div className="fixed top-4 left-1/2 -translate-x-1/2 z-50 bg-emerald-600/95 text-white px-5 py-3 rounded-xl shadow-2xl backdrop-blur-md flex items-center gap-3 border border-emerald-500 max-w-md w-full">
          <span className="text-xl">✅</span>
          <p className="text-xs font-semibold leading-relaxed flex-1">{successToast}</p>
          <button onClick={() => setSuccessToast("")} className="text-white/80 hover:text-white font-bold text-sm">✕</button>
        </div>
      )}

      {/* Top Navigation Bar */}
      <header className="sticky top-0 z-40 bg-slate-900/90 backdrop-blur-md border-b border-slate-800 px-4 sm:px-8 py-3.5 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-blue-600 to-indigo-600 flex items-center justify-center shadow-lg shadow-blue-500/20 font-black text-lg">
            🏢
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-base sm:text-lg font-black tracking-tight text-white">Educa Staff Desk</h1>
              <span className={`px-2 py-0.5 text-[10px] font-bold rounded-full uppercase tracking-wider ${isAdmin ? "bg-amber-500/20 text-amber-300 border border-amber-500/30" : "bg-blue-500/20 text-blue-300 border border-blue-500/30"}`}>
                {role}
              </span>
            </div>
            <p className="text-[11px] text-slate-400 font-medium">
              Department Operations & Queues • Logged in as <span className="text-slate-200 font-semibold">{user?.name}</span>
            </p>
          </div>
        </div>

        {/* Action Controls */}
        <div className="flex items-center gap-2">
          <button
            onClick={() => fetchQueues(false)}
            disabled={loading}
            className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 active:scale-95 text-xs font-medium rounded-lg border border-slate-700 transition flex items-center gap-1.5"
            title="Reload queue data"
          >
            <span className={loading ? "animate-spin" : ""}>🔄</span>
            <span className="hidden sm:inline">Refresh</span>
          </button>

          {isAdmin && (
            <button
              onClick={() => navigate("/admin")}
              className="px-3 py-1.5 bg-indigo-600/30 hover:bg-indigo-600/50 text-indigo-300 active:scale-95 text-xs font-semibold rounded-lg border border-indigo-500/40 transition flex items-center gap-1"
            >
              <span>⚙️</span>
              <span className="hidden sm:inline">Admin Panel</span>
            </button>
          )}

          <button
            onClick={() => navigate("/dashboard")}
            className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 active:scale-95 text-xs font-semibold rounded-lg border border-slate-700 transition flex items-center gap-1"
          >
            <span>📱</span>
            <span className="hidden sm:inline">Dashboard</span>
          </button>
        </div>
      </header>

      {/* Main Workspace Body */}
      <main className="flex-1 max-w-7xl w-full mx-auto p-4 sm:p-6 lg:p-8 flex flex-col gap-6">
        {/* Desk Profile & Limit Summary Pill */}
        <div className="bg-slate-900/70 border border-slate-800 rounded-2xl p-4 flex flex-wrap items-center justify-between gap-4">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs text-slate-400 font-semibold">Assigned Departments:</span>
            {allowedDepts.map(dept => (
              <span key={dept} className="px-2.5 py-1 bg-slate-800 text-slate-200 text-xs font-bold rounded-lg border border-slate-700/80">
                {DEPT_CONFIG[dept]?.icon || "📁"} {DEPT_CONFIG[dept]?.label || dept}
              </span>
            ))}
          </div>

          <div className="flex items-center gap-4 text-xs font-medium text-slate-400">
            {maxApprovalAmount > 0 ? (
              <span>Approval Limit: <strong className="text-amber-400 font-bold">₹{maxApprovalAmount.toLocaleString("en-IN")}</strong></span>
            ) : (
              <span className="text-emerald-400 font-bold">✨ Unlimited Approval Limit</span>
            )}
          </div>
        </div>

        {/* Department Tabs Bar */}
        <div className="flex items-center gap-2 overflow-x-auto pb-1 scrollbar-thin scrollbar-thumb-slate-800">
          {availableTabs.map((deptKey) => {
            const conf = DEPT_CONFIG[deptKey];
            const isActive = activeTab === deptKey;
            const count = counts[deptKey] || 0;

            return (
              <button
                key={deptKey}
                onClick={() => {
                  setActiveTab(deptKey);
                  setSelectedItem(null);
                }}
                className={`flex items-center gap-2 px-4 py-2.5 rounded-xl font-bold text-xs sm:text-sm whitespace-nowrap transition-all border ${
                  isActive
                    ? "bg-blue-600 text-white border-blue-500 shadow-lg shadow-blue-600/30"
                    : "bg-slate-900/60 hover:bg-slate-800 text-slate-400 hover:text-slate-200 border-slate-800"
                }`}
              >
                <span>{conf.icon}</span>
                <span>{conf.label}</span>
                <span
                  className={`ml-1 px-2 py-0.5 rounded-full text-[11px] font-black ${
                    isActive
                      ? "bg-white/20 text-white"
                      : count > 0
                      ? "bg-rose-500/20 text-rose-400 border border-rose-500/30"
                      : "bg-slate-800 text-slate-500"
                  }`}
                >
                  {count}
                </span>
              </button>
            );
          })}
        </div>

        {/* Filter and Search Bar */}
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 bg-slate-900/60 p-3 rounded-2xl border border-slate-800/80">
          <div className="relative flex-1">
            <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-500 text-sm">🔍</span>
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder={`Search ${DEPT_CONFIG[activeTab]?.label || 'queue'} by user, phone, account, ID...`}
              className="w-full bg-slate-950/80 border border-slate-800 rounded-xl pl-10 pr-4 py-2 text-xs sm:text-sm text-slate-100 placeholder-slate-500 focus:outline-none focus:border-blue-500 transition"
            />
            {searchTerm && (
              <button
                onClick={() => setSearchTerm("")}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300 text-xs font-bold"
              >
                ✕
              </button>
            )}
          </div>

          <div className="flex items-center gap-2">
            <label className="text-xs text-slate-400 font-semibold hidden sm:inline">Status:</label>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="bg-slate-950 border border-slate-800 text-slate-200 text-xs rounded-xl px-3 py-2 font-medium focus:outline-none focus:border-blue-500"
            >
              <option value="all">All Items</option>
              <option value="pending">Pending Only</option>
              <option value="approved">Approved</option>
              <option value="rejected">Rejected</option>
            </select>
          </div>
        </div>

        {/* Queue Items Grid / List */}
        {loading ? (
          <div className="py-20 flex flex-col items-center justify-center gap-3 text-slate-400">
            <div className="w-8 h-8 border-2 border-slate-700 border-t-blue-500 rounded-full animate-spin" />
            <p className="text-xs font-semibold">Loading department queue...</p>
          </div>
        ) : currentItems.length === 0 ? (
          <div className="py-16 text-center bg-slate-900/30 rounded-2xl border border-dashed border-slate-800 flex flex-col items-center justify-center gap-2">
            <span className="text-4xl">🎉</span>
            <h3 className="text-sm font-bold text-slate-300">All clear! No items in this queue</h3>
            <p className="text-xs text-slate-500 max-w-sm">
              There are currently no items matching your filter criteria in the {DEPT_CONFIG[activeTab]?.label} desk.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {currentItems.map((item) => {
              const claimInfo = getClaimStatus(item);
              const amount = item.amount || item.principalAmount || 0;
              const isOverLimit = maxApprovalAmount > 0 && amount > maxApprovalAmount;
              const isSelfAction = String(item.userId?._id || item.userId || "") === String(user?._id || user?.id || "");
              const canProcess = hasPermission(DEPT_CONFIG[activeTab]?.processPerm) && !isSelfAction && (!claimInfo.isClaimed || claimInfo.isClaimedByMe);

              return (
                <div
                  key={item._id}
                  className={`bg-slate-900/80 border rounded-2xl p-4 flex flex-col justify-between gap-4 transition hover:border-slate-700 shadow-sm ${
                    claimInfo.isClaimedByMe
                      ? "border-blue-500/50 bg-blue-950/20 shadow-blue-950/30"
                      : claimInfo.isClaimed
                      ? "border-amber-500/40 bg-amber-950/10 opacity-80"
                      : "border-slate-800"
                  }`}
                >
                  {/* Top Bar: Status & Amount */}
                  <div>
                    <div className="flex items-start justify-between gap-2 mb-2">
                      <span className={`px-2.5 py-1 text-[10px] font-extrabold rounded-lg uppercase tracking-wider border ${
                        item.status === "approved" || item.status === "completed" || item.status === "active"
                          ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/30"
                          : item.status === "rejected"
                          ? "bg-rose-500/10 text-rose-400 border-rose-500/30"
                          : item.status === "hold"
                          ? "bg-amber-500/10 text-amber-400 border-amber-500/30"
                          : "bg-blue-500/10 text-blue-400 border-blue-500/30 animate-pulse"
                      }`}>
                        {item.status || "pending"}
                      </span>

                      {amount > 0 && (
                        <span className="text-base font-black text-white">
                          ₹{amount.toLocaleString("en-IN")}
                        </span>
                      )}
                    </div>

                    {/* User Identity */}
                    <h4 className="text-sm font-bold text-slate-100 truncate">
                      {item.userId?.name || item.userName || "Customer"}
                    </h4>
                    <p className="text-xs text-slate-400 truncate">
                      {item.userId?.email || item.userEmail || item.userId?.phone || item.userPhone || "—"}
                    </p>

                    {/* Metadata details */}
                    <div className="mt-2.5 pt-2 border-t border-slate-800/80 flex flex-col gap-1 text-[11px] text-slate-400">
                      {item.accountNumber && (
                        <div className="flex justify-between">
                          <span className="text-slate-500">A/C:</span>
                          <span className="font-mono text-slate-300 font-semibold">{item.accountNumber}</span>
                        </div>
                      )}
                      {item.reference && (
                        <div className="flex justify-between">
                          <span className="text-slate-500">Ref:</span>
                          <span className="font-mono text-slate-300">{item.reference}</span>
                        </div>
                      )}
                      {item.purpose && (
                        <div className="flex justify-between">
                          <span className="text-slate-500">Purpose:</span>
                          <span className="text-slate-300 truncate max-w-[150px]">{item.purpose}</span>
                        </div>
                      )}
                      <div className="flex justify-between">
                        <span className="text-slate-500">Requested:</span>
                        <span className="text-slate-400">
                          {item.createdAt ? new Date(item.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', day: 'numeric', month: 'short' }) : "—"}
                        </span>
                      </div>
                    </div>

                    {/* Claim Lock Status Badge */}
                    {claimInfo.isClaimed && (
                      <div className="mt-3 p-2 rounded-xl text-xs flex items-center justify-between border bg-slate-950/70">
                        {claimInfo.isClaimedByMe ? (
                          <div className="flex items-center gap-1.5 text-blue-400 font-bold text-[11px]">
                            <span>🔒</span>
                            <span>Claimed by you</span>
                          </div>
                        ) : (
                          <div className="flex items-center gap-1.5 text-amber-400 font-bold text-[11px]">
                            <span>🔒</span>
                            <span className="truncate">Claimed by {claimInfo.claimedByName}</span>
                          </div>
                        )}
                        {claimInfo.isClaimedByMe && (
                          <button
                            onClick={() => handleReleaseClaim(item, activeTab)}
                            className="text-[10px] text-slate-400 hover:text-rose-400 underline font-semibold"
                          >
                            Release
                          </button>
                        )}
                      </div>
                    )}

                    {/* Warning Badges */}
                    {isSelfAction && (
                      <div className="mt-2 px-2.5 py-1 rounded-lg bg-rose-500/10 border border-rose-500/20 text-rose-400 text-[10px] font-bold">
                        ⚠️ Self-action is forbidden
                      </div>
                    )}
                    {isOverLimit && (
                      <div className="mt-2 px-2.5 py-1 rounded-lg bg-amber-500/10 border border-amber-500/20 text-amber-400 text-[10px] font-bold">
                        ⚠️ Exceeds approval limit (₹{maxApprovalAmount})
                      </div>
                    )}
                  </div>

                  {/* Actions Bar */}
                  <div className="pt-2 border-t border-slate-800 flex items-center gap-2">
                    <button
                      onClick={() => setSelectedItem(item)}
                      className="flex-1 py-1.5 px-3 bg-slate-800 hover:bg-slate-700 active:scale-95 text-slate-200 text-xs font-bold rounded-xl border border-slate-700/80 transition"
                    >
                      Inspect 🔍
                    </button>

                    {!claimInfo.isClaimed && (
                      <button
                        onClick={() => handleClaim(item, activeTab)}
                        className="py-1.5 px-3 bg-slate-800/80 hover:bg-blue-600/30 text-blue-400 text-xs font-bold rounded-xl border border-blue-500/30 transition"
                        title="Lock for exclusive review"
                      >
                        Claim 🔒
                      </button>
                    )}

                    {canProcess && ["pending", "hold"].includes(item.status || "pending") && (
                      <>
                        <button
                          disabled={isOverLimit}
                          onClick={() => setActionModal({ item, type: "approve", department: activeTab })}
                          className={`py-1.5 px-3 text-xs font-extrabold rounded-xl transition ${
                            isOverLimit
                              ? "bg-slate-800 text-slate-600 cursor-not-allowed"
                              : "bg-emerald-600 hover:bg-emerald-500 active:scale-95 text-white shadow-md shadow-emerald-600/20"
                          }`}
                        >
                          Approve ✓
                        </button>
                        <button
                          onClick={() => setActionModal({ item, type: "reject", department: activeTab })}
                          className="py-1.5 px-3 bg-rose-600/20 hover:bg-rose-600/30 active:scale-95 text-rose-400 text-xs font-bold rounded-xl border border-rose-500/30 transition"
                        >
                          Reject ✕
                        </button>
                      </>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </main>

      {/* Item Detail Drawer / Modal */}
      {selectedItem && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-3xl max-w-lg w-full max-h-[90vh] overflow-y-auto p-6 shadow-2xl flex flex-col gap-4">
            <div className="flex items-center justify-between pb-3 border-b border-slate-800">
              <div>
                <h3 className="text-base font-black text-white">Item Details</h3>
                <span className="text-xs text-slate-400 font-medium">Department: {DEPT_CONFIG[activeTab]?.label}</span>
              </div>
              <button
                onClick={() => setSelectedItem(null)}
                className="w-8 h-8 rounded-full bg-slate-800 text-slate-400 hover:text-white flex items-center justify-center font-bold"
              >
                ✕
              </button>
            </div>

            {/* Content Details */}
            <div className="space-y-3 text-xs">
              <div className="p-3 bg-slate-950 rounded-2xl border border-slate-800/80 space-y-2">
                <div className="flex justify-between">
                  <span className="text-slate-400">Target User:</span>
                  <span className="font-bold text-white">{selectedItem.userId?.name || selectedItem.userName || "Customer"}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-400">Email:</span>
                  <span className="text-slate-300">{selectedItem.userId?.email || selectedItem.userEmail || "—"}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-400">Phone:</span>
                  <span className="text-slate-300">{selectedItem.userId?.phone || selectedItem.userPhone || "—"}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-400">Amount:</span>
                  <span className="font-extrabold text-white text-sm">₹{(selectedItem.amount || selectedItem.principalAmount || 0).toLocaleString("en-IN")}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-400">Status:</span>
                  <span className="font-bold text-blue-400 uppercase">{selectedItem.status || "pending"}</span>
                </div>
              </div>

              {/* Bank / Transfer Details */}
              {(selectedItem.accountNumber || selectedItem.upiId || selectedItem.ifsc) && (
                <div className="p-3 bg-slate-950 rounded-2xl border border-slate-800/80 space-y-1.5">
                  <h5 className="font-bold text-slate-300 mb-1">Payment Endpoint Details</h5>
                  {selectedItem.accountNumber && (
                    <div className="flex justify-between">
                      <span className="text-slate-400">Account:</span>
                      <span className="font-mono text-slate-200">{selectedItem.accountNumber}</span>
                    </div>
                  )}
                  {selectedItem.ifsc && (
                    <div className="flex justify-between">
                      <span className="text-slate-400">IFSC:</span>
                      <span className="font-mono text-slate-200">{selectedItem.ifsc}</span>
                    </div>
                  )}
                  {selectedItem.upiId && (
                    <div className="flex justify-between">
                      <span className="text-slate-400">UPI ID:</span>
                      <span className="font-mono text-slate-200">{selectedItem.upiId}</span>
                    </div>
                  )}
                </div>
              )}

              {/* Proof / Screenshot Evidence */}
              {(selectedItem.screenshotUrl || selectedItem.proofUrl || selectedItem.documents?.chequeUrl) && (
                <div className="p-3 bg-slate-950 rounded-2xl border border-slate-800/80">
                  <h5 className="font-bold text-slate-300 mb-2">Attached Proof / Receipt</h5>
                  <img
                    src={selectedItem.screenshotUrl || selectedItem.proofUrl || selectedItem.documents?.chequeUrl}
                    alt="Transaction Evidence"
                    onClick={() => setEnlargedImage(selectedItem.screenshotUrl || selectedItem.proofUrl || selectedItem.documents?.chequeUrl)}
                    className="max-h-48 w-full object-contain rounded-xl border border-slate-800 cursor-pointer hover:opacity-90 transition bg-black"
                  />
                  <p className="text-[10px] text-slate-500 mt-1 text-center">Click image to enlarge</p>
                </div>
              )}

              {/* Audit history on item */}
              {Array.isArray(selectedItem.history) && selectedItem.history.length > 0 && (
                <div className="p-3 bg-slate-950 rounded-2xl border border-slate-800/80 space-y-1">
                  <h5 className="font-bold text-slate-300 mb-2">Action Trail</h5>
                  {selectedItem.history.map((h, i) => (
                    <div key={i} className="text-[11px] text-slate-400 border-l-2 border-slate-700 pl-2 py-0.5">
                      <strong className="text-slate-200">{h.name || h.by}</strong> ({h.role || "staff"}): {h.action} {h.note ? `• "${h.note}"` : ""}
                      <div className="text-[10px] text-slate-500">{new Date(h.at).toLocaleString()}</div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Drawer Actions */}
            <div className="pt-3 border-t border-slate-800 flex items-center justify-end gap-2">
              <button
                onClick={() => setSelectedItem(null)}
                className="px-4 py-2 bg-slate-800 text-slate-300 font-bold rounded-xl text-xs hover:bg-slate-700"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Action Execution Sheet / Modal (Approve or Reject) */}
      {actionModal && (
        <div className="fixed inset-0 z-50 bg-black/85 backdrop-blur-md flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-3xl max-w-md w-full p-6 shadow-2xl flex flex-col gap-4">
            <div className="flex items-center justify-between pb-2 border-b border-slate-800">
              <h3 className="text-base font-black text-white flex items-center gap-2">
                <span>{actionModal.type === "approve" ? "✅ Confirm Approval" : "✕ Confirm Rejection"}</span>
              </h3>
              <button
                onClick={() => setActionModal(null)}
                className="w-7 h-7 rounded-full bg-slate-800 text-slate-400 hover:text-white flex items-center justify-center font-bold"
              >
                ✕
              </button>
            </div>

            <p className="text-xs text-slate-400">
              You are about to <strong className={actionModal.type === "approve" ? "text-emerald-400" : "text-rose-400"}>{actionModal.type}</strong> this item for{" "}
              <strong className="text-white">{actionModal.item.userId?.name || actionModal.item.userName || "Customer"}</strong> (₹{(actionModal.item.amount || actionModal.item.principalAmount || 0).toLocaleString("en-IN")}).
            </p>

            {/* Rejection Reason (Mandatory) */}
            {actionModal.type === "reject" && (
              <div>
                <label className="text-xs font-bold text-slate-300 block mb-1">
                  Reason for Rejection <span className="text-rose-500">*</span>
                </label>
                <textarea
                  value={actionReason}
                  onChange={(e) => setActionReason(e.target.value)}
                  placeholder="Explain why this request is being rejected (visible in audit log)..."
                  rows={3}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl p-3 text-xs text-slate-100 placeholder-slate-500 focus:outline-none focus:border-rose-500"
                />
              </div>
            )}

            {/* Approval Evidence & Remarks (Optional) */}
            {actionModal.type === "approve" && (
              <div className="space-y-3">
                <div>
                  <label className="text-xs font-bold text-slate-300 block mb-1">
                    Approval Remarks / Note (Optional)
                  </label>
                  <input
                    type="text"
                    value={actionReason}
                    onChange={(e) => setActionReason(e.target.value)}
                    placeholder="e.g. Verified bank UTR and customer identity"
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-slate-100 placeholder-slate-500 focus:outline-none focus:border-blue-500"
                  />
                </div>
                {actionModal.department === "withdrawal" && (
                  <div>
                    <label className="text-xs font-bold text-slate-300 block mb-1">
                      Bank Transfer UTR / Proof Link (Optional)
                    </label>
                    <input
                      type="text"
                      value={adminEvidenceUrl}
                      onChange={(e) => setAdminEvidenceUrl(e.target.value)}
                      placeholder="https://... or UTR receipt URL"
                      className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-slate-100 placeholder-slate-500 focus:outline-none focus:border-blue-500"
                    />
                  </div>
                )}
              </div>
            )}

            {/* Execution Buttons with Double-Click Prevention */}
            <div className="pt-3 border-t border-slate-800 flex items-center justify-end gap-2">
              <button
                disabled={actionLoading}
                onClick={() => setActionModal(null)}
                className="px-4 py-2 bg-slate-800 text-slate-300 font-bold rounded-xl text-xs hover:bg-slate-700 disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                disabled={actionLoading}
                onClick={handleExecuteAction}
                className={`px-5 py-2 text-xs font-extrabold rounded-xl transition flex items-center gap-1.5 shadow-lg ${
                  actionModal.type === "approve"
                    ? "bg-emerald-600 hover:bg-emerald-500 text-white shadow-emerald-600/30"
                    : "bg-rose-600 hover:bg-rose-500 text-white shadow-rose-600/30"
                } disabled:opacity-50 disabled:cursor-not-allowed`}
              >
                {actionLoading && <div className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />}
                <span>{actionLoading ? "Processing..." : `Confirm ${actionModal.type === "approve" ? "Approval" : "Rejection"}`}</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Enlarged Image Lightbox */}
      {enlargedImage && (
        <div
          onClick={() => setEnlargedImage(null)}
          className="fixed inset-0 z-50 bg-black/95 flex items-center justify-center p-4 cursor-zoom-out"
        >
          <img
            src={enlargedImage}
            alt="Enlarged Document"
            className="max-h-[90vh] max-w-[90vw] object-contain rounded-2xl"
          />
        </div>
      )}
    </div>
  );
}
