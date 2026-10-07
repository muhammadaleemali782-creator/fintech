import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { Link } from "react-router-dom";
import Toast from "./components/Toast";
import StatusBadge from "./components/StatusBadge";

import { API } from "./config";

export default function AdminPanel() {
  const token = localStorage.getItem("token");
  const user = JSON.parse(localStorage.getItem("user") || "{}");
  useEffect(() => { if (!token || user.role !== "admin") window.location.href = "/"; }, []); // eslint-disable-line

  const headers = { "Content-Type": "application/json", Authorization: `Bearer ${token}` };
  const [tab, setTab] = useState("pending");
  const [stats, setStats] = useState(() => {
    try {
      const saved = localStorage.getItem("educa_admin_cached_stats");
      return saved ? JSON.parse(saved) : { totalUsers: 2, pendingTxns: 0, totalDeposits: 710000, netFintechReserve: 710000 };
    } catch {
      return { totalUsers: 2, pendingTxns: 0, totalDeposits: 710000, netFintechReserve: 710000 };
    }
  });
  const [loadingStats, setLoadingStats] = useState(false);
  const [pending, setPending] = useState([]);
  const [agents, setAgents] = useState([]);
  const [agentCommissionInput, setAgentCommissionInput] = useState({});
  const [savingAgentCommission, setSavingAgentCommission] = useState({});
  const [users, setUsers] = useState([]);
  const [devices, setDevices] = useState([]);
  const [loans, setLoans] = useState([]);
  const [bonds, setBonds] = useState([]);
  const [notifications, setNotifications] = useState([]);
  const [unreadNotifs, setUnreadNotifs] = useState(0);
  const [toast, setToast] = useState({ text: "", type: "" });
  const [interestRate, setInterestRate] = useState(12);
  const [newInterestRate, setNewInterestRate] = useState("");
  const [commissionRate, setCommissionRate] = useState(2);
  const [newCommissionRate, setNewCommissionRate] = useState("");
  const [googleDriveUrl, setGoogleDriveUrl] = useState("");
  const [newGoogleDriveUrl, setNewGoogleDriveUrl] = useState("");
  const [analytics, setAnalytics] = useState(() => {
    try {
      const saved = localStorage.getItem("educa_admin_cached_analytics");
      return saved ? JSON.parse(saved) : null;
    } catch {
      return null;
    }
  });
  const [loadingAnalytics, setLoadingAnalytics] = useState(false);
  const [chartMode, setChartMode] = useState("daily"); // "daily" | "cumulative"
  const [hoveredChartBar, setHoveredChartBar] = useState(null);
  const [depositDetails, setDepositDetails] = useState({
    upiId: "educafinance@upi",
    upiName: "Educa Finance & Payments",
    accountNumber: "5010045239128",
    ifsc: "BARB0JHALWA",
    bankName: "Bank of Baroda",
    branch: "Jhalwa Branch, Prayagraj",
    accountHolder: "Educa Fintech Admin",
    instructions: "Payment complete karne ke baad 12-digit UTR number enter karein."
  });
  const [savingDepositDetails, setSavingDepositDetails] = useState(false);
  const [previewKycUser, setPreviewKycUser] = useState(null);
  const [kycReviewRemarks, setKycReviewRemarks] = useState("");
  const [kycFilter, setKycFilter] = useState("all");
  const [userFilter, setUserFilter] = useState("all"); // 'all' | 'customers' | 'agents'
  const [agentFilter, setAgentFilter] = useState("all"); // 'all' | 'approved' | 'pending'

  const filteredUsers = useMemo(() => {
    return users.filter(u => {
      const isAgent = u.role === "agent" || u.agentProfile?.status === "approved";
      if (userFilter === "agents") return isAgent;
      if (userFilter === "customers") return !isAgent;
      return true;
    });
  }, [users, userFilter]);

  const filteredAgents = useMemo(() => {
    return agents.filter(a => {
      const isApproved = a.role === "agent" || a.agentProfile?.status === "approved";
      const isPending = a.agentProfile?.status === "pending";
      if (agentFilter === "approved") return isApproved;
      if (agentFilter === "pending") return isPending;
      return true;
    });
  }, [agents, agentFilter]);
  const [lightboxImg, setLightboxImg] = useState(null); // fullscreen doc viewer
  const [zoomLevel, setZoomLevel] = useState(1);
  const [expandedLoanId, setExpandedLoanId] = useState(null);
  const [adminPayModal, setAdminPayModal] = useState(null);
  const [adminPayLoading, setAdminPayLoading] = useState(false);
  const [loanApproveModal, setLoanApproveModal] = useState(null);
  const [advanceOption, setAdvanceOption] = useState("none"); // "none" | "deduct" | "waive"
  const [cardAdvanceOptions, setCardAdvanceOptions] = useState({}); // Per-loan card 1st installment option
  const [loanApproveLoading, setLoanApproveLoading] = useState(false);
  const [rejectLoadingId, setRejectLoadingId] = useState(null);
  const [adminHeroFlyId, setAdminHeroFlyId] = useState(null);

  // Issue Loan Desk Form State
  const [issueBorrowerType, setIssueBorrowerType] = useState("existing"); // "existing" | "new"
  const [issueSelectedUser, setIssueSelectedUser] = useState(null);
  const [issueUserSearch, setIssueUserSearch] = useState("");
  const [issueLoanType, setIssueLoanType] = useState("personal"); // "personal" | "student" | "micro"
  const [issueDocuments, setIssueDocuments] = useState({
    doc1Url: "",
    doc1BackUrl: "",
    doc2Url: "",
    doc2BackUrl: "",
    chequeUrl: "",
    chequeBackUrl: ""
  });
  const [issueNewUser, setIssueNewUser] = useState({
    name: "",
    phone: "",
    email: "",
    address: "",
    aadharNumber: "",
    panNumber: "",
    referredByAgentId: ""
  });
  const [issueLoanAmount, setIssueLoanAmount] = useState(15000);
  const [issueInstallmentsCount, setIssueInstallmentsCount] = useState(15);
  const [issueInterestRate, setIssueInterestRate] = useState(1.34);
  const [issueHasCheque, setIssueHasCheque] = useState(false);
  const [issueChequeNumber, setIssueChequeNumber] = useState("");
  const [issuePurpose, setIssuePurpose] = useState("Personal Loan");
  const [issueSubmitting, setIssueSubmitting] = useState(false);

  const handleDocFileUpload = (key, file) => {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (e) => {
      setIssueDocuments(prev => ({ ...prev, [key]: e.target.result }));
    };
    reader.readAsDataURL(file);
  };

  const triggerAdminHeroFly = (id = "generic") => {
    setAdminHeroFlyId(id);
    setTimeout(() => {
      setAdminHeroFlyId(prev => (prev === id ? null : prev));
    }, 1250);
  };

  const AdminLoanHeroFlyBadge = () => (
    <div className="absolute pointer-events-none -top-2 left-1/2 -translate-x-1/2 z-50 flex flex-col items-center animate-hero-flight select-none">
      <div className="relative">
        <span className="text-4xl filter drop-shadow-[0_0_15px_rgba(16,185,129,0.9)] inline-block animate-bounce">
          🦸‍♂️
        </span>
        <span className="absolute -top-1 -right-2 text-base animate-ping">✨</span>
      </div>
      <span className="text-[10px] font-black tracking-wider text-emerald-200 bg-emerald-950/90 border border-emerald-400 px-2.5 py-0.5 rounded-full shadow-lg whitespace-nowrap mt-0.5">
        ⚡ HERO FLIGHT! 🚀
      </span>
      <span className="text-xs tracking-widest text-amber-300 font-bold opacity-80">
        💨 ✨ 💫
      </span>
    </div>
  );

  const showToast = (text, type = "success") => setToast({ text, type });

  // Web Audio API chime - works 100% on Mobile & Desktop Chrome without external audio files!
  const playNotificationSound = useCallback(() => {
    try {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (!AudioCtx) return;
      const ctx = new AudioCtx();
      if (ctx.state === "suspended") ctx.resume();

      const now = ctx.currentTime;
      // High chime tone 1 (D6)
      const osc1 = ctx.createOscillator();
      const gain1 = ctx.createGain();
      osc1.type = "sine";
      osc1.frequency.setValueAtTime(1174.66, now);
      gain1.gain.setValueAtTime(0.2, now);
      gain1.gain.exponentialRampToValueAtTime(0.001, now + 0.25);
      osc1.connect(gain1);
      gain1.connect(ctx.destination);
      osc1.start(now);
      osc1.stop(now + 0.25);

      // High chime tone 2 (A6)
      const osc2 = ctx.createOscillator();
      const gain2 = ctx.createGain();
      osc2.type = "sine";
      osc2.frequency.setValueAtTime(1760.00, now + 0.12);
      gain2.gain.setValueAtTime(0.25, now + 0.12);
      gain2.gain.exponentialRampToValueAtTime(0.001, now + 0.5);
      osc2.connect(gain2);
      gain2.connect(ctx.destination);
      osc2.start(now + 0.12);
      osc2.stop(now + 0.5);
    } catch (e) {
      console.warn("Audio chime error:", e);
    }
  }, []);

  const loadStats = useCallback(async () => {
    try {
      const res = await fetch(`${API}/admin/stats`, { headers });
      const d = await res.json();
      if (d && typeof d === "object") {
        setStats(d);
        try { localStorage.setItem("educa_admin_cached_stats", JSON.stringify(d)); } catch {}
      }
    } catch {}
    finally { setLoadingStats(false); }
  }, []); // eslint-disable-line

  const loadNotifications = useCallback(async () => {
    try {
      const res = await fetch(`${API}/admin/notifications`, { headers });
      const data = await res.json();
      if (data.notifications) {
        setNotifications(data.notifications);
        setUnreadNotifs(data.unreadCount || 0);
      }
    } catch {}
  }, []); // eslint-disable-line

  const loadSettings = useCallback(async () => {
    try {
      const res = await fetch(`${API}/settings`, { headers });
      const data = await res.json();
      setInterestRate(data.loanInterestRate || 12);
      setCommissionRate(data.referralCommissionRate || 2);
      setGoogleDriveUrl(data.googleDriveUrl || "");
      setNewGoogleDriveUrl(data.googleDriveUrl || "");
    } catch {}
  }, []); // eslint-disable-line

  const loadPending = useCallback(async () => {
    try { const res = await fetch(`${API}/admin/transactions/pending`, { headers }); const d = await res.json(); setPending(Array.isArray(d) ? d : []); } catch {}
  }, []); // eslint-disable-line

  const loadUsers = useCallback(async () => {
    try {
      const res = await fetch(`${API}/admin/users`, { headers });
      const d = await res.json();
      setUsers(Array.isArray(d) ? d.filter(u => u.role !== "admin") : []);
    } catch {}
  }, []); // eslint-disable-line

  const loadLoans = useCallback(async () => {
    try { const res = await fetch(`${API}/loan/all`, { headers }); const d = await res.json(); setLoans(Array.isArray(d) ? d : []); } catch {}
  }, []); // eslint-disable-line

  const loadBonds = useCallback(async () => {
    try { const res = await fetch(`${API}/admin/bonds`, { headers }); const d = await res.json(); setBonds(Array.isArray(d) ? d : []); } catch {}
  }, []); // eslint-disable-line

  const loadDevices = useCallback(async () => {
    try {
      const res = await fetch(`${API}/v1/admin/devices`, { headers });
      const d = await res.json();
      if (d.devices) setDevices(d.devices);
    } catch {}
  }, []); // eslint-disable-line

  const lockDevice = async (deviceId) => {
    try {
      const res = await fetch(`${API}/v1/admin/devices/${deviceId}/lock`, { method: "POST", headers });
      const d = await res.json();
      showToast(d.message || "Lock command sent to device!", "success");
      setTimeout(loadDevices, 1000);
    } catch {
      showToast("Failed to lock device", "error");
    }
  };

  const unlockDevice = async (deviceId) => {
    try {
      const res = await fetch(`${API}/v1/admin/devices/${deviceId}/unlock`, { method: "POST", headers });
      const d = await res.json();
      showToast(d.message || "Unlock command sent to device!", "success");
      setTimeout(loadDevices, 1000);
    } catch {
      showToast("Failed to unlock device", "error");
    }
  };

  const loadAgents = useCallback(async () => {
    try {
      const res = await fetch(`${API}/admin/agent-applications`, { headers });
      const d = await res.json();
      setAgents(Array.isArray(d) ? d : []);
    } catch {}
  }, []); // eslint-disable-line

  const approveAgent = async (id, customRate) => {
    try {
      const rateVal = customRate !== undefined && customRate !== "" ? parseFloat(customRate) : undefined;
      const res = await fetch(`${API}/admin/agent-applications/${id}/approve`, {
        method: "POST",
        headers: { ...headers, "Content-Type": "application/json" },
        body: JSON.stringify({ commissionRate: rateVal })
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.message);
      showToast(d.message || "Agent approved successfully!", "success");
      loadAgents();
      loadUsers();
    } catch (err) {
      showToast(err.message, "error");
    }
  };

  const updateAgentCommission = async (id, customRate) => {
    try {
      const rateVal = parseFloat(customRate);
      if (isNaN(rateVal) || rateVal < 0) {
        showToast("Please enter a valid commission %", "error");
        return;
      }
      setSavingAgentCommission(prev => ({ ...prev, [id]: true }));
      const res = await fetch(`${API}/admin/agent-applications/${id}/set-commission`, {
        method: "POST",
        headers: { ...headers, "Content-Type": "application/json" },
        body: JSON.stringify({ commissionRate: rateVal })
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.message);
      showToast(d.message || `Commission rate updated to ${rateVal}%!`, "success");
      loadAgents();
    } catch (err) {
      showToast(err.message, "error");
    } finally {
      setSavingAgentCommission(prev => ({ ...prev, [id]: false }));
    }
  };

  const rejectAgent = async (id) => {
    try {
      const res = await fetch(`${API}/admin/agent-applications/${id}/reject`, { method: "POST", headers });
      const d = await res.json();
      if (!res.ok) throw new Error(d.message);
      showToast("Agent application rejected", "success");
      loadAgents();
    } catch (err) {
      showToast(err.message, "error");
    }
  };

  const loadAnalytics = useCallback(async () => {
    try {
      const res = await fetch(`${API}/admin/analytics`, { headers });
      const data = await res.json();
      if (data && data.success) {
        setAnalytics(data);
        try { localStorage.setItem("educa_admin_cached_analytics", JSON.stringify(data)); } catch {}
      }
    } catch (e) {
      console.warn("Failed to load analytics", e);
    } finally {
      setLoadingAnalytics(false);
    }
  }, []); // eslint-disable-line

  const loadDepositDetails = useCallback(async () => {
    try {
      const res = await fetch(`${API}/settings/deposit-details`);
      const data = await res.json();
      if (data && data.upiId) setDepositDetails(data);
    } catch (e) {
      console.warn("Failed to load deposit details", e);
    }
  }, []);

  const saveDepositDetails = async (e) => {
    if (e) e.preventDefault();
    if (!depositDetails.upiId || !depositDetails.accountNumber) {
      return showToast("UPI ID aur Account Number dono zaroori hain", "error");
    }
    setSavingDepositDetails(true);
    try {
      const res = await fetch(`${API}/settings/deposit-details`, {
        method: "POST",
        headers,
        body: JSON.stringify(depositDetails)
      });
      const data = await res.json();
      if (res.ok && data.success) {
        showToast("✅ Admin Deposit Details (UPI & Bank) save ho gayi!", "success");
        if (data.depositDetails) setDepositDetails(data.depositDetails);
      } else {
        showToast(data.message || "Failed to update deposit details", "error");
      }
    } catch {
      showToast("Network error updating deposit details", "error");
    } finally {
      setSavingDepositDetails(false);
    }
  };

  const loadAll = useCallback(() => {
    loadStats(); loadPending(); loadAgents(); loadUsers(); loadLoans(); loadBonds(); loadSettings(); loadNotifications(); loadDevices(); loadAnalytics(); loadDepositDetails();
  }, [loadStats, loadPending, loadAgents, loadUsers, loadLoans, loadBonds, loadSettings, loadNotifications, loadDevices, loadAnalytics, loadDepositDetails]);

  useEffect(() => {
    loadAll();
    const i = setInterval(() => {
      loadStats();
      loadAnalytics();
    }, 10000);
    return () => clearInterval(i);
  }, []); // eslint-disable-line

  // REAL-TIME SSE CONNECTION FOR LIVE ALERTS & SOUND
  useEffect(() => {
    if (!token || user.role !== "admin") return;

    let eventSource = null;
    try {
      eventSource = new EventSource(`${API}/admin/notifications/stream?token=${encodeURIComponent(token)}`);

      eventSource.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          if (data.type === "connected" || data.type === "heartbeat") return;

          // Sound alert on chrome / mobile!
          playNotificationSound();

          // Instant toast notification
          showToast(`🔔 ${data.title || "New Alert"}: ${data.message}`);

          // Add to notification list
          setNotifications((prev) => [data, ...prev]);
          setUnreadNotifs((prev) => prev + 1);

          // Refresh data lists
          loadAll();
        } catch (e) {}
      };
    } catch (e) {
      console.warn("SSE stream not supported or failed:", e);
    }

    return () => {
      if (eventSource) eventSource.close();
    };
  }, [token, user.role, playNotificationSound, loadAll]);

  // Handle Android Back Pressed & Form protection inside Admin Panel
  useEffect(() => {
    let lastTap = 0;
    window.handleAndroidBackPressed = (hasDirtyInputs) => {
      const active = document.activeElement;
      if (active && (active.tagName === "INPUT" || active.tagName === "TEXTAREA" || active.isContentEditable)) {
        active.blur();
        return "keyboard_dismissed";
      }

      const hasOpenModal = Boolean(adminPayModal || loanApproveModal || lightboxImg);
      if (hasOpenModal) {
        if (hasDirtyInputs) {
          const now = Date.now();
          if (now - lastTap > 2500) {
            lastTap = now;
            showToast("⚠️ Form me data bhara hua hai. Dobara back dabayein cancel karne ke liye.", "info");
            return "dirty_prevented";
          }
        }
        setAdminPayModal(null);
        setLoanApproveModal(null);
        setLightboxImg(null);
        return true;
      }
      return false;
    };

    window.forceDismissActiveModal = () => {
      setAdminPayModal(null);
      setLoanApproveModal(null);
      setLightboxImg(null);
    };

    return () => {
      window.handleAndroidBackPressed = null;
      window.forceDismissActiveModal = null;
    };
  }, [adminPayModal, loanApproveModal, lightboxImg]);

  const approve = async (id) => {
    if (!window.confirm("Approve this transaction?")) return;
    const res = await fetch(`${API}/admin/transaction/${id}/approve`, { method: "POST", headers });
    const data = await res.json();
    showToast(data.message, res.ok ? "success" : "error");
    if (res.ok) loadAll();
  };

  const reject = async (id) => {
    const remarks = window.prompt("Rejection reason:");
    if (!remarks) return;
    const res = await fetch(`${API}/admin/transaction/${id}/reject`, { method: "POST", headers, body: JSON.stringify({ remarks }) });
    showToast((await res.json()).message, "success");
    loadAll();
  };

  const toggleBlock = async (id) => {
    const res = await fetch(`${API}/admin/user/${id}/toggle-block`, { method: "POST", headers });
    showToast((await res.json()).message);
    loadUsers();
  };

  const toggleUninstallLock = async (userId) => {
    try {
      const res = await fetch(`${API}/admin/user/${userId}/toggle-uninstall-lock`, { method: "POST", headers });
      const data = await res.json();
      showToast(data.message || "Uninstall lock updated!", res.ok ? "success" : "error");
      if (res.ok) {
        loadUsers();
        loadDevices();
      }
    } catch {
      showToast("Failed to toggle uninstall protection", "error");
    }
  };

  const updateCustomInterest = async (userId, rate) => {
    const num = parseFloat(rate);
    if (!num || isNaN(num) || num < 1 || num > 100) return showToast("Enter valid rate (1-100%)", "error");
    try {
      const res = await fetch(`${API}/admin/user/${userId}/interest-rate`, {
        method: "PUT",
        headers,
        body: JSON.stringify({ interestRate: num })
      });
      const data = await res.json();
      showToast(data.message, res.ok ? "success" : "error");
      if (res.ok) loadUsers();
    } catch {
      showToast("Failed to update custom interest rate", "error");
    }
  };

  const toggleUserCard = async (userId, currentTier, currentUnlocked) => {
    const newTier = currentTier === "platinum" || currentUnlocked ? "silver" : "platinum";
    const unlockVal = newTier === "platinum";
    const reason = unlockVal ? "Admin VIP Privilege Override" : "";
    try {
      const res = await fetch(`${API}/admin/user/${userId}/card-tier`, {
        method: "POST",
        headers,
        body: JSON.stringify({ cardTier: newTier, unlocked: unlockVal, reason })
      });
      const data = await res.json();
      showToast(data.message, res.ok ? "success" : "error");
      if (res.ok) loadUsers();
    } catch {
      showToast("Failed to update card status", "error");
    }
  };

  const approveKyc = async (userId, remarks = "") => {
    try {
      const res = await fetch(`${API}/admin/kyc/${userId}/approve`, {
        method: "POST",
        headers,
        body: JSON.stringify({ remarks })
      });
      const data = await res.json();
      showToast(data.message, res.ok ? "success" : "error");
      if (res.ok) loadUsers();
    } catch {
      showToast("Failed to approve KYC", "error");
    }
  };

  const rejectKyc = async (userId, remarks = "") => {
    try {
      const res = await fetch(`${API}/admin/kyc/${userId}/reject`, {
        method: "POST",
        headers,
        body: JSON.stringify({ remarks })
      });
      const data = await res.json();
      showToast(data.message, res.ok ? "success" : "error");
      if (res.ok) loadUsers();
    } catch {
      showToast("Failed to reject KYC", "error");
    }
  };

  const submitApproveLoan = async () => {
    if (!loanApproveModal) return;
    setLoanApproveLoading(true);
    try {
      const res = await fetch(`${API}/loan/${loanApproveModal._id}/approve`, {
        method: "POST",
        headers: { ...headers, "Content-Type": "application/json" },
        body: JSON.stringify({ advanceOption })
      });
      const data = await res.json();
      showToast(data.message, res.ok ? "success" : "error");
      if (res.ok) {
        setLoanApproveModal(null);
        loadAll();
      }
    } catch {
      showToast("Network error approving loan", "error");
    } finally {
      setLoanApproveLoading(false);
    }
  };

  const rejectLoan = async (id) => {
    if (!window.confirm("Reject this loan?")) return;
    setRejectLoadingId(id);
    try {
      const res = await fetch(`${API}/loan/${id}/reject`, { method: "POST", headers });
      const data = await res.json();
      showToast(data.message, res.ok ? "success" : "error");
      if (res.ok) loadLoans();
    } catch {
      showToast("Network error rejecting loan", "error");
    } finally {
      setRejectLoadingId(null);
    }
  };

  const approveInstallment = async (loanId, installmentNo) => {
    if (!window.confirm(`Installment #${installmentNo} approve karein? Balance update ho jayega.`)) return;
    try {
      const res = await fetch(`${API}/loan/admin/${loanId}/installment/${installmentNo}/approve`, {
        method: "POST",
        headers
      });
      const data = await res.json();
      showToast(data.message, res.ok ? "success" : "error");
      if (res.ok) loadLoans();
    } catch {
      showToast("Network error approving installment", "error");
    }
  };

  const submitAdminPay = async () => {
    if (!adminPayModal) return;
    setAdminPayLoading(true);
    try {
      const res = await fetch(`${API}/loan/admin/${adminPayModal.loanId}/installment/${adminPayModal.installmentNo}/admin-pay`, {
        method: "POST",
        headers,
        body: JSON.stringify({
          evidenceNote: adminPayModal.evidenceNote,
          utrNumber: adminPayModal.utrNumber,
          proofUrl: adminPayModal.proofUrl || ""
        })
      });
      const data = await res.json();
      showToast(data.message, res.ok ? "success" : "error");
      if (res.ok) {
        setAdminPayModal(null);
        loadLoans();
      }
    } catch {
      showToast("Network error saving offline payment", "error");
    } finally {
      setAdminPayLoading(false);
    }
  };

  const updateInterestRate = async () => {
    const rate = parseFloat(newInterestRate);
    if (!rate || rate < 1 || rate > 100) return showToast("1% se 100% ke beech dalo", "error");
    const res = await fetch(`${API}/settings/interest-rate`, { method: "POST", headers, body: JSON.stringify({ rate }) });
    const data = await res.json();
    showToast(data.message, res.ok ? "success" : "error");
    if (res.ok) { setInterestRate(rate); setNewInterestRate(""); }
  };

  const updateCommissionRate = async () => {
    const rate = parseFloat(newCommissionRate);
    if (isNaN(rate) || rate < 0 || rate > 50) return showToast("0% se 50% ke beech dalo", "error");
    const res = await fetch(`${API}/settings/referral-commission`, { method: "POST", headers, body: JSON.stringify({ rate }) });
    const data = await res.json();
    showToast(data.message, res.ok ? "success" : "error");
    if (res.ok) { setCommissionRate(rate); setNewCommissionRate(""); }
  };

  const updateGoogleDriveUrl = async () => {
    try {
      const res = await fetch(`${API}/settings/google-drive`, {
        method: "POST",
        headers,
        body: JSON.stringify({ url: newGoogleDriveUrl })
      });
      const data = await res.json();
      showToast(data.message || "Google Drive settings updated", res.ok ? "success" : "error");
      if (res.ok) setGoogleDriveUrl(data.url || newGoogleDriveUrl);
    } catch {
      showToast("Network error updating Google Drive link", "error");
    }
  };

  const exportKycToCsv = () => {
    const kycUsers = users.filter(u => u.kycStatus && u.kycStatus !== "none");
    if (!kycUsers.length) return showToast("No KYC records to export", "error");

    const headers = [
      "User ID",
      "Full Name",
      "Email",
      "Phone",
      "Address",
      "Doc 1 Type",
      "Aadhaar Number",
      "Doc 1 File Link",
      "Doc 2 Type",
      "PAN Number",
      "Cheque/Account Number",
      "Doc 2 File Link",
      "KYC Status",
      "Submitted Date",
      "Admin Remarks",
      "Google Drive Link"
    ];

    const rows = kycUsers.map(u => {
      const doc2Type = u.kycDocuments?.doc2Type || (u.kycDocuments?.chequeNumber ? "cheque" : "pan");
      return [
        `"${u._id || ""}"`,
        `"${(u.name || "").replace(/"/g, '""')}"`,
        `"${(u.email || "").replace(/"/g, '""')}"`,
        `"${(u.phone || "").replace(/"/g, '""')}"`,
        `"${(u.address || u.kycDocuments?.address || "").replace(/"/g, '""')}"`,
        `"AADHAAR CARD"`,
        `"${(u.kycDocuments?.aadharNumber || u.aadharNumber || "").replace(/"/g, '""')}"`,
        `"${(u.kycDocuments?.doc1Url || u.kycDocuments?.docUrl || "").replace(/"/g, '""')}"`,
        `"${doc2Type.toUpperCase()}"`,
        `"${(u.kycDocuments?.panNumber || u.panNumber || "").replace(/"/g, '""')}"`,
        `"${(u.kycDocuments?.chequeNumber || u.chequeNumber || "").replace(/"/g, '""')}"`,
        `"${(u.kycDocuments?.doc2Url || "").replace(/"/g, '""')}"`,
        `"${(u.kycStatus || "").toUpperCase()}"`,
        `"${u.kycDocuments?.submittedAt ? new Date(u.kycDocuments.submittedAt).toLocaleString("en-IN") : ""}"`,
        `"${(u.kycDocuments?.adminRemarks || "").replace(/"/g, '""')}"`,
        `"${(u.kycDocuments?.googleDriveLink || "").replace(/"/g, '""')}"`
      ];
    });

    const csvContent = "\uFEFF" + [headers.join(","), ...rows.map(r => r.join(","))].join("\r\n");
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.setAttribute("download", `Educa_KYC_Records_${new Date().toISOString().slice(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    showToast("KYC Excel/CSV exported successfully!", "success");
  };

  const loanStatusColor = { pending: "bg-yellow-100 text-yellow-700", active: "bg-blue-100 text-blue-700", closed: "bg-green-100 text-green-700", rejected: "bg-red-100 text-red-700" };

  const pendingAgentsCount = agents.filter(a => a.agentProfile?.status === "pending").length;
  const pendingKycCount = users.filter(u => u.kycStatus === "pending").length;

  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(() => {
    try {
      return localStorage.getItem("educa_admin_sidebar_collapsed") === "true";
    } catch {
      return false;
    }
  });

  const toggleSidebar = () => {
    setIsSidebarCollapsed(prev => {
      const next = !prev;
      try { localStorage.setItem("educa_admin_sidebar_collapsed", String(next)); } catch {}
      return next;
    });
  };

  const tabs = [
    { key: "analytics", label: "Profit & Reserves", icon: "📈" },
    { key: "pending", label: "Pending", icon: "⏳", badge: pending.length },
    { key: "kyc", label: "KYC Requests", icon: "📄", badge: pendingKycCount },
    { key: "history", label: "Audit History", icon: "📜" },
    { key: "alerts", label: "Live Alerts", icon: "🔔", badge: unreadNotifs },
    { key: "agents", label: "Agent Partners", icon: "🤝", badge: pendingAgentsCount },
    { key: "loans", label: "Loans", icon: "🏦" },
    { key: "issue-loan", label: "Issue Loan Desk", icon: "➕🏦" },
    { key: "lending", label: "Lending Accounts", icon: "🤝", badge: bonds.length },
    { key: "users", label: "Users & Accounts", icon: "👥" },
    { key: "devices", label: "App Lock", icon: "🔒", badge: devices.filter(d => d.adminStatus === "active").length },
    { key: "settings", label: "Settings", icon: "⚙️" },
  ];

  // Dedicated Multi-Category Audit History State
  const [auditHistory, setAuditHistory] = useState([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyCategory, setHistoryCategory] = useState("all");
  const [historyStatus, setHistoryStatus] = useState("all");
  const [historySearch, setHistorySearch] = useState("");

  const loadAuditHistory = async () => {
    setHistoryLoading(true);
    try {
      const query = new URLSearchParams({
        category: historyCategory,
        status: historyStatus,
        search: historySearch
      });
      const res = await fetch(`${API}/admin/audit-history?${query}`, { headers });
      const data = await res.json();
      if (data && data.history) setAuditHistory(data.history);
    } catch (err) {
      console.error("Failed to load audit history:", err);
    } finally {
      setHistoryLoading(false);
    }
  };

  useEffect(() => {
    if (tab === "history") {
      loadAuditHistory();
    }
  }, [tab, historyCategory, historyStatus, historySearch]);

  // Switch / Convert Agent Commission Model (Solo <-> Team)
  const switchAgentModel = async (agentId, targetModel) => {
    try {
      const res = await fetch(`${API}/admin/agent-applications/${agentId}/switch-model`, {
        method: "POST",
        headers,
        body: JSON.stringify({ model: targetModel })
      });
      const data = await res.json();
      if (res.ok) {
        showToast(data.message || `Agent converted to ${targetModel === 'team_1' ? 'Team System' : 'Solo Direct'}!`, "success");
        loadAgents();
      } else {
        showToast(data.message || "Failed to switch agent model", "error");
      }
    } catch {
      showToast("Network error switching agent model", "error");
    }
  };

  // Toggle Penalty Waiver for a loan (Admin authority)
  const togglePenaltyWaiver = async (loanId, shouldWaive) => {
    try {
      const res = await fetch(`${API}/loan/${loanId}/toggle-penalty-waiver`, {
        method: "POST",
        headers,
        body: JSON.stringify({ waive: shouldWaive })
      });
      const data = await res.json();
      showToast(data.message, res.ok ? "success" : "error");
      if (res.ok) loadLoans();
    } catch {
      showToast("Network error updating penalty waiver", "error");
    }
  };

  // Submit Loan on behalf of existing user or new borrower
  const handleIssueLoanSubmit = async (e) => {
    e?.preventDefault();
    if (issueBorrowerType === "existing" && !issueSelectedUser) {
      return showToast("Kripya ek borrower / customer select karein", "error");
    }
    if (issueBorrowerType === "new" && (!issueNewUser.name || !issueNewUser.phone)) {
      return showToast("New borrower ka naam aur phone number zaroori hai", "error");
    }

    setIssueSubmitting(true);
    try {
      const actualLoanType = issueLoanType === "micro" ? "micro_business" : issueLoanType;
      const payload = {
        borrowerType: issueBorrowerType,
        userId: issueSelectedUser?._id,
        name: issueNewUser.name,
        phone: issueNewUser.phone,
        email: issueNewUser.email,
        address: issueNewUser.address,
        aadharNumber: issueNewUser.aadharNumber,
        panNumber: issueNewUser.panNumber,
        referredByAgentId: issueNewUser.referredByAgentId || undefined,
        loanType: actualLoanType,
        amount: Number(issueLoanAmount),
        installmentsCount: Number(issueInstallmentsCount),
        interestRateOption: Number(issueInterestRate),
        hasChequeFacility: issueHasCheque || Boolean(issueChequeNumber) || Boolean(issueDocuments.chequeUrl),
        chequeNumber: issueChequeNumber ? String(issueChequeNumber).trim() : "",
        purpose: issuePurpose || (issueLoanType === "student" ? "Student Loan" : issueLoanType === "micro" ? "Micro Enterprise Loan" : "Personal Loan"),
        documents: issueDocuments,
        adminNote: `Applied by Admin on behalf of ${issueBorrowerType === "new" ? issueNewUser.name : issueSelectedUser?.name} (${actualLoanType})`
      };

      const res = await fetch(`${API}/loan/admin/create-on-behalf`, {
        method: "POST",
        headers,
        body: JSON.stringify(payload)
      });
      const data = await res.json();

      if (res.ok) {
        showToast(data.message || "Loan application submitted! Review and approve below.", "success");
        loadLoans();
        loadUsers();
        // Reset form
        setIssueSelectedUser(null);
        setIssueNewUser({ name: "", phone: "", email: "", address: "", aadharNumber: "", panNumber: "", referredByAgentId: "" });
        setIssueDocuments({ doc1Url: "", doc1BackUrl: "", doc2Url: "", doc2BackUrl: "", chequeUrl: "", chequeBackUrl: "" });
        // Switch to loans tab so admin can review and approve it
        setTab("loans");
      } else {
        showToast(data.message || "Failed to create loan application", "error");
      }
    } catch {
      showToast("Network error submitting loan application", "error");
    } finally {
      setIssueSubmitting(false);
    }
  };

  const logout = () => { localStorage.clear(); window.location.href = "/"; };

  const [adminCachedReserves, setAdminCachedReserves] = useState(() => {
    try {
      const saved = localStorage.getItem("educa_admin_cached_reserves");
      return saved ? Number(saved) : 710000;
    } catch {
      return 710000;
    }
  });

  const totalReservesBase = Number(
    analytics?.stats?.netFintechReserve ||
    stats?.netFintechReserve ||
    stats?.totalUserBalances ||
    adminCachedReserves ||
    710000
  );

  const chartCumulativeProfit = (analytics?.dailyProfitChart || []).reduce((acc, row) => acc + (Number(row.amount) || 0), 0);
  const totalProfitBase = Number(
    chartCumulativeProfit > 0 ? chartCumulativeProfit :
    analytics?.stats?.totalUserProfits ||
    stats?.totalUserProfits ||
    analytics?.stats?.totalYieldCredited ||
    stats?.totalYield ||
    260.78
  );

  // Live Mini-Second Profit & Reserves Stream (Continuous Monotonic Ticker at 80ms, never resets or freezes)
  const totalDepositsDisplay = Number(analytics?.stats?.totalDeposits || stats?.totalDeposits || adminCachedReserves || 710000);
  const dailyAdminYield = totalDepositsDisplay > 0 ? (totalDepositsDisplay * 0.12) / 365 : 0;
  const perMsAdminYield = dailyAdminYield / 86400000;

  const [liveAdminProfit, setLiveAdminProfit] = useState(() => {
    try {
      const saved = localStorage.getItem("educa_admin_cached_profit");
      return saved ? Math.max(Number(saved), totalProfitBase) : totalProfitBase;
    } catch {
      return totalProfitBase;
    }
  });

  const lastTickRef = useRef(Date.now());
  const lastSavedRef = useRef(Date.now());

  // Ratchet upward if fresh higher profit arrives from backend
  useEffect(() => {
    if (totalProfitBase > 0) {
      setLiveAdminProfit(prev => Math.max(prev, totalProfitBase));
    }
  }, [totalProfitBase]);

  // Sync cached reserves
  useEffect(() => {
    const net = Number(analytics?.stats?.netFintechReserve || stats?.netFintechReserve || stats?.totalUserBalances || 0);
    if (net > 0) {
      setAdminCachedReserves(net);
      try { localStorage.setItem("educa_admin_cached_reserves", String(net)); } catch {}
    }
  }, [analytics?.stats?.netFintechReserve, stats?.netFintechReserve, stats?.totalUserBalances]);

  // High-frequency live ticking stream (80ms ticks for buttery smooth digits, never resets)
  useEffect(() => {
    lastTickRef.current = Date.now();
    let timer = null;

    const tick = () => {
      const now = Date.now();
      const dt = Math.max(0, now - lastTickRef.current);
      lastTickRef.current = now;
      if (dt > 0 && perMsAdminYield > 0) {
        setLiveAdminProfit(prev => {
          const updated = prev + (dt * perMsAdminYield);
          if (now - lastSavedRef.current > 2000) {
            try { localStorage.setItem("educa_admin_cached_profit", String(updated)); } catch {}
            lastSavedRef.current = now;
          }
          return updated;
        });
      }
    };

    const startTimer = () => {
      if (timer) clearInterval(timer);
      if (typeof document !== "undefined" && !document.hidden) {
        timer = setInterval(tick, 80); // ~12.5 ticks per second (smooth spinning digits)
      }
    };

    const handleVisibility = () => {
      if (document.hidden) {
        if (timer) clearInterval(timer);
      } else {
        tick();
        startTimer();
      }
    };

    startTimer();
    document.addEventListener("visibilitychange", handleVisibility);
    return () => {
      if (timer) clearInterval(timer);
      document.removeEventListener("visibilitychange", handleVisibility);
    };
  }, [perMsAdminYield]);

  // Derived live accrual & reserves
  const liveAccruedAdmin = Math.max(0, liveAdminProfit - totalProfitBase);
  const liveAdminReserves = totalDepositsDisplay + liveAdminProfit;

  const statCards = [
    { icon: "🏦", label: "Fintech Reserves", value: `₹${Number(liveAdminReserves).toLocaleString("en-IN", { minimumFractionDigits: 4, maximumFractionDigits: 4 })}`, g: "from-emerald-500 to-teal-600" },
    { icon: "💰", label: "Total Deposits", value: `₹${totalDepositsDisplay.toLocaleString("en-IN")}`, g: "from-green-500 to-emerald-600" },
    { icon: "⚡", label: "Profit Credited", value: `₹${Number(liveAdminProfit).toLocaleString("en-IN", { minimumFractionDigits: 4, maximumFractionDigits: 4 })}`, g: "from-blue-600 to-cyan-600" },
    { icon: "👥", label: "Total Users", value: stats.totalUsers ?? 2, g: "from-slate-700 to-slate-800" },
    { icon: "⏳", label: "Pending Txns", value: stats.pendingTxns ?? 0, g: "from-amber-500 to-orange-500" },
  ];

  return (
    <div className="bg-gray-50 min-h-screen lg:h-screen lg:overflow-hidden lg:flex">
      {/* FULLSCREEN LIGHTBOX WITH INTERACTIVE ZOOM & PAN */}
      {lightboxImg && (
        <div
          className="fixed inset-0 z-[9999] bg-black/95 backdrop-blur-md flex flex-col justify-between p-3 sm:p-4 select-none animate-in fade-in duration-150"
          onClick={() => { setLightboxImg(null); setZoomLevel(1); }}
        >
          {/* Header Controls */}
          <div
            className="flex items-center justify-between z-10 p-2.5 bg-neutral-900/90 border border-neutral-700/60 rounded-2xl backdrop-blur-xs text-white shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center gap-2 text-xs font-bold text-gray-200">
              <span className="text-base">📄</span>
              <span className="truncate">Admin Document Viewer</span>
              <span className="text-[10px] px-2 py-0.5 rounded-full bg-white/20 font-mono font-bold">
                {Math.round(zoomLevel * 100)}%
              </span>
            </div>

            <div className="flex items-center gap-1.5">
              {/* Zoom Out */}
              <button
                type="button"
                onClick={() => setZoomLevel((z) => Math.max(0.75, +(z - 0.25).toFixed(2)))}
                className="w-8 h-8 rounded-xl bg-white/10 hover:bg-white/20 active:scale-95 flex items-center justify-center font-bold text-xs text-white cursor-pointer transition border border-white/10"
                title="Zoom Out"
              >
                🔍-
              </button>
              {/* Reset Zoom */}
              <button
                type="button"
                onClick={() => setZoomLevel(1)}
                className="px-2.5 h-8 rounded-xl bg-white/10 hover:bg-white/20 active:scale-95 flex items-center justify-center text-[11px] font-bold text-white cursor-pointer transition border border-white/10"
                title="Reset Zoom"
              >
                100%
              </button>
              {/* Zoom In */}
              <button
                type="button"
                onClick={() => setZoomLevel((z) => Math.min(3.5, +(z + 0.35).toFixed(2)))}
                className="w-8 h-8 rounded-xl bg-white/10 hover:bg-white/20 active:scale-95 flex items-center justify-center font-bold text-xs text-white cursor-pointer transition border border-white/10"
                title="Zoom In"
              >
                🔍+
              </button>
              {/* Close Button */}
              <button
                type="button"
                onClick={() => { setLightboxImg(null); setZoomLevel(1); }}
                className="w-8 h-8 rounded-xl bg-rose-600 hover:bg-rose-700 active:scale-95 flex items-center justify-center font-black text-xs text-white cursor-pointer transition ml-1.5 shadow-sm"
                title="Close Viewer"
              >
                ✕
              </button>
            </div>
          </div>

          {/* Document Content Area with Touch Pan & Smooth Zoom */}
          <div
            className="flex-1 flex items-center justify-center overflow-auto p-2 cursor-grab active:cursor-grabbing"
            onClick={(e) => e.stopPropagation()}
          >
            {lightboxImg.startsWith("data:application/pdf") ? (
              <iframe
                src={lightboxImg}
                title="PDF Document"
                className="w-full max-w-4xl h-[80vh] rounded-2xl bg-white border border-white/20 shadow-2xl"
              />
            ) : (
              <div
                className="transition-transform duration-150 ease-out flex items-center justify-center max-w-full max-h-full"
                style={{ transform: `scale(${zoomLevel})` }}
                onDoubleClick={() => setZoomLevel((z) => (z > 1 ? 1 : 2.2))}
              >
                <img
                  src={lightboxImg}
                  alt="Document Fullscreen Preview"
                  className="max-w-[92vw] max-h-[78vh] object-contain rounded-xl shadow-2xl border border-white/10 cursor-zoom-in"
                  onClick={() => setZoomLevel((z) => (z > 1.8 ? 1 : +(z + 0.5).toFixed(2)))}
                />
              </div>
            )}
          </div>

          {/* Footer Guide */}
          <div
            className="text-center text-[11px] text-gray-400 py-1 z-10"
            onClick={(e) => e.stopPropagation()}
          >
            Tap image to zoom in • Double tap to toggle 2x • Pinch / Use 🔍+ buttons
          </div>
        </div>
      )}

      {/* DESKTOP SIDEBAR (COLLAPSIBLE & FULL-HEIGHT) */}
      <aside className={`hidden lg:flex lg:flex-col ${isSidebarCollapsed ? "w-20" : "w-64"} shrink-0 bg-slate-900 border-r border-slate-800 text-slate-100 h-screen transition-all duration-200 z-30 select-none`}>
        {/* Header with Title & Collapse Toggle */}
        <div className={`shrink-0 flex items-center ${isSidebarCollapsed ? "flex-col justify-center p-3 gap-2" : "justify-between px-4 py-4"} border-b border-slate-800`}>
          {!isSidebarCollapsed ? (
            <div className="flex items-center gap-2.5 min-w-0">
              <img src="/icon-192.png" alt="Educa Fintech" className="w-8 h-8 rounded-full object-contain bg-white p-0.5 shadow-xs shrink-0" />
              <div className="min-w-0">
                <h1 className="font-black text-base leading-tight truncate">Admin Panel</h1>
                <p className="text-blue-400 text-[11px] font-semibold truncate">Educa Finance</p>
              </div>
            </div>
          ) : (
            <img src="/icon-192.png" alt="Educa Fintech" className="w-8 h-8 rounded-full object-contain bg-white p-0.5 shadow-xs shrink-0" title="Educa Admin Panel" />
          )}

          <button
            type="button"
            onClick={toggleSidebar}
            title={isSidebarCollapsed ? "Expand Sidebar (Wider)" : "Collapse Sidebar (Compact)"}
            className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white transition cursor-pointer border border-slate-700 text-xs flex items-center justify-center shrink-0"
          >
            {isSidebarCollapsed ? "▶" : "◀"}
          </button>
        </div>

        {/* Navigation Items */}
        <nav className="flex-1 px-2.5 py-3 space-y-1 overflow-y-auto no-scrollbar">
          {tabs.map(({ key, label, icon, badge }) => (
            <button
              key={key}
              onClick={() => setTab(key)}
              title={isSidebarCollapsed ? label : undefined}
              className={`w-full flex items-center ${isSidebarCollapsed ? "justify-center px-2 py-2.5" : "justify-between px-3 py-2.5"} rounded-xl font-semibold text-xs transition cursor-pointer relative group ${
                tab === key
                  ? "bg-blue-600 text-white shadow-sm font-bold"
                  : "text-slate-300 hover:bg-slate-800 hover:text-white"
              }`}
            >
              <span className="flex items-center gap-2.5">
                <span className="text-base shrink-0">{icon}</span>
                {!isSidebarCollapsed && <span className="truncate">{label}</span>}
              </span>
              {!!badge && (
                isSidebarCollapsed ? (
                  <span className="absolute top-1.5 right-1.5 w-2 h-2 rounded-full bg-rose-500 ring-2 ring-slate-900" title={`${badge} alerts`} />
                ) : (
                  <span className="bg-rose-500 text-white text-[10px] font-bold px-1.5 py-0.5 rounded-full shrink-0">
                    {badge}
                  </span>
                )
              )}
            </button>
          ))}
        </nav>

        {/* Footer Area */}
        <div className={`shrink-0 ${isSidebarCollapsed ? "p-2 space-y-2" : "px-3.5 py-3 space-y-2"} border-t border-slate-800 bg-slate-950/60`}>
          <Link
            to="/dashboard"
            title={isSidebarCollapsed ? "Customer App View" : undefined}
            className="w-full flex items-center justify-center gap-2 px-2.5 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 rounded-xl transition text-xs font-bold active:scale-95 cursor-pointer shadow-xs"
          >
            <span>📱</span>
            {!isSidebarCollapsed && <span className="truncate">Customer App View</span>}
          </Link>
          {!isSidebarCollapsed && (
            <div className="flex items-center justify-between text-xs px-1 pt-0.5">
              <span className="text-slate-400 text-[11px] truncate">Admin: <strong className="text-white font-semibold">{user.name}</strong></span>
            </div>
          )}
          <button
            onClick={logout}
            title={isSidebarCollapsed ? "Logout" : undefined}
            className="w-full px-2.5 py-1.5 bg-rose-600/90 hover:bg-rose-600 text-white rounded-lg transition text-xs font-semibold cursor-pointer flex items-center justify-center gap-1.5"
          >
            <span>🚪</span>
            {!isSidebarCollapsed && <span>Logout</span>}
          </button>
        </div>
      </aside>

      <div className="flex-1 min-w-0 h-full overflow-y-auto">
        {/* MOBILE / TABLET TOP NAV */}
        <nav className="lg:hidden bg-slate-900 border-b border-slate-800 shadow-lg sticky top-0 z-40 safe-top">
          <div className="px-4 sm:px-6 py-3.5 sm:py-4 flex justify-between items-center">
            <div className="flex items-center gap-3">
              <img src="/icon-192.png" alt="Educa Fintech" className="w-8 h-8 rounded-full object-contain bg-white p-0.5 shadow-xs" />
              <div>
                <h1 className="text-white font-black text-base sm:text-lg leading-none">Admin Panel</h1>
                <p className="text-blue-400 text-xs font-semibold hidden sm:block">Educa Finance Control Center</p>
              </div>
            </div>
            <div className="flex items-center gap-2 sm:gap-3">
              <Link
                to="/dashboard"
                className="px-2.5 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 rounded-lg text-xs font-bold flex items-center gap-1 active:scale-95"
              >
                <span>📱</span> <span className="hidden sm:inline">App View</span>
              </Link>
              <div className="text-right hidden sm:block">
                <p className="text-slate-400 text-xs">Logged in as</p>
                <p className="text-white font-semibold text-sm">{user.name}</p>
              </div>
              <button onClick={logout} className="px-3 sm:px-4 py-2 bg-rose-600 text-white rounded-lg hover:bg-rose-700 transition text-xs sm:text-sm font-semibold">Logout</button>
            </div>
          </div>
        </nav>

        <div className="max-w-7xl mx-auto px-2.5 sm:px-6 py-3 sm:py-8 w-full min-w-0">
          {/* Stats */}
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2.5 sm:gap-4 mb-4 sm:mb-8">
            {statCards.map(({ icon, label, value, g }) => {
              const valStr = String(value);
              const isLong = valStr.length > 11;
              const isLive = label === "Fintech Reserves" || label === "Profit Credited";
              return (
                <div key={label} className={`bg-gradient-to-br ${g} text-white p-3 sm:p-4 lg:p-3.5 xl:p-4 rounded-2xl shadow-md min-w-0 flex flex-col justify-between`}>
                  <div className="flex items-start justify-between">
                    <div>
                      <div className="text-xl sm:text-2xl mb-1 sm:mb-1.5">{icon}</div>
                      <p className="text-white/80 text-[11px] sm:text-xs font-medium truncate">{label}</p>
                    </div>
                    {isLive && (
                      <span className="inline-flex items-center gap-1 bg-white/20 text-white text-[9px] font-black px-1.5 py-0.5 rounded-full backdrop-blur-xs">
                        <span className="w-1.5 h-1.5 rounded-full bg-emerald-300 animate-pulse" />
                        Live
                      </span>
                    )}
                  </div>
                  <div className="mt-1">
                    <p
                      className={`font-black font-display font-mono tabular-nums tracking-tight whitespace-nowrap overflow-visible ${
                        isLong
                          ? "text-xs sm:text-sm lg:text-[13px] xl:text-[15px]"
                          : "text-sm sm:text-base lg:text-base xl:text-lg"
                      }`}
                      title={valStr}
                    >
                      {value}
                    </p>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Tabs — mobile/tablet only (desktop uses sidebar) */}
          <div className="lg:hidden flex gap-1.5 mb-4 sm:mb-6 bg-white p-1.5 rounded-2xl shadow-xs border border-gray-100 overflow-x-auto no-scrollbar">
            {tabs.map(({ key, label, icon, badge }) => (
              <button key={key} onClick={() => setTab(key)}
                className={`shrink-0 py-2 sm:py-2.5 px-3 sm:px-4 rounded-xl font-bold text-xs sm:text-sm transition-all flex items-center gap-1.5 cursor-pointer ${tab === key ? "bg-indigo-600 text-white shadow-xs" : "text-gray-500 hover:text-gray-700"}`}>
                <span>{icon}</span><span>{label}</span>
                {!!badge && <span className={`text-[10px] font-black px-1.5 py-0.2 rounded-full ${tab === key ? "bg-white/20 text-white" : "bg-red-100 text-red-600"}`}>{badge}</span>}
              </button>
            ))}
          </div>

          {/* ══════════════════════════════════════════════════════
              PROFIT & RESERVES ANALYTICS VIEW
          ══════════════════════════════════════════════════════ */}
          {tab === "analytics" && (
            <div className="space-y-6 w-full min-w-0">
              {/* Header */}
              <div className="bg-gradient-to-r from-slate-900 via-slate-800 to-slate-900 text-white rounded-3xl p-6 sm:p-8 shadow-xl border border-slate-700 flex flex-col md:flex-row md:items-center justify-between gap-4 w-full min-w-0">
                <div>
                  <div className="flex items-center gap-2 mb-2">
                    <span className="text-2xl">📈</span>
                    <span className="text-xs font-black tracking-widest text-blue-300 uppercase px-2.5 py-0.5 rounded-full bg-blue-500/20 border border-blue-400/30">
                      Fintech Liquidity & Reserves Audit
                    </span>
                  </div>
                  <h2 className="text-2xl sm:text-3xl font-black font-display flex flex-wrap items-center">
                    <span>Total Fintech Reserves:&nbsp;</span>
                    {loadingAnalytics && !analytics && !liveAdminReserves ? (
                      <span className="inline-block h-8 w-44 bg-white/20 rounded-xl animate-pulse" />
                    ) : (
                      <span className="font-mono tabular-nums text-emerald-300">₹{Number(liveAdminReserves).toLocaleString("en-IN", { minimumFractionDigits: 4, maximumFractionDigits: 4 })}</span>
                    )}
                  </h2>
                  <p className="text-xs sm:text-sm text-slate-300 mt-2 max-w-2xl">
                    Real-time capital balance, customer deposits, compounding 12% p.a. daily yield distribution, and liquidity reserve health.
                  </p>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <button
                    onClick={loadAnalytics}
                    disabled={loadingAnalytics}
                    className="px-4 py-2.5 bg-slate-800 hover:bg-slate-700 text-white rounded-xl text-xs font-bold border border-slate-700 transition active:scale-95 flex items-center gap-2"
                  >
                    <span>{loadingAnalytics ? "⏳" : "🔄"}</span>
                    <span>{loadingAnalytics ? "Refreshing..." : "Refresh Data"}</span>
                  </button>
                  <button
                    onClick={() => setTab("settings")}
                    className="px-4 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-bold shadow-md transition active:scale-95 flex items-center gap-2"
                  >
                    <span>⚙️</span>
                    <span>Deposit & UPI Config</span>
                  </button>
                </div>
              </div>

              {/* 3 Major Metric Cards */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3.5 sm:gap-4 w-full">
                <div className="bg-white rounded-3xl p-5 border border-emerald-100/80 shadow-xs flex flex-col justify-between min-w-0">
                  <div>
                    <div className="flex items-center justify-between mb-1.5">
                      <p className="text-xs font-bold text-gray-500 flex items-center gap-1.5 truncate">
                        <span>🏦</span>
                        <span>Total Fintech Reserves</span>
                      </p>
                      <span className="inline-flex items-center gap-1 bg-emerald-100 text-emerald-800 text-[10px] font-extrabold px-2 py-0.5 rounded-full">
                        <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                        Live Ticking
                      </span>
                    </div>
                    {loadingAnalytics && !analytics && !liveAdminReserves ? (
                      <div className="h-9 w-40 bg-emerald-100/70 rounded-xl animate-pulse my-1" />
                    ) : (
                      <>
                        <p className="text-xl sm:text-2xl lg:text-3xl font-black font-display font-mono tabular-nums text-emerald-600 tracking-tight truncate">
                          ₹{Number(liveAdminReserves).toLocaleString("en-IN", { minimumFractionDigits: 4, maximumFractionDigits: 4 })}
                        </p>
                        <p className="text-xs font-mono font-bold text-gray-400 mt-0.5">
                          ≈ ₹{Number(liveAdminReserves).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} (Net Reserves)
                        </p>
                      </>
                    )}
                  </div>
                  <p className="text-[11px] text-gray-400 mt-2.5 flex items-center gap-1.5">
                    <span className="w-2 h-2 rounded-full bg-emerald-500 inline-block shrink-0" />
                    <span className="truncate">Active capital reserve pool (live)</span>
                  </p>
                </div>

                <div className="bg-white rounded-3xl p-5 border border-blue-100/80 shadow-xs flex flex-col justify-between min-w-0">
                  <div>
                    <p className="text-xs font-bold text-gray-500 mb-1.5 flex items-center gap-1.5 truncate">
                      <span>💰</span>
                      <span>Total Customer Deposits</span>
                    </p>
                    {loadingAnalytics && !analytics && !stats.totalDeposits ? (
                      <div className="h-9 w-40 bg-blue-100/70 rounded-xl animate-pulse my-1" />
                    ) : (
                      <p className="text-xl sm:text-2xl lg:text-3xl font-black font-display font-mono tabular-nums text-blue-600 tracking-tight truncate">
                        ₹{Number(analytics?.stats?.totalDeposits || 0).toLocaleString("en-IN")}
                      </p>
                    )}
                  </div>
                  <p className="text-[11px] text-gray-400 mt-2.5 flex items-center gap-1.5">
                    <span className="w-2 h-2 rounded-full bg-blue-500 inline-block shrink-0" />
                    <span className="truncate">{analytics?.stats?.approvedDepositCount ?? 0} Verified Deposits</span>
                  </p>
                </div>

                <div className="bg-white rounded-3xl p-5 border border-sky-100/80 shadow-xs flex flex-col justify-between min-w-0">
                  <div>
                    <div className="flex items-center justify-between mb-1.5">
                      <p className="text-xs font-bold text-gray-500 flex items-center gap-1.5 truncate">
                        <span>⚡</span>
                        <span>Total Profit Credited</span>
                      </p>
                      <span className="inline-flex items-center gap-1 bg-sky-100 text-sky-800 text-[10px] font-extrabold px-2 py-0.5 rounded-full">
                        <span className="w-1.5 h-1.5 rounded-full bg-sky-500 animate-pulse" />
                        Live Ticking
                      </span>
                    </div>
                    {loadingAnalytics && !analytics && !liveAdminProfit ? (
                      <div className="h-9 w-40 bg-sky-100/70 rounded-xl animate-pulse my-1" />
                    ) : (
                      <>
                        <p className="text-xl sm:text-2xl lg:text-3xl font-black font-display font-mono tabular-nums text-sky-600 tracking-tight truncate">
                          ₹{Number(liveAdminProfit).toLocaleString("en-IN", { minimumFractionDigits: 4, maximumFractionDigits: 4 })}
                        </p>
                        <p className="text-xs font-mono font-bold text-gray-400 mt-0.5">
                          ≈ ₹{Number(liveAdminProfit).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} (12% p.a. Earned)
                        </p>
                      </>
                    )}
                  </div>
                  <p className="text-[11px] text-gray-400 mt-2.5 flex items-center gap-1.5">
                    <span className="w-2 h-2 rounded-full bg-sky-500 inline-block shrink-0" />
                    <span className="truncate">12% p.a. Compounding Daily Yield</span>
                  </p>
                </div>
              </div>

              {/* Interactive Visual SVG Chart Card */}
              <div className="bg-white rounded-3xl p-5 sm:p-7 border border-gray-100 shadow-sm">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-4 border-b border-gray-100 gap-3">
                  <div>
                    <h3 className="text-lg font-black font-display text-gray-900 flex items-center gap-2">
                      <span>📊</span> Daily Profit & Capital Growth Chart
                    </h3>
                    <p className="text-xs text-gray-500">
                      Compounding 12% p.a. savings yield credited daily to active customer accounts (1% monthly ÷ calendar days)
                    </p>
                  </div>
                  <div className="flex items-center gap-1.5 p-1 bg-gray-100 rounded-xl shrink-0">
                    <button
                      onClick={() => setChartMode("daily")}
                      className={`px-3 py-1.5 text-xs font-bold rounded-lg transition ${
                        chartMode === "daily" ? "bg-white text-blue-700 shadow-xs" : "text-gray-500 hover:text-gray-900"
                      }`}
                    >
                      📊 Daily Yield Added
                    </button>
                    <button
                      onClick={() => setChartMode("cumulative")}
                      className={`px-3 py-1.5 text-xs font-bold rounded-lg transition ${
                        chartMode === "cumulative" ? "bg-white text-blue-700 shadow-xs" : "text-gray-500 hover:text-gray-900"
                      }`}
                    >
                      📈 Cumulative Growth
                    </button>
                  </div>
                </div>

                {/* SVG Visual Chart */}
                <div className="mt-6">
                  {(() => {
                    const data = analytics?.dailyProfitChart || [];

                    if (!data || data.length === 0) {
                      return (
                        <div className="py-14 flex flex-col items-center justify-center text-center bg-gray-50/50 rounded-3xl border border-dashed border-gray-200">
                          <div className="w-14 h-14 rounded-2xl bg-indigo-50 text-indigo-600 flex items-center justify-center text-2xl mb-3 shadow-xs">
                            📊
                          </div>
                          <p className="font-extrabold text-gray-800 text-sm">No Profit Yield History Yet</p>
                          <p className="text-xs text-gray-400 mt-1 max-w-sm">Daily interest calculations will automatically plot here as customer balances accrue yield.</p>
                        </div>
                      );
                    }

                    const isDaily = chartMode === "daily";

                    // Dynamic ceiling with nice human steps (never hardcoded flat 220 / 1800)
                    const rawValues = data.map(d => isDaily ? Number(d.amount || 0) : Number(d.cumulativeYield || 0));
                    const maxDataVal = Math.max(...rawValues, 1);

                    // Add 20% headroom so highest bar/point has ample breathing space
                    const targetCeil = Math.max(maxDataVal * 1.2, 5);
                    const rawStep = targetCeil / 4;
                    const magnitude = Math.pow(10, Math.floor(Math.log10(rawStep || 1)));
                    const norm = rawStep / magnitude;

                    let niceMultiplier = 1;
                    if (norm <= 1.2) niceMultiplier = 1;
                    else if (norm <= 1.7) niceMultiplier = 1.5;
                    else if (norm <= 2.2) niceMultiplier = 2;
                    else if (norm <= 2.8) niceMultiplier = 2.5;
                    else if (norm <= 3.8) niceMultiplier = 3;
                    else if (norm <= 6.5) niceMultiplier = 5;
                    else niceMultiplier = 10;

                    const stepVal = Math.max(1, Math.round(niceMultiplier * magnitude));
                    const maxVal = stepVal * 4;
                    const gridTicks = [0, stepVal, stepVal * 2, stepVal * 3, stepVal * 4];

                    const chartW = 760;
                    const chartH = 270;
                    const padLeft = 70;
                    const padRight = 40;
                    const padTop = 45;
                    const padBottom = 50;
                    const plotW = chartW - padLeft - padRight;
                    const plotH = chartH - padTop - padBottom;

                    // Group / cluster bars naturally when few days (data.length <= 4) to eliminate the awkward 325px gap
                    const isFewItems = data.length <= 4;
                    const slotW = isFewItems ? Math.min(120, plotW / (data.length + 1)) : plotW / data.length;
                    const totalContentW = slotW * data.length;
                    const startX = isFewItems ? padLeft + (plotW - totalContentW) / 2 : padLeft;
                    const getXCenter = (index) => startX + (index + 0.5) * slotW;

                    // Calculate point coordinates
                    const points = data.map((d, i) => {
                      const val = isDaily ? Number(d.amount || 0) : Number(d.cumulativeYield || 0);
                      const x = getXCenter(i);
                      const y = padTop + plotH - (val / maxVal) * plotH;
                      return { x, y, ...d, val };
                    });

                    // Build area and line path for cumulative chart
                    const linePath = points.map((p, i) => `${i === 0 ? "M" : "L"} ${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(" ");
                    const areaPath = points.length > 0
                      ? `${linePath} L ${points[points.length - 1].x.toFixed(1)} ${padTop + plotH} L ${points[0].x.toFixed(1)} ${padTop + plotH} Z`
                      : "";

                    return (
                      <div className="w-full overflow-x-auto no-scrollbar">
                        <svg viewBox={`0 0 ${chartW} ${chartH}`} className="w-full min-w-[580px] h-auto select-none">
                          <defs>
                            {/* Daily Bar Gradient */}
                            <linearGradient id="barGrad" x1="0" y1="0" x2="0" y2="1">
                              <stop offset="0%" stopColor="#4F46E5" />
                              <stop offset="70%" stopColor="#6366F1" />
                              <stop offset="100%" stopColor="#818CF8" stopOpacity="0.85" />
                            </linearGradient>
                            <linearGradient id="barGradHover" x1="0" y1="0" x2="0" y2="1">
                              <stop offset="0%" stopColor="#3730A3" />
                              <stop offset="100%" stopColor="#4F46E5" />
                            </linearGradient>

                            {/* Cumulative Area Gradient */}
                            <linearGradient id="areaGrad" x1="0" y1="0" x2="0" y2="1">
                              <stop offset="0%" stopColor="#4F46E5" stopOpacity="0.38" />
                              <stop offset="50%" stopColor="#6366F1" stopOpacity="0.18" />
                              <stop offset="100%" stopColor="#A5B4FC" stopOpacity="0.0" />
                            </linearGradient>

                            {/* Shadows & Glow */}
                            <filter id="lineGlow" x="-20%" y="-20%" width="140%" height="140%">
                              <feGaussianBlur stdDeviation="3" result="blur" />
                              <feComposite in="SourceGraphic" in2="blur" operator="over" />
                            </filter>
                            <filter id="pillShadow" x="-15%" y="-15%" width="130%" height="130%">
                              <feDropShadow dx="0" dy="2" stdDeviation="2" floodColor="#0F172A" floodOpacity="0.08" />
                            </filter>
                          </defs>

                          {/* Horizontal Gridlines & Clean Ticks */}
                          {gridTicks.map((tickVal, idx) => {
                            const pct = tickVal / maxVal;
                            const y = padTop + plotH - pct * plotH;
                            const isBottom = idx === 0;
                            return (
                              <g key={idx}>
                                <line
                                  x1={padLeft}
                                  y1={y}
                                  x2={chartW - padRight}
                                  y2={y}
                                  stroke={isBottom ? "#CBD5E1" : "#F1F5F9"}
                                  strokeWidth={isBottom ? 1.5 : 1}
                                  strokeDasharray={isBottom ? "none" : "4 4"}
                                />
                                <text
                                  x={padLeft - 12}
                                  y={y + 4}
                                  textAnchor="end"
                                  className="text-[11px] font-mono font-bold fill-slate-400"
                                >
                                  ₹{tickVal.toLocaleString("en-IN")}
                                </text>
                              </g>
                            );
                          })}

                          {/* ─────────── 1. DAILY YIELD ADDED (BAR CHART) ─────────── */}
                          {isDaily ? (
                            data.map((d, i) => {
                              const barW = isFewItems ? 56 : Math.min(68, Math.max(36, slotW * 0.42));
                              const amount = Number(d.amount || 0);
                              const barH = (amount / maxVal) * plotH;
                              const xCenter = getXCenter(i);
                              const x = xCenter - barW / 2;
                              const y = padTop + plotH - barH;
                              const isHovered = hoveredChartBar?.date === d.date;

                              return (
                                <g
                                  key={d.date}
                                  className="cursor-pointer group"
                                  onMouseEnter={() => setHoveredChartBar(d)}
                                  onClick={() => setHoveredChartBar(d)}
                                >
                                  {/* Background Track Column */}
                                  <rect
                                    x={x}
                                    y={padTop}
                                    width={barW}
                                    height={plotH}
                                    rx={10}
                                    fill={isHovered ? "#EEF2FF" : "#F8FAFC"}
                                    stroke={isHovered ? "#C7D2FE" : "#F1F5F9"}
                                    strokeWidth="1"
                                    className="transition-colors duration-200"
                                  />

                                  {/* Active Value Bar */}
                                  <rect
                                    x={x}
                                    y={y}
                                    width={barW}
                                    height={Math.max(barH, 6)}
                                    rx={10}
                                    fill={isHovered ? "url(#barGradHover)" : "url(#barGrad)"}
                                    className="transition-all duration-300"
                                  />

                                  {/* Value Badge Capsule Floating on Top */}
                                  <g transform={`translate(${xCenter}, ${Math.max(padTop + 14, y - 14)})`}>
                                    <rect
                                      x="-36"
                                      y="-12"
                                      width="72"
                                      height="20"
                                      rx="10"
                                      fill={isHovered ? "#312E81" : "#EEF2FF"}
                                      stroke={isHovered ? "#312E81" : "#C7D2FE"}
                                      strokeWidth="1"
                                      filter="url(#pillShadow)"
                                      className="transition-colors duration-200"
                                    />
                                    <text
                                      x="0"
                                      y="2"
                                      textAnchor="middle"
                                      className={`text-[11px] font-black font-mono transition-colors duration-200 ${
                                        isHovered ? "fill-white" : "fill-indigo-700"
                                      }`}
                                    >
                                      +₹{amount.toFixed(2)}
                                    </text>
                                  </g>

                                  {/* X-Axis Date Label */}
                                  <text
                                    x={xCenter}
                                    y={padTop + plotH + 20}
                                    textAnchor="middle"
                                    className={`text-[12px] font-black transition-colors duration-200 ${
                                      isHovered ? "fill-indigo-900 font-extrabold" : "fill-gray-700"
                                    }`}
                                  >
                                    {d.displayDate}
                                  </text>
                                  <text
                                    x={xCenter}
                                    y={padTop + plotH + 34}
                                    textAnchor="middle"
                                    className="text-[10px] font-bold fill-gray-400 font-mono"
                                  >
                                    Day {i + 1}
                                  </text>
                                </g>
                              );
                            })
                          ) : (
                            /* ─────────── 2. CUMULATIVE GROWTH (SMOOTH AREA LINE) ─────────── */
                            <g>
                              {/* Vertical Guide Lines Dropping to Dates */}
                              {points.map((p) => (
                                <line
                                  key={`guide-${p.date}`}
                                  x1={p.x}
                                  y1={p.y}
                                  x2={p.x}
                                  y2={padTop + plotH}
                                  stroke="#C7D2FE"
                                  strokeWidth="1.5"
                                  strokeDasharray="4 3"
                                />
                              ))}

                              {/* Area Fill */}
                              <path d={areaPath} fill="url(#areaGrad)" />

                              {/* Solid Glowing Line */}
                              <path
                                d={linePath}
                                fill="none"
                                stroke="#4F46E5"
                                strokeWidth="4"
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                filter="url(#lineGlow)"
                              />

                              {/* Interactive Nodes & Value Badges */}
                              {points.map((p, i) => {
                                const isHovered = hoveredChartBar?.date === p.date;
                                return (
                                  <g
                                    key={p.date}
                                    className="cursor-pointer group"
                                    onMouseEnter={() => setHoveredChartBar(p)}
                                    onClick={() => setHoveredChartBar(p)}
                                  >
                                    {/* Pulse Ring Halo */}
                                    <circle
                                      cx={p.x}
                                      cy={p.y}
                                      r={isHovered ? 13 : 9}
                                      fill="rgba(79, 70, 229, 0.16)"
                                      className="transition-all duration-200"
                                    />
                                    {/* Center Core Circle */}
                                    <circle
                                      cx={p.x}
                                      cy={p.y}
                                      r={isHovered ? 7 : 5.5}
                                      fill={isHovered ? "#312E81" : "#4F46E5"}
                                      stroke="#FFFFFF"
                                      strokeWidth="3"
                                      className="transition-all duration-200"
                                    />

                                    {/* Floating Cumulative Value Badge */}
                                    <g transform={`translate(${p.x}, ${Math.max(padTop + 14, p.y - 18)})`}>
                                      <rect
                                        x="-38"
                                        y="-12"
                                        width="76"
                                        height="22"
                                        rx="11"
                                        fill={isHovered ? "#1E1B4B" : "#4F46E5"}
                                        filter="url(#pillShadow)"
                                        className="transition-colors duration-200"
                                      />
                                      <text
                                        x="0"
                                        y="3"
                                        textAnchor="middle"
                                        className="text-[11px] font-black fill-white font-mono"
                                      >
                                        ₹{Number(p.val).toFixed(2)}
                                      </text>
                                    </g>

                                    {/* Date Label on Floor */}
                                    <text
                                      x={p.x}
                                      y={padTop + plotH + 20}
                                      textAnchor="middle"
                                      className={`text-[12px] font-black transition-colors duration-200 ${
                                        isHovered ? "fill-indigo-900 font-extrabold" : "fill-gray-700"
                                      }`}
                                    >
                                      {p.displayDate}
                                    </text>
                                    <text
                                      x={p.x}
                                      y={padTop + plotH + 34}
                                      textAnchor="middle"
                                      className="text-[10px] font-bold fill-indigo-600 font-mono"
                                    >
                                      Accrued ₹{Number(p.val).toFixed(2)}
                                    </text>
                                  </g>
                                );
                              })}
                            </g>
                          )}
                        </svg>
                      </div>
                    );
                  })()}
                </div>

                {/* Hover Details Card */}
                {hoveredChartBar && (
                  <div className="mt-4 p-3.5 bg-indigo-50 border border-indigo-200 rounded-2xl flex flex-wrap items-center justify-between gap-3 text-xs animate-in fade-in">
                    <div className="flex items-center gap-3">
                      <span className="text-xl">📅</span>
                      <div>
                        <span className="font-extrabold text-indigo-950 text-sm">{hoveredChartBar.displayDate}</span>
                        <p className="text-[11px] text-indigo-700">12% p.a. Savings Compounding Yield</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-4 text-xs font-semibold">
                      <div>
                        <span className="text-gray-500 text-[10px] block">Day's Profit:</span>
                        <span className="font-black text-emerald-600 text-sm">+₹{hoveredChartBar.amount}</span>
                      </div>
                      <div>
                        <span className="text-gray-500 text-[10px] block">Cumulative Yield:</span>
                        <span className="font-black text-indigo-600 text-sm">₹{hoveredChartBar.cumulativeYield}</span>
                      </div>
                      <div>
                        <span className="text-gray-500 text-[10px] block">Total Capital:</span>
                        <span className="font-black text-gray-900 text-sm">₹{Number(hoveredChartBar.estimatedCapital || (analytics?.stats?.totalDeposits || 0) + hoveredChartBar.cumulativeYield).toLocaleString("en-IN")}</span>
                      </div>
                    </div>
                  </div>
                )}
              </div>

              {/* ══════════════════════════════════════════════════════
                  GROWTH BREAKDOWN: "KAHAN SE KITNA BADHA KAISE BADHA"
              ══════════════════════════════════════════════════════ */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* Capital Sources Breakdown (Redesigned with Apple Design Craft) */}
                <div className="bg-white rounded-3xl p-6 border border-gray-100 shadow-sm space-y-5">
                  <div className="flex items-center justify-between pb-3 border-b border-gray-100">
                    <h3 className="text-base font-black font-display text-gray-900 flex items-center gap-2">
                      <span className="text-lg">🏛️</span> Capital Allocation & Sources
                    </h3>
                    <span className="text-xs font-bold font-mono text-gray-500 bg-gray-50 px-2.5 py-1 rounded-xl border border-gray-200">
                      Total Pool: ₹{Number(liveAdminReserves || analytics?.stats?.netFintechReserve || 0).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </span>
                  </div>

                  {(() => {
                    const dep = Number(analytics?.stats?.totalDeposits || stats.totalDeposits || 0);
                    const yld = Number(liveAdminProfit || analytics?.stats?.totalYieldCredited || 0);
                    const pool = dep + yld;
                    const depPct = pool > 0 ? ((dep / pool) * 100).toFixed(2) : "100.00";
                    const yldPct = pool > 0 ? Math.max(0.01, (yld / pool) * 100).toFixed(2) : "0.01";

                    return (
                      <>
                        {/* Apple-style Multi-colored Segment Bar */}
                        <div className="h-3 rounded-full bg-gray-100 flex overflow-hidden p-0.5 border border-gray-200/60 shadow-inner">
                          <div
                            style={{ width: `${depPct}%` }}
                            className="bg-emerald-500 h-full rounded-full transition-all duration-500"
                            title={`Customer Deposits (${depPct}%)`}
                          />
                          <div
                            style={{ width: `${Math.max(2, parseFloat(yldPct))}%` }}
                            className="bg-indigo-600 h-full rounded-full transition-all duration-500"
                            title={`Yield Profit (${yldPct}%)`}
                          />
                        </div>

                        <div className="space-y-3">
                          {/* Principal Deposits Row */}
                          <div className="p-4 rounded-2xl border border-gray-100 bg-gray-50/60 hover:bg-white hover:border-gray-200 hover:shadow-xs transition-all flex items-center justify-between gap-3">
                            <div className="flex items-center gap-3 min-w-0">
                              <div className="w-10 h-10 rounded-xl bg-emerald-50 border border-emerald-100 text-emerald-600 flex items-center justify-center text-lg shrink-0">
                                📥
                              </div>
                              <div className="min-w-0">
                                <p className="font-extrabold text-xs text-gray-900 truncate">Direct Customer Deposits</p>
                                <p className="text-[11px] text-gray-500 truncate">Verified capital via UPI & Bank transfer</p>
                              </div>
                            </div>
                            <div className="text-right shrink-0">
                              <p className="font-black font-mono text-sm text-gray-900">
                                ₹{dep.toLocaleString("en-IN")}
                              </p>
                              <span className="text-[10px] font-bold font-mono text-emerald-700 bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded-full inline-block mt-0.5">
                                {depPct}% Principal
                              </span>
                            </div>
                          </div>

                          {/* Accrued Profit Yield Row */}
                          <div className="p-4 rounded-2xl border border-gray-100 bg-gray-50/60 hover:bg-white hover:border-gray-200 hover:shadow-xs transition-all flex items-center justify-between gap-3">
                            <div className="flex items-center gap-3 min-w-0">
                              <div className="w-10 h-10 rounded-xl bg-indigo-50 border border-indigo-100 text-indigo-600 flex items-center justify-center text-lg shrink-0">
                                📈
                              </div>
                              <div className="min-w-0">
                                <p className="font-extrabold text-xs text-gray-900 truncate">12% p.a. Savings Yield</p>
                                <p className="text-[11px] text-gray-500 truncate">Automated daily compounding returns</p>
                              </div>
                            </div>
                            <div className="text-right shrink-0">
                              <p className="font-black font-mono text-sm text-indigo-600">
                                +₹{yld.toLocaleString("en-IN", { minimumFractionDigits: 4, maximumFractionDigits: 4 })}
                              </p>
                              <span className="text-[10px] font-bold font-mono text-indigo-700 bg-indigo-50 border border-indigo-200 px-2 py-0.5 rounded-full inline-block mt-0.5">
                                {yldPct}% ROI Growth
                              </span>
                            </div>
                          </div>
                        </div>
                      </>
                    );
                  })()}
                </div>

                {/* Capital Activity & Audit Trail (Redesigned with Apple Design Craft) */}
                <div className="bg-white rounded-3xl p-6 border border-gray-100 shadow-sm space-y-4 flex flex-col justify-between">
                  <div className="flex items-center justify-between pb-3 border-b border-gray-100">
                    <h3 className="text-base font-black font-display text-gray-900 flex items-center gap-2">
                      <span className="text-lg">⏱️</span> Capital Growth Audit Trail
                    </h3>
                    <span className="text-xs font-bold px-2.5 py-0.5 rounded-full bg-slate-100 text-slate-700 border border-slate-200">
                      Real-Time Ledger
                    </span>
                  </div>

                  <div className="space-y-2.5 text-xs max-h-[380px] overflow-y-auto pr-1 no-scrollbar">
                    {analytics?.timeline && analytics.timeline.length > 0 ? (
                      analytics.timeline.map((item, idx) => {
                        const isDeposit = item.type === "deposit";
                        const formattedAmt = Number(item.amount || 0).toLocaleString("en-IN", {
                          minimumFractionDigits: isDeposit ? 0 : 2,
                          maximumFractionDigits: 4
                        });

                        return (
                          <div
                            key={idx}
                            className="p-3 sm:p-3.5 rounded-2xl border border-gray-100 bg-gray-50/50 hover:bg-white hover:border-gray-200 hover:shadow-xs transition-all flex items-start gap-3"
                          >
                            <div
                              className={`w-9 h-9 rounded-xl flex items-center justify-center text-sm font-bold shrink-0 border ${
                                isDeposit
                                  ? "bg-emerald-50 text-emerald-600 border-emerald-100"
                                  : "bg-indigo-50 text-indigo-600 border-indigo-100"
                              }`}
                            >
                              {isDeposit ? "📥" : "⚡"}
                            </div>

                            <div className="flex-1 min-w-0">
                              <div className="flex items-center justify-between gap-2 mb-0.5">
                                <p className="font-extrabold text-gray-900 text-xs truncate">
                                  {isDeposit ? "Customer Capital Deposit" : "Daily Savings Yield Added"}
                                </p>
                                <span
                                  className={`font-mono font-bold text-xs px-2 py-0.5 rounded-lg shrink-0 border ${
                                    isDeposit
                                      ? "text-emerald-700 bg-emerald-50 border-emerald-200"
                                      : "text-indigo-700 bg-indigo-50 border-indigo-200"
                                  }`}
                                >
                                  +₹{formattedAmt}
                                </span>
                              </div>
                              <p className="text-gray-500 text-[11px] truncate">
                                {item.description}
                              </p>
                              <p className="text-[10px] text-gray-400 mt-1 font-medium">
                                🗓️ {new Date(item.date).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" })}
                              </p>
                            </div>
                          </div>
                        );
                      })
                    ) : (
                      <div className="py-12 text-center text-gray-400">
                        <span className="text-3xl block mb-2">📋</span>
                        <p className="font-bold text-xs text-gray-600">Abhi koi capital activity record nahi hui hai</p>
                        <p className="text-[11px] mt-1 text-gray-400 max-w-xs mx-auto">
                          Naye deposits ya daily profit credit hote hi live audit trail yahan appear hoga.
                        </p>
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {/* ══════════════════════════════════════════════════════
                  DAY-BY-DAY PROFIT LEDGER: "KOUN DIN KITNA ADD HUWA"
              ══════════════════════════════════════════════════════ */}
              <div className="bg-white rounded-3xl p-6 border border-gray-100 shadow-sm">
                <div className="flex items-center justify-between pb-4 border-b border-gray-100 mb-4">
                  <div>
                    <h3 className="text-base font-black font-display text-gray-900 flex items-center gap-2">
                      <span>📜</span> Day-by-Day Profit Breakdown Ledger
                    </h3>
                    <p className="text-xs text-gray-500">Har din ka alag-alag credit record date aur remarks ke sath</p>
                  </div>
                  <span className="text-xs font-black text-emerald-600 bg-emerald-50 px-3 py-1 rounded-full border border-emerald-200">
                    {analytics?.dailyProfitChart?.length || 0} Days Credited • Total +₹{Number(analytics?.stats?.totalYieldCredited || 0).toLocaleString("en-IN")}
                  </span>
                </div>

                {/* 12% Calculation Formula & Live Realtime Accrual Breakdown */}
                {(() => {
                  const currentBase = Number(analytics?.stats?.totalDeposits || stats.totalDeposits || 710000);
                  const annual12Pct = currentBase * 0.12;
                  const monthly1Pct = currentBase * 0.01;
                  const perDay31 = monthly1Pct / 31;
                  const perDay365 = annual12Pct / 365;
                  const todayRow = analytics?.dailyProfitChart?.find(d => d.date?.includes("2026-10-07") || d.date?.endsWith("-07"));
                  const prevRow = analytics?.dailyProfitChart?.find(d => d.date?.includes("2026-10-06") || d.date?.endsWith("-06"));
                  const prevAccrued = Number(prevRow?.amount || 43.64);
                  const baseToday = Number(todayRow?.amount || 233.24);
                  const liveTodayAccrued = baseToday + liveAccruedAdmin;

                  return (
                    <div className="mb-6 p-5 bg-gradient-to-br from-indigo-50/95 via-blue-50/80 to-emerald-50/90 border border-indigo-200/80 rounded-3xl shadow-xs">
                      {/* Header */}
                      <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
                        <div className="flex items-center gap-2.5">
                          <div className="w-9 h-9 rounded-xl bg-indigo-600 text-white flex items-center justify-center text-lg shadow-sm">
                            🧮
                          </div>
                          <div>
                            <h4 className="text-sm font-black text-gray-900 tracking-tight">
                              Transparent Daily Savings Yield & Real-Time Accrual Breakdown
                            </h4>
                            <p className="text-[11px] font-semibold text-gray-500">
                              Har din ka munafa kaise calculate hota hai aur live kaise credit hota hai
                            </p>
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="text-[11px] font-black text-indigo-700 bg-white px-3 py-1 rounded-full border border-indigo-200 shadow-2xs font-mono">
                            12.00% Annual (p.a.) • 1.00% Monthly
                          </span>
                          <span className="inline-flex items-center gap-1.5 text-[11px] font-black text-emerald-700 bg-emerald-100/90 px-2.5 py-1 rounded-full border border-emerald-300 shadow-2xs">
                            <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
                            Live Accrual Active
                          </span>
                        </div>
                      </div>

                      {/* 4 Step Visual Calculation Flow */}
                      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 mb-4">
                        {/* Step 1 */}
                        <div className="p-3.5 bg-white/95 rounded-2xl border border-indigo-100 shadow-2xs">
                          <div className="flex items-center justify-between mb-1">
                            <span className="text-[10px] font-extrabold text-indigo-600 uppercase tracking-wider">Step 1 • Active Capital</span>
                            <span className="text-xs">💼</span>
                          </div>
                          <p className="font-mono font-black text-base text-gray-900">₹{currentBase.toLocaleString("en-IN")}</p>
                          <p className="text-[11px] text-gray-500 mt-0.5">Approved Company Deposit Pool</p>
                        </div>

                        {/* Step 2 */}
                        <div className="p-3.5 bg-white/95 rounded-2xl border border-indigo-100 shadow-2xs">
                          <div className="flex items-center justify-between mb-1">
                            <span className="text-[10px] font-extrabold text-blue-600 uppercase tracking-wider">Step 2 • Monthly (1%)</span>
                            <span className="text-xs">📅</span>
                          </div>
                          <p className="font-mono font-black text-base text-blue-600">₹{monthly1Pct.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p>
                          <p className="text-[11px] text-gray-500 mt-0.5">₹{currentBase.toLocaleString("en-IN")} × 1% per month</p>
                        </div>

                        {/* Step 3 */}
                        <div className="p-3.5 bg-white/95 rounded-2xl border border-indigo-100 shadow-2xs">
                          <div className="flex items-center justify-between mb-1">
                            <span className="text-[10px] font-extrabold text-purple-600 uppercase tracking-wider">Step 3 • Daily Yield (24h)</span>
                            <span className="text-xs">🗓️</span>
                          </div>
                          <p className="font-mono font-black text-base text-purple-700">₹{perDay365.toFixed(2)} / full day</p>
                          <p className="text-[11px] text-gray-500 mt-0.5">₹{annual12Pct.toLocaleString("en-IN")} ÷ 365 din (~₹{perDay31.toFixed(2)} in Oct)</p>
                        </div>

                        {/* Step 4 */}
                        <div className="p-3.5 bg-gradient-to-br from-emerald-500 to-teal-600 text-white rounded-2xl shadow-xs">
                          <div className="flex items-center justify-between mb-1">
                            <span className="text-[10px] font-extrabold text-emerald-100 uppercase tracking-wider">Step 4 • Aaj Ka Live Status</span>
                            <span className="w-2 h-2 rounded-full bg-white animate-ping"></span>
                          </div>
                          <p className="font-mono font-black text-base text-white">
                            +₹{liveTodayAccrued.toLocaleString("en-IN", { minimumFractionDigits: 4, maximumFractionDigits: 4 })}
                          </p>
                          <p className="text-[11px] text-emerald-100 mt-0.5">
                            +₹{liveTodayAccrued.toFixed(2)} (Live Ticking ⚡)
                          </p>
                        </div>
                      </div>

                      {/* Live Understanding Notice Banner */}
                      <div className="p-3.5 bg-white/90 border border-indigo-100 rounded-2xl text-xs space-y-2">
                        <div className="flex items-start gap-2.5">
                          <span className="text-base mt-0.5">💡</span>
                          <div className="space-y-1 text-gray-700 leading-relaxed">
                            <p className="font-extrabold text-indigo-950">
                              Kyun din ka pura amount (+₹{perDay365.toFixed(2)}) ek baar me nahi, balki dheere-dheere badhta hai?
                            </p>
                            <p className="text-gray-600">
                              Educa Fintech me interest raat ko ek baar flat nahi judta, balki <strong>live real-time (har ghante aur minute)</strong> user ke wallet me add hota hai:
                            </p>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5 pt-1">
                              <div className="p-2.5 bg-slate-50 rounded-xl border border-slate-200">
                                <span className="font-bold text-gray-800 text-[11px] block">🗓️ 06 Oct (+₹{prevAccrued.toFixed(2)})</span>
                                <span className="text-[11px] text-gray-500">Deposit dopahar ko activate hua tha, isiliye us din ka bacha hua munafa judaa.</span>
                              </div>
                              <div className="p-2.5 bg-emerald-50/80 rounded-xl border border-emerald-200">
                                <span className="font-bold text-emerald-900 text-[11px] flex items-center justify-between">
                                  <span>🗓️ 07 Oct (+₹{liveTodayAccrued.toFixed(2)} 🟢 Live)</span>
                                  <span className="text-[9px] font-black text-emerald-700 bg-emerald-200/80 px-1.5 py-0.5 rounded">Ticking</span>
                                </span>
                                <span className="text-[11px] text-emerald-800">
                                  Live counter real-time tick ho raha hai: +₹{liveTodayAccrued.toLocaleString("en-IN", { minimumFractionDigits: 4, maximumFractionDigits: 4 })} • Total Reserves: ₹{liveAdminReserves.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                </span>
                              </div>
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })()}

                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="text-left text-gray-400 uppercase border-b border-gray-100 pb-2">
                        <th className="pb-3 font-bold pr-4">#</th>
                        <th className="pb-3 font-bold pr-4">Date</th>
                        <th className="pb-3 font-bold pr-4">Principal Base</th>
                        <th className="pb-3 font-bold pr-4">Rate</th>
                        <th className="pb-3 font-bold pr-4">Daily Profit</th>
                        <th className="pb-3 font-bold pr-4">Cumulative Total</th>
                        <th className="pb-3 font-bold pr-4">User</th>
                        <th className="pb-3 font-bold">Status</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-50">
                      {(!analytics?.dailyProfitChart || analytics.dailyProfitChart.length === 0) ? (
                        <tr>
                          <td colSpan="8" className="py-8 text-center text-gray-400 font-medium">
                            Koi daily profit yield abhi tak record nahi hua hai.
                          </td>
                        </tr>
                      ) : (
                        analytics.dailyProfitChart.map((row, idx) => {
                          const isToday = row.date?.includes("2026-10-07") || idx === analytics.dailyProfitChart.length - 1;
                          const rowAmount = isToday ? (Number(row.amount) + liveAccruedAdmin) : Number(row.amount);
                          const rowCumulative = isToday ? liveAdminProfit : Number(row.cumulativeYield);
                          return (
                            <tr key={row.date || idx} className="hover:bg-gray-50/70 transition">
                              <td className="py-3 pr-4 font-mono text-gray-400">{idx + 1}</td>
                              <td className="py-3 pr-4 font-bold text-gray-900 flex items-center gap-1.5">
                                <span>{row.displayDate || row.date}</span>
                                {isToday && (
                                  <span className="inline-flex items-center gap-1 text-[9px] font-black text-emerald-700 bg-emerald-100 px-1.5 py-0.5 rounded-full border border-emerald-300">
                                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></span>
                                    Live
                                  </span>
                                )}
                              </td>
                              <td className="py-3 pr-4 font-mono text-gray-600">₹{Number(row.estimatedCapital || (analytics?.stats?.totalDeposits || 0)).toLocaleString("en-IN")}</td>
                              <td className="py-3 pr-4 text-gray-500">12% p.a.</td>
                              <td className="py-3 pr-4 font-black text-emerald-600 font-mono">
                                +₹{rowAmount.toLocaleString("en-IN", { minimumFractionDigits: isToday ? 4 : 2, maximumFractionDigits: isToday ? 4 : 2 })}
                              </td>
                              <td className="py-3 pr-4 font-bold font-mono text-indigo-700">
                                ₹{rowCumulative.toLocaleString("en-IN", { minimumFractionDigits: isToday ? 4 : 2, maximumFractionDigits: isToday ? 4 : 2 })}
                              </td>
                              <td className="py-3 pr-4 text-gray-500">{row.uniqueUsers ? `${row.uniqueUsers} User(s)` : "Active User"}</td>
                              <td className="py-3">
                                <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${isToday ? "bg-emerald-500 text-white shadow-2xs" : "bg-emerald-100 text-emerald-700"}`}>
                                  {isToday ? "⚡ Live Crediting" : "✓ Credited"}
                                </span>
                              </td>
                            </tr>
                          );
                        })
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {/* PENDING */}
          {tab === "pending" && (
            <div className="bg-white rounded-2xl shadow-sm p-5 sm:p-6 border border-gray-100">
              {/* Active Deposit Credentials Info Banner */}
              <div className="mb-5 p-3.5 bg-gradient-to-r from-blue-50 to-indigo-50 border border-blue-200 rounded-2xl flex flex-wrap items-center justify-between gap-3 text-xs">
                <div className="flex items-center gap-2.5">
                  <span className="text-xl">💳</span>
                  <div>
                    <span className="font-extrabold text-blue-950">Active Deposit Credentials:</span>
                    <span className="text-blue-800 ml-1">
                      UPI: <strong className="font-mono">{depositDetails.upiId || "educafinance@upi"}</strong> | A/C: <strong className="font-mono">{depositDetails.accountNumber || "5010045239128"}</strong> ({depositDetails.bankName || "Bank of Baroda"})
                    </span>
                  </div>
                </div>
                <button
                  onClick={() => setTab("settings")}
                  className="px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-xl text-[11px] shadow-xs transition"
                >
                  ⚙️ Update UPI / Bank
                </button>
              </div>

              <h3 className="text-lg font-bold font-display mb-5">Pending Approvals</h3>
              {pending.length === 0 ? (
                <p className="py-10 text-center text-gray-300 text-sm">No pending transactions 🎉</p>
              ) : (
                <>
                  {/* Desktop table */}
                  <div className="hidden md:block overflow-x-auto">
                    <table className="w-full">
                      <thead>
                        <tr className="text-left text-xs text-gray-400 uppercase border-b">
                          {["User", "Type", "Amount", "Method", "Details", "Action"].map(h => <th key={h} className="pb-3 font-semibold pr-4">{h}</th>)}
                        </tr>
                      </thead>
                      <tbody className="text-sm">
                        {pending.map(t => (
                          <tr key={t._id} className="border-b border-gray-50 hover:bg-gray-50 transition">
                            <td className="py-3 pr-4"><p className="font-semibold">{t.userId?.name}</p><p className="text-xs text-gray-400">{t.userId?.email}</p></td>
                            <td className="py-3 pr-4">
                              <div className="flex flex-wrap items-center gap-1.5">
                                <span className={`px-2 py-1 rounded-full text-xs font-bold ${t.type === "deposit" ? "bg-green-100 text-green-700" : "bg-red-100 text-red-700"}`}>{t.type}</span>
                                {t.type === "withdrawal" && (
                                  <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${t.amount <= 5000 ? "bg-amber-100 text-amber-800 border border-amber-200" : "bg-purple-100 text-purple-800 border border-purple-200"}`}>
                                    {t.slaLabel || (t.amount <= 5000 ? "24h SLA" : "72h SLA")}
                                  </span>
                                )}
                              </div>
                            </td>
                            <td className="py-3 pr-4 font-bold">₹{t.amount.toLocaleString("en-IN")}</td>
                            <td className="py-3 pr-4 uppercase text-xs text-gray-500">{t.method}</td>
                            <td className="py-3 pr-4 text-xs text-gray-500 max-w-xs">
                              {t.utrNumber && <div className="font-mono font-bold text-gray-800">UTR: {t.utrNumber}</div>}
                              {(t.proofUrl || t.screenshotUrl) && (
                                <a href={t.proofUrl || t.screenshotUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-[11px] text-blue-600 hover:text-blue-800 hover:underline font-bold mt-1">
                                  📸 View Receipt / Evidence
                                </a>
                              )}
                              {t.paymentDetails && (
                                <div className="text-[11px] text-gray-500 truncate mt-0.5">
                                  {t.paymentDetails.upiId ? `UPI: ${t.paymentDetails.upiId}` : (t.paymentDetails.accountNumber ? `A/C: ${t.paymentDetails.accountNumber}` : "")}
                                </div>
                              )}
                            </td>
                            <td className="py-3">
                              <div className="flex gap-2">
                                <button onClick={() => approve(t._id)} className="px-3 py-1.5 bg-green-500 text-white rounded-lg text-xs font-bold hover:bg-green-600">✓ Approve</button>
                                <button onClick={() => reject(t._id)} className="px-3 py-1.5 bg-red-500 text-white rounded-lg text-xs font-bold hover:bg-red-600">✗ Reject</button>
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>

                  {/* Mobile card list */}
                  <div className="md:hidden space-y-3">
                    {pending.map(t => (
                      <div key={t._id} className="border border-gray-100 rounded-xl p-4">
                        <div className="flex justify-between items-start mb-2">
                          <div>
                            <p className="font-semibold text-sm">{t.userId?.name}</p>
                            <p className="text-xs text-gray-400">{t.userId?.email}</p>
                          </div>
                          <div className="flex flex-col items-end gap-1">
                            <span className={`px-2 py-1 rounded-full text-xs font-bold shrink-0 ${t.type === "deposit" ? "bg-green-100 text-green-700" : "bg-red-100 text-red-700"}`}>{t.type}</span>
                            {t.type === "withdrawal" && (
                              <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${t.amount <= 5000 ? "bg-amber-100 text-amber-800 border border-amber-200" : "bg-purple-100 text-purple-800 border border-purple-200"}`}>
                                {t.slaLabel || (t.amount <= 5000 ? "24h SLA" : "72h SLA")}
                              </span>
                            )}
                          </div>
                        </div>
                        <div className="flex justify-between text-sm mb-1">
                          <span className="text-gray-400">Amount</span>
                          <span className="font-bold">₹{t.amount.toLocaleString("en-IN")}</span>
                        </div>
                        <div className="flex justify-between text-sm mb-2">
                          <span className="text-gray-400">Method</span>
                          <span className="uppercase text-xs text-gray-500">{t.method}</span>
                        </div>
                        {t.utrNumber && <p className="text-xs font-mono font-bold text-gray-800 mb-1">UTR: {t.utrNumber}</p>}
                        {(t.proofUrl || t.screenshotUrl) && (
                          <div className="mb-2">
                            <a href={t.proofUrl || t.screenshotUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-xs text-blue-600 hover:underline font-bold">
                              📸 View Receipt / Evidence
                            </a>
                          </div>
                        )}
                        {t.paymentDetails && (
                          <p className="text-xs text-gray-500 mb-3 truncate">
                            {t.paymentDetails.upiId ? `UPI: ${t.paymentDetails.upiId}` : (t.paymentDetails.accountNumber ? `A/C: ${t.paymentDetails.accountNumber}` : JSON.stringify(t.paymentDetails))}
                          </p>
                        )}
                        <div className="flex gap-2">
                          <button onClick={() => approve(t._id)} className="flex-1 py-2 bg-green-500 text-white rounded-lg text-xs font-bold hover:bg-green-600 active:bg-green-700">✓ Approve</button>
                          <button onClick={() => reject(t._id)} className="flex-1 py-2 bg-red-500 text-white rounded-lg text-xs font-bold hover:bg-red-600 active:bg-red-700">✗ Reject</button>
                        </div>
                      </div>
                    ))}
                  </div>
                </>
              )}
            </div>
          )}

          {/* KYC VERIFICATION REQUESTS */}
          {tab === "kyc" && (
            <div className="bg-white rounded-2xl shadow-sm p-3.5 sm:p-6 border border-gray-100">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 sm:gap-4 mb-4 sm:mb-6">
                <div>
                  <h3 className="text-base sm:text-lg font-bold font-display text-gray-900 flex items-center gap-2">
                    <span>📄</span> User KYC Verification Requests
                  </h3>
                  <p className="text-xs text-gray-500">
                    Review submitted Aadhaar, PAN, Address & documents. Write admin notes and approve or reject.
                  </p>
                </div>

                {/* Action & Filter Pills */}
                <div className="flex flex-col sm:flex-row sm:items-center gap-2 w-full sm:w-auto">
                  <button
                    onClick={exportKycToCsv}
                    className="w-full sm:w-auto justify-center px-3.5 py-2 sm:py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold shadow-xs active:scale-95 transition flex items-center gap-1.5 cursor-pointer shrink-0"
                  >
                    <span>📥</span> Export to Excel
                  </button>

                    <div className="w-full sm:w-auto overflow-x-auto no-scrollbar flex gap-1 bg-gray-100 p-1 rounded-xl text-xs font-bold shrink-0">
                    {[
                      { key: "all", label: "All Submissions" },
                      { key: "pending", label: `Pending (${pendingKycCount})` },
                      { key: "verified", label: "Verified" },
                      { key: "rejected", label: "Rejected" },
                    ].map(f => (
                      <button
                        key={f.key}
                        onClick={() => setKycFilter(f.key)}
                        className={`shrink-0 whitespace-nowrap px-3 py-1.5 rounded-lg transition cursor-pointer ${
                          kycFilter === f.key
                            ? "bg-white text-blue-700 shadow-xs"
                            : "text-gray-500 hover:text-gray-800"
                        }`}
                      >
                        {f.label}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              {(() => {
                const kycUsers = users.filter(u => {
                  const hasKyc = u.kycStatus && u.kycStatus !== "none";
                  if (!hasKyc) return false;
                  if (kycFilter === "all") return true;
                  return u.kycStatus === kycFilter;
                });

                if (kycUsers.length === 0) {
                  return (
                    <div className="py-16 text-center text-gray-400">
                      <span className="text-4xl block mb-2">📄</span>
                      <p className="text-sm font-semibold">No KYC submissions found in this category.</p>
                    </div>
                  );
                }

                return (
                  <div className="space-y-3">
                    {kycUsers.map(u => (
                      <div
                        key={u._id}
                        onClick={() => {
                          setKycReviewRemarks(u.kycDocuments?.adminRemarks || "");
                          setPreviewKycUser(u);
                        }}
                        className="p-3.5 sm:p-4 bg-gray-50 hover:bg-blue-50/40 hover:border-blue-300 border border-gray-200 rounded-2xl flex flex-col md:flex-row md:items-center justify-between gap-3 sm:gap-4 transition cursor-pointer shadow-2xs group"
                      >
                        <div className="flex items-start gap-3 min-w-0">
                          {/* Document Thumbnails (Front & Back for Doc 1 & Doc 2) */}
                          <div className="flex items-center gap-1.5 shrink-0 flex-wrap max-w-[200px] sm:max-w-none">
                            {/* Doc 1 Front */}
                            {(u.kycDocuments?.doc1Url || u.kycDocuments?.docUrl) ? (
                              <div className="relative group/thumb">
                                <img
                                  src={u.kycDocuments.doc1Url || u.kycDocuments.docUrl}
                                  alt="Aadhaar Front"
                                  title="Aadhaar Front (Click to Zoom)"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setLightboxImg(u.kycDocuments.doc1Url || u.kycDocuments.docUrl);
                                    setZoomLevel(1);
                                  }}
                                  className="w-11 h-11 object-cover rounded-xl border border-gray-300 bg-white shadow-2xs group-hover/thumb:scale-105 hover:ring-2 hover:ring-blue-500 transition cursor-zoom-in"
                                />
                                <span className="absolute -bottom-1 left-1/2 -translate-x-1/2 bg-slate-900/90 text-white text-[8px] font-black px-1 rounded shadow-xs whitespace-nowrap pointer-events-none">
                                  UID Front
                                </span>
                              </div>
                            ) : (
                              <div className="w-11 h-11 rounded-xl bg-blue-50 text-blue-600 border border-blue-200 flex items-center justify-center text-xs font-bold" title="Aadhaar Front">🆔</div>
                            )}

                            {/* Doc 1 Back */}
                            {u.kycDocuments?.doc1BackUrl && (
                              <div className="relative group/thumb">
                                <img
                                  src={u.kycDocuments.doc1BackUrl}
                                  alt="Aadhaar Back"
                                  title="Aadhaar Back (Click to Zoom)"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setLightboxImg(u.kycDocuments.doc1BackUrl);
                                    setZoomLevel(1);
                                  }}
                                  className="w-11 h-11 object-cover rounded-xl border border-gray-300 bg-white shadow-2xs group-hover/thumb:scale-105 hover:ring-2 hover:ring-blue-500 transition cursor-zoom-in"
                                />
                                <span className="absolute -bottom-1 left-1/2 -translate-x-1/2 bg-slate-900/90 text-white text-[8px] font-black px-1 rounded shadow-xs whitespace-nowrap pointer-events-none">
                                  UID Back
                                </span>
                              </div>
                            )}

                            {/* Doc 2 Front */}
                            {u.kycDocuments?.doc2Url ? (
                              <div className="relative group/thumb">
                                <img
                                  src={u.kycDocuments.doc2Url}
                                  alt="Doc 2 Front"
                                  title={`${u.kycDocuments?.doc2Type === "cheque" ? "Cheque" : "PAN"} Front (Click to Zoom)`}
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setLightboxImg(u.kycDocuments.doc2Url);
                                    setZoomLevel(1);
                                  }}
                                  className="w-11 h-11 object-cover rounded-xl border border-gray-300 bg-white shadow-2xs group-hover/thumb:scale-105 hover:ring-2 hover:ring-blue-500 transition cursor-zoom-in"
                                />
                                <span className="absolute -bottom-1 left-1/2 -translate-x-1/2 bg-indigo-900/90 text-white text-[8px] font-black px-1 rounded shadow-xs whitespace-nowrap pointer-events-none">
                                  {u.kycDocuments?.doc2Type === "cheque" ? "CHQ Front" : "PAN Front"}
                                </span>
                              </div>
                            ) : (
                              <div className="w-11 h-11 rounded-xl bg-slate-100 text-slate-600 border border-slate-200 flex items-center justify-center text-xs font-bold" title="Doc 2 Front">💳</div>
                            )}

                            {/* Doc 2 Back */}
                            {u.kycDocuments?.doc2BackUrl && (
                              <div className="relative group/thumb">
                                <img
                                  src={u.kycDocuments.doc2BackUrl}
                                  alt="Doc 2 Back"
                                  title={`${u.kycDocuments?.doc2Type === "cheque" ? "Cheque" : "PAN"} Back (Click to Zoom)`}
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setLightboxImg(u.kycDocuments.doc2BackUrl);
                                    setZoomLevel(1);
                                  }}
                                  className="w-11 h-11 object-cover rounded-xl border border-gray-300 bg-white shadow-2xs group-hover/thumb:scale-105 hover:ring-2 hover:ring-blue-500 transition cursor-zoom-in"
                                />
                                <span className="absolute -bottom-1 left-1/2 -translate-x-1/2 bg-indigo-900/90 text-white text-[8px] font-black px-1 rounded shadow-xs whitespace-nowrap pointer-events-none">
                                  {u.kycDocuments?.doc2Type === "cheque" ? "CHQ Back" : "PAN Back"}
                                </span>
                              </div>
                            )}
                          </div>

                          <div className="min-w-0 space-y-1">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="font-bold text-gray-900 text-sm group-hover:text-blue-900 transition">{u.name}</span>
                              <span
                                className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase ${
                                  u.kycStatus === "verified"
                                    ? "bg-emerald-100 text-emerald-800"
                                    : u.kycStatus === "pending"
                                    ? "bg-amber-100 text-amber-800"
                                    : "bg-rose-100 text-rose-800"
                                }`}
                              >
                                {u.kycStatus}
                              </span>
                              <span className="text-[10px] text-gray-400 font-mono">
                                🕒 {u.kycDocuments?.submittedAt ? new Date(u.kycDocuments.submittedAt).toLocaleString("en-IN", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }) : "Recent"}
                              </span>
                            </div>

                            <p className="text-xs text-gray-500">
                              {u.email} · {u.phone}
                            </p>

                            <div className="flex flex-wrap items-center gap-1.5 text-[11px] text-gray-600">
                              {u.kycDocuments?.aadharNumber && (
                                <span className="font-mono bg-white px-2 py-0.5 rounded border border-gray-200 text-slate-700">
                                  UID: {u.kycDocuments.aadharNumber}
                                </span>
                              )}
                              <span className="font-bold px-2 py-0.5 rounded bg-blue-50 text-blue-700 border border-blue-200 uppercase text-[10px]">
                                {u.kycDocuments?.doc2Type === "cheque" ? "Cheque" : "PAN"}
                              </span>
                              {u.kycDocuments?.panNumber && (
                                <span className="font-mono uppercase bg-white px-2 py-0.5 rounded border border-gray-200 text-slate-700">
                                  PAN: {u.kycDocuments.panNumber}
                                </span>
                              )}
                              {u.kycDocuments?.chequeNumber && (
                                <span className="font-mono bg-white px-2 py-0.5 rounded border border-gray-200 text-slate-700">
                                  CHQ: {u.kycDocuments.chequeNumber}
                                </span>
                              )}
                              {(u.address || u.kycDocuments?.address) && (
                                <span className="truncate max-w-[200px] text-gray-500">
                                  📍 {u.address || u.kycDocuments?.address}
                                </span>
                              )}
                            </div>

                            {u.kycDocuments?.adminRemarks && (
                              <p className="text-[11px] text-blue-700 font-medium bg-blue-50/80 px-2 py-0.5 rounded border border-blue-100 flex items-center gap-1">
                                <span>💬 Note:</span>
                                <span>{u.kycDocuments.adminRemarks}</span>
                                {(u.kycStatus === "verified" || u.kycStatus === "rejected" || u.kycDocuments?.isNoteLocked) && (
                                  <span className="text-[9px] text-gray-400 font-bold ml-1">🔒 Locked</span>
                                )}
                              </p>
                            )}
                          </div>
                        </div>

                        {/* Action */}
                        <div className="flex items-center gap-2 w-full md:w-auto shrink-0 md:self-center">
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              setKycReviewRemarks(u.kycDocuments?.adminRemarks || "");
                              setPreviewKycUser(u);
                            }}
                            className={`w-full md:w-auto justify-center px-4 py-2.5 rounded-xl text-xs font-bold shadow-md active:scale-95 transition flex items-center gap-1.5 cursor-pointer ${
                              u.kycStatus === "rejected"
                                ? "bg-rose-100 text-rose-700 border border-rose-200 shadow-none hover:bg-rose-200/70"
                                : u.kycStatus === "verified"
                                ? "bg-emerald-100 text-emerald-700 border border-emerald-200 shadow-none hover:bg-emerald-200/70"
                                : "bg-blue-600 hover:bg-blue-700 text-white shadow-blue-500/20"
                            }`}
                          >
                            <span>{u.kycStatus === "rejected" ? "🚫" : u.kycStatus === "verified" ? "✓" : "🔍"}</span>
                            {u.kycStatus === "rejected" ? "Rejected — View" : u.kycStatus === "verified" ? "Verified — View" : "Review & Verify"}
                          </button>
                        </div>

                      </div>
                    ))}
                  </div>
                );
              })()}
            </div>
          )}

          {/* ══════════════════════════════════════════════════════
              DEDICATED MULTI-CATEGORY AUDIT HISTORY VIEW
          ══════════════════════════════════════════════════════ */}
          {tab === "history" && (
            <div className="bg-white rounded-2xl shadow-sm p-4 sm:p-6 border border-gray-100 space-y-4">
              {/* Header */}
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-gray-100">
                <div>
                  <h3 className="text-base sm:text-lg font-bold font-display text-gray-900 flex items-center gap-2">
                    <span>📜</span> Activity Audit History
                  </h3>
                  <p className="text-xs text-gray-500">
                    Comprehensive traceable history of deposits, withdrawals, KYC verifications, loans, and yield distributions.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={loadAuditHistory}
                  disabled={historyLoading}
                  className="self-start sm:self-auto px-3.5 py-1.5 bg-slate-800 hover:bg-slate-700 text-white rounded-xl text-xs font-bold flex items-center gap-1.5 cursor-pointer transition active:scale-95 disabled:opacity-50"
                >
                  <span className={historyLoading ? "animate-spin" : ""}>🔄</span>
                  <span>{historyLoading ? "Refreshing..." : "Refresh Logs"}</span>
                </button>
              </div>

              {/* Multi-Type Filter Bar */}
              <div className="flex flex-col lg:flex-row items-stretch lg:items-center justify-between gap-3">
                {/* Category Pills */}
                <div className="flex flex-wrap items-center gap-1.5 text-xs font-bold">
                  {[
                    { key: "all", label: "All History", icon: "🌐" },
                    { key: "deposit", label: "Deposits (Add)", icon: "💰" },
                    { key: "withdrawal", label: "Withdrawals (Out)", icon: "💸" },
                    { key: "transfer", label: "P2P Transfers", icon: "🔄" },
                    { key: "kyc", label: "All KYC", icon: "📄" },
                    { key: "normal_kyc", label: "Normal KYC", icon: "👤" },
                    { key: "loan_kyc", label: "Loan/Lending KYC", icon: "🏦" },
                    { key: "loan", label: "Loans", icon: "📑" },
                    { key: "agent", label: "Agents", icon: "🤝" },
                    { key: "yield", label: "12% Yield", icon: "📈" },
                  ].map(c => (
                    <button
                      key={c.key}
                      onClick={() => setHistoryCategory(c.key)}
                      className={`px-3 py-1.5 rounded-xl transition cursor-pointer flex items-center gap-1 active:scale-95 ${
                        historyCategory === c.key
                          ? "bg-blue-600 text-white shadow-xs font-black"
                          : "bg-slate-100 text-slate-700 hover:bg-slate-200 border border-slate-200"
                      }`}
                    >
                      <span>{c.icon}</span>
                      <span>{c.label}</span>
                    </button>
                  ))}
                </div>

                {/* Status Filter & Search */}
                <div className="flex flex-wrap sm:flex-nowrap items-center gap-2">
                  <select
                    value={historyStatus}
                    onChange={(e) => setHistoryStatus(e.target.value)}
                    className="px-3 py-1.5 rounded-xl border border-gray-200 bg-white text-xs font-bold text-gray-700 focus:outline-none focus:ring-2 focus:ring-blue-500 cursor-pointer"
                  >
                    <option value="all">All Statuses</option>
                    <option value="approved">Approved / Done</option>
                    <option value="pending">Pending</option>
                    <option value="rejected">Rejected</option>
                  </select>

                  <input
                    type="text"
                    value={historySearch}
                    onChange={(e) => setHistorySearch(e.target.value)}
                    placeholder="Search by user, phone, UTR..."
                    className="flex-1 sm:w-56 px-3 py-1.5 rounded-xl border border-gray-200 text-xs text-gray-800 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
              </div>

              {/* Audit History Records Table */}
              {historyLoading ? (
                <div className="py-16 text-center text-gray-400">
                  <span className="text-3xl block mb-2 animate-spin">🔄</span>
                  <p className="text-xs font-semibold">Loading audit records...</p>
                </div>
              ) : auditHistory.length === 0 ? (
                <div className="py-16 text-center text-gray-400 bg-slate-50 rounded-2xl border border-dashed border-gray-200">
                  <span className="text-4xl block mb-2">📜</span>
                  <p className="text-sm font-semibold">No audit records found matching this filter.</p>
                  <p className="text-xs text-gray-400 mt-1">Try changing category or clearing search query.</p>
                </div>
              ) : (
                <div className="overflow-x-auto rounded-2xl border border-gray-200 shadow-2xs">
                  <table className="w-full min-w-[850px] table-fixed border-collapse bg-white text-left text-xs">
                    <thead>
                      <tr className="bg-slate-50 border-b border-gray-200 text-[11px] font-bold text-slate-500 uppercase tracking-wider">
                        <th className="py-3 px-4 w-[150px]">Timestamp</th>
                        <th className="py-3 px-4 w-[170px]">Category & Action</th>
                        <th className="py-3 px-4 w-[190px]">User / Account</th>
                        <th className="py-3 px-4 w-[120px]">Amount / Value</th>
                        <th className="py-3 px-4 w-[100px]">Status</th>
                        <th className="py-3 px-4">Audit Reference / Details & Docs</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {auditHistory.map((item, idx) => {
                        const isApproved = item.status === "approved" || item.status === "completed" || item.status === "verified" || item.status === "active";
                        const isPending = item.status === "pending";
                        const isRejected = item.status === "rejected";
                        const d = new Date(item.timestamp || item.createdAt || Date.now());
                        const isDateValid = !isNaN(d.getTime());
                        const refVal = item.reference || item.referenceId;
                        const noteVal = item.notes || item.remarks;

                        return (
                          <tr key={item.id || idx} className="hover:bg-slate-50/70 transition-colors">
                            {/* Timestamp */}
                            <td className="py-3.5 px-4 font-mono text-[11px] text-slate-600 align-top">
                              <span className="block font-bold text-slate-900">
                                {isDateValid ? d.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" }) : "Recent"}
                              </span>
                              <span className="text-[10px] text-slate-400">
                                {isDateValid ? d.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: true }) : ""}
                              </span>
                            </td>

                            {/* Category & Action */}
                            <td className="py-3.5 px-4 align-top">
                              <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-black uppercase ${
                                item.category === "deposit"
                                  ? "bg-emerald-100 text-emerald-800"
                                  : item.category === "withdrawal"
                                  ? "bg-rose-100 text-rose-800"
                                  : item.category === "transfer"
                                  ? "bg-violet-100 text-violet-800"
                                  : item.category === "kyc"
                                  ? item.subCategory === "loan_lending_kyc"
                                    ? "bg-indigo-100 text-indigo-800"
                                    : "bg-amber-100 text-amber-800"
                                  : item.category === "loan"
                                  ? "bg-blue-100 text-blue-800"
                                  : item.category === "agent"
                                  ? "bg-purple-100 text-purple-800"
                                  : "bg-teal-100 text-teal-800"
                              }`}>
                                {item.category === "deposit" ? "💰 Deposit (Add)" :
                                 item.category === "withdrawal" ? "💸 Withdrawal (Out)" :
                                 item.category === "transfer" ? "🔄 P2P Transfer" :
                                 item.category === "kyc"
                                   ? item.subCategory === "loan_lending_kyc" ? "🏦 Loan/Lending KYC" : "📄 Normal KYC" :
                                 item.category === "loan" ? "🏦 Loan" :
                                 item.category === "agent" ? "🤝 Agent" : "📈 Yield"}
                              </span>
                              <p className="font-bold text-gray-900 text-xs mt-1 leading-tight">{item.title}</p>
                            </td>

                            {/* User */}
                            <td className="py-3.5 px-4 align-top">
                              <p className="font-bold text-gray-900 text-xs leading-tight">{item.userName}</p>
                              <p className="text-[11px] text-gray-500 truncate max-w-[180px]">{item.userEmail}</p>
                              {item.userPhone && <p className="text-[10px] text-gray-400 font-mono">{item.userPhone}</p>}
                            </td>

                            {/* Amount */}
                            <td className="py-3.5 px-4 align-top">
                              {item.amount != null ? (
                                <span className={`font-mono font-black text-xs ${
                                  item.category === "deposit" || item.category === "yield"
                                    ? "text-emerald-600"
                                    : item.category === "withdrawal"
                                    ? "text-rose-600"
                                    : item.category === "transfer"
                                    ? "text-violet-700"
                                    : "text-slate-900"
                                }`}>
                                  ₹{Number(item.amount).toLocaleString("en-IN")}
                                </span>
                              ) : (
                                <span className="text-gray-400 text-xs">—</span>
                              )}
                            </td>

                            {/* Status */}
                            <td className="py-3.5 px-4 align-top">
                              <span className={`inline-block px-2 py-0.5 rounded-full text-[10px] font-bold uppercase ${
                                isApproved
                                  ? "bg-emerald-100 text-emerald-800"
                                  : isPending
                                  ? "bg-amber-100 text-amber-800"
                                  : isRejected
                                  ? "bg-rose-100 text-rose-800"
                                  : "bg-slate-100 text-slate-700"
                              }`}>
                                {item.status}
                              </span>
                            </td>

                            {/* Reference / Details & KYC Document Thumbnails */}
                            <td className="py-3.5 px-4 align-top text-[11px] text-slate-600">
                              {refVal && (
                                <p className="font-mono text-[10px] text-slate-700 font-bold break-all" title={refVal}>
                                  Ref: {refVal}
                                </p>
                              )}
                              {noteVal && (
                                <p className="text-slate-600 text-[11px] mt-0.5" title={noteVal}>
                                  {noteVal}
                                </p>
                              )}

                              {/* KYC Photos / Documents View */}
                              {item.category === "kyc" && (
                                <div className="mt-2 pt-1 border-t border-gray-100">
                                  {item.hasPhotos && item.documents ? (
                                    <div className="space-y-1">
                                      <span className="text-[9px] font-bold text-gray-400 uppercase tracking-wider block">
                                        Uploaded KYC Photos (Click to Zoom):
                                      </span>
                                      <div className="flex items-center gap-1.5 flex-wrap">
                                        {item.documents.doc1Url && (
                                          <button
                                            type="button"
                                            onClick={() => setLightboxImg(item.documents.doc1Url)}
                                            className="inline-flex items-center gap-1 px-2 py-1 bg-blue-50 hover:bg-blue-100 border border-blue-200 rounded-lg text-[10px] font-bold text-blue-800 cursor-pointer transition active:scale-95 group/doc"
                                          >
                                            {item.documents.doc1Url.startsWith("data:image") ? (
                                              <img src={item.documents.doc1Url} alt="UID Front" className="w-4 h-4 object-cover rounded border border-blue-300" />
                                            ) : <span>🪪</span>}
                                            <span>UID Front</span>
                                            <span className="text-blue-500 group-hover/doc:scale-110">🔍</span>
                                          </button>
                                        )}
                                        {item.documents.doc1BackUrl && (
                                          <button
                                            type="button"
                                            onClick={() => setLightboxImg(item.documents.doc1BackUrl)}
                                            className="inline-flex items-center gap-1 px-2 py-1 bg-blue-50 hover:bg-blue-100 border border-blue-200 rounded-lg text-[10px] font-bold text-blue-800 cursor-pointer transition active:scale-95 group/doc"
                                          >
                                            {item.documents.doc1BackUrl.startsWith("data:image") ? (
                                              <img src={item.documents.doc1BackUrl} alt="UID Back" className="w-4 h-4 object-cover rounded border border-blue-300" />
                                            ) : <span>🔄</span>}
                                            <span>UID Back</span>
                                            <span className="text-blue-500 group-hover/doc:scale-110">🔍</span>
                                          </button>
                                        )}
                                        {item.documents.doc2Url && (
                                          <button
                                            type="button"
                                            onClick={() => setLightboxImg(item.documents.doc2Url)}
                                            className="inline-flex items-center gap-1 px-2 py-1 bg-amber-50 hover:bg-amber-100 border border-amber-200 rounded-lg text-[10px] font-bold text-amber-800 cursor-pointer transition active:scale-95 group/doc"
                                          >
                                            {item.documents.doc2Url.startsWith("data:image") ? (
                                              <img src={item.documents.doc2Url} alt="Doc2 Front" className="w-4 h-4 object-cover rounded border border-amber-300" />
                                            ) : <span>📑</span>}
                                            <span>{item.subCategory === "loan_lending_kyc" ? "Cheque Front" : "PAN Front"}</span>
                                            <span className="text-amber-600 group-hover/doc:scale-110">🔍</span>
                                          </button>
                                        )}
                                        {item.documents.doc2BackUrl && (
                                          <button
                                            type="button"
                                            onClick={() => setLightboxImg(item.documents.doc2BackUrl)}
                                            className="inline-flex items-center gap-1 px-2 py-1 bg-amber-50 hover:bg-amber-100 border border-amber-200 rounded-lg text-[10px] font-bold text-amber-800 cursor-pointer transition active:scale-95 group/doc"
                                          >
                                            {item.documents.doc2BackUrl.startsWith("data:image") ? (
                                              <img src={item.documents.doc2BackUrl} alt="Doc2 Back" className="w-4 h-4 object-cover rounded border border-amber-300" />
                                            ) : <span>📄</span>}
                                            <span>{item.subCategory === "loan_lending_kyc" ? "Cheque Back" : "PAN Back"}</span>
                                            <span className="text-amber-600 group-hover/doc:scale-110">🔍</span>
                                          </button>
                                        )}
                                      </div>
                                    </div>
                                  ) : (
                                    <div className="inline-flex items-center gap-1 text-[10px] font-bold text-slate-400 bg-slate-50 border border-slate-200 px-2 py-0.5 rounded">
                                      <span>📷</span> Photos Not Uploaded (Pending Submission)
                                    </div>
                                  )}
                                </div>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}

          {/* AGENT PARTNERS */}
          {tab === "agents" && (
            <div className="bg-white rounded-2xl shadow-sm p-5 sm:p-6 border border-gray-100">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4">
                <div>
                  <h3 className="text-lg font-bold font-display text-gray-900">Agent Partner Applications & Directory</h3>
                  <p className="text-xs text-gray-500">Contact applicants, verify shop & details, approve status, and manage commission tiers</p>
                </div>
                <div className="flex items-center gap-2">
                  <span className="px-3 py-1 bg-amber-100 text-amber-900 text-xs font-bold rounded-full">
                    {agents.filter(a => a.agentProfile?.status === "pending").length} Pending
                  </span>
                  <span className="px-3 py-1 bg-emerald-100 text-emerald-900 text-xs font-bold rounded-full">
                    {agents.filter(a => a.role === "agent" || a.agentProfile?.status === "approved").length} Approved
                  </span>
                </div>
              </div>

              {/* Agent Foreclosure Commission Structure Guide Card */}
              <div className="mb-5 p-4 rounded-2xl bg-gradient-to-r from-blue-50 via-indigo-50 to-amber-50 border border-blue-200/70 space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <span className="text-base">⚡</span>
                    <h4 className="text-xs sm:text-sm font-extrabold text-blue-950">
                      Loan Pre-Closure 3-Way Sharing Rule (User • Agent • Company)
                    </h4>
                  </div>
                  <span className="px-2.5 py-0.5 rounded-full text-[10px] font-black bg-indigo-600 text-white uppercase tracking-wider">
                    1:1:1 Equal Split
                  </span>
                </div>
                <div className="text-[11px] sm:text-xs text-blue-900/90 leading-relaxed bg-white/70 p-3 rounded-xl border border-blue-100">
                  <p className="font-bold text-indigo-950 mb-1">
                    📌 <strong>Official Pre-Closure Rules:</strong>
                  </p>
                  <ul className="list-disc list-inside space-y-1 text-gray-700">
                    <li><strong>9 Kist Rule:</strong> Agar 9th installment se pehle close hoga to hi fayda/discount hoga. (9 ya uske baad discount zero).</li>
                    <li><strong>15 Kist Minimum Payoff:</strong> Borrower ko minimum 15 kiston ka bhugtan karna zaroori hai.</li>
                    <li><strong>x% Formula:</strong> 15 ke upar jitna installment hai, utna percent chhoot hoga: <code className="font-mono bg-blue-100 px-1 py-0.5 rounded text-blue-900 font-bold">Total Kist - 15 = x% of Loan Amount</code>.</li>
                    <li><strong>3 Barabar Hisse (1:1:1):</strong> Jo x% pool aayega uske 3 part honge: <strong>1 User ko discount</strong>, <strong>1 Agent ko benefit</strong>, <strong>1 Company ko profit</strong>.</li>
                  </ul>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 text-xs">
                  <div className="p-3 bg-white rounded-xl border border-emerald-100 shadow-2xs">
                    <span className="text-[10px] uppercase font-bold text-emerald-600 block">1️⃣ User Ko Chhoot</span>
                    <span className="text-base font-black text-emerald-700">x / 3 % Discount</span>
                    <p className="text-[10px] text-gray-500 mt-0.5">Payoff amount se direct minus</p>
                  </div>
                  <div className="p-3 bg-white rounded-xl border border-amber-100 shadow-2xs">
                    <span className="text-[10px] uppercase font-bold text-amber-600 block">2️⃣ Agent Ko Benefits</span>
                    <span className="text-base font-black text-amber-700">x / 3 % Commission</span>
                    <p className="text-[10px] text-gray-500 mt-0.5">Direct wallet me auto-credit</p>
                  </div>
                  <div className="p-3 bg-white rounded-xl border border-indigo-100 shadow-2xs">
                    <span className="text-[10px] uppercase font-bold text-indigo-600 block">3️⃣ Company Ko Profit</span>
                    <span className="text-base font-black text-indigo-700">x / 3 % Profit</span>
                    <p className="text-[10px] text-gray-500 mt-0.5">Company reserves me retained</p>
                  </div>
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-center text-[10px] pt-1 border-t border-blue-200/50 text-gray-700 font-medium">
                  <div className="bg-white/80 py-1.5 px-2 rounded-lg border border-blue-100">
                    <span className="font-mono text-indigo-900 font-bold block">18 Kist (x=3%)</span>
                    <span>1% User | 1% Agent | 1% Co.</span>
                  </div>
                  <div className="bg-white/80 py-1.5 px-2 rounded-lg border border-blue-100">
                    <span className="font-mono text-indigo-900 font-bold block">21 Kist (x=6%)</span>
                    <span>2% User | 2% Agent | 2% Co.</span>
                  </div>
                  <div className="bg-white/80 py-1.5 px-2 rounded-lg border border-blue-100">
                    <span className="font-mono text-indigo-900 font-bold block">24 Kist (x=9%)</span>
                    <span>3% User | 3% Agent | 3% Co.</span>
                  </div>
                  <div className="bg-white/80 py-1.5 px-2 rounded-lg border border-blue-100">
                    <span className="font-mono text-indigo-900 font-bold block">30 Kist (x=15%)</span>
                    <span>5% User | 5% Agent | 5% Co.</span>
                  </div>
                </div>
              </div>

              {/* Agent Filter Pills */}
              <div className="flex flex-wrap items-center gap-2 mb-4 pb-3 border-b border-gray-100">
                <button
                  type="button"
                  onClick={() => setAgentFilter("all")}
                  className={`px-3 py-1.5 rounded-xl text-xs font-bold transition cursor-pointer active:scale-95 ${
                    agentFilter === "all"
                      ? "bg-slate-900 text-white shadow-xs"
                      : "bg-gray-100 text-gray-600 hover:bg-gray-200"
                  }`}
                >
                  All Agents ({agents.length})
                </button>
                <button
                  type="button"
                  onClick={() => setAgentFilter("approved")}
                  className={`px-3 py-1.5 rounded-xl text-xs font-bold transition cursor-pointer active:scale-95 flex items-center gap-1.5 ${
                    agentFilter === "approved"
                      ? "bg-emerald-600 text-white shadow-xs"
                      : "bg-emerald-50 text-emerald-800 hover:bg-emerald-100 border border-emerald-200"
                  }`}
                >
                  ✓ Approved Agents ({agents.filter(a => a.role === "agent" || a.agentProfile?.status === "approved").length})
                </button>
                <button
                  type="button"
                  onClick={() => setAgentFilter("pending")}
                  className={`px-3 py-1.5 rounded-xl text-xs font-bold transition cursor-pointer active:scale-95 flex items-center gap-1.5 ${
                    agentFilter === "pending"
                      ? "bg-amber-600 text-white shadow-xs"
                      : "bg-amber-50 text-amber-900 hover:bg-amber-100 border border-amber-200"
                  }`}
                >
                  ⏳ Pending Applications ({agents.filter(a => a.agentProfile?.status === "pending").length})
                </button>
              </div>

              {filteredAgents.length === 0 ? (
                <p className="py-12 text-center text-gray-400 text-sm">No agent records found for this filter 🤝</p>
              ) : (
                <div className="space-y-4">
                  {filteredAgents.map(a => {
                    const prof = a.agentProfile || {};
                    const isPending = prof.status === "pending";
                    const isApproved = prof.status === "approved" || a.role === "agent";
                    const isTeamModel = prof.commissionModel === "team_1";

                    return (
                      <div
                        key={a._id}
                        className={`p-4 rounded-2xl border transition ${
                          isPending
                            ? "bg-amber-50/40 border-amber-200"
                            : isApproved
                            ? "bg-emerald-50/30 border-emerald-200"
                            : "bg-gray-50 border-gray-200 opacity-75"
                        }`}
                      >
                        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-gray-200/60">
                          <div>
                            <div className="flex items-center gap-2">
                              <h4 className="font-extrabold text-sm text-gray-900">{a.name}</h4>
                              <span className="font-mono text-[11px] font-bold text-blue-700 bg-blue-100 px-2 py-0.5 rounded">
                                EDUCA-{a.referralCode || a.phone}
                              </span>
                              <span
                                className={`text-[10px] font-black px-2 py-0.5 rounded-full uppercase ${
                                  isPending
                                    ? "bg-yellow-200 text-yellow-900"
                                    : isApproved
                                    ? "bg-green-200 text-green-900"
                                    : "bg-red-200 text-red-900"
                                }`}
                              >
                                {prof.status || "pending"}
                              </span>
                            </div>
                            <div className="text-xs text-gray-500 mt-1 flex flex-wrap gap-x-3 gap-y-1">
                              <span>📞 <a href={`tel:${a.phone}`} className="text-blue-600 font-bold hover:underline">{a.phone}</a></span>
                              <span>✉️ {a.email}</span>
                              {prof.city && <span>📍 {prof.city}</span>}
                            </div>
                          </div>

                          <div className="flex flex-wrap items-center gap-2 shrink-0">
                            <a
                              href={`tel:${a.phone}`}
                              className="px-3 py-1.5 bg-blue-50 text-blue-700 hover:bg-blue-100 border border-blue-200 rounded-xl text-xs font-bold transition flex items-center gap-1"
                            >
                              📞 Call Applicant
                            </a>
                            {isPending && (
                              <div className="flex flex-wrap items-center gap-1.5">
                                <div className="flex items-center gap-1 bg-white px-2 py-1 border border-amber-300 rounded-xl shadow-2xs">
                                  <span className="text-[10px] font-bold text-gray-600">Rate:</span>
                                  <input
                                    type="number"
                                    min="0"
                                    max="50"
                                    step="0.5"
                                    placeholder="2"
                                    value={agentCommissionInput[a._id] !== undefined ? agentCommissionInput[a._id] : 2}
                                    onChange={e => setAgentCommissionInput({ ...agentCommissionInput, [a._id]: e.target.value })}
                                    className="w-12 px-1 text-xs font-black text-amber-950 text-center outline-none bg-amber-50/50 rounded"
                                  />
                                  <span className="text-[10px] font-black text-amber-950">%</span>
                                </div>
                                <button
                                  onClick={() => approveAgent(a._id, agentCommissionInput[a._id] !== undefined ? agentCommissionInput[a._id] : 2)}
                                  className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold transition shadow-sm active:scale-95 cursor-pointer"
                                >
                                  ✓ Approve Agent
                                </button>
                                <button
                                  onClick={() => rejectAgent(a._id)}
                                  className="px-3 py-1.5 bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 rounded-xl text-xs font-bold transition cursor-pointer"
                                >
                                  Reject
                                </button>
                              </div>
                            )}
                            {isApproved && (
                              <div className="flex items-center gap-1.5 bg-white px-2 py-1 border border-emerald-300 rounded-xl shadow-2xs">
                                <span className="text-[10px] font-bold text-emerald-800">Rate:</span>
                                <input
                                  type="number"
                                  min="0"
                                  max="50"
                                  step="0.5"
                                  placeholder="%"
                                  value={agentCommissionInput[a._id] !== undefined ? agentCommissionInput[a._id] : (prof.commissionRate ?? 2)}
                                  onChange={e => setAgentCommissionInput({ ...agentCommissionInput, [a._id]: e.target.value })}
                                  className="w-12 px-1 text-xs font-black text-emerald-950 text-center outline-none bg-emerald-50 rounded"
                                />
                                <span className="text-[10px] font-black text-emerald-950">%</span>
                                <button
                                  type="button"
                                  onClick={() => updateAgentCommission(a._id, agentCommissionInput[a._id] !== undefined ? agentCommissionInput[a._id] : (prof.commissionRate ?? 2))}
                                  disabled={savingAgentCommission[a._id]}
                                  className="px-2 py-0.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded text-[10px] font-black transition cursor-pointer active:scale-95 disabled:opacity-50"
                                >
                                  {savingAgentCommission[a._id] ? "..." : "Save %"}
                                </button>
                              </div>
                            )}
                          </div>
                        </div>

                        <div className="pt-3 grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                          <div className="p-2.5 bg-white rounded-xl border border-gray-100">
                            <span className="text-gray-400 font-medium block text-[11px]">Business / Shop</span>
                            <span className="font-bold text-gray-800">{prof.businessName || "Not specified"}</span>
                          </div>

                          <div className="p-2.5 bg-white rounded-xl border border-gray-100">
                            <span className="text-gray-400 font-medium block text-[11px]">Commission Model & Rate</span>
                            <div className="flex items-center justify-between gap-1 mt-0.5">
                              <span className="font-bold text-gray-800">
                                {isTeamModel ? (
                                  <span className="text-amber-700 font-black">👥 Team Model (Hierarchy Allowed)</span>
                                ) : (
                                  <span className="text-blue-700 font-black">👤 Solo Direct (Independent Agent)</span>
                                )}
                              </span>
                              <span className="px-2 py-0.5 rounded-full font-black text-[11px] bg-amber-100 text-amber-900 border border-amber-200">
                                {prof.commissionRate != null ? `${prof.commissionRate}% Commission` : "Rate Pending"}
                              </span>
                            </div>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {/* USERS */}
          {tab === "users" && (
            <div className="bg-white rounded-2xl shadow-sm p-5 sm:p-6 border border-gray-100">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4">
                <div>
                  <h3 className="text-lg font-bold font-display">All Users & Verification</h3>
                  <p className="text-xs text-gray-500">Manage KYC documents, card tiers, custom interest rates and accounts</p>
                </div>
                {pendingKycCount > 0 && (
                  <span className="px-3 py-1 bg-amber-100 border border-amber-300 text-amber-900 rounded-full text-xs font-bold flex items-center gap-1.5 self-start sm:self-auto">
                    <span>📄</span> {pendingKycCount} KYC Pending Approval
                  </span>
                )}
              </div>

              {/* User filter pills */}
              <div className="flex flex-wrap items-center gap-2 mb-4 pb-3 border-b border-gray-100">
                <button
                  type="button"
                  onClick={() => setUserFilter("all")}
                  className={`px-3 py-1.5 rounded-xl text-xs font-bold transition cursor-pointer active:scale-95 ${
                    userFilter === "all"
                      ? "bg-slate-900 text-white shadow-xs"
                      : "bg-gray-100 text-gray-600 hover:bg-gray-200"
                  }`}
                >
                  All Users ({users.length})
                </button>
                <button
                  type="button"
                  onClick={() => setUserFilter("customers")}
                  className={`px-3 py-1.5 rounded-xl text-xs font-bold transition cursor-pointer active:scale-95 flex items-center gap-1.5 ${
                    userFilter === "customers"
                      ? "bg-blue-600 text-white shadow-xs"
                      : "bg-blue-50 text-blue-700 hover:bg-blue-100 border border-blue-200"
                  }`}
                >
                  👤 Regular Customers ({users.filter(u => u.role !== "agent" && u.agentProfile?.status !== "approved").length})
                </button>
                <button
                  type="button"
                  onClick={() => setUserFilter("agents")}
                  className={`px-3 py-1.5 rounded-xl text-xs font-bold transition cursor-pointer active:scale-95 flex items-center gap-1.5 ${
                    userFilter === "agents"
                      ? "bg-amber-600 text-white shadow-xs"
                      : "bg-amber-50 text-amber-800 hover:bg-amber-100 border border-amber-200"
                  }`}
                >
                  🤝 Agents Only ({users.filter(u => u.role === "agent" || u.agentProfile?.status === "approved").length})
                </button>
              </div>

              {filteredUsers.length === 0 ? (
                <p className="py-10 text-center text-gray-400 text-sm">No users found for this filter</p>
              ) : (
                <>
                  <div className="hidden md:block overflow-x-auto rounded-2xl border border-gray-100 shadow-xs">
                    <table className="w-full min-w-[1100px] border-collapse bg-white">
                      <thead>
                        <tr className="bg-slate-50/90 border-b border-gray-200 text-left text-[11px] font-bold text-slate-500 uppercase tracking-wider whitespace-nowrap">
                          <th className="py-3.5 px-4 w-[210px]">User & Account</th>
                          <th className="py-3.5 px-4 w-[190px]">KYC & Documents</th>
                          <th className="py-3.5 px-4 w-[130px]">Interest Rate</th>
                          <th className="py-3.5 px-4 w-[140px]">Card Tier</th>
                          <th className="py-3.5 px-4 w-[140px]">Wallets</th>
                          <th className="py-3.5 px-4 w-[100px]">Balance</th>
                          <th className="py-3.5 px-4 w-[100px]">Referrals</th>
                          <th className="py-3.5 px-4 w-[110px]">Status</th>
                          <th className="py-3.5 px-4 w-[140px]">Actions</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-100 text-xs">
                        {filteredUsers.map(u => (
                          <tr key={u._id} className="hover:bg-slate-50/60 transition-colors">
                            {/* USER */}
                            <td className="py-4 px-4 align-top">
                              <div className="flex items-center gap-1.5">
                                <p className="font-bold text-sm text-gray-900 leading-tight">{u.name}</p>
                                {(u.role === "agent" || u.agentProfile?.status === "approved") && (
                                  <span className="px-1.5 py-0.5 rounded text-[10px] font-black bg-amber-100 text-amber-800 border border-amber-300">
                                    🤝 Agent
                                  </span>
                                )}
                              </div>
                              <div className="mt-1 flex flex-wrap items-center gap-1">
                                <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-mono font-bold bg-indigo-50 text-indigo-700 border border-indigo-200" title="Account Number">
                                  A/C: {u.accountNumber || `EFS${String(u._id).slice(-7).toUpperCase()}`}
                                </span>
                                <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-mono text-gray-600 bg-gray-100" title="App UPI ID">
                                  {u.upiId || `${(u.accountNumber || `efs${String(u._id).slice(-7)}`).toLowerCase()}@educa`}
                                </span>
                              </div>
                              <p className="text-gray-500 text-[11px] truncate max-w-[190px] mt-1">{u.email}</p>
                              <p className="text-gray-400 text-[11px] font-mono mt-0.5">{u.phone}</p>
                            </td>

                            {/* KYC & DOCUMENTS */}
                            <td className="py-4 px-4 align-top">
                              <div className="space-y-1.5">
                                <div className="flex items-center gap-1.5">
                                  {u.kycStatus === "verified" ? (
                                    <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-800">
                                      ✓ Verified
                                    </span>
                                  ) : u.kycStatus === "pending" ? (
                                    <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-100 text-amber-800">
                                      ⏳ Pending
                                    </span>
                                  ) : u.kycStatus === "rejected" ? (
                                    <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-rose-100 text-rose-800">
                                      ✕ Rejected
                                    </span>
                                  ) : (
                                    <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-gray-100 text-gray-500">
                                      ○ None
                                    </span>
                                  )}
                                  {u.kycDocuments?.aadharNumber && (
                                    <span className="text-[10px] text-gray-500 font-mono">
                                      UID: {u.kycDocuments.aadharNumber.slice(0, 4)}••••
                                    </span>
                                  )}
                                </div>

                                <div className="flex flex-wrap items-center gap-1">
                                  {(u.kycDocuments?.docUrl || u.kycDocuments?.doc1Url || u.aadharNumber) && (
                                    <button
                                      type="button"
                                      onClick={() => setPreviewKycUser(u)}
                                      className="inline-flex items-center gap-1 text-[11px] text-indigo-700 font-bold bg-indigo-50 hover:bg-indigo-100 px-2 py-0.5 rounded cursor-pointer transition active:scale-95"
                                    >
                                      📄 View Submitted Docs
                                    </button>
                                  )}
                                </div>

                                {u.kycStatus === "pending" && (
                                  <div className="flex items-center gap-1 pt-1">
                                    <button
                                      onClick={() => approveKyc(u._id)}
                                      className="px-2 py-0.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded text-[10px] font-bold shadow-2xs active:scale-95"
                                    >
                                      Approve
                                    </button>
                                    <button
                                      onClick={() => rejectKyc(u._id)}
                                      className="px-2 py-0.5 bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 rounded text-[10px] font-bold"
                                    >
                                      Reject
                                    </button>
                                  </div>
                                )}
                              </div>
                            </td>

                            {/* CUSTOM INTEREST RATE */}
                            <td className="py-4 px-4 align-top">
                              <div className="flex items-center gap-1.5 pt-0.5">
                                <input
                                  type="number"
                                  defaultValue={u.interestRate || 12}
                                  id={`rate-${u._id}`}
                                  min="1"
                                  max="100"
                                  className="w-14 px-1.5 py-1 border border-gray-300 rounded-lg text-xs font-black text-center text-blue-600 focus:ring-1 focus:ring-blue-500"
                                />
                                <span className="text-xs font-bold text-gray-400">%</span>
                                <button
                                  onClick={() => {
                                    const val = document.getElementById(`rate-${u._id}`)?.value;
                                    updateCustomInterest(u._id, val);
                                  }}
                                  className="px-2 py-1 bg-[#1D6AE5] hover:bg-[#1558cc] text-white rounded-lg text-[11px] font-bold shadow-2xs cursor-pointer active:scale-95"
                                >
                                  Save
                                </button>
                              </div>
                            </td>

                            {/* CARD TIER */}
                            <td className="py-4 px-4 align-top">
                              <div className="space-y-1.5">
                                <div className="flex items-center gap-1.5">
                                  {u.cardTier === "platinum" || u.cardStatus?.platinum?.unlocked ? (
                                    <span className="px-2 py-0.5 rounded-full text-[10px] font-black bg-gradient-to-r from-amber-400 to-yellow-400 text-black shadow-xs flex items-center gap-1">
                                      <span>👑</span> PLATINUM
                                    </span>
                                  ) : (
                                    <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-slate-100 text-slate-700 border border-slate-300 flex items-center gap-1">
                                      <span>🥈</span> SILVER
                                    </span>
                                  )}
                                  <span className="text-[10px] text-gray-400 font-mono font-bold">
                                    {u.loansCount || 0}/4 loans
                                  </span>
                                </div>
                                <button
                                  onClick={() => toggleUserCard(u._id, u.cardTier, u.cardStatus?.platinum?.unlocked)}
                                  className={`px-2 py-0.5 rounded-md text-[10px] font-bold transition cursor-pointer active:scale-95 ${
                                    u.cardTier === "platinum" || u.cardStatus?.platinum?.unlocked
                                      ? "bg-red-50 text-red-600 border border-red-200 hover:bg-red-100"
                                      : "bg-amber-50 text-amber-800 border border-amber-300 hover:bg-amber-100"
                                  }`}
                                >
                                  {u.cardTier === "platinum" || u.cardStatus?.platinum?.unlocked ? "Revoke VIP" : "👑 Unlock VIP"}
                                </button>
                              </div>
                            </td>

                            {/* WALLETS */}
                            <td className="py-4 px-4 align-top">
                              <div className="flex items-center gap-1 pt-0.5">
                                <span className="px-1.5 py-0.5 bg-emerald-50 border border-emerald-200 text-emerald-700 rounded text-[10px] font-bold" title="Savings (12% APY)">
                                  🏦 Savings
                                </span>
                                <span className={`px-1.5 py-0.5 border rounded text-[10px] font-bold ${u.wallets?.debit?.active ? "bg-blue-50 border-blue-200 text-blue-700" : "bg-gray-100 border-gray-200 text-gray-400"}`} title="Debit Wallet">
                                  💳 Debit
                                </span>
                                <span className={`px-1.5 py-0.5 border rounded text-[10px] font-bold ${u.wallets?.lending?.active ? "bg-indigo-50 border-indigo-200 text-indigo-700" : "bg-gray-100 border-gray-200 text-gray-400"}`} title="Lending Wallet">
                                  🤝 Loans
                                </span>
                              </div>
                            </td>

                            {/* BALANCE */}
                            <td className="py-4 px-4 align-top">
                              <p className="font-extrabold text-sm text-green-600 pt-0.5">₹{Number(u.balance || 0).toLocaleString("en-IN")}</p>
                              {(u.profitBalance || 0) > 0 && (
                                <p className="text-[10px] text-gray-400 font-mono mt-0.5">
                                  Profit: +₹{Number(u.profitBalance).toLocaleString("en-IN")}
                                </p>
                              )}
                            </td>

                            {/* REFERRALS */}
                            <td className="py-4 px-4 align-top">
                              <div className="pt-0.5">
                                <span className="bg-blue-50 text-blue-700 px-1.5 py-0.5 rounded text-xs font-mono font-bold">{u.referralCode || "—"}</span>
                                <p className="text-[10px] text-gray-400 mt-0.5">({u.referralCount || 0} users)</p>
                              </div>
                            </td>

                            {/* STATUS */}
                            <td className="py-4 px-4 align-top">
                              <div className="space-y-1">
                                <span className={`inline-block px-2.5 py-0.5 rounded-full text-[11px] font-bold ${u.isBlocked ? "bg-red-100 text-red-700" : "bg-green-100 text-green-700"}`}>
                                  {u.isBlocked ? "🔴 Blocked" : "🟢 Active"}
                                </span>
                                {u.isUninstallProtected ? (
                                  <span className="block px-2 py-0.5 rounded text-[10px] font-black bg-rose-100 text-rose-800 border border-rose-200">
                                    🔒 Uninstall Blocked
                                  </span>
                                ) : (
                                  <span className="block px-2 py-0.5 rounded text-[10px] font-medium bg-gray-100 text-gray-500">
                                    📱 Normal
                                  </span>
                                )}
                              </div>
                            </td>

                            {/* ACTIONS */}
                            <td className="py-4 px-4 align-top">
                              <div className="flex flex-col gap-1.5 min-w-[125px]">
                                <button
                                  onClick={() => toggleBlock(u._id)}
                                  className={`px-3 py-1 rounded-lg text-xs font-bold text-white transition cursor-pointer active:scale-95 ${u.isBlocked ? "bg-green-500 hover:bg-green-600" : "bg-orange-500 hover:bg-orange-600"}`}
                                >
                                  {u.isBlocked ? "Unblock" : "Block"}
                                </button>
                                <button
                                  onClick={() => toggleUninstallLock(u._id)}
                                  className={`px-2.5 py-1 rounded-lg text-[11px] font-bold text-white transition flex items-center justify-center gap-1 shadow-2xs cursor-pointer active:scale-95 ${
                                    u.isUninstallProtected
                                      ? "bg-rose-600 hover:bg-rose-700"
                                      : "bg-indigo-600 hover:bg-indigo-700"
                                  }`}
                                  title={u.isUninstallProtected ? "App uninstall is blocked. Click to allow uninstall." : "Click to lock and prevent user from uninstalling app."}
                                >
                                  {u.isUninstallProtected ? "🔒 Unlock Uninstall" : "🛡️ Block Uninstall"}
                                </button>
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>

                  {/* MOBILE CARDS */}
                  <div className="md:hidden space-y-3">
                    {filteredUsers.map(u => (
                      <div key={u._id} className="border border-gray-100 rounded-2xl p-4 bg-white shadow-xs">
                        <div className="flex justify-between items-start mb-2.5">
                          <div>
                            <div className="flex items-center gap-1.5">
                              <p className="font-bold text-sm text-gray-900">{u.name}</p>
                              {(u.role === "agent" || u.agentProfile?.status === "approved") && (
                                <span className="px-1.5 py-0.5 rounded text-[10px] font-black bg-amber-100 text-amber-800 border border-amber-300">
                                  🤝 Agent
                                </span>
                              )}
                            </div>
                            <div className="flex flex-wrap items-center gap-1 mt-1 mb-1">
                              <span className="px-1.5 py-0.5 rounded text-[10px] font-mono font-bold bg-indigo-50 text-indigo-700 border border-indigo-200">
                                A/C: {u.accountNumber || `EFS${String(u._id).slice(-7).toUpperCase()}`}
                              </span>
                              <span className="px-1.5 py-0.5 rounded text-[10px] font-mono text-gray-600 bg-gray-100">
                                {u.upiId || `${(u.accountNumber || `efs${String(u._id).slice(-7)}`).toLowerCase()}@educa`}
                              </span>
                            </div>
                            <p className="text-xs text-gray-400">{u.email}</p>
                            <p className="text-[11px] font-mono text-gray-400">{u.phone}</p>
                          </div>
                          <div className="flex items-center gap-1.5 shrink-0">
                            <span className={`px-2 py-0.5 rounded-full text-[11px] font-bold ${u.isBlocked ? "bg-red-100 text-red-700" : "bg-green-100 text-green-700"}`}>
                              {u.isBlocked ? "Blocked" : "Active"}
                            </span>
                            {u.isUninstallProtected && (
                              <span className="px-2 py-0.5 rounded-full text-[10px] font-black bg-rose-100 text-rose-800 border border-rose-200">
                                🔒 No Uninstall
                              </span>
                            )}
                          </div>
                        </div>

                        {/* MOBILE KYC ROW */}
                        <div className="p-3 bg-blue-50/50 rounded-xl border border-blue-100 text-xs mb-3 space-y-2">
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-1.5">
                              <span className="font-bold text-gray-700">KYC:</span>
                              <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                                u.kycStatus === "verified" ? "bg-emerald-100 text-emerald-800" :
                                u.kycStatus === "pending" ? "bg-amber-100 text-amber-800" :
                                u.kycStatus === "rejected" ? "bg-rose-100 text-rose-800" :
                                "bg-gray-100 text-gray-500"
                              }`}>
                                {u.kycStatus || "none"}
                              </span>
                            </div>
                            {(u.kycDocuments?.docUrl || u.kycDocuments?.doc1Url || u.aadharNumber) && (
                              <button
                                type="button"
                                onClick={() => setPreviewKycUser(u)}
                                className="px-2.5 py-1 bg-indigo-100 hover:bg-indigo-200 text-indigo-700 rounded-lg text-[10px] font-bold transition active:scale-95"
                              >
                                📄 View Submitted Docs
                              </button>
                            )}
                          </div>
                          {u.kycStatus === "pending" && (
                            <div className="flex items-center gap-2 pt-1 border-t border-blue-100">
                              <button onClick={() => approveKyc(u._id)} className="flex-1 py-1 bg-emerald-600 text-white rounded text-[11px] font-bold">✓ Approve</button>
                              <button onClick={() => rejectKyc(u._id)} className="flex-1 py-1 bg-rose-50 text-rose-700 border border-rose-200 rounded text-[11px] font-bold">Reject</button>
                            </div>
                          )}
                        </div>

                        {/* MOBILE CONTROLS: INTEREST + CARD TIER */}
                        <div className="p-3 bg-gray-50 rounded-xl border border-gray-100 space-y-2 mb-3">
                          <div className="flex items-center justify-between text-xs">
                            <span className="font-semibold text-gray-600">Custom Interest APY:</span>
                            <div className="flex items-center gap-1">
                              <input
                                type="number"
                                defaultValue={u.interestRate || 12}
                                id={`m-rate-${u._id}`}
                                className="w-12 px-1 py-0.5 border border-gray-300 rounded text-xs font-bold text-center text-blue-600"
                              />
                              <span className="text-xs font-bold text-gray-400">%</span>
                              <button
                                onClick={() => {
                                  const val = document.getElementById(`m-rate-${u._id}`)?.value;
                                  updateCustomInterest(u._id, val);
                                }}
                                className="px-2 py-0.5 bg-[#1D6AE5] text-white rounded text-[10px] font-bold"
                              >
                                Save
                              </button>
                            </div>
                          </div>

                          <div className="flex items-center justify-between text-xs pt-2 border-t border-gray-200/60">
                            <span className="font-semibold text-gray-600">Card Tier ({u.loansCount || 0}/4 loans):</span>
                            <button
                              onClick={() => toggleUserCard(u._id, u.cardTier, u.cardStatus?.platinum?.unlocked)}
                              className={`px-2 py-1 rounded-lg text-xs font-bold ${
                                u.cardTier === "platinum" || u.cardStatus?.platinum?.unlocked
                                  ? "bg-amber-100 text-amber-900 border border-amber-300"
                                  : "bg-slate-100 text-slate-700 border border-slate-300"
                              }`}
                            >
                              {u.cardTier === "platinum" || u.cardStatus?.platinum?.unlocked ? "👑 Platinum (VIP)" : "🥈 Silver (Unlock VIP)"}
                            </button>
                          </div>
                        </div>

                        <div className="grid grid-cols-2 gap-2 text-xs mb-3">
                          <div><p className="text-gray-400">Balance</p><p className="font-bold text-green-600">₹{u.balance.toLocaleString("en-IN")}</p></div>
                          <div><p className="text-gray-400">Referral</p><p className="font-mono font-bold text-blue-600">{u.referralCode || "—"}</p></div>
                        </div>

                        <div className="flex items-center gap-2">
                          <button onClick={() => toggleBlock(u._id)} className={`flex-1 py-2 rounded-xl text-xs font-bold text-white transition ${u.isBlocked ? "bg-green-500 hover:bg-green-600" : "bg-orange-500 hover:bg-orange-600"}`}>
                            {u.isBlocked ? "Unblock User" : "Block User"}
                          </button>
                          <button
                            onClick={() => toggleUninstallLock(u._id)}
                            className={`flex-1 py-2 rounded-xl text-xs font-bold text-white transition flex items-center justify-center gap-1 shadow-2xs ${
                              u.isUninstallProtected ? "bg-rose-600 hover:bg-rose-700" : "bg-indigo-600 hover:bg-indigo-700"
                            }`}
                          >
                            {u.isUninstallProtected ? "🔒 Unlock Uninstall" : "🛡️ Block Uninstall"}
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                </>
              )}
            </div>
          )}

          {/* APP DEVICES LOCK */}
          {tab === "devices" && (
            <div className="bg-white rounded-2xl shadow-sm p-3.5 sm:p-6 border border-gray-100">
              <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2.5 sm:gap-3 mb-4 sm:mb-6">
                <div>
                  <h3 className="text-base sm:text-lg font-bold font-display">📱 App Devices & Remote Parental Bedtime Lock</h3>
                  <p className="text-xs text-gray-500">Jab bacha app chalayega, to uska device yahan dikhega. Aap yahan se 1-click me Bedtime Lock laga ya hata sakte hain.</p>
                </div>
                <button onClick={loadDevices} className="px-3.5 py-1.5 bg-gray-100 hover:bg-gray-200 text-gray-700 text-xs font-bold rounded-xl transition cursor-pointer self-start sm:self-auto">
                  🔄 Refresh Devices
                </button>
              </div>

              {/* PIN Card for Admin */}
              <div className="mb-4 sm:mb-6 p-3.5 sm:p-4 rounded-2xl bg-blue-50/80 border border-blue-200/80 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 sm:w-10 sm:h-10 rounded-xl bg-blue-600 text-white flex items-center justify-center text-base sm:text-lg font-bold shadow-xs shrink-0">
                    🔑
                  </div>
                  <div>
                    <h4 className="text-xs sm:text-sm font-bold text-blue-950">Parent / Admin Secret Unlock PIN</h4>
                    <p className="text-[11px] sm:text-xs text-blue-700">Lock screen par <b>"Enter Admin Password to Unlock"</b> dabakar ye PIN daalein:</p>
                  </div>
                </div>
                <div className="flex items-center gap-2 self-start sm:self-auto">
                  <span className="px-3 py-1 bg-white border border-blue-300 rounded-lg font-mono font-bold text-xs sm:text-sm text-blue-900 shadow-2xs tracking-wider">
                    PIN: 1234
                  </span>
                  <span className="text-[11px] text-blue-500 font-semibold">(Ya Admin Password)</span>
                </div>
              </div>

              {devices.length === 0 ? (
                <div className="text-center py-10 sm:py-12 bg-gray-50 rounded-2xl border border-dashed border-gray-200">
                  <p className="text-3xl mb-2">📱</p>
                  <p className="text-gray-500 text-sm font-semibold">No app devices connected yet</p>
                  <p className="text-gray-400 text-xs mt-1">Jab koi user Android app me login ya signup karega, to uska device auto-connect hokar yahan aa jayega.</p>
                </div>
              ) : (
                <>
                  {/* Desktop Table */}
                  <div className="hidden md:block overflow-x-auto rounded-xl border border-gray-100">
                    <table className="w-full min-w-[700px] text-left text-sm">
                      <thead>
                        <tr className="bg-slate-50 border-b border-gray-100 text-xs font-bold text-gray-400 uppercase tracking-wider">
                          <th className="py-3 px-3">User</th>
                          <th className="py-3 px-3">Device Model</th>
                          <th className="py-3 px-3">Last Seen</th>
                          <th className="py-3 px-3">OS Lock Status</th>
                          <th className="py-3 px-3 text-right">Remote Action</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-50">
                        {devices.map((d) => (
                          <tr key={d.deviceId} className="hover:bg-gray-50/50 transition">
                            <td className="py-3.5 px-3">
                              <p className="font-bold text-gray-900">{d.userName || "User"}</p>
                              <p className="text-xs text-gray-400 font-mono truncate max-w-[180px]">{d.userEmail || d.deviceId}</p>
                            </td>
                            <td className="py-3.5 px-3 text-xs text-gray-600 font-medium">
                              📱 {d.deviceName || "Android Phone"}
                            </td>
                            <td className="py-3.5 px-3 text-xs text-gray-400">
                              {d.lastSeenAt ? new Date(d.lastSeenAt).toLocaleTimeString() : "Recent"}
                            </td>
                            <td className="py-3.5 px-3">
                              <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold ${
                                d.adminStatus === "active"
                                  ? "bg-green-100 text-green-700 border border-green-200"
                                  : "bg-gray-100 text-gray-600 border border-gray-200"
                              }`}>
                                <span className={`w-1.5 h-1.5 rounded-full ${d.adminStatus === "active" ? "bg-green-500" : "bg-gray-400"}`}></span>
                                {d.adminStatus === "active" ? "🔒 LOCKED (Uninstall Blocked)" : "🔓 UNLOCKED"}
                              </span>
                            </td>
                            <td className="py-3.5 px-3 text-right">
                              {d.adminStatus === "active" ? (
                                <button
                                  onClick={() => unlockDevice(d.deviceId)}
                                  className="px-3.5 py-1.5 bg-amber-500 hover:bg-amber-600 text-white rounded-lg text-xs font-bold shadow-xs transition cursor-pointer"
                                >
                                  🔓 Unlock Device (Allow Uninstall)
                                </button>
                              ) : (
                                <button
                                  onClick={() => lockDevice(d.deviceId)}
                                  className="px-3.5 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-xs font-bold shadow-xs transition cursor-pointer"
                                >
                                  🔒 Lock Device (Send OS Prompt)
                                </button>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>

                  {/* Mobile Cards View */}
                  <div className="md:hidden space-y-3">
                    {devices.map((d) => (
                      <div key={d.deviceId} className="border border-gray-200/80 rounded-2xl p-3.5 bg-gray-50/50 space-y-3 shadow-2xs">
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0">
                            <p className="font-bold text-sm text-gray-900 truncate">{d.userName || "User"}</p>
                            <p className="text-xs text-gray-400 font-mono truncate">{d.userEmail || d.deviceId}</p>
                          </div>
                          <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-bold shrink-0 whitespace-nowrap ${
                            d.adminStatus === "active"
                              ? "bg-green-100 text-green-700 border border-green-200"
                              : "bg-gray-100 text-gray-600 border border-gray-200"
                          }`}>
                            <span className={`w-1.5 h-1.5 rounded-full ${d.adminStatus === "active" ? "bg-green-500" : "bg-gray-400"}`}></span>
                            {d.adminStatus === "active" ? "🔒 LOCKED" : "🔓 UNLOCKED"}
                          </span>
                        </div>

                        <div className="grid grid-cols-2 gap-2 text-xs py-2 border-y border-gray-200/70 text-gray-600">
                          <div>
                            <span className="text-gray-400 block text-[10px] uppercase font-bold">Device Model</span>
                            <span className="font-semibold text-gray-800 truncate block">📱 {d.deviceName || "Android Phone"}</span>
                          </div>
                          <div>
                            <span className="text-gray-400 block text-[10px] uppercase font-bold">Last Seen</span>
                            <span className="font-semibold text-gray-800 truncate block">{d.lastSeenAt ? new Date(d.lastSeenAt).toLocaleTimeString() : "Recent"}</span>
                          </div>
                        </div>

                        <div>
                          {d.adminStatus === "active" ? (
                            <button
                              onClick={() => unlockDevice(d.deviceId)}
                              className="w-full py-2.5 px-3 bg-amber-500 hover:bg-amber-600 active:scale-95 text-white rounded-xl text-xs font-bold shadow-xs transition flex items-center justify-center gap-1.5 cursor-pointer"
                            >
                              🔓 Unlock Device (Allow Uninstall)
                            </button>
                          ) : (
                            <button
                              onClick={() => lockDevice(d.deviceId)}
                              className="w-full py-2.5 px-3 bg-blue-600 hover:bg-blue-700 active:scale-95 text-white rounded-xl text-xs font-bold shadow-xs transition flex items-center justify-center gap-1.5 cursor-pointer"
                            >
                              🔒 Lock Device (Send OS Prompt)
                            </button>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </>
              )}
            </div>
          )}

          {/* LOANS */}
          {tab === "loans" && (
            <div className="bg-white rounded-2xl shadow-sm p-3.5 sm:p-6 border border-gray-100">
              <h3 className="text-base sm:text-lg font-bold font-display mb-4 sm:mb-5">Loan Applications</h3>
              {loans.length === 0 ? <p className="text-gray-300 text-center py-10 text-sm">No loans yet</p> : (
                <div className="space-y-4">
                  {loans.map(l => {
                    const schedule = (l.installmentSchedule && l.installmentSchedule.length > 0) ? l.installmentSchedule : (l.emiSchedule || []);
                    const paidCount = schedule.filter(s => s.status === "paid").length;
                    const submittedCount = schedule.filter(s => s.status === "submitted").length;
                    const totalCount = schedule.length || l.installmentsCount || l.tenure || 0;
                    const isExpanded = expandedLoanId === l._id;

                    return (
                      <div key={l._id} className="border border-gray-200 rounded-2xl p-3.5 sm:p-5 hover:shadow-md transition">
                        <div className="flex justify-between items-start mb-3">
                          <div>
                            <div className="flex items-center gap-2 flex-wrap">
                              <h4 className="text-base sm:text-lg font-bold">{l.userId?.name}</h4>
                              {l.accountNumber && (
                                <span className="px-2 py-0.5 rounded-md text-[11px] font-mono font-bold bg-slate-100 text-slate-700 border border-slate-200">
                                  {l.accountNumber}
                                </span>
                              )}
                              <span className={`px-2 py-0.5 rounded-full text-[10px] font-black uppercase ${
                                l.loanType === "student"
                                  ? "bg-purple-100 text-purple-800 border border-purple-200"
                                  : l.loanType === "micro_business"
                                  ? "bg-teal-100 text-teal-800 border border-teal-200"
                                  : "bg-blue-100 text-blue-800 border border-blue-200"
                              }`}>
                                {l.loanType === "student" ? "🎓 Student" : l.loanType === "micro_business" ? "🏪 Micro" : "👤 Personal"}
                              </span>
                            </div>
                            <p className="text-xs text-gray-400">{l.userId?.email} • Phone: {l.userId?.phone || "N/A"}</p>
                          </div>
                          <span className={`px-3 py-1 rounded-full text-xs font-bold shrink-0 ${loanStatusColor[l.status] || "bg-gray-100"}`}>{l.status.toUpperCase()}</span>
                        </div>

                        {/* Overdue Penalty Controller & Banner */}
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
                                  : `${l.overdueInstallmentsCount || 1} overdue installment par 2% per installment jod kar penalty calculate hui hai.`}
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
                        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-3 text-sm mb-4">
                          {[
                            { label: "Amount", value: `₹${l.amount.toLocaleString("en-IN")}` },
                            { label: "Rate (locked)", value: `${l.interestRate}% p.a.` },
                            { label: "Per Installment", value: `₹${l.installmentAmount || l.emiAmount}` },
                            { label: "Paid / Total", value: `${paidCount} / ${totalCount} Paid` },
                            { label: "Remaining Dues", value: `₹${(l.remainingAmount ?? l.amount).toLocaleString("en-IN")}` },
                          ].map(({ label, value }) => (
                            <div key={label}><p className="text-gray-400 text-xs">{label}</p><p className="font-bold">{value}</p></div>
                          ))}
                        </div>
                        {l.referralCommissionPaid && (
                          <div className="mb-3 text-xs bg-orange-50 border border-orange-200 rounded-lg px-3 py-2 text-orange-700 font-semibold">
                            🎯 Referral commission ₹{l.referralCommissionAmount} paid on this loan
                          </div>
                        )}
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
                                  <span className="text-gray-500 block text-[10px] font-semibold">👤 User Discount</span>
                                  <strong className="text-emerald-700 text-xs">₹{(l.precloseUserDiscount || 0).toLocaleString("en-IN")}</strong>
                                </div>
                                <div className="bg-white/90 p-2 rounded-lg border border-emerald-100 shadow-2xs">
                                  <span className="text-gray-500 block text-[10px] font-semibold">🤝 Agent Benefit</span>
                                  <strong className="text-amber-700 text-xs">₹{(l.precloseAgentBenefit || 0).toLocaleString("en-IN")}</strong>
                                </div>
                                <div className="bg-white/90 p-2 rounded-lg border border-emerald-100 shadow-2xs">
                                  <span className="text-gray-500 block text-[10px] font-semibold">🏢 Company Profit</span>
                                  <strong className="text-indigo-700 text-xs">₹{(l.precloseCompanyProfit || 0).toLocaleString("en-IN")}</strong>
                                </div>
                              </div>
                            ) : (
                              <p className="text-[11px] text-gray-600">Standard 15-installment payoff early closure.</p>
                            )}
                          </div>
                        )}
                        {/* SUBMITTED LOAN DOCUMENTS */}
                        {(l.documents?.doc1Url || l.documents?.doc2Url || l.documents?.studentProofUrl || l.hasChequeFacility) && (
                          <div className="p-3 bg-indigo-50/60 border border-indigo-100 rounded-xl space-y-1.5 mb-3">
                            <div className="flex items-center justify-between text-xs font-bold text-indigo-900">
                              <span>📄 Submitted Loan Documents</span>
                              {l.hasChequeFacility && (
                                <span className="text-[10px] bg-indigo-200 text-indigo-900 px-2 py-0.5 rounded-full font-bold">
                                  Cheque: {l.chequeNumber || 'Yes'}
                                </span>
                              )}
                            </div>
                            <div className="flex flex-wrap gap-2">
                              {l.documents?.doc1Url && (
                                <button
                                  type="button"
                                  onClick={() => { setLightboxImg(l.documents.doc1Url); setZoomLevel(1); }}
                                  className="flex items-center gap-1.5 px-2.5 py-1.5 bg-white border border-indigo-200 rounded-lg text-[11px] font-semibold text-indigo-800 hover:bg-indigo-50 transition cursor-pointer"
                                >
                                  <span>🆔</span> Aadhaar (Front) 🔍
                                </button>
                              )}
                              {l.documents?.doc1BackUrl && (
                                <button
                                  type="button"
                                  onClick={() => { setLightboxImg(l.documents.doc1BackUrl); setZoomLevel(1); }}
                                  className="flex items-center gap-1.5 px-2.5 py-1.5 bg-white border border-indigo-200 rounded-lg text-[11px] font-semibold text-indigo-800 hover:bg-indigo-50 transition cursor-pointer"
                                >
                                  <span>🆔</span> Aadhaar (Back) 🔍
                                </button>
                              )}
                              {l.documents?.doc2Url && (
                                <button
                                  type="button"
                                  onClick={() => { setLightboxImg(l.documents.doc2Url); setZoomLevel(1); }}
                                  className="flex items-center gap-1.5 px-2.5 py-1.5 bg-white border border-indigo-200 rounded-lg text-[11px] font-semibold text-indigo-800 hover:bg-indigo-50 transition cursor-pointer"
                                >
                                  <span>💳</span> {l.hasChequeFacility ? "Cheque (Front)" : "PAN (Front)"} 🔍
                                </button>
                              )}
                              {l.documents?.doc2BackUrl && (
                                <button
                                  type="button"
                                  onClick={() => { setLightboxImg(l.documents.doc2BackUrl); setZoomLevel(1); }}
                                  className="flex items-center gap-1.5 px-2.5 py-1.5 bg-white border border-indigo-200 rounded-lg text-[11px] font-semibold text-indigo-800 hover:bg-indigo-50 transition cursor-pointer"
                                >
                                  <span>💳</span> {l.hasChequeFacility ? "Cheque (Back)" : "PAN (Back)"} 🔍
                                </button>
                              )}
                              {l.documents?.studentProofUrl && (
                                <button
                                  type="button"
                                  onClick={() => { setLightboxImg(l.documents.studentProofUrl); setZoomLevel(1); }}
                                  className="flex items-center gap-1.5 px-2.5 py-1.5 bg-white border border-cyan-200 rounded-lg text-[11px] font-semibold text-cyan-800 hover:bg-cyan-50 transition cursor-pointer"
                                >
                                  <span>🎓</span> Student ID (Front) 🔍
                                </button>
                              )}
                              {l.documents?.studentProofBackUrl && (
                                <button
                                  type="button"
                                  onClick={() => { setLightboxImg(l.documents.studentProofBackUrl); setZoomLevel(1); }}
                                  className="flex items-center gap-1.5 px-2.5 py-1.5 bg-white border border-cyan-200 rounded-lg text-[11px] font-semibold text-cyan-800 hover:bg-cyan-50 transition cursor-pointer"
                                >
                                  <span>🎓</span> Student ID (Back) 🔍
                                </button>
                              )}
                            </div>
                          </div>
                        )}

                        {l.status === "pending" && (() => {
                          const chosenOpt = cardAdvanceOptions[l._id] || "none";
                          const feeDeduction = (l.processingFee || 0) + (l.upiCharges || 0);
                          const basePayout = Math.max(0, l.amount - feeDeduction);
                          const instAmt = l.installmentAmount || l.emiAmount || 0;
                          const advancePayout = Math.max(0, basePayout - instAmt);
                          const currentDisburseAmount = chosenOpt === "none" ? basePayout : chosenOpt === "deduct" ? advancePayout : basePayout;

                          return (
                            <div className="mt-3 pt-3 border-t border-gray-100 space-y-3">
                              {/* 1st Installment Decision Card for Admin */}
                              <div className="p-3 sm:p-4 bg-gradient-to-br from-slate-50 via-blue-50/30 to-indigo-50/20 border-2 border-indigo-200/80 rounded-2xl space-y-2.5 shadow-xs">
                                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1.5 sm:gap-2">
                                  <div className="flex items-start sm:items-center gap-2">
                                    <span className="text-base sm:text-lg shrink-0 mt-0.5 sm:mt-0">⚙️</span>
                                    <div>
                                      <h5 className="text-xs font-black text-gray-900 leading-tight">
                                        Pehli Installment Setting (Admin Choice)
                                      </h5>
                                      <p className="text-[10px] text-gray-500 font-medium">
                                        Admin chun sakta hai ki pehli kist abhi advance leni hai ya baad me:
                                      </p>
                                    </div>
                                  </div>
                                  <div className="self-start sm:self-auto shrink-0">
                                    <span className={`inline-flex items-center whitespace-nowrap text-[10px] font-black px-2.5 py-0.5 rounded-full border shadow-2xs ${
                                      chosenOpt === "none"
                                        ? "bg-emerald-100 text-emerald-800 border-emerald-300"
                                        : chosenOpt === "deduct"
                                        ? "bg-amber-100 text-amber-800 border-amber-300"
                                        : "bg-purple-100 text-purple-800 border-purple-300"
                                    }`}>
                                      {chosenOpt === "none" ? "🟢 NA LEIN (Pura Paisa)" : chosenOpt === "deduct" ? "🟡 Advance Kaatein" : "🟣 Waive/Maaf"}
                                    </span>
                                  </div>
                                </div>

                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
                                  {/* Option 1: Pehli Installment NA lein (Standard / Full Disbursal) */}
                                  <button
                                    type="button"
                                    onClick={() => {
                                      setCardAdvanceOptions(prev => ({ ...prev, [l._id]: "none" }));
                                      setAdvanceOption("none");
                                    }}
                                    className={`p-3 rounded-xl border text-left transition active:scale-95 cursor-pointer relative ${
                                      chosenOpt === "none"
                                        ? "bg-emerald-50 border-emerald-500 ring-2 ring-emerald-400 text-emerald-950 font-bold shadow-xs"
                                        : "bg-white border-gray-200 text-gray-700 hover:bg-gray-50"
                                    }`}
                                  >
                                    <div className="flex items-center justify-between gap-1 mb-1">
                                      <span className="font-black text-xs text-emerald-950 flex items-center gap-1">
                                        <span>🟢 Pehli Kist NA lein</span>
                                      </span>
                                      <span className="text-[9px] bg-emerald-200 text-emerald-900 px-1.5 py-0.5 rounded font-black shrink-0 whitespace-nowrap">
                                        RECOMMENDED
                                      </span>
                                    </div>
                                    <p className="text-[11px] text-gray-800 font-semibold">
                                      Borrower ko milega: <strong className="text-emerald-700 font-extrabold text-xs">₹{basePayout.toLocaleString("en-IN")}</strong>
                                    </p>
                                    <p className="text-[10px] text-emerald-700 font-medium mt-0.5">
                                      ✓ Kist #1 regular schedule me pending rahegi (user baad me bharega).
                                    </p>
                                  </button>

                                  {/* Option 2: Pehli Installment Advance Kaatein */}
                                  <button
                                    type="button"
                                    onClick={() => {
                                      setCardAdvanceOptions(prev => ({ ...prev, [l._id]: "deduct" }));
                                      setAdvanceOption("deduct");
                                    }}
                                    className={`p-3 rounded-xl border text-left transition active:scale-95 cursor-pointer relative ${
                                      chosenOpt === "deduct"
                                        ? "bg-amber-50 border-amber-500 ring-2 ring-amber-400 text-amber-950 font-bold shadow-xs"
                                        : "bg-white border-gray-200 text-gray-700 hover:bg-gray-50"
                                    }`}
                                  >
                                    <div className="flex items-center justify-between gap-1 mb-1">
                                      <span className="font-black text-xs text-amber-950 flex items-center gap-1">
                                        <span>🟡 Pehli Kist Advance Kaatein</span>
                                      </span>
                                      <span className="text-[9px] bg-amber-200 text-amber-900 px-1.5 py-0.5 rounded font-black shrink-0 whitespace-nowrap">
                                        ADVANCE
                                      </span>
                                    </div>
                                    <p className="text-[11px] text-gray-800 font-semibold">
                                      Borrower ko milega: <strong className="text-amber-700 font-extrabold text-xs">₹{advancePayout.toLocaleString("en-IN")}</strong>
                                    </p>
                                    <p className="text-[10px] text-amber-700 font-medium mt-0.5">
                                      ✓ Kist #1 (₹{instAmt}) abhi turant 'Paid' mark ho jayegi.
                                    </p>
                                  </button>
                                </div>
                              </div>

                              {/* Action Buttons */}
                              <div className="flex flex-col sm:flex-row gap-2 sm:gap-3 relative">
                                <button
                                  type="button"
                                  onClick={() => {
                                    setAdvanceOption(chosenOpt);
                                    setLoanApproveModal(l);
                                    triggerAdminHeroFly(l._id);
                                  }}
                                  className="relative overflow-visible w-full sm:flex-1 px-4 sm:px-6 py-2.5 sm:py-3 bg-gradient-to-r from-emerald-600 via-teal-600 to-indigo-600 hover:from-emerald-700 hover:to-indigo-700 text-white rounded-xl text-xs sm:text-sm font-extrabold shadow-md shadow-emerald-500/20 active:scale-95 transition-all cursor-pointer flex items-center justify-center gap-2"
                                >
                                  {adminHeroFlyId === l._id && <AdminLoanHeroFlyBadge />}
                                  <span>✅ Approve & Disburse (₹{currentDisburseAmount.toLocaleString("en-IN")})</span>
                                </button>
                                <button
                                  type="button"
                                  disabled={rejectLoadingId === l._id}
                                  onClick={() => rejectLoan(l._id)}
                                  className="w-full sm:w-auto px-5 py-2.5 sm:py-3 bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 active:scale-95 rounded-xl text-xs sm:text-sm font-bold transition cursor-pointer flex items-center justify-center gap-1.5 disabled:opacity-50"
                                >
                                  {rejectLoadingId === l._id ? (
                                    <>
                                      <span className="w-3.5 h-3.5 border-2 border-rose-600 border-t-transparent rounded-full animate-spin" />
                                      <span>Rejecting...</span>
                                    </>
                                  ) : (
                                    <span>✗ Reject</span>
                                  )}
                                </button>
                              </div>
                            </div>
                          );
                        })()}

                        {/* INSTALLMENT SCHEDULE EXPANDER */}
                        {schedule.length > 0 && l.status !== "pending" && (
                          <div className="mt-3 pt-3 border-t border-gray-100">
                            <button
                              type="button"
                              onClick={() => setExpandedLoanId(isExpanded ? null : l._id)}
                              className="w-full py-2 px-3 bg-gray-50 hover:bg-gray-100 border border-gray-200 rounded-xl text-xs font-bold text-gray-700 flex items-center justify-between transition cursor-pointer"
                            >
                              <span className="flex items-center gap-2">
                                <span>📅</span>
                                <span>Installment Schedule ({paidCount}/{totalCount} Paid)</span>
                                {submittedCount > 0 && (
                                  <span className="px-2 py-0.5 rounded-full bg-amber-100 text-amber-800 text-[10px] font-extrabold animate-pulse">
                                    ⚠️ {submittedCount} Submitted for Review
                                  </span>
                                )}
                              </span>
                              <span className="text-blue-600">{isExpanded ? "▲ Hide Schedule" : "▼ View All Installments"}</span>
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
                                        className={`p-3 rounded-xl border text-xs flex flex-col justify-between gap-2 ${
                                          isPaid
                                            ? "bg-emerald-50/60 border-emerald-200 text-emerald-950"
                                            : isSubmitted
                                            ? "bg-amber-50 border-amber-300 text-amber-950"
                                            : isOverdue
                                            ? "bg-rose-50 border-rose-200 text-rose-950"
                                            : "bg-white border-gray-200 text-gray-900"
                                        }`}
                                      >
                                        <div className="flex items-center justify-between">
                                          <span className="font-extrabold">Installment #{inst.installmentNo}</span>
                                          <span className={`px-2 py-0.5 rounded-full text-[10px] font-black uppercase ${
                                            isPaid ? "bg-emerald-200 text-emerald-900" :
                                            isSubmitted ? "bg-amber-200 text-amber-900" :
                                            isOverdue ? "bg-rose-200 text-rose-900" : "bg-gray-100 text-gray-700"
                                          }`}>
                                            {inst.status}
                                          </span>
                                        </div>

                                        <div className="space-y-0.5 text-[11px] text-gray-600">
                                          <div className="flex justify-between">
                                            <span>Amount:</span>
                                            <span className="font-bold text-gray-900">₹{inst.amount}</span>
                                          </div>
                                          <div className="flex justify-between">
                                            <span>Due Date:</span>
                                            <span>{inst.dueDate ? new Date(inst.dueDate).toLocaleDateString("en-IN") : "N/A"}</span>
                                          </div>
                                          {isPaid && (
                                            <div className="flex justify-between text-emerald-700 font-semibold">
                                              <span>Paid on:</span>
                                              <span>{inst.paidOn ? new Date(inst.paidOn).toLocaleDateString("en-IN") : "Verified"}</span>
                                            </div>
                                          )}
                                          {inst.utrNumber && (
                                            <div className="text-[10px] font-mono text-indigo-700 truncate">
                                              UTR: {inst.utrNumber}
                                            </div>
                                          )}
                                          {inst.adminEvidenceNote && (
                                            <div className="text-[10px] italic text-gray-500 truncate">
                                              Note: {inst.adminEvidenceNote}
                                            </div>
                                          )}
                                        </div>

                                        {/* Actions */}
                                        <div className="flex flex-col gap-1.5 pt-1 border-t border-gray-200/50">
                                          {isSubmitted && (
                                            <>
                                              {inst.proofUrl && (
                                                <button
                                                  type="button"
                                                  onClick={() => { setLightboxImg(inst.proofUrl); setZoomLevel(1); }}
                                                  className="w-full py-1 px-2 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 rounded-lg text-[10px] font-bold border border-indigo-200 flex items-center justify-center gap-1 cursor-pointer"
                                                >
                                                  <span>🖼</span> View Proof (Front)
                                                </button>
                                              )}
                                              {inst.proofBackUrl && (
                                                <button
                                                  type="button"
                                                  onClick={() => { setLightboxImg(inst.proofBackUrl); setZoomLevel(1); }}
                                                  className="w-full py-1 px-2 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 rounded-lg text-[10px] font-bold border border-indigo-200 flex items-center justify-center gap-1 cursor-pointer"
                                                >
                                                  <span>🖼</span> View Proof (Back)
                                                </button>
                                              )}
                                              <button
                                                type="button"
                                                onClick={() => approveInstallment(l._id, inst.installmentNo)}
                                                className="w-full py-1.5 px-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-[11px] font-bold shadow-xs active:scale-95 transition cursor-pointer"
                                              >
                                                ✅ Approve Installment
                                              </button>
                                            </>
                                          )}

                                          {!isPaid && (
                                            <button
                                              type="button"
                                              onClick={() => setAdminPayModal({
                                                loanId: l._id,
                                                installmentNo: inst.installmentNo,
                                                amount: inst.amount,
                                                evidenceNote: "",
                                                utrNumber: ""
                                              })}
                                              className="w-full py-1 px-2 bg-slate-100 hover:bg-slate-200 text-slate-800 rounded-lg text-[10px] font-bold border border-slate-300 transition cursor-pointer"
                                            >
                                              ⚡ Mark Paid (Admin Override)
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
            </div>
          )}

          {/* ══════════════════════════════════════════════════════
              ISSUE LOAN DESK (ADMIN ON-BEHALF APPLICATION)
          ══════════════════════════════════════════════════════ */}
          {tab === "issue-loan" && (() => {
            const amt = Number(issueLoanAmount) || 10000;
            const count = Number(issueInstallmentsCount) || 15;
            const rate = Number(issueInterestRate) || 1.34;
            const principalPerInst = amt / count;
            const interestPerInst = (amt * rate) / 100;
            const installmentAmt = Math.round(principalPerInst + interestPerInst);
            const totalPayable = installmentAmt * count;
            const totalInterest = totalPayable - amt;
            const procFee = Math.round((amt * 5) / 100);
            const upiCharges = Math.round((amt * 1) / 100);
            const netDisbursal = Math.max(0, amt - (procFee + upiCharges));

            const filteredSearchUsers = users.filter(u => {
              if (!issueUserSearch) return true;
              const q = issueUserSearch.toLowerCase();
              const agent = agents.find(a => String(a._id) === String(u.referredBy));
              return (
                (u.name && u.name.toLowerCase().includes(q)) ||
                (u.phone && u.phone.includes(q)) ||
                (u.email && u.email.toLowerCase().includes(q)) ||
                (u.accountNumber && u.accountNumber.toLowerCase().includes(q)) ||
                (agent && (
                  (agent.name && agent.name.toLowerCase().includes(q)) ||
                  (agent.phone && agent.phone.includes(q)) ||
                  (agent.agentProfile?.businessName && agent.agentProfile.businessName.toLowerCase().includes(q))
                ))
              );
            });

            return (
              <div className="bg-white rounded-2xl shadow-sm p-4 sm:p-6 border border-gray-100 space-y-6">
                {/* Header */}
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-4 border-b border-gray-100">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="text-2xl">➕🏦</span>
                      <h3 className="text-base sm:text-lg font-bold font-display text-gray-900">
                        Admin Loan Desk — Apply On Behalf
                      </h3>
                      <span className="px-2.5 py-0.5 rounded-full text-[10px] font-black bg-blue-100 text-blue-800 uppercase">
                        Admin Authority
                      </span>
                    </div>
                    <p className="text-xs text-gray-500 mt-1">
                      Admin kisi bhi agent ke existing user ka loan apply kar sakta hai ya new user register karke loan apply kar sakta hai. Application pending queue me jayegi jahan aap ise final review karke approve karenge.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setTab("loans")}
                    className="self-start sm:self-auto px-3.5 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-800 rounded-xl text-xs font-bold transition flex items-center gap-1.5 cursor-pointer active:scale-95"
                  >
                    <span>📋</span> View All Loans ({loans.length})
                  </button>
                </div>

                <form onSubmit={handleIssueLoanSubmit} className="space-y-6">
                  {/* Step 1: Borrower Selection */}
                  <div className="p-4 sm:p-5 bg-slate-50 border border-slate-200 rounded-2xl space-y-4">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                      <h4 className="text-xs sm:text-sm font-black text-slate-900 flex items-center gap-2">
                        <span className="w-5 h-5 rounded-full bg-blue-600 text-white text-[10px] flex items-center justify-center font-bold">1</span>
                        Borrower Selection (Kiske Liye Loan Apply Karna Hai?)
                      </h4>
                      {/* Mode Switcher */}
                      <div className="flex items-center p-1 bg-white rounded-xl border border-gray-200 text-xs font-bold">
                        <button
                          type="button"
                          onClick={() => setIssueBorrowerType("existing")}
                          className={`px-3 py-1.5 rounded-lg transition cursor-pointer flex items-center gap-1.5 ${
                            issueBorrowerType === "existing"
                              ? "bg-blue-600 text-white shadow-xs font-black"
                              : "text-gray-500 hover:text-gray-900"
                          }`}
                        >
                          <span>👤</span> Existing Customer / Agent's User
                        </button>
                        <button
                          type="button"
                          onClick={() => setIssueBorrowerType("new")}
                          className={`px-3 py-1.5 rounded-lg transition cursor-pointer flex items-center gap-1.5 ${
                            issueBorrowerType === "new"
                              ? "bg-blue-600 text-white shadow-xs font-black"
                              : "text-gray-500 hover:text-gray-900"
                          }`}
                        >
                          <span>🆕</span> New User Banake
                        </button>
                      </div>
                    </div>

                    {/* EXISTING USER SELECTION */}
                    {issueBorrowerType === "existing" && (
                      <div className="space-y-3">
                        {issueSelectedUser ? (
                          /* Selected User Card */
                          <div className="space-y-3">
                            <div className="p-3.5 bg-emerald-50 border-2 border-emerald-400 rounded-2xl flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-xs">
                              <div className="flex items-center gap-3">
                                <div className="w-10 h-10 rounded-xl bg-emerald-600 text-white flex items-center justify-center font-bold text-base shadow-xs">
                                  👤
                                </div>
                                <div>
                                  <div className="flex items-center gap-2 flex-wrap">
                                    <span className="font-extrabold text-sm text-emerald-950">{issueSelectedUser.name}</span>
                                    <span className="font-mono text-[11px] font-bold bg-white px-2 py-0.5 rounded border border-emerald-200 text-emerald-800">
                                      {issueSelectedUser.accountNumber || `A/C: EFS${String(issueSelectedUser._id).slice(-7).toUpperCase()}`}
                                    </span>
                                    <span className="text-[10px] font-black px-2 py-0.5 rounded-full uppercase bg-emerald-200 text-emerald-900">
                                      ✓ Selected
                                    </span>
                                  </div>
                                  <div className="text-xs text-emerald-800/90 mt-0.5 flex flex-wrap gap-x-3">
                                    <span>📞 {issueSelectedUser.phone}</span>
                                    <span>✉️ {issueSelectedUser.email}</span>
                                    <span>💰 Balance: ₹{Number(issueSelectedUser.balance || 0).toLocaleString("en-IN")}</span>
                                  </div>
                                  {issueSelectedUser.referredBy && (() => {
                                    const agent = agents.find(a => String(a._id) === String(issueSelectedUser.referredBy));
                                    return (
                                      <div className="text-[11px] font-bold text-amber-800 bg-amber-100/70 px-2 py-0.5 rounded mt-1 inline-flex items-center gap-1">
                                        <span>🤝 Agent User:</span>
                                        <span>{agent ? `${agent.name} (${agent.agentProfile?.businessName || 'Agent Partner'})` : 'Linked Agent'}</span>
                                      </div>
                                    );
                                  })()}
                                </div>
                              </div>
                              <button
                                type="button"
                                onClick={() => setIssueSelectedUser(null)}
                                className="px-3 py-1.5 bg-white hover:bg-emerald-100 text-emerald-800 border border-emerald-300 rounded-xl text-xs font-bold transition cursor-pointer self-start sm:self-auto"
                              >
                                ✕ Change Borrower
                              </button>
                            </div>

                            {/* Borrower KYC & Loan History Intelligence (State A: Purana Loan Borrower | State B: Normal KYC Done - Cheque Required | State C: First Time Borrower) */}
                            {(() => {
                              const userPrevLoans = loans.filter(l => String(l.userId?._id || l.userId) === String(issueSelectedUser._id));
                              const hasLoanHistory = userPrevLoans.length > 0;
                              const hasNormalKyc = issueSelectedUser.kycStatus === "verified" || Boolean(issueSelectedUser.kycDocuments?.doc1Url || issueSelectedUser.kycDocuments?.docUrl);

                              // STATE A: Genuine Returning Loan Borrower (has past loan history)
                              if (hasLoanHistory) {
                                return (
                                  <div className="space-y-3 p-4 bg-emerald-50/80 border border-emerald-300 rounded-2xl">
                                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-emerald-200/70 pb-2.5">
                                      <div className="flex items-center gap-2.5">
                                        <div className="w-8 h-8 rounded-xl bg-emerald-600 text-white flex items-center justify-center font-black text-sm shadow-2xs">
                                          🛡️
                                        </div>
                                        <div>
                                          <div className="flex items-center gap-2">
                                            <span className="text-xs font-black text-emerald-950">
                                              Purana Verified Loan Borrower
                                            </span>
                                            <span className="text-[10px] font-black bg-emerald-200 text-emerald-900 px-2 py-0.5 rounded-full">
                                              {userPrevLoans.length} Purane Loan Record
                                            </span>
                                          </div>
                                          <p className="text-[11px] text-emerald-800 leading-tight mt-0.5">
                                            Is borrower ke KYC documents aur loan history system me verified hain. <strong>Dobara document upload karne ki koi zaroorat nahi hai.</strong>
                                          </p>
                                        </div>
                                      </div>
                                    </div>

                                    {/* Detailed breakdown of all previous loans */}
                                    <div className="space-y-2">
                                      <div className="flex items-center justify-between text-[11px] font-black text-emerald-950">
                                        <span>📊 Purane Loans Ki Puri Jankari ({userPrevLoans.length}):</span>
                                        <span className="text-[10px] text-emerald-700 font-bold">Total Borrowed History</span>
                                      </div>
                                      <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5 max-h-60 overflow-y-auto pr-0.5 no-scrollbar">
                                        {userPrevLoans.map((pl, idx) => {
                                          const isOverdue = pl.status === "overdue";
                                          const isActive = pl.status === "active" || pl.status === "approved" || pl.status === "disbursed";
                                          const isClosed = pl.status === "closed" || pl.status === "completed" || pl.status === "paid";
                                          const badgeColor = isOverdue
                                            ? "bg-rose-100 text-rose-800 border-rose-300"
                                            : isActive
                                            ? "bg-emerald-100 text-emerald-800 border-emerald-300"
                                            : isClosed
                                            ? "bg-slate-100 text-slate-700 border-slate-300"
                                            : "bg-amber-100 text-amber-800 border-amber-300";

                                          return (
                                            <div
                                              key={pl._id || idx}
                                              className="p-3 bg-white border border-emerald-200 rounded-xl space-y-2 shadow-2xs hover:shadow-xs transition"
                                            >
                                              <div className="flex items-start justify-between gap-1.5 border-b border-gray-100 pb-1.5">
                                                <div>
                                                  <div className="flex items-center gap-1.5">
                                                    <span className="text-xs font-black text-gray-900">
                                                      #{idx + 1} {pl.loanType === "student" ? "🎓 Student" : pl.loanType === "micro_business" || pl.loanType === "micro" ? "🏪 Micro" : "👤 Personal"} Loan
                                                    </span>
                                                    <span className={`text-[9px] font-black px-1.5 py-0.2 rounded border uppercase ${badgeColor}`}>
                                                      {pl.status}
                                                    </span>
                                                  </div>
                                                  <span className="text-[10px] font-mono text-gray-400 block">
                                                    Acc: {pl.accountNumber || pl._id?.slice(-8)}
                                                  </span>
                                                </div>
                                                <div className="text-right">
                                                  <span className="text-xs font-black font-mono text-emerald-700 block">
                                                    ₹{Number(pl.amount || 0).toLocaleString("en-IN")}
                                                  </span>
                                                  <span className="text-[9px] text-gray-400 font-bold block">Sanctioned</span>
                                                </div>
                                              </div>

                                              {/* Financial Grid */}
                                              <div className="grid grid-cols-3 gap-1.5 text-[10px]">
                                                <div className="p-1.5 bg-slate-50 rounded-lg">
                                                  <span className="text-gray-500 block text-[9px]">Disbursed</span>
                                                  <span className="font-mono font-bold text-gray-900">
                                                    ₹{Number(pl.disbursalAmount || pl.amount || 0).toLocaleString("en-IN")}
                                                  </span>
                                                </div>
                                                <div className="p-1.5 bg-slate-50 rounded-lg">
                                                  <span className="text-gray-500 block text-[9px]">Tenure / Kist</span>
                                                  <span className="font-mono font-bold text-blue-800">
                                                    {pl.installmentsCount || pl.tenure || 15} Kist
                                                  </span>
                                                </div>
                                                <div className="p-1.5 bg-slate-50 rounded-lg">
                                                  <span className="text-gray-500 block text-[9px]">Per Kist (EMI)</span>
                                                  <span className="font-mono font-bold text-gray-900">
                                                    ₹{Number(pl.installmentAmount || pl.emiAmount || 0).toLocaleString("en-IN")}
                                                  </span>
                                                </div>
                                                <div className="p-1.5 bg-slate-50 rounded-lg">
                                                  <span className="text-gray-500 block text-[9px]">Interest Rate</span>
                                                  <span className="font-mono font-bold text-indigo-700">
                                                    {pl.interestRatePerInstallment || pl.interestRate || 1.34}%
                                                  </span>
                                                </div>
                                                <div className="p-1.5 bg-slate-50 rounded-lg col-span-2">
                                                  <span className="text-gray-500 block text-[9px]">Remaining Due / Balance</span>
                                                  <span className="font-mono font-black text-rose-700">
                                                    ₹{Number(pl.remainingAmount !== undefined ? pl.remainingAmount : (pl.totalPayable || 0)).toLocaleString("en-IN")}
                                                  </span>
                                                </div>
                                              </div>

                                              {/* Footer date & cheque info */}
                                              <div className="flex items-center justify-between text-[9px] text-gray-500 pt-1 border-t border-gray-100">
                                                <span>📅 {pl.createdAt ? new Date(pl.createdAt).toLocaleDateString("en-IN", { day: 'numeric', month: 'short', year: 'numeric' }) : "N/A"}</span>
                                                {pl.chequeNumber || pl.documents?.chequeNumber ? (
                                                  <span className="font-mono font-bold text-gray-700 bg-gray-100 px-1.5 py-0.2 rounded">
                                                    Cheque: #{pl.chequeNumber || pl.documents?.chequeNumber}
                                                  </span>
                                                ) : pl.hasChequeFacility ? (
                                                  <span className="text-emerald-700 font-bold">Cheque Facility Active</span>
                                                ) : null}
                                              </div>
                                            </div>
                                          );
                                        })}
                                      </div>
                                    </div>
                                  </div>
                                );
                              }

                              // STATE B: Normal KYC Done, BUT No Loan Ever Taken (Full Loan KYC / Barrier Cheque Required!)
                              if (hasNormalKyc) {
                                return (
                                  <div className="space-y-3 p-4 bg-amber-50/90 border-2 border-amber-300 rounded-2xl">
                                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-amber-200 pb-2.5">
                                      <div className="flex items-center gap-2.5">
                                        <div className="w-8 h-8 rounded-xl bg-amber-500 text-white flex items-center justify-center font-black text-base shadow-2xs">
                                          ⚠️
                                        </div>
                                        <div>
                                          <div className="flex items-center gap-2">
                                            <span className="text-xs font-black text-amber-950">
                                              Normal KYC Done — Loan / Lending Full KYC (Barrier Cheque) Required
                                            </span>
                                            <span className="text-[10px] font-black bg-emerald-100 text-emerald-800 border border-emerald-300 px-2 py-0.5 rounded-full">
                                              Wallet KYC Verified
                                            </span>
                                          </div>
                                          <p className="text-[11px] text-amber-900 leading-tight mt-0.5">
                                            Is customer ka normal wallet KYC complete hai (Aadhaar & PAN file par hain). Par <strong>Loan / Lending ke liye Security / Barrier Cheque compulsory hai</strong>.
                                          </p>
                                        </div>
                                      </div>
                                    </div>

                                    {/* Status of Aadhaar & PAN */}
                                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-[10px]">
                                      <div className="p-2 bg-white/80 border border-emerald-200 rounded-lg flex items-center justify-between">
                                        <span className="font-bold text-gray-700">🪪 Aadhaar Front</span>
                                        <span className="font-black text-emerald-700 bg-emerald-50 px-1.5 py-0.5 rounded">✓ Verified</span>
                                      </div>
                                      <div className="p-2 bg-white/80 border border-emerald-200 rounded-lg flex items-center justify-between">
                                        <span className="font-bold text-gray-700">🔄 Aadhaar Back</span>
                                        <span className="font-black text-emerald-700 bg-emerald-50 px-1.5 py-0.5 rounded">✓ Verified</span>
                                      </div>
                                      <div className="p-2 bg-white/80 border border-emerald-200 rounded-lg flex items-center justify-between">
                                        <span className="font-bold text-gray-700">📑 PAN Card</span>
                                        <span className="font-black text-emerald-700 bg-emerald-50 px-1.5 py-0.5 rounded">✓ Verified</span>
                                      </div>
                                      <div className="p-2 bg-amber-100 border border-amber-300 rounded-lg flex items-center justify-between">
                                        <span className="font-bold text-amber-900">🏦 Barrier Cheque</span>
                                        <span className="font-black text-rose-700 bg-rose-50 px-1.5 py-0.5 rounded">Pending Upload</span>
                                      </div>
                                    </div>

                                    {/* Dedicated Barrier Cheque Upload Fields */}
                                    <div className="p-3 bg-white border border-amber-300 rounded-xl space-y-2">
                                      <div className="flex items-center justify-between">
                                        <span className="text-xs font-black text-gray-900 flex items-center gap-1.5">
                                          <span>🏦</span> Compulsory Barrier Cheque Details for Loan / Lending
                                        </span>
                                        <span className="text-[10px] text-amber-700 font-bold">Image / PDF (Max 5MB)</span>
                                      </div>

                                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                                        {/* Cheque Front */}
                                        <div className="p-2.5 bg-slate-50 border border-gray-200 rounded-lg space-y-1.5">
                                          <div className="flex items-center justify-between text-[11px] font-bold text-gray-800">
                                            <span>🏦 Cheque Front Image</span>
                                            {issueDocuments.chequeUrl ? (
                                              <span className="text-emerald-600 text-[10px] font-black">✓ Uploaded</span>
                                            ) : (
                                              <span className="text-rose-500 text-[10px] font-bold">* Required</span>
                                            )}
                                          </div>
                                          {issueDocuments.chequeUrl && (
                                            <div className="relative group w-full h-16 bg-black/5 rounded overflow-hidden flex items-center justify-center">
                                              <img
                                                src={issueDocuments.chequeUrl}
                                                alt="Cheque Front"
                                                className="max-h-full max-w-full object-contain cursor-zoom-in"
                                                onClick={() => { setLightboxImg(issueDocuments.chequeUrl); setZoomLevel(1); }}
                                              />
                                              <span className="absolute bottom-1 right-1 text-[8px] bg-black/60 text-white px-1 rounded">🔍 Zoom</span>
                                            </div>
                                          )}
                                          <input
                                            type="file"
                                            accept="image/*,application/pdf"
                                            onChange={(e) => handleDocFileUpload("chequeUrl", e.target.files[0])}
                                            className="text-[9px] text-gray-500 file:mr-1 file:py-0.5 file:px-1.5 file:rounded file:border-0 file:text-[9px] file:font-bold file:bg-blue-50 file:text-blue-700 w-full"
                                          />
                                        </div>

                                        {/* Cheque Back */}
                                        <div className="p-2.5 bg-slate-50 border border-gray-200 rounded-lg space-y-1.5">
                                          <div className="flex items-center justify-between text-[11px] font-bold text-gray-800">
                                            <span>🔄 Cheque Back Image</span>
                                            {issueDocuments.chequeBackUrl ? (
                                              <span className="text-emerald-600 text-[10px] font-black">✓ Uploaded</span>
                                            ) : (
                                              <span className="text-rose-500 text-[10px] font-bold">* Required</span>
                                            )}
                                          </div>
                                          {issueDocuments.chequeBackUrl && (
                                            <div className="relative group w-full h-16 bg-black/5 rounded overflow-hidden flex items-center justify-center">
                                              <img
                                                src={issueDocuments.chequeBackUrl}
                                                alt="Cheque Back"
                                                className="max-h-full max-w-full object-contain cursor-zoom-in"
                                                onClick={() => { setLightboxImg(issueDocuments.chequeBackUrl); setZoomLevel(1); }}
                                              />
                                              <span className="absolute bottom-1 right-1 text-[8px] bg-black/60 text-white px-1 rounded">🔍 Zoom</span>
                                            </div>
                                          )}
                                          <input
                                            type="file"
                                            accept="image/*,application/pdf"
                                            onChange={(e) => handleDocFileUpload("chequeBackUrl", e.target.files[0])}
                                            className="text-[9px] text-gray-500 file:mr-1 file:py-0.5 file:px-1.5 file:rounded file:border-0 file:text-[9px] file:font-bold file:bg-blue-50 file:text-blue-700 w-full"
                                          />
                                        </div>

                                        {/* Cheque Number Input */}
                                        <div className="p-2.5 bg-slate-50 border border-gray-200 rounded-lg space-y-1.5 flex flex-col justify-between">
                                          <div>
                                            <label className="text-[11px] font-bold text-gray-800 block">
                                              🔢 Barrier Cheque Number <span className="text-rose-500">*</span>
                                            </label>
                                            <span className="text-[9px] text-gray-500 block">Bank cheque par likha 6-digit number</span>
                                          </div>
                                          <input
                                            type="text"
                                            value={issueChequeNumber}
                                            onChange={(e) => setIssueChequeNumber(e.target.value)}
                                            placeholder="e.g. 000452"
                                            className="w-full px-2.5 py-1.5 bg-white border border-gray-300 rounded-lg text-xs font-mono font-bold text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
                                          />
                                        </div>
                                      </div>
                                    </div>
                                  </div>
                                );
                              }

                              // STATE C: First Time Borrower (Neither past loans nor Normal KYC on file)
                              return (
                                <div className="p-4 bg-amber-50/90 border border-amber-300 rounded-2xl space-y-3">
                                  <div className="flex items-center justify-between">
                                    <div className="flex items-center gap-2">
                                      <span className="text-lg">📁</span>
                                      <div>
                                        <span className="text-xs font-black text-amber-950 block">
                                          First Time Borrower — Full Loan KYC Required (Aadhaar, PAN & Cheque)
                                        </span>
                                        <span className="text-[10px] text-amber-800 block">
                                          Is borrower ke KYC documents file par nahi hain. Niche diye gaye sabhi 6 documents upload karein:
                                        </span>
                                      </div>
                                    </div>
                                    <span className="text-[10px] text-amber-700 font-bold hidden sm:inline">Image / PDF (Max 5MB)</span>
                                  </div>

                                  <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2.5">
                                    {[
                                      { key: "doc1Url", label: "Aadhaar Card Front", icon: "🪪" },
                                      { key: "doc1BackUrl", label: "Aadhaar Card Back", icon: "🔄" },
                                      { key: "doc2Url", label: "PAN Card Front", icon: "📑" },
                                      { key: "doc2BackUrl", label: "PAN Card Back", icon: "📄" },
                                      { key: "chequeUrl", label: "Barrier Cheque Front", icon: "🏦" },
                                      { key: "chequeBackUrl", label: "Barrier Cheque Back", icon: "🔄" },
                                    ].map(doc => (
                                      <div key={doc.key} className="p-2.5 bg-white border border-amber-200 rounded-xl space-y-1.5">
                                        <div className="flex items-center justify-between text-[11px] font-bold text-gray-800">
                                          <span>{doc.icon} {doc.label}</span>
                                          {issueDocuments[doc.key] ? (
                                            <span className="text-emerald-600 text-[10px] font-black">✓ Uploaded</span>
                                          ) : (
                                            <span className="text-gray-400 text-[10px]">Select</span>
                                          )}
                                        </div>
                                        {issueDocuments[doc.key] && (
                                          <div className="relative group w-full h-14 bg-black/5 rounded overflow-hidden flex items-center justify-center">
                                            <img
                                              src={issueDocuments[doc.key]}
                                              alt={doc.label}
                                              className="max-h-full max-w-full object-contain cursor-zoom-in"
                                              onClick={() => { setLightboxImg(issueDocuments[doc.key]); setZoomLevel(1); }}
                                            />
                                            <span className="absolute bottom-1 right-1 text-[8px] bg-black/60 text-white px-1 rounded">🔍 Zoom</span>
                                          </div>
                                        )}
                                        <input
                                          type="file"
                                          accept="image/*,application/pdf"
                                          onChange={(e) => handleDocFileUpload(doc.key, e.target.files[0])}
                                          className="text-[9px] text-gray-500 file:mr-1 file:py-0.5 file:px-1.5 file:rounded file:border-0 file:text-[9px] file:font-bold file:bg-blue-50 file:text-blue-700 w-full"
                                        />
                                      </div>
                                    ))}
                                  </div>

                                  {/* Cheque Number input for First Time Borrower */}
                                  <div className="p-2.5 bg-white border border-amber-200 rounded-xl flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                                    <div>
                                      <span className="text-xs font-bold text-gray-800 block">
                                        🔢 Barrier Cheque Number (Compulsory for Loan Security)
                                      </span>
                                      <span className="text-[10px] text-gray-500">Security barrier cheque ka 6-digit number enter karein</span>
                                    </div>
                                    <input
                                      type="text"
                                      value={issueChequeNumber}
                                      onChange={(e) => setIssueChequeNumber(e.target.value)}
                                      placeholder="e.g. 000452"
                                      className="w-full sm:w-48 px-3 py-1.5 border border-gray-300 rounded-lg text-xs font-mono font-bold text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
                                    />
                                  </div>
                                </div>
                              );
                            })()}
                          </div>
                        ) : (
                          /* Search & Pick from Users */
                          <div className="space-y-2">
                            <input
                              type="text"
                              value={issueUserSearch}
                              onChange={(e) => setIssueUserSearch(e.target.value)}
                              placeholder="Search customer by name, phone, account number, or referring agent..."
                              className="w-full px-3.5 py-2.5 bg-white border border-gray-300 rounded-xl text-xs text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 shadow-2xs"
                            />
                            <div className="max-h-56 overflow-y-auto space-y-1.5 p-1 border border-gray-200 rounded-xl bg-white no-scrollbar">
                              {filteredSearchUsers.length === 0 ? (
                                <p className="py-6 text-center text-xs text-gray-400">No matching users found.</p>
                              ) : (
                                filteredSearchUsers.slice(0, 20).map(u => {
                                  const agent = agents.find(a => String(a._id) === String(u.referredBy));
                                  return (
                                    <div
                                      key={u._id}
                                      onClick={() => setIssueSelectedUser(u)}
                                      className="p-2.5 rounded-xl hover:bg-blue-50/70 border border-transparent hover:border-blue-200 flex items-center justify-between gap-2 transition cursor-pointer group"
                                    >
                                      <div>
                                        <div className="flex items-center gap-2 flex-wrap">
                                          <span className="font-bold text-xs text-gray-900 group-hover:text-blue-900">{u.name}</span>
                                          <span className="font-mono text-[10px] text-gray-500">
                                            {u.accountNumber || `EFS${String(u._id).slice(-7).toUpperCase()}`}
                                          </span>
                                          {agent ? (
                                            <span className="px-1.5 py-0.5 rounded text-[9px] font-black bg-amber-100 text-amber-900 border border-amber-300">
                                              🤝 Agent User: {agent.name}
                                            </span>
                                          ) : (
                                            <span className="px-1.5 py-0.5 rounded text-[9px] font-medium bg-slate-100 text-slate-600">
                                              Direct User
                                            </span>
                                          )}
                                          {(() => {
                                            const uLoans = loans.filter(l => String(l.userId?._id || l.userId) === String(u._id));
                                            if (uLoans.length > 0) {
                                              return (
                                                <span className="px-1.5 py-0.5 rounded text-[9px] font-black bg-emerald-100 text-emerald-900 border border-emerald-300">
                                                  🛡️ {uLoans.length} Purane Loan
                                                </span>
                                              );
                                            }
                                            if (u.kycStatus === "verified" || Boolean(u.kycDocuments?.doc1Url || u.kycDocuments?.docUrl)) {
                                              return (
                                                <span className="px-1.5 py-0.5 rounded text-[9px] font-bold bg-amber-50 text-amber-800 border border-amber-200">
                                                  ⚠️ Normal KYC (Cheque Chahiye)
                                                </span>
                                              );
                                            }
                                            return (
                                              <span className="px-1.5 py-0.5 rounded text-[9px] font-medium bg-gray-100 text-gray-500">
                                                📁 No KYC
                                              </span>
                                            );
                                          })()}
                                        </div>
                                        <p className="text-[11px] text-gray-400">
                                          {u.phone} • {u.email} • Balance: ₹{Number(u.balance || 0).toLocaleString("en-IN")}
                                        </p>
                                      </div>
                                      <span className="text-xs font-bold text-blue-600 group-hover:translate-x-0.5 transition shrink-0">
                                        Select →
                                      </span>
                                    </div>
                                  );
                                })
                              )}
                            </div>
                          </div>
                        )}
                      </div>
                    )}

                    {/* NEW USER REGISTRATION FORM */}
                    {issueBorrowerType === "new" && (
                      <div className="space-y-3 bg-white p-3.5 sm:p-4 rounded-xl border border-gray-200">
                        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
                          <div>
                            <label className="text-[11px] font-bold text-gray-700 block mb-1">
                              Borrower Full Name <span className="text-rose-500">*</span>
                            </label>
                            <input
                              type="text"
                              required
                              value={issueNewUser.name}
                              onChange={(e) => setIssueNewUser({ ...issueNewUser, name: e.target.value })}
                              placeholder="e.g. Ramesh Kumar"
                              className="w-full px-3 py-2 border border-gray-300 rounded-xl text-xs text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
                            />
                          </div>

                          <div>
                            <label className="text-[11px] font-bold text-gray-700 block mb-1">
                              Phone Number (10 Digits) <span className="text-rose-500">*</span>
                            </label>
                            <input
                              type="tel"
                              required
                              maxLength={10}
                              value={issueNewUser.phone}
                              onChange={(e) => setIssueNewUser({ ...issueNewUser, phone: e.target.value.replace(/\D/g, '') })}
                              placeholder="e.g. 9876543210"
                              className="w-full px-3 py-2 border border-gray-300 rounded-xl text-xs text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500 font-mono"
                            />
                          </div>

                          <div>
                            <label className="text-[11px] font-bold text-gray-700 block mb-1">
                              Email Address (Optional)
                            </label>
                            <input
                              type="email"
                              value={issueNewUser.email}
                              onChange={(e) => setIssueNewUser({ ...issueNewUser, email: e.target.value })}
                              placeholder="e.g. ramesh@gmail.com"
                              className="w-full px-3 py-2 border border-gray-300 rounded-xl text-xs text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
                            />
                          </div>

                          <div>
                            <label className="text-[11px] font-bold text-gray-700 block mb-1">
                              Aadhaar Card Number (Optional)
                            </label>
                            <input
                              type="text"
                              maxLength={12}
                              value={issueNewUser.aadharNumber}
                              onChange={(e) => setIssueNewUser({ ...issueNewUser, aadharNumber: e.target.value.replace(/\D/g, '') })}
                              placeholder="12-digit UID"
                              className="w-full px-3 py-2 border border-gray-300 rounded-xl text-xs text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500 font-mono"
                            />
                          </div>

                          <div>
                            <label className="text-[11px] font-bold text-gray-700 block mb-1">
                              PAN Card Number (Optional)
                            </label>
                            <input
                              type="text"
                              maxLength={10}
                              value={issueNewUser.panNumber}
                              onChange={(e) => setIssueNewUser({ ...issueNewUser, panNumber: e.target.value.toUpperCase() })}
                              placeholder="10-digit PAN"
                              className="w-full px-3 py-2 border border-gray-300 rounded-xl text-xs text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500 font-mono uppercase"
                            />
                          </div>

                          {/* Agent Partner Attribution */}
                          <div>
                            <label className="text-[11px] font-bold text-gray-700 block mb-1">
                              Assign to Agent Partner (Optional)
                            </label>
                            <select
                              value={issueNewUser.referredByAgentId}
                              onChange={(e) => setIssueNewUser({ ...issueNewUser, referredByAgentId: e.target.value })}
                              className="w-full px-3 py-2 border border-gray-300 rounded-xl text-xs text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white cursor-pointer"
                            >
                              <option value="">No Agent (Direct Company Borrower)</option>
                              {agents.filter(a => a.role === "agent" || a.agentProfile?.status === "approved").map(a => (
                                <option key={a._id} value={a._id}>
                                  {a.name} ({a.agentProfile?.businessName || "Agent"}) — {a.phone}
                                </option>
                              ))}
                            </select>
                          </div>
                        </div>

                        <div>
                          <label className="text-[11px] font-bold text-gray-700 block mb-1">
                            Residential / Shop Address
                          </label>
                          <input
                            type="text"
                            value={issueNewUser.address}
                            onChange={(e) => setIssueNewUser({ ...issueNewUser, address: e.target.value })}
                            placeholder="Full address, city, pin code..."
                            className="w-full px-3 py-2 border border-gray-300 rounded-xl text-xs text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
                          />
                        </div>

                        {/* Document Upload for New User */}
                        <div className="pt-2 border-t border-gray-200 space-y-2.5">
                          <div className="flex items-center justify-between">
                            <label className="text-[11px] font-bold text-gray-800 block">
                              Upload Full Loan KYC Documents (Aadhaar, PAN & Barrier Cheque)
                            </label>
                            <span className="text-[10px] text-gray-500 font-bold">Image / PDF (Max 5MB)</span>
                          </div>
                          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2">
                            {[
                              { key: "doc1Url", label: "Aadhaar Card Front", icon: "🪪" },
                              { key: "doc1BackUrl", label: "Aadhaar Card Back", icon: "🔄" },
                              { key: "doc2Url", label: "PAN Card Front", icon: "📑" },
                              { key: "doc2BackUrl", label: "PAN Card Back", icon: "📄" },
                              { key: "chequeUrl", label: "Barrier Cheque Front", icon: "🏦" },
                              { key: "chequeBackUrl", label: "Barrier Cheque Back", icon: "🔄" },
                            ].map(doc => (
                              <div key={doc.key} className="p-2.5 bg-slate-50 border border-gray-200 rounded-xl space-y-1.5">
                                <div className="flex items-center justify-between text-[11px] font-bold text-gray-800">
                                  <span>{doc.icon} {doc.label}</span>
                                  {issueDocuments[doc.key] && <span className="text-emerald-600 text-[10px] font-black">✓ Uploaded</span>}
                                </div>
                                {issueDocuments[doc.key] && (
                                  <div className="relative group w-full h-12 bg-black/5 rounded overflow-hidden flex items-center justify-center">
                                    <img
                                      src={issueDocuments[doc.key]}
                                      alt={doc.label}
                                      className="max-h-full max-w-full object-contain cursor-zoom-in"
                                      onClick={() => { setLightboxImg(issueDocuments[doc.key]); setZoomLevel(1); }}
                                    />
                                    <span className="absolute bottom-1 right-1 text-[8px] bg-black/60 text-white px-1 rounded">🔍 Zoom</span>
                                  </div>
                                )}
                                <input
                                  type="file"
                                  accept="image/*,application/pdf"
                                  onChange={(e) => handleDocFileUpload(doc.key, e.target.files[0])}
                                  className="text-[9px] text-gray-500 file:mr-1 file:py-0.5 file:px-1.5 file:rounded file:border-0 file:text-[9px] file:font-bold file:bg-blue-50 file:text-blue-700 w-full"
                                />
                              </div>
                            ))}
                          </div>

                          {/* Cheque Number input for New User */}
                          <div className="p-2.5 bg-slate-50 border border-gray-200 rounded-xl flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                            <div>
                              <span className="text-[11px] font-bold text-gray-800 block">
                                🔢 Barrier Cheque Number (Compulsory for Loan Security)
                              </span>
                              <span className="text-[9px] text-gray-500">Security barrier cheque ka 6-digit number enter karein</span>
                            </div>
                            <input
                              type="text"
                              value={issueChequeNumber}
                              onChange={(e) => setIssueChequeNumber(e.target.value)}
                              placeholder="e.g. 000452"
                              className="w-full sm:w-48 px-2.5 py-1.5 bg-white border border-gray-300 rounded-lg text-xs font-mono font-bold text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
                            />
                          </div>
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Step 2: Loan Terms Configuration */}
                  <div className="p-4 sm:p-5 bg-slate-50 border border-slate-200 rounded-2xl space-y-4">
                    <h4 className="text-xs sm:text-sm font-black text-slate-900 flex items-center gap-2">
                      <span className="w-5 h-5 rounded-full bg-blue-600 text-white text-[10px] flex items-center justify-center font-bold">2</span>
                      Loan Terms & Configuration (Category, Amount, Installments & Rate)
                    </h4>

                    {/* Loan Category Selector: Personal | Student | Micro */}
                    <div className="space-y-1.5">
                      <label className="text-xs font-bold text-gray-700 block">
                        Loan Category / Type <span className="text-rose-500">*</span>
                      </label>
                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                        {[
                          { id: "personal", label: "👤 Personal Loan", desc: "Personal & emergency cash needs", defaultPurpose: "Personal Financial Need" },
                          { id: "student", label: "🎓 Student Loan", desc: "Tuition, coaching & book fees", defaultPurpose: "Student Education & Fees" },
                          { id: "micro", label: "🏪 Micro Enterprise", desc: "Dukan & small business working capital", defaultPurpose: "Micro Business Working Capital" }
                        ].map((cat) => (
                          <button
                            key={cat.id}
                            type="button"
                            onClick={() => {
                              setIssueLoanType(cat.id);
                              setIssuePurpose(cat.defaultPurpose);
                            }}
                            className={`p-3 rounded-xl border text-left transition cursor-pointer active:scale-95 ${
                              issueLoanType === cat.id
                                ? "bg-blue-50 border-blue-600 ring-2 ring-blue-500 shadow-2xs"
                                : "bg-white border-gray-200 hover:bg-gray-50 text-gray-700"
                            }`}
                          >
                            <span className={`block text-xs font-black ${issueLoanType === cat.id ? "text-blue-900" : "text-gray-900"}`}>
                              {cat.label}
                            </span>
                            <span className="block text-[10px] text-gray-500 mt-0.5 leading-tight">
                              {cat.desc}
                            </span>
                          </button>
                        ))}
                      </div>
                    </div>

                    {/* Amount Input & Quick Pills */}
                    <div className="space-y-2 pt-2 border-t border-slate-200">
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1">
                        <label className="text-xs font-bold text-gray-700">
                          Loan Amount (₹)
                        </label>
                        <span className="font-mono text-base font-black text-emerald-600">
                          ₹{amt.toLocaleString("en-IN")}
                        </span>
                      </div>
                      <input
                        type="number"
                        min={5000}
                        max={1000000}
                        step={1000}
                        value={issueLoanAmount}
                        onChange={(e) => setIssueLoanAmount(Number(e.target.value))}
                        className="w-full px-3.5 py-2.5 bg-white border border-gray-300 rounded-xl text-base font-black font-mono text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
                      />
                      {/* Presets */}
                      <div className="flex flex-wrap items-center gap-1.5 pt-1">
                        {[10000, 15000, 20000, 25000, 30000, 50000, 100000].map(p => (
                          <button
                            key={p}
                            type="button"
                            onClick={() => setIssueLoanAmount(p)}
                            className={`px-2.5 py-1 rounded-lg text-xs font-bold transition cursor-pointer active:scale-95 ${
                              issueLoanAmount === p
                                ? "bg-emerald-600 text-white shadow-2xs"
                                : "bg-white text-gray-700 hover:bg-gray-100 border border-gray-300"
                            }`}
                          >
                            ₹{p.toLocaleString("en-IN")}
                          </button>
                        ))}
                      </div>
                    </div>

                    {/* Installments Count (10-Day Cycles) */}
                    <div className="space-y-2 pt-2 border-t border-slate-200">
                      <div className="flex items-center justify-between">
                        <label className="text-xs font-bold text-gray-700">
                          Easy Installments (10-Day Cycle)
                        </label>
                        <span className="text-xs font-bold text-blue-700">
                          {count} Kist ({count * 10} Din)
                        </span>
                      </div>
                      <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
                        {[
                          { kist: 15, days: "150 Din" },
                          { kist: 18, days: "180 Din" },
                          { kist: 21, days: "210 Din" },
                          { kist: 24, days: "240 Din" },
                          { kist: 30, days: "300 Din" }
                        ].map(({ kist, days }) => (
                          <button
                            key={kist}
                            type="button"
                            onClick={() => setIssueInstallmentsCount(kist)}
                            className={`p-2.5 rounded-xl border text-center transition cursor-pointer active:scale-95 ${
                              issueInstallmentsCount === kist
                                ? "bg-blue-600 text-white border-blue-600 shadow-xs"
                                : "bg-white text-gray-800 hover:bg-gray-50 border-gray-300"
                            }`}
                          >
                            <span className="block font-black text-sm">{kist} Kist</span>
                            <span className={`text-[10px] block ${issueInstallmentsCount === kist ? "text-blue-200" : "text-gray-400"}`}>
                              {days}
                            </span>
                          </button>
                        ))}
                      </div>
                    </div>

                    {/* Interest Rate & Security Options */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2 border-t border-slate-200 text-xs">
                      <div className="space-y-1.5">
                        <div className="flex items-center justify-between">
                          <label className="font-bold text-gray-700 block">
                            Interest Rate per Installment (%)
                          </label>
                          <span className="font-mono text-xs font-black text-blue-600 bg-blue-50 px-2 py-0.5 rounded border border-blue-200">
                            {issueInterestRate}%
                          </span>
                        </div>
                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            onClick={() => setIssueInterestRate(1.34)}
                            className={`py-2 px-2.5 rounded-xl border font-bold text-center transition cursor-pointer shrink-0 ${
                              issueInterestRate === 1.34
                                ? "bg-blue-600 text-white border-blue-600 shadow-2xs"
                                : "bg-white text-gray-700 border-gray-300 hover:bg-gray-50"
                            }`}
                          >
                            1.34% (Std)
                          </button>
                          <button
                            type="button"
                            onClick={() => setIssueInterestRate(1.0)}
                            className={`py-2 px-2.5 rounded-xl border font-bold text-center transition cursor-pointer shrink-0 ${
                              issueInterestRate === 1.0
                                ? "bg-emerald-600 text-white border-emerald-600 shadow-2xs"
                                : "bg-white text-gray-700 border-gray-300 hover:bg-gray-50"
                            }`}
                          >
                            1.0% (&gt;₹20k)
                          </button>
                          {/* Custom Rate Input */}
                          <div className="flex-1 flex items-center gap-1 border border-gray-300 rounded-xl px-2.5 py-1.5 bg-white focus-within:ring-2 focus-within:ring-blue-500">
                            <span className="text-[10px] font-bold text-gray-400">Custom:</span>
                            <input
                              type="number"
                              step="0.01"
                              min="0"
                              max="25"
                              value={issueInterestRate}
                              onChange={(e) => setIssueInterestRate(parseFloat(e.target.value) || 0)}
                              placeholder="e.g. 1.2"
                              className="w-full text-xs font-black font-mono text-gray-900 focus:outline-none"
                            />
                            <span className="text-xs font-bold text-gray-500">%</span>
                          </div>
                        </div>
                      </div>

                      <div className="space-y-1">
                        <label className="font-bold text-gray-700 block">
                          Security Cheque Facility
                        </label>
                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            onClick={() => setIssueHasCheque(false)}
                            className={`flex-1 py-2 px-3 rounded-xl border font-bold text-center transition cursor-pointer ${
                              !issueHasCheque
                                ? "bg-slate-800 text-white border-slate-800"
                                : "bg-white text-gray-700 border-gray-300"
                            }`}
                          >
                            No Cheque
                          </button>
                          <button
                            type="button"
                            onClick={() => setIssueHasCheque(true)}
                            className={`flex-1 py-2 px-3 rounded-xl border font-bold text-center transition cursor-pointer ${
                              issueHasCheque
                                ? "bg-emerald-600 text-white border-emerald-600"
                                : "bg-white text-gray-700 border-gray-300"
                            }`}
                          >
                            Yes (Cheque Facility)
                          </button>
                        </div>
                      </div>
                    </div>

                    {issueHasCheque && (
                      <div>
                        <label className="text-[11px] font-bold text-gray-700 block mb-1">
                          Barrier Cheque Number
                        </label>
                        <input
                          type="text"
                          value={issueChequeNumber}
                          onChange={(e) => setIssueChequeNumber(e.target.value)}
                          placeholder="e.g. 000452"
                          className="w-full px-3 py-2 bg-white border border-gray-300 rounded-xl text-xs text-gray-900 font-mono"
                        />
                      </div>
                    )}

                    <div>
                      <label className="text-[11px] font-bold text-gray-700 block mb-1">
                        Loan Purpose / Admin Remarks
                      </label>
                      <input
                        type="text"
                        value={issuePurpose}
                        onChange={(e) => setIssuePurpose(e.target.value)}
                        placeholder="e.g. Shop working capital, emergency medical, personal..."
                        className="w-full px-3 py-2 bg-white border border-gray-300 rounded-xl text-xs text-gray-900"
                      />
                    </div>
                  </div>

                  {/* Step 3: Real-Time Calculated Quote Summary Box */}
                  <div className="p-4 sm:p-5 bg-gradient-to-br from-slate-900 to-slate-800 text-white rounded-2xl space-y-4 shadow-lg">
                    <div className="flex items-center justify-between border-b border-white/10 pb-3">
                      <div>
                        <span className="text-[10px] font-black tracking-wider uppercase text-blue-300 block">
                          Real-Time Quote Breakdown
                        </span>
                        <h4 className="text-base font-extrabold text-white">Loan Financial Summary</h4>
                      </div>
                      <span className="px-2.5 py-1 rounded-full text-[10px] font-black bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 uppercase">
                        10-Day Cycle Schedule
                      </span>
                    </div>

                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
                      <div className="p-3 bg-white/5 rounded-xl border border-white/10">
                        <span className="text-slate-400 block text-[10px]">Sanctioned Amount</span>
                        <span className="text-base font-black text-white font-mono">₹{amt.toLocaleString("en-IN")}</span>
                      </div>
                      <div className="p-3 bg-white/5 rounded-xl border border-white/10">
                        <span className="text-slate-400 block text-[10px]">Per Installment (Kist)</span>
                        <span className="text-base font-black text-emerald-400 font-mono">₹{installmentAmt.toLocaleString("en-IN")}</span>
                        <span className="text-[9px] text-slate-400 block">Har 10 din par</span>
                      </div>
                      <div className="p-3 bg-white/5 rounded-xl border border-white/10">
                        <span className="text-slate-400 block text-[10px]">Total Payable ({count} Kist)</span>
                        <span className="text-base font-black text-amber-300 font-mono">₹{totalPayable.toLocaleString("en-IN")}</span>
                        <span className="text-[9px] text-slate-400 block">Interest: ₹{totalInterest.toLocaleString("en-IN")}</span>
                      </div>
                      <div className="p-3 bg-white/5 rounded-xl border border-white/10">
                        <span className="text-slate-400 block text-[10px]">Net Disbursal to Wallet</span>
                        <span className="text-base font-black text-cyan-300 font-mono">₹{netDisbursal.toLocaleString("en-IN")}</span>
                        <span className="text-[9px] text-slate-400 block">After 5% fee + 1% UPI</span>
                      </div>
                    </div>

                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-3 border-t border-white/10">
                      <p className="text-[11px] text-slate-300 leading-relaxed max-w-xl">
                        💡 <strong>Note:</strong> Yeh loan submit hone ke baad direct disburse nahi hoga. Request <strong>Pending Loan Applications</strong> queue me jayegi jahan aap borrower ke documents aur details verify karke <strong>Approve</strong> karenge.
                      </p>

                      <button
                        type="submit"
                        disabled={issueSubmitting || (issueBorrowerType === "existing" && !issueSelectedUser)}
                        className="px-6 py-3 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white font-black text-xs sm:text-sm rounded-xl shadow-lg transition active:scale-95 flex items-center justify-center gap-2 cursor-pointer shrink-0"
                      >
                        <span>{issueSubmitting ? "Submitting Request..." : "🚀 Submit Loan Request for Admin Review"}</span>
                      </button>
                    </div>
                  </div>
                </form>
              </div>
            );
          })()}
          {tab === "lending" && (
            <div className="space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-white p-4 sm:p-5 rounded-2xl shadow-sm border border-gray-100">
                <div>
                  <h3 className="text-lg font-bold font-display flex items-center gap-2">
                    <span>🤝</span> Lending Investment Accounts ({bonds.length})
                  </h3>
                  <p className="text-xs sm:text-sm text-gray-500">
                    Compulsory KYC, Barrier Cheque, Nominee, UPI & Banking Details for Fixed Monthly Payout Accounts.
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={loadBonds}
                    className="px-3 py-2 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-xl text-xs font-bold transition flex items-center gap-1.5 cursor-pointer"
                  >
                    <span>🔄</span> Refresh
                  </button>
                </div>
              </div>

              {bonds.length === 0 ? (
                <div className="bg-white rounded-2xl p-12 text-center text-gray-400 border border-gray-100">
                  <span className="text-4xl block mb-2">🤝</span>
                  <p className="font-semibold text-gray-600">No lending accounts yet</p>
                  <p className="text-xs mt-1">Jab users ₹3,500/mo (40m) ya ₹2,500/mo (80m) lending plan activate karenge, yahan unke documents aur account number show honge.</p>
                </div>
              ) : (
                <div className="space-y-4">
                  {bonds.map((b) => {
                    const docs = b.documents || {};
                    const aadharFront = docs.aadharUrl || docs.doc1Url;
                    const aadharBack = docs.aadharBackUrl || docs.doc1BackUrl;
                    const panFront = docs.panUrl || docs.doc2Url;
                    const panBack = docs.panBackUrl || docs.doc2BackUrl;
                    const chequeFront = docs.chequeUrl;
                    const chequeBack = docs.chequeBackUrl;

                    return (
                      <div key={b._id} className="bg-white p-4 sm:p-6 rounded-2xl shadow-sm border border-gray-100 space-y-4">
                        {/* Header: User Info & Account Number */}
                        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-gray-100 pb-3">
                          <div className="flex items-center gap-3">
                            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-indigo-500 to-purple-600 text-white font-black flex items-center justify-center text-sm shadow-xs">
                              🤝
                            </div>
                            <div>
                              <div className="flex items-center gap-2 flex-wrap">
                                <h4 className="font-extrabold text-gray-900 text-base">{b.userId?.name || "Investor"}</h4>
                                <span className="bg-indigo-100 text-indigo-900 text-xs font-black font-mono px-2.5 py-0.5 rounded-full border border-indigo-200">
                                  A/C: {b.accountNumber || "EFS0000XXX"}
                                </span>
                                <span className={`px-2.5 py-0.5 rounded-full text-[11px] font-bold ${
                                  b.status === "active" ? "bg-emerald-100 text-emerald-800" :
                                  b.status === "matured" ? "bg-blue-100 text-blue-800" : "bg-gray-100 text-gray-700"
                                }`}>
                                  {b.status?.toUpperCase() || "ACTIVE"}
                                </span>
                              </div>
                              <p className="text-xs text-gray-500 mt-0.5">
                                📞 {b.userId?.phone || docs.applicantPhone || "N/A"} • ✉️ {b.userId?.email || docs.applicantEmail || "N/A"}
                              </p>
                            </div>
                          </div>
                          <div className="text-left sm:text-right text-xs text-gray-400">
                            <span>Started: {new Date(b.startDate || b.createdAt).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })}</span>
                          </div>
                        </div>

                        {/* Plan Stats Grid */}
                        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 bg-slate-50 p-3.5 rounded-xl text-xs">
                          <div>
                            <span className="text-gray-400 block font-medium">Plan</span>
                            <span className="font-bold text-gray-900 text-sm">{b.planName || (b.planId === "lending_80" ? "80 Months Plan" : "40 Months Plan")}</span>
                          </div>
                          <div>
                            <span className="text-gray-400 block font-medium">Principal Deposited</span>
                            <span className="font-bold text-gray-900 text-sm">₹{Number(b.principalAmount || 0).toLocaleString("en-IN")}</span>
                          </div>
                          <div>
                            <span className="text-gray-400 block font-medium">Monthly Payout</span>
                            <span className="font-extrabold text-emerald-700 text-sm">₹{Number(b.monthlyPayout || 0).toLocaleString("en-IN")}/mo</span>
                          </div>
                          <div>
                            <span className="text-gray-400 block font-medium">Payout Progress</span>
                            <span className="font-bold text-indigo-700 text-sm">{b.monthsPaid || 0} / {b.monthsTotal || 40} Months</span>
                          </div>
                        </div>

                        {/* Mandatory Submitted Documents Lightbox Buttons */}
                        <div className="p-3.5 bg-indigo-50/50 border border-indigo-100 rounded-xl space-y-2">
                          <div className="flex items-center justify-between text-xs font-bold text-indigo-950">
                            <span className="flex items-center gap-1.5">
                              <span>📄</span> Compulsory Documents (Aadhaar, PAN & Barrier Cheque)
                            </span>
                            {docs.driveLink && (
                              <a
                                href={docs.driveLink}
                                target="_blank"
                                rel="noreferrer"
                                className="text-[11px] font-bold text-blue-600 hover:text-blue-800 underline flex items-center gap-1"
                              >
                                <span>📁</span> Google Drive Folder
                              </a>
                            )}
                          </div>

                          <div className="flex flex-wrap gap-2 pt-1">
                            {aadharFront ? (
                              <button
                                type="button"
                                onClick={() => { setLightboxImg(aadharFront); setZoomLevel(1); }}
                                className="flex items-center gap-1 px-2.5 py-1.5 bg-white border border-indigo-200 rounded-lg text-xs font-bold text-indigo-800 hover:bg-indigo-50 shadow-2xs transition cursor-pointer"
                              >
                                🆔 Aadhaar Front 🔍
                              </button>
                            ) : (
                              <span className="text-xs text-rose-500 bg-rose-50 px-2 py-1 rounded">No Aadhaar Front</span>
                            )}
                            {aadharBack && (
                              <button
                                type="button"
                                onClick={() => { setLightboxImg(aadharBack); setZoomLevel(1); }}
                                className="flex items-center gap-1 px-2.5 py-1.5 bg-white border border-indigo-200 rounded-lg text-xs font-bold text-indigo-800 hover:bg-indigo-50 shadow-2xs transition cursor-pointer"
                              >
                                🆔 Aadhaar Back 🔍
                              </button>
                            )}

                            {panFront ? (
                              <button
                                type="button"
                                onClick={() => { setLightboxImg(panFront); setZoomLevel(1); }}
                                className="flex items-center gap-1 px-2.5 py-1.5 bg-white border border-indigo-200 rounded-lg text-xs font-bold text-indigo-800 hover:bg-indigo-50 shadow-2xs transition cursor-pointer"
                              >
                                💳 PAN Front 🔍
                              </button>
                            ) : (
                              <span className="text-xs text-rose-500 bg-rose-50 px-2 py-1 rounded">No PAN Front</span>
                            )}
                            {panBack && (
                              <button
                                type="button"
                                onClick={() => { setLightboxImg(panBack); setZoomLevel(1); }}
                                className="flex items-center gap-1 px-2.5 py-1.5 bg-white border border-indigo-200 rounded-lg text-xs font-bold text-indigo-800 hover:bg-indigo-50 shadow-2xs transition cursor-pointer"
                              >
                                💳 PAN Back 🔍
                              </button>
                            )}

                            {chequeFront ? (
                              <button
                                type="button"
                                onClick={() => { setLightboxImg(chequeFront); setZoomLevel(1); }}
                                className="flex items-center gap-1 px-2.5 py-1.5 bg-white border border-amber-300 rounded-lg text-xs font-bold text-amber-900 hover:bg-amber-50 shadow-2xs transition cursor-pointer"
                              >
                                📑 Barrier Cheque Front 🔍
                              </button>
                            ) : (
                              <span className="text-xs text-rose-500 bg-rose-50 px-2 py-1 rounded">No Cheque Front</span>
                            )}
                            {chequeBack && (
                              <button
                                type="button"
                                onClick={() => { setLightboxImg(chequeBack); setZoomLevel(1); }}
                                className="flex items-center gap-1 px-2.5 py-1.5 bg-white border border-amber-300 rounded-lg text-xs font-bold text-amber-900 hover:bg-amber-50 shadow-2xs transition cursor-pointer"
                              >
                                📑 Barrier Cheque Back 🔍
                              </button>
                            )}
                          </div>
                        </div>

                        {/* Banking, UPI & Nominee Details */}
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
                          {/* Bank & UPI */}
                          <div className="p-3 bg-gray-50 rounded-xl border border-gray-100 space-y-1.5">
                            <span className="font-black text-gray-800 flex items-center gap-1.5">
                              <span>🏦</span> Bank & UPI Payout Destination
                            </span>
                            <div className="grid grid-cols-2 gap-2 text-gray-700">
                              <div><span className="text-gray-400">Bank:</span> <strong className="font-semibold">{docs.bankName || "N/A"}</strong></div>
                              <div><span className="text-gray-400">A/C No:</span> <strong className="font-semibold font-mono">{docs.bankAccountNumber || "N/A"}</strong></div>
                              <div><span className="text-gray-400">IFSC:</span> <strong className="font-semibold font-mono">{docs.bankIfsc || "N/A"}</strong></div>
                              <div><span className="text-gray-400">UPI ID:</span> <strong className="font-semibold text-emerald-800">{docs.upiId || "N/A"}</strong></div>
                            </div>
                          </div>

                          {/* Nominee & Contact */}
                          <div className="p-3 bg-gray-50 rounded-xl border border-gray-100 space-y-1.5">
                            <span className="font-black text-gray-800 flex items-center gap-1.5">
                              <span>🛡️</span> Nominee & Applicant Contact
                            </span>
                            <div className="grid grid-cols-2 gap-2 text-gray-700">
                              <div><span className="text-gray-400">Nominee:</span> <strong className="font-semibold">{docs.nomineeName || "N/A"}</strong></div>
                              <div><span className="text-gray-400">Relation:</span> <strong className="font-semibold">{docs.nomineeRelation || "N/A"}</strong></div>
                              <div><span className="text-gray-400">Nominee Ph:</span> <strong className="font-semibold">{docs.nomineePhone || "N/A"}</strong></div>
                              <div><span className="text-gray-400">Applicant Ph:</span> <strong className="font-semibold">{docs.applicantPhone || b.userId?.phone || "N/A"}</strong></div>
                            </div>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {/* LIVE NOTIFICATIONS & ALERTS */}
          {tab === "alerts" && (
            <div className="space-y-4">
              <div className="flex items-center justify-between flex-wrap gap-3 bg-white p-4 sm:p-5 rounded-2xl shadow-sm border border-gray-100">
                <div>
                  <h3 className="text-lg font-bold font-display flex items-center gap-2">
                    <span>🔔</span> Real-Time Alerts & Loan Queries
                  </h3>
                  <p className="text-xs sm:text-sm text-gray-500">
                    Live updates via Server-Sent Events with audio sound chime on Chrome & Mobile!
                  </p>
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={playNotificationSound}
                    className="px-3 py-2 bg-indigo-50 text-indigo-700 hover:bg-indigo-100 rounded-xl text-xs font-bold transition flex items-center gap-1.5"
                  >
                    <span>🔊</span> Test Sound
                  </button>
                  <button
                    onClick={async () => {
                      await fetch(`${API}/admin/notifications/read-all`, { method: "PATCH", headers });
                      setUnreadNotifs(0);
                      loadNotifications();
                      showToast("All notifications marked read");
                    }}
                    className="px-3 py-2 bg-gray-100 text-gray-700 hover:bg-gray-200 rounded-xl text-xs font-semibold transition"
                  >
                    Mark All Read
                  </button>
                </div>
              </div>

              {notifications.length === 0 ? (
                <div className="bg-white rounded-2xl p-12 text-center text-gray-400 border border-gray-100">
                  <span className="text-4xl block mb-2">🔕</span>
                  <p className="font-semibold text-gray-600">No notifications yet</p>
                  <p className="text-xs mt-1">Naye user register karenge ya loan query bhejenge to live sound ke saath yahan aayega.</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {notifications.map((n, idx) => (
                    <div
                      key={n._id || idx}
                      className={`p-4 rounded-2xl border transition flex items-start justify-between gap-4 ${
                        n.read ? "bg-white border-gray-100" : "bg-blue-50/70 border-blue-200 shadow-sm"
                      }`}
                    >
                      <div className="flex gap-3 items-start">
                        <span className="text-2xl mt-0.5">
                          {n.type === "loan_query" ? "💰" : n.type === "new_user" ? "👤" : n.type === "loan_apply" ? "🏦" : "🔔"}
                        </span>
                        <div>
                          <div className="flex items-center gap-2">
                            <h4 className="font-bold text-sm text-gray-900">{n.title}</h4>
                            {!n.read && (
                              <span className="bg-blue-600 text-white text-[10px] font-bold px-1.5 py-0.5 rounded-full">
                                NEW
                              </span>
                            )}
                          </div>
                          <p className="text-sm text-gray-700 mt-1">{n.message}</p>
                          {n.data && Object.keys(n.data).length > 0 && (
                            <div className="mt-2 flex flex-wrap gap-2 text-xs">
                              {n.data.phone && (
                                <a
                                  href={`tel:${n.data.phone}`}
                                  className="px-2 py-1 bg-green-100 text-green-800 rounded-md font-semibold hover:underline"
                                >
                                  📞 Call: {n.data.phone}
                                </a>
                              )}
                              {n.data.email && (
                                <span className="px-2 py-1 bg-gray-100 text-gray-700 rounded-md">
                                  ✉️ {n.data.email}
                                </span>
                              )}
                              {n.data.amount && (
                                <span className="px-2 py-1 bg-indigo-100 text-indigo-800 rounded-md font-bold">
                                  ₹{n.data.amount}
                                </span>
                              )}
                            </div>
                          )}
                          <span className="text-[11px] text-gray-400 mt-2 block">
                            {n.createdAt ? new Date(n.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }) : "Just now"}
                          </span>
                        </div>
                      </div>
                      {!n.read && (
                        <button
                          onClick={async () => {
                            if (n._id) {
                              await fetch(`${API}/admin/notifications/${n._id}/read`, { method: "PATCH", headers });
                              loadNotifications();
                            }
                          }}
                          className="text-xs text-blue-600 hover:text-blue-800 font-semibold shrink-0"
                        >
                          Mark Read
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* SETTINGS */}
          {tab === "settings" && (
            <div className="space-y-6">
              {/* ADMIN DEPOSIT & UPI CREDENTIALS CONFIGURATION */}
              <div className="bg-white rounded-3xl shadow-sm p-6 sm:p-7 border border-gray-100">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-4 border-b border-gray-100 gap-2 mb-5">
                  <div>
                    <h3 className="text-lg font-black font-display text-gray-900 flex items-center gap-2">
                      <span>💳</span> Admin Deposit Credentials (UPI & Bank Details)
                    </h3>
                    <p className="text-xs text-gray-500">
                      Jab users app me "Add Money" pe click karenge, to unhe yahi UPI ID aur Bank details dikhai dengi. Payment verify karke aap "Pending" tab me Approve karenge.
                    </p>
                  </div>
                  <span className="text-[10px] font-bold px-3 py-1 rounded-full bg-emerald-100 text-emerald-800 shrink-0 self-start sm:self-auto">
                    Live Sync with App
                  </span>
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
                  {/* Form */}
                  <form onSubmit={saveDepositDetails} className="lg:col-span-7 space-y-4">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div>
                        <label className="text-xs font-bold text-gray-700 block mb-1">Admin UPI ID *</label>
                        <input
                          type="text"
                          required
                          value={depositDetails.upiId}
                          onChange={e => setDepositDetails({ ...depositDetails, upiId: e.target.value })}
                          placeholder="e.g. educafinance@upi ya phone@paytm"
                          className="w-full px-4 py-2.5 border border-gray-200 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none text-sm font-mono"
                        />
                      </div>
                      <div>
                        <label className="text-xs font-bold text-gray-700 block mb-1">UPI Receiver Name</label>
                        <input
                          type="text"
                          value={depositDetails.upiName}
                          onChange={e => setDepositDetails({ ...depositDetails, upiName: e.target.value })}
                          placeholder="e.g. Educa Finance & Payments"
                          className="w-full px-4 py-2.5 border border-gray-200 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none text-sm"
                        />
                      </div>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div>
                        <label className="text-xs font-bold text-gray-700 block mb-1">Bank Account Number *</label>
                        <input
                          type="text"
                          required
                          value={depositDetails.accountNumber}
                          onChange={e => setDepositDetails({ ...depositDetails, accountNumber: e.target.value })}
                          placeholder="e.g. 5010045239128"
                          className="w-full px-4 py-2.5 border border-gray-200 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none text-sm font-mono"
                        />
                      </div>
                      <div>
                        <label className="text-xs font-bold text-gray-700 block mb-1">IFSC Code *</label>
                        <input
                          type="text"
                          required
                          value={depositDetails.ifsc}
                          onChange={e => setDepositDetails({ ...depositDetails, ifsc: e.target.value.toUpperCase() })}
                          placeholder="e.g. BARB0JHALWA"
                          className="w-full px-4 py-2.5 border border-gray-200 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none text-sm font-mono uppercase"
                        />
                      </div>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div>
                        <label className="text-xs font-bold text-gray-700 block mb-1">Bank Name</label>
                        <input
                          type="text"
                          value={depositDetails.bankName}
                          onChange={e => setDepositDetails({ ...depositDetails, bankName: e.target.value })}
                          placeholder="e.g. Bank of Baroda"
                          className="w-full px-4 py-2.5 border border-gray-200 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none text-sm"
                        />
                      </div>
                      <div>
                        <label className="text-xs font-bold text-gray-700 block mb-1">Branch Name</label>
                        <input
                          type="text"
                          value={depositDetails.branch}
                          onChange={e => setDepositDetails({ ...depositDetails, branch: e.target.value })}
                          placeholder="e.g. Jhalwa Branch, Prayagraj"
                          className="w-full px-4 py-2.5 border border-gray-200 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none text-sm"
                        />
                      </div>
                    </div>

                    <div>
                      <label className="text-xs font-bold text-gray-700 block mb-1">Account Holder / Beneficiary Name</label>
                      <input
                        type="text"
                        value={depositDetails.accountHolder}
                        onChange={e => setDepositDetails({ ...depositDetails, accountHolder: e.target.value })}
                        placeholder="e.g. Educa Fintech Admin"
                        className="w-full px-4 py-2.5 border border-gray-200 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none text-sm"
                      />
                    </div>

                    <div>
                      <label className="text-xs font-bold text-gray-700 block mb-1">Customer Deposit Instructions</label>
                      <textarea
                        rows={2}
                        value={depositDetails.instructions}
                        onChange={e => setDepositDetails({ ...depositDetails, instructions: e.target.value })}
                        placeholder="e.g. Payment complete karne ke baad 12-digit UTR number enter karein."
                        className="w-full px-4 py-2.5 border border-gray-200 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none text-sm"
                      />
                    </div>

                    <button
                      type="submit"
                      disabled={savingDepositDetails}
                      className="px-6 py-3 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700 text-white rounded-xl font-bold text-sm shadow-md transition active:scale-95 flex items-center gap-2"
                    >
                      <span>{savingDepositDetails ? "⏳" : "💾"}</span>
                      <span>{savingDepositDetails ? "Saving Details..." : "Save Deposit Credentials"}</span>
                    </button>
                  </form>

                  {/* Live Mobile App Preview */}
                  <div className="lg:col-span-5 bg-slate-900 text-white rounded-2xl p-4.5 border border-slate-700 shadow-md space-y-3 self-start">
                    <div className="flex items-center justify-between pb-2 border-b border-white/10">
                      <p className="text-[10px] font-black uppercase tracking-wider text-indigo-400">📱 Live Customer App Preview</p>
                      <span className="text-[9px] px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 font-bold">
                        Add Money Sheet
                      </span>
                    </div>

                    <div className="space-y-2">
                      <div className="bg-white/10 rounded-xl p-3 space-y-1">
                        <p className="text-[10px] text-gray-400 uppercase">UPI Payment</p>
                        <p className="font-mono font-bold text-sm text-cyan-300 truncate">{depositDetails.upiId || "admin@upi"}</p>
                        <p className="text-[11px] text-gray-300">{depositDetails.upiName || "Educa Finance"}</p>
                      </div>

                      <div className="bg-white/10 rounded-xl p-3 space-y-1 text-xs">
                        <p className="text-[10px] text-gray-400 uppercase">Bank Transfer</p>
                        <div className="flex justify-between">
                          <span className="text-gray-400 text-[11px]">Bank:</span>
                          <span className="font-bold text-white">{depositDetails.bankName || "Bank of Baroda"}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-gray-400 text-[11px]">A/C No:</span>
                          <span className="font-mono font-bold text-cyan-300">{depositDetails.accountNumber || "1234567890"}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-gray-400 text-[11px]">IFSC:</span>
                          <span className="font-mono font-bold text-white">{depositDetails.ifsc || "BARB0JHALWA"}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-gray-400 text-[11px]">Branch:</span>
                          <span className="text-white">{depositDetails.branch || "Jhalwa"}</span>
                        </div>
                      </div>
                    </div>

                    <p className="text-[10px] text-indigo-200 leading-relaxed italic">
                      "Customer is detail par payment karega, receipt ka UTR daalega, aur aap 'Pending' tab me Approve karenge."
                    </p>
                  </div>
                </div>
              </div>

              {/* Interest Rate */}
              <div className="bg-white rounded-2xl shadow-sm p-5 sm:p-6 border border-gray-100">
                <h3 className="text-lg font-bold font-display mb-1">📈 Loan Interest Rate</h3>
                <p className="text-sm text-gray-500 mb-5">Sirf <strong>naye loans</strong> affect honge. Purane loans ka rate kabhi nahi badlega.</p>
                <div className="flex items-center gap-6 mb-5 flex-wrap">
                  <div className="bg-indigo-50 border border-indigo-200 rounded-xl px-6 py-4 text-center">
                    <p className="text-xs text-gray-500">Current Rate</p>
                    <p className="text-3xl font-black font-display text-indigo-600">{interestRate}%</p>
                    <p className="text-xs text-gray-400">per annum</p>
                  </div>
                </div>
                <div className="flex gap-3 max-w-sm">
                  <input type="number" inputMode="decimal" min="1" max="100" step="0.5" value={newInterestRate} onChange={e => setNewInterestRate(e.target.value)} placeholder="Naya rate daalo" className="flex-1 px-4 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none text-base sm:text-sm" />
                  <span className="flex items-center text-gray-500 font-bold">%</span>
                  <button onClick={updateInterestRate} className="px-5 py-3 bg-indigo-600 text-white rounded-xl font-bold text-sm hover:bg-indigo-700 transition">Update</button>
                </div>
              </div>


              {/* Google Drive Integration */}
              <div className="bg-white rounded-2xl shadow-sm p-5 sm:p-6 border border-gray-100">
                <div className="flex items-center justify-between mb-1">
                  <h3 className="text-lg font-bold font-display flex items-center gap-2 text-gray-900">
                    <span>📁</span> Google Drive KYC Integration
                  </h3>
                  <span className="text-[10px] font-bold px-2.5 py-0.5 rounded-full bg-emerald-100 text-emerald-800">
                    Cloud Auto-Sync
                  </span>
                </div>
                <p className="text-sm text-gray-500 mb-4">
                  Apne Google Drive folder ka link ya Apps Script Webhook URL enter karein. Sabhi user KYC documents yahan auto-link rahenge.
                </p>

                <div className="mb-4 p-3 bg-blue-50 border border-blue-200 rounded-xl text-xs text-blue-900 space-y-1">
                  <p className="font-bold">Active Drive Link / Webhook:</p>
                  <p className="font-mono text-[11px] truncate">
                    {googleDriveUrl || "Koi link set nahi hai (Currently using In-App Direct Storage)"}
                  </p>
                </div>

                <div className="space-y-3 max-w-lg">
                  <input
                    type="url"
                    value={newGoogleDriveUrl}
                    onChange={e => setNewGoogleDriveUrl(e.target.value)}
                    placeholder="https://drive.google.com/drive/folders/... ya Apps Script URL"
                    className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none text-sm"
                  />
                  <div className="flex items-center gap-3">
                    <button
                      onClick={updateGoogleDriveUrl}
                      className="px-5 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-bold text-xs shadow-md shadow-blue-500/20 active:scale-95 transition"
                    >
                      Save Drive Link
                    </button>
                    {googleDriveUrl && (
                      <a
                        href={googleDriveUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="px-4 py-2.5 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-xl font-bold text-xs transition"
                      >
                        Open Drive ↗
                      </a>
                    )}
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* IN-APP KYC DOCUMENT VIEWER MODAL */}
      {previewKycUser && (
        <div
          className="fixed inset-0 z-[9999] flex items-center justify-center p-3 sm:p-5 bg-black/80 backdrop-blur-sm animate-fadeIn"
          onClick={() => setPreviewKycUser(null)}
        >
          <div
            className="bg-white rounded-3xl max-w-2xl w-full p-5 sm:p-6 shadow-2xl border border-gray-200 flex flex-col max-h-[92vh] overflow-hidden text-gray-900"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div className="flex items-center justify-between border-b border-gray-100 pb-3 mb-4 shrink-0">
              <div>
                <h3 className="font-black text-lg text-gray-900 flex items-center gap-2">
                  <span>📄</span> KYC Verification: {previewKycUser.name}
                </h3>
                <p className="text-xs text-gray-500">
                  {previewKycUser.email} · {previewKycUser.phone}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setPreviewKycUser(null)}
                className="w-8 h-8 rounded-full bg-gray-100 hover:bg-gray-200 text-gray-600 flex items-center justify-center transition text-sm font-bold cursor-pointer"
              >
                ✕
              </button>
            </div>

            {/* Content Scrollable */}
            <div className="flex-1 overflow-y-auto space-y-4 pr-1">
              {/* Details Grid */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 text-xs bg-gray-50 p-3 rounded-2xl border border-gray-200">
                <div>
                  <span className="text-gray-400 font-semibold block text-[10px]">DOC 1 (PRIMARY ID)</span>
                  <span className="font-bold text-blue-700 uppercase">Aadhaar Card</span>
                </div>
                <div>
                  <span className="text-gray-400 font-semibold block text-[10px]">AADHAAR NUMBER</span>
                  <span className="font-mono font-bold text-gray-900">
                    {previewKycUser.kycDocuments?.aadharNumber || previewKycUser.aadharNumber || "—"}
                  </span>
                </div>
                <div>
                  <span className="text-gray-400 font-semibold block text-[10px]">NAAM (AADHAAR PE)</span>
                  <span className="font-bold text-gray-900">
                    {previewKycUser.kycDocuments?.aadhaarName || "—"}
                  </span>
                </div>
                <div>
                  <span className="text-gray-400 font-semibold block text-[10px]">AADHAAR PHONE</span>
                  <span className="font-mono font-bold text-gray-900">
                    {previewKycUser.kycDocuments?.aadhaarPhone || "—"}
                  </span>
                </div>
                <div>
                  <span className="text-gray-400 font-semibold block text-[10px]">DOC 2 (FINANCIAL)</span>
                  <span className="font-bold text-indigo-700 uppercase">
                    {previewKycUser.kycDocuments?.doc2Type === "cheque" ? "Bank Cheque" : "PAN Card"}
                  </span>
                </div>
                <div>
                  <span className="text-gray-400 font-semibold block text-[10px]">
                    {previewKycUser.kycDocuments?.doc2Type === "cheque" ? "CHEQUE / ACC NO." : "PAN NUMBER"}
                  </span>
                  <span className="font-mono font-bold text-gray-900 uppercase">
                    {previewKycUser.kycDocuments?.doc2Type === "cheque"
                      ? (previewKycUser.kycDocuments?.chequeNumber || "—")
                      : (previewKycUser.kycDocuments?.panNumber || "—")}
                  </span>
                </div>
                <div className="col-span-2">
                  <span className="text-gray-400 font-semibold block text-[10px]">AADHAAR ADDRESS</span>
                  <span className="font-semibold text-gray-800 text-xs">
                    {previewKycUser.kycDocuments?.address || previewKycUser.address || "Not Provided"}
                  </span>
                </div>
                <div>
                  <span className="text-gray-400 font-semibold block text-[10px]">STATUS</span>
                  <span className={`inline-block px-2 py-0.5 rounded-full font-bold text-[10px] uppercase ${
                    previewKycUser.kycStatus === "verified"
                      ? "bg-emerald-100 text-emerald-800"
                      : previewKycUser.kycStatus === "pending"
                      ? "bg-amber-100 text-amber-800"
                      : "bg-rose-100 text-rose-800"
                  }`}>
                    {previewKycUser.kycStatus}
                  </span>
                </div>
              </div>


              {/* Secure Document Vault Status */}
              <div className="p-3 bg-slate-50 border border-slate-200 rounded-2xl flex items-center justify-between text-xs">
                <div className="flex items-center gap-2">
                  <span className="text-base">🔒</span>
                  <span className="font-bold text-slate-800">Submitted Documents Vault:</span>
                  <span className="text-slate-600 text-[11px]">Directly stored & permanently locked (tamper-proof)</span>
                </div>
                <span className="px-2.5 py-0.5 rounded-full text-[10px] font-extrabold bg-emerald-100 text-emerald-800 uppercase tracking-wide">
                  Encrypted
                </span>
              </div>

              {/* Dual In-App Document Previews (Doc 1 & Doc 2 - Front & Back) */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {/* Document 1: Aadhaar Card (Front & Back) */}
                <div className="space-y-2 p-3 bg-gray-50 border border-gray-200 rounded-2xl">
                  <span className="text-xs font-bold text-blue-900 block flex items-center justify-between">
                    <span className="flex items-center gap-1.5">
                      <span>🆔</span> Doc 1: Aadhaar Card
                    </span>
                    <span className="text-[10px] text-blue-600 font-semibold">Front & Back</span>
                  </span>

                  {/* Front */}
                  {(() => {
                    const doc1Front = previewKycUser.kycDocuments?.doc1Url || previewKycUser.kycDocuments?.docUrl;
                    const isPdf = typeof doc1Front === "string" && (doc1Front.startsWith("data:application/pdf") || doc1Front.toLowerCase().includes(".pdf"));
                    return doc1Front ? (
                      <div className="space-y-1">
                        <span className="text-[10px] font-bold text-gray-500 uppercase tracking-wider block">Front Side</span>
                        <div className="bg-white rounded-xl p-1.5 border border-gray-200 overflow-hidden relative group">
                          {isPdf ? (
                            <iframe
                              src={doc1Front}
                              title="Aadhaar Front PDF Preview"
                              className="w-full h-[160px] rounded-lg border border-gray-200"
                            />
                          ) : (
                            <img
                              src={doc1Front}
                              alt="Aadhaar Front Preview"
                              className="max-h-[160px] max-w-full object-contain rounded-lg shadow-2xs cursor-zoom-in w-full"
                              onClick={() => { setLightboxImg(doc1Front); setZoomLevel(1); }}
                            />
                          )}
                          <div className="absolute bottom-1 right-1 bg-black/50 text-white text-[10px] px-1.5 py-0.5 rounded-full opacity-0 group-hover:opacity-100 transition pointer-events-none">🔍 Zoom Front</div>
                        </div>
                      </div>
                    ) : (
                      <div className="p-4 text-center text-xs text-gray-400">No Aadhaar Front file</div>
                    );
                  })()}

                  {/* Back */}
                  {(() => {
                    const doc1Back = previewKycUser.kycDocuments?.doc1BackUrl;
                    const isPdf = typeof doc1Back === "string" && (doc1Back.startsWith("data:application/pdf") || doc1Back.toLowerCase().includes(".pdf"));
                    return doc1Back ? (
                      <div className="space-y-1 pt-1.5 border-t border-gray-200/60">
                        <span className="text-[10px] font-bold text-gray-500 uppercase tracking-wider block">Back Side</span>
                        <div className="bg-white rounded-xl p-1.5 border border-gray-200 overflow-hidden relative group">
                          {isPdf ? (
                            <iframe
                              src={doc1Back}
                              title="Aadhaar Back PDF Preview"
                              className="w-full h-[160px] rounded-lg border border-gray-200"
                            />
                          ) : (
                            <img
                              src={doc1Back}
                              alt="Aadhaar Back Preview"
                              className="max-h-[160px] max-w-full object-contain rounded-lg shadow-2xs cursor-zoom-in w-full"
                              onClick={() => { setLightboxImg(doc1Back); setZoomLevel(1); }}
                            />
                          )}
                          <div className="absolute bottom-1 right-1 bg-black/50 text-white text-[10px] px-1.5 py-0.5 rounded-full opacity-0 group-hover:opacity-100 transition pointer-events-none">🔍 Zoom Back</div>
                        </div>
                      </div>
                    ) : null;
                  })()}
                </div>

                {/* Document 2: PAN or Cheque (Front & Back) */}
                <div className="space-y-2 p-3 bg-gray-50 border border-gray-200 rounded-2xl">
                  <span className="text-xs font-bold text-indigo-900 block flex items-center justify-between">
                    <span className="flex items-center gap-1.5">
                      <span>💳</span> Doc 2: {previewKycUser.kycDocuments?.doc2Type === "cheque" ? "Bank Cheque" : "PAN Card"}
                    </span>
                    <span className="text-[10px] text-indigo-600 font-semibold">Front & Back</span>
                  </span>

                  {/* Front */}
                  {(() => {
                    const doc2Front = previewKycUser.kycDocuments?.doc2Url;
                    const isPdf = typeof doc2Front === "string" && (doc2Front.startsWith("data:application/pdf") || doc2Front.toLowerCase().includes(".pdf"));
                    return doc2Front ? (
                      <div className="space-y-1">
                        <span className="text-[10px] font-bold text-gray-500 uppercase tracking-wider block">Front Side</span>
                        <div className="bg-white rounded-xl p-1.5 border border-gray-200 overflow-hidden relative group">
                          {isPdf ? (
                            <iframe
                              src={doc2Front}
                              title="Doc 2 Front PDF Preview"
                              className="w-full h-[160px] rounded-lg border border-gray-200"
                            />
                          ) : (
                            <img
                              src={doc2Front}
                              alt="Doc 2 Front Preview"
                              className="max-h-[160px] max-w-full object-contain rounded-lg shadow-2xs cursor-zoom-in w-full"
                              onClick={() => { setLightboxImg(doc2Front); setZoomLevel(1); }}
                            />
                          )}
                          <div className="absolute bottom-1 right-1 bg-black/50 text-white text-[10px] px-1.5 py-0.5 rounded-full opacity-0 group-hover:opacity-100 transition pointer-events-none">🔍 Zoom Front</div>
                        </div>
                      </div>
                    ) : (
                      <div className="p-4 text-center text-xs text-gray-400">No Doc 2 Front file uploaded</div>
                    );
                  })()}

                  {/* Back */}
                  {(() => {
                    const doc2Back = previewKycUser.kycDocuments?.doc2BackUrl;
                    const isPdf = typeof doc2Back === "string" && (doc2Back.startsWith("data:application/pdf") || doc2Back.toLowerCase().includes(".pdf"));
                    return doc2Back ? (
                      <div className="space-y-1 pt-1.5 border-t border-gray-200/60">
                        <span className="text-[10px] font-bold text-gray-500 uppercase tracking-wider block">Back Side</span>
                        <div className="bg-white rounded-xl p-1.5 border border-gray-200 overflow-hidden relative group">
                          {isPdf ? (
                            <iframe
                              src={doc2Back}
                              title="Doc 2 Back PDF Preview"
                              className="w-full h-[160px] rounded-lg border border-gray-200"
                            />
                          ) : (
                            <img
                              src={doc2Back}
                              alt="Doc 2 Back Preview"
                              className="max-h-[160px] max-w-full object-contain rounded-lg shadow-2xs cursor-zoom-in w-full"
                              onClick={() => { setLightboxImg(doc2Back); setZoomLevel(1); }}
                            />
                          )}
                          <div className="absolute bottom-1 right-1 bg-black/50 text-white text-[10px] px-1.5 py-0.5 rounded-full opacity-0 group-hover:opacity-100 transition pointer-events-none">🔍 Zoom Back</div>
                        </div>
                      </div>
                    ) : null;
                  })()}
                </div>

              </div>

              {/* Admin Review Remarks Input Box */}
              <div className="space-y-1.5 pt-2 border-t border-gray-100">
                <label className="text-xs font-bold text-gray-800 flex items-center justify-between">
                  <span className="flex items-center gap-1.5">
                    <span>Admin Review Remarks / Verification Note:</span>
                    {(previewKycUser.kycStatus === "verified" || previewKycUser.kycStatus === "rejected" || previewKycUser.kycDocuments?.isNoteLocked) && (
                      <span className="text-[10px] px-2 py-0.5 rounded-full bg-amber-100 text-amber-800 font-extrabold flex items-center gap-1 border border-amber-200">
                        🔒 Note Locked (Decision Finalized)
                      </span>
                    )}
                  </span>
                  <span className="text-[10px] text-gray-400">
                    {(previewKycUser.kycStatus === "verified" || previewKycUser.kycStatus === "rejected" || previewKycUser.kycDocuments?.isNoteLocked)
                      ? "Non-editable / Permanent"
                      : "Written to user record"}
                  </span>
                </label>
                <textarea
                  rows={2}
                  value={kycReviewRemarks}
                  onChange={(e) => setKycReviewRemarks(e.target.value)}
                  disabled={previewKycUser.kycStatus === "verified" || previewKycUser.kycStatus === "rejected" || previewKycUser.kycDocuments?.isNoteLocked}
                  readOnly={previewKycUser.kycStatus === "verified" || previewKycUser.kycStatus === "rejected" || previewKycUser.kycDocuments?.isNoteLocked}
                  placeholder="Enter remarks (e.g. Both Aadhaar & PAN details verified & matched with photo)..."
                  className={`w-full p-2.5 rounded-xl text-xs font-medium outline-none transition ${
                    (previewKycUser.kycStatus === "verified" || previewKycUser.kycStatus === "rejected" || previewKycUser.kycDocuments?.isNoteLocked)
                      ? "bg-gray-100 text-gray-700 border border-gray-300 cursor-not-allowed select-text font-semibold shadow-inner"
                      : "bg-gray-50 border border-gray-200 text-gray-800 placeholder-gray-400 focus:ring-2 focus:ring-indigo-500"
                  }`}
                />
              </div>
            </div>

            {/* Bottom Action Footer */}
            <div className="flex items-center justify-end gap-2.5 border-t border-gray-100 pt-3 mt-4 shrink-0">
              <button
                onClick={() => setPreviewKycUser(null)}
                className="px-4 py-2.5 rounded-xl border border-gray-200 text-gray-700 hover:bg-gray-100 text-xs font-bold transition cursor-pointer"
              >
                Close
              </button>
              {previewKycUser.kycStatus === "pending" ? (
                <>
                  <button
                    onClick={async () => {
                      await rejectKyc(previewKycUser._id, kycReviewRemarks);
                      setPreviewKycUser(null);
                    }}
                    className="px-4 py-2.5 rounded-xl bg-rose-50 text-rose-700 border border-rose-200 hover:bg-rose-100 text-xs font-bold transition cursor-pointer active:scale-95"
                  >
                    ✕ Reject with Note
                  </button>
                  <button
                    onClick={async () => {
                      await approveKyc(previewKycUser._id, kycReviewRemarks);
                      setPreviewKycUser(null);
                    }}
                    className="px-5 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold shadow-md shadow-emerald-500/20 transition cursor-pointer active:scale-95"
                  >
                    ✓ Approve with Note
                  </button>
                </>
              ) : previewKycUser.kycStatus === "rejected" ? (
                <span className="px-4 py-2.5 rounded-xl bg-rose-50 text-rose-700 border border-rose-200 text-xs font-bold select-none flex items-center gap-1.5">
                  <span>🔒</span> KYC Rejected — Note Locked
                </span>
              ) : previewKycUser.kycStatus === "verified" ? (
                <span className="px-4 py-2.5 rounded-xl bg-emerald-50 text-emerald-700 border border-emerald-200 text-xs font-bold select-none flex items-center gap-1.5">
                  <span>🔒</span> KYC Verified — Note Locked
                </span>
              ) : null}
            </div>
          </div>
        </div>
      )}

      {/* ADMIN OFFLINE INSTALLMENT PAYMENT MODAL */}
      {adminPayModal && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-md w-full p-5 sm:p-6 shadow-2xl border border-gray-100 animate-in fade-in zoom-in-95 duration-150 space-y-4">
            <div className="flex items-center justify-between border-b border-gray-100 pb-3">
              <div className="flex items-center gap-2">
                <span className="text-xl">⚡</span>
                <h3 className="font-extrabold text-base text-gray-900">
                  Mark Installment #{adminPayModal.installmentNo} as Paid
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setAdminPayModal(null)}
                className="w-8 h-8 rounded-full bg-gray-100 hover:bg-gray-200 text-gray-600 flex items-center justify-center text-sm font-bold cursor-pointer"
              >
                ✕
              </button>
            </div>

            <div className="p-3 bg-blue-50 border border-blue-200 rounded-2xl text-xs text-blue-900 space-y-1">
              <p className="font-bold">Installment Amount: ₹{adminPayModal.amount}</p>
              <p className="text-[11px] text-blue-700">
                Admin override: Use this if user has paid offline, in cash, or directly via bank transfer. This will mark the installment PAID, deduct dues from user's account, and create an auditable transaction record.
              </p>
            </div>

            <div className="space-y-3 text-xs">
              <div>
                <label className="block font-bold text-gray-700 mb-1">
                  Offline Evidence / Verification Note <span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  placeholder="e.g. Received in cash at branch / Verified via bank statement"
                  value={adminPayModal.evidenceNote || ""}
                  onChange={(e) => setAdminPayModal({ ...adminPayModal, evidenceNote: e.target.value })}
                  className="w-full p-2.5 bg-gray-50 border border-gray-200 rounded-xl text-xs outline-none focus:ring-2 focus:ring-blue-500 font-medium"
                />
              </div>

              <div>
                <label className="block font-bold text-gray-700 mb-1">
                  Offline UTR / Transaction Ref (Optional)
                </label>
                <input
                  type="text"
                  placeholder="e.g. CASH_OFFLINE or UPI / IMPS Ref ID"
                  value={adminPayModal.utrNumber || ""}
                  onChange={(e) => setAdminPayModal({ ...adminPayModal, utrNumber: e.target.value })}
                  className="w-full p-2.5 bg-gray-50 border border-gray-200 rounded-xl text-xs outline-none focus:ring-2 focus:ring-blue-500 font-medium font-mono"
                />
              </div>
            </div>

            <div className="flex gap-2.5 pt-2 border-t border-gray-100">
              <button
                type="button"
                onClick={() => setAdminPayModal(null)}
                className="flex-1 py-2.5 rounded-xl border border-gray-200 text-gray-700 hover:bg-gray-100 text-xs font-bold transition cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={adminPayLoading}
                onClick={submitAdminPay}
                className="flex-1 py-2.5 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700 text-white text-xs font-bold shadow-md shadow-emerald-500/20 transition cursor-pointer disabled:opacity-50"
              >
                {adminPayLoading ? "Saving..." : "Confirm & Mark Paid →"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* LOAN APPROVAL & DISBURSAL MODAL WITH 1ST INSTALLMENT OPTIONS */}
      {loanApproveModal && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4">
          <div className="bg-white rounded-3xl max-w-lg w-full p-4 sm:p-6 shadow-2xl border border-gray-100 animate-in fade-in zoom-in-95 duration-150 space-y-3.5 max-h-[92vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b border-gray-100 pb-2.5">
              <div className="flex items-center gap-2">
                <span className="text-xl">🏦</span>
                <div>
                  <h3 className="font-extrabold text-sm sm:text-base text-gray-900 leading-tight">
                    Approve & Disburse Loan
                  </h3>
                  <p className="text-[11px] text-gray-500 font-medium">
                    Account: <span className="font-bold font-mono text-indigo-700">{loanApproveModal.accountNumber || "Loan"}</span>
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setLoanApproveModal(null)}
                className="w-8 h-8 rounded-full bg-gray-100 hover:bg-gray-200 text-gray-600 flex items-center justify-center text-sm font-bold cursor-pointer"
              >
                ✕
              </button>
            </div>

            <div className="grid grid-cols-2 gap-2 text-xs">
              <div className="p-2 sm:p-2.5 bg-gray-50 rounded-xl">
                <span className="text-gray-400 block text-[10px]">Sanctioned Amount</span>
                <span className="font-black text-gray-900 text-xs sm:text-sm">₹{loanApproveModal.amount?.toLocaleString("en-IN")}</span>
              </div>
              <div className="p-2 sm:p-2.5 bg-gray-50 rounded-xl">
                <span className="text-gray-400 block text-[10px]">Installments</span>
                <span className="font-black text-blue-700 text-xs sm:text-sm">{loanApproveModal.installmentsCount || loanApproveModal.dailyTenureDays} Kist</span>
              </div>
              <div className="p-2 sm:p-2.5 bg-gray-50 rounded-xl">
                <span className="text-gray-400 block text-[10px]">Processing + UPI Fee</span>
                <span className="font-black text-amber-700 text-xs">₹{(loanApproveModal.processingFee || 0) + (loanApproveModal.upiCharges || 0)}</span>
              </div>
              <div className="p-2 sm:p-2.5 bg-gray-50 rounded-xl">
                <span className="text-gray-400 block text-[10px]">Per Installment</span>
                <span className="font-black text-emerald-700 text-xs">₹{loanApproveModal.installmentAmount || loanApproveModal.emiAmount || 0}</span>
              </div>
            </div>

            {/* 1st Installment Option (Admin Discretion) */}
            <div className="space-y-2 pt-1 border-t border-gray-100">
              <label className="block text-xs font-bold text-gray-800">
                1st Installment Decision (Admin Option)
              </label>

              <div className="space-y-2 text-xs">
                {/* Option 1: Skip upfront deduction (Default - Pehli Installment NA lein) */}
                <label className={`flex items-start gap-2.5 sm:gap-3 p-3 sm:p-3.5 rounded-2xl border-2 cursor-pointer transition ${
                  advanceOption === "none"
                    ? "bg-emerald-50/90 border-emerald-500 ring-2 ring-emerald-300 shadow-xs"
                    : "bg-white border-gray-200 hover:bg-gray-50"
                }`}>
                  <input
                    type="radio"
                    name="advanceOption"
                    value="none"
                    checked={advanceOption === "none"}
                    onChange={() => setAdvanceOption("none")}
                    className="mt-1 text-emerald-600 cursor-pointer accent-emerald-600"
                  />
                  <div className="flex-1 min-w-0">
                    <div className="font-extrabold text-emerald-950 flex items-center justify-between gap-1">
                      <span className="text-xs">🟢 Pehli Installment NA lein</span>
                      <span className="text-[9px] sm:text-[10px] bg-emerald-200 text-emerald-900 px-1.5 sm:px-2 py-0.5 rounded-full font-black shrink-0 whitespace-nowrap">RECOMMENDED</span>
                    </div>
                    <p className="text-[11px] text-gray-700 mt-1 font-medium">
                      Borrower ko seedha milega: <strong className="text-emerald-700 font-extrabold text-xs">₹{Math.max(0, loanApproveModal.amount - (loanApproveModal.processingFee || 0) - (loanApproveModal.upiCharges || 0)).toLocaleString("en-IN")}</strong>
                    </p>
                    <p className="text-[10px] text-emerald-700 mt-0.5">
                      ✓ Kist #1 baad me regular date par pending rahegi.
                    </p>
                  </div>
                </label>

                {/* Option 2: Deduct advance */}
                <label className={`flex items-start gap-2.5 sm:gap-3 p-3 sm:p-3.5 rounded-2xl border-2 cursor-pointer transition ${
                  advanceOption === "deduct"
                    ? "bg-amber-50/90 border-amber-500 ring-2 ring-amber-300 shadow-xs"
                    : "bg-white border-gray-200 hover:bg-gray-50"
                }`}>
                  <input
                    type="radio"
                    name="advanceOption"
                    value="deduct"
                    checked={advanceOption === "deduct"}
                    onChange={() => setAdvanceOption("deduct")}
                    className="mt-1 text-amber-600 cursor-pointer accent-amber-600"
                  />
                  <div className="flex-1 min-w-0">
                    <div className="font-extrabold text-amber-950 flex items-center justify-between gap-1">
                      <span className="text-xs">🟡 Advance Kaatein</span>
                      <span className="text-[9px] sm:text-[10px] bg-amber-200 text-amber-900 px-1.5 sm:px-2 py-0.5 rounded-full font-black shrink-0 whitespace-nowrap">ADVANCE CUT</span>
                    </div>
                    <p className="text-[11px] text-gray-700 mt-1 font-medium">
                      Net Disburse: <strong className="text-amber-800 font-extrabold text-xs">₹{Math.max(0, loanApproveModal.amount - (loanApproveModal.processingFee || 0) - (loanApproveModal.upiCharges || 0) - (loanApproveModal.installmentAmount || loanApproveModal.emiAmount || 0)).toLocaleString("en-IN")}</strong>
                    </p>
                    <p className="text-[10px] text-amber-700 mt-0.5">
                      ✓ Kist #1 (₹{loanApproveModal.installmentAmount || loanApproveModal.emiAmount || 0}) abhi turant 'Paid' mark ho jayegi.
                    </p>
                  </div>
                </label>

                {/* Option 3: Waive 1st installment */}
                <label className={`flex items-start gap-2.5 sm:gap-3 p-3 sm:p-3.5 rounded-2xl border-2 cursor-pointer transition ${
                  advanceOption === "waive"
                    ? "bg-purple-50/90 border-purple-500 ring-2 ring-purple-300 shadow-xs"
                    : "bg-white border-gray-200 hover:bg-gray-50"
                }`}>
                  <input
                    type="radio"
                    name="advanceOption"
                    value="waive"
                    checked={advanceOption === "waive"}
                    onChange={() => setAdvanceOption("waive")}
                    className="mt-1 text-purple-600 cursor-pointer accent-purple-600"
                  />
                  <div className="flex-1 min-w-0">
                    <div className="font-extrabold text-purple-950 flex items-center justify-between gap-1">
                      <span className="text-xs">🟣 Waive / Maaf Karein</span>
                      <span className="text-[9px] sm:text-[10px] bg-purple-200 text-purple-900 px-1.5 sm:px-2 py-0.5 rounded-full font-black shrink-0 whitespace-nowrap">WAIVER</span>
                    </div>
                    <p className="text-[11px] text-gray-700 mt-1 font-medium">
                      Net Disburse: <strong className="text-purple-700 font-extrabold text-xs">₹{Math.max(0, loanApproveModal.amount - (loanApproveModal.processingFee || 0) - (loanApproveModal.upiCharges || 0)).toLocaleString("en-IN")}</strong>
                    </p>
                    <p className="text-[10px] text-purple-700 mt-0.5">
                      ✓ Kist #1 free me 'Paid' ho jayegi.
                    </p>
                  </div>
                </label>
              </div>
            </div>

            <div className="flex gap-2.5 pt-2 border-t border-gray-100">
              <button
                type="button"
                onClick={() => setLoanApproveModal(null)}
                className="flex-1 py-3 rounded-xl border border-gray-200 text-gray-700 hover:bg-gray-100 text-xs font-bold transition active:scale-95 cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={loanApproveLoading}
                onClick={() => {
                  triggerAdminHeroFly("modal_confirm");
                  submitApproveLoan();
                }}
                className="relative overflow-visible flex-1 py-3 rounded-xl bg-gradient-to-r from-emerald-600 via-teal-600 to-indigo-600 hover:from-emerald-700 hover:to-indigo-700 text-white text-xs font-black shadow-md shadow-emerald-500/20 active:scale-95 transition cursor-pointer disabled:opacity-50 flex items-center justify-center gap-2"
              >
                {adminHeroFlyId === "modal_confirm" && <AdminLoanHeroFlyBadge />}
                {loanApproveLoading ? (
                  <>
                    <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    <span>Disbursing Funds...</span>
                  </>
                ) : (
                  <span>Confirm & Disburse Funds →</span>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      <Toast msg={toast} onHide={() => setToast({ text: "", type: "" })} />
    </div>
  );
}
