import { useState, useEffect, useCallback } from "react";
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
  const [stats, setStats] = useState({});
  const [loadingStats, setLoadingStats] = useState(true);
  const [pending, setPending] = useState([]);
  const [agents, setAgents] = useState([]);
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
  const [analytics, setAnalytics] = useState(null);
  const [loadingAnalytics, setLoadingAnalytics] = useState(true);
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
    try { const res = await fetch(`${API}/admin/stats`, { headers }); setStats(await res.json()); } catch {}
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
    try { const res = await fetch(`${API}/admin/users`, { headers }); const d = await res.json(); setUsers(Array.isArray(d) ? d.filter(u => u.role === "user") : []); } catch {}
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

  const approveAgent = async (id) => {
    try {
      const res = await fetch(`${API}/admin/agent-applications/${id}/approve`, { method: "POST", headers });
      const d = await res.json();
      if (!res.ok) throw new Error(d.message);
      showToast(d.message || "Agent approved successfully!", "success");
      loadAgents();
      loadUsers();
    } catch (err) {
      showToast(err.message, "error");
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
    setLoadingAnalytics(true);
    try {
      const res = await fetch(`${API}/admin/analytics`, { headers });
      const data = await res.json();
      if (data.success) {
        setAnalytics(data);
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

  const tabs = [
    { key: "analytics", label: "Profit & Reserves", icon: "📈" },
    { key: "pending", label: "Pending", icon: "⏳", badge: pending.length },
    { key: "kyc", label: "KYC Requests", icon: "📄", badge: pendingKycCount },
    { key: "alerts", label: "Live Alerts", icon: "🔔", badge: unreadNotifs },
    { key: "agents", label: "Agent Partners", icon: "🤝", badge: pendingAgentsCount },
    { key: "loans", label: "Loans", icon: "🏦" },
    { key: "lending", label: "Lending Accounts", icon: "🤝", badge: bonds.length },
    { key: "users", label: "Users & Accounts", icon: "👥" },
    { key: "devices", label: "App Lock", icon: "🔒", badge: devices.filter(d => d.adminStatus === "active").length },
    { key: "settings", label: "Settings", icon: "⚙️" },
  ];

  const logout = () => { localStorage.clear(); window.location.href = "/"; };

  const isReservesLoading = loadingAnalytics && !analytics && !totalReservesBase;
  const isStatsLoading = loadingStats && !stats.totalUsers;

  // Live Mini-Second Profit & Reserves Stream (Admin)
  const [adminLiveMs, setAdminLiveMs] = useState(Date.now());
  const [adminAnchorTime, setAdminAnchorTime] = useState(() => Date.now());
  const [adminCachedProfit, setAdminCachedProfit] = useState(() => {
    try {
      const saved = localStorage.getItem("educa_admin_cached_profit");
      return saved ? Number(saved) : 0;
    } catch {
      return 0;
    }
  });

  useEffect(() => {
    const timer = setInterval(() => {
      setAdminLiveMs(Date.now());
    }, 100);
    return () => clearInterval(timer);
  }, []);

  const totalReservesBase = Number(analytics?.stats?.netFintechReserve || stats?.netFintechReserve || stats?.totalUserBalances || 0);
  const totalProfitBase = Number(analytics?.stats?.totalUserProfits || stats?.totalUserProfits || analytics?.stats?.totalYieldCredited || stats?.totalYield || 0);

  useEffect(() => {
    const sTime = analytics?.stats?.serverTime || stats?.serverTime;
    if (sTime) {
      const parsed = new Date(sTime).getTime();
      if (!isNaN(parsed)) setAdminAnchorTime(parsed);
    }
    if (totalProfitBase > 0) {
      setAdminCachedProfit(prev => Math.max(prev, totalProfitBase));
    }
  }, [analytics?.stats?.serverTime, stats?.serverTime, totalProfitBase]);

  const adminDailyRate = totalReservesBase > 0 ? (totalReservesBase * 0.12) / 365 : 0;
  const adminPerSec = adminDailyRate / 86400;
  const adminPerMs = adminPerSec / 1000;

  const baseAdminProfit = Math.max(totalProfitBase, adminCachedProfit);
  const adminElapsedMs = Math.max(0, adminLiveMs - adminAnchorTime);
  const liveAdminProfit = baseAdminProfit + (adminElapsedMs * adminPerMs);
  // Fintech Reserves: Total Deposits + Live Accrued Profit Added
  const liveAdminReserves = totalReservesBase + liveAdminProfit;

  useEffect(() => {
    if (liveAdminProfit > 0) {
      try {
        localStorage.setItem("educa_admin_cached_profit", String(liveAdminProfit));
      } catch {}
    }
  }, [liveAdminProfit]);

  const statCards = [
    { icon: "🏦", label: "Fintech Reserves", value: `₹${Number(liveAdminReserves).toLocaleString("en-IN", { minimumFractionDigits: 4, maximumFractionDigits: 4 })}`, loading: isReservesLoading, g: "from-emerald-500 to-teal-600" },
    { icon: "💰", label: "Total Deposits", value: `₹${Number(analytics?.stats?.totalDeposits || stats.totalDeposits || 0).toLocaleString("en-IN")}`, loading: isReservesLoading, g: "from-green-500 to-emerald-600" },
    { icon: "⚡", label: "Profit Credited", value: `₹${Number(liveAdminProfit).toLocaleString("en-IN", { minimumFractionDigits: 4, maximumFractionDigits: 4 })}`, loading: isReservesLoading, g: "from-indigo-600 to-violet-600" },
    { icon: "👥", label: "Total Users", value: stats.totalUsers ?? 0, loading: isStatsLoading, g: "from-blue-500 to-blue-600" },
    { icon: "⏳", label: "Pending Txns", value: stats.pendingTxns ?? 0, loading: isStatsLoading, g: "from-yellow-500 to-orange-500" },
  ];

  return (
    <div className="bg-gray-50 min-h-[100dvh] lg:flex">
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

      {/* DESKTOP SIDEBAR */}
      <aside className="hidden lg:flex lg:flex-col w-64 shrink-0 bg-gradient-to-b from-gray-900 to-gray-800 text-white sticky top-0 h-screen overflow-hidden">
        <div className="shrink-0 flex items-center gap-3 px-6 py-5 border-b border-white/10">
          <img src="/icon-192.png" alt="Educa Fintech" className="w-8 h-8 rounded-full object-contain bg-white p-0.5 shadow-xs" />
          <div>
            <h1 className="font-black text-lg leading-none">Admin Panel</h1>
            <p className="text-blue-400 text-xs font-semibold mt-1">Educa Finance</p>
          </div>
        </div>
        <nav className="flex-1 px-3 py-2.5 space-y-1 overflow-y-auto no-scrollbar">
          {tabs.map(({ key, label, icon, badge }) => (
            <button
              key={key} onClick={() => setTab(key)}
              className={`w-full flex items-center justify-between px-3.5 py-2.5 rounded-xl font-semibold text-xs sm:text-sm transition cursor-pointer ${
                tab === key ? "bg-indigo-600 text-white shadow" : "text-gray-300 hover:bg-white/5 hover:text-white"
              }`}
            >
              <span className="flex items-center gap-2.5"><span>{icon}</span>{label}</span>
              {!!badge && <span className="bg-red-500 text-white text-[10px] font-bold px-1.5 py-0.5 rounded-full">{badge}</span>}
            </button>
          ))}
        </nav>
        <div className="shrink-0 px-4 py-3.5 border-t border-white/10 space-y-2 bg-gray-900/95">
          <Link
            to="/dashboard"
            className="w-full flex items-center justify-center gap-2 px-3 py-2 bg-indigo-500/20 text-indigo-300 hover:bg-indigo-500/30 border border-indigo-500/40 rounded-xl transition text-xs font-bold active:scale-95 cursor-pointer shadow-xs"
          >
            <span>📱</span> Customer App View
          </Link>
          <div className="flex items-center justify-between text-xs pt-0.5">
            <span className="text-gray-400 text-[11px]">Admin: <strong className="text-white font-semibold">{user.name}</strong></span>
          </div>
          <button onClick={logout} className="w-full px-3 py-1.5 bg-red-500/90 hover:bg-red-600 text-white rounded-lg transition text-xs font-semibold cursor-pointer">Logout</button>
        </div>
      </aside>

      <div className="flex-1 min-w-0 overflow-x-hidden">
        {/* MOBILE / TABLET TOP NAV */}
        <nav className="lg:hidden bg-gradient-to-r from-gray-900 to-gray-800 shadow-lg sticky top-0 z-40 safe-top">
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
                className="px-2.5 py-1.5 bg-indigo-500/20 text-indigo-300 hover:bg-indigo-500/30 border border-indigo-500/40 rounded-lg text-xs font-bold flex items-center gap-1 active:scale-95"
              >
                <span>📱</span> <span className="hidden sm:inline">App View</span>
              </Link>
              <div className="text-right hidden sm:block">
                <p className="text-gray-400 text-xs">Logged in as</p>
                <p className="text-white font-semibold text-sm">{user.name}</p>
              </div>
              <button onClick={logout} className="px-3 sm:px-4 py-2 bg-red-500 text-white rounded-lg hover:bg-red-600 transition text-xs sm:text-sm font-semibold">Logout</button>
            </div>
          </div>
        </nav>

        <div className="max-w-7xl mx-auto px-2.5 sm:px-6 py-3 sm:py-8 w-full min-w-0">
          {/* Stats */}
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2.5 sm:gap-4 mb-4 sm:mb-8">
            {statCards.map(({ icon, label, value, loading, g }) => (
              <div key={label} className={`bg-gradient-to-br ${g} text-white p-3.5 sm:p-5 rounded-2xl shadow-md min-w-0 flex flex-col justify-between`}>
                <div>
                  <div className="text-xl sm:text-2xl mb-1 sm:mb-1.5">{icon}</div>
                  <p className="text-white/80 text-[11px] sm:text-xs font-medium truncate">{label}</p>
                </div>
                {loading && !value ? (
                  <div className="h-6 sm:h-8 w-24 sm:w-32 bg-white/30 rounded-lg animate-pulse mt-1" />
                ) : (
                  <p className="text-sm sm:text-base lg:text-lg xl:text-xl font-black font-display font-mono tabular-nums tracking-tight mt-1 truncate" title={String(value)}>
                    {value}
                  </p>
                )}
              </div>
            ))}
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
              <div className="bg-gradient-to-r from-slate-900 via-indigo-950 to-slate-900 text-white rounded-3xl p-6 sm:p-8 shadow-xl border border-indigo-500/20 flex flex-col md:flex-row md:items-center justify-between gap-4 w-full min-w-0">
                <div>
                  <div className="flex items-center gap-2 mb-2">
                    <span className="text-2xl">📈</span>
                    <span className="text-xs font-black tracking-widest text-indigo-300 uppercase px-2.5 py-0.5 rounded-full bg-indigo-500/20 border border-indigo-400/30">
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
                  <p className="text-xs sm:text-sm text-gray-300 mt-2 max-w-2xl">
                    Real-time capital balance, customer deposits, compounding 12% p.a. daily yield distribution, and liquidity reserve health.
                  </p>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <button
                    onClick={loadAnalytics}
                    disabled={loadingAnalytics}
                    className="px-4 py-2.5 bg-white/10 hover:bg-white/20 text-white rounded-xl text-xs font-bold border border-white/20 transition active:scale-95 flex items-center gap-2"
                  >
                    <span>{loadingAnalytics ? "⏳" : "🔄"}</span>
                    <span>{loadingAnalytics ? "Refreshing..." : "Refresh Data"}</span>
                  </button>
                  <button
                    onClick={() => setTab("settings")}
                    className="px-4 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold shadow-md transition active:scale-95 flex items-center gap-2"
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
                    <p className="text-xs font-bold text-gray-500 mb-1.5 flex items-center gap-1.5 truncate">
                      <span>🏦</span>
                      <span>Total Fintech Reserves</span>
                    </p>
                    {loadingAnalytics && !analytics && !liveAdminReserves ? (
                      <div className="h-9 w-40 bg-emerald-100/70 rounded-xl animate-pulse my-1" />
                    ) : (
                      <p className="text-xl sm:text-2xl lg:text-3xl font-black font-display font-mono tabular-nums text-emerald-600 tracking-tight truncate">
                        ₹{Number(liveAdminReserves).toLocaleString("en-IN", { minimumFractionDigits: 4, maximumFractionDigits: 4 })}
                      </p>
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

                <div className="bg-white rounded-3xl p-5 border border-indigo-100/80 shadow-xs flex flex-col justify-between min-w-0">
                  <div>
                    <p className="text-xs font-bold text-gray-500 mb-1.5 flex items-center gap-1.5 truncate">
                      <span>⚡</span>
                      <span>Total Profit Credited</span>
                    </p>
                    {loadingAnalytics && !analytics && !liveAdminProfit ? (
                      <div className="h-9 w-40 bg-indigo-100/70 rounded-xl animate-pulse my-1" />
                    ) : (
                      <p className="text-xl sm:text-2xl lg:text-3xl font-black font-display font-mono tabular-nums text-indigo-600 tracking-tight truncate">
                        ₹{Number(liveAdminProfit).toLocaleString("en-IN", { minimumFractionDigits: 4, maximumFractionDigits: 4 })}
                      </p>
                    )}
                  </div>
                  <p className="text-[11px] text-gray-400 mt-2.5 flex items-center gap-1.5">
                    <span className="w-2 h-2 rounded-full bg-indigo-500 inline-block shrink-0" />
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
                        chartMode === "daily" ? "bg-white text-indigo-700 shadow-xs" : "text-gray-500 hover:text-gray-900"
                      }`}
                    >
                      📊 Daily Yield Added
                    </button>
                    <button
                      onClick={() => setChartMode("cumulative")}
                      className={`px-3 py-1.5 text-xs font-bold rounded-lg transition ${
                        chartMode === "cumulative" ? "bg-white text-indigo-700 shadow-xs" : "text-gray-500 hover:text-gray-900"
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
                        <div className="py-12 flex flex-col items-center justify-center text-center bg-gray-50/50 rounded-2xl border border-dashed border-gray-200">
                          <div className="w-12 h-12 rounded-full bg-indigo-50 text-indigo-600 flex items-center justify-center text-xl mb-3">
                            📊
                          </div>
                          <p className="font-bold text-gray-700 text-sm">No Profit Yield History Yet</p>
                          <p className="text-xs text-gray-400 mt-1 max-w-sm">Daily interest calculations will automatically plot here as customer balances accrue yield.</p>
                        </div>
                      );
                    }

                    const isDaily = chartMode === "daily";
                    const maxVal = isDaily
                      ? Math.max(...data.map(d => d.amount), 220)
                      : Math.max(...data.map(d => d.cumulativeYield), 1800);

                    const chartW = 680;
                    const chartH = 220;
                    const padLeft = 60;
                    const padRight = 30;
                    const padTop = 30;
                    const padBottom = 40;
                    const plotW = chartW - padLeft - padRight;
                    const plotH = chartH - padTop - padBottom;
                    const stepX = plotW / data.length;

                    const points = data.map((d, i) => {
                      const val = isDaily ? d.amount : d.cumulativeYield;
                      const x = padLeft + (i + 0.5) * stepX;
                      const y = padTop + plotH - (val / maxVal) * plotH;
                      return { x, y, ...d, val };
                    });

                    const linePath = points.map((p, i) => `${i === 0 ? "M" : "L"} ${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(" ");
                    const areaPath = `${linePath} L ${points[points.length - 1]?.x.toFixed(1)} ${padTop + plotH} L ${points[0]?.x.toFixed(1)} ${padTop + plotH} Z`;

                    return (
                      <div className="w-full overflow-x-auto no-scrollbar">
                        <svg viewBox={`0 0 ${chartW} ${chartH}`} className="w-full min-w-[580px] h-auto select-none">
                          <defs>
                            <linearGradient id="barGrad" x1="0" y1="0" x2="0" y2="1">
                              <stop offset="0%" stopColor="#4F46E5" />
                              <stop offset="100%" stopColor="#818CF8" stopOpacity="0.7" />
                            </linearGradient>
                            <linearGradient id="areaGrad" x1="0" y1="0" x2="0" y2="1">
                              <stop offset="0%" stopColor="#4F46E5" stopOpacity="0.4" />
                              <stop offset="100%" stopColor="#818CF8" stopOpacity="0.0" />
                            </linearGradient>
                            <filter id="glow" x="-20%" y="-20%" width="140%" height="140%">
                              <feGaussianBlur stdDeviation="3" result="blur" />
                              <feComposite in="SourceGraphic" in2="blur" operator="over" />
                            </filter>
                          </defs>

                          {/* Horizontal Gridlines */}
                          {[0, 0.25, 0.5, 0.75, 1].map((pct, idx) => {
                            const y = padTop + plotH - pct * plotH;
                            const labelVal = Math.round(pct * maxVal);
                            return (
                              <g key={idx}>
                                <line x1={padLeft} y1={y} x2={chartW - padRight} y2={y} stroke="#E5E7EB" strokeDasharray="3 3" />
                                <text x={padLeft - 10} y={y + 4} textAnchor="end" className="text-[10px] fill-gray-400 font-mono">
                                  ₹{labelVal.toLocaleString("en-IN")}
                                </text>
                              </g>
                            );
                          })}

                          {/* Render Bars or Line */}
                          {isDaily ? (
                            data.map((d, i) => {
                              const barW = Math.min(42, stepX * 0.65);
                              const barH = (d.amount / maxVal) * plotH;
                              const x = padLeft + (i + 0.5) * stepX - barW / 2;
                              const y = padTop + plotH - barH;
                              const isHovered = hoveredChartBar?.date === d.date;

                              return (
                                <g
                                  key={d.date}
                                  className="cursor-pointer transition-all duration-200"
                                  onMouseEnter={() => setHoveredChartBar(d)}
                                  onClick={() => setHoveredChartBar(d)}
                                >
                                  <rect
                                    x={x}
                                    y={y}
                                    width={barW}
                                    height={barH}
                                    rx={6}
                                    fill={isHovered ? "#3730A3" : "url(#barGrad)"}
                                    className="transition-all"
                                  />
                                  <text
                                    x={x + barW / 2}
                                    y={y - 8}
                                    textAnchor="middle"
                                    className={`text-[10px] font-black font-mono transition-all ${
                                      isHovered ? "fill-indigo-900 font-extrabold text-[11px]" : "fill-indigo-600"
                                    }`}
                                  >
                                    +₹{d.amount}
                                  </text>
                                  <text
                                    x={x + barW / 2}
                                    y={padTop + plotH + 20}
                                    textAnchor="middle"
                                    className={`text-[11px] font-bold ${isHovered ? "fill-indigo-900" : "fill-gray-500"}`}
                                  >
                                    {d.displayDate}
                                  </text>
                                </g>
                              );
                            })
                          ) : (
                            <g>
                              <path d={areaPath} fill="url(#areaGrad)" />
                              <path d={linePath} fill="none" stroke="#4F46E5" strokeWidth="3" filter="url(#glow)" />
                              {points.map((p) => {
                                const isHovered = hoveredChartBar?.date === p.date;
                                return (
                                  <g
                                    key={p.date}
                                    className="cursor-pointer"
                                    onMouseEnter={() => setHoveredChartBar(p)}
                                    onClick={() => setHoveredChartBar(p)}
                                  >
                                    <circle
                                      cx={p.x}
                                      cy={p.y}
                                      r={isHovered ? 7 : 5}
                                      fill={isHovered ? "#312E81" : "#4F46E5"}
                                      stroke="#FFFFFF"
                                      strokeWidth="2.5"
                                    />
                                    <text
                                      x={p.x}
                                      y={p.y - 10}
                                      textAnchor="middle"
                                      className="text-[10px] font-black fill-indigo-700 font-mono"
                                    >
                                      ₹{Math.round(p.val)}
                                    </text>
                                    <text
                                      x={p.x}
                                      y={padTop + plotH + 20}
                                      textAnchor="middle"
                                      className="text-[11px] font-bold fill-gray-500"
                                    >
                                      {p.displayDate}
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

                {/* 12% Calculation Formula & Calendar Month Explanation */}
                <div className="mb-5 p-4 bg-gradient-to-r from-indigo-50/90 via-blue-50/70 to-emerald-50/80 border border-indigo-100/90 rounded-2xl">
                  <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
                    <div className="flex items-center gap-2">
                      <span className="text-lg">🧮</span>
                      <h4 className="text-xs font-black text-indigo-950 uppercase tracking-wider">
                        Daily Savings Yield Calculation Formula & Calendar Month Breakdown
                      </h4>
                    </div>
                    <span className="text-[11px] font-bold text-indigo-700 bg-white/90 px-2.5 py-0.5 rounded-full border border-indigo-200 font-mono">
                      Annual: 12% p.a. | Monthly: 1.00%
                    </span>
                  </div>
                  <p className="text-xs text-gray-600 mb-3 leading-relaxed">
                    Kyunki savings interest <strong>updated running balance</strong> (Principal + Added Profit) par 1% monthly aur <strong>calendar month ke actual days</strong> par divide hota hai:
                  </p>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-xs">
                    <div className="p-3 bg-white rounded-xl border border-indigo-100 shadow-2xs">
                      <span className="text-[11px] font-bold text-gray-500 block mb-0.5">🗓️ September (30 Days)</span>
                      <p className="font-mono font-black text-sm text-emerald-600 mb-0.5">₹200.00 / din</p>
                      <p className="text-[11px] text-gray-500">₹6,000 ÷ 30 din = ₹200.00/day<br/><span className="text-gray-400 font-mono text-[10px]">30 din × ₹200 = ₹6,000 (1%)</span></p>
                    </div>
                    <div className="p-3 bg-white rounded-xl border border-blue-100 shadow-2xs">
                      <span className="text-[11px] font-bold text-gray-500 block mb-0.5">🗓️ October (31 Days)</span>
                      <p className="font-mono font-black text-sm text-indigo-600 mb-0.5">₹193.55 - ₹194.06 / din</p>
                      <p className="text-[11px] text-gray-500">₹6,000 ÷ 31 din = ₹193.548...<br/><span className="text-gray-400 font-mono text-[10px]">31 din × ₹193.55 = ₹6,000 (1%)</span></p>
                    </div>
                    <div className="p-3 bg-white rounded-xl border border-emerald-100 shadow-2xs">
                      <span className="text-[11px] font-bold text-gray-500 block mb-0.5">🗓️ November (30 Days)</span>
                      <p className="font-mono font-black text-sm text-emerald-600 mb-0.5">₹200.00 / din</p>
                      <p className="text-[11px] text-gray-500">₹6,000 ÷ 30 din = ₹200.00/day<br/><span className="text-gray-400 font-mono text-[10px]">30 din × ₹200 = ₹6,000 (1%)</span></p>
                    </div>
                  </div>
                </div>

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
                        analytics.dailyProfitChart.map((row, idx) => (
                          <tr key={row.date || idx} className="hover:bg-gray-50/70 transition">
                            <td className="py-3 pr-4 font-mono text-gray-400">{idx + 1}</td>
                            <td className="py-3 pr-4 font-bold text-gray-900">{row.displayDate || row.date}</td>
                            <td className="py-3 pr-4 font-mono text-gray-600">₹{Number(row.estimatedCapital || (analytics?.stats?.totalDeposits || 0)).toLocaleString("en-IN")}</td>
                            <td className="py-3 pr-4 text-gray-500">12% p.a.</td>
                            <td className="py-3 pr-4 font-black text-emerald-600">+₹{Number(row.amount).toFixed(2)}</td>
                            <td className="py-3 pr-4 font-bold font-mono text-indigo-700">₹{Number(row.cumulativeYield).toFixed(2)}</td>
                            <td className="py-3 pr-4 text-gray-500">{row.uniqueUsers ? `${row.uniqueUsers} User(s)` : "Active User"}</td>
                            <td className="py-3">
                              <span className="px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700 text-[10px] font-bold">
                                ✓ Credited
                              </span>
                            </td>
                          </tr>
                        ))
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
                            ? "bg-white text-indigo-700 shadow-xs"
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
                        className="p-3.5 sm:p-4 bg-gray-50 hover:bg-gray-100/80 border border-gray-200 rounded-2xl flex flex-col md:flex-row md:items-center justify-between gap-3 sm:gap-4 transition"
                      >
                        <div className="flex items-start gap-3 min-w-0">
                          {/* Both Document Thumbnails */}
                          <div className="flex items-center gap-1.5 shrink-0">
                            {previewKycUser?.kycDocuments?.doc1Url || u.kycDocuments?.doc1Url || u.kycDocuments?.docUrl ? (
                              <img
                                src={u.kycDocuments.doc1Url || u.kycDocuments.docUrl}
                                alt="Doc 1 Aadhaar"
                                title="Doc 1: Aadhaar Card"
                                className="w-12 h-12 object-cover rounded-xl border border-gray-300 bg-white cursor-pointer shadow-2xs hover:scale-105 transition"
                                onClick={() => {
                                  setKycReviewRemarks(u.kycDocuments?.adminRemarks || "");
                                  setPreviewKycUser(u);
                                }}
                              />
                            ) : (
                              <div className="w-12 h-12 rounded-xl bg-blue-50 text-blue-600 border border-blue-200 flex items-center justify-center text-xs font-bold">🆔</div>
                            )}

                            {u.kycDocuments?.doc2Url ? (
                              <img
                                src={u.kycDocuments.doc2Url}
                                alt="Doc 2"
                                title={`Doc 2: ${u.kycDocuments.doc2Type === "cheque" ? "Cheque" : "PAN"}`}
                                className="w-12 h-12 object-cover rounded-xl border border-gray-300 bg-white cursor-pointer shadow-2xs hover:scale-105 transition"
                                onClick={() => {
                                  setKycReviewRemarks(u.kycDocuments?.adminRemarks || "");
                                  setPreviewKycUser(u);
                                }}
                              />
                            ) : (
                              <div className="w-12 h-12 rounded-xl bg-indigo-50 text-indigo-600 border border-indigo-200 flex items-center justify-center text-xs font-bold">💳</div>
                            )}
                          </div>

                          <div className="min-w-0 space-y-1">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="font-bold text-gray-900 text-sm">{u.name}</span>
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
                              <span className="font-bold px-2 py-0.5 rounded bg-indigo-50 text-indigo-700 border border-indigo-200 uppercase text-[10px]">
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
                              <p className="text-[11px] text-blue-700 font-medium bg-blue-50/80 px-2 py-0.5 rounded border border-blue-100">
                                💬 Note: {u.kycDocuments.adminRemarks}
                              </p>
                            )}
                          </div>
                        </div>

                        {/* Action */}
                        <div className="flex items-center gap-2 w-full md:w-auto shrink-0 md:self-center">
                          <button
                            onClick={() => {
                              setKycReviewRemarks(u.kycDocuments?.adminRemarks || "");
                              setPreviewKycUser(u);
                            }}
                            className={`w-full md:w-auto justify-center px-4 py-2.5 rounded-xl text-xs font-bold shadow-md active:scale-95 transition flex items-center gap-1.5 cursor-pointer ${
                              u.kycStatus === "rejected"
                                ? "bg-rose-100 text-rose-700 border border-rose-200 shadow-none"
                                : u.kycStatus === "verified"
                                ? "bg-emerald-100 text-emerald-700 border border-emerald-200 shadow-none"
                                : "bg-indigo-600 hover:bg-indigo-700 text-white shadow-indigo-500/20"
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

          {/* AGENT PARTNERS */}
          {tab === "agents" && (
            <div className="bg-white rounded-2xl shadow-sm p-5 sm:p-6 border border-gray-100">
              <div className="flex justify-between items-center mb-5">
                <div>
                  <h3 className="text-lg font-bold font-display text-gray-900">Agent Partner Applications</h3>
                  <p className="text-xs text-gray-500">Contact applicants, verify shop & details, and approve agent status</p>
                </div>
                <span className="px-3 py-1 bg-amber-100 text-amber-900 text-xs font-bold rounded-full">
                  {agents.filter(a => a.agentProfile?.status === "pending").length} Pending
                </span>
              </div>

              {agents.length === 0 ? (
                <p className="py-12 text-center text-gray-400 text-sm">No agent applications yet 🤝</p>
              ) : (
                <div className="space-y-4">
                  {agents.map(a => {
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

                          <div className="flex items-center gap-2 shrink-0">
                            <a
                              href={`tel:${a.phone}`}
                              className="px-3 py-1.5 bg-blue-50 text-blue-700 hover:bg-blue-100 border border-blue-200 rounded-xl text-xs font-bold transition flex items-center gap-1"
                            >
                              📞 Call Applicant
                            </a>
                            {isPending && (
                              <>
                                <button
                                  onClick={() => approveAgent(a._id)}
                                  className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold transition shadow-sm active:scale-95"
                                >
                                  ✓ Approve Agent
                                </button>
                                <button
                                  onClick={() => rejectAgent(a._id)}
                                  className="px-3 py-1.5 bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 rounded-xl text-xs font-bold transition"
                                >
                                  Reject
                                </button>
                              </>
                            )}
                          </div>
                        </div>

                        <div className="pt-3 grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                          <div className="p-2.5 bg-white rounded-xl border border-gray-100">
                            <span className="text-gray-400 font-medium block text-[11px]">Business / Shop</span>
                            <span className="font-bold text-gray-800">{prof.businessName || "Not specified"}</span>
                          </div>

                          <div className="p-2.5 bg-white rounded-xl border border-gray-100">
                            <span className="text-gray-400 font-medium block text-[11px]">Commission Model</span>
                            <span className="font-bold text-gray-800">
                              {isTeamModel ? (
                                <span className="text-amber-700 font-black">👥 Team Model: 1% Self + 1% Team Allowed</span>
                              ) : (
                                <span className="text-blue-700 font-black">👤 Solo Direct: 2% Direct (No Team)</span>
                              )}
                            </span>
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
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-5">
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

              {users.length === 0 ? (
                <p className="py-10 text-center text-gray-300 text-sm">No users found</p>
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
                        {users.map(u => (
                          <tr key={u._id} className="hover:bg-slate-50/60 transition-colors">
                            {/* USER */}
                            <td className="py-4 px-4 align-top">
                              <p className="font-bold text-sm text-gray-900 leading-tight">{u.name}</p>
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
                    {users.map(u => (
                      <div key={u._id} className="border border-gray-100 rounded-2xl p-4 bg-white shadow-xs">
                        <div className="flex justify-between items-start mb-2.5">
                          <div>
                            <p className="font-bold text-sm text-gray-900">{u.name}</p>
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
                            <div className="flex items-center gap-2">
                              <h4 className="text-base sm:text-lg font-bold">{l.userId?.name}</h4>
                              {l.accountNumber && (
                                <span className="px-2 py-0.5 rounded-md text-[11px] font-mono font-bold bg-slate-100 text-slate-700 border border-slate-200">
                                  {l.accountNumber}
                                </span>
                              )}
                            </div>
                            <p className="text-xs text-gray-400">{l.userId?.email} • Phone: {l.userId?.phone || "N/A"}</p>
                          </div>
                          <span className={`px-3 py-1 rounded-full text-xs font-bold shrink-0 ${loanStatusColor[l.status] || "bg-gray-100"}`}>{l.status.toUpperCase()}</span>
                        </div>
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

          {/* LENDING / BOND ACCOUNTS */}
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

              {/* Referral Commission */}
              <div className="bg-white rounded-2xl shadow-sm p-5 sm:p-6 border border-gray-100">
                <h3 className="text-lg font-bold font-display mb-1">🎯 Referral Commission Rate</h3>
                <p className="text-sm text-gray-500 mb-5">Jab referred user ka loan approve ho, referrer ko loan amount ka yeh % milega automatically.</p>
                <div className="flex items-center gap-4 mb-5 flex-wrap">
                  <div className="bg-orange-50 border border-orange-200 rounded-xl px-6 py-4 text-center">
                    <p className="text-xs text-gray-500">Current Commission</p>
                    <p className="text-3xl font-black font-display text-orange-600">{commissionRate}%</p>
                    <p className="text-xs text-gray-400">of loan amount</p>
                  </div>
                  <div className="text-sm text-gray-500 bg-gray-50 rounded-xl p-4">
                    <p className="font-semibold text-gray-700 mb-1">Example:</p>
                    <p>₹50,000 loan approve ho</p>
                    <p className="font-black text-orange-600 text-lg">→ ₹{(50000 * commissionRate / 100).toLocaleString("en-IN")} referrer ko</p>
                  </div>
                </div>
                <div className="flex gap-3 max-w-sm">
                  <input type="number" inputMode="decimal" min="0" max="50" step="0.5" value={newCommissionRate} onChange={e => setNewCommissionRate(e.target.value)} placeholder="Naya commission daalo" className="flex-1 px-4 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-orange-500 outline-none text-base sm:text-sm" />
                  <span className="flex items-center text-gray-500 font-bold">%</span>
                  <button onClick={updateCommissionRate} className="px-5 py-3 bg-orange-500 text-white rounded-xl font-bold text-sm hover:bg-orange-600 transition">Update</button>
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
        <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-5 bg-black/60 backdrop-blur-xs animate-fadeIn">
          <div className="bg-white rounded-3xl max-w-2xl w-full p-5 sm:p-6 shadow-2xl border border-gray-200 flex flex-col max-h-[92vh] overflow-hidden text-gray-900">
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
                onClick={() => setPreviewKycUser(null)}
                className="w-8 h-8 rounded-full bg-gray-100 hover:bg-gray-200 text-gray-600 flex items-center justify-center transition text-sm font-bold"
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
                  {(previewKycUser.kycDocuments?.doc1Url || previewKycUser.kycDocuments?.docUrl) ? (
                    <div className="space-y-1">
                      <span className="text-[10px] font-bold text-gray-500 uppercase tracking-wider block">Front Side</span>
                      <div className="bg-white rounded-xl p-1.5 border border-gray-200 overflow-hidden relative group">
                        {(previewKycUser.kycDocuments.doc1Url || previewKycUser.kycDocuments.docUrl).startsWith("data:application/pdf") ? (
                          <iframe
                            src={previewKycUser.kycDocuments.doc1Url || previewKycUser.kycDocuments.docUrl}
                            title="Aadhaar Front PDF Preview"
                            className="w-full h-[160px] rounded-lg border border-gray-200"
                          />
                        ) : (
                          <img
                            src={previewKycUser.kycDocuments.doc1Url || previewKycUser.kycDocuments.docUrl}
                            alt="Aadhaar Front Preview"
                            className="max-h-[160px] max-w-full object-contain rounded-lg shadow-2xs cursor-zoom-in w-full"
                            onClick={() => { setLightboxImg(previewKycUser.kycDocuments.doc1Url || previewKycUser.kycDocuments.docUrl); setZoomLevel(1); }}
                          />
                        )}
                        <div className="absolute bottom-1 right-1 bg-black/50 text-white text-[10px] px-1.5 py-0.5 rounded-full opacity-0 group-hover:opacity-100 transition pointer-events-none">🔍 Zoom Front</div>
                      </div>
                    </div>
                  ) : (
                    <div className="p-4 text-center text-xs text-gray-400">No Aadhaar Front file</div>
                  )}

                  {/* Back */}
                  {previewKycUser.kycDocuments?.doc1BackUrl && (
                    <div className="space-y-1 pt-1.5 border-t border-gray-200/60">
                      <span className="text-[10px] font-bold text-gray-500 uppercase tracking-wider block">Back Side</span>
                      <div className="bg-white rounded-xl p-1.5 border border-gray-200 overflow-hidden relative group">
                        {previewKycUser.kycDocuments.doc1BackUrl.startsWith("data:application/pdf") ? (
                          <iframe
                            src={previewKycUser.kycDocuments.doc1BackUrl}
                            title="Aadhaar Back PDF Preview"
                            className="w-full h-[160px] rounded-lg border border-gray-200"
                          />
                        ) : (
                          <img
                            src={previewKycUser.kycDocuments.doc1BackUrl}
                            alt="Aadhaar Back Preview"
                            className="max-h-[160px] max-w-full object-contain rounded-lg shadow-2xs cursor-zoom-in w-full"
                            onClick={() => { setLightboxImg(previewKycUser.kycDocuments.doc1BackUrl); setZoomLevel(1); }}
                          />
                        )}
                        <div className="absolute bottom-1 right-1 bg-black/50 text-white text-[10px] px-1.5 py-0.5 rounded-full opacity-0 group-hover:opacity-100 transition pointer-events-none">🔍 Zoom Back</div>
                      </div>
                    </div>
                  )}
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
                  {previewKycUser.kycDocuments?.doc2Url ? (
                    <div className="space-y-1">
                      <span className="text-[10px] font-bold text-gray-500 uppercase tracking-wider block">Front Side</span>
                      <div className="bg-white rounded-xl p-1.5 border border-gray-200 overflow-hidden relative group">
                        {previewKycUser.kycDocuments.doc2Url.startsWith("data:application/pdf") ? (
                          <iframe
                            src={previewKycUser.kycDocuments.doc2Url}
                            title="Doc 2 Front PDF Preview"
                            className="w-full h-[160px] rounded-lg border border-gray-200"
                          />
                        ) : (
                          <img
                            src={previewKycUser.kycDocuments.doc2Url}
                            alt="Doc 2 Front Preview"
                            className="max-h-[160px] max-w-full object-contain rounded-lg shadow-2xs cursor-zoom-in w-full"
                            onClick={() => { setLightboxImg(previewKycUser.kycDocuments.doc2Url); setZoomLevel(1); }}
                          />
                        )}
                        <div className="absolute bottom-1 right-1 bg-black/50 text-white text-[10px] px-1.5 py-0.5 rounded-full opacity-0 group-hover:opacity-100 transition pointer-events-none">🔍 Zoom Front</div>
                      </div>
                    </div>
                  ) : (
                    <div className="p-4 text-center text-xs text-gray-400">No Doc 2 Front file uploaded</div>
                  )}

                  {/* Back */}
                  {previewKycUser.kycDocuments?.doc2BackUrl && (
                    <div className="space-y-1 pt-1.5 border-t border-gray-200/60">
                      <span className="text-[10px] font-bold text-gray-500 uppercase tracking-wider block">Back Side</span>
                      <div className="bg-white rounded-xl p-1.5 border border-gray-200 overflow-hidden relative group">
                        {previewKycUser.kycDocuments.doc2BackUrl.startsWith("data:application/pdf") ? (
                          <iframe
                            src={previewKycUser.kycDocuments.doc2BackUrl}
                            title="Doc 2 Back PDF Preview"
                            className="w-full h-[160px] rounded-lg border border-gray-200"
                          />
                        ) : (
                          <img
                            src={previewKycUser.kycDocuments.doc2BackUrl}
                            alt="Doc 2 Back Preview"
                            className="max-h-[160px] max-w-full object-contain rounded-lg shadow-2xs cursor-zoom-in w-full"
                            onClick={() => { setLightboxImg(previewKycUser.kycDocuments.doc2BackUrl); setZoomLevel(1); }}
                          />
                        )}
                        <div className="absolute bottom-1 right-1 bg-black/50 text-white text-[10px] px-1.5 py-0.5 rounded-full opacity-0 group-hover:opacity-100 transition pointer-events-none">🔍 Zoom Back</div>
                      </div>
                    </div>
                  )}
                </div>

              </div>

              {/* Admin Review Remarks Input Box */}
              <div className="space-y-1.5 pt-2 border-t border-gray-100">
                <label className="text-xs font-bold text-gray-800 flex items-center justify-between">
                  <span>Admin Review Remarks / Verification Note:</span>
                  <span className="text-[10px] text-gray-400">Written to user record</span>
                </label>
                <textarea
                  rows={2}
                  value={kycReviewRemarks}
                  onChange={(e) => setKycReviewRemarks(e.target.value)}
                  placeholder="Enter remarks (e.g. Both Aadhaar & PAN details verified & matched with photo)..."
                  className="w-full p-2.5 bg-gray-50 border border-gray-200 rounded-xl text-xs font-medium text-gray-800 placeholder-gray-400 focus:ring-2 focus:ring-indigo-500 outline-none"
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
                <span className="px-4 py-2.5 rounded-xl bg-rose-50 text-rose-700 border border-rose-200 text-xs font-bold select-none">
                  ✕ KYC Rejected — User must re-submit
                </span>
              ) : previewKycUser.kycStatus === "verified" ? (
                <span className="px-4 py-2.5 rounded-xl bg-emerald-50 text-emerald-700 border border-emerald-200 text-xs font-bold select-none">
                  ✓ Already Verified
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
