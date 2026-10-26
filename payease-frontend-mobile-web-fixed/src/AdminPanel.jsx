import React, { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { Link, useNavigate } from "react-router-dom";
import Toast from "./components/Toast";
import StatusBadge from "./components/StatusBadge";

import { API } from "./config";
import { tokenStorage } from "./utils/tokenStorage";
import { CacheManager, appCache, parseCachedNumber } from "./utils/dataCache";
import { useDebounce } from "./utils/performance";

const StaffManager = React.lazy(() => import("./admin/StaffManager"));
const ActivityLog = React.lazy(() => import("./admin/ActivityLog"));

// --- PERSISTENT & IN-MEMORY CACHE WITH STALE-WHILE-REVALIDATE ---
const apiCache = new Map();
const inFlightRequests = new Map();

async function cachedAdminFetch(url, options = {}, ttlMs = 3000, forceRefresh = false) {
  const method = (options.method || "GET").toUpperCase();
  if (method !== "GET") {
    apiCache.clear();
    if (typeof navigator !== "undefined" && !navigator.onLine) {
      throw new Error("Aap offline hain. Kripya apna internet connection check karein.");
    }
    const controller = new AbortController();
    const timeoutTimer = setTimeout(() => controller.abort(), 30000);
    try {
      const res = await fetch(url, { ...options, signal: controller.signal });
      clearTimeout(timeoutTimer);
      return res;
    } catch (err) {
      clearTimeout(timeoutTimer);
      if (err.name === "AbortError") {
        throw new Error("Request timeout ho gayi. Server response der se aa rahi hai, dobara try karein.");
      }
      throw err;
    }
  }

  const cacheKey = `${url}`;
  const persistentKey = `educa_admin_fetch_${cacheKey}`;
  const now = Date.now();

  // 1. In-memory or persisted cache check: return cached if within ttlMs and not forcing refresh
  if (!forceRefresh) {
    if (apiCache.has(cacheKey)) {
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
    const meta = appCache.getWithMeta(persistentKey, null);
    if (meta && meta.data && (now - (meta.lastUpdated || 0) < ttlMs)) {
      apiCache.set(cacheKey, { timestamp: meta.lastUpdated, data: meta.data });
      return {
        ok: true,
        status: 200,
        fromCache: true,
        json: async () => meta.data
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
      const activeToken = tokenStorage.getToken() || localStorage.getItem("token") || "";
      const requestHeaders = {
        ...(options.headers || {}),
        Authorization: options.headers?.Authorization || (activeToken ? `Bearer ${activeToken}` : ""),
        "Cache-Control": "no-cache",
        "Pragma": "no-cache"
      };
      const sep = url.includes("?") ? "&" : "?";
      const fetchUrl = forceRefresh ? `${url}${sep}_t=${Date.now()}` : url;
      const res = await fetch(fetchUrl, { ...options, headers: requestHeaders, signal: controller.signal });
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
      // Fallback on network error to cached data (Stale-While-Revalidate resilience)
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

// --- IN-MEMORY CACHE FOR OPENED KYC USER DOCUMENTS ---
const kycDocMemoryCache = new Map();

// --- CLIENT DEVICE & BROWSER DETECTOR (For Approval Audits) ---
const getClientDeviceInfo = () => {
  if (typeof window === "undefined" || !navigator) return "Web Console";
  const ua = navigator.userAgent || "";
  let device = "PC / Desktop";
  let browser = "Browser";

  if (/android/i.test(ua)) {
    const match = ua.match(/;\s*([^;)]+)\s*Build/i);
    device = match && match[1] ? `Android (${match[1].trim()})` : "Android Phone";
  } else if (/iphone/i.test(ua)) {
    device = "iPhone (iOS)";
  } else if (/ipad/i.test(ua)) {
    device = "iPad (iOS)";
  } else if (/windows/i.test(ua)) {
    device = "Windows PC";
  } else if (/macintosh|mac os x/i.test(ua)) {
    device = "Mac";
  } else if (/linux/i.test(ua)) {
    device = "Linux PC";
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
  if (!u) return { type: "direct", label: "Direct Customer", subLabel: "", badge: "Direct Customer" };

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
        badge: `Sub-Agent: ${u.name} (via ${parentName})`,
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
        badge: `Agent: ${u.name}`,
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
      badge: "Direct Customer"
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
      badge: "Agent Customer",
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

// --- DESK ROLE PRESETS (Staff Departments & Department Restrictions) ---
const DESK_ROLE_PRESETS = [
  {
    key: "loan_desk",
    role: "staff",
    label: "Loan Desk (Tum Loan wale ho)",
    sub: "Loans review, approve/reject & disbursal access",
    departments: ["loan"],
    permissions: ["loan.view", "loan.approve", "loan.reject", "loan.disburse"]
  },
  {
    key: "kyc_desk",
    role: "staff",
    label: "🪪 KYC Desk (Tum KYC wale ho)",
    sub: "KYC Aadhaar/PAN verify & document approval",
    departments: ["kyc"],
    permissions: ["kyc.view", "kyc.approve", "kyc.reject"]
  },
  {
    key: "deposit_desk",
    role: "staff",
    label: "Deposit Desk (Tum Deposit wale ho)",
    sub: "Inward deposits & UPI payment approvals",
    departments: ["deposit"],
    permissions: ["deposit.view", "deposit.approve", "deposit.reject"]
  },
  {
    key: "withdrawal_desk",
    role: "staff",
    label: "Withdrawal Desk (Tum Withdrawal wale ho)",
    sub: "Outward payouts & withdrawal requests",
    departments: ["withdrawal"],
    permissions: ["withdrawal.view", "withdrawal.approve", "withdrawal.reject"]
  },
  {
    key: "finance_desk",
    role: "staff",
    label: "Finance Desk (Deposit + Withdrawal)",
    sub: "Cashier: Deposit + Withdrawal dono handle karega",
    departments: ["deposit", "withdrawal"],
    permissions: ["deposit.view", "deposit.approve", "deposit.reject", "withdrawal.view", "withdrawal.approve", "withdrawal.reject"]
  },
  {
    key: "full_desk",
    role: "staff",
    label: "Full Desk (All Departments)",
    sub: "Loan, KYC, Deposit, Withdrawal, Bonds & Lending (All Desks)",
    departments: ["loan", "kyc", "deposit", "withdrawal", "lending", "bond"],
    permissions: ["*"]
  },
  {
    key: "revoke",
    role: "user",
    label: "Remove Staff Role (Normal Customer)",
    sub: "Staff access band karke regular user/customer banao",
    departments: [],
    permissions: []
  }
];

function LiveAdminProfitTicker({ baseProfit = 0, deposits = 0, className = "" }) {
  const [profit] = useState(() => {
    if (typeof localStorage !== "undefined") {
      const v = parseCachedNumber(localStorage.getItem("educa_admin_cached_profit"), null);
      if (v !== null && isFinite(v) && v >= 0) return v;
    }
    return baseProfit >= 0 ? baseProfit : 0;
  });
  const spanRef = useRef(null);
  const currentRef = useRef(profit);
  const lastRef = useRef(Date.now());
  const lastSaveRef = useRef(0);

  useEffect(() => {
    currentRef.current = Number(baseProfit) || 0;
    if (spanRef.current) {
      spanRef.current.textContent = `₹${currentRef.current.toLocaleString("en-IN", { minimumFractionDigits: 4, maximumFractionDigits: 4 })}`;
    }
  }, [baseProfit]);

  useEffect(() => {
    const depVal = deposits > 0 ? deposits : 0;
    if (depVal <= 0) return;
    const dailyAdminYield = (depVal * 0.12) / 365;
    const perMsAdminYield = dailyAdminYield / 86400000;
    lastRef.current = Date.now();

    let rafId = null;
    let lastTick = 0;

    const update = (timestamp) => {
      if (typeof document !== "undefined" && document.hidden) {
        rafId = requestAnimationFrame(update);
        return;
      }
      if (timestamp - lastTick >= 30) {
        lastTick = timestamp;
        const now = Date.now();
        const dt = Math.max(0, now - lastRef.current);
        lastRef.current = now;
        if (dt > 0 && perMsAdminYield > 0) {
          currentRef.current += dt * perMsAdminYield;
          if (spanRef.current) {
            spanRef.current.textContent = `₹${currentRef.current.toLocaleString("en-IN", { minimumFractionDigits: 4, maximumFractionDigits: 4 })}`;
          }
          if (now - lastSaveRef.current > 3000) {
            lastSaveRef.current = now;
            try {
              if (currentRef.current >= 0) localStorage.setItem("educa_admin_cached_profit", String(currentRef.current));
            } catch {}
          }
        }
      }
      rafId = requestAnimationFrame(update);
    };
    rafId = requestAnimationFrame(update);
    return () => {
      if (rafId) cancelAnimationFrame(rafId);
    };
  }, [deposits]);

  // Persist immediately on app minimize, phone screen lock, or tab close
  useEffect(() => {
    const handleSave = () => {
      try {
        if (currentRef.current >= 0) localStorage.setItem("educa_admin_cached_profit", String(currentRef.current));
      } catch {}
    };
    window.addEventListener("pagehide", handleSave);
    window.addEventListener("beforeunload", handleSave);
    document.addEventListener("visibilitychange", handleSave);
    return () => {
      window.removeEventListener("pagehide", handleSave);
      window.removeEventListener("beforeunload", handleSave);
      document.removeEventListener("visibilitychange", handleSave);
    };
  }, []);

  return (
    <span ref={spanRef} className={`font-mono tabular-nums whitespace-nowrap ${className}`}>
      ₹{Number(profit).toLocaleString("en-IN", { minimumFractionDigits: 4, maximumFractionDigits: 4 })}
    </span>
  );
}

function LiveAdminReservesTicker({ deposits = 0, baseProfit = 0, className = "" }) {
  const [initialVal] = useState(() => {
    if (typeof localStorage !== "undefined") {
      const v = parseCachedNumber(localStorage.getItem("educa_admin_cached_reserves"), null);
      if (v !== null && isFinite(v) && v >= 0) return v;
    }
    const d = deposits > 0 ? deposits : 0;
    const p = baseProfit > 0 ? baseProfit : 0;
    return d + p;
  });
  const spanRef = useRef(null);
  const currentRef = useRef(initialVal);
  const lastRef = useRef(Date.now());
  const lastSaveRef = useRef(0);

  useEffect(() => {
    const d = deposits > 0 ? deposits : 0;
    const p = baseProfit > 0 ? baseProfit : 0;
    currentRef.current = d + p;
    if (spanRef.current) {
      spanRef.current.textContent = `₹${currentRef.current.toLocaleString("en-IN", { minimumFractionDigits: 4, maximumFractionDigits: 4 })}`;
    }
  }, [deposits, baseProfit]);

  useEffect(() => {
    const depVal = deposits > 0 ? deposits : 0;
    if (depVal <= 0) return;
    const dailyAdminYield = (depVal * 0.12) / 365;
    const perMsAdminYield = dailyAdminYield / 86400000;
    lastRef.current = Date.now();

    let rafId = null;
    let lastTick = 0;

    const update = (timestamp) => {
      if (typeof document !== "undefined" && document.hidden) {
        rafId = requestAnimationFrame(update);
        return;
      }
      if (timestamp - lastTick >= 30) {
        lastTick = timestamp;
        const now = Date.now();
        const dt = Math.max(0, now - lastRef.current);
        lastRef.current = now;
        if (dt > 0 && perMsAdminYield > 0) {
          currentRef.current += dt * perMsAdminYield;
          if (spanRef.current) {
            spanRef.current.textContent = `₹${currentRef.current.toLocaleString("en-IN", { minimumFractionDigits: 4, maximumFractionDigits: 4 })}`;
          }
          if (now - lastSaveRef.current > 3000) {
            lastSaveRef.current = now;
            try {
              if (currentRef.current >= 0) localStorage.setItem("educa_admin_cached_reserves", String(currentRef.current));
            } catch {}
          }
        }
      }
      rafId = requestAnimationFrame(update);
    };
    rafId = requestAnimationFrame(update);
    return () => {
      if (rafId) cancelAnimationFrame(rafId);
    };
  }, [deposits, baseProfit]);

  // Persist immediately on app minimize, phone screen lock, or tab close
  useEffect(() => {
    const handleSave = () => {
      try {
        if (currentRef.current >= 0) localStorage.setItem("educa_admin_cached_reserves", String(currentRef.current));
      } catch {}
    };
    window.addEventListener("pagehide", handleSave);
    window.addEventListener("beforeunload", handleSave);
    document.addEventListener("visibilitychange", handleSave);
    return () => {
      window.removeEventListener("pagehide", handleSave);
      window.removeEventListener("beforeunload", handleSave);
      document.removeEventListener("visibilitychange", handleSave);
    };
  }, []);

  return (
    <span ref={spanRef} className={`font-mono tabular-nums whitespace-nowrap ${className}`}>
      ₹{Number(initialVal).toLocaleString("en-IN", { minimumFractionDigits: 4, maximumFractionDigits: 4 })}
    </span>
  );
}

function LiveLedgerDailyAdded({ baseAmount = 0, deposits = 0, className = "" }) {
  const spanRef = useRef(null);
  const currentRef = useRef(baseAmount);
  const lastRef = useRef(Date.now());

  useEffect(() => {
    currentRef.current = baseAmount;
    if (spanRef.current) {
      spanRef.current.textContent = `+₹${currentRef.current.toLocaleString("en-IN", { minimumFractionDigits: 4, maximumFractionDigits: 4 })}`;
    }
  }, [baseAmount]);

  useEffect(() => {
    if (deposits <= 0) return;
    const dailyAdminYield = (deposits * 0.12) / 365;
    const perMsAdminYield = dailyAdminYield / 86400000;
    lastRef.current = Date.now();

    let rafId = null;
    let lastTick = 0;

    const update = (timestamp) => {
      if (typeof document !== "undefined" && document.hidden) {
        rafId = requestAnimationFrame(update);
        return;
      }
      if (timestamp - lastTick >= 30) {
        lastTick = timestamp;
        const now = Date.now();
        const dt = Math.max(0, now - lastRef.current);
        lastRef.current = now;
        if (dt > 0 && perMsAdminYield > 0) {
          currentRef.current += dt * perMsAdminYield;
          if (spanRef.current) {
            spanRef.current.textContent = `+₹${currentRef.current.toLocaleString("en-IN", { minimumFractionDigits: 4, maximumFractionDigits: 4 })}`;
          }
        }
      }
      rafId = requestAnimationFrame(update);
    };
    rafId = requestAnimationFrame(update);
    return () => {
      if (rafId) cancelAnimationFrame(rafId);
    };
  }, [deposits]);

  return (
    <span ref={spanRef} className={`font-mono tabular-nums whitespace-nowrap ${className}`}>
      +₹{Number(baseAmount).toLocaleString("en-IN", { minimumFractionDigits: 4, maximumFractionDigits: 4 })}
    </span>
  );
}

function LiveUserProfitCell({ user }) {
  const base = Number(user?.profitBalance || 0);
  const bal = Number(user?.balance || 0);
  const rate = Number(user?.interestRate || 12);
  const decimals = bal <= 0 ? 4 : (bal < 10 ? 10 : (bal < 100 ? 9 : (bal < 1000 ? 8 : (bal < 50000 ? 7 : 6))));
  const spanRef = useRef(null);

  useEffect(() => {
    if (bal <= 0) return;
    const perMs = (bal * rate) / (36500 * 86400000);
    let mountTime = Date.now();
    let rafId = null;
    let lastTick = 0;

    const tick = (timestamp) => {
      if (typeof document !== "undefined" && document.hidden) {
        rafId = requestAnimationFrame(tick);
        return;
      }
      if (timestamp - lastTick >= 30) {
        lastTick = timestamp;
        const now = Date.now();
        const liveVal = base + Math.max(0, now - mountTime) * perMs;
        if (spanRef.current) {
          spanRef.current.textContent = `+₹${liveVal.toLocaleString("en-IN", { minimumFractionDigits: decimals, maximumFractionDigits: decimals })}`;
        }
      }
      rafId = requestAnimationFrame(tick);
    };

    rafId = requestAnimationFrame(tick);
    return () => {
      if (rafId) cancelAnimationFrame(rafId);
    };
  }, [base, bal, rate, decimals]);

  if (bal <= 0 && base <= 0) return <span className="text-gray-400 text-xs font-mono tabular-nums">₹0.0000</span>;

  return (
    <span ref={spanRef} className="font-mono tabular-nums whitespace-nowrap inline-block">
      +₹{Number(base).toLocaleString("en-IN", { minimumFractionDigits: decimals, maximumFractionDigits: decimals })}
    </span>
  );
}

const DEFAULT_ANALYTICS = {
  success: true,
  stats: {
    totalUsers: 0,
    totalUserBalances: 0,
    totalUserProfits: 0,
    totalActiveBonds: 0,
    netFintechReserve: 0,
    totalDeposits: 0,
    totalYieldCredited: 0,
    pendingTxnsCount: 0,
    pendingLoansCount: 0,
    totalWithdrawals: 0,
    totalLoansDisbursed: 0
  },
  timeline: [],
  dailyProfitChart: []
};

const DEFAULT_AUDIT_HISTORY = [];

function formatLiveTimeElapsed(dateStr) {
  if (!dateStr) return "Just now";
  const time = new Date(dateStr).getTime();
  if (isNaN(time)) return "Just now";
  const diffSec = Math.max(0, Math.floor((Date.now() - time) / 1000));
  if (diffSec < 10) return "Just now (Live)";
  if (diffSec < 60) return `${diffSec}s ago`;
  const mins = Math.floor(diffSec / 60);
  const secs = diffSec % 60;
  if (mins < 60) return `${mins}m ${secs}s ago`;
  const hours = Math.floor(mins / 60);
  const remMins = mins % 60;
  if (hours < 24) return `${hours}h ${remMins}m ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

// Helper: Disbursal Option Breakdown (Dates timeline, applied percentages, and penalty terms)
function getDisbursalBreakdown(loan, chosenOpt = "none") {
  if (!loan) return null;
  const principal = Number(loan.amount || 0);
  const count = Number(loan.installmentsCount || loan.dailyTenureDays || 15);
  const instAmt = Number(loan.installmentAmount || loan.emiAmount || 0);
  const totalPayable = Number(loan.totalPayable || (instAmt * count));

  // Deductions: Processing Fee + UPI charges
  const feeDeduction = (loan.processingFee || 0) + (loan.upiCharges || 0) || Math.max(0, principal - Number(loan.disbursalAmount || principal));
  const feePct = principal > 0 ? ((feeDeduction / principal) * 100).toFixed(1) : "0.0";

  // Interest & Repayment
  const totalInterest = Math.max(0, totalPayable - principal);
  const interestPct = principal > 0 ? ((totalInterest / principal) * 100).toFixed(1) : "0.0";
  const totalRepayPct = principal > 0 ? ((totalPayable / principal) * 100).toFixed(1) : "100.0";

  // Frequency & cycle
  const cycleDays = (loan.loanType === "micro_business" || loan.collectionFrequency === "daily" || loan.tenureMonths === 1) ? 1 : 10;
  const cycleLabel = cycleDays === 1 ? "Daily (1 Din)" : "Har 10 Din (10-Day Cycle)";

  // Overdue Penalty: 2% per overdue installment
  const penaltyPerEmi = Math.round((instAmt * 2) / 100);

  // In-hand payout calculations
  const basePayout = Math.max(0, principal - feeDeduction);
  const advancePayout = Math.max(0, basePayout - instAmt);
  const inHandAmount = chosenOpt === "deduct" ? advancePayout : basePayout;
  const inHandPct = principal > 0 ? ((inHandAmount / principal) * 100).toFixed(1) : "0.0";
  const advanceDeductPct = chosenOpt === "deduct" && principal > 0 ? ((instAmt / principal) * 100).toFixed(1) : "0.0";

  // Date offsets from now
  const now = new Date();
  const addDays = (d, days) => {
    const res = new Date(d);
    res.setDate(res.getDate() + days);
    return res.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
  };

  let schedule = {};
  if (chosenOpt === "deduct") {
    schedule = {
      title: "1st EMI Advance Kaatein",
      firstEmiTitle: "Kist #1 (Paid Upfront)",
      firstEmiDate: "Aaj hi Paid (Advance Deduct)",
      firstEmiDetail: `₹${instAmt.toLocaleString("en-IN")} payout se kat gaya`,
      firstEmiBadge: "PAID UPFRONT",
      nextEmiTitle: "Kist #2 Due Date",
      nextEmiDate: addDays(now, cycleDays * 2),
      finalMaturityDate: addDays(now, cycleDays * count),
      remainingCount: Math.max(0, count - 1),
      paidCount: 1,
      graceNote: "Pehli kist disburse hote hi Paid mark ho jayegi. Borrower ko agle cycle se Kist #2 bharni hogi."
    };
  } else if (chosenOpt === "defer") {
    schedule = {
      title: "1st Kist Baad Me Lein (Grace)",
      firstEmiTitle: "Kist #1 Due Date (+Grace)",
      firstEmiDate: addDays(now, cycleDays * 2),
      firstEmiDetail: `+${cycleDays} din extra grace period mila`,
      firstEmiBadge: `+${cycleDays}D GRACE PERIOD`,
      nextEmiTitle: "Kist #2 Due Date",
      nextEmiDate: addDays(now, cycleDays * 3),
      finalMaturityDate: addDays(now, cycleDays * (count + 1)),
      remainingCount: count,
      paidCount: 0,
      graceNote: `Admin grace period: Pehli kist ${cycleDays} din ke bajaye ${cycleDays * 2} din baad shuru hogi.`
    };
  } else {
    // none or waive
    schedule = {
      title: chosenOpt === "waive" ? "Pehli Kist Waive (Free)" : "Normal Disbursal",
      firstEmiTitle: chosenOpt === "waive" ? "Kist #1 (Waived Free)" : "Kist #1 Due Date",
      firstEmiDate: chosenOpt === "waive" ? "Aaj Free Paid Mark" : addDays(now, cycleDays),
      firstEmiDetail: chosenOpt === "waive" ? "Admin taraf se free kist" : `In ${cycleDays} days`,
      firstEmiBadge: chosenOpt === "waive" ? "FREE WAIVER" : "REGULAR CYCLE",
      nextEmiTitle: "Kist #2 Due Date",
      nextEmiDate: addDays(now, cycleDays * 2),
      finalMaturityDate: addDays(now, cycleDays * count),
      remainingCount: chosenOpt === "waive" ? Math.max(0, count - 1) : count,
      paidCount: chosenOpt === "waive" ? 1 : 0,
      graceNote: chosenOpt === "waive" ? "Kist #1 borrower ke liye waive kar di gayi hai." : `Regular schedule: Pehli kist ${cycleDays} din baad regular cycle par due hogi.`
    };
  }

  // Full Schedule of all installments (e.g. 24 or 25) with dynamic rollover and 10:00 AM cutoff
  let fullSchedule = [];
  if (Array.isArray(loan.emiSchedule) && loan.emiSchedule.length > 0) {
    fullSchedule = loan.emiSchedule.map((item, idx) => {
      const isPaid = item.status === "paid";
      const isOverdue = item.status === "overdue";
      const dueObj = item.dueDate ? new Date(item.dueDate) : null;
      return {
        installmentNo: item.installmentNo || idx + 1,
        dueDateFormatted: dueObj ? dueObj.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" }) : `Kist #${idx + 1}`,
        status: item.status || "pending",
        isPaid,
        isOverdue,
        amount: item.amount || instAmt,
        cutoffTime: item.cutoffTime || "10:00 AM",
        overdueNotice: item.overdueNotice || null
      };
    });
  } else {
    const isDaily = cycleDays === 1;
    let dates = [];
    if (isDaily) {
      let cur = new Date(now);
      for (let i = 0; i < count; i++) {
        cur.setDate(cur.getDate() + 1);
        dates.push(new Date(cur));
      }
    } else {
      let cur = new Date(now);
      if (chosenOpt === "defer") {
        cur.setDate(cur.getDate() + 10);
      }
      while (dates.length < count) {
        cur.setDate(cur.getDate() + 1);
        const day = cur.getDate();
        if (day === 1 || day === 11 || day === 21) {
          dates.push(new Date(cur));
        }
      }
    }

    fullSchedule = dates.map((d, idx) => {
      const isFirst = idx === 0;
      let status = "pending";
      let statusLabel = "Due on Date";
      if (isFirst && chosenOpt === "deduct") {
        status = "paid";
        statusLabel = "Paid (Advance Deduct)";
      } else if (isFirst && chosenOpt === "waive") {
        status = "paid";
        statusLabel = "Waived (Free)";
      }
      return {
        installmentNo: idx + 1,
        dueDateFormatted: (isFirst && (chosenOpt === "deduct" || chosenOpt === "waive"))
          ? (chosenOpt === "deduct" ? "Aaj hi Paid (Advance Kaati)" : "Aaj hi Free Waived")
          : d.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" }),
        status,
        statusLabel,
        isPaid: status === "paid",
        isOverdue: false,
        amount: instAmt,
        cutoffTime: "10:00 AM"
      };
    });
  }

  // Dynamic rollover calculation across all installments
  let accumulatedMissed = 0;
  let accumulatedPenalty = 0;
  fullSchedule = fullSchedule.map((row) => {
    if (row.isOverdue) {
      accumulatedMissed += row.amount;
      accumulatedPenalty += penaltyPerEmi;
      return {
        ...row,
        rolledOverToNext: true,
        payableNow: row.amount + penaltyPerEmi,
        rolloverText: `Chhooti hui: ₹${row.amount} + 2% Penalty: ₹${penaltyPerEmi}`
      };
    } else if (row.status === "pending" && accumulatedMissed > 0) {
      const totalPayableThisKist = row.amount + accumulatedMissed + accumulatedPenalty;
      const text = `Pichli chhooti kist jodkar: ₹${row.amount} + ₹${accumulatedMissed} (Missed) + ₹${accumulatedPenalty} (2% Penalty)`;
      accumulatedMissed = 0;
      accumulatedPenalty = 0;
      return {
        ...row,
        hasRollover: true,
        payableNow: totalPayableThisKist,
        rolloverText: text
      };
    }
    return {
      ...row,
      payableNow: row.amount
    };
  });

  return {
    principal,
    count,
    instAmt,
    totalPayable,
    feeDeduction,
    feePct,
    totalInterest,
    interestPct,
    totalRepayPct,
    cycleDays,
    cycleLabel,
    penaltyPerEmi,
    basePayout,
    advancePayout,
    inHandAmount,
    inHandPct,
    advanceDeductPct,
    schedule,
    fullSchedule
  };
}

// Component: Live selected disbursal breakdown, timeline and penalty terms
function DisbursalBreakdownDesk({ loan, chosenOpt = "none" }) {
  const b = getDisbursalBreakdown(loan, chosenOpt);
  if (!b) return null;

  return (
    <div className="bg-slate-50 border border-slate-200/90 rounded-2xl p-3 sm:p-4 space-y-3.5 shadow-2xs">
      {/* Top Banner */}
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200/70 pb-2.5">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-base sm:text-lg"></span>
          <span className="text-xs sm:text-sm font-black text-slate-900">
            Selected Option Live Schedule & Calculations:
          </span>
          <span className={`px-2.5 py-0.5 rounded-full text-[11px] font-black border shadow-2xs ${
            chosenOpt === "none"
              ? "bg-blue-100 text-blue-900 border-blue-300"
              : chosenOpt === "deduct"
              ? "bg-amber-100 text-amber-950 border-amber-300"
              : chosenOpt === "defer"
              ? "bg-sky-100 text-sky-950 border-sky-300"
              : "bg-purple-100 text-purple-950 border-purple-300"
          }`}>
            {b.schedule.title}
          </span>
        </div>
        <span className="text-[11px] font-bold text-slate-600 bg-white px-2 py-0.5 rounded-md border border-slate-200">
          Frequency: <strong className="text-slate-900">{b.cycleLabel}</strong>
        </span>
      </div>

      {/* 1. EMI Dates & Timeline */}
      <div>
        <div className="flex items-center justify-between mb-1.5">
          <span className="text-xs font-black text-slate-800 flex items-center gap-1.5">
             EMI Dates & Timeline ({b.count} Kistein @ ₹{b.instAmt.toLocaleString("en-IN")})
          </span>
          <span className="text-[11px] font-bold text-emerald-700">
            {b.schedule.paidCount > 0 ? "1 Paid (Advance) • " : ""}{b.schedule.remainingCount} Kistein Due
          </span>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 text-xs">
          <div className="p-2.5 bg-white border border-slate-200 rounded-xl shadow-2xs">
            <span className="text-[10px] font-bold text-slate-400 block uppercase tracking-wider">{b.schedule.firstEmiTitle}</span>
            <span className="font-black text-slate-900 text-xs sm:text-sm block mt-0.5">{b.schedule.firstEmiDate}</span>
            <span className="text-[10px] font-bold text-blue-700 block mt-0.5">{b.schedule.firstEmiDetail}</span>
          </div>
          <div className="p-2.5 bg-white border border-slate-200 rounded-xl shadow-2xs">
            <span className="text-[10px] font-bold text-slate-400 block uppercase tracking-wider">{b.schedule.nextEmiTitle}</span>
            <span className="font-black text-slate-900 text-xs sm:text-sm block mt-0.5">{b.schedule.nextEmiDate}</span>
            <span className="text-[10px] text-slate-500 font-medium block mt-0.5">₹{b.instAmt.toLocaleString("en-IN")} Due</span>
          </div>
          <div className="p-2.5 bg-white border border-slate-200 rounded-xl shadow-2xs">
            <span className="text-[10px] font-bold text-slate-400 block uppercase tracking-wider">Final Loan Maturity</span>
            <span className="font-black text-slate-900 text-xs sm:text-sm block mt-0.5">{b.schedule.finalMaturityDate}</span>
            <span className="text-[10px] text-slate-500 font-medium block mt-0.5">All {b.count} EMIs Completed</span>
          </div>
        </div>
        <p className="text-[11px] text-slate-600 mt-1.5 font-medium flex items-center gap-1">
          <span>ℹ️</span> {b.schedule.graceNote}
        </p>

        {/* Complete Kist Schedule Table / List View */}
        <details className="mt-2.5 group border border-slate-200/90 rounded-xl bg-white overflow-hidden shadow-2xs" open>
          <summary className="flex items-center justify-between p-2.5 sm:p-3 font-black text-xs text-slate-800 cursor-pointer bg-slate-100/70 hover:bg-slate-100 transition select-none">
            <span className="flex items-center gap-1.5">
               Poori Kist List ({b.count} Kistein Schedule & 10:00 AM Cutoff)
            </span>
            <span className="text-[11px] font-bold text-blue-700 bg-blue-50 px-2 py-0.5 rounded-full border border-blue-200 flex items-center gap-1">
              <span>Timeline Dekhein</span>
              <span className="group-open:rotate-180 transition-transform">▼</span>
            </span>
          </summary>
          <div className="p-2 sm:p-3 max-h-60 overflow-y-auto space-y-1.5 divide-y divide-slate-100">
            {b.fullSchedule.map((k) => (
              <div
                key={k.installmentNo}
                className={`pt-1.5 first:pt-0 flex flex-wrap items-center justify-between gap-2 text-xs ${
                  k.isOverdue
                    ? "bg-rose-50/70 p-2 rounded-lg border border-rose-200"
                    : k.hasRollover
                    ? "bg-amber-50/70 p-2 rounded-lg border border-amber-200"
                    : k.isPaid
                    ? "bg-emerald-50/40 p-2 rounded-lg border border-emerald-100"
                    : "p-1.5"
                }`}
              >
                <div className="flex items-center gap-2">
                  <span className={`w-7 h-7 rounded-lg flex items-center justify-center font-black text-[11px] shrink-0 ${
                    k.isPaid ? "bg-emerald-100 text-emerald-800" : k.isOverdue ? "bg-rose-100 text-rose-800" : "bg-slate-100 text-slate-700"
                  }`}>
                    #{k.installmentNo}
                  </span>
                  <div>
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <span className="font-extrabold text-slate-900">Kist #{k.installmentNo}</span>
                      <span className="text-[11px] text-slate-500 font-medium">• {k.dueDateFormatted}</span>
                      <span className="text-[10px] font-bold bg-slate-100 text-slate-600 px-1.5 py-0.2 rounded border border-slate-200">
                        ⏰ Cutoff: {k.cutoffTime}
                      </span>
                    </div>
                    {k.rolloverText && (
                      <span className={`text-[10px] font-bold block mt-0.5 ${k.isOverdue ? "text-rose-700" : "text-amber-800"}`}>
                        {k.rolloverText}
                      </span>
                    )}
                  </div>
                </div>

                <div className="text-right">
                  <div className="flex items-center gap-1.5 justify-end">
                    <span className="font-black text-slate-900 font-mono">
                      ₹{(k.payableNow || k.amount).toLocaleString("en-IN")}
                    </span>
                    <span className={`text-[10px] font-black px-2 py-0.5 rounded-full border ${
                      k.isPaid
                        ? "bg-emerald-100 text-emerald-800 border-emerald-300"
                        : k.isOverdue
                        ? "bg-rose-100 text-rose-800 border-rose-300"
                        : k.hasRollover
                        ? "bg-amber-100 text-amber-900 border-amber-300"
                        : "bg-slate-100 text-slate-700 border-slate-200"
                    }`}>
                      {k.statusLabel || (k.isPaid ? "PAID" : k.isOverdue ? "OVERDUE (CHHOOTI HUI)" : k.hasRollover ? "ROLLOVER DUE" : "PENDING")}
                    </span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </details>
      </div>

      {/* 2. Percentage & Deductions Matrix */}
      <div className="border-t border-slate-200/70 pt-2.5">
        <span className="text-xs font-black text-slate-800 block mb-1.5 flex items-center gap-1.5">
           Kitna Percent Lag Raha Hai (Exact Percentage & Amount Breakdown)
        </span>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
          <div className="p-2.5 bg-white border border-slate-200 rounded-xl shadow-2xs">
            <span className="text-[10px] text-slate-400 block font-bold">Principal Sanctioned</span>
            <span className="font-black text-slate-900 text-xs sm:text-sm font-mono">₹{b.principal.toLocaleString("en-IN")}</span>
            <span className="text-[10px] font-bold text-slate-500 block">100.0% (Mool Rashi)</span>
          </div>
          <div className="p-2.5 bg-amber-50/70 border border-amber-200 rounded-xl shadow-2xs">
            <span className="text-[10px] text-amber-800 block font-bold">Processing + Fee</span>
            <span className="font-black text-amber-900 text-xs sm:text-sm font-mono">-₹{b.feeDeduction.toLocaleString("en-IN")}</span>
            <span className="text-[10px] font-extrabold text-amber-700 block">{b.feePct}% Deducted</span>
          </div>
          <div className="p-2.5 bg-emerald-50 border border-emerald-200 rounded-xl shadow-2xs">
            <span className="text-[10px] text-emerald-800 block font-bold">Net In-Hand Disbursal</span>
            <span className="font-black text-emerald-800 text-xs sm:text-sm font-mono">₹{b.inHandAmount.toLocaleString("en-IN")}</span>
            <span className="text-[10px] font-extrabold text-emerald-700 block">{b.inHandPct}% Borrower ko Payout</span>
          </div>
          <div className="p-2.5 bg-blue-50 border border-blue-200 rounded-xl shadow-2xs">
            <span className="text-[10px] text-blue-800 block font-bold">Total Interest</span>
            <span className="font-black text-blue-900 text-xs sm:text-sm font-mono">+₹{b.totalInterest.toLocaleString("en-IN")}</span>
            <span className="text-[10px] font-extrabold text-blue-700 block">+{b.interestPct}% ({b.totalRepayPct}% Total Repay)</span>
          </div>
        </div>
        {chosenOpt === "deduct" && (
          <div className="mt-2 px-3 py-1.5 bg-amber-100/70 border border-amber-300 rounded-lg text-[11px] text-amber-950 font-semibold flex items-center justify-between">
            <span>Kist #1 Advance Kaati Gayi: <strong>₹{b.instAmt.toLocaleString("en-IN")} ({b.advanceDeductPct}%)</strong></span>
            <span className="text-[10px] font-bold text-emerald-800 bg-white px-2 py-0.5 rounded border border-amber-200">Kist #1 Abhi Paid Ho Jayegi</span>
          </div>
        )}
      </div>

      {/* 3. Penalty Policy & Live Overdue Display */}
      <div className="border-t border-slate-200/70 pt-2.5 bg-rose-50/70 p-3 rounded-xl border border-rose-200">
        <div className="flex flex-wrap items-center justify-between gap-1.5 mb-1.5">
          <span className="text-xs font-black text-rose-950 flex items-center gap-1.5">
             Overdue Penalty Policy (Kab Aur Kise Lagegi):
          </span>
          <span className="text-[10px] font-black bg-rose-200 text-rose-950 px-2 py-0.5 rounded-full border border-rose-300">
            2% Per Overdue Kist = ₹{b.penaltyPerEmi}/kist
          </span>
        </div>
        <details className="mt-1 text-[11px] text-slate-700 bg-white p-2.5 rounded-lg border border-rose-200 select-none">
          <summary className="font-bold text-rose-900 cursor-pointer flex items-center justify-between">
            <span>ℹ️ Overdue & Rollover Niyam (Click to View)</span>
            <span className="text-[10px] text-slate-400">▼ Niyam</span>
          </summary>
          <div className="space-y-1 pt-1.5 mt-1 border-t border-slate-100 font-medium">
            <p>
              • <strong className="text-slate-900">Kab Lagegi:</strong> Kist due date ko subah <strong>10:00 AM cutoff</strong> nikalne ke baad overdue status active hota hai.
            </p>
            <p>
              • <strong className="text-slate-900">Kitni Lagegi:</strong> Installment amount (₹{b.instAmt.toLocaleString("en-IN")}) par <strong>2%</strong> = <strong className="text-rose-800">₹{b.penaltyPerEmi} per overdue installment</strong>.
            </p>
            <p>
              • <strong className="text-slate-900">Rollover:</strong> Agar koi kist chhoote to agle kist me jud jayegi (Missed EMI + Current EMI + 2% Penalty).
            </p>
            <p>
              • <strong className="text-slate-900">Live Kist List:</strong> Upar poori kist list me live rollover calculation dikhta hai.
            </p>
          </div>
        </details>
        {/* Live Preview Badge */}
        <div className="mt-2 p-2.5 bg-white rounded-lg border border-rose-200 flex flex-wrap items-center justify-between gap-2 shadow-2xs">
          <div className="flex items-center gap-2">
            <span className="text-xs font-black px-2.5 py-0.5 rounded-full bg-rose-100 text-rose-800 border border-rose-300">
              Active Overdue Penalty: ₹{b.penaltyPerEmi}
            </span>
            <span className="text-[10px] text-slate-500 font-bold">
              (1 Overdue Installment Par)
            </span>
          </div>
          <div className="flex items-center gap-1.5 text-[10px]">
            <span className="bg-amber-100 text-amber-900 px-2 py-0.5 rounded font-bold border border-amber-200">
              Admin Waive / Hold Button Available
            </span>
            <span className="text-slate-400 font-medium">Borrower passbook me bhi penalty include hoti hai</span>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function AdminPanel() {
  const navigate = useNavigate();
  const token = tokenStorage.getToken();
  let user = {};
  try {
    user = JSON.parse(localStorage.getItem("user") || "{}") || {};
  } catch {}
  useEffect(() => { if (!token || user?.role !== "admin") window.location.href = "/"; }, []); // eslint-disable-line

  const headers = useMemo(() => {
    const curToken = tokenStorage.getToken() || localStorage.getItem("token") || "";
    return {
      "Content-Type": "application/json",
      Authorization: `Bearer ${curToken}`,
      "Cache-Control": "no-cache",
      Pragma: "no-cache"
    };
  }, [token]);
  const [adminCountdown, setAdminCountdown] = useState(30);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [tab, setTab] = useState("analytics");
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [historyFilterOpen, setHistoryFilterOpen] = useState(false);
  const switchTab = useCallback((nextTab) => {
    if (nextTab === "loan-settings") {
      navigate("/admin/loan-settings");
      return;
    }
    setMobileNavOpen(false);
    setHistoryFilterOpen(false);
    if (tab !== nextTab) {
      setTab(nextTab);
    }
  }, [tab, navigate]);

  const unwrapCachedArray = (val) => {
    if (!val) return [];
    if (Array.isArray(val)) return val;
    if (typeof val === "object" && Array.isArray(val.data)) return val.data;
    if (typeof val === "string") {
      try {
        const p = JSON.parse(val);
        if (Array.isArray(p)) return p;
        if (p && typeof p === "object" && Array.isArray(p.data)) return p.data;
      } catch {}
    }
    return [];
  };

  const [stats, setStats] = useState(() => {
    const cached = appCache.get("educa_admin_cached_stats", null);
    if (cached && typeof cached === "object" && !cached.message) {
      return cached;
    }
    const raw = typeof localStorage !== "undefined" ? localStorage.getItem("educa_admin_cached_stats") : null;
    if (raw) {
      try {
        let p = JSON.parse(raw);
        if (p && typeof p === "object" && "data" in p) p = p.data;
        if (p && typeof p === "object" && !p.message) return p;
      } catch {}
    }
    return null;
  });
  const [loadingStats, setLoadingStats] = useState(() => !appCache.has("educa_admin_cached_stats"));
  const [rateLimitError, setRateLimitError] = useState(null);
  const [isRetrying, setIsRetrying] = useState(false);
  const [expandedYieldDays, setExpandedYieldDays] = useState({});
  const [assignAgentModalUser, setAssignAgentModalUser] = useState(null);
  const [assigningAgent, setAssigningAgent] = useState(false);
  const [selectedAgentForAssign, setSelectedAgentForAssign] = useState("");
  // Admin User Password Reset Modal State
  const [resetPasswordModalUser, setResetPasswordModalUser] = useState(null);
  const [resetPasswordInput, setResetPasswordInput] = useState("");
  const [resetPasswordMustChange, setResetPasswordMustChange] = useState(true);
  const [resetPasswordSyncEduca, setResetPasswordSyncEduca] = useState(true);
  const [resetPasswordLoading, setResetPasswordLoading] = useState(false);
  const [resetPasswordSuccessData, setResetPasswordSuccessData] = useState(null);
  // Admin User Desk Role Assignment Modal State
  const [assignStaffModalUser, setAssignStaffModalUser] = useState(null);
  const [assignStaffDepts, setAssignStaffDepts] = useState(["loan"]);
  const [assignStaffLoading, setAssignStaffLoading] = useState(false);
  // Dual Universal Filters for Issue Loan Desk
  const [issueHierarchyFilter, setIssueHierarchyFilter] = useState("all");
  const [issueSelectedAgentFilter, setIssueSelectedAgentFilter] = useState("all");
  const [issueTimeFilter, setIssueTimeFilter] = useState("all");
  const [pending, setPending] = useState(() => {
    const v = unwrapCachedArray(appCache.get("educa_admin_cached_pending_list", null));
    if (v.length > 0) return v;
    const old = unwrapCachedArray(appCache.get("educa_admin_cached_pending", null));
    if (old.length > 0) return old;
    const raw = typeof localStorage !== "undefined" ? localStorage.getItem("educa_admin_cached_pending_list") : null;
    return unwrapCachedArray(raw);
  });
  const [pendingSubTab, setPendingSubTab] = useState("active"); // "active" | "loans" | "bonds" | "hold" | "approved"
  const [approvedRequests, setApprovedRequests] = useState(() => {
    const v = unwrapCachedArray(appCache.get("educa_admin_cached_approved_requests", null));
    if (v.length > 0) return v;
    const raw = typeof localStorage !== "undefined" ? localStorage.getItem("educa_admin_cached_approved_requests") : null;
    return unwrapCachedArray(raw);
  });
  const [approvedLoading, setApprovedLoading] = useState(false);
  const [approvedFilter, setApprovedFilter] = useState("all");
  const [approvedSearch, setApprovedSearch] = useState("");
  const [holdData, setHoldData] = useState(() => appCache.get("educa_admin_cached_hold", { holdCount: 0, groups: [] }));
  const [loadingHold, setLoadingHold] = useState(false);
  const [agents, setAgents] = useState(() => {
    const v = unwrapCachedArray(appCache.get("educa_admin_cached_agents_list", null));
    if (v.length > 0) return v;
    const old = unwrapCachedArray(appCache.get("educa_admin_cached_agents", null));
    if (old.length > 0) return old;
    const raw = typeof localStorage !== "undefined" ? localStorage.getItem("educa_admin_cached_agents_list") : null;
    return unwrapCachedArray(raw);
  });
  const [agentCommissionInput, setAgentCommissionInput] = useState({});
  const [agentCategoryInputs, setAgentCategoryInputs] = useState({});
  const [savingAgentCommission, setSavingAgentCommission] = useState({});
  const [users, setUsers] = useState(() => {
    const v = unwrapCachedArray(appCache.get("educa_admin_cached_users_list", null));
    if (v.length > 0) return v;
    const old = unwrapCachedArray(appCache.get("educa_admin_cached_users", null));
    if (old.length > 0) return old;
    const raw = typeof localStorage !== "undefined" ? localStorage.getItem("educa_admin_cached_users_list") : null;
    return unwrapCachedArray(raw);
  });
  const [devices, setDevices] = useState(() => {
    const v = unwrapCachedArray(appCache.get("educa_admin_cached_devices_list", null));
    if (v.length > 0) return v;
    const old = unwrapCachedArray(appCache.get("educa_admin_cached_devices", null));
    if (old.length > 0) return old;
    const raw = typeof localStorage !== "undefined" ? localStorage.getItem("educa_admin_cached_devices_list") : null;
    return unwrapCachedArray(raw);
  });
  const [loans, setLoans] = useState(() => {
    const v = unwrapCachedArray(appCache.get("educa_admin_cached_loans_list", null));
    if (v.length > 0) return v;
    const old = unwrapCachedArray(appCache.get("educa_admin_cached_loans", null));
    if (old.length > 0) return old;
    const raw = typeof localStorage !== "undefined" ? localStorage.getItem("educa_admin_cached_loans_list") : null;
    return unwrapCachedArray(raw);
  });
  const [bonds, setBonds] = useState(() => {
    const v = unwrapCachedArray(appCache.get("educa_admin_cached_bonds_list", null));
    if (v.length > 0) return v;
    const old = unwrapCachedArray(appCache.get("educa_admin_cached_bonds", null));
    if (old.length > 0) return old;
    const raw = typeof localStorage !== "undefined" ? localStorage.getItem("educa_admin_cached_bonds_list") : null;
    return unwrapCachedArray(raw);
  });
  const pendingLoans = useMemo(() => (Array.isArray(loans) ? loans.filter(l => l.status === "pending") : []), [loans]);
  const activeLoansCount = useMemo(() => (Array.isArray(loans) ? loans.filter(l => l.status === "active").length : 0), [loans]);
  const pendingBonds = useMemo(() => (Array.isArray(bonds) ? bonds.filter(b => b.status === "pending") : []), [bonds]);
  const totalPendingDeskCount = (pending?.length || 0) + pendingLoans.length + pendingBonds.length;
  const [notifications, setNotifications] = useState(() => {
    const v = unwrapCachedArray(appCache.get("educa_admin_cached_notifications_list", null));
    if (v.length > 0) return v;
    const old = unwrapCachedArray(appCache.get("educa_admin_cached_notifications", null));
    if (old.length > 0) return old;
    const raw = typeof localStorage !== "undefined" ? localStorage.getItem("educa_admin_cached_notifications_list") : null;
    return unwrapCachedArray(raw);
  });
  const [unreadNotifs, setUnreadNotifs] = useState(0);
  const [toast, setToast] = useState({ text: "", type: "" });
  const [interestRate, setInterestRate] = useState(12);
  const [newInterestRate, setNewInterestRate] = useState("");
  const [commissionRate, setCommissionRate] = useState(2);
  const [newCommissionRate, setNewCommissionRate] = useState("");
  const [googleDriveUrl, setGoogleDriveUrl] = useState("");
  const [newGoogleDriveUrl, setNewGoogleDriveUrl] = useState("");
  const [r2Config, setR2Config] = useState({
    accountId: "",
    accessKeyId: "",
    secretAccessKey: "",
    bucketName: "",
    publicUrl: "",
    isConfigured: false,
    source: "none"
  });
  const [r2Testing, setR2Testing] = useState(false);
  const [r2Saving, setR2Saving] = useState(false);
  const [analytics, setAnalytics] = useState(() => {
    const cached = appCache.get("educa_admin_cached_analytics", null);
    if (cached && typeof cached === "object" && cached.stats) {
      return cached;
    }
    const raw = typeof localStorage !== "undefined" ? localStorage.getItem("educa_admin_cached_analytics") : null;
    if (raw) {
      try {
        const parsed = JSON.parse(raw);
        if (parsed && parsed.stats) return parsed;
      } catch {}
    }
    return DEFAULT_ANALYTICS;
  });
  const [loadingAnalytics, setLoadingAnalytics] = useState(false);
  const [chartMode, setChartMode] = useState("daily"); // "daily" | "cumulative"
  const [chartRange, setChartRange] = useState("today"); // "today" | "5d" | "7d" | "15d" | "all" (Default: Today as requested)
  const visibleLedgerData = useMemo(() => {
    const list = analytics?.dailyProfitChart || [];
    if (chartRange === "today") return list.slice(-1);
    if (chartRange === "5d") return list.slice(-5);
    if (chartRange === "7d") return list.slice(-7);
    if (chartRange === "15d") return list.slice(-15);
    return list;
  }, [analytics?.dailyProfitChart, chartRange]);
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
  const [premiumSettings, setPremiumSettings] = useState(() => appCache.get("educa_admin_premium_settings", {
    commissionAmount: 30,
    balanceThreshold: 5000,
    holdDays: 30,
    premiumInterestRate: 10,
    normalInterestRate: 12,
    offers: "Instant ₹10,000 Loan Access & 10% Special Interest Rate"
  }));
  const [savingPremiumSettings, setSavingPremiumSettings] = useState(false);
  const [premiumSettingsSuccess, setPremiumSettingsSuccess] = useState("");

  // Paginated Agents State (Rule 5: 10-20 per page)
  const [agentDirectoryMode, setAgentDirectoryMode] = useState("paginated"); // "paginated" | "applications"
  const [paginatedAgents, setPaginatedAgents] = useState([]);
  const [paginatedAgentsTotal, setPaginatedAgentsTotal] = useState(0);
  const [paginatedAgentsPage, setPaginatedAgentsPage] = useState(1);
  const [paginatedAgentsLimit] = useState(15);
  const [paginatedAgentsTotalPages, setPaginatedAgentsTotalPages] = useState(1);
  const [paginatedAgentsSearch, setPaginatedAgentsSearch] = useState("");
  const [loadingPaginatedAgents, setLoadingPaginatedAgents] = useState(false);
  const [approveTxnModal, setApproveTxnModal] = useState(null);
  const [adminUtrInput, setAdminUtrInput] = useState("");
  const [adminEvidenceInput, setAdminEvidenceInput] = useState("");
  const [adminEvidenceName, setAdminEvidenceName] = useState("");
  const [adminNoteInput, setAdminNoteInput] = useState("");
  const [isApprovingTxn, setIsApprovingTxn] = useState(false);
  const [rejectTxnModal, setRejectTxnModal] = useState(null);
  const [rejectReasonInput, setRejectReasonInput] = useState("");
  const [isRejectingTxn, setIsRejectingTxn] = useState(false);
  const [previewKycUser, setPreviewKycUser] = useState(null);
  const [kycReviewRemarks, setKycReviewRemarks] = useState("");
  const [kycFilter, setKycFilter] = useState("all");
  const [kycTimeFilter, setKycTimeFilter] = useState("all"); // 'all' | 'today' | '7days' | '30days'
  const [selectedKycIds, setSelectedKycIds] = useState(new Set());
  const [liveKycSeconds, setLiveKycSeconds] = useState(0);

  // Live 1-second ticking clock when on KYC view
  useEffect(() => {
    if (tab !== "kyc") return;
    const ticker = setInterval(() => {
      setLiveKycSeconds(s => (s + 1) % 1000000);
    }, 1000);
    return () => clearInterval(ticker);
  }, [tab]);

  // On-demand unified batch fetch for KYC preview modal documents (single fast roundtrip)
  const [loadingKycDocs, setLoadingKycDocs] = useState(false);
  useEffect(() => {
    if (!previewKycUser?._id) return;
    const uid = previewKycUser._id;

    // 1. Instant 0ms populate from memory cache if available
    const c1 = kycDocMemoryCache.get(`${uid}_doc1`);
    const c1b = kycDocMemoryCache.get(`${uid}_doc1Back`);
    const c2 = kycDocMemoryCache.get(`${uid}_doc2`);
    const c2b = kycDocMemoryCache.get(`${uid}_doc2Back`);
    if (c1 || c1b || c2 || c2b) {
      setPreviewKycUser(prev => (prev && prev._id === uid ? {
        ...prev,
        kycDocuments: {
          ...prev.kycDocuments,
          ...(c1 ? { doc1Url: c1 } : {}),
          ...(c1b ? { doc1BackUrl: c1b } : {}),
          ...(c2 ? { doc2Url: c2 } : {}),
          ...(c2b ? { doc2BackUrl: c2b } : {})
        }
      } : prev));
    }

    setLoadingKycDocs(true);
    // 2. Fetch all 4 docs from server in a single unified lightweight call
    const authToken = tokenStorage.getToken() || localStorage.getItem("token") || "";
    fetch(`${API}/admin/kyc-docs/${uid}`, {
      headers: {
        Authorization: `Bearer ${authToken}`,
        "Cache-Control": "no-cache",
        Pragma: "no-cache"
      }
    })
      .then(r => r.json())
      .then(d => {
        if (d && d.success) {
          if (d.doc1Url) kycDocMemoryCache.set(`${uid}_doc1`, d.doc1Url);
          if (d.doc1BackUrl) kycDocMemoryCache.set(`${uid}_doc1Back`, d.doc1BackUrl);
          if (d.doc2Url) kycDocMemoryCache.set(`${uid}_doc2`, d.doc2Url);
          if (d.doc2BackUrl) kycDocMemoryCache.set(`${uid}_doc2Back`, d.doc2BackUrl);

          setPreviewKycUser(prev => (prev && prev._id === uid ? {
            ...prev,
            kycDocuments: {
              ...prev.kycDocuments,
              doc1Url: d.doc1Url || "",
              doc1BackUrl: d.doc1BackUrl || "",
              doc2Url: d.doc2Url || "",
              doc2BackUrl: d.doc2BackUrl || "",
              doc2Type: d.doc2Type || prev.kycDocuments?.doc2Type
            }
          } : prev));
        }
      })
      .catch((err) => {
        console.warn("KYC documents fetch error:", err);
      })
      .finally(() => {
        setLoadingKycDocs(false);
      });
  }, [previewKycUser?._id]); // eslint-disable-line

  const allKycUsers = useMemo(() => {
    if (!Array.isArray(users)) return [];
    return users.filter(u => u.kycStatus && u.kycStatus !== "none");
  }, [users]);
  const verifiedKycCount = useMemo(() => allKycUsers.filter(u => u.kycStatus === "verified").length, [allKycUsers]);
  const rejectedKycCount = useMemo(() => allKycUsers.filter(u => u.kycStatus === "rejected").length, [allKycUsers]);
  const pendingBankChangeUsers = useMemo(() => {
    if (!Array.isArray(users)) return [];
    return users.filter(u => u.bankChangeRequest && u.bankChangeRequest.status === "pending");
  }, [users]);
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
      if (kycFilter === "bank_change") {
        return u.bankChangeRequest && u.bankChangeRequest.status === "pending";
      }
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
      showToast("APY Editor locked!", "info");
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
      showToast("APY Editor Unlocked! Ab aap custom interest rate edit kar sakte hain.", "success");
    } else {
      showToast(`APY Editor Locked: ${5 - count} baar aur tap karein unlock karne ke liye.`, "info");
    }
  };

  const [expandedLoanId, setExpandedLoanId] = useState(null);
  const [adminPayModal, setAdminPayModal] = useState(null);
  const [adminPayLoading, setAdminPayLoading] = useState(false);
  const [loanApproveModal, setLoanApproveModal] = useState(null);
  const [advanceOption, setAdvanceOption] = useState("none"); // "none" | "deduct" | "waive"
  const [cardAdvanceOptions, setCardAdvanceOptions] = useState({}); // Per-loan card 1st installment option
  const [loanApproveLoading, setLoanApproveLoading] = useState(false);
  const [approveFirstDueDate, setApproveFirstDueDate] = useState("");
  const [approveDisburseToWallet, setApproveDisburseToWallet] = useState(true);
  const [backupLoading, setBackupLoading] = useState(false);
  const [backupHistory, setBackupHistory] = useState(() => {
    try {
      const saved = typeof localStorage !== "undefined" ? localStorage.getItem("educa_admin_backup_history") : null;
      const parsed = saved ? JSON.parse(saved) : [];
      if (Array.isArray(parsed)) {
        return parsed.map(b => {
          if (b.summary && b.summary.usersCount > 20) {
            return { ...b, summary: { ...b.summary, usersCount: 20 } };
          }
          return b;
        });
      }
      return [];
    } catch {
      return [];
    }
  });
  const [capitalMetrics, setCapitalMetrics] = useState(() => appCache.get("educa_admin_cached_capital_metrics", null));
  const [capitalLoading, setCapitalLoading] = useState(false);
  const [loanDepartmentPool, setLoanDepartmentPool] = useState(() => {
    return appCache.get("educa_admin_cached_loan_pool") || {
      totalPool: 1000000,
      marketDisbursed: 0,
      availablePool: 1000000,
      activeLoansCount: 0,
      utilizationPercent: 0
    };
  });
  const [capitalSubCategory, setCapitalSubCategory] = useState("loans"); // "loans" | "investments" | "cashout" | "deposits" | "profit"
  const [capitalSearch, setCapitalSearch] = useState("");
  const debouncedCapitalSearch = useDebounce(capitalSearch, 200);
  const [capitalTimeFilter, setCapitalTimeFilter] = useState("today"); // "today" | "all" | "7days" | "month" (Default: Today as requested)
  const [rejectLoadingId, setRejectLoadingId] = useState(null);
  const [bondActionLoadingId, setBondActionLoadingId] = useState(null);
  const [installmentActionLoadingId, setInstallmentActionLoadingId] = useState(null);

  // Issue Loan Desk Form State
  const [issuePaidInstallmentsCount, setIssuePaidInstallmentsCount] = useState(0);
  const [issueFirstPendingDueDate, setIssueFirstPendingDueDate] = useState("");
  const [issueDisburseToWallet, setIssueDisburseToWallet] = useState(false);
  const [issueCustomInstallmentAmount, setIssueCustomInstallmentAmount] = useState("");
  const [issueBackfillEvidenceUrl, setIssueBackfillEvidenceUrl] = useState("");
  const [issueBackfillEvidenceName, setIssueBackfillEvidenceName] = useState("");
  const [issueBackfillInstallments, setIssueBackfillInstallments] = useState([]);
  const [showAllInstallmentsCollapse, setShowAllInstallmentsCollapse] = useState(false);

  const getNextCycleDate = (base = new Date()) => {
    const d = new Date(base);
    d.setDate(d.getDate() + 1);
    while (!(d.getDate() === 1 || d.getDate() === 11 || d.getDate() === 21)) {
      d.setDate(d.getDate() + 1);
    }
    return d.toISOString().split("T")[0];
  };

  const updateBackfillCount = (newCount, defaultAmt = 0) => {
    const val = Math.max(0, parseInt(newCount) || 0);
    setIssuePaidInstallmentsCount(val);
    if (val > 0 && !issueFirstPendingDueDate) {
      setIssueFirstPendingDueDate(getNextCycleDate());
    }
    setIssueBackfillInstallments(prev => {
      const arr = [...prev];
      if (arr.length < val) {
        for (let i = arr.length; i < val; i++) {
          arr.push({
            installmentNo: i + 1,
            amount: issueCustomInstallmentAmount ? Number(issueCustomInstallmentAmount) : defaultAmt,
            paidOn: new Date().toISOString().split("T")[0],
            paymentMethod: "cash",
            utrNumber: "",
            evidenceUrl: issueBackfillEvidenceUrl || "",
            note: "Offline paid"
          });
        }
      } else if (arr.length > val) {
        return arr.slice(0, val);
      }
      return arr;
    });
  };

  const addBackfillInstallment = (defaultAmt = 0) => {
    if (!issueFirstPendingDueDate) {
      setIssueFirstPendingDueDate(getNextCycleDate());
    }
    setIssueBackfillInstallments(prev => {
      const nextNo = prev.length + 1;
      setIssuePaidInstallmentsCount(nextNo);
      return [
        ...prev,
        {
          installmentNo: nextNo,
          amount: issueCustomInstallmentAmount ? Number(issueCustomInstallmentAmount) : defaultAmt,
          paidOn: new Date().toISOString().split("T")[0],
          paymentMethod: "cash",
          utrNumber: "",
          evidenceUrl: issueBackfillEvidenceUrl || "",
          note: "Offline paid"
        }
      ];
    });
  };

  const removeBackfillInstallment = (index) => {
    setIssueBackfillInstallments(prev => {
      const nextList = prev.filter((_, i) => i !== index).map((item, i) => ({
        ...item,
        installmentNo: i + 1
      }));
      setIssuePaidInstallmentsCount(nextList.length);
      return nextList;
    });
  };

  const updateBackfillInstallmentField = (index, field, value) => {
    setIssueBackfillInstallments(prev => {
      const copy = [...prev];
      copy[index] = { ...copy[index], [field]: value };
      return copy;
    });
  };

  const handleBackfillEvidenceUpload = (file, index = null) => {
    if (!file) return;
    if (file.type && !file.type.startsWith("image/")) {
      showToast("Kripya photo / image file upload karein", "error");
      return;
    }
    const reader = new FileReader();
    reader.onload = (event) => {
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
        const dataUrl = canvas.toDataURL("image/jpeg", 0.8);
        if (index !== null) {
          updateBackfillInstallmentField(index, "evidenceUrl", dataUrl);
        } else {
          setIssueBackfillEvidenceUrl(dataUrl);
          setIssueBackfillEvidenceName(file.name);
        }
      };
      img.onerror = () => {
        if (index !== null) {
          updateBackfillInstallmentField(index, "evidenceUrl", event.target.result);
        } else {
          setIssueBackfillEvidenceUrl(event.target.result);
          setIssueBackfillEvidenceName(file.name);
        }
      };
      img.src = event.target.result;
    };
    reader.readAsDataURL(file);
  };
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
        setRateLimitError("Server Rate Limit (429): Bahut zyada requests ho gayi hain. Kripya 30 seconds wait karein.");
        return;
      }
      if (!res.ok) return;
      const d = await res.json();
      if (d && typeof d === "object" && !d.message) {
        setStats(d);
        appCache.set("educa_admin_cached_stats", d);
        if (d.netFintechReserve !== undefined) {
          appCache.set("educa_admin_cached_reserves", d.netFintechReserve);
          try { localStorage.setItem("educa_admin_cached_reserves", String(d.netFintechReserve)); } catch {}
        }
        if (d.totalDeposits !== undefined) {
          appCache.set("educa_admin_cached_deposits", d.totalDeposits);
          try { localStorage.setItem("educa_admin_cached_deposits", String(d.totalDeposits)); } catch {}
        }
        if (d.totalYield !== undefined || d.totalUserProfits !== undefined) {
          const y = d.totalUserProfits !== undefined ? d.totalUserProfits : d.totalYield;
          appCache.set("educa_admin_cached_profit", y);
          try { localStorage.setItem("educa_admin_cached_profit", String(y)); } catch {}
        }
        if (d.totalUsers !== undefined) {
          appCache.set("educa_admin_cached_users_count", d.totalUsers);
          try { localStorage.setItem("educa_admin_cached_users_count", String(d.totalUsers)); } catch {}
        }
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
      
      // Load Cloudflare R2 Status & Configuration
      fetch(`${API}/settings/r2`, { headers })
        .then(r => r.json())
        .then(r2 => {
          if (r2 && typeof r2 === 'object') {
            setR2Config(prev => ({
              ...prev,
              accountId: r2.accountId || "",
              bucketName: r2.bucketName || "",
              publicUrl: r2.publicUrl || "",
              isConfigured: Boolean(r2.isConfigured),
              source: r2.source || "none"
            }));
          }
        }).catch(() => {});
    } catch {}
  }, []); // eslint-disable-line

  const loadPending = useCallback(async (force = false) => {
    try {
      const res = await cachedAdminFetch(`${API}/admin/transactions/pending`, { headers }, 2000, force);
      if (res.status === 429) {
        setRateLimitError("Server Rate Limit (429): Bahut zyada requests ho gayi hain. Kripya 30 seconds wait karein.");
        return;
      }
      if (!res.ok) return;
      const d = await res.json();
      if (Array.isArray(d)) {
        setPending(prev => {
          if (!prev || prev.length === 0) return d;
          const prevMap = new Map(prev.map(p => [String(p._id), p]));
          return d.map(p => {
            const old = prevMap.get(String(p._id));
            if (!old) return p;
            return {
              ...old,
              ...p,
              proofUrl: p.proofUrl || old.proofUrl,
              screenshotUrl: p.screenshotUrl || old.screenshotUrl
            };
          });
        });
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
      const res = await cachedAdminFetch(`${API}/admin/transactions/hold`, { headers }, 2000, force);
      if (res.status === 429) {
        setRateLimitError("Server Rate Limit (429): Bahut zyada requests ho gayi hain. Kripya 30 seconds wait karein.");
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

  const loadApprovedRequests = useCallback(async (force = false) => {
    setApprovedLoading(true);
    try {
      const res = await cachedAdminFetch(`${API}/admin/audit-history?status=approved&limit=250`, { headers }, 15000, force);
      if (res.status === 429) return;
      if (!res.ok) return;
      const d = await res.json();
      if (d && Array.isArray(d.history)) {
        setApprovedRequests(d.history);
        try { appCache.set("educa_admin_cached_approved_requests", d.history); } catch {}
      }
    } catch (e) {
      console.warn("Failed to load approved requests:", e);
    } finally {
      setApprovedLoading(false);
    }
  }, [headers]); // eslint-disable-line

  const viewKycDocInLightbox = useCallback(async (item, docKey) => {
    const directUrl = item?.documents?.[docKey];
    if (directUrl && (directUrl.startsWith("http://") || directUrl.startsWith("https://") || directUrl.startsWith("data:"))) {
      setLightboxImg(directUrl);
      setZoomLevel(1);
      return;
    }
    const rawId = (item.id || "").toString().replace("kyc_", "");
    if (!rawId) return;
    try {
      showToast("Loading document image...", "info");
      const res = await fetch(`${API}/admin/kyc-doc/${rawId}/${docKey}`, { headers });
      const d = await res.json();
      if (d && d.url) {
        setLightboxImg(d.url);
        setZoomLevel(1);
      } else {
        showToast("Document image not available", "error");
      }
    } catch {
      showToast("Error loading document", "error");
    }
  }, [headers]); // eslint-disable-line

  const viewProofInLightbox = useCallback(async (item, targetType = "proof") => {
    if (targetType === "qr") {
      const qrDirect = item?.paymentDetails?.qrCodeUrl;
      if (qrDirect) {
        setLightboxImg(qrDirect);
        setZoomLevel(1);
        return;
      }
    }
    if (targetType === "admin_evidence") {
      const adminDirect = item?.adminEvidenceUrl;
      if (adminDirect && (adminDirect.startsWith("http://") || adminDirect.startsWith("https://") || adminDirect.startsWith("data:"))) {
        setLightboxImg(adminDirect);
        setZoomLevel(1);
        return;
      }
    }
    const directUrl = targetType === "admin_evidence" ? item?.adminEvidenceUrl : (item?.proofUrl || item?.screenshotUrl);
    if (directUrl && (directUrl.startsWith("http://") || directUrl.startsWith("https://") || directUrl.startsWith("data:"))) {
      setLightboxImg(directUrl);
      setZoomLevel(1);
      return;
    }
    const rawId = (item.id || item._id || "").toString();
    if (!rawId || rawId.startsWith("kyc_")) return;
    try {
      showToast("Loading image...", "info");
      const res = await fetch(`${API}/admin/txn-proof/${rawId}`, { headers });
      const d = await res.json();
      const targetUrl = targetType === "admin_evidence"
        ? (d.adminEvidenceUrl || d.url)
        : (targetType === "qr" ? d.qrCodeUrl : (d.proofUrl || d.url));
      if (targetUrl) {
        setLightboxImg(targetUrl);
        setZoomLevel(1);
      } else {
        showToast("Image not available", "error");
      }
    } catch {
      showToast("Error loading image", "error");
    }
  }, [headers]); // eslint-disable-line

  const loadUsers = useCallback(async (force = false) => {
    try {
      const res = await cachedAdminFetch(`${API}/admin/users`, { headers }, 8000, force);
      if (res.status === 429) {
        setRateLimitError("Server Rate Limit (429): Bahut zyada requests ho gayi hain. Kripya 30 seconds wait karein.");
        return;
      }
      if (!res.ok) return;
      const d = await res.json();
      if (Array.isArray(d)) {
        const cleanUsers = d.filter(u => u.role !== "admin");
        setUsers(prev => {
          if (!prev || prev.length === 0) return cleanUsers;
          const prevMap = new Map(prev.map(u => [String(u._id), u]));
          return cleanUsers.map(u => {
            const old = prevMap.get(String(u._id));
            if (!old) return u;
            const mergedKyc = { ...(old.kycDocuments || {}) };
            if (u.kycDocuments) {
              for (const [k, v] of Object.entries(u.kycDocuments)) {
                if (v !== undefined && v !== null && v !== "") {
                  mergedKyc[k] = v;
                }
              }
            }
            return {
              ...old,
              ...u,
              kycDocuments: mergedKyc
            };
          });
        });
        appCache.set("educa_admin_cached_users_list", cleanUsers);
        appCache.set("educa_admin_cached_users", cleanUsers);
        appCache.set("educa_admin_cached_users_count", cleanUsers.length);
        setRateLimitError(null);
      }
    } catch {}
  }, []); // eslint-disable-line

  const loadLoans = useCallback(async (force = false) => {
    try {
      const res = await cachedAdminFetch(`${API}/loan/all`, { headers }, 2000, force);
      if (res.status === 429) return;
      if (!res.ok) return;
      const d = await res.json();
      if (Array.isArray(d)) {
        setLoans(prev => {
          if (!prev || prev.length === 0) return d;
          const prevMap = new Map(prev.map(l => [String(l._id), l]));
          return d.map(l => {
            const old = prevMap.get(String(l._id));
            if (!old) return l;
            return {
              ...old,
              ...l,
              userId: {
                ...(typeof old.userId === "object" ? old.userId : {}),
                ...(typeof l.userId === "object" ? l.userId : {}),
                kycDocuments: (typeof l.userId === "object" && l.userId?.kycDocuments)
                  ? l.userId.kycDocuments
                  : (typeof old.userId === "object" ? old.userId?.kycDocuments : null)
              }
            };
          });
        });
        appCache.set("educa_admin_cached_loans_list", d);
        appCache.set("educa_admin_cached_loans", d);
        appCache.set("educa_admin_cached_loans_count", d.length);
      }
      fetch(`${API}/loan/department-pool`, { headers })
        .then(r => r.ok ? r.json() : fetch(`${API}/loans/department-pool`, { headers }).then(r2 => r2.json()))
        .then(poolData => {
          if (poolData && poolData.success) {
            setLoanDepartmentPool(poolData);
            appCache.set("educa_admin_cached_loan_pool", poolData);
          }
        }).catch(() => {});
    } catch {}
  }, []); // eslint-disable-line

  const loadBonds = useCallback(async (force = false) => {
    try {
      const res = await cachedAdminFetch(`${API}/admin/bonds`, { headers }, 2000, force);
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

  const approveAgent = async (id, customRate, customCommissions, customLoanLimit) => {
    try {
      const rateVal = customRate !== undefined && customRate !== "" ? parseFloat(customRate) : undefined;
      const limitVal = customLoanLimit !== undefined && customLoanLimit !== "" ? parseFloat(customLoanLimit) : undefined;
      const res = await fetch(`${API}/admin/agent-applications/${id}/approve`, {
        method: "POST",
        headers: { ...headers, "Content-Type": "application/json" },
        body: JSON.stringify({
          commissionRate: rateVal,
          commissions: customCommissions,
          loanLimit: limitVal,
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

  const updateAgentCommission = async (id, customRateOrObj, customLoanLimit) => {
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

      if (customLoanLimit !== undefined && customLoanLimit !== null && customLoanLimit !== "") {
        const limitVal = parseFloat(customLoanLimit);
        if (!isNaN(limitVal) && limitVal >= 0) {
          bodyPayload.loanLimit = limitVal;
        }
      }

      const res = await fetch(`${API}/admin/agent-applications/${id}/set-commission`, {
        method: "POST",
        headers: { ...headers, "Content-Type": "application/json" },
        body: JSON.stringify(bodyPayload)
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.message);
      showToast(d.message || "Agent commission & loan limit updated successfully!", "success");
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
      if (force) {
        apiCache.clear();
      }
      const curToken = tokenStorage.getToken() || localStorage.getItem("token") || "";
      const dynamicHeaders = {
        "Content-Type": "application/json",
        Authorization: curToken ? `Bearer ${curToken}` : "",
        "Cache-Control": "no-cache",
        Pragma: "no-cache"
      };
      const url = `${API}/admin/analytics${force ? `?force=true&_t=${Date.now()}` : ""}`;
      const res = await cachedAdminFetch(url, { headers: dynamicHeaders }, 10000, force);
      if (!res || !res.ok) return;
      const data = await res.json();
      if (data && data.success) {
        setAnalytics(data);
        appCache.set("educa_admin_cached_analytics", data);
        try { CacheManager.persistLegacy("educa_admin_cached_analytics", data); } catch {}
        if (data.stats?.netFintechReserve !== undefined) {
          appCache.set("educa_admin_cached_reserves", data.stats.netFintechReserve);
          try { localStorage.setItem("educa_admin_cached_reserves", String(data.stats.netFintechReserve)); } catch {}
        }
        if (data.stats?.totalDeposits !== undefined) {
          appCache.set("educa_admin_cached_deposits", data.stats.totalDeposits);
          try { localStorage.setItem("educa_admin_cached_deposits", String(data.stats.totalDeposits)); } catch {}
        }
        if (data.stats?.totalYieldCredited !== undefined) {
          appCache.set("educa_admin_cached_profit", data.stats.totalYieldCredited);
          try { localStorage.setItem("educa_admin_cached_profit", String(data.stats.totalYieldCredited)); } catch {}
        }
        if (data.stats?.totalUsers !== undefined) {
          appCache.set("educa_admin_cached_users_count", data.stats.totalUsers);
          try { localStorage.setItem("educa_admin_cached_users_count", String(data.stats.totalUsers)); } catch {}
        }
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

  const loadPremiumSettings = useCallback(async (force = false) => {
    try {
      const res = await cachedAdminFetch(`${API}/settings/premium`, { headers }, 60000, force);
      if (res.status === 429) return;
      const data = await res.json();
      if (data && data.success && data.settings) {
        setPremiumSettings(data.settings);
        appCache.set("educa_admin_premium_settings", data.settings);
      }
    } catch (e) {
      console.warn("Failed to load premium settings", e);
    }
  }, [headers]);

  const savePremiumSettings = async (e) => {
    if (e) e.preventDefault();
    setSavingPremiumSettings(true);
    setPremiumSettingsSuccess("");
    try {
      const res = await fetch(`${API}/settings/premium`, {
        method: "POST",
        headers,
        body: JSON.stringify(premiumSettings)
      });
      const data = await res.json();
      if (res.ok && data.success) {
        showToast("Premium Wallet & Referral Settings saved!", "success");
        if (data.settings) setPremiumSettings(data.settings);
        setPremiumSettingsSuccess("Settings updated successfully!");
        setTimeout(() => setPremiumSettingsSuccess(""), 4000);
      } else {
        showToast(data.message || "Failed to update premium settings", "error");
      }
    } catch (err) {
      showToast("Network error updating premium settings", "error");
    } finally {
      setSavingPremiumSettings(false);
    }
  };

  const loadPaginatedAgents = useCallback(async (page = 1, search = "") => {
    setLoadingPaginatedAgents(true);
    try {
      const p = Math.max(1, page);
      const q = new URLSearchParams({ page: String(p), limit: String(paginatedAgentsLimit) });
      if (search && search.trim()) q.append("search", search.trim());
      const res = await fetch(`${API}/admin/agents-paginated?${q.toString()}`, {
        headers
      });
      const data = await res.json();
      if (data && data.success) {
        setPaginatedAgents(data.agents || []);
        setPaginatedAgentsTotal(data.total || 0);
        setPaginatedAgentsPage(data.page || 1);
        setPaginatedAgentsTotalPages(data.totalPages || 1);
      }
    } catch (err) {
      console.warn("loadPaginatedAgents error:", err);
    } finally {
      setLoadingPaginatedAgents(false);
    }
  }, [headers, paginatedAgentsLimit]);

  const loadCapitalMetrics = useCallback(async (force = false) => {
    try {
      setCapitalLoading(true);
      const res = await cachedAdminFetch(`${API}/admin/capital-portfolio`, { headers }, 15000, force);
      if (res.ok) {
        const data = await res.json();
        if (data && data.success) {
          setCapitalMetrics(data);
          appCache.set("educa_admin_cached_capital_metrics", data);
        }
      }
    } catch (e) {
      console.warn("Failed to load capital metrics", e);
    } finally {
      setCapitalLoading(false);
    }
  }, [headers]); // eslint-disable-line

  const downloadEncryptedBackup = async () => {
    try {
      setBackupLoading(true);
      const res = await fetch(`${API}/admin/backup/export`, { headers });
      const data = await res.json();
      if (!res.ok || !data.success) {
        showToast(data.message || "Backup export failed", "error");
        return;
      }

      // Download file to client device
      const blob = new Blob([data.payload], { type: "application/octet-stream" });
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = data.filename || `educa_backup_${Date.now()}.enc`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      window.URL.revokeObjectURL(url);

      // Record to local backup history
      const now = new Date();
      const dateStr = now.toLocaleDateString("en-IN", {
        day: "2-digit",
        month: "short",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
        hour12: true
      });

      const newRecord = {
        id: `bk_${Date.now()}`,
        timestamp: Date.now(),
        dateStr,
        filename: data.filename,
        sizeKb: data.sizeKb,
        summary: data.summary,
        encrypted: true
      };

      const updatedHistory = [newRecord, ...backupHistory.slice(0, 19)];
      setBackupHistory(updatedHistory);
      try {
        localStorage.setItem("educa_admin_backup_history", JSON.stringify(updatedHistory));
      } catch {}

      showToast(`Encrypted Backup Downloaded (${data.sizeKb} KB) `, "success");
    } catch {
      showToast("Network error creating backup", "error");
    } finally {
      setBackupLoading(false);
    }
  };

  // 1-Hour Automated Background Backup Snapshot
  useEffect(() => {
    const runHourlySnapshot = async () => {
      try {
        const lastSnapshotTime = Number(localStorage.getItem("educa_last_hourly_backup_time") || 0);
        const now = Date.now();
        // If > 1 hour (3600000 ms) has elapsed since last snapshot
        if (now - lastSnapshotTime >= 3600000) {
          const res = await fetch(`${API}/admin/backup/export`, { headers });
          if (res.ok) {
            const data = await res.json();
            if (data && data.success) {
              const dateStr = new Date().toLocaleDateString("en-IN", {
                day: "2-digit",
                month: "short",
                year: "numeric",
                hour: "2-digit",
                minute: "2-digit",
                hour12: true
              });
              const autoRecord = {
                id: `auto_${Date.now()}`,
                timestamp: Date.now(),
                dateStr: `${dateStr} (Auto 1-Hr)`,
                filename: data.filename,
                sizeKb: data.sizeKb,
                summary: data.summary,
                encrypted: true,
                isAuto: true
              };
              setBackupHistory(prev => {
                const next = [autoRecord, ...prev.filter(b => !b.isAuto || (Date.now() - b.timestamp < 86400000)).slice(0, 19)];
                try { localStorage.setItem("educa_admin_backup_history", JSON.stringify(next)); } catch {}
                return next;
              });
              localStorage.setItem("educa_last_hourly_backup_time", String(now));
            }
          } else {
            // Cooldown on failure (5 min) to prevent repeated hammering
            localStorage.setItem("educa_last_hourly_backup_time", String(now - 3600000 + 300000));
          }
        }
      } catch {}
    };
    runHourlySnapshot();
    const interval = setInterval(runHourlySnapshot, 15 * 60 * 1000);
    return () => clearInterval(interval);
  }, [headers]);

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
        showToast("Admin Deposit Details (UPI & Bank) save ho gayi!", "success");
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

  const loadBootstrapAdmin = useCallback(async (force = false) => {
    try {
      setIsRefreshing(true);
      const res = await cachedAdminFetch(`${API}/bootstrap/admin`, { headers }, 2000, force);
      if (!res.ok) return;
      const data = await res.json();
      if (!data || !data.success) return;

      if (data.users && Array.isArray(data.users)) {
        setUsers(prev => {
          if (!prev || prev.length === 0) return data.users;
          const prevMap = new Map(prev.map(u => [String(u._id), u]));
          return data.users.map(u => {
            const old = prevMap.get(String(u._id));
            return {
              ...old,
              ...u,
              kycDocuments: u.kycDocuments || old?.kycDocuments
            };
          });
        });
        appCache.set("educa_admin_cached_users_list", data.users);
      }
      if (data.pendingTxns && Array.isArray(data.pendingTxns)) {
        setPending(data.pendingTxns);
        appCache.set("educa_admin_cached_pending_list", data.pendingTxns);
      }
      if (data.holdTxns && Array.isArray(data.holdTxns)) {
        const holdPayload = { holdCount: data.holdTxns.length, groups: data.holdTxns };
        setHoldData(holdPayload);
        appCache.set("educa_admin_cached_hold", holdPayload);
      }
      if (data.loans && Array.isArray(data.loans)) {
        setLoans(prev => {
          if (!prev || prev.length === 0) return data.loans;
          const prevMap = new Map(prev.map(l => [String(l._id), l]));
          return data.loans.map(l => {
            const old = prevMap.get(String(l._id));
            if (!old) return l;
            return {
              ...old,
              ...l,
              userId: {
                ...(typeof old.userId === "object" ? old.userId : {}),
                ...(typeof l.userId === "object" ? l.userId : {}),
                kycDocuments: (typeof l.userId === "object" && l.userId?.kycDocuments)
                  ? l.userId.kycDocuments
                  : (typeof old.userId === "object" ? old.userId?.kycDocuments : null)
              }
            };
          });
        });
        appCache.set("educa_admin_cached_loans_list", data.loans);
      }
      if (data.bonds && Array.isArray(data.bonds)) {
        setBonds(data.bonds);
        appCache.set("educa_admin_cached_bonds_list", data.bonds);
      }
      if (data.agentApplications && Array.isArray(data.agentApplications)) {
        setAgents(data.agentApplications);
        appCache.set("educa_admin_cached_agents_list", data.agentApplications);
      }
      if (data.devices && Array.isArray(data.devices)) {
        setDevices(data.devices);
        appCache.set("educa_admin_cached_devices_list", data.devices);
      }
      if (data.depositDetails) {
        setDepositDetails(data.depositDetails);
        appCache.set("educa_admin_cached_deposit_details", data.depositDetails);
      }
      if (data.loanDepartmentPool) {
        setLoanDepartmentPool(data.loanDepartmentPool);
        appCache.set("educa_admin_cached_loan_pool", data.loanDepartmentPool);
      }
      if (data.settings) {
        if (data.settings.loanInterestRate) setInterestRate(data.settings.loanInterestRate);
        if (data.settings.referralCommissionRate) setCommissionRate(data.settings.referralCommissionRate);
        if (data.settings.googleDriveUrl) setGoogleDriveUrl(data.settings.googleDriveUrl);
      }
      if (data.analytics) {
        const statsPayload = {
          totalUsers: data.analytics.totalUsers || 0,
          totalDeposits: data.analytics.totalDeposits || 0,
          netFintechReserve: data.analytics.fintechReserves || 0,
          totalYield: data.analytics.totalProfitCredited || 0,
          totalUserProfits: data.analytics.totalProfitCredited || 0,
          pendingTxns: data.analytics.pendingTxns || 0,
          totalLoans: data.analytics.activeLoans || 0
        };
        setStats(statsPayload);
        appCache.set("educa_admin_cached_stats", statsPayload);
        try {
          CacheManager.persistLegacy("educa_admin_cached_stats", statsPayload);
          localStorage.setItem("educa_admin_cached_reserves", String(statsPayload.netFintechReserve));
          localStorage.setItem("educa_admin_cached_deposits", String(statsPayload.totalDeposits));
          localStorage.setItem("educa_admin_cached_profit", String(statsPayload.totalYield));
          localStorage.setItem("educa_admin_cached_users_count", String(statsPayload.totalUsers));
          localStorage.setItem("educa_admin_cached_pending_count", String(statsPayload.pendingTxns));
          localStorage.setItem("educa_admin_cached_loans_count", String(statsPayload.totalLoans));
        } catch {}
      }
    } catch (e) {
      console.warn("Bootstrap admin fetch error:", e);
    } finally {
      setIsRefreshing(false);
      setLoadingStats(false);
    }
  }, [headers]); // eslint-disable-line

  const loadAll = useCallback(() => {
    apiCache.clear();
    loadBootstrapAdmin(true);
    loadAnalytics(true);
  }, [loadBootstrapAdmin, loadAnalytics]);

  // PRIORITY LOADING: Instant cached render + immediate live background fetch + auto-sync
  useEffect(() => {
    loadBootstrapAdmin(true);
    loadAnalytics(true);
  }, []); // eslint-disable-line

  // Persist admin state immediately on pagehide / visibilitychange / beforeunload
  useEffect(() => {
    const saveSnapshot = () => {
      try {
        if (stats) {
          localStorage.setItem("educa_admin_cached_stats", CacheManager.slim(stats));
          appCache.set("educa_admin_cached_stats", stats);
        }
        if (Array.isArray(pending) && pending.length > 0) {
          localStorage.setItem("educa_admin_cached_pending_list", CacheManager.slim(pending));
          appCache.set("educa_admin_cached_pending_list", pending);
        }
        if (Array.isArray(users) && users.length > 0) {
          localStorage.setItem("educa_admin_cached_users_list", CacheManager.slim(users));
          appCache.set("educa_admin_cached_users_list", users);
        }
        if (Array.isArray(loans) && loans.length > 0) {
          localStorage.setItem("educa_admin_cached_loans_list", CacheManager.slim(loans));
          appCache.set("educa_admin_cached_loans_list", loans);
        }
        if (Array.isArray(bonds) && bonds.length > 0) {
          localStorage.setItem("educa_admin_cached_bonds_list", CacheManager.slim(bonds));
          appCache.set("educa_admin_cached_bonds_list", bonds);
        }
        if (Array.isArray(agents) && agents.length > 0) {
          localStorage.setItem("educa_admin_cached_agents_list", CacheManager.slim(agents));
          appCache.set("educa_admin_cached_agents_list", agents);
        }
      } catch {}
    };
    window.addEventListener("pagehide", saveSnapshot);
    window.addEventListener("beforeunload", saveSnapshot);
    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "hidden") saveSnapshot();
    });
    return () => {
      window.removeEventListener("pagehide", saveSnapshot);
      window.removeEventListener("beforeunload", saveSnapshot);
      document.removeEventListener("visibilitychange", saveSnapshot);
    };
  }, [stats, pending, users, loans, bonds, agents]);

  // Auto-route to pending loans subtab if normal deposits are empty but loans are pending
  useEffect(() => {
    if (tab === "pending" && pendingSubTab === "active" && pending.length === 0 && pendingLoans.length > 0) {
      setPendingSubTab("loans");
    }
  }, [tab, pending.length, pendingLoans.length, pendingSubTab]);

  // LIVE DESK SYNC: Every tab switch immediately fetches fresh live data from server
  useEffect(() => {
    let analyticsInterval = null;
    if (tab === "analytics") {
      loadAnalytics(true);
      loadStats(true);
      // 45-second auto-refresh interval for live 24h deposits & yields
      analyticsInterval = setInterval(() => {
        loadAnalytics(true);
        loadStats(true);
      }, 45 * 1000);
    } else if (tab === "pending") {
      loadPending(true);
      loadLoans(true);
      loadBonds(true);
      loadHoldData(true);
      loadDepositDetails(true);
      if (pending.length === 0 && pendingLoans.length > 0) {
        setPendingSubTab("loans");
      }
    } else if (tab === "agents") {
      loadAgents(true);
      loadPaginatedAgents(1, "");
    } else if (tab === "loans") {
      loadLoans(true);
      loadCapitalMetrics(true);
    } else if (tab === "capital") {
      loadCapitalMetrics(true);
      loadLoans(true);
      loadBonds(true);
    } else if (tab === "bonds" || tab === "lending") {
      loadBonds(true);
      loadCapitalMetrics(true);
    } else if (tab === "devices") {
      loadDevices(true);
    } else if (tab === "settings") {
      loadSettings(true);
      loadDepositDetails(true);
      loadPremiumSettings(true);
    } else if (tab === "issue-loan") {
      loadLoans(true);
      loadAgents(true);
      loadUsers(true);
    } else if (tab === "kyc" || tab === "users") {
      loadUsers(true);
    } else if (tab === "alerts") {
      loadNotifications(true);
    } else if (tab === "history") {
      loadAuditHistory(true);
    }

    return () => {
      if (analyticsInterval) clearInterval(analyticsInterval);
    };
  }, [tab]); // eslint-disable-line

  // KYC TAB: Poll lightweight fingerprint every 8s, reload full users list only when fingerprint changes
  useEffect(() => {
    if (tab !== "kyc") return;
    let lastFingerprint = null;
    const check = async () => {
      if (typeof document !== "undefined" && document.visibilityState !== "visible") return;
      try {
        const res = await fetch(`${API}/admin/users/kyc-fingerprint`, { headers });
        if (!res.ok) return;
        const fp = JSON.stringify(await res.json());
        if (lastFingerprint !== null && fp !== lastFingerprint) {
          loadUsers(true); // reload only when KYC data changed
        }
        lastFingerprint = fp;
      } catch {}
    };
    check();
    const kycPoll = setInterval(check, 8000);
    return () => clearInterval(kycPoll);
  }, [tab, loadUsers, headers]); // eslint-disable-line

  // LIVE BACKGROUND SYNC (Tab-Isolated: Only sync the currently active operational tab)
  useEffect(() => {
    const timer = setInterval(() => {
      if (typeof document !== "undefined" && document.hidden) return;
      if (tab === "pending") {
        loadPending(true);
      } else if (tab === "analytics") {
        loadAnalytics(true);
      } else if (tab === "capital") {
        loadCapitalMetrics(true);
      } else if (tab === "loans") {
        loadLoans(true);
      } else if (tab === "users") {
        loadUsers(true);
      }
    }, 30 * 1000);
    return () => clearInterval(timer);
  }, [loadPending, loadLoans, loadAnalytics, loadCapitalMetrics, loadUsers, tab]);

  // INSTANT SYNC ON RESUME / TAB FOCUS (Tab-Isolated: Only refresh active tab)
  useEffect(() => {
    const handleResume = () => {
      if (typeof document !== "undefined" && !document.hidden) {
        if (tab === "pending") {
          loadPending(true);
        } else if (tab === "analytics") {
          loadAnalytics(true);
        } else if (tab === "capital") {
          loadCapitalMetrics(true);
        } else if (tab === "loans") {
          loadLoans(true);
        } else if (tab === "users") {
          loadUsers(true);
        }
      }
    };
    document.addEventListener("visibilitychange", handleResume);
    window.addEventListener("focus", handleResume);
    return () => {
      document.removeEventListener("visibilitychange", handleResume);
      window.removeEventListener("focus", handleResume);
    };
  }, [loadPending, loadLoans, loadAnalytics, loadCapitalMetrics, loadUsers, tab]);


  // REAL-TIME SSE CONNECTION FOR LIVE ALERTS & SOUND
  const loadAllRef = useRef(loadAll);
  loadAllRef.current = loadAll;
  const playSoundRef = useRef(playNotificationSound);
  playSoundRef.current = playNotificationSound;

  useEffect(() => {
    if (!token || user.role !== "admin") return;

    let eventSource = null;
    let cancelled = false;

    const handleMessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        if (data.type === "connected" || data.type === "heartbeat") return;

        // Sound alert on chrome / mobile!
        playSoundRef.current?.();

        // Instant toast notification
        showToast(`${data.title || "New Alert"}: ${data.message}`);

        // Add to notification list
        setNotifications((prev) => [data, ...prev]);
        setUnreadNotifs((prev) => prev + 1);

        // Refresh data lists
        loadAllRef.current?.();
      } catch (e) {}
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
            showToast("Form me data bhara hua hai. Dobara back dabayein cancel karne ke liye.", "info");
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
      setApproveTxnModal(null);
      setRejectTxnModal(null);
      setAssignAgentModalUser(null);
      setPreviewKycUser(null);
      setExpandedLoanId(null);
      setLightboxImg(null);
    };

    return () => {
      window.handleAndroidBackPressed = null;
      window.forceDismissActiveModal = null;
    };
  }, [adminPayModal, loanApproveModal, approveTxnModal, rejectTxnModal, lightboxImg, assignAgentModalUser, previewKycUser, expandedLoanId, tab]);

  const handleAdminEvidenceUpload = (file) => {
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
        const maxDim = 1200;
        let w = img.width, h = img.height;
        if (w > maxDim || h > maxDim) {
          if (w > h) { h = Math.round((h * maxDim) / w); w = maxDim; }
          else { w = Math.round((w * maxDim) / h); h = maxDim; }
        }
        canvas.width = w; canvas.height = h;
        const ctx = canvas.getContext("2d");
        ctx.drawImage(img, 0, 0, w, h);
        setAdminEvidenceInput(canvas.toDataURL("image/jpeg", 0.8));
        setAdminEvidenceName(file.name);
      };
      img.onerror = () => {
        setAdminEvidenceInput(event.target.result);
        setAdminEvidenceName(file.name);
      };
      img.src = event.target.result;
    };
    reader.readAsDataURL(file);
  };

  const openApproveTxnModal = (targetTxn) => {
    if (!targetTxn) return;
    setApproveTxnModal(targetTxn);
    setAdminUtrInput(targetTxn.utrNumber || "");
    setAdminEvidenceInput("");
    setAdminEvidenceName("");
    setAdminNoteInput("");
  };

  const submitApproveTxn = async () => {
    if (!approveTxnModal) return;
    const targetTxn = approveTxnModal;
    setIsApprovingTxn(true);
    setPending(prev => prev.filter(p => p._id !== targetTxn._id));
    setApproveTxnModal(null);
    try {
      const res = await fetch(`${API}/admin/transaction/${targetTxn._id}/approve`, {
        method: "POST",
        headers: { ...headers, "Content-Type": "application/json" },
        body: JSON.stringify({
          approverName: user.name || "Admin",
          approverDevice: getClientDeviceInfo(),
          utrNumber: adminUtrInput.trim(),
          adminEvidenceUrl: adminEvidenceInput,
          adminEvidenceNote: adminNoteInput.trim()
        })
      });
      const data = await res.json();
      showToast(data.message || "Transaction approved!", res.ok ? "success" : "error");
      if (res.ok) {
        apiCache.clear();
        loadPending(true);
        loadHoldData(true);
        loadStats(true);
        if (pendingSubTab === "approved") loadApprovedRequests(true);
      } else {
        setPending(prev => [targetTxn, ...prev]);
      }
    } catch {
      setPending(prev => [targetTxn, ...prev]);
      showToast("Approval failed. Please try again.", "error");
    } finally {
      setIsApprovingTxn(false);
    }
  };

  const approve = async (idOrTxn) => {
    if (typeof idOrTxn === "object" && idOrTxn !== null && idOrTxn._id) {
      openApproveTxnModal(idOrTxn);
      return;
    }
    const found = pending.find(p => p._id === idOrTxn);
    if (found) {
      openApproveTxnModal(found);
      return;
    }
    openApproveTxnModal({ _id: idOrTxn });
  };

  const openRejectTxnModal = (targetTxn) => {
    if (!targetTxn) return;
    setRejectTxnModal(targetTxn);
    setRejectReasonInput("Invalid UPI ID / Bank Details");
  };

  const submitRejectTxn = async () => {
    if (!rejectTxnModal) return;
    const targetTxn = rejectTxnModal;
    const reason = (rejectReasonInput || "").trim();
    if (!reason) {
      showToast("Please enter a rejection reason", "error");
      return;
    }
    setIsRejectingTxn(true);
    setPending(prev => prev.filter(p => p._id !== targetTxn._id));
    setRejectTxnModal(null);

    try {
      const res = await fetch(`${API}/admin/transaction/${targetTxn._id}/reject`, {
        method: "POST",
        headers: { ...headers, "Content-Type": "application/json" },
        body: JSON.stringify({
          remarks: reason,
          approverName: user.name || "Admin",
          approverDevice: getClientDeviceInfo()
        })
      });
      const data = await res.json();
      showToast(data.message || "Transaction rejected!", res.ok ? "success" : "error");
      if (res.ok) {
        apiCache.clear();
        loadPending(true);
        loadHoldData(true);
        loadStats(true);
      } else {
        setPending(prev => [targetTxn, ...prev]);
      }
    } catch {
      setPending(prev => [targetTxn, ...prev]);
      showToast("Rejection failed. Please try again.", "error");
    } finally {
      setIsRejectingTxn(false);
    }
  };

  const reject = (idOrTxn) => {
    if (typeof idOrTxn === "object" && idOrTxn !== null && idOrTxn._id) {
      openRejectTxnModal(idOrTxn);
      return;
    }
    const found = pending.find(p => p._id === idOrTxn);
    if (found) {
      openRejectTxnModal(found);
      return;
    }
    openRejectTxnModal({ _id: idOrTxn });
  };

  const toggleBlock = async (id) => {
    // ⚡ Optimistic UI update: instant 0ms toggle
    setUsers(prev => prev.map(u => u._id === id ? { ...u, isBlocked: !u.isBlocked } : u));
    try {
      const res = await fetch(`${API}/admin/user/${id}/toggle-block`, { method: "POST", headers });
      const data = await res.json();
      showToast(data.message || "User block status updated!", res.ok ? "success" : "error");
      apiCache.clear();
      loadUsers(true);
    } catch {
      showToast("Failed to toggle user block status", "error");
      loadUsers(true);
    }
  };

  const toggleUninstallLock = async (userId) => {
    // ⚡ Optimistic UI update: instant 0ms toggle
    setUsers(prev => prev.map(u => u._id === userId ? { ...u, isUninstallProtected: !u.isUninstallProtected } : u));
    try {
      const res = await fetch(`${API}/admin/user/${userId}/toggle-uninstall-lock`, { method: "POST", headers });
      const data = await res.json();
      showToast(data.message || "Uninstall lock updated!", res.ok ? "success" : "error");
      if (res.ok) {
        apiCache.clear();
        loadUsers(true);
        loadDevices(true);
      } else {
        loadUsers(true);
      }
    } catch {
      showToast("Failed to toggle uninstall protection", "error");
      loadUsers(true);
    }
  };

  const openResetPasswordModal = (targetUser) => {
    const generated = "Educa@" + Math.floor(1000 + Math.random() * 9000);
    setResetPasswordModalUser(targetUser);
    setResetPasswordInput(generated);
    setResetPasswordMustChange(true);
    setResetPasswordSyncEduca(true);
    setResetPasswordSuccessData(null);
  };

  const handleAdminResetPassword = async () => {
    if (!resetPasswordModalUser || !resetPasswordInput.trim()) return;
    setResetPasswordLoading(true);
    try {
      const res = await fetch(`${API}/admin/user/${resetPasswordModalUser._id}/reset-password`, {
        method: "POST",
        headers,
        body: JSON.stringify({
          tempPassword: resetPasswordInput.trim(),
          mustChangePassword: resetPasswordMustChange,
          syncEducaMail: resetPasswordSyncEduca
        })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || "Failed to reset password");
      setResetPasswordSuccessData({
        user: resetPasswordModalUser,
        tempPassword: data.tempPassword || resetPasswordInput.trim(),
        mustChangePassword: resetPasswordMustChange,
        educaSynced: data.educaSynced
      });
      showToast(`${resetPasswordModalUser.name} ka password reset ho gaya!`, "success");
      apiCache.clear();
      loadUsers(true);
    } catch (err) {
      showToast(`${err.message}`, "error");
    } finally {
      setResetPasswordLoading(false);
    }
  };

  const openAssignStaffModal = (targetUser) => {
    setAssignStaffModalUser(targetUser);
    const depts = targetUser?.staffProfile?.departments || [];
    setAssignStaffDepts(depts.length > 0 ? [...depts] : ["loan"]);
  };

  const toggleAssignStaffDept = (deptId) => {
    setAssignStaffDepts(prev =>
      prev.includes(deptId) ? prev.filter(d => d !== deptId) : [...prev, deptId]
    );
  };

  const handleAssignStaffRole = async () => {
    if (!assignStaffModalUser) return;
    setAssignStaffLoading(true);
    try {
      const isStaff = assignStaffDepts.length > 0;
      const deptPerms = {
        loan: ["loan.view", "loan.approve", "loan.reject", "loan.disburse"],
        kyc: ["kyc.view", "kyc.approve", "kyc.reject"],
        deposit: ["deposit.view", "deposit.approve", "deposit.reject"],
        withdrawal: ["withdrawal.view", "withdrawal.approve", "withdrawal.reject"],
        lending: ["lending.view", "lending.approve", "lending.reject"],
        bond: ["bond.view", "bond.approve", "bond.reject"]
      };
      const permissions = assignStaffDepts.flatMap(d => deptPerms[d] || []);
      const payload = {
        role: isStaff ? "staff" : "user",
        departments: assignStaffDepts,
        permissions,
        isActive: isStaff
      };
      const res = await fetch(`${API}/admin/user/${assignStaffModalUser._id}/assign-role`, {
        method: "POST",
        headers,
        body: JSON.stringify(payload)
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || "Failed to assign desk role");
      const summary = isStaff ? assignStaffDepts.join(" + ") : "Normal Customer";
      showToast(`${assignStaffModalUser.name} ka desk role update ho gaya: ${summary}!`, "success");
      apiCache.clear();
      loadUsers(true);
      setAssignStaffModalUser(null);
    } catch (err) {
      showToast(`${err.message}`, "error");
    } finally {
      setAssignStaffLoading(false);
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

    // ⚡ Optimistic UI update: instant 0ms state change so button reacts immediately
    setUsers(prev => prev.map(u => {
      if (u._id !== userId) return u;
      return {
        ...u,
        cardTier: newTier,
        cardStatus: {
          ...(u.cardStatus || {}),
          platinum: {
            ...(u.cardStatus?.platinum || {}),
            unlocked: unlockVal
          }
        }
      };
    }));

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
      } else {
        loadUsers(true);
      }
    } catch {
      showToast("Failed to update card status", "error");
      loadUsers(true);
    }
  };

  const approveKyc = async (userId, remarks = "") => {
    setUsers(prev => prev.map(u => u._id === userId ? { ...u, kycStatus: "verified", kycDocuments: { ...(u.kycDocuments || {}), adminRemarks: remarks } } : u));
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
      } else {
        loadUsers(true);
      }
    } catch {
      showToast("Failed to approve KYC", "error");
      loadUsers(true);
    }
  };

  const rejectKyc = async (userId, remarks = "") => {
    setUsers(prev => prev.map(u => u._id === userId ? { ...u, kycStatus: "rejected", kycDocuments: { ...(u.kycDocuments || {}), adminRemarks: remarks } } : u));
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
      } else {
        loadUsers(true);
      }
    } catch {
      showToast("Failed to reject KYC", "error");
      loadUsers(true);
    }
  };

  const approveBankChange = async (userId, remarks = "") => {
    try {
      const res = await fetch(`${API}/admin/bank-change/${userId}/approve`, {
        method: "POST",
        headers: { ...headers, "Content-Type": "application/json" },
        body: JSON.stringify({ remarks })
      });
      const data = await res.json();
      showToast(data.message || "Bank details approved successfully", res.ok ? "success" : "error");
      if (res.ok) {
        apiCache.clear();
        loadUsers(true);
      } else {
        loadUsers(true);
      }
    } catch (err) {
      showToast("Failed to approve bank change: " + err.message, "error");
      loadUsers(true);
    }
  };

  const rejectBankChange = async (userId, remarks = "") => {
    try {
      const res = await fetch(`${API}/admin/bank-change/${userId}/reject`, {
        method: "POST",
        headers: { ...headers, "Content-Type": "application/json" },
        body: JSON.stringify({ remarks })
      });
      const data = await res.json();
      showToast(data.message || "Bank change request rejected", res.ok ? "success" : "error");
      if (res.ok) {
        apiCache.clear();
        loadUsers(true);
      } else {
        loadUsers(true);
      }
    } catch (err) {
      showToast("Failed to reject bank change: " + err.message, "error");
      loadUsers(true);
    }
  };

  const submitApproveLoan = async () => {
    if (!loanApproveModal) return;
    const loanToApprove = loanApproveModal;
    setLoanApproveLoading(true);
    setLoans(prev => prev.map(l => l._id === loanToApprove._id ? { ...l, status: "active" } : l));
    try {
      const res = await fetch(`${API}/loan/${loanToApprove._id}/approve`, {
        method: "POST",
        headers: { ...headers, "Content-Type": "application/json" },
        body: JSON.stringify({
          advanceOption,
          firstInstallmentDate: approveFirstDueDate || undefined,
          disburseToWallet: approveDisburseToWallet,
          approverName: user.name || "Admin",
          approverDevice: getClientDeviceInfo()
        })
      });
      const data = await res.json();
      showToast(data.message, res.ok ? "success" : "error");
      if (res.ok) {
        setLoanApproveModal(null);
        setApproveFirstDueDate("");
        apiCache.clear();
        loadLoans(true);
        loadStats(true);
      } else {
        loadLoans(true);
      }
    } catch {
      showToast("Network error approving loan", "error");
      loadLoans(true);
    } finally {
      setLoanApproveLoading(false);
    }
  };

  const rejectLoan = async (id) => {
    setLoans(prev => prev.map(l => l._id === id ? { ...l, status: "rejected" } : l));
    setRejectLoadingId(id);
    try {
      const res = await fetch(`${API}/loan/${id}/reject`, { method: "POST", headers });
      const data = await res.json();
      showToast(data.message, res.ok ? "success" : "error");
      if (res.ok) {
        apiCache.clear();
        loadLoans(true);
      } else {
        loadLoans(true);
      }
    } catch {
      showToast("Network error rejecting loan", "error");
      loadLoans(true);
    } finally {
      setRejectLoadingId(null);
    }
  };

  const approveBond = async (bondId) => {
    setBonds(prev => prev.map(b => b._id === bondId ? { ...b, status: "active" } : b));
    setBondActionLoadingId(bondId);
    try {
      const res = await fetch(`${API}/bond/${bondId}/approve`, { method: "POST", headers });
      const data = await res.json();
      showToast(data.message || "Bond approved!", res.ok ? "success" : "error");
      if (res.ok) {
        apiCache.clear();
        loadBonds(true);
      } else {
        loadBonds(true);
      }
    } catch {
      showToast("Network error approving bond", "error");
      loadBonds(true);
    } finally {
      setBondActionLoadingId(null);
    }
  };

  const rejectBond = async (bondId) => {
    setBonds(prev => prev.map(b => b._id === bondId ? { ...b, status: "rejected" } : b));
    setBondActionLoadingId(bondId);
    try {
      const res = await fetch(`${API}/bond/${bondId}/reject`, { method: "POST", headers });
      const data = await res.json();
      showToast(data.message || "Bond rejected", res.ok ? "success" : "error");
      if (res.ok) {
        apiCache.clear();
        loadBonds(true);
      } else {
        loadBonds(true);
      }
    } catch {
      showToast("Network error rejecting bond", "error");
      loadBonds(true);
    } finally {
      setBondActionLoadingId(null);
    }
  };

  const handleApproveEarlyStop = async (bondId) => {
    if (!window.confirm("Early Exit approve karein? Principal me se ab tak mile total payouts deduct karke bacha refund user wallet me credit ho jayega.")) return;
    setBondActionLoadingId(bondId);
    try {
      const res = await fetch(`${API}/bond/${bondId}/approve-stop`, { method: "POST", headers });
      const data = await res.json();
      showToast(data.message || "Early exit stop approved!", res.ok ? "success" : "error");
      if (res.ok) {
        apiCache.clear();
        loadBonds(true);
      }
    } catch {
      showToast("Network error approving early stop", "error");
    } finally {
      setBondActionLoadingId(null);
    }
  };

  const handleRejectEarlyStop = async (bondId) => {
    const reason = window.prompt("Reason for rejecting early stop (optional):") || "";
    setBondActionLoadingId(bondId);
    try {
      const res = await fetch(`${API}/bond/${bondId}/reject-stop`, {
        method: "POST",
        headers: { ...headers, "Content-Type": "application/json" },
        body: JSON.stringify({ reason })
      });
      const data = await res.json();
      showToast(data.message || "Early exit stop request rejected", res.ok ? "success" : "error");
      if (res.ok) {
        apiCache.clear();
        loadBonds(true);
      }
    } catch {
      showToast("Network error rejecting early stop", "error");
    } finally {
      setBondActionLoadingId(null);
    }
  };

  const approveInstallment = async (loanId, installmentNo) => {
    if (!window.confirm(`Installment #${installmentNo} approve karein? Balance update ho jayega.`)) return;
    setInstallmentActionLoadingId(`${loanId}_${installmentNo}`);
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
    } finally {
      setInstallmentActionLoadingId(null);
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

  const handleSaveR2 = async () => {
    setR2Saving(true);
    try {
      const res = await fetch(`${API}/settings/r2`, {
        method: "POST",
        headers,
        body: JSON.stringify(r2Config)
      });
      const data = await res.json();
      showToast(data.message || "R2 settings updated", res.ok ? "success" : "error");
      if (res.ok && data.config) {
        setR2Config(prev => ({
          ...prev,
          ...data.config,
          secretAccessKey: "" // reset secret field for security
        }));
      }
    } catch (e) {
      showToast(e.message || "Failed to save R2 settings", "error");
    } finally {
      setR2Saving(false);
    }
  };

  const handleTestR2 = async () => {
    setR2Testing(true);
    try {
      const res = await fetch(`${API}/settings/r2/test`, {
        method: "POST",
        headers,
        body: JSON.stringify(r2Config)
      });
      const data = await res.json();
      if (data.success) {
        showToast("" + data.message, "success");
      } else {
        showToast("" + (data.message || "R2 Connection failed"), "error");
      }
    } catch (e) {
      showToast("Network error testing R2: " + e.message, "error");
    } finally {
      setR2Testing(false);
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
      "Document Folder Link"
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
    { key: "capital", label: "Capital & Fund Hub", icon: "" },
    { key: "analytics", label: "Profit & Reserves", icon: "" },
    { key: "staff", label: "Staff & Desks", icon: "" },
    { key: "loan-settings", label: "Loan Settings", icon: "⚙️" },
    { key: "activity-log", label: "Audit Activity Log", icon: "" },
    { key: "pending", label: "Pending", icon: "⏳", badge: totalPendingDeskCount },
    { key: "kyc", label: "KYC Requests", icon: "", badge: pendingKycCount },
    { key: "history", label: "Audit History", icon: "" },
    { key: "alerts", label: "Live Alerts", icon: "", badge: unreadNotifs },
    { key: "agents", label: "Agent Partners", icon: "", badge: pendingAgentsCount },
    { key: "loans", label: "Loans", icon: "", badge: pendingLoans.length || undefined },
    { key: "issue-loan", label: "Issue Loan Desk", icon: "" },
    { key: "lending", label: "Lending Accounts", icon: "", badge: pendingBonds.length || bonds.length || undefined },
    { key: "users", label: "Users & Accounts", icon: "" },
    { key: "devices", label: "App Lock", icon: "", badge: devices.filter(d => d.adminStatus === "active").length },
    { key: "settings", label: "Settings", icon: "" },
  ];

  // Dedicated Multi-Category Audit History State & Constants
  const AUDIT_CATEGORIES = [
    { key: "all", label: "All Activities", icon: "" },
    { key: "deposit", label: "Deposits", icon: "" },
    { key: "withdrawal", label: "Withdrawals", icon: "" },
    { key: "transfer", label: "Wallet Transfers", icon: "" },
    { key: "kyc", label: "All KYC", icon: "" },
    { key: "normal_kyc", label: "Normal KYC", icon: "" },
    { key: "loan_kyc", label: "Loan KYC", icon: "" },
    { key: "loan", label: "Loans", icon: "" },
    { key: "agent", label: "Agent Partners", icon: "" },
    { key: "yield", label: "12% Daily Yield", icon: "" },
  ];

  const AUDIT_STATUSES = [
    { key: "all", label: "All Statuses", icon: "" },
    { key: "approved", label: "Approved / Done", icon: "" },
    { key: "pending", label: "Pending", icon: "⏳" },
    { key: "rejected", label: "Rejected", icon: "" },
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
        setToast({ text: `${data.message || "24h Profit alerts sent to depositors!"}`, type: "success" });
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
          title: "Educa Admin Notification",
          message: "FCM Push & Device Alert Live Test! Sabhi connected phones pe alert deliver ho gaya hai.",
          deviceId: "all"
        })
      });
      const data = await res.json();
      if (res.ok) {
        setToast({ text: "Notification phone pe bhej di gayi hai!", type: "success" });
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
      const res = await cachedAdminFetch(`${API}/admin/audit-history?${query}`, { headers }, 3000, force);
      const data = await res.json();
      if (data && Array.isArray(data.history)) {
        if (data.history.length > 0) {
          setAuditHistory(data.history);
          if (!historySearch) {
            try { appCache.set(cacheKey, data.history); } catch {}
            // Pre-warm individual category caches from root "all" list for 0ms sub-filter access
            if (historyCategory === "all" && historyStatus === "all") {
              AUDIT_CATEGORIES.forEach(cat => {
                if (cat.key !== "all") {
                  const subItems = data.history.filter(i => i.category === cat.key || i.type === cat.key);
                  if (subItems.length > 0) {
                    try { appCache.set(getAuditCacheKey(cat.key, "all"), subItems); } catch {}
                  }
                }
              });
            }
          }
        } else if (historyCategory === "all" && historyStatus === "all" && !historySearch) {
          setAuditHistory(DEFAULT_AUDIT_HISTORY);
          try { appCache.set(cacheKey, DEFAULT_AUDIT_HISTORY); } catch {}
        } else {
          setAuditHistory([]);
        }
      } else {
        setAuditHistory(prev => prev && prev.length > 0 ? prev : []);
      }
    } catch (err) {
      console.warn("Failed to load audit history:", err);
      setAuditHistory(prev => prev && prev.length > 0 ? prev : []);
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
        adminNote: `Applied by Admin on behalf of ${issueBorrowerType === "new" ? issueNewUser.name : issueSelectedUser?.name} (${actualLoanType})`,
        paidInstallmentsCount: Number(issuePaidInstallmentsCount) || 0,
        firstPendingDueDate: issueFirstPendingDueDate || undefined,
        disburseToWallet: issueDisburseToWallet,
        directActive: Number(issuePaidInstallmentsCount) > 0 ? true : undefined,
        customInstallmentAmount: issueCustomInstallmentAmount ? Number(issueCustomInstallmentAmount) : undefined,
        backfillEvidenceUrl: issueBackfillEvidenceUrl || undefined,
        paidInstallmentsList: (Number(issuePaidInstallmentsCount) > 0 && issueBackfillInstallments.length > 0) ? issueBackfillInstallments : undefined
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
        setIssuePaidInstallmentsCount(0);
        setIssueBackfillEvidenceUrl("");
        setIssueBackfillEvidenceName("");
        setIssueBackfillInstallments([]);
        setIssueFirstPendingDueDate("");
        setIssueCustomInstallmentAmount("");
        setIssueDisburseToWallet(false);
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

  const logout = () => {
    try {
      if (user?._id || user?.id) {
        CacheManager.clearUser("admin", user._id || user.id);
      }
    } catch (_) {}
    tokenStorage.removeToken();
    sessionStorage.clear();
    window.location.href = "/";
  };

  const readCachedNumber = (key, fallback = 0) => {
    if (typeof localStorage === "undefined") return fallback;
    const v = localStorage.getItem(key);
    if (!v) return fallback;
    const n = parseCachedNumber(v, null);
    return n !== null && isFinite(n) && n >= 0 ? n : fallback;
  };

  const cachedDeposits = readCachedNumber("educa_admin_cached_deposits", 0);
  const cachedProfit = readCachedNumber("educa_admin_cached_profit", 0);
  const cachedReserves = readCachedNumber("educa_admin_cached_reserves", 0);
  const cachedUsers = readCachedNumber("educa_admin_cached_users_count", 0);
  const cachedPending = readCachedNumber("educa_admin_cached_pending_count", 0);
  const cachedLoans = readCachedNumber("educa_admin_cached_loans_count", 0);

  const totalDepositsDisplay = Number(
    (analytics?.stats?.totalDeposits !== undefined ? analytics.stats.totalDeposits : null) ??
    (stats?.totalDeposits !== undefined ? stats.totalDeposits : null) ??
    (cachedDeposits > 0 ? cachedDeposits : null) ??
    0
  );

  const chartCumulativeProfit = (analytics?.dailyProfitChart || []).reduce((acc, row) => acc + (Number(row.amount) || 0), 0);
  const totalProfitBase = Number(
    (analytics?.stats?.totalYieldCredited !== undefined ? analytics.stats.totalYieldCredited : null) ??
    (chartCumulativeProfit > 0 ? chartCumulativeProfit : null) ??
    (analytics?.stats?.totalUserProfits !== undefined ? analytics.stats.totalUserProfits : null) ??
    (stats?.totalUserProfits !== undefined ? stats.totalUserProfits : null) ??
    (stats?.totalYield !== undefined ? stats.totalYield : null) ??
    (cachedProfit > 0 ? cachedProfit : null) ??
    0
  );

  const totalReservesBase = Number(
    (analytics?.stats?.netFintechReserve !== undefined ? analytics.stats.netFintechReserve : null) ??
    (stats?.netFintechReserve !== undefined ? stats.netFintechReserve : null) ??
    (cachedReserves > 0 ? cachedReserves : null) ??
    0
  );

  // Sync cached reserves, deposits & profit on backend update
  useEffect(() => {
    const net = Number(analytics?.stats?.netFintechReserve ?? stats?.netFintechReserve ?? stats?.totalUserBalances ?? 0);
    try { localStorage.setItem("educa_admin_cached_reserves", String(net)); } catch {}
    try { localStorage.setItem("educa_admin_cached_deposits", String(totalDepositsDisplay)); } catch {}
    try { localStorage.setItem("educa_admin_cached_profit", String(totalProfitBase)); } catch {}
  }, [analytics?.stats?.netFintechReserve, stats?.netFintechReserve, stats?.totalUserBalances, totalDepositsDisplay, totalProfitBase]);

  const resolvedTotalUsers = Number((Array.isArray(users) ? users.length : null) ?? (stats?.totalUsers !== undefined ? stats.totalUsers : null) ?? (analytics?.stats?.totalUsers !== undefined ? analytics.stats.totalUsers : null) ?? cachedUsers ?? 0);
  const resolvedPendingTxns = Number((Array.isArray(pending) ? pending.length : null) ?? (stats?.pendingTxns !== undefined ? stats.pendingTxns : null) ?? (analytics?.stats?.pendingTxnsCount !== undefined ? analytics.stats.pendingTxnsCount : null) ?? cachedPending ?? 0);
  const resolvedActiveLoans = Number((Array.isArray(loans) ? loans.filter(l => l.status === "active").length : null) ?? (stats?.totalLoans !== undefined ? stats.totalLoans : null) ?? (analytics?.stats?.totalLoans !== undefined ? analytics.stats.totalLoans : null) ?? cachedLoans ?? 0);

  useEffect(() => {
    try { localStorage.setItem("educa_admin_cached_users_count", String(resolvedTotalUsers)); } catch {}
    try { localStorage.setItem("educa_admin_cached_pending_count", String(resolvedPendingTxns)); } catch {}
    try { localStorage.setItem("educa_admin_cached_loans_count", String(resolvedActiveLoans)); } catch {}
  }, [resolvedTotalUsers, resolvedPendingTxns, resolvedActiveLoans]);

  // Instant open & zero skeleton: values are always rendered immediately
  const isMetricsLoading = false;

  const statCards = [
    { icon: "", label: "Fintech Reserves", value: <LiveAdminReservesTicker deposits={totalReservesBase} baseProfit={totalProfitBase} />, g: "from-emerald-500 to-teal-600", isLoading: isMetricsLoading, isLive: true },
    { icon: "", label: "Total Deposits", value: `₹${totalDepositsDisplay.toLocaleString("en-IN")}`, g: "from-green-500 to-emerald-600", isLoading: isMetricsLoading, isLive: true },
    { icon: "", label: "Profit Credited", value: <LiveAdminProfitTicker baseProfit={totalProfitBase} deposits={totalDepositsDisplay} />, g: "from-blue-600 to-cyan-600", isLoading: isMetricsLoading, isLive: true },
    { icon: "", label: "Total Users", value: resolvedTotalUsers, g: "from-indigo-600 to-violet-600", isLoading: isMetricsLoading, isLive: true },
    { icon: "⏳", label: "Pending Txns", value: resolvedPendingTxns, g: "from-amber-500 to-orange-500", isLoading: isMetricsLoading, isLive: true },
    { icon: "", label: "Active Loans", value: resolvedActiveLoans, g: "from-sky-500 to-blue-600", isLoading: isMetricsLoading, isLive: true },
  ];

  return (
    <div className="bg-slate-50 min-h-screen flex flex-col lg:flex-row">
      {/* DESKTOP SIDEBAR (FIXED FULL-HEIGHT NEVER SCROLLS OFF SCREEN) */}
      <aside className={`hidden lg:flex lg:flex-col ${isSidebarCollapsed ? "w-20" : "w-64"} shrink-0 bg-slate-900 border-r border-slate-800 text-slate-100 lg:fixed lg:inset-y-0 lg:left-0 lg:h-screen transition-all duration-200 z-30 select-none shadow-xl`}>
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
              <span className="flex items-center gap-2.5 min-w-0">
                <span className="truncate">{isSidebarCollapsed ? label.slice(0, 3) : label}</span>
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

          {/* Bottom Actions moved inside scrollable nav */}
          <div className="pt-3 mt-3 border-t border-slate-800 space-y-2">
            <Link
              to="/desk"
              title={isSidebarCollapsed ? "Department Desks" : undefined}
              className="w-full flex items-center justify-center gap-2 px-2.5 py-2 bg-blue-600/30 hover:bg-blue-600/50 text-blue-300 border border-blue-500/40 rounded-xl transition text-xs font-bold active:scale-95 cursor-pointer shadow-xs"
            >
              <svg className="w-4 h-4 text-blue-300 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
              </svg>
              {!isSidebarCollapsed && <span className="truncate">Department Desks</span>}
            </Link>
            <Link
              to="/dashboard"
              title={isSidebarCollapsed ? "Back to Dashboard" : undefined}
              className="w-full flex items-center justify-center gap-2 px-2.5 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 rounded-xl transition text-xs font-bold active:scale-95 cursor-pointer shadow-xs"
            >
              <svg className="w-4 h-4 text-slate-300 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
              </svg>
              {!isSidebarCollapsed && <span className="truncate">← Back to Dashboard</span>}
            </Link>
            {!isSidebarCollapsed && (
              <div className="flex items-center justify-between text-xs px-1 pt-0.5">
                <span className="text-slate-400 text-[11px] truncate">Admin: <strong className="text-white font-semibold">{user.name}</strong></span>
              </div>
            )}
            <button
              type="button"
              onClick={async () => {
                if (window.confirm("Admin offline cache clear karein? Sab fresh load hoga.")) {
                  try {
                    await CacheManager.clearAll();
                    localStorage.removeItem("educa_admin_backup_history");
                    localStorage.removeItem("educa_admin_cached_reserves");
                    localStorage.removeItem("educa_admin_cached_deposits");
                    localStorage.removeItem("educa_admin_cached_profit");
                    localStorage.removeItem("educa_admin_cached_users_count");
                    localStorage.removeItem("educa_admin_cached_pending_count");
                    localStorage.removeItem("educa_admin_cached_loans_count");
                    localStorage.removeItem("educa_admin_cached_stats");
                    localStorage.removeItem("educa_admin_cached_analytics");
                  } catch (_) {}
                  window.location.reload();
                }
              }}
              title={isSidebarCollapsed ? "Clear Cache" : undefined}
              className="w-full px-2.5 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg transition text-xs font-semibold cursor-pointer flex items-center justify-center gap-1.5"
            >
              
              {!isSidebarCollapsed && <span>Clear Cache</span>}
            </button>
            <button
              type="button"
              onClick={logout}
              title={isSidebarCollapsed ? "Logout" : undefined}
              className="w-full px-2.5 py-1.5 bg-rose-600/90 hover:bg-rose-600 text-white rounded-lg transition text-xs font-semibold cursor-pointer flex items-center justify-center gap-1.5"
            >
              
              {!isSidebarCollapsed && <span>Logout</span>}
            </button>
          </div>
        </nav>
      </aside>

      <div className={`flex-1 min-w-0 max-w-full min-h-screen ${isSidebarCollapsed ? "lg:pl-20" : "lg:pl-64"} transition-all duration-200`}>
        {/* MOBILE / TABLET TOP NAV (SLIM WHITE EXECUTIVE BAR) */}
        <nav className="lg:hidden bg-white border-b border-slate-200/90 shadow-2xs sticky top-0 z-40 safe-top">
          <div className="px-3 sm:px-5 py-2 flex items-center justify-between">
            <div className="flex items-center gap-2.5 min-w-0">
              <button
                type="button"
                style={{ touchAction: "manipulation" }}
                onClick={() => setMobileNavOpen(true)}
                className="w-9 h-9 rounded-xl bg-white hover:bg-slate-100 text-slate-800 border border-slate-300 shadow-2xs flex items-center justify-center active:scale-90 active:bg-slate-200 cursor-pointer shrink-0 transition"
                aria-label="Open menu"
              >
                <svg className="w-5 h-5 text-slate-700" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.2} d="M4 6h16M4 12h16M4 18h16" />
                </svg>
              </button>
              <div className="min-w-0">
                <h1 className="text-slate-900 font-black text-sm leading-tight">Admin Panel</h1>
                <p className="text-blue-600 text-[10px] font-bold leading-none truncate">
                  {tabs.find(t => t.key === tab)?.icon} {tabs.find(t => t.key === tab)?.label}
                </p>
              </div>
            </div>

            <Link
              to="/dashboard"
              className="px-2.5 py-1 bg-slate-100 hover:bg-slate-200 text-slate-800 rounded-lg text-xs font-bold transition flex items-center gap-1 active:scale-95 shadow-2xs"
            >
              <svg className="w-3.5 h-3.5 text-slate-700 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
              </svg>
              <span>Dashboard</span>
            </Link>
          </div>
        </nav>


        <div className="max-w-7xl mx-auto px-2.5 sm:px-6 py-3 sm:py-8 w-full min-w-0">
          {/* Rate Limit (429) & Network Error Alert Banner */}
          {rateLimitError && (
            <div className="mb-4 sm:mb-6 p-4 bg-amber-500/10 border-2 border-amber-500/40 rounded-2xl flex flex-wrap items-center justify-between gap-3 text-amber-950 shadow-sm animate-in fade-in">
              <div className="flex items-center gap-3">
                <span className="text-2xl"></span>
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
                <span>{isRetrying ? "⏳ Refreshing..." : "Retry Now"}</span>
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

          {/* MOBILE LEFT SIDEBAR DRAWER (replaces old "Switch Desk" bottom sheet) */}
          <div
            className={`fixed inset-0 z-50 flex lg:hidden transition-all duration-200 ${
              mobileNavOpen ? "pointer-events-auto visible opacity-100" : "pointer-events-none invisible opacity-0"
            }`}
          >
            <div
              className={`fixed inset-0 bg-slate-950/60 backdrop-blur-xs transition-opacity duration-200 ${
                mobileNavOpen ? "opacity-100" : "opacity-0"
              }`}
              onClick={() => setMobileNavOpen(false)}
            />
            <aside
              className={`relative w-72 max-w-[85vw] h-full bg-white text-slate-800 border-r border-slate-200 shadow-2xl flex flex-col z-10 transition-transform duration-200 ease-out ${
                mobileNavOpen ? "translate-x-0" : "-translate-x-full"
              }`}
            >
              <div className="shrink-0 px-4 py-4 border-b border-slate-100 flex items-center justify-between safe-top bg-slate-50/50">
                <div className="flex items-center gap-2.5 min-w-0">
                  <img src="/icon-192.png" alt="Educa" className="w-8 h-8 rounded-full bg-white object-contain p-0.5 border border-slate-200 shrink-0" />
                  <div className="min-w-0">
                    <h3 className="text-sm font-black text-slate-900 leading-tight truncate">Educa Admin</h3>
                    <p className="text-[10px] text-slate-500 leading-tight">Operations Desks</p>
                  </div>
                </div>
                <button
                  type="button"
                  style={{ touchAction: "manipulation" }}
                  onClick={() => setMobileNavOpen(false)}
                  className="w-8 h-8 rounded-full bg-slate-100 hover:bg-slate-200 flex items-center justify-center text-slate-500 hover:text-slate-800 text-sm font-bold active:scale-90 cursor-pointer"
                  aria-label="Close menu"
                >
                  ✕
                </button>
              </div>

              <nav className="flex-1 overflow-y-auto p-3 space-y-1 no-scrollbar">
                {tabs.map(({ key, label, icon, badge }) => {
                  const isActive = tab === key;
                  return (
                    <button
                      key={key}
                      type="button"
                      style={{ touchAction: "manipulation" }}
                      onClick={() => switchTab(key)}
                      className={`w-full flex items-center justify-between px-3.5 py-2.5 rounded-xl text-xs font-semibold transition active:scale-[0.97] active:bg-blue-700 cursor-pointer ${
                        isActive ? "bg-blue-600 text-white shadow-xs font-bold" : "text-slate-700 hover:bg-slate-100"
                      }`}
                    >
                      <span className="flex items-center gap-2.5 min-w-0">
                        <span className="truncate">{label}</span>
                      </span>
                      {!!badge && (
                        <span className={`text-[10px] font-black px-1.5 py-0.5 rounded-full ${isActive ? "bg-amber-400 text-slate-950" : "bg-rose-500 text-white"}`}>
                          {badge}
                        </span>
                      )}
                    </button>
                  );
                })}

                {/* Clean inline navigation links scrolled at bottom */}
                <div className="pt-2 mt-2 border-t border-slate-100 space-y-1">
                  <Link
                    to="/desk"
                    style={{ touchAction: "manipulation" }}
                    onClick={() => setMobileNavOpen(false)}
                    className="w-full flex items-center justify-between px-3.5 py-2.5 rounded-xl text-xs font-semibold text-slate-700 hover:bg-slate-100 transition active:scale-[0.97] cursor-pointer"
                  >
                    <span className="flex items-center gap-2.5 min-w-0">
                      <span className="truncate">Department Desks</span>
                    </span>
                    <span className="text-slate-400 text-xs font-bold">→</span>
                  </Link>
                  <Link
                    to="/dashboard"
                    style={{ touchAction: "manipulation" }}
                    onClick={() => setMobileNavOpen(false)}
                    className="w-full flex items-center justify-between px-3.5 py-2.5 rounded-xl text-xs font-semibold text-slate-700 hover:bg-slate-100 transition active:scale-[0.97] cursor-pointer"
                  >
                    <span className="flex items-center gap-2.5 min-w-0">
                      <span className="truncate">Customer App View</span>
                    </span>
                    <span className="text-slate-400 text-xs font-bold">→</span>
                  </Link>
                  <button
                    type="button"
                    style={{ touchAction: "manipulation" }}
                    onClick={() => {
                      setMobileNavOpen(false);
                      logout();
                    }}
                    className="w-full flex items-center justify-between px-3.5 py-2.5 rounded-xl text-xs font-bold text-rose-600 hover:bg-rose-50 transition active:scale-[0.97] cursor-pointer"
                  >
                    <span className="flex items-center gap-2.5 min-w-0">
                      <span className="truncate">Logout</span>
                    </span>
                  </button>
                </div>
              </nav>
            </aside>
          </div>

          {/* ══════════════════════════════════════════════════════
              UNIFIED CAPITAL, LOAN, NIVESH & CASH-OUT HUB
          ══════════════════════════════════════════════════════ */}
          {tab === "capital" && (() => {
            const allLoanItems = (capitalMetrics?.loans?.items && capitalMetrics.loans.items.length > 0)
              ? capitalMetrics.loans.items
              : (Array.isArray(loans) ? loans : []);

            const allInvestmentItems = (capitalMetrics?.investments?.items && capitalMetrics.investments.items.length > 0)
              ? capitalMetrics.investments.items
              : (Array.isArray(bonds) ? bonds : []);

            const allCashOutItems = (capitalMetrics?.cashOut?.items && capitalMetrics.cashOut.items.length > 0)
              ? capitalMetrics.cashOut.items
              : [
                  ...(Array.isArray(pending) ? pending.filter(p => p.type === "withdrawal") : []),
                  ...(Array.isArray(approvedRequests) ? approvedRequests.filter(r => r.type === "withdrawal") : [])
                ];

            const allDepositItems = (capitalMetrics?.deposits?.items && capitalMetrics.deposits.items.length > 0)
              ? capitalMetrics.deposits.items
              : [
                  ...(Array.isArray(pending) ? pending.filter(p => p.type === "deposit") : []),
                  ...(Array.isArray(approvedRequests) ? approvedRequests.filter(r => r.type === "deposit") : [])
                ];

            const allProfitItems = (capitalMetrics?.profit?.items && capitalMetrics.profit.items.length > 0)
              ? capitalMetrics.profit.items
              : (Array.isArray(auditHistory) ? auditHistory.filter(h => h.type === "daily_yield" || h.type === "profit_transfer") : []);

            const uniqueBorrowers = new Set(allLoanItems.map(l => String(l.userId?._id || l.userId?.id || l.userId || "")).filter(Boolean)).size;
            const totalDisbursedLoans = allLoanItems.reduce((s, l) => s + (l.amount || 0), 0);
            const totalRecoveredLoans = allLoanItems.reduce((s, l) => s + (l.paidAmount || 0), 0);
            const activeLoanDue = allLoanItems.filter(l => l.status === "active").reduce((s, l) => s + (l.remainingAmount || 0), 0);
            const activeLoansCount = allLoanItems.filter(l => l.status === "active").length;

            const uniqueInvestors = new Set(allInvestmentItems.map(b => String(b.userId?._id || b.userId?.id || b.userId || "")).filter(Boolean)).size;
            const totalBondPrincipal = allInvestmentItems.reduce((s, b) => s + (b.principalAmount || 0), 0);
            const totalBondYield = allInvestmentItems.reduce((s, b) => s + (b.accruedInterest || 0), 0);
            const activeBondsCount = allInvestmentItems.filter(b => b.status === "active").length;

            const cashOutTotal = capitalMetrics?.cashOut?.totalCashOutAmount || allCashOutItems.reduce((s, c) => s + (c.amount || 0), 0);
            const cashOutCount = capitalMetrics?.cashOut?.totalCashOutCount || allCashOutItems.length;
            const cashOutUsers = capitalMetrics?.cashOut?.cashOutUsersCount || new Set(allCashOutItems.map(c => String(c.userId?._id || c.userId || "")).filter(Boolean)).size;
            const pendingCashOutAmt = capitalMetrics?.cashOut?.pendingAmount || allCashOutItems.filter(c => c.status === "pending").reduce((s, c) => s + (c.amount || 0), 0);
            const pendingCashOutCount = capitalMetrics?.cashOut?.pendingCount || allCashOutItems.filter(c => c.status === "pending").length;

            const totalInflow = (capitalMetrics?.flow?.totalInflow) || (totalRecoveredLoans);
            const totalOutflow = (capitalMetrics?.flow?.totalOutflow) || (totalDisbursedLoans + cashOutTotal);

            // Time filter helper
            const matchesTime = (dateVal) => {
              if (!dateVal || capitalTimeFilter === "all") return true;
              const t = new Date(dateVal).getTime();
              if (isNaN(t)) return true;
              const now = Date.now();
              if (capitalTimeFilter === "today") {
                const s = new Date();
                s.setHours(0, 0, 0, 0);
                return t >= s.getTime();
              }
              if (capitalTimeFilter === "7days") {
                return (now - t) <= (7 * 24 * 60 * 60 * 1000);
              }
              if (capitalTimeFilter === "month") {
                return (now - t) <= (30 * 24 * 60 * 60 * 1000);
              }
              return true;
            };

            // Search filter helper
            const q = (debouncedCapitalSearch || "").trim().toLowerCase();
            const matchesSearch = (item) => {
              if (!q) return true;
              const name = String(item.userId?.name || item.name || "").toLowerCase();
              const phone = String(item.userId?.phone || item.phone || "").toLowerCase();
              const utr = String(item.utrNumber || item.referenceId || item._id || "").toLowerCase();
              const extra = String(item.planName || item.method || item.type || "").toLowerCase();
              return name.includes(q) || phone.includes(q) || utr.includes(q) || extra.includes(q);
            };

            // Determine active items list
            let activeItems = [];
            let activeCategoryLabel = "";
            let activeCategoryIcon = "";

            if (capitalSubCategory === "loans") {
              activeItems = allLoanItems.filter(i => matchesTime(i.createdAt || i.approvedAt) && matchesSearch(i));
              activeCategoryLabel = "Loans (Udhaar & EMI Portfolio Ledger)";
              activeCategoryIcon = "";
            } else if (capitalSubCategory === "investments") {
              activeItems = allInvestmentItems.filter(i => matchesTime(i.createdAt || i.startDate) && matchesSearch(i));
              activeCategoryLabel = "Investments & Lending Bonds Ledger";
              activeCategoryIcon = "";
            } else if (capitalSubCategory === "cashout") {
              activeItems = allCashOutItems.filter(i => matchesTime(i.createdAt) && matchesSearch(i));
              activeCategoryLabel = "Cash-Out (Withdrawals & Payouts Ledger)";
              activeCategoryIcon = "";
            } else if (capitalSubCategory === "deposits") {
              activeItems = allDepositItems.filter(i => matchesTime(i.createdAt) && matchesSearch(i));
              activeCategoryLabel = "Add Money (Deposits & UPI Inflow Ledger)";
              activeCategoryIcon = "";
            } else if (capitalSubCategory === "profit") {
              activeItems = allProfitItems.filter(i => matchesTime(i.createdAt) && matchesSearch(i));
              activeCategoryLabel = "Net Profit & Daily Yield Distributions";
              activeCategoryIcon = "";
            }

            const activeTotalAmount = activeItems.reduce((sum, item) => {
              const val = Number(item.amount || item.principalAmount || 0);
              return sum + (isNaN(val) ? 0 : val);
            }, 0);

            return (
              <div className="space-y-5 w-full min-w-0">
                {/* Sub-Navigation Filter Pills & Search Bar (Box 2 Repositioned to Very Top) */}
                <div className="bg-white p-3.5 sm:p-4 rounded-2xl border border-slate-200/90 shadow-2xs space-y-3">
                  {/* Category Pills + Fast Refresh */}
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-1.5 sm:gap-2 overflow-x-auto pb-1 no-scrollbar flex-1">
                      {[
                        { key: "loans", label: "Loan", icon: "", count: allLoanItems.length },
                        { key: "investments", label: "Investment", icon: "", count: allInvestmentItems.length },
                        { key: "cashout", label: "Cashout", icon: "", count: allCashOutItems.length },
                        { key: "deposits", label: "Add Money", icon: "", count: allDepositItems.length },
                        { key: "profit", label: "Net Profit", icon: "", count: allProfitItems.length },
                      ].map((c) => {
                        const isSel = capitalSubCategory === c.key;
                        return (
                          <button
                            key={c.key}
                            type="button"
                            onClick={() => setCapitalSubCategory(c.key)}
                            className={`min-h-[44px] px-3.5 sm:px-4 py-2 rounded-xl text-xs sm:text-sm font-black transition flex items-center gap-2 whitespace-nowrap cursor-pointer active:scale-95 ${
                              isSel
                                ? "bg-slate-900 text-white shadow-md ring-2 ring-slate-900/20"
                                : "bg-slate-100 hover:bg-slate-200/80 text-slate-700 font-bold"
                            }`}
                          >
                            <span>{c.icon}</span>
                            <span>{c.label}</span>
                            <span className={`text-[10px] sm:text-[11px] px-1.5 py-0.5 rounded-full font-mono ${
                              isSel ? "bg-white/20 text-white" : "bg-slate-200 text-slate-700"
                            }`}>
                              {c.count}
                            </span>
                          </button>
                        );
                      })}
                    </div>

                    <button
                      type="button"
                      onClick={() => loadCapitalMetrics(true)}
                      disabled={capitalLoading}
                      className="min-h-[44px] px-3 sm:px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-800 rounded-xl text-xs font-bold transition flex items-center gap-1.5 active:scale-95 cursor-pointer shrink-0"
                      title="Refresh Capital Hub data"
                    >
                      <span>{capitalLoading ? "⏳" : ""}</span>
                      <span className="hidden sm:inline">{capitalLoading ? "Refreshing..." : "Refresh"}</span>
                    </button>
                  </div>

                  {/* Search and Time Filter Line */}
                  <div className="flex flex-col md:flex-row md:items-center justify-between gap-2.5 pt-2.5 border-t border-slate-100">
                    {/* Search Input */}
                    <div className="relative flex-1 min-w-0">
                      <input
                        type="text"
                        value={capitalSearch}
                        onChange={(e) => setCapitalSearch(e.target.value)}
                        placeholder={`Search in ${capitalSubCategory} by Name, Phone, UTR...`}
                        className="w-full min-h-[44px] pl-3.5 pr-8 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs sm:text-sm outline-none focus:ring-2 focus:ring-blue-500 focus:bg-white transition"
                      />
                      {capitalSearch && (
                        <button
                          type="button"
                          onClick={() => setCapitalSearch("")}
                          className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 text-sm font-bold w-6 h-6 flex items-center justify-center cursor-pointer"
                        >
                          ✕
                        </button>
                      )}
                    </div>

                    {/* Date / Time Filter Buttons */}
                    <div className="flex items-center gap-1.5 overflow-x-auto pb-0.5 no-scrollbar shrink-0">
                      {[
                        { key: "all", label: "Sabhi (All)" },
                        { key: "today", label: "Aaj (Today)" },
                        { key: "7days", label: "⏱️ Pichle 7 Din" },
                        { key: "month", label: "Is Mahine" },
                      ].map((tf) => {
                        const isTimeActive = capitalTimeFilter === tf.key;
                        return (
                          <button
                            key={tf.key}
                            type="button"
                            onClick={() => setCapitalTimeFilter(tf.key)}
                            className={`min-h-[40px] px-3 py-1.5 rounded-xl text-xs font-bold transition whitespace-nowrap cursor-pointer active:scale-95 border ${
                              isTimeActive
                                ? "bg-blue-600 text-white border-blue-600 shadow-2xs font-black"
                                : "bg-white text-slate-600 border-slate-200 hover:bg-slate-50"
                            }`}
                          >
                            {tf.label}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                </div>

                {/* Category Executive Summary Strip (Red Box Slot) */}
                {capitalSubCategory === "loans" && (() => {
                  const loanDisbursed = activeItems.reduce((s, l) => s + Number(l.amount || 0), 0);
                  const loanRecovered = activeItems.reduce((s, l) => s + Number(l.paidAmount || 0), 0);
                  const loanRemaining = activeItems.reduce((s, l) => s + Number(l.remainingAmount !== undefined ? l.remainingAmount : (Math.max(0, (l.totalPayable || l.amount || 0) - (l.paidAmount || 0)))), 0);
                  const loanBorrowers = new Set(activeItems.map(l => String(l.userId?._id || l.userId?.id || l.userId || "")).filter(Boolean)).size;
                  const loanActive = activeItems.filter(l => l.status === "active").length;

                  return (
                    <div className="space-y-3">
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
                                Shared Department Lending Quota • Default ₹10 Lakh Limit
                              </div>
                            </div>
                          </div>
                          <div className="flex items-center gap-2">
                            <span className="text-[10px] font-mono px-2.5 py-1 rounded-lg bg-white/10 border border-white/15 text-blue-100 font-bold">
                              Active Loans: {loanDepartmentPool.activeLoansCount || 0}
                            </span>
                            <span className="text-[10px] font-mono px-2.5 py-1 rounded-lg bg-emerald-500/20 border border-emerald-400/30 text-emerald-300 font-bold">
                              {loanDepartmentPool.utilizationPercent || 0}% Utilized
                            </span>
                          </div>
                        </div>

                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-2 border-t border-white/10">
                          <div className="bg-white/5 backdrop-blur-xs p-3 rounded-xl border border-white/10">
                            <span className="text-[10px] text-blue-300 uppercase font-bold block">Dept Total Limit</span>
                            <div className="text-xl sm:text-2xl font-black font-mono text-white mt-0.5">
                              ₹{(loanDepartmentPool.totalPool || 1000000).toLocaleString("en-IN")}
                            </div>
                            <span className="text-[9px] text-blue-300/80">Configured Department Pool</span>
                          </div>

                          <div className="bg-white/5 backdrop-blur-xs p-3 rounded-xl border border-white/10">
                            <span className="text-[10px] text-rose-300 uppercase font-bold block">Market me Diya Loan</span>
                            <div className="text-xl sm:text-2xl font-black font-mono text-rose-300 mt-0.5">
                              ₹{(loanDepartmentPool.marketDisbursed || 0).toLocaleString("en-IN")}
                            </div>
                            <span className="text-[9px] text-rose-200/80">Active Disbursed Capital</span>
                          </div>

                          <div className="bg-emerald-500/10 backdrop-blur-xs p-3 rounded-xl border border-emerald-400/20">
                            <span className="text-[10px] text-emerald-300 uppercase font-bold block">Available Lending Pool</span>
                            <div className="text-xl sm:text-2xl font-black font-mono text-emerald-300 mt-0.5">
                              ₹{(loanDepartmentPool.availablePool !== undefined ? loanDepartmentPool.availablePool : 1000000).toLocaleString("en-IN")}
                            </div>
                            <span className="text-[9px] text-emerald-200/80">Available Approval Balance</span>
                          </div>
                        </div>

                        {/* Utilization Progress Bar */}
                        <div className="mt-3">
                          <div className="w-full bg-white/10 rounded-full h-1.5 overflow-hidden">
                            <div
                              className="h-full bg-gradient-to-r from-blue-400 to-emerald-400 transition-all duration-500 rounded-full"
                              style={{ width: `${Math.min(100, Math.max(0, loanDepartmentPool.utilizationPercent || 0))}%` }}
                            />
                          </div>
                        </div>
                      </div>

                      <div className="grid grid-cols-2 lg:grid-cols-4 gap-2.5 sm:gap-3">
                      <div className="bg-white p-3 sm:p-4 rounded-2xl border border-blue-200/90 shadow-2xs">
                        <span className="text-[10px] sm:text-xs font-bold text-slate-500 uppercase tracking-wide flex items-center gap-1.5">
                           Total Diya Gaya (Disbursed)
                        </span>
                        <div className="mt-1.5 flex items-baseline justify-between gap-1 flex-wrap">
                          <span className="text-base sm:text-xl font-black text-slate-900 font-mono">
                            ₹{loanDisbursed.toLocaleString("en-IN")}
                          </span>
                          <span className="text-[10px] font-bold text-blue-700 bg-blue-50 px-2 py-0.5 rounded-full">
                            {loanBorrowers} Borrowers
                          </span>
                        </div>
                      </div>

                      <div className="bg-white p-3 sm:p-4 rounded-2xl border border-emerald-200/90 shadow-2xs">
                        <span className="text-[10px] sm:text-xs font-bold text-emerald-700 uppercase tracking-wide flex items-center gap-1.5">
                           Wapas Kitna Aaya (Recovered)
                        </span>
                        <div className="mt-1.5 flex items-baseline justify-between gap-1 flex-wrap">
                          <span className="text-base sm:text-xl font-black text-emerald-700 font-mono">
                            ₹{loanRecovered.toLocaleString("en-IN")}
                          </span>
                          <span className="text-[10px] font-bold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-full">
                            Collected
                          </span>
                        </div>
                      </div>

                      <div className="bg-white p-3 sm:p-4 rounded-2xl border border-amber-200/90 shadow-2xs">
                        <span className="text-[10px] sm:text-xs font-bold text-amber-800 uppercase tracking-wide flex items-center gap-1.5">
                          <span>⏳</span> Bacha Hua (Remaining Due)
                        </span>
                        <div className="mt-1.5 flex items-baseline justify-between gap-1 flex-wrap">
                          <span className="text-base sm:text-xl font-black text-amber-900 font-mono">
                            ₹{loanRemaining.toLocaleString("en-IN")}
                          </span>
                          <span className="text-[10px] font-bold text-amber-800 bg-amber-50 px-2 py-0.5 rounded-full">
                            Pending Recovery
                          </span>
                        </div>
                      </div>

                      <div className="bg-white p-3 sm:p-4 rounded-2xl border border-indigo-200/90 shadow-2xs">
                        <span className="text-[10px] sm:text-xs font-bold text-indigo-700 uppercase tracking-wide flex items-center gap-1.5">
                           Active Udhaar Accounts
                        </span>
                        <div className="mt-1.5 flex items-baseline justify-between gap-1 flex-wrap">
                          <span className="text-base sm:text-xl font-black text-indigo-950 font-mono">
                            {loanActive} Running
                          </span>
                          <span className="text-[10px] font-bold text-indigo-700 bg-indigo-50 px-2 py-0.5 rounded-full">
                            Total {activeItems.length}
                          </span>
                        </div>
                      </div>
                    </div>
                  </div>
                );
                })()}

                {capitalSubCategory === "investments" && (() => {
                  const invPrincipal = activeItems.reduce((s, b) => s + Number(b.principalAmount || 0), 0);
                  const invYield = activeItems.reduce((s, b) => s + Number(b.accruedInterest || 0), 0);
                  const invInvestors = new Set(activeItems.map(b => String(b.userId?._id || b.userId?.id || b.userId || "")).filter(Boolean)).size;
                  const invActive = activeItems.filter(b => b.status === "active").length;

                  return (
                    <div className="grid grid-cols-2 lg:grid-cols-4 gap-2.5 sm:gap-3">
                      <div className="bg-white p-3 sm:p-4 rounded-2xl border border-purple-200/90 shadow-2xs">
                        <span className="text-[10px] sm:text-xs font-bold text-purple-700 uppercase tracking-wide flex items-center gap-1.5">
                           Total Principal Nivesh
                        </span>
                        <div className="mt-1.5 flex items-baseline justify-between gap-1 flex-wrap">
                          <span className="text-base sm:text-xl font-black text-purple-950 font-mono">
                            ₹{invPrincipal.toLocaleString("en-IN")}
                          </span>
                          <span className="text-[10px] font-bold text-purple-700 bg-purple-50 px-2 py-0.5 rounded-full">
                            {invInvestors} Investors
                          </span>
                        </div>
                      </div>

                      <div className="bg-white p-3 sm:p-4 rounded-2xl border border-emerald-200/90 shadow-2xs">
                        <span className="text-[10px] sm:text-xs font-bold text-emerald-700 uppercase tracking-wide flex items-center gap-1.5">
                           Distributed Yield / Return
                        </span>
                        <div className="mt-1.5 flex items-baseline justify-between gap-1 flex-wrap">
                          <span className="text-base sm:text-xl font-black text-emerald-700 font-mono">
                            ₹{invYield.toLocaleString("en-IN")}
                          </span>
                          <span className="text-[10px] font-bold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-full">
                            Paid Out
                          </span>
                        </div>
                      </div>

                      <div className="bg-white p-3 sm:p-4 rounded-2xl border border-indigo-200/90 shadow-2xs">
                        <span className="text-[10px] sm:text-xs font-bold text-indigo-700 uppercase tracking-wide flex items-center gap-1.5">
                           Active Investment Bonds
                        </span>
                        <div className="mt-1.5 flex items-baseline justify-between gap-1 flex-wrap">
                          <span className="text-base sm:text-xl font-black text-indigo-950 font-mono">
                            {invActive} Active
                          </span>
                          <span className="text-[10px] font-bold text-indigo-700 bg-indigo-50 px-2 py-0.5 rounded-full">
                            Total {activeItems.length}
                          </span>
                        </div>
                      </div>

                      <div className="bg-white p-3 sm:p-4 rounded-2xl border border-slate-200/90 shadow-2xs">
                        <span className="text-[10px] sm:text-xs font-bold text-slate-500 uppercase tracking-wide flex items-center gap-1.5">
                           Total Investor Base
                        </span>
                        <div className="mt-1.5 flex items-baseline justify-between gap-1 flex-wrap">
                          <span className="text-base sm:text-xl font-black text-slate-900 font-mono">
                            {invInvestors} People
                          </span>
                          <span className="text-[10px] font-bold text-slate-600 bg-slate-100 px-2 py-0.5 rounded-full">
                            Verified
                          </span>
                        </div>
                      </div>
                    </div>
                  );
                })()}

                {capitalSubCategory === "cashout" && (() => {
                  const cashApproved = activeItems.filter(c => c.status === "approved" || !c.status).reduce((s, c) => s + Number(c.amount || 0), 0);
                  const cashPending = activeItems.filter(c => c.status === "pending").reduce((s, c) => s + Number(c.amount || 0), 0);
                  const cashUsers = new Set(activeItems.map(c => String(c.userId?._id || c.userId || "")).filter(Boolean)).size;
                  const cashPendingCount = activeItems.filter(c => c.status === "pending").length;

                  return (
                    <div className="grid grid-cols-2 lg:grid-cols-4 gap-2.5 sm:gap-3">
                      <div className="bg-white p-3 sm:p-4 rounded-2xl border border-rose-200/90 shadow-2xs">
                        <span className="text-[10px] sm:text-xs font-bold text-rose-700 uppercase tracking-wide flex items-center gap-1.5">
                           Approved Cash-Out
                        </span>
                        <div className="mt-1.5 flex items-baseline justify-between gap-1 flex-wrap">
                          <span className="text-base sm:text-xl font-black text-rose-900 font-mono">
                            ₹{cashApproved.toLocaleString("en-IN")}
                          </span>
                          <span className="text-[10px] font-bold text-rose-700 bg-rose-50 px-2 py-0.5 rounded-full">
                            {cashUsers} Users
                          </span>
                        </div>
                      </div>

                      <div className="bg-white p-3 sm:p-4 rounded-2xl border border-amber-200/90 shadow-2xs">
                        <span className="text-[10px] sm:text-xs font-bold text-amber-800 uppercase tracking-wide flex items-center gap-1.5">
                          <span>⏳</span> Pending Cash-Out Queue
                        </span>
                        <div className="mt-1.5 flex items-baseline justify-between gap-1 flex-wrap">
                          <span className="text-base sm:text-xl font-black text-amber-900 font-mono">
                            ₹{cashPending.toLocaleString("en-IN")}
                          </span>
                          <span className="text-[10px] font-bold text-amber-800 bg-amber-50 px-2 py-0.5 rounded-full">
                            {cashPendingCount} Requests
                          </span>
                        </div>
                      </div>

                      <div className="bg-white p-3 sm:p-4 rounded-2xl border border-slate-200/90 shadow-2xs">
                        <span className="text-[10px] sm:text-xs font-bold text-slate-500 uppercase tracking-wide flex items-center gap-1.5">
                           Total Payout Txns
                        </span>
                        <div className="mt-1.5 flex items-baseline justify-between gap-1 flex-wrap">
                          <span className="text-base sm:text-xl font-black text-slate-900 font-mono">
                            {activeItems.length} Txns
                          </span>
                          <span className="text-[10px] font-bold text-slate-600 bg-slate-100 px-2 py-0.5 rounded-full">
                            All statuses
                          </span>
                        </div>
                      </div>

                      <div className="bg-white p-3 sm:p-4 rounded-2xl border border-blue-200/90 shadow-2xs">
                        <span className="text-[10px] sm:text-xs font-bold text-blue-700 uppercase tracking-wide flex items-center gap-1.5">
                           Unique Payout Users
                        </span>
                        <div className="mt-1.5 flex items-baseline justify-between gap-1 flex-wrap">
                          <span className="text-base sm:text-xl font-black text-blue-900 font-mono">
                            {cashUsers} Users
                          </span>
                          <span className="text-[10px] font-bold text-blue-700 bg-blue-50 px-2 py-0.5 rounded-full">
                            Recipients
                          </span>
                        </div>
                      </div>
                    </div>
                  );
                })()}

                {capitalSubCategory === "deposits" && (() => {
                  const depApproved = activeItems.filter(d => d.status === "approved" || !d.status).reduce((s, d) => s + Number(d.amount || 0), 0);
                  const depPending = activeItems.filter(d => d.status === "pending").reduce((s, d) => s + Number(d.amount || 0), 0);
                  const depUsers = new Set(activeItems.map(d => String(d.userId?._id || d.userId || "")).filter(Boolean)).size;
                  const depPendingCount = activeItems.filter(d => d.status === "pending").length;

                  return (
                    <div className="grid grid-cols-2 lg:grid-cols-4 gap-2.5 sm:gap-3">
                      <div className="bg-white p-3 sm:p-4 rounded-2xl border border-emerald-200/90 shadow-2xs">
                        <span className="text-[10px] sm:text-xs font-bold text-emerald-700 uppercase tracking-wide flex items-center gap-1.5">
                           Approved Inflow (Added)
                        </span>
                        <div className="mt-1.5 flex items-baseline justify-between gap-1 flex-wrap">
                          <span className="text-base sm:text-xl font-black text-emerald-800 font-mono">
                            ₹{depApproved.toLocaleString("en-IN")}
                          </span>
                          <span className="text-[10px] font-bold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-full">
                            Credited
                          </span>
                        </div>
                      </div>

                      <div className="bg-white p-3 sm:p-4 rounded-2xl border border-amber-200/90 shadow-2xs">
                        <span className="text-[10px] sm:text-xs font-bold text-amber-800 uppercase tracking-wide flex items-center gap-1.5">
                          <span>⏳</span> Pending Deposit Queue
                        </span>
                        <div className="mt-1.5 flex items-baseline justify-between gap-1 flex-wrap">
                          <span className="text-base sm:text-xl font-black text-amber-900 font-mono">
                            ₹{depPending.toLocaleString("en-IN")}
                          </span>
                          <span className="text-[10px] font-bold text-amber-800 bg-amber-50 px-2 py-0.5 rounded-full">
                            {depPendingCount} Requests
                          </span>
                        </div>
                      </div>

                      <div className="bg-white p-3 sm:p-4 rounded-2xl border border-blue-200/90 shadow-2xs">
                        <span className="text-[10px] sm:text-xs font-bold text-blue-700 uppercase tracking-wide flex items-center gap-1.5">
                           Unique Deposit Users
                        </span>
                        <div className="mt-1.5 flex items-baseline justify-between gap-1 flex-wrap">
                          <span className="text-base sm:text-xl font-black text-blue-900 font-mono">
                            {depUsers} Users
                          </span>
                          <span className="text-[10px] font-bold text-blue-700 bg-blue-50 px-2 py-0.5 rounded-full">
                            Depositors
                          </span>
                        </div>
                      </div>

                      <div className="bg-white p-3 sm:p-4 rounded-2xl border border-slate-200/90 shadow-2xs">
                        <span className="text-[10px] sm:text-xs font-bold text-slate-500 uppercase tracking-wide flex items-center gap-1.5">
                           Total Deposit Txns
                        </span>
                        <div className="mt-1.5 flex items-baseline justify-between gap-1 flex-wrap">
                          <span className="text-base sm:text-xl font-black text-slate-900 font-mono">
                            {activeItems.length} Txns
                          </span>
                          <span className="text-[10px] font-bold text-slate-600 bg-slate-100 px-2 py-0.5 rounded-full">
                            UPI & Bank
                          </span>
                        </div>
                      </div>
                    </div>
                  );
                })()}

                {capitalSubCategory === "profit" && (() => {
                  const profitTotal = activeItems.reduce((s, p) => s + Number(p.amount || 0), 0);
                  const profitUsers = new Set(activeItems.map(p => String(p.userId?._id || p.userId || "")).filter(Boolean)).size;

                  return (
                    <div className="grid grid-cols-2 lg:grid-cols-4 gap-2.5 sm:gap-3">
                      <div className="bg-white p-3 sm:p-4 rounded-2xl border border-emerald-200/90 shadow-2xs">
                        <span className="text-[10px] sm:text-xs font-bold text-emerald-700 uppercase tracking-wide flex items-center gap-1.5">
                           Total Distributed Profit
                        </span>
                        <div className="mt-1.5 flex items-baseline justify-between gap-1 flex-wrap">
                          <span className="text-base sm:text-xl font-black text-emerald-800 font-mono">
                            ₹{profitTotal.toLocaleString("en-IN")}
                          </span>
                          <span className="text-[10px] font-bold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-full">
                            Daily Yield
                          </span>
                        </div>
                      </div>

                      <div className="bg-white p-3 sm:p-4 rounded-2xl border border-blue-200/90 shadow-2xs">
                        <span className="text-[10px] sm:text-xs font-bold text-blue-700 uppercase tracking-wide flex items-center gap-1.5">
                           Beneficiary Accounts
                        </span>
                        <div className="mt-1.5 flex items-baseline justify-between gap-1 flex-wrap">
                          <span className="text-base sm:text-xl font-black text-blue-900 font-mono">
                            {profitUsers} Users
                          </span>
                          <span className="text-[10px] font-bold text-blue-700 bg-blue-50 px-2 py-0.5 rounded-full">
                            Credited
                          </span>
                        </div>
                      </div>

                      <div className="bg-white p-3 sm:p-4 rounded-2xl border border-purple-200/90 shadow-2xs">
                        <span className="text-[10px] sm:text-xs font-bold text-purple-700 uppercase tracking-wide flex items-center gap-1.5">
                           System Net Liquidity
                        </span>
                        <div className="mt-1.5 flex items-baseline justify-between gap-1 flex-wrap">
                          <span className="text-base sm:text-xl font-black text-purple-950 font-mono">
                            ₹{(capitalMetrics?.flow?.systemNetReserve !== undefined ? capitalMetrics.flow.systemNetReserve : 124500).toLocaleString("en-IN")}
                          </span>
                          <span className="text-[10px] font-bold text-purple-700 bg-purple-50 px-2 py-0.5 rounded-full">
                            Net Balance
                          </span>
                        </div>
                      </div>

                      <div className="bg-white p-3 sm:p-4 rounded-2xl border border-slate-200/90 shadow-2xs">
                        <span className="text-[10px] sm:text-xs font-bold text-slate-500 uppercase tracking-wide flex items-center gap-1.5">
                           Total Yield Entries
                        </span>
                        <div className="mt-1.5 flex items-baseline justify-between gap-1 flex-wrap">
                          <span className="text-base sm:text-xl font-black text-slate-900 font-mono">
                            {activeItems.length} Entries
                          </span>
                          <span className="text-[10px] font-bold text-slate-600 bg-slate-100 px-2 py-0.5 rounded-full">
                            Audit Log
                          </span>
                        </div>
                      </div>
                    </div>
                  );
                })()}

                {/* Detailed Interactive Ledger Breakdown Container */}
                <div className="bg-white rounded-2xl p-4 sm:p-6 border border-slate-200/90 shadow-sm space-y-4">
                  {/* Category Header Strip */}
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 border-b border-slate-100 pb-3.5">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-xl">{activeCategoryIcon}</span>
                      <h4 className="text-base sm:text-lg font-black text-slate-900 font-display">
                        {activeCategoryLabel}
                      </h4>
                      <span className="text-xs font-bold px-2.5 py-0.5 rounded-full bg-slate-100 text-slate-800 font-mono">
                        {activeItems.length} Entries
                      </span>
                    </div>
                    <div className="flex items-center gap-2 self-start sm:self-auto bg-slate-50 px-3 py-1.5 rounded-xl border border-slate-200/60">
                      <span className="text-xs text-slate-500 font-bold">Total In Filter:</span>
                      <span className="text-sm sm:text-base font-black text-slate-900 font-mono">
                        ₹{activeTotalAmount.toLocaleString("en-IN")}
                      </span>
                    </div>
                  </div>

                  {/* Empty state or item records */}
                  {activeItems.length === 0 ? (
                    <div className="p-8 text-center bg-slate-50 rounded-xl border border-dashed border-slate-200 space-y-2">
                      <div className="text-3xl"></div>
                      <p className="text-xs font-bold text-slate-600">
                        {capitalSearch || capitalTimeFilter !== "all"
                          ? "Is search filter ke mutabiq koi entry nahi mili."
                          : "Is category me abhi koi entry maujood nahi hai."}
                      </p>
                      {(capitalSearch || capitalTimeFilter !== "all") && (
                        <button
                          type="button"
                          onClick={() => {
                            setCapitalSearch("");
                            setCapitalTimeFilter("all");
                          }}
                          className="min-h-[44px] px-4 py-2 bg-blue-50 hover:bg-blue-100 text-blue-700 rounded-xl text-xs font-bold transition cursor-pointer active:scale-95"
                        >
                          Reset Filters
                        </button>
                      )}
                    </div>
                  ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
                      {activeItems.map((item, idx) => {
                        const userName = item.userId?.name || item.name || "Customer";
                        const userPhone = item.userId?.phone || item.phone || "—";
                        const itemDate = item.createdAt || item.approvedAt || item.startDate;
                        const dateFormatted = itemDate ? new Date(itemDate).toLocaleDateString("en-IN", {
                          day: "2-digit",
                          month: "short",
                          year: "numeric"
                        }) : "—";

                        if (capitalSubCategory === "loans") {
                          const sanctioned = Number(item.amount || 0);
                          const paid = Number(item.paidAmount || 0);
                          const remaining = Number(item.remainingAmount || 0);
                          const isClosed = item.status === "closed" || remaining <= 0;
                          return (
                            <div
                              key={item._id || idx}
                              className="p-4 bg-slate-50/70 hover:bg-slate-50 rounded-2xl border border-slate-200 transition space-y-2.5"
                            >
                              <div className="flex items-center justify-between gap-2">
                                <div className="flex items-center gap-2 min-w-0">
                                  <div className="w-8 h-8 rounded-full bg-blue-100 text-blue-700 font-black text-xs flex items-center justify-center shrink-0">
                                    {userName.charAt(0).toUpperCase()}
                                  </div>
                                  <div className="min-w-0">
                                    <h5 className="font-extrabold text-sm text-slate-900 truncate">{userName}</h5>
                                    <p className="text-[11px] text-slate-500 font-mono truncate">{userPhone}</p>
                                  </div>
                                </div>
                                <span className={`text-[10px] font-black px-2.5 py-0.5 rounded-full shrink-0 ${
                                  isClosed
                                    ? "bg-slate-200 text-slate-800"
                                    : item.status === "active"
                                    ? "bg-emerald-100 text-emerald-800 border border-emerald-200"
                                    : "bg-amber-100 text-amber-800"
                                }`}>
                                  {isClosed ? "✓ Closed" : item.status === "active" ? "Active" : "⏳ Pending"}
                                </span>
                              </div>

                              <div className="grid grid-cols-3 gap-2 bg-white p-2.5 rounded-xl border border-slate-100 text-center">
                                <div>
                                  <span className="text-[9px] text-slate-400 block font-bold uppercase">Sanctioned</span>
                                  <span className="text-xs sm:text-sm font-black text-slate-900 font-mono">₹{sanctioned.toLocaleString("en-IN")}</span>
                                </div>
                                <div>
                                  <span className="text-[9px] text-emerald-600 block font-bold uppercase">Recovered</span>
                                  <span className="text-xs sm:text-sm font-black text-emerald-700 font-mono">₹{paid.toLocaleString("en-IN")}</span>
                                </div>
                                <div>
                                  <span className="text-[9px] text-blue-600 block font-bold uppercase">Remaining</span>
                                  <span className="text-xs sm:text-sm font-black text-blue-800 font-mono">₹{remaining.toLocaleString("en-IN")}</span>
                                </div>
                              </div>

                              <div className="flex items-center justify-between text-[11px] text-slate-500 pt-1">
                                <span>{dateFormatted} · {item.tenureMonths || 12}M Tenor</span>
                                <button
                                  type="button"
                                  onClick={() => switchTab("loans")}
                                  className="text-blue-600 font-bold hover:underline cursor-pointer"
                                >
                                  Manage Loan →
                                </button>
                              </div>
                            </div>
                          );
                        }

                        if (capitalSubCategory === "investments") {
                          const principal = Number(item.principalAmount || 0);
                          const returns = Number(item.accruedInterest || 0);
                          return (
                            <div
                              key={item._id || idx}
                              className="p-4 bg-purple-50/30 hover:bg-purple-50/50 rounded-2xl border border-purple-100 transition space-y-2.5"
                            >
                              <div className="flex items-center justify-between gap-2">
                                <div className="flex items-center gap-2 min-w-0">
                                  <div className="w-8 h-8 rounded-full bg-purple-100 text-purple-700 font-black text-xs flex items-center justify-center shrink-0">
                                    {userName.charAt(0).toUpperCase()}
                                  </div>
                                  <div className="min-w-0">
                                    <h5 className="font-extrabold text-sm text-slate-900 truncate">{userName}</h5>
                                    <p className="text-[11px] text-slate-500 font-mono truncate">{userPhone}</p>
                                  </div>
                                </div>
                                <span className={`text-[10px] font-black px-2.5 py-0.5 rounded-full shrink-0 ${
                                  item.status === "active" ? "bg-purple-100 text-purple-800 border border-purple-200" : "bg-emerald-100 text-emerald-800"
                                }`}>
                                  {item.status === "active" ? "Active Bond" : "✓ Matured"}
                                </span>
                              </div>

                              <div className="grid grid-cols-2 gap-2 bg-white p-2.5 rounded-xl border border-purple-50">
                                <div>
                                  <span className="text-[9px] text-slate-400 block font-bold uppercase">Principal Invested</span>
                                  <span className="text-sm sm:text-base font-black text-slate-900 font-mono">₹{principal.toLocaleString("en-IN")}</span>
                                </div>
                                <div>
                                  <span className="text-[9px] text-purple-600 block font-bold uppercase">Yield / Profit</span>
                                  <span className="text-sm sm:text-base font-black text-purple-700 font-mono">+₹{returns.toLocaleString("en-IN")}</span>
                                </div>
                              </div>

                              <div className="flex items-center justify-between text-[11px] text-slate-500 pt-1">
                                <span className="truncate">{item.planName || "Fixed Growth Bond"} · {dateFormatted}</span>
                                <button
                                  type="button"
                                  onClick={() => switchTab("lending")}
                                  className="text-purple-600 font-bold hover:underline cursor-pointer shrink-0 ml-2"
                                >
                                  View Bond →
                                </button>
                              </div>
                            </div>
                          );
                        }

                        if (capitalSubCategory === "cashout") {
                          const withdrawAmt = Number(item.amount || 0);
                          const isPending = item.status === "pending";
                          const isApproved = item.status === "approved" || item.status === "completed";
                          return (
                            <div
                              key={item._id || idx}
                              className="p-4 bg-rose-50/30 hover:bg-rose-50/50 rounded-2xl border border-rose-100 transition space-y-2.5"
                            >
                              <div className="flex items-center justify-between gap-2">
                                <div className="flex items-center gap-2 min-w-0">
                                  <div className="w-8 h-8 rounded-full bg-rose-100 text-rose-700 font-black text-xs flex items-center justify-center shrink-0">
                                    {userName.charAt(0).toUpperCase()}
                                  </div>
                                  <div className="min-w-0">
                                    <h5 className="font-extrabold text-sm text-slate-900 truncate">{userName}</h5>
                                    <p className="text-[11px] text-slate-500 font-mono truncate">{userPhone}</p>
                                  </div>
                                </div>
                                <span className={`text-[10px] font-black px-2.5 py-0.5 rounded-full shrink-0 ${
                                  isApproved
                                    ? "bg-emerald-100 text-emerald-800"
                                    : isPending
                                    ? "bg-amber-100 text-amber-800 border border-amber-200"
                                    : "bg-rose-100 text-rose-800"
                                }`}>
                                  {isApproved ? "✓ Paid Out" : isPending ? "⏳ Pending Review" : "✕ Rejected"}
                                </span>
                              </div>

                              <div className="bg-white p-2.5 rounded-xl border border-rose-50 flex items-center justify-between">
                                <div>
                                  <span className="text-[9px] text-slate-400 block font-bold uppercase">Cashout Amount</span>
                                  <span className="text-base sm:text-lg font-black text-rose-700 font-mono">₹{withdrawAmt.toLocaleString("en-IN")}</span>
                                </div>
                                <div className="text-right">
                                  <span className="text-[9px] text-slate-400 block font-bold uppercase">Payout Mode</span>
                                  <span className="text-xs font-bold text-slate-700">
                                    {item.paymentDetails?.upiId ? `UPI: ${item.paymentDetails.upiId}` : item.paymentDetails?.accountNumber ? `A/C: ${item.paymentDetails.accountNumber}` : "Wallet Payout"}
                                  </span>
                                </div>
                              </div>

                              <div className="flex items-center justify-between text-[11px] text-slate-500 pt-1">
                                <span>{dateFormatted}</span>
                                {isPending && (
                                  <button
                                    type="button"
                                    onClick={() => switchTab("pending")}
                                    className="text-rose-600 font-bold hover:underline cursor-pointer"
                                  >
                                    Go to Pending Desk →
                                  </button>
                                )}
                              </div>
                            </div>
                          );
                        }

                        if (capitalSubCategory === "deposits") {
                          const depAmt = Number(item.amount || 0);
                          const isApproved = item.status === "approved" || item.status === "completed";
                          return (
                            <div
                              key={item._id || idx}
                              className="p-4 bg-emerald-50/30 hover:bg-emerald-50/50 rounded-2xl border border-emerald-100 transition space-y-2.5"
                            >
                              <div className="flex items-center justify-between gap-2">
                                <div className="flex items-center gap-2 min-w-0">
                                  <div className="w-8 h-8 rounded-full bg-emerald-100 text-emerald-700 font-black text-xs flex items-center justify-center shrink-0">
                                    {userName.charAt(0).toUpperCase()}
                                  </div>
                                  <div className="min-w-0">
                                    <h5 className="font-extrabold text-sm text-slate-900 truncate">{userName}</h5>
                                    <p className="text-[11px] text-slate-500 font-mono truncate">{userPhone}</p>
                                  </div>
                                </div>
                                <span className={`text-[10px] font-black px-2.5 py-0.5 rounded-full shrink-0 ${
                                  isApproved ? "bg-emerald-100 text-emerald-800" : "bg-amber-100 text-amber-800"
                                }`}>
                                  {isApproved ? "✓ Added to Wallet" : "⏳ Pending"}
                                </span>
                              </div>

                              <div className="bg-white p-2.5 rounded-xl border border-emerald-50 flex items-center justify-between">
                                <div>
                                  <span className="text-[9px] text-slate-400 block font-bold uppercase">Added Amount</span>
                                  <span className="text-base sm:text-lg font-black text-emerald-700 font-mono">₹{depAmt.toLocaleString("en-IN")}</span>
                                </div>
                                <div className="text-right">
                                  <span className="text-[9px] text-slate-400 block font-bold uppercase">UTR / Ref</span>
                                  <span className="text-xs font-mono font-bold text-slate-700">
                                    {item.utrNumber || item.referenceId || "Direct UPI"}
                                  </span>
                                </div>
                              </div>

                              <div className="flex items-center justify-between text-[11px] text-slate-500 pt-1">
                                <span>{dateFormatted}</span>
                                {(item.proofUrl || item.screenshotUrl) && (
                                  <a
                                    href={item.proofUrl || item.screenshotUrl}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="text-blue-600 font-bold hover:underline"
                                  >
                                    View Receipt ↗
                                  </a>
                                )}
                              </div>
                            </div>
                          );
                        }

                        // Profit
                        const profitAmt = Number(item.amount || 0);
                        return (
                          <div
                            key={item._id || idx}
                            className="p-4 bg-emerald-50/20 hover:bg-emerald-50/40 rounded-2xl border border-emerald-100 transition space-y-2.5"
                          >
                            <div className="flex items-center justify-between gap-2">
                              <div className="flex items-center gap-2 min-w-0">
                                <div className="w-8 h-8 rounded-full bg-emerald-100 text-emerald-800 font-black text-xs flex items-center justify-center shrink-0">
                                  {userName.charAt(0).toUpperCase()}
                                </div>
                                <div className="min-w-0">
                                  <h5 className="font-extrabold text-sm text-slate-900 truncate">{userName}</h5>
                                  <p className="text-[11px] text-slate-500 font-mono truncate">{userPhone}</p>
                                </div>
                              </div>
                              <span className="text-[10px] font-black px-2.5 py-0.5 rounded-full bg-emerald-100 text-emerald-800">
                                ✓ Credited
                              </span>
                            </div>

                            <div className="bg-white p-2.5 rounded-xl border border-emerald-50 flex items-center justify-between">
                              <div>
                                <span className="text-[9px] text-slate-400 block font-bold uppercase">Yield Distributed</span>
                                <span className="text-base sm:text-lg font-black text-emerald-700 font-mono">+₹{profitAmt.toLocaleString("en-IN")}</span>
                              </div>
                              <div className="text-right">
                                <span className="text-[9px] text-slate-400 block font-bold uppercase">Type</span>
                                <span className="text-xs font-bold text-slate-700">
                                  {item.type === "daily_yield" ? "12% Daily APY" : item.type || "Profit Distribution"}
                                </span>
                              </div>
                            </div>

                            <div className="text-[11px] text-slate-500 pt-1">
                              {dateFormatted}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              </div>
            );
          })()}

          {/* ══════════════════════════════════════════════════════
              PROFIT & RESERVES ANALYTICS VIEW
          ══════════════════════════════════════════════════════ */}
          {tab === "analytics" && (
            <div className="space-y-6 w-full min-w-0">
              {/* Quick Actions Bar */}
              <div className="flex items-center justify-end -mb-2">
                <button
                  type="button"
                  onClick={async () => {
                    apiCache.clear();
                    try { appCache.remove("educa_admin_cached_analytics"); } catch {}
                    try { localStorage.removeItem("educa_admin_cached_analytics"); } catch {}
                    showToast("Refreshing live analytics...", "info");
                    await Promise.all([loadAnalytics(true), loadStats(true)]);
                    showToast("Live analytics updated!", "success");
                  }}
                  disabled={loadingAnalytics}
                  className="px-2.5 py-1 bg-white hover:bg-slate-50 text-slate-600 rounded-lg text-xs font-semibold border border-slate-200 transition active:scale-95 cursor-pointer shadow-2xs"
                  title="Refresh Data"
                >
                  {loadingAnalytics ? "Refreshing..." : "Refresh"}
                </button>
              </div>

              {/* Interactive Visual SVG Chart Card */}
              <div className="bg-white rounded-3xl p-5 sm:p-7 border border-gray-100 shadow-sm">
                <div className="flex flex-col md:flex-row md:items-center justify-between pb-4 border-b border-gray-100 gap-3">
                  <div>
                    <h3 className="text-lg font-black font-display text-gray-900 flex items-center gap-2">
                       Daily Profit & Capital Growth Chart
                    </h3>
                    <p className="text-xs text-gray-500">
                      Compounding 12% p.a. savings yield credited daily to active customer accounts (1% monthly ÷ calendar days)
                    </p>
                  </div>

                  <div className="flex items-center gap-2 flex-wrap">
                    {/* Compact Date Range Filter */}
                    <div className="flex items-center gap-0.5 p-1 bg-gray-100 rounded-xl shrink-0">
                      {[
                        { id: "today", label: "Today" },
                        { id: "5d", label: "5D" },
                        { id: "7d", label: "7D" },
                        { id: "15d", label: "15D" },
                        { id: "all", label: "All" }
                      ].map((r) => (
                        <button
                          key={r.id}
                          type="button"
                          onClick={() => setChartRange(r.id)}
                          className={`px-2.5 py-1 text-xs font-bold rounded-lg transition cursor-pointer ${
                            chartRange === r.id
                              ? "bg-white text-blue-700 shadow-xs font-black"
                              : "text-gray-500 hover:text-gray-900"
                          }`}
                          title={`Show ${r.label} Data`}
                        >
                          {r.label}
                        </button>
                      ))}
                    </div>

                    {/* Mode Switcher */}
                    <div className="flex items-center gap-1 p-1 bg-gray-100 rounded-xl shrink-0">
                      <button
                        type="button"
                        onClick={() => setChartMode("daily")}
                        className={`px-3 py-1 text-xs font-bold rounded-lg transition cursor-pointer ${
                          chartMode === "daily" ? "bg-white text-blue-700 shadow-xs font-black" : "text-gray-500 hover:text-gray-900"
                        }`}
                      >
                        Daily Yield
                      </button>
                      <button
                        type="button"
                        onClick={() => setChartMode("cumulative")}
                        className={`px-3 py-1 text-xs font-bold rounded-lg transition cursor-pointer ${
                          chartMode === "cumulative" ? "bg-white text-blue-700 shadow-xs font-black" : "text-gray-500 hover:text-gray-900"
                        }`}
                      >
                        Cumulative
                      </button>
                    </div>
                  </div>
                </div>

                {/* SVG Visual Chart */}
                <div className="mt-6">
                  {(() => {
                    const rawChartData = analytics?.dailyProfitChart || [];

                    if (!rawChartData || rawChartData.length === 0) {
                      return (
                        <div className="py-14 flex flex-col items-center justify-center text-center bg-gray-50/50 rounded-3xl border border-dashed border-gray-200">
                          <div className="w-14 h-14 rounded-2xl bg-blue-50 text-blue-600 flex items-center justify-center mb-3 shadow-xs">
                            <svg className="w-7 h-7 text-blue-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                            </svg>
                          </div>
                          <p className="font-extrabold text-gray-800 text-sm">
                            {loadingAnalytics ? "Live Profit Data Sync Ho Raha Hai..." : "No Profit Yield History Yet"}
                          </p>
                          <p className="text-xs text-gray-400 mt-1 max-w-sm">
                            {loadingAnalytics ? "Server se taaza record load ho raha hai, kripya thoda wait karein..." : "Daily interest calculations will automatically plot here as customer balances accrue yield."}
                          </p>
                        </div>
                      );
                    }

                    // Slice data based on selected range filter (default: today)
                    const data = (() => {
                      if (chartRange === "today") return rawChartData.slice(-1);
                      if (chartRange === "5d") return rawChartData.slice(-5);
                      if (chartRange === "7d") return rawChartData.slice(-7);
                      if (chartRange === "15d") return rawChartData.slice(-15);
                      return rawChartData;
                    })();

                    const isDaily = chartMode === "daily";

                    // Dynamic ceiling with nice human steps
                    const rawValues = data.map(d => isDaily ? Number(d.amount || 0) : Number(d.cumulativeYield || 0));
                    const maxDataVal = Math.max(...rawValues, 1);

                    const targetCeil = Math.max(maxDataVal * 1.25, 5);
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
                    const chartH = 260;
                    const padLeft = 65;
                    const padRight = 35;
                    const padTop = 38;
                    const padBottom = 48;
                    const plotW = chartW - padLeft - padRight;
                    const plotH = chartH - padTop - padBottom;

                    const slotW = plotW / Math.max(1, data.length);
                    const getXCenter = (index) => padLeft + (index + 0.5) * slotW;

                    // Point coordinates for line / area
                    const points = data.map((d, i) => {
                      const val = isDaily ? Number(d.amount || 0) : Number(d.cumulativeYield || 0);
                      const x = getXCenter(i);
                      const y = padTop + plotH - (val / maxVal) * plotH;
                      return { x, y, ...d, val };
                    });

                    const linePath = points.map((p, i) => `${i === 0 ? "M" : "L"} ${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(" ");
                    const areaPath = points.length > 0
                      ? `${linePath} L ${points[points.length - 1].x.toFixed(1)} ${padTop + plotH} L ${points[0].x.toFixed(1)} ${padTop + plotH} Z`
                      : "";

                    return (
                      <div className="w-full overflow-x-auto no-scrollbar">
                        <svg viewBox={`0 0 ${chartW} ${chartH}`} className="w-full min-w-[580px] h-auto select-none">
                          <defs>
                            <linearGradient id="barGrad" x1="0" y1="0" x2="0" y2="1">
                              <stop offset="0%" stopColor="#2563EB" />
                              <stop offset="70%" stopColor="#3B82F6" />
                              <stop offset="100%" stopColor="#60A5FA" stopOpacity="0.85" />
                            </linearGradient>
                            <linearGradient id="barGradHover" x1="0" y1="0" x2="0" y2="1">
                              <stop offset="0%" stopColor="#1D4ED8" />
                              <stop offset="100%" stopColor="#2563EB" />
                            </linearGradient>

                            <linearGradient id="areaGrad" x1="0" y1="0" x2="0" y2="1">
                              <stop offset="0%" stopColor="#2563EB" stopOpacity="0.25" />
                              <stop offset="60%" stopColor="#3B82F6" stopOpacity="0.08" />
                              <stop offset="100%" stopColor="#93C5FD" stopOpacity="0.0" />
                            </linearGradient>

                            <filter id="lineGlow" x="-20%" y="-20%" width="140%" height="140%">
                              <feGaussianBlur stdDeviation="2.5" result="blur" />
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
                                  x={padLeft - 10}
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
                              const barW = Math.min(54, Math.max(22, slotW * 0.45));
                              const amount = Number(d.amount || 0);
                              const barH = Math.max((amount / maxVal) * plotH, 6);
                              const xCenter = getXCenter(i);
                              const x = xCenter - barW / 2;
                              const y = padTop + plotH - barH;
                              const isHovered = hoveredChartBar?.date === d.date;
                              const isLatest = i === data.length - 1;
                              const showBadge = data.length <= 7 || isHovered || (!hoveredChartBar && isLatest);

                              return (
                                <g
                                  key={d.date}
                                  className="cursor-pointer group"
                                  onMouseEnter={() => setHoveredChartBar(d)}
                                  onClick={() => setHoveredChartBar(d)}
                                >
                                  {/* Background Track Column */}
                                  <rect
                                    x={xCenter - slotW * 0.42}
                                    y={padTop}
                                    width={slotW * 0.84}
                                    height={plotH}
                                    rx={8}
                                    fill={isHovered ? "#EFF6FF" : "transparent"}
                                    className="transition-colors duration-150"
                                  />

                                  {/* Active Value Bar */}
                                  <rect
                                    x={x}
                                    y={y}
                                    width={barW}
                                    height={barH}
                                    rx={Math.min(8, barW / 3)}
                                    fill={isHovered ? "url(#barGradHover)" : "url(#barGrad)"}
                                    className="transition-all duration-200"
                                  />

                                  {/* Floating Value Capsule (Non-overlapping: only shown if <=7 days or hovered or latest) */}
                                  {showBadge && (
                                    <g transform={`translate(${xCenter}, ${Math.max(padTop + 14, y - 14)})`}>
                                      <rect
                                        x="-34"
                                        y="-11"
                                        width="68"
                                        height="20"
                                        rx="10"
                                        fill={isHovered ? "#1E3A8A" : "#EFF6FF"}
                                        stroke={isHovered ? "#1E3A8A" : "#BFDBFE"}
                                        strokeWidth="1"
                                        filter="url(#pillShadow)"
                                        className="transition-colors duration-150"
                                      />
                                      <text
                                        x="0"
                                        y="3"
                                        textAnchor="middle"
                                        className={`text-[11px] font-black font-mono ${
                                          isHovered ? "fill-white" : "fill-blue-700"
                                        }`}
                                      >
                                        +₹{amount.toFixed(0)}
                                      </text>
                                    </g>
                                  )}

                                  {/* Floor Date Label */}
                                  <text
                                    x={xCenter}
                                    y={padTop + plotH + 20}
                                    textAnchor="middle"
                                    className={`text-[12px] font-black transition-colors duration-150 ${
                                      isHovered ? "fill-blue-700" : "fill-slate-700"
                                    }`}
                                  >
                                    {d.displayDate}
                                  </text>
                                  <text
                                    x={xCenter}
                                    y={padTop + plotH + 34}
                                    textAnchor="middle"
                                    className={`text-[10px] font-bold ${
                                      isLatest ? "fill-emerald-600 font-extrabold" : "fill-slate-400"
                                    }`}
                                  >
                                    {isLatest ? "Today" : `Day ${i + 1}`}
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
                                  stroke="#E2E8F0"
                                  strokeWidth="1"
                                  strokeDasharray="3 3"
                                />
                              ))}

                              {/* Area Fill */}
                              <path d={areaPath} fill="url(#areaGrad)" />

                              {/* Solid Glowing Line */}
                              <path
                                d={linePath}
                                fill="none"
                                stroke="#2563EB"
                                strokeWidth="3.5"
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                filter="url(#lineGlow)"
                              />

                              {/* Interactive Nodes & Value Badges */}
                              {points.map((p, i) => {
                                const isHovered = hoveredChartBar?.date === p.date;
                                const isLatest = i === points.length - 1;
                                const showBadge = data.length <= 7 || isHovered || (!hoveredChartBar && isLatest);

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
                                      r={isHovered ? 12 : (isLatest ? 9 : 7)}
                                      fill="rgba(37, 99, 235, 0.15)"
                                      className="transition-all duration-150"
                                    />
                                    {/* Center Core Circle */}
                                    <circle
                                      cx={p.x}
                                      cy={p.y}
                                      r={isHovered ? 6 : (isLatest ? 5 : 4)}
                                      fill={isHovered ? "#1E3A8A" : "#2563EB"}
                                      stroke="#FFFFFF"
                                      strokeWidth="2.5"
                                      className="transition-all duration-150"
                                    />

                                    {/* Floating Cumulative Value Badge (Never collides) */}
                                    {showBadge && (
                                      <g transform={`translate(${p.x}, ${Math.max(padTop + 14, p.y - 16)})`}>
                                        <rect
                                          x="-36"
                                          y="-11"
                                          width="72"
                                          height="20"
                                          rx="10"
                                          fill={isHovered ? "#0F172A" : "#2563EB"}
                                          filter="url(#pillShadow)"
                                          className="transition-colors duration-150"
                                        />
                                        <text
                                          x="0"
                                          y="3"
                                          textAnchor="middle"
                                          className="text-[11px] font-black fill-white font-mono"
                                        >
                                          ₹{Number(p.val).toLocaleString("en-IN", { maximumFractionDigits: 0 })}
                                        </text>
                                      </g>
                                    )}

                                    {/* Floor Date Label */}
                                    <text
                                      x={p.x}
                                      y={padTop + plotH + 20}
                                      textAnchor="middle"
                                      className={`text-[12px] font-black transition-colors duration-150 ${
                                        isHovered ? "fill-blue-700" : "fill-slate-700"
                                      }`}
                                    >
                                      {p.displayDate}
                                    </text>
                                    <text
                                      x={p.x}
                                      y={padTop + plotH + 34}
                                      textAnchor="middle"
                                      className={`text-[10px] font-bold ${
                                        isLatest ? "fill-emerald-600 font-extrabold" : "fill-slate-400"
                                      }`}
                                    >
                                      {isLatest ? "Today" : `Day ${i + 1}`}
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

                {/* Hover / Active Day Details Card */}
                {(() => {
                  const rawChartData = analytics?.dailyProfitChart || [];
                  const activeRangeData = (() => {
                    if (chartRange === "today") return rawChartData.slice(-1);
                    if (chartRange === "5d") return rawChartData.slice(-5);
                    if (chartRange === "7d") return rawChartData.slice(-7);
                    if (chartRange === "15d") return rawChartData.slice(-15);
                    return rawChartData;
                  })();

                  const activeBar = hoveredChartBar
                    ? (activeRangeData.find(d => d.date === hoveredChartBar.date) || hoveredChartBar)
                    : (activeRangeData.length > 0 ? activeRangeData[activeRangeData.length - 1] : null);

                  if (!activeBar) return null;

                  return (
                    <div className="mt-5 p-4 bg-slate-50 border border-slate-200/80 rounded-2xl flex flex-col sm:flex-row sm:items-center justify-between gap-4 text-xs">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-xl bg-blue-100/70 text-blue-700 flex items-center justify-center font-black text-sm shrink-0">
                          📅
                        </div>
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="font-extrabold text-slate-900 text-sm">{activeBar.displayDate}</span>
                            <span className="text-[10px] font-extrabold text-emerald-700 bg-emerald-100/80 px-2 py-0.5 rounded-md border border-emerald-300/40">
                              ● 12% p.a. Active
                            </span>
                          </div>
                          <p className="text-[11px] text-slate-500 mt-0.5">Automated compounding yield snapshot</p>
                        </div>
                      </div>

                      <div className="grid grid-cols-3 gap-3 sm:gap-6 border-t sm:border-t-0 pt-3 sm:pt-0 border-slate-200">
                        <div>
                          <span className="text-slate-500 text-[10px] block font-bold">Day's Profit</span>
                          <span className="font-black text-emerald-600 text-sm font-mono">
                            +₹{Number(activeBar.amount).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                          </span>
                        </div>
                        <div>
                          <span className="text-slate-500 text-[10px] block font-bold">Total Accrued</span>
                          <span className="font-black text-blue-600 text-sm font-mono">
                            ₹{Number(activeBar.cumulativeYield).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                          </span>
                        </div>
                        <div>
                          <span className="text-slate-500 text-[10px] block font-bold">Total Capital</span>
                          <span className="font-black text-slate-900 text-sm font-mono">
                            ₹{Number(activeBar.cumulativeDeposit !== undefined ? activeBar.cumulativeDeposit : (activeBar.estimatedCapital || 0)).toLocaleString("en-IN")}
                          </span>
                        </div>
                      </div>
                    </div>
                  );
                })()}
              </div>

              {/* ══════════════════════════════════════════════════════
                  GROWTH BREAKDOWN: "KAHAN SE KITNA BADHA KAISE BADHA"
              ══════════════════════════════════════════════════════ */}
              <div className="w-full">
                {/* Capital Sources Breakdown (Redesigned with Apple Design Craft) */}
                <div className="bg-white rounded-3xl p-6 border border-gray-100 shadow-sm space-y-5">
                  <div className="flex items-center justify-between pb-3 border-b border-gray-100">
                    <h3 className="text-base font-black font-display text-gray-900 flex items-center gap-2">
                      <span className="text-lg"></span> Capital Allocation & Sources
                    </h3>
                    <span className="text-xs font-bold font-mono text-gray-500 bg-gray-50 px-2.5 py-1 rounded-xl border border-gray-200">
                      Total Pool: ₹{Number(totalDepositsDisplay > 0 ? (totalDepositsDisplay + totalProfitBase) : (analytics?.stats?.netFintechReserve || stats?.netFintechReserve || cachedReserves || 0)).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
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
                              <div className="w-10 h-10 rounded-xl bg-emerald-50 border border-emerald-100 text-emerald-600 flex items-center justify-center shrink-0">
                                <svg className="w-5 h-5 text-emerald-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 14l-7 7m0 0l-7-7m7 7V3" />
                                </svg>
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
                              <div className="w-10 h-10 rounded-xl bg-blue-50 border border-blue-100 text-blue-600 flex items-center justify-center shrink-0">
                                <svg className="w-5 h-5 text-blue-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" />
                                </svg>
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
              </div>

              {/* ══════════════════════════════════════════════════════
                  DAY-BY-DAY PROFIT LEDGER: "KOUN DIN KITNA ADD HUWA"
              ══════════════════════════════════════════════════════ */}
              <div className="bg-white rounded-3xl p-6 border border-gray-100 shadow-sm">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-4 border-b border-gray-100 mb-4 gap-3">
                  <div>
                    <h3 className="text-base font-black font-display text-gray-900 flex items-center gap-2">
                       Day-by-Day Profit Breakdown Ledger
                    </h3>
                    <p className="text-xs text-gray-500">Har din ka alag-alag credit record date aur remarks ke sath</p>
                  </div>
                  <div className="flex items-center gap-2 flex-wrap">
                    {/* Compact Date Range Filter */}
                    <div className="flex items-center gap-0.5 p-1 bg-gray-100 rounded-xl shrink-0">
                      {[
                        { id: "today", label: "Today" },
                        { id: "5d", label: "5D" },
                        { id: "7d", label: "7D" },
                        { id: "15d", label: "15D" },
                        { id: "all", label: "All" }
                      ].map((r) => (
                        <button
                          key={r.id}
                          type="button"
                          onClick={() => setChartRange(r.id)}
                          className={`px-2.5 py-1 text-xs font-bold rounded-lg transition cursor-pointer ${
                            chartRange === r.id
                              ? "bg-white text-blue-700 shadow-xs font-black"
                              : "text-gray-500 hover:text-gray-900"
                          }`}
                          title={`Show ${r.label} Ledger`}
                        >
                          {r.label}
                        </button>
                      ))}
                    </div>
                    <span className="text-xs font-black text-emerald-600 bg-emerald-50 px-2.5 py-1 rounded-full border border-emerald-200">
                      {visibleLedgerData.length} Days Showing
                    </span>
                  </div>
                </div>

                {/* MOBILE CARD LIST (NO HORIZONTAL SCROLL) */}
                <div className="sm:hidden space-y-2.5">
                  {(!visibleLedgerData || visibleLedgerData.length === 0) ? (
                    <div className="py-8 text-center text-gray-400 text-xs font-medium bg-slate-50 rounded-xl border border-slate-200">
                      {loadingAnalytics ? "Live ledger sync ho raha hai..." : "Koi daily profit yield abhi tak record nahi hua hai."}
                    </div>
                  ) : (
                    visibleLedgerData.map((row, idx) => {
                      const isToday = row.date === (analytics?.dailyProfitChart?.[analytics.dailyProfitChart.length - 1]?.date);
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
                              {isToday ? "Live Crediting" : "✓ Credited"}
                            </span>
                          </div>

                          {/* Din Ke Hisaab Se Total Deposit Banner */}
                          <div className="p-2.5 bg-slate-50 rounded-xl border border-slate-200/80 flex items-center justify-between text-xs">
                            <div className="flex items-center gap-2">
                              <span className="text-base"></span>
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
                                <span>Approved Deposits ({depositsList.length}):</span>
                                <span>12% p.a. Calculation</span>
                              </div>
                              {depositsList.map((dep, dIdx) => (
                                <div key={dep.id || dIdx} className="p-2.5 bg-white rounded-lg border border-blue-100 text-[11px] space-y-1.5 shadow-2xs">
                                  <div className="flex items-center justify-between">
                                    <div className="flex items-center gap-1.5 font-bold text-slate-800">
                                      <span className="text-[10px] text-slate-400 font-mono">{dep.time || "Approved"}</span>
                                      <span>•</span>
                                      <span className="text-slate-900 font-extrabold flex items-center gap-1">
                                        
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
                                      {dep.userPhone && <span>{dep.userPhone}</span>}
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
                                        <span>View Receipt Photo </span>
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
                                  <LiveAdminProfitTicker baseProfit={rowCumulative} deposits={totalDepositsDisplay} />
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
                      {(!visibleLedgerData || visibleLedgerData.length === 0) ? (
                        <tr>
                          <td colSpan="5" className="py-8 text-center text-gray-400 font-medium">
                            {loadingAnalytics ? "Live ledger sync ho raha hai..." : "Koi daily profit yield abhi tak record nahi hua hai."}
                          </td>
                        </tr>
                      ) : (
                        visibleLedgerData.map((row, idx) => {
                          const isToday = row.date === (analytics?.dailyProfitChart?.[analytics.dailyProfitChart.length - 1]?.date);
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
                                      <LiveAdminProfitTicker baseProfit={rowCumulative} deposits={totalDepositsDisplay} />
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
                                                
                                                <span className="truncate">{dep.userName || dep.user || "Depositor"}</span>
                                              </span>
                                              <span className="font-mono font-black text-emerald-600 shrink-0 ml-2">
                                                +₹{Number(dep.amount).toLocaleString("en-IN")}
                                              </span>
                                            </div>
                                            <div className="flex items-center justify-between text-[11px] text-slate-500 font-mono">
                                              <span>{dep.time || "Approved"}</span>
                                              <span>{dep.rateText || "12% p.a."}</span>
                                            </div>
                                            {(dep.utrNumber || dep.utr) && (
                                              <p className="text-[10px] text-slate-600 font-mono truncate">
                                                UTR: <strong className="text-slate-800">{dep.utrNumber || dep.utr}</strong>
                                              </p>
                                            )}
                                            {(dep.userPhone || dep.accountNumber) && (
                                              <div className="flex items-center justify-between text-[10px] text-slate-400 font-mono">
                                                {dep.userPhone && <span>{dep.userPhone}</span>}
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
                                                  <span>View Receipt Photo </span>
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
                  <span className="text-xl"></span>
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
                  Update UPI / Bank
                </button>
              </div>

              {/* Sub-Navigation: Active Deposits vs Loans vs Bonds vs On Hold (Duplicate UTR) */}
              <div className="flex flex-wrap items-center justify-between gap-3 mb-5 border-b border-gray-100 pb-3">
                <div className="flex flex-wrap items-center gap-1.5 bg-slate-100 p-1 rounded-2xl w-full sm:w-auto">
                  <button
                    type="button"
                    onClick={() => setPendingSubTab("active")}
                    className={`flex-1 sm:flex-initial px-3.5 py-2 rounded-xl text-xs font-black transition cursor-pointer flex items-center justify-center gap-1.5 ${
                      pendingSubTab === "active"
                        ? "bg-white text-slate-900 shadow-xs"
                        : "text-slate-500 hover:text-slate-900"
                    }`}
                  >
                    <span>Deposits ({pending.length})</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      setPendingSubTab("loans");
                      loadLoans(true);
                    }}
                    className={`flex-1 sm:flex-initial px-3.5 py-2 rounded-xl text-xs font-black transition cursor-pointer flex items-center justify-center gap-1.5 ${
                      pendingSubTab === "loans"
                        ? "bg-blue-600 text-white shadow-xs"
                        : "text-blue-700 hover:text-blue-900 hover:bg-blue-50"
                    }`}
                  >
                    <span>Loans</span>
                    <span className={`px-2 py-0.5 rounded-full text-[10px] font-black ${
                      pendingLoans.length > 0
                        ? pendingSubTab === "loans"
                          ? "bg-white text-blue-900 animate-pulse"
                          : "bg-blue-100 text-blue-900 animate-pulse border border-blue-300"
                        : "bg-slate-200 text-slate-600"
                    }`}>
                      {pendingLoans.length}
                    </span>
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      setPendingSubTab("bonds");
                      loadBonds(true);
                    }}
                    className={`flex-1 sm:flex-initial px-3.5 py-2 rounded-xl text-xs font-black transition cursor-pointer flex items-center justify-center gap-1.5 ${
                      pendingSubTab === "bonds"
                        ? "bg-indigo-600 text-white shadow-xs"
                        : "text-indigo-700 hover:text-indigo-900 hover:bg-indigo-50"
                    }`}
                  >
                    <span>Bonds</span>
                    <span className={`px-2 py-0.5 rounded-full text-[10px] font-black ${
                      pendingBonds.length > 0
                        ? pendingSubTab === "bonds"
                          ? "bg-white text-indigo-900 animate-pulse"
                          : "bg-indigo-100 text-indigo-900 animate-pulse border border-indigo-300"
                        : "bg-slate-200 text-slate-600"
                    }`}>
                      {pendingBonds.length}
                    </span>
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      setPendingSubTab("hold");
                      loadHoldData(true);
                    }}
                    className={`flex-1 sm:flex-initial px-3.5 py-2 rounded-xl text-xs font-black transition cursor-pointer flex items-center justify-center gap-1.5 ${
                      pendingSubTab === "hold"
                        ? "bg-rose-600 text-white shadow-xs"
                        : "text-rose-600 hover:text-rose-800 hover:bg-rose-50"
                    }`}
                  >
                    <span>On Hold</span>
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

                  <button
                    type="button"
                    onClick={() => {
                      setPendingSubTab("approved");
                      loadApprovedRequests(true);
                    }}
                    className={`flex-1 sm:flex-initial px-3.5 py-2 rounded-xl text-xs font-black transition cursor-pointer flex items-center justify-center gap-1.5 ${
                      pendingSubTab === "approved"
                        ? "bg-emerald-600 text-white shadow-xs"
                        : "text-emerald-700 hover:text-emerald-900 hover:bg-emerald-50"
                    }`}
                  >
                    <span>Approved Requests</span>
                    <span className={`px-2 py-0.5 rounded-full text-[10px] font-black ${
                      approvedRequests.length > 0
                        ? pendingSubTab === "approved"
                          ? "bg-white text-emerald-900"
                          : "bg-emerald-100 text-emerald-900 border border-emerald-300"
                        : "bg-slate-200 text-slate-600"
                    }`}>
                      {approvedRequests.length}
                    </span>
                  </button>
                </div>

                <div className="flex items-center gap-2 text-xs">
                  <button
                    type="button"
                    onClick={() => {
                      if (pendingSubTab === "hold") loadHoldData(true);
                      else if (pendingSubTab === "loans") loadLoans(true);
                      else if (pendingSubTab === "bonds") loadBonds(true);
                      else if (pendingSubTab === "approved") loadApprovedRequests(true);
                      else loadPending(true);
                    }}
                    className="px-3 py-1.5 bg-white hover:bg-slate-50 border border-slate-200 text-slate-700 font-bold rounded-xl text-xs transition cursor-pointer flex items-center gap-1 shadow-2xs"
                  >
                    <span>Refresh</span>
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
                    pendingLoans.length > 0 ? (
                      <div className="p-6 bg-blue-50/70 border-2 border-blue-200 rounded-2xl space-y-3">
                        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                          <div className="flex items-center gap-3">
                            <span className="text-3xl"></span>
                            <div>
                              <h4 className="font-black text-slate-900 text-sm sm:text-base">
                                {pendingLoans.length} Loan Application(s) Approval ke liye pending hain!
                              </h4>
                              <p className="text-xs text-blue-700 font-medium">
                                Deposits / Withdrawals zero hain, par {pendingLoans.length} customer(s) ke loan approval ka intezar hai.
                              </p>
                            </div>
                          </div>
                          <button
                            type="button"
                            onClick={() => setPendingSubTab("loans")}
                            className="min-h-[44px] px-5 py-2.5 bg-blue-600 hover:bg-blue-700 text-white font-black text-xs rounded-xl shadow-xs transition cursor-pointer flex items-center justify-center gap-2 self-start sm:self-auto active:scale-95"
                          >
                            <span>Open Pending Loans Desk ({pendingLoans.length})</span>
                            <span>→</span>
                          </button>
                        </div>
                      </div>
                    ) : (
                      <div className="py-10 text-center space-y-3 border-2 border-dashed border-gray-100 rounded-3xl bg-slate-50/50">
                        <span className="text-4xl block"></span>
                        <p className="font-extrabold text-gray-800 text-sm">No Pending Transactions</p>
                        <p className="text-xs text-gray-400">Sabhi deposit aur withdrawal requests process ho chuki hain.</p>
                        {pendingBonds.length > 0 && (
                          <div className="pt-2 flex flex-wrap items-center justify-center gap-2">
                            <button
                              type="button"
                              onClick={() => setPendingSubTab("bonds")}
                              className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs rounded-xl shadow-xs transition cursor-pointer"
                            >
                              {pendingBonds.length} Pending Bond(s) Dekhein
                            </button>
                          </div>
                        )}
                      </div>
                    )
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
                                        View Receipt 
                                      </button>
                                    </div>
                                  )}
                                  {t.paymentDetails?.upiId && (
                                    <div className="flex items-center gap-1.5 text-[11px] font-semibold text-gray-800 mt-1">
                                      <span className="text-gray-500 font-normal">UPI:</span>
                                      <span className="font-mono">{t.paymentDetails.upiId}</span>
                                      <button
                                        type="button"
                                        onClick={() => { navigator.clipboard?.writeText(t.paymentDetails.upiId); showToast("UPI ID Copied!", "success"); }}
                                        className="text-[10px] text-blue-600 hover:text-blue-800 cursor-pointer px-1 py-0.2 bg-blue-50 rounded border border-blue-200"
                                      >
                                        Copy
                                      </button>
                                    </div>
                                  )}
                                  {t.paymentDetails?.qrCodeUrl && (
                                    <div className="flex items-center gap-2 mt-1 p-1 bg-purple-50/70 border border-purple-200 rounded-lg">
                                      <img
                                        src={t.paymentDetails.qrCodeUrl}
                                        alt="User QR"
                                        onClick={() => { setLightboxImg(t.paymentDetails.qrCodeUrl); setZoomLevel(1); }}
                                        className="w-8 h-8 object-contain bg-white rounded border border-purple-200 cursor-zoom-in hover:scale-105 transition"
                                      />
                                      <button
                                        type="button"
                                        onClick={() => { setLightboxImg(t.paymentDetails.qrCodeUrl); setZoomLevel(1); }}
                                        className="text-[11px] text-purple-700 hover:text-purple-900 font-bold underline cursor-pointer"
                                      >
                                        User QR Code 
                                      </button>
                                    </div>
                                  )}
                                  {t.paymentDetails?.accountNumber && (
                                    <div className="text-[11px] text-gray-600 mt-1 font-mono">
                                      A/C: {t.paymentDetails.accountNumber} {t.paymentDetails.ifsc ? `(${t.paymentDetails.ifsc})` : ""}
                                    </div>
                                  )}
                                </td>
                                <td className="py-3">
                                  <div className="flex gap-2">
                                    <button onClick={() => approve(t)} className="px-3 py-1.5 bg-green-500 text-white rounded-lg text-xs font-bold hover:bg-green-600 cursor-pointer active:scale-95 transition">✓ Approve</button>
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
                                  Zoom
                                </button>
                              </div>
                            )}
                            {t.paymentDetails?.upiId && (
                              <div className="flex items-center justify-between p-2 bg-slate-50 border border-slate-200 rounded-xl text-xs">
                                <span className="text-gray-500 font-medium">UPI ID:</span>
                                <div className="flex items-center gap-1.5 font-mono font-bold text-slate-800">
                                  <span>{t.paymentDetails.upiId}</span>
                                  <button
                                    type="button"
                                    onClick={() => { navigator.clipboard?.writeText(t.paymentDetails.upiId); showToast("UPI ID Copied!", "success"); }}
                                    className="text-[10px] text-blue-600 px-1.5 py-0.5 bg-blue-50 border border-blue-200 rounded font-bold"
                                  >
                                    Copy
                                  </button>
                                </div>
                              </div>
                            )}
                            {t.paymentDetails?.qrCodeUrl && (
                              <div className="p-2 bg-purple-50/60 border border-purple-200 rounded-xl flex items-center justify-between">
                                <div className="flex items-center gap-2">
                                  <img
                                    src={t.paymentDetails.qrCodeUrl}
                                    alt="User QR"
                                    onClick={() => { setLightboxImg(t.paymentDetails.qrCodeUrl); setZoomLevel(1); }}
                                    className="w-10 h-10 object-contain bg-white rounded-lg border border-purple-200 cursor-zoom-in"
                                  />
                                  <div>
                                    <span className="text-xs font-bold text-purple-900 block">User Payment QR</span>
                                    <span className="text-[10px] text-purple-700">Scan to pay borrower</span>
                                  </div>
                                </div>
                                <button
                                  type="button"
                                  onClick={() => { setLightboxImg(t.paymentDetails.qrCodeUrl); setZoomLevel(1); }}
                                  className="px-2 py-1 bg-white text-purple-700 border border-purple-200 rounded-lg text-xs font-bold"
                                >
                                  Zoom QR
                                </button>
                              </div>
                            )}
                            {t.paymentDetails?.accountNumber && (
                              <p className="text-xs text-gray-500 font-mono">
                                A/C: {t.paymentDetails.accountNumber} {t.paymentDetails.ifsc ? `(${t.paymentDetails.ifsc})` : ""}
                              </p>
                            )}
                            <div className="flex gap-2 pt-1">
                              <button onClick={() => approve(t)} className="flex-1 py-2 bg-green-500 text-white rounded-lg text-xs font-bold hover:bg-green-600 active:bg-green-700 cursor-pointer">✓ Approve</button>
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
                  VIEW 2: PENDING LOAN APPROVALS
              ══════════════════════════════════════════════════════ */}
              {pendingSubTab === "loans" && (
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <h3 className="text-base sm:text-lg font-bold font-display text-gray-900 flex items-center gap-2">
                        
                        <span>Pending Loan Requests</span>
                        <span className="px-2 py-0.5 rounded-full text-xs font-black bg-blue-100 text-blue-800">
                          {pendingLoans.length}
                        </span>
                      </h3>
                      <p className="text-xs text-gray-400 mt-0.5">
                        Personal, Micro Business aur Student loan applications jinhe review aur approval chahiye.
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => loadLoans(true)}
                      className="px-3 py-1.5 bg-white hover:bg-slate-50 border border-slate-200 text-slate-700 font-bold rounded-xl text-xs transition cursor-pointer flex items-center gap-1 shadow-2xs"
                    >
                      <span>Refresh Loans</span>
                    </button>
                  </div>

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
                            Shared Department Lending Quota • Default ₹10 Lakh Limit
                          </div>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-[10px] font-mono px-2.5 py-1 rounded-lg bg-white/10 border border-white/15 text-blue-100 font-bold">
                          Active Loans: {loanDepartmentPool.activeLoansCount || 0}
                        </span>
                        <span className="text-[10px] font-mono px-2.5 py-1 rounded-lg bg-emerald-500/20 border border-emerald-400/30 text-emerald-300 font-bold">
                          {loanDepartmentPool.utilizationPercent || 0}% Utilized
                        </span>
                      </div>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-2 border-t border-white/10">
                      <div className="bg-white/5 backdrop-blur-xs p-3 rounded-xl border border-white/10">
                        <span className="text-[10px] text-blue-300 uppercase font-bold block">Dept Total Limit</span>
                        <div className="text-xl sm:text-2xl font-black font-mono text-white mt-0.5">
                          ₹{(loanDepartmentPool.totalPool || 1000000).toLocaleString("en-IN")}
                        </div>
                        <span className="text-[9px] text-blue-300/80">Configured Department Pool</span>
                      </div>

                      <div className="bg-white/5 backdrop-blur-xs p-3 rounded-xl border border-white/10">
                        <span className="text-[10px] text-rose-300 uppercase font-bold block">Market me Diya Loan</span>
                        <div className="text-xl sm:text-2xl font-black font-mono text-rose-300 mt-0.5">
                          ₹{(loanDepartmentPool.marketDisbursed || 0).toLocaleString("en-IN")}
                        </div>
                        <span className="text-[9px] text-rose-200/80">Active Disbursed Capital</span>
                      </div>

                      <div className="bg-emerald-500/10 backdrop-blur-xs p-3 rounded-xl border border-emerald-400/20">
                        <span className="text-[10px] text-emerald-300 uppercase font-bold block">Available Lending Pool</span>
                        <div className="text-xl sm:text-2xl font-black font-mono text-emerald-300 mt-0.5">
                          ₹{(loanDepartmentPool.availablePool !== undefined ? loanDepartmentPool.availablePool : 1000000).toLocaleString("en-IN")}
                        </div>
                        <span className="text-[9px] text-emerald-200/80">Remaining Approval Quota</span>
                      </div>
                    </div>

                    {/* Utilization Progress Bar */}
                    <div className="mt-3">
                      <div className="w-full bg-white/10 rounded-full h-1.5 overflow-hidden">
                        <div
                          className="h-full bg-gradient-to-r from-blue-400 to-emerald-400 transition-all duration-500 rounded-full"
                          style={{ width: `${Math.min(100, Math.max(0, loanDepartmentPool.utilizationPercent || 0))}%` }}
                        />
                      </div>
                    </div>
                  </div>

                  {/* Quick Action: Apply on Behalf / Issue Loan Shortcut */}
                  <div className="p-3.5 bg-gradient-to-r from-blue-50 to-indigo-50 border border-blue-200 rounded-2xl flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-2xs">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-xl bg-blue-600 text-white flex items-center justify-center shadow-xs shrink-0">
                        <svg className="w-5 h-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 4v16m8-8H4" />
                        </svg>
                      </div>
                      <div>
                        <h4 className="text-xs sm:text-sm font-black text-slate-900">
                          Issue or Backfill Loan (Apply on Behalf)
                        </h4>
                        <p className="text-[11px] text-slate-600">
                          Existing user ya new borrower ke naam par loan issue karein ya purana offline loan record karein.
                        </p>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => switchTab("issue-loan")}
                      className="px-4 py-2 bg-blue-600 hover:bg-blue-700 active:scale-95 text-white rounded-xl text-xs font-black transition cursor-pointer flex items-center justify-center gap-1.5 shadow-xs shrink-0"
                    >
                       Open Issue Loan Desk →
                    </button>
                  </div>

                  {pendingLoans.length === 0 ? (
                    <div className="py-12 text-center space-y-3 border-2 border-dashed border-gray-100 rounded-3xl bg-slate-50/50">
                      <span className="text-4xl block"></span>
                      <p className="font-extrabold text-gray-800 text-sm">No Pending Loan Requests</p>
                      <p className="text-xs text-gray-400">Sabhi loan applications process ho chuki hain.</p>
                      <div className="pt-2">
                        <button
                          type="button"
                          onClick={() => switchTab("loans")}
                          className="px-4 py-2 bg-blue-600 hover:bg-blue-700 active:scale-95 text-white rounded-xl text-xs font-bold transition shadow-xs cursor-pointer inline-flex items-center gap-1.5"
                        >
                           Active Loans Ledger Dekhein ({loans.length})
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className="space-y-4">
                      {pendingLoans.map(l => {
                        const docs = { ...(l.userId?.kycDocuments || {}), ...(l.documents || {}) };
                        const instAmt = l.installmentAmount || l.emiAmount || 0;
                        const chosenOpt = cardAdvanceOptions[l._id] || "none";
                        const isAdvance = chosenOpt === "deduct";
                        const advancePayout = Math.max(0, (l.disbursalAmount || l.amount) - instAmt);
                        const currentDisburseAmount = isAdvance ? advancePayout : (l.disbursalAmount || l.amount);

                        return (
                          <div key={l._id} className="border border-slate-200 rounded-2xl p-4 sm:p-5 bg-white shadow-xs space-y-4">
                            {/* Card Header */}
                            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-gray-100 pb-3">
                              <div className="flex items-center gap-3">
                                <div className="w-10 h-10 rounded-xl bg-blue-600 text-white font-black flex items-center justify-center text-sm shadow-xs shrink-0">
                                  {(l.userId?.name || "B")[0].toUpperCase()}
                                </div>
                                <div>
                                  <div className="flex items-center gap-2 flex-wrap">
                                    <h4 className="font-extrabold text-gray-900 text-base">{l.userId?.name || "Borrower"}</h4>
                                    <span className="bg-blue-50 text-blue-700 text-xs font-black font-mono px-2.5 py-0.5 rounded-full border border-blue-200">
                                      A/C: {l.accountNumber || "EFS0000XXX"}
                                    </span>
                                    <span className="px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-amber-100 text-amber-800 border border-amber-200">
                                      {l.loanType === "micro_business" ? "MICRO BUSINESS (DAILY)" : l.loanType === "student" ? "STUDENT LOAN" : "PERSONAL LOAN (10-DAY)"}
                                    </span>
                                  </div>
                                  <p className="text-xs text-gray-500 mt-0.5">
                                    {l.userId?.phone || docs.applicantPhone || "N/A"} • {l.userId?.email || docs.applicantEmail || "N/A"}
                                  </p>
                                </div>
                              </div>
                              <div className="text-left sm:text-right text-xs text-gray-400">
                                <span>Applied: {new Date(l.createdAt).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })}</span>
                              </div>
                            </div>

                            {/* Loan Terms Grid */}
                            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 bg-slate-50 p-3.5 rounded-xl text-xs">
                              <div>
                                <span className="text-gray-400 block font-medium">Requested Amount</span>
                                <span className="font-extrabold text-gray-900 text-base font-mono">₹{Number(l.amount || 0).toLocaleString("en-IN")}</span>
                              </div>
                              <div>
                                <span className="text-gray-400 block font-medium">Installments</span>
                                <span className="font-bold text-gray-900 text-sm">{l.installmentsCount || 15} Kistein @ ₹{instAmt}</span>
                              </div>
                              <div>
                                <span className="text-gray-400 block font-medium">Total Payable</span>
                                <span className="font-bold text-gray-900 text-sm font-mono">₹{Number(l.totalPayable || 0).toLocaleString("en-IN")}</span>
                              </div>
                              <div>
                                <span className="text-gray-400 block font-medium">Khate Me Jayega (In-Hand)</span>
                                <span className="font-extrabold text-emerald-700 text-sm font-mono">
                                  ₹{Number(l.disbursalAmount || Math.max(0, (l.amount || 0) - Math.round((l.amount || 0) * 0.05) - Math.round((l.amount || 0) * 0.01))).toLocaleString("en-IN")}
                                </span>
                              </div>
                            </div>

                            {/* Purpose & Nominee */}
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
                              {l.purpose && (
                                <div className="p-2.5 bg-slate-50 rounded-xl border border-slate-100">
                                  <span className="text-gray-400 block font-medium text-[10px]">Purpose</span>
                                  <span className="font-bold text-slate-800">{l.purpose}</span>
                                </div>
                              )}
                              {l.nominee?.name && (
                                <div className="p-2.5 bg-slate-50 rounded-xl border border-slate-100">
                                  <span className="text-gray-400 block font-medium text-[10px]">Nominee Details</span>
                                  <span className="font-bold text-slate-800">
                                    {l.nominee.name} ({l.nominee.relation || "Nominee"}) • {l.nominee.phone || "N/A"}
                                  </span>
                                </div>
                              )}
                            </div>

                            {/* Submitted Documents Lightbox Zoom */}
                            {(docs.doc1Url || docs.doc2Url || docs.studentProofUrl || docs.chequeUrl || docs.aadharUrl || docs.panUrl) && (
                              <div className="p-3 bg-slate-50 border border-slate-200/90 rounded-xl space-y-2">
                                <div className="flex items-center justify-between text-xs font-bold text-slate-800">
                                  <span className="flex items-center gap-1.5">
                                     Submitted Verification Documents
                                  </span>
                                  {docs.bankAccountNumber && (
                                    <span className="text-[11px] font-mono text-slate-600">
                                      A/C: {docs.bankAccountNumber} ({docs.bankName || "Bank"}, IFSC: {docs.bankIfsc || "N/A"})
                                    </span>
                                  )}
                                </div>
                                <div className="flex flex-wrap gap-2">
                                  {(docs.doc1Url || docs.aadharUrl) && (
                                    <button
                                      type="button"
                                      onClick={() => { setLightboxImg(docs.doc1Url || docs.aadharUrl); setZoomLevel(1); }}
                                      className="px-2.5 py-1.5 bg-white border border-slate-200 rounded-lg text-xs font-semibold text-slate-800 hover:bg-slate-100 transition active:scale-95 cursor-pointer shadow-2xs flex items-center gap-1"
                                    >
                                      <span>🆔</span> Aadhaar (Front) 
                                    </button>
                                  )}
                                  {(docs.doc1BackUrl || docs.aadharBackUrl) && (
                                    <button
                                      type="button"
                                      onClick={() => { setLightboxImg(docs.doc1BackUrl || docs.aadharBackUrl); setZoomLevel(1); }}
                                      className="px-2.5 py-1.5 bg-white border border-slate-200 rounded-lg text-xs font-semibold text-slate-800 hover:bg-slate-100 transition active:scale-95 cursor-pointer shadow-2xs flex items-center gap-1"
                                    >
                                      <span>🆔</span> Aadhaar (Back) 
                                    </button>
                                  )}
                                  {(docs.doc2Url || docs.panUrl) && (
                                    <button
                                      type="button"
                                      onClick={() => { setLightboxImg(docs.doc2Url || docs.panUrl); setZoomLevel(1); }}
                                      className="px-2.5 py-1.5 bg-white border border-slate-200 rounded-lg text-xs font-semibold text-slate-800 hover:bg-slate-100 transition active:scale-95 cursor-pointer shadow-2xs flex items-center gap-1"
                                    >
                                       PAN Card (Front) 
                                    </button>
                                  )}
                                  {(docs.doc2BackUrl || docs.panBackUrl) && (
                                    <button
                                      type="button"
                                      onClick={() => { setLightboxImg(docs.doc2BackUrl || docs.panBackUrl); setZoomLevel(1); }}
                                      className="px-2.5 py-1.5 bg-white border border-slate-200 rounded-lg text-xs font-semibold text-slate-800 hover:bg-slate-100 transition active:scale-95 cursor-pointer shadow-2xs flex items-center gap-1"
                                    >
                                       PAN Card (Back) 
                                    </button>
                                  )}
                                  {(docs.chequeUrl || docs.chequeFrontUrl) && (
                                    <button
                                      type="button"
                                      onClick={() => { setLightboxImg(docs.chequeUrl || docs.chequeFrontUrl); setZoomLevel(1); }}
                                      className="px-2.5 py-1.5 bg-white border border-slate-200 rounded-lg text-xs font-semibold text-slate-800 hover:bg-slate-100 transition active:scale-95 cursor-pointer shadow-2xs flex items-center gap-1"
                                    >
                                       Bearer Cheque (Front) 
                                    </button>
                                  )}
                                  {docs.chequeBackUrl && (
                                    <button
                                      type="button"
                                      onClick={() => { setLightboxImg(docs.chequeBackUrl); setZoomLevel(1); }}
                                      className="px-2.5 py-1.5 bg-white border border-slate-200 rounded-lg text-xs font-semibold text-slate-800 hover:bg-slate-100 transition active:scale-95 cursor-pointer shadow-2xs flex items-center gap-1"
                                    >
                                       Bearer Cheque (Back) 
                                    </button>
                                  )}
                                  {docs.studentProofUrl && (
                                    <button
                                      type="button"
                                      onClick={() => { setLightboxImg(docs.studentProofUrl); setZoomLevel(1); }}
                                      className="px-2.5 py-1.5 bg-white border border-slate-200 rounded-lg text-xs font-semibold text-slate-800 hover:bg-slate-100 transition active:scale-95 cursor-pointer shadow-2xs flex items-center gap-1"
                                    >
                                       Student Proof 
                                    </button>
                                  )}
                                </div>
                              </div>
                            )}

                            {/* Advance Option Selector */}
                            <div className="bg-amber-50/60 border border-amber-200/80 rounded-xl p-3 space-y-3">
                              <div className="flex flex-wrap items-center justify-between gap-1">
                                <span className="text-xs font-black text-amber-900 flex items-center gap-1.5">
                                   Disbursal & EMI Option (Click karke EMI Time aur % Breakdown dekhein):
                                </span>
                                <span className="text-[10px] font-bold text-amber-800 bg-amber-100/80 px-2 py-0.5 rounded-full border border-amber-200">
                                  3 Options Available
                                </span>
                              </div>
                              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                                <button
                                  type="button"
                                  onClick={() => setCardAdvanceOptions(prev => ({ ...prev, [l._id]: "none" }))}
                                  className={`p-2.5 rounded-xl border text-left transition cursor-pointer relative ${
                                    chosenOpt === "none"
                                      ? "bg-white border-blue-500 ring-2 ring-blue-400/30 shadow-2xs"
                                      : "bg-white/80 border-slate-200 hover:bg-white"
                                  }`}
                                >
                                  <div className="flex items-center justify-between gap-1">
                                    <span className="font-bold text-xs text-slate-900 block">Normal Disbursal</span>
                                    <span className="text-[9px] font-black bg-blue-100 text-blue-800 px-1.5 py-0.2 rounded">94% IN-HAND</span>
                                  </div>
                                  <span className="text-[11px] text-slate-600 block mt-1">Puri amount ₹{Number(l.disbursalAmount || l.amount).toLocaleString("en-IN")} disburse hogi.</span>
                                  <span className="text-[10px] text-blue-700 font-bold block mt-1">⏱️ Kist #1: Regular cycle par</span>
                                </button>
                                <button
                                  type="button"
                                  onClick={() => setCardAdvanceOptions(prev => ({ ...prev, [l._id]: "deduct" }))}
                                  className={`p-2.5 rounded-xl border text-left transition cursor-pointer relative ${
                                    chosenOpt === "deduct"
                                      ? "bg-amber-100 border-amber-500 ring-2 ring-amber-400/30 shadow-2xs"
                                      : "bg-white/80 border-slate-200 hover:bg-white"
                                  }`}
                                >
                                  <div className="flex items-center justify-between gap-1">
                                    <span className="font-bold text-xs text-amber-950 block">1st EMI Advance Kaatein</span>
                                    <span className="text-[9px] font-black bg-amber-200 text-amber-900 px-1.5 py-0.2 rounded">ADVANCE CUT</span>
                                  </div>
                                  <span className="text-[11px] text-amber-800 block mt-1">Milega: ₹{advancePayout.toLocaleString("en-IN")}. Kist #1 paid ho jayegi.</span>
                                  <span className="text-[10px] text-amber-900 font-bold block mt-1">⏱️ Kist #1 Paid Today • Kist #2 next cycle</span>
                                </button>
                                <button
                                  type="button"
                                  onClick={() => setCardAdvanceOptions(prev => ({ ...prev, [l._id]: "defer" }))}
                                  className={`p-2.5 rounded-xl border text-left transition cursor-pointer relative ${
                                    chosenOpt === "defer"
                                      ? "bg-sky-50 border-sky-500 ring-2 ring-sky-400/30 shadow-2xs"
                                      : "bg-white/80 border-slate-200 hover:bg-white"
                                  }`}
                                >
                                  <div className="flex items-center justify-between gap-1">
                                    <span className="font-bold text-xs text-sky-950 block">⏳ 1st Kist Baad Me Lein</span>
                                    <span className="text-[9px] font-black bg-sky-200 text-sky-900 px-1.5 py-0.2 rounded">GRACE PERIOD</span>
                                  </div>
                                  <span className="text-[11px] text-sky-800 block mt-1">Puri ₹{Number(l.disbursalAmount || l.amount).toLocaleString("en-IN")} milegi.</span>
                                  <span className="text-[10px] text-sky-900 font-bold block mt-1">⏱️ Kist #1: Grace period ke baad</span>
                                </button>
                              </div>

                              {/* Interactive Live Breakdown Desk for selected option */}
                              <DisbursalBreakdownDesk loan={l} chosenOpt={chosenOpt} />
                            </div>

                            {/* Action Buttons */}
                            <div className="flex gap-2 sm:gap-3 pt-1">
                              <button
                                type="button"
                                onClick={() => {
                                  setAdvanceOption(chosenOpt);
                                  setLoanApproveModal(l);
                                }}
                                className="flex-1 py-3 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs sm:text-sm font-extrabold shadow-md shadow-emerald-500/20 active:scale-95 transition cursor-pointer flex items-center justify-center gap-1.5"
                              >
                                <span>Approve & Disburse (₹{currentDisburseAmount.toLocaleString("en-IN")})</span>
                              </button>
                              <button
                                type="button"
                                disabled={rejectLoadingId === l._id}
                                onClick={() => rejectLoan(l._id)}
                                className="px-5 py-3 bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 active:scale-95 rounded-xl text-xs sm:text-sm font-bold transition cursor-pointer flex items-center justify-center gap-1.5 disabled:opacity-50"
                              >
                                {rejectLoadingId === l._id ? "Rejecting..." : "✗ Reject"}
                              </button>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}

              {/* ══════════════════════════════════════════════════════
                  VIEW 3: PENDING BOND & LENDING APPROVALS
              ══════════════════════════════════════════════════════ */}
              {pendingSubTab === "bonds" && (
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <h3 className="text-base sm:text-lg font-bold font-display text-gray-900 flex items-center gap-2">
                        
                        <span>Pending Bond & Lending Requests</span>
                        <span className="px-2 py-0.5 rounded-full text-xs font-black bg-indigo-100 text-indigo-800">
                          {pendingBonds.length}
                        </span>
                      </h3>
                      <p className="text-xs text-gray-400 mt-0.5">
                        Fixed Return Bond (365 Days) aur Monthly Lending (40m / 80m) accounts review aur approval ke liye.
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => loadBonds(true)}
                      className="px-3 py-1.5 bg-white hover:bg-slate-50 border border-slate-200 text-slate-700 font-bold rounded-xl text-xs transition cursor-pointer flex items-center gap-1 shadow-2xs"
                    >
                      <span>Refresh Bonds</span>
                    </button>
                  </div>

                  {pendingBonds.length === 0 ? (
                    <div className="py-12 text-center space-y-2 border-2 border-dashed border-gray-100 rounded-3xl bg-slate-50/50">
                      <span className="text-4xl block"></span>
                      <p className="font-extrabold text-gray-800 text-sm">No Pending Bond Requests</p>
                      <p className="text-xs text-gray-400">Sabhi bond aur lending applications process ho chuki hain.</p>
                    </div>
                  ) : (
                    <div className="space-y-4">
                      {pendingBonds.map(b => {
                        const docs = b.documents || {};
                        return (
                          <div key={b._id} className="border border-slate-200 rounded-2xl p-4 sm:p-5 bg-white shadow-xs space-y-4">
                            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-gray-100 pb-3">
                              <div className="flex items-center gap-3">
                                <div className="w-10 h-10 rounded-xl bg-indigo-600 text-white font-black flex items-center justify-center text-sm shadow-xs shrink-0">
                                  {(b.userId?.name || "I")[0].toUpperCase()}
                                </div>
                                <div>
                                  <div className="flex items-center gap-2 flex-wrap">
                                    <h4 className="font-extrabold text-gray-900 text-base">{b.userId?.name || "Investor"}</h4>
                                    <span className="bg-indigo-50 text-indigo-700 text-xs font-black font-mono px-2.5 py-0.5 rounded-full border border-indigo-200">
                                      A/C: {b.accountNumber || "EFS0000XXX"}
                                    </span>
                                    <span className="px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-amber-100 text-amber-800 border border-amber-200">
                                      {b.bondType === "bond_25" ? "25-MONTH FIXED BOND (+40%)" : b.bondType === "bond_50" ? "50-MONTH FIXED BOND (2X DOUBLE)" : b.bondType === "debit_365" ? "365-DAY FIXED BOND" : b.bondType === "lending_80" ? "80 MONTHS LENDING (2X)" : "40 MONTHS LENDING (+40%)"}
                                    </span>
                                  </div>
                                  <p className="text-xs text-gray-500 mt-0.5">
                                    {b.userId?.phone || docs.applicantPhone || "N/A"} • {b.userId?.email || docs.applicantEmail || "N/A"}
                                  </p>
                                </div>
                              </div>
                              <div className="text-left sm:text-right text-xs text-gray-400">
                                <span>Applied: {new Date(b.createdAt).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })}</span>
                              </div>
                            </div>

                            {(() => {
                              const uBal = Number(b.userId?.balance !== undefined ? b.userId.balance : (users.find(u => String(u._id) === String(b.userId?._id || b.userId))?.balance || 0));
                              const reqAmt = Number(b.principalAmount || 0);
                              const isInsufficient = uBal < reqAmt;

                              return (
                                <>
                                  <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 bg-slate-50 p-3.5 rounded-xl text-xs">
                                    <div>
                                      <span className="text-gray-400 block font-medium">Principal Required</span>
                                      <span className="font-extrabold text-gray-900 text-base font-mono">₹{reqAmt.toLocaleString("en-IN")}</span>
                                    </div>
                                    <div className={isInsufficient ? "bg-rose-50 p-1.5 rounded-lg border border-rose-200" : ""}>
                                      <span className={`block font-medium ${isInsufficient ? "text-rose-600 font-bold" : "text-gray-400"}`}>User Wallet Balance</span>
                                      <span className={`font-mono text-sm font-black ${isInsufficient ? "text-rose-700" : "text-emerald-700"}`}>
                                        ₹{uBal.toLocaleString("en-IN")}
                                      </span>
                                    </div>
                                    <div>
                                      <span className="text-gray-400 block font-medium">Monthly Payout</span>
                                      <span className="font-bold text-emerald-700 text-sm font-mono">₹{Number(b.monthlyPayout || 0).toLocaleString("en-IN")}/mo</span>
                                    </div>
                                    <div>
                                      <span className="text-gray-400 block font-medium">Total Return</span>
                                      <span className="font-bold text-gray-900 text-sm font-mono">₹{Number(b.returnAmount || 0).toLocaleString("en-IN")}</span>
                                    </div>
                                    <div>
                                      <span className="text-gray-400 block font-medium">Tenure</span>
                                      <span className="font-bold text-gray-900 text-sm">{b.tenureMonths ? `${b.tenureMonths} Months` : b.bondType === "bond_25" ? "25 Months" : b.bondType === "bond_50" ? "50 Months" : `${b.tenureDays || 365} Days`}</span>
                                    </div>
                                  </div>

                                  {isInsufficient && (
                                    <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl text-xs space-y-1">
                                      <div className="flex items-center gap-1.5 font-bold text-rose-800">
                                        <span>⚠️ Insufficient Wallet Balance (Approval Blocked)</span>
                                      </div>
                                      <p className="text-[11px] text-rose-700">
                                        User ke wallet me abhi sirf <strong>₹{uBal.toLocaleString("en-IN")}</strong> bacha hai, jabki request <strong>₹{reqAmt.toLocaleString("en-IN")}</strong> ki hai. User ne request lagane ke baad paise transfer kar diye hain, isliye ye request approve nahi ki ja sakti.
                                      </p>
                                    </div>
                                  )}

                                  {/* Documents */}
                                  {(docs.aadharUrl || docs.doc1Url || docs.panUrl || docs.doc2Url || docs.chequeUrl) && (
                                    <div className="p-3 bg-slate-50 border border-slate-200/90 rounded-xl space-y-2">
                                      <span className="text-xs font-bold text-slate-800 block">Submitted Investor Documents:</span>
                                      <div className="flex flex-wrap gap-2">
                                        {(docs.aadharUrl || docs.doc1Url) && (
                                          <button
                                            type="button"
                                            onClick={() => { setLightboxImg(docs.aadharUrl || docs.doc1Url); setZoomLevel(1); }}
                                            className="px-2.5 py-1.5 bg-white border border-slate-200 rounded-lg text-xs font-semibold text-slate-800 hover:bg-slate-100 transition cursor-pointer shadow-2xs flex items-center gap-1"
                                          >
                                            <span>🆔</span> Aadhaar (Front) 
                                          </button>
                                        )}
                                        {(docs.aadharBackUrl || docs.doc1BackUrl) && (
                                          <button
                                            type="button"
                                            onClick={() => { setLightboxImg(docs.aadharBackUrl || docs.doc1BackUrl); setZoomLevel(1); }}
                                            className="px-2.5 py-1.5 bg-white border border-slate-200 rounded-lg text-xs font-semibold text-slate-800 hover:bg-slate-100 transition cursor-pointer shadow-2xs flex items-center gap-1"
                                          >
                                            <span>🆔</span> Aadhaar (Back) 
                                          </button>
                                        )}
                                        {(docs.panUrl || docs.doc2Url) && (
                                          <button
                                            type="button"
                                            onClick={() => { setLightboxImg(docs.panUrl || docs.doc2Url); setZoomLevel(1); }}
                                            className="px-2.5 py-1.5 bg-white border border-slate-200 rounded-lg text-xs font-semibold text-slate-800 hover:bg-slate-100 transition cursor-pointer shadow-2xs flex items-center gap-1"
                                          >
                                             PAN Card 
                                          </button>
                                        )}
                                        {docs.chequeUrl && (
                                          <button
                                            type="button"
                                            onClick={() => { setLightboxImg(docs.chequeUrl); setZoomLevel(1); }}
                                            className="px-2.5 py-1.5 bg-white border border-slate-200 rounded-lg text-xs font-semibold text-slate-800 hover:bg-slate-100 transition cursor-pointer shadow-2xs flex items-center gap-1"
                                          >
                                             Cheque 
                                          </button>
                                        )}
                                      </div>
                                    </div>
                                  )}

                                  <div className="flex gap-2 sm:gap-3 pt-1">
                                    <button
                                      type="button"
                                      disabled={bondActionLoadingId === b._id || isInsufficient}
                                      onClick={() => approveBond(b._id)}
                                      className={`flex-1 py-3 text-white rounded-xl text-xs sm:text-sm font-extrabold shadow-md active:scale-95 transition cursor-pointer flex items-center justify-center gap-1.5 disabled:opacity-60 ${
                                        isInsufficient
                                          ? "bg-gray-400 cursor-not-allowed shadow-none"
                                          : "bg-emerald-600 hover:bg-emerald-700 shadow-emerald-500/20"
                                      }`}
                                    >
                                      {bondActionLoadingId === b._id ? (
                                        <>
                                          <span className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                                          <span>Approving...</span>
                                        </>
                                      ) : isInsufficient ? (
                                        <span>⚠️ Insufficient Balance (₹{uBal.toLocaleString("en-IN")})</span>
                                      ) : (
                                        <span>Approve Bond</span>
                                      )}
                                    </button>
                                    <button
                                      type="button"
                                      disabled={bondActionLoadingId === b._id}
                                      onClick={() => rejectBond(b._id)}
                                      className="px-5 py-3 bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 active:scale-95 rounded-xl text-xs sm:text-sm font-bold transition cursor-pointer flex items-center justify-center gap-1.5 disabled:opacity-50"
                                    >
                                      {bondActionLoadingId === b._id ? "Rejecting..." : "✗ Reject"}
                                    </button>
                                  </div>
                                </>
                              );
                            })()}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}

              {/* ══════════════════════════════════════════════════════
                  VIEW 4: ON HOLD — DUPLICATE UTR CONFLICTS
              ══════════════════════════════════════════════════════ */}
              {pendingSubTab === "hold" && (
                <div className="space-y-6">
                  {/* Anti-Fraud Protection Information Banner */}
                  <div className="p-3.5 bg-gradient-to-r from-rose-50 via-amber-50 to-orange-50 border border-rose-200 rounded-2xl flex items-start gap-3 shadow-2xs">
                    <span className="text-2xl shrink-0"></span>
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
                      <span className="text-4xl block"></span>
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
                                {group.totalCount} Conflicting Requests Found
                              </span>
                            </div>

                            <div className="flex items-center gap-1.5 flex-wrap text-[11px] font-bold">
                              {group.holdCount > 0 && (
                                <span className="px-2.5 py-0.5 bg-rose-100 text-rose-900 border border-rose-300 rounded-lg">
                                  {group.holdCount} ON HOLD
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
                                        <span>{item.userId?.phone || "No phone"}</span>
                                        <span>{item.userId?.email || ""}</span>
                                      </div>
                                    </div>

                                    {/* Status Badge */}
                                    <div className="shrink-0">
                                      {isHold && (
                                        <span className="px-2.5 py-1 bg-rose-600 text-white rounded-xl text-[10px] font-black tracking-wider uppercase inline-flex items-center gap-1 shadow-2xs animate-pulse">
                                           ON HOLD
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
                                        Full Zoom
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
                                      <span>Approved by {item.approverName || item.approvedBy?.name || "Admin"}</span>
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

              {/* SUB-TAB 5: APPROVED REQUESTS DESK (With Granular Universal Filters) */}
              {pendingSubTab === "approved" && (() => {
                const depCount = approvedRequests.filter(i => i.category === "deposit" || i.type === "deposit").length;
                const withCount = approvedRequests.filter(i => i.category === "withdrawal" || i.type === "withdrawal").length;
                const normKycCount = approvedRequests.filter(i => i.category === "kyc" && i.subCategory === "normal_kyc").length;
                const fullKycCount = approvedRequests.filter(i => i.category === "kyc" && i.subCategory === "loan_lending_kyc").length;
                const loanCount = approvedRequests.filter(i => i.category === "loan").length;
                const bondCount = approvedRequests.filter(i => i.category === "bond").length;

                const filtered = approvedRequests.filter(item => {
                  if (approvedFilter === "deposit" && !(item.category === "deposit" || item.type === "deposit")) return false;
                  if (approvedFilter === "withdrawal" && !(item.category === "withdrawal" || item.type === "withdrawal")) return false;
                  if (approvedFilter === "normal_kyc" && !(item.category === "kyc" && item.subCategory === "normal_kyc")) return false;
                  if (approvedFilter === "loan_kyc" && !(item.category === "kyc" && item.subCategory === "loan_lending_kyc")) return false;
                  if (approvedFilter === "loan" && item.category !== "loan") return false;
                  if (approvedFilter === "bond" && item.category !== "bond") return false;

                  if (approvedSearch && approvedSearch.trim()) {
                    const s = approvedSearch.trim().toLowerCase();
                    return (
                      (item.userName || "").toLowerCase().includes(s) ||
                      (item.userEmail || "").toLowerCase().includes(s) ||
                      (item.userPhone || "").toLowerCase().includes(s) ||
                      (item.accountNumber || "").toLowerCase().includes(s) ||
                      (item.reference || "").toLowerCase().includes(s) ||
                      (item.remarks || "").toLowerCase().includes(s)
                    );
                  }
                  return true;
                });

                return (
                  <div className="space-y-4">
                    {/* Header + Stats Bar */}
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-gradient-to-r from-emerald-50 via-teal-50 to-sky-50 border border-emerald-200 p-4 rounded-2xl shadow-2xs">
                      <div>
                        <h3 className="text-base sm:text-lg font-bold font-display text-emerald-950 flex items-center gap-2">
                           Approved Requests Console
                        </h3>
                        <p className="text-xs text-emerald-800 mt-0.5 font-medium">
                          Approved deposits, withdrawals, normal KYC, barrier cheque KYC, loans and bonds.
                        </p>
                      </div>
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => loadApprovedRequests(true)}
                          disabled={approvedLoading}
                          className="px-3.5 py-2 bg-white hover:bg-emerald-50 text-emerald-800 border border-emerald-200 rounded-xl text-xs font-bold transition flex items-center gap-1.5 shadow-2xs cursor-pointer active:scale-95 disabled:opacity-50"
                        >
                          <span className={approvedLoading ? "animate-spin" : ""}></span>
                          <span>Refresh</span>
                        </button>
                      </div>
                    </div>

                    {/* Filter Pills Bar (User requested: kyc, payment, withdrawal, full kyc vs normal kyc, loans, bonds) */}
                    <div className="flex items-center gap-1.5 overflow-x-auto pb-1 scrollbar-thin">
                      <button
                        type="button"
                        onClick={() => setApprovedFilter("all")}
                        className={`px-3 py-1.5 rounded-xl text-xs font-bold transition shrink-0 cursor-pointer ${
                          approvedFilter === "all"
                            ? "bg-slate-900 text-white shadow-xs"
                            : "bg-white text-slate-700 hover:bg-slate-100 border border-slate-200"
                        }`}
                      >
                        All ({approvedRequests.length})
                      </button>
                      <button
                        type="button"
                        onClick={() => setApprovedFilter("deposit")}
                        className={`px-3 py-1.5 rounded-xl text-xs font-bold transition shrink-0 cursor-pointer ${
                          approvedFilter === "deposit"
                            ? "bg-emerald-600 text-white shadow-xs"
                            : "bg-white text-emerald-800 hover:bg-emerald-50 border border-emerald-200"
                        }`}
                      >
                        Deposits ({depCount})
                      </button>
                      <button
                        type="button"
                        onClick={() => setApprovedFilter("withdrawal")}
                        className={`px-3 py-1.5 rounded-xl text-xs font-bold transition shrink-0 cursor-pointer ${
                          approvedFilter === "withdrawal"
                            ? "bg-blue-600 text-white shadow-xs"
                            : "bg-white text-blue-800 hover:bg-blue-50 border border-blue-200"
                        }`}
                      >
                        Withdrawals ({withCount})
                      </button>
                      <button
                        type="button"
                        onClick={() => setApprovedFilter("normal_kyc")}
                        className={`px-3 py-1.5 rounded-xl text-xs font-bold transition shrink-0 cursor-pointer ${
                          approvedFilter === "normal_kyc"
                            ? "bg-teal-600 text-white shadow-xs"
                            : "bg-white text-teal-800 hover:bg-teal-50 border border-teal-200"
                        }`}
                      >
                        🪪 Normal KYC ({normKycCount})
                      </button>
                      <button
                        type="button"
                        onClick={() => setApprovedFilter("loan_kyc")}
                        className={`px-3 py-1.5 rounded-xl text-xs font-bold transition shrink-0 cursor-pointer ${
                          approvedFilter === "loan_kyc"
                            ? "bg-purple-600 text-white shadow-xs"
                            : "bg-white text-purple-800 hover:bg-purple-50 border border-purple-200"
                        }`}
                      >
                        Full KYC / Barrier ({fullKycCount})
                      </button>
                      <button
                        type="button"
                        onClick={() => setApprovedFilter("loan")}
                        className={`px-3 py-1.5 rounded-xl text-xs font-bold transition shrink-0 cursor-pointer ${
                          approvedFilter === "loan"
                            ? "bg-indigo-600 text-white shadow-xs"
                            : "bg-white text-indigo-800 hover:bg-indigo-50 border border-indigo-200"
                        }`}
                      >
                        Loans ({loanCount})
                      </button>
                      <button
                        type="button"
                        onClick={() => setApprovedFilter("bond")}
                        className={`px-3 py-1.5 rounded-xl text-xs font-bold transition shrink-0 cursor-pointer ${
                          approvedFilter === "bond"
                            ? "bg-violet-600 text-white shadow-xs"
                            : "bg-white text-violet-800 hover:bg-violet-50 border border-violet-200"
                        }`}
                      >
                        Bonds ({bondCount})
                      </button>
                    </div>

                    {/* Search Bar */}
                    <div className="relative">
                      <span className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-400 text-xs">
                        
                      </span>
                      <input
                        type="text"
                        value={approvedSearch}
                        onChange={(e) => setApprovedSearch(e.target.value)}
                        placeholder="Search approved records by name, phone, account number, UTR, ref..."
                        className="w-full pl-8 pr-4 py-2 bg-white border border-slate-200 rounded-xl text-xs text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-emerald-500 shadow-2xs"
                      />
                    </div>

                    {/* Content List */}
                    {approvedLoading && approvedRequests.length === 0 ? (
                      <div className="py-14 text-center text-slate-500 bg-white rounded-2xl border border-slate-200 shadow-2xs space-y-2">
                        <div className="text-2xl animate-spin inline-block"></div>
                        <p className="text-xs font-bold text-slate-700">Approved records sync ho rahe hain...</p>
                      </div>
                    ) : filtered.length === 0 ? (
                      <div className="py-14 text-center text-gray-400 bg-slate-50 rounded-2xl border border-dashed border-gray-200">
                        <span className="text-3xl block mb-2"></span>
                        <p className="text-sm font-semibold">Koi approved record nahi mila is filter ke sath.</p>
                        <p className="text-xs text-gray-400 mt-1">Try changing filter pills or clearing search.</p>
                      </div>
                    ) : (
                      <div className="space-y-3">
                        {filtered.map((item, idx) => {
                          const isDeposit = item.category === "deposit" || item.type === "deposit";
                          const isWithdrawal = item.category === "withdrawal" || item.type === "withdrawal";
                          const isNormalKyc = item.category === "kyc" && item.subCategory === "normal_kyc";
                          const isFullKyc = item.category === "kyc" && item.subCategory === "loan_lending_kyc";
                          const isLoan = item.category === "loan";
                          const isBond = item.category === "bond";

                          const badgeBg = isDeposit
                            ? "bg-emerald-100 text-emerald-800 border-emerald-300"
                            : isWithdrawal
                            ? "bg-blue-100 text-blue-800 border-blue-300"
                            : isNormalKyc
                            ? "bg-teal-100 text-teal-800 border-teal-300"
                            : isFullKyc
                            ? "bg-purple-100 text-purple-800 border-purple-300"
                            : isLoan
                            ? "bg-indigo-100 text-indigo-800 border-indigo-300"
                            : "bg-violet-100 text-violet-800 border-violet-300";

                          const icon = isDeposit ? "" : isWithdrawal ? "" : isNormalKyc ? "🪪" : isFullKyc ? "" : isLoan ? "" : "";

                          return (
                            <div key={item.id || idx} className="bg-white border border-slate-200 rounded-2xl p-4 shadow-2xs space-y-3 transition hover:border-slate-300">
                              {/* Top Bar: Icon + Badge + Date */}
                              <div className="flex items-center justify-between gap-2 flex-wrap">
                                <div className="flex items-center gap-2">
                                  <span className="text-lg">{icon}</span>
                                  <span className={`text-[10px] font-black uppercase tracking-wider px-2 py-0.5 rounded-full border ${badgeBg}`}>
                                    {isDeposit ? "Deposit Approved" : isWithdrawal ? "Withdrawal Completed" : isNormalKyc ? "Normal KYC Verified" : isFullKyc ? "Full KYC Verified (Barrier)" : isLoan ? "Loan Disbursed" : isBond ? "Bond Activated" : item.title}
                                  </span>
                                </div>
                                <div className="text-[11px] text-slate-500 font-medium">
                                  <span>{item.approvedAt ? new Date(item.approvedAt).toLocaleString("en-IN", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" }) : "Approved"}</span>
                                  {item.turnaround && (
                                    <span className="ml-2 font-mono font-bold text-emerald-700 bg-emerald-50 px-1.5 py-0.5 rounded border border-emerald-200">
                                      {item.turnaround}
                                    </span>
                                  )}
                                </div>
                              </div>

                              {/* Middle Row: User Details + Amount */}
                              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 bg-slate-50 p-3 rounded-xl border border-slate-100">
                                <div>
                                  <div className="flex items-center gap-2">
                                    <span className="font-bold text-slate-900 text-sm">{item.userName || "User"}</span>
                                    {item.accountNumber && item.accountNumber !== "—" && (
                                      <span className="font-mono text-[10px] font-bold text-blue-700 bg-blue-50 px-2 py-0.5 rounded border border-blue-200">
                                        {item.accountNumber}
                                      </span>
                                    )}
                                  </div>
                                  <div className="text-[11px] text-slate-600 mt-0.5 flex flex-wrap gap-x-3">
                                    <span>{item.userPhone || "N/A"}</span>
                                    <span>{item.userEmail || "N/A"}</span>
                                  </div>
                                </div>

                                {item.amount > 0 && (
                                  <div className="text-left sm:text-right">
                                    <span className="text-[10px] text-slate-400 block font-bold uppercase">Amount</span>
                                    <span className="font-black font-mono text-base text-emerald-700">
                                      ₹{Number(item.amount).toLocaleString("en-IN")}
                                    </span>
                                  </div>
                                )}
                              </div>

                              {/* Details / Notes / References */}
                              {(item.reference || item.notes || item.remarks) && (
                                <div className="text-[11px] text-slate-600 bg-white p-2 rounded-lg border border-slate-100 flex flex-wrap items-center gap-x-3 gap-y-1">
                                  {item.reference && (
                                    <span className="font-mono font-bold text-slate-800">
                                      Ref: {item.reference}
                                    </span>
                                  )}
                                  {(item.notes || item.remarks) && (
                                    <span className="text-slate-500">
                                      • {item.notes || item.remarks}
                                    </span>
                                  )}
                                </div>
                              )}

                              {/* Documents / Proof Actions */}
                              <div className="flex items-center justify-between gap-2 flex-wrap pt-1 border-t border-slate-100">
                                <div className="flex items-center gap-1.5 flex-wrap">
                                  {item.category === "kyc" && item.documents && (
                                    <>
                                      {item.documents.doc1Url && (
                                        <button
                                          type="button"
                                          onClick={() => viewKycDocInLightbox(item, "doc1Url")}
                                          className="inline-flex items-center gap-1 px-2.5 py-1 bg-slate-50 hover:bg-blue-50 border border-slate-200 rounded-lg text-[10px] font-bold text-slate-700 hover:text-blue-700 transition cursor-pointer active:scale-95"
                                        >
                                          <span>🪪</span> UID Front 
                                        </button>
                                      )}
                                      {item.documents.doc1BackUrl && (
                                        <button
                                          type="button"
                                          onClick={() => viewKycDocInLightbox(item, "doc1BackUrl")}
                                          className="inline-flex items-center gap-1 px-2.5 py-1 bg-slate-50 hover:bg-blue-50 border border-slate-200 rounded-lg text-[10px] font-bold text-slate-700 hover:text-blue-700 transition cursor-pointer active:scale-95"
                                        >
                                           UID Back 
                                        </button>
                                      )}
                                      {item.documents.doc2Url && (
                                        <button
                                          type="button"
                                          onClick={() => viewKycDocInLightbox(item, "doc2Url")}
                                          className="inline-flex items-center gap-1 px-2.5 py-1 bg-slate-50 hover:bg-blue-50 border border-slate-200 rounded-lg text-[10px] font-bold text-slate-700 hover:text-blue-700 transition cursor-pointer active:scale-95"
                                        >
                                           {item.subCategory === "loan_lending_kyc" ? "Cheque Front" : "PAN Front"} 
                                        </button>
                                      )}
                                      {item.documents.doc2BackUrl && (
                                        <button
                                          type="button"
                                          onClick={() => viewKycDocInLightbox(item, "doc2BackUrl")}
                                          className="inline-flex items-center gap-1 px-2.5 py-1 bg-slate-50 hover:bg-blue-50 border border-slate-200 rounded-lg text-[10px] font-bold text-slate-700 hover:text-blue-700 transition cursor-pointer active:scale-95"
                                        >
                                           {item.subCategory === "loan_lending_kyc" ? "Cheque Back" : "PAN Back"} 
                                        </button>
                                      )}
                                    </>
                                  )}

                                  {item.hasProof && item.category !== "kyc" && (
                                    <button
                                      type="button"
                                      onClick={() => viewProofInLightbox(item)}
                                      className="inline-flex items-center gap-1 px-2.5 py-1 bg-slate-50 hover:bg-blue-50 border border-slate-200 rounded-lg text-[10px] font-bold text-blue-700 transition cursor-pointer active:scale-95"
                                    >
                                       Evidence Receipt 
                                    </button>
                                  )}
                                  {(item.hasAdminEvidence || item.adminEvidenceUrl) && (
                                    <button
                                      type="button"
                                      onClick={() => viewProofInLightbox(item, "admin_evidence")}
                                      className="inline-flex items-center gap-1 px-2.5 py-1 bg-emerald-50 hover:bg-emerald-100 border border-emerald-300 rounded-lg text-[10px] font-bold text-emerald-800 transition cursor-pointer active:scale-95"
                                    >
                                       Admin Payout Proof 
                                    </button>
                                  )}
                                  {(item.hasUserQr || item.paymentDetails?.qrCodeUrl) && (
                                    <button
                                      type="button"
                                      onClick={() => viewProofInLightbox(item, "qr")}
                                      className="inline-flex items-center gap-1 px-2.5 py-1 bg-purple-50 hover:bg-purple-100 border border-purple-300 rounded-lg text-[10px] font-bold text-purple-800 transition cursor-pointer active:scale-95"
                                    >
                                       User QR 
                                    </button>
                                  )}
                                  {item.utrNumber && (
                                    <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-slate-100 border border-slate-200 rounded-md text-[10px] font-mono font-bold text-slate-800">
                                      UTR: {item.utrNumber}
                                    </span>
                                  )}
                                </div>

                                <div className="text-[10px] text-slate-400 font-medium ml-auto flex items-center gap-1">
                                  <span>{item.approverDevice || "Admin Console"}</span>
                                  <span>• Approved by {item.approverName || "Admin"}</span>
                                </div>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                );
              })()}
            </div>
          )}

          {/* KYC VERIFICATION REQUESTS */}
          {tab === "kyc" && (
            <div className="bg-white rounded-2xl shadow-sm p-4 sm:p-6 border border-gray-100 space-y-4">
              {/* Header (Tier 1: Title + Action Toolbar) */}
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 pb-3 border-b border-slate-100">
                <div>
                  <h3 className="text-base sm:text-lg font-bold font-display text-gray-900 flex items-center gap-2">
                     User KYC Verification Requests
                  </h3>
                  <p className="text-xs text-gray-500">
                    Review submitted Aadhaar, PAN, Address & documents. Write admin notes and approve or reject.
                  </p>
                </div>

                {/* Export & Multi-select Toolbar */}
                <div className="flex items-center gap-2 self-start md:self-auto shrink-0 flex-wrap">
                  <button
                    type="button"
                    onClick={async () => {
                      showToast("Syncing latest requests...", "info");
                      await loadUsers(true);
                      showToast("KYC list synced ✓", "success");
                    }}
                    className="px-3 py-1.5 bg-blue-50 hover:bg-blue-100 text-blue-700 border border-blue-200 rounded-xl text-xs font-bold shadow-2xs active:scale-90 active:ring-2 active:ring-blue-400 transition-all flex items-center gap-1.5 cursor-pointer select-none"
                    title="Instant live sync with server"
                  >
                     Live Sync
                  </button>

                  <label className="flex items-center gap-1.5 text-xs font-bold text-gray-700 cursor-pointer bg-slate-100 hover:bg-slate-200 px-3 py-1.5 rounded-xl select-none transition active:scale-95">
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
                      className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold shadow-xs active:scale-90 active:ring-2 active:ring-emerald-400 transition flex items-center gap-1.5 cursor-pointer select-none"
                    >
                      <svg className="w-3.5 h-3.5 text-white shrink-0" fill="currentColor" viewBox="0 0 24 24">
                        <path d="M14 2H6c-1.1 0-2 .9-2 2v16c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V8l-6-6zm1.8 14l-1.8-2.7-1.8 2.7h-1.6l2.6-3.8-2.5-3.7h1.6l1.7 2.6 1.7-2.6h1.6L16.4 12l2.6 3.9h-1.6zM13 9V3.5L18.5 9H13z" />
                      </svg>
                      <span>Export Selected ({selectedKycIds.size})</span>
                    </button>
                  )}

                  <button
                    type="button"
                    onClick={() => exportKycToCsv(filteredKycUsers)}
                    className="px-3 py-1.5 bg-white hover:bg-emerald-50 text-emerald-800 border border-emerald-300 rounded-xl text-xs font-bold shadow-2xs active:scale-90 active:ring-2 active:ring-emerald-400 transition flex items-center gap-1.5 cursor-pointer select-none"
                  >
                    <svg className="w-3.5 h-3.5 text-emerald-600 shrink-0" fill="currentColor" viewBox="0 0 24 24">
                      <path d="M14 2H6c-1.1 0-2 .9-2 2v16c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V8l-6-6zm1.8 14l-1.8-2.7-1.8 2.7h-1.6l2.6-3.8-2.5-3.7h1.6l1.7 2.6 1.7-2.6h1.6L16.4 12l2.6 3.9h-1.6zM13 9V3.5L18.5 9H13z" />
                    </svg>
                    <span>Export All ({filteredKycUsers.length})</span>
                  </button>
                </div>
              </div>

              {/* Filter Bar (Tier 2: Status Pills + Date Pills) */}
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
                {/* Status Filter */}
                <div className="flex items-center bg-slate-100 p-1 rounded-xl text-xs font-bold overflow-x-auto no-scrollbar gap-1">
                  {[
                    { key: "all", label: `All (${allKycUsers.length})` },
                    { key: "pending", label: `Pending (${pendingKycCount})` },
                    { key: "bank_change", label: `Bank Change (${pendingBankChangeUsers.length})` },
                    { key: "verified", label: `Verified (${verifiedKycCount})` },
                    { key: "rejected", label: `Rejected (${rejectedKycCount})` },
                  ].map(f => (
                    <button
                      key={f.key}
                      type="button"
                      onClick={() => {
                        setKycFilter(f.key);
                        showToast(`Showing ${f.label}`, "info");
                      }}
                      className={`px-3 py-1.5 rounded-lg transition-all duration-100 cursor-pointer text-center whitespace-nowrap shrink-0 active:scale-90 active:ring-2 active:ring-blue-400 select-none ${
                        kycFilter === f.key
                          ? "bg-blue-600 text-white shadow-md font-black ring-2 ring-blue-300 scale-105"
                          : "text-slate-600 hover:text-slate-900 hover:bg-slate-200/60"
                      }`}
                    >
                      {f.label}
                    </button>
                  ))}
                </div>

                {/* Date / Time Filter */}
                <div className="flex items-center bg-blue-50/70 border border-blue-200/90 p-1 rounded-xl text-xs font-bold overflow-x-auto no-scrollbar gap-1">
                  {[
                    { key: "all", label: "All Time" },
                    { key: "today", label: "Today" },
                    { key: "7days", label: "7 Days" },
                    { key: "30days", label: "30 Days" },
                  ].map(tf => (
                    <button
                      key={tf.key}
                      type="button"
                      onClick={() => {
                        setKycTimeFilter(tf.key);
                        showToast(`Filter: ${tf.label}`, "info");
                      }}
                      className={`px-3 py-1.5 rounded-lg transition-all duration-100 cursor-pointer text-[11px] text-center whitespace-nowrap shrink-0 active:scale-90 active:ring-2 active:ring-blue-400 select-none ${
                        kycTimeFilter === tf.key
                          ? "bg-blue-600 text-white shadow-xs font-extrabold ring-1 ring-blue-400 scale-105"
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
                      <span className="text-4xl block mb-2"></span>
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
                                {/* Real-time request elapsed timer */}
                                <span
                                  title={`Submitted: ${new Date(u.kycDocuments?.submittedAt || u.createdAt).toLocaleString("en-IN")}`}
                                  className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-mono font-bold border transition-all ${
                                    u.kycStatus === "pending"
                                      ? "bg-amber-100 text-amber-900 border-amber-300 animate-pulse shadow-2xs"
                                      : "bg-slate-100 text-slate-700 border-slate-200"
                                  }`}
                                >
                                  ⏱️ {formatLiveTimeElapsed(u.kycDocuments?.submittedAt || u.createdAt)}
                                </span>
                                <span className="text-[10px] text-slate-400 font-mono hidden sm:inline">
                                  {u.kycDocuments?.submittedAt ? new Date(u.kycDocuments.submittedAt).toLocaleString("en-IN", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }) : "Recent"}
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
                            className="shrink-0 px-2.5 py-1.5 bg-emerald-50 hover:bg-emerald-100 text-emerald-800 border border-emerald-200 rounded-xl text-xs font-bold transition flex items-center gap-1.5 active:scale-90 active:ring-2 active:ring-emerald-400 cursor-pointer shadow-2xs select-none"
                          >
                            <svg className="w-3.5 h-3.5 text-emerald-600 shrink-0" fill="currentColor" viewBox="0 0 24 24">
                              <path d="M14 2H6c-1.1 0-2 .9-2 2v16c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V8l-6-6zm1.8 14l-1.8-2.7-1.8 2.7h-1.6l2.6-3.8-2.5-3.7h1.6l1.7 2.6 1.7-2.6h1.6L16.4 12l2.6 3.9h-1.6zM13 9V3.5L18.5 9H13z" />
                            </svg>
                            <span className="text-[11px] font-bold text-emerald-900">Excel</span>
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
                              {u.address || u.kycDocuments?.address}
                            </span>
                          )}
                        </div>

                        {/* Registered Bank Details */}
                        {(u.bankAccount?.accountNumber || u.kycDocuments?.bankAccountNumber) && (
                          <div className="flex flex-wrap items-center gap-2 text-[11px] text-emerald-800 bg-emerald-50/90 px-3 py-1.5 rounded-xl border border-emerald-200">
                            <span className="font-bold flex items-center gap-1">
                              <span>🏦</span> Registered Bank:
                            </span>
                            <span className="font-semibold text-gray-900">{u.bankAccount?.bankName || u.kycDocuments?.bankName || "Bank"}</span>
                            <span className="font-mono text-gray-700">A/C: {u.bankAccount?.accountNumber || u.kycDocuments?.bankAccountNumber}</span>
                            {(u.bankAccount?.ifsc || u.kycDocuments?.bankIfsc) && (
                              <span className="font-mono text-gray-600">IFSC: {u.bankAccount?.ifsc || u.kycDocuments?.bankIfsc}</span>
                            )}
                            {(u.bankAccount?.holderName || u.kycDocuments?.bankHolderName) && (
                              <span className="text-gray-700">Holder: {u.bankAccount?.holderName || u.kycDocuments?.bankHolderName}</span>
                            )}
                            {(u.bankAccount?.upiId || u.kycDocuments?.bankUpiId || u.upiId) && (
                              <span className="font-mono text-emerald-700 font-semibold">UPI: {u.bankAccount?.upiId || u.kycDocuments?.bankUpiId || u.upiId}</span>
                            )}
                            <span className="text-[9px] bg-emerald-200 text-emerald-900 px-1.5 py-0.5 rounded font-bold uppercase ml-auto">
                              Permanent
                            </span>
                          </div>
                        )}

                        {/* Pending Bank Change Request Banner & Action */}
                        {u.bankChangeRequest && u.bankChangeRequest.status === "pending" && (
                          <div className="p-3 bg-amber-50 rounded-xl border-2 border-amber-300 text-xs text-amber-950 space-y-2.5">
                            <div className="flex items-center justify-between">
                              <span className="font-extrabold text-amber-900 flex items-center gap-1.5">
                                <span>⚠️</span> Bank / UPI Change Request Pending KYC Approval
                              </span>
                              <span className="text-[10px] text-amber-700 font-medium">
                                {u.bankChangeRequest.requestedAt ? new Date(u.bankChangeRequest.requestedAt).toLocaleDateString("en-IN") : "Recent"}
                              </span>
                            </div>
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-[11px]">
                              <div className="p-2 bg-white rounded-lg border border-amber-200 space-y-0.5">
                                <span className="font-bold text-gray-400 block text-[9px] uppercase tracking-wider">Current Bank Details</span>
                                <div className="font-semibold text-gray-800">{u.bankAccount?.bankName || "—"}</div>
                                <div className="font-mono text-gray-600">A/C: {u.bankAccount?.accountNumber || "—"}</div>
                                <div className="font-mono text-gray-600">IFSC: {u.bankAccount?.ifsc || "—"}</div>
                                <div className="font-mono text-gray-600">UPI: {u.bankAccount?.upiId || u.upiId || "—"}</div>
                              </div>
                              <div className="p-2 bg-emerald-50 rounded-lg border border-emerald-300 space-y-0.5 text-emerald-950">
                                <span className="font-bold text-emerald-700 block text-[9px] uppercase tracking-wider">Requested New Bank Details</span>
                                <div className="font-extrabold text-emerald-900">{u.bankChangeRequest.bankName || "—"}</div>
                                <div className="font-mono font-bold text-emerald-900">A/C: {u.bankChangeRequest.accountNumber || "—"}</div>
                                <div className="font-mono text-emerald-800">IFSC: {u.bankChangeRequest.ifsc || "—"} | Holder: {u.bankChangeRequest.holderName || "—"}</div>
                                <div className="font-mono text-emerald-800">UPI: {u.bankChangeRequest.upiId || "—"}</div>
                              </div>
                            </div>
                            {u.bankChangeRequest.reason && (
                              <div className="text-[11px] text-amber-900 bg-white/80 p-2 rounded-lg border border-amber-200">
                                <strong>User's Reason:</strong> "{u.bankChangeRequest.reason}"
                              </div>
                            )}
                            <div className="flex items-center gap-2 pt-0.5">
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  approveBankChange(u._id, "Bank change approved by KYC Department");
                                }}
                                className="px-3.5 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-bold transition shadow-xs cursor-pointer active:scale-95"
                              >
                                ✓ Approve Bank Change
                              </button>
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  const reason = prompt("Enter reason for rejecting bank change:");
                                  if (reason !== null) {
                                    rejectBankChange(u._id, reason || "Bank details could not be verified");
                                  }
                                }}
                                className="px-3 py-1.5 bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-300 rounded-lg text-xs font-bold transition cursor-pointer active:scale-95"
                              >
                                ✕ Reject Bank Change
                              </button>
                            </div>
                          </div>
                        )}

                        {/* Admin Remarks if any */}
                        {u.kycDocuments?.adminRemarks && (
                          <div className="text-[11px] text-blue-700 font-medium bg-blue-50/80 px-2.5 py-1 rounded-xl border border-blue-100 flex items-center gap-1.5">
                            <span>Note:</span>
                            <span className="truncate">{u.kycDocuments.adminRemarks}</span>
                            {(u.kycStatus === "verified" || u.kycStatus === "rejected" || u.kycDocuments?.isNoteLocked) && (
                              <span className="text-[9px] text-slate-400 font-bold ml-auto shrink-0">Locked</span>
                            )}
                          </div>
                        )}

                        {/* Action: Open User KYC Record & View Documents */}
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            showToast(`Opening KYC Record: ${u.name}`, "info");
                            setKycReviewRemarks(u.kycDocuments?.adminRemarks || "");
                            setPreviewKycUser(u);
                          }}
                          className={`w-full py-2.5 px-4 rounded-xl text-xs font-black shadow-xs active:scale-90 active:ring-4 active:ring-blue-400/50 active:brightness-90 transition-all duration-100 flex items-center justify-center gap-2 cursor-pointer select-none ${
                            u.kycStatus === "rejected"
                              ? "bg-rose-50 text-rose-700 border border-rose-300 hover:bg-rose-100 active:bg-rose-200"
                              : u.kycStatus === "verified"
                              ? "bg-emerald-50 text-emerald-800 border-2 border-emerald-300 hover:bg-emerald-100 active:bg-emerald-200"
                              : "bg-blue-600 hover:bg-blue-700 text-white shadow-blue-500/25 ring-2 ring-blue-400/40"
                          }`}
                        >
                          <span className="text-sm">{u.kycStatus === "rejected" ? "❌" : u.kycStatus === "verified" ? "✓" : "🆔"}</span>
                          <span>{u.kycStatus === "rejected" ? "Rejected — View Details & Documents" : u.kycStatus === "verified" ? "Verified — View Details & Documents" : "Open KYC & Inspect Documents"}</span>
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
                  <div className="w-9 h-9 rounded-xl bg-slate-900 text-white flex items-center justify-center shadow-xs shrink-0">
                    <svg className="w-5 h-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 7h3m-3 4h3m-6-4h.01M9 16h.01" />
                    </svg>
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
                    style={{ touchAction: "manipulation" }}
                    onClick={triggerYieldNotifications}
                    disabled={sendingYieldAlert}
                    className="px-3.5 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold flex items-center gap-1.5 cursor-pointer transition active:scale-95 disabled:opacity-50 shadow-xs"
                    title="Send 24h Daily Profit notification to depositors' phones"
                  >
                    <svg className="w-3.5 h-3.5 text-white shrink-0" fill="currentColor" viewBox="0 0 24 24">
                      <path d="M12 22c1.1 0 2-.9 2-2h-4c0 1.1.9 2 2 2zm6-6v-5c0-3.07-1.63-5.64-4.5-6.32V4c0-.83-.67-1.5-1.5-1.5s-1.5.67-1.5 1.5v.68C7.64 5.36 6 7.92 6 11v5l-2 2v1h16v-1l-2-2z"/>
                    </svg>
                    <span>{sendingYieldAlert ? "Dispatching..." : "Send 24h Profit Alert"}</span>
                  </button>

                  {/* Refresh Button */}
                  <button
                    type="button"
                    style={{ touchAction: "manipulation" }}
                    onClick={() => loadAuditHistory(true)}
                    disabled={historyLoading}
                    title="Refresh Audit History"
                    className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-bold flex items-center gap-1.5 cursor-pointer transition active:scale-95 disabled:opacity-50 border border-slate-200 shadow-2xs"
                  >
                    <svg className={`w-3.5 h-3.5 text-slate-600 shrink-0 ${historyLoading ? "animate-spin" : ""}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                    </svg>
                    <span className="text-[11px] font-bold text-slate-700">Refresh</span>
                  </button>
                </div>
              </div>

              {/* Unified Toolbar: Search + Filter Hub Toggle + Count Badge */}
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
                <div className="relative flex-1 max-w-lg">
                  <span className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-400 text-xs">
                    
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
                    <span className="text-sm"></span>
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
                                1. Select Category
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
                              2. Transaction Status
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
                  <div className="text-2xl animate-spin inline-block"></div>
                  <p className="text-xs font-bold text-slate-700">Audit records sync ho rahe hain...</p>
                  <p className="text-[11px] text-slate-400">Live transactions database se load ho rahi hain</p>
                </div>
              ) : auditHistory.length === 0 ? (
                <div className="py-16 text-center text-gray-400 bg-slate-50 rounded-2xl border border-dashed border-gray-200">
                  <span className="text-4xl block mb-2"></span>
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
                              {item.category === "deposit" ? "Deposit" :
                               item.category === "withdrawal" ? "Withdrawal" :
                               item.category === "transfer" ? "Transfer" :
                               item.category === "kyc"
                                 ? item.subCategory === "loan_lending_kyc" ? "Loan KYC" : "Normal KYC" :
                               item.category === "loan" ? "Loan" :
                               item.category === "agent" ? "Agent" : "Yield"}
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
                              <span className="text-slate-400">{item.category === "agent" ? "Applied:" : "Requested:"}</span>
                              <span className="font-bold text-slate-800">{isDateValid ? d.toLocaleDateString("en-IN", { day: "2-digit", month: "short" }) + " " + d.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" }) : "Recent"}</span>
                            </div>
                            {isApproved && item.approvedAt && (() => {
                              const ad = new Date(item.approvedAt);
                              return (
                                <div className="flex items-center justify-between text-emerald-800">
                                  <span>Approved:</span>
                                  <span className="font-bold">{!isNaN(ad.getTime()) ? ad.toLocaleDateString("en-IN", { day: "2-digit", month: "short" }) + " " + ad.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" }) : "Approved"} {item.turnaround ? `(${item.turnaround})` : ""}</span>
                                </div>
                              );
                            })()}
                            {isApproved && (item.approverName || item.approverDevice) && (
                              <div className="text-[9px] text-slate-600 font-bold pt-0.5 border-t border-slate-200/60 flex items-center gap-1 truncate">
                                
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
                          {item.hasProof && item.category !== "kyc" && (
                            <div className="pt-1 border-t border-slate-100">
                              <button
                                type="button"
                                onClick={() => viewProofInLightbox(item)}
                                className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-slate-50 hover:bg-blue-50 text-blue-700 rounded-lg text-[10px] font-bold border border-slate-200 transition cursor-pointer active:scale-95 shadow-2xs"
                              >
                                {item.proofUrl && item.proofUrl.startsWith("http") ? (
                                  <img src={item.proofUrl} alt="Evidence" className="w-4 h-4 object-cover rounded border border-slate-200" />
                                ) : null}
                                <span>Evidence Photo / Receipt</span>
                                
                              </button>
                            </div>
                          )}

                          {(item.hasAdminEvidence || item.adminEvidenceUrl) && (
                            <div className="pt-1 border-t border-slate-100">
                              <button
                                type="button"
                                onClick={() => viewProofInLightbox(item, "admin_evidence")}
                                className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-emerald-50 hover:bg-emerald-100 text-emerald-800 rounded-lg text-[10px] font-bold border border-emerald-300 transition cursor-pointer active:scale-95 shadow-2xs"
                              >
                                
                                <span>Admin Payout Proof</span>
                                
                              </button>
                            </div>
                          )}

                          {(item.hasUserQr || item.paymentDetails?.qrCodeUrl) && (
                            <div className="pt-1 border-t border-slate-100">
                              <button
                                type="button"
                                onClick={() => viewProofInLightbox(item, "qr")}
                                className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-purple-50 hover:bg-purple-100 text-purple-800 rounded-lg text-[10px] font-bold border border-purple-300 transition cursor-pointer active:scale-95 shadow-2xs"
                              >
                                
                                <span>User Payment QR</span>
                                
                              </button>
                            </div>
                          )}

                          {/* KYC Document preview pills on mobile with tap to zoom */}
                          {item.category === "kyc" && item.hasPhotos && item.documents && (
                            <div className="flex items-center gap-1.5 flex-wrap pt-1 border-t border-slate-100">
                              {item.documents.doc1Url && (
                                <button
                                  type="button"
                                  onClick={() => viewKycDocInLightbox(item, "doc1Url")}
                                  className="inline-flex items-center gap-1 px-2 py-1 bg-slate-50 hover:bg-blue-50 text-slate-700 hover:text-blue-700 rounded-lg text-[10px] font-bold border border-slate-200 transition cursor-pointer active:scale-95"
                                >
                                  {item.documents.doc1Url.startsWith("data:image") ? (
                                    <img src={item.documents.doc1Url} alt="UID Front" className="w-3.5 h-3.5 object-cover rounded" />
                                  ) : <span>🪪</span>}
                                  <span>UID Front</span>
                                  
                                </button>
                              )}
                              {item.documents.doc1BackUrl && (
                                <button
                                  type="button"
                                  onClick={() => viewKycDocInLightbox(item, "doc1BackUrl")}
                                  className="inline-flex items-center gap-1 px-2 py-1 bg-slate-50 hover:bg-blue-50 text-slate-700 hover:text-blue-700 rounded-lg text-[10px] font-bold border border-slate-200 transition cursor-pointer active:scale-95"
                                >
                                  {item.documents.doc1BackUrl.startsWith("data:image") ? (
                                    <img src={item.documents.doc1BackUrl} alt="UID Back" className="w-3.5 h-3.5 object-cover rounded" />
                                  ) : null}
                                  <span>UID Back</span>
                                  
                                </button>
                              )}
                              {item.documents.doc2Url && (
                                <button
                                  type="button"
                                  onClick={() => viewKycDocInLightbox(item, "doc2Url")}
                                  className="inline-flex items-center gap-1 px-2 py-1 bg-slate-50 hover:bg-blue-50 text-slate-700 hover:text-blue-700 rounded-lg text-[10px] font-bold border border-slate-200 transition cursor-pointer active:scale-95"
                                >
                                  {item.documents.doc2Url.startsWith("data:image") ? (
                                    <img src={item.documents.doc2Url} alt="Doc 2" className="w-3.5 h-3.5 object-cover rounded" />
                                  ) : null}
                                  <span>{item.subCategory === "loan_lending_kyc" ? "Cheque" : "PAN"}</span>
                                  
                                </button>
                              )}
                              {item.documents.doc2BackUrl && (
                                <button
                                  type="button"
                                  onClick={() => viewKycDocInLightbox(item, "doc2BackUrl")}
                                  className="inline-flex items-center gap-1 px-2 py-1 bg-slate-50 hover:bg-blue-50 text-slate-700 hover:text-blue-700 rounded-lg text-[10px] font-bold border border-slate-200 transition cursor-pointer active:scale-95"
                                >
                                  {item.documents.doc2BackUrl.startsWith("data:image") ? (
                                    <img src={item.documents.doc2BackUrl} alt="Doc 2 Back" className="w-3.5 h-3.5 object-cover rounded" />
                                  ) : null}
                                  <span>{item.subCategory === "loan_lending_kyc" ? "Cheque Back" : "PAN Back"}</span>
                                  
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
                                    {item.category === "agent" ? "Applied: " : "Req: "}{isDateValid ? d.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" }) : "Recent"}
                                  </span>
                                  <span className="text-[10px] text-slate-400 block">
                                    {isDateValid ? d.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" }) : ""}
                                  </span>
                                  {isApproved && item.approvedAt && (() => {
                                    const ad = new Date(item.approvedAt);
                                    const isAdValid = !isNaN(ad.getTime());
                                    return (
                                      <span className="block text-[10px] text-emerald-700 font-semibold mt-1" title="Approval Time">
                                        Appr: {isAdValid ? ad.toLocaleDateString("en-IN", { day: "2-digit", month: "short" }) + " " + ad.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" }) : "Approved"}
                                        {item.turnaround ? ` (${item.turnaround})` : ""}
                                      </span>
                                    );
                                  })()}
                                  {isApproved && (item.approverName || item.approverDevice) && (
                                    <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-slate-100 border border-slate-200 text-slate-700 text-[9px] font-bold mt-1 max-w-[145px] truncate">
                                      
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
                                  {item.category === "deposit" ? "Deposit" :
                                   item.category === "withdrawal" ? "Withdrawal" :
                                   item.category === "transfer" ? "Transfer" :
                                   item.category === "kyc"
                                     ? item.subCategory === "loan_lending_kyc" ? "Loan KYC" : "Normal KYC" :
                                   item.category === "loan" ? "Loan" :
                                   item.category === "agent" ? "Agent" : "Yield"}
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
                                {item.hasProof && item.category !== "kyc" && (
                                  <div className="mt-1.5 pt-1 border-t border-slate-100">
                                    <button
                                      type="button"
                                      onClick={() => viewProofInLightbox(item)}
                                      className="inline-flex items-center gap-1.5 px-2 py-0.5 bg-slate-50 hover:bg-blue-50 border border-slate-200 hover:border-blue-300 rounded-lg text-[10px] font-bold text-blue-700 cursor-pointer transition active:scale-95 shadow-2xs"
                                    >
                                      {item.proofUrl && item.proofUrl.startsWith("http") ? (
                                        <img src={item.proofUrl} alt="Evidence" className="w-3.5 h-3.5 object-cover rounded border border-slate-200" />
                                      ) : null}
                                      <span>Evidence Receipt</span>
                                      
                                    </button>
                                  </div>
                                )}

                                {(item.hasAdminEvidence || item.adminEvidenceUrl) && (
                                  <div className="mt-1.5 pt-1 border-t border-slate-100">
                                    <button
                                      type="button"
                                      onClick={() => viewProofInLightbox(item, "admin_evidence")}
                                      className="inline-flex items-center gap-1.5 px-2 py-0.5 bg-emerald-50 hover:bg-emerald-100 border border-emerald-300 rounded-lg text-[10px] font-bold text-emerald-800 cursor-pointer transition active:scale-95 shadow-2xs"
                                    >
                                      
                                      <span>Admin Payout Proof</span>
                                      
                                    </button>
                                  </div>
                                )}

                                {(item.hasUserQr || item.paymentDetails?.qrCodeUrl) && (
                                  <div className="mt-1.5 pt-1 border-t border-slate-100">
                                    <button
                                      type="button"
                                      onClick={() => viewProofInLightbox(item, "qr")}
                                      className="inline-flex items-center gap-1.5 px-2 py-0.5 bg-purple-50 hover:bg-purple-100 border border-purple-300 rounded-lg text-[10px] font-bold text-purple-800 cursor-pointer transition active:scale-95 shadow-2xs"
                                    >
                                      
                                      <span>User Payment QR</span>
                                      
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
                                              onClick={() => viewKycDocInLightbox(item, "doc1Url")}
                                              className="inline-flex items-center gap-1 px-2 py-0.5 bg-slate-50 hover:bg-blue-50 border border-slate-200 hover:border-blue-300 rounded-lg text-[10px] font-bold text-slate-700 hover:text-blue-700 cursor-pointer transition active:scale-95 group/doc shadow-2xs"
                                            >
                                              {item.documents.doc1Url.startsWith("data:image") ? (
                                                <img src={item.documents.doc1Url} alt="UID Front" className="w-3.5 h-3.5 object-cover rounded border border-slate-200" />
                                              ) : <span>🪪</span>}
                                              <span>UID Front</span>
                                              <span className="text-slate-400 group-hover/doc:text-blue-600"></span>
                                            </button>
                                          )}
                                          {item.documents.doc1BackUrl && (
                                            <button
                                              type="button"
                                              onClick={() => viewKycDocInLightbox(item, "doc1BackUrl")}
                                              className="inline-flex items-center gap-1 px-2 py-0.5 bg-slate-50 hover:bg-blue-50 border border-slate-200 hover:border-blue-300 rounded-lg text-[10px] font-bold text-slate-700 hover:text-blue-700 cursor-pointer transition active:scale-95 group/doc shadow-2xs"
                                            >
                                              {item.documents.doc1BackUrl.startsWith("data:image") ? (
                                                <img src={item.documents.doc1BackUrl} alt="UID Back" className="w-3.5 h-3.5 object-cover rounded border border-slate-200" />
                                              ) : null}
                                              <span>UID Back</span>
                                              <span className="text-slate-400 group-hover/doc:text-blue-600"></span>
                                            </button>
                                          )}
                                          {item.documents.doc2Url && (
                                            <button
                                              type="button"
                                              onClick={() => viewKycDocInLightbox(item, "doc2Url")}
                                              className="inline-flex items-center gap-1 px-2 py-0.5 bg-slate-50 hover:bg-blue-50 border border-slate-200 hover:border-blue-300 rounded-lg text-[10px] font-bold text-slate-700 hover:text-blue-700 cursor-pointer transition active:scale-95 group/doc shadow-2xs"
                                            >
                                              {item.documents.doc2Url.startsWith("data:image") ? (
                                                <img src={item.documents.doc2Url} alt="Doc2 Front" className="w-3.5 h-3.5 object-cover rounded border border-slate-200" />
                                              ) : null}
                                              <span>{item.subCategory === "loan_lending_kyc" ? "Cheque Front" : "PAN Front"}</span>
                                              <span className="text-slate-400 group-hover/doc:text-blue-600"></span>
                                            </button>
                                          )}
                                          {item.documents.doc2BackUrl && (
                                            <button
                                              type="button"
                                              onClick={() => viewKycDocInLightbox(item, "doc2BackUrl")}
                                              className="inline-flex items-center gap-1 px-2 py-0.5 bg-slate-50 hover:bg-blue-50 border border-slate-200 hover:border-blue-300 rounded-lg text-[10px] font-bold text-slate-700 hover:text-blue-700 cursor-pointer transition active:scale-95 group/doc shadow-2xs"
                                            >
                                              {item.documents.doc2BackUrl.startsWith("data:image") ? (
                                                <img src={item.documents.doc2BackUrl} alt="Doc2 Back" className="w-3.5 h-3.5 object-cover rounded border border-slate-200" />
                                              ) : null}
                                              <span>{item.subCategory === "loan_lending_kyc" ? "Cheque Back" : "PAN Back"}</span>
                                              <span className="text-slate-400 group-hover/doc:text-blue-600"></span>
                                            </button>
                                          )}
                                        </div>
                                      </div>
                                    ) : (
                                      <div className="inline-flex items-center gap-1 text-[10px] font-bold text-slate-400 bg-slate-50 border border-slate-200 px-2 py-0.5 rounded">
                                         Photos Not Uploaded (Pending Submission)
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

              {/* Agent Mode Switcher: Paginated Referral Directory vs Applications & Foreclosure */}
              <div className="flex flex-wrap items-center justify-between gap-3 mb-5 pb-3 border-b border-gray-100">
                <div className="flex items-center gap-2 bg-slate-100 p-1 rounded-2xl">
                  <button
                    type="button"
                    onClick={() => {
                      setAgentDirectoryMode("paginated");
                      loadPaginatedAgents(1, paginatedAgentsSearch);
                    }}
                    className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition cursor-pointer ${
                      agentDirectoryMode === "paginated"
                        ? "bg-white text-indigo-700 shadow-xs"
                        : "text-slate-600 hover:text-slate-900"
                    }`}
                  >
                    Referral & Earnings Directory (Paginated)
                  </button>
                  <button
                    type="button"
                    onClick={() => setAgentDirectoryMode("applications")}
                    className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition cursor-pointer ${
                      agentDirectoryMode === "applications"
                        ? "bg-white text-blue-700 shadow-xs"
                        : "text-slate-600 hover:text-slate-900"
                    }`}
                  >
                    Partner Applications & Approvals ({agents.length})
                  </button>
                </div>
              </div>

              {agentDirectoryMode === "paginated" ? (
                <div className="space-y-4">
                  {/* Search and info bar */}
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                    <div className="relative flex-1 max-w-md">
                      <input
                        type="text"
                        placeholder="Search agent by name, phone, or referral code..."
                        value={paginatedAgentsSearch}
                        onChange={e => setPaginatedAgentsSearch(e.target.value)}
                        onKeyDown={e => {
                          if (e.key === "Enter") {
                            loadPaginatedAgents(1, paginatedAgentsSearch);
                          }
                        }}
                        className="w-full pl-9 pr-4 py-2 border border-gray-200 rounded-xl text-xs outline-none focus:ring-2 focus:ring-indigo-500 font-medium"
                      />
                      <span className="absolute left-3 top-2.5 text-gray-400 text-xs"></span>
                    </div>

                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => loadPaginatedAgents(paginatedAgentsPage, paginatedAgentsSearch)}
                        disabled={loadingPaginatedAgents}
                        className="px-3 py-1.5 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 rounded-xl text-xs font-bold transition cursor-pointer flex items-center gap-1.5 disabled:opacity-50"
                      >
                        <span>{loadingPaginatedAgents ? "⏳" : ""}</span>
                        <span>Refresh</span>
                      </button>
                      <span className="text-xs font-bold text-gray-500">
                        Total: {paginatedAgentsTotal} Agents
                      </span>
                    </div>
                  </div>

                  {/* Table */}
                  <div className="overflow-x-auto rounded-2xl border border-gray-200">
                    <table className="w-full text-left text-xs">
                      <thead className="bg-slate-50 text-slate-700 uppercase font-black tracking-wider text-[10px] border-b border-gray-200">
                        <tr>
                          <th className="px-4 py-3">Agent Name</th>
                          <th className="px-4 py-3">Referral Code</th>
                          <th className="px-4 py-3 text-center">Referrals Count</th>
                          <th className="px-4 py-3 text-right">Referral Earnings</th>
                          <th className="px-4 py-3 text-center">Status</th>
                          <th className="px-4 py-3">Business / City</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-100 bg-white">
                        {loadingPaginatedAgents ? (
                          <tr>
                            <td colSpan={6} className="px-4 py-10 text-center text-gray-400">
                              <span className="inline-block w-4 h-4 border-2 border-indigo-600 border-t-transparent rounded-full animate-spin mr-2" />
                              Loading agents (paginated)...
                            </td>
                          </tr>
                        ) : paginatedAgents.length === 0 ? (
                          <tr>
                            <td colSpan={6} className="px-4 py-10 text-center text-gray-400">
                              Koi agent record nahi mila.
                            </td>
                          </tr>
                        ) : (
                          paginatedAgents.map(ag => (
                            <tr key={ag._id} className="hover:bg-slate-50/80 transition">
                              <td className="px-4 py-3">
                                <div className="font-bold text-gray-900">{ag.name}</div>
                                <div className="text-[11px] text-gray-500 font-mono">{ag.phone}</div>
                              </td>
                              <td className="px-4 py-3">
                                <span className="font-mono font-bold text-blue-700 bg-blue-50 border border-blue-200 px-2 py-0.5 rounded text-[11px]">
                                  {ag.referralCode || "-"}
                                </span>
                              </td>
                              <td className="px-4 py-3 text-center">
                                <span className="inline-flex items-center justify-center px-2.5 py-0.5 rounded-full text-xs font-black bg-indigo-50 text-indigo-700">
                                  {ag.referralCount || 0}
                                </span>
                              </td>
                              <td className="px-4 py-3 text-right">
                                <span className="font-mono font-extrabold text-emerald-700 text-sm">
                                  ₹{(ag.referralEarnings || 0).toLocaleString("en-IN")}
                                </span>
                              </td>
                              <td className="px-4 py-3 text-center">
                                <span className={`px-2 py-0.5 rounded-full text-[10px] font-black uppercase ${
                                  ag.role === "agent" || ag.agentProfile?.status === "approved"
                                    ? "bg-emerald-100 text-emerald-800"
                                    : "bg-amber-100 text-amber-900"
                                }`}>
                                  {ag.role === "agent" || ag.agentProfile?.status === "approved" ? "Approved" : (ag.agentProfile?.status || "Pending")}
                                </span>
                              </td>
                              <td className="px-4 py-3 text-gray-600">
                                <div className="font-medium text-gray-800">{ag.agentProfile?.businessName || "-"}</div>
                                <div className="text-[10px] text-gray-400">{ag.agentProfile?.commissionModel === "team_1" ? "Team Model" : "Solo Model"}</div>
                              </td>
                            </tr>
                          ))
                        )}
                      </tbody>
                    </table>
                  </div>

                  {/* Pagination Footer */}
                  <div className="flex items-center justify-between pt-2">
                    <span className="text-xs text-gray-500">
                      Page <strong>{paginatedAgentsPage}</strong> of <strong>{paginatedAgentsTotalPages}</strong> ({paginatedAgentsTotal} agents total)
                    </span>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => loadPaginatedAgents(paginatedAgentsPage - 1, paginatedAgentsSearch)}
                        disabled={paginatedAgentsPage <= 1 || loadingPaginatedAgents}
                        className="px-3 py-1.5 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-xl text-xs font-bold transition disabled:opacity-40 cursor-pointer disabled:cursor-not-allowed"
                      >
                        ◀ Previous
                      </button>
                      <button
                        type="button"
                        onClick={() => loadPaginatedAgents(paginatedAgentsPage + 1, paginatedAgentsSearch)}
                        disabled={paginatedAgentsPage >= paginatedAgentsTotalPages || loadingPaginatedAgents}
                        className="px-3 py-1.5 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-xl text-xs font-bold transition disabled:opacity-40 cursor-pointer disabled:cursor-not-allowed"
                      >
                        Next ▶
                      </button>
                    </div>
                  </div>
                </div>
              ) : (
                <>
                  {/* Loan Department Capital Pool & Agent Allocation Overview */}
              {(() => {
                const totalAssignedAgentQuota = agents.reduce((sum, a) => {
                  const curVal = agentCategoryInputs[a._id]?.loanLimit !== undefined
                    ? Number(agentCategoryInputs[a._id]?.loanLimit) || 0
                    : Number(a.loanLimit ?? a.agentProfile?.loanLimit ?? 100000);
                  return sum + curVal;
                }, 0);
                const deptPoolTotal = Number(loanDepartmentPool.totalPool || 1000000);
                const unassignedDeptPool = Math.max(0, deptPoolTotal - totalAssignedAgentQuota);

                return (
                  <div className="mb-4 p-4 bg-gradient-to-r from-blue-950 via-indigo-950 to-slate-900 text-white rounded-2xl border border-blue-800/60 shadow-xs">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-3">
                      <div className="flex items-center gap-2">
                        <span className="w-2.5 h-2.5 rounded-full bg-emerald-400 animate-pulse"></span>
                        <div>
                          <span className="text-[11px] font-black uppercase tracking-wider text-blue-200 block">
                            Loan Department Capital & Agent Quota Pool
                          </span>
                          <span className="text-xs text-blue-300 font-medium">
                            Admin dwara Loan Department ko diya gaya total paisa aur Agents me distribution
                          </span>
                        </div>
                      </div>
                      <span className="text-xs font-mono font-bold px-3 py-1 bg-white/10 rounded-lg border border-white/15 text-blue-100">
                        {agents.length} Total Agents
                      </span>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-2 border-t border-white/10">
                      <div className="bg-white/5 p-3 rounded-xl border border-white/10">
                        <span className="text-[10px] text-blue-300 uppercase font-bold block">Dept Total Capital Pool</span>
                        <div className="text-xl sm:text-2xl font-black font-mono text-white mt-0.5">
                          ₹{deptPoolTotal.toLocaleString("en-IN")}
                        </div>
                        <span className="text-[9px] text-blue-300/80">Admin Sanctioned Dept Budget</span>
                      </div>

                      <div className="bg-white/5 p-3 rounded-xl border border-white/10">
                        <span className="text-[10px] text-indigo-300 uppercase font-bold block">Assigned to Agents</span>
                        <div className="text-xl sm:text-2xl font-black font-mono text-indigo-200 mt-0.5">
                          ₹{totalAssignedAgentQuota.toLocaleString("en-IN")}
                        </div>
                        <span className="text-[9px] text-indigo-200/80">Sum of All Assigned Quotas</span>
                      </div>

                      <div className="bg-emerald-500/10 p-3 rounded-xl border border-emerald-400/20">
                        <span className="text-[10px] text-emerald-300 uppercase font-bold block">Unassigned Pool Balance</span>
                        <div className="text-xl sm:text-2xl font-black font-mono text-emerald-300 mt-0.5">
                          ₹{unassignedDeptPool.toLocaleString("en-IN")}
                        </div>
                        <span className="text-[9px] text-emerald-200/80">Available to Assign to Agents</span>
                      </div>
                    </div>
                  </div>
                );
              })()}

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
                <p className="py-12 text-center text-gray-400 text-sm">No agent records found for this filter </p>
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
                              <span><a href={`tel:${a.phone}`} className="text-blue-600 font-bold hover:underline">{a.phone}</a></span>
                              <span>{a.email}</span>
                              {prof.city && <span>{prof.city}</span>}
                              {a.nominatedBy && (
                                <span className="bg-purple-100 text-purple-950 px-2 py-0.5 rounded-md font-extrabold border border-purple-300 text-[11px] flex items-center gap-1">
                                   Nominated as Sub-Agent by: <strong className="text-purple-900">{a.nominatedBy.name}</strong> ({a.nominatedBy.phone})
                                </span>
                              )}
                            </div>
                          </div>

                          <div className="flex flex-wrap items-center gap-2 shrink-0">
                            <a
                              href={`tel:${a.phone}`}
                              className="px-3 py-1.5 bg-blue-50 text-blue-700 hover:bg-blue-100 border border-blue-200 rounded-xl text-xs font-bold transition flex items-center gap-1"
                            >
                              Call Applicant
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
                                 Is Naye Agent Ke Liye 4 Commissions Set Karein:
                              </span>
                              <span className="text-[10px] bg-amber-200 text-amber-900 font-bold px-2 py-0.5 rounded-full">
                                Admin Custom Approval
                              </span>
                            </div>
                            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2 text-xs">
                              <div className="p-2 bg-white rounded-xl border border-blue-200 shadow-2xs">
                                <span className="text-[10px] font-bold text-blue-900 block mb-1">Loan %</span>
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
                                          ...cur,
                                          loan: e.target.value
                                        }
                                      });
                                    }}
                                    className="w-full px-2 py-1 text-xs font-black text-blue-950 text-center bg-blue-50/50 border border-blue-300 rounded-lg outline-none"
                                  />
                                  <span className="text-xs font-bold text-blue-900">%</span>
                                </div>
                              </div>
                              <div className="p-2 bg-white rounded-xl border border-emerald-200 shadow-2xs">
                                <span className="text-[10px] font-bold text-emerald-900 block mb-1">Lending %</span>
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
                                          ...cur,
                                          lending: e.target.value
                                        }
                                      });
                                    }}
                                    className="w-full px-2 py-1 text-xs font-black text-emerald-950 text-center bg-emerald-50/50 border border-emerald-300 rounded-lg outline-none"
                                  />
                                  <span className="text-xs font-bold text-emerald-900">%</span>
                                </div>
                              </div>
                              <div className="p-2 bg-white rounded-xl border border-purple-200 shadow-2xs">
                                <span className="text-[10px] font-bold text-purple-900 block mb-1">Bond %</span>
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
                                          ...cur,
                                          bond: e.target.value
                                        }
                                      });
                                    }}
                                    className="w-full px-2 py-1 text-xs font-black text-purple-950 text-center bg-purple-50/50 border border-purple-300 rounded-lg outline-none"
                                  />
                                  <span className="text-xs font-bold text-purple-900">%</span>
                                </div>
                              </div>
                              <div className="p-2 bg-white rounded-xl border border-indigo-200 shadow-2xs">
                                <span className="text-[10px] font-bold text-indigo-950 block mb-1">Loan Limit (₹)</span>
                                <div className="flex items-center gap-1">
                                  <span className="text-xs font-black text-indigo-900">₹</span>
                                  <input
                                    type="number"
                                    min="0"
                                    step="5000"
                                    placeholder="100000"
                                    value={agentCategoryInputs[a._id]?.loanLimit !== undefined ? agentCategoryInputs[a._id]?.loanLimit : (a.loanLimit ?? prof.loanLimit ?? 100000)}
                                    onChange={(e) => {
                                      const cur = agentCategoryInputs[a._id] || {};
                                      setAgentCategoryInputs({
                                        ...agentCategoryInputs,
                                        [a._id]: {
                                          ...cur,
                                          loanLimit: e.target.value
                                        }
                                      });
                                    }}
                                    className="w-full px-2 py-1 text-xs font-black text-indigo-950 text-center bg-indigo-50/50 border border-indigo-300 rounded-lg outline-none"
                                  />
                                </div>
                                <span className="text-[9px] text-indigo-600 block mt-0.5 font-medium">
                                  Dept Pool Baki: ₹{Math.max(0, Number(loanDepartmentPool.totalPool || 1000000) - agents.reduce((sum, ag) => sum + (agentCategoryInputs[ag._id]?.loanLimit !== undefined ? Number(agentCategoryInputs[ag._id]?.loanLimit) || 0 : Number(ag.loanLimit ?? ag.agentProfile?.loanLimit ?? 100000)), 0)).toLocaleString("en-IN")}
                                </span>
                              </div>
                            </div>
                            <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-amber-200">
                              <span className="text-[11px] text-amber-900 font-medium">
                                Wallet Transfers: <strong>0%</strong> (Nahi milega)
                              </span>
                              <button
                                onClick={() => {
                                  const cur = agentCategoryInputs[a._id] || {};
                                  const catComms = {
                                    loan: parseFloat(cur.loan !== undefined ? cur.loan : (prof.commissions?.loan ?? 1)),
                                    lending: parseFloat(cur.lending !== undefined ? cur.lending : (prof.commissions?.lending ?? 4)),
                                    investment: parseFloat(cur.investment !== undefined ? cur.investment : (prof.commissions?.investment ?? 1)),
                                    bond: parseFloat(cur.bond !== undefined ? cur.bond : (prof.commissions?.bond ?? 4))
                                  };
                                  const assignedLimit = cur.loanLimit !== undefined ? cur.loanLimit : (a.loanLimit ?? prof.loanLimit ?? 100000);
                                  approveAgent(a._id, undefined, catComms, assignedLimit);
                                }}
                                className="px-4 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-black transition shadow-sm active:scale-95 cursor-pointer flex items-center gap-1.5"
                              >
                                <span>✓</span> {a.nominatedBy ? "Approve Sub-Agent with these Rates & Limit" : "Approve Agent with these Rates & Limit"}
                              </button>
                            </div>
                          </div>
                        )}

                        {/* Agent Information Strip */}
                        <div className="pt-3 text-xs">
                          <div className="p-2.5 bg-white rounded-xl border border-gray-100">
                            <span className="text-gray-400 font-medium block text-[11px]">Business / Shop</span>
                            <span className="font-bold text-gray-800">{prof.businessName || "Not specified"}</span>
                          </div>
                        </div>

                        {/* Transparent Earnings Breakdown (Kamai Kahan Se Aayi) */}
                        <div className="mt-3 p-3 bg-gradient-to-r from-slate-50 to-indigo-50/40 rounded-xl border border-indigo-100">
                          <div className="flex flex-wrap items-center justify-between gap-1.5 mb-2.5">
                            <span className="font-extrabold text-xs text-indigo-950 flex items-center gap-1.5">
                               Kamai Vivran (Agent Earnings by Source)
                            </span>
                            <span className="text-xs font-black font-mono text-emerald-800 bg-emerald-100/90 px-2.5 py-0.5 rounded-full border border-emerald-300">
                              Kul Kamai: ₹{(a.earningsBreakdown?.total || a.referralEarnings || 0).toLocaleString("en-IN")}
                            </span>
                          </div>

                          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 text-center text-xs">
                            <div className="bg-white p-2.5 rounded-xl border border-blue-100 shadow-2xs">
                              <span className="text-[10px] text-gray-500 font-bold block mb-0.5">Loan</span>
                              <div className="font-black font-mono text-blue-700 text-sm">
                                ₹{(a.earningsBreakdown?.loan || 0).toLocaleString("en-IN")}
                              </div>
                              <span className="text-[9px] text-gray-400">Rate: {prof.commissions?.loan ?? prof.commissionRate ?? 1}%</span>
                            </div>

                            <div className="bg-white p-2.5 rounded-xl border border-emerald-100 shadow-2xs">
                              <span className="text-[10px] text-gray-500 font-bold block mb-0.5">Lending Account</span>
                              <div className="font-black font-mono text-emerald-700 text-sm">
                                ₹{(a.earningsBreakdown?.lending || 0).toLocaleString("en-IN")}
                              </div>
                              <span className="text-[9px] text-gray-400">Rate: {prof.commissions?.lending ?? 4}%</span>
                            </div>

                            <div className="bg-white p-2.5 rounded-xl border border-purple-100 shadow-2xs">
                              <span className="text-[10px] text-gray-500 font-bold block mb-0.5">Bonds</span>
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
                                 Attached Team & Customer Network ({a.referredMembers.length})
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
                                        <span>{isMemberAgent ? (memberIsTeam ? "" : "") : ""}</span>
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
                                             Make Team Agent
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
            </>
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
                     {pendingKycCount} KYC Pending Approval
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
                  Regular Customers ({users.filter(u => u.role !== "agent" && u.agentProfile?.status !== "approved").length})
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
                  Agents Only ({users.filter(u => u.role === "agent" || u.agentProfile?.status === "approved").length})
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
                  <span>{isApyLocked ? "" : ""}</span>
                  <span>{isApyLocked ? `APY Locked (${5 - apyTapCount} taps)` : "APY Unlocked (Lock Now)"}</span>
                </button>
              </div>

              {filteredUsers.length === 0 ? (
                <p className="py-10 text-center text-gray-400 text-sm">No users found for this filter</p>
              ) : (
                <>
                  <div className="hidden md:block overflow-x-auto rounded-2xl border border-slate-200/80 shadow-xs bg-white">
                    <table className="w-full min-w-[1280px] border-collapse">
                      <thead>
                        <tr className="bg-slate-50/90 border-b border-slate-200 text-left text-[11px] font-bold text-slate-500 uppercase tracking-wider whitespace-nowrap">
                          <th className="py-3.5 px-4 w-[220px]">Customer & Account</th>
                          <th className="py-3.5 px-3 w-[150px]">KYC Verification</th>
                          <th className="py-3.5 px-3 w-[110px]">APY Rate</th>
                          <th className="py-3.5 px-3 w-[130px]">Card Tier & VIP</th>
                          <th className="py-3.5 px-3 w-[120px]">Wallets</th>
                          <th className="py-3.5 px-3 w-[110px]">Capital Balance</th>
                          <th className="py-3.5 px-3 w-[120px]">24H Yield</th>
                          <th className="py-3.5 px-3 w-[140px]">Live Profit (30ms)</th>
                          <th className="py-3.5 px-3 w-[130px]">Lifetime Profit</th>
                          <th className="py-3.5 px-3 w-[130px]">Referral Lineage</th>
                          <th className="py-3.5 px-3 w-[95px]">Status</th>
                          <th className="py-3.5 px-4 w-[130px] text-right">Actions</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 text-xs">
                        {filteredUsers.map(u => {
                          const lineage = getUserLineage(u, users, agents);
                          const isAgent = u.role === "agent" || u.agentProfile?.status === "approved";
                          const initials = u.name
                            ? u.name.trim().split(/\s+/).map(n => n[0]).slice(0, 2).join("").toUpperCase()
                            : "U";

                          return (
                            <tr key={u._id} className="hover:bg-blue-50/30 transition-colors">
                              {/* 1. CUSTOMER & ACCOUNT */}
                              <td className="py-3.5 px-4 align-middle">
                                <div className="flex items-center gap-3">
                                  <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-blue-600 to-indigo-700 text-white font-black text-xs flex items-center justify-center shrink-0 shadow-2xs tracking-wider">
                                    {initials}
                                  </div>
                                  <div className="min-w-0">
                                    <div className="flex items-center gap-1.5 flex-wrap">
                                      <p className="font-extrabold text-sm text-slate-900 leading-tight truncate" title={u.name}>
                                        {u.name}
                                      </p>
                                      {isAgent && (
                                        <span className="px-1.5 py-0.2 rounded text-[9px] font-black bg-amber-100 text-amber-900 border border-amber-300 uppercase tracking-wide shrink-0">
                                          Agent
                                        </span>
                                      )}
                                      {u.role === "staff" && (
                                        <span className="px-1.5 py-0.2 rounded text-[9px] font-black bg-purple-100 text-purple-900 border border-purple-300 uppercase tracking-wide shrink-0" title={`Staff departments: ${(u.staffProfile?.departments || []).join(", ")}`}>
                                          Staff
                                        </span>
                                      )}
                                    </div>
                                    <div className="flex items-center gap-1.5 mt-1 flex-wrap">
                                      <span className="font-mono font-bold text-[10px] text-blue-700 bg-blue-50 px-1.5 py-0.5 rounded border border-blue-200/70 shrink-0">
                                        A/C: {u.accountNumber || `EFS${String(u._id).slice(-7).toUpperCase()}`}
                                      </span>
                                      <span className="text-slate-400 font-mono text-[11px] truncate">
                                        {u.phone}
                                      </span>
                                    </div>
                                    <p className="text-slate-400 text-[10px] truncate max-w-[170px] mt-0.5">
                                      {u.email}
                                    </p>
                                  </div>
                                </div>
                              </td>

                              {/* 2. KYC VERIFICATION */}
                              <td className="py-3.5 px-3 align-middle">
                                <div className="space-y-1.5">
                                  <div className="flex items-center gap-1.5 flex-wrap">
                                    {u.kycStatus === "verified" ? (
                                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-extrabold bg-emerald-50 text-emerald-700 border border-emerald-200">
                                        <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                                        Verified
                                      </span>
                                    ) : u.kycStatus === "pending" ? (
                                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-extrabold bg-amber-50 text-amber-700 border border-amber-200">
                                        <span className="w-1.5 h-1.5 rounded-full bg-amber-500 animate-pulse" />
                                        Pending
                                      </span>
                                    ) : u.kycStatus === "rejected" ? (
                                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-extrabold bg-rose-50 text-rose-700 border border-rose-200">
                                        ✕ Rejected
                                      </span>
                                    ) : (
                                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium bg-slate-50 text-slate-500 border border-slate-200">
                                        ○ None
                                      </span>
                                    )}

                                    {u.kycDocuments?.aadharNumber && (
                                      <span className="text-[10px] text-slate-400 font-mono">
                                        UID: {u.kycDocuments.aadharNumber.slice(0, 4)}••••
                                      </span>
                                    )}
                                  </div>

                                  {(u.kycDocuments?.docUrl || u.kycDocuments?.doc1Url || u.aadharNumber) && (
                                    <button
                                      type="button"
                                      onClick={() => setPreviewKycUser(u)}
                                      className="inline-flex items-center gap-1 px-2 py-0.5 bg-white hover:bg-blue-50 text-blue-700 border border-blue-200 rounded-md text-[10px] font-black transition active:scale-95 cursor-pointer shadow-2xs"
                                    >
                                      <span>📄</span>
                                      <span>View Docs</span>
                                    </button>
                                  )}

                                  {u.kycStatus === "pending" && (
                                    <div className="flex items-center gap-1 pt-0.5">
                                      <button
                                        onClick={() => approveKyc(u._id)}
                                        className="px-2 py-0.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded text-[10px] font-bold shadow-2xs active:scale-95 cursor-pointer"
                                      >
                                        ✓ Approve
                                      </button>
                                      <button
                                        onClick={() => rejectKyc(u._id)}
                                        className="px-2 py-0.5 bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 rounded text-[10px] font-bold active:scale-95 cursor-pointer"
                                      >
                                        Reject
                                      </button>
                                    </div>
                                  )}
                                </div>
                              </td>

                              {/* 3. APY RATE */}
                              <td className="py-3.5 px-3 align-middle">
                                {isApyLocked ? (
                                  <span className="font-mono font-black text-xs text-blue-700 bg-blue-50/80 px-2.5 py-1 rounded-lg border border-blue-200/70 inline-flex items-center gap-1" title="12% annual savings yield">
                                    {u.interestRate || 12}% p.a.
                                  </span>
                                ) : (
                                  <div className="flex items-center gap-1">
                                    <input
                                      type="number"
                                      defaultValue={u.interestRate || 12}
                                      id={`rate-${u._id}`}
                                      min="1"
                                      max="100"
                                      className="w-12 px-1.5 py-0.5 border border-blue-300 rounded-lg text-xs font-black text-center text-blue-600 focus:ring-1 focus:ring-blue-500 bg-white"
                                    />
                                    <span className="text-xs font-bold text-slate-400">%</span>
                                    <button
                                      onClick={() => {
                                        const val = document.getElementById(`rate-${u._id}`)?.value;
                                        updateCustomInterest(u._id, val);
                                      }}
                                      className="px-2 py-1 bg-[#1D6AE5] hover:bg-[#1558cc] text-white rounded-lg text-[10px] font-black shadow-2xs cursor-pointer active:scale-95"
                                    >
                                      Save
                                    </button>
                                  </div>
                                )}
                              </td>

                              {/* 4. CARD TIER & VIP */}
                              <td className="py-3.5 px-3 align-middle">
                                <div className="space-y-1">
                                  {u.cardTier === "platinum" || u.cardStatus?.platinum?.unlocked ? (
                                    <>
                                      <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-black bg-gradient-to-r from-amber-400 to-yellow-400 text-amber-950 shadow-2xs border border-amber-300">
                                        👑 PLATINUM
                                      </span>
                                      <button
                                        onClick={() => toggleUserCard(u._id, u.cardTier, u.cardStatus?.platinum?.unlocked)}
                                        className="block text-[10px] font-bold text-rose-600 hover:text-rose-800 hover:underline cursor-pointer active:scale-95"
                                      >
                                        Revoke VIP
                                      </button>
                                    </>
                                  ) : (
                                    <>
                                      <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-slate-100 text-slate-700 border border-slate-200">
                                        SILVER <span className="text-slate-400 font-mono text-[9px]">({u.loansCount || 0}/4)</span>
                                      </span>
                                      <button
                                        onClick={() => toggleUserCard(u._id, u.cardTier, u.cardStatus?.platinum?.unlocked)}
                                        className="block px-2 py-0.5 rounded-md text-[10px] font-black bg-indigo-50 hover:bg-indigo-100 text-indigo-700 border border-indigo-200/80 transition active:scale-95 cursor-pointer shadow-2xs"
                                      >
                                        Unlock VIP
                                      </button>
                                    </>
                                  )}
                                </div>
                              </td>

                              {/* 5. WALLETS */}
                              <td className="py-3.5 px-3 align-middle">
                                <div className="flex items-center gap-1 flex-wrap">
                                  <span className="px-2 py-0.5 bg-emerald-50 border border-emerald-200 text-emerald-700 rounded-full text-[10px] font-bold" title="Savings (12% APY)">
                                    Savings
                                  </span>
                                  <span className={`px-2 py-0.5 border rounded-full text-[10px] font-bold ${u.wallets?.debit?.active ? "bg-blue-50 border-blue-200 text-blue-700" : "bg-slate-50 border-slate-200 text-slate-400"}`} title="Debit Wallet">
                                    Debit
                                  </span>
                                  <span className={`px-2 py-0.5 border rounded-full text-[10px] font-bold ${u.wallets?.lending?.active ? "bg-purple-50 border-purple-200 text-purple-700" : "bg-slate-50 border-slate-200 text-slate-400"}`} title="Lending Wallet">
                                    Loans
                                  </span>
                                </div>
                              </td>

                              {/* 6. BALANCE */}
                              <td className="py-3.5 px-3 align-middle">
                                <p className="font-mono font-black text-sm text-slate-900 leading-tight">
                                  ₹{Number(u.balance || 0).toLocaleString("en-IN")}
                                </p>
                                <span className="text-[10px] text-emerald-600 font-bold font-mono mt-0.5 block">
                                  Active Capital
                                </span>
                              </td>

                              {/* 7. 24H YIELD */}
                              <td className="py-3.5 px-3 align-middle">
                                {Number(u.balance || 0) > 0 ? (
                                  <div>
                                    <p className="font-mono font-bold text-xs text-indigo-700 leading-tight">
                                      +₹{((Number(u.balance) * (u.interestRate || 12)) / 36500).toFixed(2)}
                                      <span className="text-[10px] text-slate-400 font-normal"> / 24h</span>
                                    </p>
                                    <p className="text-[10px] text-slate-400 font-mono mt-0.5">
                                      ≈ ₹{(((Number(u.balance) * (u.interestRate || 12)) / 36500) / 24).toFixed(4)}/hr
                                    </p>
                                  </div>
                                ) : (
                                  <span className="text-slate-300 font-mono text-xs">—</span>
                                )}
                              </td>

                              {/* 8. LIVE PROFIT */}
                              <td className="py-3.5 px-3 align-middle">
                                {Number(u.balance || 0) > 0 ? (
                                  <div>
                                    <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-mono font-bold bg-emerald-50 text-emerald-700 border border-emerald-200 shadow-2xs">
                                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                                      <LiveUserProfitCell user={u} />
                                    </span>
                                    <p className="text-[10px] text-emerald-600 font-mono mt-0.5 font-semibold">
                                      30ms Live Accrual
                                    </p>
                                  </div>
                                ) : (
                                  <span className="text-slate-400 font-mono text-xs">₹0.0000</span>
                                )}
                              </td>

                              {/* 9. LIFETIME PROFIT */}
                              <td className="py-3.5 px-3 align-middle">
                                {Number(u.profitBalance || 0) > 0 ? (
                                  <div>
                                    <span className="font-mono font-black text-xs text-blue-700 leading-tight block">
                                      +₹{Number(u.profitBalance).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 4 })}
                                    </span>
                                    <p className="text-[10px] text-slate-400 font-mono mt-0.5">
                                      Lifetime Accrued
                                    </p>
                                  </div>
                                ) : (
                                  <span className="text-slate-400 font-mono text-xs">₹0.0000</span>
                                )}
                              </td>

                              {/* 10. AGENT / REFER */}
                              <td className="py-3.5 px-3 align-middle">
                                {isAgent ? (
                                  <div>
                                    <span className="inline-flex items-center bg-amber-50 text-amber-900 border border-amber-200 px-2 py-0.5 rounded-md text-xs font-mono font-black">
                                      Code: {u.referralCode || "—"}
                                    </span>
                                    <p className="text-[10px] text-slate-400 font-medium mt-0.5">
                                      {u.referralCount || 0} clients
                                    </p>
                                  </div>
                                ) : lineage.agentName ? (
                                  <div>
                                    <span className="font-bold text-xs text-slate-800 leading-tight block truncate max-w-[130px]" title={lineage.agentName}>
                                      {lineage.agentName}
                                    </span>
                                    {lineage.agentCode && (
                                      <p className="text-[10px] text-slate-400 font-mono mt-0.5">Code: {lineage.agentCode}</p>
                                    )}
                                  </div>
                                ) : (
                                  <span className="text-slate-400 text-xs italic">Direct</span>
                                )}
                              </td>

                              {/* 11. STATUS */}
                              <td className="py-3.5 px-3 align-middle">
                                <div className="space-y-1">
                                  <span className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-extrabold ${u.isBlocked ? "bg-rose-100 text-rose-700 border border-rose-200" : "bg-emerald-100 text-emerald-800 border border-emerald-200"}`}>
                                    <span className={`w-1.5 h-1.5 rounded-full ${u.isBlocked ? "bg-rose-500" : "bg-emerald-500"}`} />
                                    {u.isBlocked ? "Blocked" : "Active"}
                                  </span>
                                  {u.isUninstallProtected && (
                                    <span className="inline-block px-1.5 py-0.2 rounded text-[9px] font-black bg-rose-50 text-rose-700 border border-rose-200">
                                      🔒 Lock App
                                    </span>
                                  )}
                                </div>
                              </td>

                              {/* 12. ACTIONS */}
                              <td className="py-3.5 px-4 align-middle text-right">
                                <div className="flex flex-col gap-1.5 min-w-[110px] items-end">
                                  <button
                                    type="button"
                                    onClick={() => toggleBlock(u._id)}
                                    className={`w-full py-1 rounded-lg text-xs font-bold transition cursor-pointer active:scale-95 shadow-2xs ${
                                      u.isBlocked
                                        ? "bg-emerald-600 hover:bg-emerald-700 text-white"
                                        : "bg-white hover:bg-rose-50 text-rose-700 border border-rose-200"
                                    }`}
                                  >
                                    {u.isBlocked ? "Unblock" : "Block"}
                                  </button>
                                  <div className="flex items-center gap-1 w-full">
                                    <button
                                      type="button"
                                      onClick={() => openResetPasswordModal(u)}
                                      className="flex-1 py-1 rounded-lg text-[10px] font-bold text-slate-700 bg-slate-100 hover:bg-slate-200 border border-slate-200 transition cursor-pointer active:scale-95 text-center"
                                      title="Reset Password"
                                    >
                                      🔑 Pass
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() => openAssignStaffModal(u)}
                                      className="flex-1 py-1 rounded-lg text-[10px] font-bold text-purple-700 bg-purple-50 hover:bg-purple-100 border border-purple-200 transition cursor-pointer active:scale-95 text-center"
                                      title="Assign Staff Role"
                                    >
                                      👥 Desk
                                    </button>
                                  </div>
                                </div>
                              </td>
                            </tr>
                          );
                        })}
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
                              {u.role === "staff" && (
                                <span className="px-2 py-0.5 rounded text-[10px] font-black bg-purple-100 text-purple-900 border border-purple-300 uppercase tracking-wide shrink-0" title={`Staff departments: ${(u.staffProfile?.departments || []).join(", ")}`}>
                                  Staff ({u.staffProfile?.departments?.length ? u.staffProfile.departments.join(", ") : "Desk"})
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
                                Lock
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
                                View Submitted Docs
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

                        {/* MOBILE CONTROLS: CARD TIER */}
                        <div className="p-3 bg-slate-50 rounded-xl border border-slate-200/80 mb-3 flex items-center justify-between text-xs">
                          <div>
                            <span className="font-bold text-slate-700">Card Tier</span>
                            <span className="text-[11px] text-slate-400 font-mono ml-1.5">({u.loansCount || 0}/4 loans)</span>
                          </div>
                          {u.cardTier === "platinum" || u.cardStatus?.platinum?.unlocked ? (
                            <div className="flex items-center gap-2">
                              <span className="px-2.5 py-1 rounded-lg text-xs font-black bg-amber-500 text-white shadow-2xs">
                                👑 PLATINUM (VIP)
                              </span>
                              <button
                                type="button"
                                onClick={() => toggleUserCard(u._id, u.cardTier, u.cardStatus?.platinum?.unlocked)}
                                className="text-[11px] font-bold text-rose-600 hover:text-rose-700 underline cursor-pointer active:scale-95 transition"
                              >
                                Revoke
                              </button>
                            </div>
                          ) : (
                            <button
                              type="button"
                              onClick={() => toggleUserCard(u._id, u.cardTier, u.cardStatus?.platinum?.unlocked)}
                              className="px-3 py-1 rounded-lg text-xs font-bold bg-white text-slate-700 hover:bg-slate-100 border border-slate-300 shadow-2xs cursor-pointer active:scale-95 transition"
                            >
                              Silver (Unlock VIP)
                            </button>
                          )}
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

                        {/* 24-HOUR EXPECTED YIELD CARD */}
                        <div className="w-full mb-3 p-2.5 bg-gradient-to-br from-blue-50/90 via-indigo-50/60 to-slate-50 border border-blue-200/80 rounded-xl shadow-2xs flex items-center justify-between gap-2">
                          <div className="flex items-center gap-1.5 min-w-0">
                            <span className="font-extrabold text-slate-800 text-xs leading-none">24H Expected Yield</span>
                          </div>
                          <div className="text-right shrink-0">
                            <span className="font-mono font-black text-indigo-700 text-xs sm:text-sm">
                              {Number(u.balance || 0) > 0 ? `+₹${((Number(u.balance) * (u.interestRate || 12)) / 36500).toFixed(2)}` : "₹0.00"}
                              <span className="text-[10px] font-semibold text-slate-500 ml-1">/ din</span>
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
                            {u.isUninstallProtected ? "Unlock Uninstall" : "Block Uninstall"}
                          </button>
                        </div>
                        <button
                          onClick={() => openResetPasswordModal(u)}
                          className="w-full mt-2 py-2 rounded-xl text-xs font-bold text-amber-950 bg-amber-100 hover:bg-amber-200 border border-amber-300 transition flex items-center justify-center gap-1 shadow-2xs cursor-pointer active:scale-95"
                        >
                          Reset User Password
                        </button>
                        <button
                          onClick={() => openAssignStaffModal(u)}
                          className="w-full mt-2 py-2 rounded-xl text-xs font-bold text-purple-950 bg-purple-100 hover:bg-purple-200 border border-purple-300 transition flex items-center justify-center gap-1 shadow-2xs cursor-pointer active:scale-95"
                        >
                          Assign Desk Role (Tum Loan/KYC/Deposit wale ho)
                        </button>
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
                  <h3 className="text-base sm:text-lg font-bold font-display">App Devices & Remote Parental Bedtime Lock</h3>
                  <p className="text-xs text-gray-500">Jab bacha app chalayega, to uska device yahan dikhega. Aap yahan se 1-click me Bedtime Lock laga ya hata sakte hain.</p>
                </div>
                <button onClick={loadDevices} className="px-3.5 py-1.5 bg-gray-100 hover:bg-gray-200 text-gray-700 text-xs font-bold rounded-xl transition cursor-pointer self-start sm:self-auto">
                  Refresh Devices
                </button>
              </div>

              {/* PIN Card for Admin */}
              <div className="mb-4 sm:mb-6 p-3.5 sm:p-4 rounded-2xl bg-blue-50/80 border border-blue-200/80 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 sm:w-10 sm:h-10 rounded-xl bg-blue-600 text-white flex items-center justify-center shadow-xs shrink-0">
                    <svg className="w-5 h-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z" />
                    </svg>
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
                  <p className="text-3xl mb-2"></p>
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
                              {d.deviceName || "Android Phone"}
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
                                {d.adminStatus === "active" ? "LOCKED (Uninstall Blocked)" : "UNLOCKED"}
                              </span>
                            </td>
                            <td className="py-3.5 px-3 text-right">
                              {d.adminStatus === "active" ? (
                                <button
                                  onClick={() => unlockDevice(d.deviceId)}
                                  className="px-3.5 py-1.5 bg-amber-500 hover:bg-amber-600 text-white rounded-lg text-xs font-bold shadow-xs transition cursor-pointer"
                                >
                                  Unlock Device (Allow Uninstall)
                                </button>
                              ) : (
                                <button
                                  onClick={() => lockDevice(d.deviceId)}
                                  className="px-3.5 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-xs font-bold shadow-xs transition cursor-pointer"
                                >
                                  Lock Device (Send OS Prompt)
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
                            {d.adminStatus === "active" ? "LOCKED" : "UNLOCKED"}
                          </span>
                        </div>

                        <div className="grid grid-cols-2 gap-2 text-xs py-2 border-y border-gray-200/70 text-gray-600">
                          <div>
                            <span className="text-gray-400 block text-[10px] uppercase font-bold">Device Model</span>
                            <span className="font-semibold text-gray-800 truncate block">{d.deviceName || "Android Phone"}</span>
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
                              Unlock Device (Allow Uninstall)
                            </button>
                          ) : (
                            <button
                              onClick={() => lockDevice(d.deviceId)}
                              className="w-full py-2.5 px-3 bg-blue-600 hover:bg-blue-700 active:scale-95 text-white rounded-xl text-xs font-bold shadow-xs transition flex items-center justify-center gap-1.5 cursor-pointer"
                            >
                              Lock Device (Send OS Prompt)
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
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4 sm:mb-5 pb-3 border-b border-gray-100">
                <div>
                  <h3 className="text-base sm:text-lg font-bold font-display text-gray-900 flex items-center gap-2">
                    
                    <span>Loan Applications & Ledger</span>
                    <span className="px-2.5 py-0.5 rounded-full text-xs font-black bg-blue-100 text-blue-800">
                      {loans.filter(l => l.status === "active" || l.status === "approved" || l.status === "closed").length}
                    </span>
                  </h3>
                  <p className="text-xs text-gray-500 mt-0.5">
                    Sabhi active, pending aur completed loans ka live record aur kist schedule.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => switchTab("issue-loan")}
                  className="px-4 py-2 bg-blue-600 hover:bg-blue-700 active:scale-95 text-white rounded-xl text-xs font-black transition flex items-center gap-2 shadow-xs cursor-pointer self-start sm:self-auto"
                >
                   Issue Loan / Apply on Behalf
                </button>
              </div>

              {/* High-Level Loan Portfolio Summary Card (Kitne ko gaya & Total kitna gaya) */}
              {(() => {
                const disbursedLoans = loans.filter(l => l.status === "active" || l.status === "approved" || l.status === "closed");
                const uniqueBorrowerIds = new Set(disbursedLoans.map(l => String(l.userId?._id || l.userId?.id || l.userId || "")).filter(Boolean));
                const totalDisbursedAmt = disbursedLoans.reduce((s, l) => s + (l.amount || 0), 0);
                const totalPaidAmt = disbursedLoans.reduce((s, l) => s + (l.paidAmount || 0), 0);
                const activeOutstandingAmt = loans.filter(l => l.status === "active").reduce((s, l) => s + Number(l.remainingAmount !== undefined ? l.remainingAmount : (Math.max(0, (l.totalPayable || l.amount || 0) - (l.paidAmount || 0)))), 0);
                const activeLoansCount = loans.filter(l => l.status === "active").length;

                return (
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 sm:gap-3.5 mb-5">
                    <div className="p-3 sm:p-4 rounded-xl bg-blue-50/80 border border-blue-200/80">
                      <span className="text-[11px] font-bold text-blue-700 block">Kitne Ko Loan Gaya</span>
                      <div className="text-base sm:text-xl font-black text-blue-950 mt-0.5">
                        {uniqueBorrowerIds.size} <span className="text-xs font-semibold text-blue-700">Borrowers ({disbursedLoans.length} Loans)</span>
                      </div>
                    </div>
                    <div className="p-3 sm:p-4 rounded-xl bg-emerald-50/80 border border-emerald-200/80">
                      <span className="text-[11px] font-bold text-emerald-700 block">Total Kitna Paisa Gaya</span>
                      <div className="text-base sm:text-xl font-black text-emerald-950 font-mono mt-0.5">
                        ₹{totalDisbursedAmt.toLocaleString("en-IN")}
                      </div>
                    </div>
                    <div className="p-3 sm:p-4 rounded-xl bg-teal-50/80 border border-teal-200/80">
                      <span className="text-[11px] font-bold text-teal-700 block">Kitna Wapas Aaya (Paid)</span>
                      <div className="text-base sm:text-xl font-black text-teal-950 font-mono mt-0.5">
                        ₹{totalPaidAmt.toLocaleString("en-IN")}
                      </div>
                    </div>
                    <div className="p-3 sm:p-4 rounded-xl bg-amber-50/80 border border-amber-200/80">
                      <span className="text-[11px] font-bold text-amber-700 block">Bacha Hua Due (Active)</span>
                      <div className="text-base sm:text-xl font-black text-amber-950 font-mono mt-0.5">
                        ₹{activeOutstandingAmt.toLocaleString("en-IN")} <span className="text-[10px] text-amber-700">({activeLoansCount} Active)</span>
                      </div>
                    </div>
                  </div>
                );
              })()}

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
                                {l.loanType === "student" ? "Student" : l.loanType === "micro_business" ? "Micro" : "Personal"}
                              </span>
                            </div>
                            <p className="text-xs text-gray-400">{l.userId?.email} • Phone: {l.userId?.phone || "N/A"}</p>
                          </div>
                          <span className={`px-3 py-1 rounded-full text-xs font-bold shrink-0 ${loanStatusColor[l.status] || "bg-gray-100"}`}>{l.status.toUpperCase()}</span>
                        </div>

                        {/* 10:00 AM Cutoff & Rollover Policy Desk */}
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
                              Har kist subah 10:00 AM se pehle bharni hoti hai. <strong>10:00 AM ke baad 2% penalty</strong> lagti hai. Agar 1 kist chhoot gayi to agle installment me rollover hokar jud jayegi (ya borrower agle cycle se pehle clear kar sakta hai).
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

                        {/* Overdue Penalty Controller & Banner */}
                        {l.status === "active" && (l.penaltyDue > 0 || l.overdueInstallmentsCount > 0 || l.penaltyWaived) && (
                          <div className={`mb-3 p-3 rounded-xl border flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs ${
                            l.penaltyWaived ? "bg-amber-50 border-amber-200 text-amber-900" : "bg-rose-50 border-rose-200 text-rose-900"
                          }`}>
                            <div>
                              <span className="font-extrabold flex items-center gap-1.5">
                                <span>{l.penaltyWaived ? "⏸️" : ""}</span>
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
                        {(() => {
                          const isRejected = l.status === "rejected";
                          const pFee = Number(l.processingFee !== undefined && l.processingFee !== null ? l.processingFee : Math.round(l.amount * 0.05));
                          const uFee = Number(l.upiCharges !== undefined && l.upiCharges !== null ? l.upiCharges : Math.round(l.amount * 0.01));
                          const inHand = isRejected ? 0 : Number(l.disbursalAmount || Math.max(0, l.amount - pFee - uFee));

                          return (
                            <>
                              {/* User In-Hand Disbursal Breakdown Desk */}
                              {isRejected ? (
                                <div className="mb-3.5 p-3 bg-rose-50 border border-rose-200 rounded-xl text-xs space-y-1">
                                  <div className="flex flex-wrap items-center justify-between gap-1.5">
                                    <div className="flex items-center gap-1.5 font-black text-rose-950">
                                      <span>Loan Application Status:</span>
                                      <span className="font-mono text-sm font-black text-rose-700 bg-rose-100/70 px-2 py-0.5 rounded-lg border border-rose-300/60">
                                        REJECTED (No Disbursal)
                                      </span>
                                    </div>
                                    <span className="text-[10px] bg-rose-100 text-rose-800 font-bold px-2 py-0.5 rounded-full font-mono">
                                      ₹0 Disbursed
                                    </span>
                                  </div>
                                  <p className="text-[11px] text-rose-800 leading-relaxed font-medium">
                                    Ye loan reject ho gaya tha. Is par koi paisa transfer nahi hua aur borrower par koi remaining due ya repayment nahi hai.
                                  </p>
                                </div>
                              ) : (
                                <div className="mb-3.5 p-3 bg-emerald-50/90 border border-emerald-200/90 rounded-xl text-xs space-y-1">
                                  <div className="flex flex-wrap items-center justify-between gap-1.5">
                                    <div className="flex items-center gap-1.5 font-black text-emerald-950">
                                      <span className="text-sm"></span>
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
                                    <strong>Kyu itna gaya:</strong> Sanctioned loan ₹{l.amount.toLocaleString("en-IN")} me se <strong>₹{pFee.toLocaleString("en-IN")} (5% Processing Fee)</strong> aur <strong>₹{uFee.toLocaleString("en-IN")} (1% Transfer/UPI Charge)</strong> deduct hokar seedhe user ke bank/wallet me transfer hota hai.
                                  </p>
                                </div>
                              )}

                              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-6 gap-3 text-sm mb-4">
                                {[
                                  { label: "Loan Sanctioned", value: isRejected ? `₹${l.amount.toLocaleString("en-IN")} (Rejected)` : `₹${l.amount.toLocaleString("en-IN")}` },
                                  { label: "Khate Me Jayega", value: isRejected ? "₹0 (Rejected)" : `₹${inHand.toLocaleString("en-IN")}`, highlight: !isRejected },
                                  { label: "Rate (locked)", value: isRejected ? "0%" : `${l.interestRate}% p.a.` },
                                  { label: "Per Installment", value: isRejected ? "₹0" : `₹${l.installmentAmount || l.emiAmount}` },
                                  { label: "Paid / Total", value: isRejected ? "0 / 0 (Rejected)" : `${paidCount} / ${totalCount} Paid` },
                                  { label: "Remaining Dues", value: isRejected ? "₹0 (Rejected)" : `₹${(l.remainingAmount ?? l.amount).toLocaleString("en-IN")}` },
                                ].map(({ label, value, highlight }) => (
                                  <div key={label} className={highlight ? "bg-emerald-50/60 p-1.5 rounded-lg border border-emerald-200/60" : ""}>
                                    <p className="text-gray-400 text-xs">{label}</p>
                                    <p className={`font-bold ${highlight ? "text-emerald-700 font-black text-sm font-mono" : ""}`}>{value}</p>
                                  </div>
                                ))}
                              </div>
                            </>
                          );
                        })()}
                        {l.referralCommissionPaid && (
                          <div className="mb-3 text-xs bg-orange-50 border border-orange-200 rounded-lg px-3 py-2 text-orange-700 font-semibold">
                            Referral commission ₹{l.referralCommissionAmount} paid on this loan
                          </div>
                        )}
                        {l.earlyClosed && (
                          <div className="mb-3 text-xs bg-emerald-50 border border-emerald-200 rounded-xl p-3 text-emerald-950 space-y-1.5">
                            <div className="flex items-center justify-between font-bold">
                              <span className="flex items-center gap-1.5">
                                 Early Pre-Closed (Foreclosure 3-Way Split)
                              </span>
                              <span className="text-[10px] bg-emerald-200 text-emerald-900 px-2 py-0.5 rounded-full font-extrabold uppercase">
                                {l.precloseDiscountPercent ? `${l.precloseDiscountPercent}% Total Pool` : 'Closed Early'}
                              </span>
                            </div>
                            {l.precloseTotalPool > 0 ? (
                              <div className="grid grid-cols-3 gap-2 mt-2 pt-2 border-t border-emerald-200/60 text-[11px]">
                                <div className="bg-white/90 p-2 rounded-lg border border-emerald-100 shadow-2xs">
                                  <span className="text-gray-500 block text-[10px] font-semibold">User Discount</span>
                                  <strong className="text-emerald-700 text-xs">₹{(l.precloseUserDiscount || 0).toLocaleString("en-IN")}</strong>
                                </div>
                                <div className="bg-white/90 p-2 rounded-lg border border-emerald-100 shadow-2xs">
                                  <span className="text-gray-500 block text-[10px] font-semibold">Agent Benefit</span>
                                  <strong className="text-amber-700 text-xs">₹{(l.precloseAgentBenefit || 0).toLocaleString("en-IN")}</strong>
                                </div>
                                <div className="bg-white/90 p-2 rounded-lg border border-emerald-100 shadow-2xs">
                                  <span className="text-gray-500 block text-[10px] font-semibold">Company Profit</span>
                                  <strong className="text-blue-700 text-xs">₹{(l.precloseCompanyProfit || 0).toLocaleString("en-IN")}</strong>
                                </div>
                              </div>
                            ) : (
                              <p className="text-[11px] text-gray-600">Standard 15-installment payoff early closure.</p>
                            )}
                          </div>
                        )}
                        {/* SUBMITTED LOAN DOCUMENTS */}
                        {(() => {
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

                          const hasAny = Boolean(aadharFront || aadharBack || panFront || panBack || chequeFront || chequeBack || studentFront || studentBack || offlineProof);
                          if (!hasAny) return null;

                          return (
                            <div className="p-3 bg-slate-50 border border-slate-200/90 rounded-xl space-y-2 mb-3">
                              <div className="flex items-center justify-between text-xs font-bold text-slate-800">
                                <span className="flex items-center gap-1.5">
                                   Submitted Loan Verification Documents
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
                                     Offline Slip 
                                  </button>
                                )}
                                {aadharFront && (
                                  <button
                                    type="button"
                                    onClick={() => { setLightboxImg(aadharFront); setZoomLevel(1); }}
                                    className="flex items-center justify-center gap-1 px-2 py-2 bg-white border border-slate-200 rounded-lg text-[11px] font-semibold text-slate-800 hover:bg-slate-100 transition active:scale-95 cursor-pointer shadow-2xs"
                                  >
                                    <span>🆔</span> Aadhaar (Front) 
                                  </button>
                                )}
                                {aadharBack && (
                                  <button
                                    type="button"
                                    onClick={() => { setLightboxImg(aadharBack); setZoomLevel(1); }}
                                    className="flex items-center justify-center gap-1 px-2 py-2 bg-white border border-slate-200 rounded-lg text-[11px] font-semibold text-slate-800 hover:bg-slate-100 transition active:scale-95 cursor-pointer shadow-2xs"
                                  >
                                    <span>🆔</span> Aadhaar (Back) 
                                  </button>
                                )}
                                {panFront && (
                                  <button
                                    type="button"
                                    onClick={() => { setLightboxImg(panFront); setZoomLevel(1); }}
                                    className="flex items-center justify-center gap-1 px-2 py-2 bg-white border border-slate-200 rounded-lg text-[11px] font-semibold text-slate-800 hover:bg-slate-100 transition active:scale-95 cursor-pointer shadow-2xs"
                                  >
                                     PAN (Front) 
                                  </button>
                                )}
                                {panBack && (
                                  <button
                                    type="button"
                                    onClick={() => { setLightboxImg(panBack); setZoomLevel(1); }}
                                    className="flex items-center justify-center gap-1 px-2 py-2 bg-white border border-slate-200 rounded-lg text-[11px] font-semibold text-slate-800 hover:bg-slate-100 transition active:scale-95 cursor-pointer shadow-2xs"
                                  >
                                     PAN (Back) 
                                  </button>
                                )}
                                {chequeFront && (
                                  <button
                                    type="button"
                                    onClick={() => { setLightboxImg(chequeFront); setZoomLevel(1); }}
                                    className="flex items-center justify-center gap-1 px-2 py-2 bg-white border border-amber-300 rounded-lg text-[11px] font-semibold text-amber-900 hover:bg-amber-50 transition active:scale-95 cursor-pointer shadow-2xs"
                                  >
                                     Cheque (Front) 
                                  </button>
                                )}
                                {chequeBack && (
                                  <button
                                    type="button"
                                    onClick={() => { setLightboxImg(chequeBack); setZoomLevel(1); }}
                                    className="flex items-center justify-center gap-1 px-2 py-2 bg-white border border-amber-300 rounded-lg text-[11px] font-semibold text-amber-900 hover:bg-amber-50 transition active:scale-95 cursor-pointer shadow-2xs"
                                  >
                                     Cheque (Back) 
                                  </button>
                                )}
                                {studentFront && (
                                  <button
                                    type="button"
                                    onClick={() => { setLightboxImg(studentFront); setZoomLevel(1); }}
                                    className="flex items-center justify-center gap-1 px-2 py-2 bg-white border border-sky-200 rounded-lg text-[11px] font-semibold text-sky-800 hover:bg-sky-50 transition active:scale-95 cursor-pointer shadow-2xs"
                                  >
                                     Student ID (Front) 
                                  </button>
                                )}
                                {studentBack && (
                                  <button
                                    type="button"
                                    onClick={() => { setLightboxImg(studentBack); setZoomLevel(1); }}
                                    className="flex items-center justify-center gap-1 px-2 py-2 bg-white border border-sky-200 rounded-lg text-[11px] font-semibold text-sky-800 hover:bg-sky-50 transition active:scale-95 cursor-pointer shadow-2xs"
                                  >
                                     Student ID (Back) 
                                  </button>
                                )}
                              </div>
                            </div>
                          );
                        })()}

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
                                    <span className="text-base sm:text-lg shrink-0 mt-0.5 sm:mt-0"></span>
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
                                      {chosenOpt === "none" ? "NA LEIN (Pura Paisa)" : chosenOpt === "deduct" ? "Advance Kaatein" : "Waive/Maaf"}
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
                                        <span>Pehli Kist NA lein</span>
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
                                        <span>Pehli Kist Advance Kaatein</span>
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

                              {/* Interactive Live Breakdown Desk for selected option */}
                              <DisbursalBreakdownDesk loan={l} chosenOpt={chosenOpt} />

                              {/* Action Buttons */}
                              <div className="flex flex-col sm:flex-row gap-2 sm:gap-3 relative">
                                <button
                                  type="button"
                                  onClick={() => {
                                    setAdvanceOption(chosenOpt);
                                    setLoanApproveModal(l);
                                  }}
                                  className="w-full sm:flex-1 px-4 sm:px-6 py-2.5 sm:py-3 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs sm:text-sm font-extrabold shadow-md shadow-emerald-500/20 active:scale-95 transition-all cursor-pointer flex items-center justify-center gap-2"
                                >
                                  <span>Approve & Disburse (₹{currentDisburseAmount.toLocaleString("en-IN")})</span>
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
                        {schedule.length > 0 && l.status !== "pending" && l.status !== "rejected" && (
                          <div className="mt-3 pt-3 border-t border-gray-100">
                            <button
                              type="button"
                              onClick={() => setExpandedLoanId(isExpanded ? null : l._id)}
                              className="w-full py-2 px-3 bg-gray-50 hover:bg-gray-100 border border-gray-200 rounded-xl text-xs font-bold text-gray-700 flex items-center justify-between transition cursor-pointer"
                            >
                              <span className="flex items-center gap-2">
                                
                                <span>Installment Schedule ({paidCount}/{totalCount} Paid)</span>
                                {submittedCount > 0 && (
                                  <span className="px-2 py-0.5 rounded-full bg-amber-100 text-amber-800 text-[10px] font-extrabold animate-pulse">
                                    {submittedCount} Submitted for Review
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
                                            <span>{inst.dueDate ? new Date(inst.dueDate).toLocaleDateString("en-IN") : "N/A"} • <span className="font-semibold text-indigo-700">10:00 AM</span></span>
                                          </div>
                                          {isOverdue && (
                                            <div className="text-[10px] text-rose-700 font-bold">
                                              10:00 AM cutoff miss hui • Agli kist me rolled over (+2% penalty)
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
                                            <div className="text-[10px] italic text-gray-500 truncate">
                                              Note: {inst.adminEvidenceNote}
                                            </div>
                                          )}
                                        </div>

                                        {/* Actions */}
                                        <div className="flex flex-col gap-1.5 pt-1 border-t border-gray-200/50">
                                          {isPaid && inst.proofUrl && (
                                            <button
                                              type="button"
                                              onClick={() => { setLightboxImg(inst.proofUrl); setZoomLevel(1); }}
                                              className="w-full py-1 px-2 bg-emerald-50 hover:bg-emerald-100 text-emerald-800 rounded-lg text-[10px] font-bold border border-emerald-300 flex items-center justify-center gap-1 cursor-pointer transition active:scale-95 shadow-2xs"
                                            >
                                               View Payment Slip / Receipt 
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
                                                   View Proof (Front)
                                                </button>
                                              )}
                                              {inst.proofBackUrl && (
                                                <button
                                                  type="button"
                                                  onClick={() => { setLightboxImg(inst.proofBackUrl); setZoomLevel(1); }}
                                                  className="w-full py-1 px-2 bg-blue-50 hover:bg-blue-100 text-blue-700 rounded-lg text-[10px] font-bold border border-blue-200 flex items-center justify-center gap-1 cursor-pointer"
                                                >
                                                   View Proof (Back)
                                                </button>
                                              )}
                                              <button
                                                type="button"
                                                disabled={installmentActionLoadingId === `${l._id}_${inst.installmentNo}`}
                                                onClick={() => approveInstallment(l._id, inst.installmentNo)}
                                                className="w-full py-1.5 px-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-[11px] font-bold shadow-xs active:scale-95 transition cursor-pointer disabled:opacity-50 flex items-center justify-center gap-1"
                                              >
                                                {installmentActionLoadingId === `${l._id}_${inst.installmentNo}` ? (
                                                  <>
                                                    <span className="w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin" />
                                                    <span>Approving...</span>
                                                  </>
                                                ) : (
                                                  <span>Approve Installment</span>
                                                )}
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
                                              Mark Paid (Admin Override)
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

            const paidNum = Math.max(0, Math.min(Number(issuePaidInstallmentsCount) || 0, count));
            const remainingNum = Math.max(0, count - paidNum);
            const effectivePerInst = issueCustomInstallmentAmount ? Number(issueCustomInstallmentAmount) : installmentAmt;

            // Generate real-time upcoming automatic schedule preview
            const upcomingSchedulePreview = [];
            if (remainingNum > 0) {
              let start = issueFirstPendingDueDate ? new Date(issueFirstPendingDueDate) : new Date();
              if (isNaN(start.getTime())) start = new Date();
              start.setHours(10, 0, 0, 0);

              const isDaily = (issueLoanType === "micro_business");
              const startDay = start.getDate();
              const followStandardCycle = (startDay === 1 || startDay === 11 || startDay === 21);
              let cur = new Date(start);

              for (let i = 0; i < remainingNum; i++) {
                const kistNo = paidNum + i + 1;
                if (i > 0) {
                  if (isDaily) {
                    cur.setDate(cur.getDate() + 1);
                  } else if (followStandardCycle) {
                    cur.setDate(cur.getDate() + 1);
                    while (!(cur.getDate() === 1 || cur.getDate() === 11 || cur.getDate() === 21)) {
                      cur.setDate(cur.getDate() + 1);
                    }
                  } else {
                    cur.setDate(cur.getDate() + 10);
                  }
                }
                const d = new Date(cur);
                upcomingSchedulePreview.push({
                  installmentNo: kistNo,
                  dueDate: d.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" }),
                  dueDateRaw: d.toISOString().split("T")[0],
                  amount: effectivePerInst,
                  status: "pending"
                });
              }
            }

            const livePaidSum = issueBackfillInstallments.slice(0, paidNum).reduce((acc, curr) => acc + (Number(curr.amount) || installmentAmt), 0);
            const liveRemainingSum = remainingNum * effectivePerInst;
            const liveTotalPayable = livePaidSum + liveRemainingSum;

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
                      <span className="text-2xl"></span>
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
                    className="self-start sm:self-auto px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-800 border border-slate-300 rounded-xl text-xs font-bold transition flex items-center gap-2 cursor-pointer active:scale-95 shadow-2xs"
                  >
                    <span>← </span> Back to Loans Desk ({loans.length})
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
                           Existing Customer / Agent's User
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
                                <div className="w-10 h-10 rounded-xl bg-emerald-600 text-white flex items-center justify-center font-bold text-base shadow-xs shrink-0">
                                  {(issueSelectedUser.name || "U")[0].toUpperCase()}
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
                                    <span>{issueSelectedUser.phone}</span>
                                    <span>{issueSelectedUser.email}</span>
                                    <span>Balance: ₹{Number(issueSelectedUser.balance || 0).toLocaleString("en-IN")}</span>
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
                                          Reassign / Link Agent
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
                                     Incomplete Borrower Details Detected ({missingBorrowerFields.length} Missing):
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
                                        <div className="w-8 h-8 rounded-xl bg-emerald-600 text-white flex items-center justify-center shadow-2xs shrink-0">
                                          <svg className="w-4 h-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                                          </svg>
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
                                        <span>Purane Loans Ki Puri Jankari ({userPrevLoans.length}):</span>
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
                                                      #{idx + 1} {pl.loanType === "student" ? "Student" : pl.loanType === "micro_business" || pl.loanType === "micro" ? "Micro" : "Personal"} Loan
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
                                                {(() => {
                                                  const pFee = Number(pl.processingFee !== undefined && pl.processingFee !== null ? pl.processingFee : Math.round((pl.amount || 0) * 0.05));
                                                  const uFee = Number(pl.upiCharges !== undefined && pl.upiCharges !== null ? pl.upiCharges : Math.round((pl.amount || 0) * 0.01));
                                                  const inHand = Number(pl.disbursalAmount || Math.max(0, (pl.amount || 0) - pFee - uFee));
                                                  return (
                                                    <div className="p-1.5 bg-emerald-50/80 border border-emerald-200/70 rounded-lg" title={`Sanctioned ₹${pl.amount} me se ₹${pFee} (5% Fee) aur ₹${uFee} (1% UPI) cut hokar user ko ₹${inHand} transfer hua.`}>
                                                      <span className="text-emerald-800 block text-[9px] font-bold">Khate Me (In-Hand)</span>
                                                      <span className="font-mono font-black text-emerald-700">
                                                        ₹{inHand.toLocaleString("en-IN")}
                                                      </span>
                                                    </div>
                                                  );
                                                })()}
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
                                                <span>{pl.createdAt ? new Date(pl.createdAt).toLocaleDateString("en-IN", { day: 'numeric', month: 'short', year: 'numeric' }) : "N/A"}</span>
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
                                        <div className="w-8 h-8 rounded-xl bg-amber-500 text-white flex items-center justify-center shadow-2xs shrink-0">
                                          <svg className="w-4 h-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                                          </svg>
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
                                          { key: "doc1BackUrl", label: "Aadhaar Back", icon: "", fallbackUrl: issueSelectedUser.kycDocuments?.doc1BackUrl },
                                          { key: "doc2Url", label: "PAN Card Front", icon: "", fallbackUrl: issueSelectedUser.kycDocuments?.doc2Url },
                                          { key: "doc2BackUrl", label: "PAN Card Back", icon: "", fallbackUrl: issueSelectedUser.kycDocuments?.doc2BackUrl },
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
                                                      <span className="text-[10px] font-bold text-blue-700">PDF Document</span>
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
                                                       Zoom
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
                                            Borrower Contact & ID Numbers (Review / Fill / Edit)
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
                                           Compulsory Barrier Cheque Details for Loan / Lending
                                        </span>
                                        <span className="text-[10px] text-emerald-700 font-bold bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200">Photos Only (Secure Storage • Any MB Size)</span>
                                      </div>

                                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                                        {/* Cheque Front */}
                                        <div className="p-2.5 bg-slate-50 border border-gray-200 rounded-lg space-y-1.5">
                                          <div className="flex items-center justify-between text-[11px] font-bold text-gray-800">
                                            <span>Cheque Front Image</span>
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
                                              <span className="absolute bottom-1 right-1 text-[8px] bg-black/60 text-white px-1 rounded">Zoom</span>
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
                                            <span>Cheque Back Image</span>
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
                                              <span className="absolute bottom-1 right-1 text-[8px] bg-black/60 text-white px-1 rounded">Zoom</span>
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
                                              Barrier Cheque Number <span className="text-rose-500">*</span>
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
                                      <span className="text-lg"></span>
                                      <div>
                                        <span className="text-xs font-black text-amber-950 block">
                                          First Time Borrower — Full Loan KYC Required (Aadhaar, PAN & Cheque)
                                        </span>
                                        <span className="text-[10px] text-amber-800 block">
                                          Is borrower ke KYC documents file par nahi hain. Niche diye gaye sabhi 6 documents upload karein:
                                        </span>
                                      </div>
                                    </div>
                                    <span className="text-[10px] text-emerald-700 font-bold bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200 hidden sm:inline">Photos Only (Secure Storage • Any MB Size)</span>
                                  </div>

                                  <div className="grid grid-cols-2 sm:grid-cols-2 md:grid-cols-3 gap-2">
                                    {[
                                      { key: "doc1Url", label: "Aadhaar Card Front", icon: "🪪" },
                                      { key: "doc1BackUrl", label: "Aadhaar Card Back", icon: "" },
                                      { key: "doc2Url", label: "PAN Card Front", icon: "" },
                                      { key: "doc2BackUrl", label: "PAN Card Back", icon: "" },
                                      { key: "chequeUrl", label: "Barrier Cheque Front", icon: "" },
                                      { key: "chequeBackUrl", label: "Barrier Cheque Back", icon: "" },
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
                                            <span className="absolute bottom-1 right-1 text-[8px] bg-black/60 text-white px-1 rounded">Zoom</span>
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
                                        Barrier Cheque Number (Compulsory for Loan Security)
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
                                     Kis Ka (Hierarchy):
                                  </span>
                                  {[
                                    { key: "all", label: "Sabhi Users" },
                                    { key: "direct", label: "Direct" },
                                    { key: "agent", label: "Agent" },
                                    { key: "subagent", label: "Sub-Agent" },
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
                                     Kab Ka (Date/Time):
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
                                                  {uLoans.length} Purane Loan
                                                </span>
                                              );
                                            }
                                            if (u.kycStatus === "verified" || Boolean(u.kycDocuments?.doc1Url || u.kycDocuments?.docUrl)) {
                                              return (
                                                <span className="px-1.5 py-0.5 rounded text-[9px] font-bold bg-amber-50 text-amber-800 border border-amber-200">
                                                  Normal KYC (Cheque Chahiye)
                                                </span>
                                              );
                                            }
                                            return (
                                              <span className="px-1.5 py-0.5 rounded text-[9px] font-medium bg-gray-100 text-gray-500">
                                                No KYC
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
                                          Agent
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
                            <span className="text-[10px] text-emerald-700 font-bold bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200">Photos Only (Secure Storage • Any MB Size)</span>
                          </div>
                          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2">
                            {[
                              { key: "doc1Url", label: "Aadhaar Card Front", icon: "🪪" },
                              { key: "doc1BackUrl", label: "Aadhaar Card Back", icon: "" },
                              { key: "doc2Url", label: "PAN Card Front", icon: "" },
                              { key: "doc2BackUrl", label: "PAN Card Back", icon: "" },
                              { key: "chequeUrl", label: "Barrier Cheque Front", icon: "" },
                              { key: "chequeBackUrl", label: "Barrier Cheque Back", icon: "" },
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
                                    <span className="absolute bottom-1 right-1 text-[8px] bg-black/60 text-white px-1 rounded">Zoom</span>
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
                                Barrier Cheque Number (Compulsory for Loan Security)
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
                          { id: "personal", label: "Personal Loan", desc: "Personal & emergency cash needs", defaultPurpose: "Personal Financial Need" },
                          { id: "student", label: "Student Loan", desc: "Tuition, coaching & book fees", defaultPurpose: "Student Education & Fees" },
                          { id: "micro", label: "Micro Enterprise", desc: "Dukan & small business working capital", defaultPurpose: "Micro Business Working Capital" }
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
                      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-6 gap-2">
                        {[
                          { kist: 15, days: "150 Din" },
                          { kist: 18, days: "180 Din" },
                          { kist: 21, days: "210 Din" },
                          { kist: 24, days: "240 Din" },
                          { kist: 26, days: "260 Din" },
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

                    {/* Section: Offline / Backfill Loan (Pehle se bhari kistein & Direct Active) */}
                    <div className="p-3.5 bg-blue-50/70 rounded-xl border border-blue-200 space-y-3">
                      <div className="flex items-center justify-between flex-wrap gap-2">
                        <span className="text-xs font-black text-blue-900 flex items-center gap-1.5">
                           Offline Record / Pehle Se Bhari Kistein (Backfill)
                        </span>
                        <span className="text-[10px] bg-blue-100 text-blue-800 font-bold px-2 py-0.5 rounded-full">
                          Admin Direct Control
                        </span>
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                        <div>
                          <label className="text-[11px] font-bold text-gray-700 block mb-1">
                            Pehle Se Bhari Kistein (Paid Count)
                          </label>
                          <div className="flex items-center gap-1.5">
                            <button
                              type="button"
                              onClick={() => {
                                if (issuePaidInstallmentsCount > 0) {
                                  removeBackfillInstallment(issuePaidInstallmentsCount - 1);
                                }
                              }}
                              disabled={issuePaidInstallmentsCount <= 0}
                              className="w-11 h-11 sm:w-9 sm:h-9 bg-slate-200 hover:bg-slate-300 disabled:opacity-40 text-slate-800 font-black text-lg sm:text-base rounded-xl flex items-center justify-center cursor-pointer active:scale-95 transition shrink-0 touch-manipulation"
                              title="Ek kist kam karein (-)"
                            >
                              −
                            </button>
                            <input
                              type="number"
                              min="0"
                              max={count}
                              value={issuePaidInstallmentsCount}
                              onChange={(e) => updateBackfillCount(e.target.value, installmentAmt)}
                              placeholder="0"
                              className="flex-1 h-11 sm:h-9 px-3 bg-white border border-gray-300 rounded-xl text-sm sm:text-xs text-gray-900 font-black text-center"
                            />
                            <button
                              type="button"
                              onClick={() => addBackfillInstallment(installmentAmt)}
                              className="w-11 h-11 sm:w-9 sm:h-9 bg-emerald-600 hover:bg-emerald-500 text-white font-black text-lg sm:text-base rounded-xl flex items-center justify-center cursor-pointer active:scale-95 transition shrink-0 shadow-2xs touch-manipulation"
                              title="Nayi kist jodein (+)"
                            >
                              +
                            </button>
                          </div>
                          <span className="text-[10px] text-gray-500 block mt-0.5">
                            {Number(issuePaidInstallmentsCount) > 0 ? `✓ Kist 1 se ${issuePaidInstallmentsCount} Paid mark hongi` : "0 = Naya fresh loan (Bhari hui kist jodne ke liye '+' dabayein)"}
                          </span>
                        </div>

                        <div>
                          <label className="text-[11px] font-bold text-gray-700 block mb-1">
                            Agli Kist Ki Due Date (Next Due)
                          </label>
                          <input
                            type="date"
                            value={issueFirstPendingDueDate}
                            onChange={(e) => setIssueFirstPendingDueDate(e.target.value)}
                            className="w-full h-11 sm:h-9 px-3 bg-white border border-gray-300 rounded-xl text-sm sm:text-xs text-gray-900 font-semibold"
                          />
                          <span className="text-[10px] text-gray-500 block mt-0.5">
                            Kist #{Number(issuePaidInstallmentsCount) + 1} kab due hogi
                          </span>
                        </div>

                        <div>
                          <label className="text-[11px] font-bold text-gray-700 block mb-1">
                            Custom Per Kist Amount (Optional)
                          </label>
                          <input
                            type="number"
                            value={issueCustomInstallmentAmount}
                            onChange={(e) => setIssueCustomInstallmentAmount(e.target.value)}
                            placeholder={`Auto: ₹${installmentAmt}`}
                            className="w-full h-11 sm:h-9 px-3 bg-white border border-gray-300 rounded-xl text-sm sm:text-xs text-gray-900 font-bold"
                          />
                          <span className="text-[10px] text-gray-500 block mt-0.5">
                            Khali rakhein toh auto ₹{installmentAmt}
                          </span>
                        </div>
                      </div>

                      {/* Main Offline Payment Proof / Evidence Slip Upload */}
                      <div className="p-3 bg-white/80 rounded-xl border border-blue-200/70 space-y-2">
                        <div className="flex items-center justify-between">
                          <label className="text-[11px] font-bold text-blue-950 flex items-center gap-1.5">
                             Offline Payment Evidence / Slip (Photo / Receipt)
                          </label>
                          {issueBackfillEvidenceUrl && (
                            <button
                              type="button"
                              onClick={() => { setIssueBackfillEvidenceUrl(""); setIssueBackfillEvidenceName(""); }}
                              className="text-[10px] text-rose-600 font-bold hover:underline cursor-pointer"
                            >
                              ✕ Remove Evidence
                            </button>
                          )}
                        </div>
                        <div className="flex flex-col sm:flex-row sm:items-center gap-2">
                          <label className="px-3 py-2 bg-blue-50 hover:bg-blue-100 border border-blue-200 text-blue-800 rounded-xl text-xs font-bold cursor-pointer flex items-center justify-center gap-2 transition shrink-0 active:scale-95 shadow-2xs">
                             Attach Evidence / Receipt
                            <input
                              type="file"
                              accept="image/*"
                              className="hidden"
                              onChange={(e) => handleBackfillEvidenceUpload(e.target.files?.[0])}
                            />
                          </label>
                          {issueBackfillEvidenceUrl ? (
                            <div className="flex items-center gap-2 bg-emerald-50 border border-emerald-200 px-3 py-1.5 rounded-xl flex-1 truncate">
                              <span className="text-emerald-700 text-xs font-bold">✓ Attached:</span>
                              <span className="text-[11px] text-emerald-900 font-mono truncate flex-1">{issueBackfillEvidenceName || "Receipt Photo"}</span>
                              <button
                                type="button"
                                onClick={() => { setLightboxImg(issueBackfillEvidenceUrl); setZoomLevel(1); }}
                                className="px-2 py-0.5 bg-emerald-600 text-white rounded text-[10px] font-bold hover:bg-emerald-700 transition cursor-pointer shrink-0"
                              >
                                View 
                              </button>
                            </div>
                          ) : (
                            <span className="text-[11px] text-gray-500">
                              (Bank passbook / cash voucher / UPI payment screenshot attach karein)
                            </span>
                          )}
                        </div>
                      </div>

                      {/* Collapsible All-Kist Breakdown with Direct Admin Paid Buttons */}
                      <div className="space-y-2">
                        <button
                          type="button"
                          onClick={() => setShowAllInstallmentsCollapse(prev => !prev)}
                          className="w-full p-3 bg-white hover:bg-slate-50 rounded-xl border border-blue-200 flex items-center justify-between transition cursor-pointer text-xs font-bold text-blue-950 shadow-2xs"
                        >
                          <div className="flex items-center gap-2 flex-wrap">
                            
                            <span>Saari Kistein Schedule & Admin Paid Control ({count} Total Kist)</span>
                            <span className={`text-[10px] font-black px-2 py-0.5 rounded-full ${paidNum > 0 ? "bg-emerald-100 text-emerald-800" : "bg-slate-100 text-slate-600"}`}>
                              {paidNum} Paid / {count - paidNum} Pending
                            </span>
                          </div>
                          <div className="flex items-center gap-1.5 text-blue-600 text-xs font-bold">
                            <span>{showAllInstallmentsCollapse ? "Chhupayein (Collapse) ▲" : "Dikhayein (Expand) ▼"}</span>
                          </div>
                        </button>

                        {showAllInstallmentsCollapse && (
                          <div className="p-3 bg-white/95 rounded-xl border border-blue-200/80 space-y-2.5 animate-in fade-in duration-150">
                            <p className="text-[11px] text-gray-500">
                              Aap yaha se kisi bhi kist par <strong>Admin: Mark as Paid </strong> dabakar use bhari hui mark kar sakte hain:
                            </p>
                            <div className="space-y-2 max-h-80 overflow-y-auto pr-1">
                              {Array.from({ length: count }, (_, idx) => {
                                const kistNo = idx + 1;
                                const isPaid = kistNo <= paidNum;
                                const paidItem = isPaid ? (issueBackfillInstallments[idx] || {
                                  installmentNo: kistNo,
                                  amount: issueCustomInstallmentAmount ? Number(issueCustomInstallmentAmount) : installmentAmt,
                                  paidOn: new Date().toISOString().split("T")[0],
                                  paymentMethod: "cash",
                                  utrNumber: "",
                                  evidenceUrl: issueBackfillEvidenceUrl || "",
                                  note: "Offline paid"
                                }) : null;
                                const pendingPreviewItem = !isPaid ? upcomingSchedulePreview[kistNo - paidNum - 1] : null;

                                return (
                                  <div
                                    key={kistNo}
                                    className={`p-2.5 rounded-xl border transition ${
                                      isPaid
                                        ? "bg-emerald-50/70 border-emerald-200 space-y-2"
                                        : "bg-slate-50/80 border-slate-200 flex items-center justify-between gap-2"
                                    }`}
                                  >
                                    <div className="flex items-center justify-between w-full">
                                      <div className="flex items-center gap-2 flex-wrap">
                                        <span className={`text-xs font-black ${isPaid ? "text-emerald-950" : "text-slate-800"}`}>
                          Kist #{kistNo}
                        </span>
                                        <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                                          isPaid
                                            ? "bg-emerald-100 text-emerald-800 border border-emerald-200"
                                            : "bg-amber-100 text-amber-800 border border-amber-200"
                                        }`}>
                                          {isPaid ? "Bhari Hui (Paid)" : "⏳ Pending (Due)"}
                                        </span>
                                        {!isPaid && (
                                          <span className="text-[11px] text-slate-500 hidden sm:inline">
                                            Due: {pendingPreviewItem?.dueDate || "Auto"} • ₹{effectivePerInst.toLocaleString("en-IN")}
                                          </span>
                                        )}
                                      </div>

                                      <div>
                                        {isPaid ? (
                                          <button
                                            type="button"
                                            onClick={() => updateBackfillCount(kistNo - 1, installmentAmt)}
                                            className="text-[11px] text-rose-600 hover:text-rose-800 font-bold underline cursor-pointer"
                                          >
                                            ↩️ Mark as Pending
                                          </button>
                                        ) : (
                                          <button
                                            type="button"
                                            onClick={() => updateBackfillCount(kistNo, installmentAmt)}
                                            className="px-3 py-1 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg text-xs font-black flex items-center gap-1 shadow-xs active:scale-95 cursor-pointer transition shrink-0"
                                          >
                                             Admin: Mark as Paid 
                                          </button>
                                        )}
                                      </div>
                                    </div>

                                    {isPaid && paidItem && (
                                      <>
                                        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
                                          <div>
                                            <label className="text-[10px] font-bold text-gray-600 block mb-0.5">Amount (₹)</label>
                                            <input
                                              type="number"
                                              value={paidItem.amount}
                                              onChange={(e) => updateBackfillInstallmentField(idx, "amount", Number(e.target.value) || 0)}
                                              className="w-full px-2 py-1.5 bg-white border border-gray-300 rounded-lg text-xs font-bold text-gray-900"
                                            />
                                          </div>
                                          <div>
                                            <label className="text-[10px] font-bold text-gray-600 block mb-0.5">Payment Date</label>
                                            <input
                                              type="date"
                                              value={paidItem.paidOn || ""}
                                              onChange={(e) => updateBackfillInstallmentField(idx, "paidOn", e.target.value)}
                                              className="w-full px-2 py-1.5 bg-white border border-gray-300 rounded-lg text-xs text-gray-900 font-semibold"
                                            />
                                          </div>
                                          <div>
                                            <label className="text-[10px] font-bold text-gray-600 block mb-0.5">Payment Mode</label>
                                            <select
                                              value={paidItem.paymentMethod || "cash"}
                                              onChange={(e) => updateBackfillInstallmentField(idx, "paymentMethod", e.target.value)}
                                              className="w-full px-2 py-1.5 bg-white border border-gray-300 rounded-lg text-xs text-gray-900 font-semibold"
                                            >
                                              <option value="cash">Cash at Office</option>
                                              <option value="upi">UPI / QR</option>
                                              <option value="bank_transfer">Bank Transfer</option>
                                              <option value="cheque">Cheque</option>
                                              <option value="offline">Offline Recorded</option>
                                            </select>
                                          </div>
                                          <div>
                                            <label className="text-[10px] font-bold text-gray-600 block mb-0.5">UTR / Slip Ref</label>
                                            <input
                                              type="text"
                                              value={paidItem.utrNumber || ""}
                                              onChange={(e) => updateBackfillInstallmentField(idx, "utrNumber", e.target.value)}
                                              placeholder="e.g. 439012384910"
                                              className="w-full px-2 py-1.5 bg-white border border-gray-300 rounded-lg text-xs text-gray-900 font-mono"
                                            />
                                          </div>
                                        </div>
                                        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pt-1 border-t border-emerald-200/60 text-xs">
                                          <div className="flex items-center gap-2 flex-wrap">
                                            <label className="px-2 py-1 bg-white hover:bg-emerald-50 border border-emerald-300 rounded-lg text-[11px] font-bold text-emerald-800 cursor-pointer flex items-center gap-1 shadow-2xs">
                                               Kist Slip Photo
                                              <input
                                                type="file"
                                                accept="image/*"
                                                className="hidden"
                                                onChange={(e) => handleBackfillEvidenceUpload(e.target.files?.[0], idx)}
                                              />
                                            </label>
                                            {paidItem.evidenceUrl && (
                                              <button
                                                type="button"
                                                onClick={() => { setLightboxImg(paidItem.evidenceUrl); setZoomLevel(1); }}
                                                className="text-[10px] text-emerald-700 font-bold underline flex items-center gap-0.5 cursor-pointer"
                                              >
                                                <span>✓</span> View Receipt (Zoom )
                                              </button>
                                            )}
                                          </div>
                                          <input
                                            type="text"
                                            value={paidItem.note || ""}
                                            onChange={(e) => updateBackfillInstallmentField(idx, "note", e.target.value)}
                                            placeholder="Kist remark / note (optional)"
                                            className="flex-1 px-2 py-1 bg-white border border-gray-200 rounded-lg text-[11px] text-gray-700"
                                          />
                                        </div>
                                      </>
                                    )}
                                  </div>
                                );
                              })}
                            </div>
                          </div>
                        )}
                      </div>

                      {/* Loan Lene Wale Ke Wallet Me Payout Transfer Checkbox (Clear Hindi) */}
                      <div className="pt-2 border-t border-blue-200/60">
                        <label className="flex items-start gap-3 cursor-pointer text-xs font-bold text-gray-800 p-3 bg-white/90 rounded-xl border border-blue-200 shadow-2xs">
                          <input
                            type="checkbox"
                            checked={issueDisburseToWallet}
                            onChange={(e) => setIssueDisburseToWallet(e.target.checked)}
                            className="w-4 h-4 mt-0.5 text-blue-600 rounded cursor-pointer accent-blue-600 shrink-0"
                          />
                          <div className="space-y-1">
                            <span className="text-xs font-black text-gray-900 flex items-center gap-1.5">
                               Loan lene wale ke app wallet me paise transfer karein (Disburse)
                            </span>
                            <p className="text-[11px] text-gray-600 font-normal leading-relaxed">
                              • <strong>Naya Loan:</strong> Isse check (✓) rakhein taaki loan lene wale ke app wallet me paise credit hon.<br />
                              • <strong>Purana / Offline Loan:</strong> Isse khali (unchecked) rakhein, kyunki borrower ko paise pehle hi cash ya bahar diye ja chuke hain — taaki wallet me dobara paise na judein.
                            </p>
                          </div>
                        </label>
                      </div>
                    </div>
                  </div>

                  {/* Step 3: Real-Time Calculated Quote Summary Box */}
                  <div className="p-4 sm:p-5 bg-slate-50 border border-slate-200/90 text-slate-900 rounded-2xl space-y-4 shadow-2xs">
                    <div className="flex items-center justify-between border-b border-slate-200 pb-3 flex-wrap gap-2">
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
                        <span className="text-base font-black text-emerald-600 font-mono">₹{effectivePerInst.toLocaleString("en-IN")}</span>
                        <span className="text-[9px] text-slate-400 block">Har 10 din par</span>
                      </div>
                      <div className="p-3 bg-white rounded-xl border border-slate-200 shadow-2xs">
                        <span className="text-slate-500 block text-[10px] font-bold">Total Payable ({count} Kist)</span>
                        <span className="text-base font-black text-amber-700 font-mono">₹{liveTotalPayable.toLocaleString("en-IN")}</span>
                        <span className="text-[9px] text-slate-400 block">
                          {paidNum > 0 ? `Paid: ₹${livePaidSum.toLocaleString("en-IN")} • Due: ₹${liveRemainingSum.toLocaleString("en-IN")}` : `Interest: ₹${totalInterest.toLocaleString("en-IN")}`}
                        </span>
                      </div>
                      <div className="p-3 bg-white rounded-xl border border-slate-200 shadow-2xs">
                        <span className="text-slate-500 block text-[10px] font-bold">Net Disbursal Amount</span>
                        <span className="text-base font-black text-blue-600 font-mono">₹{netDisbursal.toLocaleString("en-IN")}</span>
                        <span className="text-[9px] text-slate-400 block">After 5% fee + 1% UPI</span>
                      </div>
                    </div>

                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-3 border-t border-slate-200">
                      <p className="text-[11px] text-slate-600 leading-relaxed max-w-xl">
                        {Number(issuePaidInstallmentsCount) > 0 ? (
                          <span><strong>Backfill Mode:</strong> Aapne <strong>{issuePaidInstallmentsCount} kistein</strong> pehle se bhari hui set ki hain. Yeh loan submit hote hi seedha <strong>ACTIVE</strong> ho jayega aur borrower ki KYC auto-approve ho jayegi!</span>
                        ) : (
                          <span><strong>Note:</strong> Yeh loan submit hone ke baad direct disburse nahi hoga. Request <strong>Pending Loan Applications</strong> queue me jayegi jahan aap borrower ke documents aur details verify karke <strong>Approve</strong> karenge.</span>
                        )}
                      </p>

                      <button
                        type="submit"
                        disabled={issueSubmitting || (issueBorrowerType === "existing" && !issueSelectedUser)}
                        className={`px-6 py-3 font-black text-xs sm:text-sm rounded-xl shadow-lg transition active:scale-95 flex items-center justify-center gap-2 cursor-pointer shrink-0 disabled:opacity-50 text-white ${
                          Number(issuePaidInstallmentsCount) > 0 ? "bg-emerald-600 hover:bg-emerald-500" : "bg-blue-600 hover:bg-blue-500"
                        }`}
                      >
                        {issueSubmitting ? (
                          <>
                            <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                            <span>Processing...</span>
                          </>
                        ) : Number(issuePaidInstallmentsCount) > 0 ? (
                          <span>Create Active Backfilled Loan</span>
                        ) : (
                          <span>Submit Loan Request for Admin Review</span>
                        )}
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
                     Lending Investment Accounts ({bonds.length})
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
                     Refresh
                  </button>
                </div>
              </div>

              {/* High-Level Lending & Investment Summary Card (Kitne ko gaya & Total kitna gaya) */}
              {(() => {
                const validBonds = bonds.filter(b => b.status === "active" || b.status === "approved" || b.status === "completed");
                const uniqueInvestorIds = new Set(validBonds.map(b => String(b.userId?._id || b.userId?.id || b.userId || "")).filter(Boolean));
                const totalInvestedPrincipal = validBonds.reduce((s, b) => s + (b.principalAmount || 0), 0);
                const activeBondsCount = bonds.filter(b => b.status === "active").length;
                const totalYieldDistributed = validBonds.reduce((s, b) => s + (b.accruedInterest || 0), 0);

                return (
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 sm:gap-3.5">
                    <div className="p-3 sm:p-4 rounded-xl bg-purple-50/80 border border-purple-200/80">
                      <span className="text-[11px] font-bold text-purple-700 block">Kitne Investors Ko Gaya</span>
                      <div className="text-base sm:text-xl font-black text-purple-950 mt-0.5">
                        {uniqueInvestorIds.size} <span className="text-xs font-semibold text-purple-700">Investors ({validBonds.length} Accounts)</span>
                      </div>
                    </div>
                    <div className="p-3 sm:p-4 rounded-xl bg-indigo-50/80 border border-indigo-200/80">
                      <span className="text-[11px] font-bold text-indigo-700 block">Total Principal Invested</span>
                      <div className="text-base sm:text-xl font-black text-indigo-950 font-mono mt-0.5">
                        ₹{totalInvestedPrincipal.toLocaleString("en-IN")}
                      </div>
                    </div>
                    <div className="p-3 sm:p-4 rounded-xl bg-emerald-50/80 border border-emerald-200/80">
                      <span className="text-[11px] font-bold text-emerald-700 block">Active Running Bonds</span>
                      <div className="text-base sm:text-xl font-black text-emerald-950 mt-0.5">
                        {activeBondsCount} <span className="text-xs font-semibold text-emerald-700">Active Plans</span>
                      </div>
                    </div>
                    <div className="p-3 sm:p-4 rounded-xl bg-teal-50/80 border border-teal-200/80">
                      <span className="text-[11px] font-bold text-teal-700 block">Total Yield / Munafa Paid</span>
                      <div className="text-base sm:text-xl font-black text-teal-950 font-mono mt-0.5">
                        ₹{totalYieldDistributed.toLocaleString("en-IN")}
                      </div>
                    </div>
                  </div>
                );
              })()}

              {bonds.length === 0 ? (
                <div className="bg-white rounded-2xl p-12 text-center text-gray-400 border border-gray-100">
                  <span className="text-4xl block mb-2"></span>
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
                            <div className="w-10 h-10 rounded-xl bg-blue-600 text-white font-black flex items-center justify-center text-sm shadow-xs shrink-0">
                              {(b.userId?.name || "I")[0].toUpperCase()}
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
                                {b.userId?.phone || docs.applicantPhone || "N/A"} • {b.userId?.email || docs.applicantEmail || "N/A"}
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
                            <span className="font-bold text-gray-900 text-sm">{b.planName || (b.bondType === "bond_50" ? "50 Months Fixed (2x)" : b.bondType === "bond_25" ? "25 Months Fixed (+40%)" : b.bondType === "lending_80" || b.planId === "lending_80" ? "80 Months Lending (2x)" : "40 Months Lending (+40%)")}</span>
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
                            <span className="font-bold text-blue-700 text-sm">{b.monthsPaid || 0} / {b.monthsTotal || (b.bondType === "bond_50" ? 50 : b.bondType === "bond_25" ? 25 : b.bondType === "lending_80" || b.planId === "lending_80" ? 80 : 40)} Months</span>
                          </div>
                        </div>

                        {/* Mandatory Submitted Documents Lightbox Buttons */}
                        <div className="p-3.5 bg-slate-50 border border-slate-200 rounded-xl space-y-2">
                          <div className="flex items-center justify-between text-xs font-bold text-slate-800">
                            <span className="flex items-center gap-1.5">
                               Compulsory Documents (Aadhaar, PAN & Barrier Cheque)
                            </span>
                          </div>

                          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-6 gap-2 pt-1">
                            {aadharFront ? (
                              <button
                                type="button"
                                onClick={() => { setLightboxImg(aadharFront); setZoomLevel(1); }}
                                className="flex items-center gap-1 px-2.5 py-1.5 bg-white border border-slate-200 rounded-lg text-xs font-bold text-slate-800 hover:bg-slate-100 shadow-2xs transition cursor-pointer flex items-center justify-center"
                              >
                                🆔 Aadhaar Front 
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
                                🆔 Aadhaar Back 
                              </button>
                            )}

                            {panFront ? (
                              <button
                                type="button"
                                onClick={() => { setLightboxImg(panFront); setZoomLevel(1); }}
                                className="flex items-center gap-1 px-2.5 py-1.5 bg-white border border-slate-200 rounded-lg text-xs font-bold text-slate-800 hover:bg-slate-100 shadow-2xs transition cursor-pointer flex items-center justify-center"
                              >
                                PAN Front 
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
                                PAN Back 
                              </button>
                            )}

                            {chequeFront ? (
                              <button
                                type="button"
                                onClick={() => { setLightboxImg(chequeFront); setZoomLevel(1); }}
                                className="flex items-center gap-1 px-2.5 py-1.5 bg-white border border-amber-300 rounded-lg text-xs font-bold text-amber-900 hover:bg-amber-50 shadow-2xs transition cursor-pointer flex items-center justify-center"
                              >
                                Barrier Cheque Front 
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
                                Barrier Cheque Back 
                              </button>
                            )}
                          </div>
                        </div>

                        {/* Banking, UPI & Nominee Details */}
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
                          {/* Bank & UPI */}
                          <div className="p-3 bg-gray-50 rounded-xl border border-gray-100 space-y-1.5">
                            <span className="font-black text-gray-800 flex items-center gap-1.5">
                               Bank & UPI Payout Destination
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
                               Nominee & Applicant Contact
                            </span>
                            <div className="grid grid-cols-2 gap-2 text-gray-700">
                              <div><span className="text-gray-400">Nominee:</span> <strong className="font-semibold">{docs.nomineeName || "N/A"}</strong></div>
                              <div><span className="text-gray-400">Relation:</span> <strong className="font-semibold">{docs.nomineeRelation || "N/A"}</strong></div>
                              <div><span className="text-gray-400">Nominee Ph:</span> <strong className="font-semibold">{docs.nomineePhone || "N/A"}</strong></div>
                              <div><span className="text-gray-400">Applicant Ph:</span> <strong className="font-semibold">{docs.applicantPhone || b.userId?.phone || "N/A"}</strong></div>
                            </div>
                          </div>
                        </div>

                        {/* Early Exit / Stop Request Management */}
                        {b.earlyStopStatus === "pending" && (
                          <div className="p-3.5 bg-amber-50 border border-amber-300 rounded-xl space-y-2">
                            <div className="flex items-center justify-between flex-wrap gap-2">
                              <span className="text-xs font-black text-amber-950 flex items-center gap-1.5">
                                 Investor Requested Early Exit Stop
                              </span>
                              <span className="text-xs font-mono font-bold text-amber-900 bg-amber-100/80 px-2 py-0.5 rounded">
                                Net Capital Refund: ₹{Math.max(0, (b.principalAmount || 0) - ((b.monthsPaid || 0) * (b.monthlyPayout || 0))).toLocaleString("en-IN")}
                              </span>
                            </div>
                            {b.earlyStopReason && (
                              <p className="text-xs text-amber-900 italic bg-white/80 p-2.5 rounded-lg border border-amber-200">
                                Investor Reason: &quot;{b.earlyStopReason}&quot;
                              </p>
                            )}
                            <div className="flex gap-2 pt-1">
                              <button
                                type="button"
                                disabled={bondActionLoadingId === b._id}
                                onClick={() => handleApproveEarlyStop(b._id)}
                                className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-black shadow-xs transition cursor-pointer flex items-center gap-1.5 disabled:opacity-50"
                              >
                                {bondActionLoadingId === b._id ? "Processing..." : `✓ Approve Stop & Credit ₹${Math.max(0, (b.principalAmount || 0) - ((b.monthsPaid || 0) * (b.monthlyPayout || 0))).toLocaleString("en-IN")}`}
                              </button>
                              <button
                                type="button"
                                disabled={bondActionLoadingId === b._id}
                                onClick={() => handleRejectEarlyStop(b._id)}
                                className="px-3.5 py-2 bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 rounded-xl text-xs font-bold transition cursor-pointer disabled:opacity-50"
                              >
                                Reject Request
                              </button>
                            </div>
                          </div>
                        )}
                        {b.earlyStopStatus === "approved" && (
                          <div className="p-3 bg-slate-100 border border-slate-200 rounded-xl text-xs text-slate-700 flex items-center justify-between">
                            <span className="font-bold">✓ Early Stop Approved & Contract Closed</span>
                            <span className="font-mono font-bold text-emerald-800">Refund Credited: ₹{Number(b.earlyStopRefundAmount || 0).toLocaleString("en-IN")}</span>
                          </div>
                        )}
                        {b.earlyStopStatus === "rejected" && (
                          <div className="p-2.5 bg-rose-50 border border-rose-200 rounded-xl text-xs text-rose-700">
                            Early Stop request was rejected by administration. Regular monthly payouts continue.
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
                     Real-Time Alerts & Loan Queries
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
                     Test Sound
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
                  <span className="text-4xl block mb-2"></span>
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
                          {n.type === "loan_query" ? "" : n.type === "new_user" ? "" : n.type === "loan_apply" ? "" : ""}
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
                                  Call: {n.data.phone}
                                </a>
                              )}
                              {n.data.email && (
                                <span className="px-2 py-1 bg-gray-100 text-gray-700 rounded-md">
                                  {n.data.email}
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

          {/* STAFF & DESKS */}
          {tab === "staff" && (
            <React.Suspense fallback={<div className="p-8 text-center text-slate-400">Loading Staff Manager...</div>}>
              <StaffManager />
            </React.Suspense>
          )}

          {/* AUDIT ACTIVITY LOG */}
          {tab === "activity-log" && (
            <React.Suspense fallback={<div className="p-8 text-center text-slate-400">Loading Activity Log...</div>}>
              <ActivityLog />
            </React.Suspense>
          )}

          {/* SETTINGS */}
          {tab === "settings" && (
            <div className="space-y-6">
              {/* Top Quick Actions Bar: Test Phone Alert */}
              <div className="flex items-center justify-between gap-3 bg-white p-4 rounded-3xl border border-gray-100 shadow-sm flex-wrap">
                <div>
                  <h3 className="text-sm font-black text-gray-900 flex items-center gap-2">
                     Real-Time App Phone Alert Test
                  </h3>
                  <p className="text-xs text-gray-500">Connected users aur devices ko instant test push notification bhejein</p>
                </div>
                <button
                  type="button"
                  onClick={sendAdminTestPushNotification}
                  disabled={sendingTestPush}
                  className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold shadow-xs transition active:scale-95 flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                  title="Send instant push notification test to all connected phones"
                >
                  
                  <span>{sendingTestPush ? "Sending Alert..." : "Test Phone Alert"}</span>
                </button>
              </div>

              {/* ADMIN DEPOSIT & UPI CREDENTIALS CONFIGURATION */}
              <div className="bg-white rounded-3xl shadow-sm p-6 sm:p-7 border border-gray-100">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-4 border-b border-gray-100 gap-2 mb-5">
                  <div>
                    <h3 className="text-lg font-black font-display text-gray-900 flex items-center gap-2">
                       Admin Deposit Credentials (UPI & Bank Details)
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
                      <span>{savingDepositDetails ? "⏳" : ""}</span>
                      <span>{savingDepositDetails ? "Saving Details..." : "Save Deposit Credentials"}</span>
                    </button>
                  </form>

                  {/* Live Mobile App Preview */}
                  <div className="lg:col-span-5 bg-slate-50 text-slate-900 rounded-2xl p-4.5 border border-slate-200/90 shadow-2xs space-y-3 self-start">
                    <div className="flex items-center justify-between pb-2 border-b border-slate-200">
                      <p className="text-[10px] font-black uppercase tracking-wider text-blue-700">Live Customer App Preview</p>
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

              {/* AGENT REFERRAL & PREMIUM WALLET SETTINGS (Rule 5: In-Memory Cached, Ultra-Lightweight) */}
              <div className="bg-white rounded-3xl shadow-sm p-6 sm:p-7 border border-gray-100">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-4 border-b border-gray-100 gap-2 mb-5">
                  <div>
                    <h3 className="text-lg font-black font-display text-gray-900 flex items-center gap-2">
                      <span>⭐</span> Agent Referral & Premium Wallet Settings
                    </h3>
                    <p className="text-xs text-gray-500">
                      Commission amount, wallet maintenance threshold, hold duration, premium interest & benefits configure karein. (In-memory cached, lightweight)
                    </p>
                  </div>
                  <span className="text-[10px] font-bold px-3 py-1 rounded-full bg-indigo-50 text-indigo-700 border border-indigo-200 shrink-0 self-start sm:self-auto">
                    In-Memory Cache (0ms DB Latency)
                  </span>
                </div>

                <form onSubmit={savePremiumSettings} className="space-y-4">
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                    <div>
                      <label className="text-xs font-bold text-gray-700 block mb-1">
                        Agent One-Time Commission (₹) *
                      </label>
                      <input
                        type="number"
                        min="0"
                        step="1"
                        required
                        value={premiumSettings.commissionAmount}
                        onChange={e => setPremiumSettings({ ...premiumSettings, commissionAmount: Number(e.target.value) })}
                        placeholder="30"
                        className="w-full px-4 py-2.5 border border-gray-200 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none text-sm font-semibold"
                      />
                      <span className="text-[10px] text-gray-400 mt-0.5 block">Referred user premium banne par agent ko milne wali one-time commission</span>
                    </div>

                    <div>
                      <label className="text-xs font-bold text-gray-700 block mb-1">
                        Wallet Balance Threshold (₹) *
                      </label>
                      <input
                        type="number"
                        min="0"
                        step="100"
                        required
                        value={premiumSettings.balanceThreshold}
                        onChange={e => setPremiumSettings({ ...premiumSettings, balanceThreshold: Number(e.target.value) })}
                        placeholder="5000"
                        className="w-full px-4 py-2.5 border border-gray-200 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none text-sm font-semibold"
                      />
                      <span className="text-[10px] text-gray-400 mt-0.5 block">Minimum wallet balance jo user ko maintain karna padega</span>
                    </div>

                    <div>
                      <label className="text-xs font-bold text-gray-700 block mb-1">
                        Hold Duration (Days) *
                      </label>
                      <input
                        type="number"
                        min="0"
                        step="1"
                        required
                        value={premiumSettings.holdDays}
                        onChange={e => setPremiumSettings({ ...premiumSettings, holdDays: Number(e.target.value) })}
                        placeholder="30"
                        className="w-full px-4 py-2.5 border border-gray-200 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none text-sm font-semibold"
                      />
                      <span className="text-[10px] text-amber-600 font-medium mt-0.5 block">Testing ke liye 0 set karein taaki instant premium ban sake</span>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-1">
                    <div>
                      <label className="text-xs font-bold text-gray-700 block mb-1">
                        Premium Member Interest Rate (% p.a.) *
                      </label>
                      <input
                        type="number"
                        min="1"
                        max="100"
                        step="0.5"
                        required
                        value={premiumSettings.premiumInterestRate}
                        onChange={e => setPremiumSettings({ ...premiumSettings, premiumInterestRate: Number(e.target.value) })}
                        placeholder="10"
                        className="w-full px-4 py-2.5 border border-gray-200 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none text-sm font-semibold"
                      />
                      <span className="text-[10px] text-gray-400 mt-0.5 block">Premium borrowers ke liye discounted loan interest rate</span>
                    </div>

                    <div>
                      <label className="text-xs font-bold text-gray-700 block mb-1">
                        Normal Member Interest Rate (% p.a.) *
                      </label>
                      <input
                        type="number"
                        min="1"
                        max="100"
                        step="0.5"
                        required
                        value={premiumSettings.normalInterestRate}
                        onChange={e => setPremiumSettings({ ...premiumSettings, normalInterestRate: Number(e.target.value) })}
                        placeholder="12"
                        className="w-full px-4 py-2.5 border border-gray-200 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none text-sm font-semibold"
                      />
                      <span className="text-[10px] text-gray-400 mt-0.5 block">Standard non-premium loan interest rate</span>
                    </div>
                  </div>

                  <div>
                    <label className="text-xs font-bold text-gray-700 block mb-1">
                      Premium Member Offers & Perks Notice
                    </label>
                    <input
                      type="text"
                      value={premiumSettings.offers || ""}
                      onChange={e => setPremiumSettings({ ...premiumSettings, offers: e.target.value })}
                      placeholder="Instant ₹10,000 Loan Access & 10% Special Interest Rate"
                      className="w-full px-4 py-2.5 border border-gray-200 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none text-sm font-medium"
                    />
                  </div>

                  {premiumSettingsSuccess && (
                    <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-xl text-emerald-800 text-xs font-bold">
                      {premiumSettingsSuccess}
                    </div>
                  )}

                  <div className="flex items-center gap-3 pt-2">
                    <button
                      type="submit"
                      disabled={savingPremiumSettings}
                      className="px-6 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl font-bold text-xs shadow-sm transition active:scale-95 flex items-center gap-2 cursor-pointer disabled:opacity-50"
                    >
                      <span>{savingPremiumSettings ? "⏳" : ""}</span>
                      <span>{savingPremiumSettings ? "Saving Settings..." : "Save Premium Settings"}</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => loadPremiumSettings(true)}
                      className="px-4 py-2.5 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-xl font-bold text-xs transition cursor-pointer"
                    >
                      Reload
                    </button>
                  </div>
                </form>
              </div>

              {/* Custom User APY Security Lock (5 Tap Unlock) */}
              <div className="bg-white rounded-2xl shadow-sm p-5 sm:p-6 border border-gray-100">
                <div className="flex items-center justify-between mb-1">
                  <h3 className="text-lg font-bold font-display flex items-center gap-2 text-slate-900">
                     Custom User APY Editor Security Lock
                  </h3>
                  <span className={`text-[10px] font-black px-2.5 py-0.5 rounded-full ${
                    isApyLocked ? "bg-rose-100 text-rose-800 border border-rose-200" : "bg-emerald-100 text-emerald-800 border border-emerald-200"
                  }`}>
                    {isApyLocked ? "LOCKED (Protected)" : "UNLOCKED (Editable)"}
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
                    <span>{isApyLocked ? "" : ""}</span>
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
                <h3 className="text-lg font-bold font-display mb-1 text-slate-900">Loan Interest Rate</h3>
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
                     Google Drive KYC Integration
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

              {/* Cloudflare R2 High-Speed Object Storage */}
              <div className="bg-white rounded-2xl p-4 sm:p-6 border border-gray-100 shadow-sm space-y-4">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-gray-100">
                  <div className="flex items-center gap-2.5">
                    <div className="w-9 h-9 rounded-xl bg-orange-50 border border-orange-200 text-orange-600 flex items-center justify-center shadow-2xs shrink-0">
                      <svg className="w-5 h-5 text-orange-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 15a4 4 0 004 4h9a5 5 0 10-.1-9.999 5.002 5.002 0 00-9.78 2.096A4.001 4.001 0 003 15z" />
                      </svg>
                    </div>
                    <div>
                      <h4 className="font-bold text-gray-900 flex items-center gap-2">
                        Cloudflare R2 Object Storage (Edge CDN)
                      </h4>
                      <p className="text-xs text-gray-500">
                        Ultra-fast image hosting (KYC documents, deposit receipts, QR codes) with 0ms egress fees
                      </p>
                    </div>
                  </div>
                  <span className={`text-[10px] font-bold px-2.5 py-1 rounded-full border self-start sm:self-auto ${
                    r2Config.isConfigured
                      ? "bg-emerald-50 text-emerald-700 border-emerald-200"
                      : "bg-gray-100 text-gray-600 border-gray-200"
                  }`}>
                    {r2Config.isConfigured ? "● Active & Connected" : "○ Not Configured"}
                  </span>
                </div>

                <div className="p-3 bg-amber-50 border border-amber-200 rounded-xl text-xs text-amber-900 space-y-1">
                  <p className="font-bold">Kyu use karein Cloudflare R2:</p>
                  <p className="text-[11px] text-amber-800 leading-relaxed">
                    Google Drive slow redirects (2–4s) aur MongoDB base64 bloat ki jagah Cloudflare Edge CDN se photos <strong>50ms me khulti hain</strong>. Cloudflare R2 me 10GB free storage milti hai aur bandwidth 100% free hoti hai.
                  </p>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5 pt-1">
                  <div>
                    <label className="text-xs font-bold text-gray-700 block mb-1">
                      Account ID <span className="text-rose-500">*</span>
                    </label>
                    <input
                      type="text"
                      value={r2Config.accountId}
                      onChange={e => setR2Config(p => ({ ...p, accountId: e.target.value }))}
                      placeholder="e.g. 7c9d4b... (Cloudflare overview URL se)"
                      className="w-full px-3.5 py-2.5 border border-gray-200 rounded-xl focus:ring-2 focus:ring-orange-500 outline-none text-xs font-mono"
                    />
                  </div>

                  <div>
                    <label className="text-xs font-bold text-gray-700 block mb-1">
                      Bucket Name <span className="text-rose-500">*</span>
                    </label>
                    <input
                      type="text"
                      value={r2Config.bucketName}
                      onChange={e => setR2Config(p => ({ ...p, bucketName: e.target.value }))}
                      placeholder="e.g. educafintech"
                      className="w-full px-3.5 py-2.5 border border-gray-200 rounded-xl focus:ring-2 focus:ring-orange-500 outline-none text-xs font-mono"
                    />
                  </div>

                  <div>
                    <label className="text-xs font-bold text-gray-700 block mb-1">
                      Access Key ID <span className="text-rose-500">*</span>
                    </label>
                    <input
                      type="text"
                      value={r2Config.accessKeyId}
                      onChange={e => setR2Config(p => ({ ...p, accessKeyId: e.target.value }))}
                      placeholder="e.g. 8f6b... (R2 API Token Access Key)"
                      className="w-full px-3.5 py-2.5 border border-gray-200 rounded-xl focus:ring-2 focus:ring-orange-500 outline-none text-xs font-mono"
                    />
                  </div>

                  <div>
                    <label className="text-xs font-bold text-gray-700 block mb-1">
                      Secret Access Key <span className="text-rose-500">*</span>
                    </label>
                    <input
                      type="password"
                      value={r2Config.secretAccessKey}
                      onChange={e => setR2Config(p => ({ ...p, secretAccessKey: e.target.value }))}
                      placeholder={r2Config.isConfigured ? "•••••••••••• (Leave blank to keep current)" : "R2 Secret Key"}
                      className="w-full px-3.5 py-2.5 border border-gray-200 rounded-xl focus:ring-2 focus:ring-orange-500 outline-none text-xs font-mono"
                    />
                  </div>

                  <div className="sm:col-span-2">
                    <label className="text-xs font-bold text-gray-700 block mb-1">
                      Public Bucket URL / Custom CDN Domain (Optional for direct public links)
                    </label>
                    <input
                      type="url"
                      value={r2Config.publicUrl}
                      onChange={e => setR2Config(p => ({ ...p, publicUrl: e.target.value }))}
                      placeholder="e.g. https://pub-xxxxxxxx.r2.dev ya https://cdn.yourdomain.com"
                      className="w-full px-3.5 py-2.5 border border-gray-200 rounded-xl focus:ring-2 focus:ring-orange-500 outline-none text-xs font-mono"
                    />
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-3 pt-2">
                  <button
                    disabled={r2Saving || !r2Config.accountId || !r2Config.bucketName}
                    onClick={handleSaveR2}
                    className="px-5 py-2.5 bg-orange-600 hover:bg-orange-700 active:scale-95 text-white font-bold text-xs rounded-xl transition shadow-md shadow-orange-600/20 disabled:opacity-50 flex items-center gap-1.5 cursor-pointer"
                  >
                    {r2Saving ? "Saving..." : "Save R2 Credentials"}
                  </button>

                  <button
                    disabled={r2Testing || !r2Config.accountId || !r2Config.bucketName}
                    onClick={handleTestR2}
                    className="px-4 py-2.5 bg-gray-100 hover:bg-gray-200 active:scale-95 text-gray-800 font-bold text-xs rounded-xl border border-gray-200 transition disabled:opacity-50 flex items-center gap-1.5 cursor-pointer"
                  >
                    {r2Testing ? (
                      <>
                        <div className="w-3 h-3 border-2 border-gray-600 border-t-transparent rounded-full animate-spin" />
                        <span>Testing Connection...</span>
                      </>
                    ) : (
                      <>
                        
                        <span>Test Connection</span>
                      </>
                    )}
                  </button>
                </div>
              </div>

              {/* Instant Encrypted Local Backup Desk in Settings */}
              <div className="bg-white rounded-2xl p-4 sm:p-6 border border-gray-100 shadow-sm space-y-4">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-gray-100 pb-3">
                  <div>
                    <h4 className="text-base sm:text-lg font-black font-display text-gray-900 flex items-center gap-2">
                      
                      <span>Instant Encrypted System Backup (सुरक्षित स्थानीय बैकअप)</span>
                    </h4>
                    <p className="text-xs text-gray-500 mt-0.5">
                      AES-256 encrypted choti file (~15-30 KB). Har 1 ghante me automatic snapshot sync hota hai aur aap 1-click me turant fresh backup bhi download kar sakte hain.
                    </p>
                  </div>
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-[11px] font-black px-2.5 py-1 rounded-full bg-emerald-50 text-emerald-800 border border-emerald-200 flex items-center gap-1">
                      <span className="relative flex h-2 w-2">
                        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
                        <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-600" />
                      </span>
                      Auto 1-Hr Active
                    </span>
                    <button
                      type="button"
                      onClick={downloadEncryptedBackup}
                      disabled={backupLoading}
                      className="min-h-[44px] px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-black shadow-xs transition flex items-center gap-2 active:scale-95 cursor-pointer disabled:opacity-50"
                    >
                      <span>{backupLoading ? "⏳" : ""}</span>
                      <span>{backupLoading ? "Downloading Backup..." : "Abhi Fresh Encrypted Backup Lelein"}</span>
                    </button>
                  </div>
                </div>

                {/* Backup History Table */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between text-xs font-bold text-gray-700">
                    <span>Local Backup Log (Kab Kab Backup Hua Hai):</span>
                    <div className="flex items-center gap-2">
                      <span className="text-gray-400 text-[11px]">{backupHistory.length} Backups Saved</span>
                      {backupHistory.length > 0 && (
                        <button
                          type="button"
                          onClick={() => {
                            if (window.confirm("Purane browser backup log ko clear karna chahte hain?")) {
                              setBackupHistory([]);
                              try { localStorage.removeItem("educa_admin_backup_history"); } catch (_) {}
                              showToast("Backup log successfully clear ho gaya", "success");
                            }
                          }}
                          className="px-2 py-0.5 text-[10px] font-bold text-rose-600 bg-rose-50 hover:bg-rose-100 border border-rose-200 rounded-md transition cursor-pointer"
                        >
                          Clear Log
                        </button>
                      )}
                    </div>
                  </div>

                  {backupHistory.length === 0 ? (
                    <div className="p-6 text-center text-xs text-gray-400 bg-slate-50 rounded-xl border border-dashed border-slate-200">
                      Abhi tak is browser me koi backup nahi liya gaya hai. Naya backup lene ke liye upar diye button par click karein.
                    </div>
                  ) : (
                    <div className="overflow-x-auto">
                      <table className="w-full text-left text-xs">
                        <thead className="bg-slate-50 text-gray-600 text-[11px] font-bold uppercase border-y border-slate-100">
                          <tr>
                            <th className="py-2.5 px-3">Date & Time</th>
                            <th className="py-2.5 px-3">File Name & Size</th>
                            <th className="py-2.5 px-3">Kya Kya Hua Backup</th>
                            <th className="py-2.5 px-3">Encryption Status</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                          {backupHistory.map((b) => (
                            <tr key={b.id || b.timestamp} className="hover:bg-slate-50/70 transition">
                              <td className="py-2.5 px-3 font-semibold text-slate-900 whitespace-nowrap">
                                {b.dateStr || new Date(b.timestamp).toLocaleString("en-IN")}
                              </td>
                              <td className="py-2.5 px-3 font-mono font-bold text-blue-700 whitespace-nowrap">
                                {b.filename || "educa_backup.enc"} <span className="text-[10px] text-gray-500 font-normal">({b.sizeKb || "18.4"} KB)</span>
                              </td>
                              <td className="py-2.5 px-3 text-slate-700">
                                {b.summary ? (
                                  <span className="inline-flex flex-wrap gap-1.5 text-[11px]">
                                    <span className="px-1.5 py-0.5 rounded bg-slate-100 font-semibold">{b.summary ? (users.length > 0 ? Math.min(b.summary.usersCount, users.length) : (b.summary.usersCount > 20 ? 20 : b.summary.usersCount)) : (users.length > 0 ? users.length : 20)} Users</span>
                                    <span className="px-1.5 py-0.5 rounded bg-blue-50 text-blue-800 font-semibold">{b.summary.loansCount} Loans</span>
                                    <span className="px-1.5 py-0.5 rounded bg-purple-50 text-purple-800 font-semibold">{b.summary.bondsCount} Bonds</span>
                                    <span className="px-1.5 py-0.5 rounded bg-emerald-50 text-emerald-800 font-semibold">{b.summary.txnsCount} Txns</span>
                                  </span>
                                ) : (
                                  <span className="text-gray-400">Full System Snapshot</span>
                                )}
                              </td>
                              <td className="py-2.5 px-3">
                                <span className="px-2 py-0.5 rounded-full text-[10px] font-black bg-emerald-100 text-emerald-800 border border-emerald-200">
                                  AES-256 Encrypted
                                </span>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
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
                <div className="flex items-center gap-2 flex-wrap">
                  <h3 className="font-black text-lg text-gray-900 flex items-center gap-1.5">
                     KYC: {previewKycUser.name}
                  </h3>
                  <span
                    title={`Submitted: ${new Date(previewKycUser.kycDocuments?.submittedAt || previewKycUser.createdAt).toLocaleString("en-IN")}`}
                    className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-mono font-bold bg-amber-100 text-amber-900 border border-amber-300 shadow-2xs"
                  >
                    ⏱️ {formatLiveTimeElapsed(previewKycUser.kycDocuments?.submittedAt || previewKycUser.createdAt)}
                  </span>
                </div>
                <p className="text-xs text-gray-500">
                  {previewKycUser.email} · {previewKycUser.phone}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => {
                    const uid = previewKycUser._id;
                    kycDocMemoryCache.delete(`${uid}_doc1`);
                    kycDocMemoryCache.delete(`${uid}_doc1Back`);
                    kycDocMemoryCache.delete(`${uid}_doc2`);
                    kycDocMemoryCache.delete(`${uid}_doc2Back`);
                    setPreviewKycUser({ ...previewKycUser });
                  }}
                  disabled={loadingKycDocs}
                  className="px-2.5 py-1 rounded-xl bg-blue-50 hover:bg-blue-100 text-blue-700 text-xs font-bold transition border border-blue-200 cursor-pointer active:scale-95 flex items-center gap-1 shadow-2xs"
                  title="Reload KYC documents from server"
                >
                  <span className={loadingKycDocs ? "animate-spin" : ""}>↻</span>
                  <span>{loadingKycDocs ? "Loading..." : "Reload"}</span>
                </button>
                <button
                  type="button"
                  onClick={() => setPreviewKycUser(null)}
                  className="w-8 h-8 rounded-full bg-gray-100 hover:bg-gray-200 text-gray-600 flex items-center justify-center transition text-sm font-bold cursor-pointer active:scale-90 select-none"
                >
                  ✕
                </button>
              </div>
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

              {/* Registered Bank Account (Permanent) */}
              <div className="p-3 bg-emerald-50/70 border border-emerald-200 rounded-2xl space-y-1.5 text-xs">
                <div className="flex items-center justify-between pb-1 border-b border-emerald-200">
                  <span className="font-extrabold text-emerald-950 flex items-center gap-1.5">
                    <span>🏦</span> Registered Permanent Bank Details
                  </span>
                  <span className="text-[10px] bg-emerald-100 text-emerald-800 px-2 py-0.5 rounded-full font-bold">
                    Permanent
                  </span>
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-[11px] pt-1">
                  <div>
                    <span className="text-gray-400 block text-[10px]">Bank Name:</span>
                    <span className="font-bold text-gray-800">{previewKycUser.bankAccount?.bankName || previewKycUser.kycDocuments?.bankName || "—"}</span>
                  </div>
                  <div>
                    <span className="text-gray-400 block text-[10px]">Account No:</span>
                    <span className="font-mono font-bold text-gray-900">{previewKycUser.bankAccount?.accountNumber || previewKycUser.kycDocuments?.bankAccountNumber || "—"}</span>
                  </div>
                  <div>
                    <span className="text-gray-400 block text-[10px]">IFSC Code:</span>
                    <span className="font-mono font-bold text-gray-800">{previewKycUser.bankAccount?.ifsc || previewKycUser.kycDocuments?.bankIfsc || "—"}</span>
                  </div>
                  <div>
                    <span className="text-gray-400 block text-[10px]">Holder / UPI:</span>
                    <span className="font-mono text-gray-800 truncate block">
                      {previewKycUser.bankAccount?.holderName || previewKycUser.kycDocuments?.bankHolderName || previewKycUser.name}
                      {(previewKycUser.bankAccount?.upiId || previewKycUser.kycDocuments?.bankUpiId) ? ` • ${previewKycUser.bankAccount?.upiId || previewKycUser.kycDocuments?.bankUpiId}` : ""}
                    </span>
                  </div>
                </div>
              </div>

              {/* Pending Bank Change Request Details (if any) */}
              {previewKycUser.bankChangeRequest && previewKycUser.bankChangeRequest.status === "pending" && (
                <div className="p-3.5 bg-amber-50 rounded-2xl border-2 border-amber-300 space-y-2.5 text-xs">
                  <div className="flex items-center justify-between pb-1 border-b border-amber-200">
                    <span className="font-extrabold text-amber-950 flex items-center gap-1.5">
                      <span>⚠️</span> Bank Account / UPI Change Request
                    </span>
                    <span className="text-[10px] bg-amber-200 text-amber-900 px-2 py-0.5 rounded-full font-bold">
                      Requested {previewKycUser.bankChangeRequest.requestedAt ? new Date(previewKycUser.bankChangeRequest.requestedAt).toLocaleDateString("en-IN") : "Recent"}
                    </span>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-[11px]">
                    <div className="p-2 bg-white rounded-xl border border-amber-200 space-y-0.5">
                      <span className="text-[9px] font-bold text-gray-400 uppercase tracking-wider block">Current Registered Bank</span>
                      <div className="font-bold text-gray-800">{previewKycUser.bankAccount?.bankName || "—"}</div>
                      <div className="font-mono text-gray-600">A/C: {previewKycUser.bankAccount?.accountNumber || "—"}</div>
                      <div className="font-mono text-gray-600">IFSC: {previewKycUser.bankAccount?.ifsc || "—"}</div>
                      <div className="font-mono text-gray-600">UPI: {previewKycUser.bankAccount?.upiId || "—"}</div>
                    </div>
                    <div className="p-2 bg-emerald-50 rounded-xl border border-emerald-300 space-y-0.5 text-emerald-950">
                      <span className="text-[9px] font-bold text-emerald-700 block text-[9px] uppercase tracking-wider">Requested New Bank Details</span>
                      <div className="font-extrabold text-emerald-900">{previewKycUser.bankChangeRequest.bankName || "—"}</div>
                      <div className="font-mono font-bold text-emerald-900">A/C: {previewKycUser.bankChangeRequest.accountNumber || "—"}</div>
                      <div className="font-mono text-emerald-800">IFSC: {previewKycUser.bankChangeRequest.ifsc || "—"} | Holder: {previewKycUser.bankChangeRequest.holderName || "—"}</div>
                      <div className="font-mono text-emerald-800">UPI: {previewKycUser.bankChangeRequest.upiId || "—"}</div>
                    </div>
                  </div>
                  {previewKycUser.bankChangeRequest.reason && (
                    <div className="p-2 bg-white rounded-lg border border-amber-200 text-[11px] text-amber-900">
                      <strong>Reason for change:</strong> "{previewKycUser.bankChangeRequest.reason}"
                    </div>
                  )}
                  <div className="flex items-center gap-2 pt-1">
                    <button
                      type="button"
                      onClick={async () => {
                        const uid = previewKycUser._id;
                        setPreviewKycUser(null);
                        await approveBankChange(uid, "Bank change approved by KYC Department");
                      }}
                      className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold transition shadow-xs cursor-pointer active:scale-95"
                    >
                      ✓ Approve Bank Change
                    </button>
                    <button
                      type="button"
                      onClick={async () => {
                        const uid = previewKycUser._id;
                        const reason = prompt("Enter reason for rejecting bank change:");
                        if (reason !== null) {
                          setPreviewKycUser(null);
                          await rejectBankChange(uid, reason || "Bank details could not be verified");
                        }
                      }}
                      className="px-4 py-2 bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-300 rounded-xl text-xs font-bold transition cursor-pointer active:scale-95"
                    >
                      ✕ Reject Bank Change
                    </button>
                  </div>
                </div>
              )}

              {/* Secure Document Vault Status */}
              <div className="p-3 bg-slate-50 border border-slate-200 rounded-2xl flex items-center justify-between text-xs">
                <div className="flex items-center gap-2">
                  <span className="text-base"></span>
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
                    const cleanDocUrl = (url) => (typeof url === "string" && !url.startsWith("enc::") && !url.startsWith("enc2::") && url !== "pending_load" && url.trim().length > 5 ? url.trim() : "");
                    const hasEncryptedDoc = (url) => typeof url === "string" && (url.startsWith("enc::") || url.startsWith("enc2::"));
                    const rawDoc1Front = previewKycUser.kycDocuments?.doc1Url ||
                      previewKycUser.kycDocuments?.docUrl ||
                      previewKycUser.kycDocuments?.aadharUrl ||
                      previewKycUser.kycDocuments?.aadharFrontUrl ||
                      previewKycUser.documents?.doc1Url ||
                      previewKycUser.documents?.aadharUrl ||
                      previewKycUser.documents?.docUrl ||
                      previewKycUser.doc1Url ||
                      previewKycUser.aadharUrl;
                    const doc1Front = cleanDocUrl(rawDoc1Front) || kycDocMemoryCache.get(`${previewKycUser._id}_doc1`) || "";
                    const isWaiting = loadingKycDocs || (!doc1Front && (hasEncryptedDoc(rawDoc1Front) || rawDoc1Front === "pending_load"));
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
                          <div className="absolute bottom-1 right-1 bg-black/50 text-white text-[10px] px-1.5 py-0.5 rounded-full opacity-0 group-hover:opacity-100 transition pointer-events-none">Zoom Front</div>
                        </div>
                      </div>
                    ) : isWaiting ? (
                      <div className="p-4 text-center text-xs text-blue-600 font-bold bg-blue-50/50 rounded-xl border border-dashed border-blue-200 flex items-center justify-center gap-2">
                        <span className="w-3.5 h-3.5 border-2 border-blue-600 border-t-transparent rounded-full animate-spin" />
                        <span>Loading Aadhaar Front...</span>
                      </div>
                    ) : (
                      <div className="p-4 text-center text-xs text-gray-400">No Aadhaar Front file</div>
                    );
                  })()}

                  {/* Back */}
                  {(() => {
                    const cleanDocUrl = (url) => (typeof url === "string" && !url.startsWith("enc::") && !url.startsWith("enc2::") && url !== "pending_load" && url.trim().length > 5 ? url.trim() : "");
                    const hasEncryptedDoc = (url) => typeof url === "string" && (url.startsWith("enc::") || url.startsWith("enc2::"));
                    const rawDoc1Back = previewKycUser.kycDocuments?.doc1BackUrl ||
                      previewKycUser.kycDocuments?.aadharBackUrl ||
                      previewKycUser.documents?.doc1BackUrl ||
                      previewKycUser.documents?.aadharBackUrl ||
                      previewKycUser.doc1BackUrl ||
                      previewKycUser.aadharBackUrl;
                    const doc1Back = cleanDocUrl(rawDoc1Back) || kycDocMemoryCache.get(`${previewKycUser._id}_doc1Back`) || "";
                    const isWaiting = loadingKycDocs || (!doc1Back && (hasEncryptedDoc(rawDoc1Back) || rawDoc1Back === "pending_load"));
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
                          <div className="absolute bottom-1 right-1 bg-black/50 text-white text-[10px] px-1.5 py-0.5 rounded-full opacity-0 group-hover:opacity-100 transition pointer-events-none">Zoom Back</div>
                        </div>
                      </div>
                    ) : isWaiting ? (
                      <div className="p-3 text-center text-xs text-blue-600 font-bold bg-blue-50/50 rounded-xl border border-dashed border-blue-200 flex items-center justify-center gap-2 mt-2">
                        <span className="w-3.5 h-3.5 border-2 border-blue-600 border-t-transparent rounded-full animate-spin" />
                        <span>Loading Aadhaar Back...</span>
                      </div>
                    ) : null;
                  })()}
                </div>

                {/* Document 2: PAN or Cheque (Front & Back) */}
                <div className="space-y-2 p-3 bg-gray-50 border border-gray-200 rounded-2xl">
                  <span className="text-xs font-bold text-slate-900 block flex items-center justify-between">
                    <span className="flex items-center gap-1.5">
                       Doc 2: {previewKycUser.kycDocuments?.doc2Type === "cheque" ? "Bank Cheque" : "PAN Card"}
                    </span>
                    <span className="text-[10px] text-blue-600 font-semibold">Front & Back</span>
                  </span>

                  {/* Front */}
                  {(() => {
                    const cleanDocUrl = (url) => (typeof url === "string" && !url.startsWith("enc::") && !url.startsWith("enc2::") && url !== "pending_load" && url.trim().length > 5 ? url.trim() : "");
                    const hasEncryptedDoc = (url) => typeof url === "string" && (url.startsWith("enc::") || url.startsWith("enc2::"));
                    const rawDoc2Front = previewKycUser.kycDocuments?.doc2Url ||
                      previewKycUser.kycDocuments?.panUrl ||
                      previewKycUser.kycDocuments?.chequeUrl ||
                      previewKycUser.kycDocuments?.chequeFrontUrl ||
                      previewKycUser.documents?.doc2Url ||
                      previewKycUser.documents?.panUrl ||
                      previewKycUser.documents?.chequeUrl ||
                      previewKycUser.doc2Url ||
                      previewKycUser.panUrl ||
                      previewKycUser.chequeUrl;
                    const doc2Front = cleanDocUrl(rawDoc2Front) || kycDocMemoryCache.get(`${previewKycUser._id}_doc2`) || "";
                    const isWaiting = loadingKycDocs || (!doc2Front && (hasEncryptedDoc(rawDoc2Front) || rawDoc2Front === "pending_load"));
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
                          <div className="absolute bottom-1 right-1 bg-black/50 text-white text-[10px] px-1.5 py-0.5 rounded-full opacity-0 group-hover:opacity-100 transition pointer-events-none">Zoom Front</div>
                        </div>
                      </div>
                    ) : isWaiting ? (
                      <div className="p-4 text-center text-xs text-blue-600 font-bold bg-blue-50/50 rounded-xl border border-dashed border-blue-200 flex items-center justify-center gap-2">
                        <span className="w-3.5 h-3.5 border-2 border-blue-600 border-t-transparent rounded-full animate-spin" />
                        <span>Loading Doc 2 Front...</span>
                      </div>
                    ) : (
                      <div className="p-4 text-center text-xs text-gray-400">No Doc 2 Front file uploaded</div>
                    );
                  })()}

                  {/* Back */}
                  {(() => {
                    const cleanDocUrl = (url) => (typeof url === "string" && !url.startsWith("enc::") && !url.startsWith("enc2::") && url !== "pending_load" && url.trim().length > 5 ? url.trim() : "");
                    const hasEncryptedDoc = (url) => typeof url === "string" && (url.startsWith("enc::") || url.startsWith("enc2::"));
                    const rawDoc2Back = previewKycUser.kycDocuments?.doc2BackUrl ||
                      previewKycUser.kycDocuments?.panBackUrl ||
                      previewKycUser.kycDocuments?.chequeBackUrl ||
                      previewKycUser.documents?.doc2BackUrl ||
                      previewKycUser.documents?.panBackUrl ||
                      previewKycUser.doc2BackUrl ||
                      previewKycUser.panBackUrl;
                    const doc2Back = cleanDocUrl(rawDoc2Back) || kycDocMemoryCache.get(`${previewKycUser._id}_doc2Back`) || "";
                    const isWaiting = loadingKycDocs || (!doc2Back && (hasEncryptedDoc(rawDoc2Back) || rawDoc2Back === "pending_load"));
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
                          <div className="absolute bottom-1 right-1 bg-black/50 text-white text-[10px] px-1.5 py-0.5 rounded-full opacity-0 group-hover:opacity-100 transition pointer-events-none">Zoom Back</div>
                        </div>
                      </div>
                    ) : isWaiting ? (
                      <div className="p-3 text-center text-xs text-blue-600 font-bold bg-blue-50/50 rounded-xl border border-dashed border-blue-200 flex items-center justify-center gap-2 mt-2">
                        <span className="w-3.5 h-3.5 border-2 border-blue-600 border-t-transparent rounded-full animate-spin" />
                        <span>Loading Doc 2 Back...</span>
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
                        Note Locked (Decision Finalized)
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
            <div className="flex items-center justify-end gap-2.5 border-t border-gray-100 pt-3 mt-4 shrink-0 flex-wrap">
              <button
                type="button"
                onClick={() => setPreviewKycUser(null)}
                className="px-4 py-2.5 rounded-xl border border-gray-200 text-gray-700 hover:bg-gray-100 text-xs font-bold transition cursor-pointer active:scale-90 select-none"
              >
                Close
              </button>
              {previewKycUser.kycStatus === "pending" ? (
                <>
                  <button
                    type="button"
                    onClick={async () => {
                      showToast("Rejecting KYC...", "info");
                      await rejectKyc(previewKycUser._id, kycReviewRemarks);
                      setPreviewKycUser(null);
                    }}
                    className="px-4 py-2.5 rounded-xl bg-rose-50 text-rose-700 border border-rose-300 hover:bg-rose-100 text-xs font-bold transition cursor-pointer active:scale-90 active:ring-2 active:ring-rose-300 select-none"
                  >
                    ✕ Reject with Note
                  </button>
                  <button
                    type="button"
                    onClick={async () => {
                      showToast("Approving KYC...", "info");
                      await approveKyc(previewKycUser._id, kycReviewRemarks);
                      setPreviewKycUser(null);
                    }}
                    className="px-5 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold shadow-md shadow-emerald-500/20 transition cursor-pointer active:scale-90 active:ring-4 active:ring-emerald-300 select-none"
                  >
                    ✓ Approve with Note
                  </button>
                </>
              ) : previewKycUser.kycStatus === "rejected" ? (
                <button
                  type="button"
                  onClick={() => showToast(`User ${previewKycUser.name} KYC is already rejected.`, "info")}
                  className="px-4 py-2.5 rounded-xl bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 text-xs font-bold select-none flex items-center gap-1.5 cursor-pointer active:scale-90 transition"
                >
                   KYC Rejected — Note Locked
                </button>
              ) : previewKycUser.kycStatus === "verified" ? (
                <button
                  type="button"
                  onClick={() => showToast(`User ${previewKycUser.name} KYC is verified and active.`, "info")}
                  className="px-4 py-2.5 rounded-xl bg-emerald-50 hover:bg-emerald-100 text-emerald-700 border border-emerald-200 text-xs font-bold select-none flex items-center gap-1.5 cursor-pointer active:scale-90 transition"
                >
                  <span>✓</span> KYC Verified (Locked)
                </button>
              ) : null}
            </div>
          </div>
        </div>
      )}

      {/* TRANSACTION APPROVAL MODAL (WITH UTR, EVIDENCE SCREENSHOT & USER QR) */}
      {approveTxnModal && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4">
          <div className="bg-white rounded-3xl max-w-lg w-full p-4 sm:p-6 shadow-2xl border border-gray-100 animate-in fade-in zoom-in-95 duration-150 space-y-4 max-h-[92vh] overflow-y-auto">
            {/* Header */}
            <div className="flex items-center justify-between border-b border-gray-100 pb-2.5">
              <div className="flex items-center gap-2">
                <span className="text-xl"></span>
                <div>
                  <h3 className="font-extrabold text-sm sm:text-base text-gray-900 leading-tight">
                    Approve Transaction Payout
                  </h3>
                  <p className="text-[11px] text-gray-500 font-medium">
                    {approveTxnModal.type === "withdrawal" ? "Withdrawal Payout Verification" : "Deposit Approval Verification"}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setApproveTxnModal(null)}
                className="w-8 h-8 rounded-full bg-gray-100 hover:bg-gray-200 text-gray-600 flex items-center justify-center text-sm font-bold cursor-pointer"
              >
                ✕
              </button>
            </div>

            {/* Transaction Overview Card */}
            <div className="p-3.5 bg-slate-50 border border-slate-200 rounded-2xl space-y-2">
              <div className="flex justify-between items-start">
                <div>
                  <p className="font-extrabold text-sm text-slate-900">{approveTxnModal.userId?.name || "User"}</p>
                  <p className="text-xs text-gray-400">{approveTxnModal.userId?.email || approveTxnModal.userId?.phone || ""}</p>
                </div>
                <div className="text-right">
                  <span className="font-mono font-black text-base text-slate-900 block">
                    ₹{Number(approveTxnModal.amount || 0).toLocaleString("en-IN")}
                  </span>
                  <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase ${
                    approveTxnModal.type === "withdrawal" ? "bg-red-100 text-red-700" : "bg-green-100 text-green-700"
                  }`}>
                    {approveTxnModal.type}
                  </span>
                </div>
              </div>

              {/* User Payout Details */}
              <div className="pt-2 border-t border-slate-200/80 space-y-1.5 text-xs">
                <span className="text-[10px] uppercase font-bold text-gray-400 block tracking-wider">
                  Payment Target / Destination:
                </span>
                {approveTxnModal.paymentDetails?.upiId && (
                  <div className="flex items-center justify-between bg-white p-2 rounded-xl border border-slate-200">
                    <span className="text-gray-600">User UPI ID:</span>
                    <div className="flex items-center gap-1.5 font-mono font-bold text-slate-800">
                      <span>{approveTxnModal.paymentDetails.upiId}</span>
                      <button
                        type="button"
                        onClick={() => { navigator.clipboard?.writeText(approveTxnModal.paymentDetails.upiId); showToast("UPI ID Copied!", "success"); }}
                        className="px-1.5 py-0.5 bg-blue-50 text-blue-700 border border-blue-200 rounded text-[10px] font-bold hover:bg-blue-100 cursor-pointer"
                      >
                        Copy
                      </button>
                    </div>
                  </div>
                )}

                {approveTxnModal.paymentDetails?.qrCodeUrl && (
                  <div className="bg-white p-2.5 rounded-xl border border-slate-200 flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <img
                        src={approveTxnModal.paymentDetails.qrCodeUrl}
                        alt="User QR"
                        onClick={() => { setLightboxImg(approveTxnModal.paymentDetails.qrCodeUrl); setZoomLevel(1); }}
                        className="w-12 h-12 object-contain bg-white rounded-lg border border-slate-300 p-0.5 cursor-zoom-in"
                      />
                      <div>
                        <span className="text-xs font-bold text-slate-900 block">User Payment QR Code</span>
                        <span className="text-[10px] text-gray-500">Scan to pay from PhonePe / GPay</span>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => { setLightboxImg(approveTxnModal.paymentDetails.qrCodeUrl); setZoomLevel(1); }}
                      className="px-2.5 py-1 bg-purple-50 text-purple-700 border border-purple-200 rounded-lg text-xs font-bold hover:bg-purple-100 cursor-pointer"
                    >
                      Fullscreen QR
                    </button>
                  </div>
                )}

                {approveTxnModal.paymentDetails?.accountNumber && (
                  <div className="bg-white p-2 rounded-xl border border-slate-200 space-y-0.5">
                    <div className="flex justify-between">
                      <span className="text-gray-500">Account No:</span>
                      <span className="font-mono font-bold text-slate-800">{approveTxnModal.paymentDetails.accountNumber}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-500">IFSC Code:</span>
                      <span className="font-mono font-bold text-slate-800">{approveTxnModal.paymentDetails.ifsc}</span>
                    </div>
                  </div>
                )}

                {(approveTxnModal.proofUrl || approveTxnModal.screenshotUrl) && (
                  <div className="flex items-center justify-between bg-white p-2 rounded-xl border border-slate-200">
                    <span className="text-gray-600">User Deposit Receipt:</span>
                    <button
                      type="button"
                      onClick={() => { setLightboxImg(approveTxnModal.proofUrl || approveTxnModal.screenshotUrl); setZoomLevel(1); }}
                      className="text-blue-600 font-bold underline cursor-pointer"
                    >
                      View Receipt 
                    </button>
                  </div>
                )}
              </div>
            </div>

            {/* Admin Input: UTR & Evidence Screenshot */}
            <div className="space-y-3">
              <div>
                <label className="text-xs font-bold text-gray-700 block mb-1">
                  Bank / UPI UTR Number (Transaction ID)
                </label>
                <input
                  type="text"
                  placeholder="e.g. 12-digit UTR (e.g. 428194829104 / Ref No)"
                  value={adminUtrInput}
                  onChange={e => setAdminUtrInput(e.target.value)}
                  className="w-full px-3.5 py-2.5 border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none text-xs sm:text-sm font-mono font-bold"
                />
                <span className="text-[10px] text-gray-400 block mt-0.5">Payout complete hone ke baad UPI ya bank se mila hua UTR number yahan daalein.</span>
              </div>

              <div>
                <label className="text-xs font-bold text-gray-700 block mb-1">
                  Payment Evidence / Payout Screenshot (Receipt)
                </label>
                {adminEvidenceInput ? (
                  <div className="p-3 bg-emerald-50/70 border border-emerald-200 rounded-xl flex items-center justify-between">
                    <div className="flex items-center gap-2.5">
                      <img
                        src={adminEvidenceInput}
                        alt="Evidence Preview"
                        onClick={() => { setLightboxImg(adminEvidenceInput); setZoomLevel(1); }}
                        className="w-12 h-12 object-cover rounded-lg border border-emerald-300 cursor-zoom-in"
                      />
                      <div>
                        <span className="text-xs font-bold text-emerald-900 block">Evidence Attached ✓</span>
                        <span className="text-[10px] text-emerald-700 font-medium">{adminEvidenceName || "Tap image to preview"}</span>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => { setAdminEvidenceInput(""); setAdminEvidenceName(""); }}
                      className="px-2 py-1 text-xs text-rose-600 hover:bg-rose-50 rounded-lg font-bold cursor-pointer"
                    >
                      Remove ✕
                    </button>
                  </div>
                ) : (
                  <label className="border-2 border-dashed border-gray-300 hover:border-blue-400 rounded-xl p-3 flex items-center justify-center gap-2 cursor-pointer bg-gray-50/50 hover:bg-blue-50/30 transition text-xs font-bold text-gray-600">
                    <span>Upload Payment Screenshot / Receipt</span>
                    <input
                      type="file"
                      accept="image/*"
                      className="hidden"
                      onChange={e => handleAdminEvidenceUpload(e.target.files?.[0])}
                    />
                  </label>
                )}
                <span className="text-[10px] text-gray-400 block mt-0.5">GPay / PhonePe / Bank transfer confirmation ka screenshot attach karein.</span>
              </div>

              <div>
                <label className="text-xs font-bold text-gray-700 block mb-1">
                  Admin Remarks / Evidence Note (Optional)
                </label>
                <input
                  type="text"
                  placeholder="e.g. Paid via PhonePe Business UPI"
                  value={adminNoteInput}
                  onChange={e => setAdminNoteInput(e.target.value)}
                  className="w-full px-3.5 py-2 border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none text-xs"
                />
              </div>
            </div>

            {/* Action Buttons */}
            <div className="flex gap-2.5 pt-2 border-t border-gray-100">
              <button
                type="button"
                onClick={() => setApproveTxnModal(null)}
                className="flex-1 py-2.5 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-xl text-xs font-bold transition cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={isApprovingTxn}
                onClick={submitApproveTxn}
                className="flex-1 py-2.5 bg-gradient-to-r from-emerald-600 to-green-600 hover:from-emerald-700 hover:to-green-700 text-white rounded-xl text-xs font-black shadow-md transition cursor-pointer active:scale-95 disabled:opacity-50"
              >
                {isApprovingTxn ? "Approving..." : "✓ Confirm & Complete Approval"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* TRANSACTION REJECTION MODAL */}
      {rejectTxnModal && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4">
          <div className="bg-white rounded-3xl max-w-md w-full p-4 sm:p-6 shadow-2xl border border-gray-100 animate-in fade-in zoom-in-95 duration-150 space-y-4">
            {/* Header */}
            <div className="flex items-center justify-between border-b border-gray-100 pb-2.5">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-full bg-rose-100 text-rose-600 flex items-center justify-center font-black text-sm">
                  ✕
                </div>
                <div>
                  <h3 className="font-extrabold text-sm sm:text-base text-gray-900 leading-tight">
                    Reject Transaction
                  </h3>
                  <p className="text-[11px] text-gray-500 font-medium">
                    {rejectTxnModal.type === "withdrawal" ? "Withdrawal Request Rejection" : "Deposit Request Rejection"}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setRejectTxnModal(null)}
                className="w-8 h-8 rounded-full bg-gray-100 hover:bg-gray-200 text-gray-600 flex items-center justify-center text-sm font-bold cursor-pointer"
              >
                ✕
              </button>
            </div>

            {/* Target User & Amount */}
            <div className="p-3 bg-rose-50/70 border border-rose-200 rounded-2xl flex items-center justify-between">
              <div>
                <p className="font-extrabold text-sm text-slate-900">{rejectTxnModal.userId?.name || "User"}</p>
                <p className="text-xs text-gray-500">{rejectTxnModal.userId?.phone || rejectTxnModal.userId?.email || ""}</p>
              </div>
              <div className="text-right">
                <span className="font-mono font-black text-base text-rose-900 block">
                  ₹{Number(rejectTxnModal.amount || 0).toLocaleString("en-IN")}
                </span>
                <span className="text-[10px] font-bold uppercase text-rose-600">
                  {rejectTxnModal.type}
                </span>
              </div>
            </div>

            {/* Preset Reason Chips */}
            <div className="space-y-1.5">
              <label className="text-xs font-bold text-gray-700 block">
                Quick Reason Select:
              </label>
              <div className="flex flex-wrap gap-1.5">
                {[
                  "Invalid UPI ID / Bank Details",
                  "Payment Not Received in Bank",
                  "Duplicate Request",
                  "KYC Incomplete",
                  "Account Verification Pending",
                  "User Requested Cancellation",
                ].map(preset => (
                  <button
                    key={preset}
                    type="button"
                    onClick={() => setRejectReasonInput(preset)}
                    className={`px-2.5 py-1 rounded-xl text-xs font-semibold border transition cursor-pointer ${
                      rejectReasonInput === preset
                        ? "bg-rose-600 text-white border-rose-600 shadow-2xs"
                        : "bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100"
                    }`}
                  >
                    {preset}
                  </button>
                ))}
              </div>
            </div>

            {/* Remarks Input */}
            <div className="space-y-1">
              <label className="text-xs font-bold text-gray-700 block">
                Rejection Remarks (Reason):
              </label>
              <textarea
                rows={3}
                value={rejectReasonInput}
                onChange={(e) => setRejectReasonInput(e.target.value)}
                placeholder="Yahan rejection ka karan likhein..."
                className="w-full p-2.5 text-xs rounded-xl border border-gray-300 focus:outline-none focus:ring-2 focus:ring-rose-500 bg-white"
              />
            </div>

            {/* Actions */}
            <div className="flex gap-2 pt-2">
              <button
                type="button"
                onClick={() => setRejectTxnModal(null)}
                className="flex-1 py-2.5 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-xl text-xs font-bold transition cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={isRejectingTxn || !rejectReasonInput.trim()}
                onClick={submitRejectTxn}
                className="flex-1 py-2.5 bg-rose-600 hover:bg-rose-700 text-white rounded-xl text-xs font-black transition cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-1.5 shadow-xs"
              >
                {isRejectingTxn ? (
                  <>
                    <span className="w-3.5 h-3.5 border-2 border-white/40 border-t-white rounded-full animate-spin" />
                    <span>Rejecting...</span>
                  </>
                ) : (
                  <>
                    <span>✕</span> Confirm Rejection
                  </>
                )}
              </button>
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
                <span className="text-xl"></span>
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

              <div>
                <label className="block font-bold text-gray-700 mb-1">
                  Payment Slip / Receipt Photo (Optional)
                </label>
                <div className="flex items-center gap-2 flex-wrap">
                  <label className="px-3 py-2 bg-blue-50 hover:bg-blue-100 text-blue-700 rounded-xl text-xs font-bold border border-blue-200 cursor-pointer flex items-center gap-1.5 transition active:scale-95">
                     Slip Photo Upload Karein
                    <input
                      type="file"
                      accept="image/*"
                      className="hidden"
                      onChange={(e) => {
                        const file = e.target.files?.[0];
                        if (!file) return;
                        const reader = new FileReader();
                        reader.onload = (ev) => {
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
                            const dataUrl = canvas.toDataURL("image/jpeg", 0.8);
                            setAdminPayModal(prev => ({ ...prev, proofUrl: dataUrl }));
                          };
                          img.src = ev.target.result;
                        };
                        reader.readAsDataURL(file);
                      }}
                    />
                  </label>
                  {adminPayModal.proofUrl && (
                    <div className="flex items-center gap-2 bg-emerald-50 px-2.5 py-1 rounded-lg border border-emerald-200">
                      <span className="text-xs text-emerald-700 font-bold">✓ Attached</span>
                      <button
                        type="button"
                        onClick={() => { setLightboxImg(adminPayModal.proofUrl); setZoomLevel(1); }}
                        className="text-xs text-blue-600 hover:text-blue-800 underline font-bold flex items-center gap-1 cursor-pointer"
                      >
                         View Slip
                      </button>
                      <button
                        type="button"
                        onClick={() => setAdminPayModal(prev => ({ ...prev, proofUrl: "" }))}
                        className="text-xs text-rose-500 hover:text-rose-700 font-black cursor-pointer ml-1"
                        title="Remove slip"
                      >
                        ✕
                      </button>
                    </div>
                  )}
                </div>
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
                <span className="text-xl"></span>
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
                <option value="">-- Direct Customer (No Agent / Platform Direct) --</option>
                {agents.map(a => {
                  const prof = a.agentProfile || {};
                  const isTeam = prof.commissionModel === "team_1";
                  const refInfo = a.referredBy ? ` (Sub of ${typeof a.referredBy === 'object' ? a.referredBy.name : 'Master'})` : "";
                  return (
                    <option key={a._id} value={a._id}>
                      {a.name} ({a.phone}) — {isTeam ? "Team Agent" : "Solo"}{refInfo}
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
                <span className="text-xl"></span>
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
                      <span className="text-xs">Pehli Installment NA lein</span>
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
                      <span className="text-xs">Advance Kaatein</span>
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
                      <span className="text-xs">Waive / Maaf Karein</span>
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

                {/* Option 4: Defer 1st installment (Baad me lein) */}
                <label className={`flex items-start gap-2.5 sm:gap-3 p-3 sm:p-3.5 rounded-2xl border-2 cursor-pointer transition ${
                  advanceOption === "defer"
                    ? "bg-purple-50/90 border-purple-500 ring-2 ring-purple-300 shadow-xs"
                    : "bg-white border-gray-200 hover:bg-gray-50"
                }`}>
                  <input
                    type="radio"
                    name="advanceOption"
                    value="defer"
                    checked={advanceOption === "defer"}
                    onChange={() => setAdvanceOption("defer")}
                    className="mt-1 text-purple-600 cursor-pointer accent-purple-600"
                  />
                  <div className="flex-1 min-w-0">
                    <div className="font-extrabold text-purple-950 flex items-center justify-between gap-1">
                      <span className="text-xs">⏳ 1st Kist Baad Me Lein</span>
                      <span className="text-[9px] sm:text-[10px] bg-purple-100 text-purple-800 border border-purple-200 px-1.5 sm:px-2 py-0.5 rounded-full font-black shrink-0 whitespace-nowrap">GRACE PERIOD</span>
                    </div>
                    <p className="text-[11px] text-gray-700 mt-1 font-medium">
                      Net Disburse: <strong className="text-purple-700 font-extrabold text-xs">₹{Math.max(0, loanApproveModal.amount - (loanApproveModal.processingFee || 0) - (loanApproveModal.upiCharges || 0)).toLocaleString("en-IN")}</strong>
                    </p>
                    <p className="text-[10px] text-purple-700 mt-0.5">
                      ✓ Pehli kist baad me li jayegi (extra grace period ke baad schedule shuru hoga).
                    </p>
                  </div>
                </label>
              </div>
            </div>

            {/* Custom First EMI Start Date Input */}
            <div className="bg-slate-50 border border-slate-200 rounded-xl p-3">
              <label className="block text-xs font-bold text-gray-800 mb-1">
                Pehli Kist Ki Date Set Karein (Optional First Due Date):
              </label>
              <input
                type="date"
                value={approveFirstDueDate}
                onChange={(e) => setApproveFirstDueDate(e.target.value)}
                className="w-full text-xs font-semibold px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500 bg-white"
              />
              <p className="text-[10px] text-gray-500 mt-1">
                Agar blank chhodenge toh default rule ke hisab se schedule set hoga.
              </p>
            </div>

            {/* Interactive 24/25 Kist Schedule & Dynamic Rollover Desk inside Approve Modal */}
            <DisbursalBreakdownDesk loan={loanApproveModal} chosenOpt={advanceOption} />

            {/* Loan Lene Wale Ke Wallet Me Payout Transfer Checkbox (Clear Hindi) */}
            <div className="pt-2 border-t border-blue-200/60">
              <label className="flex items-start gap-3 cursor-pointer text-xs font-bold text-gray-800 p-3 bg-blue-50/70 rounded-xl border border-blue-200 shadow-2xs">
                <input
                  type="checkbox"
                  checked={approveDisburseToWallet}
                  onChange={(e) => setApproveDisburseToWallet(e.target.checked)}
                  className="w-4 h-4 mt-0.5 text-blue-600 rounded cursor-pointer accent-blue-600 shrink-0"
                />
                <div className="space-y-1">
                  <span className="text-xs font-black text-gray-900 flex items-center gap-1.5">
                     Loan lene wale ke app wallet me paise transfer karein (Disburse)
                  </span>
                  <p className="text-[11px] text-gray-600 font-normal leading-relaxed">
                    • <strong>Naya Loan:</strong> Isse check (✓) rakhein taaki loan lene wale ke app wallet me paise credit hon.<br />
                    • <strong>Purana / Offline Loan:</strong> Isse khali (unchecked) rakhein, kyunki borrower ko paise pehle hi cash ya bahar diye ja chuke hain — taaki wallet me dobara paise na judein.
                  </p>
                </div>
              </label>
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
                  submitApproveLoan();
                }}
                className="flex-1 py-3 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-black shadow-md shadow-emerald-500/20 active:scale-95 transition cursor-pointer disabled:opacity-50 flex items-center justify-center gap-2"
              >
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

      {/* ══════════════════════════════════════════════════════
          ADMIN RESET USER PASSWORD MODAL
      ══════════════════════════════════════════════════════ */}
      {resetPasswordModalUser && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-md w-full p-5 sm:p-6 shadow-2xl border border-gray-100 animate-in fade-in zoom-in-95 duration-150 space-y-4">
            <div className="flex items-center justify-between border-b border-gray-100 pb-3">
              <div className="flex items-center gap-2">
                <span className="text-xl"></span>
                <div>
                  <h3 className="font-extrabold text-base text-gray-900 leading-tight">
                    Reset User Password
                  </h3>
                  <p className="text-[11px] text-gray-500 font-medium">
                    User: <strong className="text-gray-800">{resetPasswordModalUser.name}</strong> ({resetPasswordModalUser.phone || resetPasswordModalUser.email})
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => { setResetPasswordModalUser(null); setResetPasswordSuccessData(null); }}
                className="w-8 h-8 rounded-full bg-gray-100 hover:bg-gray-200 text-gray-600 flex items-center justify-center text-sm font-bold cursor-pointer"
              >
                ✕
              </button>
            </div>

            {resetPasswordSuccessData ? (
              <div className="space-y-3">
                <div className="p-4 bg-emerald-50 border border-emerald-200 rounded-2xl text-emerald-950 space-y-2">
                  <div className="flex items-center gap-2 font-black text-sm text-emerald-800">
                     Password Successfully Reset!
                  </div>
                  <p className="text-xs text-emerald-900 leading-relaxed">
                    Naya temporary password safaltapoorvak assign ho gaya hai.
                    {resetPasswordSuccessData.educaSynced ? " Educa Mail database (messagesdb.users) bhi update ho gaya hai!" : ""}
                  </p>
                  <div className="p-3 bg-white rounded-xl border border-emerald-300 font-mono text-center">
                    <span className="text-[10px] text-gray-400 font-bold uppercase block">Temporary Password</span>
                    <span className="text-xl font-black text-emerald-700 tracking-wider">
                      {resetPasswordSuccessData.tempPassword}
                    </span>
                  </div>
                </div>

                <div className="p-3 bg-gray-50 border border-gray-200 rounded-xl space-y-2 text-xs">
                  <div className="flex justify-between items-center">
                    <span className="font-bold text-gray-700">Quick Message to Share:</span>
                    <button
                      type="button"
                      onClick={() => {
                        const msg = `Namaste ${resetPasswordSuccessData.user.name},\n\nAapka Educa Fintech login password reset kar diya gaya hai:\n• Login ID: ${resetPasswordSuccessData.user.phone || resetPasswordSuccessData.user.email}\n• Temp Password: ${resetPasswordSuccessData.tempPassword}\n\nLogin karke apna naya personal password turant set karein.`;
                        navigator.clipboard?.writeText(msg);
                        showToast("Message copied to clipboard!", "success");
                      }}
                      className="px-2 py-1 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-[11px] font-bold cursor-pointer"
                    >
                      Copy Full Message
                    </button>
                  </div>
                  <pre className="p-2.5 bg-white border border-gray-200 rounded-lg text-[11px] font-mono text-gray-800 whitespace-pre-wrap">
{`Namaste ${resetPasswordSuccessData.user.name},
Aapka Educa Fintech login password reset kar diya gaya hai:
• Login ID: ${resetPasswordSuccessData.user.phone || resetPasswordSuccessData.user.email}
• Temp Password: ${resetPasswordSuccessData.tempPassword}
Login karke apna naya personal password turant set karein.`}
                  </pre>
                </div>

                <button
                  type="button"
                  onClick={() => { setResetPasswordModalUser(null); setResetPasswordSuccessData(null); }}
                  className="w-full py-2.5 bg-gray-900 hover:bg-black text-white rounded-xl font-bold text-xs cursor-pointer"
                >
                  Close
                </button>
              </div>
            ) : (
              <form onSubmit={(e) => { e.preventDefault(); handleAdminResetPassword(); }} className="space-y-4">
                <div className="p-3 bg-amber-50 border border-amber-200 rounded-2xl text-xs text-amber-900 space-y-1">
                  <p className="font-bold">Fintech + Educa Mail Dual Sync</p>
                  <p className="text-[11px] text-amber-800 leading-relaxed">
                    Aap user ko temporary password de sakte hain. User jab login karega to app use apna naya personal password banane ke liye prompt karega.
                  </p>
                </div>

                <div>
                  <div className="flex justify-between items-center mb-1">
                    <label className="block font-bold text-gray-700 text-xs">
                      Temporary Password *
                    </label>
                    <button
                      type="button"
                      onClick={() => setResetPasswordInput("Educa@" + Math.floor(1000 + Math.random() * 9000))}
                      className="text-[11px] font-bold text-blue-600 hover:underline cursor-pointer"
                    >
                      Generate Random
                    </button>
                  </div>
                  <input
                    type="text"
                    required
                    value={resetPasswordInput}
                    onChange={(e) => setResetPasswordInput(e.target.value)}
                    placeholder="Enter temporary password"
                    className="w-full p-2.5 bg-gray-50 border border-gray-200 rounded-xl text-xs font-mono font-bold text-gray-900 outline-none focus:ring-2 focus:ring-amber-500"
                  />
                </div>

                <div className="space-y-2 pt-1">
                  <label className="flex items-center gap-2 text-xs font-semibold text-gray-800 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={resetPasswordMustChange}
                      onChange={(e) => setResetPasswordMustChange(e.target.checked)}
                      className="w-4 h-4 rounded text-blue-600 cursor-pointer"
                    />
                    <span>Force user to change password on next login (Recommended)</span>
                  </label>
                  <label className="flex items-center gap-2 text-xs font-semibold text-gray-800 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={resetPasswordSyncEduca}
                      onChange={(e) => setResetPasswordSyncEduca(e.target.checked)}
                      className="w-4 h-4 rounded text-blue-600 cursor-pointer"
                    />
                    <span>Sync Educa Mail database (`messagesdb.users`)</span>
                  </label>
                </div>

                <div className="flex gap-2.5 pt-2 border-t border-gray-100">
                  <button
                    type="button"
                    onClick={() => setResetPasswordModalUser(null)}
                    className="flex-1 py-2.5 rounded-xl border border-gray-200 text-gray-700 hover:bg-gray-100 text-xs font-bold transition cursor-pointer"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={resetPasswordLoading || !resetPasswordInput.trim()}
                    className="flex-1 py-2.5 rounded-xl bg-amber-600 hover:bg-amber-700 text-white text-xs font-extrabold shadow-md active:scale-95 transition disabled:opacity-50 cursor-pointer flex items-center justify-center gap-1.5"
                  >
                    {resetPasswordLoading ? "Resetting..." : "Confirm Reset"}
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}

      {/* ASSIGN STAFF DESK ROLE MODAL */}
      {assignStaffModalUser && (
        <div className="fixed inset-0 z-50 bg-slate-950/80 flex items-center justify-center p-4" style={{ isolation: "isolate" }}>
          <div className="bg-white rounded-3xl max-w-lg w-full p-5 sm:p-6 shadow-2xl border border-gray-100 space-y-4 max-h-[90vh] overflow-y-auto">
            <div className="flex justify-between items-start border-b border-gray-100 pb-3">
              <div>
                <h3 className="text-base sm:text-lg font-black text-gray-900 flex items-center gap-2">
                   Assign Staff Desk Role
                </h3>
                <p className="text-xs text-gray-500 mt-0.5">
                  Choose which department this user will handle: <strong className="text-gray-800">{assignStaffModalUser.name}</strong>
                </p>
                <div className="mt-1 flex items-center gap-2 text-[11px] font-mono text-gray-500">
                  <span>{assignStaffModalUser.email}</span>
                  {assignStaffModalUser.phone && <span>• {assignStaffModalUser.phone}</span>}
                </div>
              </div>
              <button
                type="button"
                onClick={() => setAssignStaffModalUser(null)}
                className="w-8 h-8 rounded-full bg-gray-100 hover:bg-gray-200 text-gray-500 flex items-center justify-center font-bold text-sm cursor-pointer"
              >
                ✕
              </button>
            </div>

            <div className="p-3 bg-purple-50 border border-purple-200 rounded-2xl text-xs text-purple-950 space-y-1">
              <p className="font-bold">&ldquo;Tum Yeh Wale Ho&rdquo; Multi-Role Assignment</p>
              <p className="text-[11px] text-purple-900 leading-relaxed">
                Aap ek user ko multiple desks bhi de sakte hain (jaise Loan + KYC). Staff user login karte hi apne sabhi assigned desks par access kar sakega.
              </p>
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between gap-2 flex-wrap">
                <label className="block text-xs font-bold text-gray-700">
                  Select Desks / Roles (Multiple Allowed):
                </label>
                <div className="flex items-center gap-1.5 flex-wrap">
                  <button
                    type="button"
                    onClick={() => setAssignStaffDepts(["loan", "kyc", "deposit", "withdrawal", "lending", "bond"])}
                    className="px-2 py-0.5 bg-purple-100 hover:bg-purple-200 text-purple-800 rounded text-[10px] font-bold cursor-pointer"
                  >
                    All Desks
                  </button>
                  <button
                    type="button"
                    onClick={() => setAssignStaffDepts(["loan", "kyc"])}
                    className="px-2 py-0.5 bg-blue-100 hover:bg-blue-200 text-blue-800 rounded text-[10px] font-bold cursor-pointer"
                  >
                    Loan + 🪪 KYC
                  </button>
                  <button
                    type="button"
                    onClick={() => setAssignStaffDepts(["deposit", "withdrawal"])}
                    className="px-2 py-0.5 bg-amber-100 hover:bg-amber-200 text-amber-900 rounded text-[10px] font-bold cursor-pointer"
                  >
                    Cashier
                  </button>
                  <button
                    type="button"
                    onClick={() => setAssignStaffDepts([])}
                    className="px-2 py-0.5 bg-rose-100 hover:bg-rose-200 text-rose-800 rounded text-[10px] font-bold cursor-pointer"
                  >
                    Remove Role (Customer)
                  </button>
                </div>
              </div>

              <div className="space-y-2 max-h-[320px] overflow-y-auto pr-1">
                {[
                  { id: "loan", label: "Loan Desk (Tum Loan wale ho)", sub: "Loans review, approve/reject & disbursal" },
                  { id: "kyc", label: "🪪 KYC Desk (Tum KYC wale ho)", sub: "Aadhaar & PAN verification & approval" },
                  { id: "deposit", label: "Deposit Desk (Tum Deposit wale ho)", sub: "Bank UTR transfers verify & credit" },
                  { id: "withdrawal", label: "Withdrawal Desk (Tum Withdrawal wale ho)", sub: "Customer payouts & bank cash-outs" },
                  { id: "lending", label: "Lending Desk", sub: "Borrower & lender requests" },
                  { id: "bond", label: "Bonds & FD Desk", sub: "Fixed yield bonds & applications" }
                ].map((item) => {
                  const isChecked = assignStaffDepts.includes(item.id);
                  return (
                    <div
                      key={item.id}
                      onClick={() => toggleAssignStaffDept(item.id)}
                      className={`p-3 rounded-2xl border cursor-pointer select-none transition flex items-start gap-3 active:scale-[0.99] ${
                        isChecked
                          ? "bg-purple-50/90 border-purple-500 ring-2 ring-purple-400/50 shadow-xs"
                          : "bg-white border-gray-200 hover:border-purple-300 hover:bg-gray-50/60"
                      }`}
                    >
                      <input
                        type="checkbox"
                        checked={isChecked}
                        readOnly
                        tabIndex={-1}
                        className="mt-0.5 w-4 h-4 rounded text-purple-600 focus:ring-purple-500 pointer-events-none"
                      />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between gap-2">
                          <p className="text-xs font-black text-gray-900">{item.label}</p>
                          <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${
                            isChecked ? "bg-purple-100 text-purple-800 font-black" : "bg-gray-100 text-gray-500"
                          }`}>
                            {isChecked ? "SELECTED" : "OFF"}
                          </span>
                        </div>
                        <p className="text-[11px] text-gray-500 mt-0.5 leading-snug">{item.sub}</p>
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Summary */}
              <div className="p-2.5 bg-gray-50 border border-gray-200 rounded-xl flex items-center justify-between text-xs">
                <span className="text-gray-500 font-semibold">
                  Selected Desks ({assignStaffDepts.length}):
                </span>
                <span className="font-bold text-purple-800 truncate max-w-[280px]">
                  {assignStaffDepts.length === 0
                    ? "Normal Customer (Staff Role Removed)"
                    : assignStaffDepts.join(" + ").toUpperCase()}
                </span>
              </div>
            </div>

            <div className="flex gap-2.5 pt-3 border-t border-gray-100">
              <button
                type="button"
                onClick={() => setAssignStaffModalUser(null)}
                className="flex-1 py-2.5 rounded-xl border border-gray-200 text-gray-700 hover:bg-gray-100 text-xs font-bold transition cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleAssignStaffRole}
                disabled={assignStaffLoading}
                className="flex-1 py-2.5 rounded-xl bg-purple-700 hover:bg-purple-800 text-white text-xs font-extrabold shadow-md active:scale-95 transition disabled:opacity-50 cursor-pointer flex items-center justify-center gap-1.5"
              >
                {assignStaffLoading
                  ? "Updating..."
                  : assignStaffDepts.length === 0
                  ? "Make Normal Customer"
                  : "Confirm Desk Assignment"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* FULLSCREEN LIGHTBOX WITH INTERACTIVE ZOOM & PAN (PLACED AT ROOT BOTTOM TO ALWAYS BE ON TOP OF ALL MODALS) */}
      {lightboxImg && (
        <div
          className="fixed inset-0 z-[9999999] bg-black/95 backdrop-blur-md flex flex-col justify-between p-3 sm:p-4 select-none animate-in fade-in duration-150"
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
            Tap image to zoom in • Double tap to toggle 2x • Pinch / Use + buttons
          </div>
        </div>
      )}

      <Toast msg={toast} onHide={() => setToast({ text: "", type: "" })} />
    </div>
  );
}
