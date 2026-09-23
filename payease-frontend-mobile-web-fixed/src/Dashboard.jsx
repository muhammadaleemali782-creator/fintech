import { useState, useEffect, useCallback } from "react";
import Sheet from "./components/Sheet";
import Toast from "./components/Toast";
import StatusBadge from "./components/StatusBadge";
import BottomNav from "./components/BottomNav";

import { API } from "./config";

// Helper: Calculate upcoming 1st, 11th, and 21st collection dates
const getUpcomingDates = (count = 6) => {
  const dates = [];
  let cur = new Date();
  while (dates.length < count) {
    cur.setDate(cur.getDate() + 1);
    const d = cur.getDate();
    if (d === 1 || d === 11 || d === 21) {
      dates.push(new Date(cur));
    }
  }
  return dates;
};

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
  const [accountModal, setAccountModal] = useState(null); // 'wallet' | 'debt' | 'lending' | 'personal_loan' | 'student_loan' | 'business_loan'
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
  
  // Personal Loan Application State (10-day Easy Installments, 1.34% per installment, max 10k initially)
  const [loanForm, setLoanForm] = useState({
    amount: 10000,
    installmentsCount: 12,
    purpose: "Personal Needs",
    aadharNumber: "",
    panNumber: "",
    bankAccountNumber: "",
    bankIfsc: "",
    upiId: ""
  });

  const showToast = (text, type = "success") => setToast({ text, type });
  const closeModal = () => {
    setModal(null);
    setAccountModal(null);
  };

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

  useEffect(() => { loadDashboard(); loadCurrentRate(); loadLoans(); }, [loadDashboard]);

  // Live Auto-Disbursal Calculations for Personal Loan
  const eligibleLimit = userProfile.loanLimit || 10000;
  const quoteAmount = Math.min(Math.max(Number(loanForm.amount) || 1000, 1000), eligibleLimit);
  const quoteCount = Math.min(Math.max(Number(loanForm.installmentsCount) || 12, 12), 30);
  const quoteRate = 1.34; // 1.34% per 10-day Easy Installment
  const principalPerInstallment = quoteAmount / quoteCount;
  const interestPerInstallment = (quoteAmount * quoteRate) / 100;
  const installmentAmount = Math.round(principalPerInstallment + interestPerInstallment);
  const totalPayable = installmentAmount * quoteCount;
  const processingFee = Math.round(quoteAmount * 0.05); // 5%
  const upiCharges = Math.round(quoteAmount * 0.01); // 1%
  const advanceDeduction = installmentAmount; // 1st Easy Installment deducted upfront
  const disbursalAmount = Math.max(0, quoteAmount - (processingFee + upiCharges + advanceDeduction));
  const previewDates = getUpcomingDates(Math.min(quoteCount, 6));

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

  const submitPersonalLoan = async () => {
    if (!loanForm.aadharNumber || !loanForm.panNumber || !loanForm.bankAccountNumber) {
      return showToast("Kripya Aadhar, PAN aur Bank Account details darj karein", "error");
    }

    try {
      const res = await fetch(`${API}/loan/apply`, {
        method: "POST",
        headers,
        body: JSON.stringify({
          amount: quoteAmount,
          installmentsCount: quoteCount,
          purpose: loanForm.purpose || "Personal Needs",
          documents: {
            aadharNumber: loanForm.aadharNumber,
            panNumber: loanForm.panNumber,
            bankAccountNumber: loanForm.bankAccountNumber,
            bankIfsc: loanForm.bankIfsc,
            upiId: loanForm.upiId
          }
        })
      });
      const data = await res.json();
      if (res.ok) {
        showToast(data.message || "Personal Loan successfully applied!", "success");
        closeModal();
        loadLoans();
        loadDashboard();
      } else {
        showToast(data.message || "Failed to apply loan", "error");
      }
    } catch {
      showToast("Network error applying for loan", "error");
    }
  };

  const payInstallment = async (id, instAmount) => {
    if (!window.confirm(`Pay Easy Installment of ₹${instAmount}?`)) return;
    const res = await fetch(`${API}/loan/${id}/pay-installment`, { method: "POST", headers });
    const data = await res.json();
    showToast(data.message, res.ok ? "success" : "error");
    if (res.ok) { loadLoans(); loadDashboard(); }
  };

  const logout = () => { localStorage.clear(); window.location.href = "/"; };

  const activePersonalLoan = loans.find(l => l.status === "active" || l.status === "pending" || l.status === "approved");

  const quickActions = [
    { icon: "💸", label: "Deposit", sub: "Add funds", color: "bg-green-100", action: () => setModal("deposit") },
    { icon: "💰", label: "Withdraw", sub: "Cash out", color: "bg-red-100", action: () => setModal("withdraw") },
    { icon: "🏦", label: "Apply Loan", sub: "10-day cycle", color: "bg-blue-100", action: () => setAccountModal("personal_loan") },
    { icon: "📋", label: "My Loans", sub: "Installments", color: "bg-purple-100", action: loadLoans },
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

        {/* ══════════════════════════════════════════════════════
            TOP WALLETS HEADER (AVAILABLE, PROFIT, DUES)
        ══════════════════════════════════════════════════════ */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6 sm:mb-8">
          {/* 1. Available Wallet Balance Card */}
          <div className="bg-gradient-to-br from-blue-600 via-blue-700 to-indigo-800 rounded-3xl p-5 sm:p-6 text-white shadow-xl relative overflow-hidden flex flex-col justify-between">
            <div className="absolute top-0 right-0 w-32 h-32 bg-white/10 rounded-full -mr-16 -mt-16" />
            <div className="relative z-10">
              <div className="flex justify-between items-center mb-1">
                <span className="text-white/80 text-xs font-bold uppercase tracking-wider">Wallet Balance</span>
                <span className="text-lg">💵</span>
              </div>
              <h2 className="text-3xl sm:text-4xl font-black font-display mb-4">₹{balance.toLocaleString("en-IN")}</h2>
            </div>
            <div className="flex gap-2 relative z-10">
              <button onClick={() => setModal("deposit")} className="flex-1 py-2 bg-white text-blue-700 rounded-xl font-bold text-xs hover:shadow-md active:scale-95 transition-all">+ Add Money</button>
              <button onClick={() => setModal("withdraw")} className="flex-1 py-2 bg-white/20 backdrop-blur text-white border border-white/30 rounded-xl font-bold text-xs hover:bg-white/30 active:scale-95 transition-all">↓ Withdraw</button>
            </div>
          </div>

          {/* 2. Profit Wallet Balance Card */}
          <div className="bg-gradient-to-br from-emerald-600 via-emerald-700 to-teal-800 rounded-3xl p-5 sm:p-6 text-white shadow-xl relative overflow-hidden flex flex-col justify-between">
            <div className="absolute top-0 right-0 w-32 h-32 bg-white/10 rounded-full -mr-16 -mt-16" />
            <div className="relative z-10">
              <div className="flex justify-between items-center mb-1">
                <span className="text-emerald-100 text-xs font-bold uppercase tracking-wider">Profit Wallet Balance</span>
                <span className="text-lg">📈</span>
              </div>
              <h2 className="text-3xl sm:text-4xl font-black font-display mb-1">₹{(userProfile.profitBalance || 0).toLocaleString("en-IN")}</h2>
              <p className="text-emerald-100/90 text-xs mb-4">Capitalised yield, referral rewards & cashbacks</p>
            </div>
            <div className="pt-2 border-t border-emerald-500/40 flex justify-between items-center text-xs text-emerald-100 relative z-10">
              <span>Savings Yield: <strong>{userProfile.interestRate || currentRate}% APY</strong></span>
              <span className="font-bold text-white">Auto Credited</span>
            </div>
          </div>

          {/* 3. Dues Wallet Balance Card */}
          <div className="bg-gradient-to-br from-amber-600 via-rose-600 to-red-700 rounded-3xl p-5 sm:p-6 text-white shadow-xl relative overflow-hidden flex flex-col justify-between">
            <div className="absolute top-0 right-0 w-32 h-32 bg-white/10 rounded-full -mr-16 -mt-16" />
            <div className="relative z-10">
              <div className="flex justify-between items-center mb-1">
                <span className="text-rose-100 text-xs font-bold uppercase tracking-wider">Dues Wallet Balance</span>
                <span className="text-lg">📅</span>
              </div>
              <h2 className="text-3xl sm:text-4xl font-black font-display mb-1">₹{(userProfile.duesBalance || 0).toLocaleString("en-IN")}</h2>
              <p className="text-rose-100/90 text-xs mb-4">Pending Easy Installments & scheduled collections</p>
            </div>
            <div className="pt-2 border-t border-rose-400/40 flex justify-between items-center text-xs text-rose-100 relative z-10">
              <span>Cycle: <strong>1st, 11th & 21st</strong></span>
              <button onClick={() => setAccountModal("debt")} className="text-xs font-bold underline hover:text-white">View Details →</button>
            </div>
          </div>
        </div>

        {/* ══════════════════════════════════════════════════════
            6 MODULAR ACCOUNTS SECTION (CLICK TO VIEW DETAILS)
        ══════════════════════════════════════════════════════ */}
        <div className="bg-white rounded-3xl p-5 sm:p-7 shadow-sm border border-gray-100 mb-6 sm:mb-8">
          <div className="flex justify-between items-center mb-5">
            <div>
              <h3 className="text-base sm:text-lg font-black text-gray-900 flex items-center gap-2">
                <span>📑</span> 6 Modular Accounts Hub
              </h3>
              <p className="text-xs text-gray-500">Sabhi accounts ka pura data dekhne ke liye card par click karein</p>
            </div>
            <span className="hidden sm:inline-block px-3 py-1 bg-blue-50 text-[#1D6AE5] rounded-full text-xs font-bold">
              Click to Open Account Data
            </span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {/* 1. Wallet Account */}
            <div
              onClick={() => setAccountModal("wallet")}
              className="p-5 rounded-2xl border-2 border-gray-200 hover:border-blue-500 bg-white hover:bg-blue-50/20 shadow-xs hover:shadow-md transition cursor-pointer flex flex-col justify-between"
            >
              <div>
                <div className="flex justify-between items-start mb-3">
                  <div className="w-11 h-11 rounded-xl bg-blue-100 text-blue-700 flex items-center justify-center text-xl">
                    💰
                  </div>
                  <span className="px-2.5 py-0.5 rounded-full text-[11px] font-black bg-blue-100 text-blue-800">
                    Primary
                  </span>
                </div>
                <h4 className="font-extrabold text-base text-gray-900">Wallet Account</h4>
                <p className="text-xs text-gray-500 mt-1 mb-3">
                  Available cash balance, deposits, instant withdrawals aur daily transactions statement.
                </p>
              </div>
              <div className="pt-3 border-t border-gray-100 flex items-center justify-between text-xs">
                <span className="font-bold text-gray-900">₹{balance.toLocaleString("en-IN")}</span>
                <span className="text-[#1D6AE5] font-bold">Open Account →</span>
              </div>
            </div>

            {/* 2. Debt Account */}
            <div
              onClick={() => setAccountModal("debt")}
              className="p-5 rounded-2xl border-2 border-gray-200 hover:border-rose-500 bg-white hover:bg-rose-50/20 shadow-xs hover:shadow-md transition cursor-pointer flex flex-col justify-between"
            >
              <div>
                <div className="flex justify-between items-start mb-3">
                  <div className="w-11 h-11 rounded-xl bg-rose-100 text-rose-700 flex items-center justify-center text-xl">
                    📑
                  </div>
                  <span className="px-2.5 py-0.5 rounded-full text-[11px] font-black bg-rose-100 text-rose-800">
                    10-Day Cycle
                  </span>
                </div>
                <h4 className="font-extrabold text-base text-gray-900">Debt Account</h4>
                <p className="text-xs text-gray-500 mt-1 mb-3">
                  Puri kiston ka hisaab, upcoming collection dates (1st, 11th, 21st) aur pending dues.
                </p>
              </div>
              <div className="pt-3 border-t border-gray-100 flex items-center justify-between text-xs">
                <span className="font-bold text-rose-600">₹{(userProfile.duesBalance || 0).toLocaleString("en-IN")} Due</span>
                <span className="text-rose-600 font-bold">Open Account →</span>
              </div>
            </div>

            {/* 3. Lending Account */}
            <div
              onClick={() => setAccountModal("lending")}
              className="p-5 rounded-2xl border-2 border-gray-200 hover:border-purple-500 bg-white hover:bg-purple-50/20 shadow-xs hover:shadow-md transition cursor-pointer flex flex-col justify-between"
            >
              <div>
                <div className="flex justify-between items-start mb-3">
                  <div className="w-11 h-11 rounded-xl bg-purple-100 text-purple-700 flex items-center justify-center text-xl">
                    🤝
                  </div>
                  <span className="px-2.5 py-0.5 rounded-full text-[11px] font-black bg-purple-100 text-purple-800">
                    Credit Line
                  </span>
                </div>
                <h4 className="font-extrabold text-base text-gray-900">Lending Account</h4>
                <p className="text-xs text-gray-500 mt-1 mb-3">
                  Micro-credit lines, peer-to-peer limits up to ₹1,50,000 aur credit profile health.
                </p>
              </div>
              <div className="pt-3 border-t border-gray-100 flex items-center justify-between text-xs">
                <span className="font-bold text-purple-700">Up to ₹1.5L Limit</span>
                <span className="text-purple-600 font-bold">Open Account →</span>
              </div>
            </div>

            {/* 4. Personal Loan Account */}
            <div
              onClick={() => setAccountModal("personal_loan")}
              className="p-5 rounded-2xl border-2 border-emerald-500/50 bg-emerald-50/20 hover:border-emerald-600 shadow-xs hover:shadow-md transition cursor-pointer flex flex-col justify-between"
            >
              <div>
                <div className="flex justify-between items-start mb-3">
                  <div className="w-11 h-11 rounded-xl bg-emerald-100 text-emerald-800 flex items-center justify-center text-xl">
                    🏦
                  </div>
                  <span className="px-2.5 py-0.5 rounded-full text-[11px] font-black bg-emerald-100 text-emerald-800">
                    {activePersonalLoan ? (activePersonalLoan.accountNumber || "EFSPL0001") : "10-Day Easy Installments"}
                  </span>
                </div>
                <h4 className="font-extrabold text-base text-gray-900">Personal Loan Account</h4>
                <p className="text-xs text-gray-500 mt-1 mb-3">
                  {activePersonalLoan
                    ? `Active loan: ${activePersonalLoan.accountNumber || "EFSPL0001"} • Kist schedule aur repayment.`
                    : `10k initial limit • Full repayment par double (10k -> 20k -> 40k -> 50k max).`}
                </p>
              </div>
              <div className="pt-3 border-t border-emerald-200/60 flex items-center justify-between text-xs">
                <span className="font-bold text-emerald-800">
                  {activePersonalLoan ? `₹${activePersonalLoan.amount.toLocaleString("en-IN")}` : `Limit ₹${eligibleLimit.toLocaleString("en-IN")}`}
                </span>
                <span className="text-emerald-700 font-bold">
                  {activePersonalLoan ? "View Loan Data →" : "Apply Loan →"}
                </span>
              </div>
            </div>

            {/* 5. Student Loan Account */}
            <div
              onClick={() => setAccountModal("student_loan")}
              className="p-5 rounded-2xl border-2 border-gray-200 hover:border-cyan-500 bg-white hover:bg-cyan-50/20 shadow-xs hover:shadow-md transition cursor-pointer flex flex-col justify-between"
            >
              <div>
                <div className="flex justify-between items-start mb-3">
                  <div className="w-11 h-11 rounded-xl bg-cyan-100 text-cyan-700 flex items-center justify-center text-xl">
                    🎓
                  </div>
                  <span className="px-2.5 py-0.5 rounded-full text-[11px] font-black bg-cyan-100 text-cyan-800">
                    8% p.a.
                  </span>
                </div>
                <h4 className="font-extrabold text-base text-gray-900">Student Loan Account</h4>
                <p className="text-xs text-gray-500 mt-1 mb-3">
                  School, college aur coaching fee direct transfer. Subsidized interest aur student flexibility.
                </p>
              </div>
              <div className="pt-3 border-t border-gray-100 flex items-center justify-between text-xs">
                <span className="font-bold text-cyan-700">Up to ₹1,00,000</span>
                <span className="text-cyan-600 font-bold">Open Account →</span>
              </div>
            </div>

            {/* 6. Micro Business Loan Account */}
            <div
              onClick={() => setAccountModal("business_loan")}
              className="p-5 rounded-2xl border-2 border-gray-200 hover:border-amber-500 bg-white hover:bg-amber-50/20 shadow-xs hover:shadow-md transition cursor-pointer flex flex-col justify-between"
            >
              <div>
                <div className="flex justify-between items-start mb-3">
                  <div className="w-11 h-11 rounded-xl bg-amber-100 text-amber-700 flex items-center justify-center text-xl">
                    🏬
                  </div>
                  <span className="px-2.5 py-0.5 rounded-full text-[11px] font-black bg-amber-100 text-amber-800">
                    Vendor Credit
                  </span>
                </div>
                <h4 className="font-extrabold text-base text-gray-900">Micro Business Loan Account</h4>
                <p className="text-xs text-gray-500 mt-1 mb-3">
                  Shopkeepers, dukandaaro aur chhote vendors ke liye working capital aur fast 24-hr disbursal.
                </p>
              </div>
              <div className="pt-3 border-t border-gray-100 flex items-center justify-between text-xs">
                <span className="font-bold text-amber-700">₹5,000 - ₹50,000</span>
                <span className="text-amber-600 font-bold">Open Account →</span>
              </div>
            </div>
          </div>
        </div>

        {/* ══════════════════════════════════════════════════════
            VIRTUAL CARDS HUB (SILVER & PLATINUM VIP CARDS)
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
                <div className="w-full max-w-sm aspect-[1.586] rounded-2xl p-5 sm:p-6 text-gray-900 shadow-2xl relative overflow-hidden flex flex-col justify-between border border-gray-300/80 bg-gradient-to-br from-slate-100 via-gray-200 to-slate-300">
                  <div className="flex justify-between items-start">
                    <div>
                      <div className="text-[10px] uppercase tracking-widest font-black text-gray-500">Educa Digital</div>
                      <div className="text-lg font-black tracking-tight text-gray-900">Silver Classic</div>
                    </div>
                    <span className="text-xs font-black px-2 py-0.5 rounded bg-gray-900 text-white">DEBIT</span>
                  </div>
                  <div className="my-2">
                    <div className="text-base sm:text-lg font-mono tracking-widest font-bold text-gray-800">
                      4532 •••• •••• 8912
                    </div>
                  </div>
                  <div className="flex justify-between items-end text-xs">
                    <div>
                      <div className="text-[9px] uppercase tracking-wider text-gray-500">Cardholder</div>
                      <div className="font-bold text-gray-900 truncate max-w-[140px] uppercase">
                        {userStored.name || "User"}
                      </div>
                    </div>
                    <div>
                      <div className="text-[9px] uppercase tracking-wider text-gray-500">Expires</div>
                      <div className="font-mono font-bold text-gray-900">08/29</div>
                    </div>
                    <div className="text-sm font-black italic tracking-tighter text-blue-900">VISA</div>
                  </div>
                </div>
              ) : (
                /* PLATINUM VIP CARD */
                <div className="w-full max-w-sm aspect-[1.586] rounded-2xl p-5 sm:p-6 text-white shadow-2xl relative overflow-hidden flex flex-col justify-between border border-amber-400/40 bg-gradient-to-br from-gray-950 via-slate-900 to-amber-950">
                  <div className="flex justify-between items-start">
                    <div>
                      <div className="text-[10px] uppercase tracking-widest font-black text-amber-400">Educa Exclusive</div>
                      <div className="text-lg font-black tracking-tight text-amber-200">Platinum VIP</div>
                    </div>
                    <span className="text-xs font-black px-2 py-0.5 rounded bg-gradient-to-r from-amber-400 to-yellow-500 text-gray-950">VIP</span>
                  </div>
                  <div className="my-2">
                    <div className="text-base sm:text-lg font-mono tracking-widest font-bold text-amber-100">
                      5421 •••• •••• 9901
                    </div>
                  </div>
                  <div className="flex justify-between items-end text-xs">
                    <div>
                      <div className="text-[9px] uppercase tracking-wider text-amber-400/80">Cardholder</div>
                      <div className="font-bold text-white truncate max-w-[140px] uppercase">
                        {userStored.name || "User"}
                      </div>
                    </div>
                    <div>
                      <div className="text-[9px] uppercase tracking-wider text-amber-400/80">Expires</div>
                      <div className="font-mono font-bold text-amber-200">12/32</div>
                    </div>
                    <div className="text-sm font-black tracking-wider text-amber-400">RUPAY VIP</div>
                  </div>
                </div>
              )}
            </div>

            {/* CARD DETAILS */}
            <div className="lg:col-span-6 space-y-4">
              {cardTab === "silver" ? (
                <div>
                  <h4 className="font-extrabold text-base text-gray-900">Silver Debit Card (Active)</h4>
                  <p className="text-xs text-gray-500 mt-1 mb-3">
                    Daily transactions, recharge aur online payment ke liye ready. No annual maintenance charge.
                  </p>
                  <div className="space-y-2 text-xs">
                    <div className="flex justify-between p-2.5 bg-gray-50 rounded-xl">
                      <span className="text-gray-500">Daily Online Spend Limit:</span>
                      <span className="font-bold text-gray-900">₹50,000 / day</span>
                    </div>
                    <div className="flex justify-between p-2.5 bg-gray-50 rounded-xl">
                      <span className="text-gray-500">ATM Withdrawal (Partner):</span>
                      <span className="font-bold text-gray-900">Free 5 txn/mo</span>
                    </div>
                  </div>
                </div>
              ) : (
                <div>
                  <h4 className="font-extrabold text-base text-gray-900">Platinum VIP Card</h4>
                  <p className="text-xs text-gray-500 mt-1 mb-3">
                    Exclusive credit perks, concierge support aur higher borrowing limits.
                  </p>
                  {userProfile.cardTier === "platinum" || userProfile.cardStatus?.platinum?.unlocked ? (
                    <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-xl text-xs text-emerald-800 font-bold">
                      🎉 Platinum VIP Card is Active on your Account!
                    </div>
                  ) : (
                    <div className="space-y-3">
                      <div className="p-3 bg-amber-50 border border-amber-200 rounded-xl text-xs text-amber-800">
                        🔒 Complete 4 loans without default or request Admin VIP invite to unlock.
                      </div>
                      <button
                        onClick={claimPlatinumCard}
                        disabled={claimingCard}
                        className="w-full py-2.5 rounded-xl bg-gradient-to-r from-amber-500 to-yellow-500 text-white font-bold text-xs shadow-md active:scale-95 transition"
                      >
                        {claimingCard ? "Checking..." : "Claim Platinum VIP Card"}
                      </button>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>

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

        {/* Referral Box */}
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

        {/* My Loans Section (Strictly No 'EMI' - Uses 'Easy Installments') */}
        {showLoans && (
          <div className="bg-white rounded-2xl shadow-sm p-5 sm:p-6 mb-6 sm:mb-8 border border-gray-100">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-lg font-bold font-display">My Loans (10-Day Easy Installments)</h3>
              <button onClick={() => setShowLoans(false)} className="text-xs text-gray-400 hover:text-gray-600">Hide</button>
            </div>
            {loans.length === 0 ? <p className="text-gray-400 text-center py-8 text-sm">No active loans found</p> : (
              <div className="space-y-4">
                {loans.map(l => {
                  const progress = l.totalPayable ? (l.paidAmount / l.totalPayable) * 100 : 0;
                  const instAmt = l.installmentAmount || l.emiAmount || 0;
                  return (
                    <div key={l._id} className="border border-gray-200 rounded-2xl p-4 sm:p-5 hover:shadow-md transition">
                      <div className="flex justify-between items-start mb-3">
                        <div>
                          <div className="flex items-center gap-2">
                            <h4 className="text-lg sm:text-xl font-bold">₹{l.amount.toLocaleString("en-IN")}</h4>
                            {l.accountNumber && (
                              <span className="px-2 py-0.5 rounded-full text-[10px] font-black bg-blue-100 text-blue-800">
                                {l.accountNumber}
                              </span>
                            )}
                          </div>
                          <p className="text-xs text-gray-500 mt-0.5">
                            {l.purpose || "Personal Loan"} • 10-Day Cycle • Rate: 1.34%/installment
                          </p>
                        </div>
                        <StatusBadge status={l.status} />
                      </div>
                      <div className="grid grid-cols-3 gap-2 sm:gap-3 text-sm mb-3">
                        <div><p className="text-gray-400 text-xs">Easy Installment</p><p className="font-bold">₹{instAmt}</p></div>
                        <div><p className="text-gray-400 text-xs">Installments</p><p className="font-bold">{l.installmentsCount || l.tenure} total</p></div>
                        <div><p className="text-gray-400 text-xs">Paid</p><p className="font-bold text-green-600">₹{l.paidAmount}</p></div>
                      </div>
                      <div className="w-full bg-gray-100 rounded-full h-2 mb-3">
                        <div className="bg-gradient-to-r from-blue-500 to-cyan-500 h-2 rounded-full transition-all" style={{ width: `${progress}%` }} />
                      </div>
                      {l.status === "active" && (
                        <button onClick={() => payInstallment(l._id, instAmt)} className="w-full py-2.5 bg-gradient-to-r from-blue-600 to-cyan-600 text-white rounded-xl font-bold text-sm hover:shadow-lg active:scale-[0.98] transition">
                          Pay Easy Installment ₹{instAmt}
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
            <div className="space-y-3">
              {txns.slice(0, 10).map(t => (
                <div key={t._id} className="flex items-center justify-between border border-gray-100 rounded-xl p-3.5 hover:bg-gray-50/50 transition">
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
          )}
        </div>
      </div>

      {/* ══════════════════════════════════════════════════════
          ACCOUNT DETAILS SHEETS ("Sabka sara data vha click karne baad hi dikhe")
      ══════════════════════════════════════════════════════ */}

      {/* 1. WALLET ACCOUNT SHEET */}
      <Sheet open={accountModal === "wallet"} onClose={closeModal} title="Wallet Account" icon="💰">
        <div className="space-y-4">
          <div className="bg-gradient-to-r from-blue-600 to-indigo-700 rounded-2xl p-5 text-white">
            <span className="text-xs text-blue-100 font-bold uppercase tracking-wider">Available Cash Balance</span>
            <div className="text-3xl font-black font-display my-1">₹{balance.toLocaleString("en-IN")}</div>
            <p className="text-xs text-blue-100">Ready for instant UPI, recharge aur withdrawal</p>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <button onClick={() => { setAccountModal(null); setModal("deposit"); }} className="py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-bold text-xs transition">
              + Add Funds
            </button>
            <button onClick={() => { setAccountModal(null); setModal("withdraw"); }} className="py-2.5 bg-gray-100 hover:bg-gray-200 text-gray-900 rounded-xl font-bold text-xs transition">
              ↓ Withdraw Cash
            </button>
          </div>
          <div className="border-t border-gray-100 pt-3">
            <h5 className="font-bold text-xs text-gray-700 uppercase mb-2">Account Overview</h5>
            <div className="space-y-2 text-xs">
              <div className="flex justify-between p-2 bg-gray-50 rounded-lg">
                <span className="text-gray-500">Account Type</span>
                <span className="font-bold text-gray-800">Full KYC Digital Wallet</span>
              </div>
              <div className="flex justify-between p-2 bg-gray-50 rounded-lg">
                <span className="text-gray-500">Daily Payout Limit</span>
                <span className="font-bold text-gray-800">₹1,00,000 / day</span>
              </div>
              <div className="flex justify-between p-2 bg-gray-50 rounded-lg">
                <span className="text-gray-500">Total Transactions</span>
                <span className="font-bold text-gray-800">{txns.length} records</span>
              </div>
            </div>
          </div>
        </div>
      </Sheet>

      {/* 2. DEBT ACCOUNT SHEET */}
      <Sheet open={accountModal === "debt"} onClose={closeModal} title="Debt Account" icon="📑">
        <div className="space-y-4">
          <div className="bg-gradient-to-r from-rose-600 to-red-700 rounded-2xl p-5 text-white">
            <span className="text-xs text-rose-100 font-bold uppercase tracking-wider">Total Pending Dues</span>
            <div className="text-3xl font-black font-display my-1">₹{(userProfile.duesBalance || 0).toLocaleString("en-IN")}</div>
            <p className="text-xs text-rose-100">Collection strictly scheduled on 1st, 11th & 21st of each month</p>
          </div>

          <div className="bg-blue-50 border border-blue-200 rounded-xl p-3 text-xs text-blue-900">
            📌 <strong>10-Day Cycle Rule:</strong> Har mahine ki 1, 11 aur 21 tareekh ko Easy Installment collect hoti hai. Time par pay karne se aapki loan limit 10k se 20k, 40k, aur max 50k ho jaati hai!
          </div>

          {activePersonalLoan ? (
            <div className="border border-gray-200 rounded-xl p-4 space-y-2 text-xs">
              <div className="flex justify-between items-center">
                <span className="font-bold text-gray-900">{activePersonalLoan.accountNumber || "EFSPL0001"}</span>
                <StatusBadge status={activePersonalLoan.status} />
              </div>
              <div className="flex justify-between text-gray-600">
                <span>Per Installment:</span>
                <span className="font-bold text-gray-900">₹{activePersonalLoan.installmentAmount || activePersonalLoan.emiAmount}</span>
              </div>
              <div className="flex justify-between text-gray-600">
                <span>Remaining Total:</span>
                <span className="font-bold text-rose-600">₹{activePersonalLoan.remainingAmount || activePersonalLoan.amount}</span>
              </div>
              {activePersonalLoan.status === "active" && (
                <button
                  onClick={() => payInstallment(activePersonalLoan._id, activePersonalLoan.installmentAmount || activePersonalLoan.emiAmount)}
                  className="w-full mt-2 py-2.5 bg-gradient-to-r from-blue-600 to-indigo-600 text-white rounded-xl font-bold text-xs shadow-sm hover:shadow"
                >
                  Pay Next Easy Installment (₹{activePersonalLoan.installmentAmount || activePersonalLoan.emiAmount})
                </button>
              )}
            </div>
          ) : (
            <div className="text-center py-4 text-xs text-gray-400">
              Koi active loan ya pending dues nahi hain.
            </div>
          )}
        </div>
      </Sheet>

      {/* 3. LENDING ACCOUNT SHEET */}
      <Sheet open={accountModal === "lending"} onClose={closeModal} title="Lending Account" icon="🤝">
        <div className="space-y-4">
          <div className="bg-gradient-to-r from-purple-700 to-indigo-800 rounded-2xl p-5 text-white">
            <span className="text-xs text-purple-100 font-bold uppercase tracking-wider">Credit Line Limit</span>
            <div className="text-3xl font-black font-display my-1">Up to ₹1,50,000</div>
            <p className="text-xs text-purple-100">Vehicle loans, emergency financing aur credit line</p>
          </div>
          <div className="space-y-2 text-xs">
            <div className="flex justify-between p-2.5 bg-gray-50 rounded-xl">
              <span className="text-gray-500">Status</span>
              <span className="font-bold text-purple-700">{userProfile.wallets?.lending?.active ? "Active" : "Not Activated"}</span>
            </div>
            <div className="flex justify-between p-2.5 bg-gray-50 rounded-xl">
              <span className="text-gray-500">Max Bike Loan</span>
              <span className="font-bold text-gray-800">₹1,50,000</span>
            </div>
            <div className="flex justify-between p-2.5 bg-gray-50 rounded-xl">
              <span className="text-gray-500">Interest Calculation</span>
              <span className="font-bold text-gray-800">Daily reducing basis</span>
            </div>
          </div>
          {!userProfile.wallets?.lending?.active && (
            <button
              onClick={() => activateWallet("lending")}
              disabled={activatingWallet === "lending"}
              className="w-full py-2.5 bg-purple-600 hover:bg-purple-700 text-white rounded-xl font-bold text-xs shadow-sm transition"
            >
              {activatingWallet === "lending" ? "Activating..." : "⚡ Activate Lending Wallet"}
            </button>
          )}
        </div>
      </Sheet>

      {/* 4. PERSONAL LOAN ACCOUNT SHEET & APPLICATION */}
      <Sheet open={accountModal === "personal_loan"} onClose={closeModal} title="Personal Loan Account" icon="🏦">
        {activePersonalLoan ? (
          <div className="space-y-4">
            <div className="bg-gradient-to-r from-emerald-600 to-teal-700 rounded-2xl p-5 text-white">
              <div className="flex justify-between items-center">
                <span className="text-xs font-bold uppercase tracking-wider text-emerald-100">Account Number</span>
                <span className="px-2 py-0.5 rounded-full text-[10px] font-black bg-white/20 text-white">
                  {activePersonalLoan.status.toUpperCase()}
                </span>
              </div>
              <div className="text-2xl sm:text-3xl font-black font-mono my-1 tracking-wider">
                {activePersonalLoan.accountNumber || "EFSPL0001"}
              </div>
              <p className="text-xs text-emerald-100">Sanctioned Amount: ₹{activePersonalLoan.amount.toLocaleString("en-IN")}</p>
            </div>

            <div className="border border-gray-100 rounded-2xl p-4 bg-gray-50 space-y-2 text-xs">
              <div className="flex justify-between"><span className="text-gray-500">Tenure:</span><span className="font-bold">{activePersonalLoan.installmentsCount || activePersonalLoan.tenure} Easy Installments</span></div>
              <div className="flex justify-between"><span className="text-gray-500">Cycle:</span><span className="font-bold">10 Days (1st, 11th, 21st)</span></div>
              <div className="flex justify-between"><span className="text-gray-500">Per Installment:</span><span className="font-bold text-emerald-700">₹{activePersonalLoan.installmentAmount || activePersonalLoan.emiAmount}</span></div>
              <div className="flex justify-between"><span className="text-gray-500">Total Paid:</span><span className="font-bold text-blue-600">₹{activePersonalLoan.paidAmount || 0}</span></div>
              <div className="flex justify-between"><span className="text-gray-500">Remaining:</span><span className="font-bold text-rose-600">₹{activePersonalLoan.remainingAmount || activePersonalLoan.amount}</span></div>
            </div>

            {activePersonalLoan.status === "active" && (
              <button
                onClick={() => payInstallment(activePersonalLoan._id, activePersonalLoan.installmentAmount || activePersonalLoan.emiAmount)}
                className="w-full py-3 bg-gradient-to-r from-emerald-600 to-teal-600 text-white rounded-xl font-bold text-xs shadow-md active:scale-95 transition"
              >
                Pay Easy Installment ₹{activePersonalLoan.installmentAmount || activePersonalLoan.emiAmount}
              </button>
            )}
          </div>
        ) : (
          /* APPLY FOR PERSONAL LOAN FORM */
          <div className="space-y-4">
            <div className="bg-blue-50 border border-blue-200 rounded-xl p-3 text-xs text-blue-900">
              ⚡ <strong>1st Time Limit:</strong> Max ₹10,000. Full repayment par limit double hogi (10k → 20k → 40k → 50k max).<br />
              Cycle: <strong>10 din ki Easy Installment (1, 11, 21 tareekh).</strong>
            </div>

            {/* Amount Slider */}
            <div>
              <div className="flex justify-between text-xs font-bold mb-1">
                <span className="text-gray-700">Loan Amount:</span>
                <span className="font-mono text-emerald-700 text-sm">₹{quoteAmount.toLocaleString("en-IN")}</span>
              </div>
              <input
                type="range"
                min="1000"
                max={eligibleLimit}
                step="1000"
                value={quoteAmount}
                onChange={e => setLoanForm({ ...loanForm, amount: Number(e.target.value) })}
                className="w-full accent-emerald-600 cursor-pointer"
              />
              <div className="flex justify-between text-[10px] text-gray-400 mt-0.5">
                <span>Min ₹1,000</span>
                <span>Max Eligible ₹{eligibleLimit.toLocaleString("en-IN")}</span>
              </div>
            </div>

            {/* Installments Slider */}
            <div>
              <div className="flex justify-between text-xs font-bold mb-1">
                <span className="text-gray-700">Easy Installments Count:</span>
                <span className="font-mono text-blue-700 text-sm">{quoteCount} Installments</span>
              </div>
              <input
                type="range"
                min="12"
                max="30"
                step="1"
                value={quoteCount}
                onChange={e => setLoanForm({ ...loanForm, installmentsCount: Number(e.target.value) })}
                className="w-full accent-blue-600 cursor-pointer"
              />
              <div className="flex justify-between text-[10px] text-gray-400 mt-0.5">
                <span>Min 12</span>
                <span>Max 30 Easy Installments</span>
              </div>
            </div>

            {/* Live Auto-Disbursal Breakdown */}
            <div className="bg-gray-50 border border-gray-200 rounded-2xl p-3.5 space-y-2 text-xs">
              <div className="font-bold text-gray-800 text-[11px] uppercase tracking-wider border-b border-gray-200 pb-1">
                Disbursal Calculation Breakdown
              </div>
              <div className="flex justify-between text-gray-600">
                <span>Loan Sanctioned:</span>
                <span className="font-bold text-gray-800">₹{quoteAmount.toLocaleString("en-IN")}</span>
              </div>
              <div className="flex justify-between text-gray-600">
                <span>Rate of Interest:</span>
                <span className="font-bold text-emerald-700">1.34% per installment</span>
              </div>
              <div className="flex justify-between text-gray-600">
                <span>Per Easy Installment:</span>
                <span className="font-bold text-gray-900">₹{installmentAmount.toLocaleString("en-IN")}</span>
              </div>
              <div className="flex justify-between text-red-600">
                <span>- 5% Processing Fee:</span>
                <span className="font-bold">₹{processingFee}</span>
              </div>
              <div className="flex justify-between text-red-600">
                <span>- 1% UPI Pay Charges:</span>
                <span className="font-bold">₹{upiCharges}</span>
              </div>
              <div className="flex justify-between text-red-600">
                <span>- 1st Advance Installment:</span>
                <span className="font-bold">₹{advanceDeduction}</span>
              </div>
              <div className="pt-2 border-t border-gray-200 flex justify-between items-center">
                <span className="font-black text-gray-900">Final Disbursal Amount:</span>
                <span className="text-base font-black text-emerald-700">₹{disbursalAmount.toLocaleString("en-IN")}</span>
              </div>
            </div>

            {/* Upcoming Collection Dates Preview */}
            <div className="p-3 bg-blue-50/60 rounded-xl text-[11px] text-blue-900">
              <span className="font-bold">Collection Dates: </span>
              {previewDates.map(d => `${d.getDate()}/${d.getMonth()+1}`).join(", ")}... (Every 1st, 11th, 21st)
            </div>

            {/* Document Verification Inputs */}
            <div className="space-y-2.5 pt-2 border-t border-gray-100">
              <div className="text-xs font-bold text-gray-800">Required KYC & Bank Details:</div>
              <input
                type="text"
                placeholder="Aadhar Number (12 digits)"
                value={loanForm.aadharNumber}
                onChange={e => setLoanForm({ ...loanForm, aadharNumber: e.target.value })}
                className="w-full px-3.5 py-2.5 border border-gray-200 rounded-xl text-xs outline-none focus:ring-2 focus:ring-emerald-500"
              />
              <input
                type="text"
                placeholder="PAN Number (e.g. ABCDE1234F)"
                value={loanForm.panNumber}
                onChange={e => setLoanForm({ ...loanForm, panNumber: e.target.value.toUpperCase() })}
                className="w-full px-3.5 py-2.5 border border-gray-200 rounded-xl text-xs outline-none focus:ring-2 focus:ring-emerald-500 uppercase"
              />
              <div className="grid grid-cols-2 gap-2">
                <input
                  type="text"
                  placeholder="Bank Account Number"
                  value={loanForm.bankAccountNumber}
                  onChange={e => setLoanForm({ ...loanForm, bankAccountNumber: e.target.value })}
                  className="w-full px-3.5 py-2.5 border border-gray-200 rounded-xl text-xs outline-none focus:ring-2 focus:ring-emerald-500"
                />
                <input
                  type="text"
                  placeholder="IFSC Code"
                  value={loanForm.bankIfsc}
                  onChange={e => setLoanForm({ ...loanForm, bankIfsc: e.target.value.toUpperCase() })}
                  className="w-full px-3.5 py-2.5 border border-gray-200 rounded-xl text-xs outline-none focus:ring-2 focus:ring-emerald-500 uppercase"
                />
              </div>
              <input
                type="text"
                placeholder="UPI ID (for auto disbursal)"
                value={loanForm.upiId}
                onChange={e => setLoanForm({ ...loanForm, upiId: e.target.value })}
                className="w-full px-3.5 py-2.5 border border-gray-200 rounded-xl text-xs outline-none focus:ring-2 focus:ring-emerald-500"
              />
            </div>

            <button
              onClick={submitPersonalLoan}
              className="w-full py-3 bg-gradient-to-r from-emerald-600 to-teal-600 text-white rounded-xl font-bold text-xs shadow-md active:scale-95 transition"
            >
              Apply for Personal Loan Account →
            </button>
          </div>
        )}
      </Sheet>

      {/* 5. STUDENT LOAN ACCOUNT SHEET */}
      <Sheet open={accountModal === "student_loan"} onClose={closeModal} title="Student Loan Account" icon="🎓">
        <div className="space-y-4">
          <div className="bg-gradient-to-r from-cyan-600 to-blue-700 rounded-2xl p-5 text-white">
            <span className="text-xs text-cyan-100 font-bold uppercase tracking-wider">Subsidized Student Rate</span>
            <div className="text-3xl font-black font-display my-1">8.0% p.a.</div>
            <p className="text-xs text-cyan-100">School & College fee direct institute transfer</p>
          </div>
          <div className="space-y-2 text-xs">
            <div className="flex justify-between p-2.5 bg-gray-50 rounded-xl">
              <span className="text-gray-500">Max Facility</span>
              <span className="font-bold text-gray-800">Up to ₹1,00,000</span>
            </div>
            <div className="flex justify-between p-2.5 bg-gray-50 rounded-xl">
              <span className="text-gray-500">Collateral Required</span>
              <span className="font-bold text-emerald-700">Zero (Bina Guarantee)</span>
            </div>
            <div className="flex justify-between p-2.5 bg-gray-50 rounded-xl">
              <span className="text-gray-500">Disbursal Method</span>
              <span className="font-bold text-gray-800">Direct School / Institute Account</span>
            </div>
          </div>
          <button
            onClick={() => { setAccountModal(null); setAccountModal("personal_loan"); }}
            className="w-full py-2.5 bg-cyan-600 hover:bg-cyan-700 text-white rounded-xl font-bold text-xs shadow-sm transition"
          >
            Apply for Fee Assistance →
          </button>
        </div>
      </Sheet>

      {/* 6. MICRO BUSINESS LOAN ACCOUNT SHEET */}
      <Sheet open={accountModal === "business_loan"} onClose={closeModal} title="Micro Business Loan Account" icon="🏬">
        <div className="space-y-4">
          <div className="bg-gradient-to-r from-amber-600 to-orange-700 rounded-2xl p-5 text-white">
            <span className="text-xs text-amber-100 font-bold uppercase tracking-wider">Vendor Working Capital</span>
            <div className="text-3xl font-black font-display my-1">₹5,000 - ₹50,000</div>
            <p className="text-xs text-amber-100">Fast 24-hr settlement for shopkeepers & vendors</p>
          </div>
          <div className="space-y-2 text-xs">
            <div className="flex justify-between p-2.5 bg-gray-50 rounded-xl">
              <span className="text-gray-500">Repayment Mode</span>
              <span className="font-bold text-gray-800">10-Day Easy Installments</span>
            </div>
            <div className="flex justify-between p-2.5 bg-gray-50 rounded-xl">
              <span className="text-gray-500">Approval Time</span>
              <span className="font-bold text-emerald-700">Same-Day Sanction</span>
            </div>
          </div>
          <button
            onClick={() => { setAccountModal(null); setAccountModal("personal_loan"); }}
            className="w-full py-2.5 bg-amber-600 hover:bg-amber-700 text-white rounded-xl font-bold text-xs shadow-sm transition"
          >
            Apply for Business Working Capital →
          </button>
        </div>
      </Sheet>

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
