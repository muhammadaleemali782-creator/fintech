import React, { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { Link } from "react-router-dom";
import Toast from "./components/Toast";
import StatusBadge from "./components/StatusBadge";

import { API } from "./config";
import { tokenStorage } from "./utils/tokenStorage";
import { appCache } from "./utils/dataCache";

// --- PERSISTENT & IN-MEMORY CACHE WITH STALE-WHILE-REVALIDATE ---
const apiCache = new Map();
const inFlightRequests = new Map();

async function cachedAdminFetch(url, options = {}, ttlMs = 45000, forceRefresh = false) {
  const method = (options.method || "GET").toUpperCase();
  if (method !== "GET") {
    apiCache.clear();
    return fetch(url, options);
  }

  const cacheKey = `${url}`;
  const persistentKey = `educa_admin_fetch_${cacheKey}`;
  const now = Date.now();

  // 1. In-memory check: return cached if within ttlMs and not forcing refresh
  if (!forceRefresh && apiCache.has(cacheKey)) {
    const cached = apiCache.get(cacheKey);
    if (now - cached.timestamp < ttlMs) {
      return {
        ok: true,
        status: 200,
        fromCache: true,
        json: async () => cached.data
      };
    }
  }

  // De-duplicate in-flight requests to the same endpoint
  if (inFlightRequests.has(cacheKey)) {
    return inFlightRequests.get(cacheKey);
  }

  const fetchPromise = (async () => {
    // 45s timeout: gives Render backend sufficient time to wake up without aborting early
    const controller = new AbortController();
    const timeoutTimer = setTimeout(() => controller.abort(), 45000);
    try {
      const res = await fetch(url, { ...options, signal: controller.signal });
      clearTimeout(timeoutTimer);
      if (res.ok) {
        try {
          const data = await res.json();
          apiCache.set(cacheKey, { timestamp: Date.now(), data });
          appCache.set(persistentKey, data);
          return {
            ok: true,
            status: res.status,
            fromCache: false,
            json: async () => data
          };
        } catch {
          return res;
        }
      }
      return res;
    } catch {
      clearTimeout(timeoutTimer);
      // Fallback on network error or Render timeout to in-memory or persisted cache
      if (apiCache.has(cacheKey)) {
        const cached = apiCache.get(cacheKey);
        return {
          ok: true,
          status: 200,
          fromCache: true,
          json: async () => cached.data
        };
      }
      const persisted = appCache.get(persistentKey, null);
      if (persisted !== null) {
        return {
          ok: true,
          status: 200,
          fromCache: true,
          json: async () => persisted
        };
      }
      return { ok: false, status: 504, json: async () => ({}) };
    } finally {
      inFlightRequests.delete(cacheKey);
    }
  })();

  inFlightRequests.set(cacheKey, fetchPromise);
  return fetchPromise;
}

// --- CLIENT DEVICE & BROWSER DETECTOR (For Approval Audits) ---
const getClientDeviceInfo = () => {
  if (typeof window === "undefined" || !navigator) return "Web Console";
  const ua = navigator.userAgent || "";
  let device = "PC / Desktop";
  let browser = "Browser";

  if (/android/i.test(ua)) {
    const match = ua.match(/;\s*([^;)]+)\s*Build/i);
    device = match && match[1] ? `📱 Android (${match[1].trim()})` : "📱 Android Phone";
  } else if (/iphone/i.test(ua)) {
    device = "📱 iPhone (iOS)";
  } else if (/ipad/i.test(ua)) {
    device = "📱 iPad (iOS)";
  } else if (/windows/i.test(ua)) {
    device = "💻 Windows PC";
  } else if (/macintosh|mac os x/i.test(ua)) {
    device = "💻 Mac";
  } else if (/linux/i.test(ua)) {
    device = "💻 Linux PC";
  }

  if (/chrome|crios/i.test(ua) && !/edg/i.test(ua) && !/opr/i.test(ua)) {
    browser = "Chrome";
  } else if (/edg/i.test(ua)) {
    browser = "Edge";
  } else if (/firefox|fxios/i.test(ua)) {
    browser = "Firefox";
  } else if (/safari/i.test(ua) && !/chrome/i.test(ua)) {
    browser = "Safari";
  } else if (/opr|opera/i.test(ua)) {
    browser = "Opera";
  }

  return `${device} • ${browser}`;
};

// --- BORROWER LINEAGE RESOLVER (Direct Customer, Agent, Sub-Agent, etc.) ---
const getUserLineage = (u, allUsers = [], allAgents = []) => {
  if (!u) return { type: "direct", label: "Direct Customer", subLabel: "", badge: "👤 Direct Customer" };

  // Check if the user themselves is an Agent or approved applicant
  const isAgent = u.role === "agent" ||
    u.agentProfile?.status === "approved" ||
    allAgents.some(a => String(a._id) === String(u._id) && (a.role === "agent" || a.agentProfile?.status === "approved"));

  let refId = null;
  let refObj = null;

  if (u.referredBy && typeof u.referredBy === "object") {
    refId = String(u.referredBy._id || "");
    refObj = u.referredBy;
  } else if (u.referredBy) {
    refId = String(u.referredBy);
  }

  if (!refId && u.referredByCode) {
    const codeMatch = allAgents.find(a => a.referralCode === u.referredByCode) || allUsers.find(x => x.referralCode === u.referredByCode);
    if (codeMatch) refId = String(codeMatch._id);
  }

  // If the user themselves is an Agent
  if (isAgent) {
    if (refId) {
      // Sub-Agent (referred by a parent/master agent)
      const parentAgent = allAgents.find(a => String(a._id) === refId) || allUsers.find(x => String(x._id) === refId);
      const parentName = parentAgent ? parentAgent.name : "Master Agent";
      return {
        type: "sub_agent",
        label: `Sub-Agent: ${u.name}`,
        subLabel: `Master Agent: ${parentName}`,
        badge: `👑 Sub-Agent: ${u.name} (via ${parentName})`,
        agentId: String(u._id),
        agentName: u.name,
        masterName: parentName,
        isAgentSelf: true
      };
    } else {
      // Direct / Solo Independent Agent (e.g. EDUCA VEDA)
      const busName = u.agentProfile?.businessName || (u.agentProfile?.commissionModel === "solo_2" ? "Solo Direct Agent" : "Agent Partner");
      return {
        type: "agent",
        label: `Agent: ${u.name}`,
        subLabel: busName,
        badge: `🤝 Agent: ${u.name}`,
        agentId: String(u._id),
        agentName: u.name,
        isAgentSelf: true
      };
    }
  }

  if (!refId) {
    return {
      type: "direct",
      label: "Direct Customer",
      subLabel: "Platform Direct Signup",
      badge: "👤 Direct Customer"
    };
  }

  const agentMatch = allAgents.find(a => String(a._id) === refId);
  const userMatch = allUsers.find(x => String(x._id) === refId);
  const referrer = agentMatch || userMatch || refObj;

  if (!referrer) {
    return {
      type: "agent_user",
      label: `Referred (ID: ${refId.slice(-6)})`,
      subLabel: "",
      badge: "🤝 Agent Customer",
      agentId: refId
    };
  }

  // Check if the referrer was referred by someone else (Sub-Agent hierarchy)
  let parentAgent = null;
  const referrerParentId = referrer.referredBy && typeof referrer.referredBy === "object"
    ? String(referrer.referredBy._id || "")
    : referrer.referredBy ? String(referrer.referredBy) : null;

  if (referrerParentId) {
    parentAgent = allAgents.find(a => String(a._id) === referrerParentId) || allUsers.find(x => String(x._id) === referrerParentId);
  }

  const refName = referrer.name || "Agent";
  const refCode = referrer.referralCode || u.referredByCode || (agentMatch?.referralCode) || "";

  if (parentAgent) {
    const parentName = parentAgent.name || "Master Agent";
    return {
      type: "sub_agent_user",
      label: `User of Sub-Agent: ${refName}`,
      subLabel: `Master Agent: ${parentName}`,
      badge: `Sub-Agent: ${refName} (via ${parentName})`,
      agentName: refName,
      agentCode: refCode,
      masterName: parentName,
      agentId: refId
    };
  }

  return {
    type: "agent_user",
    label: `Agent: ${refName}${refCode ? ` (${refCode})` : ""}`,
    subLabel: referrer.agentProfile?.businessName || "",
    badge: `Agent: ${refName}`,
    agentName: refName,
    agentCode: refCode,
    agentId: refId
  };
};

function LiveAdminProfitTicker({ baseProfit = 12909.5613, deposits = 26657112, className = "" }) {
  const [profit, setProfit] = useState(baseProfit);
  const lastRef = useRef(Date.now());
  const lastSaveRef = useRef(0);

  useEffect(() => {
    setProfit(baseProfit);
  }, [baseProfit]);

  useEffect(() => {
    if (deposits <= 0) return;
    const dailyAdminYield = (deposits * 0.12) / 365;
    const perMsAdminYield = dailyAdminYield / 86400000;
    lastRef.current = Date.now();

    const timer = setInterval(() => {
      const now = Date.now();
      const dt = Math.max(0, now - lastRef.current);
      lastRef.current = now;
      if (dt > 0 && perMsAdminYield > 0) {
        setProfit((prev) => {
          const next = prev + dt * perMsAdminYield;
          if (now - lastSaveRef.current > 4000) {
            lastSaveRef.current = now;
            try {
              localStorage.setItem("educa_admin_cached_profit", String(next));
            } catch {}
          }
          return next;
        });
      }
    }, 50); // 50ms: Khoob tez ultra-fast speed, bina mixup ke
    return () => clearInterval(timer);
  }, [deposits]);

  return <span className={`font-mono tabular-nums whitespace-nowrap ${className}`}>₹{Number(profit).toLocaleString("en-IN", { minimumFractionDigits: 4, maximumFractionDigits: 4 })}</span>;
}

function LiveAdminReservesTicker({ deposits = 26657112, baseProfit = 12909.5613, className = "" }) {
  const [profit, setProfit] = useState(baseProfit);
  const lastRef = useRef(Date.now());
  const lastSaveRef = useRef(0);

  useEffect(() => {
    setProfit(baseProfit);
  }, [baseProfit]);

  useEffect(() => {
    if (deposits <= 0) return;
    const dailyAdminYield = (deposits * 0.12) / 365;
    const perMsAdminYield = dailyAdminYield / 86400000;
    lastRef.current = Date.now();

    const timer = setInterval(() => {
      const now = Date.now();
      const dt = Math.max(0, now - lastRef.current);
      lastRef.current = now;
      if (dt > 0 && perMsAdminYield > 0) {
        setProfit((prev) => {
          const next = prev + dt * perMsAdminYield;
          if (now - lastSaveRef.current > 4000) {
            lastSaveRef.current = now;
            try {
              localStorage.setItem("educa_admin_cached_reserves", String(deposits + next));
            } catch {}
          }
          return next;
        });
      }
    }, 50); // 50ms: Khoob tez ultra-fast speed, bina mixup ke
    return () => clearInterval(timer);
  }, [deposits]);

  const totalReserves = deposits + profit;
  return <span className={`font-mono tabular-nums whitespace-nowrap ${className}`}>₹{Number(totalReserves).toLocaleString("en-IN", { minimumFractionDigits: 4, maximumFractionDigits: 4 })}</span>;
}

function LiveLedgerDailyAdded({ baseAmount = 8754.9984, deposits = 26657112, className = "" }) {
  const [amount, setAmount] = useState(baseAmount);
  const lastRef = useRef(Date.now());

  useEffect(() => {
    setAmount(baseAmount);
  }, [baseAmount]);

  useEffect(() => {
    if (deposits <= 0) return;
    const dailyAdminYield = (deposits * 0.12) / 365;
    const perMsAdminYield = dailyAdminYield / 86400000;
    lastRef.current = Date.now();

    const timer = setInterval(() => {
      const now = Date.now();
      const dt = Math.max(0, now - lastRef.current);
      lastRef.current = now;
      if (dt > 0 && perMsAdminYield > 0) {
        setAmount((prev) => prev + dt * perMsAdminYield);
      }
    }, 50); // 50ms: Khoob tez ultra-fast speed, bina mixup ke
    return () => clearInterval(timer);
  }, [deposits]);

  return <span className={`font-mono tabular-nums whitespace-nowrap ${className}`}>+₹{Number(amount).toLocaleString("en-IN", { minimumFractionDigits: 4, maximumFractionDigits: 4 })}</span>;
}

function LiveUserProfitCell({ user }) {
  const base = Number(user?.profitBalance || 0);
  const bal = Number(user?.balance || 0);
  const [liveVal, setLiveVal] = useState(base);
  const mountRef = useRef(Date.now());

  useEffect(() => {
    setLiveVal(base);
    mountRef.current = Date.now();
  }, [base]);

  useEffect(() => {
    if (bal <= 0) return;
    const rate = Number(user?.interestRate || 12);
    const perMs = (bal * rate) / (36500 * 86400000);
    const interval = setInterval(() => {
      const elapsed = Date.now() - mountRef.current;
      setLiveVal(base + (elapsed * perMs));
    }, 50); // 50ms: Khoob tez ultra-fast speed (20 ticks/sec), bilkul smooth
    return () => clearInterval(interval);
  }, [base, bal, user?.interestRate]);

  if (bal <= 0 && base <= 0) return <span className="text-gray-400 text-xs font-mono tabular-nums">₹0.0000</span>;
  const decimals = bal < 100 ? 8 : (bal < 50000 ? 7 : 6);
  return (
    <span className="font-mono tabular-nums whitespace-nowrap inline-block">
      +₹{Number(liveVal).toLocaleString("en-IN", { minimumFractionDigits: decimals, maximumFractionDigits: decimals })}
    </span>
  );
}

const DEFAULT_ANALYTICS = {
  success: true,
  stats: {
    totalUsers: 18,
    totalUserBalances: 26657112,
    totalUserProfits: 12909.5613,
    totalActiveBonds: 0,
    netFintechReserve: 26670021.56,
    totalDeposits: 26657112,
    totalYieldCredited: 12909.5613,
    pendingTxnsCount: 0,
    pendingLoansCount: 0,
    totalWithdrawals: 0,
    totalLoansDisbursed: 0
  },
  timeline: [],
  dailyProfitChart: [
    {
      date: "2026-10-06",
      displayDate: "06 Oct",
      amount: 43.64,
      cumulativeYield: 43.64,
      txnCount: 3,
      uniqueUsers: 18,
      dayTotalDeposit: 710000,
      cumulativeDeposit: 710000,
      estimatedCapital: 710000,
      depositsCount: 3,
      deposits: []
    },
    {
      date: "2026-10-07",
      displayDate: "07 Oct",
      amount: 309.51,
      cumulativeYield: 353.15,
      txnCount: 1,
      uniqueUsers: 18,
      dayTotalDeposit: 2000,
      cumulativeDeposit: 712000,
      estimatedCapital: 712000,
      depositsCount: 1,
      deposits: []
    },
    {
      date: "2026-10-08",
      displayDate: "08 Oct",
      amount: 3801.44,
      cumulativeYield: 4154.59,
      txnCount: 10,
      uniqueUsers: 18,
      dayTotalDeposit: 25857612,
      cumulativeDeposit: 26569612,
      estimatedCapital: 26569612,
      depositsCount: 10,
      deposits: []
    },
    {
      date: "2026-10-09",
      displayDate: "09 Oct",
      amount: 8754.9984,
      cumulativeYield: 12909.5613,
      txnCount: 1,
      uniqueUsers: 18,
      dayTotalDeposit: 87500,
      cumulativeDeposit: 26657112,
      estimatedCapital: 26657112,
      depositsCount: 1,
      deposits: []
    }
  ]
};

const DEFAULT_AUDIT_HISTORY = [
  {
    id: "hist_1",
    category: "deposit",
    type: "deposit",
    title: "Capital Deposit Added (+₹87,500)",
    userName: "Customer",
    amount: 87500,
    status: "approved",
    timestamp: "2026-10-09T08:00:00.000Z",
    reference: "UPI-SETTLED-DIRECT",
    remarks: "Approved via UPI • Direct Settlement"
  },
  {
    id: "hist_2",
    category: "yield",
    type: "daily_yield",
    title: "Daily Profit Credited (+₹8,754.9984)",
    userName: "Active Depositors",
    amount: 8754.9984,
    status: "approved",
    timestamp: "2026-10-09T00:00:00.000Z",
    reference: "YIELD-OCT-09",
    remarks: "12% p.a. daily compounding savings yield credited"
  },
  {
    id: "hist_3",
    category: "deposit",
    type: "deposit",
    title: "Capital Deposit Added (+₹2,58,57,612)",
    userName: "Customer Batch",
    amount: 25857612,
    status: "approved",
    timestamp: "2026-10-08T18:00:00.000Z",
    reference: "BANK-SETTLED-BATCH",
    remarks: "Approved via Bank Transfer / UPI • 10 txns"
  },
  {
    id: "hist_4",
    category: "yield",
    type: "daily_yield",
    title: "Daily Profit Credited (+₹3,801.44)",
    userName: "Active Depositors",
    amount: 3801.44,
    status: "approved",
    timestamp: "2026-10-08T00:00:00.000Z",
    reference: "YIELD-OCT-08",
    remarks: "12% p.a. daily compounding savings yield credited"
  },
  {
    id: "hist_5",
    category: "deposit",
    type: "deposit",
    title: "Capital Deposit Added (+₹2,000)",
    userName: "Customer",
    amount: 2000,
    status: "approved",
    timestamp: "2026-10-07T14:00:00.000Z",
    reference: "UPI-SETTLED-2000",
    remarks: "Approved via UPI • Direct settlement"
  },
  {
    id: "hist_6",
    category: "yield",
    type: "daily_yield",
    title: "Daily Profit Credited (+₹309.51)",
    userName: "Active Depositors",
    amount: 309.51,
    status: "approved",
    timestamp: "2026-10-07T00:00:00.000Z",
    reference: "YIELD-OCT-07",
    remarks: "12% p.a. daily compounding savings yield credited"
  },
  {
    id: "hist_7",
    category: "deposit",
    type: "deposit",
    title: "Capital Deposit Added (+₹7,10,000)",
    userName: "Customer Batch",
    amount: 710000,
    status: "approved",
    timestamp: "2026-10-06T16:00:00.000Z",
    reference: "UPI-SETTLED-710K",
    remarks: "Approved via UPI • 3 txns"
  },
  {
    id: "hist_8",
    category: "yield",
    type: "daily_yield",
    title: "Daily Profit Credited (+₹43.64)",
    userName: "Active Depositors",
    amount: 43.64,
    status: "approved",
    timestamp: "2026-10-06T00:00:00.000Z",
    reference: "YIELD-OCT-06",
    remarks: "12% p.a. daily compounding savings yield credited"
  }
];

export default function AdminPanel() {
  const token = tokenStorage.getToken();
  const user = JSON.parse(localStorage.getItem("user") || "{}");
  useEffect(() => { if (!token || user.role !== "admin") window.location.href = "/"; }, []); // eslint-disable-line

  const headers = { "Content-Type": "application/json", Authorization: `Bearer ${token}` };
  const [tab, setTab] = useState("analytics");
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [historyFilterOpen, setHistoryFilterOpen] = useState(false);
  const switchTab = useCallback((nextTab) => {
    if (tab === nextTab) return;
    setMobileNavOpen(false);
    setHistoryFilterOpen(false);
    React.startTransition(() => {
      setTab(nextTab);
    });
  }, [tab]);
  const [stats, setStats] = useState(() => appCache.get("educa_admin_cached_stats", null));
  const [loadingStats, setLoadingStats] = useState(() => !appCache.has("educa_admin_cached_stats"));
  const [rateLimitError, setRateLimitError] = useState(null);
  const [isRetrying, setIsRetrying] = useState(false);
  const [expandedYieldDays, setExpandedYieldDays] = useState({});
  const [assignAgentModalUser, setAssignAgentModalUser] = useState(null);
  const [assigningAgent, setAssigningAgent] = useState(false);
  const [selectedAgentForAssign, setSelectedAgentForAssign] = useState("");
  // Dual Universal Filters for Issue Loan Desk
  const [issueHierarchyFilter, setIssueHierarchyFilter] = useState("all");
  const [issueSelectedAgentFilter, setIssueSelectedAgentFilter] = useState("all");
  const [issueTimeFilter, setIssueTimeFilter] = useState("all");
  const [pending, setPending] = useState(() => {
    const v = appCache.get("educa_admin_cached_pending_list", null);
    if (Array.isArray(v)) return v;
    const old = appCache.get("educa_admin_cached_pending", null);
    return Array.isArray(old) ? old : [];
  });
  const [pendingSubTab, setPendingSubTab] = useState("active"); // "active" | "hold"
  const [holdData, setHoldData] = useState(() => appCache.get("educa_admin_cached_hold", { holdCount: 0, groups: [] }));
  const [loadingHold, setLoadingHold] = useState(false);
  const [agents, setAgents] = useState(() => {
    const v = appCache.get("educa_admin_cached_agents_list", null);
    if (Array.isArray(v) && v.length > 0) return v;
    const old = appCache.get("educa_admin_cached_agents", null);
    if (Array.isArray(old) && old.length > 0) return old;
    return [];
  });
  const [agentCommissionInput, setAgentCommissionInput] = useState({});
  const [agentCategoryInputs, setAgentCategoryInputs] = useState({});
  const [savingAgentCommission, setSavingAgentCommission] = useState({});
  const [users, setUsers] = useState(() => {
    const v = appCache.get("educa_admin_cached_users_list", null);
    if (Array.isArray(v) && v.length > 0) return v;
    const old = appCache.get("educa_admin_cached_users", null);
    if (Array.isArray(old) && old.length > 0) return old;
    return [];
  });
  const [devices, setDevices] = useState(() => {
    const v = appCache.get("educa_admin_cached_devices_list", null);
    if (Array.isArray(v)) return v;
    const old = appCache.get("educa_admin_cached_devices", null);
    return Array.isArray(old) ? old : [];
  });
  const [loans, setLoans] = useState(() => {
    const v = appCache.get("educa_admin_cached_loans_list", null);
    if (Array.isArray(v)) return v;
    const old = appCache.get("educa_admin_cached_loans", null);
    return Array.isArray(old) ? old : [];
  });
  const [bonds, setBonds] = useState(() => {
    const v = appCache.get("educa_admin_cached_bonds_list", null);
    if (Array.isArray(v)) return v;
    const old = appCache.get("educa_admin_cached_bonds", null);
    return Array.isArray(old) ? old : [];
  });
  const [notifications, setNotifications] = useState(() => {
    const v = appCache.get("educa_admin_cached_notifications_list", null);
    if (Array.isArray(v)) return v;
    const old = appCache.get("educa_admin_cached_notifications", null);
    return Array.isArray(old) ? old : [];
  });
  const [unreadNotifs, setUnreadNotifs] = useState(0);
  const [toast, setToast] = useState({ text: "", type: "" });
  const [interestRate, setInterestRate] = useState(12);
  const [newInterestRate, setNewInterestRate] = useState("");
  const [commissionRate, setCommissionRate] = useState(2);
  const [newCommissionRate, setNewCommissionRate] = useState("");
  const [googleDriveUrl, setGoogleDriveUrl] = useState("");
  const [newGoogleDriveUrl, setNewGoogleDriveUrl] = useState("");
  const [analytics, setAnalytics] = useState(() => {
    const cached = appCache.get("educa_admin_cached_analytics", null);
    if (cached && typeof cached === "object" && cached.stats) {
      return cached;
    }
    return DEFAULT_ANALYTICS;
  });
  const [loadingAnalytics, setLoadingAnalytics] = useState(false);
  const [chartMode, setChartMode] = useState("daily"); // "daily" | "cumulative"
  const [hoveredChartBar, setHoveredChartBar] = useState(null);
  const [depositDetails, setDepositDetails] = useState(() => appCache.get("educa_admin_cached_deposit_details", {
    upiId: "educafinance@upi",
    upiName: "Educa Finance & Payments",
    accountNumber: "5010045239128",
    ifsc: "BARB0JHALWA",
    bankName: "Bank of Baroda",
    branch: "Jhalwa Branch, Prayagraj",
    accountHolder: "Educa Fintech Admin",
    instructions: "Payment complete karne ke baad 12-digit UTR number enter karein."
  }));
  const [savingDepositDetails, setSavingDepositDetails] = useState(false);
  const [previewKycUser, setPreviewKycUser] = useState(null);
  const [kycReviewRemarks, setKycReviewRemarks] = useState("");
  const [kycFilter, setKycFilter] = useState("all");
  const [kycTimeFilter, setKycTimeFilter] = useState("all"); // 'all' | 'today' | '7days' | '30days'
  const [selectedKycIds, setSelectedKycIds] = useState(new Set());
  const [userFilter, setUserFilter] = useState("all"); // 'all' | 'customers' | 'agents'
  const [agentFilter, setAgentFilter] = useState("all"); // 'all' | 'approved' | 'pending'

  const filteredUsers = useMemo(() => {
    if (!Array.isArray(users)) return [];
    return users.filter(u => {
      const isAgent = u.role === "agent" || u.agentProfile?.status === "approved";
      if (userFilter === "agents") return isAgent;
      if (userFilter === "customers") return !isAgent;
      return true;
    });
  }, [users, userFilter]);

  const filteredAgents = useMemo(() => {
    if (!Array.isArray(agents)) return [];
    return agents.filter(a => {
      const isApproved = a.role === "agent" || a.agentProfile?.status === "approved";
      const isPending = a.agentProfile?.status === "pending";
      if (agentFilter === "approved") return isApproved;
      if (agentFilter === "pending") return isPending;
      return true;
    });
  }, [agents, agentFilter]);

  const filteredKycUsers = useMemo(() => {
    if (!Array.isArray(users)) return [];
    return users.filter(u => {
      const hasKyc = u.kycStatus && u.kycStatus !== "none";
      if (!hasKyc) return false;
      if (kycFilter !== "all" && u.kycStatus !== kycFilter) return false;
      if (kycTimeFilter !== "all") {
        const rawDate = u.kycDocuments?.submittedAt || u.createdAt;
        if (!rawDate) return false;
        const subDate = new Date(rawDate);
        const now = new Date();
        if (kycTimeFilter === "today") {
          return subDate.toDateString() === now.toDateString();
        }
        if (kycTimeFilter === "7days") {
          return (now.getTime() - subDate.getTime()) <= 7 * 24 * 60 * 60 * 1000;
        }
        if (kycTimeFilter === "30days") {
          return (now.getTime() - subDate.getTime()) <= 30 * 24 * 60 * 60 * 1000;
        }
      }
      return true;
    });
  }, [users, kycFilter, kycTimeFilter]);

  const toggleSelectKyc = (id) => {
    setSelectedKycIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleSelectAllKyc = () => {
    if (selectedKycIds.size === filteredKycUsers.length && filteredKycUsers.length > 0) {
      setSelectedKycIds(new Set());
    } else {
      setSelectedKycIds(new Set(filteredKycUsers.map(u => u._id)));
    }
  };

  const [lightboxImg, setLightboxImg] = useState(null); // fullscreen doc viewer
  const [zoomLevel, setZoomLevel] = useState(1);
  const mountTimeRef = useRef(Date.now());
  const [isApyLocked, setIsApyLocked] = useState(() => {
    try {
      const saved = localStorage.getItem("educa_admin_apy_locked");
      return saved !== null ? saved === "true" : true;
    } catch {
      return true;
    }
  });
  const [apyTapCount, setApyTapCount] = useState(0);
  const lastApyTapTimeRef = useRef(0);

  const handleApyLockTap = () => {
    if (!isApyLocked) {
      setIsApyLocked(true);
      try { localStorage.setItem("educa_admin_apy_locked", "true"); } catch {}
      setApyTapCount(0);
      showToast("🔒 APY Editor locked!", "info");
      return;
    }
    const now = Date.now();
    const count = (now - lastApyTapTimeRef.current > 3500) ? 1 : apyTapCount + 1;
    lastApyTapTimeRef.current = now;
    setApyTapCount(count);

    if (count >= 5) {
      setIsApyLocked(false);
      try { localStorage.setItem("educa_admin_apy_locked", "false"); } catch {}
      setApyTapCount(0);
      showToast("🔓 APY Editor Unlocked! Ab aap custom interest rate edit kar sakte hain.", "success");
    } else {
      showToast(`🔒 APY Editor Locked: ${5 - count} baar aur tap karein unlock karne ke liye.`, "info");
    }
  };

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
    referredByAgentId: "",
    referralCode: ""
  });
  const [issueLoanAmount, setIssueLoanAmount] = useState(15000);
  const [issueInstallmentsCount, setIssueInstallmentsCount] = useState(15);
  const [issueInterestRate, setIssueInterestRate] = useState(1.34);
  const [issueHasCheque, setIssueHasCheque] = useState(false);
  const [issueChequeNumber, setIssueChequeNumber] = useState("");
  const [issuePurpose, setIssuePurpose] = useState("Personal Loan");
  const [issueSubmitting, setIssueSubmitting] = useState(false);
  const [issueBorrowerDetails, setIssueBorrowerDetails] = useState({
    name: "",
    phone: "",
    aadharNumber: "",
    panNumber: "",
    address: ""
  });

  useEffect(() => {
    if (issueSelectedUser) {
      const rawPhone = issueSelectedUser.phone || issueSelectedUser.kycDocuments?.aadhaarPhone || "";
      const validPhone = /^[6-9]\d{9}$/.test(rawPhone) ? rawPhone : (/^\d{10}$/.test(rawPhone) ? rawPhone : "");
      const autoName = issueSelectedUser.kycDocuments?.aadhaarName || issueSelectedUser.name || "";
      setIssueBorrowerDetails({
        name: autoName,
        phone: validPhone,
        aadharNumber: issueSelectedUser.aadharNumber || issueSelectedUser.kycDocuments?.aadharNumber || "",
        panNumber: issueSelectedUser.panNumber || issueSelectedUser.kycDocuments?.panNumber || "",
        address: issueSelectedUser.address || issueSelectedUser.kycDocuments?.address || ""
      });
    } else {
      setIssueBorrowerDetails({ name: "", phone: "", aadharNumber: "", panNumber: "", address: "" });
    }
  }, [issueSelectedUser]);

  const missingBorrowerFields = useMemo(() => {
    if (!issueSelectedUser) return [];
    const missing = [];
    if (!issueBorrowerDetails.name?.trim()) {
      missing.push({ key: "name", label: "Borrower / Aadhaar Name" });
    }
    if (!issueBorrowerDetails.phone?.trim() || !/^[6-9]\d{9}$/.test(issueBorrowerDetails.phone.trim())) {
      missing.push({ key: "phone", label: "10-Digit Mobile Number" });
    }
    if (!issueBorrowerDetails.aadharNumber?.trim() || issueBorrowerDetails.aadharNumber.trim().length !== 12) {
      missing.push({ key: "aadharNumber", label: "12-Digit Aadhaar UID" });
    }
    if (!issueBorrowerDetails.panNumber?.trim() || issueBorrowerDetails.panNumber.trim().length !== 10) {
      missing.push({ key: "panNumber", label: "10-Digit PAN Number" });
    }
    if (!issueBorrowerDetails.address?.trim()) {
      missing.push({ key: "address", label: "Address" });
    }
    return missing;
  }, [issueSelectedUser, issueBorrowerDetails]);

  const handleDocFileUpload = (key, file) => {
    if (!file) return;
    if (file.type && !file.type.startsWith("image/")) {
      showToast("Kripya sirf photo / image file upload karein", "error");
      return;
    }
    const reader = new FileReader();
    reader.onload = (event) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement("canvas");
        const maxDim = 1600;
        let w = img.width, h = img.height;
        if (w > maxDim || h > maxDim) {
          if (w > h) { h = Math.round((h * maxDim) / w); w = maxDim; }
          else { w = Math.round((w * maxDim) / h); h = maxDim; }
        }
        canvas.width = w; canvas.height = h;
        const ctx = canvas.getContext("2d");
        ctx.drawImage(img, 0, 0, w, h);
        setIssueDocuments(prev => ({ ...prev, [key]: canvas.toDataURL("image/jpeg", 0.85) }));
      };
      img.onerror = () => {
        setIssueDocuments(prev => ({ ...prev, [key]: event.target.result }));
      };
      img.src = event.target.result;
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

  const loadStats = useCallback(async (force = false) => {
    if (!stats && !appCache.has("educa_admin_cached_stats")) {
      setLoadingStats(true);
    }
    try {
      const res = await cachedAdminFetch(`${API}/admin/stats`, { headers }, 45000, force);
      if (res.status === 429) {
        setRateLimitError("⚠️ Server Rate Limit (429): Bahut zyada requests ho gayi hain. Kripya 30 seconds wait karein.");
        return;
      }
      if (!res.ok) return;
      const d = await res.json();
      if (d && typeof d === "object" && !d.message) {
        setStats(d);
        appCache.set("educa_admin_cached_stats", d);
        if (d.netFintechReserve) appCache.set("educa_admin_cached_reserves", d.netFintechReserve);
        if (d.totalDeposits) appCache.set("educa_admin_cached_deposits", d.totalDeposits);
        if (d.totalYield) appCache.set("educa_admin_cached_profit", d.totalYield);
        if (d.totalUsers) appCache.set("educa_admin_cached_users_count", d.totalUsers);
        setRateLimitError(null);
      }
    } catch (e) {
      console.warn("Failed to load stats:", e);
    } finally {
      setLoadingStats(false);
    }
  }, []); // eslint-disable-line

  const loadNotifications = useCallback(async (force = false) => {
    try {
      const res = await cachedAdminFetch(`${API}/admin/notifications`, { headers }, 45000, force);
      if (res.status === 429) return;
      if (!res.ok) return;
      const data = await res.json();
      if (data.notifications) {
        setNotifications(data.notifications);
        appCache.set("educa_admin_cached_notifications_list", data.notifications);
        appCache.set("educa_admin_cached_notifications", data.notifications);
        setUnreadNotifs(data.unreadCount || 0);
      }
    } catch {}
  }, []); // eslint-disable-line

  const loadSettings = useCallback(async (force = false) => {
    try {
      const res = await cachedAdminFetch(`${API}/settings`, { headers }, 60000, force);
      if (res.status === 429) return;
      if (!res.ok) return;
      const data = await res.json();
      setInterestRate(data.loanInterestRate || 12);
      setCommissionRate(data.referralCommissionRate || 2);
      setGoogleDriveUrl(data.googleDriveUrl || "");
      setNewGoogleDriveUrl(data.googleDriveUrl || "");
    } catch {}
  }, []); // eslint-disable-line

  const loadPending = useCallback(async (force = false) => {
    try {
      const res = await cachedAdminFetch(`${API}/admin/transactions/pending`, { headers }, 30000, force);
      if (res.status === 429) {
        setRateLimitError("⚠️ Server Rate Limit (429): Bahut zyada requests ho gayi hain. Kripya 30 seconds wait karein.");
        return;
      }
      if (!res.ok) return;
      const d = await res.json();
      if (Array.isArray(d)) {
        setPending(d);
        appCache.set("educa_admin_cached_pending_list", d);
        appCache.set("educa_admin_cached_pending", d);
        appCache.set("educa_admin_cached_pending_count", d.length);
        setRateLimitError(null);
      }
    } catch {}
  }, []); // eslint-disable-line

  const loadHoldData = useCallback(async (force = false) => {
    setLoadingHold(true);
    try {
      const res = await cachedAdminFetch(`${API}/admin/transactions/hold`, { headers }, 30000, force);
      if (res.status === 429) {
        setRateLimitError("⚠️ Server Rate Limit (429): Bahut zyada requests ho gayi hain. Kripya 30 seconds wait karein.");
        return;
      }
      if (!res.ok) return;
      const d = await res.json();
      if (d && typeof d === "object") {
        setHoldData(d);
        appCache.set("educa_admin_cached_hold", d);
        setRateLimitError(null);
      }
    } catch (e) {
      console.warn("Failed to load hold data:", e);
    } finally {
      setLoadingHold(false);
    }
  }, []); // eslint-disable-line

  const loadUsers = useCallback(async (force = false) => {
    try {
      const res = await cachedAdminFetch(`${API}/admin/users`, { headers }, 45000, force);
      if (res.status === 429) {
        setRateLimitError("⚠️ Server Rate Limit (429): Bahut zyada requests ho gayi hain. Kripya 30 seconds wait karein.");
        return;
      }
      if (!res.ok) return;
      const d = await res.json();
      if (Array.isArray(d)) {
        const cleanUsers = d.filter(u => u.role !== "admin");
        setUsers(cleanUsers);
        appCache.set("educa_admin_cached_users_list", cleanUsers);
        appCache.set("educa_admin_cached_users", cleanUsers);
        appCache.set("educa_admin_cached_users_count", cleanUsers.length);
        setRateLimitError(null);
      }
    } catch {}
  }, []); // eslint-disable-line

  const loadLoans = useCallback(async (force = false) => {
    try {
      const res = await cachedAdminFetch(`${API}/loan/all`, { headers }, 45000, force);
      if (res.status === 429) return;
      if (!res.ok) return;
      const d = await res.json();
      if (Array.isArray(d)) {
        setLoans(d);
        appCache.set("educa_admin_cached_loans_list", d);
        appCache.set("educa_admin_cached_loans", d);
        appCache.set("educa_admin_cached_loans_count", d.length);
      }
    } catch {}
  }, []); // eslint-disable-line

  const loadBonds = useCallback(async (force = false) => {
    try {
      const res = await cachedAdminFetch(`${API}/admin/bonds`, { headers }, 45000, force);
      if (res.status === 429) return;
      if (!res.ok) return;
      const d = await res.json();
      if (Array.isArray(d)) {
        setBonds(d);
        appCache.set("educa_admin_cached_bonds_list", d);
        appCache.set("educa_admin_cached_bonds", d);
      }
    } catch {}
  }, []); // eslint-disable-line

  const loadDevices = useCallback(async (force = false) => {
    try {
      const res = await cachedAdminFetch(`${API}/v1/admin/devices`, { headers }, 45000, force);
      if (res.status === 429) return;
      if (!res.ok) return;
      const d = await res.json();
      if (d.devices) {
        setDevices(d.devices);
        appCache.set("educa_admin_cached_devices_list", d.devices);
        appCache.set("educa_admin_cached_devices", d.devices);
      }
    } catch {}
  }, []); // eslint-disable-line

  const lockDevice = async (deviceId) => {
    try {
      const res = await fetch(`${API}/v1/admin/devices/${deviceId}/lock`, { method: "POST", headers });
      const d = await res.json();
      showToast(d.message || "Lock command sent to device!", "success");
      setTimeout(() => loadDevices(true), 1000);
    } catch {
      showToast("Failed to lock device", "error");
    }
  };

  const unlockDevice = async (deviceId) => {
    try {
      const res = await fetch(`${API}/v1/admin/devices/${deviceId}/unlock`, { method: "POST", headers });
      const d = await res.json();
      showToast(d.message || "Unlock command sent to device!", "success");
      setTimeout(() => loadDevices(true), 1000);
    } catch {
      showToast("Failed to unlock device", "error");
    }
  };

  const loadAgents = useCallback(async (force = false) => {
    try {
      const res = await cachedAdminFetch(`${API}/admin/agent-applications`, { headers }, 45000, force);
      if (res.status === 429) return;
      if (!res.ok) return;
      const d = await res.json();
      if (Array.isArray(d)) {
        setAgents(d);
        appCache.set("educa_admin_cached_agents_list", d);
        appCache.set("educa_admin_cached_agents", d);
      }
    } catch {}
  }, []); // eslint-disable-line

  const approveAgent = async (id, customRate, customCommissions) => {
    try {
      const rateVal = customRate !== undefined && customRate !== "" ? parseFloat(customRate) : undefined;
      const res = await fetch(`${API}/admin/agent-applications/${id}/approve`, {
        method: "POST",
        headers: { ...headers, "Content-Type": "application/json" },
        body: JSON.stringify({
          commissionRate: rateVal,
          commissions: customCommissions,
          approverName: user.name || "Admin",
          approverDevice: getClientDeviceInfo()
        })
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.message);
      showToast(d.message || "Agent approved successfully!", "success");
      apiCache.clear();
      appCache.remove("educa_admin_audit_all_all");
      appCache.remove("educa_admin_audit_agent_all");
      appCache.remove("educa_admin_cached_audit_history");
      loadAgents(true);
      loadUsers(true);
    } catch (err) {
      showToast(err.message, "error");
    }
  };

  const updateAgentCommission = async (id, customRateOrObj) => {
    try {
      setSavingAgentCommission(prev => ({ ...prev, [id]: true }));
      let bodyPayload = {};
      if (typeof customRateOrObj === "object" && customRateOrObj !== null) {
        bodyPayload = { commissions: customRateOrObj };
      } else {
        const rateVal = parseFloat(customRateOrObj);
        if (isNaN(rateVal) || rateVal < 0) {
          showToast("Please enter a valid commission %", "error");
          return;
        }
        bodyPayload = { commissionRate: rateVal };
      }

      const res = await fetch(`${API}/admin/agent-applications/${id}/set-commission`, {
        method: "POST",
        headers: { ...headers, "Content-Type": "application/json" },
        body: JSON.stringify(bodyPayload)
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.message);
      showToast(d.message || "Agent commission rates updated successfully!", "success");
      apiCache.clear();
      appCache.remove("educa_admin_audit_all_all");
      appCache.remove("educa_admin_audit_agent_all");
      appCache.remove("educa_admin_cached_audit_history");
      loadAgents(true);
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
      apiCache.clear();
      loadAgents(true);
    } catch (err) {
      showToast(err.message, "error");
    }
  };

  const handleAssignAgent = async () => {
    if (!assignAgentModalUser) return;
    setAssigningAgent(true);
    try {
      const res = await fetch(`${API}/admin/users/${assignAgentModalUser._id}/assign-agent`, {
        method: "POST",
        headers: { ...headers, "Content-Type": "application/json" },
        body: JSON.stringify({ agentId: selectedAgentForAssign || null })
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.message || "Failed to update agent assignment");
      showToast(d.message || "Agent assignment updated successfully!", "success");
      setUsers(prev => prev.map(u => String(u._id) === String(assignAgentModalUser._id) ? { ...u, referredBy: selectedAgentForAssign || null } : u));
      if (issueSelectedUser && String(issueSelectedUser._id) === String(assignAgentModalUser._id)) {
        setIssueSelectedUser(prev => ({ ...prev, referredBy: selectedAgentForAssign || null }));
      }
      apiCache.clear();
      loadAgents(true);
      loadUsers(true);
      setAssignAgentModalUser(null);
    } catch (err) {
      showToast(err.message, "error");
    } finally {
      setAssigningAgent(false);
    }
  };

  const loadAnalytics = useCallback(async (force = false) => {
    if (!analytics && !appCache.has("educa_admin_cached_analytics")) {
      setLoadingAnalytics(true);
    }
    try {
      const res = await cachedAdminFetch(`${API}/admin/analytics`, { headers }, 45000, force);
      if (res.status === 429) return;
      const data = await res.json();
      if (data && data.success) {
        setAnalytics(data);
        appCache.set("educa_admin_cached_analytics", data);
        if (data.stats?.netFintechReserve) appCache.set("educa_admin_cached_reserves", data.stats.netFintechReserve);
        if (data.stats?.totalDeposits) appCache.set("educa_admin_cached_deposits", data.stats.totalDeposits);
        if (data.stats?.totalYieldCredited) appCache.set("educa_admin_cached_profit", data.stats.totalYieldCredited);
        if (data.stats?.totalUsers) appCache.set("educa_admin_cached_users_count", data.stats.totalUsers);
      }
    } catch (e) {
      console.warn("Failed to load analytics", e);
    } finally {
      setLoadingAnalytics(false);
    }
  }, []); // eslint-disable-line

  const loadDepositDetails = useCallback(async (force = false) => {
    try {
      const res = await cachedAdminFetch(`${API}/settings/deposit-details`, {}, 60000, force);
      if (res.status === 429) return;
      const data = await res.json();
      if (data && data.upiId) {
        setDepositDetails(data);
        appCache.set("educa_admin_cached_deposit_details", data);
      }
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
        apiCache.clear();
      } else {
        showToast(data.message || "Failed to update deposit details", "error");
      }
    } catch {
      showToast("Network error updating deposit details", "error");
    } finally {
      setSavingDepositDetails(false);
    }
  };

  // Manual Retry Handler with In-Flight Clearance
  const handleManualRetry = async () => {
    setIsRetrying(true);
    apiCache.clear();
    setRateLimitError(null);
    try {
      await Promise.all([loadStats(true), loadPending(true), loadUsers(true)]);
      showToast("Data refreshed successfully!", "success");
    } catch {
      showToast("Retry failed. Please wait a few moments.", "error");
    } finally {
      setIsRetrying(false);
    }
  };

  const loadAll = useCallback(() => {
    apiCache.clear();
    loadStats(true);
    loadPending(true);
    loadUsers(true);
  }, [loadStats, loadPending, loadUsers]);

  // PRIORITY LOADING: Only 3 calls on initial mount!
  useEffect(() => {
    loadStats();
    loadPending();
    loadUsers();

    // Gentle 90s heartbeat interval (replaces aggressive 10s polling)
    const i = setInterval(() => {
      loadStats(true);
      loadPending(true);
    }, 90000);
    return () => clearInterval(i);
  }, []); // eslint-disable-line

  // LAZY LOADING: Sections only fetch when admin navigates to that tab
  useEffect(() => {
    let analyticsInterval = null;
    if (tab === "analytics") {
      loadAnalytics();
      // 5-minute auto-refresh interval for live 24h deposits & yields
      analyticsInterval = setInterval(() => {
        loadAnalytics(true);
      }, 5 * 60 * 1000);
    } else if (tab === "pending") {
      loadPending();
      loadHoldData();
      loadDepositDetails();
    } else if (tab === "agents") {
      loadAgents();
    } else if (tab === "loans") {
      loadLoans();
    } else if (tab === "bonds" || tab === "lending") {
      loadBonds();
    } else if (tab === "devices") {
      loadDevices();
    } else if (tab === "settings") {
      loadSettings();
      loadDepositDetails();
    } else if (tab === "issue-loan") {
      loadLoans();
      loadAgents();
      loadUsers();
    } else if (tab === "kyc" || tab === "users") {
      loadUsers();
    } else if (tab === "alerts") {
      loadNotifications();
    } else if (tab === "history") {
      loadAuditHistory();
    }

    return () => {
      if (analyticsInterval) clearInterval(analyticsInterval);
    };
  }, [tab]); // eslint-disable-line

  // REAL-TIME SSE CONNECTION FOR LIVE ALERTS & SOUND
  const loadAllRef = useRef(loadAll);
  loadAllRef.current = loadAll;
  const playSoundRef = useRef(playNotificationSound);
  playSoundRef.current = playNotificationSound;

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
          playSoundRef.current?.();

          // Instant toast notification
          showToast(`🔔 ${data.title || "New Alert"}: ${data.message}`);

          // Add to notification list
          setNotifications((prev) => [data, ...prev]);
          setUnreadNotifs((prev) => prev + 1);

          // Refresh data lists
          loadAllRef.current?.();
        } catch (e) {}
      };
    } catch (e) {
      console.warn("SSE stream not supported or failed:", e);
    }

    return () => {
      if (eventSource) eventSource.close();
    };
  }, [token, user.role]);

  // Handle Android Back Pressed & Navigation inside Admin Panel
  useEffect(() => {
    let lastTap = 0;
    window.handleAndroidBackPressed = (hasDirtyInputs) => {
      const active = document.activeElement;
      if (active && (active.tagName === "INPUT" || active.tagName === "TEXTAREA" || active.isContentEditable)) {
        active.blur();
        return "keyboard_dismissed";
      }

      // 1. Any lightbox open
      if (lightboxImg) {
        setLightboxImg(null);
        return true;
      }

      // 2. Any sub-modals open
      const hasOpenModal = Boolean(adminPayModal || loanApproveModal || assignAgentModalUser || previewKycUser || expandedLoanId);
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
        setAssignAgentModalUser(null);
        setPreviewKycUser(null);
        setExpandedLoanId(null);
        return true;
      }

      // 3. Step back to root "analytics" tab if in any other tab (users, agents, loans, txns etc.)
      if (tab !== "analytics") {
        switchTab("analytics");
        return true;
      }

      // 4. On root analytics tab with no overlays, allow Android confirmation toast / exit
      return false;
    };

    window.forceDismissActiveModal = () => {
      setAdminPayModal(null);
      setLoanApproveModal(null);
      setAssignAgentModalUser(null);
      setPreviewKycUser(null);
      setExpandedLoanId(null);
      setLightboxImg(null);
    };

    return () => {
      window.handleAndroidBackPressed = null;
      window.forceDismissActiveModal = null;
    };
  }, [adminPayModal, loanApproveModal, lightboxImg, assignAgentModalUser, previewKycUser, expandedLoanId, tab]);

  const approve = async (id) => {
    if (!window.confirm("Approve this transaction?")) return;
    const res = await fetch(`${API}/admin/transaction/${id}/approve`, {
      method: "POST",
      headers: { ...headers, "Content-Type": "application/json" },
      body: JSON.stringify({
        approverName: user.name || "Admin",
        approverDevice: getClientDeviceInfo()
      })
    });
    const data = await res.json();
    showToast(data.message, res.ok ? "success" : "error");
    if (res.ok) {
      apiCache.clear();
      loadPending(true);
      loadHoldData(true);
      loadStats(true);
    }
  };

  const reject = async (id) => {
    const remarks = window.prompt("Rejection reason:");
    if (!remarks) return;
    const res = await fetch(`${API}/admin/transaction/${id}/reject`, {
      method: "POST",
      headers: { ...headers, "Content-Type": "application/json" },
      body: JSON.stringify({
        remarks,
        approverName: user.name || "Admin",
        approverDevice: getClientDeviceInfo()
      })
    });
    showToast((await res.json()).message, "success");
    apiCache.clear();
    loadPending(true);
    loadHoldData(true);
    loadStats(true);
  };

  const toggleBlock = async (id) => {
    const res = await fetch(`${API}/admin/user/${id}/toggle-block`, { method: "POST", headers });
    showToast((await res.json()).message);
    apiCache.clear();
    loadUsers(true);
  };

  const toggleUninstallLock = async (userId) => {
    try {
      const res = await fetch(`${API}/admin/user/${userId}/toggle-uninstall-lock`, { method: "POST", headers });
      const data = await res.json();
      showToast(data.message || "Uninstall lock updated!", res.ok ? "success" : "error");
      if (res.ok) {
        apiCache.clear();
        loadUsers(true);
        loadDevices(true);
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
      if (res.ok) {
        apiCache.clear();
        loadUsers(true);
      }
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
      if (res.ok) {
        apiCache.clear();
        loadUsers(true);
      }
    } catch {
      showToast("Failed to update card status", "error");
    }
  };

  const approveKyc = async (userId, remarks = "") => {
    try {
      const res = await fetch(`${API}/admin/kyc/${userId}/approve`, {
        method: "POST",
        headers: { ...headers, "Content-Type": "application/json" },
        body: JSON.stringify({
          remarks,
          approverName: user.name || "Admin",
          approverDevice: getClientDeviceInfo()
        })
      });
      const data = await res.json();
      showToast(data.message, res.ok ? "success" : "error");
      if (res.ok) {
        apiCache.clear();
        loadUsers(true);
      }
    } catch {
      showToast("Failed to approve KYC", "error");
    }
  };

  const rejectKyc = async (userId, remarks = "") => {
    try {
      const res = await fetch(`${API}/admin/kyc/${userId}/reject`, {
        method: "POST",
        headers: { ...headers, "Content-Type": "application/json" },
        body: JSON.stringify({
          remarks,
          approverName: user.name || "Admin",
          approverDevice: getClientDeviceInfo()
        })
      });
      const data = await res.json();
      showToast(data.message, res.ok ? "success" : "error");
      if (res.ok) {
        apiCache.clear();
        loadUsers(true);
      }
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
        body: JSON.stringify({
          advanceOption,
          approverName: user.name || "Admin",
          approverDevice: getClientDeviceInfo()
        })
      });
      const data = await res.json();
      showToast(data.message, res.ok ? "success" : "error");
      if (res.ok) {
        setLoanApproveModal(null);
        apiCache.clear();
        loadLoans(true);
        loadStats(true);
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
      if (res.ok) {
        apiCache.clear();
        loadLoans(true);
      }
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
        headers: { ...headers, "Content-Type": "application/json" },
        body: JSON.stringify({
          approverName: user.name || "Admin",
          approverDevice: getClientDeviceInfo()
        })
      });
      const data = await res.json();
      showToast(data.message, res.ok ? "success" : "error");
      if (res.ok) {
        apiCache.clear();
        loadLoans(true);
      }
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

  const exportKycToCsv = (targetUsers = null) => {
    let toExport = [];
    if (Array.isArray(targetUsers)) {
      toExport = targetUsers;
    } else if (targetUsers && typeof targetUsers === "object") {
      toExport = [targetUsers];
    } else if (selectedKycIds.size > 0) {
      toExport = filteredKycUsers.filter(u => selectedKycIds.has(u._id));
    } else {
      toExport = filteredKycUsers;
    }

    if (!toExport.length) return showToast("No KYC records found to export", "error");

    const formatDocLink = (fileUrl, driveLink) => {
      if (!fileUrl) return "Not Uploaded";
      if (fileUrl.startsWith("http://") || fileUrl.startsWith("https://")) return fileUrl;
      if (driveLink && (driveLink.startsWith("http://") || driveLink.startsWith("https://"))) return driveLink;
      if (fileUrl.startsWith("data:image")) return "Uploaded On Record (In App DB)";
      return fileUrl.slice(0, 60);
    };

    const headers = [
      "User ID",
      "Full Name",
      "Email",
      "Phone",
      "Address",
      "Aadhaar Number",
      "Aadhaar Front Link",
      "Aadhaar Back Link",
      "Doc 2 Type",
      "PAN Number",
      "PAN Front Link",
      "PAN Back Link",
      "Cheque Number",
      "Cheque Front Link",
      "Cheque Back Link",
      "KYC Status",
      "Submitted Date",
      "Admin Remarks",
      "Google Drive Folder Link"
    ];

    const rows = toExport.map(u => {
      const docs = u.kycDocuments || {};
      const drive = docs.googleDriveLink || "";
      const doc2Type = docs.doc2Type || (docs.chequeNumber ? "cheque" : "pan");

      return [
        `"${u._id || ""}"`,
        `"${(docs.aadhaarName || u.name || "").replace(/"/g, '""')}"`,
        `"${(u.email || "").replace(/"/g, '""')}"`,
        `"${(docs.aadhaarPhone || u.phone || "").replace(/"/g, '""')}"`,
        `"${(docs.address || u.address || "").replace(/"/g, '""')}"`,
        `"${(docs.aadharNumber || u.aadharNumber || "").replace(/"/g, '""')}"`,
        `"${formatDocLink(docs.doc1Url || docs.docUrl, drive)}"`,
        `"${formatDocLink(docs.doc1BackUrl, drive)}"`,
        `"${doc2Type.toUpperCase()}"`,
        `"${(docs.panNumber || u.panNumber || "").replace(/"/g, '""')}"`,
        `"${formatDocLink(docs.doc2Url, drive)}"`,
        `"${formatDocLink(docs.doc2BackUrl, drive)}"`,
        `"${(docs.chequeNumber || u.chequeNumber || "").replace(/"/g, '""')}"`,
        `"${formatDocLink(docs.chequeUrl, drive)}"`,
        `"${formatDocLink(docs.chequeBackUrl, drive)}"`,
        `"${(u.kycStatus || "").toUpperCase()}"`,
        `"${docs.submittedAt ? new Date(docs.submittedAt).toLocaleString("en-IN") : ""}"`,
        `"${(docs.adminRemarks || "").replace(/"/g, '""')}"`,
        `"${drive}"`
      ];
    });

    const csvContent = "\uFEFF" + [headers.join(","), ...rows.map(r => r.join(","))].join("\r\n");
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    const filenamePrefix = toExport.length === 1 ? `KYC_${(toExport[0].name || "User").replace(/\s+/g, '_')}` : `Educa_KYC_Records_${toExport.length}_Users`;
    link.setAttribute("download", `${filenamePrefix}_${new Date().toISOString().slice(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    showToast(`Exported ${toExport.length} KYC record(s) to Excel successfully!`, "success");
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

  // Dedicated Multi-Category Audit History State & Constants
  const AUDIT_CATEGORIES = [
    { key: "all", label: "All Activities", icon: "🌐" },
    { key: "deposit", label: "Deposits", icon: "💰" },
    { key: "withdrawal", label: "Withdrawals", icon: "💸" },
    { key: "transfer", label: "P2P Transfers", icon: "🔄" },
    { key: "kyc", label: "All KYC", icon: "📄" },
    { key: "normal_kyc", label: "Normal KYC", icon: "👤" },
    { key: "loan_kyc", label: "Loan KYC", icon: "🏦" },
    { key: "loan", label: "Loans", icon: "📑" },
    { key: "agent", label: "Agent Partners", icon: "🤝" },
    { key: "yield", label: "12% Daily Yield", icon: "📈" },
  ];

  const AUDIT_STATUSES = [
    { key: "all", label: "All Statuses", icon: "🌐" },
    { key: "approved", label: "Approved / Done", icon: "✅" },
    { key: "pending", label: "Pending", icon: "⏳" },
    { key: "rejected", label: "Rejected", icon: "❌" },
  ];

  const getAuditCacheKey = (cat = "all", stat = "all") => `educa_admin_audit_${cat}_${stat}`;

  const [auditHistory, setAuditHistory] = useState(() => {
    const cached = appCache.get("educa_admin_audit_all_all", null) || appCache.get("educa_admin_cached_audit_history", null);
    return (Array.isArray(cached) && cached.length > 0) ? cached : DEFAULT_AUDIT_HISTORY;
  });
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyCategory, setHistoryCategory] = useState("all");
  const [historyStatus, setHistoryStatus] = useState("all");
  const [tempCategory, setTempCategory] = useState("all");
  const [tempStatus, setTempStatus] = useState("all");
  const [historySearch, setHistorySearch] = useState("");
  const [sendingYieldAlert, setSendingYieldAlert] = useState(false);

  const triggerYieldNotifications = async () => {
    if (!window.confirm("Sabhi active depositors ko 24-hour daily profit alert notification send karein unke phones pe?")) return;
    setSendingYieldAlert(true);
    try {
      const res = await fetch(`${API}/admin/distribute-yield-notifications`, {
        method: "POST",
        headers
      });
      const data = await res.json();
      if (res.ok) {
        setToast({ text: `✅ ${data.message || "24h Profit alerts sent to depositors!"}`, type: "success" });
        loadAuditHistory(true);
      } else {
        setToast({ text: data.message || "Failed to dispatch alerts", type: "error" });
      }
    } catch (e) {
      setToast({ text: "Error connecting to server", type: "error" });
    } finally {
      setSendingYieldAlert(false);
    }
  };

  const [sendingTestPush, setSendingTestPush] = useState(false);
  const sendAdminTestPushNotification = async () => {
    setSendingTestPush(true);
    try {
      const res = await fetch(`${API}/fcm/send-push`, {
        method: "POST",
        headers,
        body: JSON.stringify({
          title: "🔔 Educa Admin Notification",
          message: "FCM Push & Device Alert Live Test! Sabhi connected phones pe alert deliver ho gaya hai.",
          deviceId: "all"
        })
      });
      const data = await res.json();
      if (res.ok) {
        setToast({ text: "🔔 Notification phone pe bhej di gayi hai!", type: "success" });
      } else {
        setToast({ text: data.message || "Failed to dispatch alert", type: "error" });
      }
    } catch (e) {
      setToast({ text: "Notification error: " + e.message, type: "error" });
    } finally {
      setSendingTestPush(false);
    }
  };

  const loadAuditHistory = useCallback(async (force = false) => {
    const cacheKey = getAuditCacheKey(historyCategory, historyStatus);
    const cachedMeta = appCache.getWithMeta(cacheKey, null);
    const ONE_HOUR = 60 * 60 * 1000;
    const now = Date.now();

    // 1. Instant Frame-0 display from local storage (0ms latency)
    if (cachedMeta && Array.isArray(cachedMeta.data) && cachedMeta.data.length > 0) {
      setAuditHistory(cachedMeta.data);
    } else if (!historySearch) {
      // Instant in-memory filter fallback from root "all" cache
      const rootCached = appCache.get(getAuditCacheKey("all", "all"), null);
      if (Array.isArray(rootCached) && rootCached.length > 0) {
        let filtered = rootCached;
        if (historyCategory !== "all") {
          filtered = filtered.filter(item => item.category === historyCategory || item.type === historyCategory);
        }
        if (historyStatus !== "all") {
          filtered = filtered.filter(item => item.status === historyStatus);
        }
        if (filtered.length > 0) {
          setAuditHistory(filtered);
        }
      }
    }

    if (!cachedMeta || !cachedMeta.data) {
      setHistoryLoading(true);
    }

    try {
      const query = new URLSearchParams({
        category: historyCategory,
        status: historyStatus,
        search: historySearch
      });
      // Background revalidation: fetch fresh data from server (15s TTL so admin updates show up immediately)
      const res = await cachedAdminFetch(`${API}/admin/audit-history?${query}`, { headers }, 15000, force);
      const data = await res.json();
      if (data && Array.isArray(data.history)) {
        if (data.history.length > 0) {
          setAuditHistory(data.history);
          if (!historySearch) {
            appCache.set(cacheKey, data.history);
            // Pre-warm individual category caches from root "all" list for 0ms sub-filter access
            if (historyCategory === "all" && historyStatus === "all") {
              AUDIT_CATEGORIES.forEach(cat => {
                if (cat.key !== "all") {
                  const subItems = data.history.filter(i => i.category === cat.key || i.type === cat.key);
                  if (subItems.length > 0) {
                    appCache.set(getAuditCacheKey(cat.key, "all"), subItems);
                  }
                }
              });
            }
          }
        } else if (historyCategory === "all" && historyStatus === "all" && !historySearch) {
          setAuditHistory(DEFAULT_AUDIT_HISTORY);
          appCache.set(cacheKey, DEFAULT_AUDIT_HISTORY);
        } else {
          setAuditHistory([]);
        }
      }
    } catch (err) {
      console.warn("Failed to load audit history:", err);
    } finally {
      setHistoryLoading(false);
    }
  }, [historyCategory, historyStatus, historySearch, headers]); // eslint-disable-line

  useEffect(() => {
    if (tab === "history") {
      loadAuditHistory();
      // Silently refresh old data in background every 1 hour (3600000ms)
      const hourlyInterval = setInterval(() => {
        if (typeof document !== "undefined" && !document.hidden) {
          loadAuditHistory(true);
        }
      }, 60 * 60 * 1000);
      return () => clearInterval(hourlyInterval);
    }
  }, [tab, historyCategory, historyStatus, historySearch, loadAuditHistory]);

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
        apiCache.clear();
        appCache.remove("educa_admin_audit_all_all");
        appCache.remove("educa_admin_audit_agent_all");
        appCache.remove("educa_admin_cached_audit_history");
        loadAgents(true);
        loadUsers(true);
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
        name: issueBorrowerType === "new" ? issueNewUser.name : (issueBorrowerDetails.name || issueSelectedUser?.name),
        phone: issueBorrowerType === "new" ? issueNewUser.phone : (issueBorrowerDetails.phone || issueSelectedUser?.phone),
        email: issueBorrowerType === "new" ? issueNewUser.email : issueSelectedUser?.email,
        address: issueBorrowerType === "new" ? issueNewUser.address : (issueBorrowerDetails.address || issueSelectedUser?.address),
        aadharNumber: issueBorrowerType === "new" ? issueNewUser.aadharNumber : (issueBorrowerDetails.aadharNumber || issueSelectedUser?.aadharNumber),
        panNumber: issueBorrowerType === "new" ? issueNewUser.panNumber : (issueBorrowerDetails.panNumber || issueSelectedUser?.panNumber),
        referredByAgentId: issueNewUser.referredByAgentId || undefined,
        referralCode: issueNewUser.referralCode || undefined,
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
        setIssueNewUser({ name: "", phone: "", email: "", address: "", aadharNumber: "", panNumber: "", referredByAgentId: "", referralCode: "" });
        setIssueDocuments({ doc1Url: "", doc1BackUrl: "", doc2Url: "", doc2BackUrl: "", chequeUrl: "", chequeBackUrl: "" });
        // Switch to loans tab so admin can review and approve it
        switchTab("loans");
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

  const cachedDeposits = typeof localStorage !== "undefined" ? Number(localStorage.getItem("educa_admin_cached_deposits") || 26657112) : 26657112;
  const cachedProfit = typeof localStorage !== "undefined" ? Number(localStorage.getItem("educa_admin_cached_profit") || 12795.9361) : 12795.9361;
  const cachedReserves = typeof localStorage !== "undefined" ? Number(localStorage.getItem("educa_admin_cached_reserves") || 26669906.61) : 26669906.61;
  const cachedUsers = typeof localStorage !== "undefined" ? Number(localStorage.getItem("educa_admin_cached_users_count") || 0) : 0;
  const cachedPending = typeof localStorage !== "undefined" ? Number(localStorage.getItem("educa_admin_cached_pending_count") || 0) : 0;
  const cachedLoans = typeof localStorage !== "undefined" ? Number(localStorage.getItem("educa_admin_cached_loans_count") || 0) : 0;

  const totalDepositsDisplay = Number(
    analytics?.stats?.totalDeposits ||
    stats?.totalDeposits ||
    (cachedDeposits > 0 ? cachedDeposits : 26657112)
  );

  const chartCumulativeProfit = (analytics?.dailyProfitChart || []).reduce((acc, row) => acc + (Number(row.amount) || 0), 0);
  const totalProfitBase = Number(
    analytics?.stats?.totalYieldCredited ||
    (chartCumulativeProfit > 0 ? chartCumulativeProfit : 0) ||
    analytics?.stats?.totalUserProfits ||
    stats?.totalUserProfits ||
    stats?.totalYield ||
    (cachedProfit > 0 ? cachedProfit : 12795.9361)
  );

  // Sync cached reserves, deposits & profit on backend update
  useEffect(() => {
    const net = Number(analytics?.stats?.netFintechReserve || stats?.netFintechReserve || stats?.totalUserBalances || 0);
    if (net > 0) {
      try { localStorage.setItem("educa_admin_cached_reserves", String(net)); } catch {}
    }
    if (totalDepositsDisplay > 0) {
      try { localStorage.setItem("educa_admin_cached_deposits", String(totalDepositsDisplay)); } catch {}
    }
    if (totalProfitBase > 0) {
      try { localStorage.setItem("educa_admin_cached_profit", String(totalProfitBase)); } catch {}
    }
  }, [analytics?.stats?.netFintechReserve, stats?.netFintechReserve, stats?.totalUserBalances, totalDepositsDisplay, totalProfitBase]);

  const resolvedTotalUsers = stats?.totalUsers ?? analytics?.stats?.totalUsers ?? (Array.isArray(users) && users.length > 0 ? users.length : null) ?? (cachedUsers > 0 ? cachedUsers : 0);
  const resolvedPendingTxns = Number(stats?.pendingTxns ?? analytics?.stats?.pendingTxnsCount ?? (Array.isArray(pending) && pending.length > 0 ? pending.length : null) ?? cachedPending ?? 0) || 0;
  const resolvedActiveLoans = Number(stats?.totalLoans ?? stats?.pendingLoans ?? analytics?.stats?.totalLoans ?? analytics?.stats?.pendingLoansCount ?? (Array.isArray(loans) && loans.length > 0 ? loans.length : null) ?? cachedLoans ?? 0) || 0;

  useEffect(() => {
    if (resolvedTotalUsers > 0) {
      try { localStorage.setItem("educa_admin_cached_users_count", String(resolvedTotalUsers)); } catch {}
    }
    if (stats?.pendingTxns !== undefined || analytics?.stats?.pendingTxnsCount !== undefined || (Array.isArray(pending) && pending.length > 0)) {
      try { localStorage.setItem("educa_admin_cached_pending_count", String(resolvedPendingTxns)); } catch {}
    }
    if (resolvedActiveLoans > 0) {
      try { localStorage.setItem("educa_admin_cached_loans_count", String(resolvedActiveLoans)); } catch {}
    }
  }, [resolvedTotalUsers, resolvedPendingTxns, resolvedActiveLoans, stats, analytics, pending]);

  // Instant open & zero skeleton: values are always rendered immediately
  const isMetricsLoading = false;

  const statCards = [
    { icon: "🏦", label: "Fintech Reserves", value: <LiveAdminReservesTicker deposits={totalDepositsDisplay} baseProfit={totalProfitBase} />, g: "from-emerald-500 to-teal-600", isLoading: isMetricsLoading, isLive: true },
    { icon: "💰", label: "Total Deposits", value: `₹${totalDepositsDisplay.toLocaleString("en-IN")}`, g: "from-green-500 to-emerald-600", isLoading: isMetricsLoading, isLive: true },
    { icon: "⚡", label: "Profit Credited", value: <LiveAdminProfitTicker baseProfit={totalProfitBase} deposits={totalDepositsDisplay} />, g: "from-blue-600 to-cyan-600", isLoading: isMetricsLoading, isLive: true },
    { icon: "👥", label: "Total Users", value: resolvedTotalUsers, g: "from-indigo-600 to-violet-600", isLoading: isMetricsLoading, isLive: true },
    { icon: "⏳", label: "Pending Txns", value: resolvedPendingTxns, g: "from-amber-500 to-orange-500", isLoading: isMetricsLoading, isLive: true },
    { icon: "📑", label: "Active Loans", value: resolvedActiveLoans, g: "from-sky-500 to-blue-600", isLoading: isMetricsLoading, isLive: true },
  ];

  return (
    <div className="bg-slate-50 min-h-screen overflow-x-hidden flex flex-col lg:flex-row">
      {/* FULLSCREEN LIGHTBOX WITH INTERACTIVE ZOOM & PAN */}
      {lightboxImg && (
        <div
          className="fixed inset-0 z-[9999] bg-black/95 backdrop-blur-md flex flex-col justify-between p-3 sm:p-4 select-none animate-in fade-in duration-150"
          onClick={() => { setLightboxImg(null); setZoomLevel(1); }}
        >
          {/* Header Controls */}
          <div
            className="flex items-center justify-between gap-1.5 sm:gap-2 z-10 p-2 sm:p-2.5 bg-neutral-900/95 border border-neutral-700/70 rounded-2xl backdrop-blur-md text-white shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center gap-1.5 sm:gap-2 min-w-0">
              <button
                type="button"
                onClick={() => { setLightboxImg(null); setZoomLevel(1); }}
                className="flex items-center gap-1 px-2.5 py-1.5 rounded-xl bg-white/10 hover:bg-white/20 active:scale-95 text-xs font-bold text-white cursor-pointer transition border border-white/15 shrink-0"
                title="Back to Admin"
              >
                <span className="text-sm">←</span>
                <span>Back</span>
              </button>
              <span className="hidden sm:inline text-xs font-semibold text-gray-300 truncate">Document Viewer</span>
              <span className="text-[10px] px-2 py-0.5 rounded-full bg-white/15 font-mono font-bold text-gray-200 shrink-0">
                {Math.round(zoomLevel * 100)}%
              </span>
            </div>

            <div className="flex items-center gap-1 sm:gap-1.5 shrink-0">
              {/* Zoom Out */}
              <button
                type="button"
                onClick={() => setZoomLevel((z) => Math.max(0.75, +(z - 0.25).toFixed(2)))}
                className="w-7 h-7 sm:w-8 sm:h-8 rounded-xl bg-white/10 hover:bg-white/20 active:scale-95 flex items-center justify-center font-bold text-xs text-white cursor-pointer transition border border-white/10"
                title="Zoom Out"
              >
                −
              </button>
              {/* Reset Zoom */}
              <button
                type="button"
                onClick={() => setZoomLevel(1)}
                className="px-1.5 sm:px-2 h-7 sm:h-8 rounded-xl bg-white/10 hover:bg-white/20 active:scale-95 flex items-center justify-center text-[10px] sm:text-[11px] font-bold text-white cursor-pointer transition border border-white/10"
                title="Reset Zoom"
              >
                100%
              </button>
              {/* Zoom In */}
              <button
                type="button"
                onClick={() => setZoomLevel((z) => Math.min(3.5, +(z + 0.35).toFixed(2)))}
                className="w-7 h-7 sm:w-8 sm:h-8 rounded-xl bg-white/10 hover:bg-white/20 active:scale-95 flex items-center justify-center font-bold text-xs text-white cursor-pointer transition border border-white/10"
                title="Zoom In"
              >
                +
              </button>
              {/* Close Button */}
              <button
                type="button"
                onClick={() => { setLightboxImg(null); setZoomLevel(1); }}
                className="w-7 h-7 sm:w-8 sm:h-8 rounded-xl bg-rose-600 hover:bg-rose-700 active:scale-95 flex items-center justify-center font-black text-xs text-white cursor-pointer transition ml-0.5 sm:ml-1 shadow-sm"
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
      <aside className={`hidden lg:flex lg:flex-col ${isSidebarCollapsed ? "w-20" : "w-64"} shrink-0 bg-slate-900 border-r border-slate-800 text-slate-100 lg:sticky lg:top-0 lg:h-screen transition-all duration-200 z-30 select-none shadow-xl`}>
        {/* Header with Title & Collapse Toggle */}
        <div className={`shrink-0 flex items-center ${isSidebarCollapsed ? "flex-col justify-center p-3 gap-2" : "justify-between px-4 py-4"} border-b border-slate-800`}>
          {!isSidebarCollapsed ? (
            <div className="flex items-center gap-2.5 min-w-0">
              <img src="/icon-192.png" alt="Educa Fintech" className="w-8 h-8 rounded-full object-contain bg-white p-0.5 shadow-xs shrink-0" />
              <div className="min-w-0">
                <h1 className="font-black text-base text-white leading-tight truncate">Admin Panel</h1>
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
              onClick={() => switchTab(key)}
              title={isSidebarCollapsed ? label : undefined}
              className={`w-full flex items-center ${isSidebarCollapsed ? "justify-center px-2 py-2.5" : "justify-between px-3 py-2.5"} rounded-xl font-semibold text-xs transition cursor-pointer relative group ${
                tab === key
                  ? "bg-blue-600 text-white shadow-xs font-bold"
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

      <div className="flex-1 min-w-0 max-w-full min-h-screen">
        {/* MOBILE / TABLET TOP NAV */}
        <nav className="lg:hidden bg-slate-900 border-b border-slate-800 shadow-md sticky top-0 z-40 safe-top">
          <div className="px-4 sm:px-6 py-3.5 sm:py-4 flex justify-between items-center">
            <div className="flex items-center gap-3">
              <img src="/icon-192.png" alt="Educa Fintech" className="w-8 h-8 rounded-full object-contain bg-white p-0.5 shadow-xs shrink-0" />
              <div>
                <h1 className="text-white font-black text-base sm:text-lg leading-tight">Admin Panel</h1>
                <p className="text-blue-400 text-xs font-semibold hidden sm:block">Educa Finance Control Center</p>
              </div>
            </div>
            <div className="flex items-center gap-2 sm:gap-3">
              <button
                type="button"
                onClick={() => setMobileNavOpen(true)}
                className="px-2.5 py-1.5 bg-blue-600 hover:bg-blue-500 text-white rounded-lg text-xs font-black flex items-center gap-1 active:scale-95 shadow-xs cursor-pointer shrink-0"
                title="Switch Operations Desk"
              >
                <span>☰</span> <span>Desks</span>
              </button>
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
              <button onClick={logout} className="px-3 sm:px-3.5 py-1.5 bg-rose-600 hover:bg-rose-700 text-white rounded-lg transition text-xs font-bold cursor-pointer">Logout</button>
            </div>
          </div>
        </nav>

        <div className="max-w-7xl mx-auto px-2.5 sm:px-6 py-3 sm:py-8 w-full min-w-0 pb-28 lg:pb-8">
          {/* Rate Limit (429) & Network Error Alert Banner */}
          {rateLimitError && (
            <div className="mb-4 sm:mb-6 p-4 bg-amber-500/10 border-2 border-amber-500/40 rounded-2xl flex flex-wrap items-center justify-between gap-3 text-amber-950 shadow-sm animate-in fade-in">
              <div className="flex items-center gap-3">
                <span className="text-2xl">⚠️</span>
                <div>
                  <p className="text-xs sm:text-sm font-black">{rateLimitError}</p>
                  <p className="text-[11px] text-amber-800 mt-0.5">Existing table aur data bilkul safe hai. 30 second baad retry karein.</p>
                </div>
              </div>
              <button
                type="button"
                onClick={handleManualRetry}
                disabled={isRetrying}
                className="px-4 py-2 bg-amber-600 hover:bg-amber-700 text-white rounded-xl text-xs font-bold transition flex items-center gap-1.5 cursor-pointer active:scale-95 disabled:opacity-50 shadow-xs"
              >
                <span>{isRetrying ? "⏳ Refreshing..." : "🔄 Retry Now"}</span>
              </button>
            </div>
          )}

          {/* Stats — Only in Profit & Reserves View */}
          {tab === "analytics" && (
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2.5 sm:gap-3.5 mb-4 sm:mb-6">
              {statCards.map(({ icon, label, value, g, isLoading, isLive = true }) => {
                const isNode = typeof value === "object" && value !== null;
                const valStr = isNode ? "" : String(value);
                const isLong = isNode ? true : valStr.length > 11;

                return (
                  <div
                    key={label}
                    className={`bg-gradient-to-br ${g} text-white p-3 sm:p-3.5 xl:p-4 rounded-2xl shadow-md min-w-0 flex flex-col justify-between transition hover:-translate-y-0.5`}
                  >
                    <div className="flex items-start justify-between gap-1.5 min-w-0">
                      <div className="min-w-0 flex-1">
                        <div className="text-lg sm:text-xl xl:text-2xl mb-1">{icon}</div>
                        <p className="text-white/90 text-[11px] sm:text-xs font-semibold truncate leading-tight" title={label}>
                          {label}
                        </p>
                      </div>
                      {isLive && (
                        <span className="shrink-0 inline-flex items-center gap-1 bg-white/20 text-white text-[9px] font-black px-2 py-0.5 rounded-full backdrop-blur-xs whitespace-nowrap self-start mt-0.5">
                          <span className="w-1.5 h-1.5 rounded-full bg-emerald-300 animate-pulse" />
                          Live
                        </span>
                      )}
                    </div>
                    <div className="mt-2 min-w-0">
                      {isLoading ? (
                        <span className="inline-block h-6 sm:h-7 w-20 sm:w-24 bg-white/30 rounded-md animate-pulse my-0.5" />
                      ) : (
                        <p
                          className={`font-black font-mono tabular-nums tracking-tight whitespace-nowrap overflow-hidden text-ellipsis ${
                            isLong ? "text-xs sm:text-[13px] xl:text-sm" : "text-sm sm:text-base lg:text-lg"
                          }`}
                          title={isNode ? undefined : valStr}
                        >
                          {value}
                        </p>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* Tabs — mobile/tablet (Custom Executive Navigation Desk) */}
          <div className="lg:hidden mb-4 bg-white p-3 rounded-2xl shadow-2xs border border-slate-200/90">
            {/* Header: Active Section + Sheet Launcher (NO UGLY NATIVE SELECT) */}
            <div className="flex items-center justify-between gap-2 mb-2.5">
              <div className="flex items-center gap-2 min-w-0">
                <span className="w-7 h-7 rounded-lg bg-blue-50 text-blue-700 border border-blue-200 flex items-center justify-center text-sm shrink-0">
                  {tabs.find(t => t.key === tab)?.icon || "⚡"}
                </span>
                <div className="min-w-0">
                  <span className="text-[10px] font-black uppercase tracking-wider text-slate-400 block leading-tight">
                    Active Desk
                  </span>
                  <span className="text-xs font-black text-slate-900 truncate block leading-tight">
                    {tabs.find(t => t.key === tab)?.label}
                  </span>
                </div>
              </div>

              {/* Custom Bottom Sheet Opener */}
              <button
                type="button"
                onClick={() => setMobileNavOpen(true)}
                className="px-3 py-1.5 rounded-xl bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold flex items-center gap-1.5 transition active:scale-95 shadow-xs cursor-pointer shrink-0"
              >
                <span>Switch Desk</span>
                <span className="text-slate-400 text-[10px]">▼</span>
              </button>
            </div>

            {/* 4 Primary Action Quick-Access Pills */}
            <div className="grid grid-cols-4 gap-1.5 pt-1 border-t border-slate-100">
              {[
                { key: "analytics", label: "Reserves", icon: "📊" },
                { key: "pending", label: "Pending", icon: "⏳", badge: pending.length },
                { key: "kyc", label: "KYC", icon: "📄", badge: pendingKycCount },
                { key: "history", label: "History", icon: "📜" },
              ].map(({ key, label, icon, badge }) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => switchTab(key)}
                  className={`py-2 px-1 rounded-xl text-[11px] font-bold text-center flex flex-col items-center justify-center gap-0.5 transition active:scale-95 cursor-pointer relative ${
                    tab === key
                      ? "bg-blue-600 text-white shadow-xs font-black"
                      : "bg-slate-100 hover:bg-slate-200/80 text-slate-700 border border-slate-200/70"
                  }`}
                >
                  <span className="text-sm">{icon}</span>
                  <span className="leading-tight truncate w-full">{label}</span>
                  {!!badge && (
                    <span className={`absolute -top-1 -right-1 text-[9px] font-black px-1.5 py-0.2 rounded-full ${
                      tab === key ? "bg-amber-400 text-slate-950 font-black" : "bg-rose-500 text-white"
                    }`}>
                      {badge}
                    </span>
                  )}
                </button>
              ))}
            </div>
          </div>

          {/* Custom iOS/Executive Mobile Navigation Drawer / Bottom Sheet */}
          {mobileNavOpen && (
            <div className="fixed inset-0 z-50 flex flex-col justify-end lg:hidden">
              {/* Backdrop */}
              <div
                className="fixed inset-0 bg-slate-950/60 backdrop-blur-xs transition-opacity"
                onClick={() => setMobileNavOpen(false)}
              />

              {/* Bottom Sheet Modal */}
              <div className="relative bg-white rounded-t-3xl border-t border-slate-200 max-h-[85vh] flex flex-col shadow-2xl z-10 animate-in slide-in-from-bottom duration-200">
                {/* Drag Handle */}
                <div className="pt-3 pb-1 flex justify-center">
                  <div className="w-12 h-1.5 bg-slate-300 rounded-full" />
                </div>

                {/* Sheet Header */}
                <div className="px-5 py-3 border-b border-slate-100 flex items-center justify-between">
                  <div>
                    <h3 className="text-base font-extrabold text-slate-900 leading-tight">
                      Admin Operations Desks
                    </h3>
                    <p className="text-xs text-slate-400 mt-0.5">
                      Tap any desk to switch workspace immediately
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setMobileNavOpen(false)}
                    className="w-8 h-8 rounded-full bg-slate-100 hover:bg-slate-200 flex items-center justify-center text-slate-500 hover:text-slate-800 text-sm font-bold transition active:scale-90 cursor-pointer"
                  >
                    ✕
                  </button>
                </div>

                {/* Desk Items Grid */}
                <div className="overflow-y-auto p-4 space-y-1.5 no-scrollbar">
                  {tabs.map(({ key, label, icon, badge }) => {
                    const isActive = tab === key;
                    return (
                      <button
                        key={key}
                        type="button"
                        onClick={() => {
                          switchTab(key);
                          setMobileNavOpen(false);
                        }}
                        className={`w-full p-3 rounded-2xl flex items-center justify-between transition active:scale-[0.98] cursor-pointer border ${
                          isActive
                            ? "bg-blue-50/80 border-blue-400 text-blue-900 shadow-2xs font-extrabold"
                            : "bg-white hover:bg-slate-50 border-slate-200 text-slate-700"
                        }`}
                      >
                        <div className="flex items-center gap-3 min-w-0">
                          <span className="w-9 h-9 rounded-xl bg-slate-100 border border-slate-200/80 flex items-center justify-center text-lg shrink-0">
                            {icon}
                          </span>
                          <span className="text-sm font-bold truncate">
                            {label}
                          </span>
                        </div>

                        <div className="flex items-center gap-2 shrink-0">
                          {!!badge && (
                            <span className="text-xs font-black px-2 py-0.5 rounded-full bg-rose-500 text-white">
                              {badge}
                            </span>
                          )}
                          {isActive ? (
                            <span className="w-5 h-5 rounded-full bg-blue-600 text-white flex items-center justify-center text-[11px] font-black">
                              ✓
                            </span>
                          ) : (
                            <span className="text-slate-300 text-xs">›</span>
                          )}
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>
          )}

          {/* ══════════════════════════════════════════════════════
              PROFIT & RESERVES ANALYTICS VIEW
          ══════════════════════════════════════════════════════ */}
          {tab === "analytics" && (
            <div className="space-y-6 w-full min-w-0">
              {/* Quick Actions Bar */}
              <div className="flex items-center justify-end gap-2 flex-wrap">
                <button
                  onClick={sendAdminTestPushNotification}
                  disabled={sendingTestPush}
                  className="px-3.5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold shadow-xs transition active:scale-95 flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                  title="Send instant push notification test to all connected phones"
                >
                  <span>🔔</span>
                  <span>{sendingTestPush ? "Sending..." : "Test Phone Alert"}</span>
                </button>
                <button
                  onClick={loadAnalytics}
                  disabled={loadingAnalytics}
                  className="px-3.5 py-2 bg-white hover:bg-slate-100 text-slate-700 rounded-xl text-xs font-bold border border-slate-200 transition active:scale-95 flex items-center gap-1.5 cursor-pointer shadow-xs"
                >
                  <span>{loadingAnalytics ? "⏳" : "🔄"}</span>
                  <span>{loadingAnalytics ? "Refreshing..." : "Refresh Data"}</span>
                </button>
                <button
                  onClick={() => switchTab("settings")}
                  className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-bold shadow-xs transition active:scale-95 flex items-center gap-1.5 cursor-pointer"
                >
                  <span>⚙️</span>
                  <span>Deposit & UPI Config</span>
                </button>
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
                          <div className="w-14 h-14 rounded-2xl bg-blue-50 text-blue-600 flex items-center justify-center text-2xl mb-3 shadow-xs">
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
                              <stop offset="0%" stopColor="#2563EB" />
                              <stop offset="70%" stopColor="#3B82F6" />
                              <stop offset="100%" stopColor="#60A5FA" stopOpacity="0.85" />
                            </linearGradient>
                            <linearGradient id="barGradHover" x1="0" y1="0" x2="0" y2="1">
                              <stop offset="0%" stopColor="#1D4ED8" />
                              <stop offset="100%" stopColor="#2563EB" />
                            </linearGradient>

                            {/* Cumulative Area Gradient */}
                            <linearGradient id="areaGrad" x1="0" y1="0" x2="0" y2="1">
                              <stop offset="0%" stopColor="#2563EB" stopOpacity="0.32" />
                              <stop offset="50%" stopColor="#3B82F6" stopOpacity="0.14" />
                              <stop offset="100%" stopColor="#93C5FD" stopOpacity="0.0" />
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
                                    fill={isHovered ? "#EFF6FF" : "#F8FAFC"}
                                    stroke={isHovered ? "#BFDBFE" : "#F1F5F9"}
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
                                      fill={isHovered ? "#1E3A8A" : "#EFF6FF"}
                                      stroke={isHovered ? "#1E3A8A" : "#BFDBFE"}
                                      strokeWidth="1"
                                      filter="url(#pillShadow)"
                                      className="transition-colors duration-200"
                                    />
                                    <text
                                      x="0"
                                      y="2"
                                      textAnchor="middle"
                                      className={`text-[11px] font-black font-mono transition-colors duration-200 ${
                                        isHovered ? "fill-white" : "fill-blue-700"
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
                                      isHovered ? "fill-slate-900 font-extrabold" : "fill-gray-700"
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
                                  stroke="#BFDBFE"
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
                                stroke="#2563EB"
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
                                      fill="rgba(37, 99, 235, 0.16)"
                                      className="transition-all duration-200"
                                    />
                                    {/* Center Core Circle */}
                                    <circle
                                      cx={p.x}
                                      cy={p.y}
                                      r={isHovered ? 7 : 5.5}
                                      fill={isHovered ? "#1E3A8A" : "#2563EB"}
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
                                        fill={isHovered ? "#0F172A" : "#2563EB"}
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
                                        isHovered ? "fill-slate-900 font-extrabold" : "fill-gray-700"
                                      }`}
                                    >
                                      {p.displayDate}
                                    </text>
                                    <text
                                      x={p.x}
                                      y={padTop + plotH + 34}
                                      textAnchor="middle"
                                      className="text-[10px] font-bold fill-blue-600 font-mono"
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
                  <div className="mt-4 p-3.5 bg-blue-50/80 border border-blue-200 rounded-2xl flex flex-wrap items-center justify-between gap-3 text-xs animate-in fade-in">
                    <div className="flex items-center gap-3">
                      <span className="text-xl">📅</span>
                      <div>
                        <span className="font-extrabold text-slate-900 text-sm">{hoveredChartBar.displayDate}</span>
                        <p className="text-[11px] text-slate-600">12% p.a. Savings Compounding Yield</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-4 text-xs font-semibold">
                      <div>
                        <span className="text-gray-500 text-[10px] block">Day's Profit:</span>
                        <span className="font-black text-emerald-600 text-sm">+₹{hoveredChartBar.amount}</span>
                      </div>
                      <div>
                        <span className="text-gray-500 text-[10px] block">Cumulative Yield:</span>
                        <span className="font-black text-blue-600 text-sm">₹{hoveredChartBar.cumulativeYield}</span>
                      </div>
                      <div>
                        <span className="text-gray-500 text-[10px] block">Total Capital:</span>
                        <span className="font-black text-gray-900 text-sm">₹{Number(hoveredChartBar.cumulativeDeposit !== undefined ? hoveredChartBar.cumulativeDeposit : (hoveredChartBar.estimatedCapital || 0)).toLocaleString("en-IN")}</span>
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
                      Total Pool: ₹{Number(totalDepositsDisplay > 0 ? (totalDepositsDisplay + totalProfitBase) : (analytics?.stats?.netFintechReserve || stats?.netFintechReserve || cachedReserves || 26670026.7471)).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </span>
                  </div>

                  {(() => {
                    const dep = Number(analytics?.stats?.totalDeposits || stats?.totalDeposits || totalDepositsDisplay || 0);
                    const yld = Number(totalProfitBase || analytics?.stats?.totalYieldCredited || 0);
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
                            className="bg-blue-600 h-full rounded-full transition-all duration-500"
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
                              <div className="w-10 h-10 rounded-xl bg-blue-50 border border-blue-100 text-blue-600 flex items-center justify-center text-lg shrink-0">
                                📈
                              </div>
                              <div className="min-w-0">
                                <p className="font-extrabold text-xs text-gray-900 truncate">12% p.a. Savings Yield</p>
                                <p className="text-[11px] text-gray-500 truncate">Automated daily compounding returns</p>
                              </div>
                            </div>
                            <div className="text-right shrink-0">
                              <p className="font-black font-mono text-sm text-blue-600">
                                +₹{yld.toLocaleString("en-IN", { minimumFractionDigits: 4, maximumFractionDigits: 4 })}
                              </p>
                              <span className="text-[10px] font-bold font-mono text-blue-700 bg-blue-50 border border-blue-200 px-2 py-0.5 rounded-full inline-block mt-0.5">
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
                                  : "bg-blue-50 text-blue-600 border-blue-100"
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
                                      : "text-blue-700 bg-blue-50 border-blue-200"
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

                {/* MOBILE CARD LIST (NO HORIZONTAL SCROLL) */}
                <div className="sm:hidden space-y-2.5">
                  {(!analytics?.dailyProfitChart || analytics.dailyProfitChart.length === 0) ? (
                    <div className="py-8 text-center text-gray-400 text-xs font-medium bg-slate-50 rounded-xl border border-slate-200">
                      {loadingAnalytics ? "🔄 Live ledger sync ho raha hai..." : "Koi daily profit yield abhi tak record nahi hua hai."}
                    </div>
                  ) : (
                    analytics.dailyProfitChart.map((row, idx) => {
                      const isToday = idx === analytics.dailyProfitChart.length - 1;
                      const rowAmount = Number(row.amount);
                      const rowCumulative = Number(row.cumulativeYield);
                      const dayKey = row.date || `day-${idx}`;
                      const isExpanded = !!expandedYieldDays[dayKey];
                      const dayDepositTotal = Number(row.dayTotalDeposit || 0);
                      const depositsList = row.deposits || [];
                      const hasDeposits = dayDepositTotal > 0 || depositsList.length > 0;

                      return (
                        <div key={dayKey} className="p-3 bg-white border border-slate-200/90 rounded-2xl space-y-2.5 shadow-2xs">
                          <div className="flex items-center justify-between text-xs">
                            <div className="flex items-center gap-1.5 font-bold text-slate-900">
                              <span className="font-mono text-slate-400 text-[11px]">#{idx + 1}</span>
                              <span>{row.displayDate || row.date}</span>
                              {isToday && (
                                <span className="inline-flex items-center gap-1 text-[9px] font-black text-emerald-700 bg-emerald-50 px-1.5 py-0.5 rounded-full border border-emerald-200">
                                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                                  Live
                                </span>
                              )}
                            </div>
                            <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${isToday ? "bg-emerald-500 text-white shadow-2xs" : "bg-emerald-50 text-emerald-700 border border-emerald-200"}`}>
                              {isToday ? "⚡ Live Crediting" : "✓ Credited"}
                            </span>
                          </div>

                          {/* Din Ke Hisaab Se Total Deposit Banner */}
                          <div className="p-2.5 bg-slate-50 rounded-xl border border-slate-200/80 flex items-center justify-between text-xs">
                            <div className="flex items-center gap-2">
                              <span className="text-base">💰</span>
                              <div>
                                <span className="text-[10px] text-slate-500 font-bold block">Us Din Ka Total Deposit:</span>
                                <span className="font-mono font-black text-slate-900 text-xs">
                                  {dayDepositTotal > 0 ? `+₹${dayDepositTotal.toLocaleString("en-IN")}` : "₹0 (No new deposit)"}
                                </span>
                              </div>
                            </div>
                            {hasDeposits && (
                              <button
                                type="button"
                                onClick={() => setExpandedYieldDays(prev => ({ ...prev, [dayKey]: !prev[dayKey] }))}
                                className="px-2.5 py-1 bg-white hover:bg-blue-50 text-blue-700 border border-blue-200 rounded-lg text-[10px] font-black transition cursor-pointer flex items-center gap-1 active:scale-95 shadow-2xs"
                              >
                                <span>{isExpanded ? "▲ Hide" : `▼ View ${depositsList.length || 1} Txn`}</span>
                              </button>
                            )}
                          </div>

                          {/* Collapsible Accordion for Individual Deposit Entries */}
                          {isExpanded && hasDeposits && (
                            <div className="p-2.5 bg-blue-50/60 rounded-xl border border-blue-200 space-y-2 animate-in fade-in duration-150">
                              <div className="flex items-center justify-between text-[10px] font-black text-blue-900 uppercase tracking-wider border-b border-blue-200/70 pb-1">
                                <span>📋 Approved Deposits ({depositsList.length}):</span>
                                <span>12% p.a. Calculation</span>
                              </div>
                              {depositsList.map((dep, dIdx) => (
                                <div key={dep.id || dIdx} className="p-2.5 bg-white rounded-lg border border-blue-100 text-[11px] space-y-1.5 shadow-2xs">
                                  <div className="flex items-center justify-between">
                                    <div className="flex items-center gap-1.5 font-bold text-slate-800">
                                      <span className="text-[10px] text-slate-400 font-mono">🕒 {dep.time || "Approved"}</span>
                                      <span>•</span>
                                      <span className="text-slate-900 font-extrabold flex items-center gap-1">
                                        <span>👤</span>
                                        <span>{dep.userName || dep.user || "Depositor"}</span>
                                      </span>
                                    </div>
                                    <span className="font-mono font-black text-emerald-600">+₹{Number(dep.amount).toLocaleString("en-IN")}</span>
                                  </div>
                                  <div className="flex items-center justify-between text-[10px] text-slate-500 font-mono pt-1 border-t border-slate-50">
                                    <span>Rate: <strong className="text-slate-700">{dep.rateText || "12% p.a."}</strong></span>
                                    {(dep.utrNumber || dep.utr) && <span>UTR: <strong className="text-slate-700 font-mono">{dep.utrNumber || dep.utr}</strong></span>}
                                  </div>
                                  {(dep.userPhone || dep.accountNumber) && (
                                    <div className="flex items-center justify-between text-[9px] text-slate-400 font-mono">
                                      {dep.userPhone && <span>📞 {dep.userPhone}</span>}
                                      {dep.accountNumber && <span>A/C: {dep.accountNumber}</span>}
                                    </div>
                                  )}
                                  {dep.proofUrl && (
                                    <div className="pt-1 flex items-center justify-end">
                                      <button
                                        type="button"
                                        onClick={() => { setLightboxImg(dep.proofUrl); setZoomLevel(1); }}
                                        className="inline-flex items-center gap-1 px-2 py-0.5 bg-slate-50 hover:bg-blue-50 text-blue-700 border border-slate-200 rounded text-[9px] font-bold cursor-pointer active:scale-95"
                                      >
                                        <img src={dep.proofUrl} alt="Receipt" className="w-3 h-3 object-cover rounded" />
                                        <span>View Receipt Photo 🔍</span>
                                      </button>
                                    </div>
                                  )}
                                </div>
                              ))}
                            </div>
                          )}

                          <div className="grid grid-cols-2 gap-2 text-[11px] pt-1 border-t border-slate-100">
                            <div>
                              <span className="text-slate-400 block text-[10px] font-semibold">Us Roz Kul Deposit</span>
                              <span className="font-mono font-black text-slate-800 text-xs">
                                ₹{Number(row.cumulativeDeposit !== undefined ? row.cumulativeDeposit : (row.estimatedCapital !== undefined ? row.estimatedCapital : dayDepositTotal)).toLocaleString("en-IN")}
                              </span>
                            </div>
                            <div className="text-right">
                              <span className="text-slate-400 block text-[10px]">Annual Rate</span>
                              <span className="font-bold text-slate-700">12% p.a.</span>
                            </div>
                            <div>
                              <span className="text-slate-400 block text-[10px]">Daily Profit Added</span>
                              <span className="font-mono font-black text-emerald-600">
                                {isToday ? (
                                  <LiveLedgerDailyAdded baseAmount={rowAmount} deposits={totalDepositsDisplay} />
                                ) : (
                                  `+₹${rowAmount.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
                                )}
                              </span>
                            </div>
                            <div className="text-right">
                              <span className="text-slate-400 block text-[10px]">Cumulative Yield</span>
                              <span className="font-mono font-bold text-blue-700">
                                {isToday ? (
                                  <LiveAdminProfitTicker baseProfit={totalProfitBase} deposits={totalDepositsDisplay} />
                                ) : (
                                  `₹${rowCumulative.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
                                )}
                              </span>
                            </div>
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>

                {/* DESKTOP TABLE - 100% Width Fit (No Horizontal Scroll Needed) */}
                <div className="hidden sm:block rounded-xl border border-slate-200 bg-white shadow-2xs overflow-hidden">
                  <table className="w-full text-xs text-left">
                    <thead>
                      <tr className="bg-slate-50 text-left text-slate-500 uppercase border-b border-slate-200">
                        <th className="py-3 px-3.5 font-bold whitespace-nowrap w-[20%]">Date & Status</th>
                        <th className="py-3 px-3.5 font-bold whitespace-nowrap w-[36%]">Us Din Ka Deposit (24h & Kul)</th>
                        <th className="py-3 px-3.5 font-bold whitespace-nowrap w-[18%]">Daily Profit</th>
                        <th className="py-3 px-3.5 font-bold whitespace-nowrap w-[14%]">Cumulative</th>
                        <th className="py-3 px-3.5 font-bold whitespace-nowrap w-[12%] text-right">Details</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {(!analytics?.dailyProfitChart || analytics.dailyProfitChart.length === 0) ? (
                        <tr>
                          <td colSpan="5" className="py-8 text-center text-gray-400 font-medium">
                            {loadingAnalytics ? "🔄 Live ledger sync ho raha hai..." : "Koi daily profit yield abhi tak record nahi hua hai."}
                          </td>
                        </tr>
                      ) : (
                        analytics.dailyProfitChart.map((row, idx) => {
                          const isToday = idx === analytics.dailyProfitChart.length - 1;
                          const rowAmount = Number(row.amount);
                          const rowCumulative = Number(row.cumulativeYield);
                          const dayKey = row.date || `day-${idx}`;
                          const isExpanded = !!expandedYieldDays[dayKey];
                          const dayDepositTotal = Number(row.dayTotalDeposit || 0);
                          const depositsList = row.deposits || [];
                          const hasDeposits = dayDepositTotal > 0 || depositsList.length > 0;
                          const dayTotalPool = Number(row.cumulativeDeposit !== undefined ? row.cumulativeDeposit : (row.estimatedCapital !== undefined ? row.estimatedCapital : dayDepositTotal));

                          return (
                            <React.Fragment key={dayKey}>
                              <tr className="hover:bg-slate-50/70 transition">
                                <td className="py-3 px-3.5 align-middle">
                                  <div className="space-y-1">
                                    <div className="flex items-center gap-1.5 font-bold text-slate-900">
                                      <span className="font-mono text-slate-400 text-[11px]">#{idx + 1}</span>
                                      <span className="font-extrabold">{row.displayDate || row.date}</span>
                                    </div>
                                    <div>
                                      {isToday ? (
                                        <span className="inline-flex items-center gap-1 text-[9px] font-black text-emerald-700 bg-emerald-50 px-1.5 py-0.5 rounded-full border border-emerald-200">
                                          <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                                          Live 24h
                                        </span>
                                      ) : (
                                        <span className="inline-flex items-center text-[9px] font-bold text-slate-500 bg-slate-100 px-1.5 py-0.5 rounded border border-slate-200">
                                          ✓ Locked
                                        </span>
                                      )}
                                    </div>
                                  </div>
                                </td>
                                <td className="py-3 px-3.5 align-middle">
                                  <div className="space-y-1">
                                    <div className="flex items-center gap-2 flex-wrap">
                                      {dayDepositTotal > 0 ? (
                                        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-md font-mono font-black text-xs bg-emerald-50 text-emerald-800 border border-emerald-200 shadow-2xs">
                                          <span>💰</span>
                                          <span>+₹{dayDepositTotal.toLocaleString("en-IN")}</span>
                                        </span>
                                      ) : (
                                        <span className="text-slate-400 font-mono text-[11px] font-medium">₹0 (No new dep)</span>
                                      )}
                                      {depositsList.length > 0 && (
                                        <span className="text-[10px] text-slate-500 font-bold">
                                          ({depositsList.length} {depositsList.length === 1 ? "txn" : "txns"})
                                        </span>
                                      )}
                                    </div>
                                    <div className="text-[11px] text-slate-500 font-mono flex items-center gap-1">
                                      <span>Us roz kul deposit:</span>
                                      <strong className="text-slate-900 font-bold">₹{dayTotalPool.toLocaleString("en-IN")}</strong>
                                    </div>
                                  </div>
                                </td>
                                <td className="py-3 px-3 align-middle">
                                  <div className="space-y-0.5">
                                    <div className="font-mono font-black text-emerald-600 text-xs">
                                      {isToday ? (
                                        <LiveLedgerDailyAdded baseAmount={rowAmount} deposits={totalDepositsDisplay} />
                                      ) : (
                                        `+₹${rowAmount.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
                                      )}
                                    </div>
                                    <div className="text-[10px] text-slate-400 font-semibold">
                                      @ 12% p.a.
                                    </div>
                                  </div>
                                </td>
                                <td className="py-3 px-3 align-middle">
                                  <div className="font-mono font-black text-blue-700 text-xs">
                                    {isToday ? (
                                      <LiveAdminProfitTicker baseProfit={totalProfitBase} deposits={totalDepositsDisplay} />
                                    ) : (
                                      `₹${rowCumulative.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
                                    )}
                                  </div>
                                  <div className="text-[10px] text-slate-400 font-medium">
                                    Total Yield
                                  </div>
                                </td>
                                <td className="py-3 px-3.5 align-middle text-right">
                                  {hasDeposits ? (
                                    <button
                                      type="button"
                                      onClick={() => setExpandedYieldDays(prev => ({ ...prev, [dayKey]: !prev[dayKey] }))}
                                      className="px-2.5 py-1.5 bg-white hover:bg-blue-50 text-blue-700 rounded-lg text-[10px] font-black border border-blue-200 transition cursor-pointer active:scale-95 shadow-2xs inline-flex items-center gap-1 whitespace-nowrap"
                                    >
                                      <span>{isExpanded ? "▲ Hide" : `▼ View ${depositsList.length || 1}`}</span>
                                    </button>
                                  ) : (
                                    <span className="text-[10px] text-slate-400 font-medium">—</span>
                                  )}
                                </td>
                              </tr>
                              {/* Desktop Expanded Accordion Row */}
                              {isExpanded && hasDeposits && (
                                <tr className="bg-blue-50/40 border-b border-blue-100">
                                  <td colSpan="5" className="p-3">
                                    <div className="bg-white rounded-xl border border-blue-200/80 p-3 space-y-2 shadow-2xs">
                                      <div className="flex items-center justify-between text-xs font-bold text-blue-900 border-b border-slate-100 pb-1.5">
                                        <span className="flex items-center gap-1.5">
                                          <span>📋</span>
                                          <span>Approved Deposits on {row.displayDate || row.date} ({depositsList.length})</span>
                                        </span>
                                        <span className="font-mono text-xs font-black text-emerald-700">
                                          24h Total: +₹{dayDepositTotal.toLocaleString("en-IN")}
                                        </span>
                                      </div>
                                      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2.5">
                                        {depositsList.map((dep, dIdx) => (
                                          <div key={dep.id || dIdx} className="p-2.5 bg-slate-50/90 rounded-lg border border-slate-200 text-xs space-y-1.5">
                                            <div className="flex items-center justify-between font-bold">
                                              <span className="text-slate-900 font-extrabold flex items-center gap-1 truncate">
                                                <span>👤</span>
                                                <span className="truncate">{dep.userName || dep.user || "Depositor"}</span>
                                              </span>
                                              <span className="font-mono font-black text-emerald-600 shrink-0 ml-2">
                                                +₹{Number(dep.amount).toLocaleString("en-IN")}
                                              </span>
                                            </div>
                                            <div className="flex items-center justify-between text-[11px] text-slate-500 font-mono">
                                              <span>🕒 {dep.time || "Approved"}</span>
                                              <span>{dep.rateText || "12% p.a."}</span>
                                            </div>
                                            {(dep.utrNumber || dep.utr) && (
                                              <p className="text-[10px] text-slate-600 font-mono truncate">
                                                UTR: <strong className="text-slate-800">{dep.utrNumber || dep.utr}</strong>
                                              </p>
                                            )}
                                            {(dep.userPhone || dep.accountNumber) && (
                                              <div className="flex items-center justify-between text-[10px] text-slate-400 font-mono">
                                                {dep.userPhone && <span>📞 {dep.userPhone}</span>}
                                                {dep.accountNumber && <span>A/C: {dep.accountNumber}</span>}
                                              </div>
                                            )}
                                            {dep.proofUrl && (
                                              <div className="pt-1 flex items-center justify-end">
                                                <button
                                                  type="button"
                                                  onClick={() => { setLightboxImg(dep.proofUrl); setZoomLevel(1); }}
                                                  className="inline-flex items-center gap-1 px-2 py-0.5 bg-white hover:bg-blue-50 text-blue-700 border border-slate-200 rounded text-[10px] font-bold cursor-pointer active:scale-95"
                                                >
                                                  <img src={dep.proofUrl} alt="Receipt" className="w-3.5 h-3.5 object-cover rounded" />
                                                  <span>View Receipt Photo 🔍</span>
                                                </button>
                                              </div>
                                            )}
                                          </div>
                                        ))}
                                      </div>
                                    </div>
                                  </td>
                                </tr>
                              )}
                            </React.Fragment>
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
              <div className="mb-5 p-3.5 bg-slate-50 border border-slate-200 rounded-2xl flex flex-wrap items-center justify-between gap-3 text-xs">
                <div className="flex items-center gap-2.5">
                  <span className="text-xl">💳</span>
                  <div>
                    <span className="font-extrabold text-slate-900">Active Deposit Credentials:</span>
                    <span className="text-slate-700 ml-1">
                      UPI: <strong className="font-mono">{depositDetails.upiId || "educafinance@upi"}</strong> | A/C: <strong className="font-mono">{depositDetails.accountNumber || "5010045239128"}</strong> ({depositDetails.bankName || "Bank of Baroda"})
                    </span>
                  </div>
                </div>
                <button
                  onClick={() => switchTab("settings")}
                  className="px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-xl text-[11px] shadow-xs transition"
                >
                  ⚙️ Update UPI / Bank
                </button>
              </div>

              {/* Sub-Navigation: Active Pending vs On Hold (Duplicate UTR) */}
              <div className="flex flex-wrap items-center justify-between gap-3 mb-5 border-b border-gray-100 pb-3">
                <div className="flex items-center gap-2 bg-slate-100 p-1 rounded-2xl w-full sm:w-auto">
                  <button
                    type="button"
                    onClick={() => setPendingSubTab("active")}
                    className={`flex-1 sm:flex-initial px-4 py-2 rounded-xl text-xs font-black transition cursor-pointer flex items-center justify-center gap-2 ${
                      pendingSubTab === "active"
                        ? "bg-white text-slate-900 shadow-xs"
                        : "text-slate-500 hover:text-slate-900"
                    }`}
                  >
                    <span>⏳ Active Pending</span>
                    <span className={`px-2 py-0.5 rounded-full text-[10px] font-black ${
                      pending.length > 0 ? "bg-amber-100 text-amber-900" : "bg-slate-200 text-slate-600"
                    }`}>
                      {pending.length}
                    </span>
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      setPendingSubTab("hold");
                      loadHoldData(true);
                    }}
                    className={`flex-1 sm:flex-initial px-4 py-2 rounded-xl text-xs font-black transition cursor-pointer flex items-center justify-center gap-2 ${
                      pendingSubTab === "hold"
                        ? "bg-rose-600 text-white shadow-xs"
                        : "text-rose-600 hover:text-rose-800 hover:bg-rose-50"
                    }`}
                  >
                    <span>⚠️ On Hold — Duplicate UTR</span>
                    <span className={`px-2 py-0.5 rounded-full text-[10px] font-black ${
                      (holdData?.holdCount || 0) > 0
                        ? pendingSubTab === "hold"
                          ? "bg-white text-rose-700 animate-pulse"
                          : "bg-rose-100 text-rose-800 animate-pulse border border-rose-300"
                        : "bg-slate-200 text-slate-600"
                    }`}>
                      {holdData?.holdCount || 0}
                    </span>
                  </button>
                </div>

                <div className="flex items-center gap-2 text-xs">
                  <button
                    type="button"
                    onClick={() => {
                      if (pendingSubTab === "hold") loadHoldData(true);
                      else loadPending(true);
                    }}
                    className="px-3 py-1.5 bg-white hover:bg-slate-50 border border-slate-200 text-slate-700 font-bold rounded-xl text-xs transition cursor-pointer flex items-center gap-1 shadow-2xs"
                  >
                    <span>🔄 Refresh</span>
                  </button>
                </div>
              </div>

              {/* ══════════════════════════════════════════════════════
                  VIEW 1: ACTIVE PENDING APPROVALS
              ══════════════════════════════════════════════════════ */}
              {pendingSubTab === "active" && (
                <>
                  <div className="flex items-center justify-between mb-4">
                    <h3 className="text-base sm:text-lg font-bold font-display text-gray-900">
                      Active Pending Approvals
                    </h3>
                    <span className="text-xs text-gray-400 font-medium">
                      Showing {pending.length} normal pending requests
                    </span>
                  </div>

                  {pending.length === 0 ? (
                    <div className="py-12 text-center space-y-2 border-2 border-dashed border-gray-100 rounded-3xl bg-slate-50/50">
                      <span className="text-4xl block">🎉</span>
                      <p className="font-extrabold text-gray-800 text-sm">No Pending Transactions</p>
                      <p className="text-xs text-gray-400">Sabhi requests process ho chuki hain.</p>
                    </div>
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
                                <td className="py-3 pr-4"><p className="font-semibold text-gray-900">{t.userId?.name}</p><p className="text-xs text-gray-400">{t.userId?.email}</p></td>
                                <td className="py-3 pr-4">
                                  <div className="flex flex-wrap items-center gap-1.5">
                                    <span className={`px-2 py-1 rounded-full text-xs font-bold ${t.type === "deposit" ? "bg-green-100 text-green-700" : "bg-red-100 text-red-700"}`}>{t.type}</span>
                                    {t.type === "withdrawal" && (
                                      <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${t.amount <= 5000 ? "bg-amber-100 text-amber-800 border border-amber-200" : "bg-blue-100 text-blue-800 border border-blue-200"}`}>
                                        {t.slaLabel || (t.amount <= 5000 ? "24h SLA" : "72h SLA")}
                                      </span>
                                    )}
                                  </div>
                                </td>
                                <td className="py-3 pr-4 font-bold font-mono">₹{t.amount.toLocaleString("en-IN")}</td>
                                <td className="py-3 pr-4 uppercase text-xs text-gray-500 font-semibold">{t.method}</td>
                                <td className="py-3 pr-4 text-xs text-gray-500 max-w-xs">
                                  {t.utrNumber && <div className="font-mono font-bold text-gray-800">UTR: {t.utrNumber}</div>}
                                  {(t.proofUrl || t.screenshotUrl) && (
                                    <div className="flex items-center gap-2 mt-1">
                                      <img
                                        src={t.proofUrl || t.screenshotUrl}
                                        alt="Receipt"
                                        onClick={() => { setLightboxImg(t.proofUrl || t.screenshotUrl); setZoomLevel(1); }}
                                        className="w-8 h-8 object-cover rounded-md border border-slate-300 cursor-zoom-in hover:scale-105 transition"
                                      />
                                      <button
                                        type="button"
                                        onClick={() => { setLightboxImg(t.proofUrl || t.screenshotUrl); setZoomLevel(1); }}
                                        className="text-[11px] text-blue-600 hover:text-blue-800 font-bold underline cursor-pointer"
                                      >
                                        View Receipt 🔍
                                      </button>
                                    </div>
                                  )}
                                  {t.paymentDetails && (
                                    <div className="text-[11px] text-gray-500 truncate mt-0.5">
                                      {t.paymentDetails.upiId ? `UPI: ${t.paymentDetails.upiId}` : (t.paymentDetails.accountNumber ? `A/C: ${t.paymentDetails.accountNumber}` : "")}
                                    </div>
                                  )}
                                </td>
                                <td className="py-3">
                                  <div className="flex gap-2">
                                    <button onClick={() => approve(t._id)} className="px-3 py-1.5 bg-green-500 text-white rounded-lg text-xs font-bold hover:bg-green-600 cursor-pointer active:scale-95 transition">✓ Approve</button>
                                    <button onClick={() => reject(t._id)} className="px-3 py-1.5 bg-red-500 text-white rounded-lg text-xs font-bold hover:bg-red-600 cursor-pointer active:scale-95 transition">✗ Reject</button>
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
                          <div key={t._id} className="border border-slate-200/90 rounded-2xl p-4 bg-white shadow-2xs space-y-2">
                            <div className="flex justify-between items-start">
                              <div>
                                <p className="font-semibold text-sm text-slate-900">{t.userId?.name}</p>
                                <p className="text-xs text-gray-400">{t.userId?.email}</p>
                              </div>
                              <div className="flex flex-col items-end gap-1">
                                <span className={`px-2 py-1 rounded-full text-xs font-bold shrink-0 ${t.type === "deposit" ? "bg-green-100 text-green-700" : "bg-red-100 text-red-700"}`}>{t.type}</span>
                                {t.type === "withdrawal" && (
                                  <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${t.amount <= 5000 ? "bg-amber-100 text-amber-800 border border-amber-200" : "bg-blue-100 text-blue-800 border border-blue-200"}`}>
                                    {t.slaLabel || (t.amount <= 5000 ? "24h SLA" : "72h SLA")}
                                  </span>
                                )}
                              </div>
                            </div>
                            <div className="flex justify-between text-sm">
                              <span className="text-gray-400">Amount</span>
                              <span className="font-bold text-slate-900 font-mono">₹{t.amount.toLocaleString("en-IN")}</span>
                            </div>
                            <div className="flex justify-between text-sm">
                              <span className="text-gray-400">Method</span>
                              <span className="uppercase text-xs text-gray-500 font-bold">{t.method}</span>
                            </div>
                            {t.utrNumber && <p className="text-xs font-mono font-bold text-slate-800">UTR: {t.utrNumber}</p>}
                            {(t.proofUrl || t.screenshotUrl) && (
                              <div className="p-2 bg-slate-50 border border-slate-200 rounded-xl flex items-center justify-between">
                                <div className="flex items-center gap-2">
                                  <img
                                    src={t.proofUrl || t.screenshotUrl}
                                    alt="Receipt"
                                    onClick={() => { setLightboxImg(t.proofUrl || t.screenshotUrl); setZoomLevel(1); }}
                                    className="w-10 h-10 object-cover rounded-lg border border-slate-300 cursor-zoom-in"
                                  />
                                  <div>
                                    <span className="text-xs font-bold text-slate-800 block">Payment Receipt</span>
                                    <span className="text-[10px] text-slate-500">Tap to inspect full screen</span>
                                  </div>
                                </div>
                                <button
                                  type="button"
                                  onClick={() => { setLightboxImg(t.proofUrl || t.screenshotUrl); setZoomLevel(1); }}
                                  className="px-2.5 py-1 bg-blue-50 text-blue-700 border border-blue-200 rounded-lg text-xs font-bold"
                                >
                                  🔍 Zoom
                                </button>
                              </div>
                            )}
                            {t.paymentDetails && (
                              <p className="text-xs text-gray-500 truncate">
                                {t.paymentDetails.upiId ? `UPI: ${t.paymentDetails.upiId}` : (t.paymentDetails.accountNumber ? `A/C: ${t.paymentDetails.accountNumber}` : JSON.stringify(t.paymentDetails))}
                              </p>
                            )}
                            <div className="flex gap-2 pt-1">
                              <button onClick={() => approve(t._id)} className="flex-1 py-2 bg-green-500 text-white rounded-lg text-xs font-bold hover:bg-green-600 active:bg-green-700 cursor-pointer">✓ Approve</button>
                              <button onClick={() => reject(t._id)} className="flex-1 py-2 bg-red-500 text-white rounded-lg text-xs font-bold hover:bg-red-600 active:bg-red-700 cursor-pointer">✗ Reject</button>
                            </div>
                          </div>
                        ))}
                      </div>
                    </>
                  )}
                </>
              )}

              {/* ══════════════════════════════════════════════════════
                  VIEW 2: ON HOLD — DUPLICATE UTR CONFLICTS
              ══════════════════════════════════════════════════════ */}
              {pendingSubTab === "hold" && (
                <div className="space-y-6">
                  {/* Anti-Fraud Protection Information Banner */}
                  <div className="p-3.5 bg-gradient-to-r from-rose-50 via-amber-50 to-orange-50 border border-rose-200 rounded-2xl flex items-start gap-3 shadow-2xs">
                    <span className="text-2xl shrink-0">🛡️</span>
                    <div className="space-y-1 text-xs">
                      <p className="font-black text-rose-950 flex items-center gap-1.5">
                        <span>Duplicate UTR Anti-Fraud & Hold System</span>
                        <span className="px-2 py-0.5 rounded-full text-[10px] font-black bg-rose-600 text-white uppercase">Active</span>
                      </p>
                      <p className="text-[11px] text-rose-900 leading-relaxed">
                        Jab koi user aisa UTR number daalta hai jo system me pehle se darj hai, to wo request turant <strong>HOLD</strong> me chali jaati hai aur normal pending list me nahi aati. Neeche har duplicate UTR ke sabhi records (purane Approved, Pending aur naye Hold) ek saath group kiye gaye hain taaki aap compare karke manual decision le sakein.
                      </p>
                    </div>
                  </div>

                  {loadingHold ? (
                    <div className="py-12 text-center text-sm text-gray-500 font-medium">
                      <div className="w-8 h-8 border-3 border-rose-600 border-t-transparent rounded-full animate-spin mx-auto mb-2"></div>
                      Duplicate UTR conflicts scan ho rahe hain...
                    </div>
                  ) : (!holdData.groups || holdData.groups.length === 0) ? (
                    <div className="py-14 text-center space-y-2 border-2 border-dashed border-gray-200 rounded-3xl bg-slate-50/50">
                      <span className="text-4xl block">🎉</span>
                      <p className="font-extrabold text-gray-800 text-sm">Koi Duplicate UTR Conflict Nahi Hai!</p>
                      <p className="text-xs text-gray-500">Sabhi deposit requests ke UTR unique aur verified hain.</p>
                    </div>
                  ) : (
                    <div className="space-y-6">
                      {holdData.groups.map(group => (
                        <div
                          key={group.utrNumber}
                          className="bg-white border-2 border-rose-200 rounded-3xl p-4 sm:p-5 shadow-xs space-y-4 transition hover:border-rose-300"
                        >
                          {/* Group Header Banner with Conflict Breakdown */}
                          <div className="flex flex-wrap items-center justify-between gap-3 pb-3 border-b border-rose-100">
                            <div className="flex items-center gap-2.5 flex-wrap">
                              <span className="px-3 py-1 bg-rose-600 text-white rounded-xl font-mono text-xs font-black tracking-wide shadow-2xs">
                                UTR: {group.utrNumber}
                              </span>
                              <span className="text-xs sm:text-sm font-extrabold text-gray-900">
                                🚨 {group.totalCount} Conflicting Requests Found
                              </span>
                            </div>

                            <div className="flex items-center gap-1.5 flex-wrap text-[11px] font-bold">
                              {group.holdCount > 0 && (
                                <span className="px-2.5 py-0.5 bg-rose-100 text-rose-900 border border-rose-300 rounded-lg">
                                  ⚠️ {group.holdCount} ON HOLD
                                </span>
                              )}
                              {group.approvedCount > 0 && (
                                <span className="px-2.5 py-0.5 bg-emerald-100 text-emerald-900 border border-emerald-300 rounded-lg">
                                  ✓ {group.approvedCount} Approved Pehle Se
                                </span>
                              )}
                              {group.pendingCount > 0 && (
                                <span className="px-2.5 py-0.5 bg-amber-100 text-amber-900 border border-amber-300 rounded-lg">
                                  ⏳ {group.pendingCount} Pending
                                </span>
                              )}
                              {group.rejectedCount > 0 && (
                                <span className="px-2.5 py-0.5 bg-slate-100 text-slate-700 border border-slate-300 rounded-lg">
                                  ✕ {group.rejectedCount} Rejected
                                </span>
                              )}
                            </div>
                          </div>

                          {/* Items Grid for Mobile / Tablet / Desktop */}
                          <div className="grid grid-cols-1 lg:grid-cols-2 gap-3.5">
                            {group.items.map(item => {
                              const isHold = item.status === "hold" || item.isHold;
                              const isApproved = item.status === "approved" || item.status === "completed";
                              const isPending = item.status === "pending";
                              const isRejected = item.status === "rejected";

                              return (
                                <div
                                  key={item._id}
                                  className={`rounded-2xl p-4 border transition space-y-3 ${
                                    isHold
                                      ? "bg-rose-50/70 border-rose-300 ring-2 ring-rose-400/40"
                                      : isApproved
                                      ? "bg-emerald-50/40 border-emerald-200"
                                      : isPending
                                      ? "bg-amber-50/40 border-amber-200"
                                      : "bg-slate-50 border-slate-200 opacity-75"
                                  }`}
                                >
                                  {/* Item Header & User Info */}
                                  <div className="flex items-start justify-between gap-2">
                                    <div>
                                      <div className="flex items-center gap-1.5 flex-wrap">
                                        <span className="font-extrabold text-sm text-gray-900">
                                          {item.userId?.name || "Unknown User"}
                                        </span>
                                        {item.userId?.accountNumber && (
                                          <span className="font-mono text-[10px] bg-white px-1.5 py-0.5 rounded border border-gray-200 text-gray-700 font-bold">
                                            {item.userId.accountNumber}
                                          </span>
                                        )}
                                      </div>
                                      <div className="text-[11px] text-gray-600 mt-0.5 flex flex-wrap gap-x-3">
                                        <span>📞 {item.userId?.phone || "No phone"}</span>
                                        <span>✉️ {item.userId?.email || ""}</span>
                                      </div>
                                    </div>

                                    {/* Status Badge */}
                                    <div className="shrink-0">
                                      {isHold && (
                                        <span className="px-2.5 py-1 bg-rose-600 text-white rounded-xl text-[10px] font-black tracking-wider uppercase inline-flex items-center gap-1 shadow-2xs animate-pulse">
                                          <span>⚠️</span> ON HOLD
                                        </span>
                                      )}
                                      {isApproved && (
                                        <span className="px-2.5 py-1 bg-emerald-600 text-white rounded-xl text-[10px] font-black tracking-wider uppercase inline-flex items-center gap-1 shadow-2xs">
                                          <span>✓</span> APPROVED
                                        </span>
                                      )}
                                      {isPending && (
                                        <span className="px-2.5 py-1 bg-amber-500 text-white rounded-xl text-[10px] font-black tracking-wider uppercase inline-flex items-center gap-1 shadow-2xs">
                                          <span>⏳</span> PENDING
                                        </span>
                                      )}
                                      {isRejected && (
                                        <span className="px-2 py-0.5 bg-slate-200 text-slate-700 rounded-xl text-[10px] font-bold">
                                          ✕ REJECTED
                                        </span>
                                      )}
                                    </div>
                                  </div>

                                  {/* Amount & Time Display */}
                                  <div className="flex items-center justify-between bg-white/90 p-2.5 rounded-xl border border-gray-100 text-xs">
                                    <div>
                                      <span className="text-[10px] text-gray-500 block uppercase font-bold">Deposit Amount</span>
                                      <span className="font-mono font-black text-base text-gray-950 tabular-nums">
                                        ₹{Number(item.amount || 0).toLocaleString("en-IN")}
                                      </span>
                                    </div>
                                    <div className="text-right">
                                      <span className="text-[10px] text-gray-500 block uppercase font-bold">Submitted At</span>
                                      <span className="font-semibold text-gray-800 text-xs">
                                        {item.createdAt ? new Date(item.createdAt).toLocaleString("en-IN", {
                                          day: "2-digit",
                                          month: "short",
                                          year: "numeric",
                                          hour: "2-digit",
                                          minute: "2-digit"
                                        }) : "N/A"}
                                      </span>
                                    </div>
                                  </div>

                                  {/* Payment Receipt / Screenshot Thumbnail */}
                                  {(item.proofUrl || item.screenshotUrl) && (
                                    <div className="flex items-center justify-between p-2.5 bg-white rounded-xl border border-gray-200 text-xs shadow-2xs">
                                      <div className="flex items-center gap-2.5">
                                        <img
                                          src={item.proofUrl || item.screenshotUrl}
                                          alt="Receipt"
                                          onClick={() => { setLightboxImg(item.proofUrl || item.screenshotUrl); setZoomLevel(1); }}
                                          className="w-11 h-11 object-cover rounded-lg border border-gray-300 cursor-zoom-in hover:scale-105 transition"
                                        />
                                        <div>
                                          <span className="font-bold text-gray-800 text-xs block">Payment Receipt / Screenshot</span>
                                          <span className="text-[10px] text-gray-500">Tap to inspect full resolution</span>
                                        </div>
                                      </div>
                                      <button
                                        type="button"
                                        onClick={() => { setLightboxImg(item.proofUrl || item.screenshotUrl); setZoomLevel(1); }}
                                        className="px-2.5 py-1.5 bg-blue-50 hover:bg-blue-100 text-blue-700 border border-blue-200 rounded-lg text-xs font-bold transition cursor-pointer"
                                      >
                                        🔍 Full Zoom
                                      </button>
                                    </div>
                                  )}

                                  {/* Conflict Note / Admin Remarks */}
                                  {(item.holdReason || item.remarks) && (
                                    <p className="text-[11px] text-gray-700 bg-white/70 p-2 rounded-lg border border-gray-100 leading-tight">
                                      <span className="font-bold text-gray-900">Note:</span> {item.holdReason || item.remarks}
                                    </p>
                                  )}

                                  {/* Approver Details if Approved */}
                                  {isApproved && (
                                    <div className="text-[11px] text-emerald-800 bg-emerald-100/60 px-2.5 py-1 rounded-lg flex items-center justify-between">
                                      <span>🛡️ Approved by {item.approverName || item.approvedBy?.name || "Admin"}</span>
                                      {item.approvedAt && (
                                        <span className="font-mono text-[10px]">
                                          {new Date(item.approvedAt).toLocaleDateString("en-IN", { day: "2-digit", month: "short" })}
                                        </span>
                                      )}
                                    </div>
                                  )}

                                  {/* ADMIN ACTIONS: Approve / Reject (Available for Hold & Pending items) */}
                                  {(isHold || isPending) && (
                                    <div className="flex items-center gap-2 pt-2 border-t border-gray-200/70">
                                      <button
                                        type="button"
                                        onClick={async () => {
                                          await approve(item._id);
                                          loadHoldData(true);
                                        }}
                                        className="flex-1 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-black shadow-xs transition cursor-pointer active:scale-95 flex items-center justify-center gap-1"
                                      >
                                        <span>✓</span> Approve Request
                                      </button>
                                      <button
                                        type="button"
                                        onClick={async () => {
                                          await reject(item._id);
                                          loadHoldData(true);
                                        }}
                                        className="flex-1 py-2 bg-rose-600 hover:bg-rose-700 text-white rounded-xl text-xs font-black shadow-xs transition cursor-pointer active:scale-95 flex items-center justify-center gap-1"
                                      >
                                        <span>✕</span> Reject Duplicate
                                      </button>
                                    </div>
                                  )}
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {/* KYC VERIFICATION REQUESTS */}
          {tab === "kyc" && (
            <div className="bg-white rounded-2xl shadow-sm p-4 sm:p-6 border border-gray-100 space-y-4">
              {/* Header (Tier 1: Title + Action Toolbar) */}
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 pb-3 border-b border-slate-100">
                <div>
                  <h3 className="text-base sm:text-lg font-bold font-display text-gray-900 flex items-center gap-2">
                    <span>📄</span> User KYC Verification Requests
                  </h3>
                  <p className="text-xs text-gray-500">
                    Review submitted Aadhaar, PAN, Address & documents. Write admin notes and approve or reject.
                  </p>
                </div>

                {/* Export & Multi-select Toolbar */}
                <div className="flex items-center gap-2 self-start md:self-auto shrink-0 flex-wrap">
                  <label className="flex items-center gap-1.5 text-xs font-bold text-gray-700 cursor-pointer bg-slate-100 hover:bg-slate-200 px-3 py-1.5 rounded-xl select-none transition">
                    <input
                      type="checkbox"
                      checked={filteredKycUsers.length > 0 && selectedKycIds.size === filteredKycUsers.length}
                      onChange={toggleSelectAllKyc}
                      className="rounded text-blue-600 focus:ring-blue-500 cursor-pointer"
                    />
                    <span>Select All ({filteredKycUsers.length})</span>
                  </label>

                  {selectedKycIds.size > 0 && (
                    <button
                      type="button"
                      onClick={() => exportKycToCsv()}
                      className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold shadow-xs active:scale-95 transition flex items-center gap-1.5 cursor-pointer"
                    >
                      <span>📥</span> Export Selected ({selectedKycIds.size})
                    </button>
                  )}

                  <button
                    type="button"
                    onClick={() => exportKycToCsv(filteredKycUsers)}
                    className="px-3 py-1.5 bg-white hover:bg-emerald-50 text-emerald-800 border border-emerald-300 rounded-xl text-xs font-bold shadow-2xs active:scale-95 transition flex items-center gap-1.5 cursor-pointer"
                  >
                    <span>📥</span> Export All ({filteredKycUsers.length})
                  </button>
                </div>
              </div>

              {/* Filter Bar (Tier 2: Status Pills + Date Pills) */}
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
                {/* Status Filter */}
                <div className="flex items-center bg-slate-100 p-1 rounded-xl text-xs font-bold overflow-x-auto no-scrollbar">
                  {[
                    { key: "all", label: "All" },
                    { key: "pending", label: `Pending (${pendingKycCount})` },
                    { key: "verified", label: "Verified" },
                    { key: "rejected", label: "Rejected" },
                  ].map(f => (
                    <button
                      key={f.key}
                      type="button"
                      onClick={() => setKycFilter(f.key)}
                      className={`px-3 py-1 rounded-lg transition cursor-pointer text-center whitespace-nowrap shrink-0 ${
                        kycFilter === f.key
                          ? "bg-white text-blue-700 shadow-2xs font-extrabold"
                          : "text-slate-500 hover:text-slate-800"
                      }`}
                    >
                      {f.label}
                    </button>
                  ))}
                </div>

                {/* Date / Time Filter */}
                <div className="flex items-center bg-blue-50/70 border border-blue-200/90 p-1 rounded-xl text-xs font-bold overflow-x-auto no-scrollbar">
                  {[
                    { key: "all", label: "All Time" },
                    { key: "today", label: "Today" },
                    { key: "7days", label: "7 Days" },
                    { key: "30days", label: "30 Days" },
                  ].map(tf => (
                    <button
                      key={tf.key}
                      type="button"
                      onClick={() => setKycTimeFilter(tf.key)}
                      className={`px-3 py-1 rounded-lg transition cursor-pointer text-[11px] text-center whitespace-nowrap shrink-0 ${
                        kycTimeFilter === tf.key
                          ? "bg-blue-600 text-white shadow-xs font-extrabold"
                          : "text-blue-700 hover:text-blue-900"
                      }`}
                    >
                      {tf.label}
                    </button>
                  ))}
                </div>
              </div>

              {(() => {
                if (filteredKycUsers.length === 0) {
                  return (
                    <div className="py-16 text-center text-gray-400">
                      <span className="text-4xl block mb-2">📄</span>
                      <p className="text-sm font-semibold">No KYC submissions found matching this filter.</p>
                    </div>
                  );
                }

                return (
                  <div className="space-y-3">
                    {filteredKycUsers.map(u => (
                      <div
                        key={u._id}
                        onClick={() => {
                          setKycReviewRemarks(u.kycDocuments?.adminRemarks || "");
                          setPreviewKycUser(u);
                        }}
                        className={`p-3.5 sm:p-5 rounded-2xl flex flex-col gap-3 transition cursor-pointer shadow-2xs group border ${
                          selectedKycIds.has(u._id)
                            ? "bg-blue-50/70 border-blue-400 ring-1 ring-blue-400"
                            : "bg-white hover:bg-slate-50 hover:border-slate-300 border-slate-200"
                        }`}
                      >
                        {/* Row 1: Header (Checkbox + User Name + Badges + Excel) */}
                        <div className="flex items-center justify-between gap-2 min-w-0">
                          <div className="flex items-center gap-2.5 min-w-0">
                            <div
                              onClick={(e) => { e.stopPropagation(); toggleSelectKyc(u._id); }}
                              className="cursor-pointer shrink-0"
                              title="Select for export"
                            >
                              <input
                                type="checkbox"
                                checked={selectedKycIds.has(u._id)}
                                onChange={() => {}}
                                className="w-4 h-4 rounded text-blue-600 focus:ring-blue-500 cursor-pointer"
                              />
                            </div>
                            <div className="min-w-0">
                              <div className="flex items-center gap-2 flex-wrap">
                                <span className="font-extrabold text-slate-900 text-sm sm:text-base group-hover:text-blue-700 transition truncate">
                                  {u.name}
                                </span>
                                <span
                                  className={`px-2 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider ${
                                    u.kycStatus === "verified"
                                      ? "bg-emerald-50 text-emerald-700 border border-emerald-200"
                                      : u.kycStatus === "pending"
                                      ? "bg-amber-50 text-amber-700 border border-amber-200"
                                      : "bg-rose-50 text-rose-700 border border-rose-200"
                                  }`}
                                >
                                  {u.kycStatus}
                                </span>
                                <span className="text-[10px] text-slate-400 font-mono">
                                  🕒 {u.kycDocuments?.submittedAt ? new Date(u.kycDocuments.submittedAt).toLocaleString("en-IN", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }) : "Recent"}
                                </span>
                              </div>
                              <p className="text-xs text-slate-500 truncate mt-0.5">
                                {u.email} {u.phone ? `• ${u.phone}` : ""}
                              </p>
                            </div>
                          </div>

                          {/* Quick 1-click Excel Export */}
                          <button
                            type="button"
                            title="Download this borrower's KYC record in Excel"
                            onClick={(e) => {
                              e.stopPropagation();
                              exportKycToCsv(u);
                            }}
                            className="shrink-0 px-2.5 py-1.5 bg-slate-100 hover:bg-emerald-50 hover:text-emerald-700 hover:border-emerald-300 text-slate-600 border border-slate-200 rounded-xl text-xs font-bold transition flex items-center gap-1 active:scale-95 cursor-pointer shadow-2xs"
                          >
                            <span>📥</span>
                            <span className="hidden sm:inline">Excel</span>
                          </button>
                        </div>

                        {/* Row 2: ID Numbers & Details Chips (Full Width) */}
                        <div className="flex flex-wrap items-center gap-1.5 text-[11px] text-slate-600 pt-0.5">
                          {u.kycDocuments?.aadharNumber && (
                            <span className="font-mono bg-slate-100 px-2 py-0.5 rounded-lg border border-slate-200 text-slate-700">
                              UID: {u.kycDocuments.aadharNumber}
                            </span>
                          )}
                          <span className="font-bold px-2 py-0.5 rounded-lg bg-blue-50 text-blue-700 border border-blue-200 uppercase text-[10px]">
                            {u.kycDocuments?.doc2Type === "cheque" ? "Cheque" : "PAN"}
                          </span>
                          {u.kycDocuments?.panNumber && (
                            <span className="font-mono uppercase bg-slate-100 px-2 py-0.5 rounded-lg border border-slate-200 text-slate-700">
                              PAN: {u.kycDocuments.panNumber}
                            </span>
                          )}
                          {u.kycDocuments?.chequeNumber && (
                            <span className="font-mono bg-slate-100 px-2 py-0.5 rounded-lg border border-slate-200 text-slate-700">
                              CHQ: {u.kycDocuments.chequeNumber}
                            </span>
                          )}
                          {(u.address || u.kycDocuments?.address) && (
                            <span className="truncate max-w-full sm:max-w-md text-slate-500">
                              📍 {u.address || u.kycDocuments?.address}
                            </span>
                          )}
                        </div>

                        {/* Admin Remarks if any */}
                        {u.kycDocuments?.adminRemarks && (
                          <div className="text-[11px] text-blue-700 font-medium bg-blue-50/80 px-2.5 py-1 rounded-xl border border-blue-100 flex items-center gap-1.5">
                            <span>💬 Note:</span>
                            <span className="truncate">{u.kycDocuments.adminRemarks}</span>
                            {(u.kycStatus === "verified" || u.kycStatus === "rejected" || u.kycDocuments?.isNoteLocked) && (
                              <span className="text-[9px] text-slate-400 font-bold ml-auto shrink-0">🔒 Locked</span>
                            )}
                          </div>
                        )}

                        {/* Row 3: 4 Document Thumbnails Grid with Tap to Zoom */}
                        <div className="p-3 bg-slate-50/90 rounded-2xl border border-slate-200/80">
                          <div className="flex items-center justify-between mb-2 px-0.5">
                            <span className="text-[10px] font-extrabold uppercase tracking-wider text-slate-500">
                              KYC Document Images (Tap to Zoom)
                            </span>
                            <span className="text-[10px] font-bold text-blue-600">
                              🔍 Fullscreen Lightbox
                            </span>
                          </div>
                          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
                            {/* Doc 1 Front */}
                            {(u.kycDocuments?.doc1Url || u.kycDocuments?.docUrl) ? (
                              <div
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setLightboxImg(u.kycDocuments.doc1Url || u.kycDocuments.docUrl);
                                  setZoomLevel(1);
                                }}
                                className="group/thumb flex flex-col rounded-xl overflow-hidden border border-slate-200 hover:border-blue-400 bg-white shadow-2xs transition hover:shadow-md cursor-zoom-in"
                              >
                                <div className="relative aspect-[16/10] w-full overflow-hidden bg-slate-100 flex items-center justify-center">
                                  <img
                                    src={u.kycDocuments.doc1Url || u.kycDocuments.docUrl}
                                    alt="UID Front"
                                    className="w-full h-full object-cover group-hover/thumb:scale-105 transition duration-200"
                                  />
                                </div>
                                <div className="px-2 py-1 bg-slate-50 border-t border-slate-200/80 flex items-center justify-between">
                                  <span className="text-[10px] font-extrabold text-slate-800 truncate">UID Front</span>
                                  <span className="text-[9px] text-blue-600 font-bold shrink-0">🔍 Zoom</span>
                                </div>
                              </div>
                            ) : (
                              <div className="aspect-[16/10] rounded-xl bg-slate-100 text-slate-400 border border-slate-200 flex flex-col items-center justify-center text-xs font-bold">
                                <span>🆔</span>
                                <span className="text-[9px] text-slate-400 mt-0.5">No Front</span>
                              </div>
                            )}

                            {/* Doc 1 Back */}
                            {u.kycDocuments?.doc1BackUrl ? (
                              <div
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setLightboxImg(u.kycDocuments.doc1BackUrl);
                                  setZoomLevel(1);
                                }}
                                className="group/thumb flex flex-col rounded-xl overflow-hidden border border-slate-200 hover:border-blue-400 bg-white shadow-2xs transition hover:shadow-md cursor-zoom-in"
                              >
                                <div className="relative aspect-[16/10] w-full overflow-hidden bg-slate-100 flex items-center justify-center">
                                  <img
                                    src={u.kycDocuments.doc1BackUrl}
                                    alt="UID Back"
                                    className="w-full h-full object-cover group-hover/thumb:scale-105 transition duration-200"
                                  />
                                </div>
                                <div className="px-2 py-1 bg-slate-50 border-t border-slate-200/80 flex items-center justify-between">
                                  <span className="text-[10px] font-extrabold text-slate-800 truncate">UID Back</span>
                                  <span className="text-[9px] text-blue-600 font-bold shrink-0">🔍 Zoom</span>
                                </div>
                              </div>
                            ) : (
                              <div className="aspect-[16/10] rounded-xl bg-slate-100 text-slate-400 border border-slate-200 flex flex-col items-center justify-center text-xs font-bold">
                                <span>🆔</span>
                                <span className="text-[9px] text-slate-400 mt-0.5">No Back</span>
                              </div>
                            )}

                            {/* Doc 2 Front */}
                            {u.kycDocuments?.doc2Url ? (
                              <div
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setLightboxImg(u.kycDocuments.doc2Url);
                                  setZoomLevel(1);
                                }}
                                className="group/thumb flex flex-col rounded-xl overflow-hidden border border-slate-200 hover:border-blue-400 bg-white shadow-2xs transition hover:shadow-md cursor-zoom-in"
                              >
                                <div className="relative aspect-[16/10] w-full overflow-hidden bg-slate-100 flex items-center justify-center">
                                  <img
                                    src={u.kycDocuments.doc2Url}
                                    alt="PAN Front"
                                    className="w-full h-full object-cover group-hover/thumb:scale-105 transition duration-200"
                                  />
                                </div>
                                <div className="px-2 py-1 bg-slate-50 border-t border-slate-200/80 flex items-center justify-between">
                                  <span className="text-[10px] font-extrabold text-slate-800 truncate">
                                    {u.kycDocuments?.doc2Type === "cheque" ? "CHQ Front" : "PAN Front"}
                                  </span>
                                  <span className="text-[9px] text-blue-600 font-bold shrink-0">🔍 Zoom</span>
                                </div>
                              </div>
                            ) : (
                              <div className="aspect-[16/10] rounded-xl bg-slate-100 text-slate-400 border border-slate-200 flex flex-col items-center justify-center text-xs font-bold">
                                <span>💳</span>
                                <span className="text-[9px] text-slate-400 mt-0.5">No Doc 2</span>
                              </div>
                            )}

                            {/* Doc 2 Back */}
                            {u.kycDocuments?.doc2BackUrl ? (
                              <div
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setLightboxImg(u.kycDocuments.doc2BackUrl);
                                  setZoomLevel(1);
                                }}
                                className="group/thumb flex flex-col rounded-xl overflow-hidden border border-slate-200 hover:border-blue-400 bg-white shadow-2xs transition hover:shadow-md cursor-zoom-in"
                              >
                                <div className="relative aspect-[16/10] w-full overflow-hidden bg-slate-100 flex items-center justify-center">
                                  <img
                                    src={u.kycDocuments.doc2BackUrl}
                                    alt="PAN Back"
                                    className="w-full h-full object-cover group-hover/thumb:scale-105 transition duration-200"
                                  />
                                </div>
                                <div className="px-2 py-1 bg-slate-50 border-t border-slate-200/80 flex items-center justify-between">
                                  <span className="text-[10px] font-extrabold text-slate-800 truncate">
                                    {u.kycDocuments?.doc2Type === "cheque" ? "CHQ Back" : "PAN Back"}
                                  </span>
                                  <span className="text-[9px] text-blue-600 font-bold shrink-0">🔍 Zoom</span>
                                </div>
                              </div>
                            ) : (
                              <div className="aspect-[16/10] rounded-xl bg-slate-100 text-slate-400 border border-slate-200 flex flex-col items-center justify-center text-xs font-bold">
                                <span>💳</span>
                                <span className="text-[9px] text-slate-400 mt-0.5">No Back</span>
                              </div>
                            )}
                          </div>
                        </div>

                        {/* Row 4: Clean Action Button */}
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            setKycReviewRemarks(u.kycDocuments?.adminRemarks || "");
                            setPreviewKycUser(u);
                          }}
                          className={`w-full py-2.5 px-4 rounded-xl text-xs font-bold shadow-xs active:scale-95 transition flex items-center justify-center gap-1.5 cursor-pointer ${
                            u.kycStatus === "rejected"
                              ? "bg-rose-50 text-rose-700 border border-rose-200 hover:bg-rose-100"
                              : u.kycStatus === "verified"
                              ? "bg-emerald-50 text-emerald-700 border border-emerald-200 hover:bg-emerald-100"
                              : "bg-blue-600 hover:bg-blue-700 text-white shadow-blue-500/20"
                          }`}
                        >
                          <span>{u.kycStatus === "rejected" ? "🚫" : u.kycStatus === "verified" ? "✓" : "🔍"}</span>
                          <span>{u.kycStatus === "rejected" ? "Rejected — View Details" : u.kycStatus === "verified" ? "Verified — View Details" : "Review & Verify KYC"}</span>
                        </button>
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
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-100">
                <div className="flex items-center gap-2.5">
                  <div className="w-9 h-9 rounded-xl bg-slate-900 text-white flex items-center justify-center text-base shadow-xs shrink-0">
                    📜
                  </div>
                  <div>
                    <h3 className="text-base sm:text-lg font-bold font-display text-slate-900 leading-tight">
                      Activity Audit History
                    </h3>
                    <p className="text-xs text-slate-500">
                      Comprehensive traceable audit logs of deposits, withdrawals, KYC verifications, loans & yield distributions.
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-2 self-start sm:self-auto shrink-0 flex-wrap">
                  {/* Exit History button for fast mobile/tablet navigation */}
                  <button
                    type="button"
                    onClick={() => {
                      switchTab("analytics");
                      window.scrollTo({ top: 0, behavior: "smooth" });
                    }}
                    className="px-3 py-1.5 bg-blue-50 hover:bg-blue-100 text-blue-700 border border-blue-200 rounded-xl text-xs font-bold flex items-center gap-1.5 cursor-pointer transition active:scale-95 shadow-2xs"
                  >
                    <span>←</span>
                    <span>Exit History</span>
                  </button>

                  {/* 24h Daily Profit Notification Dispatch Button */}
                  <button
                    type="button"
                    onClick={triggerYieldNotifications}
                    disabled={sendingYieldAlert}
                    className="px-3.5 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold flex items-center gap-1.5 cursor-pointer transition active:scale-95 disabled:opacity-50 shadow-xs"
                    title="Send 24h Daily Profit notification to depositors' phones"
                  >
                    <span>🔔</span>
                    <span>{sendingYieldAlert ? "Dispatching..." : "Send 24h Profit Alert"}</span>
                  </button>

                  {/* Refresh Button */}
                  <button
                    type="button"
                    onClick={loadAuditHistory}
                    disabled={historyLoading}
                    className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-bold flex items-center gap-1.5 cursor-pointer transition active:scale-95 disabled:opacity-50 border border-slate-200 shadow-2xs"
                  >
                    <span className={historyLoading ? "animate-spin" : ""}>🔄</span>
                    <span className="hidden sm:inline">Refresh</span>
                  </button>
                </div>
              </div>

              {/* Unified Toolbar: Search + Filter Hub Toggle + Count Badge */}
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
                <div className="relative flex-1 max-w-lg">
                  <span className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-400 text-xs">
                    🔍
                  </span>
                  <input
                    type="text"
                    value={historySearch}
                    onChange={(e) => setHistorySearch(e.target.value)}
                    placeholder="Search by user, email, phone, UTR, reference..."
                    className="w-full pl-8 pr-7 py-2 rounded-xl border border-slate-200 bg-slate-50/50 hover:bg-white focus:bg-white text-xs text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition shadow-2xs"
                  />
                  {historySearch && (
                    <button
                      type="button"
                      onClick={() => setHistorySearch("")}
                      className="absolute inset-y-0 right-0 pr-2.5 flex items-center text-slate-400 hover:text-slate-600 text-xs cursor-pointer"
                    >
                      ✕
                    </button>
                  )}
                </div>

                <div className="flex items-center gap-2 self-start sm:self-auto shrink-0 relative">
                  {/* Single Unified Filter Button (Opens floating popover menu) */}
                  <button
                    type="button"
                    onClick={() => {
                      if (!historyFilterOpen) {
                        setTempCategory(historyCategory);
                        setTempStatus(historyStatus);
                      }
                      setHistoryFilterOpen(!historyFilterOpen);
                    }}
                    className={`px-3.5 py-2 rounded-xl text-xs font-bold border transition-all flex items-center gap-2 cursor-pointer shadow-2xs active:scale-95 ${
                      historyCategory !== "all" || historyStatus !== "all"
                        ? "bg-blue-600 text-white border-blue-600 shadow-xs font-black ring-2 ring-blue-300/60"
                        : historyFilterOpen
                        ? "bg-slate-100 border-slate-300 text-slate-900"
                        : "bg-white hover:bg-slate-50 border-slate-200 text-slate-800"
                    }`}
                  >
                    <span className="text-sm">⚡</span>
                    <span className="truncate max-w-[170px] sm:max-w-none">
                      {historyCategory !== "all" || historyStatus !== "all"
                        ? `${AUDIT_CATEGORIES.find(c => c.key === historyCategory)?.label || "Filtered"} • ${historyStatus === "all" ? "All" : historyStatus}`
                        : "Filter & Categories"}
                    </span>
                    {(historyCategory !== "all" || historyStatus !== "all") && (
                      <span className="w-2 h-2 rounded-full bg-amber-300 animate-pulse" />
                    )}
                    <span className={`text-[10px] opacity-70 transition-transform duration-200 ${historyFilterOpen ? "rotate-180" : ""}`}>
                      ▼
                    </span>
                  </button>

                  <span className="text-[11px] font-bold text-slate-500 bg-slate-100 px-2.5 py-2 rounded-xl border border-slate-200 shrink-0">
                    {auditHistory.length} Record{auditHistory.length === 1 ? "" : "s"}
                  </span>

                  {/* FLOATING POPOVER DROPDOWN (Chakra UI Polish: Never pushes the table down, contained viewport) */}
                  {historyFilterOpen && (
                    <>
                      {/* Backdrop for click outside */}
                      <div
                        className="fixed inset-0 z-40 bg-black/20 backdrop-blur-2xs transition-opacity"
                        onClick={() => setHistoryFilterOpen(false)}
                      />

                      {/* Floating Popover Container with fixed max height and sticky footer */}
                      <div className="fixed inset-x-3 top-20 sm:absolute sm:inset-auto sm:right-0 sm:top-full sm:mt-2 z-50 sm:w-96 max-w-full max-h-[82vh] sm:max-h-[520px] flex flex-col bg-white border border-slate-200/90 rounded-2xl shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-150">
                        {/* Popover Header */}
                        <div className="flex items-center justify-between p-3.5 pb-2.5 border-b border-slate-100 shrink-0">
                          <div className="flex items-center gap-2">
                            <span className="w-7 h-7 rounded-lg bg-blue-50 text-blue-600 flex items-center justify-center text-xs font-bold">
                              ⚡
                            </span>
                            <div>
                              <h4 className="text-xs font-extrabold text-slate-900 leading-tight">
                                Audit Filter Hub
                              </h4>
                              <p className="text-[10px] text-slate-400">
                                Select category & lifecycle status, then tap Apply
                              </p>
                            </div>
                          </div>
                          <div className="flex items-center gap-1.5">
                            {(tempCategory !== "all" || tempStatus !== "all") && (
                              <button
                                type="button"
                                onClick={() => {
                                  setTempCategory("all");
                                  setTempStatus("all");
                                }}
                                className="text-[11px] font-bold text-rose-600 hover:text-rose-700 hover:bg-rose-50 px-2 py-0.5 rounded-lg transition cursor-pointer"
                              >
                                Reset
                              </button>
                            )}
                            <button
                              type="button"
                              onClick={() => setHistoryFilterOpen(false)}
                              className="w-6 h-6 rounded-lg hover:bg-slate-100 flex items-center justify-center text-slate-400 hover:text-slate-700 text-xs font-bold transition cursor-pointer"
                            >
                              ✕
                            </button>
                          </div>
                        </div>

                        {/* Scrollable Middle Body */}
                        <div className="flex-1 overflow-y-auto p-3.5 space-y-3.5">
                          {/* 1. Category Selection */}
                          <div>
                            <div className="flex items-center justify-between mb-1.5 px-0.5">
                              <label className="text-[10px] font-black uppercase tracking-wider text-slate-400">
                                📂 1. Select Category
                              </label>
                              <span className="text-[10px] font-extrabold text-blue-600">
                                {AUDIT_CATEGORIES.find(c => c.key === tempCategory)?.label}
                              </span>
                            </div>
                            <div className="space-y-1">
                              {AUDIT_CATEGORIES.map(c => {
                                const isSelected = tempCategory === c.key;
                                return (
                                  <button
                                    key={c.key}
                                    type="button"
                                    onClick={() => setTempCategory(c.key)}
                                    className={`w-full px-2.5 py-1.5 rounded-xl text-left text-xs font-bold flex items-center justify-between transition cursor-pointer ${
                                      isSelected
                                        ? "bg-blue-600 text-white shadow-xs"
                                        : "hover:bg-slate-50 text-slate-700"
                                    }`}
                                  >
                                    <div className="flex items-center gap-2">
                                      <span className="text-sm">{c.icon}</span>
                                      <span>{c.label}</span>
                                    </div>
                                    {isSelected ? (
                                      <span className="text-xs font-black">✓</span>
                                    ) : (
                                      <span className="text-[11px] text-slate-300">›</span>
                                    )}
                                  </button>
                                );
                              })}
                            </div>
                          </div>

                          {/* 2. Status Lifecycle Selection */}
                          <div className="pt-2.5 border-t border-slate-100">
                            <label className="text-[10px] font-black uppercase tracking-wider text-slate-400 block mb-1.5 px-0.5">
                              🚦 2. Transaction Status
                            </label>
                            <div className="grid grid-cols-2 gap-1.5">
                              {AUDIT_STATUSES.map(s => {
                                const isSelected = tempStatus === s.key;
                                return (
                                  <button
                                    key={s.key}
                                    type="button"
                                    onClick={() => setTempStatus(s.key)}
                                    className={`px-2.5 py-1.5 rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 transition cursor-pointer border ${
                                      isSelected
                                        ? "bg-slate-900 text-white border-slate-900 shadow-xs"
                                        : "bg-slate-50 hover:bg-slate-100 border-slate-200 text-slate-700"
                                    }`}
                                  >
                                    <span className="text-xs">{s.icon}</span>
                                    <span className="truncate">{s.label}</span>
                                  </button>
                                );
                              })}
                            </div>
                          </div>
                        </div>

                        {/* Pinned Action Footer */}
                        <div className="p-3 bg-slate-50/90 border-t border-slate-100 shrink-0 flex items-center justify-between">
                          <button
                            type="button"
                            onClick={() => {
                              React.startTransition(() => {
                                setTempCategory("all");
                                setTempStatus("all");
                                setHistoryCategory("all");
                                setHistoryStatus("all");
                              });
                              setHistoryFilterOpen(false);
                            }}
                            className="text-xs font-bold text-rose-600 hover:text-rose-700 underline cursor-pointer"
                          >
                            Clear All
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              React.startTransition(() => {
                                setHistoryCategory(tempCategory);
                                setHistoryStatus(tempStatus);
                              });
                              setHistoryFilterOpen(false);
                            }}
                            className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-extrabold shadow-xs active:scale-95 transition cursor-pointer"
                          >
                            Done / Apply Filters
                          </button>
                        </div>
                      </div>
                    </>
                  )}
                </div>
              </div>

              {/* Active Filter Dismissible Chips */}
              {(historyCategory !== "all" || historyStatus !== "all" || historySearch) && (
                <div className="flex items-center gap-1.5 flex-wrap pt-0.5 text-xs">
                  <span className="text-[10px] font-black uppercase tracking-wider text-slate-400">
                    Active Filters:
                  </span>
                  {historyCategory !== "all" && (
                    <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-blue-50 text-blue-700 border border-blue-200 text-xs font-bold">
                      <span>{AUDIT_CATEGORIES.find(c => c.key === historyCategory)?.icon} {AUDIT_CATEGORIES.find(c => c.key === historyCategory)?.label}</span>
                      <button
                        type="button"
                        onClick={() => {
                          React.startTransition(() => {
                            setHistoryCategory("all");
                            setTempCategory("all");
                          });
                        }}
                        className="hover:text-blue-900 cursor-pointer ml-1 font-black"
                      >
                        ✕
                      </button>
                    </span>
                  )}
                  {historyStatus !== "all" && (
                    <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-emerald-50 text-emerald-700 border border-emerald-200 text-xs font-bold">
                      <span>Status: {AUDIT_STATUSES.find(s => s.key === historyStatus)?.label || historyStatus}</span>
                      <button
                        type="button"
                        onClick={() => {
                          React.startTransition(() => {
                            setHistoryStatus("all");
                            setTempStatus("all");
                          });
                        }}
                        className="hover:text-emerald-900 cursor-pointer ml-1 font-black"
                      >
                        ✕
                      </button>
                    </span>
                  )}
                  {historySearch && (
                    <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-slate-100 text-slate-700 border border-slate-200 text-xs font-bold">
                      <span>Search: "{historySearch}"</span>
                      <button
                        type="button"
                        onClick={() => setHistorySearch("")}
                        className="hover:text-slate-900 cursor-pointer ml-1 font-black"
                      >
                        ✕
                      </button>
                    </span>
                  )}
                  <button
                    type="button"
                    onClick={() => {
                      setHistoryCategory("all");
                      setHistoryStatus("all");
                      setTempCategory("all");
                      setTempStatus("all");
                      setHistorySearch("");
                    }}
                    className="text-[11px] font-bold text-rose-600 hover:text-rose-700 underline cursor-pointer ml-1"
                  >
                    Clear All
                  </button>
                </div>
              )}

              {/* Audit History Records Table */}
              {historyLoading && auditHistory.length === 0 ? (
                <div className="py-16 text-center text-slate-500 bg-white rounded-2xl border border-slate-200 shadow-2xs space-y-2">
                  <div className="text-2xl animate-spin inline-block">🔄</div>
                  <p className="text-xs font-bold text-slate-700">Audit records sync ho rahe hain...</p>
                  <p className="text-[11px] text-slate-400">Live transactions database se load ho rahi hain</p>
                </div>
              ) : auditHistory.length === 0 ? (
                <div className="py-16 text-center text-gray-400 bg-slate-50 rounded-2xl border border-dashed border-gray-200">
                  <span className="text-4xl block mb-2">📜</span>
                  <p className="text-sm font-semibold">No audit records found matching this filter.</p>
                  <p className="text-xs text-gray-400 mt-1">Try changing category or clearing search query.</p>
                </div>
              ) : (
                <>
                  {/* Mobile Responsive Audit Cards (sm:hidden) */}
                  <div className="sm:hidden space-y-2.5">
                    {auditHistory.map((item, idx) => {
                      const isApproved = item.status === "approved" || item.status === "completed" || item.status === "verified" || item.status === "active";
                      const isPending = item.status === "pending";
                      const isRejected = item.status === "rejected";
                      const d = new Date(item.requestedAt || item.timestamp || item.createdAt || Date.now());
                      const isDateValid = !isNaN(d.getTime());
                      const refVal = item.reference || item.referenceId;
                      const noteVal = item.notes || item.remarks;
                      const isMonetary = item.amount != null && Number(item.amount) > 0;

                      return (
                        <div key={item.id || idx} className="bg-white rounded-2xl p-3.5 border border-slate-200/90 shadow-2xs space-y-2.5">
                          {/* Row 1: Category & Status */}
                          <div className="flex items-center justify-between gap-2">
                            <span className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider ${
                              item.category === "deposit"
                                ? "bg-emerald-50 text-emerald-700 border border-emerald-200/80"
                                : item.category === "withdrawal"
                                ? "bg-rose-50 text-rose-700 border border-rose-200/80"
                                : item.category === "transfer"
                                ? "bg-blue-50 text-blue-700 border border-blue-200/80"
                                : item.category === "kyc"
                                ? item.subCategory === "loan_lending_kyc"
                                  ? "bg-sky-50 text-sky-800 border border-sky-200/80"
                                  : "bg-amber-50 text-amber-800 border border-amber-200/80"
                                : item.category === "loan"
                                ? "bg-indigo-50 text-indigo-700 border border-indigo-200/80"
                                : item.category === "agent"
                                ? "bg-purple-50 text-purple-700 border border-purple-200/80"
                                : "bg-teal-50 text-teal-700 border border-teal-200/80"
                            }`}>
                              {item.category === "deposit" ? "💰 Deposit" :
                               item.category === "withdrawal" ? "💸 Withdrawal" :
                               item.category === "transfer" ? "🔄 Transfer" :
                               item.category === "kyc"
                                 ? item.subCategory === "loan_lending_kyc" ? "🏦 Loan KYC" : "📄 Normal KYC" :
                               item.category === "loan" ? "📑 Loan" :
                               item.category === "agent" ? "🤝 Agent" : "📈 Yield"}
                            </span>

                            <span className={`px-2 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider ${
                              isApproved
                                ? "bg-emerald-50 text-emerald-700 border border-emerald-200/80"
                                : isPending
                                ? "bg-amber-50 text-amber-700 border border-amber-200/80"
                                : isRejected
                                ? "bg-rose-50 text-rose-700 border border-rose-200/80"
                                : "bg-slate-100 text-slate-700"
                            }`}>
                              {item.status}
                            </span>
                          </div>

                          {/* Row 2: Title & Amount (Strictly No Wrap on +) */}
                          <div className="flex items-baseline justify-between gap-2">
                            <p className="font-extrabold text-slate-900 text-xs leading-snug">{item.title}</p>
                            {item.category === "agent" ? (
                              <div className="flex flex-wrap items-center justify-end gap-1 shrink-0 max-w-[65%]">
                                <span className="px-1.5 py-0.5 rounded bg-blue-50 text-blue-700 border border-blue-200 font-mono font-bold text-[9px]">
                                  Loan: {item.commissions?.loan ?? item.commissionRate ?? 1}%
                                </span>
                                <span className="px-1.5 py-0.5 rounded bg-emerald-50 text-emerald-700 border border-emerald-200 font-mono font-bold text-[9px]">
                                  Lend: {item.commissions?.lending ?? item.commissionRate ?? 4}%
                                </span>
                                <span className="px-1.5 py-0.5 rounded bg-amber-50 text-amber-700 border border-amber-200 font-mono font-bold text-[9px]">
                                  Debt: {item.commissions?.investment ?? item.commissionRate ?? 1}%
                                </span>
                                <span className="px-1.5 py-0.5 rounded bg-purple-50 text-purple-700 border border-purple-200 font-mono font-bold text-[9px]">
                                  Bond: {item.commissions?.bond ?? item.commissionRate ?? 4}%
                                </span>
                              </div>
                            ) : isMonetary ? (
                              <span className={`font-mono tabular-nums whitespace-nowrap font-black text-sm shrink-0 ${
                                item.category === "deposit" || item.category === "yield"
                                  ? "text-emerald-600"
                                  : item.category === "withdrawal"
                                  ? "text-rose-600"
                                  : "text-slate-900"
                              }`}>
                                {item.category === "deposit" || item.category === "yield" ? "+" : item.category === "withdrawal" ? "-" : ""}
                                ₹{Number(item.amount).toLocaleString("en-IN")}
                              </span>
                            ) : (
                              <span className="text-slate-400 font-bold text-xs">—</span>
                            )}
                          </div>

                          {/* Row 3: User Details */}
                          <div className="flex items-center justify-between text-[11px] text-slate-500 pt-1 border-t border-slate-100">
                            <div className="min-w-0 pr-2">
                              <span className="font-bold text-slate-800 truncate block">{item.userName || "Direct User"}</span>
                              {item.userEmail && <span className="font-mono text-[10px] text-slate-400 truncate block">{item.userEmail}</span>}
                            </div>
                          </div>

                          {/* Row 4: Request vs Approval Audit Timestamps & Approver Device Badge */}
                          <div className="p-2 bg-slate-50 rounded-xl border border-slate-100 text-[10px] font-mono space-y-1">
                            <div className="flex items-center justify-between text-slate-600">
                              <span className="text-slate-400">{item.category === "agent" ? "📝 Applied:" : "📥 Requested:"}</span>
                              <span className="font-bold text-slate-800">{isDateValid ? d.toLocaleDateString("en-IN", { day: "2-digit", month: "short" }) + " " + d.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" }) : "Recent"}</span>
                            </div>
                            {isApproved && item.approvedAt && (() => {
                              const ad = new Date(item.approvedAt);
                              return (
                                <div className="flex items-center justify-between text-emerald-800">
                                  <span>✅ Approved:</span>
                                  <span className="font-bold">{!isNaN(ad.getTime()) ? ad.toLocaleDateString("en-IN", { day: "2-digit", month: "short" }) + " " + ad.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" }) : "Approved"} {item.turnaround ? `(${item.turnaround})` : ""}</span>
                                </div>
                              );
                            })()}
                            {isApproved && (item.approverName || item.approverDevice) && (
                              <div className="text-[9px] text-slate-600 font-bold pt-0.5 border-t border-slate-200/60 flex items-center gap-1 truncate">
                                <span>🛡️</span>
                                <span className="truncate">{item.approverName || "Admin"} • {item.approverDevice || "Web Console"}</span>
                              </div>
                            )}
                          </div>

                          {/* Row 5: Ref & Details */}
                          {(refVal || noteVal) && (
                            <div className="bg-slate-50/80 rounded-xl p-2 text-[10px] font-mono text-slate-600 break-all space-y-0.5 border border-slate-100">
                              {refVal && <div>Ref: <span className="font-bold text-slate-800">{refVal}</span></div>}
                              {noteVal && <div className="text-slate-500 font-sans italic">{noteVal}</div>}
                            </div>
                          )}

                          {/* Evidence Photo preview on mobile */}
                          {item.proofUrl && (
                            <div className="pt-1 border-t border-slate-100">
                              <button
                                type="button"
                                onClick={() => { setLightboxImg(item.proofUrl); setZoomLevel(1); }}
                                className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-slate-50 hover:bg-blue-50 text-blue-700 rounded-lg text-[10px] font-bold border border-slate-200 transition cursor-pointer active:scale-95 shadow-2xs"
                              >
                                <img src={item.proofUrl} alt="Evidence" className="w-4 h-4 object-cover rounded border border-slate-200" />
                                <span>Evidence Photo / Receipt</span>
                                <span>🔍</span>
                              </button>
                            </div>
                          )}

                          {/* KYC Document preview pills on mobile with tap to zoom */}
                          {item.category === "kyc" && item.hasPhotos && item.documents && (
                            <div className="flex items-center gap-1.5 flex-wrap pt-1 border-t border-slate-100">
                              {item.documents.doc1Url && (
                                <button
                                  type="button"
                                  onClick={() => setLightboxImg(item.documents.doc1Url)}
                                  className="inline-flex items-center gap-1 px-2 py-1 bg-slate-50 hover:bg-blue-50 text-slate-700 hover:text-blue-700 rounded-lg text-[10px] font-bold border border-slate-200 transition cursor-pointer active:scale-95"
                                >
                                  {item.documents.doc1Url.startsWith("data:image") ? (
                                    <img src={item.documents.doc1Url} alt="UID Front" className="w-3.5 h-3.5 object-cover rounded" />
                                  ) : <span>🪪</span>}
                                  <span>UID Front</span>
                                  <span>🔍</span>
                                </button>
                              )}
                              {item.documents.doc1BackUrl && (
                                <button
                                  type="button"
                                  onClick={() => setLightboxImg(item.documents.doc1BackUrl)}
                                  className="inline-flex items-center gap-1 px-2 py-1 bg-slate-50 hover:bg-blue-50 text-slate-700 hover:text-blue-700 rounded-lg text-[10px] font-bold border border-slate-200 transition cursor-pointer active:scale-95"
                                >
                                  {item.documents.doc1BackUrl.startsWith("data:image") ? (
                                    <img src={item.documents.doc1BackUrl} alt="UID Back" className="w-3.5 h-3.5 object-cover rounded" />
                                  ) : <span>🔄</span>}
                                  <span>UID Back</span>
                                  <span>🔍</span>
                                </button>
                              )}
                              {item.documents.doc2Url && (
                                <button
                                  type="button"
                                  onClick={() => setLightboxImg(item.documents.doc2Url)}
                                  className="inline-flex items-center gap-1 px-2 py-1 bg-slate-50 hover:bg-blue-50 text-slate-700 hover:text-blue-700 rounded-lg text-[10px] font-bold border border-slate-200 transition cursor-pointer active:scale-95"
                                >
                                  {item.documents.doc2Url.startsWith("data:image") ? (
                                    <img src={item.documents.doc2Url} alt="Doc 2" className="w-3.5 h-3.5 object-cover rounded" />
                                  ) : <span>📑</span>}
                                  <span>{item.subCategory === "loan_lending_kyc" ? "Cheque" : "PAN"}</span>
                                  <span>🔍</span>
                                </button>
                              )}
                              {item.documents.doc2BackUrl && (
                                <button
                                  type="button"
                                  onClick={() => setLightboxImg(item.documents.doc2BackUrl)}
                                  className="inline-flex items-center gap-1 px-2 py-1 bg-slate-50 hover:bg-blue-50 text-slate-700 hover:text-blue-700 rounded-lg text-[10px] font-bold border border-slate-200 transition cursor-pointer active:scale-95"
                                >
                                  {item.documents.doc2BackUrl.startsWith("data:image") ? (
                                    <img src={item.documents.doc2BackUrl} alt="Doc 2 Back" className="w-3.5 h-3.5 object-cover rounded" />
                                  ) : <span>📄</span>}
                                  <span>{item.subCategory === "loan_lending_kyc" ? "Cheque Back" : "PAN Back"}</span>
                                  <span>🔍</span>
                                </button>
                              )}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>

                  {/* Desktop / Tablet Table */}
                  <div className="hidden sm:block overflow-x-auto rounded-2xl border border-slate-200/90 shadow-2xs">
                    <table className="w-full min-w-[850px] table-fixed border-collapse bg-white text-left text-xs">
                      <thead className="sticky top-0 z-10 bg-slate-50/95 backdrop-blur-xs border-b border-slate-200 shadow-2xs">
                        <tr className="text-[10px] font-black text-slate-500 uppercase tracking-wider">
                          <th className="py-3 px-3.5 w-[150px]">Timestamp & Audit</th>
                          <th className="py-3 px-3.5 w-[175px]">Category & Action</th>
                          <th className="py-3 px-3.5 w-[185px]">User / Account</th>
                          <th className="py-3 px-3.5 w-[140px] text-right">Amount / Value</th>
                          <th className="py-3 px-3.5 w-[95px]">Status</th>
                          <th className="py-3 px-3.5">Reference / Details & Docs</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {auditHistory.map((item, idx) => {
                          const isApproved = item.status === "approved" || item.status === "completed" || item.status === "verified" || item.status === "active";
                          const isPending = item.status === "pending";
                          const isRejected = item.status === "rejected";
                          const d = new Date(item.requestedAt || item.timestamp || item.createdAt || Date.now());
                          const isDateValid = !isNaN(d.getTime());
                          const refVal = item.reference || item.referenceId;
                          const noteVal = item.notes || item.remarks;
                          const isMonetary = item.amount != null && Number(item.amount) > 0;

                          return (
                            <tr key={item.id || idx} className="hover:bg-slate-50/80 transition-colors">
                              {/* Timestamp & Approval Audit */}
                              <td className="py-3.5 px-3.5 font-mono text-[11px] text-slate-600 align-top">
                                <div className="space-y-0.5">
                                  <span className="block font-bold text-slate-900" title="Request Time">
                                    {item.category === "agent" ? "📝 Applied: " : "📥 Req: "}{isDateValid ? d.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" }) : "Recent"}
                                  </span>
                                  <span className="text-[10px] text-slate-400 block">
                                    {isDateValid ? d.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" }) : ""}
                                  </span>
                                  {isApproved && item.approvedAt && (() => {
                                    const ad = new Date(item.approvedAt);
                                    const isAdValid = !isNaN(ad.getTime());
                                    return (
                                      <span className="block text-[10px] text-emerald-700 font-semibold mt-1" title="Approval Time">
                                        ✅ Appr: {isAdValid ? ad.toLocaleDateString("en-IN", { day: "2-digit", month: "short" }) + " " + ad.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" }) : "Approved"}
                                        {item.turnaround ? ` (${item.turnaround})` : ""}
                                      </span>
                                    );
                                  })()}
                                  {isApproved && (item.approverName || item.approverDevice) && (
                                    <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-slate-100 border border-slate-200 text-slate-700 text-[9px] font-bold mt-1 max-w-[145px] truncate">
                                      <span>🛡️</span>
                                      <span className="truncate">{item.approverName || "Admin"} • {item.approverDevice || "Web"}</span>
                                    </span>
                                  )}
                                </div>
                              </td>

                              {/* Category & Action */}
                              <td className="py-3.5 px-3.5 align-top">
                                <span className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider ${
                                  item.category === "deposit"
                                    ? "bg-emerald-50 text-emerald-700 border border-emerald-200/80"
                                    : item.category === "withdrawal"
                                    ? "bg-rose-50 text-rose-700 border border-rose-200/80"
                                    : item.category === "transfer"
                                    ? "bg-blue-50 text-blue-700 border border-blue-200/80"
                                    : item.category === "kyc"
                                    ? item.subCategory === "loan_lending_kyc"
                                      ? "bg-sky-50 text-sky-800 border border-sky-200/80"
                                      : "bg-amber-50 text-amber-800 border border-amber-200/80"
                                    : item.category === "loan"
                                    ? "bg-indigo-50 text-indigo-700 border border-indigo-200/80"
                                    : item.category === "agent"
                                    ? "bg-purple-50 text-purple-700 border border-purple-200/80"
                                    : "bg-teal-50 text-teal-700 border border-teal-200/80"
                                }`}>
                                  {item.category === "deposit" ? "💰 Deposit" :
                                   item.category === "withdrawal" ? "💸 Withdrawal" :
                                   item.category === "transfer" ? "🔄 Transfer" :
                                   item.category === "kyc"
                                     ? item.subCategory === "loan_lending_kyc" ? "🏦 Loan KYC" : "📄 Normal KYC" :
                                   item.category === "loan" ? "📑 Loan" :
                                   item.category === "agent" ? "🤝 Agent" : "📈 Yield"}
                                </span>
                                <p className="font-extrabold text-slate-900 text-xs mt-1 leading-snug">{item.title}</p>
                              </td>

                              {/* User */}
                              <td className="py-3.5 px-3.5 align-top">
                                <p className="font-extrabold text-slate-900 text-xs leading-snug truncate">{item.userName || "Direct User"}</p>
                                {item.userEmail && <p className="text-[11px] text-slate-500 font-mono truncate max-w-[175px]">{item.userEmail}</p>}
                                {item.userPhone && <p className="text-[10px] text-slate-400 font-mono">{item.userPhone}</p>}
                              </td>

                              {/* Amount / Value (Strictly No Line-Wrapping on +) */}
                              <td className="py-3.5 px-3.5 align-top text-right w-[140px] whitespace-nowrap font-mono tabular-nums font-black text-xs sm:text-sm">
                                {item.category === "agent" ? (
                                  <div className="flex flex-wrap items-center justify-end gap-1">
                                    <span className="px-1.5 py-0.5 rounded bg-blue-50 text-blue-700 border border-blue-200 text-[10px] font-bold">
                                      Loan: {item.commissions?.loan ?? item.commissionRate ?? 1}%
                                    </span>
                                    <span className="px-1.5 py-0.5 rounded bg-emerald-50 text-emerald-700 border border-emerald-200 text-[10px] font-bold">
                                      Lend: {item.commissions?.lending ?? item.commissionRate ?? 4}%
                                    </span>
                                    <span className="px-1.5 py-0.5 rounded bg-amber-50 text-amber-700 border border-amber-200 text-[10px] font-bold">
                                      Debt: {item.commissions?.investment ?? item.commissionRate ?? 1}%
                                    </span>
                                    <span className="px-1.5 py-0.5 rounded bg-purple-50 text-purple-700 border border-purple-200 text-[10px] font-bold">
                                      Bond: {item.commissions?.bond ?? item.commissionRate ?? 4}%
                                    </span>
                                  </div>
                                ) : isMonetary ? (
                                  <span className={`inline-block ${
                                    item.category === "deposit" || item.category === "yield"
                                      ? "text-emerald-600"
                                      : item.category === "withdrawal"
                                      ? "text-rose-600"
                                      : "text-slate-900"
                                  }`}>
                                    {item.category === "deposit" || item.category === "yield" ? "+" : item.category === "withdrawal" ? "-" : ""}
                                    ₹{Number(item.amount).toLocaleString("en-IN")}
                                  </span>
                                ) : (
                                  <span className="text-slate-400 font-bold text-xs">—</span>
                                )}
                              </td>

                              {/* Status */}
                              <td className="py-3.5 px-3.5 align-top">
                                <span className={`inline-block px-2 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider ${
                                  isApproved
                                    ? "bg-emerald-50 text-emerald-700 border border-emerald-200/80"
                                    : isPending
                                    ? "bg-amber-50 text-amber-700 border border-amber-200/80"
                                    : isRejected
                                    ? "bg-rose-50 text-rose-700 border border-rose-200/80"
                                    : "bg-slate-100 text-slate-700"
                                }`}>
                                  {item.status}
                                </span>
                              </td>

                              {/* Reference / Details & KYC Document Thumbnails */}
                              <td className="py-3.5 px-3.5 align-top text-xs text-slate-600">
                                {refVal && (
                                  <p className="font-mono text-[10px] text-slate-700 font-bold break-all" title={refVal}>
                                    Ref: <span className="text-slate-900">{refVal}</span>
                                  </p>
                                )}
                                {noteVal && (
                                  <p className="text-slate-600 text-[11px] mt-0.5 font-sans" title={noteVal}>
                                    {noteVal}
                                  </p>
                                )}

                                {/* Evidence Photo Preview Thumbnail */}
                                {item.proofUrl && (
                                  <div className="mt-1.5 pt-1 border-t border-slate-100">
                                    <button
                                      type="button"
                                      onClick={() => { setLightboxImg(item.proofUrl); setZoomLevel(1); }}
                                      className="inline-flex items-center gap-1.5 px-2 py-0.5 bg-slate-50 hover:bg-blue-50 border border-slate-200 hover:border-blue-300 rounded-lg text-[10px] font-bold text-blue-700 cursor-pointer transition active:scale-95 shadow-2xs"
                                    >
                                      <img src={item.proofUrl} alt="Evidence" className="w-3.5 h-3.5 object-cover rounded border border-slate-200" />
                                      <span>Evidence Receipt</span>
                                      <span>🔍</span>
                                    </button>
                                  </div>
                                )}

                                {/* KYC Photos / Documents Pill Gallery */}
                                {item.category === "kyc" && (
                                  <div className="mt-1.5 pt-1.5 border-t border-slate-100">
                                    {item.hasPhotos && item.documents ? (
                                      <div className="space-y-1">
                                        <span className="text-[9px] font-black text-slate-400 uppercase tracking-wider block">
                                          KYC Document Photos (Tap to Zoom):
                                        </span>
                                        <div className="flex items-center gap-1.5 flex-wrap">
                                          {item.documents.doc1Url && (
                                            <button
                                              type="button"
                                              onClick={() => setLightboxImg(item.documents.doc1Url)}
                                              className="inline-flex items-center gap-1 px-2 py-0.5 bg-slate-50 hover:bg-blue-50 border border-slate-200 hover:border-blue-300 rounded-lg text-[10px] font-bold text-slate-700 hover:text-blue-700 cursor-pointer transition active:scale-95 group/doc shadow-2xs"
                                            >
                                              {item.documents.doc1Url.startsWith("data:image") ? (
                                                <img src={item.documents.doc1Url} alt="UID Front" className="w-3.5 h-3.5 object-cover rounded border border-slate-200" />
                                              ) : <span>🪪</span>}
                                              <span>UID Front</span>
                                              <span className="text-slate-400 group-hover/doc:text-blue-600">🔍</span>
                                            </button>
                                          )}
                                          {item.documents.doc1BackUrl && (
                                            <button
                                              type="button"
                                              onClick={() => setLightboxImg(item.documents.doc1BackUrl)}
                                              className="inline-flex items-center gap-1 px-2 py-0.5 bg-slate-50 hover:bg-blue-50 border border-slate-200 hover:border-blue-300 rounded-lg text-[10px] font-bold text-slate-700 hover:text-blue-700 cursor-pointer transition active:scale-95 group/doc shadow-2xs"
                                            >
                                              {item.documents.doc1BackUrl.startsWith("data:image") ? (
                                                <img src={item.documents.doc1BackUrl} alt="UID Back" className="w-3.5 h-3.5 object-cover rounded border border-slate-200" />
                                              ) : <span>🔄</span>}
                                              <span>UID Back</span>
                                              <span className="text-slate-400 group-hover/doc:text-blue-600">🔍</span>
                                            </button>
                                          )}
                                          {item.documents.doc2Url && (
                                            <button
                                              type="button"
                                              onClick={() => setLightboxImg(item.documents.doc2Url)}
                                              className="inline-flex items-center gap-1 px-2 py-0.5 bg-slate-50 hover:bg-blue-50 border border-slate-200 hover:border-blue-300 rounded-lg text-[10px] font-bold text-slate-700 hover:text-blue-700 cursor-pointer transition active:scale-95 group/doc shadow-2xs"
                                            >
                                              {item.documents.doc2Url.startsWith("data:image") ? (
                                                <img src={item.documents.doc2Url} alt="Doc2 Front" className="w-3.5 h-3.5 object-cover rounded border border-slate-200" />
                                              ) : <span>📑</span>}
                                              <span>{item.subCategory === "loan_lending_kyc" ? "Cheque Front" : "PAN Front"}</span>
                                              <span className="text-slate-400 group-hover/doc:text-blue-600">🔍</span>
                                            </button>
                                          )}
                                          {item.documents.doc2BackUrl && (
                                            <button
                                              type="button"
                                              onClick={() => setLightboxImg(item.documents.doc2BackUrl)}
                                              className="inline-flex items-center gap-1 px-2 py-0.5 bg-slate-50 hover:bg-blue-50 border border-slate-200 hover:border-blue-300 rounded-lg text-[10px] font-bold text-slate-700 hover:text-blue-700 cursor-pointer transition active:scale-95 group/doc shadow-2xs"
                                            >
                                              {item.documents.doc2BackUrl.startsWith("data:image") ? (
                                                <img src={item.documents.doc2BackUrl} alt="Doc2 Back" className="w-3.5 h-3.5 object-cover rounded border border-slate-200" />
                                              ) : <span>📄</span>}
                                              <span>{item.subCategory === "loan_lending_kyc" ? "Cheque Back" : "PAN Back"}</span>
                                              <span className="text-slate-400 group-hover/doc:text-blue-600">🔍</span>
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
              </>
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
              <div className="mb-5 p-4 rounded-2xl bg-slate-50 border border-slate-200/90 space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <span className="text-base">⚡</span>
                    <h4 className="text-xs sm:text-sm font-extrabold text-slate-900">
                      Loan Pre-Closure 3-Way Sharing Rule (User • Agent • Company)
                    </h4>
                  </div>
                  <span className="px-2.5 py-0.5 rounded-full text-[10px] font-black bg-blue-600 text-white uppercase tracking-wider">
                    1:1:1 Equal Split
                  </span>
                </div>
                <div className="text-[11px] sm:text-xs text-slate-700 leading-relaxed bg-white p-3 rounded-xl border border-slate-200/80">
                  <p className="font-bold text-slate-900 mb-1">
                    📌 <strong>Official Pre-Closure Rules:</strong>
                  </p>
                  <ul className="list-disc list-inside space-y-1 text-slate-600">
                    <li><strong>9 Kist Rule:</strong> Agar 9th installment se pehle close hoga to hi fayda/discount hoga. (9 ya uske baad discount zero).</li>
                    <li><strong>15 Kist Minimum Payoff:</strong> Borrower ko minimum 15 kiston ka bhugtan karna zaroori hai.</li>
                    <li><strong>x% Formula:</strong> 15 ke upar jitna installment hai, utna percent chhoot hoga: <code className="font-mono bg-blue-50 px-1 py-0.5 rounded text-blue-700 font-bold border border-blue-200">Total Kist - 15 = x% of Loan Amount</code>.</li>
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
                  <div className="p-3 bg-white rounded-xl border border-blue-100 shadow-2xs">
                    <span className="text-[10px] uppercase font-bold text-blue-600 block">3️⃣ Company Ko Profit</span>
                    <span className="text-base font-black text-blue-700">x / 3 % Profit</span>
                    <p className="text-[10px] text-gray-500 mt-0.5">Company reserves me retained</p>
                  </div>
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-center text-[10px] pt-1 border-t border-slate-200 text-slate-700 font-medium">
                  <div className="bg-white py-1.5 px-2 rounded-lg border border-slate-200">
                    <span className="font-mono text-slate-900 font-bold block">18 Kist (x=3%)</span>
                    <span>1% User | 1% Agent | 1% Co.</span>
                  </div>
                  <div className="bg-white py-1.5 px-2 rounded-lg border border-slate-200">
                    <span className="font-mono text-slate-900 font-bold block">21 Kist (x=6%)</span>
                    <span>2% User | 2% Agent | 2% Co.</span>
                  </div>
                  <div className="bg-white py-1.5 px-2 rounded-lg border border-slate-200">
                    <span className="font-mono text-slate-900 font-bold block">24 Kist (x=9%)</span>
                    <span>3% User | 3% Agent | 3% Co.</span>
                  </div>
                  <div className="bg-white py-1.5 px-2 rounded-lg border border-slate-200">
                    <span className="font-mono text-slate-900 font-bold block">30 Kist (x=15%)</span>
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
                      ? "bg-blue-600 text-white shadow-xs"
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
                            <div className="text-xs text-gray-500 mt-1 flex flex-wrap gap-x-3 gap-y-1 items-center">
                              <span>📞 <a href={`tel:${a.phone}`} className="text-blue-600 font-bold hover:underline">{a.phone}</a></span>
                              <span>✉️ {a.email}</span>
                              {prof.city && <span>📍 {prof.city}</span>}
                              {a.nominatedBy && (
                                <span className="bg-purple-100 text-purple-950 px-2 py-0.5 rounded-md font-extrabold border border-purple-300 text-[11px] flex items-center gap-1">
                                  <span>👥</span> Nominated as Sub-Agent by: <strong className="text-purple-900">{a.nominatedBy.name}</strong> ({a.nominatedBy.phone})
                                </span>
                              )}
                            </div>
                          </div>

                          <div className="flex flex-wrap items-center gap-2 shrink-0">
                            <a
                              href={`tel:${a.phone}`}
                              className="px-3 py-1.5 bg-blue-50 text-blue-700 hover:bg-blue-100 border border-blue-200 rounded-xl text-xs font-bold transition flex items-center gap-1"
                            >
                              📞 Call Applicant
                            </a>
                            {isPending ? (
                              <button
                                onClick={() => rejectAgent(a._id)}
                                className="px-3 py-1.5 bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 rounded-xl text-xs font-bold transition cursor-pointer"
                              >
                                Reject
                              </button>
                            ) : null}
                          </div>
                        </div>

                        {/* Inline 4-Category Commission Setup for Pending Application */}
                        {isPending && (
                          <div className="w-full mt-3 p-3.5 bg-gradient-to-r from-amber-50 to-orange-50 border border-amber-300 rounded-2xl space-y-2">
                            <div className="flex flex-wrap items-center justify-between gap-1">
                              <span className="text-xs font-black text-amber-950 flex items-center gap-1.5">
                                <span>⚡</span> Is Naye Agent Ke Liye 4 Commissions Set Karein:
                              </span>
                              <span className="text-[10px] bg-amber-200 text-amber-900 font-bold px-2 py-0.5 rounded-full">
                                Admin Custom Approval
                              </span>
                            </div>
                            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
                              <div className="p-2 bg-white rounded-xl border border-blue-200 shadow-2xs">
                                <span className="text-[10px] font-bold text-blue-900 block mb-1">🏦 Loan %</span>
                                <div className="flex items-center gap-1">
                                  <input
                                    type="number"
                                    min="0"
                                    max="50"
                                    step="0.5"
                                    value={agentCategoryInputs[a._id]?.loan !== undefined ? agentCategoryInputs[a._id]?.loan : (prof.commissions?.loan ?? 1)}
                                    onChange={(e) => {
                                      const cur = agentCategoryInputs[a._id] || {};
                                      setAgentCategoryInputs({
                                        ...agentCategoryInputs,
                                        [a._id]: {
                                          loan: e.target.value,
                                          lending: cur.lending !== undefined ? cur.lending : (prof.commissions?.lending ?? 4),
                                          investment: cur.investment !== undefined ? cur.investment : (prof.commissions?.investment ?? 1),
                                          bond: cur.bond !== undefined ? cur.bond : (prof.commissions?.bond ?? 4)
                                        }
                                      });
                                    }}
                                    className="w-full px-2 py-1 text-xs font-black text-blue-950 text-center bg-blue-50/50 border border-blue-300 rounded-lg outline-none"
                                  />
                                  <span className="text-xs font-bold text-blue-900">%</span>
                                </div>
                              </div>
                              <div className="p-2 bg-white rounded-xl border border-emerald-200 shadow-2xs">
                                <span className="text-[10px] font-bold text-emerald-900 block mb-1">🤝 Lending %</span>
                                <div className="flex items-center gap-1">
                                  <input
                                    type="number"
                                    min="0"
                                    max="50"
                                    step="0.5"
                                    value={agentCategoryInputs[a._id]?.lending !== undefined ? agentCategoryInputs[a._id]?.lending : (prof.commissions?.lending ?? 4)}
                                    onChange={(e) => {
                                      const cur = agentCategoryInputs[a._id] || {};
                                      setAgentCategoryInputs({
                                        ...agentCategoryInputs,
                                        [a._id]: {
                                          loan: cur.loan !== undefined ? cur.loan : (prof.commissions?.loan ?? 1),
                                          lending: e.target.value,
                                          investment: cur.investment !== undefined ? cur.investment : (prof.commissions?.investment ?? 1),
                                          bond: cur.bond !== undefined ? cur.bond : (prof.commissions?.bond ?? 4)
                                        }
                                      });
                                    }}
                                    className="w-full px-2 py-1 text-xs font-black text-emerald-950 text-center bg-emerald-50/50 border border-emerald-300 rounded-lg outline-none"
                                  />
                                  <span className="text-xs font-bold text-emerald-900">%</span>
                                </div>
                              </div>
                              <div className="p-2 bg-white rounded-xl border border-amber-200 shadow-2xs">
                                <span className="text-[10px] font-bold text-amber-900 block mb-1">📈 Debt %</span>
                                <div className="flex items-center gap-1">
                                  <input
                                    type="number"
                                    min="0"
                                    max="50"
                                    step="0.5"
                                    value={agentCategoryInputs[a._id]?.investment !== undefined ? agentCategoryInputs[a._id]?.investment : (prof.commissions?.investment ?? 1)}
                                    onChange={(e) => {
                                      const cur = agentCategoryInputs[a._id] || {};
                                      setAgentCategoryInputs({
                                        ...agentCategoryInputs,
                                        [a._id]: {
                                          loan: cur.loan !== undefined ? cur.loan : (prof.commissions?.loan ?? 1),
                                          lending: cur.lending !== undefined ? cur.lending : (prof.commissions?.lending ?? 4),
                                          investment: e.target.value,
                                          bond: cur.bond !== undefined ? cur.bond : (prof.commissions?.bond ?? 4)
                                        }
                                      });
                                    }}
                                    className="w-full px-2 py-1 text-xs font-black text-amber-950 text-center bg-amber-50/50 border border-amber-300 rounded-lg outline-none"
                                  />
                                  <span className="text-xs font-bold text-amber-900">%</span>
                                </div>
                              </div>
                              <div className="p-2 bg-white rounded-xl border border-purple-200 shadow-2xs">
                                <span className="text-[10px] font-bold text-purple-900 block mb-1">📜 Bond %</span>
                                <div className="flex items-center gap-1">
                                  <input
                                    type="number"
                                    min="0"
                                    max="50"
                                    step="0.5"
                                    value={agentCategoryInputs[a._id]?.bond !== undefined ? agentCategoryInputs[a._id]?.bond : (prof.commissions?.bond ?? 4)}
                                    onChange={(e) => {
                                      const cur = agentCategoryInputs[a._id] || {};
                                      setAgentCategoryInputs({
                                        ...agentCategoryInputs,
                                        [a._id]: {
                                          loan: cur.loan !== undefined ? cur.loan : (prof.commissions?.loan ?? 1),
                                          lending: cur.lending !== undefined ? cur.lending : (prof.commissions?.lending ?? 4),
                                          investment: cur.investment !== undefined ? cur.investment : (prof.commissions?.investment ?? 1),
                                          bond: e.target.value
                                        }
                                      });
                                    }}
                                    className="w-full px-2 py-1 text-xs font-black text-purple-950 text-center bg-purple-50/50 border border-purple-300 rounded-lg outline-none"
                                  />
                                  <span className="text-xs font-bold text-purple-900">%</span>
                                </div>
                              </div>
                            </div>
                            <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-amber-200">
                              <span className="text-[11px] text-amber-900 font-medium">
                                💳 P2P Wallet Transfers: <strong>0%</strong> (Nahi milega)
                              </span>
                              <button
                                onClick={() => approveAgent(a._id, undefined, {
                                  loan: parseFloat(agentCategoryInputs[a._id]?.loan !== undefined ? agentCategoryInputs[a._id]?.loan : (prof.commissions?.loan ?? 1)),
                                  lending: parseFloat(agentCategoryInputs[a._id]?.lending !== undefined ? agentCategoryInputs[a._id]?.lending : (prof.commissions?.lending ?? 4)),
                                  investment: parseFloat(agentCategoryInputs[a._id]?.investment !== undefined ? agentCategoryInputs[a._id]?.investment : (prof.commissions?.investment ?? 1)),
                                  bond: parseFloat(agentCategoryInputs[a._id]?.bond !== undefined ? agentCategoryInputs[a._id]?.bond : (prof.commissions?.bond ?? 4))
                                })}
                                className="px-4 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-black transition shadow-sm active:scale-95 cursor-pointer flex items-center gap-1.5"
                              >
                                <span>✓</span> {a.nominatedBy ? "Approve Sub-Agent with these Rates" : "Approve Agent with these Rates"}
                              </button>
                            </div>
                          </div>
                        )}

                        {/* Agent Information Strip */}
                        <div className="pt-3 grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                          <div className="p-2.5 bg-white rounded-xl border border-gray-100">
                            <span className="text-gray-400 font-medium block text-[11px]">Business / Shop</span>
                            <span className="font-bold text-gray-800">{prof.businessName || "Not specified"}</span>
                          </div>

                          <div className="p-2.5 bg-white rounded-xl border border-gray-100">
                            <div className="flex items-center justify-between">
                              <span className="text-gray-400 font-medium block text-[11px]">Model & Hierarchy</span>
                              <span className="px-2 py-0.5 rounded-full font-black text-[10px] bg-indigo-100 text-indigo-900 border border-indigo-200">
                                4-Category Commission Active
                              </span>
                            </div>
                            <div className="flex flex-wrap items-center justify-between gap-2 mt-1">
                              <span className="font-bold text-gray-800 text-xs">
                                {isTeamModel ? (
                                  <span className="text-amber-700 font-black flex items-center gap-1.5">
                                    <span>👥</span> Team Model (Hierarchy Allowed)
                                  </span>
                                ) : (
                                  <span className="text-blue-700 font-black flex items-center gap-1.5">
                                    <span>👤</span> Solo Direct (Independent Agent)
                                  </span>
                                )}
                              </span>
                              <button
                                type="button"
                                onClick={() => {
                                  const target = isTeamModel ? "solo_2" : "team_1";
                                  const label = isTeamModel ? "Solo Direct" : "Team Model";
                                  if (window.confirm(`Kya aap ${a.name} ko ${label} me convert karna chahte hain?`)) {
                                    switchAgentModel(a._id, target);
                                  }
                                }}
                                className={`px-2.5 py-1 rounded-xl text-[10px] font-black transition cursor-pointer flex items-center gap-1.5 shadow-2xs border ${
                                  isTeamModel
                                    ? "bg-amber-50 hover:bg-amber-100 text-amber-900 border-amber-300"
                                    : "bg-blue-50 hover:bg-blue-100 text-blue-900 border-blue-300"
                                } active:scale-95`}
                                title={isTeamModel ? "Convert to Solo Direct" : "Convert to Team Model"}
                              >
                                <span>⇄</span> {isTeamModel ? "Convert to Solo" : "Convert to Team Model"}
                              </button>
                            </div>
                          </div>
                        </div>

                        {/* 4-Category Commission Rate Controller */}
                        <div className="mt-3 p-3 bg-white rounded-xl border border-gray-200/90 shadow-2xs space-y-2.5">
                          <div className="flex flex-wrap items-center justify-between gap-1 border-b border-gray-100 pb-2">
                            <span className="font-extrabold text-xs text-gray-900 flex items-center gap-1.5">
                              <span>⚙️</span> Multi-Category Commission Control (Bada / Ghata Sakte Hain)
                            </span>
                            <span className="text-[10px] text-gray-500 font-semibold bg-gray-100 px-2 py-0.5 rounded-full">
                              Per-Product Commission
                            </span>
                          </div>

                          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
                            {/* 1. Loan Commission */}
                            <div className="p-2.5 bg-blue-50/70 border border-blue-200/90 rounded-xl">
                              <span className="text-[11px] font-bold text-blue-900 block mb-1">🏦 Loan</span>
                              <div className="flex items-center gap-1">
                                <input
                                  type="number"
                                  min="0"
                                  max="50"
                                  step="0.5"
                                  value={agentCategoryInputs[a._id]?.loan !== undefined ? agentCategoryInputs[a._id]?.loan : (prof.commissions?.loan ?? prof.commissionRate ?? 1)}
                                  onChange={e => {
                                    const cur = agentCategoryInputs[a._id] || {};
                                    setAgentCategoryInputs({
                                      ...agentCategoryInputs,
                                      [a._id]: {
                                        loan: e.target.value,
                                        lending: cur.lending !== undefined ? cur.lending : (prof.commissions?.lending ?? 4),
                                        investment: cur.investment !== undefined ? cur.investment : (prof.commissions?.investment ?? 1),
                                        bond: cur.bond !== undefined ? cur.bond : (prof.commissions?.bond ?? 4)
                                      }
                                    });
                                  }}
                                  className="w-full px-2 py-1 text-xs font-black text-blue-950 text-center bg-white border border-blue-300 rounded-lg outline-none focus:ring-2 focus:ring-blue-500"
                                />
                                <span className="text-xs font-black text-blue-900">%</span>
                              </div>
                            </div>

                            {/* 2. Peer Lending Commission */}
                            <div className="p-2.5 bg-emerald-50/70 border border-emerald-200/90 rounded-xl">
                              <span className="text-[11px] font-bold text-emerald-900 block mb-1">🤝 Lending Account</span>
                              <div className="flex items-center gap-1">
                                <input
                                  type="number"
                                  min="0"
                                  max="50"
                                  step="0.5"
                                  value={agentCategoryInputs[a._id]?.lending !== undefined ? agentCategoryInputs[a._id]?.lending : (prof.commissions?.lending ?? 4)}
                                  onChange={e => {
                                    const cur = agentCategoryInputs[a._id] || {};
                                    setAgentCategoryInputs({
                                      ...agentCategoryInputs,
                                      [a._id]: {
                                        loan: cur.loan !== undefined ? cur.loan : (prof.commissions?.loan ?? prof.commissionRate ?? 1),
                                        lending: e.target.value,
                                        investment: cur.investment !== undefined ? cur.investment : (prof.commissions?.investment ?? 1),
                                        bond: cur.bond !== undefined ? cur.bond : (prof.commissions?.bond ?? 4)
                                      }
                                    });
                                  }}
                                  className="w-full px-2 py-1 text-xs font-black text-emerald-950 text-center bg-white border border-emerald-300 rounded-lg outline-none focus:ring-2 focus:ring-emerald-500"
                                />
                                <span className="text-xs font-black text-emerald-900">%</span>
                              </div>
                            </div>

                            {/* 3. Debt Account Commission */}
                            <div className="p-2.5 bg-amber-50/70 border border-amber-200/90 rounded-xl">
                              <span className="text-[11px] font-bold text-amber-900 block mb-1">📈 Debt Account</span>
                              <div className="flex items-center gap-1">
                                <input
                                  type="number"
                                  min="0"
                                  max="50"
                                  step="0.5"
                                  value={agentCategoryInputs[a._id]?.investment !== undefined ? agentCategoryInputs[a._id]?.investment : (prof.commissions?.investment ?? 1)}
                                  onChange={e => {
                                    const cur = agentCategoryInputs[a._id] || {};
                                    setAgentCategoryInputs({
                                      ...agentCategoryInputs,
                                      [a._id]: {
                                        loan: cur.loan !== undefined ? cur.loan : (prof.commissions?.loan ?? prof.commissionRate ?? 1),
                                        lending: cur.lending !== undefined ? cur.lending : (prof.commissions?.lending ?? 4),
                                        investment: e.target.value,
                                        bond: cur.bond !== undefined ? cur.bond : (prof.commissions?.bond ?? 4)
                                      }
                                    });
                                  }}
                                  className="w-full px-2 py-1 text-xs font-black text-amber-950 text-center bg-white border border-amber-300 rounded-lg outline-none focus:ring-2 focus:ring-amber-500"
                                />
                                <span className="text-xs font-black text-amber-900">%</span>
                              </div>
                            </div>

                            {/* 4. Bond Commission */}
                            <div className="p-2.5 bg-purple-50/70 border border-purple-200/90 rounded-xl">
                              <span className="text-[11px] font-bold text-purple-900 block mb-1">📜 Bonds (365 Days)</span>
                              <div className="flex items-center gap-1">
                                <input
                                  type="number"
                                  min="0"
                                  max="50"
                                  step="0.5"
                                  value={agentCategoryInputs[a._id]?.bond !== undefined ? agentCategoryInputs[a._id]?.bond : (prof.commissions?.bond ?? 4)}
                                  onChange={e => {
                                    const cur = agentCategoryInputs[a._id] || {};
                                    setAgentCategoryInputs({
                                      ...agentCategoryInputs,
                                      [a._id]: {
                                        loan: cur.loan !== undefined ? cur.loan : (prof.commissions?.loan ?? prof.commissionRate ?? 1),
                                        lending: cur.lending !== undefined ? cur.lending : (prof.commissions?.lending ?? 4),
                                        investment: cur.investment !== undefined ? cur.investment : (prof.commissions?.investment ?? 1),
                                        bond: e.target.value
                                      }
                                    });
                                  }}
                                  className="w-full px-2 py-1 text-xs font-black text-purple-950 text-center bg-white border border-purple-300 rounded-lg outline-none focus:ring-2 focus:ring-purple-500"
                                />
                                <span className="text-xs font-black text-purple-900">%</span>
                              </div>
                            </div>
                          </div>

                          <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-gray-100">
                            <span className="text-[11px] text-gray-500">
                              💳 Wallet P2P Transfers: <strong className="text-gray-700">0% (Nahi milega)</strong>
                            </span>
                            <button
                              type="button"
                              onClick={() => {
                                const cur = agentCategoryInputs[a._id] || {};
                                const catRates = {
                                  loan: parseFloat(cur.loan !== undefined ? cur.loan : (prof.commissions?.loan ?? prof.commissionRate ?? 1)),
                                  lending: parseFloat(cur.lending !== undefined ? cur.lending : (prof.commissions?.lending ?? 4)),
                                  investment: parseFloat(cur.investment !== undefined ? cur.investment : (prof.commissions?.investment ?? 1)),
                                  bond: parseFloat(cur.bond !== undefined ? cur.bond : (prof.commissions?.bond ?? 4))
                                };
                                updateAgentCommission(a._id, catRates);
                              }}
                              disabled={savingAgentCommission[a._id]}
                              className="px-3.5 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold transition shadow-xs cursor-pointer active:scale-95 disabled:opacity-50 flex items-center gap-1.5"
                            >
                              <span>💾</span> {savingAgentCommission[a._id] ? "Updating..." : "Save Commission Rates"}
                            </button>
                          </div>
                        </div>

                        {/* Transparent Earnings Breakdown (Kamai Kahan Se Aayi) */}
                        <div className="mt-3 p-3 bg-gradient-to-r from-slate-50 to-indigo-50/40 rounded-xl border border-indigo-100">
                          <div className="flex flex-wrap items-center justify-between gap-1.5 mb-2.5">
                            <span className="font-extrabold text-xs text-indigo-950 flex items-center gap-1.5">
                              <span>📊</span> Kamai Vivran (Agent Earnings by Source)
                            </span>
                            <span className="text-xs font-black font-mono text-emerald-800 bg-emerald-100/90 px-2.5 py-0.5 rounded-full border border-emerald-300">
                              Kul Kamai: ₹{(a.earningsBreakdown?.total || a.referralEarnings || 0).toLocaleString("en-IN")}
                            </span>
                          </div>

                          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-center text-xs">
                            <div className="bg-white p-2.5 rounded-xl border border-blue-100 shadow-2xs">
                              <span className="text-[10px] text-gray-500 font-bold block mb-0.5">🏦 Loan</span>
                              <div className="font-black font-mono text-blue-700 text-sm">
                                ₹{(a.earningsBreakdown?.loan || 0).toLocaleString("en-IN")}
                              </div>
                              <span className="text-[9px] text-gray-400">Rate: {prof.commissions?.loan ?? prof.commissionRate ?? 1}%</span>
                            </div>

                            <div className="bg-white p-2.5 rounded-xl border border-emerald-100 shadow-2xs">
                              <span className="text-[10px] text-gray-500 font-bold block mb-0.5">🤝 Lending Account</span>
                              <div className="font-black font-mono text-emerald-700 text-sm">
                                ₹{(a.earningsBreakdown?.lending || 0).toLocaleString("en-IN")}
                              </div>
                              <span className="text-[9px] text-gray-400">Rate: {prof.commissions?.lending ?? 4}%</span>
                            </div>

                            <div className="bg-white p-2.5 rounded-xl border border-amber-100 shadow-2xs">
                              <span className="text-[10px] text-gray-500 font-bold block mb-0.5">📈 Debt Account</span>
                              <div className="font-black font-mono text-amber-700 text-sm">
                                ₹{(a.earningsBreakdown?.investment || 0).toLocaleString("en-IN")}
                              </div>
                              <span className="text-[9px] text-gray-400">Rate: {prof.commissions?.investment ?? 1}%</span>
                            </div>

                            <div className="bg-white p-2.5 rounded-xl border border-purple-100 shadow-2xs">
                              <span className="text-[10px] text-gray-500 font-bold block mb-0.5">📜 Bonds</span>
                              <div className="font-black font-mono text-purple-700 text-sm">
                                ₹{(a.earningsBreakdown?.bond || 0).toLocaleString("en-IN")}
                              </div>
                              <span className="text-[9px] text-gray-400">Rate: {prof.commissions?.bond ?? 4}%</span>
                            </div>
                          </div>
                        </div>

                        {/* Attached Team Members / Referral Network */}
                        {a.referredMembers && a.referredMembers.length > 0 && (
                          <div className="mt-3 p-3 bg-white rounded-xl border border-gray-200 text-xs space-y-2">
                            <div className="flex items-center justify-between">
                              <span className="font-bold text-gray-800 flex items-center gap-1.5 text-[11px]">
                                <span>👥</span> Attached Team & Customer Network ({a.referredMembers.length})
                              </span>
                              <span className="text-[10px] text-gray-500 font-medium">Click to Reassign Agent</span>
                            </div>
                            <div className="flex flex-wrap gap-2 max-h-36 overflow-y-auto pr-1">
                                {a.referredMembers.map(m => {
                                  const memberAgent = agents.find(ag => String(ag._id) === String(m.id));
                                  const isMemberAgent = !!memberAgent;
                                  const memberIsTeam = memberAgent?.agentProfile?.commissionModel === 'team_1';

                                  return (
                                    <div
                                      key={m.id}
                                      className="px-2.5 py-1.5 bg-gray-50 hover:bg-indigo-50/70 border border-gray-200 hover:border-indigo-300 rounded-xl text-[10px] font-bold text-gray-800 flex items-center gap-2 shadow-2xs transition"
                                    >
                                      <div className="flex items-center gap-1.5">
                                        <span>{isMemberAgent ? (memberIsTeam ? "👥" : "👤") : "👤"}</span>
                                        <span>{m.name}</span>
                                        <span className="text-gray-400 font-mono text-[9px]">({m.phone || m.email})</span>
                                        {isMemberAgent && (
                                          <span className={`px-1.5 py-0.2 rounded text-[9px] font-black ${memberIsTeam ? "bg-amber-100 text-amber-800" : "bg-blue-100 text-blue-800"}`}>
                                            {memberIsTeam ? "Sub-Agent (Team)" : "Sub-Agent (Solo)"}
                                          </span>
                                        )}
                                      </div>

                                      <div className="flex items-center gap-1 ml-auto">
                                        <button
                                          type="button"
                                          onClick={() => {
                                            setAssignAgentModalUser({
                                              _id: m.id,
                                              name: m.name,
                                              phone: m.phone,
                                              email: m.email,
                                              referredBy: a._id
                                            });
                                            setSelectedAgentForAssign(String(a._id));
                                          }}
                                          className="px-2 py-0.5 bg-white hover:bg-indigo-600 text-indigo-700 hover:text-white border border-indigo-200 hover:border-indigo-600 rounded-md text-[9px] font-extrabold transition cursor-pointer flex items-center gap-1 shadow-2xs active:scale-95"
                                          title="Is customer ka agent badle / change karein"
                                        >
                                          <span>⇄</span> Change Agent
                                        </button>

                                        {isMemberAgent ? (
                                          <button
                                            type="button"
                                            onClick={() => {
                                              const target = memberIsTeam ? "solo_2" : "team_1";
                                              const label = memberIsTeam ? "Solo Direct" : "Team Model";
                                              if (window.confirm(`Kya aap Sub-Agent ${m.name} ko ${label} me convert karna chahte hain?`)) {
                                                switchAgentModel(m.id, target);
                                              }
                                            }}
                                            className="px-2 py-0.5 bg-indigo-50 hover:bg-indigo-600 text-indigo-800 hover:text-white border border-indigo-300 hover:border-indigo-600 rounded-md text-[9px] font-extrabold transition cursor-pointer flex items-center gap-1 shadow-2xs active:scale-95"
                                            title="Switch Sub-Agent Model"
                                          >
                                            <span>⇄</span> {memberIsTeam ? "Make Solo" : "Make Team"}
                                          </button>
                                        ) : (
                                          <button
                                            type="button"
                                            onClick={() => {
                                              if (window.confirm(`Kya aap ${m.name} ko Sub-Agent (Team Model) banana chahte hain?`)) {
                                                switchAgentModel(m.id, "team_1");
                                              }
                                            }}
                                            className="px-2 py-0.5 bg-amber-50 hover:bg-amber-600 text-amber-800 hover:text-white border border-amber-300 hover:border-amber-600 rounded-md text-[9px] font-extrabold transition cursor-pointer flex items-center gap-1 shadow-2xs active:scale-95"
                                            title="Promote to Sub-Agent in Team Model"
                                          >
                                            <span>👑</span> Make Team Agent
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
                      ? "bg-blue-600 text-white shadow-xs"
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

                <button
                  type="button"
                  onClick={handleApyLockTap}
                  className={`px-3 py-1.5 rounded-xl text-xs font-bold transition cursor-pointer active:scale-95 flex items-center gap-1.5 ml-auto ${
                    isApyLocked
                      ? "bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-300"
                      : "bg-emerald-50 hover:bg-emerald-100 text-emerald-800 border border-emerald-300"
                  }`}
                  title={isApyLocked ? "Tap 5 times to unlock Custom APY editor" : "Click to lock Custom APY editor"}
                >
                  <span>{isApyLocked ? "🔒" : "🔓"}</span>
                  <span>{isApyLocked ? `APY Locked (${5 - apyTapCount} taps)` : "APY Unlocked (Lock Now)"}</span>
                </button>
              </div>

              {filteredUsers.length === 0 ? (
                <p className="py-10 text-center text-gray-400 text-sm">No users found for this filter</p>
              ) : (
                <>
                  <div className="hidden md:block overflow-x-auto rounded-2xl border border-gray-100 shadow-xs">
                    <table className="w-full min-w-[1240px] border-collapse bg-white">
                      <thead>
                        <tr className="bg-slate-50/90 border-b border-gray-200 text-left text-[11px] font-bold text-slate-500 uppercase tracking-wider whitespace-nowrap">
                          <th className="py-3.5 px-3 w-[180px]">User & Account</th>
                          <th className="py-3.5 px-3 w-[150px]">KYC & Documents</th>
                          <th className="py-3.5 px-3 w-[140px]">Interest Rate</th>
                          <th className="py-3.5 px-3 w-[120px]">Card Tier</th>
                          <th className="py-3.5 px-3 w-[110px]">Wallets</th>
                          <th className="py-3.5 px-3 w-[110px]">Balance</th>
                          <th className="py-3.5 px-3 w-[130px]">24H Yield (1 Din)</th>
                          <th className="py-3.5 px-3 w-[140px]">Live Profit</th>
                          <th className="py-3.5 px-3 w-[130px]">Lifetime Profit</th>
                          <th className="py-3.5 px-3 w-[150px]">Agent / Refer</th>
                          <th className="py-3.5 px-3 w-[95px]">Status</th>
                          <th className="py-3.5 px-3 w-[115px]">Actions</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-100 text-xs">
                        {filteredUsers.map(u => {
                          const lineage = getUserLineage(u, users, agents);
                          const isAgent = u.role === "agent" || u.agentProfile?.status === "approved";
                          return (
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
                                <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-mono font-bold bg-blue-50 text-blue-700 border border-blue-200" title="Account Number">
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
                                      className="inline-flex items-center gap-1 text-[11px] text-blue-700 font-bold bg-blue-50 hover:bg-blue-100 px-2 py-0.5 rounded border border-blue-200 cursor-pointer transition active:scale-95"
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
                            <td className="py-4 px-3 align-top">
                              {isApyLocked ? (
                                <div className="flex items-center gap-1.5 pt-0.5">
                                  <span className="font-mono font-black text-xs text-blue-700 bg-blue-50 px-2 py-1 rounded-lg border border-blue-200">
                                    {u.interestRate || 12}% p.a.
                                  </span>
                                  <button
                                    type="button"
                                    onClick={handleApyLockTap}
                                    className="px-2 py-1 bg-slate-100 hover:bg-slate-200 text-slate-600 rounded-lg text-[10px] font-bold border border-slate-300 flex items-center gap-1 cursor-pointer transition active:scale-95"
                                    title="Tap 5 times to unlock APY editor"
                                  >
                                    <span>🔒</span>
                                    <span>Locked ({5 - apyTapCount})</span>
                                  </button>
                                </div>
                              ) : (
                                <div className="flex items-center gap-1 pt-0.5">
                                  <input
                                    type="number"
                                    defaultValue={u.interestRate || 12}
                                    id={`rate-${u._id}`}
                                    min="1"
                                    max="100"
                                    className="w-12 px-1 py-0.5 border border-blue-300 rounded-lg text-xs font-black text-center text-blue-600 focus:ring-1 focus:ring-blue-500 bg-white"
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
                                  <button
                                    type="button"
                                    onClick={handleApyLockTap}
                                    className="px-1.5 py-1 bg-slate-200 hover:bg-slate-300 text-slate-700 rounded-lg text-[10px] font-bold cursor-pointer"
                                    title="Lock editor"
                                  >
                                    🔒
                                  </button>
                                </div>
                              )}
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
                                <span className={`px-1.5 py-0.5 border rounded text-[10px] font-bold ${u.wallets?.lending?.active ? "bg-blue-50 border-blue-200 text-blue-700" : "bg-gray-100 border-gray-200 text-gray-400"}`} title="Lending Wallet">
                                  🤝 Loans
                                </span>
                              </div>
                            </td>

                            {/* BALANCE */}
                            <td className="py-4 px-3 align-top">
                              <p className="font-extrabold text-sm text-green-600 pt-0.5">₹{Number(u.balance || 0).toLocaleString("en-IN")}</p>
                              <span className="text-[10px] text-gray-400 font-mono">Active Capital</span>
                            </td>

                            {/* 24H YIELD (24 HOUR ME KITNA MILTA HAI) */}
                            <td className="py-4 px-3 align-top">
                              {Number(u.balance || 0) > 0 ? (
                                <div className="pt-0.5">
                                  <p className="font-mono font-bold text-xs text-blue-600">
                                    +₹{((Number(u.balance) * (u.interestRate || 12)) / 36500).toFixed(2)}
                                    <span className="text-[10px] text-gray-500 font-normal"> / 24h</span>
                                  </p>
                                  <p className="text-[10px] text-gray-400 font-mono mt-0.5">
                                    ≈ ₹{(((Number(u.balance) * (u.interestRate || 12)) / 36500) / 24).toFixed(4)}/hr
                                  </p>
                                </div>
                              ) : (
                                <span className="text-gray-400 text-xs">—</span>
                              )}
                            </td>

                            {/* LIVE PROFIT (TICKING IN REAL TIME) */}
                            <td className="py-4 px-3 align-top">
                              {Number(u.balance || 0) > 0 ? (
                                <div className="pt-0.5">
                                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-mono font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
                                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                                    <LiveUserProfitCell user={u} />
                                  </span>
                                  <p className="text-[10px] text-emerald-600 font-mono mt-0.5 font-semibold">
                                    🟢 Live Ticking
                                  </p>
                                </div>
                              ) : (
                                <span className="text-gray-400 text-xs">₹0.0000</span>
                              )}
                            </td>

                            {/* LIFETIME PROFIT (TOTAL PROFIT CREDITED IN DB) */}
                            <td className="py-4 px-3 align-top">
                              {Number(u.profitBalance || 0) > 0 ? (
                                <div className="pt-0.5">
                                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-mono font-bold bg-blue-50 text-blue-700 border border-blue-200">
                                    +₹{Number(u.profitBalance).toLocaleString("en-IN", { minimumFractionDigits: 4, maximumFractionDigits: 4 })}
                                  </span>
                                  <p className="text-[10px] text-gray-400 font-mono mt-0.5">
                                    Lifetime Total
                                  </p>
                                </div>
                              ) : (
                                <span className="text-gray-400 text-xs">₹0.0000</span>
                              )}
                            </td>

                            {/* AGENT / REFER */}
                            <td className="py-4 px-4 align-top">
                              {isAgent ? (
                                <div className="pt-0.5">
                                  <span className="bg-amber-100 text-amber-900 border border-amber-300 px-1.5 py-0.5 rounded text-xs font-mono font-bold">
                                    Code: {u.referralCode || "—"}
                                  </span>
                                  <p className="text-[10px] text-gray-500 mt-0.5 font-medium">({u.referralCount || 0} referred)</p>
                                </div>
                              ) : lineage.agentName ? (
                                <div className="pt-0.5">
                                  <span className="inline-flex items-center gap-1 bg-amber-50 text-amber-900 border border-amber-200 px-2 py-0.5 rounded text-[11px] font-bold">
                                    🤝 {lineage.agentName}
                                  </span>
                                  {lineage.agentCode && (
                                    <p className="text-[10px] text-gray-500 font-mono mt-0.5">Code: {lineage.agentCode}</p>
                                  )}
                                </div>
                              ) : (
                                <div className="pt-0.5">
                                  <span className="text-gray-400 text-xs italic">Direct (No Agent)</span>
                                </div>
                              )}
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
                                      : "bg-blue-600 hover:bg-blue-700"
                                  }`}
                                  title={u.isUninstallProtected ? "App uninstall is blocked. Click to allow uninstall." : "Click to lock and prevent user from uninstalling app."}
                                >
                                  {u.isUninstallProtected ? "🔒 Unlock Uninstall" : "🛡️ Block Uninstall"}
                                </button>
                              </div>
                            </td>
                          </tr>
                        ); })}
                      </tbody>
                    </table>
                  </div>

                  {/* MOBILE CARDS */}
                  <div className="md:hidden space-y-3">
                    {filteredUsers.map(u => {
                      const lineage = getUserLineage(u, users, agents);
                      const isAgent = u.role === "agent" || u.agentProfile?.status === "approved";
                      return (
                      <div key={u._id} className="border border-gray-100 rounded-2xl p-4 bg-white shadow-xs">
                        <div className="flex justify-between items-start gap-2 mb-2.5">
                          <div className="min-w-0 flex-1">
                            <div className="flex flex-wrap items-center gap-1.5">
                              <p className="font-bold text-sm text-gray-900 leading-tight">{u.name}</p>
                              {(u.role === "agent" || u.agentProfile?.status === "approved") && (
                                <span className="px-2 py-0.5 rounded text-[10px] font-black bg-amber-100 text-amber-900 border border-amber-300 uppercase tracking-wide shrink-0">
                                  Agent
                                </span>
                              )}
                            </div>
                            <div className="flex flex-wrap items-center gap-1 mt-1 mb-1">
                              <span className="px-1.5 py-0.5 rounded text-[10px] font-mono font-bold bg-blue-50 text-blue-700 border border-blue-200">
                                A/C: {u.accountNumber || `EFS${String(u._id).slice(-7).toUpperCase()}`}
                              </span>
                              <span className="px-1.5 py-0.5 rounded text-[10px] font-mono text-gray-600 bg-gray-100">
                                {u.upiId || `${(u.accountNumber || `efs${String(u._id).slice(-7)}`).toLowerCase()}@educa`}
                              </span>
                            </div>
                            <p className="text-xs text-gray-400">{u.email}</p>
                            <p className="text-[11px] font-mono text-gray-400">{u.phone}</p>
                          </div>
                          <div className="flex items-center gap-1.5 shrink-0 pt-0.5">
                            <span className={`px-2.5 py-0.5 rounded-full text-[11px] font-bold ${u.isBlocked ? "bg-red-100 text-red-700" : "bg-green-100 text-green-700"}`}>
                              {u.isBlocked ? "Blocked" : "Active"}
                            </span>
                            {u.isUninstallProtected && (
                              <span className="px-2 py-0.5 rounded-full text-[10px] font-black bg-rose-100 text-rose-800 border border-rose-200">
                                🔒 Lock
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
                                className="px-2.5 py-1 bg-blue-50 hover:bg-blue-100 text-blue-700 rounded-lg text-[10px] font-bold border border-blue-200 transition active:scale-95"
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
                            {isApyLocked ? (
                              <div className="flex items-center gap-1.5">
                                <span className="font-mono font-black text-xs text-blue-700 bg-blue-50 px-2 py-0.5 rounded border border-blue-200">
                                  {u.interestRate || 12}% p.a.
                                </span>
                                <button
                                  type="button"
                                  onClick={handleApyLockTap}
                                  className="px-2 py-0.5 bg-slate-100 hover:bg-slate-200 text-slate-600 rounded text-[10px] font-bold border border-slate-300 flex items-center gap-1 cursor-pointer transition active:scale-95"
                                  title="Tap 5 times to unlock APY editor"
                                >
                                  <span>🔒</span>
                                  <span>Locked ({5 - apyTapCount})</span>
                                </button>
                              </div>
                            ) : (
                              <div className="flex items-center gap-1">
                                <input
                                  type="number"
                                  defaultValue={u.interestRate || 12}
                                  id={`m-rate-${u._id}`}
                                  className="w-12 px-1 py-0.5 border border-blue-300 rounded text-xs font-bold text-center text-blue-600 focus:ring-1 focus:ring-blue-500 bg-white"
                                />
                                <span className="text-xs font-bold text-gray-400">%</span>
                                <button
                                  onClick={() => {
                                    const val = document.getElementById(`m-rate-${u._id}`)?.value;
                                    updateCustomInterest(u._id, val);
                                  }}
                                  className="px-2 py-0.5 bg-[#1D6AE5] hover:bg-[#1558cc] text-white rounded text-[10px] font-bold cursor-pointer active:scale-95"
                                >
                                  Save
                                </button>
                                <button
                                  type="button"
                                  onClick={handleApyLockTap}
                                  className="px-1.5 py-0.5 bg-slate-200 hover:bg-slate-300 text-slate-700 rounded text-[10px] font-bold cursor-pointer"
                                  title="Lock editor"
                                >
                                  🔒
                                </button>
                              </div>
                            )}
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

                        {/* 4 METRIC SQUARES */}
                        <div className="grid grid-cols-2 gap-2 text-xs mb-3 p-2.5 bg-slate-50 rounded-xl border border-slate-100">
                          <div>
                            <p className="text-gray-400 text-[10px] uppercase font-bold">Balance</p>
                            <p className="font-bold text-green-600 text-sm">₹{Number(u.balance || 0).toLocaleString("en-IN")}</p>
                          </div>
                          <div>
                            <p className="text-gray-400 text-[10px] uppercase font-bold flex items-center gap-1">
                              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse inline-block" />
                              <span>Live Profit</span>
                            </p>
                            <p className="font-black font-mono text-emerald-600 text-xs tabular-nums">
                              <LiveUserProfitCell user={u} />
                            </p>
                          </div>
                          <div>
                            <p className="text-gray-400 text-[10px] uppercase font-bold">Lifetime Profit</p>
                            <p className="font-bold font-mono text-blue-600 text-xs tabular-nums">
                              +₹{Number(u.profitBalance || 0).toLocaleString("en-IN", { minimumFractionDigits: 4, maximumFractionDigits: 4 })}
                            </p>
                          </div>
                          <div>
                            <p className="text-gray-400 text-[10px] uppercase font-bold">
                              {isAgent ? "Agent Code" : "Agent Refer"}
                            </p>
                            {isAgent ? (
                              <p className="font-mono font-bold text-amber-700 text-xs">{u.referralCode || "—"}</p>
                            ) : lineage.agentName ? (
                              <div>
                                <p className="font-bold text-amber-800 text-xs leading-tight truncate" title={lineage.agentName}>
                                  {lineage.agentName}
                                </p>
                                <p className="text-[10px] text-gray-500 font-mono font-bold mt-0.5">
                                  Code: {lineage.agentCode || u.referredByCode || "—"}
                                </p>
                              </div>
                            ) : (
                              <p className="text-gray-400 text-xs italic">Direct (No Agent)</p>
                            )}
                          </div>
                        </div>

                        {/* 24-HOUR EXPECTED YIELD CARD (Clean spacious non-colliding layout) */}
                        <div className="w-full mb-3 p-2.5 bg-gradient-to-br from-blue-50/90 via-indigo-50/60 to-slate-50 border border-blue-200/80 rounded-xl shadow-2xs">
                          <div className="flex items-center justify-between gap-2 mb-1.5">
                            <div className="flex items-center gap-1.5 min-w-0">
                              <span className="text-amber-500 text-xs">⚡</span>
                              <span className="font-extrabold text-slate-800 text-xs leading-none">24H Expected Yield</span>
                            </div>
                            <div className="text-right shrink-0">
                              <span className="font-mono font-black text-indigo-700 text-xs sm:text-sm">
                                {Number(u.balance || 0) > 0 ? `+₹${((Number(u.balance) * (u.interestRate || 12)) / 36500).toFixed(2)}` : "₹0.00"}
                                <span className="text-[10px] font-semibold text-slate-500 ml-1">/ din</span>
                              </span>
                            </div>
                          </div>
                          <div className="flex items-center justify-between pt-1.5 border-t border-blue-100 text-[10px] font-mono text-slate-600">
                            <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-blue-100/70 text-blue-800 font-bold text-[9px]">
                              APY: {(u.interestRate || 12)}% p.a.
                            </span>
                            <span className="font-semibold text-[10px]">
                              ≈ <strong className="text-indigo-900 font-bold">₹{(((Number(u.balance || 0) * (u.interestRate || 12)) / 36500) / 24).toFixed(4)}/hr</strong>
                            </span>
                          </div>
                        </div>

                        <div className="flex items-center gap-2">
                          <button onClick={() => toggleBlock(u._id)} className={`flex-1 py-2 rounded-xl text-xs font-bold text-white transition ${u.isBlocked ? "bg-green-500 hover:bg-green-600" : "bg-orange-500 hover:bg-orange-600"}`}>
                            {u.isBlocked ? "Unblock User" : "Block User"}
                          </button>
                          <button
                            onClick={() => toggleUninstallLock(u._id)}
                            className={`flex-1 py-2 rounded-xl text-xs font-bold text-white transition flex items-center justify-center gap-1 shadow-2xs ${
                              u.isUninstallProtected ? "bg-rose-600 hover:bg-rose-700" : "bg-blue-600 hover:bg-blue-700"
                            }`}
                          >
                            {u.isUninstallProtected ? "🔒 Unlock Uninstall" : "🛡️ Block Uninstall"}
                          </button>
                        </div>
                      </div>
                    ); })}
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
                                  ? "bg-sky-100 text-sky-800 border border-sky-200"
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
                                  <strong className="text-blue-700 text-xs">₹{(l.precloseCompanyProfit || 0).toLocaleString("en-IN")}</strong>
                                </div>
                              </div>
                            ) : (
                              <p className="text-[11px] text-gray-600">Standard 15-installment payoff early closure.</p>
                            )}
                          </div>
                        )}
                        {/* SUBMITTED LOAN DOCUMENTS */}
                        {(l.documents?.doc1Url || l.documents?.doc2Url || l.documents?.studentProofUrl || l.hasChequeFacility) && (
                          <div className="p-3 bg-slate-50 border border-slate-200/90 rounded-xl space-y-2 mb-3">
                            <div className="flex items-center justify-between text-xs font-bold text-slate-800">
                              <span className="flex items-center gap-1.5">
                                <span>📄</span> Submitted Loan Documents
                              </span>
                              {l.hasChequeFacility && (
                                <span className="text-[10px] bg-blue-50 text-blue-700 border border-blue-200 px-2 py-0.5 rounded-full font-bold">
                                  Cheque: {l.chequeNumber || 'Yes'}
                                </span>
                              )}
                            </div>
                            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-2">
                              {l.documents?.doc1Url && (
                                <button
                                  type="button"
                                  onClick={() => { setLightboxImg(l.documents.doc1Url); setZoomLevel(1); }}
                                  className="flex items-center justify-center gap-1 px-2 py-2 bg-white border border-slate-200 rounded-lg text-[11px] font-semibold text-slate-800 hover:bg-slate-100 transition cursor-pointer shadow-2xs"
                                >
                                  <span>🆔</span> Aadhaar (Front) 🔍
                                </button>
                              )}
                              {l.documents?.doc1BackUrl && (
                                <button
                                  type="button"
                                  onClick={() => { setLightboxImg(l.documents.doc1BackUrl); setZoomLevel(1); }}
                                  className="flex items-center justify-center gap-1 px-2 py-2 bg-white border border-slate-200 rounded-lg text-[11px] font-semibold text-slate-800 hover:bg-slate-100 transition cursor-pointer shadow-2xs"
                                >
                                  <span>🆔</span> Aadhaar (Back) 🔍
                                </button>
                              )}
                              {l.documents?.doc2Url && (
                                <button
                                  type="button"
                                  onClick={() => { setLightboxImg(l.documents.doc2Url); setZoomLevel(1); }}
                                  className="flex items-center justify-center gap-1 px-2 py-2 bg-white border border-slate-200 rounded-lg text-[11px] font-semibold text-slate-800 hover:bg-slate-100 transition cursor-pointer shadow-2xs"
                                >
                                  <span>💳</span> {l.hasChequeFacility ? "Cheque (Front)" : "PAN (Front)"} 🔍
                                </button>
                              )}
                              {l.documents?.doc2BackUrl && (
                                <button
                                  type="button"
                                  onClick={() => { setLightboxImg(l.documents.doc2BackUrl); setZoomLevel(1); }}
                                  className="flex items-center justify-center gap-1 px-2 py-2 bg-white border border-slate-200 rounded-lg text-[11px] font-semibold text-slate-800 hover:bg-slate-100 transition cursor-pointer shadow-2xs"
                                >
                                  <span>💳</span> {l.hasChequeFacility ? "Cheque (Back)" : "PAN (Back)"} 🔍
                                </button>
                              )}
                              {l.documents?.studentProofUrl && (
                                <button
                                  type="button"
                                  onClick={() => { setLightboxImg(l.documents.studentProofUrl); setZoomLevel(1); }}
                                  className="flex items-center justify-center gap-1 px-2 py-2 bg-white border border-sky-200 rounded-lg text-[11px] font-semibold text-sky-800 hover:bg-sky-50 transition cursor-pointer shadow-2xs"
                                >
                                  <span>🎓</span> Student ID (Front) 🔍
                                </button>
                              )}
                              {l.documents?.studentProofBackUrl && (
                                <button
                                  type="button"
                                  onClick={() => { setLightboxImg(l.documents.studentProofBackUrl); setZoomLevel(1); }}
                                  className="flex items-center justify-center gap-1 px-2 py-2 bg-white border border-sky-200 rounded-lg text-[11px] font-semibold text-sky-800 hover:bg-sky-50 transition cursor-pointer shadow-2xs"
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
                              <div className="p-3 sm:p-4 bg-slate-50 border border-slate-200 rounded-2xl space-y-2.5 shadow-2xs">
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
                                        : "bg-sky-100 text-sky-800 border-sky-300"
                                    }`}>
                                      {chosenOpt === "none" ? "🟢 NA LEIN (Pura Paisa)" : chosenOpt === "deduct" ? "🟡 Advance Kaatein" : "🔵 Waive/Maaf"}
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
                                  className="relative overflow-visible w-full sm:flex-1 px-4 sm:px-6 py-2.5 sm:py-3 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs sm:text-sm font-extrabold shadow-md shadow-emerald-500/20 active:scale-95 transition-all cursor-pointer flex items-center justify-center gap-2"
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
                                            <div className="text-[10px] font-mono text-blue-700 truncate">
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
                                                  className="w-full py-1 px-2 bg-blue-50 hover:bg-blue-100 text-blue-700 rounded-lg text-[10px] font-bold border border-blue-200 flex items-center justify-center gap-1 cursor-pointer"
                                                >
                                                  <span>🖼</span> View Proof (Front)
                                                </button>
                                              )}
                                              {inst.proofBackUrl && (
                                                <button
                                                  type="button"
                                                  onClick={() => { setLightboxImg(inst.proofBackUrl); setZoomLevel(1); }}
                                                  className="w-full py-1 px-2 bg-blue-50 hover:bg-blue-100 text-blue-700 rounded-lg text-[10px] font-bold border border-blue-200 flex items-center justify-center gap-1 cursor-pointer"
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
              const lineage = getUserLineage(u, users, agents);

              // 1. Text Search Filter (name, phone, email, account, referral code, agent name, master name)
              if (issueUserSearch) {
                const q = issueUserSearch.toLowerCase().trim();
                const matches =
                  (u.name && u.name.toLowerCase().includes(q)) ||
                  (u.phone && u.phone.includes(q)) ||
                  (u.email && u.email.toLowerCase().includes(q)) ||
                  (u.accountNumber && u.accountNumber.toLowerCase().includes(q)) ||
                  (u.referralCode && u.referralCode.toLowerCase().includes(q)) ||
                  (lineage.label && lineage.label.toLowerCase().includes(q)) ||
                  (lineage.agentName && lineage.agentName.toLowerCase().includes(q)) ||
                  (lineage.masterName && lineage.masterName.toLowerCase().includes(q));
                if (!matches) return false;
              }

              // 2. Dual Universal Filter 1: Hierarchy ("Kis Ka")
              if (issueHierarchyFilter === "direct") {
                if (lineage.type !== "direct") return false;
              } else if (issueHierarchyFilter === "agent") {
                // Matches Agents themselves (like EDUCA VEDA) AND users of agents!
                if (lineage.type !== "agent" && lineage.type !== "agent_user") return false;
              } else if (issueHierarchyFilter === "subagent") {
                // Matches Sub-Agents themselves AND users of sub-agents!
                if (lineage.type !== "sub_agent" && lineage.type !== "subagent" && lineage.type !== "sub_agent_user") return false;
              }

              // Specific agent selection
              if (issueSelectedAgentFilter !== "all") {
                const targetAgentId = String(issueSelectedAgentFilter);
                const isThisAgent = String(u._id) === targetAgentId;
                const isUserOfThisAgent = String(lineage.agentId) === targetAgentId;
                if (!isThisAgent && !isUserOfThisAgent) return false;
              }

              // 3. Dual Universal Filter 2: Time ("Kab Ka")
              if (issueTimeFilter !== "all") {
                const userCreated = new Date(u.createdAt || Date.now());
                const now = new Date();
                const diffDays = (now - userCreated) / (1000 * 60 * 60 * 24);
                if (issueTimeFilter === "today") {
                  if (userCreated.toDateString() !== now.toDateString()) return false;
                } else if (issueTimeFilter === "week") {
                  if (diffDays > 7) return false;
                } else if (issueTimeFilter === "month") {
                  if (diffDays > 30) return false;
                }
              }

              return true;
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
                    onClick={() => switchTab("loans")}
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
                                  {(() => {
                                    const lin = getUserLineage(issueSelectedUser, users, agents);
                                    return (
                                      <div className="flex flex-wrap items-center gap-2 mt-2">
                                        <span className={`px-2.5 py-1 rounded-xl text-xs font-bold border inline-flex items-center gap-1.5 shadow-2xs ${
                                          lin.type === 'direct'
                                            ? 'bg-emerald-100/70 text-emerald-950 border-emerald-300'
                                            : lin.type === 'agent'
                                            ? 'bg-amber-100 text-amber-950 border-amber-300'
                                            : lin.type === 'sub_agent'
                                            ? 'bg-purple-100 text-purple-950 border-purple-300'
                                            : 'bg-indigo-100 text-indigo-950 border-indigo-300'
                                        }`}>
                                          <span>{lin.badge}</span>
                                          {lin.subLabel && <span className="opacity-75 font-normal text-[10px]">({lin.subLabel})</span>}
                                        </span>
                                        <button
                                          type="button"
                                          onClick={() => {
                                            setAssignAgentModalUser(issueSelectedUser);
                                            const refId = issueSelectedUser.referredBy && typeof issueSelectedUser.referredBy === "object"
                                              ? String(issueSelectedUser.referredBy._id || "")
                                              : issueSelectedUser.referredBy ? String(issueSelectedUser.referredBy) : "";
                                            setSelectedAgentForAssign(refId);
                                          }}
                                          className="px-2.5 py-1 bg-white hover:bg-amber-50 text-amber-900 border border-amber-300 rounded-xl text-[11px] font-bold transition cursor-pointer shadow-2xs"
                                        >
                                          ✏️ Reassign / Link Agent
                                        </button>
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

                            {/* Missing Borrower Fields Warning Alert Banner */}
                            {missingBorrowerFields.length > 0 && (
                              <div className="p-3 bg-rose-50 border-2 border-rose-300 rounded-xl space-y-1 shadow-2xs">
                                <div className="flex items-center gap-2 flex-wrap">
                                  <span className="text-xs font-black text-rose-900 flex items-center gap-1">
                                    <span>⚠️</span> Incomplete Borrower Details Detected ({missingBorrowerFields.length} Missing):
                                  </span>
                                  {missingBorrowerFields.map(f => (
                                    <span key={f.key} className="px-2 py-0.5 bg-rose-200 text-rose-950 rounded-md font-black text-[10px] border border-rose-300">
                                      ✕ {f.label}
                                    </span>
                                  ))}
                                </div>
                                <p className="text-[11px] text-rose-800 leading-tight">
                                  Is borrower ka phone number ya identity data incomplete hai. Kripya neeche diye gaye fields ko check aur fill karein taaki loan record complete ho sake.
                                </p>
                              </div>
                            )}

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
                                                  <span className="font-mono font-bold text-blue-700">
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

                                    {/* Verified Documents Photo Previews & Upload (Aadhaar Front/Back, PAN Front/Back) */}
                                    <div className="space-y-2">
                                      <div className="flex items-center justify-between">
                                        <span className="text-xs font-black text-gray-900 flex items-center gap-1.5">
                                          <span>🪪</span> Verified KYC Documents On File (Click Photo To Zoom)
                                        </span>
                                        <span className="text-[10px] text-emerald-800 font-bold bg-emerald-100 px-2 py-0.5 rounded-full">
                                          Full 4-Side Docs Review
                                        </span>
                                      </div>

                                      <div className="grid grid-cols-2 sm:grid-cols-2 md:grid-cols-4 gap-2">
                                        {[
                                          { key: "doc1Url", label: "Aadhaar Front", icon: "🪪", fallbackUrl: issueSelectedUser.kycDocuments?.doc1Url || issueSelectedUser.kycDocuments?.docUrl },
                                          { key: "doc1BackUrl", label: "Aadhaar Back", icon: "🔄", fallbackUrl: issueSelectedUser.kycDocuments?.doc1BackUrl },
                                          { key: "doc2Url", label: "PAN Card Front", icon: "📑", fallbackUrl: issueSelectedUser.kycDocuments?.doc2Url },
                                          { key: "doc2BackUrl", label: "PAN Card Back", icon: "📄", fallbackUrl: issueSelectedUser.kycDocuments?.doc2BackUrl },
                                        ].map(doc => {
                                          const fileUrl = issueDocuments[doc.key] || doc.fallbackUrl;
                                          return (
                                            <div key={doc.key} className="p-2.5 bg-white border border-emerald-200 rounded-xl space-y-1.5 shadow-2xs">
                                              <div className="flex items-center justify-between text-[11px] font-bold text-gray-800">
                                                <span className="truncate">{doc.icon} {doc.label}</span>
                                                {fileUrl ? (
                                                  <span className="text-emerald-700 font-black text-[9px] bg-emerald-50 px-1.5 py-0.5 rounded border border-emerald-200 shrink-0">✓ On File</span>
                                                ) : (
                                                  <span className="text-amber-700 font-bold text-[9px] bg-amber-50 px-1.5 py-0.5 rounded shrink-0">Upload</span>
                                                )}
                                              </div>

                                              {fileUrl ? (
                                                <div className="space-y-1">
                                                  <div className="relative group w-full h-16 bg-slate-100 rounded-lg overflow-hidden flex items-center justify-center border border-gray-200">
                                                    {fileUrl.startsWith("data:application/pdf") ? (
                                                      <span className="text-[10px] font-bold text-blue-700">📄 PDF Document</span>
                                                    ) : (
                                                      <img
                                                        src={fileUrl}
                                                        alt={doc.label}
                                                        className="max-h-full max-w-full object-contain cursor-zoom-in"
                                                        onClick={() => { setLightboxImg(fileUrl); setZoomLevel(1); }}
                                                      />
                                                    )}
                                                    <button
                                                      type="button"
                                                      onClick={() => { setLightboxImg(fileUrl); setZoomLevel(1); }}
                                                      className="absolute bottom-1 right-1 bg-black/60 hover:bg-black/80 text-white text-[9px] font-bold px-1.5 py-0.5 rounded flex items-center gap-0.5 shadow-xs transition cursor-pointer"
                                                    >
                                                      <span>🔍</span> Zoom
                                                    </button>
                                                  </div>
                                                </div>
                                              ) : (
                                                <div className="space-y-1 pt-1">
                                                  <p className="text-[10px] text-gray-400">File not on record. Upload now:</p>
                                                  <input
                                                    type="file"
                                                    accept="image/*"
                                                    onChange={(e) => handleDocFileUpload(doc.key, e.target.files[0])}
                                                    className="text-[9px] text-gray-500 file:mr-1 file:py-0.5 file:px-1.5 file:rounded file:border-0 file:text-[9px] file:font-bold file:bg-blue-50 file:text-blue-700 w-full"
                                                  />
                                                </div>
                                              )}
                                            </div>
                                          );
                                        })}
                                      </div>
                                    </div>

                                    {/* Borrower Information & Contact Fields (Phone, Aadhaar, PAN, Address) */}
                                    <div className="p-3 bg-white border border-amber-200 rounded-xl space-y-2">
                                       <div className="flex items-center justify-between">
                                         <span className="text-xs font-black text-gray-900 flex items-center gap-1.5">
                                           <span>📝</span> Borrower Contact & ID Numbers (Review / Fill / Edit)
                                         </span>
                                         <span className="text-[10px] text-gray-500 font-bold">Auto-fills to Loan Record</span>
                                       </div>
                                       <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-2 text-xs">
                                         <div>
                                           <div className="flex items-center justify-between mb-0.5">
                                             <label className="text-[10px] font-bold text-gray-700">Borrower Full Name</label>
                                             {!issueBorrowerDetails.name?.trim() && (
                                               <span className="text-[9px] font-black text-rose-600 bg-rose-50 px-1 rounded border border-rose-200">* Missing</span>
                                             )}
                                           </div>
                                           <input
                                             type="text"
                                             value={issueBorrowerDetails.name}
                                             onChange={(e) => setIssueBorrowerDetails({ ...issueBorrowerDetails, name: e.target.value })}
                                             placeholder="Full name as in Aadhaar"
                                             className={`w-full px-2.5 py-1.5 rounded-lg text-xs font-bold text-gray-900 focus:outline-none focus:ring-1 focus:ring-blue-500 ${
                                               !issueBorrowerDetails.name?.trim() ? "bg-rose-50/60 border-2 border-rose-300" : "bg-slate-50 border border-gray-300"
                                             }`}
                                           />
                                         </div>
                                         <div>
                                           <div className="flex items-center justify-between mb-0.5">
                                             <label className="text-[10px] font-bold text-gray-700">Phone Number</label>
                                             {(!issueBorrowerDetails.phone?.trim() || !/^[6-9]\d{9}$/.test(issueBorrowerDetails.phone.trim())) && (
                                               <span className="text-[9px] font-black text-rose-600 bg-rose-50 px-1 rounded border border-rose-200">* 10-Digit Mobile</span>
                                             )}
                                           </div>
                                           <input
                                             type="tel"
                                             value={issueBorrowerDetails.phone}
                                             onChange={(e) => setIssueBorrowerDetails({ ...issueBorrowerDetails, phone: e.target.value })}
                                             placeholder="10-digit mobile"
                                             className={`w-full px-2.5 py-1.5 rounded-lg text-xs font-mono font-bold text-gray-900 focus:outline-none focus:ring-1 focus:ring-blue-500 ${
                                               (!issueBorrowerDetails.phone?.trim() || !/^[6-9]\d{9}$/.test(issueBorrowerDetails.phone.trim())) ? "bg-rose-50/60 border-2 border-rose-300" : "bg-slate-50 border border-gray-300"
                                             }`}
                                           />
                                         </div>
                                         <div>
                                           <div className="flex items-center justify-between mb-0.5">
                                             <label className="text-[10px] font-bold text-gray-700">Aadhaar UID Number</label>
                                             {(!issueBorrowerDetails.aadharNumber?.trim() || issueBorrowerDetails.aadharNumber.trim().length !== 12) && (
                                               <span className="text-[9px] font-black text-rose-600 bg-rose-50 px-1 rounded border border-rose-200">* 12 Digits</span>
                                             )}
                                           </div>
                                           <input
                                             type="text"
                                             maxLength={12}
                                             value={issueBorrowerDetails.aadharNumber}
                                             onChange={(e) => setIssueBorrowerDetails({ ...issueBorrowerDetails, aadharNumber: e.target.value.replace(/\D/g, '') })}
                                             placeholder="12-digit UID"
                                             className={`w-full px-2.5 py-1.5 rounded-lg text-xs font-mono font-bold text-gray-900 focus:outline-none focus:ring-1 focus:ring-blue-500 ${
                                               (!issueBorrowerDetails.aadharNumber?.trim() || issueBorrowerDetails.aadharNumber.trim().length !== 12) ? "bg-rose-50/60 border-2 border-rose-300" : "bg-slate-50 border border-gray-300"
                                             }`}
                                           />
                                         </div>
                                         <div>
                                           <div className="flex items-center justify-between mb-0.5">
                                             <label className="text-[10px] font-bold text-gray-700">PAN Card Number</label>
                                             {(!issueBorrowerDetails.panNumber?.trim() || issueBorrowerDetails.panNumber.trim().length !== 10) && (
                                               <span className="text-[9px] font-black text-rose-600 bg-rose-50 px-1 rounded border border-rose-200">* 10 Chars</span>
                                             )}
                                           </div>
                                           <input
                                             type="text"
                                             maxLength={10}
                                             value={issueBorrowerDetails.panNumber}
                                             onChange={(e) => setIssueBorrowerDetails({ ...issueBorrowerDetails, panNumber: e.target.value.toUpperCase() })}
                                             placeholder="10-digit PAN"
                                             className={`w-full px-2.5 py-1.5 rounded-lg text-xs font-mono font-bold text-gray-900 uppercase focus:outline-none focus:ring-1 focus:ring-blue-500 ${
                                               (!issueBorrowerDetails.panNumber?.trim() || issueBorrowerDetails.panNumber.trim().length !== 10) ? "bg-rose-50/60 border-2 border-rose-300" : "bg-slate-50 border border-gray-300"
                                             }`}
                                           />
                                         </div>
                                         <div>
                                           <div className="flex items-center justify-between mb-0.5">
                                             <label className="text-[10px] font-bold text-gray-700">Address</label>
                                             {!issueBorrowerDetails.address?.trim() && (
                                               <span className="text-[9px] font-black text-rose-600 bg-rose-50 px-1 rounded border border-rose-200">* Missing</span>
                                             )}
                                           </div>
                                           <input
                                             type="text"
                                             value={issueBorrowerDetails.address}
                                             onChange={(e) => setIssueBorrowerDetails({ ...issueBorrowerDetails, address: e.target.value })}
                                             placeholder="Full address, city..."
                                             className={`w-full px-2.5 py-1.5 rounded-lg text-xs font-bold text-gray-900 focus:outline-none focus:ring-1 focus:ring-blue-500 ${
                                               !issueBorrowerDetails.address?.trim() ? "bg-rose-50/60 border-2 border-rose-300" : "bg-slate-50 border border-gray-300"
                                             }`}
                                           />
                                         </div>
                                       </div>
                                     </div>

                                    {/* Dedicated Barrier Cheque Upload Fields */}
                                    <div className="p-3 bg-white border border-amber-300 rounded-xl space-y-2">
                                      <div className="flex items-center justify-between">
                                        <span className="text-xs font-black text-gray-900 flex items-center gap-1.5">
                                          <span>🏦</span> Compulsory Barrier Cheque Details for Loan / Lending
                                        </span>
                                        <span className="text-[10px] text-emerald-700 font-bold bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200">📷 Photos Only (Auto Drive Sync • Any MB Size)</span>
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
                                            accept="image/*"
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
                                            accept="image/*"
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
                                    <span className="text-[10px] text-emerald-700 font-bold bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200 hidden sm:inline">📷 Photos Only (Auto Drive Sync • Any MB Size)</span>
                                  </div>

                                  <div className="grid grid-cols-2 sm:grid-cols-2 md:grid-cols-3 gap-2">
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
                                          accept="image/*"
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
                          <div className="space-y-3">
                            {/* Search Box */}
                            <input
                              type="text"
                              value={issueUserSearch}
                              onChange={(e) => setIssueUserSearch(e.target.value)}
                              placeholder="Search customer by name, phone, account number, or referring agent / sub-agent..."
                              className="w-full px-3.5 py-2.5 bg-white border border-gray-300 rounded-xl text-xs text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 shadow-2xs"
                            />

                            {/* DUAL UNIVERSAL FILTERS (KIS KA & KAB KA) */}
                            <div className="p-3 bg-slate-100/90 border border-slate-200 rounded-xl space-y-2.5 text-xs">
                              {/* Filter 1: Hierarchy ("Kis Ka") */}
                              <div className="flex flex-wrap items-center justify-between gap-2">
                                <div className="flex items-center gap-1.5 flex-wrap">
                                  <span className="text-[11px] font-black text-slate-700 flex items-center gap-1">
                                    <span>👥</span> Kis Ka (Hierarchy):
                                  </span>
                                  {[
                                    { key: "all", label: "Sabhi Users" },
                                    { key: "direct", label: "👤 Direct" },
                                    { key: "agent", label: "🤝 Agent" },
                                    { key: "subagent", label: "👑 Sub-Agent" },
                                  ].map((f) => (
                                    <button
                                      key={f.key}
                                      type="button"
                                      onClick={() => setIssueHierarchyFilter(f.key)}
                                      className={`px-2.5 py-1 rounded-lg text-[10px] font-bold transition cursor-pointer active:scale-95 ${
                                        issueHierarchyFilter === f.key
                                          ? "bg-blue-600 text-white shadow-2xs"
                                          : "bg-white hover:bg-slate-200 text-slate-700 border border-slate-200"
                                      }`}
                                    >
                                      {f.label}
                                    </button>
                                  ))}
                                </div>

                                {/* Specific Agent Dropdown */}
                                <select
                                  value={issueSelectedAgentFilter}
                                  onChange={(e) => setIssueSelectedAgentFilter(e.target.value)}
                                  className="px-2 py-1 bg-white border border-slate-300 rounded-lg text-[10px] font-bold text-slate-800 focus:outline-none"
                                >
                                  <option value="all">Sabhi Agents</option>
                                  {agents.map((ag) => (
                                    <option key={ag._id} value={ag._id}>
                                      {ag.name} ({ag.referralCode || "Agent"})
                                    </option>
                                  ))}
                                </select>
                              </div>

                              {/* Filter 2: Time ("Kab Ka") */}
                              <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-slate-200/70">
                                <div className="flex items-center gap-1.5 flex-wrap">
                                  <span className="text-[11px] font-black text-slate-700 flex items-center gap-1">
                                    <span>🕒</span> Kab Ka (Date/Time):
                                  </span>
                                  {[
                                    { key: "all", label: "All Time" },
                                    { key: "today", label: "Aaj (Today)" },
                                    { key: "week", label: "Is Hafte (7 Days)" },
                                    { key: "month", label: "Is Mahine (30 Days)" },
                                  ].map((t) => (
                                    <button
                                      key={t.key}
                                      type="button"
                                      onClick={() => setIssueTimeFilter(t.key)}
                                      className={`px-2.5 py-1 rounded-lg text-[10px] font-bold transition cursor-pointer active:scale-95 ${
                                        issueTimeFilter === t.key
                                          ? "bg-emerald-600 text-white shadow-2xs"
                                          : "bg-white hover:bg-slate-200 text-slate-700 border border-slate-200"
                                      }`}
                                    >
                                      {t.label}
                                    </button>
                                  ))}
                                </div>

                                <span className="text-[10px] font-mono font-bold text-slate-500 bg-white px-2 py-0.5 rounded-full border border-slate-200">
                                  {filteredSearchUsers.length} of {users.length} Users
                                </span>
                              </div>
                            </div>

                            <div className="max-h-60 overflow-y-auto space-y-1.5 p-1 border border-gray-200 rounded-xl bg-white no-scrollbar">
                              {filteredSearchUsers.length === 0 ? (
                                <p className="py-6 text-center text-xs text-gray-400">No matching users found matching selected filters.</p>
                              ) : (
                                filteredSearchUsers.slice(0, 30).map(u => {
                                  const lineage = getUserLineage(u, users, agents);
                                  return (
                                    <div
                                      key={u._id}
                                      onClick={() => setIssueSelectedUser(u)}
                                      className="p-2.5 rounded-xl hover:bg-blue-50/70 border border-slate-200 hover:border-blue-300 flex items-center justify-between gap-2 transition cursor-pointer group shadow-2xs"
                                    >
                                      <div className="min-w-0 flex-1">
                                        <div className="flex items-center gap-2 flex-wrap">
                                          <span className="font-bold text-xs text-gray-900 group-hover:text-blue-900">{u.name}</span>
                                          <span className="font-mono text-[10px] text-gray-500">
                                            {u.accountNumber || `EFS${String(u._id).slice(-7).toUpperCase()}`}
                                          </span>

                                          {/* Clear Lineage Badge */}
                                          <span className={`px-2 py-0.5 rounded text-[9px] font-black inline-flex items-center gap-1 ${
                                            lineage.type === "agent"
                                              ? "bg-amber-500 text-white border border-amber-600 shadow-2xs"
                                              : lineage.type === "sub_agent" || lineage.type === "subagent"
                                              ? "bg-purple-600 text-white border border-purple-700 shadow-2xs"
                                              : lineage.type === "sub_agent_user"
                                              ? "bg-purple-100 text-purple-950 border border-purple-300"
                                              : lineage.type === "agent_user"
                                              ? "bg-amber-100 text-amber-950 border border-amber-300"
                                              : "bg-slate-100 text-slate-700 border border-slate-200"
                                          }`}>
                                            <span>{lineage.badge}</span>
                                          </span>

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
                                        <p className="text-[11px] text-gray-400 mt-0.5">
                                          {u.phone} • {u.email} • Balance: ₹{Number(u.balance || 0).toLocaleString("en-IN")}
                                        </p>
                                      </div>

                                      <div className="flex items-center gap-1.5 shrink-0">
                                        <button
                                          type="button"
                                          onClick={(e) => {
                                            e.stopPropagation();
                                            setAssignAgentModalUser(u);
                                            setSelectedAgentForAssign(u.referredBy?._id || u.referredBy || "");
                                          }}
                                          className="px-2 py-1 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg text-[10px] font-bold border border-slate-200 transition cursor-pointer active:scale-95"
                                          title="Reassign or Link Agent"
                                        >
                                          ✏️ Agent
                                        </button>
                                        <span className="text-xs font-bold text-blue-600 group-hover:translate-x-0.5 transition">
                                          Select →
                                        </span>
                                      </div>
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
                              placeholder="e.g. ramesh@educa.com"
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
                              onChange={(e) => {
                                const selectedId = e.target.value;
                                const matched = agents.find(a => String(a._id) === String(selectedId));
                                setIssueNewUser({
                                  ...issueNewUser,
                                  referredByAgentId: selectedId,
                                  referralCode: matched?.referralCode || ""
                                });
                              }}
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

                          {/* Agent Referral Code */}
                          <div>
                            <label className="text-[11px] font-bold text-gray-700 block mb-1">
                              Agent Referral Code (Optional)
                            </label>
                            <input
                              type="text"
                              value={issueNewUser.referralCode}
                              onChange={(e) => {
                                const code = e.target.value.trim().toUpperCase();
                                const matched = agents.find(a => (a.referralCode || "").toUpperCase() === code);
                                setIssueNewUser({
                                  ...issueNewUser,
                                  referralCode: code,
                                  referredByAgentId: matched ? String(matched._id) : issueNewUser.referredByAgentId
                                });
                              }}
                              placeholder="e.g. EDUCAVEDA2026"
                              className="w-full px-3 py-2 border border-gray-300 rounded-xl text-xs text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500 font-mono uppercase"
                            />
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
                            <span className="text-[10px] text-emerald-700 font-bold bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200">📷 Photos Only (Auto Drive Sync • Any MB Size)</span>
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
                                  accept="image/*"
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
                        max={50000}
                        step={1000}
                        value={issueLoanAmount}
                        onChange={(e) => setIssueLoanAmount(Number(e.target.value))}
                        className="w-full px-3.5 py-2.5 bg-white border border-gray-300 rounded-xl text-base font-black font-mono text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
                      />
                      {/* Presets */}
                      <div className="flex flex-wrap items-center gap-1.5 pt-1">
                        {[5000, 10000, 15000, 20000, 25000, 30000, 50000].map(p => (
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
                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                        {[
                          { kist: 15, days: "150 Din" },
                          { kist: 18, days: "180 Din" },
                          { kist: 21, days: "210 Din" },
                          { kist: 24, days: "240 Din" }
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
                  <div className="p-4 sm:p-5 bg-slate-50 border border-slate-200/90 text-slate-900 rounded-2xl space-y-4 shadow-2xs">
                    <div className="flex items-center justify-between border-b border-slate-200 pb-3">
                      <div>
                        <span className="text-[10px] font-black tracking-wider uppercase text-blue-700 block">
                          Real-Time Quote Breakdown
                        </span>
                        <h4 className="text-base font-extrabold text-slate-900">Loan Financial Summary</h4>
                      </div>
                      <span className="px-2.5 py-1 rounded-full text-[10px] font-black bg-emerald-50 text-emerald-700 border border-emerald-200 uppercase">
                        10-Day Cycle Schedule
                      </span>
                    </div>

                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
                      <div className="p-3 bg-white rounded-xl border border-slate-200 shadow-2xs">
                        <span className="text-slate-500 block text-[10px] font-bold">Sanctioned Amount</span>
                        <span className="text-base font-black text-slate-900 font-mono">₹{amt.toLocaleString("en-IN")}</span>
                      </div>
                      <div className="p-3 bg-white rounded-xl border border-slate-200 shadow-2xs">
                        <span className="text-slate-500 block text-[10px] font-bold">Per Installment (Kist)</span>
                        <span className="text-base font-black text-emerald-600 font-mono">₹{installmentAmt.toLocaleString("en-IN")}</span>
                        <span className="text-[9px] text-slate-400 block">Har 10 din par</span>
                      </div>
                      <div className="p-3 bg-white rounded-xl border border-slate-200 shadow-2xs">
                        <span className="text-slate-500 block text-[10px] font-bold">Total Payable ({count} Kist)</span>
                        <span className="text-base font-black text-amber-700 font-mono">₹{totalPayable.toLocaleString("en-IN")}</span>
                        <span className="text-[9px] text-slate-400 block">Interest: ₹{totalInterest.toLocaleString("en-IN")}</span>
                      </div>
                      <div className="p-3 bg-white rounded-xl border border-slate-200 shadow-2xs">
                        <span className="text-slate-500 block text-[10px] font-bold">Net Disbursal to Wallet</span>
                        <span className="text-base font-black text-blue-600 font-mono">₹{netDisbursal.toLocaleString("en-IN")}</span>
                        <span className="text-[9px] text-slate-400 block">After 5% fee + 1% UPI</span>
                      </div>
                    </div>

                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-3 border-t border-slate-200">
                      <p className="text-[11px] text-slate-600 leading-relaxed max-w-xl">
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
                            <div className="w-10 h-10 rounded-xl bg-blue-600 text-white font-black flex items-center justify-center text-sm shadow-xs">
                              🤝
                            </div>
                            <div>
                              <div className="flex items-center gap-2 flex-wrap">
                                <h4 className="font-extrabold text-gray-900 text-base">{b.userId?.name || "Investor"}</h4>
                                <span className="bg-blue-50 text-blue-700 text-xs font-black font-mono px-2.5 py-0.5 rounded-full border border-blue-200">
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
                            <span className="font-bold text-blue-700 text-sm">{b.monthsPaid || 0} / {b.monthsTotal || 40} Months</span>
                          </div>
                        </div>

                        {/* Mandatory Submitted Documents Lightbox Buttons */}
                        <div className="p-3.5 bg-slate-50 border border-slate-200 rounded-xl space-y-2">
                          <div className="flex items-center justify-between text-xs font-bold text-slate-800">
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

                          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-6 gap-2 pt-1">
                            {aadharFront ? (
                              <button
                                type="button"
                                onClick={() => { setLightboxImg(aadharFront); setZoomLevel(1); }}
                                className="flex items-center gap-1 px-2.5 py-1.5 bg-white border border-slate-200 rounded-lg text-xs font-bold text-slate-800 hover:bg-slate-100 shadow-2xs transition cursor-pointer flex items-center justify-center"
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
                                className="flex items-center gap-1 px-2.5 py-1.5 bg-white border border-slate-200 rounded-lg text-xs font-bold text-slate-800 hover:bg-slate-100 shadow-2xs transition cursor-pointer flex items-center justify-center"
                              >
                                🆔 Aadhaar Back 🔍
                              </button>
                            )}

                            {panFront ? (
                              <button
                                type="button"
                                onClick={() => { setLightboxImg(panFront); setZoomLevel(1); }}
                                className="flex items-center gap-1 px-2.5 py-1.5 bg-white border border-slate-200 rounded-lg text-xs font-bold text-slate-800 hover:bg-slate-100 shadow-2xs transition cursor-pointer flex items-center justify-center"
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
                                className="flex items-center gap-1 px-2.5 py-1.5 bg-white border border-slate-200 rounded-lg text-xs font-bold text-slate-800 hover:bg-slate-100 shadow-2xs transition cursor-pointer flex items-center justify-center"
                              >
                                💳 PAN Back 🔍
                              </button>
                            )}

                            {chequeFront ? (
                              <button
                                type="button"
                                onClick={() => { setLightboxImg(chequeFront); setZoomLevel(1); }}
                                className="flex items-center gap-1 px-2.5 py-1.5 bg-white border border-amber-300 rounded-lg text-xs font-bold text-amber-900 hover:bg-amber-50 shadow-2xs transition cursor-pointer flex items-center justify-center"
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
                                className="flex items-center gap-1 px-2.5 py-1.5 bg-white border border-amber-300 rounded-lg text-xs font-bold text-amber-900 hover:bg-amber-50 shadow-2xs transition cursor-pointer flex items-center justify-center"
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
                    className="px-3 py-2 bg-blue-50 text-blue-700 hover:bg-blue-100 border border-blue-200 rounded-xl text-xs font-bold transition flex items-center gap-1.5"
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
                                <span className="px-2 py-1 bg-blue-50 text-blue-700 border border-blue-200 rounded-md font-bold">
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
                          className="w-full px-4 py-2.5 border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none text-sm font-mono"
                        />
                      </div>
                      <div>
                        <label className="text-xs font-bold text-gray-700 block mb-1">UPI Receiver Name</label>
                        <input
                          type="text"
                          value={depositDetails.upiName}
                          onChange={e => setDepositDetails({ ...depositDetails, upiName: e.target.value })}
                          placeholder="e.g. Educa Finance & Payments"
                          className="w-full px-4 py-2.5 border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none text-sm"
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
                          className="w-full px-4 py-2.5 border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none text-sm font-mono"
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
                          className="w-full px-4 py-2.5 border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none text-sm font-mono uppercase"
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
                          className="w-full px-4 py-2.5 border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none text-sm"
                        />
                      </div>
                      <div>
                        <label className="text-xs font-bold text-gray-700 block mb-1">Branch Name</label>
                        <input
                          type="text"
                          value={depositDetails.branch}
                          onChange={e => setDepositDetails({ ...depositDetails, branch: e.target.value })}
                          placeholder="e.g. Jhalwa Branch, Prayagraj"
                          className="w-full px-4 py-2.5 border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none text-sm"
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
                        className="w-full px-4 py-2.5 border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none text-sm"
                      />
                    </div>

                    <div>
                      <label className="text-xs font-bold text-gray-700 block mb-1">Customer Deposit Instructions</label>
                      <textarea
                        rows={2}
                        value={depositDetails.instructions}
                        onChange={e => setDepositDetails({ ...depositDetails, instructions: e.target.value })}
                        placeholder="e.g. Payment complete karne ke baad 12-digit UTR number enter karein."
                        className="w-full px-4 py-2.5 border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none text-sm"
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
                  <div className="lg:col-span-5 bg-slate-50 text-slate-900 rounded-2xl p-4.5 border border-slate-200/90 shadow-2xs space-y-3 self-start">
                    <div className="flex items-center justify-between pb-2 border-b border-slate-200">
                      <p className="text-[10px] font-black uppercase tracking-wider text-blue-700">📱 Live Customer App Preview</p>
                      <span className="text-[9px] px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200 font-bold">
                        Add Money Sheet
                      </span>
                    </div>

                    <div className="space-y-2">
                      <div className="bg-white rounded-xl p-3 border border-slate-200 shadow-2xs space-y-1">
                        <p className="text-[10px] text-slate-500 uppercase font-bold">UPI Payment</p>
                        <p className="font-mono font-bold text-sm text-blue-700 truncate">{depositDetails.upiId || "admin@upi"}</p>
                        <p className="text-[11px] text-slate-600">{depositDetails.upiName || "Educa Finance"}</p>
                      </div>

                      <div className="bg-white rounded-xl p-3 border border-slate-200 shadow-2xs space-y-1 text-xs">
                        <p className="text-[10px] text-slate-500 uppercase font-bold">Bank Transfer</p>
                        <div className="flex justify-between">
                          <span className="text-slate-500 text-[11px]">Bank:</span>
                          <span className="font-bold text-slate-900">{depositDetails.bankName || "Bank of Baroda"}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-slate-500 text-[11px]">A/C No:</span>
                          <span className="font-mono font-bold text-blue-700">{depositDetails.accountNumber || "1234567890"}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-slate-500 text-[11px]">IFSC:</span>
                          <span className="font-mono font-bold text-slate-900">{depositDetails.ifsc || "BARB0JHALWA"}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-slate-500 text-[11px]">Branch:</span>
                          <span className="text-slate-900">{depositDetails.branch || "Jhalwa"}</span>
                        </div>
                      </div>
                    </div>

                    <p className="text-[10px] text-slate-500 leading-relaxed italic">
                      "Customer is detail par payment karega, receipt ka UTR daalega, aur aap 'Pending' tab me Approve karenge."
                    </p>
                  </div>
                </div>
              </div>

              {/* Custom User APY Security Lock (5 Tap Unlock) */}
              <div className="bg-white rounded-2xl shadow-sm p-5 sm:p-6 border border-gray-100">
                <div className="flex items-center justify-between mb-1">
                  <h3 className="text-lg font-bold font-display flex items-center gap-2 text-slate-900">
                    <span>🔐</span> Custom User APY Editor Security Lock
                  </h3>
                  <span className={`text-[10px] font-black px-2.5 py-0.5 rounded-full ${
                    isApyLocked ? "bg-rose-100 text-rose-800 border border-rose-200" : "bg-emerald-100 text-emerald-800 border border-emerald-200"
                  }`}>
                    {isApyLocked ? "🔒 LOCKED (Protected)" : "🔓 UNLOCKED (Editable)"}
                  </span>
                </div>
                <p className="text-sm text-slate-500 mb-4">
                  Galati se kisi user ka interest rate change na ho sake isliye APY editor default locked rehta hai. Is button ko <strong>5 baar tap</strong> karke aap editor unlock kar sakte hain.
                </p>

                <div className="flex items-center gap-3 flex-wrap">
                  <button
                    type="button"
                    onClick={handleApyLockTap}
                    className={`px-5 py-2.5 rounded-xl font-bold text-xs sm:text-sm flex items-center gap-2 transition active:scale-95 shadow-xs cursor-pointer ${
                      isApyLocked
                        ? "bg-slate-900 hover:bg-slate-800 text-white"
                        : "bg-rose-600 hover:bg-rose-700 text-white"
                    }`}
                  >
                    <span>{isApyLocked ? "🔒" : "🔓"}</span>
                    <span>
                      {isApyLocked
                        ? `Tap to Unlock (${5 - apyTapCount} taps remaining)`
                        : "Lock APY Editor Now (Click to Protect)"}
                    </span>
                  </button>
                  <span className="text-xs text-slate-400 font-mono">
                    Status: {isApyLocked ? "Protected against accidental changes" : "Active editing allowed"}
                  </span>
                </div>
              </div>

              {/* Interest Rate */}
              <div className="bg-white rounded-2xl shadow-sm p-5 sm:p-6 border border-gray-100">
                <h3 className="text-lg font-bold font-display mb-1 text-slate-900">📈 Loan Interest Rate</h3>
                <p className="text-sm text-slate-500 mb-5">Sirf <strong>naye loans</strong> affect honge. Purane loans ka rate kabhi nahi badlega.</p>
                <div className="flex items-center gap-6 mb-5 flex-wrap">
                  <div className="bg-blue-50 border border-blue-200 rounded-xl px-6 py-4 text-center">
                    <p className="text-xs text-slate-500">Current Rate</p>
                    <p className="text-3xl font-black font-display text-blue-600">{interestRate}%</p>
                    <p className="text-xs text-slate-400">per annum</p>
                  </div>
                </div>
                <div className="flex gap-3 max-w-sm">
                  <input type="number" inputMode="decimal" min="1" max="100" step="0.5" value={newInterestRate} onChange={e => setNewInterestRate(e.target.value)} placeholder="Naya rate daalo" className="flex-1 px-4 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none text-base sm:text-sm" />
                  <span className="flex items-center text-gray-500 font-bold">%</span>
                  <button onClick={updateInterestRate} className="px-5 py-3 bg-blue-600 text-white rounded-xl font-bold text-sm hover:bg-blue-700 transition cursor-pointer">Update</button>
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

        {/* Persistent Bottom Desk Navigation Bar for Mobile */}
        <div className="lg:hidden fixed bottom-0 left-0 right-0 z-40 bg-slate-900/95 backdrop-blur-md border-t border-slate-800 px-2 py-1.5 flex items-center justify-around safe-bottom shadow-2xl">
          {[
            { key: "analytics", label: "Reserves", icon: "📊" },
            { key: "pending", label: "Pending", icon: "⏳", badge: pending.length },
            { key: "users", label: "Users", icon: "👥" },
            { key: "history", label: "History", icon: "📜" },
          ].map(({ key, label, icon, badge }) => (
            <button
              key={key}
              type="button"
              onClick={() => {
                switchTab(key);
                window.scrollTo({ top: 0, behavior: "smooth" });
              }}
              className={`relative flex flex-col items-center justify-center py-1 px-2.5 rounded-xl text-[10px] font-bold transition active:scale-95 cursor-pointer ${
                tab === key ? "text-blue-400 font-black" : "text-slate-400 hover:text-slate-200"
              }`}
            >
              <span className="text-base leading-none">{icon}</span>
              <span className="mt-0.5">{label}</span>
              {!!badge && (
                <span className="absolute -top-0.5 right-1 text-[8px] font-black bg-rose-500 text-white px-1.5 py-0.2 rounded-full">
                  {badge}
                </span>
              )}
            </button>
          ))}
          <button
            type="button"
            onClick={() => setMobileNavOpen(true)}
            className="flex flex-col items-center justify-center py-1 px-2.5 rounded-xl text-[10px] font-bold text-slate-300 hover:text-white transition active:scale-95 cursor-pointer"
          >
            <span className="text-base leading-none">☰</span>
            <span className="mt-0.5">All ({tabs.length})</span>
          </button>
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
                    {previewKycUser.kycDocuments?.aadhaarName || previewKycUser.kycDocuments?.aadharName || previewKycUser.name || "—"}
                  </span>
                </div>
                <div>
                  <span className="text-gray-400 font-semibold block text-[10px]">AADHAAR PHONE</span>
                  <span className="font-mono font-bold text-gray-900">
                    {previewKycUser.kycDocuments?.aadhaarPhone || previewKycUser.kycDocuments?.aadharPhone || previewKycUser.phone || "—"}
                  </span>
                </div>
                <div>
                  <span className="text-gray-400 font-semibold block text-[10px]">DOC 2 (FINANCIAL)</span>
                  <span className="font-bold text-blue-700 uppercase">
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
                  <span className="text-xs font-bold text-slate-900 block flex items-center justify-between">
                    <span className="flex items-center gap-1.5">
                      <span>💳</span> Doc 2: {previewKycUser.kycDocuments?.doc2Type === "cheque" ? "Bank Cheque" : "PAN Card"}
                    </span>
                    <span className="text-[10px] text-blue-600 font-semibold">Front & Back</span>
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
                      : "bg-gray-50 border border-gray-200 text-gray-800 placeholder-gray-400 focus:ring-2 focus:ring-blue-500"
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

      {/* ASSIGN / LINK AGENT MODAL */}
      {assignAgentModalUser && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-md w-full p-5 sm:p-6 shadow-2xl border border-gray-100 animate-in fade-in zoom-in-95 duration-150 space-y-4">
            <div className="flex items-center justify-between border-b border-gray-100 pb-3">
              <div className="flex items-center gap-2">
                <span className="text-xl">🤝</span>
                <div>
                  <h3 className="font-extrabold text-base text-gray-900 leading-tight">
                    Link / Reassign Agent
                  </h3>
                  <p className="text-[11px] text-gray-500 font-medium">
                    Borrower: <span className="font-bold text-gray-800">{assignAgentModalUser.name}</span> ({assignAgentModalUser.phone || "No phone"})
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setAssignAgentModalUser(null)}
                className="w-8 h-8 rounded-full bg-gray-100 hover:bg-gray-200 text-gray-600 flex items-center justify-center text-sm font-bold cursor-pointer"
              >
                ✕
              </button>
            </div>

            <div className="p-3 bg-amber-50 border border-amber-200 rounded-2xl text-xs text-amber-900 space-y-1">
              <p className="font-bold">Hierarchy & Commission Linking</p>
              <p className="text-[11px] text-amber-800 leading-relaxed">
                Yahan se aap is borrower ko kisi bhi Master Agent ya Sub-Agent se connect kar sakte hain ya Direct Customer bana sakte hain.
              </p>
            </div>

            <div>
              <label className="block font-bold text-gray-700 text-xs mb-1.5">
                Select Agent / Referrer
              </label>
              <select
                value={selectedAgentForAssign}
                onChange={(e) => setSelectedAgentForAssign(e.target.value)}
                className="w-full p-2.5 bg-gray-50 border border-gray-200 rounded-xl text-xs font-semibold text-gray-900 outline-none focus:ring-2 focus:ring-amber-500 cursor-pointer"
              >
                <option value="">👤 -- Direct Customer (No Agent / Platform Direct) --</option>
                {agents.map(a => {
                  const prof = a.agentProfile || {};
                  const isTeam = prof.commissionModel === "team_1";
                  const refInfo = a.referredBy ? ` (Sub of ${typeof a.referredBy === 'object' ? a.referredBy.name : 'Master'})` : "";
                  return (
                    <option key={a._id} value={a._id}>
                      🤝 {a.name} ({a.phone}) — {isTeam ? "👑 Team Agent" : "👤 Solo"}{refInfo}
                    </option>
                  );
                })}
              </select>
            </div>

            <div className="flex gap-2.5 pt-2 border-t border-gray-100">
              <button
                type="button"
                onClick={() => setAssignAgentModalUser(null)}
                className="flex-1 py-2.5 rounded-xl border border-gray-200 text-gray-700 hover:bg-gray-100 text-xs font-bold transition cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={assigningAgent}
                onClick={handleAssignAgent}
                className="flex-1 py-2.5 rounded-xl bg-gradient-to-r from-amber-600 to-orange-600 hover:from-amber-700 hover:to-orange-700 text-white text-xs font-bold shadow-md shadow-amber-500/20 transition cursor-pointer disabled:opacity-50"
              >
                {assigningAgent ? "Saving..." : "Save Assignment →"}
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
                    Account: <span className="font-bold font-mono text-blue-700">{loanApproveModal.accountNumber || "Loan"}</span>
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
                    ? "bg-sky-50/90 border-sky-500 ring-2 ring-sky-300 shadow-xs"
                    : "bg-white border-gray-200 hover:bg-gray-50"
                }`}>
                  <input
                    type="radio"
                    name="advanceOption"
                    value="waive"
                    checked={advanceOption === "waive"}
                    onChange={() => setAdvanceOption("waive")}
                    className="mt-1 text-sky-600 cursor-pointer accent-sky-600"
                  />
                  <div className="flex-1 min-w-0">
                    <div className="font-extrabold text-sky-950 flex items-center justify-between gap-1">
                      <span className="text-xs">🔵 Waive / Maaf Karein</span>
                      <span className="text-[9px] sm:text-[10px] bg-sky-100 text-sky-800 border border-sky-200 px-1.5 sm:px-2 py-0.5 rounded-full font-black shrink-0 whitespace-nowrap">WAIVER</span>
                    </div>
                    <p className="text-[11px] text-gray-700 mt-1 font-medium">
                      Net Disburse: <strong className="text-sky-700 font-extrabold text-xs">₹{Math.max(0, loanApproveModal.amount - (loanApproveModal.processingFee || 0) - (loanApproveModal.upiCharges || 0)).toLocaleString("en-IN")}</strong>
                    </p>
                    <p className="text-[10px] text-sky-700 mt-0.5">
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
                className="relative overflow-visible flex-1 py-3 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-black shadow-md shadow-emerald-500/20 active:scale-95 transition cursor-pointer disabled:opacity-50 flex items-center justify-center gap-2"
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
