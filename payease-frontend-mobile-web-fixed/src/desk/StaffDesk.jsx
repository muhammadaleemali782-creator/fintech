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

  // Cache-First Instant State (0ms Load)
  const initialQueues = useMemo(() => {
    try {
      const raw = localStorage.getItem("educa_staff_desk_queues");
      if (raw) return JSON.parse(raw);
    } catch (_) {}
    return { deposit: [], withdrawal: [], loan: [], kyc: [], lending: [], bond: [] };
  }, []);

  const initialCounts = useMemo(() => {
    try {
      const raw = localStorage.getItem("educa_staff_desk_counts");
      if (raw) return JSON.parse(raw);
    } catch (_) {}
    return {};
  }, []);

  const hasCachedData = useMemo(() => {
    return Object.values(initialQueues).some(arr => Array.isArray(arr) && arr.length > 0);
  }, [initialQueues]);

  const [queues, setQueues] = useState(initialQueues);
  const [counts, setCounts] = useState(initialCounts);
  const [loading, setLoading] = useState(!hasCachedData);
  const [isSyncing, setIsSyncing] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");
  const [successToast, setSuccessToast] = useState("");

  // Filters
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");

  useEffect(() => {
    setStatusFilter("all");
  }, [activeTab]);

  // Selected item for drawer/modal
  const [selectedItem, setSelectedItem] = useState(null);
  const [actionModal, setActionModal] = useState(null); // { item, type: 'approve' | 'reject' }
  const [actionReason, setActionReason] = useState("");
  const [adminEvidenceUrl, setAdminEvidenceUrl] = useState("");
  const [actionLoading, setActionLoading] = useState(false);
  const [enlargedImage, setEnlargedImage] = useState(null);

  // Issue Loan Modal States
  const [showIssueLoanModal, setShowIssueLoanModal] = useState(false);
  const [issueBorrowerType, setIssueBorrowerType] = useState("existing"); // "existing" | "new"
  const [issueUserQuery, setIssueUserQuery] = useState("");
  const [issueSearchingUser, setIssueSearchingUser] = useState(false);
  const [issueSearchResults, setIssueSearchResults] = useState([]);
  const [issueSelectedUser, setIssueSelectedUser] = useState(null);
  const [issueNewUser, setIssueNewUser] = useState({
    name: "",
    phone: "",
    email: "",
    aadharNumber: "",
    panNumber: "",
    address: ""
  });
  const [issueLoanAmount, setIssueLoanAmount] = useState(15000);
  const [issueInstallmentsCount, setIssueInstallmentsCount] = useState(15);
  const [issueFrequency, setIssueFrequency] = useState("10_days"); // "10_days" | "daily"
  const [issueDirectActive, setIssueDirectActive] = useState(true);
  const [issueDisburseToWallet, setIssueDisburseToWallet] = useState(true);
  const [issuePurpose, setIssuePurpose] = useState("Personal Loan");
  const [issueAdminNote, setIssueAdminNote] = useState("");
  const [issueSubmitting, setIssueSubmitting] = useState(false);

  // Photo & Document uploads for Issue Loan (Aadhaar Aage-Peeche, PAN Aage-Peeche, Cheque Aage, Photo)
  const [issueDocuments, setIssueDocuments] = useState({
    photoUrl: "", // Customer Photo / Selfie
    doc1Url: "", // Aadhaar Aage (Front)
    doc1BackUrl: "", // Aadhaar Peeche (Back)
    doc2Url: "", // PAN Card Aage (Front)
    doc2BackUrl: "", // PAN Card Peeche (Back)
    chequeUrl: "" // Cheque Aage (Front)
  });

  // Fast canvas image compression (<80KB per photo)
  const handlePhotoUpload = (key, file) => {
    if (!file) return;
    if (file.type && !file.type.startsWith("image/")) {
      showToast("Kripya image / photo file upload karein", true);
      return;
    }
    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement("canvas");
        const maxDim = 1200;
        let w = img.width, h = img.height;
        if (w > maxDim || h > maxDim) {
          if (w > h) { h = Math.round((h * maxDim) / w); w = maxDim; }
          else { w = Math.round((w * maxDim) / h); h = maxDim; }
        }
        canvas.width = w; canvas.height = h;
        const ctx = canvas.getContext("2d");
        ctx.drawImage(img, 0, 0, w, h);
        const compressed = canvas.toDataURL("image/jpeg", 0.82);
        setIssueDocuments(prev => ({ ...prev, [key]: compressed }));
      };
      img.onerror = () => {
        setIssueDocuments(prev => ({ ...prev, [key]: e.target.result }));
      };
      img.src = e.target.result;
    };
    reader.readAsDataURL(file);
  };

  const showToast = useCallback((msg, isErr = false) => {
    if (isErr) {
      setErrorMsg(msg);
      setTimeout(() => setErrorMsg(""), 5000);
    } else {
      setSuccessToast(msg);
      setTimeout(() => setSuccessToast(""), 4000);
    }
  }, []);

  // Fetch queues (Stale-While-Revalidate with localStorage persistence)
  const fetchQueues = useCallback(async (silent = false) => {
    if (!silent && !hasCachedData) setLoading(true);
    setIsSyncing(true);
    try {
      const res = await fetch(`${API}/admin/desk/queues`, {
        headers: {
          Authorization: `Bearer ${token}`
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
        try {
          localStorage.setItem("educa_staff_desk_queues", JSON.stringify(data.queues));
          localStorage.setItem("educa_staff_desk_counts", JSON.stringify(data.counts || {}));
        } catch (_) {}
      } else {
        if (!silent) setErrorMsg(data.message || "Failed to load desk queues");
      }
    } catch (err) {
      if (!silent) setErrorMsg("Connection error: " + err.message);
    } finally {
      setLoading(false);
      setIsSyncing(false);
    }
  }, [token, navigate, showToast, hasCachedData]);

  useEffect(() => {
    fetchQueues();
  }, [fetchQueues]);

  // Real-time SSE integration
  useEffect(() => {
    if (!token) return;
    let eventSource = null;
    let cancelled = false;

    const handleMessage = (event) => {
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

    // Direct SSE stream connection with token
    let retryTimer = null;
    const connect = () => {
      if (cancelled || !token) return;
      try {
        eventSource = new EventSource(`${API}/admin/notifications/stream?token=${encodeURIComponent(token)}`);
        eventSource.onmessage = handleMessage;
        eventSource.onerror = () => {
          if (eventSource) eventSource.close();
          eventSource = null;
          if (!cancelled) retryTimer = setTimeout(connect, 10000);
        };
      } catch (e) {
        if (!cancelled) retryTimer = setTimeout(connect, 10000);
      }
    };
    connect();

    return () => {
      cancelled = true;
      if (retryTimer) clearTimeout(retryTimer);
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

  // Live Loan Quote Calculation
  const issueLoanQuote = useMemo(() => {
    const amt = Number(issueLoanAmount) || 15000;
    const count = Number(issueInstallmentsCount) || 15;
    const rate = 1.34;
    const principalPerInst = amt / count;
    const interestPerInst = (amt * rate) / 100;
    const installmentAmount = Math.round(principalPerInst + interestPerInst);
    const totalPayable = installmentAmount * count;
    const totalInterest = totalPayable - amt;
    const processingFee = Math.round((amt * 5) / 100);
    const upiCharges = Math.round((amt * 1) / 100);
    const netDisbursal = Math.max(0, amt - (processingFee + upiCharges));
    return {
      amt,
      count,
      rate,
      installmentAmount,
      totalPayable,
      totalInterest,
      processingFee,
      upiCharges,
      netDisbursal
    };
  }, [issueLoanAmount, issueInstallmentsCount]);

  // Quick Borrower Search by Phone, Email, Account No, or ID
  const handleSearchBorrower = async (queryOverride) => {
    const q = (queryOverride !== undefined ? queryOverride : issueUserQuery).trim();
    if (!q || q.length < 2) {
      showToast("Search ke liye kam se kam 2 characters ya 10-digit number enter karein.", true);
      return;
    }
    setIssueSearchingUser(true);
    try {
      const res = await fetch(`${API}/loan/admin/search-borrowers?q=${encodeURIComponent(q)}`, {
        headers: {
          Authorization: `Bearer ${token}`
        }
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || "Failed to search borrower");
      setIssueSearchResults(Array.isArray(data) ? data : []);
      if (Array.isArray(data) && data.length === 1) {
        setIssueSelectedUser(data[0]);
      } else if (Array.isArray(data) && data.length === 0) {
        showToast("Koi borrower nahi mila. Phone number ya ID dobara check karein.", true);
      }
    } catch (err) {
      showToast(err.message || "Borrower search error", true);
    } finally {
      setIssueSearchingUser(false);
    }
  };

  // Issue Loan On Behalf Submission
  const handleIssueLoanSubmit = async (e) => {
    if (e) e.preventDefault();
    if (issueBorrowerType === "existing") {
      if (!issueSelectedUser && !issueUserQuery.trim()) {
        showToast("Kripya borrower select karein ya Phone / ID enter karein.", true);
        return;
      }
    } else {
      if (!issueNewUser.name.trim() || !issueNewUser.phone.trim()) {
        showToast("Naye customer ka Naam aur 10-digit Mobile number zaroori hai.", true);
        return;
      }
      const clean = issueNewUser.phone.replace(/\D/g, "");
      if (clean.length < 10) {
        showToast("Valid 10-digit Mobile number enter karein.", true);
        return;
      }
    }

    const amt = Number(issueLoanAmount);
    if (!amt || amt < 1000 || amt > 100000) {
      showToast("Loan amount ₹1,000 se ₹1,00,000 ke beech hona chahiye.", true);
      return;
    }

    setIssueSubmitting(true);
    try {
      const payload = {
        borrowerType: issueBorrowerType,
        userId: issueBorrowerType === "existing" ? (issueSelectedUser?._id || issueUserQuery.trim()) : undefined,
        userQuery: issueBorrowerType === "existing" ? (issueSelectedUser?.phone || issueUserQuery.trim()) : undefined,
        name: issueBorrowerType === "new" ? issueNewUser.name.trim() : (issueSelectedUser?.name || ""),
        phone: issueBorrowerType === "new" ? issueNewUser.phone.trim() : (issueSelectedUser?.phone || issueUserQuery.trim()),
        email: issueBorrowerType === "new" ? issueNewUser.email.trim() : (issueSelectedUser?.email || ""),
        aadharNumber: issueBorrowerType === "new" ? issueNewUser.aadharNumber.trim() : undefined,
        panNumber: issueBorrowerType === "new" ? issueNewUser.panNumber.trim() : undefined,
        address: issueBorrowerType === "new" ? issueNewUser.address.trim() : undefined,
        amount: amt,
        installmentsCount: Number(issueInstallmentsCount) || 15,
        collectionFrequency: issueFrequency,
        loanType: issueFrequency === "daily" ? "micro_business" : "personal",
        purpose: issuePurpose || "Personal Loan",
        directActive: issueDirectActive,
        disburseToWallet: issueDisburseToWallet,
        documents: issueDocuments,
        photoUrl: issueDocuments.photoUrl,
        adminNote: issueAdminNote || `Loan issued from Staff Desk by ${user?.name || "Staff"}`
      };

      const res = await fetch(`${API}/loan/admin/create-on-behalf`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify(payload)
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || "Loan issue nahi ho paya");

      showToast(
        data.message ||
        `₹${amt.toLocaleString("en-IN")} ka loan safaltapoorvak ${issueDirectActive ? "disburse & active" : "submit"} ho gaya!`
      );

      // Reset & close
      setShowIssueLoanModal(false);
      setIssueSelectedUser(null);
      setIssueUserQuery("");
      setIssueSearchResults([]);
      setIssueNewUser({ name: "", phone: "", email: "", aadharNumber: "", panNumber: "", address: "" });
      setIssueDocuments({ photoUrl: "", doc1Url: "", doc1BackUrl: "", doc2Url: "", doc2BackUrl: "", chequeUrl: "" });
      setIssueAdminNote("");

      // Refresh desks
      setActiveTab("loan");
      fetchQueues(true);
    } catch (err) {
      showToast(err.message, true);
    } finally {
      setIssueSubmitting(false);
    }
  };

  // Filter current queue items
  const currentItems = useMemo(() => {
    const list = queues[activeTab] || [];
    return list.filter(item => {
      if (activeTab === "kyc") {
        if (statusFilter === "normal_kyc") {
          const isSpecialized = Boolean(item.hasLoan || item.loanId || item.hasLending || item.lendingId || item.hasBond || item.bondId || item.documents?.chequeUrl || item.kycDocuments?.chequeUrl || (item.kycType && item.kycType !== "normal"));
          if (isSpecialized) return false;
        } else if (statusFilter === "loan_kyc") {
          const hasLoan = Boolean(item.hasLoan || item.loanId || item.documents?.chequeUrl || item.kycDocuments?.chequeUrl || (item.purpose && item.purpose.toLowerCase().includes("loan")));
          if (!hasLoan && item.kycType && item.kycType !== "loan") return false;
        } else if (statusFilter === "lending_kyc") {
          const hasLending = Boolean(item.hasLending || item.lendingId || (item.purpose && item.purpose.toLowerCase().includes("lending")));
          if (!hasLending && item.kycType && item.kycType !== "lending") return false;
        } else if (statusFilter === "bond_kyc") {
          const hasBond = Boolean(item.hasBond || item.bondId || (item.purpose && item.purpose.toLowerCase().includes("bond")));
          if (!hasBond && item.kycType && item.kycType !== "bond") return false;
        } else if (statusFilter !== "all") {
          const itemStatus = (item.status || item.kycStatus || "pending").toLowerCase();
          if (statusFilter === "pending" && !["pending", "hold"].includes(itemStatus)) return false;
          if (statusFilter === "approved" && !["approved", "completed", "active", "verified"].includes(itemStatus)) return false;
          if (statusFilter === "rejected" && itemStatus !== "rejected") return false;
        }
      } else if (statusFilter !== "all") {
        const itemStatus = (item.status || "pending").toLowerCase();
        if (statusFilter === "pending" && !["pending", "hold"].includes(itemStatus)) return false;
        if (statusFilter === "approved" && !["approved", "completed", "active"].includes(itemStatus)) return false;
        if (statusFilter === "rejected" && itemStatus !== "rejected") return false;
      }

      if (searchTerm.trim()) {
        const q = searchTerm.toLowerCase();
        const userName = (item.name || item.userId?.name || item.userName || "").toLowerCase();
        const userEmail = (item.email || item.userId?.email || item.userEmail || "").toLowerCase();
        const userPhone = (item.phone || item.userId?.phone || item.userPhone || "").toLowerCase();
        const ref = (item.reference || item.accountNumber || item._id || item.aadharNumber || "").toLowerCase();
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
    <div className="min-h-screen bg-gray-50 text-gray-900 flex flex-col antialiased selection:bg-blue-600 selection:text-white">
      {/* Toast Alert Banner */}
      {errorMsg && (
        <div className="fixed top-4 left-1/2 -translate-x-1/2 z-50 bg-rose-600 text-white px-5 py-3 rounded-xl shadow-2xl flex items-center gap-3 max-w-md w-full">
          <span className="text-xl">⚠️</span>
          <p className="text-xs font-semibold leading-relaxed flex-1">{errorMsg}</p>
          <button onClick={() => setErrorMsg("")} className="text-white/80 hover:text-white font-bold text-sm">✕</button>
        </div>
      )}
      {successToast && (
        <div className="fixed top-4 left-1/2 -translate-x-1/2 z-50 bg-emerald-600 text-white px-5 py-3 rounded-xl shadow-2xl flex items-center gap-3 max-w-md w-full">
          <span className="text-xl">✅</span>
          <p className="text-xs font-semibold leading-relaxed flex-1">{successToast}</p>
          <button onClick={() => setSuccessToast("")} className="text-white/80 hover:text-white font-bold text-sm">✕</button>
        </div>
      )}

      {/* Top Navigation Bar */}
      <header className="sticky top-0 z-40 bg-white/95 backdrop-blur-md border-b border-gray-200 px-4 sm:px-8 py-3 flex items-center justify-between gap-3 shadow-2xs">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-blue-600 to-indigo-600 text-white flex items-center justify-center shadow-md shadow-blue-500/20 font-black text-lg">
            🏢
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-base sm:text-lg font-black tracking-tight text-gray-900">Educa Staff Desk</h1>
              <span className={`px-2 py-0.5 text-[10px] font-bold rounded-full uppercase tracking-wider ${isAdmin ? "bg-amber-100 text-amber-800 border border-amber-200" : "bg-blue-100 text-blue-800 border border-blue-200"}`}>
                {role}
              </span>
            </div>
          </div>
        </div>

        {/* Action Controls */}
        <div className="flex items-center gap-2">
          {isAdmin && (
            <button
              onClick={() => navigate("/admin")}
              className="px-3 py-1.5 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 active:scale-95 text-xs font-bold rounded-xl border border-indigo-200 transition flex items-center gap-1 cursor-pointer"
            >
              <span>⚙️</span>
              <span className="hidden sm:inline">Admin Panel</span>
            </button>
          )}

          <button
            onClick={() => navigate("/dashboard")}
            className="px-3 py-1.5 bg-gray-100 hover:bg-gray-200 text-gray-800 active:scale-95 text-xs font-bold rounded-xl border border-gray-200 transition flex items-center gap-1 cursor-pointer"
          >
            <span>📱</span>
            <span className="hidden sm:inline">Dashboard</span>
          </button>
        </div>
      </header>

      {/* Main Workspace Body */}
      <main className="flex-1 max-w-7xl w-full mx-auto p-4 sm:p-6 lg:p-8 flex flex-col gap-5">
        {/* Department Tabs Bar (Shown only when staff has multiple departments) */}
        {availableTabs.length > 1 && (
          <div className="flex items-center gap-2 overflow-x-auto pb-1 scrollbar-thin">
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
                  className={`flex items-center gap-2 px-4 py-2.5 rounded-xl font-bold text-xs sm:text-sm whitespace-nowrap transition-all border cursor-pointer ${
                    isActive
                      ? "bg-blue-600 text-white border-blue-600 shadow-sm"
                      : "bg-white hover:bg-gray-50 text-gray-700 border-gray-200 shadow-2xs"
                  }`}
                >
                  <span>{conf.icon}</span>
                  <span>{conf.label}</span>
                  <span
                    className={`ml-1 px-2 py-0.5 rounded-full text-[11px] font-black ${
                      isActive
                        ? "bg-white/20 text-white"
                        : count > 0
                        ? "bg-rose-100 text-rose-700 border border-rose-200"
                        : "bg-gray-100 text-gray-600"
                    }`}
                  >
                    {count}
                  </span>
                </button>
              );
            })}
          </div>
        )}

        {/* Filter and Search Bar */}
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 bg-white p-3.5 rounded-2xl border border-gray-200 shadow-xs">
          <div className="relative flex-1">
            <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400 text-sm">🔍</span>
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder={`Search ${activeTab === 'kyc' ? 'KYC (Normal, Loan, Lending, Bond)' : (DEPT_CONFIG[activeTab]?.label || 'queue')} by user, phone, account, ID...`}
              className="w-full bg-gray-50 border border-gray-200 rounded-xl pl-10 pr-4 py-2.5 text-xs sm:text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:border-blue-500 focus:bg-white transition"
            />
            {searchTerm && (
              <button
                onClick={() => setSearchTerm("")}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 text-xs font-bold"
              >
                ✕
              </button>
            )}
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            <label className="text-xs text-gray-500 font-bold hidden sm:inline">Status / Category:</label>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="bg-gray-50 border border-gray-200 text-gray-800 text-xs rounded-xl px-3 py-2.5 font-bold focus:outline-none focus:border-blue-500 focus:bg-white cursor-pointer"
            >
              {activeTab === "kyc" ? (
                <>
                  <option value="all">Full KYC (All)</option>
                  <option value="normal_kyc">Normal KYC</option>
                  <option value="loan_kyc">Loan KYC</option>
                  <option value="lending_kyc">Lending KYC</option>
                  <option value="bond_kyc">Bond KYC</option>
                </>
              ) : (
                <>
                  <option value="all">All Items</option>
                  <option value="pending">Pending Only</option>
                  <option value="approved">Approved</option>
                  <option value="rejected">Rejected</option>
                </>
              )}
            </select>

            {(activeTab === "loan" || isAdmin || hasPermission("loan.create_on_behalf")) && (
              <button
                type="button"
                onClick={() => setShowIssueLoanModal(true)}
                className="px-3.5 py-2.5 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white text-xs font-black rounded-xl shadow-xs flex items-center gap-1.5 transition active:scale-95 cursor-pointer shrink-0"
              >
                <span>➕</span>
                <span>Issue Loan (Naya Loan Karein)</span>
              </button>
            )}
          </div>
        </div>

        {/* Queue Items Grid / List */}
        {loading ? (
          <div className="py-20 flex flex-col items-center justify-center gap-3 text-gray-400">
            <div className="w-8 h-8 border-2 border-gray-200 border-t-blue-600 rounded-full animate-spin" />
            <p className="text-xs font-semibold text-gray-500">Loading department queue...</p>
          </div>
        ) : currentItems.length === 0 ? (
          <div className="py-16 text-center bg-white rounded-2xl border border-dashed border-gray-200 flex flex-col items-center justify-center gap-2 shadow-2xs">
            <span className="text-4xl">🎉</span>
            <h3 className="text-sm font-bold text-gray-800">All clear! No items in this queue</h3>
            <p className="text-xs text-gray-500 max-w-sm">
              There are currently no items matching your filter criteria in the {DEPT_CONFIG[activeTab]?.label} desk.
            </p>
            {(activeTab === "loan" || isAdmin || hasPermission("loan.create_on_behalf")) && (
              <button
                type="button"
                onClick={() => setShowIssueLoanModal(true)}
                className="mt-3 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-xs font-black rounded-xl shadow-xs transition active:scale-95 flex items-center gap-1.5 cursor-pointer"
              >
                <span>➕</span>
                <span>Kisi Ka Naya Loan Issue Karein</span>
              </button>
            )}
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {currentItems.map((item) => {
              const claimInfo = getClaimStatus(item);
              const amount = item.amount || item.principalAmount || 0;
              const isOverLimit = maxApprovalAmount > 0 && amount > maxApprovalAmount;
              const isSelfAction = String(item.userId?._id || item.userId || "") === String(user?._id || user?.id || "");
              const canProcess = hasPermission(DEPT_CONFIG[activeTab]?.processPerm) && !isSelfAction && (!claimInfo.isClaimed || claimInfo.isClaimedByMe);
              const customerPhoto = item.documents?.photoUrl || item.avatar || item.photoUrl || item.userId?.avatar || item.userId?.photoUrl || item.documents?.doc1Url || item.kycDocuments?.doc1Url;
              const hasDocs = !!(item.documents?.photoUrl || item.documents?.doc1Url || item.documents?.doc1BackUrl || item.documents?.doc2Url || item.documents?.chequeUrl || item.screenshotUrl || item.proofUrl || item.kycDocuments?.doc1Url);
              const customerName = item.name || item.userId?.name || item.userName || "Customer";
              const customerPhone = item.phone || item.userId?.phone || item.userPhone || item.email || item.userId?.email || "—";

              return (
                <div
                  key={item._id}
                  className={`bg-white border rounded-2xl p-4 flex flex-col justify-between gap-4 transition hover:shadow-md shadow-xs ${
                    claimInfo.isClaimedByMe
                      ? "border-blue-300 bg-blue-50/20"
                      : claimInfo.isClaimed
                      ? "border-amber-300 bg-amber-50/20"
                      : "border-gray-200"
                  }`}
                >
                  {/* Top Bar: Status & Amount */}
                  <div>
                    <div className="flex items-start justify-between gap-2 mb-3">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <span className={`px-2.5 py-1 text-[10px] font-extrabold rounded-lg uppercase tracking-wider border ${
                          item.status === "approved" || item.status === "completed" || item.status === "active" || item.kycStatus === "verified"
                            ? "bg-emerald-50 text-emerald-700 border-emerald-200"
                            : item.status === "rejected" || item.kycStatus === "rejected"
                            ? "bg-rose-50 text-rose-700 border-rose-200"
                            : item.status === "hold"
                            ? "bg-amber-50 text-amber-700 border-amber-200"
                            : "bg-blue-50 text-blue-700 border-blue-200"
                        }`}>
                          {item.status || item.kycStatus || "pending"}
                        </span>
                        {activeTab === "kyc" && (
                          <span className="px-2 py-0.5 bg-indigo-50 text-indigo-700 border border-indigo-200 rounded-md text-[10px] font-bold">
                            {item.hasLoan || item.loanId || item.documents?.chequeUrl || item.kycDocuments?.chequeUrl || item.kycType === "loan"
                              ? "Loan KYC"
                              : item.hasLending || item.lendingId || item.kycType === "lending"
                              ? "Lending KYC"
                              : item.hasBond || item.bondId || item.kycType === "bond"
                              ? "Bond KYC"
                              : "Normal KYC"}
                          </span>
                        )}
                      </div>

                      {amount > 0 && (
                        <span className="text-base font-black text-gray-900">
                          ₹{amount.toLocaleString("en-IN")}
                        </span>
                      )}
                    </div>

                    {/* User Identity & Photo */}
                    <div className="flex items-center gap-3">
                      {customerPhoto ? (
                        <img
                          src={customerPhoto}
                          alt="Customer"
                          onClick={(e) => {
                            e.stopPropagation();
                            setEnlargedImage(customerPhoto);
                          }}
                          className="w-10 h-10 rounded-2xl object-cover border border-gray-200 bg-gray-50 cursor-pointer hover:scale-105 transition shrink-0"
                          title="Click to enlarge photo"
                        />
                      ) : (
                        <div className="w-10 h-10 rounded-2xl bg-blue-50 border border-blue-200 text-blue-600 font-black flex items-center justify-center text-sm shrink-0">
                          {customerName[0].toUpperCase()}
                        </div>
                      )}
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-1.5">
                          <h4 className="text-sm font-bold text-gray-900 truncate">
                            {customerName}
                          </h4>
                          {hasDocs && (
                            <span className="text-[11px] text-blue-600 font-bold" title="Photos/Documents attached">
                              📷
                            </span>
                          )}
                        </div>
                        <p className="text-xs text-gray-500 truncate">
                          {customerPhone}
                        </p>
                      </div>
                    </div>

                    {/* Metadata details */}
                    <div className="mt-2.5 pt-2 border-t border-gray-100 flex flex-col gap-1 text-[11px] text-gray-500">
                      {item.accountNumber && (
                        <div className="flex justify-between">
                          <span className="text-gray-400">A/C:</span>
                          <span className="font-mono text-gray-800 font-semibold">{item.accountNumber}</span>
                        </div>
                      )}
                      {(item.aadharNumber || item.kycDocuments?.aadharNumber) && (
                        <div className="flex justify-between">
                          <span className="text-gray-400">Aadhaar:</span>
                          <span className="font-mono text-gray-800 font-semibold">{item.aadharNumber || item.kycDocuments?.aadharNumber}</span>
                        </div>
                      )}
                      {(item.panNumber || item.kycDocuments?.panNumber) && (
                        <div className="flex justify-between">
                          <span className="text-gray-400">PAN:</span>
                          <span className="font-mono text-gray-800 font-semibold">{item.panNumber || item.kycDocuments?.panNumber}</span>
                        </div>
                      )}
                      {item.reference && (
                        <div className="flex justify-between">
                          <span className="text-gray-400">Ref:</span>
                          <span className="font-mono text-gray-700">{item.reference}</span>
                        </div>
                      )}
                      {item.purpose && (
                        <div className="flex justify-between">
                          <span className="text-gray-400">Purpose:</span>
                          <span className="text-gray-800 truncate max-w-[150px]">{item.purpose}</span>
                        </div>
                      )}
                      <div className="flex justify-between">
                        <span className="text-gray-400">Requested:</span>
                        <span className="text-gray-600">
                          {item.createdAt ? new Date(item.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', day: 'numeric', month: 'short' }) : "—"}
                        </span>
                      </div>
                    </div>

                    {/* Claim Lock Status Badge */}
                    {claimInfo.isClaimed && (
                      <div className="mt-3 p-2 rounded-xl text-xs flex items-center justify-between border bg-gray-50 border-gray-200">
                        {claimInfo.isClaimedByMe ? (
                          <div className="flex items-center gap-1.5 text-blue-600 font-bold text-[11px]">
                            <span>🔒</span>
                            <span>Claimed by you</span>
                          </div>
                        ) : (
                          <div className="flex items-center gap-1.5 text-amber-600 font-bold text-[11px]">
                            <span>🔒</span>
                            <span className="truncate">Claimed by {claimInfo.claimedByName}</span>
                          </div>
                        )}
                        {claimInfo.isClaimedByMe && (
                          <button
                            onClick={() => handleReleaseClaim(item, activeTab)}
                            className="text-[10px] text-gray-500 hover:text-rose-600 underline font-semibold"
                          >
                            Release
                          </button>
                        )}
                      </div>
                    )}

                    {/* Warning Badges */}
                    {isSelfAction && (
                      <div className="mt-2 px-2.5 py-1 rounded-lg bg-rose-50 border border-rose-200 text-rose-700 text-[10px] font-bold">
                        ⚠️ Self-action is forbidden
                      </div>
                    )}
                    {isOverLimit && (
                      <div className="mt-2 px-2.5 py-1 rounded-lg bg-amber-50 border border-amber-200 text-amber-800 text-[10px] font-bold">
                        ⚠️ Exceeds approval limit (₹{maxApprovalAmount})
                      </div>
                    )}
                  </div>

                  {/* Actions Bar */}
                  <div className="pt-2 border-t border-gray-100 flex items-center gap-2">
                    <button
                      onClick={() => setSelectedItem(item)}
                      className="flex-1 py-1.5 px-3 bg-gray-100 hover:bg-gray-200 active:scale-95 text-gray-800 text-xs font-bold rounded-xl border border-gray-200 transition cursor-pointer"
                    >
                      Inspect 🔍
                    </button>

                    {!claimInfo.isClaimed && (
                      <button
                        onClick={() => handleClaim(item, activeTab)}
                        className="py-1.5 px-3 bg-blue-50 hover:bg-blue-100 text-blue-700 text-xs font-bold rounded-xl border border-blue-200 transition cursor-pointer"
                        title="Lock for exclusive review"
                      >
                        Claim 🔒
                      </button>
                    )}

                    {canProcess && ["pending", "hold"].includes(item.status || item.kycStatus || "pending") && (
                      <>
                        <button
                          disabled={isOverLimit}
                          onClick={() => setActionModal({ item, type: "approve", department: activeTab })}
                          className={`py-1.5 px-3 text-xs font-extrabold rounded-xl transition cursor-pointer ${
                            isOverLimit
                              ? "bg-gray-100 text-gray-400 cursor-not-allowed"
                              : "bg-emerald-600 hover:bg-emerald-700 active:scale-95 text-white shadow-xs"
                          }`}
                        >
                          Approve ✓
                        </button>
                        <button
                          onClick={() => setActionModal({ item, type: "reject", department: activeTab })}
                          className="py-1.5 px-3 bg-rose-50 hover:bg-rose-100 active:scale-95 text-rose-700 text-xs font-bold rounded-xl border border-rose-200 transition cursor-pointer"
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
        <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-xs flex items-center justify-center p-4" style={{ isolation: "isolate" }}>
          <div className="bg-white border border-gray-200 rounded-3xl max-w-lg w-full max-h-[90vh] overflow-y-auto p-6 shadow-2xl flex flex-col gap-4 text-gray-900">
            <div className="flex items-center justify-between pb-3 border-b border-gray-200">
              <div>
                <h3 className="text-base font-black text-gray-900">Item Details</h3>
                <span className="text-xs text-gray-500 font-medium">Department: {activeTab === "kyc" ? "Full KYC Verifications (Loan, Lending, Bond)" : DEPT_CONFIG[activeTab]?.label}</span>
              </div>
              <button
                onClick={() => setSelectedItem(null)}
                className="w-8 h-8 rounded-full bg-gray-100 text-gray-500 hover:text-gray-800 hover:bg-gray-200 flex items-center justify-center font-bold cursor-pointer transition"
              >
                ✕
              </button>
            </div>

            {/* Content Details */}
            <div className="space-y-3 text-xs">
              <div className="p-3.5 bg-gray-50 rounded-2xl border border-gray-200 space-y-2">
                <div className="flex justify-between">
                  <span className="text-gray-500">Target User:</span>
                  <span className="font-bold text-gray-900">{selectedItem.name || selectedItem.userId?.name || selectedItem.userName || "Customer"}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-500">Email:</span>
                  <span className="text-gray-800 font-medium">{selectedItem.email || selectedItem.userId?.email || selectedItem.userEmail || "—"}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-500">Phone:</span>
                  <span className="text-gray-800 font-medium">{selectedItem.phone || selectedItem.userId?.phone || selectedItem.userPhone || "—"}</span>
                </div>
                {(selectedItem.amount || selectedItem.principalAmount) ? (
                  <div className="flex justify-between">
                    <span className="text-gray-500">Amount:</span>
                    <span className="font-extrabold text-gray-900 text-sm">₹{(selectedItem.amount || selectedItem.principalAmount || 0).toLocaleString("en-IN")}</span>
                  </div>
                ) : null}
                <div className="flex justify-between">
                  <span className="text-gray-500">Status:</span>
                  <span className="font-bold text-blue-600 uppercase">{selectedItem.status || selectedItem.kycStatus || "pending"}</span>
                </div>
              </div>

              {/* Likhit KYC & Written Record on File */}
              <div className="p-3.5 bg-gray-50 rounded-2xl border border-gray-200 space-y-2">
                <div className="flex items-center justify-between pb-1.5 border-b border-gray-200">
                  <h5 className="font-bold text-gray-800 flex items-center gap-1.5">
                    <span>📋</span>
                    <span>Full KYC & Identity Verification</span>
                  </h5>
                  <span className="text-[10px] bg-emerald-100 text-emerald-800 px-2 py-0.5 rounded-full font-bold">
                    {selectedItem.userId?.kycStatus === "verified" || selectedItem.kycStatus === "verified"
                      ? "KYC Verified ✅"
                      : "Full KYC In Progress"}
                  </span>
                </div>
                <div className="grid grid-cols-2 gap-2 text-[11px]">
                  <div>
                    <span className="text-gray-400 block text-[10px]">Aadhaar Number:</span>
                    <span className="font-mono font-bold text-gray-800">
                      {selectedItem.userId?.aadharNumber ||
                        selectedItem.documents?.aadharNumber ||
                        selectedItem.userId?.kycDocuments?.aadharNumber ||
                        selectedItem.aadharNumber ||
                        selectedItem.kycDocuments?.aadharNumber ||
                        "Verified on record"}
                    </span>
                  </div>
                  <div>
                    <span className="text-gray-400 block text-[10px]">PAN Number:</span>
                    <span className="font-mono font-bold text-gray-800">
                      {selectedItem.userId?.panNumber ||
                        selectedItem.documents?.panNumber ||
                        selectedItem.userId?.kycDocuments?.panNumber ||
                        selectedItem.panNumber ||
                        selectedItem.kycDocuments?.panNumber ||
                        "Verified on record"}
                    </span>
                  </div>
                  <div>
                    <span className="text-gray-400 block text-[10px]">Bank Name / A/C:</span>
                    <span className="font-mono font-bold text-gray-800 truncate block">
                      {selectedItem.documents?.bankName || selectedItem.userId?.bankAccount?.bankName || selectedItem.bankAccount?.bankName || "Bank"}:{" "}
                      {selectedItem.documents?.bankAccountNumber ||
                        selectedItem.userId?.bankAccount?.accountNumber ||
                        selectedItem.bankAccount?.accountNumber ||
                        selectedItem.accountNumber ||
                        "—"}
                    </span>
                  </div>
                  <div>
                    <span className="text-gray-400 block text-[10px]">IFSC Code:</span>
                    <span className="font-mono font-bold text-gray-800">
                      {selectedItem.documents?.bankIfsc || selectedItem.userId?.bankAccount?.ifsc || selectedItem.bankAccount?.ifsc || selectedItem.ifsc || "—"}
                    </span>
                  </div>
                  {(selectedItem.documents?.chequeNumber || selectedItem.chequeNumber || selectedItem.kycDocuments?.chequeNumber) && (
                    <div>
                      <span className="text-gray-400 block text-[10px]">Cheque Number:</span>
                      <span className="font-mono font-bold text-amber-700">
                        {selectedItem.documents?.chequeNumber || selectedItem.chequeNumber || selectedItem.kycDocuments?.chequeNumber}
                      </span>
                    </div>
                  )}
                  {selectedItem.upiId && (
                    <div>
                      <span className="text-gray-400 block text-[10px]">UPI ID:</span>
                      <span className="font-mono font-bold text-gray-800">{selectedItem.upiId}</span>
                    </div>
                  )}
                  {(selectedItem.userId?.address || selectedItem.documents?.address || selectedItem.address) && (
                    <div className="col-span-2">
                      <span className="text-gray-400 block text-[10px]">Address:</span>
                      <span className="font-medium text-gray-700">
                        {selectedItem.userId?.address || selectedItem.documents?.address || selectedItem.address}
                      </span>
                    </div>
                  )}
                </div>
              </div>

              {/* Attached Photos & Verification Documents Gallery */}
              {(() => {
                const photos = [
                  { label: "Customer Photo", url: selectedItem.documents?.photoUrl || selectedItem.avatar || selectedItem.photoUrl || selectedItem.userId?.avatar || selectedItem.userId?.photoUrl },
                  { label: "Aadhaar Aage (Front)", url: selectedItem.documents?.doc1Url || selectedItem.userId?.kycDocuments?.doc1Url || selectedItem.kycDocuments?.doc1Url },
                  { label: "Aadhaar Peeche (Back)", url: selectedItem.documents?.doc1BackUrl || selectedItem.userId?.kycDocuments?.doc1BackUrl || selectedItem.kycDocuments?.doc1BackUrl },
                  { label: "PAN Card Aage (Front)", url: selectedItem.documents?.doc2Url || selectedItem.userId?.kycDocuments?.doc2Url || selectedItem.kycDocuments?.doc2Url || selectedItem.documents?.panUrl },
                  { label: "PAN Card Peeche (Back)", url: selectedItem.documents?.doc2BackUrl || selectedItem.userId?.kycDocuments?.doc2BackUrl || selectedItem.kycDocuments?.doc2BackUrl || selectedItem.documents?.panBackUrl },
                  { label: "Cheque Aage (Front)", url: selectedItem.documents?.chequeUrl || selectedItem.userId?.kycDocuments?.chequeUrl || selectedItem.kycDocuments?.chequeUrl || selectedItem.documents?.chequeFrontUrl },
                  { label: "Payment Proof / Receipt", url: selectedItem.screenshotUrl || selectedItem.proofUrl || selectedItem.documents?.offlineEvidenceUrl }
                ].filter(p => Boolean(p.url));

                if (photos.length === 0) return null;

                return (
                  <div className="p-3.5 bg-gray-50 rounded-2xl border border-gray-200 space-y-2">
                    <h5 className="font-bold text-gray-800 flex items-center justify-between">
                      <span>Attached Photos & Documents ({photos.length})</span>
                      <span className="text-[10px] text-gray-500 font-normal">Click to enlarge</span>
                    </h5>
                    <div className="grid grid-cols-2 gap-2">
                      {photos.map((p, idx) => (
                        <div key={idx} className="bg-white p-2 rounded-xl border border-gray-200 flex flex-col gap-1 shadow-2xs">
                          <span className="text-[10px] font-bold text-gray-600 truncate">{p.label}</span>
                          <img
                            src={p.url}
                            alt={p.label}
                            onClick={() => setEnlargedImage(p.url)}
                            className="h-24 w-full object-cover rounded-lg border border-gray-200 cursor-pointer hover:opacity-90 transition bg-gray-100"
                          />
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })()}

              {/* Audit history on item */}
              {Array.isArray(selectedItem.history) && selectedItem.history.length > 0 && (
                <div className="p-3.5 bg-gray-50 rounded-2xl border border-gray-200 space-y-1">
                  <h5 className="font-bold text-gray-800 mb-2">Action Trail</h5>
                  {selectedItem.history.map((h, i) => (
                    <div key={i} className="text-[11px] text-gray-600 border-l-2 border-gray-300 pl-2 py-0.5">
                      <strong className="text-gray-900">{h.name || h.by}</strong> ({h.role || "staff"}): {h.action} {h.note ? `• "${h.note}"` : ""}
                      <div className="text-[10px] text-gray-400">{new Date(h.at).toLocaleString()}</div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Drawer Actions */}
            <div className="pt-3 border-t border-gray-200 flex items-center justify-end gap-2">
              <button
                onClick={() => setSelectedItem(null)}
                className="px-4 py-2 bg-gray-100 hover:bg-gray-200 text-gray-800 font-bold rounded-xl text-xs transition cursor-pointer border border-gray-200"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ══════════════════════════════════════════════════════
          ISSUE LOAN MODAL (APPLY & DISBURSE ON DESK)
      ══════════════════════════════════════════════════════ */}
      {showIssueLoanModal && (
        <div
          className="fixed inset-0 z-50 bg-black/50 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4 overflow-y-auto"
          style={{ isolation: "isolate" }}
        >
          <div className="bg-white border border-gray-200 text-gray-900 rounded-3xl max-w-xl w-full p-5 sm:p-6 shadow-2xl flex flex-col gap-5 my-auto max-h-[92vh] overflow-y-auto">
            {/* Header */}
            <div className="flex items-center justify-between pb-3 border-b border-gray-200 shrink-0">
              <div className="flex items-center gap-2.5">
                <div className="w-10 h-10 rounded-2xl bg-blue-50 border border-blue-200 flex items-center justify-center text-xl">
                  ➕🏦
                </div>
                <div>
                  <h3 className="text-base font-black text-gray-900 flex items-center gap-2">
                    Issue Loan (Naya Loan Karein)
                  </h3>
                  <p className="text-[11px] text-gray-500">
                    ID / Phone se customer choose karein ya naya account banakar loan dein
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowIssueLoanModal(false)}
                className="w-8 h-8 rounded-full bg-gray-100 text-gray-500 hover:text-gray-900 hover:bg-gray-200 flex items-center justify-center font-bold text-sm transition cursor-pointer"
              >
                ✕
              </button>
            </div>

            {/* Step 1: Mode Switcher (Existing vs New) */}
            <div className="grid grid-cols-2 gap-2 bg-gray-100 p-1.5 rounded-2xl border border-gray-200">
              <button
                type="button"
                onClick={() => {
                  setIssueBorrowerType("existing");
                  setIssueSearchResults([]);
                }}
                className={`py-2 px-3 rounded-xl text-xs font-bold transition flex items-center justify-center gap-1.5 cursor-pointer ${
                  issueBorrowerType === "existing"
                    ? "bg-blue-600 text-white shadow-md shadow-blue-600/30 font-black"
                    : "text-gray-600 hover:text-gray-900"
                }`}
              >
                <span>👤</span>
                <span>Existing / ID Daalo</span>
              </button>
              <button
                type="button"
                onClick={() => {
                  setIssueBorrowerType("new");
                  setIssueSelectedUser(null);
                  setIssueSearchResults([]);
                }}
                className={`py-2 px-3 rounded-xl text-xs font-bold transition flex items-center justify-center gap-1.5 cursor-pointer ${
                  issueBorrowerType === "new"
                    ? "bg-blue-600 text-white shadow-md shadow-blue-600/30 font-black"
                    : "text-gray-600 hover:text-gray-900"
                }`}
              >
                <span>✨</span>
                <span>Naya Customer (New)</span>
              </button>
            </div>

            {/* Step 1: Borrower Data Input */}
            {issueBorrowerType === "existing" ? (
              <div className="space-y-3 bg-gray-50 p-3.5 rounded-2xl border border-gray-200">
                <label className="text-xs font-bold text-gray-700 block">
                  Customer ID, Phone, Email, ya Account Number <span className="text-rose-500">*</span>
                </label>
                <div className="flex gap-2">
                  <div className="relative flex-1">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-xs">🔍</span>
                    <input
                      type="text"
                      value={issueUserQuery}
                      onChange={(e) => {
                        setIssueUserQuery(e.target.value);
                        if (issueSelectedUser) setIssueSelectedUser(null);
                      }}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") {
                          e.preventDefault();
                          handleSearchBorrower();
                        }
                      }}
                      placeholder="e.g. 9876543210 ya EDU12345 ya User ID"
                      className="w-full bg-white border border-gray-300 rounded-xl pl-9 pr-3 py-2 text-xs text-gray-900 placeholder-gray-400 focus:outline-none focus:border-blue-500"
                    />
                  </div>
                  <button
                    type="button"
                    disabled={issueSearchingUser || !issueUserQuery.trim()}
                    onClick={() => handleSearchBorrower()}
                    className="px-3.5 py-2 bg-blue-50 hover:bg-blue-100 text-blue-700 rounded-xl text-xs font-extrabold border border-blue-200 transition disabled:opacity-50 flex items-center gap-1.5 shrink-0 cursor-pointer"
                  >
                    {issueSearchingUser && (
                      <div className="w-3 h-3 border-2 border-blue-600 border-t-transparent rounded-full animate-spin" />
                    )}
                    <span>{issueSearchingUser ? "Searching..." : "Verify / Find"}</span>
                  </button>
                </div>

                {/* Multiple search results picker */}
                {issueSearchResults.length > 0 && !issueSelectedUser && (
                  <div className="space-y-1.5 pt-1">
                    <p className="text-[11px] font-bold text-gray-600">Match found ({issueSearchResults.length}) — Click karein:</p>
                    <div className="max-h-36 overflow-y-auto space-y-1.5 pr-1">
                      {issueSearchResults.map((u) => (
                        <div
                          key={u._id}
                          onClick={() => {
                            setIssueSelectedUser(u);
                            setIssueUserQuery(u.phone || u.name);
                          }}
                          className="p-2.5 bg-white hover:bg-gray-50 border border-gray-200 rounded-xl flex items-center justify-between cursor-pointer transition text-xs shadow-2xs"
                        >
                          <div>
                            <div className="font-bold text-gray-900 flex items-center gap-1.5">
                              <span>{u.name}</span>
                              <span className="text-[10px] text-gray-500 font-mono">({u.phone})</span>
                            </div>
                            <div className="text-[10px] text-gray-500">
                              A/C: <span className="font-mono text-gray-700">{u.accountNumber || "N/A"}</span> • Bal: ₹{(u.balance || 0).toLocaleString("en-IN")}
                            </div>
                          </div>
                          <span className="px-2 py-1 bg-blue-50 text-blue-700 border border-blue-200 rounded-lg text-[10px] font-black">
                            Select ↵
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Selected User Confirmation Card (Likhit KYC Details) */}
                {issueSelectedUser && (
                  <div className="p-3.5 bg-emerald-50/70 border border-emerald-200 rounded-2xl space-y-2 text-xs">
                    <div className="flex items-start justify-between gap-2 pb-2 border-b border-emerald-200">
                      <div>
                        <div className="flex items-center gap-1.5">
                          <span className="text-emerald-700 font-black">✅ Borrower Selected:</span>
                          <span className="font-black text-gray-900 text-sm">{issueSelectedUser.name}</span>
                          <span className="px-2 py-0.5 bg-emerald-100 text-emerald-800 text-[10px] rounded-full font-bold">
                            KYC Verified
                          </span>
                        </div>
                        <div className="text-[11px] text-gray-600 font-mono mt-0.5">
                          📱 {issueSelectedUser.phone} | 🏦 A/C: {issueSelectedUser.accountNumber || "N/A"}
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => {
                          setIssueSelectedUser(null);
                          setIssueSearchResults([]);
                        }}
                        className="text-[11px] text-gray-500 hover:text-rose-600 font-bold underline shrink-0 cursor-pointer"
                      >
                        Change
                      </button>
                    </div>

                    {/* Likhit KYC Records on File */}
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 text-[11px] bg-white p-2.5 rounded-xl border border-emerald-100">
                      <div>
                        <span className="text-gray-500 block text-[10px]">Aadhaar Number:</span>
                        <span className="font-mono font-bold text-gray-800">
                          {issueSelectedUser.aadharNumber || issueSelectedUser.kycDocuments?.aadharNumber || "Verified on Record"}
                        </span>
                      </div>
                      <div>
                        <span className="text-gray-500 block text-[10px]">PAN Number:</span>
                        <span className="font-mono font-bold text-gray-800">
                          {issueSelectedUser.panNumber || issueSelectedUser.kycDocuments?.panNumber || "Verified on Record"}
                        </span>
                      </div>
                      <div>
                        <span className="text-gray-500 block text-[10px]">Bank / IFSC:</span>
                        <span className="font-mono font-bold text-gray-800 truncate block">
                          {issueSelectedUser.bankAccount?.bankName || "Bank"} {issueSelectedUser.bankAccount?.ifsc ? `(${issueSelectedUser.bankAccount.ifsc})` : ""}
                        </span>
                      </div>
                      <div>
                        <span className="text-gray-500 block text-[10px]">Wallet Balance:</span>
                        <span className="font-bold text-emerald-700">₹{(issueSelectedUser.balance || 0).toLocaleString("en-IN")}</span>
                      </div>
                      <div>
                        <span className="text-gray-500 block text-[10px]">Active Dues:</span>
                        <span className="font-bold text-amber-700">₹{(issueSelectedUser.duesBalance || 0).toLocaleString("en-IN")}</span>
                      </div>
                      <div>
                        <span className="text-gray-500 block text-[10px]">KYC Status:</span>
                        <span className="text-[10px] text-emerald-700 font-bold">Bina KYC ke loan request nahi lagti (Verified)</span>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 bg-gray-50 p-3.5 rounded-2xl border border-gray-200">
                <div>
                  <label className="text-xs font-bold text-gray-700 block mb-1">
                    Customer Full Name <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="text"
                    value={issueNewUser.name}
                    onChange={(e) => setIssueNewUser({ ...issueNewUser, name: e.target.value })}
                    placeholder="e.g. Ramesh Kumar"
                    className="w-full bg-white border border-gray-300 rounded-xl px-3 py-2 text-xs text-gray-900 placeholder-gray-400 focus:outline-none focus:border-blue-500"
                  />
                </div>
                <div>
                  <label className="text-xs font-bold text-gray-700 block mb-1">
                    Mobile Number (10 digits) <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="tel"
                    maxLength={10}
                    value={issueNewUser.phone}
                    onChange={(e) => setIssueNewUser({ ...issueNewUser, phone: e.target.value.replace(/\D/g, "") })}
                    placeholder="e.g. 9876543210"
                    className="w-full bg-white border border-gray-300 rounded-xl px-3 py-2 text-xs text-gray-900 placeholder-gray-400 focus:outline-none focus:border-blue-500"
                  />
                </div>
                <div>
                  <label className="text-xs font-bold text-gray-700 block mb-1">
                    Aadhaar Number (Optional)
                  </label>
                  <input
                    type="text"
                    maxLength={12}
                    value={issueNewUser.aadharNumber}
                    onChange={(e) => setIssueNewUser({ ...issueNewUser, aadharNumber: e.target.value.replace(/\D/g, "") })}
                    placeholder="12 digit Aadhaar"
                    className="w-full bg-white border border-gray-300 rounded-xl px-3 py-2 text-xs text-gray-900 placeholder-gray-400 focus:outline-none focus:border-blue-500"
                  />
                </div>
                <div>
                  <label className="text-xs font-bold text-gray-700 block mb-1">
                    PAN Number (Optional)
                  </label>
                  <input
                    type="text"
                    maxLength={10}
                    value={issueNewUser.panNumber}
                    onChange={(e) => setIssueNewUser({ ...issueNewUser, panNumber: e.target.value.toUpperCase() })}
                    placeholder="ABCDE1234F"
                    className="w-full bg-white border border-gray-300 rounded-xl px-3 py-2 text-xs text-gray-900 uppercase placeholder-gray-400 focus:outline-none focus:border-blue-500"
                  />
                </div>
              </div>
            )}

            {/* Step 2: Loan Amount & Presets */}
            <div className="space-y-2.5">
              <div className="flex items-center justify-between">
                <label className="text-xs font-bold text-gray-700">
                  Loan Amount (Rashi) <span className="text-rose-500">*</span>
                </label>
                <span className="text-sm font-black text-emerald-700">
                  ₹{Number(issueLoanAmount || 0).toLocaleString("en-IN")}
                </span>
              </div>

              {/* Quick Preset Chips */}
              <div className="flex flex-wrap gap-1.5">
                {[5000, 10000, 15000, 20000, 25000, 50000].map((amt) => (
                  <button
                    key={amt}
                    type="button"
                    onClick={() => setIssueLoanAmount(amt)}
                    className={`px-2.5 py-1 rounded-xl text-xs font-bold transition cursor-pointer border ${
                      Number(issueLoanAmount) === amt
                        ? "bg-emerald-600 text-white border-emerald-600 shadow-xs font-black"
                        : "bg-gray-100 text-gray-700 border-gray-200 hover:bg-gray-200"
                    }`}
                  >
                    ₹{amt.toLocaleString("en-IN")}
                  </button>
                ))}
              </div>

              {/* Custom amount input */}
              <div className="relative">
                <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-500 font-bold text-xs">₹</span>
                <input
                  type="number"
                  min={1000}
                  max={100000}
                  step={500}
                  value={issueLoanAmount}
                  onChange={(e) => setIssueLoanAmount(e.target.value)}
                  className="w-full bg-white border border-gray-300 rounded-xl pl-8 pr-4 py-2 text-xs sm:text-sm text-gray-900 font-bold focus:outline-none focus:border-emerald-500"
                  placeholder="Custom amount (₹1,000 - ₹1,00,000)"
                />
              </div>
            </div>

            {/* Step 3: Tenure & Frequency */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-bold text-gray-700 block mb-1">
                  Tenure (Kist Count)
                </label>
                <div className="flex gap-2">
                  {[15, 30].map((count) => (
                    <button
                      key={count}
                      type="button"
                      onClick={() => setIssueInstallmentsCount(count)}
                      className={`flex-1 py-1.5 rounded-xl text-xs font-bold border transition cursor-pointer ${
                        Number(issueInstallmentsCount) === count
                          ? "bg-blue-50 text-blue-700 border-blue-300 font-black"
                          : "bg-white text-gray-600 border-gray-200 hover:bg-gray-50"
                      }`}
                    >
                      {count} Installments
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="text-xs font-bold text-gray-700 block mb-1">
                  Collection Frequency
                </label>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => setIssueFrequency("10_days")}
                    className={`flex-1 py-1.5 rounded-xl text-xs font-bold border transition cursor-pointer ${
                      issueFrequency === "10_days"
                        ? "bg-blue-50 text-blue-700 border-blue-300 font-black"
                        : "bg-white text-gray-600 border-gray-200 hover:bg-gray-50"
                    }`}
                  >
                    Har 10 Din (1, 11, 21)
                  </button>
                  <button
                    type="button"
                    onClick={() => setIssueFrequency("daily")}
                    className={`flex-1 py-1.5 rounded-xl text-xs font-bold border transition cursor-pointer ${
                      issueFrequency === "daily"
                        ? "bg-blue-50 text-blue-700 border-blue-300 font-black"
                        : "bg-white text-gray-600 border-gray-200 hover:bg-gray-50"
                    }`}
                  >
                    Daily (Rozana)
                  </button>
                </div>
              </div>
            </div>

            {/* Step: Photo & Verification Documents */}
            {issueBorrowerType === "existing" ? (
              <div className="bg-emerald-50 border border-emerald-200 rounded-2xl p-3.5 flex items-center justify-between gap-3">
                <div className="space-y-0.5">
                  <div className="text-xs font-bold text-emerald-800 flex items-center gap-1.5">
                    <span>✓</span>
                    <span>KYC Already Verified — Likhit Details On Record</span>
                  </div>
                  <div className="text-[11px] text-gray-600">
                    Bina KYC ke loan request nahi lagti. Existing customer ke documents pehle se verified hain, isliye dubara upload karne ki zaroorat nahi hai.
                  </div>
                </div>
                <span className="text-2xl shrink-0">🛡️</span>
              </div>
            ) : (
              <div className="space-y-2.5 bg-gray-50 p-3.5 rounded-2xl border border-gray-200">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-bold text-gray-800 flex items-center gap-1.5">
                    <span>📷</span>
                    <span>New User Documents (PAN Aage-Peeche, Aadhaar Aage-Peeche, Cheque Aage)</span>
                  </label>
                  <span className="text-[10px] text-amber-700 font-semibold">Camera 📸 ya gallery se dalein</span>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2">
                  {[
                    { key: "photoUrl", label: "Customer Photo", sub: "Selfie / Face", icon: "👤", capture: true },
                    { key: "doc1Url", label: "Aadhaar Aage", sub: "Front Photo", icon: "🪪" },
                    { key: "doc1BackUrl", label: "Aadhaar Peeche", sub: "Back Photo", icon: "🪪" },
                    { key: "doc2Url", label: "PAN Card Aage", sub: "Front Photo", icon: "📄" },
                    { key: "doc2BackUrl", label: "PAN Card Peeche", sub: "Back Photo", icon: "📄" },
                    { key: "chequeUrl", label: "Cheque Aage", sub: "Front / Cancelled", icon: "🏦" }
                  ].map(({ key, label, sub, icon, capture }) => {
                    const url = issueDocuments[key];
                    return (
                      <div
                        key={key}
                        className="bg-white border border-gray-200 rounded-xl p-2 flex flex-col items-center justify-center gap-1 text-center relative min-h-[105px] group shadow-2xs"
                      >
                        {url ? (
                          <>
                            <img
                              src={url}
                              alt={label}
                              onClick={() => setEnlargedImage(url)}
                              className="w-full h-14 object-cover rounded-lg border border-gray-200 cursor-pointer"
                            />
                            <span className="text-[10px] font-bold text-emerald-600 truncate max-w-full">
                              ✓ {label}
                            </span>
                            <button
                              type="button"
                              onClick={() => setIssueDocuments(prev => ({ ...prev, [key]: "" }))}
                              className="absolute -top-1.5 -right-1.5 w-5 h-5 bg-rose-600 text-white rounded-full flex items-center justify-center text-[10px] font-bold shadow-md cursor-pointer hover:bg-rose-500"
                              title="Remove photo"
                            >
                              ✕
                            </button>
                          </>
                        ) : (
                          <label className="w-full h-full flex flex-col items-center justify-center cursor-pointer p-1">
                            <span className="text-lg mb-0.5">{icon}</span>
                            <span className="text-[10px] font-bold text-gray-800 block leading-tight">{label}</span>
                            <span className="text-[9px] text-gray-400 block leading-tight">{sub}</span>
                            <span className="text-[9px] text-blue-600 mt-1 font-bold">+ Upload</span>
                            <input
                              type="file"
                              accept="image/*"
                              capture={capture ? "user" : undefined}
                              onChange={(e) => {
                                const file = e.target.files?.[0];
                                if (file) handlePhotoUpload(key, file);
                              }}
                              className="hidden"
                            />
                          </label>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Step 4: Real-time Quote Card */}
            <div className="p-3.5 bg-gray-50 border border-gray-200 rounded-2xl space-y-2">
              <div className="flex items-center justify-between text-xs pb-1 border-b border-gray-200">
                <span className="text-gray-600 font-semibold">Repayment EMI (Kist):</span>
                <span className="text-sm font-black text-amber-700">
                  ₹{issueLoanQuote.installmentAmount.toLocaleString("en-IN")} <span className="text-[10px] text-gray-500 font-normal">/ installment</span>
                </span>
              </div>
              <div className="grid grid-cols-3 gap-2 text-[11px] pt-1">
                <div>
                  <span className="text-gray-500 block">Total Repayable:</span>
                  <span className="font-bold text-gray-800">₹{issueLoanQuote.totalPayable.toLocaleString("en-IN")}</span>
                </div>
                <div>
                  <span className="text-gray-500 block">Deductions (6%):</span>
                  <span className="font-bold text-rose-600">-₹{(issueLoanQuote.processingFee + issueLoanQuote.upiCharges).toLocaleString("en-IN")}</span>
                </div>
                <div>
                  <span className="text-gray-500 block">Net In-Hand Disbursal:</span>
                  <span className="font-black text-emerald-700">₹{issueLoanQuote.netDisbursal.toLocaleString("en-IN")}</span>
                </div>
              </div>
            </div>

            {/* Step 5: Toggles & Staff Note */}
            <div className="space-y-2.5 pt-1">
              <label className="flex items-center gap-2.5 cursor-pointer bg-gray-50 p-2.5 rounded-xl border border-gray-200">
                <input
                  type="checkbox"
                  checked={issueDirectActive}
                  onChange={(e) => setIssueDirectActive(e.target.checked)}
                  className="w-4 h-4 rounded text-blue-600 accent-blue-600 border-gray-300"
                />
                <div className="text-xs">
                  <span className="font-black text-gray-800 block">Direct Active (Turant Active Karein)</span>
                  <span className="text-[11px] text-gray-500">Loan turant active hoga aur repayment schedule start ho jayegi</span>
                </div>
              </label>

              {issueDirectActive && (
                <label className="flex items-center gap-2.5 cursor-pointer bg-gray-50 p-2.5 rounded-xl border border-gray-200">
                  <input
                    type="checkbox"
                    checked={issueDisburseToWallet}
                    onChange={(e) => setIssueDisburseToWallet(e.target.checked)}
                    className="w-4 h-4 rounded text-emerald-600 accent-emerald-600 border-gray-300"
                  />
                  <div className="text-xs">
                    <span className="font-black text-gray-800 block">Disburse to Wallet (Wallet me paise daalein)</span>
                    <span className="text-[11px] text-gray-500">Net ₹{issueLoanQuote.netDisbursal.toLocaleString("en-IN")} user ke profit balance me credit hoga</span>
                  </div>
                </label>
              )}

              <div>
                <input
                  type="text"
                  value={issueAdminNote}
                  onChange={(e) => setIssueAdminNote(e.target.value)}
                  placeholder="Optional Note / Remarks (e.g. Verified by Desk Staff)"
                  className="w-full bg-white border border-gray-300 rounded-xl px-3 py-2 text-xs text-gray-900 placeholder-gray-400 focus:outline-none focus:border-blue-500"
                />
              </div>
            </div>

            {/* Footer Buttons */}
            <div className="pt-3 border-t border-gray-200 flex items-center justify-end gap-2.5 shrink-0">
              <button
                type="button"
                disabled={issueSubmitting}
                onClick={() => setShowIssueLoanModal(false)}
                className="px-4 py-2 bg-gray-100 hover:bg-gray-200 text-gray-700 font-bold rounded-xl text-xs transition disabled:opacity-50 cursor-pointer border border-gray-200"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={issueSubmitting || (issueBorrowerType === "existing" && !issueSelectedUser && !issueUserQuery.trim())}
                onClick={handleIssueLoanSubmit}
                className="px-5 py-2.5 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white font-black rounded-xl text-xs shadow-lg shadow-blue-600/30 transition flex items-center gap-2 active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
              >
                {issueSubmitting && (
                  <div className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                )}
                <span>
                  {issueSubmitting
                    ? "Issuing Loan..."
                    : `🚀 Grant & Disburse Loan (₹${issueLoanQuote.amt.toLocaleString("en-IN")})`}
                </span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Action Execution Sheet / Modal (Approve or Reject) */}
      {actionModal && (
        <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-xs flex items-center justify-center p-4" style={{ isolation: "isolate" }}>
          <div className="bg-white border border-gray-200 rounded-3xl max-w-md w-full p-6 shadow-2xl flex flex-col gap-4 text-gray-900">
            <div className="flex items-center justify-between pb-2 border-b border-gray-200">
              <h3 className="text-base font-black text-gray-900 flex items-center gap-2">
                <span>{actionModal.type === "approve" ? "✅ Confirm Approval" : "✕ Confirm Rejection"}</span>
              </h3>
              <button
                onClick={() => setActionModal(null)}
                className="w-7 h-7 rounded-full bg-gray-100 text-gray-500 hover:text-gray-800 hover:bg-gray-200 flex items-center justify-center font-bold cursor-pointer"
              >
                ✕
              </button>
            </div>

            <p className="text-xs text-gray-600">
              You are about to <strong className={actionModal.type === "approve" ? "text-emerald-600" : "text-rose-600"}>{actionModal.type}</strong> this item for{" "}
              <strong className="text-gray-900">{actionModal.item.name || actionModal.item.userId?.name || actionModal.item.userName || "Customer"}</strong>
              {(actionModal.item.amount || actionModal.item.principalAmount) ? ` (₹${(actionModal.item.amount || actionModal.item.principalAmount).toLocaleString("en-IN")})` : ""}.
            </p>

            {/* Rejection Reason (Mandatory) */}
            {actionModal.type === "reject" && (
              <div>
                <label className="text-xs font-bold text-gray-700 block mb-1">
                  Reason for Rejection <span className="text-rose-500">*</span>
                </label>
                <textarea
                  value={actionReason}
                  onChange={(e) => setActionReason(e.target.value)}
                  placeholder="Explain why this request is being rejected (visible in audit log)..."
                  rows={3}
                  className="w-full bg-gray-50 border border-gray-200 rounded-xl p-3 text-xs text-gray-900 placeholder-gray-400 focus:outline-none focus:border-rose-500 focus:bg-white"
                />
              </div>
            )}

            {/* Approval Evidence & Remarks (Optional) */}
            {actionModal.type === "approve" && (
              <div className="space-y-3">
                <div>
                  <label className="text-xs font-bold text-gray-700 block mb-1">
                    Approval Remarks / Note (Optional)
                  </label>
                  <input
                    type="text"
                    value={actionReason}
                    onChange={(e) => setActionReason(e.target.value)}
                    placeholder="e.g. Verified documents and customer identity"
                    className="w-full bg-gray-50 border border-gray-200 rounded-xl px-3 py-2 text-xs text-gray-900 placeholder-gray-400 focus:outline-none focus:border-blue-500 focus:bg-white"
                  />
                </div>
                {actionModal.department === "withdrawal" && (
                  <div>
                    <label className="text-xs font-bold text-gray-700 block mb-1">
                      Bank Transfer UTR / Proof Link (Optional)
                    </label>
                    <input
                      type="text"
                      value={adminEvidenceUrl}
                      onChange={(e) => setAdminEvidenceUrl(e.target.value)}
                      placeholder="https://... or UTR receipt URL"
                      className="w-full bg-gray-50 border border-gray-200 rounded-xl px-3 py-2 text-xs text-gray-900 placeholder-gray-400 focus:outline-none focus:border-blue-500 focus:bg-white"
                    />
                  </div>
                )}
              </div>
            )}

            {/* Execution Buttons with Double-Click Prevention */}
            <div className="pt-3 border-t border-gray-200 flex items-center justify-end gap-2">
              <button
                disabled={actionLoading}
                onClick={() => setActionModal(null)}
                className="px-4 py-2 bg-gray-100 hover:bg-gray-200 text-gray-700 font-bold rounded-xl text-xs transition cursor-pointer border border-gray-200 disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                disabled={actionLoading}
                onClick={handleExecuteAction}
                className={`px-5 py-2 text-xs font-extrabold rounded-xl transition flex items-center gap-1.5 shadow-sm cursor-pointer ${
                  actionModal.type === "approve"
                    ? "bg-emerald-600 hover:bg-emerald-700 text-white shadow-emerald-600/20"
                    : "bg-rose-600 hover:bg-rose-700 text-white shadow-rose-600/20"
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
