import { useState, useEffect, useCallback } from "react";
import Toast from "./components/Toast";
import StatusBadge from "./components/StatusBadge";

const API = import.meta.env.VITE_API_URL || "http://localhost:5000/api";

export default function AdminPanel() {
  const token = localStorage.getItem("token");
  const user = JSON.parse(localStorage.getItem("user") || "{}");
  useEffect(() => { if (!token || user.role !== "admin") window.location.href = "/"; }, []); // eslint-disable-line

  const headers = { "Content-Type": "application/json", Authorization: `Bearer ${token}` };
  const [tab, setTab] = useState("pending");
  const [stats, setStats] = useState({});
  const [pending, setPending] = useState([]);
  const [users, setUsers] = useState([]);
  const [loans, setLoans] = useState([]);
  const [notifications, setNotifications] = useState([]);
  const [unreadNotifs, setUnreadNotifs] = useState(0);
  const [toast, setToast] = useState({ text: "", type: "" });
  const [interestRate, setInterestRate] = useState(12);
  const [newInterestRate, setNewInterestRate] = useState("");
  const [commissionRate, setCommissionRate] = useState(2);
  const [newCommissionRate, setNewCommissionRate] = useState("");

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

  const loadAll = useCallback(() => {
    loadStats(); loadPending(); loadUsers(); loadLoans(); loadSettings(); loadNotifications();
  }, [loadStats, loadPending, loadUsers, loadLoans, loadSettings, loadNotifications]);

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

  const loanStatusColor = { pending: "bg-yellow-100 text-yellow-700", active: "bg-blue-100 text-blue-700", closed: "bg-green-100 text-green-700", rejected: "bg-red-100 text-red-700" };

  const tabs = [
    { key: "pending", label: "Pending", icon: "⏳", badge: pending.length },
    { key: "alerts", label: "Live Alerts", icon: "🔔", badge: unreadNotifs },
    { key: "loans", label: "Loans", icon: "🏦" },
    { key: "users", label: "Users", icon: "👥" },
    { key: "settings", label: "Settings", icon: "⚙️" },
  ];

  const logout = () => { localStorage.clear(); window.location.href = "/"; };

  const statCards = [
    { icon: "👥", label: "Total Users", value: stats.totalUsers ?? 0, g: "from-blue-500 to-blue-600" },
    { icon: "⏳", label: "Pending Txns", value: stats.pendingTxns ?? 0, g: "from-yellow-500 to-orange-500" },
    { icon: "💰", label: "Total Deposits", value: `₹${(stats.totalDeposits || 0).toLocaleString("en-IN")}`, g: "from-green-500 to-emerald-600" },
    { icon: "🏦", label: "Pending Loans", value: stats.pendingLoans ?? 0, g: "from-purple-500 to-pink-500" },
  ];

  return (
    <div className="bg-gray-50 min-h-[100dvh] lg:flex">
      {/* DESKTOP SIDEBAR */}
      <aside className="hidden lg:flex lg:flex-col w-64 shrink-0 bg-gradient-to-b from-gray-900 to-gray-800 text-white sticky top-0 h-screen">
        <div className="flex items-center gap-3 px-6 py-6 border-b border-white/10">
          <span className="text-2xl">🎓</span>
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
              <span className="text-2xl">🎓</span>
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

          {/* USERS */}
          {tab === "users" && (
            <div className="bg-white rounded-2xl shadow-sm p-5 sm:p-6 border border-gray-100">
              <h3 className="text-lg font-bold font-display mb-5">All Users</h3>
              {users.length === 0 ? (
                <p className="py-10 text-center text-gray-300 text-sm">No users found</p>
              ) : (
                <>
                  <div className="hidden md:block overflow-x-auto">
                    <table className="w-full">
                      <thead>
                        <tr className="text-left text-xs text-gray-400 uppercase border-b">
                          {["User", "Interest Rate (Custom)", "Card Tier", "Wallets", "Balance", "Referrals", "Status", "Action"].map(h => <th key={h} className="pb-3 font-semibold pr-3">{h}</th>)}
                        </tr>
                      </thead>
                      <tbody className="text-sm">
                        {users.map(u => (
                          <tr key={u._id} className="border-b border-gray-50 hover:bg-gray-50 transition">
                            <td className="py-3 pr-3">
                              <p className="font-semibold text-gray-900">{u.name}</p>
                              <p className="text-gray-400 text-xs">{u.email}</p>
                            </td>

                            {/* CUSTOM INTEREST RATE PER USER */}
                            <td className="py-3 pr-3">
                              <div className="flex items-center gap-1.5">
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
                                  className="px-2 py-1 bg-[#1D6AE5] hover:bg-[#1558cc] text-white rounded-lg text-[11px] font-bold shadow-2xs"
                                >
                                  Save
                                </button>
                              </div>
                            </td>

                            {/* SILVER / PLATINUM CARD TIER */}
                            <td className="py-3 pr-3">
                              <div className="space-y-1">
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
                                  className={`px-2 py-0.5 rounded-md text-[10px] font-bold transition ${
                                    u.cardTier === "platinum" || u.cardStatus?.platinum?.unlocked
                                      ? "bg-red-50 text-red-600 border border-red-200 hover:bg-red-100"
                                      : "bg-amber-50 text-amber-800 border border-amber-300 hover:bg-amber-100"
                                  }`}
                                >
                                  {u.cardTier === "platinum" || u.cardStatus?.platinum?.unlocked ? "Revoke VIP" : "👑 Unlock VIP"}
                                </button>
                              </div>
                            </td>

                            {/* WALLETS ACTIVE */}
                            <td className="py-3 pr-3">
                              <div className="flex items-center gap-1">
                                <span className="px-1.5 py-0.5 bg-emerald-50 border border-emerald-200 text-emerald-700 rounded text-[10px] font-bold" title="Savings (12% APY)">
                                  🏦 Savings
                                </span>
                                <span className={`px-1.5 py-0.5 border rounded text-[10px] font-bold ${u.wallets?.debit?.active ? "bg-blue-50 border-blue-200 text-blue-700" : "bg-gray-100 border-gray-200 text-gray-400"}`} title="Debit Wallet">
                                  💳 Debit
                                </span>
                                <span className={`px-1.5 py-0.5 border rounded text-[10px] font-bold ${u.wallets?.lending?.active ? "bg-purple-50 border-purple-200 text-purple-700" : "bg-gray-100 border-gray-200 text-gray-400"}`} title="Lending Wallet">
                                  🤝 Loans
                                </span>
                              </div>
                            </td>

                            <td className="py-3 pr-3 font-bold text-green-600">₹{u.balance.toLocaleString("en-IN")}</td>

                            <td className="py-3 pr-3">
                              <span className="bg-blue-50 text-blue-700 px-1.5 py-0.5 rounded text-xs font-mono font-bold">{u.referralCode || "—"}</span>
                              <span className="text-[10px] text-gray-400 ml-1">({u.referralCount || 0})</span>
                            </td>

                            <td className="py-3 pr-3">
                              <span className={`px-2.5 py-1 rounded-full text-xs font-bold ${u.isBlocked ? "bg-red-100 text-red-700" : "bg-green-100 text-green-700"}`}>
                                {u.isBlocked ? "🔴 Blocked" : "🟢 Active"}
                              </span>
                            </td>
                            <td className="py-3">
                              <button onClick={() => toggleBlock(u._id)} className={`px-3 py-1.5 rounded-lg text-xs font-bold text-white ${u.isBlocked ? "bg-green-500 hover:bg-green-600" : "bg-orange-500 hover:bg-orange-600"}`}>
                                {u.isBlocked ? "Unblock" : "Block"}
                              </button>
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
                          </div>
                          <span className={`px-2 py-0.5 rounded-full text-[11px] font-bold shrink-0 ${u.isBlocked ? "bg-red-100 text-red-700" : "bg-green-100 text-green-700"}`}>
                            {u.isBlocked ? "Blocked" : "Active"}
                          </span>
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

                        <button onClick={() => toggleBlock(u._id)} className={`w-full py-2 rounded-xl text-xs font-bold text-white ${u.isBlocked ? "bg-green-500 hover:bg-green-600" : "bg-orange-500 hover:bg-orange-600"}`}>
                          {u.isBlocked ? "Unblock User" : "Block User"}
                        </button>
                      </div>
                    ))}
                  </div>
                </>
              )}
            </div>
          )}

          {/* LOANS */}
          {tab === "loans" && (
            <div className="bg-white rounded-2xl shadow-sm p-5 sm:p-6 border border-gray-100">
              <h3 className="text-lg font-bold font-display mb-5">Loan Applications</h3>
              {loans.length === 0 ? <p className="text-gray-300 text-center py-10 text-sm">No loans yet</p> : (
                <div className="space-y-4">
                  {loans.map(l => (
                    <div key={l._id} className="border border-gray-200 rounded-2xl p-4 sm:p-5 hover:shadow-md transition">
                      <div className="flex justify-between items-start mb-3">
                        <div>
                          <h4 className="text-base sm:text-lg font-bold">{l.userId?.name}</h4>
                          <p className="text-xs text-gray-400">{l.userId?.email}</p>
                        </div>
                        <span className={`px-3 py-1 rounded-full text-xs font-bold shrink-0 ${loanStatusColor[l.status] || "bg-gray-100"}`}>{l.status.toUpperCase()}</span>
                      </div>
                      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-3 text-sm mb-4">
                        {[
                          { label: "Amount", value: `₹${l.amount.toLocaleString("en-IN")}` },
                          { label: "Rate (locked)", value: `${l.interestRate}% p.a.` },
                          { label: "EMI", value: `₹${l.emiAmount}` },
                          { label: "Tenure", value: `${l.tenure}m` },
                          { label: "Purpose", value: l.purpose || "N/A" },
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
                          <button onClick={() => approveLoan(l._id)} className="flex-1 sm:flex-none px-5 py-2.5 bg-gradient-to-r from-indigo-600 to-purple-600 text-white rounded-xl text-sm font-bold hover:shadow-lg transition">✅ Approve & Disburse</button>
                          <button onClick={() => rejectLoan(l._id)} className="flex-1 sm:flex-none px-5 py-2.5 bg-red-500 text-white rounded-xl text-sm font-bold hover:bg-red-600 transition">✗ Reject</button>
                        </div>
                      )}
                    </div>
                  ))}
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
            </div>
          )}
        </div>
      </div>

      <Toast msg={toast} onHide={() => setToast({ text: "", type: "" })} />
    </div>
  );
}
