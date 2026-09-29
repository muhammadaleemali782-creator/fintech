import { useState, useEffect, useCallback, useRef } from "react";
import QRCode from "qrcode";
import { Html5Qrcode } from "html5-qrcode";
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

// Helper: Calculate daily collection dates for micro business
const getUpcomingDailyDates = (count = 6) => {
  const dates = [];
  let cur = new Date();
  for (let i = 0; i < count; i++) {
    cur.setDate(cur.getDate() + 1);
    dates.push(new Date(cur));
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
  const [bonds, setBonds] = useState([]);
  const [showLoans, setShowLoans] = useState(false);
  const [toast, setToast] = useState({ text: "", type: "" });
  const [modal, setModal] = useState(null); // 'deposit' | 'withdraw' | 'profile' | 'my_qr' | 'send_money'
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
  const [qrDataUrl, setQrDataUrl] = useState("");

  const [depForm, setDepForm] = useState({ amount: "", method: "upi", utrNumber: "" });
  const [wdForm, setWdForm] = useState({ amount: "", method: "upi", upiId: "", accountNumber: "", ifsc: "" });
  
  // P2P Transfer State
  const [sendForm, setSendForm] = useState({ recipient: "", amount: "", notes: "" });
  const [recipientInfo, setRecipientInfo] = useState(null);
  const [lookingUp, setLookingUp] = useState(false);
  const [lookupError, setLookupError] = useState("");

  // Personal Loan Application State (₹5k-₹50k, 15-30 Easy Installments, 1.34% per installment)
  const [loanForm, setLoanForm] = useState({
    amount: 5000,
    hasChequeFacility: false,
    chequeNumber: "",
    installmentsCount: 15,
    purpose: "Personal Needs",
    aadharNumber: "",
    panNumber: "",
    bankAccountNumber: "",
    bankIfsc: "",
    upiId: ""
  });

  // Micro Business Loan State (Daily collection: 60d@18%, 80d@24%, 100d@30%, 120d@36%)
  const [mblForm, setMblForm] = useState({
    amount: 10000,
    days: 60,
    purpose: "Shop Inventory & Working Capital",
    businessName: "",
    aadharNumber: "",
    panNumber: "",
    bankAccountNumber: "",
    bankIfsc: ""
  });

  // Lending Bond Selection (40 or 80 months)
  const [lendingBondType, setLendingBondType] = useState("lending_40");

  const [cameraActive, setCameraActive] = useState(false);
  const [cameraError, setCameraError] = useState("");
  const qrScannerRef = useRef(null);

  const showToast = (text, type = "success") => setToast({ text, type });
  const closeModal = () => {
    if (qrScannerRef.current) {
      try {
        if (qrScannerRef.current.isScanning) {
          qrScannerRef.current.stop().catch(() => {});
        }
        qrScannerRef.current.clear();
      } catch (e) {}
      qrScannerRef.current = null;
    }
    setCameraActive(false);
    setCameraError("");
    setModal(null);
    setAccountModal(null);
  };

  const parseScannedQr = (text) => {
    if (!text) return "";
    let clean = text.trim();
    if (clean.includes("to=")) {
      const match = clean.match(/to=([^&]+)/);
      if (match && match[1]) return decodeURIComponent(match[1]);
    }
    if (clean.startsWith("upi://pay")) {
      const match = clean.match(/pa=([^&]+)/);
      if (match && match[1]) return decodeURIComponent(match[1]);
    }
    return clean.replace(/^educa:\/\/pay\?to=/i, "");
  };

  const handleScanSuccess = async (decodedText) => {
    const recipient = parseScannedQr(decodedText);
    if (qrScannerRef.current) {
      try {
        if (qrScannerRef.current.isScanning) {
          await qrScannerRef.current.stop();
        }
        qrScannerRef.current.clear();
      } catch (e) {}
      qrScannerRef.current = null;
    }
    setCameraActive(false);
    setSendForm(prev => ({ ...prev, recipient }));
    setModal("send_money");
    showToast(`QR Scanned: ${recipient}`, "success");
  };

  const handleGalleryQr = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const tempScanner = new Html5Qrcode("educa-qr-reader-temp");
      const decodedText = await tempScanner.scanFile(file, false);
      tempScanner.clear();
      handleScanSuccess(decodedText);
    } catch (err) {
      showToast("Is photo me valid QR code nahi mila. Dusri photo chunein.", "error");
    } finally {
      e.target.value = "";
    }
  };

  useEffect(() => {
    let mounted = true;
    if (modal === "scan_qr") {
      setCameraError("");
      const timer = setTimeout(() => {
        if (!mounted) return;
        const readerElem = document.getElementById("educa-qr-reader");
        if (readerElem) {
          const scanner = new Html5Qrcode("educa-qr-reader");
          qrScannerRef.current = scanner;
          scanner.start(
            { facingMode: "environment" },
            { fps: 10, qrbox: { width: 220, height: 220 } },
            (decodedText) => {
              if (mounted) handleScanSuccess(decodedText);
            },
            () => {}
          )
          .then(() => {
            if (mounted) setCameraActive(true);
          })
          .catch((err) => {
            console.warn("Camera start failed:", err);
            if (mounted) {
              setCameraActive(false);
              setCameraError("Camera open nahi hua. Permission allow karein ya Gallery option use karein.");
            }
          });
        }
      }, 350);

      return () => {
        mounted = false;
        clearTimeout(timer);
        if (qrScannerRef.current) {
          try {
            if (qrScannerRef.current.isScanning) {
              qrScannerRef.current.stop().catch(() => {});
            }
            qrScannerRef.current.clear();
          } catch (e) {}
          qrScannerRef.current = null;
        }
        setCameraActive(false);
      };
    }
  }, [modal]);

  const userUniqueId = userProfile.phone
    ? `EDUCA-${userProfile.referralCode || userProfile.phone}`
    : `EDUCA-${referralCode || "USER"}`;

  // Generate QR Code
  useEffect(() => {
    if (userUniqueId) {
      QRCode.toDataURL(`educa://pay?to=${userUniqueId}&name=${encodeURIComponent(userStored.name || "User")}`, {
        width: 250,
        margin: 2,
        color: { dark: "#0A192F", light: "#ffffff" }
      })
        .then(url => setQrDataUrl(url))
        .catch(() => {});
    }
  }, [userUniqueId, userStored.name]);

  // Recipient Auto-Lookup with Debounce
  useEffect(() => {
    const q = sendForm.recipient.trim();
    if (q.length < 4) {
      setRecipientInfo(null);
      setLookupError("");
      return;
    }
    const timer = setTimeout(async () => {
      setLookingUp(true);
      setLookupError("");
      try {
        const res = await fetch(`${API}/transaction/lookup/${encodeURIComponent(q)}`, { headers });
        const data = await res.json();
        if (res.ok) {
          setRecipientInfo(data);
          setLookupError("");
        } else {
          setRecipientInfo(null);
          setLookupError(data.message || "User nahi mila");
        }
      } catch {
        setLookupError("Checking recipient failed");
      } finally {
        setLookingUp(false);
      }
    }, 400);
    return () => clearTimeout(timer);
  }, [sendForm.recipient]);

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
      loadBonds();
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

  const loadBonds = async () => {
    try {
      const res = await fetch(`${API}/bond/my`, { headers });
      const data = await res.json();
      setBonds(Array.isArray(data) ? data : []);
    } catch {}
  };

  const loadCurrentRate = async () => {
    try {
      const res = await fetch(`${API}/loan/current-rate`);
      const data = await res.json();
      setCurrentRate(data.interestRate || 1.34);
    } catch {}
  };

  useEffect(() => {
    loadDashboard();
    loadCurrentRate();
    loadLoans();
    loadBonds();
  }, [loadDashboard]);

  // Personal Loan Calculations
  const isFirstTime = (userProfile.loansCount || 0) === 0;
  const maxLimit = isFirstTime
    ? (loanForm.hasChequeFacility ? 10000 : 5000)
    : (userProfile.loanLimit || 10000);

  const quoteAmount = Math.min(Math.max(Number(loanForm.amount) || 5000, 5000), maxLimit);
  const quoteCount = Math.min(Math.max(Number(loanForm.installmentsCount) || 15, 15), 30);
  const quoteRate = 1.34;
  const principalPerInstallment = quoteAmount / quoteCount;
  const interestPerInstallment = (quoteAmount * quoteRate) / 100;
  const installmentAmount = Math.round(principalPerInstallment + interestPerInstallment);
  const totalPayable = installmentAmount * quoteCount;
  const processingFee = Math.round(quoteAmount * 0.05); // 5%
  const upiCharges = Math.round(quoteAmount * 0.01); // 1%
  const advanceDeduction = installmentAmount; // 1st installment deducted upfront
  const disbursalAmount = Math.max(0, quoteAmount - (processingFee + upiCharges + advanceDeduction));
  const previewDates = getUpcomingDates(Math.min(quoteCount, 6));

  // Micro Business Loan Calculations (Daily collection)
  const mblAmount = Math.min(Math.max(Number(mblForm.amount) || 5000, 5000), 50000);
  const mblDays = Number(mblForm.days) || 60;
  const mblRateMap = { 60: 18, 80: 24, 100: 30, 120: 36 };
  const mblRate = mblRateMap[mblDays] || 18;
  const mblInterest = Math.round((mblAmount * mblRate) / 100);
  const mblTotalPayable = mblAmount + mblInterest;
  const mblDailyInstallment = Math.round(mblTotalPayable / mblDays);
  const mblPreviewDates = getUpcomingDailyDates(6);

  const copyText = (text) => {
    navigator.clipboard.writeText(text);
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

  // Submit P2P Transfer (App-to-App)
  const submitTransfer = async () => {
    const amt = Number(sendForm.amount);
    if (!amt || amt < 1 || !Number.isInteger(amt)) {
      return showToast("Valid amount daalein (minimum ₹1, bina decimals)", "error");
    }
    if (amt > balance) {
      return showToast(`Wallet me paryapt balance nahi hai. Available: ₹${balance.toLocaleString("en-IN")}`, "error");
    }
    if (!sendForm.recipient) {
      return showToast("Recipient Phone, Email ya Unique ID daalein", "error");
    }
    try {
      const res = await fetch(`${API}/transaction/transfer`, {
        method: "POST",
        headers,
        body: JSON.stringify({
          recipient: sendForm.recipient.trim(),
          amount: amt,
          notes: sendForm.notes.trim()
        })
      });
      const data = await res.json();
      if (res.ok) {
        showToast(data.message || "🎉 Transfer successful!", "success");
        closeModal();
        setSendForm({ recipient: "", amount: "", notes: "" });
        setRecipientInfo(null);
        loadDashboard();
      } else {
        showToast(data.message || "Transfer fail ho gaya", "error");
      }
    } catch {
      showToast("Network error transferring funds", "error");
    }
  };

  // Submit Personal Loan Application
  const submitPersonalLoan = async () => {
    if (!loanForm.aadharNumber || !loanForm.panNumber || !loanForm.bankAccountNumber) {
      return showToast("Kripya Aadhar, PAN aur Bank Account details darj karein", "error");
    }
    if (isFirstTime && loanForm.hasChequeFacility && !loanForm.chequeNumber) {
      return showToast("Kripya Cheque Number darj karein", "error");
    }

    try {
      const res = await fetch(`${API}/loan/apply`, {
        method: "POST",
        headers,
        body: JSON.stringify({
          loanType: "personal",
          amount: quoteAmount,
          installmentsCount: quoteCount,
          hasChequeFacility: isFirstTime ? !!loanForm.hasChequeFacility : false,
          chequeNumber: loanForm.chequeNumber,
          purpose: loanForm.purpose || "Personal Needs",
          documents: {
            aadharNumber: loanForm.aadharNumber,
            panNumber: loanForm.panNumber,
            bankAccountNumber: loanForm.bankAccountNumber,
            bankIfsc: loanForm.bankIfsc,
            upiId: loanForm.upiId,
            chequeNumber: loanForm.chequeNumber
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

  // Submit Micro Business Loan Application
  const submitMicroBusinessLoan = async () => {
    if (!mblForm.aadharNumber || !mblForm.panNumber || !mblForm.bankAccountNumber) {
      return showToast("Kripya Aadhar, PAN aur Bank Account details darj karein", "error");
    }

    try {
      const res = await fetch(`${API}/loan/apply`, {
        method: "POST",
        headers,
        body: JSON.stringify({
          loanType: "micro_business",
          amount: mblAmount,
          days: mblDays,
          purpose: mblForm.purpose || "Micro Business Working Capital",
          documents: {
            aadharNumber: mblForm.aadharNumber,
            panNumber: mblForm.panNumber,
            bankAccountNumber: mblForm.bankAccountNumber,
            bankIfsc: mblForm.bankIfsc,
            businessName: mblForm.businessName
          }
        })
      });
      const data = await res.json();
      if (res.ok) {
        showToast(data.message || "Micro Business Loan application submitted!", "success");
        closeModal();
        loadLoans();
        loadDashboard();
      } else {
        showToast(data.message || "Failed to submit business loan", "error");
      }
    } catch {
      showToast("Network error submitting business loan", "error");
    }
  };

  // Create 365-Day Fixed Bond (Debit)
  const createDebitBond = async () => {
    if (balance < 100000) {
      return showToast("1 Lakh ka bond banane ke liye wallet me kam se kam ₹1,00,000 hona chahiye", "error");
    }
    if (!window.confirm("₹1,00,000 ka 365-Day Fixed Bond lock karein? Maturity par ₹1,18,000 Profit Wallet me add hoga.")) return;
    try {
      const res = await fetch(`${API}/bond/create`, {
        method: "POST",
        headers,
        body: JSON.stringify({ bondType: "debit_365", amount: 100000 })
      });
      const data = await res.json();
      if (res.ok) {
        showToast("🎉 365-Day Bond created! ₹1,18,000 maturity scheduled.", "success");
        loadDashboard();
        loadBonds();
      } else {
        showToast(data.message || "Failed to create bond", "error");
      }
    } catch {
      showToast("Network error creating bond", "error");
    }
  };

  // Create Lending Monthly Bond (40 or 80 Months)
  const createLendingBond = async (type = "lending_40") => {
    if (balance < 100000) {
      return showToast("Lending Bond banane ke liye wallet me kam se kam ₹1,00,000 hona chahiye", "error");
    }
    const msg = type === "lending_40"
      ? "₹1,00,000 ka 40 Months Lending Bond lock karein? (₹1,40,000 return @ ₹3,500/month)"
      : "₹1,00,000 ka 80 Months Lending Bond lock karein? (₹1,80,000 return @ ₹2,250/month)";
    if (!window.confirm(msg)) return;
    try {
      const res = await fetch(`${API}/bond/create`, {
        method: "POST",
        headers,
        body: JSON.stringify({ bondType: type, amount: 100000 })
      });
      const data = await res.json();
      if (res.ok) {
        showToast(data.message || "🎉 Lending Bond created successfully!", "success");
        loadDashboard();
        loadBonds();
      } else {
        showToast(data.message || "Failed to create lending bond", "error");
      }
    } catch {
      showToast("Network error creating lending bond", "error");
    }
  };

  // Pay Easy Installment
  const payInstallment = async (id, instAmount) => {
    if (!window.confirm(`Pay Easy Installment of ₹${instAmount}?`)) return;
    const res = await fetch(`${API}/loan/${id}/pay-installment`, { method: "POST", headers });
    const data = await res.json();
    showToast(data.message, res.ok ? "success" : "error");
    if (res.ok) { loadLoans(); loadDashboard(); }
  };

  // Settle & Close Loan Early in Full
  const closeLoanEarly = async (id, payoffAmount) => {
    if (!window.confirm(`Kya aap loan ko ₹${payoffAmount.toLocaleString("en-IN")} me early payoff karke close karna chahte hain?`)) return;
    try {
      const res = await fetch(`${API}/loan/${id}/close-early`, { method: "POST", headers });
      const data = await res.json();
      if (res.ok) {
        showToast("🎉 Loan full payoff ho kar close ho gaya! Limit upgrade ho chuki hai.", "success");
        loadLoans();
        loadDashboard();
      } else {
        showToast(data.message || "Early closure fail ho gaya", "error");
      }
    } catch {
      showToast("Network error during early closure", "error");
    }
  };

  const logout = () => { localStorage.clear(); window.location.href = "/"; };

  const activePersonalLoan = loans.find(l => (l.status === "active" || l.status === "pending" || l.status === "approved") && l.loanType === "personal");
  const activeBusinessLoan = loans.find(l => (l.status === "active" || l.status === "pending" || l.status === "approved") && l.loanType === "micro_business");

  const quickActions = [
    { icon: "📱", label: "My QR Code", sub: "Scan to receive", color: "bg-blue-100", action: () => setModal("my_qr") },
    { icon: "⚡", label: "Send Money", sub: "Instant P2P", color: "bg-emerald-100", action: () => setModal("send_money") },
    { icon: "🏦", label: "Personal Loan", sub: "10-day cycle", color: "bg-purple-100", action: () => setAccountModal("personal_loan") },
    { icon: "🏬", label: "Business Loan", sub: "Daily collection", color: "bg-amber-100", action: () => setAccountModal("business_loan") },
  ];

  const navItems = [
    { key: "home", label: "Home", icon: "🏠", onClick: () => { setShowLoans(false); window.scrollTo({ top: 0, behavior: "smooth" }); } },
    { key: "pay", label: "Scan & Pay", icon: "📷", onClick: () => setModal("send_money") },
    { key: "loans", label: "Loans", icon: "🏦", onClick: loadLoans },
    { key: "profile", label: "Profile", icon: "👤", onClick: () => setModal("profile") },
  ];

  return (
    <div className="bg-gray-50 min-h-[100dvh] pb-safe-nav sm:pb-0 font-sans">
      {/* NAVBAR */}
      <nav className="bg-white shadow-sm sticky top-0 z-30 border-b border-gray-100 safe-top">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-3.5 sm:py-4 flex justify-between items-center">
          <div className="flex items-center gap-2.5">
            <span className="text-2xl">🎓</span>
            <div>
              <h1 className="text-lg sm:text-xl font-black font-display bg-gradient-to-r from-blue-600 to-cyan-600 bg-clip-text text-transparent leading-none">
                Educa Finance
              </h1>
              <span className="text-[10px] font-mono text-gray-500 font-bold tracking-wider">
                ID: {userUniqueId}
              </span>
            </div>
          </div>
          <div className="flex items-center gap-2 sm:gap-3">
            <button
              onClick={() => setModal("scan_qr")}
              className="px-2.5 sm:px-3 py-1.5 bg-emerald-50 hover:bg-emerald-100 text-emerald-700 rounded-xl font-bold text-xs flex items-center gap-1.5 transition active:scale-95 border border-emerald-200"
            >
              <span>📷</span> <span className="hidden sm:inline">Scan</span> QR
            </button>
            <button
              onClick={() => setModal("my_qr")}
              className="px-2.5 sm:px-3 py-1.5 bg-blue-50 hover:bg-blue-100 text-[#1D6AE5] rounded-xl font-bold text-xs flex items-center gap-1.5 transition active:scale-95 border border-blue-200"
            >
              <span>💳</span> <span className="hidden sm:inline">My</span> QR
            </button>
            <div className="text-right hidden sm:block">
              <p className="text-xs text-gray-400">Welcome</p>
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
              <button onClick={() => setModal("scan_qr")} className="flex-1 py-2 bg-emerald-400 hover:bg-emerald-300 text-gray-950 rounded-xl font-black text-xs hover:shadow-md active:scale-95 transition-all flex items-center justify-center gap-1">
                <span>📷</span> Scan QR
              </button>
              <button onClick={() => setModal("send_money")} className="flex-1 py-2 bg-white text-blue-700 rounded-xl font-bold text-xs hover:shadow-md active:scale-95 transition-all">
                ⚡ Send
              </button>
              <button onClick={() => setModal("deposit")} className="flex-1 py-2 bg-white/20 backdrop-blur text-white border border-white/30 rounded-xl font-bold text-xs hover:bg-white/30 active:scale-95 transition-all">
                + Add
              </button>
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
              <p className="text-emerald-100/90 text-xs mb-4">365-Day Bond (₹18k profit), yield & referral rewards</p>
            </div>
            <div className="pt-2 border-t border-emerald-500/40 flex justify-between items-center text-xs text-emerald-100 relative z-10">
              <span>Savings Yield: <strong>{userProfile.interestRate || currentRate}% APY</strong></span>
              <button onClick={() => setAccountModal("debt")} className="text-xs font-bold underline hover:text-white">View Bonds →</button>
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
              <span>Cycle: <strong>1st, 11th & 21st (or Daily)</strong></span>
              <button onClick={() => setAccountModal("debt")} className="text-xs font-bold underline hover:text-white">View Details →</button>
            </div>
          </div>
        </div>

        {/* QUICK ACTIONS ROW */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 sm:gap-4 mb-6 sm:mb-8">
          {quickActions.map(({ icon, label, sub, color, action }) => (
            <div key={label} onClick={action} className="bg-white p-4 sm:p-5 rounded-2xl shadow-sm hover:shadow-xl active:scale-[0.98] cursor-pointer transition-all sm:hover:-translate-y-1 border border-gray-100">
              <div className={`w-11 h-11 sm:w-12 sm:h-12 ${color} rounded-xl flex items-center justify-center text-xl sm:text-2xl mb-2.5 sm:mb-3`}>{icon}</div>
              <h3 className="font-bold text-sm text-gray-800">{label}</h3>
              <p className="text-xs text-gray-400 mt-0.5">{sub}</p>
            </div>
          ))}
        </div>

        {/* ══════════════════════════════════════════════════════
            6 MODULAR ACCOUNTS SECTION (CLICK TO VIEW FULL DATA)
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
                    Primary Cash
                  </span>
                </div>
                <h4 className="font-extrabold text-base text-gray-900">Wallet Account</h4>
                <p className="text-xs text-gray-500 mt-1 mb-3">
                  Available cash balance, QR payments, instant app-to-app transfer aur statement.
                </p>
              </div>
              <div className="pt-3 border-t border-gray-100 flex items-center justify-between text-xs">
                <span className="font-bold text-gray-900">₹{balance.toLocaleString("en-IN")}</span>
                <span className="text-[#1D6AE5] font-bold">Open Account →</span>
              </div>
            </div>

            {/* 2. Debt Account (Dues & 365-Day 1 Lakh Bond) */}
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
                    365-Day Bond
                  </span>
                </div>
                <h4 className="font-extrabold text-base text-gray-900">Debt & Bond Account</h4>
                <p className="text-xs text-gray-500 mt-1 mb-3">
                  1 Lakh ka 365-Day Bond (₹1,18,000 profit return) aur pending loan dues.
                </p>
              </div>
              <div className="pt-3 border-t border-gray-100 flex items-center justify-between text-xs">
                <span className="font-bold text-rose-600">₹{(userProfile.duesBalance || 0).toLocaleString("en-IN")} Due</span>
                <span className="text-rose-600 font-bold">Open Bonds & Dues →</span>
              </div>
            </div>

            {/* 3. Lending Account (40 & 80 Months Monthly Return Bonds) */}
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
                    Monthly Payouts
                  </span>
                </div>
                <h4 className="font-extrabold text-base text-gray-900">Lending Account</h4>
                <p className="text-xs text-gray-500 mt-1 mb-3">
                  1 Lakh par ₹1,40,000 (₹3,500/mo x 40m) ya ₹1,80,000 (80m) monthly payouts.
                </p>
              </div>
              <div className="pt-3 border-t border-gray-100 flex items-center justify-between text-xs">
                <span className="font-bold text-purple-700">₹3,500/mo Returns</span>
                <span className="text-purple-600 font-bold">Open Lending →</span>
              </div>
            </div>

            {/* 4. Personal Loan Account (5k-50k, 10-day cycle, Cheque facility) */}
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
                    {activePersonalLoan ? (activePersonalLoan.accountNumber || "EFSPL0001") : "₹5k-₹50k"}
                  </span>
                </div>
                <h4 className="font-extrabold text-base text-gray-900">Personal Loan Account</h4>
                <p className="text-xs text-gray-500 mt-1 mb-3">
                  {activePersonalLoan
                    ? `Active: ${activePersonalLoan.accountNumber} • Early payoff option available.`
                    : `1st time: ₹5k without cheque / ₹10k with cheque. Min 15 Easy Installments.`}
                </p>
              </div>
              <div className="pt-3 border-t border-emerald-200/60 flex items-center justify-between text-xs">
                <span className="font-bold text-emerald-800">
                  {activePersonalLoan ? `₹${activePersonalLoan.amount.toLocaleString("en-IN")}` : `Limit ₹${maxLimit.toLocaleString("en-IN")}`}
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

            {/* 6. Micro Business Loan Account (Daily Collection) */}
            <div
              onClick={() => setAccountModal("business_loan")}
              className="p-5 rounded-2xl border-2 border-amber-500/50 bg-amber-50/20 hover:border-amber-600 shadow-xs hover:shadow-md transition cursor-pointer flex flex-col justify-between"
            >
              <div>
                <div className="flex justify-between items-start mb-3">
                  <div className="w-11 h-11 rounded-xl bg-amber-100 text-amber-800 flex items-center justify-center text-xl">
                    🏬
                  </div>
                  <span className="px-2.5 py-0.5 rounded-full text-[11px] font-black bg-amber-100 text-amber-800">
                    {activeBusinessLoan ? "Daily Active" : "Daily Collection"}
                  </span>
                </div>
                <h4 className="font-extrabold text-base text-gray-900">Micro Business Loan Account</h4>
                <p className="text-xs text-gray-500 mt-1 mb-3">
                  Daily collection mode: 60d (18%), 80d (24%), 100d (30%), 120d (36%) interest tiers.
                </p>
              </div>
              <div className="pt-3 border-t border-amber-200/60 flex items-center justify-between text-xs">
                <span className="font-bold text-amber-800">
                  {activeBusinessLoan ? `₹${activeBusinessLoan.installmentAmount}/day` : "₹5k - ₹50k Daily"}
                </span>
                <span className="text-amber-700 font-bold">
                  {activeBusinessLoan ? "View Daily Loan →" : "Apply Daily Loan →"}
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* ══════════════════════════════════════════════════════
            MY LOANS SECTION (STRICTLY 'EASY INSTALLMENTS' & EARLY CLOSURE)
        ══════════════════════════════════════════════════════ */}
        {showLoans && (
          <div className="bg-white rounded-2xl shadow-sm p-5 sm:p-6 mb-6 sm:mb-8 border border-gray-100">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-lg font-bold font-display">My Active Loans</h3>
              <button onClick={() => setShowLoans(false)} className="text-xs text-gray-400 hover:text-gray-600">Hide</button>
            </div>
            {loans.length === 0 ? <p className="text-gray-400 text-center py-8 text-sm">No active loans found</p> : (
              <div className="space-y-4">
                {loans.map(l => {
                  const progress = l.totalPayable ? (l.paidAmount / l.totalPayable) * 100 : 0;
                  const instAmt = l.installmentAmount || l.emiAmount || 0;
                  const payoffAmt = l.remainingAmount || (l.totalPayable - l.paidAmount);
                  const isDaily = l.collectionFrequency === "daily";
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
                            <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-gray-100 text-gray-700">
                              {isDaily ? "Daily Collection" : "10-Day Cycle"}
                            </span>
                          </div>
                          <p className="text-xs text-gray-500 mt-0.5">
                            {l.purpose || "Loan"} • {isDaily ? `${l.dailyTenureDays || l.installmentsCount} Days @ ${l.interestRate}%` : `${l.installmentsCount} Easy Installments @ 1.34%/kist`}
                          </p>
                        </div>
                        <StatusBadge status={l.status} />
                      </div>
                      <div className="grid grid-cols-3 gap-2 sm:gap-3 text-sm mb-3">
                        <div><p className="text-gray-400 text-xs">{isDaily ? "Daily Kist" : "Easy Installment"}</p><p className="font-bold">₹{instAmt}</p></div>
                        <div><p className="text-gray-400 text-xs">Total Duration</p><p className="font-bold">{l.installmentsCount || l.tenure} {isDaily ? "Days" : "Installments"}</p></div>
                        <div><p className="text-gray-400 text-xs">Remaining Dues</p><p className="font-bold text-rose-600">₹{payoffAmt}</p></div>
                      </div>
                      <div className="w-full bg-gray-100 rounded-full h-2 mb-3">
                        <div className="bg-gradient-to-r from-blue-500 to-cyan-500 h-2 rounded-full transition-all" style={{ width: `${progress}%` }} />
                      </div>
                      {l.status === "active" && (
                        <div className="flex gap-2">
                          <button onClick={() => payInstallment(l._id, instAmt)} className="flex-1 py-2.5 bg-gradient-to-r from-blue-600 to-cyan-600 text-white rounded-xl font-bold text-xs hover:shadow-lg active:scale-[0.98] transition">
                            Pay Kist ₹{instAmt}
                          </button>
                          <button onClick={() => closeLoanEarly(l._id, payoffAmt)} className="px-4 py-2.5 bg-emerald-50 hover:bg-emerald-100 text-emerald-800 rounded-xl font-bold text-xs border border-emerald-300 transition active:scale-[0.98]">
                            ⚡ Full Payoff (₹{payoffAmt})
                          </button>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* TRANSACTIONS SECTION */}
        <div className="bg-white rounded-2xl shadow-sm p-5 sm:p-6 border border-gray-100">
          <div className="flex justify-between items-center mb-4 sm:mb-5">
            <h3 className="text-lg font-bold font-display">Recent Transactions</h3>
            <span className="text-xs text-gray-400">{txns.length} records</span>
          </div>

          {txns.length === 0 ? (
            <p className="py-8 text-center text-gray-300 text-sm">No transactions yet</p>
          ) : (
            <div className="space-y-3">
              {txns.slice(0, 10).map(t => {
                const isCredit = t.type === "deposit" || t.type === "transfer_received" || t.type === "bond_payout" || t.type === "loan_disbursal";
                return (
                  <div key={t._id} className="flex items-center justify-between border border-gray-100 rounded-xl p-3.5 hover:bg-gray-50/50 transition">
                    <div className="flex items-center gap-3">
                      <div className={`w-9 h-9 rounded-full flex items-center justify-center text-lg shrink-0 ${isCredit ? "bg-green-50" : "bg-red-50"}`}>
                        {isCredit ? "🟢" : "🔴"}
                      </div>
                      <div>
                        <p className="font-semibold text-sm capitalize">
                          {t.type.replace(/_/g, " ")} <span className="text-gray-400 font-normal uppercase text-[10px]">{t.method}</span>
                        </p>
                        <p className="text-xs text-gray-400">
                          {new Date(t.createdAt).toLocaleDateString("en-IN")} • {t.remarks || t.recipientIdentifier || ""}
                        </p>
                      </div>
                    </div>
                    <div className="text-right">
                      <p className={`font-bold text-sm ${isCredit ? "text-green-600" : "text-red-500"}`}>
                        {isCredit ? "+" : "-"}₹{t.amount.toLocaleString("en-IN")}
                      </p>
                      <StatusBadge status={t.status} />
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* ══════════════════════════════════════════════════════
          1. MY QR CODE SHEET
      ══════════════════════════════════════════════════════ */}
      <Sheet open={modal === "my_qr"} onClose={closeModal} title="My Educa QR Code" icon="📱">
        <div className="text-center space-y-4">
          <p className="text-xs text-gray-500">
            Kisi bhi Educa User se instant paise mangwane ke liye yeh QR Code scan karwayen:
          </p>
          <div className="p-4 bg-white rounded-3xl border-2 border-gray-200 shadow-lg inline-block mx-auto">
            {qrDataUrl ? (
              <img src={qrDataUrl} alt="Educa QR" className="w-56 h-56 mx-auto rounded-xl" />
            ) : (
              <div className="w-56 h-56 flex items-center justify-center text-xs text-gray-400">Generating QR...</div>
            )}
          </div>
          <div className="bg-gray-50 rounded-2xl p-3 text-xs space-y-1">
            <div className="font-bold text-gray-900 text-sm">{userStored.name || "User"}</div>
            <div className="font-mono text-blue-700 font-bold tracking-wider">{userUniqueId}</div>
            <div className="text-gray-500">{userProfile.phone || userStored.email}</div>
          </div>
          <button
            onClick={() => copyText(userUniqueId)}
            className="w-full py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-bold text-xs shadow-md transition active:scale-95"
          >
            {copied ? "✅ Payment ID Copied!" : "📋 Copy Payment ID"}
          </button>
        </div>
      </Sheet>

      {/* ══════════════════════════════════════════════════════
          SCAN QR CODE SHEET (CAMERA + GALLERY)
      ══════════════════════════════════════════════════════ */}
      <Sheet open={modal === "scan_qr"} onClose={closeModal} title="Scan QR Code" icon="📷">
        <div className="space-y-4">
          <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-3 text-xs text-emerald-900">
            📸 Phone camera se QR scan karein ya phone ki <strong>Gallery</strong> se QR image chunein.
          </div>

          {/* Scanner Viewport */}
          <div className="relative rounded-2xl overflow-hidden bg-slate-900 border-2 border-slate-700 min-h-[260px] flex items-center justify-center">
            <div id="educa-qr-reader" className="w-full h-full min-h-[260px]" />
            {!cameraActive && !cameraError && (
              <div className="absolute inset-0 flex flex-col items-center justify-center text-slate-300 gap-2 bg-slate-900/90 p-4 text-center">
                <div className="w-8 h-8 border-4 border-emerald-400 border-t-transparent rounded-full animate-spin" />
                <span className="text-xs font-semibold">Camera shuru ho raha hai...</span>
              </div>
            )}
            {cameraError && (
              <div className="absolute inset-0 flex flex-col items-center justify-center text-amber-300 gap-2 bg-slate-900/95 p-6 text-center">
                <span className="text-2xl">⚠️</span>
                <span className="text-xs font-medium text-slate-200">{cameraError}</span>
              </div>
            )}
          </div>

          {/* Gallery Pick Option */}
          <div className="space-y-2">
            <input
              type="file"
              id="gallery-qr-upload"
              accept="image/*"
              className="hidden"
              onChange={handleGalleryQr}
            />
            <button
              type="button"
              onClick={() => document.getElementById("gallery-qr-upload")?.click()}
              className="w-full py-3 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white rounded-xl font-bold text-xs flex items-center justify-center gap-2 shadow-md transition active:scale-95"
            >
              <span>🖼️</span> Gallery se QR Code Photo Chunein
            </button>
            <p className="text-[11px] text-gray-400 text-center">
              Screenshot ya gallery se QR image select karke auto-fill karein.
            </p>
          </div>

          {/* Temporary hidden container for scanning gallery files */}
          <div id="educa-qr-reader-temp" style={{ display: "none" }} />
        </div>
      </Sheet>

      {/* ══════════════════════════════════════════════════════
          2. SEND MONEY / P2P TRANSFER SHEET
      ══════════════════════════════════════════════════════ */}
      <Sheet open={modal === "send_money"} onClose={closeModal} title="Send Money (App-to-App)" icon="⚡">
        <div className="space-y-4">
          <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-3 text-xs text-emerald-900">
            ⚡ <strong>Instant Wallet Transfer:</strong> Kisi bhi user ke Phone Number, Unique ID ya Email par seedha transfer karein.
          </div>

          <div>
            <div className="flex justify-between items-center mb-1">
              <label className="text-xs font-bold text-gray-700">Recipient Phone / Unique ID / Email</label>
              <button
                type="button"
                onClick={() => setModal("scan_qr")}
                className="text-xs font-bold text-emerald-600 hover:text-emerald-700 flex items-center gap-1 bg-emerald-50 px-2 py-0.5 rounded-lg border border-emerald-200 transition active:scale-95"
              >
                <span>📷</span> Scan QR / Gallery
              </button>
            </div>
            <input
              type="text"
              placeholder="e.g. 9876543210 ya EDUCA-EFUSR1234"
              value={sendForm.recipient}
              onChange={e => setSendForm({ ...sendForm, recipient: e.target.value })}
              className="w-full px-3.5 py-2.5 border border-gray-200 rounded-xl text-xs outline-none focus:ring-2 focus:ring-emerald-500"
            />
            {lookingUp && <p className="text-[11px] text-blue-600 mt-1">Checking recipient...</p>}
            {recipientInfo && (
              <div className="p-2.5 bg-green-50 border border-green-200 rounded-lg text-xs text-green-800 font-bold mt-1.5 flex items-center justify-between">
                <span>Paying to: {recipientInfo.name}</span>
                <span className="font-mono text-[10px] text-green-700">✓ Verified</span>
              </div>
            )}
            {lookupError && <p className="text-[11px] text-red-500 mt-1">{lookupError}</p>}
          </div>

          <div>
            <div className="flex justify-between text-xs font-bold mb-1">
              <span className="text-gray-700">Amount (₹)</span>
              <span className="text-gray-400">Available: ₹{balance.toLocaleString("en-IN")}</span>
            </div>
            <input
              type="number"
              inputMode="numeric"
              placeholder="Transfer amount"
              value={sendForm.amount}
              onChange={e => setSendForm({ ...sendForm, amount: e.target.value })}
              className="w-full px-3.5 py-2.5 border border-gray-200 rounded-xl text-xs outline-none focus:ring-2 focus:ring-emerald-500 font-bold text-base"
            />
          </div>

          <div>
            <label className="block text-xs font-bold text-gray-700 mb-1">Remarks / Note (Optional)</label>
            <input
              type="text"
              placeholder="e.g. For dinner, fees, etc."
              value={sendForm.notes}
              onChange={e => setSendForm({ ...sendForm, notes: e.target.value })}
              className="w-full px-3.5 py-2.5 border border-gray-200 rounded-xl text-xs outline-none focus:ring-2 focus:ring-emerald-500"
            />
          </div>

          <button
            onClick={submitTransfer}
            className="w-full py-3 bg-gradient-to-r from-emerald-600 to-teal-600 text-white rounded-xl font-bold text-xs shadow-md active:scale-95 transition"
          >
            Send Money Now →
          </button>
        </div>
      </Sheet>

      {/* ══════════════════════════════════════════════════════
          3. PERSONAL LOAN ACCOUNT SHEET & APPLICATION
      ══════════════════════════════════════════════════════ */}
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
              <p className="text-xs text-emerald-100">Sanctioned: ₹{activePersonalLoan.amount.toLocaleString("en-IN")}</p>
            </div>

            <div className="border border-gray-100 rounded-2xl p-4 bg-gray-50 space-y-2 text-xs">
              <div className="flex justify-between"><span className="text-gray-500">Tenure:</span><span className="font-bold">{activePersonalLoan.installmentsCount || activePersonalLoan.tenure} Easy Installments</span></div>
              <div className="flex justify-between"><span className="text-gray-500">Cycle:</span><span className="font-bold">10 Days (1st, 11th, 21st)</span></div>
              <div className="flex justify-between"><span className="text-gray-500">Per Installment:</span><span className="font-bold text-emerald-700">₹{activePersonalLoan.installmentAmount || activePersonalLoan.emiAmount}</span></div>
              <div className="flex justify-between"><span className="text-gray-500">Remaining Balance:</span><span className="font-bold text-rose-600">₹{activePersonalLoan.remainingAmount || activePersonalLoan.amount}</span></div>
            </div>

            {activePersonalLoan.status === "active" && (
              <div className="space-y-2">
                <button
                  onClick={() => payInstallment(activePersonalLoan._id, activePersonalLoan.installmentAmount || activePersonalLoan.emiAmount)}
                  className="w-full py-3 bg-gradient-to-r from-blue-600 to-indigo-600 text-white rounded-xl font-bold text-xs shadow-md active:scale-95 transition"
                >
                  Pay Next Easy Installment (₹{activePersonalLoan.installmentAmount || activePersonalLoan.emiAmount})
                </button>
                <div className="p-3 bg-amber-50 border border-amber-200 rounded-xl text-[11px] text-amber-900">
                  ⚡ <strong>Loan Early Closure:</strong> 9th installment se pehle pura loan close karne par agent ko 1:1 profit bonus milta hai aur limit turant double ho jaati hai!
                </div>
                <button
                  onClick={() => closeLoanEarly(activePersonalLoan._id, activePersonalLoan.remainingAmount || activePersonalLoan.amount)}
                  className="w-full py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl font-bold text-xs shadow-sm active:scale-95 transition"
                >
                  Close Loan Early (Payoff ₹{activePersonalLoan.remainingAmount || activePersonalLoan.amount}) →
                </button>
              </div>
            )}
          </div>
        ) : (
          /* APPLY PERSONAL LOAN */
          <div className="space-y-4">
            <div className="bg-blue-50 border border-blue-200 rounded-xl p-3 text-xs text-blue-900 space-y-1">
              <div>⚡ <strong>Amount:</strong> ₹5,000 se ₹50,000 tak.</div>
              <div>📝 <strong>1st Time:</strong> ₹5,000 bina cheque, ₹10,000 cheque facility ke sath.</div>
              <div>📅 <strong>Tenure:</strong> Minimum 15 Easy Installments (10-din cycle: 1, 11, 21 tareekh).</div>
            </div>

            {/* Cheque Facility Toggle for 1st-Time Borrowers */}
            {isFirstTime && (
              <div className="p-3.5 bg-purple-50 border border-purple-200 rounded-xl space-y-2">
                <label className="flex items-center gap-2 cursor-pointer text-xs font-bold text-purple-900">
                  <input
                    type="checkbox"
                    checked={loanForm.hasChequeFacility}
                    onChange={e => setLoanForm({ ...loanForm, hasChequeFacility: e.target.checked, amount: e.target.checked ? 10000 : 5000 })}
                    className="w-4 h-4 text-purple-600 rounded cursor-pointer"
                  />
                  <span>Use Cheque Facility (Unlock up to ₹10,000 limit)</span>
                </label>
                {loanForm.hasChequeFacility && (
                  <input
                    type="text"
                    placeholder="Cheque Number (e.g. CHQ123456)"
                    value={loanForm.chequeNumber}
                    onChange={e => setLoanForm({ ...loanForm, chequeNumber: e.target.value })}
                    className="w-full px-3 py-2 bg-white border border-purple-300 rounded-lg text-xs outline-none"
                  />
                )}
              </div>
            )}

            {/* Amount Slider */}
            <div>
              <div className="flex justify-between text-xs font-bold mb-1">
                <span className="text-gray-700">Loan Amount:</span>
                <span className="font-mono text-emerald-700 text-sm">₹{quoteAmount.toLocaleString("en-IN")}</span>
              </div>
              <input
                type="range"
                min="5000"
                max={maxLimit}
                step="1000"
                value={quoteAmount}
                onChange={e => setLoanForm({ ...loanForm, amount: Number(e.target.value) })}
                className="w-full accent-emerald-600 cursor-pointer"
              />
              <div className="flex justify-between text-[10px] text-gray-400 mt-0.5">
                <span>Min ₹5,000</span>
                <span>Max Eligible ₹{maxLimit.toLocaleString("en-IN")}</span>
              </div>
            </div>

            {/* Installments Slider (Min 15, Max 30) */}
            <div>
              <div className="flex justify-between text-xs font-bold mb-1">
                <span className="text-gray-700">Easy Installments Count:</span>
                <span className="font-mono text-blue-700 text-sm">{quoteCount} Installments</span>
              </div>
              <input
                type="range"
                min="15"
                max="30"
                step="1"
                value={quoteCount}
                onChange={e => setLoanForm({ ...loanForm, installmentsCount: Number(e.target.value) })}
                className="w-full accent-blue-600 cursor-pointer"
              />
              <div className="flex justify-between text-[10px] text-gray-400 mt-0.5">
                <span>Min 15 Installments</span>
                <span>Max 30 Installments</span>
              </div>
            </div>

            {/* Live Auto-Disbursal Breakdown */}
            <div className="bg-gray-50 border border-gray-200 rounded-2xl p-3.5 space-y-1.5 text-xs">
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
                <span>- 1% UPI/Cash Charge:</span>
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

            {/* Upcoming Collection Dates */}
            <div className="p-2.5 bg-blue-50/60 rounded-xl text-[11px] text-blue-900">
              <span className="font-bold">10-Day Cycle Dates: </span>
              {previewDates.map(d => `${d.getDate()}/${d.getMonth()+1}`).join(", ")}... (Every 1st, 11th, 21st)
            </div>

            {/* Document Verification Inputs */}
            <div className="space-y-2.5 pt-2 border-t border-gray-100">
              <input
                type="text"
                placeholder="Aadhar Number (12 digits)"
                value={loanForm.aadharNumber}
                onChange={e => setLoanForm({ ...loanForm, aadharNumber: e.target.value })}
                className="w-full px-3.5 py-2.5 border border-gray-200 rounded-xl text-xs outline-none focus:ring-2 focus:ring-emerald-500"
              />
              <input
                type="text"
                placeholder="PAN Number (ABCDE1234F)"
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

      {/* ══════════════════════════════════════════════════════
          4. MICRO BUSINESS LOAN (DAILY COLLECTION: 60/80/100/120 DAYS)
      ══════════════════════════════════════════════════════ */}
      <Sheet open={accountModal === "business_loan"} onClose={closeModal} title="Micro Business Loan (Daily Collection)" icon="🏬">
        {activeBusinessLoan ? (
          <div className="space-y-4">
            <div className="bg-gradient-to-r from-amber-600 to-orange-700 rounded-2xl p-5 text-white">
              <span className="text-xs uppercase tracking-wider text-amber-100 font-bold">Active Daily Loan</span>
              <div className="text-2xl font-black font-mono my-1">{activeBusinessLoan.accountNumber}</div>
              <p className="text-xs text-amber-100">Amount: ₹{activeBusinessLoan.amount.toLocaleString("en-IN")}</p>
            </div>
            <div className="p-4 bg-gray-50 rounded-2xl space-y-2 text-xs border border-gray-200">
              <div className="flex justify-between"><span>Daily Installment:</span><span className="font-bold text-amber-700">₹{activeBusinessLoan.installmentAmount}/day</span></div>
              <div className="flex justify-between"><span>Duration:</span><span className="font-bold">{activeBusinessLoan.dailyTenureDays || activeBusinessLoan.installmentsCount} Days</span></div>
              <div className="flex justify-between"><span>Remaining Dues:</span><span className="font-bold text-rose-600">₹{activeBusinessLoan.remainingAmount}</span></div>
            </div>
            {activeBusinessLoan.status === "active" && (
              <button
                onClick={() => payInstallment(activeBusinessLoan._id, activeBusinessLoan.installmentAmount)}
                className="w-full py-3 bg-amber-600 hover:bg-amber-700 text-white rounded-xl font-bold text-xs shadow-md active:scale-95 transition"
              >
                Pay Daily Kist (₹{activeBusinessLoan.installmentAmount})
              </button>
            )}
          </div>
        ) : (
          <div className="space-y-4">
            <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 text-xs text-amber-900">
              🏬 <strong>Daily Collection Tiers:</strong><br />
              60 Days → 18% | 80 Days → 24% | 100 Days → 30% | 120 Days → 36%
            </div>

            {/* Amount Slider */}
            <div>
              <div className="flex justify-between text-xs font-bold mb-1">
                <span className="text-gray-700">Business Capital:</span>
                <span className="font-mono text-amber-700 text-sm">₹{mblAmount.toLocaleString("en-IN")}</span>
              </div>
              <input
                type="range"
                min="5000"
                max="50000"
                step="1000"
                value={mblAmount}
                onChange={e => setMblForm({ ...mblForm, amount: Number(e.target.value) })}
                className="w-full accent-amber-600 cursor-pointer"
              />
              <div className="flex justify-between text-[10px] text-gray-400 mt-0.5">
                <span>Min ₹5,000</span>
                <span>Max ₹50,000</span>
              </div>
            </div>

            {/* Tenure Buttons */}
            <div>
              <label className="block text-xs font-bold text-gray-700 mb-2">Tenure (Daily Days):</label>
              <div className="grid grid-cols-4 gap-2">
                {[
                  { days: 60, rate: "18%" },
                  { days: 80, rate: "24%" },
                  { days: 100, rate: "30%" },
                  { days: 120, rate: "36%" }
                ].map(tier => (
                  <button
                    key={tier.days}
                    type="button"
                    onClick={() => setMblForm({ ...mblForm, days: tier.days })}
                    className={`py-2 px-1 rounded-xl text-center border font-bold text-xs transition ${
                      mblDays === tier.days
                        ? "bg-amber-600 text-white border-amber-600 shadow-md"
                        : "bg-gray-50 text-gray-700 border-gray-200 hover:bg-gray-100"
                    }`}
                  >
                    <div>{tier.days} Days</div>
                    <div className="text-[10px] font-normal opacity-80">{tier.rate}</div>
                  </button>
                ))}
              </div>
            </div>

            {/* Live Daily Breakdown */}
            <div className="bg-gray-50 border border-gray-200 rounded-2xl p-3.5 space-y-1.5 text-xs">
              <div className="flex justify-between text-gray-600">
                <span>Total Interest ({mblRate}%):</span>
                <span className="font-bold text-gray-900">₹{mblInterest.toLocaleString("en-IN")}</span>
              </div>
              <div className="flex justify-between text-gray-600">
                <span>Total Repayment:</span>
                <span className="font-bold text-gray-900">₹{mblTotalPayable.toLocaleString("en-IN")}</span>
              </div>
              <div className="pt-2 border-t border-gray-200 flex justify-between items-center">
                <span className="font-black text-gray-900">Daily Kist (Har Roz):</span>
                <span className="text-base font-black text-amber-700">₹{mblDailyInstallment} / day</span>
              </div>
            </div>

            <div className="p-2.5 bg-amber-50/60 rounded-xl text-[11px] text-amber-900">
              <span className="font-bold">Next 6 Days Schedule: </span>
              {mblPreviewDates.map(d => `${d.getDate()}/${d.getMonth()+1}`).join(", ")}...
            </div>

            {/* KYC Inputs */}
            <div className="space-y-2 pt-1 border-t border-gray-100">
              <input
                type="text"
                placeholder="Shop / Business Name"
                value={mblForm.businessName}
                onChange={e => setMblForm({ ...mblForm, businessName: e.target.value })}
                className="w-full px-3.5 py-2.5 border border-gray-200 rounded-xl text-xs outline-none focus:ring-2 focus:ring-amber-500"
              />
              <div className="grid grid-cols-2 gap-2">
                <input
                  type="text"
                  placeholder="Aadhar Number"
                  value={mblForm.aadharNumber}
                  onChange={e => setMblForm({ ...mblForm, aadharNumber: e.target.value })}
                  className="w-full px-3.5 py-2.5 border border-gray-200 rounded-xl text-xs outline-none focus:ring-2 focus:ring-amber-500"
                />
                <input
                  type="text"
                  placeholder="PAN Number"
                  value={mblForm.panNumber}
                  onChange={e => setMblForm({ ...mblForm, panNumber: e.target.value.toUpperCase() })}
                  className="w-full px-3.5 py-2.5 border border-gray-200 rounded-xl text-xs outline-none focus:ring-2 focus:ring-amber-500 uppercase"
                />
              </div>
              <input
                type="text"
                placeholder="Bank Account Number"
                value={mblForm.bankAccountNumber}
                onChange={e => setMblForm({ ...mblForm, bankAccountNumber: e.target.value })}
                className="w-full px-3.5 py-2.5 border border-gray-200 rounded-xl text-xs outline-none focus:ring-2 focus:ring-amber-500"
              />
            </div>

            <button
              onClick={submitMicroBusinessLoan}
              className="w-full py-3 bg-gradient-to-r from-amber-600 to-orange-600 text-white rounded-xl font-bold text-xs shadow-md active:scale-95 transition"
            >
              Apply for Daily Business Loan →
            </button>
          </div>
        )}
      </Sheet>

      {/* ══════════════════════════════════════════════════════
          5. DEBT ACCOUNT SHEET (DUES & 365-DAY 1 LAKH BOND)
      ══════════════════════════════════════════════════════ */}
      <Sheet open={accountModal === "debt"} onClose={closeModal} title="Debt & Bond Account" icon="📑">
        <div className="space-y-4">
          <div className="bg-gradient-to-r from-rose-600 to-red-700 rounded-2xl p-5 text-white">
            <span className="text-xs text-rose-100 font-bold uppercase tracking-wider">Total Pending Dues</span>
            <div className="text-3xl font-black font-display my-1">₹{(userProfile.duesBalance || 0).toLocaleString("en-IN")}</div>
            <p className="text-xs text-rose-100">Scheduled on 1st, 11th & 21st (or daily for micro business)</p>
          </div>

          {/* 365-DAY 1 LAKH BOND CREATION */}
          <div className="p-4 bg-emerald-50 border-2 border-emerald-300 rounded-2xl space-y-2.5">
            <div className="flex justify-between items-start">
              <div>
                <h5 className="font-extrabold text-sm text-emerald-900">365-Day Fixed Bond (₹1,00,000)</h5>
                <p className="text-xs text-emerald-700 mt-0.5">
                  1 Lakh ka bond 365 din ke liye lock karein. Maturity par <strong>₹1,18,000</strong> seedha Profit Wallet me credit hoga!
                </p>
              </div>
              <span className="px-2 py-0.5 bg-emerald-200 text-emerald-900 rounded font-black text-[10px]">18% PROFIT</span>
            </div>
            <button
              onClick={createDebitBond}
              className="w-full py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl font-bold text-xs shadow-sm transition active:scale-95"
            >
              Create ₹1,00,000 Fixed Bond Now →
            </button>
          </div>

          {/* ACTIVE BONDS LIST */}
          {bonds.filter(b => b.bondType === "debit_365").length > 0 && (
            <div className="space-y-2 border-t border-gray-100 pt-3">
              <h5 className="text-xs font-bold text-gray-700 uppercase">My Active 365-Day Bonds</h5>
              {bonds.filter(b => b.bondType === "debit_365").map(b => (
                <div key={b._id} className="p-3 bg-gray-50 border border-gray-200 rounded-xl text-xs space-y-1">
                  <div className="flex justify-between font-bold">
                    <span>Principal: ₹{b.principalAmount.toLocaleString("en-IN")}</span>
                    <span className="text-emerald-700">Maturity: ₹{b.returnAmount.toLocaleString("en-IN")}</span>
                  </div>
                  <div className="flex justify-between text-gray-500 text-[11px]">
                    <span>Matures On: {new Date(b.maturityDate).toLocaleDateString("en-IN")}</span>
                    <span className="capitalize font-semibold text-blue-600">{b.status}</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </Sheet>

      {/* ══════════════════════════════════════════════════════
          6. LENDING ACCOUNT SHEET (40 & 80 MONTHS MONTHLY BONDS)
      ══════════════════════════════════════════════════════ */}
      <Sheet open={accountModal === "lending"} onClose={closeModal} title="Lending Account (Monthly Return)" icon="🤝">
        <div className="space-y-4">
          <div className="bg-gradient-to-r from-purple-700 to-indigo-800 rounded-2xl p-5 text-white">
            <span className="text-xs text-purple-100 font-bold uppercase tracking-wider">Lending Monthly Bonds</span>
            <div className="text-3xl font-black font-display my-1">₹3,500 / Month</div>
            <p className="text-xs text-purple-100">₹1 Lakh par ₹1,40,000 (40 mo) ya ₹1,80,000 (80 mo) payouts</p>
          </div>

          <div className="p-4 bg-purple-50 border-2 border-purple-200 rounded-2xl space-y-3">
            <div className="text-xs font-bold text-purple-900">Select Monthly Bond Option (₹1,00,000 Investment):</div>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setLendingBondType("lending_40")}
                className={`p-3 rounded-xl border text-center transition ${
                  lendingBondType === "lending_40"
                    ? "bg-purple-600 text-white border-purple-600 shadow-md font-bold"
                    : "bg-white text-gray-700 border-gray-200 hover:bg-purple-100"
                }`}
              >
                <div className="text-xs font-bold">40 Months</div>
                <div className="text-sm font-black mt-0.5">₹1,40,000 Return</div>
                <div className="text-[10px] opacity-80">₹3,500 / month</div>
              </button>
              <button
                type="button"
                onClick={() => setLendingBondType("lending_80")}
                className={`p-3 rounded-xl border text-center transition ${
                  lendingBondType === "lending_80"
                    ? "bg-purple-600 text-white border-purple-600 shadow-md font-bold"
                    : "bg-white text-gray-700 border-gray-200 hover:bg-purple-100"
                }`}
              >
                <div className="text-xs font-bold">80 Months</div>
                <div className="text-sm font-black mt-0.5">₹1,80,000 Return</div>
                <div className="text-[10px] opacity-80">₹2,250 / month</div>
              </button>
            </div>
            <button
              onClick={() => createLendingBond(lendingBondType)}
              className="w-full py-2.5 bg-purple-600 hover:bg-purple-700 text-white rounded-xl font-bold text-xs shadow-sm transition active:scale-95"
            >
              Invest ₹1,00,000 in {lendingBondType === "lending_40" ? "40M" : "80M"} Lending Bond →
            </button>
          </div>

          {/* ACTIVE LENDING BONDS */}
          {bonds.filter(b => b.bondType.startsWith("lending")).length > 0 && (
            <div className="space-y-2 border-t border-gray-100 pt-3">
              <h5 className="text-xs font-bold text-gray-700 uppercase">My Active Lending Bonds</h5>
              {bonds.filter(b => b.bondType.startsWith("lending")).map(b => (
                <div key={b._id} className="p-3 bg-gray-50 border border-gray-200 rounded-xl text-xs space-y-1">
                  <div className="flex justify-between font-bold">
                    <span>Invested: ₹{b.principalAmount.toLocaleString("en-IN")}</span>
                    <span className="text-purple-700">₹{b.monthlyPayout}/mo</span>
                  </div>
                  <div className="flex justify-between text-gray-500 text-[11px]">
                    <span>Payouts: {b.payoutsCompleted || 0} / {b.tenureMonths} Months</span>
                    <span className="text-emerald-700 font-bold">Total: ₹{b.returnAmount.toLocaleString("en-IN")}</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </Sheet>

      {/* 7. WALLET ACCOUNT SHEET */}
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
        </div>
      </Sheet>

      {/* 8. STUDENT LOAN ACCOUNT SHEET */}
      <Sheet open={accountModal === "student_loan"} onClose={closeModal} title="Student Loan Account" icon="🎓">
        <div className="space-y-4">
          <div className="bg-gradient-to-r from-cyan-600 to-blue-700 rounded-2xl p-5 text-white">
            <span className="text-xs text-cyan-100 font-bold uppercase tracking-wider">Subsidized Student Rate</span>
            <div className="text-3xl font-black font-display my-1">8.0% p.a.</div>
            <p className="text-xs text-cyan-100">School & College fee direct institute transfer</p>
          </div>
          <div className="space-y-2 text-xs">
            <div className="flex justify-between p-2.5 bg-gray-50 rounded-xl"><span className="text-gray-500">Max Facility</span><span className="font-bold text-gray-800">Up to ₹1,00,000</span></div>
            <div className="flex justify-between p-2.5 bg-gray-50 rounded-xl"><span className="text-gray-500">Collateral Required</span><span className="font-bold text-emerald-700">Zero (Bina Guarantee)</span></div>
          </div>
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

      {/* PROFILE SHEET */}
      <Sheet open={modal === "profile"} onClose={closeModal} title="Profile" icon="👤">
        <div className="flex items-center gap-4 mb-6">
          <div className="w-14 h-14 bg-gradient-to-br from-blue-500 to-cyan-500 text-white rounded-full flex items-center justify-center font-bold text-xl shrink-0">
            {(userStored.name || "U")[0].toUpperCase()}
          </div>
          <div>
            <p className="font-bold text-gray-800">{userStored.name || "User"}</p>
            <p className="text-xs text-gray-400">{userStored.email}</p>
            <p className="text-xs font-mono text-blue-600 font-bold mt-0.5">{userUniqueId}</p>
          </div>
        </div>
        <button onClick={logout} className="w-full py-3 bg-red-50 text-red-600 rounded-xl font-bold text-sm hover:bg-red-100 active:bg-red-200 transition">Logout</button>
      </Sheet>

      <Toast msg={toast} onHide={() => setToast({ text: "", type: "" })} />

      <BottomNav items={navItems} active={navTab} onChange={setNavTab} />
    </div>
  );
}
