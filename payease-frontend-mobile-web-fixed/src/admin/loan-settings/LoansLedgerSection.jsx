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
  const [cardAdvanceOptions, setCardAdvanceOptions] = useState({}); // { [loanId]: "none" | "deduct" | "waive" }
  const [installmentActionLoadingId, setInstallmentActionLoadingId] = useState(null);
  const [markPaidModal, setMarkPaidModal] = useState(null); // { loan, installment, paymentMode, utrNumber, evidenceNote }
  const [submittingPayment, setSubmittingPayment] = useState(false);

  // Lightbox Modal State
  const [lightboxImg, setLightboxImg] = useState(null);
  const [zoomLevel, setZoomLevel] = useState(1);

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
    const advanceOption = cardAdvanceOptions[loanId] || "none";
    if (!window.confirm(`Kya aap is loan application ko APPROVE karna chahte hain? (Pehli kist setting: ${advanceOption.toUpperCase()})`)) return;
    setActionLoadingId(loanId);
    try {
      const token = getAuthToken();
      const res = await fetch(`${API_BASE_URL}/loan/${loanId}/approve`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({ advanceOption })
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

  // Toggle Penalty Waiver for a loan (Admin authority)
  const togglePenaltyWaiver = async (loanId, shouldWaive) => {
    try {
      const token = getAuthToken();
      const res = await fetch(`${API_BASE_URL}/loan/${loanId}/toggle-penalty-waiver`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({ waive: shouldWaive })
      });
      const data = await res.json();
      if (showToast) showToast(data.message || "Penalty setting updated!", !res.ok);
      if (res.ok) fetchLoansData();
    } catch {
      if (showToast) showToast("Failed to toggle penalty waiver", true);
    }
  };

  // Approve single installment proof
  const handleApproveInstallmentProof = async (loanId, installmentNo) => {
    if (!window.confirm(`Installment #${installmentNo} proof approve karein? Balance update ho jayega.`)) return;
    setInstallmentActionLoadingId(`${loanId}_${installmentNo}`);
    try {
      const token = getAuthToken();
      const res = await fetch(`${API_BASE_URL}/loan/admin/${loanId}/installment/${installmentNo}/approve`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({ approverName: "Admin" })
      });
      const data = await res.json();
      if (showToast) showToast(data.message || `Installment #${installmentNo} approved!`, !res.ok);
      if (res.ok) fetchLoansData();
    } catch {
      if (showToast) showToast("Failed to approve installment", true);
    } finally {
      setInstallmentActionLoadingId(null);
    }
  };

  // Admin Mark Paid
  const handleAdminMarkPaid = async (e) => {
    if (e && e.preventDefault) e.preventDefault();
    if (!markPaidModal) return;
    const { loan, installment, paymentMode, utrNumber, evidenceNote } = markPaidModal;
    setSubmittingPayment(true);
    try {
      const token = getAuthToken();
      const res = await fetch(`${API_BASE_URL}/loan/admin/${loan._id}/installment/${installment.installmentNo}/admin-pay`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          utrNumber: utrNumber ? utrNumber.trim() : `OFFLINE-${Date.now()}`,
          evidenceNote: `${paymentMode || "UPI"}: ${evidenceNote || "Admin verified offline repayment"}`
        })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || "Failed to mark installment paid");

      if (showToast) showToast(data.message || `Installment #${installment.installmentNo} safaltapoorvak PAID mark ho gayi! Pool balance badh gaya.`);
      setMarkPaidModal(null);
      fetchLoansData();
    } catch (err) {
      if (showToast) showToast(err.message || "Payment process karne me error aaya", true);
    } finally {
      setSubmittingPayment(false);
    }
  };

  // Loan Actor Helper (Raised By & Approved/Rejected By)
  const getLoanActors = (l) => {
    let raised = { type: "user", label: "Self (Borrower)", name: l.userId?.name || "Customer" };
    if (l.appliedByRole === "agent") {
      raised = { type: "agent", label: `Agent (${l.appliedByName || l.agentRecommendation?.agentName || "Agent Partner"})`, name: l.appliedByName || "Agent" };
    } else if (l.appliedByRole === "sub_agent") {
      raised = { type: "sub_agent", label: `Sub-Agent (${l.appliedByName || "Sub-Agent"})`, name: l.appliedByName || "Sub-Agent" };
    } else if (l.appliedByRole === "admin") {
      raised = { type: "admin", label: "Admin (On Behalf)", name: l.appliedByName || "Admin" };
    } else if (l.appliedByRole === "staff") {
      raised = { type: "staff", label: `Staff (${l.appliedByName || "Staff Desk"})`, name: l.appliedByName || "Staff Desk" };
    }

    let approved = { status: "pending", label: "Decision", name: "Under Review", icon: "⏳", badgeClass: "bg-amber-100 text-amber-800 border-amber-300" };
    if (l.status === "approved" || l.status === "active" || l.status === "closed") {
      const byWhom = l.approvedByRole === "agent" ? `Agent (${l.approvedByName || "Agent"})` : l.approvedByName || "Admin";
      approved = { status: "approved", label: "Approved By", name: byWhom, icon: "✓", badgeClass: "bg-emerald-100 text-emerald-800 border-emerald-300" };
    } else if (l.status === "rejected") {
      const byWhom = l.approvedByName || "Admin";
      approved = { status: "rejected", label: "Rejected By", name: byWhom, icon: "✕", badgeClass: "bg-rose-100 text-rose-800 border-rose-300" };
    }

    return { raised, approved };
  };

  // Filtered loans
  const filteredLoans = useMemo(() => {
    return loans.filter((l) => {
      const name = (l.userId?.name || "").toLowerCase();
      if (l.status === "pending" && (name.includes("ajay") || name.includes("ajaygupta"))) return false;
      if (statusFilter !== "all" && l.status !== statusFilter) return false;
      if (!searchQuery.trim()) return true;
      const q = searchQuery.toLowerCase().trim();
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

  const poolBase = Number(loanDepartmentPool.basePool || 1000000);
  const earnedSurplus = Number(loanDepartmentPool.earnedSurplus || 0);
  // Total Sanctioned Limit expands strictly above basePool only when actual surplus profit has arrived
  const poolTotal = Math.round(poolBase + earnedSurplus);
  // Available Cash: poolTotal minus disbursed plus repayments that have come back in
  const poolAvailable = loanDepartmentPool.availablePool !== undefined 
    ? Number(loanDepartmentPool.availablePool) 
    : Math.max(0, poolTotal - totalDisbursedAmt + totalPaidAmt);
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
                ? "Live portfolio records, customer schedules, installment collections, verification documents, and audit logs."
                : "Sabhi active, pending aur completed loans ka live record, kist schedule, verification documents aur audit."}
            </p>
          </div>

          <div className="flex items-center gap-2.5 flex-wrap">
            {/* Language Switcher - Compact & Mobile-Optimized */}
            <div className="inline-flex items-center p-0.5 bg-slate-100 rounded-lg border border-slate-200 shadow-2xs">
              <button
                type="button"
                onClick={() => toggleAdminLang("en")}
                className={`px-2 py-0.5 rounded-md text-[11px] font-bold transition cursor-pointer ${
                  adminLang === "en" ? "bg-white text-blue-700 shadow-2xs" : "text-slate-500 hover:text-slate-900"
                }`}
              >
                English
              </button>
              <button
                type="button"
                onClick={() => toggleAdminLang("hinglish")}
                className={`px-2 py-0.5 rounded-md text-[11px] font-bold transition cursor-pointer ${
                  adminLang === "hinglish" ? "bg-white text-blue-700 shadow-2xs" : "text-slate-500 hover:text-slate-900"
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
        <div className="space-y-4">
          {filteredLoans.map((l) => {
            const schedule = (l.installmentSchedule && l.installmentSchedule.length > 0) ? l.installmentSchedule : (l.emiSchedule || []);
            const paidCount = schedule.filter(s => s.status === "paid").length;
            const submittedCount = schedule.filter(s => s.status === "submitted").length;
            const totalCount = schedule.length || l.installmentsCount || l.tenure || 0;
            const isExpanded = expandedLoanId === l._id;
            const { raised, approved } = getLoanActors(l);
            const isAuditOpen = expandedAuditId === l._id;
            const isRejected = l.status === "rejected";
            const isPending = l.status === "pending";

            const pFee = Number(l.processingFee !== undefined && l.processingFee !== null ? l.processingFee : Math.round(l.amount * 0.05));
            const uFee = Number(l.upiCharges !== undefined && l.upiCharges !== null ? l.upiCharges : Math.round(l.amount * 0.01));
            const inHand = isRejected ? 0 : Number(l.disbursalAmount || Math.max(0, l.amount - pFee - uFee));
            const loanDeptShare = isRejected ? 0 : (pFee + uFee + Number(l.paidAmount || 0));

            // Documents
            const userKyc = l.userId?.kycDocuments || {};
            const docs = { ...userKyc, ...(l.documents || {}) };
            const aadharFront = docs.doc1Url || docs.aadharUrl;
            const aadharBack = docs.doc1BackUrl || docs.aadharBackUrl;
            const panFront = docs.doc2Url || docs.panUrl || docs.panCardUrl;
            const panBack = docs.doc2BackUrl || docs.panBackUrl || docs.panCardBackUrl;
            const chequeFront = docs.chequeUrl || docs.chequeFrontUrl || docs.bearerChequeUrl;
            const chequeBack = docs.chequeBackUrl || docs.bearerChequeBackUrl;
            const studentFront = docs.studentProofUrl;
            const studentBack = docs.studentProofBackUrl;
            const offlineProof = docs.offlineEvidenceUrl || l.documents?.offlineEvidenceUrl;
            const hasAnyDocs = Boolean(aadharFront || aadharBack || panFront || panBack || chequeFront || chequeBack || studentFront || studentBack || offlineProof);

            // Pending advance selection
            const chosenAdvance = cardAdvanceOptions[l._id] || "none";
            const basePayout = Math.max(0, l.amount - (pFee + uFee));
            const instAmt = l.installmentAmount || l.emiAmount || 0;
            const advancePayout = Math.max(0, basePayout - instAmt);
            const currentDisburseAmount = chosenAdvance === "none" ? basePayout : chosenAdvance === "deduct" ? advancePayout : basePayout;

            return (
              <div
                key={l._id}
                className={`bg-white rounded-2xl p-4 sm:p-5 border transition shadow-xs ${
                  isRejected ? "border-rose-200 bg-rose-50/20" : "border-slate-200 hover:border-slate-300"
                }`}
              >
                {/* 1. Header row */}
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
                    <span className={`px-3 py-1 rounded-full text-xs font-bold shrink-0 ${
                      isRejected
                        ? "bg-rose-100 text-rose-800 border border-rose-300 font-black"
                        : l.status === "active"
                        ? "bg-emerald-100 text-emerald-800 border border-emerald-300"
                        : l.status === "pending"
                        ? "bg-amber-100 text-amber-800 border border-amber-300 font-bold"
                        : "bg-slate-100 text-slate-800 border border-slate-300"
                    }`}>
                      {l.status.toUpperCase()}
                    </span>
                  </div>
                </div>

                {/* 2. Origin & Approver Status Bar */}
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
                    <span className="text-slate-300 hidden md:inline">•</span>
                    <div className="flex items-center gap-1">
                      <span className="text-[10px] uppercase font-bold text-slate-400">Dept Mila:</span>
                      <span className="font-mono font-black text-[11px] text-indigo-900 bg-indigo-50/80 px-1.5 py-0.5 rounded border border-indigo-200">
                        ₹{loanDeptShare.toLocaleString("en-IN")}
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
                      <div className="p-2 bg-indigo-50/70 rounded-lg border border-indigo-100">
                        <span className="text-indigo-700 block text-[10px] font-bold uppercase">Loan Dept Received</span>
                        <p className="font-mono font-black text-indigo-950 mt-0.5">₹{loanDeptShare.toLocaleString("en-IN")}</p>
                        <p className="text-[10px] text-indigo-700 mt-0.5">
                          {isRejected ? "Loan rejected (No fee collected)" : `₹${pFee + uFee} Upfront Fees + ₹${l.paidAmount || 0} Collected`}
                        </p>
                      </div>
                    </div>
                    {(l.documents?.adminNotes || l.agentRecommendation?.explanationNote) && (
                      <p className="text-[10px] text-slate-600 bg-slate-50 p-2 rounded border border-slate-100 font-mono">
                        <strong>Note:</strong> {l.documents?.adminNotes || l.agentRecommendation?.explanationNote}
                      </p>
                    )}
                  </div>
                )}

                {/* 3. 10:00 AM Cutoff & Rollover Policy Desk */}
                {l.status === "active" && (
                  <div className="mb-3 p-3 bg-indigo-50/80 border border-indigo-200 rounded-xl text-xs space-y-1.5">
                    <div className="flex flex-wrap items-center justify-between gap-1 font-extrabold text-indigo-950">
                      <span className="flex items-center gap-1.5">
                        <span>⏰</span> Collection Cutoff & Rollover Niyam
                      </span>
                      <span className="bg-indigo-100 text-indigo-800 text-[10px] px-2 py-0.5 rounded-full font-mono font-bold">
                        Subah 10:00 AM Deadline
                      </span>
                    </div>
                    <p className="text-[11px] text-indigo-900 leading-relaxed">
                      Har kist subah 10:00 AM se pehle bharni hoti hai. <strong>10:00 AM ke baad 2% penalty</strong> lagti hai. Agar 1 kist chhoot gayi to agle installment me rollover hokar jud jayegi.
                    </p>
                    {Boolean(l.penaltyDue > 0 || l.overdueInstallmentsCount > 0 || l.overdueCount > 0) && (
                      <div className="mt-2 p-2.5 bg-white rounded-lg border border-rose-200 text-[11px] space-y-1 font-mono">
                        <div className="flex justify-between text-gray-700">
                          <span>Chhooti Hui Kist (Missed EMIs):</span>
                          <span className="font-bold text-gray-900">₹{(((l.overdueInstallmentsCount || l.overdueCount || 1)) * (l.installmentAmount || l.emiAmount || 0)).toLocaleString("en-IN")} ({l.overdueInstallmentsCount || l.overdueCount || 1} Kist)</span>
                        </div>
                        <div className="flex justify-between text-rose-700">
                          <span>2% Overdue Penalty:</span>
                          <span className="font-bold text-rose-700">+₹{Number(l.penaltyDue || 0).toLocaleString("en-IN")}</span>
                        </div>
                        <div className="flex justify-between text-indigo-950 font-black pt-1 border-t border-rose-100 text-xs">
                          <span>Kul Vasooli (EMI + Penalty Abhi Lena Hai):</span>
                          <span className="text-emerald-700 font-black">₹{((((l.overdueInstallmentsCount || l.overdueCount || 1)) * (l.installmentAmount || l.emiAmount || 0)) + Number(l.penaltyDue || 0)).toLocaleString("en-IN")}</span>
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {/* 4. Overdue Penalty Controller & Banner */}
                {l.status === "active" && (l.penaltyDue > 0 || l.overdueInstallmentsCount > 0 || l.penaltyWaived) && (
                  <div className={`mb-3 p-3 rounded-xl border flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs ${
                    l.penaltyWaived ? "bg-amber-50 border-amber-200 text-amber-900" : "bg-rose-50 border-rose-200 text-rose-900"
                  }`}>
                    <div>
                      <span className="font-extrabold flex items-center gap-1.5">
                        <span>{l.penaltyWaived ? "⏸️" : "⚠️"}</span>
                        <span>{l.penaltyWaived ? "Overdue Penalty Waived / On Hold" : `Active Overdue Penalty: ₹${Number(l.penaltyDue || 0).toLocaleString("en-IN")}`}</span>
                      </span>
                      <p className="text-[11px] opacity-80 mt-0.5">
                        {l.penaltyWaived
                          ? "Admin authority se penalty waive kar rakhi hai. Borrower se penalty nahi li jayegi."
                          : `${l.overdueInstallmentsCount || l.overdueCount || 1} overdue installment par 2% per installment jod kar penalty calculate hui hai.`}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => togglePenaltyWaiver(l._id, !l.penaltyWaived)}
                      className={`px-3 py-1.5 rounded-lg text-xs font-bold transition cursor-pointer self-start sm:self-auto shadow-2xs ${
                        l.penaltyWaived
                          ? "bg-rose-600 hover:bg-rose-700 text-white"
                          : "bg-amber-600 hover:bg-amber-700 text-white"
                      }`}
                    >
                      {l.penaltyWaived ? "Re-apply 2% Penalty" : "Waive / Hold Penalty"}
                    </button>
                  </div>
                )}

                {/* 5. User In-Hand Disbursal Breakdown Desk */}
                {isRejected ? (
                  <div className="mb-3 p-3 bg-rose-50 border border-rose-200 rounded-xl text-xs space-y-1">
                    <div className="flex flex-wrap items-center justify-between gap-1.5 font-bold text-rose-950">
                      <span>Loan Application Status: REJECTED</span>
                      <span className="text-[10px] bg-rose-100 text-rose-800 px-2 py-0.5 rounded-full font-mono">₹0 Disbursed</span>
                    </div>
                    <p className="text-[11px] text-rose-800">Ye loan reject ho gaya tha. Is par koi paisa transfer nahi hua.</p>
                  </div>
                ) : (
                  <div className="mb-3 p-3 bg-emerald-50/90 border border-emerald-200/90 rounded-xl text-xs space-y-1">
                    <div className="flex flex-wrap items-center justify-between gap-1.5">
                      <div className="flex items-center gap-1.5 font-black text-emerald-950">
                        <span>User Ke Account Me Jayega (In-Hand):</span>
                        <span className="font-mono text-sm font-black text-emerald-700 bg-emerald-100/70 px-2 py-0.5 rounded-lg border border-emerald-300/60">
                          ₹{inHand.toLocaleString("en-IN")}
                        </span>
                      </div>
                      <span className="text-[10px] bg-emerald-100 text-emerald-800 font-bold px-2 py-0.5 rounded-full font-mono">
                        Net Disbursed
                      </span>
                    </div>
                    <p className="text-[11px] text-emerald-900 leading-relaxed font-medium">
                      <strong>Kyu itna gaya:</strong> Sanctioned loan ₹{l.amount.toLocaleString("en-IN")} me se <strong>₹{pFee.toLocaleString("en-IN")} (5% Processing Fee)</strong> aur <strong>₹{uFee.toLocaleString("en-IN")} (1% Transfer/UPI Charge)</strong> deduct hokar user ko transfer hota hai. (Dept Upfront Fee: <strong>₹{(pFee + uFee).toLocaleString("en-IN")}</strong>).
                    </p>
                  </div>
                )}

                {/* 6. 7 Financial Metric Tiles */}
                <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-2 p-3 bg-slate-50/80 rounded-xl border border-slate-100 text-xs mb-3">
                  <div>
                    <span className="text-[10px] font-bold text-slate-400 uppercase block">Loan Sanctioned</span>
                    <span className="text-xs sm:text-sm font-black text-slate-900 font-mono">₹{(l.amount || 0).toLocaleString("en-IN")}</span>
                  </div>
                  <div className="bg-emerald-50/60 p-1 rounded-lg border border-emerald-200/60">
                    <span className="text-[10px] font-bold text-emerald-800 uppercase block">Khate Me Jayega</span>
                    <span className="text-xs sm:text-sm font-black text-emerald-700 font-mono">₹{inHand.toLocaleString("en-IN")}</span>
                  </div>
                  <div className="bg-indigo-50/60 p-1 rounded-lg border border-indigo-200/60">
                    <span className="text-[10px] font-bold text-indigo-800 uppercase block">Dept Fee Cut</span>
                    <span className="text-xs sm:text-sm font-black text-indigo-900 font-mono">₹{(pFee + uFee).toLocaleString("en-IN")}</span>
                  </div>
                  <div>
                    <span className="text-[10px] font-bold text-slate-400 uppercase block">Rate (locked)</span>
                    <span className="text-xs sm:text-sm font-black text-slate-800">{isRejected ? "0%" : `${l.interestRate}% p.a.`}</span>
                  </div>
                  <div>
                    <span className="text-[10px] font-bold text-slate-400 uppercase block">Per Installment</span>
                    <span className="text-xs sm:text-sm font-black text-slate-900 font-mono">₹{(l.installmentAmount || l.emiAmount || 0).toLocaleString("en-IN")}</span>
                  </div>
                  <div>
                    <span className="text-[10px] font-bold text-slate-400 uppercase block">Paid / Total</span>
                    <span className="text-xs sm:text-sm font-black text-blue-700 font-mono">{isRejected ? "0 / 0" : `${paidCount} / ${totalCount}`}</span>
                  </div>
                  <div>
                    <span className="text-[10px] font-bold text-slate-400 uppercase block">Remaining Dues</span>
                    <span className="text-xs sm:text-sm font-black text-rose-700 font-mono">₹{(l.remainingAmount !== undefined ? l.remainingAmount : (l.totalPayable || 0)).toLocaleString("en-IN")}</span>
                  </div>
                </div>

                {/* 7. Referral Commission Banner */}
                {l.referralCommissionPaid && (
                  <div className="mb-3 text-xs bg-orange-50 border border-orange-200 rounded-lg px-3 py-2 text-orange-700 font-semibold flex items-center gap-1.5">
                    <span>🎁</span>
                    <span>Referral commission ₹{l.referralCommissionAmount} paid on this loan</span>
                  </div>
                )}

                {/* 8. Early Pre-Closed (Foreclosure 3-Way Split) */}
                {l.earlyClosed && (
                  <div className="mb-3 text-xs bg-emerald-50 border border-emerald-200 rounded-xl p-3 text-emerald-950 space-y-1.5">
                    <div className="flex items-center justify-between font-bold">
                      <span className="flex items-center gap-1.5">
                        <span>⚡</span> Early Pre-Closed (Foreclosure 3-Way Split)
                      </span>
                      <span className="text-[10px] bg-emerald-200 text-emerald-900 px-2 py-0.5 rounded-full font-extrabold uppercase">
                        {l.precloseDiscountPercent ? `${l.precloseDiscountPercent}% Total Pool` : 'Closed Early'}
                      </span>
                    </div>
                    {l.precloseTotalPool > 0 ? (
                      <div className="grid grid-cols-3 gap-2 mt-2 pt-2 border-t border-emerald-200/60 text-[11px]">
                        <div className="bg-white/90 p-2 rounded-lg border border-emerald-100 shadow-2xs">
                          <span className="text-gray-500 block text-[10px] font-semibold">User Discount</span>
                          <strong className="text-emerald-700 text-xs font-mono">₹{(l.precloseUserDiscount || 0).toLocaleString("en-IN")}</strong>
                        </div>
                        <div className="bg-white/90 p-2 rounded-lg border border-emerald-100 shadow-2xs">
                          <span className="text-gray-500 block text-[10px] font-semibold">Agent Benefit</span>
                          <strong className="text-amber-700 text-xs font-mono">₹{(l.precloseAgentBenefit || 0).toLocaleString("en-IN")}</strong>
                        </div>
                        <div className="bg-white/90 p-2 rounded-lg border border-emerald-100 shadow-2xs">
                          <span className="text-gray-500 block text-[10px] font-semibold">Company Profit</span>
                          <strong className="text-blue-700 text-xs font-mono">₹{(l.precloseCompanyProfit || 0).toLocaleString("en-IN")}</strong>
                        </div>
                      </div>
                    ) : (
                      <p className="text-[11px] text-gray-600">Standard early closure payoff.</p>
                    )}
                  </div>
                )}

                {/* 9. Submitted Loan Documents Viewer */}
                {hasAnyDocs && (
                  <div className="p-3 bg-slate-50 border border-slate-200/90 rounded-xl space-y-2 mb-3">
                    <div className="flex items-center justify-between text-xs font-bold text-slate-800">
                      <span className="flex items-center gap-1.5">
                        <span>📁</span> Submitted Loan Verification Documents
                      </span>
                      {l.hasChequeFacility && (
                        <span className="text-[10px] bg-blue-50 text-blue-700 border border-blue-200 px-2 py-0.5 rounded-full font-bold">
                          Cheque Facility Active
                        </span>
                      )}
                    </div>
                    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-2">
                      {offlineProof && (
                        <button
                          type="button"
                          onClick={() => { setLightboxImg(offlineProof); setZoomLevel(1); }}
                          className="flex items-center justify-center gap-1 px-2 py-2 bg-emerald-50 border border-emerald-300 rounded-lg text-[11px] font-bold text-emerald-900 hover:bg-emerald-100 transition active:scale-95 cursor-pointer shadow-2xs"
                        >
                          <span>🧾</span> Offline Slip ↗
                        </button>
                      )}
                      {aadharFront && (
                        <button
                          type="button"
                          onClick={() => { setLightboxImg(aadharFront); setZoomLevel(1); }}
                          className="flex items-center justify-center gap-1 px-2 py-2 bg-white border border-slate-200 rounded-lg text-[11px] font-semibold text-slate-800 hover:bg-slate-100 transition active:scale-95 cursor-pointer shadow-2xs"
                        >
                          <span>🆔</span> Aadhaar (Front) ↗
                        </button>
                      )}
                      {aadharBack && (
                        <button
                          type="button"
                          onClick={() => { setLightboxImg(aadharBack); setZoomLevel(1); }}
                          className="flex items-center justify-center gap-1 px-2 py-2 bg-white border border-slate-200 rounded-lg text-[11px] font-semibold text-slate-800 hover:bg-slate-100 transition active:scale-95 cursor-pointer shadow-2xs"
                        >
                          <span>🆔</span> Aadhaar (Back) ↗
                        </button>
                      )}
                      {panFront && (
                        <button
                          type="button"
                          onClick={() => { setLightboxImg(panFront); setZoomLevel(1); }}
                          className="flex items-center justify-center gap-1 px-2 py-2 bg-white border border-slate-200 rounded-lg text-[11px] font-semibold text-slate-800 hover:bg-slate-100 transition active:scale-95 cursor-pointer shadow-2xs"
                        >
                          <span>💳</span> PAN (Front) ↗
                        </button>
                      )}
                      {panBack && (
                        <button
                          type="button"
                          onClick={() => { setLightboxImg(panBack); setZoomLevel(1); }}
                          className="flex items-center justify-center gap-1 px-2 py-2 bg-white border border-slate-200 rounded-lg text-[11px] font-semibold text-slate-800 hover:bg-slate-100 transition active:scale-95 cursor-pointer shadow-2xs"
                        >
                          <span>💳</span> PAN (Back) ↗
                        </button>
                      )}
                      {chequeFront && (
                        <button
                          type="button"
                          onClick={() => { setLightboxImg(chequeFront); setZoomLevel(1); }}
                          className="flex items-center justify-center gap-1 px-2 py-2 bg-white border border-amber-300 rounded-lg text-[11px] font-semibold text-amber-900 hover:bg-amber-50 transition active:scale-95 cursor-pointer shadow-2xs"
                        >
                          <span>🏛️</span> Cheque (Front) ↗
                        </button>
                      )}
                      {chequeBack && (
                        <button
                          type="button"
                          onClick={() => { setLightboxImg(chequeBack); setZoomLevel(1); }}
                          className="flex items-center justify-center gap-1 px-2 py-2 bg-white border border-amber-300 rounded-lg text-[11px] font-semibold text-amber-900 hover:bg-amber-50 transition active:scale-95 cursor-pointer shadow-2xs"
                        >
                          <span>🏛️</span> Cheque (Back) ↗
                        </button>
                      )}
                      {studentFront && (
                        <button
                          type="button"
                          onClick={() => { setLightboxImg(studentFront); setZoomLevel(1); }}
                          className="flex items-center justify-center gap-1 px-2 py-2 bg-white border border-sky-200 rounded-lg text-[11px] font-semibold text-sky-800 hover:bg-sky-50 transition active:scale-95 cursor-pointer shadow-2xs"
                        >
                          <span>🎓</span> Student ID (Front) ↗
                        </button>
                      )}
                      {studentBack && (
                        <button
                          type="button"
                          onClick={() => { setLightboxImg(studentBack); setZoomLevel(1); }}
                          className="flex items-center justify-center gap-1 px-2 py-2 bg-white border border-sky-200 rounded-lg text-[11px] font-semibold text-sky-800 hover:bg-sky-50 transition active:scale-95 cursor-pointer shadow-2xs"
                        >
                          <span>🎓</span> Student ID (Back) ↗
                        </button>
                      )}
                    </div>
                  </div>
                )}

                {/* 10. Pending Loan Decision & Advance Choice Desk */}
                {isPending && (
                  <div className="mt-3 pt-3 border-t border-slate-100 space-y-3">
                    <div className="p-3 sm:p-4 bg-slate-50 border border-slate-200 rounded-2xl space-y-2.5 shadow-2xs">
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1.5">
                        <div>
                          <h5 className="text-xs font-black text-gray-900 leading-tight">
                            Pehli Installment Setting (Admin Choice)
                          </h5>
                          <p className="text-[10px] text-gray-500 font-medium">
                            Admin chun sakta hai ki pehli kist abhi advance leni hai ya baad me:
                          </p>
                        </div>
                        <span className={`inline-flex items-center whitespace-nowrap text-[10px] font-black px-2.5 py-0.5 rounded-full border shadow-2xs ${
                          chosenAdvance === "none"
                            ? "bg-emerald-100 text-emerald-800 border-emerald-300"
                            : chosenAdvance === "deduct"
                            ? "bg-amber-100 text-amber-800 border-amber-300"
                            : "bg-sky-100 text-sky-800 border-sky-300"
                        }`}>
                          {chosenAdvance === "none" ? "NA LEIN (Pura Paisa)" : chosenAdvance === "deduct" ? "Advance Kaatein" : "Waive/Maaf"}
                        </span>
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
                        <button
                          type="button"
                          onClick={() => setCardAdvanceOptions(prev => ({ ...prev, [l._id]: "none" }))}
                          className={`p-3 rounded-xl border text-left transition active:scale-95 cursor-pointer ${
                            chosenAdvance === "none"
                              ? "bg-emerald-50 border-emerald-500 ring-2 ring-emerald-400 text-emerald-950 font-bold shadow-xs"
                              : "bg-white border-gray-200 text-gray-700 hover:bg-gray-50"
                          }`}
                        >
                          <div className="flex items-center justify-between gap-1 mb-1">
                            <span className="font-black text-xs text-emerald-950">Pehli Kist NA lein</span>
                            <span className="text-[9px] bg-emerald-200 text-emerald-900 px-1.5 py-0.5 rounded font-black">RECOMMENDED</span>
                          </div>
                          <p className="text-[11px] text-gray-800 font-semibold">
                            Borrower ko milega: <strong className="text-emerald-700 font-extrabold text-xs">₹{basePayout.toLocaleString("en-IN")}</strong>
                          </p>
                          <p className="text-[10px] text-emerald-700 font-medium mt-0.5">
                            ✓ Kist #1 regular schedule me pending rahegi (user baad me bharega).
                          </p>
                        </button>

                        <button
                          type="button"
                          onClick={() => setCardAdvanceOptions(prev => ({ ...prev, [l._id]: "deduct" }))}
                          className={`p-3 rounded-xl border text-left transition active:scale-95 cursor-pointer ${
                            chosenAdvance === "deduct"
                              ? "bg-amber-50 border-amber-500 ring-2 ring-amber-400 text-amber-950 font-bold shadow-xs"
                              : "bg-white border-gray-200 text-gray-700 hover:bg-gray-50"
                          }`}
                        >
                          <div className="flex items-center justify-between gap-1 mb-1">
                            <span className="font-black text-xs text-amber-950">Pehli Kist Advance Kaatein</span>
                            <span className="text-[9px] bg-amber-200 text-amber-900 px-1.5 py-0.5 rounded font-black">ADVANCE DEDUCTION</span>
                          </div>
                          <p className="text-[11px] text-gray-800 font-semibold">
                            Borrower ko milega: <strong className="text-amber-800 font-extrabold text-xs">₹{advancePayout.toLocaleString("en-IN")}</strong>
                          </p>
                          <p className="text-[10px] text-amber-800 font-medium mt-0.5">
                            ✓ Kist #1 (₹{instAmt.toLocaleString("en-IN")}) abhi kat jayegi aur PAID mark hogi.
                          </p>
                        </button>
                      </div>

                      <div className="flex flex-col sm:flex-row items-center gap-2 pt-2">
                        <button
                          type="button"
                          disabled={actionLoadingId === l._id}
                          onClick={() => handleApproveLoan(l._id)}
                          className="w-full sm:flex-1 px-4 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs sm:text-sm font-extrabold shadow-md shadow-emerald-500/20 active:scale-95 transition cursor-pointer flex items-center justify-center gap-1.5"
                        >
                          <span>{actionLoadingId === l._id ? "Processing..." : `✓ Approve & Disburse (₹${currentDisburseAmount.toLocaleString("en-IN")})`}</span>
                        </button>
                        <button
                          type="button"
                          disabled={actionLoadingId === l._id}
                          onClick={() => handleRejectLoan(l._id)}
                          className="w-full sm:w-auto px-5 py-2.5 bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 active:scale-95 rounded-xl text-xs sm:text-sm font-bold transition cursor-pointer flex items-center justify-center gap-1.5"
                        >
                          <span>✕ Reject Application</span>
                        </button>
                      </div>
                    </div>
                  </div>
                )}

                {/* 11. Installment Schedule Expander */}
                {!isRejected && !isPending && schedule.length > 0 && (
                  <div className="mt-3 pt-2 border-t border-slate-100">
                    <button
                      type="button"
                      onClick={() => setExpandedLoanId(isExpanded ? null : l._id)}
                      className="w-full py-2 px-3 bg-slate-50 hover:bg-slate-100 border border-slate-200 rounded-xl text-xs font-bold text-slate-700 flex items-center justify-between transition cursor-pointer shadow-2xs"
                    >
                      <span className="flex items-center gap-2">
                        <span>📅</span>
                        <span>Installment Schedule ({paidCount}/{totalCount} Paid)</span>
                        {submittedCount > 0 && (
                          <span className="px-2 py-0.5 rounded-full bg-amber-100 text-amber-800 text-[10px] font-extrabold animate-pulse">
                            {submittedCount} Submitted for Review
                          </span>
                        )}
                      </span>
                      <span className="text-blue-600 font-bold">
                        {isExpanded ? "▲ Hide Schedule" : "▼ View Installments & Pay"}
                      </span>
                    </button>

                    {isExpanded && (
                      <div className="mt-3 space-y-2">
                        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5 max-h-96 overflow-y-auto p-1">
                          {schedule.map((inst) => {
                            const isPaid = inst.status === "paid";
                            const isSubmitted = inst.status === "submitted";
                            const isOverdue = inst.status === "overdue";

                            return (
                              <div
                                key={inst.installmentNo}
                                className={`p-3 rounded-xl border text-xs flex flex-col justify-between gap-2 shadow-2xs ${
                                  isPaid
                                    ? "bg-emerald-50/60 border-emerald-200 text-emerald-950"
                                    : isSubmitted
                                    ? "bg-amber-50 border-amber-300 text-amber-950"
                                    : isOverdue
                                    ? "bg-rose-50 border-rose-200 text-rose-950"
                                    : "bg-white border-slate-200 text-slate-900"
                                }`}
                              >
                                <div className="flex items-center justify-between">
                                  <span className="font-extrabold">Installment #{inst.installmentNo}</span>
                                  <span className={`px-2 py-0.5 rounded-full text-[10px] font-black uppercase ${
                                    isPaid ? "bg-emerald-200 text-emerald-900" :
                                    isSubmitted ? "bg-amber-200 text-amber-900" :
                                    isOverdue ? "bg-rose-200 text-rose-900" : "bg-slate-100 text-slate-700"
                                  }`}>
                                    {inst.status}
                                  </span>
                                </div>

                                <div className="space-y-0.5 text-[11px] text-slate-600">
                                  <div className="flex justify-between">
                                    <span>Amount:</span>
                                    <span className="font-bold text-slate-900 font-mono">₹{inst.amount?.toLocaleString("en-IN")}</span>
                                  </div>
                                  <div className="flex justify-between">
                                    <span>Due Date:</span>
                                    <span>{inst.dueDate ? new Date(inst.dueDate).toLocaleDateString("en-IN") : "N/A"} • <span className="font-semibold text-indigo-700">10:00 AM</span></span>
                                  </div>
                                  {isOverdue && (
                                    <div className="text-[10px] text-rose-700 font-bold">
                                      10:00 AM cutoff miss hui • Rolled over (+2% penalty)
                                    </div>
                                  )}
                                  {isPaid && (
                                    <div className="space-y-0.5">
                                      <div className="flex justify-between text-emerald-700 font-semibold">
                                        <span>Paid on:</span>
                                        <span>{inst.paidOn ? new Date(inst.paidOn).toLocaleDateString("en-IN") : "Verified"}</span>
                                      </div>
                                      {inst.paymentMethod && (
                                        <div className="text-[10px] text-emerald-800 font-bold uppercase">
                                          Mode: {inst.paymentMethod}
                                        </div>
                                      )}
                                    </div>
                                  )}
                                  {inst.utrNumber && (
                                    <div className="text-[10px] font-mono text-blue-700 truncate">
                                      UTR: {inst.utrNumber}
                                    </div>
                                  )}
                                  {inst.adminEvidenceNote && (
                                    <div className="text-[10px] italic text-slate-500 truncate">
                                      Note: {inst.adminEvidenceNote}
                                    </div>
                                  )}
                                </div>

                                {/* Actions */}
                                <div className="flex flex-col gap-1.5 pt-1 border-t border-slate-200/60">
                                  {isPaid && inst.proofUrl && (
                                    <button
                                      type="button"
                                      onClick={() => { setLightboxImg(inst.proofUrl); setZoomLevel(1); }}
                                      className="w-full py-1 px-2 bg-emerald-50 hover:bg-emerald-100 text-emerald-800 rounded-lg text-[10px] font-bold border border-emerald-300 flex items-center justify-center gap-1 cursor-pointer transition active:scale-95 shadow-2xs"
                                    >
                                      <span>🧾 View Receipt / Slip ↗</span>
                                    </button>
                                  )}
                                  {isSubmitted && (
                                    <>
                                      {inst.proofUrl && (
                                        <button
                                          type="button"
                                          onClick={() => { setLightboxImg(inst.proofUrl); setZoomLevel(1); }}
                                          className="w-full py-1 px-2 bg-blue-50 hover:bg-blue-100 text-blue-700 rounded-lg text-[10px] font-bold border border-blue-200 flex items-center justify-center gap-1 cursor-pointer"
                                        >
                                          <span>🔍 View Proof (Front) ↗</span>
                                        </button>
                                      )}
                                      {inst.proofBackUrl && (
                                        <button
                                          type="button"
                                          onClick={() => { setLightboxImg(inst.proofBackUrl); setZoomLevel(1); }}
                                          className="w-full py-1 px-2 bg-blue-50 hover:bg-blue-100 text-blue-700 rounded-lg text-[10px] font-bold border border-blue-200 flex items-center justify-center gap-1 cursor-pointer"
                                        >
                                          <span>🔍 View Proof (Back) ↗</span>
                                        </button>
                                      )}
                                      <button
                                        type="button"
                                        disabled={installmentActionLoadingId === `${l._id}_${inst.installmentNo}`}
                                        onClick={() => handleApproveInstallmentProof(l._id, inst.installmentNo)}
                                        className="w-full py-1.5 px-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-[11px] font-bold shadow-xs active:scale-95 transition cursor-pointer disabled:opacity-50 flex items-center justify-center gap-1"
                                      >
                                        {installmentActionLoadingId === `${l._id}_${inst.installmentNo}` ? (
                                          <span>Approving...</span>
                                        ) : (
                                          <span>✓ Approve Installment Proof</span>
                                        )}
                                      </button>
                                    </>
                                  )}

                                  {!isPaid && (
                                    <button
                                      type="button"
                                      onClick={() => setMarkPaidModal({
                                        loan: l,
                                        installment: inst,
                                        paymentMode: "UPI",
                                        utrNumber: "",
                                        evidenceNote: ""
                                      })}
                                      className="w-full py-1.5 px-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-[11px] font-bold shadow-xs active:scale-95 transition cursor-pointer flex items-center justify-center gap-1"
                                    >
                                      <span>Paid Mark Karein</span>
                                    </button>
                                  )}
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Admin Mark Paid / Record Installment Modal */}
      {markPaidModal && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4 animate-in fade-in duration-150">
          <div className="bg-white rounded-3xl max-w-md w-full p-4 sm:p-6 shadow-2xl border border-gray-100 animate-in zoom-in-95 duration-150 space-y-4">
            {/* Header */}
            <div className="flex items-center justify-between border-b border-gray-100 pb-2.5">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-full bg-emerald-100 text-emerald-700 flex items-center justify-center font-black text-sm">
                  ₹
                </div>
                <div>
                  <h3 className="font-extrabold text-base text-gray-900 leading-tight">
                    Record Installment Payment
                  </h3>
                  <p className="text-[11px] text-gray-500">
                    Kist ko PAID mark karein aur loan pool me wapas add karein
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setMarkPaidModal(null)}
                className="w-7 h-7 rounded-full bg-gray-100 hover:bg-gray-200 text-gray-500 hover:text-gray-800 flex items-center justify-center text-xs font-bold transition active:scale-90 cursor-pointer"
              >
                ✕
              </button>
            </div>

            {/* Installment Summary Card */}
            <div className="p-3 bg-emerald-50/70 border border-emerald-200 rounded-2xl space-y-2 text-xs">
              <div className="flex justify-between items-center">
                <span className="text-emerald-800 font-semibold">Borrower:</span>
                <span className="font-bold text-emerald-950 font-mono">
                  {markPaidModal.loan.userId?.name || markPaidModal.loan.applicantName || "Customer"}
                </span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-emerald-800 font-semibold">Installment No:</span>
                <span className="font-bold font-mono text-emerald-950">
                  #{markPaidModal.installment.installmentNo}
                </span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-emerald-800 font-semibold">Due Date:</span>
                <span className="font-mono text-slate-700">
                  {markPaidModal.installment.dueDate ? new Date(markPaidModal.installment.dueDate).toLocaleDateString("en-IN") : "-"}
                </span>
              </div>
              <div className="flex justify-between items-center border-t border-emerald-200 pt-1.5">
                <span className="text-emerald-900 font-black">Amount to Collect:</span>
                <span className="text-base font-black font-mono text-emerald-700">
                  ₹{markPaidModal.installment.amount?.toLocaleString("en-IN")}
                </span>
              </div>
            </div>

            {/* Form */}
            <form onSubmit={handleAdminMarkPaid} className="space-y-3 text-xs">
              <div>
                <label className="block font-bold text-gray-700 mb-1">
                  Payment Mode / Tareeka *
                </label>
                <div className="grid grid-cols-3 gap-2">
                  {["UPI", "Bank / NEFT", "Cash"].map((m) => (
                    <button
                      key={m}
                      type="button"
                      onClick={() => setMarkPaidModal(prev => ({ ...prev, paymentMode: m }))}
                      className={`py-2 rounded-xl font-bold border text-center transition cursor-pointer active:scale-95 ${
                        markPaidModal.paymentMode === m
                          ? "bg-emerald-600 text-white border-emerald-600 shadow-xs"
                          : "bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100"
                      }`}
                    >
                      {m}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="block font-bold text-gray-700 mb-1">
                  UTR / Reference / Receipt Number *
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. UPI-123456789012 ya CASH-REC-01"
                  value={markPaidModal.utrNumber}
                  onChange={(e) => setMarkPaidModal(prev => ({ ...prev, utrNumber: e.target.value }))}
                  className="w-full px-3 py-2 border border-gray-200 rounded-xl text-xs font-mono focus:outline-none focus:ring-2 focus:ring-emerald-500 bg-slate-50 focus:bg-white"
                />
              </div>

              <div>
                <label className="block font-bold text-gray-700 mb-1">
                  Verification Note / Proof Remarks (Optional)
                </label>
                <input
                  type="text"
                  placeholder="e.g. Offline received by Admin / Deposited in branch"
                  value={markPaidModal.evidenceNote}
                  onChange={(e) => setMarkPaidModal(prev => ({ ...prev, evidenceNote: e.target.value }))}
                  className="w-full px-3 py-2 border border-gray-200 rounded-xl text-xs focus:outline-none focus:ring-2 focus:ring-emerald-500 bg-slate-50 focus:bg-white"
                />
              </div>

              <div className="p-2.5 bg-blue-50 border border-blue-200 rounded-xl text-blue-900 text-[11px] leading-tight">
                💡 <span className="font-bold">Automatic Pool Refill:</span> Jaise hi aap ise Paid mark karenge, yeh ₹{markPaidModal.installment.amount?.toLocaleString("en-IN")} turnt Loan Department ke Available Pool me wapas jama ho jayega aur market outstanding kam ho jayegi!
              </div>

              <div className="flex items-center gap-2 pt-1">
                <button
                  type="button"
                  onClick={() => setMarkPaidModal(null)}
                  disabled={submittingPayment}
                  className="w-1/2 py-2.5 rounded-xl border border-gray-200 bg-white hover:bg-gray-50 text-gray-700 font-bold transition active:scale-95 cursor-pointer disabled:opacity-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submittingPayment}
                  className="w-1/2 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold transition active:scale-95 cursor-pointer shadow-md disabled:opacity-50 flex items-center justify-center gap-1.5"
                >
                  {submittingPayment ? "Processing..." : "✓ Confirm & Mark Paid"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Lightbox Modal for Full Image Viewing */}
      {lightboxImg && (
        <div
          className="fixed inset-0 z-50 bg-black/90 flex flex-col items-center justify-center p-4 backdrop-blur-md animate-in fade-in duration-150"
          onClick={() => setLightboxImg(null)}
        >
          <div className="absolute top-4 right-4 flex items-center gap-3 z-10" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center gap-1 bg-white/10 backdrop-blur-md rounded-xl p-1 border border-white/20">
              <button
                type="button"
                onClick={() => setZoomLevel((z) => Math.max(0.5, z - 0.25))}
                className="px-2.5 py-1 text-white hover:bg-white/20 rounded-lg text-xs font-bold transition"
                title="Zoom Out"
              >
                -
              </button>
              <span className="text-white text-xs font-mono px-1">
                {Math.round(zoomLevel * 100)}%
              </span>
              <button
                type="button"
                onClick={() => setZoomLevel((z) => Math.min(3, z + 0.25))}
                className="px-2.5 py-1 text-white hover:bg-white/20 rounded-lg text-xs font-bold transition"
                title="Zoom In"
              >
                +
              </button>
              <button
                type="button"
                onClick={() => setZoomLevel(1)}
                className="px-2 py-1 text-white hover:bg-white/20 rounded-lg text-xs transition"
                title="Reset Zoom"
              >
                Reset
              </button>
            </div>
            <button
              type="button"
              onClick={() => setLightboxImg(null)}
              className="w-9 h-9 rounded-full bg-white/20 hover:bg-white/30 text-white flex items-center justify-center font-bold text-sm transition"
            >
              ✕
            </button>
          </div>

          <div
            className="max-w-4xl max-h-[85vh] overflow-auto flex items-center justify-center"
            onClick={(e) => e.stopPropagation()}
          >
            <img
              src={lightboxImg}
              alt="Verification Document"
              style={{ transform: `scale(${zoomLevel})`, transition: "transform 0.15s ease-out" }}
              className="max-w-full max-h-[80vh] object-contain rounded-lg shadow-2xl"
            />
          </div>
        </div>
      )}
    </div>
  );
}
