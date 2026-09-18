import { useState, useEffect, useCallback } from "react";
import Sheet from "./components/Sheet";
import Toast from "./components/Toast";
import StatusBadge from "./components/StatusBadge";
import BottomNav from "./components/BottomNav";

const API = import.meta.env.VITE_API_URL || "http://localhost:5000/api";

export default function Dashboard() {
  const token = localStorage.getItem("token");
  const userStored = JSON.parse(localStorage.getItem("user") || "{}");
  useEffect(() => { if (!token) window.location.href = "/"; }, [token]);

  const headers = { "Content-Type": "application/json", Authorization: `Bearer ${token}` };
  const [balance, setBalance] = useState(0);
  const [txns, setTxns] = useState([]);
  const [loans, setLoans] = useState([]);
  const [showLoans, setShowLoans] = useState(false);
  const [toast, setToast] = useState({ text: "", type: "" });
  const [modal, setModal] = useState(null);
  const [currentRate, setCurrentRate] = useState(12);
  const [referralCode, setReferralCode] = useState(userStored.referralCode || "");
  const [referralEarnings, setReferralEarnings] = useState(0);
  const [copied, setCopied] = useState(false);
  const [navTab, setNavTab] = useState("home");
  const [userProfile, setUserProfile] = useState({});
  const [cardTab, setCardTab] = useState("silver");
  const [activatingWallet, setActivatingWallet] = useState("");
  const [claimingCard, setClaimingCard] = useState(false);

  const [depForm, setDepForm] = useState({ amount: "", method: "upi", utrNumber: "" });
  const [wdForm, setWdForm] = useState({ amount: "", method: "upi", upiId: "", accountNumber: "", ifsc: "" });
  const [loanForm, setLoanForm] = useState({ amount: "", tenure: "", purpose: "" });
  const [emi, setEmi] = useState(0);

  const showToast = (text, type = "success") => setToast({ text, type });
  const closeModal = () => setModal(null);

  const loadDashboard = useCallback(async () => {
    try {
      const res = await fetch(`${API}/user/me`, { headers });
      const data = await res.json();
      setUserProfile(data);
      setBalance(data.balance || 0);
      if (data.interestRate) setCurrentRate(data.interestRate);
      setReferralCode(data.referralCode || "");
      setReferralEarnings(data.referralEarnings || 0);
      if (data.cardTier === "platinum" || data.cardStatus?.platinum?.unlocked) {
        setCardTab("platinum");
      }
      loadTransactions();
    } catch {}
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const activateWallet = async (walletType) => {
    setActivatingWallet(walletType);
    try {
      const res = await fetch(`${API}/user/wallet/activate`, {
        method: "POST",
        headers,
        body: JSON.stringify({ walletType })
      });
      const data = await res.json();
      if (res.ok) {
        showToast(data.message || `${walletType.toUpperCase()} Wallet activated!`, "success");
        loadDashboard();
      } else {
        showToast(data.message || "Failed to activate wallet", "error");
      }
    } catch {
      showToast("Network error activating wallet", "error");
    } finally {
      setActivatingWallet("");
    }
  };

  const claimPlatinumCard = async () => {
    setClaimingCard(true);
    try {
      const res = await fetch(`${API}/user/card/claim-platinum`, {
        method: "POST",
        headers
      });
      const data = await res.json();
      if (res.ok) {
        showToast(data.message || "🎉 Platinum VIP Card Unlocked!", "success");
        setCardTab("platinum");
        loadDashboard();
      } else {
        showToast(data.message || "Cannot unlock Platinum Card yet", "error");
      }
    } catch {
      showToast("Network error unlocking card", "error");
    } finally {
      setClaimingCard(false);
    }
  };

  const loadTransactions = async () => {
    try {
      const res = await fetch(`${API}/transaction/my`, { headers });
      const data = await res.json();
      setTxns(Array.isArray(data) ? data : []);
    } catch {}
  };

  const loadLoans = async () => {
    try {
      const res = await fetch(`${API}/loan/my`, { headers });
      const data = await res.json();
      setLoans(Array.isArray(data) ? data : []);
      setShowLoans(true);
      setNavTab("loans");
    } catch {}
  };

  const loadCurrentRate = async () => {
    try {
      const res = await fetch(`${API}/loan/current-rate`);
      const data = await res.json();
      setCurrentRate(data.interestRate || 12);
    } catch {}
  };

  useEffect(() => { loadDashboard(); loadCurrentRate(); }, [loadDashboard]);

  useEffect(() => {
    const p = +loanForm.amount, n = +loanForm.tenure;
    if (p && n) {
      const r = currentRate / 12 / 100;
      setEmi(Math.round((p * r * Math.pow(1 + r, n)) / (Math.pow(1 + r, n) - 1)));
    } else setEmi(0);
  }, [loanForm.amount, loanForm.tenure, currentRate]);

  const copyReferralCode = () => {
    navigator.clipboard.writeText(referralCode);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const submitDeposit = async () => {
    if (!depForm.amount || !depForm.utrNumber) return showToast("Fill all fields", "error");
    const res = await fetch(`${API}/transaction/deposit`, { method: "POST", headers, body: JSON.stringify({ amount: +depForm.amount, method: depForm.method, utrNumber: depForm.utrNumber }) });
    const data = await res.json();
    showToast(data.message, res.ok ? "success" : "error");
    if (res.ok) { closeModal(); setDepForm({ amount: "", method: "upi", utrNumber: "" }); loadDashboard(); }
  };

  const submitWithdraw = async () => {
    if (!wdForm.amount) return showToast("Enter amount", "error");
    const paymentDetails = wdForm.method === "upi" ? { upiId: wdForm.upiId } : { accountNumber: wdForm.accountNumber, ifsc: wdForm.ifsc };
    const res = await fetch(`${API}/transaction/withdraw`, { method: "POST", headers, body: JSON.stringify({ amount: +wdForm.amount, method: wdForm.method, paymentDetails }) });
    const data = await res.json();
    showToast(data.message, res.ok ? "success" : "error");
    if (res.ok) { closeModal(); setWdForm({ amount: "", method: "upi", upiId: "", accountNumber: "", ifsc: "" }); loadDashboard(); }
  };

  const submitLoan = async () => {
    if (!loanForm.amount || !loanForm.tenure) return showToast("Fill all fields", "error");
    const res = await fetch(`${API}/loan/apply`, { method: "POST", headers, body: JSON.stringify({ amount: +loanForm.amount, tenure: +loanForm.tenure, purpose: loanForm.purpose }) });
    const data = await res.json();
    showToast(data.message, res.ok ? "success" : "error");
    if (res.ok) { closeModal(); setLoanForm({ amount: "", tenure: "", purpose: "" }); }
  };

  const payEMI = async (id, emiAmount) => {
    if (!window.confirm(`Pay EMI of ₹${emiAmount}?`)) return;
    const res = await fetch(`${API}/loan/${id}/pay-emi`, { method: "POST", headers });
    const data = await res.json();
    showToast(data.message, res.ok ? "success" : "error");
    if (res.ok) { loadLoans(); loadDashboard(); }
  };

  const logout = () => { localStorage.clear(); window.location.href = "/"; };

  const quickActions = [
    { icon: "💸", label: "Deposit", sub: "Add funds", color: "bg-green-100", action: () => setModal("deposit") },
    { icon: "💰", label: "Withdraw", sub: "Cash out", color: "bg-red-100", action: () => setModal("withdraw") },
    { icon: "🏦", label: "Apply Loan", sub: `@ ${currentRate}% p.a.`, color: "bg-blue-100", action: () => setModal("loan") },
    { icon: "📋", label: "My Loans", sub: "View EMI", color: "bg-purple-100", action: loadLoans },
  ];

  const navItems = [
    { key: "home", label: "Home", icon: "🏠", onClick: () => { setShowLoans(false); window.scrollTo({ top: 0, behavior: "smooth" }); } },
    { key: "loans", label: "Loans", icon: "🏦", onClick: loadLoans },
    { key: "add", label: "Add Money", icon: "➕", onClick: () => setModal("deposit") },
    { key: "profile", label: "Profile", icon: "👤", onClick: () => setModal("profile") },
  ];

  return (
    <div className="bg-gray-50 min-h-[100dvh] pb-safe-nav sm:pb-0">
      <nav className="bg-white shadow-sm sticky top-0 z-30 border-b border-gray-100 safe-top">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-3.5 sm:py-4 flex justify-between items-center">
          <div className="flex items-center gap-2">
            <span className="text-2xl">🎓</span>
            <h1 className="text-lg sm:text-xl font-black font-display bg-gradient-to-r from-blue-600 to-cyan-600 bg-clip-text text-transparent">Educa Finance</h1>
          </div>
          <div className="flex items-center gap-3 sm:gap-4">
            <div className="text-right hidden sm:block">
              <p className="text-xs text-gray-400">Welcome back</p>
              <p className="font-bold text-sm text-gray-800">{userStored.name || "User"}</p>
            </div>
            <div className="w-9 h-9 bg-gradient-to-br from-blue-500 to-cyan-500 text-white rounded-full flex items-center justify-center font-bold text-sm shrink-0">
              {(userStored.name || "U")[0].toUpperCase()}
            </div>
            <button onClick={logout} className="hidden sm:inline-block px-3 py-1.5 bg-red-50 text-red-600 rounded-lg hover:bg-red-100 transition font-semibold text-xs">Logout</button>
          </div>
        </div>
      </nav>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-5 sm:py-8">

        {/* Balance Card */}
        <div className="bg-gradient-to-br from-blue-600 via-blue-700 to-cyan-500 rounded-3xl p-6 sm:p-8 text-white shadow-2xl mb-6 sm:mb-8 relative overflow-hidden">
          <div className="absolute top-0 right-0 w-64 h-64 bg-white/10 rounded-full -mr-32 -mt-32" />
          <div className="absolute bottom-0 left-0 w-48 h-48 bg-white/10 rounded-full -ml-24 -mb-24" />
          <div className="relative z-10">
            <p className="text-white/70 text-sm mb-1">Total Balance</p>
            <h2 className="text-4xl sm:text-5xl font-black font-display mb-5">₹{balance.toLocaleString("en-IN")}</h2>
            <div className="flex gap-3 flex-wrap">
              <button onClick={() => setModal("deposit")} className="flex-1 sm:flex-none px-5 py-2.5 bg-white text-blue-600 rounded-xl font-bold text-sm hover:shadow-lg active:scale-95 transition-all">+ Add Money</button>
              <button onClick={() => setModal("withdraw")} className="flex-1 sm:flex-none px-5 py-2.5 bg-white/20 backdrop-blur text-white border border-white/30 rounded-xl font-bold text-sm hover:bg-white/30 active:scale-95 transition-all">↓ Withdraw</button>
            </div>
          </div>
        </div>

        {/* ══════════════════════════════════════════════════════
            1. WALLETS & SERVICES HUB (SAVINGS, DEBIT, LENDING)
        ══════════════════════════════════════════════════════ */}
        <div className="bg-white rounded-3xl p-5 sm:p-7 shadow-sm border border-gray-100 mb-6 sm:mb-8">
          <div className="flex justify-between items-center mb-4 sm:mb-5">
            <div>
              <h3 className="text-base sm:text-lg font-black text-gray-900 flex items-center gap-2">
                <span>💼</span> Wallets & Financial Services
              </h3>
              <p className="text-xs text-gray-500">Apne zaroorat ke mutabiq wallets active aur manage karein</p>
            </div>
            <span className="hidden sm:inline-block px-3 py-1 bg-blue-50 text-[#1D6AE5] rounded-full text-xs font-bold">
              3 Wallets Available
            </span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-3.5 sm:gap-4">
            {/* 1. SAVINGS WALLET */}
            <div className="p-4 sm:p-5 rounded-2xl border-2 border-emerald-500/30 bg-emerald-50/20 relative overflow-hidden">
              <div className="flex justify-between items-start mb-3">
                <div className="w-10 h-10 rounded-xl bg-emerald-100 text-emerald-700 flex items-center justify-center text-xl">
                  🏦
                </div>
                <span className="px-2.5 py-0.5 rounded-full text-[11px] font-black bg-emerald-100 text-emerald-800 flex items-center gap-1">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                  Active
                </span>
              </div>
              <h4 className="font-extrabold text-sm sm:text-base text-gray-900">Savings Wallet</h4>
              <p className="text-xs text-gray-500 mt-0.5 mb-3 leading-relaxed">
                Flat <strong className="text-emerald-700 font-bold">{userProfile.interestRate || currentRate}% Annual Interest</strong> daily credit ke sath aur 24x7 withdrawal.
              </p>
              <div className="pt-2.5 border-t border-emerald-100 flex items-center justify-between text-xs">
                <span className="text-gray-400">Yield</span>
                <span className="font-bold text-emerald-700">{userProfile.interestRate || currentRate}% APY Daily</span>
              </div>
            </div>

            {/* 2. DEBIT WALLET */}
            <div className={`p-4 sm:p-5 rounded-2xl border-2 transition-all ${
              userProfile.wallets?.debit?.active
                ? "border-blue-500/30 bg-blue-50/20"
                : "border-gray-200 bg-gray-50/50"
            }`}>
              <div className="flex justify-between items-start mb-3">
                <div className="w-10 h-10 rounded-xl bg-blue-100 text-blue-700 flex items-center justify-center text-xl">
                  💳
                </div>
                {userProfile.wallets?.debit?.active ? (
                  <span className="px-2.5 py-0.5 rounded-full text-[11px] font-black bg-blue-100 text-blue-800 flex items-center gap-1">
                    <span className="w-1.5 h-1.5 rounded-full bg-blue-500" />
                    Active
                  </span>
                ) : (
                  <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-gray-200 text-gray-600">
                    Not Created
                  </span>
                )}
              </div>
              <h4 className="font-extrabold text-sm sm:text-base text-gray-900">Debit & Pay Wallet</h4>
              <p className="text-xs text-gray-500 mt-0.5 mb-3 leading-relaxed">
                Daily spends, <strong>₹199 mobile recharge</strong>, UPI payments aur instant checkout ke liye.
              </p>
              <div className="pt-2.5 border-t border-gray-100 flex items-center justify-between text-xs">
                {userProfile.wallets?.debit?.active ? (
                  <>
                    <span className="text-gray-400">Status</span>
                    <span className="font-bold text-blue-600">Ready for UPI</span>
                  </>
                ) : (
                  <button
                    onClick={() => activateWallet("debit")}
                    disabled={activatingWallet === "debit"}
                    className="w-full py-2 rounded-xl bg-blue-600 hover:bg-blue-700 active:scale-95 text-white font-bold text-xs transition shadow-sm"
                  >
                    {activatingWallet === "debit" ? "Activating..." : "⚡ Activate Debit Wallet"}
                  </button>
                )}
              </div>
            </div>

            {/* 3. LENDING WALLET */}
            <div className={`p-4 sm:p-5 rounded-2xl border-2 transition-all ${
              userProfile.wallets?.lending?.active
                ? "border-purple-500/30 bg-purple-50/20"
                : "border-gray-200 bg-gray-50/50"
            }`}>
              <div className="flex justify-between items-start mb-3">
                <div className="w-10 h-10 rounded-xl bg-purple-100 text-purple-700 flex items-center justify-center text-xl">
                  🤝
                </div>
                {userProfile.wallets?.lending?.active ? (
                  <span className="px-2.5 py-0.5 rounded-full text-[11px] font-black bg-purple-100 text-purple-800 flex items-center gap-1">
                    <span className="w-1.5 h-1.5 rounded-full bg-purple-500" />
                    Active
                  </span>
                ) : (
                  <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-gray-200 text-gray-600">
                    Not Created
                  </span>
                )}
              </div>
              <h4 className="font-extrabold text-sm sm:text-base text-gray-900">Lending & Credit Wallet</h4>
              <p className="text-xs text-gray-500 mt-0.5 mb-3 leading-relaxed">
                Micro loan se leke <strong>Bike loan (₹1.5L)</strong> aur <strong>School fees EMI</strong> credit line.
              </p>
              <div className="pt-2.5 border-t border-gray-100 flex items-center justify-between text-xs">
                {userProfile.wallets?.lending?.active ? (
                  <>
                    <span className="text-gray-400">Limit</span>
                    <span className="font-bold text-purple-600">Up to ₹1,50,000</span>
                  </>
                ) : (
                  <button
                    onClick={() => activateWallet("lending")}
                    disabled={activatingWallet === "lending"}
                    className="w-full py-2 rounded-xl bg-purple-600 hover:bg-purple-700 active:scale-95 text-white font-bold text-xs transition shadow-sm"
                  >
                    {activatingWallet === "lending" ? "Activating..." : "⚡ Activate Lending Wallet"}
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* ══════════════════════════════════════════════════════
            2. VIRTUAL CARDS HUB (SILVER & PLATINUM VIP CARDS)
        ══════════════════════════════════════════════════════ */}
        <div className="bg-white rounded-3xl p-5 sm:p-7 shadow-sm border border-gray-100 mb-6 sm:mb-8">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-5">
            <div>
              <h3 className="text-base sm:text-lg font-black text-gray-900 flex items-center gap-2">
                <span>💳</span> Educa Digital Cards
              </h3>
              <p className="text-xs text-gray-500">
                Silver (Standard) & Platinum (VIP) virtual debit & credit cards
              </p>
            </div>

            {/* CARD SELECTOR TABS */}
            <div className="flex items-center gap-1.5 p-1 bg-gray-100 rounded-xl self-start sm:self-auto">
              <button
                onClick={() => setCardTab("silver")}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition ${
                  cardTab === "silver"
                    ? "bg-white text-gray-900 shadow-sm"
                    : "text-gray-500 hover:text-gray-800"
                }`}
              >
                🥈 Silver Card
              </button>
              <button
                onClick={() => setCardTab("platinum")}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition flex items-center gap-1 ${
                  cardTab === "platinum"
                    ? "bg-gradient-to-r from-amber-500 to-yellow-500 text-white shadow-sm"
                    : "text-gray-500 hover:text-gray-800"
                }`}
              >
                <span>👑</span> Platinum VIP
                {userProfile.cardTier !== "platinum" && !userProfile.cardStatus?.platinum?.unlocked && (
                  <span className="text-[10px]">🔒</span>
                )}
              </button>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-center">
            {/* CARD VISUAL PREVIEW */}
            <div className="lg:col-span-6 flex justify-center">
              {cardTab === "silver" ? (
                /* SILVER CARD */
                <div className="w-full max-w-[340px] sm:max-w-[380px] h-[215px] sm:h-[235px] rounded-3xl p-5 sm:p-6 text-gray-800 flex flex-col justify-between relative overflow-hidden shadow-xl border border-slate-300 bg-gradient-to-tr from-slate-200 via-gray-300 to-zinc-300">
                  <div className="flex justify-between items-start">
                    <div>
                      <span className="text-[10px] font-black uppercase tracking-widest text-gray-600 block">
                        EDUCA FINTECH
                      </span>
                      <span className="text-xs font-extrabold text-gray-800">
                        Silver Member Card
                      </span>
                    </div>
                    <span className="text-xs font-black px-2 py-0.5 rounded-full bg-gray-800 text-white shadow-xs">
                      SILVER
                    </span>
                  </div>

                  {/* EMV CHIP & CONTACTLESS */}
                  <div className="flex items-center gap-3 my-auto">
                    <div className="w-10 h-7 rounded-md bg-gradient-to-tr from-amber-200 via-amber-300 to-yellow-400 border border-amber-500/40 shadow-xs flex items-center justify-center">
                      <div className="w-7 h-4 border border-amber-600/30 rounded-xs" />
                    </div>
                    <span className="text-gray-600 font-mono text-xs">📡 Contactless</span>
                  </div>

                  {/* CARD NUMBER & FOOTER */}
                  <div>
                    <p className="font-mono text-base sm:text-lg font-bold tracking-widest text-gray-900 mb-2">
                      {userProfile.cardStatus?.silver?.cardNumber || "4532 9840 2199 1200"}
                    </p>
                    <div className="flex justify-between items-center text-[10px] text-gray-600 uppercase font-semibold">
                      <span>CARDHOLDER: {userStored.name || "USER"}</span>
                      <span>VALID: PERPETUAL</span>
                    </div>
                  </div>
                </div>
              ) : (
                /* PLATINUM CARD */
                <div className="w-full max-w-[340px] sm:max-w-[380px] h-[215px] sm:h-[235px] rounded-3xl p-5 sm:p-6 text-white flex flex-col justify-between relative overflow-hidden shadow-2xl border border-amber-400/40 bg-gradient-to-tr from-zinc-950 via-slate-900 to-amber-950">
                  {/* METALLIC SHEEN */}
                  <div className="absolute top-0 right-0 w-48 h-48 bg-gradient-to-br from-amber-400/15 via-transparent to-transparent rounded-full pointer-events-none" />

                  <div className="flex justify-between items-start relative z-10">
                    <div>
                      <span className="text-[10px] font-black uppercase tracking-widest text-amber-400 block">
                        EDUCA FINTECH • VIP
                      </span>
                      <span className="text-xs font-extrabold text-white">
                        Platinum Prestige Card
                      </span>
                    </div>
                    <span className="text-xs font-black px-2.5 py-0.5 rounded-full bg-gradient-to-r from-amber-400 to-yellow-500 text-black shadow-sm flex items-center gap-1">
                      <span>👑</span> PLATINUM
                    </span>
                  </div>

                  {/* EMV CHIP & CONTACTLESS */}
                  <div className="flex items-center gap-3 my-auto relative z-10">
                    <div className="w-10 h-7 rounded-md bg-gradient-to-tr from-yellow-300 via-amber-400 to-yellow-500 border border-amber-200 shadow-md flex items-center justify-center">
                      <div className="w-7 h-4 border border-amber-700/40 rounded-xs" />
                    </div>
                    <span className="text-amber-300/80 font-mono text-xs">✨ Premium VIP Tier</span>
                  </div>

                  {/* CARD NUMBER & FOOTER */}
                  <div className="relative z-10">
                    <p className="font-mono text-base sm:text-lg font-bold tracking-widest text-amber-100 mb-2">
                      {userProfile.cardStatus?.platinum?.cardNumber || "5421 7840 4492 8840"}
                    </p>
                    <div className="flex justify-between items-center text-[10px] text-gray-300 uppercase font-semibold">
                      <span>CARDHOLDER: {userStored.name || "USER"}</span>
                      <span className="text-amber-300">CUSTOM APY: {userProfile.interestRate || currentRate}%</span>
                    </div>
                  </div>

                  {/* LOCKED OVERLAY IF NOT QUALIFIED */}
                  {!(userProfile.cardTier === "platinum" || userProfile.cardStatus?.platinum?.unlocked) && (
                    <div className="absolute inset-0 bg-black/80 backdrop-blur-xs rounded-3xl p-5 flex flex-col items-center justify-center text-center z-20">
                      <span className="text-3xl mb-1">🔒</span>
                      <h4 className="font-black text-sm text-white">Platinum VIP Card Locked</h4>
                      <p className="text-[11px] text-gray-300 mt-1 max-w-[260px]">
                        Is card ko unlock karne ke liye kam se kam <strong>4 loans</strong> lene honge ya Admin approval zaroori hai.
                      </p>
                      <div className="w-44 bg-white/20 rounded-full h-2 my-2 overflow-hidden">
                        <div
                          className="bg-gradient-to-r from-amber-400 to-yellow-400 h-full rounded-full transition-all"
                          style={{ width: `${Math.min(100, ((userProfile.loansCount || 0) / 4) * 100)}%` }}
                        />
                      </div>
                      <span className="text-[10px] font-bold text-amber-300">
                        {userProfile.loansCount || 0} / 4 Loans Taken
                      </span>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* CARD DETAILS & UNLOCK ACTIONS */}
            <div className="lg:col-span-6 space-y-3">
              {cardTab === "silver" ? (
                <div>
                  <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-emerald-50 text-emerald-700 text-xs font-bold mb-2">
                    <span>✓</span> Unlocked for All Active Users
                  </div>
                  <h4 className="font-extrabold text-base text-gray-900">Silver Card Privileges</h4>
                  <ul className="text-xs text-gray-600 space-y-1.5 mt-2">
                    <li className="flex items-center gap-2"><span>•</span> Standard Micro loans up to ₹25,000</li>
                    <li className="flex items-center gap-2"><span>•</span> Flat {userProfile.interestRate || currentRate}% annual interest on savings account</li>
                    <li className="flex items-center gap-2"><span>•</span> 24x7 instant UPI payments & ₹199 mobile recharge</li>
                  </ul>
                </div>
              ) : (
                <div>
                  {userProfile.cardTier === "platinum" || userProfile.cardStatus?.platinum?.unlocked ? (
                    <div className="p-4 rounded-2xl bg-amber-50 border border-amber-200">
                      <div className="flex items-center gap-2 text-amber-900 font-extrabold text-sm mb-1">
                        <span>👑</span> Congratulations! You are a Platinum VIP Member
                      </div>
                      <p className="text-xs text-amber-800 leading-relaxed">
                        Aapka customized interest rate <strong>{userProfile.interestRate || currentRate}% p.a.</strong> active hai aur maximum loan limit ₹1,50,000 tak unlock ho chuki hai.
                      </p>
                    </div>
                  ) : (
                    <div>
                      <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-yellow-100 text-amber-800 text-xs font-bold mb-2">
                        <span>⭐</span> VIP Elite Tier
                      </div>
                      <h4 className="font-extrabold text-base text-gray-900">Platinum Card Kaise Unlock Hoga?</h4>
                      <p className="text-xs text-gray-600 mt-1 mb-3">
                        Duniya ka sabse premium card unhi ko milta hai jo Educa par active borrower hain:
                      </p>
                      <div className="bg-gray-50 p-3 rounded-xl border border-gray-200 space-y-1.5 text-xs text-gray-700 mb-3">
                        <div className="flex justify-between items-center">
                          <span>Milestone: 4 Loans Taken</span>
                          <span className="font-black text-[#1D6AE5]">{userProfile.loansCount || 0}/4</span>
                        </div>
                        <div className="w-full bg-gray-200 rounded-full h-1.5">
                          <div
                            className="bg-[#1D6AE5] h-1.5 rounded-full transition-all"
                            style={{ width: `${Math.min(100, ((userProfile.loansCount || 0) / 4) * 100)}%` }}
                          />
                        </div>
                        <p className="text-[11px] text-gray-500">
                          {userProfile.loansCount >= 4
                            ? "Aapne 4 loans complete kar liye hain! Niche claim button pe click karein."
                            : `Sirf ${4 - (userProfile.loansCount || 0)} aur loans lene par auto-claimable hoga ya Admin instantly unlock kar sakta hai.`}
                        </p>
                      </div>

                      {userProfile.loansCount >= 4 ? (
                        <button
                          onClick={claimPlatinumCard}
                          disabled={claimingCard}
                          className="w-full py-3 rounded-xl bg-gradient-to-r from-amber-500 to-yellow-500 hover:from-amber-600 hover:to-yellow-600 text-white font-extrabold text-xs sm:text-sm shadow-md active:scale-95 transition"
                        >
                          {claimingCard ? "Claiming VIP Card..." : "🎉 Claim Platinum VIP Card Now"}
                        </button>
                      ) : (
                        <button
                          onClick={() => setModal("loan")}
                          className="w-full py-2.5 rounded-xl bg-[#1D6AE5] hover:bg-[#1558cc] text-white font-bold text-xs shadow-sm active:scale-95 transition"
                        >
                          Apply Loan to Advance Milestone →
                        </button>
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
        {referralCode && (
          <div className="bg-gradient-to-r from-orange-500 to-yellow-500 rounded-2xl p-5 text-white shadow-lg mb-6 sm:mb-8">
            <div className="flex justify-between items-start flex-wrap gap-4">
              <div>
                <p className="text-white/80 text-sm font-semibold mb-1">🎯 Tumhara Referral Code</p>
                <div className="flex items-center gap-3 flex-wrap">
                  <span className="text-xl sm:text-2xl font-black font-mono tracking-wider">{referralCode}</span>
                  <button onClick={copyReferralCode} className="px-3 py-1.5 bg-white/20 hover:bg-white/30 active:bg-white/40 rounded-lg text-xs font-bold transition border border-white/30">
                    {copied ? "✅ Copied!" : "📋 Copy"}
                  </button>
                </div>
                <p className="text-white/70 text-xs mt-1">Yeh code share karo — jab unka loan approve ho, tumhe commission milega!</p>
              </div>
              {referralEarnings > 0 && (
                <div className="bg-white/20 rounded-xl px-4 py-3 text-center">
                  <p className="text-white/70 text-xs">Total Earned</p>
                  <p className="text-xl sm:text-2xl font-black">₹{referralEarnings.toLocaleString("en-IN")}</p>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Quick Actions */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 sm:gap-4 mb-6 sm:mb-8">
          {quickActions.map(({ icon, label, sub, color, action }) => (
            <div key={label} onClick={action} className="bg-white p-4 sm:p-5 rounded-2xl shadow-sm hover:shadow-xl active:scale-[0.98] cursor-pointer transition-all sm:hover:-translate-y-1 border border-gray-100">
              <div className={`w-11 h-11 sm:w-12 sm:h-12 ${color} rounded-xl flex items-center justify-center text-xl sm:text-2xl mb-2.5 sm:mb-3`}>{icon}</div>
              <h3 className="font-bold text-sm text-gray-800">{label}</h3>
              <p className="text-xs text-gray-400 mt-0.5">{sub}</p>
            </div>
          ))}
        </div>

        {/* Loans Section */}
        {showLoans && (
          <div className="bg-white rounded-2xl shadow-sm p-5 sm:p-6 mb-6 sm:mb-8 border border-gray-100">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-lg font-bold font-display">My Loans</h3>
              <button onClick={() => setShowLoans(false)} className="text-xs text-gray-400 hover:text-gray-600">Hide</button>
            </div>
            {loans.length === 0 ? <p className="text-gray-400 text-center py-8 text-sm">No loans yet</p> : (
              <div className="space-y-4">
                {loans.map(l => {
                  const progress = l.totalPayable ? (l.paidAmount / l.totalPayable) * 100 : 0;
                  return (
                    <div key={l._id} className="border border-gray-200 rounded-2xl p-4 sm:p-5 hover:shadow-md transition">
                      <div className="flex justify-between items-start mb-3">
                        <div>
                          <h4 className="text-lg sm:text-xl font-bold">₹{l.amount.toLocaleString("en-IN")}</h4>
                          <p className="text-xs text-gray-500">{l.purpose || "Personal Loan"} • {l.interestRate}% p.a.</p>
                        </div>
                        <StatusBadge status={l.status} />
                      </div>
                      <div className="grid grid-cols-3 gap-2 sm:gap-3 text-sm mb-3">
                        <div><p className="text-gray-400 text-xs">EMI</p><p className="font-bold">₹{l.emiAmount}</p></div>
                        <div><p className="text-gray-400 text-xs">Tenure</p><p className="font-bold">{l.tenure}m</p></div>
                        <div><p className="text-gray-400 text-xs">Paid</p><p className="font-bold text-green-600">₹{l.paidAmount}</p></div>
                      </div>
                      <div className="w-full bg-gray-100 rounded-full h-2 mb-3">
                        <div className="bg-gradient-to-r from-blue-500 to-cyan-500 h-2 rounded-full transition-all" style={{ width: `${progress}%` }} />
                      </div>
                      {l.status === "active" && (
                        <button onClick={() => payEMI(l._id, l.emiAmount)} className="w-full py-2.5 bg-gradient-to-r from-blue-600 to-cyan-600 text-white rounded-xl font-bold text-sm hover:shadow-lg active:scale-[0.98] transition">
                          Pay EMI ₹{l.emiAmount}
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* Transactions */}
        <div className="bg-white rounded-2xl shadow-sm p-5 sm:p-6 border border-gray-100">
          <div className="flex justify-between items-center mb-4 sm:mb-5">
            <h3 className="text-lg font-bold font-display">Recent Transactions</h3>
            <span className="text-xs text-gray-400">{txns.length} transactions</span>
          </div>

          {txns.length === 0 ? (
            <p className="py-8 text-center text-gray-300 text-sm">No transactions yet</p>
          ) : (
            <>
              {/* Desktop / tablet: table */}
              <div className="hidden sm:block overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="text-left text-xs text-gray-400 uppercase border-b">
                      {["Date", "Type", "Amount", "Method", "Status"].map(h => <th key={h} className="pb-3 font-semibold pr-4">{h}</th>)}
                    </tr>
                  </thead>
                  <tbody className="text-sm">
                    {txns.slice(0, 10).map(t => (
                      <tr key={t._id} className="border-b border-gray-50 hover:bg-gray-50 transition">
                        <td className="py-3 pr-4 text-gray-500">{new Date(t.createdAt).toLocaleDateString("en-IN")}</td>
                        <td className="py-3 pr-4"><span className="flex items-center gap-1.5">{t.type === "deposit" ? "🟢" : "🔴"}<span className="capitalize font-medium">{t.type}</span></span></td>
                        <td className={`py-3 pr-4 font-bold ${t.type === "deposit" ? "text-green-600" : "text-red-500"}`}>{t.type === "deposit" ? "+" : "-"}₹{t.amount.toLocaleString("en-IN")}</td>
                        <td className="py-3 pr-4 uppercase text-xs text-gray-500">{t.method}</td>
                        <td className="py-3"><StatusBadge status={t.status} /></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Mobile: card list */}
              <div className="sm:hidden space-y-3">
                {txns.slice(0, 10).map(t => (
                  <div key={t._id} className="flex items-center justify-between border border-gray-100 rounded-xl p-3.5">
                    <div className="flex items-center gap-3">
                      <div className={`w-9 h-9 rounded-full flex items-center justify-center text-lg shrink-0 ${t.type === "deposit" ? "bg-green-50" : "bg-red-50"}`}>
                        {t.type === "deposit" ? "🟢" : "🔴"}
                      </div>
                      <div>
                        <p className="font-semibold text-sm capitalize">{t.type} <span className="text-gray-400 font-normal uppercase text-[10px]">{t.method}</span></p>
                        <p className="text-xs text-gray-400">{new Date(t.createdAt).toLocaleDateString("en-IN")}</p>
                      </div>
                    </div>
                    <div className="text-right">
                      <p className={`font-bold text-sm ${t.type === "deposit" ? "text-green-600" : "text-red-500"}`}>{t.type === "deposit" ? "+" : "-"}₹{t.amount.toLocaleString("en-IN")}</p>
                      <StatusBadge status={t.status} />
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      </div>

      {/* DEPOSIT SHEET */}
      <Sheet open={modal === "deposit"} onClose={closeModal} title="Add Money" icon="💸">
        <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 mb-4 text-sm text-blue-800">
          📌 <strong>Payment Details:</strong><br />
          UPI ID: <code className="bg-white px-2 py-0.5 rounded text-xs">admin@upi</code><br />
          A/C: <code className="bg-white px-2 py-0.5 rounded text-xs">1234567890</code> | IFSC: <code className="bg-white px-2 py-0.5 rounded text-xs">ABCD0001</code>
        </div>
        <div className="space-y-3">
          <input type="number" inputMode="numeric" placeholder="Amount (min ₹100)" min="100" value={depForm.amount} onChange={e => setDepForm({ ...depForm, amount: e.target.value })} className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none text-base sm:text-sm" />
          <select value={depForm.method} onChange={e => setDepForm({ ...depForm, method: e.target.value })} className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none text-base sm:text-sm">
            <option value="upi">UPI Payment</option>
            <option value="bank">Bank Transfer</option>
          </select>
          <input type="text" placeholder="UTR / Transaction ID" value={depForm.utrNumber} onChange={e => setDepForm({ ...depForm, utrNumber: e.target.value })} className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none text-base sm:text-sm" />
        </div>
        <div className="flex gap-3 mt-5">
          <button onClick={closeModal} className="flex-1 py-3 bg-gray-100 rounded-xl font-semibold text-sm hover:bg-gray-200 active:bg-gray-300 transition">Cancel</button>
          <button onClick={submitDeposit} className="flex-1 py-3 bg-gradient-to-r from-blue-600 to-cyan-600 text-white rounded-xl font-bold text-sm hover:shadow-lg active:scale-[0.98] transition">Submit</button>
        </div>
      </Sheet>

      {/* WITHDRAW SHEET */}
      <Sheet open={modal === "withdraw"} onClose={closeModal} title="Withdraw Money" icon="💰">
        <div className="bg-yellow-50 border border-yellow-200 rounded-xl p-4 mb-4 text-sm text-yellow-800">
          ⚡ Below ₹5000 = <strong>Auto-processed</strong> | Above ₹5000 = <strong>Admin approval</strong>
        </div>
        <div className="space-y-3">
          <input type="number" inputMode="numeric" placeholder="Amount" min="100" value={wdForm.amount} onChange={e => setWdForm({ ...wdForm, amount: e.target.value })} className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none text-base sm:text-sm" />
          <select value={wdForm.method} onChange={e => setWdForm({ ...wdForm, method: e.target.value })} className="w-full px-4 py-3 border border-gray-200 rounded-xl outline-none text-base sm:text-sm">
            <option value="upi">UPI</option>
            <option value="bank">Bank Transfer</option>
          </select>
          {wdForm.method === "upi" ? (
            <input type="text" placeholder="Your UPI ID" value={wdForm.upiId} onChange={e => setWdForm({ ...wdForm, upiId: e.target.value })} className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none text-base sm:text-sm" />
          ) : (
            <div className="space-y-3">
              <input type="text" placeholder="Account Number" value={wdForm.accountNumber} onChange={e => setWdForm({ ...wdForm, accountNumber: e.target.value })} className="w-full px-4 py-3 border border-gray-200 rounded-xl outline-none text-base sm:text-sm" />
              <input type="text" placeholder="IFSC Code" value={wdForm.ifsc} onChange={e => setWdForm({ ...wdForm, ifsc: e.target.value })} className="w-full px-4 py-3 border border-gray-200 rounded-xl outline-none text-base sm:text-sm" />
            </div>
          )}
        </div>
        <div className="flex gap-3 mt-5">
          <button onClick={closeModal} className="flex-1 py-3 bg-gray-100 rounded-xl font-semibold text-sm hover:bg-gray-200 active:bg-gray-300 transition">Cancel</button>
          <button onClick={submitWithdraw} className="flex-1 py-3 bg-gradient-to-r from-green-600 to-emerald-600 text-white rounded-xl font-bold text-sm hover:shadow-lg active:scale-[0.98] transition">Withdraw</button>
        </div>
      </Sheet>

      {/* LOAN SHEET */}
      <Sheet open={modal === "loan"} onClose={closeModal} title="Apply for Loan" icon="🏦">
        <div className="space-y-3">
          <input type="number" inputMode="numeric" placeholder="Loan Amount" value={loanForm.amount} onChange={e => setLoanForm({ ...loanForm, amount: e.target.value })} className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none text-base sm:text-sm" />
          <input type="number" inputMode="numeric" placeholder="Tenure (months)" value={loanForm.tenure} onChange={e => setLoanForm({ ...loanForm, tenure: e.target.value })} className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none text-base sm:text-sm" />
          <input type="text" placeholder="Purpose of loan" value={loanForm.purpose} onChange={e => setLoanForm({ ...loanForm, purpose: e.target.value })} className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none text-base sm:text-sm" />
        </div>
        <div className="bg-gradient-to-r from-blue-50 to-cyan-50 border border-blue-200 rounded-xl p-4 mt-4">
          <p className="text-xs text-gray-500">Current Interest Rate: <span className="font-bold text-gray-700">{currentRate}% p.a.</span></p>
          <p className="text-2xl font-black text-blue-600 mt-1">Monthly EMI: ₹{emi.toLocaleString("en-IN")}</p>
        </div>
        <div className="flex gap-3 mt-5">
          <button onClick={closeModal} className="flex-1 py-3 bg-gray-100 rounded-xl font-semibold text-sm hover:bg-gray-200 active:bg-gray-300 transition">Cancel</button>
          <button onClick={submitLoan} className="flex-1 py-3 bg-gradient-to-r from-blue-600 to-cyan-600 text-white rounded-xl font-bold text-sm hover:shadow-lg active:scale-[0.98] transition">Apply</button>
        </div>
      </Sheet>

      {/* PROFILE SHEET (mobile nav) */}
      <Sheet open={modal === "profile"} onClose={closeModal} title="Profile" icon="👤">
        <div className="flex items-center gap-4 mb-6">
          <div className="w-14 h-14 bg-gradient-to-br from-blue-500 to-cyan-500 text-white rounded-full flex items-center justify-center font-bold text-xl shrink-0">
            {(userStored.name || "U")[0].toUpperCase()}
          </div>
          <div>
            <p className="font-bold text-gray-800">{userStored.name || "User"}</p>
            <p className="text-xs text-gray-400">{userStored.email}</p>
          </div>
        </div>
        <button onClick={logout} className="w-full py-3 bg-red-50 text-red-600 rounded-xl font-bold text-sm hover:bg-red-100 active:bg-red-200 transition">Logout</button>
      </Sheet>

      <Toast msg={toast} onHide={() => setToast({ text: "", type: "" })} />

      <BottomNav items={navItems} active={navTab} onChange={setNavTab} />
    </div>
  );
}
