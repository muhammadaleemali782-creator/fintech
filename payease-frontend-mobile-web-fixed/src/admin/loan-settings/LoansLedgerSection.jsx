import React, { useState, useEffect, useCallback, useMemo } from "react";
import { tokenStorage } from "../../utils/tokenStorage";
import { API_BASE_URL } from "../../config";

export default function LoansLedgerSection({ onSwitchToIssueLoan, showToast }) {
  const getAuthToken = () => tokenStorage.getToken() || localStorage.getItem("token") || "";

  const [loans, setLoans] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loanDepartmentPool, setLoanDepartmentPool] = useState({
    totalPool: 1000000,
    basePool: 1000000,
    earnedSurplus: 0,
    marketDisbursed: 0,
    availablePool: 1000000,
    activeLoansCount: 0,
    utilizationPercent: 0
  });

  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("all"); // "all" | "active" | "pending" | "closed" | "rejected"
  const [expandedLoanId, setExpandedLoanId] = useState(null);
  const [expandedAuditId, setExpandedAuditId] = useState(null);
  const [actionLoadingId, setActionLoadingId] = useState(null);

  // Admin Language preference (English | Hinglish)
  const [adminLang, setAdminLang] = useState(() => {
    try {
      return localStorage.getItem("educa_admin_lang") || "hinglish";
    } catch {
      return "hinglish";
    }
  });

  const toggleAdminLang = (lang) => {
    setAdminLang(lang);
    try {
      localStorage.setItem("educa_admin_lang", lang);
    } catch {}
  };

  // Fetch loans and pool
  const fetchLoansData = useCallback(async () => {
    setLoading(true);
    const token = getAuthToken();
    const headers = { Authorization: `Bearer ${token}` };

    try {
      const [loansRes, poolRes] = await Promise.all([
        fetch(`${API_BASE_URL}/loan/all`, { headers }),
        fetch(`${API_BASE_URL}/loan/department-pool`, { headers })
      ]);

      if (loansRes.ok) {
        const loansData = await loansRes.json();
        if (Array.isArray(loansData)) setLoans(loansData);
      }
      if (poolRes.ok) {
        const poolData = await poolRes.json();
        if (poolData && poolData.success) setLoanDepartmentPool(poolData);
      }
    } catch (err) {
      if (showToast) showToast(err.message || "Failed to load loans", true);
    } finally {
      setLoading(false);
    }
  }, [showToast]);

  useEffect(() => {
    fetchLoansData();
  }, [fetchLoansData]);

  // Loan Action Handlers (Approve / Reject)
  const handleApproveLoan = async (loanId) => {
    if (!window.confirm("Kya aap is loan application ko APPROVE karna chahte hain?")) return;
    setActionLoadingId(loanId);
    try {
      const token = getAuthToken();
      const res = await fetch(`${API_BASE_URL}/loan/${loanId}/approve`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json"
        }
      });
      const data = await res.json();
      if (res.ok) {
        if (showToast) showToast(data.message || "Loan approved successfully!");
        fetchLoansData();
      } else {
        if (showToast) showToast(data.message || "Failed to approve loan", true);
      }
    } catch {
      if (showToast) showToast("Error approving loan", true);
    } finally {
      setActionLoadingId(null);
    }
  };

  const handleRejectLoan = async (loanId) => {
    const reason = window.prompt("Loan reject karne ka reason daalein (Optional):", "Documents incomplete");
    if (reason === null) return;
    setActionLoadingId(loanId);
    try {
      const token = getAuthToken();
      const res = await fetch(`${API_BASE_URL}/loan/${loanId}/reject`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({ reason })
      });
      const data = await res.json();
      if (res.ok) {
        if (showToast) showToast(data.message || "Loan rejected", true);
        fetchLoansData();
      } else {
        if (showToast) showToast(data.message || "Failed to reject loan", true);
      }
    } catch {
      if (showToast) showToast("Error rejecting loan", true);
    } finally {
      setActionLoadingId(null);
    }
  };

  // Loan Actor Helper (Raised By & Approved/Rejected By)
  const getLoanActors = (l) => {
    let raised = { type: "user", label: "Self (Borrower)", name: l.userId?.name || "Customer" };
    const adminNote = String(l.documents?.adminNotes || l.adminNotes || "").toLowerCase();
    const hasAdminOnBehalf = adminNote.includes("applied by admin") || adminNote.includes("issue loan") || adminNote.includes("on behalf");
    const agentRec = l.agentRecommendation;
    const agentRef = l.referredByAgentId;
    const createdHistory = Array.isArray(l.history) ? l.history.find(h => h.action === "created" || h.action === "applied" || h.action === "issued") : null;

    if (agentRec?.subAgentName) {
      raised = { type: "sub_agent", label: `Sub-Agent: ${agentRec.subAgentName}`, name: agentRec.subAgentName };
    } else if (agentRec?.agentName) {
      raised = { type: "agent", label: `Agent: ${agentRec.agentName}`, name: agentRec.agentName };
    } else if (agentRef && typeof agentRef === "object" && agentRef.name) {
      raised = { type: "agent", label: `Agent: ${agentRef.name}`, name: agentRef.name };
    } else if (hasAdminOnBehalf || createdHistory?.actorRole === "admin") {
      raised = { type: "admin", label: "Admin (On Behalf)", name: "Admin" };
    } else if (createdHistory?.actorRole === "staff" || l.handledBy?.role === "staff") {
      const staffName = createdHistory?.actorName || l.handledBy?.name || "Staff";
      raised = { type: "staff", label: `Staff: ${staffName}`, name: staffName };
    } else {
      raised = { type: "user", label: `Self: ${l.userId?.name || "Borrower"}`, name: l.userId?.name || "Borrower" };
    }

    let approved = { status: l.status, label: "Approved by", name: l.approverName || "Admin", badgeClass: "bg-emerald-100 text-emerald-800 border-emerald-200", icon: "✓" };
    if (l.status === "rejected") {
      const rejectActor = l.handledBy?.action === "reject" ? l.handledBy.name : (Array.isArray(l.history) ? l.history.find(h => h.action === "reject")?.actorName : null);
      approved = {
        status: "rejected",
        label: "Rejected by",
        name: rejectActor || l.approverName || "Admin",
        badgeClass: "bg-rose-100 text-rose-800 border-rose-200",
        icon: "✕"
      };
    } else if (l.status === "pending") {
      approved = { status: "pending", label: "Status", name: "Pending Review", badgeClass: "bg-amber-100 text-amber-800 border-amber-200", icon: "⏳" };
    } else if (l.status === "closed") {
      approved = { status: "closed", label: "Closed", name: "Fully Paid", badgeClass: "bg-slate-100 text-slate-800 border-slate-200", icon: "✓" };
    }

    return { raised, approved };
  };

  // Filtered loans
  const filteredLoans = useMemo(() => {
    return loans.filter((l) => {
      if (statusFilter !== "all" && l.status !== statusFilter) return false;
      if (!searchQuery.trim()) return true;
      const q = searchQuery.toLowerCase().trim();
      const name = (l.userId?.name || "").toLowerCase();
      const phone = (l.userId?.phone || "").toLowerCase();
      const email = (l.userId?.email || "").toLowerCase();
      const acc = (l.accountNumber || "").toLowerCase();
      return name.includes(q) || phone.includes(q) || email.includes(q) || acc.includes(q);
    });
  }, [loans, statusFilter, searchQuery]);

  // Aggregate stats
  const disbursedLoans = useMemo(() => loans.filter(l => l.status === "active" || l.status === "approved" || l.status === "closed"), [loans]);
  const uniqueBorrowerIds = useMemo(() => new Set(disbursedLoans.map(l => String(l.userId?._id || l.userId?.id || l.userId || "")).filter(Boolean)), [disbursedLoans]);
  const totalDisbursedAmt = useMemo(() => disbursedLoans.reduce((s, l) => s + (l.amount || 0), 0), [disbursedLoans]);
  const totalPaidAmt = useMemo(() => disbursedLoans.reduce((s, l) => s + (l.paidAmount || 0), 0), [disbursedLoans]);
  const activeOutstandingAmt = useMemo(() => loans.filter(l => l.status === "active").reduce((s, l) => s + Number(l.remainingAmount !== undefined ? l.remainingAmount : Math.max(0, (l.totalPayable || l.amount || 0) - (l.paidAmount || 0))), 0), [loans]);
  const activeLoansCount = useMemo(() => loans.filter(l => l.status === "active").length, [loans]);

  const poolTotal = Number(loanDepartmentPool.totalPool || 1000000);
  const poolAvailable = loanDepartmentPool.availablePool !== undefined ? Number(loanDepartmentPool.availablePool) : Math.max(0, poolTotal - totalDisbursedAmt);
  const poolUtilPercent = poolTotal > 0 ? ((totalDisbursedAmt / poolTotal) * 100).toFixed(1) : "0.0";

  return (
    <div className="space-y-5 pb-16">
      {/* Top Header & Language Toggle */}
      <div className="bg-white rounded-2xl shadow-sm p-4 sm:p-5 border border-slate-200">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 mb-4 border-b border-slate-100">
          <div>
            <h3 className="text-base sm:text-lg font-black text-slate-900 flex items-center gap-2">
              <span>📋</span>
              <span>{adminLang === "en" ? "Loans & Ledger" : "Loans & Ledger Portfolio"}</span>
              <span className="px-2.5 py-0.5 rounded-full text-xs font-black bg-blue-100 text-blue-800">
                {disbursedLoans.length} Loans
              </span>
            </h3>
            <p className="text-xs text-slate-500 mt-0.5">
              {adminLang === "en"
                ? "Live portfolio records, customer schedules, installment collections, and audit logs."
                : "Sabhi active, pending aur completed loans ka live record, kist schedule aur audit."}
            </p>
          </div>

          <div className="flex items-center gap-2.5 flex-wrap">
            {/* Language Switcher */}
            <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-xl border border-slate-200">
              <span className="text-[10px] uppercase font-bold text-slate-400 px-1">Lang:</span>
              <button
                type="button"
                onClick={() => toggleAdminLang("en")}
                className={`px-2.5 py-1 rounded-lg text-xs font-bold transition cursor-pointer ${
                  adminLang === "en" ? "bg-white text-blue-700 shadow-2xs" : "text-slate-600 hover:text-slate-900"
                }`}
              >
                English
              </button>
              <button
                type="button"
                onClick={() => toggleAdminLang("hinglish")}
                className={`px-2.5 py-1 rounded-lg text-xs font-bold transition cursor-pointer ${
                  adminLang === "hinglish" ? "bg-white text-blue-700 shadow-2xs" : "text-slate-600 hover:text-slate-900"
                }`}
              >
                Hinglish
              </button>
            </div>

            {/* Issue Loan Button */}
            {onSwitchToIssueLoan && (
              <button
                type="button"
                onClick={onSwitchToIssueLoan}
                className="px-4 py-2 bg-blue-600 hover:bg-blue-700 active:scale-95 text-white rounded-xl text-xs font-black transition flex items-center gap-1.5 shadow-xs cursor-pointer"
              >
                <span>✍️</span>
                <span>{adminLang === "en" ? "Issue Loan / Apply" : "Issue Loan / Apply on Behalf"}</span>
              </button>
            )}
          </div>
        </div>

        {/* 5-Card Portfolio & Department Quota Summary */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2.5 sm:gap-3.5 mb-4">
          {/* Card 1: Loan Department Total Sanctioned / Assigned Pool */}
          <div className="p-3 sm:p-4 rounded-xl bg-purple-50 border border-purple-200">
            <span className="text-[11px] font-bold text-purple-700 block truncate">
              {adminLang === "en" ? "Dept Sanctioned Limit" : "Loan Dept Total Assigned"}
            </span>
            <div className="text-base sm:text-xl font-black text-purple-950 font-mono mt-0.5">
              ₹{poolTotal.toLocaleString("en-IN")}
            </div>
            <span className="text-[10px] text-purple-700 font-semibold block mt-0.5">
              {adminLang === "en" ? `Available: ₹${poolAvailable.toLocaleString("en-IN")}` : `Baki Available: ₹${poolAvailable.toLocaleString("en-IN")}`}
            </span>
          </div>

          {/* Card 2: Kitne Me Se Kitna Diya Gaya */}
          <div className="p-3 sm:p-4 rounded-xl bg-emerald-50 border border-emerald-200">
            <span className="text-[11px] font-bold text-emerald-700 block truncate">
              {adminLang === "en" ? "Disbursed vs Pool" : "Kitne Me Se Kitna Diya"}
            </span>
            <div className="text-base sm:text-xl font-black text-emerald-950 font-mono mt-0.5">
              ₹{totalDisbursedAmt.toLocaleString("en-IN")}
            </div>
            <span className="text-[10px] text-emerald-700 font-semibold block mt-0.5">
              {adminLang === "en" ? `Out of ₹${poolTotal.toLocaleString("en-IN")} (${poolUtilPercent}%)` : `₹${poolTotal.toLocaleString("en-IN")} me se (${poolUtilPercent}%)`}
            </span>
          </div>

          {/* Card 3: Kitne Ko Loan Gaya */}
          <div className="p-3 sm:p-4 rounded-xl bg-blue-50 border border-blue-200">
            <span className="text-[11px] font-bold text-blue-700 block truncate">
              {adminLang === "en" ? "Total Borrowers" : "Kitne Ko Loan Gaya"}
            </span>
            <div className="text-base sm:text-xl font-black text-blue-950 mt-0.5">
              {uniqueBorrowerIds.size} <span className="text-xs font-semibold text-blue-700">Borrowers</span>
            </div>
            <span className="text-[10px] text-blue-700 font-semibold block mt-0.5">
              {disbursedLoans.length} {adminLang === "en" ? "Total Loans Disbursed" : "Total Loans Diye"}
            </span>
          </div>

          {/* Card 4: Kitna Wapas Aaya (Paid) */}
          <div className="p-3 sm:p-4 rounded-xl bg-teal-50 border border-teal-200">
            <span className="text-[11px] font-bold text-teal-700 block truncate">
              {adminLang === "en" ? "Total Repayments" : "Kitna Wapas Aaya (Paid)"}
            </span>
            <div className="text-base sm:text-xl font-black text-teal-950 font-mono mt-0.5">
              ₹{totalPaidAmt.toLocaleString("en-IN")}
            </div>
            <span className="text-[10px] text-teal-700 font-semibold block mt-0.5">
              {adminLang === "en" ? "EMIs & Recovered Capital" : "Recovered Paisa"}
            </span>
          </div>

          {/* Card 5: Bacha Hua Due (Active) */}
          <div className="p-3 sm:p-4 rounded-xl bg-amber-50 border border-amber-200 col-span-2 sm:col-span-1">
            <span className="text-[11px] font-bold text-amber-700 block truncate">
              {adminLang === "en" ? "Active Dues" : "Bacha Hua Due (Active)"}
            </span>
            <div className="text-base sm:text-xl font-black text-amber-950 font-mono mt-0.5">
              ₹{activeOutstandingAmt.toLocaleString("en-IN")}
            </div>
            <span className="text-[10px] text-amber-700 font-semibold block mt-0.5">
              {activeLoansCount} {adminLang === "en" ? "Active Loans in Market" : "Active Loans"}
            </span>
          </div>
        </div>

        {/* Search & Status Filters */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-3 border-t border-slate-100">
          <div className="relative flex-1 max-w-md">
            <span className="absolute left-3 top-2.5 text-slate-400 text-xs">🔍</span>
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder={adminLang === "en" ? "Search by customer name, phone, account #..." : "Customer name, phone, account number se khojein..."}
              className="w-full pl-8 pr-3 py-2 text-xs font-medium text-slate-800 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:border-blue-500 focus:bg-white transition"
            />
          </div>

          {/* Status Filter Tabs */}
          <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar py-1">
            {[
              { id: "all", label: adminLang === "en" ? "All" : "Sabhi" },
              { id: "active", label: adminLang === "en" ? "Active" : "Active" },
              { id: "pending", label: adminLang === "en" ? "Pending" : "Pending" },
              { id: "closed", label: adminLang === "en" ? "Closed" : "Closed" },
              { id: "rejected", label: adminLang === "en" ? "Rejected" : "Rejected" }
            ].map((f) => (
              <button
                key={f.id}
                type="button"
                onClick={() => setStatusFilter(f.id)}
                className={`px-3 py-1.5 rounded-xl text-xs font-bold transition cursor-pointer shrink-0 ${
                  statusFilter === f.id
                    ? "bg-blue-600 text-white shadow-2xs"
                    : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                }`}
              >
                {f.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Loans List with Skeleton Loader */}
      {loading ? (
        <div className="space-y-3.5">
          {[1, 2, 3].map((n) => (
            <div key={n} className="bg-white rounded-2xl p-4 sm:p-5 border border-slate-200 animate-pulse space-y-3">
              <div className="flex items-center justify-between">
                <div className="space-y-1.5">
                  <div className="w-36 h-4 bg-slate-200 rounded" />
                  <div className="w-48 h-3 bg-slate-100 rounded" />
                </div>
                <div className="w-20 h-6 bg-slate-200 rounded-full" />
              </div>
              <div className="w-full h-8 bg-slate-100 rounded-xl" />
              <div className="grid grid-cols-3 sm:grid-cols-6 gap-2">
                {[1, 2, 3, 4, 5, 6].map((i) => (
                  <div key={i} className="h-10 bg-slate-100 rounded-lg" />
                ))}
              </div>
            </div>
          ))}
        </div>
      ) : filteredLoans.length === 0 ? (
        <div className="p-12 text-center bg-white rounded-2xl border border-slate-200 space-y-2">
          <span className="text-3xl">📭</span>
          <h4 className="text-sm font-bold text-slate-800">No Loans Found</h4>
          <p className="text-xs text-slate-500">Filter ya search query ke hisab se koi loan record nahi mila.</p>
        </div>
      ) : (
        <div className="space-y-3.5">
          {filteredLoans.map((l) => {
            const schedule = (l.installmentSchedule && l.installmentSchedule.length > 0) ? l.installmentSchedule : (l.emiSchedule || []);
            const paidCount = schedule.filter(s => s.status === "paid").length;
            const totalCount = schedule.length || l.installmentsCount || l.tenure || 0;
            const isExpanded = expandedLoanId === l._id;
            const { raised, approved } = getLoanActors(l);
            const isAuditOpen = expandedAuditId === l._id;
            const isRejected = l.status === "rejected";

            return (
              <div
                key={l._id}
                className={`bg-white rounded-2xl p-4 sm:p-5 border transition shadow-xs ${
                  isRejected ? "border-rose-200 bg-rose-50/20" : "border-slate-200 hover:border-slate-300"
                }`}
              >
                {/* Header row */}
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 pb-3 border-b border-slate-100">
                  <div>
                    <div className="flex items-center gap-2 flex-wrap">
                      <h4 className="text-base font-bold text-slate-900">{l.userId?.name || "Customer"}</h4>
                      {l.accountNumber && (
                        <span className="px-2 py-0.5 rounded-md text-[11px] font-mono font-bold bg-slate-100 text-slate-700 border border-slate-200">
                          {l.accountNumber}
                        </span>
                      )}
                      <span className={`px-2 py-0.5 rounded-full text-[10px] font-black uppercase ${
                        l.loanType === "student"
                          ? "bg-sky-100 text-sky-800 border border-sky-200"
                          : l.loanType === "micro_business"
                          ? "bg-teal-100 text-teal-800 border border-teal-200"
                          : "bg-blue-100 text-blue-800 border border-blue-200"
                      }`}>
                        {l.loanType === "student" ? "Student" : l.loanType === "micro_business" ? "Micro" : "Personal"}
                      </span>
                    </div>
                    <p className="text-xs text-slate-500 mt-0.5">
                      {l.userId?.phone ? `Phone: ${l.userId.phone}` : ""} {l.userId?.email ? `• ${l.userId.email}` : ""}
                    </p>
                  </div>

                  {/* Actions & Status Badge */}
                  <div className="flex items-center gap-2 flex-wrap self-start sm:self-auto">
                    {l.status === "pending" && (
                      <div className="flex items-center gap-1.5">
                        <button
                          type="button"
                          disabled={actionLoadingId === l._id}
                          onClick={() => handleApproveLoan(l._id)}
                          className="px-2.5 py-1 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs transition active:scale-95 cursor-pointer shadow-2xs"
                        >
                          {actionLoadingId === l._id ? "..." : "✓ Approve"}
                        </button>
                        <button
                          type="button"
                          disabled={actionLoadingId === l._id}
                          onClick={() => handleRejectLoan(l._id)}
                          className="px-2.5 py-1 rounded-lg bg-rose-600 hover:bg-rose-700 text-white font-bold text-xs transition active:scale-95 cursor-pointer shadow-2xs"
                        >
                          ✕ Reject
                        </button>
                      </div>
                    )}

                    <span className={`px-3 py-1 rounded-full text-xs font-bold shrink-0 ${
                      isRejected
                        ? "bg-rose-100 text-rose-800 border border-rose-300 font-black"
                        : l.status === "active"
                        ? "bg-emerald-100 text-emerald-800 border border-emerald-300"
                        : l.status === "pending"
                        ? "bg-amber-100 text-amber-800 border border-amber-300"
                        : "bg-slate-100 text-slate-800 border border-slate-300"
                    }`}>
                      {l.status.toUpperCase()}
                    </span>
                  </div>
                </div>

                {/* Origin & Approver Status Bar */}
                <div className="my-3 p-2.5 rounded-xl border border-slate-200 bg-slate-50/80 flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs">
                  <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1">
                    <div className="flex items-center gap-1">
                      <span className="text-[10px] uppercase font-bold text-slate-400">Raised:</span>
                      <span className="inline-flex items-center gap-1 font-bold text-slate-800 bg-white px-2 py-0.5 rounded-md border border-slate-200 text-[11px] shadow-2xs">
                        <span>{raised.label}</span>
                      </span>
                    </div>
                    <span className="text-slate-300 hidden sm:inline">•</span>
                    <div className="flex items-center gap-1">
                      <span className="text-[10px] uppercase font-bold text-slate-400">{approved.label}:</span>
                      <span className={`inline-flex items-center gap-1 font-bold px-2 py-0.5 rounded-md border text-[11px] shadow-2xs ${approved.badgeClass}`}>
                        <span>{approved.icon}</span>
                        <span>{approved.name}</span>
                      </span>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => setExpandedAuditId(isAuditOpen ? null : l._id)}
                    className="text-[10px] font-bold text-blue-600 hover:text-blue-800 transition cursor-pointer self-end sm:self-auto"
                  >
                    {isAuditOpen ? "Chhupayein ▲" : "Audit Details ▾"}
                  </button>
                </div>

                {/* Collapsible extended audit */}
                {isAuditOpen && (
                  <div className="mb-3 p-3 bg-white rounded-xl border border-slate-200 text-[11px] space-y-2 animate-in fade-in duration-150">
                    <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2">
                      <div className="p-2 bg-slate-50 rounded-lg border border-slate-100">
                        <span className="text-slate-400 block text-[10px] font-bold uppercase">Application Origin</span>
                        <p className="font-bold text-slate-800 mt-0.5">{raised.label}</p>
                      </div>
                      <div className="p-2 bg-slate-50 rounded-lg border border-slate-100">
                        <span className="text-slate-400 block text-[10px] font-bold uppercase">Decision Status</span>
                        <p className="font-bold text-slate-800 mt-0.5">{approved.name} ({approved.status.toUpperCase()})</p>
                      </div>
                      <div className="p-2 bg-slate-50 rounded-lg border border-slate-100">
                        <span className="text-slate-400 block text-[10px] font-bold uppercase">Applied Date</span>
                        <p className="font-bold text-slate-800 mt-0.5">
                          {l.createdAt ? new Date(l.createdAt).toLocaleDateString("en-IN") : "-"}
                        </p>
                      </div>
                    </div>
                  </div>
                )}

                {/* Financial Numbers Bar */}
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-6 gap-2.5 p-3 bg-slate-50/60 rounded-xl border border-slate-100 text-xs">
                  <div>
                    <span className="text-[10px] font-bold text-slate-400 uppercase block">Loan Sanctioned</span>
                    <span className="text-sm font-black text-slate-900 font-mono">₹{(l.amount || 0).toLocaleString("en-IN")}</span>
                  </div>
                  <div>
                    <span className="text-[10px] font-bold text-slate-400 uppercase block">Disbursal Payout</span>
                    <span className="text-sm font-black text-emerald-700 font-mono">
                      {isRejected ? "₹0 (Rejected)" : `₹${(l.disbursalAmount || l.amount || 0).toLocaleString("en-IN")}`}
                    </span>
                  </div>
                  <div>
                    <span className="text-[10px] font-bold text-slate-400 uppercase block">Dept Fee Cut</span>
                    <span className="text-sm font-black text-indigo-700 font-mono">
                      {isRejected ? "₹0 (Rejected)" : `₹${((l.processingFee || 0) + (l.upiCharges || 0)).toLocaleString("en-IN")}`}
                    </span>
                  </div>
                  <div>
                    <span className="text-[10px] font-bold text-slate-400 uppercase block">Installment EMI</span>
                    <span className="text-sm font-black text-slate-900 font-mono">
                      {isRejected ? "₹0" : `₹${(l.installmentAmount || l.emiAmount || 0).toLocaleString("en-IN")}`}
                    </span>
                  </div>
                  <div>
                    <span className="text-[10px] font-bold text-slate-400 uppercase block">Paid / Total</span>
                    <span className="text-sm font-black text-blue-700 font-mono">
                      {isRejected ? "0 / 0" : `${paidCount} / ${totalCount}`}
                    </span>
                  </div>
                  <div>
                    <span className="text-[10px] font-bold text-slate-400 uppercase block">Remaining Dues</span>
                    <span className="text-sm font-black text-rose-700 font-mono">
                      {isRejected ? "₹0" : `₹${(l.remainingAmount !== undefined ? l.remainingAmount : (l.totalPayable || 0)).toLocaleString("en-IN")}`}
                    </span>
                  </div>
                </div>

                {/* Installment Schedule Toggle */}
                {!isRejected && schedule.length > 0 && (
                  <div className="mt-3 pt-2 border-t border-slate-100 flex items-center justify-between">
                    <button
                      type="button"
                      onClick={() => setExpandedLoanId(isExpanded ? null : l._id)}
                      className="text-xs font-bold text-blue-600 hover:text-blue-800 transition flex items-center gap-1 cursor-pointer"
                    >
                      <span>📅</span>
                      <span>{isExpanded ? "Hide Installment Schedule ▲" : `View Installment Schedule (${paidCount}/${totalCount} Paid) ▾`}</span>
                    </button>
                    <span className="text-[11px] text-slate-400 font-mono">
                      Cycle: {l.collectionFrequency === "daily" ? "Daily" : "10 Days"}
                    </span>
                  </div>
                )}

                {/* Expanded Schedule Table */}
                {isExpanded && schedule.length > 0 && (
                  <div className="mt-3 overflow-x-auto border border-slate-200 rounded-xl bg-white shadow-2xs">
                    <table className="w-full text-xs text-left">
                      <thead className="bg-slate-50 text-slate-500 font-bold uppercase text-[10px] border-b border-slate-200">
                        <tr>
                          <th className="px-3 py-2">#</th>
                          <th className="px-3 py-2">Due Date</th>
                          <th className="px-3 py-2">Amount</th>
                          <th className="px-3 py-2">Status</th>
                          <th className="px-3 py-2">Paid On</th>
                          <th className="px-3 py-2">UTR / Proof</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {schedule.map((inst, idx) => (
                          <tr key={idx} className={inst.status === "paid" ? "bg-emerald-50/30" : ""}>
                            <td className="px-3 py-2 font-mono font-bold">{inst.installmentNo || (idx + 1)}</td>
                            <td className="px-3 py-2 font-mono">
                              {inst.dueDate ? new Date(inst.dueDate).toLocaleDateString("en-IN") : "-"}
                            </td>
                            <td className="px-3 py-2 font-mono font-bold">₹{inst.amount?.toLocaleString("en-IN")}</td>
                            <td className="px-3 py-2">
                              <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                                inst.status === "paid"
                                  ? "bg-emerald-100 text-emerald-800"
                                  : inst.status === "submitted"
                                  ? "bg-amber-100 text-amber-800"
                                  : inst.status === "overdue"
                                  ? "bg-rose-100 text-rose-800"
                                  : "bg-slate-100 text-slate-600"
                              }`}>
                                {inst.status?.toUpperCase()}
                              </span>
                            </td>
                            <td className="px-3 py-2 text-slate-500 font-mono">
                              {inst.paidOn ? new Date(inst.paidOn).toLocaleDateString("en-IN") : "-"}
                            </td>
                            <td className="px-3 py-2 font-mono text-[11px] text-slate-600">
                              {inst.utrNumber || (inst.proofUrl ? "Proof Uploaded" : "-")}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
