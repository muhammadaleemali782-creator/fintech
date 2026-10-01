import { useState, useEffect, useCallback } from "react";
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
  const [pending, setPending] = useState([]);
  const [agents, setAgents] = useState([]);
  const [users, setUsers] = useState([]);
  const [devices, setDevices] = useState([]);
  const [loans, setLoans] = useState([]);
  const [notifications, setNotifications] = useState([]);
  const [unreadNotifs, setUnreadNotifs] = useState(0);
  const [toast, setToast] = useState({ text: "", type: "" });
  const [interestRate, setInterestRate] = useState(12);
  const [newInterestRate, setNewInterestRate] = useState("");
  const [commissionRate, setCommissionRate] = useState(2);
  const [newCommissionRate, setNewCommissionRate] = useState("");
  const [googleDriveUrl, setGoogleDriveUrl] = useState("");
  const [newGoogleDriveUrl, setNewGoogleDriveUrl] = useState("");
  const [previewKycUser, setPreviewKycUser] = useState(null);
  const [kycReviewRemarks, setKycReviewRemarks] = useState("");
  const [kycFilter, setKycFilter] = useState("all");
  const [lightboxImg, setLightboxImg] = useState(null); // fullscreen doc viewer
  const [expandedLoanId, setExpandedLoanId] = useState(null);
  const [adminPayModal, setAdminPayModal] = useState(null);
  const [adminPayLoading, setAdminPayLoading] = useState(false);

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

  const loadAll = useCallback(() => {
    loadStats(); loadPending(); loadAgents(); loadUsers(); loadLoans(); loadSettings(); loadNotifications(); loadDevices();
  }, [loadStats, loadPending, loadAgents, loadUsers, loadLoans, loadSettings, loadNotifications, loadDevices]);

  useEffect(() => {
    loadAll();
    const i = setInterval(loadStats, 10000);
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

  const approveLoan = async (id) => {
    if (!window.confirm("Approve and disburse this loan?")) return;
    const res = await fetch(`${API}/loan/${id}/approve`, { method: "POST", headers });
    const data = await res.json();
    showToast(data.message, res.ok ? "success" : "error");
    if (res.ok) loadAll();
  };

  const rejectLoan = async (id) => {
    if (!window.confirm("Reject this loan?")) return;
    const res = await fetch(`${API}/loan/${id}/reject`, { method: "POST", headers });
    showToast((await res.json()).message, res.ok ? "success" : "error");
    if (res.ok) loadLoans();
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
    { key: "pending", label: "Pending", icon: "⏳", badge: pending.length },
    { key: "kyc", label: "KYC Requests", icon: "📄", badge: pendingKycCount },
    { key: "alerts", label: "Live Alerts", icon: "🔔", badge: unreadNotifs },
    { key: "agents", label: "Agent Partners", icon: "🤝", badge: pendingAgentsCount },
    { key: "loans", label: "Loans", icon: "🏦" },
    { key: "users", label: "Users & Accounts", icon: "👥" },
    { key: "devices", label: "App Lock", icon: "🔒", badge: devices.filter(d => d.adminStatus === "active").length },
    { key: "settings", label: "Settings", icon: "⚙️" },
  ];

  const logout = () => { localStorage.clear(); window.location.href = "/"; };

  const statCards = [
    { icon: "👥", label: "Total Users", value: stats.totalUsers ?? 0, g: "from-blue-500 to-blue-600" },
    { icon: "⏳", label: "Pending Txns", value: stats.pendingTxns ?? 0, g: "from-yellow-500 to-orange-500" },
    { icon: "💰", label: "Total Deposits", value: `₹${(stats.totalDeposits || 0).toLocaleString("en-IN")}`, g: "from-green-500 to-emerald-600" },
    { icon: "🏦", label: "Pending Loans", value: stats.pendingLoans ?? 0, g: "from-blue-600 to-indigo-600" },
  ];

  return (
    <div className="bg-gray-50 min-h-[100dvh] lg:flex">
      {/* FULLSCREEN LIGHTBOX — click doc image to zoom */}
      {lightboxImg && (
        <div
          className="fixed inset-0 z-[9999] bg-black/90 flex items-center justify-center p-4"
          onClick={() => setLightboxImg(null)}
        >
          <button
            className="absolute top-4 right-4 text-white text-3xl font-bold bg-white/10 hover:bg-white/20 w-10 h-10 rounded-full flex items-center justify-center"
            onClick={() => setLightboxImg(null)}
          >✕</button>
          {lightboxImg.startsWith("data:application/pdf") ? (
            <iframe src={lightboxImg} title="Doc Preview" className="w-full max-w-3xl h-[85vh] rounded-xl" />
          ) : (
            <img
              src={lightboxImg}
              alt="Document Fullscreen"
              className="max-w-full max-h-[90vh] object-contain rounded-xl shadow-2xl"
              onClick={e => e.stopPropagation()}
            />
          )}
        </div>
      )}

      {/* DESKTOP SIDEBAR */}
      <aside className="hidden lg:flex lg:flex-col w-64 shrink-0 bg-gradient-to-b from-gray-900 to-gray-800 text-white sticky top-0 h-screen">
        <div className="flex items-center gap-3 px-6 py-6 border-b border-white/10">
          <img src="/icon-192.png" alt="Educa Fintech" className="w-8 h-8 rounded-full object-contain bg-white p-0.5 shadow-xs" />
          <div>
            <h1 className="font-black text-lg leading-none">Admin Panel</h1>
            <p className="text-blue-400 text-xs font-semibold mt-1">Educa Finance</p>
          </div>
        </div>
        <nav className="flex-1 px-3 py-4 space-y-1">
          {tabs.map(({ key, label, icon, badge }) => (
            <button
              key={key} onClick={() => setTab(key)}
              className={`w-full flex items-center justify-between px-4 py-3 rounded-xl font-semibold text-sm transition ${
                tab === key ? "bg-indigo-600 text-white shadow" : "text-gray-300 hover:bg-white/5 hover:text-white"
              }`}
            >
              <span className="flex items-center gap-3"><span>{icon}</span>{label}</span>
              {!!badge && <span className="bg-red-500 text-white text-[10px] font-bold px-1.5 py-0.5 rounded-full">{badge}</span>}
            </button>
          ))}
        </nav>
        <div className="px-4 py-4 border-t border-white/10">
          <p className="text-gray-400 text-xs">Logged in as</p>
          <p className="text-white font-semibold text-sm mb-3">{user.name}</p>
          <button onClick={logout} className="w-full px-4 py-2.5 bg-red-500/90 text-white rounded-lg hover:bg-red-600 transition text-sm font-semibold">Logout</button>
        </div>
      </aside>

      <div className="flex-1 min-w-0">
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
            <div className="flex items-center gap-3 sm:gap-4">
              <div className="text-right hidden sm:block">
                <p className="text-gray-400 text-xs">Logged in as</p>
                <p className="text-white font-semibold text-sm">{user.name}</p>
              </div>
              <button onClick={logout} className="px-3 sm:px-4 py-2 bg-red-500 text-white rounded-lg hover:bg-red-600 transition text-xs sm:text-sm font-semibold">Logout</button>
            </div>
          </div>
        </nav>

        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-5 sm:py-8">
          {/* Stats */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 sm:gap-4 mb-6 sm:mb-8">
            {statCards.map(({ icon, label, value, g }) => (
              <div key={label} className={`bg-gradient-to-br ${g} text-white p-4 sm:p-5 rounded-2xl shadow-lg`}>
                <div className="text-2xl sm:text-3xl mb-2">{icon}</div>
                <p className="text-white/70 text-xs">{label}</p>
                <p className="text-xl sm:text-2xl font-black font-display mt-0.5">{value}</p>
              </div>
            ))}
          </div>

          {/* Tabs — mobile/tablet only (desktop uses sidebar) */}
          <div className="lg:hidden flex gap-2 mb-6 bg-white p-1.5 rounded-2xl shadow-sm border border-gray-100 overflow-x-auto no-scrollbar">
            {tabs.map(({ key, label, icon, badge }) => (
              <button key={key} onClick={() => setTab(key)}
                className={`flex-1 min-w-max py-2.5 px-4 rounded-xl font-semibold text-sm transition-all flex items-center gap-1.5 ${tab === key ? "bg-indigo-600 text-white shadow" : "text-gray-500 hover:text-gray-700"}`}>
                <span>{icon}</span>{label}
                {!!badge && <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full ${tab === key ? "bg-white/20" : "bg-red-100 text-red-600"}`}>{badge}</span>}
              </button>
            ))}
          </div>

          {/* PENDING */}
          {tab === "pending" && (
            <div className="bg-white rounded-2xl shadow-sm p-5 sm:p-6 border border-gray-100">
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
                            <td className="py-3 pr-4"><span className={`px-2 py-1 rounded-full text-xs font-bold ${t.type === "deposit" ? "bg-green-100 text-green-700" : "bg-red-100 text-red-700"}`}>{t.type}</span></td>
                            <td className="py-3 pr-4 font-bold">₹{t.amount.toLocaleString("en-IN")}</td>
                            <td className="py-3 pr-4 uppercase text-xs text-gray-500">{t.method}</td>
                            <td className="py-3 pr-4 text-xs text-gray-500 max-w-xs truncate">{t.utrNumber || JSON.stringify(t.paymentDetails || {})}</td>
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
                          <span className={`px-2 py-1 rounded-full text-xs font-bold shrink-0 ${t.type === "deposit" ? "bg-green-100 text-green-700" : "bg-red-100 text-red-700"}`}>{t.type}</span>
                        </div>
                        <div className="flex justify-between text-sm mb-1">
                          <span className="text-gray-400">Amount</span>
                          <span className="font-bold">₹{t.amount.toLocaleString("en-IN")}</span>
                        </div>
                        <div className="flex justify-between text-sm mb-3">
                          <span className="text-gray-400">Method</span>
                          <span className="uppercase text-xs text-gray-500">{t.method}</span>
                        </div>
                        <p className="text-xs text-gray-500 mb-3 truncate">{t.utrNumber || JSON.stringify(t.paymentDetails || {})}</p>
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
            <div className="bg-white rounded-2xl shadow-sm p-5 sm:p-6 border border-gray-100">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
                <div>
                  <h3 className="text-lg font-bold font-display text-gray-900 flex items-center gap-2">
                    <span>📄</span> User KYC Verification Requests
                  </h3>
                  <p className="text-xs text-gray-500">
                    Review submitted Aadhaar, PAN, Address & documents. Write admin notes and approve or reject.
                  </p>
                </div>

                {/* Action & Filter Pills */}
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    onClick={exportKycToCsv}
                    className="px-3.5 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold shadow-xs active:scale-95 transition flex items-center gap-1.5 cursor-pointer"
                  >
                    <span>📥</span> Export to Excel
                  </button>

                  <div className="flex gap-1.5 bg-gray-100 p-1 rounded-xl text-xs font-bold">
                    {[
                      { key: "all", label: "All Submissions" },
                      { key: "pending", label: `Pending (${pendingKycCount})` },
                      { key: "verified", label: "Verified" },
                      { key: "rejected", label: "Rejected" },
                    ].map(f => (
                      <button
                        key={f.key}
                        onClick={() => setKycFilter(f.key)}
                        className={`px-3 py-1.5 rounded-lg transition cursor-pointer ${
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
                        className="p-4 bg-gray-50 hover:bg-gray-100/80 border border-gray-200 rounded-2xl flex flex-col md:flex-row md:items-center justify-between gap-4 transition"
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
                        <div className="flex items-center gap-2 shrink-0 self-end md:self-center">
                          <button
                            onClick={() => {
                              setKycReviewRemarks(u.kycDocuments?.adminRemarks || "");
                              setPreviewKycUser(u);
                            }}
                            className={`px-4 py-2 rounded-xl text-xs font-bold shadow-md active:scale-95 transition flex items-center gap-1.5 cursor-pointer ${
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
                          <th className="py-3.5 px-4 w-[180px]">User</th>
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
                              <p className="text-gray-500 text-[11px] truncate max-w-[160px]">{u.email}</p>
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
                              <p className="font-extrabold text-sm text-green-600 pt-0.5">₹{u.balance.toLocaleString("en-IN")}</p>
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
            <div className="bg-white rounded-2xl shadow-sm p-5 sm:p-6 border border-gray-100">
              <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 mb-6">
                <div>
                  <h3 className="text-lg font-bold font-display">📱 App Devices & Remote Parental Bedtime Lock</h3>
                  <p className="text-xs text-gray-500">Jab bacha app chalayega, to uska device yahan dikhega. Aap yahan se 1-click me Bedtime Lock laga ya hata sakte hain.</p>
                </div>
                <button onClick={loadDevices} className="px-3 py-1.5 bg-gray-100 hover:bg-gray-200 text-gray-700 text-xs font-bold rounded-lg transition">
                  🔄 Refresh Devices
                </button>
              </div>

              {/* PIN Card for Admin */}
              <div className="mb-6 p-4 rounded-xl bg-blue-50/80 border border-blue-200/80 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-blue-600 text-white flex items-center justify-center text-lg font-bold shadow-sm">
                    🔑
                  </div>
                  <div>
                    <h4 className="text-sm font-bold text-blue-950">Parent / Admin Secret Unlock PIN</h4>
                    <p className="text-xs text-blue-700">Agar aap bache ke phone par hain, to lock screen par <b>"Enter Admin Password to Unlock"</b> dabakar ye PIN ya Admin Password daalein:</p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <span className="px-3.5 py-1.5 bg-white border border-blue-300 rounded-lg font-mono font-bold text-sm text-blue-900 shadow-sm tracking-wider">
                    PIN: 1234
                  </span>
                  <span className="text-xs text-blue-500 font-semibold">(Ya Admin Password)</span>
                </div>
              </div>

              {devices.length === 0 ? (
                <div className="text-center py-12 bg-gray-50 rounded-xl border border-dashed border-gray-200">
                  <p className="text-3xl mb-2">📱</p>
                  <p className="text-gray-500 text-sm font-semibold">No app devices connected yet</p>
                  <p className="text-gray-400 text-xs mt-1">Jab koi user Android app me login ya signup karega, to uska device auto-connect hokar yahan aa jayega.</p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-sm">
                    <thead>
                      <tr className="border-b border-gray-100 text-xs font-bold text-gray-400 uppercase tracking-wider">
                        <th className="pb-3">User</th>
                        <th className="pb-3">Device Model</th>
                        <th className="pb-3">Last Seen</th>
                        <th className="pb-3">OS Lock Status</th>
                        <th className="pb-3 text-right">Remote Action</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-50">
                      {devices.map((d) => (
                        <tr key={d.deviceId} className="hover:bg-gray-50/50 transition">
                          <td className="py-3.5">
                            <p className="font-bold text-gray-900">{d.userName || "User"}</p>
                            <p className="text-xs text-gray-400 font-mono">{d.userEmail || d.deviceId}</p>
                          </td>
                          <td className="py-3.5 text-xs text-gray-600 font-medium">
                            📱 {d.deviceName || "Android Phone"}
                          </td>
                          <td className="py-3.5 text-xs text-gray-400">
                            {d.lastSeenAt ? new Date(d.lastSeenAt).toLocaleTimeString() : "Recent"}
                          </td>
                          <td className="py-3.5">
                            <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold ${
                              d.adminStatus === "active"
                                ? "bg-green-100 text-green-700 border border-green-200"
                                : "bg-gray-100 text-gray-600 border border-gray-200"
                            }`}>
                              <span className={`w-1.5 h-1.5 rounded-full ${d.adminStatus === "active" ? "bg-green-500" : "bg-gray-400"}`}></span>
                              {d.adminStatus === "active" ? "🔒 LOCKED (Uninstall Blocked)" : "🔓 UNLOCKED"}
                            </span>
                          </td>
                          <td className="py-3.5 text-right">
                            {d.adminStatus === "active" ? (
                              <button
                                onClick={() => unlockDevice(d.deviceId)}
                                className="px-3.5 py-1.5 bg-amber-500 hover:bg-amber-600 text-white rounded-lg text-xs font-bold shadow-sm transition"
                              >
                                🔓 Unlock Device (Allow Uninstall)
                              </button>
                            ) : (
                              <button
                                onClick={() => lockDevice(d.deviceId)}
                                className="px-3.5 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-xs font-bold shadow-sm transition"
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
              )}
            </div>
          )}

          {/* LOANS */}
          {tab === "loans" && (
            <div className="bg-white rounded-2xl shadow-sm p-5 sm:p-6 border border-gray-100">
              <h3 className="text-lg font-bold font-display mb-5">Loan Applications</h3>
              {loans.length === 0 ? <p className="text-gray-300 text-center py-10 text-sm">No loans yet</p> : (
                <div className="space-y-4">
                  {loans.map(l => {
                    const schedule = (l.installmentSchedule && l.installmentSchedule.length > 0) ? l.installmentSchedule : (l.emiSchedule || []);
                    const paidCount = schedule.filter(s => s.status === "paid").length;
                    const submittedCount = schedule.filter(s => s.status === "submitted").length;
                    const totalCount = schedule.length || l.installmentsCount || l.tenure || 0;
                    const isExpanded = expandedLoanId === l._id;

                    return (
                      <div key={l._id} className="border border-gray-200 rounded-2xl p-4 sm:p-5 hover:shadow-md transition">
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
                        {l.status === "pending" && (
                          <div className="flex gap-3">
                            <button onClick={() => approveLoan(l._id)} className="flex-1 sm:flex-none px-5 py-2.5 bg-gradient-to-r from-blue-600 to-indigo-600 text-white rounded-xl text-sm font-bold hover:shadow-lg transition">✅ Approve & Disburse</button>
                            <button onClick={() => rejectLoan(l._id)} className="flex-1 sm:flex-none px-5 py-2.5 bg-red-500 text-white rounded-xl text-sm font-bold hover:bg-red-600 transition">✗ Reject</button>
                          </div>
                        )}

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
                                                  onClick={() => setLightboxImg(inst.proofUrl)}
                                                  className="w-full py-1 px-2 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 rounded-lg text-[10px] font-bold border border-indigo-200 flex items-center justify-center gap-1 cursor-pointer"
                                                >
                                                  <span>🖼</span> View Screenshot Proof
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

              {/* Dual In-App Document Previews (Doc 1 & Doc 2) */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {/* Document 1: Aadhaar Card */}
                <div className="space-y-1.5 p-3 bg-gray-50 border border-gray-200 rounded-2xl">
                  <span className="text-xs font-bold text-blue-900 block flex items-center gap-1.5">
                    <span>🆔</span> Doc 1: Aadhaar Card Photo / PDF
                  </span>
                  {(previewKycUser.kycDocuments?.doc1Url || previewKycUser.kycDocuments?.docUrl) ? (
                    <div className="bg-white rounded-xl p-1.5 border border-gray-200 overflow-hidden relative group">
                      {(previewKycUser.kycDocuments.doc1Url || previewKycUser.kycDocuments.docUrl).startsWith("data:application/pdf") ? (
                        <iframe
                          src={previewKycUser.kycDocuments.doc1Url || previewKycUser.kycDocuments.docUrl}
                          title="Aadhaar PDF Preview"
                          className="w-full h-[200px] rounded-lg border border-gray-200"
                        />
                      ) : (
                        <img
                          src={previewKycUser.kycDocuments.doc1Url || previewKycUser.kycDocuments.docUrl}
                          alt="Aadhaar Preview"
                          className="max-h-[200px] max-w-full object-contain rounded-lg shadow-2xs cursor-zoom-in w-full"
                          onClick={() => setLightboxImg(previewKycUser.kycDocuments.doc1Url || previewKycUser.kycDocuments.docUrl)}
                        />
                      )}
                      <div className="absolute bottom-1 right-1 bg-black/50 text-white text-[10px] px-1.5 py-0.5 rounded-full opacity-0 group-hover:opacity-100 transition pointer-events-none">🔍 Click to zoom</div>
                    </div>
                  ) : (
                    <div className="p-8 text-center text-xs text-gray-400">No Aadhaar document file</div>
                  )}
                </div>

                {/* Document 2: PAN or Cheque */}
                <div className="space-y-1.5 p-3 bg-gray-50 border border-gray-200 rounded-2xl">
                  <span className="text-xs font-bold text-indigo-900 block flex items-center gap-1.5">
                    <span>💳</span> Doc 2: {previewKycUser.kycDocuments?.doc2Type === "cheque" ? "Bank Cheque" : "PAN Card"}
                  </span>
                  {previewKycUser.kycDocuments?.doc2Url ? (
                    <div className="bg-white rounded-xl p-1.5 border border-gray-200 overflow-hidden relative group">
                      {previewKycUser.kycDocuments.doc2Url.startsWith("data:application/pdf") ? (
                        <iframe
                          src={previewKycUser.kycDocuments.doc2Url}
                          title="Doc 2 PDF Preview"
                          className="w-full h-[200px] rounded-lg border border-gray-200"
                        />
                      ) : (
                        <img
                          src={previewKycUser.kycDocuments.doc2Url}
                          alt="Doc 2 Preview"
                          className="max-h-[200px] max-w-full object-contain rounded-lg shadow-2xs cursor-zoom-in w-full"
                          onClick={() => setLightboxImg(previewKycUser.kycDocuments.doc2Url)}
                        />
                      )}
                      <div className="absolute bottom-1 right-1 bg-black/50 text-white text-[10px] px-1.5 py-0.5 rounded-full opacity-0 group-hover:opacity-100 transition pointer-events-none">🔍 Click to zoom</div>
                    </div>
                  ) : (
                    <div className="p-8 text-center text-xs text-gray-400">No Doc 2 file uploaded</div>
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

      <Toast msg={toast} onHide={() => setToast({ text: "", type: "" })} />
    </div>
  );
}
