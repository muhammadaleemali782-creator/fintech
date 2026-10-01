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

// Authentic QR Viewfinder Scanner Icon
function ScannerIcon({ className = "w-6 h-6" }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
    >
      <path d="M4 8V5a2 2 0 0 1 2-2h3" />
      <path d="M15 3h3a2 2 0 0 1 2 2v3" />
      <path d="M20 16v3a2 2 0 0 1-2 2h-3" />
      <path d="M9 21H6a2 2 0 0 1-2-2v-3" />
      <rect x="7" y="7" width="3" height="3" fill="currentColor" rx="0.5" stroke="none" />
      <rect x="14" y="7" width="3" height="3" fill="currentColor" rx="0.5" stroke="none" />
      <rect x="7" y="14" width="3" height="3" fill="currentColor" rx="0.5" stroke="none" />
      <line x1="5" y1="12" x2="19" y2="12" stroke="currentColor" strokeWidth="1.8" strokeDasharray="2 1" />
    </svg>
  );
}

// UI Localization Dictionary (Hinglish, Hindi, English)
const UI_TEXT = {
  hinglish: {
    appTitle: "Educa Finance",
    scanQr: "Scan QR",
    voiceGuide: "Voice Guide",
    listening: "Bol raha hai...",
    profitWallet: "Profit Wallet",
    duesWallet: "Dues Wallet",
    primaryBalance: "Primary Wallet Balance",
    checkBalance: "Check Balance",
    hide: "Hide",
    cardsAndVip: "My Educa Cards & VIP",
    cardsSubtitle: "Silver Debit & Platinum VIP Criteria",
    appTour: "App Feature Tour",
    passbookHistory: "View Wallet Amount & Passbook History",
    passbookSub: "Check balance, incoming & outgoing transactions",
    myQrCode: "My QR Code",
    resetPin: "Change / Reset 6-Digit Wallet PIN",
    logout: "Log Out",
    activeAccount: "Active Account",
    lifetimeId: "LIFETIME",
    copyId: "Copy ID",
    copied: "✓ Copied",
    skipTour: "Skip Tour",
    next: "Next →",
    finish: "Got It, Let's Go! 🚀",
    back: "← Back",
  },
  hindi: {
    appTitle: "एड्युका फाइनेंस",
    scanQr: "QR स्कैन",
    voiceGuide: "आवाज़ गाइड",
    listening: "बोल रहा है...",
    profitWallet: "प्रॉफ़िट वॉलेट",
    duesWallet: "देय राशि (Dues)",
    primaryBalance: "प्राइमरी वॉलेट बैलेंस",
    checkBalance: "बैलेंस देखें",
    hide: "छिपाएं",
    cardsAndVip: "मेरे एड्युका कार्ड्स व VIP",
    cardsSubtitle: "सिल्वर डेबिट और प्लैटिनम VIP की शर्तें",
    appTour: "ऐप फ़ीचर टूर गाइड",
    passbookHistory: "वॉलेट राशि व पासबुक इतिहास देखें",
    passbookSub: "बैलेंस और लेन-देन का पूरा विवरण",
    myQrCode: "मेरा QR कोड",
    resetPin: "6-अंकों का पिन बदलें / रीसेट करें",
    logout: "लॉग आउट",
    activeAccount: "सक्रिय खाता",
    lifetimeId: "लाइफटाइम",
    copyId: "ID कॉपी करें",
    copied: "✓ कॉपी हुआ",
    skipTour: "टूर छोड़ें",
    next: "आगे →",
    finish: "समझ गया, शुरू करें! 🚀",
    back: "← पीछे",
  },
  english: {
    appTitle: "Educa Finance",
    scanQr: "Scan QR",
    voiceGuide: "Voice Guide",
    listening: "Speaking...",
    profitWallet: "Profit Wallet",
    duesWallet: "Dues Wallet",
    primaryBalance: "Primary Wallet Balance",
    checkBalance: "Check Balance",
    hide: "Hide",
    cardsAndVip: "My Educa Cards & VIP",
    cardsSubtitle: "Silver Debit & Platinum VIP Criteria",
    appTour: "App Feature Tour",
    passbookHistory: "View Wallet Amount & Passbook History",
    passbookSub: "Check balance, incoming & outgoing transactions",
    myQrCode: "My QR Code",
    resetPin: "Change / Reset 6-Digit Wallet PIN",
    logout: "Log Out",
    activeAccount: "Active Account",
    lifetimeId: "LIFETIME",
    copyId: "Copy ID",
    copied: "✓ Copied",
    skipTour: "Skip Tour",
    next: "Next →",
    finish: "Got It, Let's Go! 🚀",
    back: "← Back",
  }
};

const tourSteps = [
  {
    title: "Profit Wallet & Dues Wallet",
    titleHi: "प्रॉफ़िट वॉलेट और देय वॉलेट",
    desc: "Aapke dashboard ke top par Profit Wallet (365-Day 18% Bonds aur returns ke liye) aur Dues Wallet (1st, 11th, 21st ki pending installments) side-by-side milte hain.",
    descHi: "डैशबोर्ड के शीर्ष पर प्रॉफिट वॉलेट और देय राशि वॉलेट एक साथ दिए गए हैं ताकि आप आसानी से अपने मुनाफे और किश्तों को ट्रैक कर सकें।",
    descEn: "At the top of your dashboard, monitor your Profit Wallet (for 365-day 18% bonds & returns) and Dues Wallet (tracking collections on 1st, 11th, and 21st).",
    icon: "📈",
    badge: "Step 1 of 5",
    color: "from-emerald-600 to-teal-700"
  },
  {
    title: "Primary Wallet & 6-Digit PIN",
    titleHi: "प्राइमरी वॉलेट और 6-अंकों का सुरक्षा पिन",
    desc: "Aapka main wallet balance PhonePe style 6-digit security PIN aur biometric fingerprint se protected rehta hai. Balance hamesha chupa rehta hai jab tak aap unlock na karein.",
    descHi: "आपका मुख्य बैलेंस 6-अंकों के सुरक्षा पिन और फिंगरप्रिंट से सुरक्षित रहता है। बैलेंस देखने के लिए पिन दर्ज करें।",
    descEn: "Your primary balance is secured by a 6-digit security PIN and biometric fingerprint lock. It remains masked until you unlock it.",
    icon: "🔒",
    badge: "Step 2 of 5",
    color: "from-blue-600 to-indigo-700"
  },
  {
    title: "Micro Loans & Business Capital",
    titleHi: "पर्सनल व माइक्रो बिज़नेस लोन",
    desc: "₹5K se ₹50K tak ke personal loans with easy installments, aur 60-120 days ke daily collection business loans. Kisi bhi samay loan full payoff karke band kar sakte hain!",
    descHi: "₹5,000 से ₹50,000 तक आसान किश्तों में पर्सनल लोन और 60 से 120 दिनों के डेली कलेक्शन बिज़नेस लोन उपलब्ध हैं।",
    descEn: "Access personal loans up to ₹50K with easy installments, and daily collection business loans (60-120 days) with early full settlement privileges.",
    icon: "💼",
    badge: "Step 3 of 5",
    color: "from-amber-600 to-orange-700"
  },
  {
    title: "Camera & Gallery QR Scanner",
    titleHi: "कैमरा व गैलरी QR स्कैनर",
    desc: "Top bar me 'Scan QR' button se aap direct phone camera se scan kar sakte hain, ya photo gallery se QR image select karke instant payment kar sakte hain.",
    descHi: "कैमरे से सीधे QR कोड स्कैन करें या अपनी गैलरी से QR फोटो चुनकर तुरंत भुगतान करें।",
    descEn: "Scan merchant or peer QR codes directly through your device camera or upload a QR image from your photo gallery.",
    icon: "📷",
    badge: "Step 4 of 5",
    color: "from-blue-600 to-indigo-700"
  },
  {
    title: "Single Member ID & Smart Cards",
    titleHi: "स्थायी मेंबर ID व स्मार्ट कार्ड्स",
    desc: "Aapka lifetime EDUCA ID sabhi services ke liye single identity hai. Profile me jakar Silver Debit Card aur Platinum VIP Card ke unlock criteria dekhein!",
    descHi: "आपकी स्थायी ID हमेशा सक्रिय रहती है। प्रोफ़ाइल में अपने सिल्वर डेबिट कार्ड और प्लैटिनम VIP कार्ड की स्थिति देखें।",
    descEn: "Your lifetime EDUCA ID is your unified identity. Access your Silver Debit Card and track your Platinum VIP card unlock criteria in Profile!",
    icon: "💳",
    badge: "Step 5 of 5",
    color: "from-slate-800 to-slate-900"
  }
];

export default function Dashboard() {
  const token = localStorage.getItem("token");
  const userStored = JSON.parse(localStorage.getItem("user") || "{}");
  useEffect(() => { if (!token) window.location.href = "/"; }, [token]);

  const headers = { "Content-Type": "application/json", Authorization: `Bearer ${token}` };
  const [balance, setBalance] = useState(() => {
    const cached = localStorage.getItem("educa_cached_balance");
    return cached !== null ? Number(cached) : (userStored.balance || 0);
  });
  const [txns, setTxns] = useState(() => {
    try {
      const cached = localStorage.getItem("educa_cached_txns");
      return cached ? JSON.parse(cached) : [];
    } catch { return []; }
  });
  const [loans, setLoans] = useState(() => {
    try {
      const cached = localStorage.getItem("educa_cached_loans");
      return cached ? JSON.parse(cached) : [];
    } catch { return []; }
  });
  const [bonds, setBonds] = useState(() => {
    try {
      const cached = localStorage.getItem("educa_cached_bonds");
      return cached ? JSON.parse(cached) : [];
    } catch { return []; }
  });
  const [showLoans, setShowLoans] = useState(() => {
    try {
      const cached = localStorage.getItem("educa_cached_loans");
      return Boolean(cached && JSON.parse(cached).length > 0);
    } catch { return false; }
  });
  const [toast, setToast] = useState({ text: "", type: "" });
  const [modal, setModal] = useState(null); // 'deposit' | 'withdraw' | 'profile' | 'my_qr' | 'send_money' | 'passbook' | 'cards'
  const [passbookFilter, setPassbookFilter] = useState("all"); // 'all' | 'in' | 'out'
  const [accountModal, setAccountModal] = useState(null); // 'wallet' | 'debt' | 'lending' | 'personal_loan' | 'student_loan' | 'business_loan'
  const [currentRate, setCurrentRate] = useState(12);
  const [referralCode, setReferralCode] = useState(userStored.referralCode || "");
  const [referralEarnings, setReferralEarnings] = useState(0);
  const [copied, setCopied] = useState(false);
  const [navTab, setNavTab] = useState("home");
  const [userProfile, setUserProfile] = useState(() => {
    try {
      const cached = localStorage.getItem("educa_cached_profile");
      return cached ? JSON.parse(cached) : userStored;
    } catch { return userStored || {}; }
  });
  const [cardTab, setCardTab] = useState(() => {
    try {
      const cached = localStorage.getItem("educa_cached_profile");
      const prof = cached ? JSON.parse(cached) : userStored;
      return (prof.cardTier === "platinum" || prof.cardStatus?.platinum?.unlocked) ? "platinum" : "silver";
    } catch { return "silver"; }
  });
  const [activatingWallet, setActivatingWallet] = useState("");
  const [claimingCard, setClaimingCard] = useState(false);
  const [qrDataUrl, setQrDataUrl] = useState("");

  // Dues & Loan Installment states
  const [activeLoanDetails, setActiveLoanDetails] = useState(() => {
    try {
      const cached = localStorage.getItem("educa_cached_active_loan");
      return cached ? JSON.parse(cached) : null;
    } catch { return null; }
  });
  const [submitInstallmentModal, setSubmitInstallmentModal] = useState(null);
  const [installmentUtr, setInstallmentUtr] = useState("");
  const [installmentProofUrl, setInstallmentProofUrl] = useState("");
  const [installmentProofName, setInstallmentProofName] = useState("");
  const [installmentSubmitting, setInstallmentSubmitting] = useState(false);
  const [installmentPayMethod, setInstallmentPayMethod] = useState("wallet");
  const [expandedLoanId, setExpandedLoanId] = useState(null);

  // Document Fullscreen & Zoom Lightbox State
  const [lightboxImg, setLightboxImg] = useState(null);
  const [zoomLevel, setZoomLevel] = useState(1);

  // Hero Flight Animation state (Strictly inside loan actions)
  const [heroFlyId, setHeroFlyId] = useState(null);
  const [loanSubmitting, setLoanSubmitting] = useState(false);

  const triggerHeroFly = (id = "generic") => {
    setHeroFlyId(id);
    setTimeout(() => {
      setHeroFlyId(prev => (prev === id ? null : prev));
    }, 1250);
  };

  const LoanHeroFlyBadge = () => (
    <div className="absolute pointer-events-none -top-3 left-1/2 -translate-x-1/2 z-50 flex flex-col items-center animate-hero-flight select-none">
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

  // App Lock State (Biometric / 6-digit PIN on App Open) - Only active if PIN is configured
  const [appLocked, setAppLocked] = useState(() => Boolean(localStorage.getItem("token") && localStorage.getItem("hasWalletPin") === "true"));
  const [appLockPin, setAppLockPin] = useState("");
  const [appLockError, setAppLockError] = useState("");
  const [appLockLoading, setAppLockLoading] = useState(false);

  // Profit Wallet Statement / History State
  const [profitHistory, setProfitHistory] = useState([]);
  const [loadingProfitHistory, setLoadingProfitHistory] = useState(false);

  // Camera Flashlight / Torch State
  const [hasTorch, setHasTorch] = useState(false);
  const [torchOn, setTorchOn] = useState(false);

  const toggleTorch = async () => {
    try {
      const videoElem = document.querySelector("#educa-qr-reader video");
      if (videoElem && videoElem.srcObject) {
        const track = videoElem.srcObject.getVideoTracks()[0];
        const next = !torchOn;
        await track.applyConstraints({
          advanced: [{ torch: next }]
        });
        setTorchOn(next);
      }
    } catch (e) {
      console.warn("Torch failed:", e);
    }
  };

  // Language & Voice Guide State
  const [lang, setLang] = useState(() => localStorage.getItem("educa_lang") || "hinglish");
  const [isSpeaking, setIsSpeaking] = useState(false);

  // Guided Feature Tour State
  const [showTour, setShowTour] = useState(false);
  const [tourStep, setTourStep] = useState(0);

  const txt = UI_TEXT[lang] || UI_TEXT.hinglish;

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
    upiId: "",
    doc1Url: "",
    doc2Url: ""
  });

  // Micro Business Loan State (Daily collection: 60d@18%, 80d@24%, 100d@30%, 120d@36%)
  const [mblForm, setMblForm] = useState({
    amount: 5000,
    days: 60,
    purpose: "Shop Inventory & Working Capital",
    businessName: "",
    hasChequeFacility: false,
    chequeNumber: "",
    aadharNumber: "",
    panNumber: "",
    bankAccountNumber: "",
    bankIfsc: "",
    doc1Url: "",
    doc2Url: ""
  });

  // Student Loan Application State (Subsidized: 8% p.a., 15-30 Easy Installments)
  const [studentLoanForm, setStudentLoanForm] = useState({
    amount: 5000,
    installmentsCount: 15,
    instituteName: "",
    purpose: "School & College Fee",
    hasChequeFacility: false,
    chequeNumber: "",
    aadharNumber: "",
    panNumber: "",
    bankAccountNumber: "",
    bankIfsc: "",
    doc1Url: "",
    doc2Url: "",
    studentProofUrl: ""
  });

  // Lending Bond Selection (40 or 80 months)
  const [lendingBondType, setLendingBondType] = useState("lending_40");

  const [cameraActive, setCameraActive] = useState(false);
  const [cameraError, setCameraError] = useState("");
  const qrScannerRef = useRef(null);

  // 6-Digit Wallet Security PIN State (PhonePe style)
  const [balanceRevealed, setBalanceRevealed] = useState(false);
  const [pinInput, setPinInput] = useState("");
  const [confirmPinInput, setConfirmPinInput] = useState("");
  const [pinSetupMode, setPinSetupMode] = useState(false);
  const [pinError, setPinError] = useState("");
  const [pinSubmitting, setPinSubmitting] = useState(false);

  // Reset PIN Form
  const [resetPinForm, setResetPinForm] = useState({
    phone: "",
    aadharNumber: "",
    newPin: "",
    confirmNewPin: ""
  });
  const [resetError, setResetError] = useState("");
  const [resetSubmitting, setResetSubmitting] = useState(false);

  const [kycForm, setKycForm] = useState({
    aadharNumber: "",
    aadhaarName: "",       // Name as per Aadhaar (mandatory)
    aadhaarPhone: "",      // Phone number linked to Aadhaar (mandatory)
    aadhaarAddress: "",    // Address as per Aadhaar (mandatory)
    doc1Name: "",
    doc1Url: "",
    doc2Type: "pan", // 'pan' or 'cheque'
    panNumber: "",
    chequeNumber: "",
    doc2Name: "",
    doc2Url: "",
    address: ""
  });
  const [kycSubmitting, setKycSubmitting] = useState(false);
  const [kycError, setKycError] = useState("");

  const notifyPayment = (title, message) => {
    try {
      if (window.AndroidNotification?.showNotification) {
        window.AndroidNotification.showNotification(title, message);
      } else if ("Notification" in window && Notification.permission === "granted") {
        new Notification(title, { body: message, icon: "/favicon.ico" });
      }
      if (window.AndroidNotification?.playSound) {
        window.AndroidNotification.playSound();
      }
    } catch {}
  };

  const showToast = (text, type = "success") => {
    setToast({ text, type });
    if (type === "success" && (text.includes("Transfer") || text.includes("Payment") || text.includes("credited") || text.includes("₹") || text.includes("Deposit"))) {
      notifyPayment("Educa Fintech Transaction", text);
    }
  };

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
    setPinError("");
    setResetError("");
    setKycError("");
    setModal(null);
    setAccountModal(null);
  };

  const [hasBiometric, setHasBiometric] = useState(false);

  useEffect(() => {
    if (window.AndroidBiometric?.isBiometricAvailable) {
      try {
        setHasBiometric(window.AndroidBiometric.isBiometricAvailable());
      } catch {
        setHasBiometric(false);
      }
    } else if (window.PublicKeyCredential) {
      setHasBiometric(true);
    }

    window.onBiometricSuccess = () => {
      setAppLocked(false);
      setBalanceRevealed(true);
      setModal(null);
      showToast("Fingerprint verified! Wallet Unlocked", "success");
    };

    window.onBiometricError = (err) => {
      if (err && err !== "Cancelled") {
        showToast(err, "error");
      }
    };

    return () => {
      delete window.onBiometricSuccess;
      delete window.onBiometricError;
    };
  }, []);

  // Auto-prompt Fingerprint on App Launch if enabled on device
  useEffect(() => {
    if (appLocked && token) {
      if (window.AndroidBiometric?.isBiometricAvailable) {
        const timer = setTimeout(() => {
          try {
            if (window.AndroidBiometric.isBiometricAvailable()) {
              window.AndroidBiometric.authenticateBiometric();
            }
          } catch (e) {
            console.warn(e);
          }
        }, 400);
        return () => clearTimeout(timer);
      }
    }
  }, [appLocked, token]);

  const verifyAppLockPin = async (pinInput) => {
    const pin = pinInput || appLockPin;
    if (!pin || pin.length !== 6) {
      setAppLockError("Please enter all 6 digits of your PIN");
      return;
    }
    setAppLockLoading(true);
    setAppLockError("");
    try {
      const res = await fetch(`${API}/user/pin/verify`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({ pin })
      });
      const data = await res.json();
      if (!res.ok) {
        if (data.needsSetup) {
          setAppLocked(false);
          showToast("Please set up your 6-digit PIN in Profile", "info");
          return;
        }
        throw new Error(data.message || "Incorrect PIN");
      }
      setAppLocked(false);
      setBalance(data.balance);
      setBalanceRevealed(true);
      showToast("Wallet unlocked successfully!", "success");
    } catch (err) {
      setAppLockError(err.message || "Invalid 6-digit PIN");
      setAppLockPin("");
    } finally {
      setAppLockLoading(false);
    }
  };

  const loadProfitHistory = async () => {
    setLoadingProfitHistory(true);
    try {
      const res = await fetch(`${API}/user/profit-history`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      const data = await res.json();
      if (res.ok && data.success) {
        setProfitHistory(data.history || []);
        if (data.profitBalance !== undefined) {
          setUserProfile(prev => ({ ...prev, profitBalance: data.profitBalance }));
        }
      }
    } catch (e) {
      console.error("Failed to load profit history", e);
    } finally {
      setLoadingProfitHistory(false);
    }
  };

  const triggerBiometricAuth = () => {
    if (window.AndroidBiometric?.authenticateBiometric) {
      window.AndroidBiometric.authenticateBiometric();
    } else {
      showToast("Fingerprint authentication active in EducaFintech Android App", "info");
    }
  };

  const handleLanguageChange = (newLang) => {
    setLang(newLang);
    localStorage.setItem("educa_lang", newLang);
  };

  const finishTour = () => {
    localStorage.setItem("educa_tour_completed", "true");
    setShowTour(false);
    setTourStep(0);
  };

  const speakDashboard = () => {
    const nativeTTS = window.AndroidTTS;

    // Stop if already speaking
    if (isSpeaking) {
      if (nativeTTS) nativeTTS.stop();
      else if (typeof window !== "undefined" && "speechSynthesis" in window) window.speechSynthesis.cancel();
      setIsSpeaking(false);
      return;
    }

    const userName = userStored.name || "User";
    const primaryBal = balance || 0;
    const profitBal = userProfile.profitBalance || 0;
    const duesBal = userProfile.duesBalance || 0;

    let text = "";

    if (lang === "hindi") {
      text = `नमस्ते ${userName}. आपका प्राइमरी वॉलेट बैलेंस है ${primaryBal} रुपये. आपका प्रॉफिट वॉलेट है ${profitBal} रुपये, और देय राशि है ${duesBal} रुपये. क्यूआर स्कैन करने या पैसे भेजने के लिए ऊपर दिए गए बटनों का उपयोग करें.`;
    } else if (lang === "english") {
      text = `Hello ${userName}. Your primary wallet balance is ${primaryBal} rupees. Your profit wallet balance is ${profitBal} rupees, and dues wallet balance is ${duesBal} rupees. You can scan QR or transfer money with one tap.`;
    } else {
      text = `Namaste ${userName}. Aapka primary wallet balance hai ${primaryBal} rupaye. Profit wallet me hain ${profitBal} rupaye, aur Dues wallet me bacha hai ${duesBal} rupaye. Scan QR aur Send Money buttons se aap payments kar sakte hain.`;
    }

    if (nativeTTS) {
      // Native Android TTS — no browser API needed
      try {
        nativeTTS.speak(text);
        setIsSpeaking(true);
        // Reset after estimated duration (avg 130 words/min)
        const ms = Math.max(2000, (text.split(" ").length / 130) * 60000);
        setTimeout(() => setIsSpeaking(false), ms);
      } catch { setIsSpeaking(false); }
      return;
    }

    // Web fallback — browser speechSynthesis
    if (typeof window === "undefined" || !("speechSynthesis" in window)) {
      showToast("Voice guide sirf app me available hai.", "info");
      return;
    }
    try {
      window.speechSynthesis.cancel();
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.lang = lang === "english" ? "en-IN" : "hi-IN";
      utterance.rate = 0.95;
      utterance.pitch = 1.0;
      utterance.onstart = () => setIsSpeaking(true);
      utterance.onend = () => setIsSpeaking(false);
      utterance.onerror = () => setIsSpeaking(false);
      window.speechSynthesis.speak(utterance);
    } catch { setIsSpeaking(false); }
  };


  const handleCheckBalanceClick = () => {
    setPinError("");
    setPinInput("");
    setConfirmPinInput("");
    if (!userProfile.hasWalletPin) {
      setPinSetupMode(true);
      setModal("wallet_pin");
    } else {
      setPinSetupMode(false);
      setModal("wallet_pin");
      if (window.AndroidBiometric?.isBiometricAvailable && window.AndroidBiometric.isBiometricAvailable()) {
        setTimeout(() => {
          triggerBiometricAuth();
        }, 200);
      }
    }
  };

  const handlePinSubmit = async () => {
    if (pinInput.length !== 6 || !/^\d{6}$/.test(pinInput)) {
      setPinError("Kripya 6 number ka numeric PIN enter karein.");
      return;
    }

    if (pinSetupMode) {
      if (pinInput !== confirmPinInput) {
        setPinError("Dono PIN match nahi kar rahe hain.");
        return;
      }
      setPinSubmitting(true);
      setPinError("");
      try {
        const res = await fetch(`${API}/user/pin/set`, {
          method: "POST",
          headers,
          body: JSON.stringify({ pin: pinInput })
        });
        const data = await res.json();
        if (res.ok) {
          showToast("6-Digit Wallet PIN successfully set!", "success");
          setUserProfile(prev => ({ ...prev, hasWalletPin: true }));
          setBalanceRevealed(true);
          setModal(null);
        } else {
          setPinError(data.message || "PIN set karne me error aaya.");
        }
      } catch {
        setPinError("Network error. Kripya dobara try karein.");
      } finally {
        setPinSubmitting(false);
      }
    } else {
      setPinSubmitting(true);
      setPinError("");
      try {
        const res = await fetch(`${API}/user/pin/verify`, {
          method: "POST",
          headers,
          body: JSON.stringify({ pin: pinInput })
        });
        const data = await res.json();
        if (res.ok) {
          setBalance(data.balance);
          setBalanceRevealed(true);
          setModal(null);
          showToast("Wallet Balance Unlocked!", "success");
        } else {
          if (data.needsSetup) {
            setPinSetupMode(true);
            setPinError("Kripya pehle apna 6-digit PIN banayein.");
          } else {
            setPinError(data.message || "Galat PIN. Kripya sahi PIN enter karein.");
          }
        }
      } catch {
        setPinError("Verification error. Dobara try karein.");
      } finally {
        setPinSubmitting(false);
      }
    }
  };

  const handleOpenResetPin = () => {
    setResetPinForm({
      phone: userProfile.phone || userStored.phone || "",
      aadharNumber: userProfile.aadharNumber || "",
      newPin: "",
      confirmNewPin: ""
    });
    setResetError("");
    setModal("reset_pin");
  };

  const handleResetPinSubmit = async () => {
    const { phone, aadharNumber, newPin, confirmNewPin } = resetPinForm;
    if (!phone || !aadharNumber || !newPin) {
      setResetError("Sabhi fields bharna anivarya hai.");
      return;
    }
    const cleanAadhar = aadharNumber.replace(/\s+/g, "");
    if (!/^\d{12}$/.test(cleanAadhar)) {
      setResetError("Kripya 12-digit valid Aadhar number dalein.");
      return;
    }
    if (!/^\d{6}$/.test(newPin)) {
      setResetError("Naya PIN 6 digit ka numeric hona chahiye.");
      return;
    }
    if (newPin !== confirmNewPin) {
      setResetError("Naya PIN aur confirm PIN match nahi ho rahe.");
      return;
    }
    setResetSubmitting(true);
    setResetError("");
    try {
      const res = await fetch(`${API}/user/pin/reset`, {
        method: "POST",
        headers,
        body: JSON.stringify({ phone, aadharNumber: cleanAadhar, newPin })
      });
      const data = await res.json();
      if (res.ok) {
        showToast("Wallet PIN successfully reset!", "success");
        setUserProfile(prev => ({ ...prev, hasWalletPin: true, aadharNumber: cleanAadhar }));
        setBalanceRevealed(true);
        setModal(null);
      } else {
        setResetError(data.message || "PIN reset karne me samasya aayi.");
      }
    } catch {
      setResetError("Network error. Kripya dobara try karein.");
    } finally {
      setResetSubmitting(false);
    }
  };

  const parseScannedQr = (text) => {
    if (!text) return { recipient: "", name: "" };
    let clean = text.trim();
    let recipient = "";
    let name = "";

    if (clean.includes("to=")) {
      const matchTo = clean.match(/to=([^&]+)/);
      if (matchTo && matchTo[1]) recipient = decodeURIComponent(matchTo[1]);
      const matchName = clean.match(/name=([^&]+)/);
      if (matchName && matchName[1]) name = decodeURIComponent(matchName[1]);
    } else if (clean.startsWith("upi://pay")) {
      const matchPa = clean.match(/pa=([^&]+)/);
      if (matchPa && matchPa[1]) recipient = decodeURIComponent(matchPa[1]);
      const matchPn = clean.match(/pn=([^&]+)/);
      if (matchPn && matchPn[1]) name = decodeURIComponent(matchPn[1]);
    } else {
      recipient = clean.replace(/^educa:\/\/pay\?to=/i, "");
    }

    return { recipient, name };
  };

  const handleScanSuccess = async (decodedText) => {
    const { recipient, name } = parseScannedQr(decodedText);
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
    if (name) {
      setRecipientInfo({ name, uniqueId: recipient });
    }
    setModal("send_money");
    showToast(name ? `QR Scanned: ${name}` : `QR Scanned: ${recipient}`, "success");
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
            { fps: 15, qrbox: { width: 250, height: 250 } },
            (decodedText) => {
              if (mounted) handleScanSuccess(decodedText);
            },
            () => {}
          )
          .then(() => {
            if (mounted) {
              setCameraActive(true);
              try {
                const videoElem = document.querySelector("#educa-qr-reader video");
                if (videoElem && videoElem.srcObject) {
                  const track = videoElem.srcObject.getVideoTracks()[0];
                  const caps = track?.getCapabilities?.();
                  if (caps && "torch" in caps) {
                    setHasTorch(true);
                  }
                }
              } catch (e) {}
            }
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
        setTorchOn(false);
        setHasTorch(false);
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
      if (res.ok && data) {
        setUserProfile(data);
        localStorage.setItem("educa_cached_profile", JSON.stringify(data));
        setBalance(data.balance || 0);
        localStorage.setItem("educa_cached_balance", String(data.balance || 0));

        // Native Android App: Register device silently in background without intrusive prompts
        if (window.AndroidDevice) {
          try {
            if (data._id && window.AndroidDevice.registerDeviceUser) {
              window.AndroidDevice.registerDeviceUser(data._id, data.email || "", data.name || "");
            }
          } catch (nativeErr) {
            console.warn("Android native bridge notice:", nativeErr);
          }
        }

        if (data.hasWalletPin) {
          localStorage.setItem("hasWalletPin", "true");
        } else {
          localStorage.setItem("hasWalletPin", "false");
          setAppLocked(false);
        }
        if (data.interestRate) setCurrentRate(data.interestRate);
        setReferralCode(data.referralCode || "");
        setReferralEarnings(data.referralEarnings || 0);
        if (data.cardTier === "platinum" || data.cardStatus?.platinum?.unlocked) {
          setCardTab("platinum");
        }
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
      if (Array.isArray(data)) {
        setTxns(data);
        localStorage.setItem("educa_cached_txns", JSON.stringify(data));
      }
    } catch {}
  };

  const loadLoans = async () => {
    try {
      const res = await fetch(`${API}/loan/my`, { headers });
      const data = await res.json();
      if (Array.isArray(data)) {
        setLoans(data);
        localStorage.setItem("educa_cached_loans", JSON.stringify(data));
      }
      setShowLoans(true);
    } catch {}
    loadActiveLoanDetails();
  };

  const openLoansHub = () => {
    triggerHeroFly("loans_hub");
    loadLoans();
    setModal("all_loans");
    setNavTab("loans");
    setShowLoans(true);
  };

  const loadActiveLoanDetails = async () => {
    try {
      const res = await fetch(`${API}/loan/active-details`, { headers });
      const data = await res.json();
      if (data && data.hasActiveLoan) {
        setActiveLoanDetails(data);
        localStorage.setItem("educa_cached_active_loan", JSON.stringify(data));
      } else {
        setActiveLoanDetails(null);
        localStorage.removeItem("educa_cached_active_loan");
      }
    } catch {}
  };

  const loadBonds = async () => {
    try {
      const res = await fetch(`${API}/bond/my`, { headers });
      const data = await res.json();
      if (Array.isArray(data)) {
        setBonds(data);
        localStorage.setItem("educa_cached_bonds", JSON.stringify(data));
      }
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

    // Check if new user guided feature tour should run
    const tourDone = localStorage.getItem("educa_tour_completed");
    if (!tourDone) {
      const tourTimer = setTimeout(() => setShowTour(true), 1200);
      return () => clearTimeout(tourTimer);
    }
  }, [loadDashboard]);

  // Clean up speech synthesis on component unmount
  useEffect(() => {
    return () => {
      if (typeof window !== "undefined" && "speechSynthesis" in window) {
        window.speechSynthesis.cancel();
      }
    };
  }, []);

  // Loan Calculations (First time borrower strictly ₹5,000 across ALL loans; doubles for repeat borrowers)
  const isFirstTime = (userProfile.loansCount || 0) === 0;
  const maxLimit = isFirstTime ? 5000 : (userProfile.loanLimit || 10000);

  // Personal Loan Calculations
  const quoteAmount = Math.min(Math.max(Number(loanForm.amount) || 5000, 5000), maxLimit);
  const quoteCount = Math.min(Math.max(Number(loanForm.installmentsCount) || 15, 15), 30);
  const quoteRate = 1.34;
  const principalPerInstallment = quoteAmount / quoteCount;
  const interestPerInstallment = (quoteAmount * quoteRate) / 100;
  const installmentAmount = Math.round(principalPerInstallment + interestPerInstallment);
  const totalPayable = installmentAmount * quoteCount;
  const processingFee = Math.round(quoteAmount * 0.05); // 5%
  const upiCharges = Math.round(quoteAmount * 0.01); // 1%
  const advanceDeduction = 0; // Optional - decided by Admin upon approval
  const disbursalAmount = Math.max(0, quoteAmount - (processingFee + upiCharges));
  const previewDates = getUpcomingDates(Math.min(quoteCount, 6));

  // Micro Business Loan Calculations (Daily collection)
  const mblAmount = Math.min(Math.max(Number(mblForm.amount) || 5000, 5000), maxLimit);
  const mblDays = Number(mblForm.days) || 60;
  const mblRateMap = { 60: 18, 80: 24, 100: 30, 120: 36 };
  const mblRate = mblRateMap[mblDays] || 18;
  const mblInterest = Math.round((mblAmount * mblRate) / 100);
  const mblTotalPayable = mblAmount + mblInterest;
  const mblDailyInstallment = Math.round(mblTotalPayable / mblDays);
  const mblPreviewDates = getUpcomingDailyDates(6);

  // Student Loan Calculations (Subsidized: 8% p.a., 10-day cycle)
  const studentAmount = Math.min(Math.max(Number(studentLoanForm.amount) || 5000, 5000), maxLimit);
  const studentCount = Math.min(Math.max(Number(studentLoanForm.installmentsCount) || 15, 15), 30);
  const studentRate = 0.67; // Subsidized rate (~8% annual over 10-day cycles)
  const studentPrincipal = studentAmount / studentCount;
  const studentInterest = (studentAmount * studentRate) / 100;
  const studentInstallment = Math.round(studentPrincipal + studentInterest);
  const studentTotalPayable = studentInstallment * studentCount;
  const studentFee = Math.round(studentAmount * 0.02); // Subsidized 2%
  const studentUpi = Math.round(studentAmount * 0.01); // 1%
  const studentDisbursal = Math.max(0, studentAmount - (studentFee + studentUpi));
  const studentPreviewDates = getUpcomingDates(Math.min(studentCount, 6));

  // Lightweight Client-side Image Compression Helper for Loan Documents
  const handleLoanDocFile = (file, setter, field) => {
    if (!file) return;
    if (file.size > 15 * 1024 * 1024) {
      showToast("File size 15MB se kam honi chahiye", "error");
      return;
    }
    const reader = new FileReader();
    reader.onload = (event) => {
      if (file.type === "application/pdf") {
        setter(prev => ({ ...prev, [field]: event.target.result }));
        return;
      }
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
        setter(prev => ({ ...prev, [field]: canvas.toDataURL("image/jpeg", 0.75) }));
      };
      img.onerror = () => {
        setter(prev => ({ ...prev, [field]: event.target.result }));
      };
      img.src = event.target.result;
    };
    reader.readAsDataURL(file);
  };

  const copyText = (text) => {
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  // Client-side image compression for KYC (zero server bloat)
  const handleKycFileChange = (e, slot = 1) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 15 * 1024 * 1024) {
      showToast("File size 15MB se kam honi chahiye", "error");
      return;
    }
    const reader = new FileReader();
    reader.onload = (event) => {
      if (file.type === "application/pdf") {
        if (slot === 1) setKycForm(prev => ({ ...prev, doc1Name: file.name, doc1Url: event.target.result }));
        else setKycForm(prev => ({ ...prev, doc2Name: file.name, doc2Url: event.target.result }));
        return;
      }
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement("canvas");
        const maxDim = 1200;
        let w = img.width;
        let h = img.height;
        if (w > maxDim || h > maxDim) {
          if (w > h) {
            h = Math.round((h * maxDim) / w);
            w = maxDim;
          } else {
            w = Math.round((w * maxDim) / h);
            h = maxDim;
          }
        }
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext("2d");
        ctx.drawImage(img, 0, 0, w, h);
        const compressed = canvas.toDataURL("image/jpeg", 0.75);
        if (slot === 1) setKycForm(prev => ({ ...prev, doc1Name: file.name, doc1Url: compressed }));
        else setKycForm(prev => ({ ...prev, doc2Name: file.name, doc2Url: compressed }));
      };
      img.onerror = () => {
        if (slot === 1) setKycForm(prev => ({ ...prev, doc1Name: file.name, doc1Url: event.target.result }));
        else setKycForm(prev => ({ ...prev, doc2Name: file.name, doc2Url: event.target.result }));
      };
      img.src = event.target.result;
    };
    reader.readAsDataURL(file);
  };

  // Submit KYC (2 Mandatory Documents: Doc 1 Aadhaar + Doc 2 PAN / Cheque)
  const submitKyc = async () => {
    // 0. Aadhaar-matching personal details (mandatory)
    if (!kycForm.aadhaarName.trim() || kycForm.aadhaarName.trim().length < 3) {
      setKycError("Aadhaar par jo naam likha hai woh darj karein (minimum 3 characters).");
      return;
    }
    const cleanPhone = kycForm.aadhaarPhone.replace(/\D/g, "");
    if (!cleanPhone || cleanPhone.length !== 10) {
      setKycError("Aadhaar se linked 10-digit mobile number darj karein.");
      return;
    }
    if (!kycForm.aadhaarAddress.trim() || kycForm.aadhaarAddress.trim().length < 10) {
      setKycError("Aadhaar par likha hua address darj karein (minimum 10 characters).");
      return;
    }

    // 1. Mandatory Document 1: Aadhaar
    const cleanAadhaar = kycForm.aadharNumber.replace(/\D/g, "");
    if (!cleanAadhaar || cleanAadhaar.length !== 12) {
      setKycError("Document 1: Kripya 12-digit valid Aadhaar number darj karein.");
      return;
    }
    if (!kycForm.doc1Url) {
      setKycError("Document 1: Aadhaar Card ki photo/document upload zaroori hai.");
      return;
    }


    // 2. Mandatory Document 2: PAN or Cheque
    if (kycForm.doc2Type === "pan") {
      const cleanPan = kycForm.panNumber.trim().toUpperCase();
      if (!cleanPan || !/^[A-Z]{5}[0-9]{4}[A-Z]{1}$/.test(cleanPan)) {
        setKycError("Document 2: Valid 10-digit PAN format (e.g. ABCDE1234F) darj karein.");
        return;
      }
    } else {
      if (!kycForm.chequeNumber.trim()) {
        setKycError("Document 2: Cheque number ya Bank account number darj karein.");
        return;
      }
    }

    if (!kycForm.doc2Url) {
      setKycError(`Document 2: ${kycForm.doc2Type === "pan" ? "PAN Card" : "Bank Cheque"} ki photo/document upload zaroori hai.`);
      return;
    }

    setKycSubmitting(true);
    setKycError("");
    try {
      const res = await fetch(`${API}/user/kyc/submit`, {
        method: "POST",
        headers,
        body: JSON.stringify({
          aadharNumber: cleanAadhaar,
          aadhaarName: kycForm.aadhaarName.trim(),
          aadhaarPhone: cleanPhone,
          aadhaarAddress: kycForm.aadhaarAddress.trim(),
          doc1Url: kycForm.doc1Url,
          doc2Type: kycForm.doc2Type,
          panNumber: kycForm.panNumber.trim().toUpperCase(),
          chequeNumber: kycForm.chequeNumber.trim(),
          doc2Url: kycForm.doc2Url,
          address: kycForm.aadhaarAddress.trim()
        })
      });
      const data = await res.json();
      if (res.ok) {
        showToast(data.message || "Dono KYC documents successfully submit ho gaye!", "success");
        setUserProfile(prev => ({
          ...prev,
          kycStatus: "pending",
          aadharNumber: cleanAadhaar,
          address: kycForm.address,
          kycDocuments: {
            ...prev.kycDocuments,
            docType: "aadhaar",
            doc1Type: "aadhaar",
            doc1Url: kycForm.doc1Url,
            doc2Type: kycForm.doc2Type,
            doc2Url: kycForm.doc2Url,
            aadharNumber: cleanAadhaar,
            panNumber: kycForm.panNumber,
            chequeNumber: kycForm.chequeNumber,
            address: kycForm.address,
            submittedAt: new Date()
          }
        }));
        closeModal();
      } else {
        setKycError(data.message || "KYC submit karne me samasya aayi.");
      }
    } catch {
      setKycError("Network error. Kripya dobara try karein.");
    } finally {
      setKycSubmitting(false);
    }
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
    if (loanForm.hasChequeFacility && !loanForm.chequeNumber) {
      return showToast("Kripya Cheque Number darj karein", "error");
    }

    setLoanSubmitting(true);
    triggerHeroFly("personal_submit");
    try {
      const res = await fetch(`${API}/loan/apply`, {
        method: "POST",
        headers,
        body: JSON.stringify({
          loanType: "personal",
          amount: quoteAmount,
          installmentsCount: quoteCount,
          hasChequeFacility: !!loanForm.hasChequeFacility,
          chequeNumber: loanForm.chequeNumber,
          purpose: loanForm.purpose || "Personal Needs",
          documents: {
            aadharNumber: loanForm.aadharNumber,
            panNumber: loanForm.panNumber,
            bankAccountNumber: loanForm.bankAccountNumber,
            bankIfsc: loanForm.bankIfsc,
            upiId: loanForm.upiId,
            chequeNumber: loanForm.chequeNumber,
            doc1Url: loanForm.doc1Url,
            doc2Url: loanForm.doc2Url
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
    } finally {
      setLoanSubmitting(false);
    }
  };

  // Submit Micro Business Loan Application
  const submitMicroBusinessLoan = async () => {
    if (!mblForm.aadharNumber || !mblForm.panNumber || !mblForm.bankAccountNumber) {
      return showToast("Kripya Aadhar, PAN aur Bank Account details darj karein", "error");
    }
    if (mblForm.hasChequeFacility && !mblForm.chequeNumber) {
      return showToast("Kripya Cheque Number darj karein", "error");
    }

    setLoanSubmitting(true);
    triggerHeroFly("business_submit");
    try {
      const res = await fetch(`${API}/loan/apply`, {
        method: "POST",
        headers,
        body: JSON.stringify({
          loanType: "micro_business",
          amount: mblAmount,
          days: mblDays,
          purpose: mblForm.purpose || "Micro Business Working Capital",
          hasChequeFacility: !!mblForm.hasChequeFacility,
          chequeNumber: mblForm.chequeNumber,
          documents: {
            aadharNumber: mblForm.aadharNumber,
            panNumber: mblForm.panNumber,
            bankAccountNumber: mblForm.bankAccountNumber,
            bankIfsc: mblForm.bankIfsc,
            businessName: mblForm.businessName,
            chequeNumber: mblForm.chequeNumber,
            doc1Url: mblForm.doc1Url,
            doc2Url: mblForm.doc2Url
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
    } finally {
      setLoanSubmitting(false);
    }
  };

  // Submit Student Loan Application
  const submitStudentLoan = async () => {
    if (!studentLoanForm.aadharNumber || !studentLoanForm.panNumber || !studentLoanForm.bankAccountNumber) {
      return showToast("Kripya Aadhar, PAN aur Bank Account details darj karein", "error");
    }
    if (!studentLoanForm.instituteName.trim()) {
      return showToast("Kripya School / College / Institute ka naam darj karein", "error");
    }
    if (studentLoanForm.hasChequeFacility && !studentLoanForm.chequeNumber) {
      return showToast("Kripya Cheque Number darj karein", "error");
    }

    setLoanSubmitting(true);
    triggerHeroFly("student_submit");
    try {
      const res = await fetch(`${API}/loan/apply`, {
        method: "POST",
        headers,
        body: JSON.stringify({
          loanType: "student",
          amount: studentAmount,
          installmentsCount: studentCount,
          hasChequeFacility: !!studentLoanForm.hasChequeFacility,
          chequeNumber: studentLoanForm.chequeNumber,
          purpose: `Student Fee - ${studentLoanForm.instituteName}`,
          documents: {
            aadharNumber: studentLoanForm.aadharNumber,
            panNumber: studentLoanForm.panNumber,
            bankAccountNumber: studentLoanForm.bankAccountNumber,
            bankIfsc: studentLoanForm.bankIfsc,
            instituteName: studentLoanForm.instituteName,
            chequeNumber: studentLoanForm.chequeNumber,
            doc1Url: studentLoanForm.doc1Url,
            doc2Url: studentLoanForm.doc2Url,
            studentProofUrl: studentLoanForm.studentProofUrl
          }
        })
      });
      const data = await res.json();
      if (res.ok) {
        showToast(data.message || "Student Loan successfully applied!", "success");
        closeModal();
        loadLoans();
        loadDashboard();
      } else {
        showToast(data.message || "Failed to apply student loan", "error");
      }
    } catch {
      showToast("Network error applying for student loan", "error");
    } finally {
      setLoanSubmitting(false);
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
    if (res.ok) { loadLoans(); loadActiveLoanDetails(); loadDashboard(); }
  };

  const handleInstallmentProofUpload = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) {
      showToast("File size 5MB se kam honi chahiye", "error");
      return;
    }
    setInstallmentProofName(file.name);
    const reader = new FileReader();
    reader.onload = () => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement("canvas");
        const maxW = 1200;
        let w = img.width;
        let h = img.height;
        if (w > maxW) {
          h = Math.round((h * maxW) / w);
          w = maxW;
        }
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext("2d");
        ctx.drawImage(img, 0, 0, w, h);
        setInstallmentProofUrl(canvas.toDataURL("image/jpeg", 0.8));
      };
      img.src = reader.result;
    };
    reader.readAsDataURL(file);
  };

  const submitInstallmentProof = async (e) => {
    e?.preventDefault();
    if (!submitInstallmentModal) return;

    if (installmentPayMethod === "wallet") {
      await payInstallment(submitInstallmentModal.loanId, submitInstallmentModal.amount);
      setSubmitInstallmentModal(null);
      return;
    }

    if (!installmentUtr || installmentUtr.trim().length < 6) {
      return showToast("Valid UTR / Ref number zaroori hai (min 6 digits)", "error");
    }
    if (!installmentProofUrl) {
      return showToast("Payment screenshot upload zaroori hai", "error");
    }

    setInstallmentSubmitting(true);
    try {
      const res = await fetch(`${API}/loan/${submitInstallmentModal.loanId}/submit-installment`, {
        method: "POST",
        headers,
        body: JSON.stringify({
          installmentNo: submitInstallmentModal.installmentNo,
          utrNumber: installmentUtr.trim(),
          proofUrl: installmentProofUrl
        })
      });
      const data = await res.json();
      showToast(data.message, res.ok ? "success" : "error");
      if (res.ok) {
        setSubmitInstallmentModal(null);
        setInstallmentUtr("");
        setInstallmentProofUrl("");
        setInstallmentProofName("");
        loadLoans();
        loadActiveLoanDetails();
        loadDashboard();
      }
    } catch {
      showToast("Network error submitting installment", "error");
    } finally {
      setInstallmentSubmitting(false);
    }
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

  const requireKyc = (callback) => {
    if (userProfile.kycStatus !== "verified") {
      showToast("KYC Verification zaroori hai! Kripya pehle document verify karwayein.", "warning");
      setModal("kyc");
      return false;
    }
    if (callback) callback();
    return true;
  };

  const activePersonalLoan = loans.find(l => (l.status === "active" || l.status === "pending" || l.status === "approved") && l.loanType === "personal");
  const activeBusinessLoan = loans.find(l => (l.status === "active" || l.status === "pending" || l.status === "approved") && l.loanType === "micro_business");
  const activeStudentLoan = loans.find(l => (l.status === "active" || l.status === "pending" || l.status === "approved") && l.loanType === "student");

  const openLoanSheet = (type) => {
    requireKyc(() => {
      const existingDoc1 = userProfile.kycDocuments?.doc1Url || userProfile.kycDocuments?.docUrl || "";
      const existingDoc2 = userProfile.kycDocuments?.doc2Url || "";
      if (type === "personal_loan") {
        setLoanForm(prev => ({
          ...prev,
          doc1Url: prev.doc1Url || existingDoc1,
          doc2Url: prev.doc2Url || existingDoc2
        }));
      } else if (type === "business_loan") {
        setMblForm(prev => ({
          ...prev,
          doc1Url: prev.doc1Url || existingDoc1,
          doc2Url: prev.doc2Url || existingDoc2
        }));
      } else if (type === "student_loan") {
        setStudentLoanForm(prev => ({
          ...prev,
          doc1Url: prev.doc1Url || existingDoc1,
          doc2Url: prev.doc2Url || existingDoc2
        }));
      }
      setAccountModal(type);
    });
  };

  const quickActions = [
    { icon: "📱", label: "My QR Code", sub: "Scan to receive", color: "bg-blue-100", action: () => setModal("my_qr") },
    { icon: "⚡", label: "Send Money", sub: "Instant P2P", color: "bg-emerald-100", action: () => requireKyc(() => setModal("send_money")) },
    { icon: "🏦", label: "Personal Loan", sub: "10-day cycle", color: "bg-indigo-100", action: () => openLoanSheet("personal_loan") },
    { icon: "🏬", label: "Business Loan", sub: "Daily collection", color: "bg-amber-100", action: () => openLoanSheet("business_loan") },
  ];

  const navItems = [
    { key: "home", label: "Home", icon: "🏠", onClick: () => { setModal(null); setShowLoans(false); setNavTab("home"); window.scrollTo({ top: 0, behavior: "smooth" }); } },
    { key: "loans", label: "Loans", icon: "🏦", onClick: openLoansHub, heroBadge: heroFlyId === "loans_hub" },
    { key: "scan", label: "Scan QR", icon: <ScannerIcon className="w-6 h-6 text-white" />, isCenter: true, onClick: () => setModal("scan_qr") },
    { key: "bonds", label: "Bonds", icon: "📈", onClick: () => setAccountModal("debt") },
    { key: "profile", label: "Profile", icon: "👤", onClick: () => setModal("profile") },
  ];

  // ══════════════════════════════════════════════════════
  // APP LOCK SCREEN ON OPEN (FINGERPRINT BIOMETRIC / 6-DIGIT PIN) - CLEAN LIGHT THEME
  // ══════════════════════════════════════════════════════
  if (appLocked) {
    return (
      <div className="min-h-[100dvh] bg-[#F8FAFC] text-slate-900 flex flex-col justify-between items-center p-6 relative font-sans select-none overflow-hidden">
        {/* Subtle Top Ambient Accent */}
        <div className="absolute top-0 inset-x-0 h-64 bg-gradient-to-b from-blue-500/10 via-indigo-500/5 to-transparent pointer-events-none blur-3xl" />
        
        {/* Top Header */}
        <div className="w-full max-w-sm flex items-center justify-between pt-safe relative z-10">
          <div className="flex items-center gap-2">
            <img src="/icon-192.png" alt="Educa Fintech" className="w-8 h-8 rounded-full object-contain border border-slate-200 bg-white shadow-xs" />
            <span className="font-extrabold text-sm tracking-tight text-slate-900">
              Educa <span className="text-blue-600">Fintech</span>
            </span>
          </div>
          <span className="text-[11px] font-bold px-2.5 py-1 rounded-full bg-blue-50 text-blue-700 border border-blue-200/80 flex items-center gap-1 shadow-xs">
            <span>🔒</span> Protected
          </span>
        </div>

        {/* Center Card & Authentication */}
        <div className="w-full max-w-sm flex flex-col items-center justify-center text-center my-auto relative z-10">
          {/* User Avatar */}
          <div className="w-20 h-20 rounded-3xl bg-blue-50 border-2 border-blue-200/70 p-1 shadow-md mb-4 flex items-center justify-center">
            <div className="w-full h-full bg-white rounded-[20px] flex items-center justify-center shadow-xs">
              <span className="text-3xl">👤</span>
            </div>
          </div>

          <h2 className="text-xl sm:text-2xl font-black text-slate-900 tracking-tight">
            Welcome Back
          </h2>
          <p className="text-xs text-slate-500 mt-1 mb-6 font-medium">
            {userStored.name || "Educa User"} · Unlock with fingerprint or PIN
          </p>

          {/* Fingerprint Biometric Trigger Button */}
          <button
            onClick={triggerBiometricAuth}
            className="group relative flex flex-col items-center justify-center w-24 h-24 rounded-full bg-white border-2 border-blue-500/80 shadow-xl shadow-blue-500/10 hover:border-blue-600 hover:shadow-blue-500/20 active:scale-95 transition duration-300 mb-6"
            title="Authenticate with Fingerprint"
          >
            <div className="absolute inset-0 rounded-full border border-blue-400/40 animate-ping pointer-events-none" />
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="w-10 h-10 text-blue-600 group-hover:scale-110 transition-transform">
              <path d="M12 2a10 10 0 0 0-10 10c0 4.42 2.87 8.17 6.84 9.5.5.08.66-.23.66-.5v-1.69c-2.77.6-3.36-1.34-3.36-1.34-.46-1.16-1.11-1.47-1.11-1.47-.91-.62.07-.6.07-.6 1 .07 1.53 1.03 1.53 1.03.87 1.52 2.34 1.07 2.91.83.1-.65.35-1.09.63-1.34-2.22-.25-4.55-1.11-4.55-4.92 0-1.11.38-2 1.03-2.71-.1-.25-.45-1.29.1-2.64 0 0 .84-.27 2.75 1.02.79-.22 1.65-.33 2.5-.33.85 0 1.71.11 2.5.33 1.91-1.29 2.75-1.02 2.75-1.02.55 1.35.2 2.39.1 2.64.65.71 1.03 1.6 1.03 2.71 0 3.82-2.34 4.66-4.57 4.91.36.31.69.92.69 1.85V21c0 .27.16.59.67.5C19.14 20.16 22 16.42 22 12A10 10 0 0 0 12 2z" />
            </svg>
            <span className="text-[10px] text-blue-700 font-bold mt-1">Tap Sensor</span>
          </button>

          {/* Single Interactive 6-Digit PIN Box Input */}
          <div className="w-full bg-white border border-slate-200/90 shadow-xl shadow-slate-200/50 rounded-3xl p-6">
            <p className="text-xs font-bold text-slate-700 mb-4">Enter 6-digit Wallet Security PIN</p>
            
            {/* Clickable 6-digit boxes with transparent overlay input */}
            <div className="relative flex justify-center gap-2.5 mb-2 cursor-pointer">
              {[0, 1, 2, 3, 4, 5].map((idx) => {
                const hasDigit = appLockPin.length > idx;
                const isCurrent = appLockPin.length === idx;
                return (
                  <div
                    key={idx}
                    className={`w-11 h-14 rounded-2xl border-2 flex items-center justify-center text-xl font-black transition-all ${
                      hasDigit
                        ? "border-blue-600 bg-blue-50/60 text-blue-700 shadow-sm scale-105"
                        : isCurrent
                        ? "border-blue-400 bg-white ring-4 ring-blue-100"
                        : "border-slate-200 bg-slate-50 text-slate-400"
                    }`}
                  >
                    {hasDigit ? "●" : ""}
                  </div>
                );
              })}

              {/* Native transparent input directly on the 6 boxes */}
              <input
                type="password"
                inputMode="numeric"
                pattern="[0-9]*"
                maxLength={6}
                autoFocus
                value={appLockPin}
                onChange={(e) => {
                  const val = e.target.value.replace(/\D/g, "").slice(0, 6);
                  setAppLockPin(val);
                  setAppLockError("");
                  if (val.length === 6) {
                    verifyAppLockPin(val);
                  }
                }}
                className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                aria-label="Enter 6-digit PIN"
              />
            </div>

            <p className="text-[11px] text-slate-400 font-medium mt-2">
              Tap boxes to type PIN · Auto-unlocks on 6 digits
            </p>

            {appLockError && (
              <p className="text-xs text-rose-600 font-semibold mt-2.5">{appLockError}</p>
            )}

            {appLockLoading && (
              <p className="text-xs text-blue-600 font-bold mt-2.5 animate-pulse">Verifying PIN...</p>
            )}
          </div>
        </div>

        {/* Bottom Switch Account / Logout */}
        <div className="w-full max-w-sm flex items-center justify-between pb-safe pt-4 relative z-10 text-xs text-slate-500">
          <button
            onClick={logout}
            className="hover:text-rose-600 font-semibold transition"
          >
            Log Out / Switch Account
          </button>
          <span className="font-medium text-slate-400">Educa Fintech Security</span>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-gray-50 min-h-[100dvh] w-full max-w-full overflow-x-hidden pb-safe-nav sm:pb-0 font-sans select-none">
      {/* NAVBAR */}
      <nav className="bg-white shadow-sm sticky top-0 z-30 border-b border-gray-100 safe-top w-full">
        <div className="w-full max-w-7xl mx-auto px-3.5 sm:px-6 py-3 sm:py-3.5 flex justify-between items-center">
          <div className="flex items-center gap-2.5 min-w-0 shrink-0">
            <img src="/icon-192.png" alt="Educa Fintech" className="w-8 h-8 shrink-0 rounded-full object-contain border border-gray-200 bg-white shadow-xs" />
            <div className="min-w-0">
              <h1 className="text-lg sm:text-xl font-black font-display bg-gradient-to-r from-blue-600 to-cyan-600 bg-clip-text text-transparent leading-none whitespace-nowrap">
                {txt.appTitle}
              </h1>
            </div>
          </div>
          <div className="flex items-center gap-2 sm:gap-2.5">
            {/* Unified Settings Button (Language, Blind Voice Guide, & Tour) */}
            <button
              onClick={() => setModal("settings")}
              aria-label="Settings and Accessibility"
              className="px-2.5 sm:px-3 py-1.5 bg-gray-50 hover:bg-gray-100 text-gray-700 rounded-xl font-bold text-xs flex items-center gap-1.5 transition active:scale-95 border border-gray-200"
              title="Settings & Accessibility"
            >
              <span>⚙️</span> <span className="hidden sm:inline">Settings</span>
            </button>

            <button onClick={logout} className="hidden sm:inline-block px-3 py-1.5 bg-red-50 text-red-600 rounded-lg hover:bg-red-100 transition font-semibold text-xs">
              {txt.logout}
            </button>
          </div>
        </div>
      </nav>

      <div className="w-full max-w-7xl mx-auto px-3.5 sm:px-6 py-4 sm:py-8 overflow-x-hidden">

        {/* ══════════════════════════════════════════════════════
            1. TOP ROW: PROFIT WALLET & DUES WALLET (SIDE-BY-SIDE)
        ══════════════════════════════════════════════════════ */}
        <div className="grid grid-cols-2 gap-3 mb-4">
          {/* Left: Profit Wallet Balance Card */}
          <div
            onClick={() => { setModal("profit_history"); loadProfitHistory(); }}
            className="bg-gradient-to-br from-emerald-600 via-emerald-700 to-teal-800 rounded-3xl p-4 sm:p-5 text-white shadow-lg relative overflow-hidden flex flex-col justify-between cursor-pointer active:scale-[0.98] transition hover:shadow-xl"
          >
            <div className="absolute top-0 right-0 w-24 h-24 bg-white/10 rounded-full -mr-12 -mt-12 pointer-events-none" />
            <div className="relative z-10">
              <div className="flex justify-between items-center mb-1">
                <span className="text-emerald-100 text-[11px] sm:text-xs font-bold uppercase tracking-wider">{txt.profitWallet}</span>
                <span className="text-base sm:text-lg">📈</span>
              </div>
              <h3 className="text-2xl sm:text-3xl font-black font-display mb-1 truncate">
                ₹{(userProfile.profitBalance || 0).toLocaleString("en-IN")}
              </h3>
              <p className="text-emerald-100/90 text-[11px] hidden sm:block">1% Monthly Daily Yield & 365d Bonds</p>
            </div>
            <div className="pt-2 border-t border-emerald-500/40 flex justify-between items-center text-[11px] text-emerald-100 relative z-10 mt-2">
              <span>{userProfile.interestRate || currentRate}% APY</span>
              <span className="font-bold underline">History & Bonds →</span>
            </div>
          </div>

          {/* Right: Dues Wallet Balance Card - CLEAN & UNLOCKED */}
          <div
            onClick={openLoansHub}
            className={`relative overflow-visible rounded-3xl p-4 sm:p-5 text-white shadow-lg flex flex-col justify-between cursor-pointer active:scale-95 transition hover:shadow-xl ${
              (userProfile.duesBalance || 0) > 0
                ? "bg-gradient-to-br from-red-600 via-rose-600 to-red-800 shadow-red-500/25"
                : "bg-gradient-to-br from-slate-900 via-rose-950 to-neutral-900 border border-red-900/40 shadow-red-950/20"
            }`}
          >
            {heroFlyId === "loans_hub" && <LoanHeroFlyBadge />}
            <div className="absolute top-0 right-0 w-24 h-24 bg-white/10 rounded-full -mr-12 -mt-12 pointer-events-none" />
            <div className="relative z-10">
              <div className="flex justify-between items-center mb-1">
                <span className="text-red-100 text-[11px] sm:text-xs font-bold uppercase tracking-wider">{txt.duesWallet}</span>
                <span className="text-base sm:text-lg">
                  {(userProfile.duesBalance || 0) > 0 ? "📅" : "✅"}
                </span>
              </div>
              <h3 className="text-2xl sm:text-3xl font-black font-display mb-1 truncate text-white">
                ₹{(userProfile.duesBalance || 0).toLocaleString("en-IN")}
              </h3>
              <p className="text-red-100/90 text-[11px] hidden sm:block">
                {(userProfile.duesBalance || 0) > 0
                  ? "Pending Easy Installments & upcoming collections"
                  : "No Active Dues • All Clear (₹0)"}
              </p>
            </div>
            <div className="pt-2 border-t border-red-400/30 flex justify-between items-center text-[11px] text-red-100 relative z-10 mt-2">
              <span>{(userProfile.duesBalance || 0) > 0 ? "10-Day Cycle (1st, 11th, 21st)" : "All Clear"}</span>
              <span className="font-bold underline">
                {(userProfile.duesBalance || 0) > 0 ? "Pay Installment →" : "View Details →"}
              </span>
            </div>
          </div>
        </div>

        {/* ══════════════════════════════════════════════════════
            2. PROMINENT CENTER QR SCANNER HERO (NO SCREEN AMOUNT)
        ══════════════════════════════════════════════════════ */}
        <div className="bg-gradient-to-br from-blue-600 via-indigo-600 to-blue-700 rounded-3xl p-6 sm:p-7 text-white shadow-xl relative overflow-hidden mb-6 sm:mb-8 text-center">
          <div className="absolute top-0 right-0 w-40 h-40 bg-white/10 rounded-full -mr-16 -mt-16 pointer-events-none" />
          <div className="absolute bottom-0 left-0 w-32 h-32 bg-indigo-500/20 rounded-full -ml-12 -mb-12 pointer-events-none" />
          
          <div className="relative z-10 flex flex-col items-center justify-center">
            {/* Center Big QR Button */}
            <button
              onClick={() => setModal("scan_qr")}
              className="group relative flex flex-col items-center justify-center p-5 sm:p-6 bg-white rounded-3xl shadow-2xl hover:shadow-cyan-500/25 active:scale-95 transition-all duration-300 w-full max-w-xs mx-auto border-2 border-white/60"
            >
              <div className="w-16 h-16 sm:w-20 sm:h-20 bg-gradient-to-tr from-blue-600 via-indigo-600 to-cyan-500 rounded-2xl flex items-center justify-center text-white shadow-lg shadow-blue-500/30 mb-3 group-hover:scale-105 transition-transform">
                <ScannerIcon className="w-8 h-8 sm:w-10 sm:h-10 text-white" />
              </div>
              <span className="text-base sm:text-lg font-black text-gray-900 group-hover:text-blue-600 transition-colors">
                Scan Any QR Code
              </span>
              <span className="text-xs text-gray-500 font-medium mt-0.5">
                Camera Scanner & Gallery Upload
              </span>
              <div className="mt-3 px-3 py-1 bg-blue-50 text-blue-700 rounded-full text-[10px] font-black uppercase tracking-wider">
                Instant P2P & Merchant Pay
              </div>
            </button>

            {/* Quick Action Pill Buttons */}
            <div className="flex flex-wrap items-center justify-center gap-2.5 sm:gap-3 mt-5 w-full">
              <button
                onClick={() => requireKyc(() => setModal("send_money"))}
                className="py-2 px-4 bg-white/20 hover:bg-white/30 backdrop-blur text-white rounded-xl font-bold text-xs border border-white/30 active:scale-95 transition flex items-center gap-1.5"
              >
                <span>⚡</span> Send Money
              </button>
              <button
                onClick={() => setModal("my_qr")}
                className="py-2 px-4 bg-white/20 hover:bg-white/30 backdrop-blur text-white rounded-xl font-bold text-xs border border-white/30 active:scale-95 transition flex items-center gap-1.5"
              >
                <span>📱</span> My QR Code
              </button>
              <button
                onClick={() => setModal("deposit")}
                className="py-2 px-4 bg-white/20 hover:bg-white/30 backdrop-blur text-white rounded-xl font-bold text-xs border border-white/30 active:scale-95 transition flex items-center gap-1.5"
              >
                <span>➕</span> Add Money
              </button>
              <button
                onClick={() => requireKyc(() => setModal("withdraw"))}
                className="py-2 px-4 bg-white/10 hover:bg-white/20 backdrop-blur text-white/90 rounded-xl font-bold text-xs border border-white/20 active:scale-95 transition flex items-center gap-1.5"
              >
                <span>↓</span> Cash Out
              </button>
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
              className="p-5 rounded-2xl border-2 border-gray-200 hover:border-indigo-500 bg-white hover:bg-indigo-50/20 shadow-xs hover:shadow-md transition cursor-pointer flex flex-col justify-between"
            >
              <div>
                <div className="flex justify-between items-start mb-3">
                  <div className="w-11 h-11 rounded-xl bg-indigo-100 text-indigo-700 flex items-center justify-center text-xl">
                    🤝
                  </div>
                  <span className="px-2.5 py-0.5 rounded-full text-[11px] font-black bg-indigo-100 text-indigo-800">
                    Monthly Payouts
                  </span>
                </div>
                <h4 className="font-extrabold text-base text-gray-900">Lending Account</h4>
                <p className="text-xs text-gray-500 mt-1 mb-3">
                  1 Lakh par ₹1,40,000 (₹3,500/mo x 40m) ya ₹1,80,000 (80m) monthly payouts.
                </p>
              </div>
              <div className="pt-3 border-t border-gray-100 flex items-center justify-between text-xs">
                <span className="font-bold text-indigo-700">₹3,500/mo Returns</span>
                <span className="text-indigo-600 font-bold">Open Lending →</span>
              </div>
            </div>

            {/* 4. Personal Loan Account (5k-50k, 10-day cycle, Cheque facility) */}
            <div
              onClick={() => {
                triggerHeroFly("card_personal");
                openLoanSheet("personal_loan");
              }}
              className="relative overflow-visible p-5 rounded-2xl border-2 border-emerald-500/50 bg-emerald-50/20 hover:border-emerald-600 shadow-xs hover:shadow-md active:scale-95 transition cursor-pointer flex flex-col justify-between"
            >
              {heroFlyId === "card_personal" && <LoanHeroFlyBadge />}
              <div>
                <div className="flex justify-between items-start mb-3">
                  <div className="w-11 h-11 rounded-xl bg-emerald-100 text-emerald-800 flex items-center justify-center text-xl">
                    🏦
                  </div>
                  <span className="px-2.5 py-0.5 rounded-full text-[11px] font-black bg-emerald-100 text-emerald-800">
                    {activePersonalLoan ? (activePersonalLoan.accountNumber || "EFSPL0001") : "10-Day Cycle"}
                  </span>
                </div>
                <h4 className="font-extrabold text-base text-gray-900">Personal Loan Account</h4>
                <p className="text-xs text-gray-500 mt-1 mb-3">
                  {activePersonalLoan
                    ? `Active: ${activePersonalLoan.accountNumber} • Early payoff option available.`
                    : `1st time limit: ₹5k. Min 15 Easy Installments on 1st, 11th & 21st.`}
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
              onClick={() => {
                triggerHeroFly("card_student");
                openLoanSheet("student_loan");
              }}
              className="relative overflow-visible p-5 rounded-2xl border-2 border-cyan-500/50 bg-cyan-50/20 hover:border-cyan-600 shadow-xs hover:shadow-md active:scale-95 transition cursor-pointer flex flex-col justify-between"
            >
              {heroFlyId === "card_student" && <LoanHeroFlyBadge />}
              <div>
                <div className="flex justify-between items-start mb-3">
                  <div className="w-11 h-11 rounded-xl bg-cyan-100 text-cyan-700 flex items-center justify-center text-xl">
                    🎓
                  </div>
                  <span className="px-2.5 py-0.5 rounded-full text-[11px] font-black bg-cyan-100 text-cyan-800">
                    {activeStudentLoan ? (activeStudentLoan.accountNumber || "EDUCA-STU") : "8% p.a."}
                  </span>
                </div>
                <h4 className="font-extrabold text-base text-gray-900">Student Loan Account</h4>
                <p className="text-xs text-gray-500 mt-1 mb-3">
                  {activeStudentLoan
                    ? `Active: ${activeStudentLoan.accountNumber} • Subsidized student fee support.`
                    : "School, college aur coaching fee direct transfer. Subsidized interest aur 15-30 Easy Installments."}
                </p>
              </div>
              <div className="pt-3 border-t border-cyan-200/60 flex items-center justify-between text-xs">
                <span className="font-bold text-cyan-800">
                  {activeStudentLoan ? `₹${activeStudentLoan.amount.toLocaleString("en-IN")}` : `Limit ₹${maxLimit.toLocaleString("en-IN")}`}
                </span>
                <span className="text-cyan-700 font-bold">
                  {activeStudentLoan ? "View Loan Data →" : "Apply Student Loan →"}
                </span>
              </div>
            </div>

            {/* 6. Micro Business Loan Account (Daily Collection) */}
            <div
              onClick={() => {
                triggerHeroFly("card_business");
                openLoanSheet("business_loan");
              }}
              className="relative overflow-visible p-5 rounded-2xl border-2 border-amber-500/50 bg-amber-50/20 hover:border-amber-600 shadow-xs hover:shadow-md active:scale-95 transition cursor-pointer flex flex-col justify-between"
            >
              {heroFlyId === "card_business" && <LoanHeroFlyBadge />}
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
                  {activeBusinessLoan ? `₹${activeBusinessLoan.installmentAmount}/day` : `Limit ₹${maxLimit.toLocaleString("en-IN")}`}
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
          SCAN QR CODE SHEET (REDESIGNED ULTRA-POLISHED SCANNER)
      ══════════════════════════════════════════════════════ */}
      <Sheet
        open={modal === "scan_qr"}
        onClose={closeModal}
        title="Scan Any QR Code"
        icon={<ScannerIcon className="w-5 h-5 text-blue-600 inline" />}
        extraHeader={
          hasTorch ? (
            <button
              type="button"
              onClick={toggleTorch}
              className={`px-2.5 py-1 rounded-xl border text-xs font-bold transition flex items-center gap-1.5 ${
                torchOn
                  ? "bg-amber-400 text-slate-950 border-amber-300 shadow-md shadow-amber-400/30"
                  : "bg-slate-100 text-slate-700 border-slate-200 hover:bg-slate-200 active:scale-95"
              }`}
              title="Toggle Flashlight"
            >
              <span>{torchOn ? "🔦 On" : "🔦 Flash"}</span>
            </button>
          ) : null
        }
      >
        <div className="space-y-4">
          {/* Top Info Banner / Status Pill */}
          <div className="flex items-center justify-between px-3.5 py-2 rounded-2xl bg-blue-50/70 border border-blue-200/60 text-xs">
            <div className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-blue-600 animate-pulse" />
              <span className="text-slate-800 font-semibold text-[11px]">UPI & BharatQR Auto-Detect</span>
            </div>
            <span className="text-[10px] text-blue-700 font-bold bg-white px-2 py-0.5 rounded-lg border border-blue-200 shadow-xs">
              ⚡ Instant Pay
            </span>
          </div>

          {/* Scanner Viewport with Custom High-Tech Viewfinder Reticle */}
          <div className="relative rounded-3xl overflow-hidden bg-slate-900 border border-slate-200 h-[340px] sm:h-[380px] flex items-center justify-center shadow-lg">
            {/* The html5-qrcode video viewport */}
            <div id="educa-qr-reader" className="w-full h-full" />

            {/* Custom High-Tech Laser Viewfinder Reticle Overlay */}
            {cameraActive && (
              <div className="absolute inset-0 pointer-events-none flex flex-col items-center justify-center p-4">
                {/* 240x240 Target Box with Glowing Cyan Corner Brackets */}
                <div className="relative w-60 h-60 sm:w-64 sm:h-64 flex items-center justify-center">
                  {/* Top-Left Bracket */}
                  <div className="absolute top-0 left-0 w-8 h-8 border-t-3 border-l-3 border-cyan-400 rounded-tl-xl shadow-[0_0_10px_rgba(34,211,238,0.8)]" />
                  {/* Top-Right Bracket */}
                  <div className="absolute top-0 right-0 w-8 h-8 border-t-3 border-r-3 border-cyan-400 rounded-tr-xl shadow-[0_0_10px_rgba(34,211,238,0.8)]" />
                  {/* Bottom-Left Bracket */}
                  <div className="absolute bottom-0 left-0 w-8 h-8 border-b-3 border-l-3 border-cyan-400 rounded-bl-xl shadow-[0_0_10px_rgba(34,211,238,0.8)]" />
                  {/* Bottom-Right Bracket */}
                  <div className="absolute bottom-0 right-0 w-8 h-8 border-b-3 border-r-3 border-cyan-400 rounded-br-xl shadow-[0_0_10px_rgba(34,211,238,0.8)]" />

                  {/* Corner Finder Dots */}
                  <div className="absolute top-2 left-2 w-1.5 h-1.5 rounded-full bg-cyan-400/90" />
                  <div className="absolute top-2 right-2 w-1.5 h-1.5 rounded-full bg-cyan-400/90" />
                  <div className="absolute bottom-2 left-2 w-1.5 h-1.5 rounded-full bg-cyan-400/90" />
                  <div className="absolute bottom-2 right-2 w-1.5 h-1.5 rounded-full bg-cyan-400/90" />

                  {/* High-Tech Animated Laser Beam Line */}
                  <div className="absolute inset-x-2 top-0 h-0.5 bg-gradient-to-r from-transparent via-cyan-400 to-transparent shadow-[0_0_14px_#22d3ee] animate-laserBeam" />
                </div>

                {/* Floating Micro-Instruction Badge */}
                <div className="mt-4 px-3.5 py-1.5 rounded-full bg-white/95 backdrop-blur-md border border-slate-200 text-[11px] font-semibold text-slate-800 flex items-center gap-2 shadow-lg">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-ping" />
                  <span>QR code ko frame ke andar rakhein</span>
                </div>
              </div>
            )}

            {/* Camera Initializing State */}
            {!cameraActive && !cameraError && (
              <div className="absolute inset-0 flex flex-col items-center justify-center text-slate-300 gap-3 bg-slate-900 p-6 text-center">
                <div className="w-10 h-10 border-3 border-cyan-400 border-t-transparent rounded-full animate-spin shadow-[0_0_15px_rgba(34,211,238,0.3)]" />
                <span className="text-xs font-semibold text-slate-200">Camera shuru ho raha hai...</span>
                <span className="text-[11px] text-slate-400">Fast QR Scanner sensor loading</span>
              </div>
            )}

            {/* Camera Error State */}
            {cameraError && (
              <div className="absolute inset-0 flex flex-col items-center justify-center text-slate-200 gap-3 bg-slate-900/95 p-6 text-center">
                <div className="w-12 h-12 rounded-2xl bg-rose-500/10 border border-rose-500/20 text-rose-400 flex items-center justify-center text-2xl">
                  ⚠️
                </div>
                <h4 className="text-sm font-bold text-white">Camera Access Required</h4>
                <p className="text-xs text-slate-300 max-w-xs">{cameraError}</p>
                <button
                  type="button"
                  onClick={() => document.getElementById("gallery-qr-upload")?.click()}
                  className="mt-2 py-2.5 px-4 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-bold text-xs transition active:scale-95 shadow-md"
                >
                  Choose from Gallery Instead →
                </button>
              </div>
            )}
          </div>

          {/* Action Buttons Toolbar: Gallery & My QR */}
          <div className="grid grid-cols-2 gap-2.5 pt-1">
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
              className="w-full py-3.5 px-3 bg-blue-600 hover:bg-blue-700 text-white rounded-2xl font-bold text-xs flex items-center justify-center gap-2 shadow-lg shadow-blue-500/20 active:scale-95 transition"
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4">
                <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
                <circle cx="8.5" cy="8.5" r="1.5" />
                <polyline points="21 15 16 10 5 21" />
              </svg>
              <span>Gallery se QR Chunein</span>
            </button>

            <button
              type="button"
              onClick={() => { closeModal(); setTimeout(() => setModal("my_qr"), 150); }}
              className="w-full py-3.5 px-3 bg-slate-100 hover:bg-slate-200 border border-slate-200 text-slate-800 rounded-2xl font-bold text-xs flex items-center justify-center gap-1.5 active:scale-95 transition"
            >
              <span className="text-base">📱</span>
              <span>Mera QR Code</span>
            </button>
          </div>

          {/* Footer Trust Badges */}
          <div className="text-center pt-1 text-[11px] text-slate-400 font-medium flex items-center justify-center gap-2">
            <span>Google Pay</span>
            <span>·</span>
            <span>PhonePe</span>
            <span>·</span>
            <span>Paytm</span>
            <span>·</span>
            <span>BharatQR</span>
          </div>

          {/* Temporary hidden container for scanning gallery files */}
          <div id="educa-qr-reader-temp" style={{ display: "none" }} />
        </div>
      </Sheet>

      {/* ══════════════════════════════════════════════════════
          PROFIT WALLET & DAILY YIELD STATEMENT SHEET
      ══════════════════════════════════════════════════════ */}
      <Sheet open={modal === "profit_history"} onClose={closeModal} title="Profit Wallet & Returns Statement" icon="📈">
        <div className="space-y-4">
          {/* Total Profit Hero Banner */}
          <div className="bg-gradient-to-br from-emerald-600 via-emerald-700 to-teal-800 rounded-3xl p-5 text-white shadow-xl relative overflow-hidden">
            <div className="absolute top-0 right-0 w-32 h-32 bg-white/10 rounded-full -mr-10 -mt-10 pointer-events-none" />
            <div className="flex justify-between items-center mb-1">
              <span className="text-[11px] font-bold uppercase tracking-wider text-emerald-100">Total Profit Balance</span>
              <span className="text-xs px-2.5 py-0.5 rounded-full bg-emerald-500/30 border border-emerald-300/40 text-emerald-100 font-bold">
                ⚡ Active Yield
              </span>
            </div>
            <div className="text-3xl sm:text-4xl font-black font-display my-1">
              ₹{(userProfile.profitBalance || 0).toLocaleString("en-IN")}
            </div>
            <div className="flex items-center gap-2 mt-2 pt-2 border-t border-emerald-500/30 text-xs text-emerald-100">
              <span>Daily Profit Added to Savings Account (12% Annual Yield)</span>
            </div>
          </div>


          {/* Transactions Statement List */}
          <div>
            <div className="flex justify-between items-center mb-2.5">
              <h4 className="text-xs font-bold text-gray-500 uppercase tracking-wider">
                Profit Credit Statement
              </h4>
              <button
                onClick={loadProfitHistory}
                className="text-[11px] font-bold text-emerald-600 hover:text-emerald-700 flex items-center gap-1"
              >
                <span>🔄</span> Refresh
              </button>
            </div>

            {loadingProfitHistory ? (
              <div className="py-8 text-center text-gray-400 text-xs animate-pulse">
                Loading profit statement...
              </div>
            ) : profitHistory.length === 0 ? (
              <div className="py-8 text-center text-gray-400 text-xs bg-gray-50 rounded-2xl border border-gray-100 p-4">
                <span className="text-2xl block mb-1">🌱</span>
                Abhi tak koi profit entry nahi hai. Primary wallet me balance rakhein ya 365-day bond create karein roz profit paane ke liye!
              </div>
            ) : (
              <div className="space-y-2.5 max-h-[340px] overflow-y-auto pr-1">
                {profitHistory.map((item) => (
                  <div
                    key={item._id}
                    className="p-3.5 bg-white border border-gray-100 rounded-2xl shadow-xs flex items-center justify-between"
                  >
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-xl bg-emerald-100 text-emerald-700 flex items-center justify-center text-lg font-bold shrink-0">
                        {item.type === "daily_yield" ? "⚡" : item.type === "bond_payout" ? "🏛️" : "🎁"}
                      </div>
                      <div>
                        <p className="text-xs font-extrabold text-gray-900">
                          {item.type === "daily_yield"
                            ? "Daily Savings Yield"
                            : item.type === "bond_payout"
                            ? "Bond Payout / Return"
                            : "Referral Bonus"}
                        </p>
                        <p className="text-[11px] text-gray-500 max-w-[200px] sm:max-w-xs truncate">
                          {item.remarks || "Profit credited to account"}
                        </p>
                        <p className="text-[10px] text-gray-400 mt-0.5">
                          {new Date(item.createdAt).toLocaleString("en-IN", {
                            day: "numeric",
                            month: "short",
                            year: "numeric",
                            hour: "2-digit",
                            minute: "2-digit"
                          })}
                        </p>
                      </div>
                    </div>
                    <div className="text-right shrink-0">
                      <span className="text-xs sm:text-sm font-black text-emerald-600 block">
                        +₹{Number(item.amount || 0).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </span>
                      <span className="text-[10px] font-bold text-emerald-500 uppercase">Credited</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Action to Explore Bonds */}
          <div className="pt-2 border-t border-gray-100">
            <button
              onClick={() => { closeModal(); setAccountModal("debt"); }}
              className="w-full py-3 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700 text-white rounded-2xl font-bold text-xs shadow-md shadow-emerald-500/20 active:scale-95 transition"
            >
              Explore 365-Day 18% Bonds →
            </button>
          </div>
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
                <ScannerIcon className="w-3.5 h-3.5 text-emerald-600 inline mr-0.5" /> Scan QR / Gallery
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
              <div className="p-3 bg-emerald-50 border-2 border-emerald-300 rounded-xl text-xs text-emerald-950 font-bold mt-2 flex items-center justify-between shadow-xs">
                <div className="flex items-center gap-2.5">
                  <div className="w-8 h-8 rounded-full bg-emerald-600 text-white font-black text-xs flex items-center justify-center">
                    {(recipientInfo.name || "U")[0].toUpperCase()}
                  </div>
                  <div>
                    <span className="text-emerald-800 text-[10px] uppercase font-bold block">Paying To (Verified User)</span>
                    <span className="text-sm font-black text-emerald-950">{recipientInfo.name}</span>
                  </div>
                </div>
                <span className="font-mono text-[10px] bg-emerald-100 text-emerald-800 px-2 py-0.5 rounded-md font-bold">
                  ✓ Verified
                </span>
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
            {/* Account Card */}
            <div className="bg-gradient-to-r from-emerald-600 to-teal-700 rounded-2xl p-5 text-white shadow-md">
              <div className="flex justify-between items-center">
                <span className="text-xs font-bold uppercase tracking-wider text-emerald-100">Loan Account</span>
                <span className="px-2 py-0.5 rounded-full text-[10px] font-black bg-white/20 text-white uppercase">
                  {activePersonalLoan.status}
                </span>
              </div>
              <div className="text-2xl sm:text-3xl font-black font-mono my-1 tracking-wider">
                {activePersonalLoan.accountNumber || "EFSPL0001"}
              </div>
              <div className="flex justify-between text-xs text-emerald-100 pt-1">
                <span>Sanctioned: ₹{activePersonalLoan.amount.toLocaleString("en-IN")}</span>
                <span>Total: ₹{(activePersonalLoan.totalPayable || (activePersonalLoan.amount + (activePersonalLoan.amount * 0.2))).toLocaleString("en-IN")}</span>
              </div>
            </div>

            {/* 5-DAY UPCOMING DUE ALERT BANNER */}
            {activeLoanDetails?.isUpcomingSoon && activeLoanDetails?.nextInstallment && (
              <div className="p-3.5 bg-gradient-to-r from-amber-50 to-orange-50 border-2 border-amber-400 rounded-2xl space-y-2 text-amber-950 shadow-sm animate-pulse">
                <div className="flex items-center gap-2">
                  <span className="text-xl">🔔</span>
                  <span className="font-black text-xs uppercase tracking-wide text-amber-900">
                    Upcoming Due Alert (Installment #{activeLoanDetails.nextInstallment.installmentNo})
                  </span>
                </div>
                <p className="text-xs font-medium text-amber-900">
                  Aapki agli installment <strong>₹{activeLoanDetails.nextInstallment.amount}</strong> {
                    activeLoanDetails.daysUntilDue === 0 ? "aaj hi due hai!" :
                    activeLoanDetails.daysUntilDue < 0 ? `${Math.abs(activeLoanDetails.daysUntilDue)} din pehle overdue ho chuki hai!` :
                    `${activeLoanDetails.daysUntilDue} din me due hone wali hai (${activeLoanDetails.nextInstallment.dueDate ? new Date(activeLoanDetails.nextInstallment.dueDate).toLocaleDateString("en-IN") : "Upcoming"})`
                  }
                </p>
                <button
                  type="button"
                  onClick={() => setSubmitInstallmentModal({
                    loanId: activePersonalLoan._id,
                    installmentNo: activeLoanDetails.nextInstallment.installmentNo,
                    amount: activeLoanDetails.nextInstallment.amount
                  })}
                  className="w-full py-2 bg-gradient-to-r from-amber-600 to-orange-600 text-white rounded-xl font-bold text-xs shadow-xs hover:from-amber-700 hover:to-orange-700 active:scale-95 transition cursor-pointer"
                >
                  Pay Installment #{activeLoanDetails.nextInstallment.installmentNo} (₹{activeLoanDetails.nextInstallment.amount}) →
                </button>
              </div>
            )}

            {/* Loan Metrics */}
            <div className="border border-gray-100 rounded-2xl p-4 bg-gray-50 space-y-2 text-xs">
              <div className="flex justify-between"><span className="text-gray-500">Tenure:</span><span className="font-bold">{activePersonalLoan.installmentsCount || activePersonalLoan.tenure} Easy Installments</span></div>
              <div className="flex justify-between"><span className="text-gray-500">Repayment Cycle:</span><span className="font-bold">10 Days (1st, 11th, 21st of month)</span></div>
              <div className="flex justify-between"><span className="text-gray-500">Per Installment:</span><span className="font-bold text-emerald-700">₹{activePersonalLoan.installmentAmount || activePersonalLoan.emiAmount}</span></div>
              <div className="flex justify-between"><span className="text-gray-500">Total Paid Amount:</span><span className="font-bold text-emerald-600">₹{(activePersonalLoan.paidAmount || 0).toLocaleString("en-IN")}</span></div>
              <div className="flex justify-between"><span className="text-gray-500">Remaining Dues Balance:</span><span className="font-bold text-rose-600">₹{(activePersonalLoan.remainingAmount ?? activePersonalLoan.amount).toLocaleString("en-IN")}</span></div>
            </div>

            {/* Primary Action Buttons */}
            {activePersonalLoan.status === "active" && (
              <div className="space-y-2.5">
                <button
                  type="button"
                  onClick={() => {
                    const list = (activeLoanDetails?.installments || activePersonalLoan.installmentSchedule || []);
                    const pendingInst = list.find(x => x.status === "pending" || x.status === "overdue") || list[0];
                    setSubmitInstallmentModal({
                      loanId: activePersonalLoan._id,
                      installmentNo: pendingInst ? pendingInst.installmentNo : 1,
                      amount: pendingInst ? pendingInst.amount : (activePersonalLoan.installmentAmount || activePersonalLoan.emiAmount)
                    });
                  }}
                  className="w-full py-3 bg-gradient-to-r from-blue-600 to-indigo-600 text-white rounded-xl font-bold text-xs shadow-md active:scale-95 transition cursor-pointer"
                >
                  Pay Next Easy Installment (₹{activePersonalLoan.installmentAmount || activePersonalLoan.emiAmount}) →
                </button>
                <div className="p-3 bg-amber-50 border border-amber-200 rounded-xl text-[11px] text-amber-900">
                  ⚡ <strong>Early Closure Bonus:</strong> 9th installment se pehle pura loan close karne par agent ko 1:1 profit bonus milta hai aur limit turant double hoti hai!
                </div>
                <button
                  type="button"
                  onClick={() => closeLoanEarly(activePersonalLoan._id, activePersonalLoan.remainingAmount || activePersonalLoan.amount)}
                  className="w-full py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl font-bold text-xs shadow-sm active:scale-95 transition cursor-pointer"
                >
                  Close Loan Early (Payoff ₹{(activePersonalLoan.remainingAmount || activePersonalLoan.amount).toLocaleString("en-IN")}) →
                </button>
              </div>
            )}

            {/* FULL 10-DAY INSTALLMENT SCHEDULE & HISTORY BREAKDOWN */}
            {((activeLoanDetails?.installments && activeLoanDetails.installments.length > 0) || (activePersonalLoan.installmentSchedule && activePersonalLoan.installmentSchedule.length > 0)) && (
              <div className="space-y-2.5 pt-2 border-t border-gray-100">
                <div className="flex items-center justify-between">
                  <h4 className="font-extrabold text-xs text-gray-900 flex items-center gap-1.5">
                    <span>📅</span> 10-Day Installment Schedule & Payment History
                  </h4>
                  <span className="text-[10px] text-gray-500 font-bold">
                    {(activeLoanDetails?.installments || activePersonalLoan.installmentSchedule).filter(x => x.status === "paid").length} / {(activeLoanDetails?.installments || activePersonalLoan.installmentSchedule).length} Paid
                  </span>
                </div>

                <div className="space-y-2 max-h-72 overflow-y-auto pr-1">
                  {(activeLoanDetails?.installments || activePersonalLoan.installmentSchedule).map((inst) => {
                    const isPaid = inst.status === "paid";
                    const isSubmitted = inst.status === "submitted";
                    const isOverdue = inst.status === "overdue";

                    return (
                      <div
                        key={inst.installmentNo}
                        className={`p-3 rounded-2xl border text-xs flex items-center justify-between gap-3 ${
                          isPaid
                            ? "bg-emerald-50/70 border-emerald-200"
                            : isSubmitted
                            ? "bg-amber-50 border-amber-300"
                            : isOverdue
                            ? "bg-rose-50 border-rose-200"
                            : "bg-white border-gray-200"
                        }`}
                      >
                        <div className="space-y-0.5">
                          <div className="flex items-center gap-2">
                            <span className="font-extrabold text-gray-900">Installment #{inst.installmentNo}</span>
                            <span className="font-mono font-bold text-emerald-700">₹{inst.amount}</span>
                          </div>
                          <p className="text-[11px] text-gray-500">
                            Due Date: {inst.dueDate ? new Date(inst.dueDate).toLocaleDateString("en-IN") : "10-day cycle"}
                          </p>
                          {isPaid && (
                            <p className="text-[10px] text-emerald-700 font-bold">
                              ✓ Paid on {inst.paidOn ? new Date(inst.paidOn).toLocaleDateString("en-IN") : "Recorded"}
                              {inst.adminEvidenceNote ? ` (${inst.adminEvidenceNote})` : ""}
                            </p>
                          )}
                          {isSubmitted && (
                            <p className="text-[10px] text-amber-700 font-bold">
                              ⏳ UTR: {inst.utrNumber} (Awaiting Admin Approval)
                            </p>
                          )}
                        </div>

                        <div className="shrink-0 flex flex-col items-end gap-1">
                          <span className={`px-2 py-0.5 rounded-full text-[10px] font-black uppercase ${
                            isPaid ? "bg-emerald-200 text-emerald-900" :
                            isSubmitted ? "bg-amber-200 text-amber-900" :
                            isOverdue ? "bg-rose-200 text-rose-900" : "bg-gray-100 text-gray-700"
                          }`}>
                            {inst.status}
                          </span>

                          {!isPaid && !isSubmitted && activePersonalLoan.status === "active" && (
                            <button
                              type="button"
                              onClick={() => setSubmitInstallmentModal({
                                loanId: activePersonalLoan._id,
                                installmentNo: inst.installmentNo,
                                amount: inst.amount
                              })}
                              className="px-2.5 py-1 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-[10px] font-bold shadow-2xs active:scale-95 transition cursor-pointer"
                            >
                              Pay Now →
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
        ) : (
          /* APPLY PERSONAL LOAN */
          <div className="space-y-4">
            <div className="bg-blue-50 border border-blue-200 rounded-xl p-3 text-xs text-blue-900 space-y-1">
              <div>⚡ <strong>Amount:</strong> ₹5,000 se ₹{maxLimit.toLocaleString("en-IN")} tak.</div>
              <div>📝 <strong>1st Time Limit:</strong> ₹5,000 (Time par pay karne par limit double hoti hai).</div>
              <div>📅 <strong>Tenure:</strong> Minimum 15 Easy Installments (10-din cycle: 1, 11, 21 tareekh).</div>
            </div>

            {/* Cheque Facility Toggle */}
            <div className="p-3.5 bg-indigo-50 border border-indigo-200 rounded-xl space-y-2">
              <label className="flex items-center gap-2 cursor-pointer text-xs font-bold text-indigo-900">
                <input
                  type="checkbox"
                  checked={loanForm.hasChequeFacility}
                  onChange={e => setLoanForm({ ...loanForm, hasChequeFacility: e.target.checked })}
                  className="w-4 h-4 text-indigo-600 rounded cursor-pointer"
                />
                <span>Cheque Facility Available (Check ke sath apply karein)</span>
              </label>
              {loanForm.hasChequeFacility && (
                <input
                  type="text"
                  placeholder="Cheque Number (e.g. CHQ123456)"
                  value={loanForm.chequeNumber}
                  onChange={e => setLoanForm({ ...loanForm, chequeNumber: e.target.value })}
                  className="w-full px-3 py-2 bg-white border border-indigo-300 rounded-lg text-xs outline-none"
                />
              )}
            </div>

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

              {/* Document File Uploads */}
              <div className="space-y-2 pt-2 border-t border-gray-100">
                <label className="block text-[11px] font-bold text-gray-700">
                  KYC Documents (Aadhaar & PAN / Cheque)
                </label>

                {/* Doc 1: Aadhaar */}
                <div className="flex items-center gap-2">
                  <label className="flex-1 cursor-pointer py-2.5 px-3 bg-white hover:bg-gray-50 border border-dashed border-emerald-300 rounded-xl text-xs text-emerald-800 font-bold flex items-center justify-between transition active:scale-95">
                    <span className="flex items-center gap-1.5 truncate">
                      <span>📄</span>
                      <span className="truncate">{loanForm.doc1Url ? "✓ Aadhaar Attached" : "Upload Aadhaar Card (Doc 1)"}</span>
                    </span>
                    <span className="text-[10px] text-emerald-600 underline shrink-0 font-medium">{loanForm.doc1Url ? "Change" : "Browse"}</span>
                    <input
                      type="file"
                      accept="image/*,application/pdf"
                      className="hidden"
                      onChange={e => handleLoanDocFile(e.target.files?.[0], setLoanForm, "doc1Url")}
                    />
                  </label>
                  {loanForm.doc1Url && (
                    <button
                      type="button"
                      onClick={() => { setLightboxImg(loanForm.doc1Url); setZoomLevel(1); }}
                      className="px-2.5 py-2.5 bg-emerald-50 hover:bg-emerald-100 text-emerald-800 border border-emerald-200 rounded-xl text-xs font-bold shrink-0 transition"
                      title="View Document"
                    >
                      🔍 View
                    </button>
                  )}
                </div>

                {/* Doc 2: PAN / Cheque */}
                <div className="flex items-center gap-2">
                  <label className="flex-1 cursor-pointer py-2.5 px-3 bg-white hover:bg-gray-50 border border-dashed border-emerald-300 rounded-xl text-xs text-emerald-800 font-bold flex items-center justify-between transition active:scale-95">
                    <span className="flex items-center gap-1.5 truncate">
                      <span>📑</span>
                      <span className="truncate">{loanForm.doc2Url ? "✓ PAN / Cheque Attached" : "Upload PAN / Cheque (Doc 2)"}</span>
                    </span>
                    <span className="text-[10px] text-emerald-600 underline shrink-0 font-medium">{loanForm.doc2Url ? "Change" : "Browse"}</span>
                    <input
                      type="file"
                      accept="image/*,application/pdf"
                      className="hidden"
                      onChange={e => handleLoanDocFile(e.target.files?.[0], setLoanForm, "doc2Url")}
                    />
                  </label>
                  {loanForm.doc2Url && (
                    <button
                      type="button"
                      onClick={() => { setLightboxImg(loanForm.doc2Url); setZoomLevel(1); }}
                      className="px-2.5 py-2.5 bg-emerald-50 hover:bg-emerald-100 text-emerald-800 border border-emerald-200 rounded-xl text-xs font-bold shrink-0 transition"
                      title="View Document"
                    >
                      🔍 View
                    </button>
                  )}
                </div>
              </div>
            </div>

            <button
              type="button"
              disabled={loanSubmitting}
              onClick={submitPersonalLoan}
              className="relative overflow-visible w-full py-3.5 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700 text-white rounded-xl font-extrabold text-xs shadow-md shadow-emerald-500/20 active:scale-95 transition cursor-pointer disabled:opacity-60 flex items-center justify-center gap-2"
            >
              {heroFlyId === "personal_submit" && <LoanHeroFlyBadge />}
              {loanSubmitting ? (
                <>
                  <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  <span>Applying for Personal Loan...</span>
                </>
              ) : (
                <span>Apply for Personal Loan Account →</span>
              )}
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
                max={maxLimit}
                step="1000"
                value={mblAmount}
                onChange={e => setMblForm({ ...mblForm, amount: Number(e.target.value) })}
                className="w-full accent-amber-600 cursor-pointer"
              />
              <div className="flex justify-between text-[10px] text-gray-400 mt-0.5">
                <span>Min ₹5,000</span>
                <span>Max ₹{maxLimit.toLocaleString("en-IN")}</span>
              </div>
            </div>

            {/* Cheque Facility Toggle */}
            <div className="p-3.5 bg-amber-50/80 border border-amber-200 rounded-xl space-y-2">
              <label className="flex items-center gap-2 cursor-pointer text-xs font-bold text-amber-900">
                <input
                  type="checkbox"
                  checked={mblForm.hasChequeFacility}
                  onChange={e => setMblForm({ ...mblForm, hasChequeFacility: e.target.checked })}
                  className="w-4 h-4 text-amber-600 rounded cursor-pointer"
                />
                <span>Cheque Facility Available (Check ke sath apply karein)</span>
              </label>
              {mblForm.hasChequeFacility && (
                <input
                  type="text"
                  placeholder="Cheque Number (e.g. CHQ123456)"
                  value={mblForm.chequeNumber}
                  onChange={e => setMblForm({ ...mblForm, chequeNumber: e.target.value })}
                  className="w-full px-3 py-2 bg-white border border-amber-300 rounded-lg text-xs outline-none"
                />
              )}
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
              <div className="grid grid-cols-2 gap-2">
                <input
                  type="text"
                  placeholder="Bank Account Number"
                  value={mblForm.bankAccountNumber}
                  onChange={e => setMblForm({ ...mblForm, bankAccountNumber: e.target.value })}
                  className="w-full px-3.5 py-2.5 border border-gray-200 rounded-xl text-xs outline-none focus:ring-2 focus:ring-amber-500"
                />
                <input
                  type="text"
                  placeholder="IFSC Code"
                  value={mblForm.bankIfsc}
                  onChange={e => setMblForm({ ...mblForm, bankIfsc: e.target.value.toUpperCase() })}
                  className="w-full px-3.5 py-2.5 border border-gray-200 rounded-xl text-xs outline-none focus:ring-2 focus:ring-amber-500 uppercase"
                />
              </div>

              {/* Document File Uploads */}
              <div className="space-y-2 pt-2 border-t border-gray-100">
                <label className="block text-[11px] font-bold text-gray-700">
                  Business KYC Documents (Aadhaar & PAN / Cheque)
                </label>

                {/* Doc 1: Aadhaar */}
                <div className="flex items-center gap-2">
                  <label className="flex-1 cursor-pointer py-2.5 px-3 bg-white hover:bg-gray-50 border border-dashed border-amber-300 rounded-xl text-xs text-amber-800 font-bold flex items-center justify-between transition active:scale-95">
                    <span className="flex items-center gap-1.5 truncate">
                      <span>📄</span>
                      <span className="truncate">{mblForm.doc1Url ? "✓ Aadhaar Attached" : "Upload Aadhaar Card (Doc 1)"}</span>
                    </span>
                    <span className="text-[10px] text-amber-600 underline shrink-0 font-medium">{mblForm.doc1Url ? "Change" : "Browse"}</span>
                    <input
                      type="file"
                      accept="image/*,application/pdf"
                      className="hidden"
                      onChange={e => handleLoanDocFile(e.target.files?.[0], setMblForm, "doc1Url")}
                    />
                  </label>
                  {mblForm.doc1Url && (
                    <button
                      type="button"
                      onClick={() => { setLightboxImg(mblForm.doc1Url); setZoomLevel(1); }}
                      className="px-2.5 py-2.5 bg-amber-50 hover:bg-amber-100 text-amber-800 border border-amber-200 rounded-xl text-xs font-bold shrink-0 transition"
                      title="View Document"
                    >
                      🔍 View
                    </button>
                  )}
                </div>

                {/* Doc 2: PAN / Cheque */}
                <div className="flex items-center gap-2">
                  <label className="flex-1 cursor-pointer py-2.5 px-3 bg-white hover:bg-gray-50 border border-dashed border-amber-300 rounded-xl text-xs text-amber-800 font-bold flex items-center justify-between transition active:scale-95">
                    <span className="flex items-center gap-1.5 truncate">
                      <span>📑</span>
                      <span className="truncate">{mblForm.doc2Url ? "✓ PAN / Cheque Attached" : "Upload PAN / Cheque (Doc 2)"}</span>
                    </span>
                    <span className="text-[10px] text-amber-600 underline shrink-0 font-medium">{mblForm.doc2Url ? "Change" : "Browse"}</span>
                    <input
                      type="file"
                      accept="image/*,application/pdf"
                      className="hidden"
                      onChange={e => handleLoanDocFile(e.target.files?.[0], setMblForm, "doc2Url")}
                    />
                  </label>
                  {mblForm.doc2Url && (
                    <button
                      type="button"
                      onClick={() => { setLightboxImg(mblForm.doc2Url); setZoomLevel(1); }}
                      className="px-2.5 py-2.5 bg-amber-50 hover:bg-amber-100 text-amber-800 border border-amber-200 rounded-xl text-xs font-bold shrink-0 transition"
                      title="View Document"
                    >
                      🔍 View
                    </button>
                  )}
                </div>
              </div>
            </div>

            <button
              type="button"
              disabled={loanSubmitting}
              onClick={submitMicroBusinessLoan}
              className="relative overflow-visible w-full py-3.5 bg-gradient-to-r from-amber-600 to-orange-600 hover:from-amber-700 hover:to-orange-700 text-white rounded-xl font-extrabold text-xs shadow-md shadow-amber-500/20 active:scale-95 transition cursor-pointer disabled:opacity-60 flex items-center justify-center gap-2"
            >
              {heroFlyId === "business_submit" && <LoanHeroFlyBadge />}
              {loanSubmitting ? (
                <>
                  <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  <span>Submitting Business Loan...</span>
                </>
              ) : (
                <span>Apply for Daily Business Loan →</span>
              )}
            </button>
          </div>
        )}
      </Sheet>

      {/* ══════════════════════════════════════════════════════
          5. DEBT ACCOUNT SHEET (DUES & 365-DAY 1 LAKH BOND)
      ══════════════════════════════════════════════════════ */}
      <Sheet open={accountModal === "debt"} onClose={closeModal} title="Debt & Bond Account" icon="📑">
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-2.5">
            <div className="bg-gradient-to-br from-emerald-600 to-teal-700 rounded-2xl p-4 text-white shadow-sm">
              <span className="text-[10px] text-emerald-100 font-bold uppercase tracking-wider block">Profit Wallet</span>
              <div className="text-2xl font-black font-display my-0.5">₹{(userProfile.profitBalance || 0).toLocaleString("en-IN")}</div>
              <p className="text-[10px] text-emerald-100">Bonds & Capital Earnings</p>
            </div>
            <div className="bg-gradient-to-br from-rose-600 to-red-700 rounded-2xl p-4 text-white shadow-sm">
              <span className="text-[10px] text-rose-100 font-bold uppercase tracking-wider block">Total Pending Dues</span>
              <div className="text-2xl font-black font-display my-0.5">₹{(userProfile.duesBalance || 0).toLocaleString("en-IN")}</div>
              <p className="text-[10px] text-rose-100">Scheduled on 1st, 11th & 21st</p>
            </div>
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

          {/* PROFIT & 365-DAY BOND HISTORY */}
          <div className="space-y-2 border-t border-gray-100 pt-3">
            <div className="flex justify-between items-center">
              <h5 className="text-xs font-bold text-gray-700 uppercase">Profit & Bond History</h5>
              <span className="text-[10px] text-gray-400 font-semibold">Incoming Profit Credits</span>
            </div>

            {(() => {
              const debitBonds = bonds.filter(b => b.bondType === "debit_365");
              const profitTxns = txns.filter(t => t.type === "bond_payout" || t.type === "bond_created");

              if (debitBonds.length === 0 && profitTxns.length === 0) {
                return (
                  <p className="py-6 text-center text-gray-400 text-xs bg-gray-50 rounded-xl">
                    Koi 365-din bond ya profit payout record nahi mila
                  </p>
                );
              }

              return (
                <div className="space-y-2">
                  {debitBonds.map(b => (
                    <div key={b._id} className="p-3 bg-emerald-50/70 border border-emerald-200 rounded-xl text-xs space-y-1">
                      <div className="flex justify-between items-center font-bold">
                        <span className="text-emerald-950">365-Day Fixed Bond</span>
                        <span className="text-emerald-700 font-black">+₹{b.returnAmount.toLocaleString("en-IN")} Maturity</span>
                      </div>
                      <div className="flex justify-between text-[11px] text-gray-600">
                        <span>Invested: ₹{b.principalAmount.toLocaleString("en-IN")}</span>
                        <span>Locked on: {new Date(b.startDate || b.createdAt).toLocaleDateString("en-IN")}</span>
                      </div>
                      <div className="flex justify-between text-[11px] text-gray-600 pt-1 border-t border-emerald-100">
                        <span>Maturity Date: {new Date(b.maturityDate).toLocaleDateString("en-IN")}</span>
                        <span className="capitalize font-black text-emerald-800">
                          {b.status === "matured" ? "✓ Credited to Profit Wallet" : "⏳ 365 Days Locked"}
                        </span>
                      </div>
                    </div>
                  ))}

                  {profitTxns.map(t => {
                    const d = new Date(t.createdAt);
                    const timeStr = d.toLocaleDateString("en-IN") + " " + d.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" });
                    return (
                      <div key={t._id} className="p-3 bg-white border border-gray-100 rounded-xl text-xs flex justify-between items-center">
                        <div>
                          <p className="font-extrabold text-gray-900 capitalize">{t.remarks || t.type.replace(/_/g, " ")}</p>
                          <p className="text-[10px] text-gray-400 mt-0.5">{timeStr} • Method: {t.method}</p>
                        </div>
                        <div className="text-right">
                          <p className={`font-black text-xs ${t.type === "bond_payout" ? "text-emerald-600" : "text-gray-700"}`}>
                            {t.type === "bond_payout" ? "+" : ""}₹{t.amount.toLocaleString("en-IN")}
                          </p>
                          <span className="text-[9px] uppercase font-bold text-gray-400">{t.status}</span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              );
            })()}
          </div>
        </div>
      </Sheet>

      {/* ══════════════════════════════════════════════════════
          6. LENDING ACCOUNT SHEET (40 & 80 MONTHS MONTHLY BONDS)
      ══════════════════════════════════════════════════════ */}
      <Sheet open={accountModal === "lending"} onClose={closeModal} title="Lending Account (Monthly Return)" icon="🤝">
        <div className="space-y-4">
          <div className="bg-gradient-to-r from-blue-600 to-indigo-700 rounded-2xl p-5 text-white">
            <span className="text-xs text-blue-100 font-bold uppercase tracking-wider">Lending Monthly Bonds</span>
            <div className="text-3xl font-black font-display my-1">₹3,500 / Month</div>
            <p className="text-xs text-blue-100">₹1 Lakh par ₹1,40,000 (40 mo) ya ₹1,80,000 (80 mo) payouts</p>
          </div>

          <div className="p-4 bg-indigo-50 border-2 border-indigo-200 rounded-2xl space-y-3">
            <div className="text-xs font-bold text-indigo-900">Select Monthly Bond Option (₹1,00,000 Investment):</div>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setLendingBondType("lending_40")}
                className={`p-3 rounded-xl border text-center transition ${
                  lendingBondType === "lending_40"
                    ? "bg-indigo-600 text-white border-indigo-600 shadow-md font-bold"
                    : "bg-white text-gray-700 border-gray-200 hover:bg-indigo-100"
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
                    ? "bg-indigo-600 text-white border-indigo-600 shadow-md font-bold"
                    : "bg-white text-gray-700 border-gray-200 hover:bg-indigo-100"
                }`}
              >
                <div className="text-xs font-bold">80 Months</div>
                <div className="text-sm font-black mt-0.5">₹1,80,000 Return</div>
                <div className="text-[10px] opacity-80">₹2,250 / month</div>
              </button>
            </div>
            <button
              onClick={() => createLendingBond(lendingBondType)}
              className="w-full py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl font-bold text-xs shadow-sm transition active:scale-95"
            >
              Invest ₹1,00,000 in {lendingBondType === "lending_40" ? "40M" : "80M"} Lending Bond →
            </button>
          </div>

          {/* LENDING MONTHLY PAYOUTS & CREDITS HISTORY */}
          <div className="space-y-2 border-t border-gray-100 pt-3">
            <div className="flex justify-between items-center">
              <h5 className="text-xs font-bold text-indigo-900 uppercase">Monthly Payouts & Credits Ledger</h5>
              <span className="text-[10px] text-gray-400 font-semibold">₹3,500 / mo credits</span>
            </div>

            {(() => {
              const lendingBonds = bonds.filter(b => b.bondType.startsWith("lending"));
              const lendingTxns = txns.filter(t => t.type === "bond_payout" && (t.remarks?.toLowerCase().includes("lending") || t.remarks?.toLowerCase().includes("monthly")));

              if (lendingBonds.length === 0 && lendingTxns.length === 0) {
                return (
                  <p className="py-6 text-center text-gray-400 text-xs bg-gray-50 rounded-xl">
                    Koi active monthly lending bond ya payout nahi hai
                  </p>
                );
              }

              return (
                <div className="space-y-2">
                  {lendingBonds.map(b => (
                    <div key={b._id} className="p-3.5 bg-indigo-50/70 border border-indigo-200 rounded-xl text-xs space-y-1.5">
                      <div className="flex justify-between items-center font-bold">
                        <span className="text-indigo-950">{b.bondType === "lending_40" ? "40 Months Bond" : "80 Months Bond"}</span>
                        <span className="text-indigo-700 font-black">+₹{b.monthlyPayout.toLocaleString("en-IN")} / Month</span>
                      </div>
                      <div className="flex justify-between text-[11px] text-gray-600">
                        <span>Invested: ₹{b.principalAmount.toLocaleString("en-IN")}</span>
                        <span>Completed: {b.payoutsCompleted || 0} / {b.tenureMonths} Months</span>
                      </div>
                      <div className="flex justify-between text-[11px] text-gray-600 pt-1 border-t border-indigo-100">
                        <span>Next Payout: {b.nextPayoutDate ? new Date(b.nextPayoutDate).toLocaleDateString("en-IN") : "Completed"}</span>
                        <span className="text-emerald-700 font-extrabold">Total Return: ₹{b.returnAmount.toLocaleString("en-IN")}</span>
                      </div>
                    </div>
                  ))}

                  {lendingTxns.map(t => {
                    const d = new Date(t.createdAt);
                    const timeStr = d.toLocaleDateString("en-IN") + " " + d.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" });
                    return (
                      <div key={t._id} className="p-3 bg-white border border-gray-100 rounded-xl text-xs flex justify-between items-center">
                        <div>
                          <p className="font-extrabold text-indigo-950">{t.remarks || "Monthly Lending Credit"}</p>
                          <p className="text-[10px] text-gray-400 mt-0.5">{timeStr} • Credited to Wallet</p>
                        </div>
                        <div className="text-right">
                          <p className="font-black text-xs text-emerald-600">+₹{t.amount.toLocaleString("en-IN")}</p>
                          <span className="text-[9px] uppercase font-bold text-gray-400">{t.status}</span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              );
            })()}
          </div>
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
        {activeStudentLoan ? (
          <div className="space-y-4">
            <div className="bg-gradient-to-r from-cyan-600 to-blue-700 rounded-2xl p-5 text-white shadow-md">
              <div className="flex justify-between items-center">
                <span className="text-xs font-bold uppercase tracking-wider text-cyan-100">Student Loan Account</span>
                <span className="px-2 py-0.5 rounded-full text-[10px] font-black bg-white/20 text-white uppercase">
                  {activeStudentLoan.status}
                </span>
              </div>
              <div className="text-2xl sm:text-3xl font-black font-mono my-1 tracking-wider">
                {activeStudentLoan.accountNumber || "EDUCA-STU"}
              </div>
              <div className="flex justify-between text-xs text-cyan-100 pt-1">
                <span>Sanctioned: ₹{activeStudentLoan.amount.toLocaleString("en-IN")}</span>
                <span>Remaining: ₹{activeStudentLoan.remainingAmount || activeStudentLoan.amount}</span>
              </div>
            </div>

            <div className="p-4 bg-gray-50 rounded-2xl space-y-2 text-xs border border-gray-200">
              <div className="flex justify-between"><span>Per Installment:</span><span className="font-bold text-cyan-800">₹{activeStudentLoan.installmentAmount}</span></div>
              <div className="flex justify-between"><span>Tenure:</span><span className="font-bold">{activeStudentLoan.installmentsCount} Installments (10-Day Cycle)</span></div>
              <div className="flex justify-between"><span>Rate:</span><span className="font-bold text-emerald-700">8% p.a. (Subsidized)</span></div>
              {activeStudentLoan.documents?.instituteName && (
                <div className="flex justify-between"><span>Institute:</span><span className="font-bold text-gray-800">{activeStudentLoan.documents.instituteName}</span></div>
              )}
            </div>

            {activeStudentLoan.status === "active" && (
              <div className="space-y-2">
                <button
                  type="button"
                  onClick={() => setSubmitInstallmentModal({
                    loanId: activeStudentLoan._id,
                    installmentNo: (activeStudentLoan.installmentsPaidCount || 0) + 1,
                    amount: activeStudentLoan.installmentAmount
                  })}
                  className="w-full py-3 bg-cyan-600 hover:bg-cyan-700 text-white rounded-xl font-bold text-xs shadow-md active:scale-95 transition cursor-pointer"
                >
                  Pay Next Installment (₹{activeStudentLoan.installmentAmount}) →
                </button>
                <button
                  type="button"
                  onClick={() => closeLoanEarly(activeStudentLoan._id, activeStudentLoan.remainingAmount || activeStudentLoan.amount)}
                  className="w-full py-2.5 bg-gray-100 hover:bg-gray-200 text-gray-800 rounded-xl font-bold text-xs transition cursor-pointer"
                >
                  ⚡ Close Loan Early in Full
                </button>
              </div>
            )}
          </div>
        ) : (
          <div className="space-y-4">
            <div className="bg-gradient-to-r from-cyan-600 to-blue-700 rounded-2xl p-4 text-white">
              <span className="text-xs text-cyan-100 font-bold uppercase tracking-wider">Subsidized Student Rate</span>
              <div className="text-2xl font-black font-display my-0.5">8.0% p.a.</div>
              <p className="text-[11px] text-cyan-100">School, college aur coaching fee direct transfer</p>
            </div>

            <div className="bg-cyan-50 border border-cyan-200 rounded-xl p-3 text-xs text-cyan-900 space-y-1">
              <div>⚡ <strong>Amount:</strong> ₹5,000 se ₹{maxLimit.toLocaleString("en-IN")} tak.</div>
              <div>📝 <strong>1st Time Limit:</strong> ₹5,000 (Subsidized student interest & easy installments).</div>
              <div>📅 <strong>Tenure:</strong> 15 se 30 Easy Installments (10-din cycle: 1, 11, 21 tareekh).</div>
            </div>

            {/* Cheque Facility Toggle */}
            <div className="p-3.5 bg-cyan-50/80 border border-cyan-200 rounded-xl space-y-2">
              <label className="flex items-center gap-2 cursor-pointer text-xs font-bold text-cyan-900">
                <input
                  type="checkbox"
                  checked={studentLoanForm.hasChequeFacility}
                  onChange={e => setStudentLoanForm({ ...studentLoanForm, hasChequeFacility: e.target.checked })}
                  className="w-4 h-4 text-cyan-600 rounded cursor-pointer"
                />
                <span>Cheque Facility Available (Check ke sath apply karein)</span>
              </label>
              {studentLoanForm.hasChequeFacility && (
                <input
                  type="text"
                  placeholder="Cheque Number (e.g. CHQ123456)"
                  value={studentLoanForm.chequeNumber}
                  onChange={e => setStudentLoanForm({ ...studentLoanForm, chequeNumber: e.target.value })}
                  className="w-full px-3 py-2 bg-white border border-cyan-300 rounded-lg text-xs outline-none"
                />
              )}
            </div>

            {/* Amount Slider */}
            <div>
              <div className="flex justify-between text-xs font-bold mb-1">
                <span className="text-gray-700">Fee Loan Amount:</span>
                <span className="font-mono text-cyan-700 text-sm">₹{studentAmount.toLocaleString("en-IN")}</span>
              </div>
              <input
                type="range"
                min="5000"
                max={maxLimit}
                step="1000"
                value={studentAmount}
                onChange={e => setStudentLoanForm({ ...studentLoanForm, amount: Number(e.target.value) })}
                className="w-full accent-cyan-600 cursor-pointer"
              />
              <div className="flex justify-between text-[10px] text-gray-400 mt-0.5">
                <span>Min ₹5,000</span>
                <span>Max ₹{maxLimit.toLocaleString("en-IN")}</span>
              </div>
            </div>

            {/* Installments Slider */}
            <div>
              <div className="flex justify-between text-xs font-bold mb-1">
                <span className="text-gray-700">Easy Installments:</span>
                <span className="font-mono text-cyan-700 text-sm">{studentCount} Installments</span>
              </div>
              <input
                type="range"
                min="15"
                max="30"
                step="1"
                value={studentCount}
                onChange={e => setStudentLoanForm({ ...studentLoanForm, installmentsCount: Number(e.target.value) })}
                className="w-full accent-cyan-600 cursor-pointer"
              />
              <div className="flex justify-between text-[10px] text-gray-400 mt-0.5">
                <span>Min 15 Installments</span>
                <span>Max 30 Installments</span>
              </div>
            </div>

            {/* Disbursal Calculation Breakdown */}
            <div className="bg-gray-50 border border-gray-200 rounded-2xl p-3.5 space-y-1.5 text-xs">
              <div className="font-bold text-gray-800 text-[11px] uppercase tracking-wider border-b border-gray-200 pb-1">
                Fee Disbursal Calculation
              </div>
              <div className="flex justify-between text-gray-600">
                <span>Fee Loan Sanctioned:</span>
                <span className="font-bold text-gray-800">₹{studentAmount.toLocaleString("en-IN")}</span>
              </div>
              <div className="flex justify-between text-gray-600">
                <span>Subsidized Interest:</span>
                <span className="font-bold text-cyan-700">8% p.a. (0.67% per installment)</span>
              </div>
              <div className="flex justify-between text-gray-600">
                <span>Per Easy Installment:</span>
                <span className="font-bold text-gray-900">₹{studentInstallment.toLocaleString("en-IN")}</span>
              </div>
              <div className="flex justify-between text-red-600">
                <span>- 2% Subsidized Fee:</span>
                <span className="font-bold">₹{studentFee}</span>
              </div>
              <div className="flex justify-between text-red-600">
                <span>- 1% UPI/Cash Charge:</span>
                <span className="font-bold">₹{studentUpi}</span>
              </div>
              <div className="pt-2 border-t border-gray-200 flex justify-between items-center">
                <span className="font-black text-gray-900">Final Disbursal Amount:</span>
                <span className="text-base font-black text-cyan-700">₹{studentDisbursal.toLocaleString("en-IN")}</span>
              </div>
            </div>

            {/* 10-Day Cycle Dates */}
            <div className="p-2.5 bg-cyan-50/60 rounded-xl text-[11px] text-cyan-900">
              <span className="font-bold">10-Day Cycle Dates: </span>
              {studentPreviewDates.map(d => `${d.getDate()}/${d.getMonth()+1}`).join(", ")}... (Every 1st, 11th, 21st)
            </div>

            {/* Form Inputs */}
            <div className="space-y-2.5 pt-2 border-t border-gray-100">
              <input
                type="text"
                placeholder="School / College / Institute Name *"
                value={studentLoanForm.instituteName}
                onChange={e => setStudentLoanForm({ ...studentLoanForm, instituteName: e.target.value })}
                className="w-full px-3.5 py-2.5 border border-gray-200 rounded-xl text-xs outline-none focus:ring-2 focus:ring-cyan-500"
              />
              <div className="grid grid-cols-2 gap-2">
                <input
                  type="text"
                  placeholder="Aadhar Number"
                  value={studentLoanForm.aadharNumber}
                  onChange={e => setStudentLoanForm({ ...studentLoanForm, aadharNumber: e.target.value })}
                  className="w-full px-3.5 py-2.5 border border-gray-200 rounded-xl text-xs outline-none focus:ring-2 focus:ring-cyan-500"
                />
                <input
                  type="text"
                  placeholder="PAN Number"
                  value={studentLoanForm.panNumber}
                  onChange={e => setStudentLoanForm({ ...studentLoanForm, panNumber: e.target.value.toUpperCase() })}
                  className="w-full px-3.5 py-2.5 border border-gray-200 rounded-xl text-xs outline-none focus:ring-2 focus:ring-cyan-500 uppercase"
                />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <input
                  type="text"
                  placeholder="Bank Account Number"
                  value={studentLoanForm.bankAccountNumber}
                  onChange={e => setStudentLoanForm({ ...studentLoanForm, bankAccountNumber: e.target.value })}
                  className="w-full px-3.5 py-2.5 border border-gray-200 rounded-xl text-xs outline-none focus:ring-2 focus:ring-cyan-500"
                />
                <input
                  type="text"
                  placeholder="IFSC Code"
                  value={studentLoanForm.bankIfsc}
                  onChange={e => setStudentLoanForm({ ...studentLoanForm, bankIfsc: e.target.value.toUpperCase() })}
                  className="w-full px-3.5 py-2.5 border border-gray-200 rounded-xl text-xs outline-none focus:ring-2 focus:ring-cyan-500 uppercase"
                />
              </div>

              {/* Document File Uploads (Doc 1, Doc 2, Doc 3) */}
              <div className="space-y-2 pt-2 border-t border-gray-100">
                <label className="block text-[11px] font-bold text-gray-700">
                  Student Verification Documents
                </label>

                {/* Doc 1: Aadhaar */}
                <div className="flex items-center gap-2">
                  <label className="flex-1 cursor-pointer py-2.5 px-3 bg-white hover:bg-gray-50 border border-dashed border-cyan-300 rounded-xl text-xs text-cyan-800 font-bold flex items-center justify-between transition active:scale-95">
                    <span className="flex items-center gap-1.5 truncate">
                      <span>📄</span>
                      <span className="truncate">{studentLoanForm.doc1Url ? "✓ Aadhaar Attached" : "Upload Aadhaar Card (Doc 1)"}</span>
                    </span>
                    <span className="text-[10px] text-cyan-600 underline shrink-0 font-medium">{studentLoanForm.doc1Url ? "Change" : "Browse"}</span>
                    <input
                      type="file"
                      accept="image/*,application/pdf"
                      className="hidden"
                      onChange={e => handleLoanDocFile(e.target.files?.[0], setStudentLoanForm, "doc1Url")}
                    />
                  </label>
                  {studentLoanForm.doc1Url && (
                    <button
                      type="button"
                      onClick={() => { setLightboxImg(studentLoanForm.doc1Url); setZoomLevel(1); }}
                      className="px-2.5 py-2.5 bg-cyan-50 hover:bg-cyan-100 text-cyan-800 border border-cyan-200 rounded-xl text-xs font-bold shrink-0 transition"
                      title="View Document"
                    >
                      🔍 View
                    </button>
                  )}
                </div>

                {/* Doc 2: PAN / Cheque */}
                <div className="flex items-center gap-2">
                  <label className="flex-1 cursor-pointer py-2.5 px-3 bg-white hover:bg-gray-50 border border-dashed border-cyan-300 rounded-xl text-xs text-cyan-800 font-bold flex items-center justify-between transition active:scale-95">
                    <span className="flex items-center gap-1.5 truncate">
                      <span>📑</span>
                      <span className="truncate">{studentLoanForm.doc2Url ? "✓ PAN / Cheque Attached" : "Upload PAN / Cheque (Doc 2)"}</span>
                    </span>
                    <span className="text-[10px] text-cyan-600 underline shrink-0 font-medium">{studentLoanForm.doc2Url ? "Change" : "Browse"}</span>
                    <input
                      type="file"
                      accept="image/*,application/pdf"
                      className="hidden"
                      onChange={e => handleLoanDocFile(e.target.files?.[0], setStudentLoanForm, "doc2Url")}
                    />
                  </label>
                  {studentLoanForm.doc2Url && (
                    <button
                      type="button"
                      onClick={() => { setLightboxImg(studentLoanForm.doc2Url); setZoomLevel(1); }}
                      className="px-2.5 py-2.5 bg-cyan-50 hover:bg-cyan-100 text-cyan-800 border border-cyan-200 rounded-xl text-xs font-bold shrink-0 transition"
                      title="View Document"
                    >
                      🔍 View
                    </button>
                  )}
                </div>

                {/* Doc 3: Student ID / Fee Slip */}
                <div className="flex items-center gap-2">
                  <label className="flex-1 cursor-pointer py-2.5 px-3 bg-white hover:bg-gray-50 border border-dashed border-cyan-300 rounded-xl text-xs text-cyan-800 font-bold flex items-center justify-between transition active:scale-95">
                    <span className="flex items-center gap-1.5 truncate">
                      <span>🎓</span>
                      <span className="truncate">{studentLoanForm.studentProofUrl ? "✓ Student ID Attached" : "Upload Student ID / Fee Slip (Doc 3)"}</span>
                    </span>
                    <span className="text-[10px] text-cyan-600 underline shrink-0 font-medium">{studentLoanForm.studentProofUrl ? "Change" : "Browse"}</span>
                    <input
                      type="file"
                      accept="image/*,application/pdf"
                      className="hidden"
                      onChange={e => handleLoanDocFile(e.target.files?.[0], setStudentLoanForm, "studentProofUrl")}
                    />
                  </label>
                  {studentLoanForm.studentProofUrl && (
                    <button
                      type="button"
                      onClick={() => { setLightboxImg(studentLoanForm.studentProofUrl); setZoomLevel(1); }}
                      className="px-2.5 py-2.5 bg-cyan-50 hover:bg-cyan-100 text-cyan-800 border border-cyan-200 rounded-xl text-xs font-bold shrink-0 transition"
                      title="View Document"
                    >
                      🔍 View
                    </button>
                  )}
                </div>
              </div>
            </div>

            <button
              type="button"
              disabled={loanSubmitting}
              onClick={submitStudentLoan}
              className="relative overflow-visible w-full py-3.5 bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-700 hover:to-blue-700 text-white rounded-xl font-extrabold text-xs shadow-md shadow-cyan-500/20 active:scale-95 transition cursor-pointer disabled:opacity-60 flex items-center justify-center gap-2"
            >
              {heroFlyId === "student_submit" && <LoanHeroFlyBadge />}
              {loanSubmitting ? (
                <>
                  <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  <span>Submitting Student Loan...</span>
                </>
              ) : (
                <span>Apply for Student Loan Account →</span>
              )}
            </button>
          </div>
        )}
      </Sheet>

      {/* ══════════════════════════════════════════════════════
          ALL LOANS & DUES HUB SHEET (ACTIVATED ON 'LOANS' CLICK)
      ══════════════════════════════════════════════════════ */}
      <Sheet open={modal === "all_loans"} onClose={closeModal} title="My Loans & Dues Hub" icon="🏦">
        <div className="space-y-4">
          {/* Top Dues & Limit Summary Hero */}
          <div className={`p-4 sm:p-5 rounded-2xl text-white shadow-md relative overflow-hidden ${
            (userProfile.duesBalance || 0) > 0
              ? "bg-gradient-to-br from-red-600 via-rose-600 to-red-800"
              : "bg-gradient-to-br from-slate-900 via-indigo-950 to-blue-900 border border-blue-500/30"
          }`}>
            <div className="flex justify-between items-start">
              <div>
                <span className="text-[11px] uppercase tracking-wider font-bold text-white/80 block">Total Pending Dues</span>
                <div className="text-3xl font-black font-display my-1">
                  ₹{(userProfile.duesBalance || 0).toLocaleString("en-IN")}
                </div>
                <p className="text-[11px] text-white/80">
                  {(userProfile.duesBalance || 0) > 0
                    ? "Easy Installments due on 1st, 11th & 21st / Daily Collections"
                    : "All Clear • Zero Pending Dues"}
                </p>
              </div>
              <span className="px-2.5 py-1 rounded-full text-xs font-black bg-white/20 text-white">
                Eligible Limit: ₹{maxLimit.toLocaleString("en-IN")}
              </span>
            </div>
          </div>

          {/* 5-DAY UPCOMING DUE ALERT BANNER */}
          {activeLoanDetails?.isUpcomingSoon && activeLoanDetails?.nextInstallment && (
            <div className="p-3.5 bg-amber-50 border-2 border-amber-400 rounded-2xl space-y-2 text-amber-950 shadow-xs animate-pulse">
              <div className="flex items-center gap-2">
                <span className="text-xl">🔔</span>
                <span className="font-black text-xs uppercase tracking-wide text-amber-900">
                  Upcoming Due Alert (#{activeLoanDetails.nextInstallment.installmentNo})
                </span>
              </div>
              <p className="text-xs font-medium text-amber-900">
                Aapki agli kist <strong>₹{activeLoanDetails.nextInstallment.amount}</strong> {
                  activeLoanDetails.daysUntilDue === 0 ? "aaj hi due hai!" :
                  activeLoanDetails.daysUntilDue < 0 ? `${Math.abs(activeLoanDetails.daysUntilDue)} din pehle overdue ho chuki hai!` :
                  `${activeLoanDetails.daysUntilDue} din me due hone wali hai (${activeLoanDetails.nextInstallment.dueDate ? new Date(activeLoanDetails.nextInstallment.dueDate).toLocaleDateString("en-IN") : "Upcoming"})`
                }
              </p>
              <button
                type="button"
                onClick={() => {
                  triggerHeroFly("pay_upcoming");
                  setSubmitInstallmentModal({
                    loanId: activeLoanDetails.loan?._id || loans[0]?._id,
                    installmentNo: activeLoanDetails.nextInstallment.installmentNo,
                    amount: activeLoanDetails.nextInstallment.amount
                  });
                }}
                className="relative overflow-visible w-full py-2.5 bg-amber-600 hover:bg-amber-700 text-white rounded-xl text-xs font-bold shadow-xs active:scale-95 transition cursor-pointer flex items-center justify-center gap-1.5"
              >
                {heroFlyId === "pay_upcoming" && <LoanHeroFlyBadge />}
                <span>Pay Now (₹{activeLoanDetails.nextInstallment.amount}) →</span>
              </button>
            </div>
          )}

          {/* ACTIVE & APPLIED LOANS LIST */}
          <div>
            <div className="flex justify-between items-center mb-2.5">
              <h4 className="text-xs font-bold text-gray-500 uppercase tracking-wider">
                My Loans ({loans.length})
              </h4>
              <button
                type="button"
                onClick={loadLoans}
                className="text-[11px] font-bold text-blue-600 hover:text-blue-700 cursor-pointer"
              >
                🔄 Refresh
              </button>
            </div>

            {loans.length === 0 ? (
              <div className="py-6 text-center bg-gray-50 rounded-2xl border border-gray-200 p-4 space-y-2">
                <span className="text-3xl block">🏦</span>
                <h5 className="font-bold text-sm text-gray-800">Abhi Koi Active Loan Nahi Hai</h5>
                <p className="text-xs text-gray-500 max-w-xs mx-auto">
                  Aap bina kisi delay ke instant loan le sakte hain. Neeche diye gaye loan options se apply karein:
                </p>
              </div>
            ) : (
              <div className="space-y-3">
                {loans.map(l => {
                  const schedule = (l.installmentSchedule && l.installmentSchedule.length > 0) ? l.installmentSchedule : (l.emiSchedule || []);
                  const paidCount = schedule.filter(s => s.status === "paid").length;
                  const totalCount = schedule.length || l.installmentsCount || l.dailyTenureDays || l.tenure || 0;
                  const progress = totalCount > 0 ? (paidCount / totalCount) * 100 : (l.totalPayable ? (l.paidAmount / l.totalPayable) * 100 : 0);
                  const instAmt = l.installmentAmount || l.emiAmount || 0;
                  const payoffAmt = l.remainingAmount ?? (l.totalPayable ? Math.max(0, l.totalPayable - (l.paidAmount || 0)) : l.amount);
                  const isDaily = l.collectionFrequency === "daily" || l.loanType === "micro_business";
                  const isStudent = l.loanType === "student";
                  const isExpanded = expandedLoanId === l._id;

                  return (
                    <div key={l._id} className="p-4 bg-white border border-gray-200 rounded-2xl shadow-xs space-y-3">
                      <div className="flex justify-between items-start">
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="font-mono font-bold text-xs bg-slate-100 text-slate-800 px-2 py-0.5 rounded-lg border border-slate-200">
                              {l.accountNumber || "EDUCA-LOAN"}
                            </span>
                            <span className={`px-2 py-0.5 rounded-full text-[10px] font-black uppercase ${
                              isStudent ? "bg-cyan-100 text-cyan-800" :
                              isDaily ? "bg-amber-100 text-amber-800" :
                              "bg-emerald-100 text-emerald-800"
                            }`}>
                              {isStudent ? "🎓 Student Loan" : isDaily ? "🏬 Business Daily" : "🏦 Personal 10-Day"}
                            </span>
                          </div>
                          <h5 className="text-lg font-black font-display text-gray-900 mt-1">
                            ₹{l.amount.toLocaleString("en-IN")}
                          </h5>
                          <p className="text-[11px] text-gray-500">
                            {isDaily ? `${totalCount} Days @ ${l.interestRate}%` : isStudent ? `${totalCount} Easy Installments @ 8% p.a.` : `${totalCount} Easy Installments @ 1.34%/kist`}
                          </p>
                        </div>
                        <StatusBadge status={l.status} />
                      </div>

                      {/* Amounts Grid */}
                      <div className="grid grid-cols-3 gap-2 p-2.5 bg-gray-50 rounded-xl text-xs">
                        <div>
                          <span className="text-[10px] text-gray-400 block">{isDaily ? "Daily Kist" : "Per Kist"}</span>
                          <span className="font-bold text-gray-800">₹{instAmt}</span>
                        </div>
                        <div>
                          <span className="text-[10px] text-gray-400 block">Paid Kists</span>
                          <span className="font-bold text-emerald-700">{paidCount} / {totalCount}</span>
                        </div>
                        <div>
                          <span className="text-[10px] text-gray-400 block">Remaining</span>
                          <span className="font-bold text-rose-600">₹{payoffAmt.toLocaleString("en-IN")}</span>
                        </div>
                      </div>

                      {/* Progress Bar */}
                      <div className="w-full bg-gray-100 rounded-full h-2 overflow-hidden">
                        <div
                          className="bg-gradient-to-r from-blue-600 to-emerald-500 h-2 rounded-full transition-all"
                          style={{ width: `${Math.min(100, progress)}%` }}
                        />
                      </div>

                      {/* Active Actions */}
                      {l.status === "active" && (
                        <div className="flex gap-2 pt-1">
                          <button
                            type="button"
                            onClick={() => {
                              triggerHeroFly("pay_kist_" + l._id);
                              const nextInst = schedule.find(s => s.status === "pending" || s.status === "overdue") || { installmentNo: paidCount + 1, amount: instAmt };
                              setSubmitInstallmentModal({
                                loanId: l._id,
                                installmentNo: nextInst.installmentNo,
                                amount: nextInst.amount || instAmt
                              });
                            }}
                            className="relative overflow-visible flex-1 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-bold text-xs shadow-xs active:scale-95 transition cursor-pointer flex items-center justify-center gap-1.5"
                          >
                            {heroFlyId === ("pay_kist_" + l._id) && <LoanHeroFlyBadge />}
                            <span>Pay Kist ₹{instAmt} →</span>
                          </button>
                          <button
                            type="button"
                            onClick={() => closeLoanEarly(l._id, payoffAmt)}
                            className="px-3 py-2.5 bg-emerald-50 hover:bg-emerald-100 text-emerald-800 border border-emerald-300 rounded-xl font-bold text-xs active:scale-95 transition cursor-pointer"
                            title="Close loan early with bonus"
                          >
                            ⚡ Settle & Close
                          </button>
                        </div>
                      )}

                      {/* Installment Schedule Toggle */}
                      {schedule.length > 0 && (
                        <div className="pt-1 border-t border-gray-100">
                          <button
                            type="button"
                            onClick={() => setExpandedLoanId(isExpanded ? null : l._id)}
                            className="w-full py-1.5 text-center text-xs font-bold text-blue-600 hover:text-blue-700 flex items-center justify-center gap-1.5 cursor-pointer"
                          >
                            <span>📅</span>
                            <span>{isExpanded ? "Hide Installments Schedule ▲" : `View Full Schedule (${paidCount}/${schedule.length} Paid) ▼`}</span>
                          </button>

                          {isExpanded && (
                            <div className="mt-2 space-y-1.5 max-h-60 overflow-y-auto pr-1 pt-1 border-t border-gray-100">
                              {schedule.map(inst => {
                                const isPaid = inst.status === "paid";
                                const isSubmitted = inst.status === "submitted";
                                const isOverdue = inst.status === "overdue";
                                return (
                                  <div key={inst.installmentNo} className="p-2.5 rounded-xl border border-gray-100 bg-gray-50/70 flex items-center justify-between text-xs">
                                    <div>
                                      <div className="flex items-center gap-1.5">
                                        <span className="font-bold text-gray-900">Kist #{inst.installmentNo}:</span>
                                        <span className="font-mono font-bold text-gray-800">₹{inst.amount}</span>
                                      </div>
                                      <p className="text-[10px] text-gray-500">
                                        Due: {inst.dueDate ? new Date(inst.dueDate).toLocaleDateString("en-IN") : "Scheduled"}
                                      </p>
                                    </div>
                                    <div className="flex items-center gap-2">
                                      <span className={`px-2 py-0.5 rounded-full text-[10px] font-black uppercase ${
                                        isPaid ? "bg-emerald-100 text-emerald-800" :
                                        isSubmitted ? "bg-amber-100 text-amber-800" :
                                        isOverdue ? "bg-rose-100 text-rose-800" : "bg-gray-200 text-gray-700"
                                      }`}>
                                        {inst.status}
                                      </span>
                                      {!isPaid && !isSubmitted && l.status === "active" && (
                                        <button
                                          type="button"
                                          onClick={() => setSubmitInstallmentModal({
                                            loanId: l._id,
                                            installmentNo: inst.installmentNo,
                                            amount: inst.amount
                                          })}
                                          className="px-2 py-1 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-[10px] font-bold active:scale-95 cursor-pointer"
                                        >
                                          Pay
                                        </button>
                                      )}
                                    </div>
                                  </div>
                                );
                              })}
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

          {/* APPLY FOR NEW LOAN OPTIONS */}
          <div className="pt-2 border-t border-gray-200 space-y-2">
            <h4 className="text-xs font-bold text-gray-600 uppercase tracking-wider">
              Apply For A New Loan
            </h4>
            <div className="grid grid-cols-1 gap-2.5">
              {/* Personal Loan */}
              <div
                onClick={() => { triggerHeroFly("hub_apply_personal"); closeModal(); openLoanSheet("personal_loan"); }}
                className="relative overflow-visible p-3 bg-emerald-50/70 border border-emerald-200 rounded-2xl flex items-center justify-between cursor-pointer hover:bg-emerald-100/60 transition active:scale-95"
              >
                {heroFlyId === "hub_apply_personal" && <LoanHeroFlyBadge />}
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-emerald-100 text-emerald-800 flex items-center justify-center text-xl shrink-0">
                    🏦
                  </div>
                  <div>
                    <h5 className="font-extrabold text-xs text-gray-900">Personal Loan Account</h5>
                    <p className="text-[11px] text-gray-500">10-Day Cycle • 15-30 Easy Installments • Up to ₹{maxLimit.toLocaleString("en-IN")}</p>
                  </div>
                </div>
                <span className="text-emerald-700 font-bold text-xs">Apply →</span>
              </div>

              {/* Student Loan */}
              <div
                onClick={() => { triggerHeroFly("hub_apply_student"); closeModal(); openLoanSheet("student_loan"); }}
                className="relative overflow-visible p-3 bg-cyan-50/70 border border-cyan-200 rounded-2xl flex items-center justify-between cursor-pointer hover:bg-cyan-100/60 transition active:scale-95"
              >
                {heroFlyId === "hub_apply_student" && <LoanHeroFlyBadge />}
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-cyan-100 text-cyan-800 flex items-center justify-center text-xl shrink-0">
                    🎓
                  </div>
                  <div>
                    <h5 className="font-extrabold text-xs text-gray-900">Student Loan Account</h5>
                    <p className="text-[11px] text-gray-500">Subsidized 8% p.a. • Fee Support • Up to ₹{maxLimit.toLocaleString("en-IN")}</p>
                  </div>
                </div>
                <span className="text-cyan-700 font-bold text-xs">Apply →</span>
              </div>

              {/* Micro Business Loan */}
              <div
                onClick={() => { triggerHeroFly("hub_apply_business"); closeModal(); openLoanSheet("business_loan"); }}
                className="relative overflow-visible p-3 bg-amber-50/70 border border-amber-200 rounded-2xl flex items-center justify-between cursor-pointer hover:bg-amber-100/60 transition active:scale-95"
              >
                {heroFlyId === "hub_apply_business" && <LoanHeroFlyBadge />}
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-amber-100 text-amber-800 flex items-center justify-center text-xl shrink-0">
                    🏬
                  </div>
                  <div>
                    <h5 className="font-extrabold text-xs text-gray-900">Micro Business Loan</h5>
                    <p className="text-[11px] text-gray-500">Daily Collection • 60-120 Days • Up to ₹{maxLimit.toLocaleString("en-IN")}</p>
                  </div>
                </div>
                <span className="text-amber-700 font-bold text-xs">Apply →</span>
              </div>
            </div>
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

      {/* ══════════════════════════════════════════════════════
          WALLET 6-DIGIT PIN MODAL (ENTER OR SET)
      ══════════════════════════════════════════════════════ */}
      <Sheet open={modal === "wallet_pin"} onClose={closeModal} title={pinSetupMode ? "Set 6-Digit PIN" : "Enter Security PIN"} icon="🔒">
        <div className="space-y-4">
          <div className="bg-blue-50 border border-blue-200 rounded-xl p-3 text-xs text-blue-900">
            {pinSetupMode ? (
              <>🔒 <strong>First-Time Security PIN:</strong> Balance check karne ke liye 6-number ka secret PIN banayein.</>
            ) : (
              <>🔒 Primary Wallet Balance check karne ke liye apna 6-number ka security PIN enter karein.</>
            )}
          </div>

          {!pinSetupMode && (
            <div>
              <button
                type="button"
                onClick={triggerBiometricAuth}
                className="w-full py-3 bg-gradient-to-r from-emerald-50 to-teal-50 hover:from-emerald-100 hover:to-teal-100 border-2 border-emerald-300 text-emerald-900 rounded-xl font-bold text-xs flex items-center justify-center gap-2 shadow-xs transition active:scale-95"
              >
                <span className="text-xl">👆</span>
                <span>Use Fingerprint to Unlock</span>
              </button>
              <div className="flex items-center gap-2 my-3">
                <div className="flex-1 h-px bg-gray-200" />
                <span className="text-[10px] text-gray-400 font-bold uppercase tracking-wider">Or Enter 6-Digit PIN</span>
                <div className="flex-1 h-px bg-gray-200" />
              </div>
            </div>
          )}

          <div>
            <label className="block text-xs font-bold text-gray-700 mb-1">
              {pinSetupMode ? "Enter New 6-Digit PIN" : "6-Digit Security PIN"}
            </label>
            <input
              type="password"
              inputMode="numeric"
              maxLength={6}
              placeholder="••••••"
              value={pinInput}
              onChange={e => setPinInput(e.target.value.replace(/\D/g, "").slice(0, 6))}
              className="w-full px-4 py-3 border border-gray-200 rounded-xl text-center text-2xl tracking-[0.4em] font-mono font-bold focus:ring-2 focus:ring-blue-500 outline-none"
            />
          </div>

          {pinSetupMode && (
            <div>
              <label className="block text-xs font-bold text-gray-700 mb-1">Confirm 6-Digit PIN</label>
              <input
                type="password"
                inputMode="numeric"
                maxLength={6}
                placeholder="••••••"
                value={confirmPinInput}
                onChange={e => setConfirmPinInput(e.target.value.replace(/\D/g, "").slice(0, 6))}
                className="w-full px-4 py-3 border border-gray-200 rounded-xl text-center text-2xl tracking-[0.4em] font-mono font-bold focus:ring-2 focus:ring-blue-500 outline-none"
              />
            </div>
          )}

          {pinError && (
            <p className="text-xs text-red-600 bg-red-50 p-2.5 rounded-lg border border-red-200">{pinError}</p>
          )}

          <button
            onClick={handlePinSubmit}
            disabled={pinSubmitting || pinInput.length !== 6 || (pinSetupMode && confirmPinInput.length !== 6)}
            className="w-full py-3 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white rounded-xl font-bold text-sm shadow-md active:scale-95 transition disabled:opacity-50"
          >
            {pinSubmitting ? "Verifying..." : (pinSetupMode ? "Set 6-Digit PIN & View Balance" : "Unlock & View Balance")}
          </button>

          {!pinSetupMode && (
            <div className="text-center pt-1">
              <button
                type="button"
                onClick={handleOpenResetPin}
                className="text-xs font-bold text-blue-600 hover:text-blue-800 underline"
              >
                Forgot or Reset Wallet PIN?
              </button>
            </div>
          )}
        </div>
      </Sheet>

      {/* ══════════════════════════════════════════════════════
          RESET / CHANGE 6-DIGIT PIN MODAL (PHONE + AADHAR)
      ══════════════════════════════════════════════════════ */}
      <Sheet open={modal === "reset_pin"} onClose={closeModal} title="Reset Wallet PIN" icon="🛡️">
        <div className="space-y-3.5">
          <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 text-xs text-amber-900">
            🛡️ <strong>Identity Verification:</strong> PIN badalne ke liye apna registered mobile number aur 12-digit Aadhar number enter karein.
          </div>

          <div>
            <label className="block text-xs font-bold text-gray-700 mb-1">Registered Mobile Number</label>
            <input
              type="tel"
              inputMode="tel"
              placeholder="e.g. 9876543210"
              value={resetPinForm.phone}
              onChange={e => setResetPinForm({ ...resetPinForm, phone: e.target.value })}
              className="w-full px-3.5 py-2.5 border border-gray-200 rounded-xl text-xs outline-none focus:ring-2 focus:ring-blue-500 font-semibold"
            />
          </div>

          <div>
            <label className="block text-xs font-bold text-gray-700 mb-1">Aadhar Card Number (12 Digits)</label>
            <input
              type="text"
              inputMode="numeric"
              maxLength={12}
              placeholder="1234 5678 9012"
              value={resetPinForm.aadharNumber}
              onChange={e => setResetPinForm({ ...resetPinForm, aadharNumber: e.target.value.replace(/\D/g, "").slice(0, 12) })}
              className="w-full px-3.5 py-2.5 border border-gray-200 rounded-xl text-xs outline-none focus:ring-2 focus:ring-blue-500 font-mono font-semibold"
            />
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="block text-xs font-bold text-gray-700 mb-1">New 6-Digit PIN</label>
              <input
                type="password"
                inputMode="numeric"
                maxLength={6}
                placeholder="••••••"
                value={resetPinForm.newPin}
                onChange={e => setResetPinForm({ ...resetPinForm, newPin: e.target.value.replace(/\D/g, "").slice(0, 6) })}
                className="w-full px-3.5 py-2.5 border border-gray-200 rounded-xl text-xs outline-none focus:ring-2 focus:ring-blue-500 font-mono tracking-widest text-center"
              />
            </div>
            <div>
              <label className="block text-xs font-bold text-gray-700 mb-1">Confirm New PIN</label>
              <input
                type="password"
                inputMode="numeric"
                maxLength={6}
                placeholder="••••••"
                value={resetPinForm.confirmNewPin}
                onChange={e => setResetPinForm({ ...resetPinForm, confirmNewPin: e.target.value.replace(/\D/g, "").slice(0, 6) })}
                className="w-full px-3.5 py-2.5 border border-gray-200 rounded-xl text-xs outline-none focus:ring-2 focus:ring-blue-500 font-mono tracking-widest text-center"
              />
            </div>
          </div>

          {resetError && (
            <p className="text-xs text-red-600 bg-red-50 p-2.5 rounded-lg border border-red-200">{resetError}</p>
          )}

          <button
            onClick={handleResetPinSubmit}
            disabled={resetSubmitting}
            className="w-full py-3 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white rounded-xl font-bold text-xs shadow-md active:scale-95 transition disabled:opacity-50"
          >
            {resetSubmitting ? "Verifying & Updating..." : "Verify Aadhar & Reset PIN →"}
          </button>
        </div>
      </Sheet>

      {/* PROFILE SHEET */}
      <Sheet open={modal === "profile"} onClose={closeModal} title="My Profile & Member ID" icon="👤">
        <div className="space-y-4">
          <div className="flex items-center gap-3.5 p-3 bg-gradient-to-r from-blue-50 to-indigo-50 border border-blue-100 rounded-2xl">
            <div className="w-14 h-14 bg-gradient-to-br from-blue-600 to-cyan-500 text-white rounded-full flex items-center justify-center font-bold text-xl shrink-0 shadow-md">
              {(userStored.name || "U")[0].toUpperCase()}
            </div>
            <div>
              <p className="font-extrabold text-base text-gray-900">{userStored.name || "User"}</p>
              <p className="text-xs text-gray-500">{userProfile.email || userStored.email}</p>
              <span className="inline-block mt-1 px-2 py-0.5 bg-green-100 text-green-800 text-[10px] font-black rounded-full">
                ✓ Active Account
              </span>
            </div>
          </div>

          {/* PERMANENT EDUCA MEMBER ID CARD */}
          <div className="p-4 bg-gradient-to-br from-blue-50 to-indigo-50/50 border border-blue-200/80 rounded-2xl shadow-xs space-y-2 relative overflow-hidden">
            <div className="flex justify-between items-center text-slate-500 text-xs font-semibold">
              <span>Permanent Member ID</span>
              <span className="text-[10px] bg-blue-100 px-2 py-0.5 rounded text-blue-700 font-mono font-bold">LIFETIME</span>
            </div>
            <div className="text-xl sm:text-2xl font-black font-mono tracking-wider text-blue-900">
              {userUniqueId}
            </div>
            <div className="flex justify-between items-center pt-2 border-t border-blue-100 text-xs">
              <span className="text-slate-600 font-medium">Mobile: {userProfile.phone || userStored.phone || "N/A"}</span>
              <button
                type="button"
                onClick={() => copyText(userUniqueId)}
                className="px-2.5 py-1 bg-blue-600 hover:bg-blue-500 text-white rounded-lg text-[11px] font-bold transition active:scale-95 shadow-xs"
              >
                {copied ? "✓ Copied" : "📋 Copy ID"}
              </button>
            </div>
          </div>

          {/* E-KYC STATUS & DOCUMENT CARD */}
          <div className="p-3.5 bg-white border border-gray-200/90 rounded-2xl shadow-xs space-y-2">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="text-lg">
                  {userProfile.kycStatus === "verified" ? "✅" : userProfile.kycStatus === "pending" ? "⏳" : userProfile.kycStatus === "rejected" ? "❌" : "📄"}
                </span>
                <div>
                  <h4 className="font-extrabold text-xs text-gray-900">
                    {userProfile.kycStatus === "verified"
                      ? "e-KYC Verified"
                      : userProfile.kycStatus === "pending"
                      ? "e-KYC Under Review"
                      : userProfile.kycStatus === "rejected"
                      ? "e-KYC Rejected"
                      : "e-KYC Verification Required"}
                  </h4>
                  <p className="text-[11px] text-gray-500">
                    {userProfile.kycStatus === "verified"
                      ? "Aadhaar verified • Silver & VIP eligibility unlocked"
                      : userProfile.kycStatus === "pending"
                      ? "Documents submitted • Review in progress by Admin"
                      : userProfile.kycStatus === "rejected"
                      ? "Please re-upload clear Aadhaar & PAN / Cheque documents"
                      : "Upload Aadhaar & Verification documents to activate debit cards"}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setModal("kyc")}
                className={`px-3 py-1.5 rounded-xl text-xs font-bold transition active:scale-95 shadow-xs shrink-0 ${
                  userProfile.kycStatus === "verified"
                    ? "bg-emerald-50 text-emerald-700 border border-emerald-200 hover:bg-emerald-100"
                    : userProfile.kycStatus === "pending"
                    ? "bg-amber-50 text-amber-700 border border-amber-200 hover:bg-amber-100"
                    : "bg-blue-600 hover:bg-blue-700 text-white"
                }`}
              >
                {userProfile.kycStatus === "verified" ? "View KYC" : userProfile.kycStatus === "pending" ? "View Docs" : "Verify →"}
              </button>
            </div>
          </div>

          {/* AGENT PARTNER BADGE IF APPLIED OR APPROVED */}
          {(userProfile.role === "agent" || userProfile.agentProfile?.status === "approved") ? (
            <div className="p-3 bg-gradient-to-r from-amber-50 to-orange-50 border border-amber-200 rounded-2xl">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="text-base">🤝</span>
                  <span className="font-extrabold text-xs text-amber-950">Verified Agent Partner</span>
                </div>
                <span className="px-2 py-0.5 bg-amber-200 text-amber-950 rounded font-black text-[10px]">
                  {userProfile.agentProfile?.commissionModel === "team_1" ? "1% Team Model" : "2% Solo Direct"}
                </span>
              </div>
              <p className="text-[11px] text-amber-800 mt-1">
                Shop: {userProfile.agentProfile?.businessName || "Educa Partner"} • {userProfile.agentProfile?.city || "Active"}
              </p>
            </div>
          ) : userProfile.agentProfile?.status === "pending" ? (
            <div className="p-3 bg-yellow-50 border border-yellow-200 rounded-2xl text-xs text-yellow-900 flex items-center gap-2">
              <span className="text-base">⏳</span>
              <div>
                <span className="font-bold">Agent Application Under Review</span>
                <p className="text-[11px] text-yellow-700">Admin team is verifying your application to activate Agent ID.</p>
              </div>
            </div>
          ) : null}

          {/* Quick Actions in Profile */}
          <div className="space-y-2">
            {/* COMPLETE E-KYC VERIFICATION BUTTON */}
            <button
              onClick={() => { setModal("kyc"); }}
              className="w-full py-2.5 px-4 bg-blue-50/70 hover:bg-blue-100/70 border border-blue-200 text-blue-900 rounded-xl font-bold text-xs flex items-center justify-between transition active:scale-95"
            >
              <span className="flex items-center gap-2"><span>📄</span> e-KYC Document Verification</span>
              <span className="text-blue-600 font-extrabold text-xs">
                {userProfile.kycStatus === "verified" ? "✓ Verified" : "Submit →"}
              </span>
            </button>

            {/* VIEW PRIMARY WALLET AMOUNT & PASSBOOK STATEMENT */}
            <button
              onClick={() => { setModal("passbook"); }}
              className="w-full p-3.5 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white rounded-2xl font-bold text-xs flex items-center justify-between shadow-md shadow-blue-500/20 transition active:scale-95"
            >
              <div className="flex items-center gap-3 text-left">
                <div className="w-9 h-9 bg-white/20 rounded-xl flex items-center justify-center text-lg shrink-0">
                  💳
                </div>
                <div>
                  <span className="block font-black text-sm text-white">{txt.passbookHistory}</span>
                  <span className="block text-[11px] text-blue-100 font-normal">{txt.passbookSub}</span>
                </div>
              </div>
              <span className="text-white/80 font-bold text-base">→</span>
            </button>

            {/* MY EDUCA CARDS & VIP TIERS */}
            <button
              onClick={() => { setModal("cards"); }}
              className="w-full p-3.5 bg-gradient-to-r from-slate-900 via-zinc-900 to-amber-950 border border-amber-500/30 text-white rounded-2xl font-bold text-xs flex items-center justify-between shadow-lg active:scale-95 transition"
            >
              <div className="flex items-center gap-3 text-left">
                <div className="w-9 h-9 bg-amber-400/20 border border-amber-400/40 rounded-xl flex items-center justify-center text-lg shrink-0">
                  💳
                </div>
                <div>
                  <div className="flex items-center gap-1.5">
                    <span className="font-black text-sm text-white">{txt.cardsAndVip}</span>
                    <span className="px-1.5 py-0.5 bg-amber-400/20 text-amber-300 text-[10px] font-black rounded uppercase">
                      Silver & VIP
                    </span>
                  </div>
                  <span className="block text-[11px] text-amber-200/80 font-normal">
                    {txt.cardsSubtitle}
                  </span>
                </div>
              </div>
              <span className="text-amber-300 font-bold text-base">→</span>
            </button>

            {/* APP FEATURE TOUR */}
            <button
              onClick={() => { closeModal(); setTourStep(0); setShowTour(true); }}
              className="w-full py-2.5 px-4 bg-gray-50 hover:bg-gray-100 border border-gray-200 text-gray-800 rounded-xl font-bold text-xs flex items-center justify-between transition active:scale-95"
            >
              <span className="flex items-center gap-2"><span>🎓</span> {txt.appTour}</span>
              <span className="text-gray-400">→</span>
            </button>

            <button
              onClick={() => { setModal("my_qr"); }}
              className="w-full py-2.5 px-4 bg-gray-50 hover:bg-gray-100 border border-gray-200 text-gray-800 rounded-xl font-bold text-xs flex items-center justify-between transition active:scale-95"
            >
              <span className="flex items-center gap-2"><span>📱</span> {txt.myQrCode}</span>
              <span className="text-gray-400">→</span>
            </button>

            <button
              onClick={handleOpenResetPin}
              className="w-full py-2.5 px-4 bg-gray-50 hover:bg-gray-100 border border-gray-200 text-gray-800 rounded-xl font-bold text-xs flex items-center justify-between transition active:scale-95"
            >
              <span className="flex items-center gap-2"><span>🔒</span> {txt.resetPin}</span>
              <span className="text-gray-400">→</span>
            </button>
          </div>

          <button onClick={logout} className="w-full py-3 bg-red-50 text-red-600 rounded-xl font-bold text-xs hover:bg-red-100 active:bg-red-200 transition">
            {txt.logout}
          </button>
        </div>
      </Sheet>

      {/* ══════════════════════════════════════════════════════
          MY EDUCA CARDS & VIP TIERS SHEET
      ══════════════════════════════════════════════════════ */}
      {(() => {
        const isSilverUnlocked = Boolean(
          userProfile.cardStatus?.silver?.unlocked === true ||
          userProfile.isSilverUnlocked === true ||
          (userProfile.kycStatus === "verified" && (userProfile.depositsCount || 0) > 0)
        );
        const isPlatinumUnlocked = Boolean(
          userProfile.cardStatus?.platinum?.unlocked === true ||
          userProfile.isPlatinumUnlocked === true ||
          (userProfile.kycStatus === "verified" && (userProfile.loansCount || 0) >= 4)
        );

        return (
          <Sheet open={modal === "cards"} onClose={closeModal} title="Educa Smart Cards & VIP" icon="💳">
            <div className="space-y-4">
              {/* Tab Selector */}
              <div className="flex gap-2 p-1 bg-gray-100 rounded-2xl">
                <button
                  type="button"
                  onClick={() => setCardTab("silver")}
                  className={`flex-1 py-2 text-xs font-bold rounded-xl transition ${
                    cardTab === "silver" ? "bg-white text-gray-900 shadow-xs" : "text-gray-500 hover:text-gray-900"
                  }`}
                >
                  Silver Debit {isSilverUnlocked ? "(Active)" : "(Locked 🔒)"}
                </button>
                <button
                  type="button"
                  onClick={() => setCardTab("platinum")}
                  className={`flex-1 py-2 text-xs font-bold rounded-xl transition ${
                    cardTab === "platinum" ? "bg-gradient-to-r from-amber-500 to-yellow-600 text-white shadow-xs" : "text-gray-500 hover:text-gray-900"
                  }`}
                >
                  👑 Platinum VIP {isPlatinumUnlocked ? "(Unlocked)" : "(Locked 🔒)"}
                </button>
              </div>

              {cardTab === "silver" ? (
                /* SILVER DIGITAL DEBIT CARD */
                <div className="space-y-4">
                  <div className="bg-gradient-to-tr from-slate-200 via-gray-300 to-slate-400 p-5 rounded-3xl text-slate-800 shadow-xl border border-white/60 relative overflow-hidden">
                    <div className="absolute top-0 right-0 w-36 h-36 bg-white/20 rounded-full -mr-16 -mt-16 pointer-events-none" />
                    
                    {/* PHYSICAL FROSTED LOCK OVERLAY FOR SILVER CARD */}
                    {!isSilverUnlocked && (
                      <div className="absolute inset-0 z-20 bg-slate-900/65 backdrop-blur-[3px] rounded-3xl flex flex-col items-center justify-center p-4 text-center">
                        <div className="w-12 h-12 rounded-2xl bg-white/20 border border-white/30 backdrop-blur-md flex items-center justify-center text-2xl shadow-lg mb-2">
                          🔒
                        </div>
                        <span className="text-white font-black text-xs uppercase tracking-wider">
                          Silver Debit Card Locked
                        </span>
                        <span className="text-slate-200 text-[11px] max-w-[210px] mt-1 font-medium leading-tight">
                          Complete e-KYC verification & 1st deposit (min ₹500) to unlock
                        </span>
                        <button
                          onClick={() => { closeModal(); setModal("kyc"); }}
                          className="mt-3 px-3.5 py-1.5 bg-white text-slate-900 font-extrabold text-[11px] rounded-xl shadow-md hover:bg-slate-100 transition active:scale-95"
                        >
                          Complete e-KYC Now →
                        </button>
                      </div>
                    )}

                    <div className="flex justify-between items-start mb-6">
                      <div>
                        <span className="text-[10px] font-black uppercase tracking-widest text-slate-600 block">
                          Educa Digital Banking
                        </span>
                        <span className="text-base font-black text-slate-900">SILVER DEBIT</span>
                      </div>
                      <div className={`flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px] font-black ${
                        isSilverUnlocked
                          ? "bg-emerald-600/10 border border-emerald-600/30 text-emerald-800"
                          : "bg-slate-800/10 border border-slate-700/30 text-slate-700"
                      }`}>
                        {isSilverUnlocked ? (
                          <>
                            <span className="w-1.5 h-1.5 rounded-full bg-emerald-600 animate-ping" />
                            ACTIVE
                          </>
                        ) : (
                          <>
                            <span>🔒</span> LOCKED
                          </>
                        )}
                      </div>
                    </div>

                    {/* EMV Chip & Contactless */}
                    <div className="flex items-center gap-3 mb-6">
                      <div className="w-9 h-7 bg-amber-300/80 rounded-md border border-amber-500/40 relative overflow-hidden flex items-center justify-center">
                        <div className="w-full border-t border-amber-600/50" />
                      </div>
                      <span className="text-slate-600 text-lg">📡</span>
                    </div>

                    <div className="font-mono font-bold text-base sm:text-lg tracking-widest text-slate-800 mb-4">
                      {isSilverUnlocked ? "4214 •••• •••• 9821" : "•••• •••• •••• ••••"}
                    </div>

                    <div className="flex justify-between items-end text-xs">
                      <div>
                        <span className="text-[9px] uppercase tracking-wider text-slate-500 block">Cardholder</span>
                        <span className="font-bold text-slate-900 uppercase">{userStored.name || "Educa Member"}</span>
                      </div>
                      <div className="text-right">
                        <span className="text-[9px] uppercase tracking-wider text-slate-500 block">Expires</span>
                        <span className="font-mono font-bold text-slate-900">{isSilverUnlocked ? "09/29" : "••/••"}</span>
                      </div>
                      <div className="font-black text-slate-900 tracking-wider text-sm">
                        RuPay
                      </div>
                    </div>
                  </div>

                  {/* Silver Card Perks & Status */}
                  <div className="p-4 bg-slate-50 border border-slate-200 rounded-2xl text-slate-900 space-y-3">
                    <div className="flex justify-between items-center">
                      <span className="font-bold text-xs text-blue-700">🎯 Silver Unlock Criteria:</span>
                      <span className="text-xs font-mono font-bold text-emerald-700">
                        {isSilverUnlocked ? "100% Unlocked" : (userProfile.kycStatus === "verified" ? "50% Completed" : "0% Completed")}
                      </span>
                    </div>

                    {/* Progress Bar */}
                    <div className="w-full bg-slate-200 h-2.5 rounded-full overflow-hidden border border-slate-300/60">
                      <div
                        className="bg-gradient-to-r from-blue-500 to-emerald-500 h-full rounded-full transition-all duration-500"
                        style={{ width: isSilverUnlocked ? "100%" : (userProfile.kycStatus === "verified" ? "50%" : "0%") }}
                      />
                    </div>

                    <div className="space-y-2 text-xs text-slate-600 pt-1">
                      <div className="flex items-center gap-2">
                        <span className={userProfile.kycStatus === "verified" ? "text-emerald-600 font-bold" : "text-amber-600 font-bold"}>
                          {userProfile.kycStatus === "verified" ? "✓" : "○"}
                        </span>
                        <span>Complete e-KYC Verification</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className={(userProfile.depositsCount || 0) > 0 ? "text-emerald-600 font-bold" : "text-amber-600 font-bold"}>
                          {(userProfile.depositsCount || 0) > 0 ? "✓" : "○"}
                        </span>
                        <span>First wallet deposit (min ₹500) ya 1 transaction</span>
                      </div>
                    </div>

                    {isSilverUnlocked ? (
                      <div className="p-2.5 bg-emerald-50 border border-emerald-200 rounded-xl text-emerald-800 font-bold text-xs">
                        ✓ Silver Card Active: ₹1,00,000 / day online limits & 0 fees.
                      </div>
                    ) : (
                      <button
                        onClick={() => { closeModal(); setModal(userProfile.kycStatus === "verified" ? "deposit" : "kyc"); }}
                        className="w-full py-2.5 bg-blue-600 hover:bg-blue-500 text-white font-bold text-xs rounded-xl shadow-md active:scale-95 transition"
                      >
                        {userProfile.kycStatus === "verified" ? "Add Money (Min ₹500) to Activate Card →" : "Complete e-KYC to Unlock Card →"}
                      </button>
                    )}
                  </div>
                </div>
              ) : (
                /* PLATINUM VIP CREDIT CARD */
                <div className="space-y-4">
                  <div className="bg-gradient-to-tr from-slate-950 via-zinc-900 to-neutral-900 p-5 rounded-3xl text-amber-100 shadow-2xl border border-amber-500/30 relative overflow-hidden">
                    <div className="absolute top-0 right-0 w-40 h-40 bg-amber-500/10 rounded-full -mr-20 -mt-20 pointer-events-none blur-xl" />
                    
                    {/* PHYSICAL FROSTED GOLD LOCK OVERLAY FOR PLATINUM VIP CARD */}
                    {!isPlatinumUnlocked && (
                      <div className="absolute inset-0 z-20 bg-black/80 backdrop-blur-[3px] rounded-3xl flex flex-col items-center justify-center p-4 text-center">
                        <div className="w-12 h-12 rounded-2xl bg-amber-500/20 border border-amber-400/40 backdrop-blur-md flex items-center justify-center text-2xl shadow-lg mb-2">
                          🔒
                        </div>
                        <span className="text-amber-300 font-black text-xs uppercase tracking-wider">
                          Platinum VIP Card Locked
                        </span>
                        <span className="text-amber-100/90 text-[11px] max-w-[220px] mt-1 font-medium leading-tight">
                          Complete 4 loan repayments & verified e-KYC to unlock
                        </span>
                        <div className="mt-3 px-3 py-1 bg-amber-400/10 border border-amber-400/30 rounded-xl text-[10px] font-mono font-bold text-amber-300">
                          Repayments Progress: {Math.min(userProfile.loansCount || 0, 4)} / 4
                        </div>
                      </div>
                    )}

                    <div className="flex justify-between items-start mb-6">
                      <div>
                        <span className="text-[10px] font-black uppercase tracking-widest text-amber-400 block">
                          Educa Private Wealth
                        </span>
                        <span className="text-base font-black bg-gradient-to-r from-amber-200 via-yellow-300 to-amber-500 bg-clip-text text-transparent">
                          PLATINUM VIP
                        </span>
                      </div>
                      {isPlatinumUnlocked ? (
                        <span className="px-2.5 py-0.5 bg-gradient-to-r from-amber-500 to-yellow-600 text-black font-black text-[10px] rounded-full shadow-xs">
                          👑 VIP ACTIVE
                        </span>
                      ) : (
                        <span className="px-2.5 py-0.5 bg-zinc-800 border border-amber-500/40 text-amber-300 font-black text-[10px] rounded-full">
                          🔒 LOCKED
                        </span>
                      )}
                    </div>

                    {/* Gold EMV Chip & Contactless */}
                    <div className="flex items-center gap-3 mb-6">
                      <div className="w-9 h-7 bg-gradient-to-br from-yellow-300 to-amber-500 rounded-md border border-amber-200/50 flex items-center justify-center shadow-xs">
                        <div className="w-full border-t border-amber-800/40" />
                      </div>
                      <span className="text-amber-400 text-lg">📡</span>
                    </div>

                    <div className="font-mono font-bold text-base sm:text-lg tracking-widest text-amber-200 mb-4">
                      {isPlatinumUnlocked ? "5399 •••• •••• 8842" : "•••• •••• •••• ••••"}
                    </div>

                    <div className="flex justify-between items-end text-xs">
                      <div>
                        <span className="text-[9px] uppercase tracking-wider text-amber-400/70 block">Cardholder</span>
                        <span className="font-bold text-amber-100 uppercase">{userStored.name || "Educa Member"}</span>
                      </div>
                      <div className="text-right">
                        <span className="text-[9px] uppercase tracking-wider text-amber-400/70 block">Expires</span>
                        <span className="font-mono font-bold text-amber-100">{isPlatinumUnlocked ? "12/30" : "••/••"}</span>
                      </div>
                      <div className="font-black text-amber-400 tracking-wider text-sm">
                        VISA VIP
                      </div>
                    </div>
                  </div>

                  {/* Platinum Unlock Criteria & Progress */}
                  <div className="p-4 bg-amber-50/50 border border-amber-200 rounded-2xl text-slate-900 space-y-3">
                    <div className="flex justify-between items-center">
                      <span className="font-bold text-xs text-amber-900">🎯 VIP Unlock Criteria:</span>
                      <span className="text-xs font-mono font-bold text-emerald-700">
                        {Math.min(100, Math.round(((userProfile.loansCount || 0) / 4) * 100))}% Completed
                      </span>
                    </div>

                    {/* Progress Bar */}
                    <div className="w-full bg-amber-100 h-2.5 rounded-full overflow-hidden border border-amber-200">
                      <div
                        className="bg-gradient-to-r from-amber-500 to-yellow-500 h-full rounded-full transition-all duration-500"
                        style={{ width: `${Math.min(100, Math.round(((userProfile.loansCount || 0) / 4) * 100))}%` }}
                      />
                    </div>

                    <div className="space-y-2 text-xs text-slate-700 pt-1">
                      <div className="flex items-center gap-2">
                        <span className={(userProfile.loansCount || 0) >= 4 ? "text-emerald-600 font-bold" : "text-amber-600 font-bold"}>
                          {(userProfile.loansCount || 0) >= 4 ? "✓" : "○"}
                        </span>
                        <span>
                          Complete <strong>4 loan installments</strong> on time:{" "}
                          <span className="font-mono font-bold text-amber-900">{Math.min(userProfile.loansCount || 0, 4)} / 4</span>
                        </span>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className={userProfile.kycStatus === "verified" ? "text-emerald-600 font-bold" : "text-amber-600 font-bold"}>
                          {userProfile.kycStatus === "verified" ? "✓" : "○"}
                        </span>
                        <span>Verified e-KYC Identity Check</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-amber-600 font-bold">○</span>
                        <span>OR total transaction volume of ₹50,000+ across all wallets</span>
                      </div>
                    </div>

                    {isPlatinumUnlocked ? (
                      <button
                        onClick={() => showToast("🎉 Platinum VIP Card is activated for your account!", "success")}
                        className="w-full py-2.5 bg-gradient-to-r from-amber-500 to-yellow-600 text-black font-extrabold text-xs rounded-xl shadow-md active:scale-95 transition"
                      >
                        Manage Platinum VIP Card →
                      </button>
                    ) : (
                      <button
                        onClick={() => { closeModal(); setAccountModal("personal_loan"); }}
                        className="w-full py-2.5 bg-white hover:bg-amber-100/60 border border-amber-300 text-amber-900 font-bold text-xs rounded-xl transition active:scale-95 text-center block shadow-xs"
                      >
                        View Personal Loan to Build Score →
                      </button>
                    )}
                  </div>
                </div>
              )}
            </div>
          </Sheet>
        );
      })()}

      {/* ══════════════════════════════════════════════════════
          E-KYC DOCUMENT VERIFICATION SHEET (SECURE & LOCKED)
      ══════════════════════════════════════════════════════ */}
      <Sheet open={modal === "kyc"} onClose={closeModal} title="Identity KYC Verification" icon="🛡️">
        <div className="space-y-4">
          {/* 1. Already Verified: Full Locked Documents View */}
          {userProfile.kycStatus === "verified" ? (
            <div className="space-y-3.5">
              <div className="py-4 px-4 bg-emerald-50 border border-emerald-200 rounded-3xl text-center space-y-2">
                <div className="w-12 h-12 rounded-2xl bg-emerald-500 text-white flex items-center justify-center text-xl mx-auto shadow-md shadow-emerald-500/20 font-black">
                  ✓
                </div>
                <div>
                  <h4 className="font-extrabold text-base text-emerald-950">KYC Verified & Active</h4>
                  <p className="text-xs text-emerald-800 mt-0.5 max-w-xs mx-auto">
                    Aapka account fully verified hai. Sabhi features jaise money transfer, cards aur loans active hain.
                  </p>
                </div>
                {userProfile.aadharNumber && (
                  <div className="inline-block px-3 py-1 bg-white border border-emerald-200 rounded-xl text-xs font-mono text-emerald-900 font-bold">
                    UID: •••• •••• {userProfile.aadharNumber.slice(-4)}
                  </div>
                )}
              </div>

              {/* Locked Submitted Documents Viewer */}
              <div className="space-y-3 p-3.5 bg-gray-50 border border-gray-200 rounded-2xl">
                <div className="flex items-center justify-between">
                  <span className="font-extrabold text-xs text-gray-900 flex items-center gap-1.5">
                    <span>🔒</span> Submitted Documents (Locked & Verified)
                  </span>
                  <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 uppercase">
                    Tamper Proof
                  </span>
                </div>

                {/* Doc 1: Aadhaar Card */}
                <div className="p-2.5 bg-white border border-gray-200 rounded-xl space-y-1.5 text-xs">
                  <div className="flex justify-between items-center">
                    <span className="font-bold text-gray-800">1. Aadhaar Card (Primary ID)</span>
                    <span className="text-[10px] font-mono text-gray-500">
                      •••• {userProfile.aadharNumber ? userProfile.aadharNumber.slice(-4) : ""}
                    </span>
                  </div>
                  {userProfile.kycDocuments?.aadhaarName && (
                    <p className="text-[11px] text-gray-600">
                      Naam: <strong>{userProfile.kycDocuments.aadhaarName}</strong>
                    </p>
                  )}
                  {(userProfile.kycDocuments?.doc1Url || userProfile.kycDocuments?.docUrl) && (
                    <div
                      onClick={() => { setLightboxImg(userProfile.kycDocuments?.doc1Url || userProfile.kycDocuments?.docUrl); setZoomLevel(1); }}
                      className="mt-1 rounded-xl overflow-hidden border border-blue-200 bg-blue-50/40 p-1.5 flex flex-col items-center cursor-pointer group hover:border-blue-400 transition"
                      title="Tap to open fullscreen & zoom"
                    >
                      <img
                        src={userProfile.kycDocuments.doc1Url || userProfile.kycDocuments.docUrl}
                        alt="Aadhaar Card"
                        className="max-h-40 object-contain rounded-lg group-hover:scale-[1.02] transition"
                      />
                      <span className="text-[10px] font-bold text-blue-600 mt-1 flex items-center gap-1 group-hover:underline">
                        🔍 Tap to Open Fullscreen & Zoom
                      </span>
                    </div>
                  )}
                </div>

                {/* Doc 2: PAN Card / Bank Cheque */}
                {(userProfile.kycDocuments?.doc2Url || userProfile.kycDocuments?.panNumber || userProfile.kycDocuments?.chequeNumber) && (
                  <div className="p-2.5 bg-white border border-gray-200 rounded-xl space-y-1.5 text-xs">
                    <div className="flex justify-between items-center">
                      <span className="font-bold text-gray-800">
                        2. {userProfile.kycDocuments?.doc2Type === "cheque" ? "Cancelled Cheque" : "PAN Card"}
                      </span>
                      <span className="text-[10px] font-mono font-bold text-indigo-700">
                        {userProfile.kycDocuments?.panNumber || userProfile.kycDocuments?.chequeNumber || "Verified"}
                      </span>
                    </div>
                    {userProfile.kycDocuments?.doc2Url && (
                      <div
                        onClick={() => { setLightboxImg(userProfile.kycDocuments.doc2Url); setZoomLevel(1); }}
                        className="mt-1 rounded-xl overflow-hidden border border-indigo-200 bg-indigo-50/40 p-1.5 flex flex-col items-center cursor-pointer group hover:border-indigo-400 transition"
                        title="Tap to open fullscreen & zoom"
                      >
                        <img
                          src={userProfile.kycDocuments.doc2Url}
                          alt="Financial Proof"
                          className="max-h-40 object-contain rounded-lg group-hover:scale-[1.02] transition"
                        />
                        <span className="text-[10px] font-bold text-indigo-600 mt-1 flex items-center gap-1 group-hover:underline">
                          🔍 Tap to Open Fullscreen & Zoom
                        </span>
                      </div>
                    )}
                  </div>
                )}

                <p className="text-[10px] text-gray-500 italic text-center pt-1">
                  🛡️ As per security guidelines, verified KYC documents are permanently locked on server and cannot be deleted or modified.
                </p>
              </div>

              <button
                type="button"
                onClick={closeModal}
                className="w-full py-3 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl font-bold text-xs shadow-md shadow-emerald-500/20 active:scale-95 transition cursor-pointer"
              >
                Close
              </button>
            </div>
          ) : userProfile.kycStatus === "pending" ? (
            /* 2. Under Review: Clean Locked View of Submitted Documents */
            <div className="space-y-3.5">
              <div className="py-4 px-4 bg-amber-50 border border-amber-200 rounded-3xl text-center space-y-2">
                <div className="w-12 h-12 rounded-2xl bg-amber-500 text-white flex items-center justify-center text-xl mx-auto shadow-md shadow-amber-500/20 font-black">
                  ⏳
                </div>
                <div>
                  <h4 className="font-extrabold text-base text-amber-950">KYC Under Review</h4>
                  <p className="text-xs text-amber-800 mt-0.5 max-w-xs mx-auto">
                    Aapke KYC documents submit ho chuke hain. Verification team review kar rahi hai (samanya samay: 2-4 ghante).
                  </p>
                </div>
              </div>

              {/* Locked Submitted Documents Viewer */}
              <div className="space-y-3 p-3.5 bg-gray-50 border border-gray-200 rounded-2xl">
                <div className="flex items-center justify-between">
                  <span className="font-extrabold text-xs text-gray-900 flex items-center gap-1.5">
                    <span>🔒</span> Submitted Documents (Locked)
                  </span>
                  <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-100 text-amber-800 uppercase">
                    Under Review
                  </span>
                </div>

                {/* Doc 1: Aadhaar Card */}
                <div className="p-2.5 bg-white border border-gray-200 rounded-xl space-y-1.5 text-xs">
                  <div className="flex justify-between items-center">
                    <span className="font-bold text-gray-800">1. Aadhaar Card (Primary ID)</span>
                    {userProfile.aadharNumber && (
                      <span className="text-[10px] font-mono text-gray-500">
                        UID: •••• {userProfile.aadharNumber.slice(-4)}
                      </span>
                    )}
                  </div>
                  {userProfile.kycDocuments?.aadhaarName && (
                    <p className="text-[11px] text-gray-600">
                      Naam: <strong>{userProfile.kycDocuments.aadhaarName}</strong>
                    </p>
                  )}
                  {(userProfile.kycDocuments?.doc1Url || userProfile.kycDocuments?.docUrl) && (
                    <div
                      onClick={() => { setLightboxImg(userProfile.kycDocuments?.doc1Url || userProfile.kycDocuments?.docUrl); setZoomLevel(1); }}
                      className="mt-1 rounded-xl overflow-hidden border border-amber-200 bg-amber-50/40 p-1.5 flex flex-col items-center cursor-pointer group hover:border-amber-400 transition"
                      title="Tap to open fullscreen & zoom"
                    >
                      <img
                        src={userProfile.kycDocuments.doc1Url || userProfile.kycDocuments.docUrl}
                        alt="Submitted Aadhaar"
                        className="max-h-40 object-contain rounded-lg group-hover:scale-[1.02] transition"
                      />
                      <span className="text-[10px] font-bold text-amber-800 mt-1 flex items-center gap-1 group-hover:underline">
                        🔍 Tap to Open Fullscreen & Zoom
                      </span>
                    </div>
                  )}
                </div>

                {/* Doc 2: PAN Card / Bank Cheque */}
                {(userProfile.kycDocuments?.doc2Url || userProfile.kycDocuments?.panNumber || userProfile.kycDocuments?.chequeNumber) && (
                  <div className="p-2.5 bg-white border border-gray-200 rounded-xl space-y-1.5 text-xs">
                    <div className="flex justify-between items-center">
                      <span className="font-bold text-gray-800">
                        2. {userProfile.kycDocuments?.doc2Type === "cheque" ? "Cancelled Cheque" : "PAN Card"}
                      </span>
                      <span className="text-[10px] font-mono font-bold text-indigo-700">
                        {userProfile.kycDocuments?.panNumber || userProfile.kycDocuments?.chequeNumber || "Submitted"}
                      </span>
                    </div>
                    {userProfile.kycDocuments?.doc2Url && (
                      <div
                        onClick={() => { setLightboxImg(userProfile.kycDocuments.doc2Url); setZoomLevel(1); }}
                        className="mt-1 rounded-xl overflow-hidden border border-indigo-200 bg-indigo-50/40 p-1.5 flex flex-col items-center cursor-pointer group hover:border-indigo-400 transition"
                        title="Tap to open fullscreen & zoom"
                      >
                        <img
                          src={userProfile.kycDocuments.doc2Url}
                          alt="Submitted Financial Proof"
                          className="max-h-40 object-contain rounded-lg group-hover:scale-[1.02] transition"
                        />
                        <span className="text-[10px] font-bold text-indigo-700 mt-1 flex items-center gap-1 group-hover:underline">
                          🔍 Tap to Open Fullscreen & Zoom
                        </span>
                      </div>
                    )}
                  </div>
                )}

                <p className="text-[10px] text-gray-500 italic text-center pt-1">
                  🛡️ Documents are securely stored and locked against unauthorized edits.
                </p>
              </div>

              <button
                type="button"
                onClick={closeModal}
                className="w-full py-3 bg-amber-600 hover:bg-amber-700 text-white rounded-xl font-bold text-xs shadow-md shadow-amber-500/20 active:scale-95 transition cursor-pointer"
              >
                Got It
              </button>
            </div>
          ) : (
            /* 3. Not submitted yet (or rejected): Clean professional form with 3 document options */
            <div className="space-y-4">
              {/* Step 1: Mandatory Document 1 - Aadhaar Card */}
              <div className="p-3.5 bg-blue-50/50 border border-blue-200/80 rounded-2xl space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="w-5 h-5 rounded-full bg-blue-600 text-white font-bold text-[11px] flex items-center justify-center">1</span>
                    <span className="text-xs font-bold text-blue-950">Aadhaar Card (Mandatory)</span>
                  </div>
                  <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-blue-100 text-blue-700">Primary ID</span>
                </div>

                <div>
                  <label className="block text-[11px] font-bold text-gray-700 mb-1">
                    Aadhaar Number (12 Digits) <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="text"
                    inputMode="numeric"
                    maxLength={14}
                    placeholder="xxxx xxxx xxxx"
                    value={kycForm.aadharNumber}
                    onChange={e => {
                      const val = e.target.value.replace(/\D/g, "").slice(0, 12);
                      const formatted = val.replace(/(\d{4})(?=\d)/g, "$1 ");
                      setKycForm({ ...kycForm, aadharNumber: formatted });
                    }}
                    className="w-full px-3.5 py-2.5 bg-white border border-gray-200 rounded-xl font-mono text-xs tracking-widest focus:ring-2 focus:ring-blue-500 outline-none"
                  />
                </div>

                {/* Aadhaar-linked Name */}
                <div>
                  <label className="block text-[11px] font-bold text-gray-700 mb-1">
                    Naam (Aadhaar ke hisaab se) <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="text"
                    placeholder="Jaise Aadhaar card par likha hai"
                    value={kycForm.aadhaarName}
                    onChange={e => setKycForm({ ...kycForm, aadhaarName: e.target.value })}
                    className="w-full px-3.5 py-2.5 bg-white border border-gray-200 rounded-xl text-xs font-medium focus:ring-2 focus:ring-blue-500 outline-none"
                  />
                </div>

                {/* Aadhaar-linked Phone */}
                <div>
                  <label className="block text-[11px] font-bold text-gray-700 mb-1">
                    Mobile Number (Aadhaar se linked) <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="text"
                    inputMode="numeric"
                    maxLength={10}
                    placeholder="10 digit mobile number"
                    value={kycForm.aadhaarPhone}
                    onChange={e => setKycForm({ ...kycForm, aadhaarPhone: e.target.value.replace(/\D/g, "").slice(0, 10) })}
                    className="w-full px-3.5 py-2.5 bg-white border border-gray-200 rounded-xl font-mono text-xs focus:ring-2 focus:ring-blue-500 outline-none"
                  />
                </div>

                {/* Aadhaar-linked Address */}
                <div>
                  <label className="block text-[11px] font-bold text-gray-700 mb-1">
                    Pata (Aadhaar card par likha hua) <span className="text-rose-500">*</span>
                  </label>
                  <textarea
                    rows={2}
                    placeholder="Ghar no., Gali, Mohalla, Shahar, Pin Code"
                    value={kycForm.aadhaarAddress}
                    onChange={e => setKycForm({ ...kycForm, aadhaarAddress: e.target.value })}
                    className="w-full px-3.5 py-2.5 bg-white border border-gray-200 rounded-xl text-xs font-medium focus:ring-2 focus:ring-blue-500 outline-none resize-none"
                  />
                </div>

                <div>
                  <label className="block text-[11px] font-bold text-gray-700 mb-1">
                    Upload Aadhaar Photo / PDF <span className="text-rose-500">*</span>
                  </label>
                  <div className="flex items-center gap-2">
                    <label className="flex-1 cursor-pointer py-2.5 px-3 bg-white hover:bg-gray-50 border border-dashed border-blue-300 rounded-xl text-xs text-blue-700 font-bold flex items-center justify-center gap-2 transition active:scale-95">
                      <span>📄</span>
                      <span className="truncate">{kycForm.doc1Name || "Upload Aadhaar File"}</span>
                      <input
                        type="file"
                        accept="image/*,application/pdf"
                        onChange={e => handleKycFileChange(e, 1)}
                        className="hidden"
                      />
                    </label>
                    {kycForm.doc1Url && (
                      <button
                        type="button"
                        onClick={() => setKycForm({ ...kycForm, doc1Name: "", doc1Url: "" })}
                        className="px-3 py-2.5 bg-rose-50 text-rose-600 rounded-xl text-xs font-bold hover:bg-rose-100 transition cursor-pointer"
                        title="Remove upload"
                      >
                        ✕
                      </button>
                    )}
                  </div>
                  {kycForm.doc1Url && (
                    <div className="mt-2 p-2 bg-white border border-gray-200 rounded-xl flex items-center gap-2.5">
                      <img src={kycForm.doc1Url} alt="Aadhaar Preview" className="w-10 h-10 object-cover rounded-lg border border-gray-200 shrink-0" />
                      <div className="text-[11px] text-gray-600 truncate flex-1">
                        <span className="font-bold text-gray-800 block truncate">{kycForm.doc1Name || "Aadhaar Card"}</span>
                        <span className="text-emerald-600 font-bold">✓ Uploaded</span>
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {/* Step 2: Mandatory Document 2 - PAN Card OR Bank Cheque */}
              <div className="p-3.5 bg-indigo-50/50 border border-indigo-200/80 rounded-2xl space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="w-5 h-5 rounded-full bg-indigo-600 text-white font-bold text-[11px] flex items-center justify-center">2</span>
                    <span className="text-xs font-bold text-indigo-950">PAN Card ya Bank Cheque (Mandatory)</span>
                  </div>
                  <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-indigo-100 text-indigo-700">Financial Proof</span>
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setKycForm({ ...kycForm, doc2Type: "pan" })}
                    className={`py-2 px-2.5 rounded-xl text-xs font-bold transition flex items-center justify-center gap-1.5 cursor-pointer border ${
                      kycForm.doc2Type === "pan"
                        ? "bg-indigo-600 text-white border-indigo-600 shadow-xs"
                        : "bg-white text-gray-700 border-gray-200 hover:bg-gray-50"
                    }`}
                  >
                    <span>💳</span>
                    <span>PAN Card</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setKycForm({ ...kycForm, doc2Type: "cheque" })}
                    className={`py-2 px-2.5 rounded-xl text-xs font-bold transition flex items-center justify-center gap-1.5 cursor-pointer border ${
                      kycForm.doc2Type === "cheque"
                        ? "bg-indigo-600 text-white border-indigo-600 shadow-xs"
                        : "bg-white text-gray-700 border-gray-200 hover:bg-gray-50"
                    }`}
                  >
                    <span>🏦</span>
                    <span>Cancelled Cheque</span>
                  </button>
                </div>

                {kycForm.doc2Type === "pan" ? (
                  <div>
                    <label className="block text-[11px] font-bold text-gray-700 mb-1">
                      PAN Card Number <span className="text-rose-500">*</span>
                    </label>
                    <input
                      type="text"
                      maxLength={10}
                      placeholder="ABCDE1234F"
                      value={kycForm.panNumber}
                      onChange={e => setKycForm({ ...kycForm, panNumber: e.target.value.toUpperCase() })}
                      className="w-full px-3.5 py-2.5 bg-white border border-gray-200 rounded-xl font-mono text-xs uppercase focus:ring-2 focus:ring-indigo-500 outline-none"
                    />
                  </div>
                ) : (
                  <div>
                    <label className="block text-[11px] font-bold text-gray-700 mb-1">
                      Cheque / Account Number <span className="text-rose-500">*</span>
                    </label>
                    <input
                      type="text"
                      placeholder="Enter Cheque No. or Bank Account No."
                      value={kycForm.chequeNumber}
                      onChange={e => setKycForm({ ...kycForm, chequeNumber: e.target.value })}
                      className="w-full px-3.5 py-2.5 bg-white border border-gray-200 rounded-xl font-mono text-xs focus:ring-2 focus:ring-indigo-500 outline-none"
                    />
                  </div>
                )}

                <div>
                  <label className="block text-[11px] font-bold text-gray-700 mb-1">
                    Upload {kycForm.doc2Type === "pan" ? "PAN Card" : "Bank Cheque / Passbook"} <span className="text-rose-500">*</span>
                  </label>
                  <div className="flex items-center gap-2">
                    <label className="flex-1 cursor-pointer py-2.5 px-3 bg-white hover:bg-gray-50 border border-dashed border-indigo-300 rounded-xl text-xs text-indigo-700 font-bold flex items-center justify-center gap-2 transition active:scale-95">
                      <span>📄</span>
                      <span className="truncate">{kycForm.doc2Name || `Upload ${kycForm.doc2Type === "pan" ? "PAN" : "Cheque"} File`}</span>
                      <input
                        type="file"
                        accept="image/*,application/pdf"
                        onChange={e => handleKycFileChange(e, 2)}
                        className="hidden"
                      />
                    </label>
                    {kycForm.doc2Url && (
                      <button
                        type="button"
                        onClick={() => setKycForm({ ...kycForm, doc2Name: "", doc2Url: "" })}
                        className="px-3 py-2.5 bg-rose-50 text-rose-600 rounded-xl text-xs font-bold hover:bg-rose-100 transition cursor-pointer"
                        title="Remove upload"
                      >
                        ✕
                      </button>
                    )}
                  </div>
                  {kycForm.doc2Url && (
                    <div className="mt-2 p-2 bg-white border border-gray-200 rounded-xl flex items-center gap-2.5">
                      <img src={kycForm.doc2Url} alt="Doc 2 Preview" className="w-10 h-10 object-cover rounded-lg border border-gray-200 shrink-0" />
                      <div className="text-[11px] text-gray-600 truncate flex-1">
                        <span className="font-bold text-gray-800 block truncate">{kycForm.doc2Name || "Document 2"}</span>
                        <span className="text-emerald-600 font-bold">✓ Uploaded</span>
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {/* Residential Address / City */}
              <div>
                <label className="block text-xs font-bold text-gray-700 mb-1">
                  Residential Address / City (Optional)
                </label>
                <input
                  type="text"
                  placeholder="Enter your street address & city"
                  value={kycForm.address}
                  onChange={e => setKycForm({ ...kycForm, address: e.target.value })}
                  className="w-full px-3.5 py-2.5 border border-gray-200 rounded-xl text-xs font-medium text-slate-800 placeholder-slate-400 focus:ring-2 focus:ring-blue-500 outline-none"
                />
              </div>

              {kycError && (
                <p className="text-xs text-rose-600 font-semibold">{kycError}</p>
              )}

              <div className="flex gap-2.5 pt-2">
                <button
                  type="button"
                  onClick={closeModal}
                  className="flex-1 py-3 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-xl font-bold text-xs transition cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={submitKyc}
                  disabled={kycSubmitting}
                  className="flex-1 py-3 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white rounded-xl font-bold text-xs shadow-md shadow-blue-500/20 active:scale-95 transition disabled:opacity-50 cursor-pointer"
                >
                  {kycSubmitting ? "Submitting..." : "Submit KYC →"}
                </button>
              </div>
            </div>
          )}
        </div>
      </Sheet>

      {/* ══════════════════════════════════════════════════════
          SETTINGS & ACCESSIBILITY SHEET (UNIFIED)
      ══════════════════════════════════════════════════════ */}
      <Sheet open={modal === "settings"} onClose={closeModal} title="Settings & Accessibility" icon="⚙️">
        <div className="space-y-4">
          {/* Section 1: Language */}
          <div className="p-4 bg-gray-50 border border-gray-200 rounded-2xl space-y-2.5">
            <div className="flex items-center gap-2">
              <span className="text-lg">🌐</span>
              <div>
                <h4 className="font-extrabold text-xs text-gray-900">App Language (भाषा)</h4>
                <p className="text-[11px] text-gray-500">Apni pasandida bhasha chunein</p>
              </div>
            </div>

            <div className="grid grid-cols-3 gap-2 pt-1">
              <button
                type="button"
                onClick={() => handleLanguageChange("hinglish")}
                className={`py-2 px-2.5 rounded-xl text-xs font-bold transition flex flex-col items-center justify-center gap-0.5 border ${
                  lang === "hinglish"
                    ? "bg-blue-600 text-white border-blue-600 shadow-xs"
                    : "bg-white text-gray-700 border-gray-200 hover:bg-gray-100"
                }`}
              >
                <span>Hinglish</span>
                <span className="text-[10px] opacity-80">(Default)</span>
              </button>

              <button
                type="button"
                onClick={() => handleLanguageChange("hindi")}
                className={`py-2 px-2.5 rounded-xl text-xs font-bold transition flex flex-col items-center justify-center gap-0.5 border ${
                  lang === "hindi"
                    ? "bg-blue-600 text-white border-blue-600 shadow-xs"
                    : "bg-white text-gray-700 border-gray-200 hover:bg-gray-100"
                }`}
              >
                <span>हिंदी</span>
                <span className="text-[10px] opacity-80">(Hindi)</span>
              </button>

              <button
                type="button"
                onClick={() => handleLanguageChange("english")}
                className={`py-2 px-2.5 rounded-xl text-xs font-bold transition flex flex-col items-center justify-center gap-0.5 border ${
                  lang === "english"
                    ? "bg-blue-600 text-white border-blue-600 shadow-xs"
                    : "bg-white text-gray-700 border-gray-200 hover:bg-gray-100"
                }`}
              >
                <span>English</span>
                <span className="text-[10px] opacity-80">(EN)</span>
              </button>
            </div>
          </div>

          {/* Section 2: Voice Guide Assistant for Blind / Visually Impaired */}
          <div className="p-4 bg-gradient-to-r from-blue-50 to-indigo-50 border border-blue-200 rounded-2xl space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="text-xl">🔊</span>
                <div>
                  <h4 className="font-extrabold text-xs text-blue-950">Voice Guide (दृष्टिबाधित सहायता)</h4>
                  <p className="text-[11px] text-blue-700">Blind & Visually Impaired Voice Reader</p>
                </div>
              </div>
              {isSpeaking && (
                <span className="px-2 py-0.5 bg-amber-200 text-amber-900 rounded-full font-black text-[10px] animate-pulse">
                  Speaking...
                </span>
              )}
            </div>

            <p className="text-xs text-blue-900/90 leading-relaxed">
              Yeh feature primary balance aur sabhi options ko aawaz mein bol kar sunata hai taaki blind users bina kisi pareshani ke app chala sakein.
            </p>

            <button
              type="button"
              onClick={speakDashboard}
              className={`w-full py-2.5 rounded-xl font-bold text-xs flex items-center justify-center gap-2 shadow-sm transition active:scale-95 ${
                isSpeaking
                  ? "bg-amber-500 hover:bg-amber-600 text-white"
                  : "bg-blue-600 hover:bg-blue-700 text-white shadow-blue-500/20"
              }`}
            >
              <span>{isSpeaking ? "⏹️" : "🔊"}</span>
              <span>{isSpeaking ? "Aawaz Band Karein (Stop Audio)" : "Aawaz Me Suniye (Read Screen Aloud)"}</span>
            </button>
          </div>

          {/* Section 3: Feature Tour */}
          <button
            type="button"
            onClick={() => { closeModal(); setTourStep(0); setShowTour(true); }}
            className="w-full py-2.5 px-4 bg-white hover:bg-gray-50 border border-gray-200 text-gray-800 rounded-xl font-bold text-xs flex items-center justify-between transition active:scale-95"
          >
            <span className="flex items-center gap-2"><span>🎓</span> Replay App Feature Tour</span>
            <span className="text-gray-400">→</span>
          </button>
        </div>
      </Sheet>

      {/* ══════════════════════════════════════════════════════
          PASSBOOK & PRIMARY ACCOUNT STATEMENT SHEET
      ══════════════════════════════════════════════════════ */}
      <Sheet open={modal === "passbook"} onClose={closeModal} title="Primary Wallet & Passbook Statement" icon="💳">
        <div className="space-y-4">
          {/* BALANCE CARD */}
          <div className="bg-gradient-to-r from-blue-600 via-indigo-600 to-blue-700 rounded-3xl p-5 text-white shadow-lg shadow-blue-500/15 relative overflow-hidden">
            <div className="flex justify-between items-start">
              <div>
                <span className="text-xs text-blue-100 font-bold uppercase tracking-wider">Primary Account Balance</span>
                <div className="text-3xl font-black font-display my-1">
                  ₹{(userProfile.balance ?? balance ?? 0).toLocaleString("en-IN")}
                </div>
                <p className="text-[11px] text-blue-100 mt-1">
                  ID: <span className="font-mono font-bold text-emerald-300">{userUniqueId}</span>
                </p>
              </div>
              <span className="px-2.5 py-1 bg-white/20 text-white text-[10px] font-black rounded-full uppercase">
                Primary Wallet
              </span>
            </div>
          </div>

          {/* FILTER TABS */}
          <div className="flex gap-1.5 p-1 bg-gray-100 rounded-xl">
            {[
              { id: "all", label: `All (${txns.length})` },
              { id: "in", label: `In / Received (${txns.filter(t => ["deposit", "transfer_received", "bond_payout", "loan_disbursal"].includes(t.type)).length})` },
              { id: "out", label: `Out / Sent (${txns.filter(t => !["deposit", "transfer_received", "bond_payout", "loan_disbursal"].includes(t.type)).length})` },
            ].map(f => (
              <button
                key={f.id}
                onClick={() => setPassbookFilter(f.id)}
                className={`flex-1 py-1.5 text-xs font-bold rounded-lg transition ${
                  passbookFilter === f.id
                    ? "bg-white text-blue-700 shadow-sm"
                    : "text-gray-500 hover:text-gray-800"
                }`}
              >
                {f.label}
              </button>
            ))}
          </div>

          {/* TRANSACTIONS PASSBOOK LIST */}
          <div className="space-y-2.5 max-h-[60vh] overflow-y-auto pr-1">
            {(() => {
              const filtered = txns.filter(t => {
                const isCredit = ["deposit", "transfer_received", "bond_payout", "loan_disbursal"].includes(t.type);
                if (passbookFilter === "in") return isCredit;
                if (passbookFilter === "out") return !isCredit;
                return true;
              });

              if (filtered.length === 0) {
                return (
                  <div className="py-12 text-center text-gray-400 text-xs">
                    <p className="text-2xl mb-1">📜</p>
                    Koi transaction record nahi mila
                  </div>
                );
              }

              return filtered.map(t => {
                const isCredit = ["deposit", "transfer_received", "bond_payout", "loan_disbursal"].includes(t.type);
                
                let title = t.type.replace(/_/g, " ");
                let details = t.remarks || "";

                if (t.type === "transfer_sent") {
                  title = `Sent to ${t.receiverName || t.recipientIdentifier || "User"}`;
                  details = `Sent from Primary Wallet • ${t.recipientIdentifier || ""}`;
                } else if (t.type === "transfer_received") {
                  title = `Received from ${t.senderName || t.recipientIdentifier || "User"}`;
                  details = `Credited to Primary Wallet • ${t.recipientIdentifier || ""}`;
                } else if (t.type === "deposit") {
                  title = `Deposit via ${t.method?.toUpperCase() || "UPI"}`;
                  details = t.utrNumber ? `UTR: ${t.utrNumber}` : "Direct account top-up";
                } else if (t.type === "withdrawal") {
                  title = `Withdrawal to Bank / UPI`;
                  details = `Debited from Primary Wallet (${t.status})`;
                } else if (t.type === "loan_disbursal") {
                  title = `Personal Loan Disbursed`;
                  details = `Loan funds credited to Primary Account`;
                } else if (t.type === "loan_installment") {
                  title = `Loan Installment Repayment`;
                  details = `Scheduled installment repayment paid`;
                } else if (t.type === "loan_early_closure") {
                  title = `Loan Early Closure Payoff`;
                  details = `Zero-interest early payoff full closure`;
                } else if (t.type === "bond_created") {
                  title = `Bond Investment Created`;
                  details = `Funds locked for bond`;
                } else if (t.type === "bond_payout") {
                  title = `Bond Payout / Profit Credited`;
                  details = `Maturity return / monthly payout credited`;
                }

                const d = new Date(t.createdAt);
                const timeStr = d.toLocaleDateString("en-IN", {
                  day: "numeric",
                  month: "short",
                  year: "numeric"
                }) + " • " + d.toLocaleTimeString("en-IN", {
                  hour: "2-digit",
                  minute: "2-digit"
                });

                return (
                  <div
                    key={t._id}
                    className="p-3.5 bg-white border border-gray-100 hover:border-gray-200 rounded-2xl transition shadow-xs flex items-center justify-between gap-3"
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <div className={`w-10 h-10 rounded-2xl flex items-center justify-center text-base shrink-0 ${
                        isCredit ? "bg-emerald-50 text-emerald-600" : "bg-rose-50 text-rose-600"
                      }`}>
                        {isCredit ? "🟢" : "🔴"}
                      </div>
                      <div className="min-w-0">
                        <p className="font-extrabold text-xs text-gray-900 truncate capitalize">
                          {title}
                        </p>
                        <p className="text-[11px] text-gray-500 truncate mt-0.5">
                          {details}
                        </p>
                        <p className="text-[10px] text-gray-400 mt-0.5">
                          {timeStr}
                        </p>
                      </div>
                    </div>

                    <div className="text-right shrink-0">
                      <p className={`font-black text-sm ${isCredit ? "text-emerald-600" : "text-rose-600"}`}>
                        {isCredit ? "+" : "-"}₹{t.amount.toLocaleString("en-IN")}
                      </p>
                      <StatusBadge status={t.status} />
                    </div>
                  </div>
                );
              });
            })()}
          </div>
        </div>
      </Sheet>

      {/* ══════════════════════════════════════════════════════
          NEW USER GUIDED FEATURE TOUR MODAL
      ══════════════════════════════════════════════════════ */}
      {showTour && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/75 backdrop-blur-md animate-fadeIn">
          <div className="bg-white rounded-3xl p-6 sm:p-7 w-full max-w-md shadow-2xl border border-gray-100 relative overflow-hidden">
            {/* Header with step pill & skip */}
            <div className="flex justify-between items-center mb-4">
              <span className="px-2.5 py-1 bg-blue-100 text-blue-700 text-[11px] font-black rounded-full uppercase tracking-wider">
                {tourSteps[tourStep].badge}
              </span>
              <button
                type="button"
                onClick={finishTour}
                className="text-xs font-bold text-gray-400 hover:text-gray-700 px-2 py-1 rounded-lg hover:bg-gray-100 transition"
              >
                {txt.skipTour} ✕
              </button>
            </div>

            {/* Graphic card for current step */}
            <div className={`p-6 rounded-2xl bg-gradient-to-br ${tourSteps[tourStep].color} text-white shadow-lg mb-5 text-center relative overflow-hidden`}>
              <div className="text-4xl sm:text-5xl mb-3">{tourSteps[tourStep].icon}</div>
              <h3 className="text-lg sm:text-xl font-black font-display mb-1.5">
                {lang === "hindi" ? tourSteps[tourStep].titleHi : tourSteps[tourStep].title}
              </h3>
              <p className="text-xs sm:text-sm text-white/90 leading-relaxed font-medium">
                {lang === "hindi"
                  ? tourSteps[tourStep].descHi
                  : lang === "english"
                  ? tourSteps[tourStep].descEn
                  : tourSteps[tourStep].desc}
              </p>
            </div>

            {/* Stepper Dots Indicator */}
            <div className="flex justify-center items-center gap-1.5 mb-6">
              {tourSteps.map((_, idx) => (
                <button
                  key={idx}
                  onClick={() => setTourStep(idx)}
                  className={`h-2 rounded-full transition-all duration-300 ${
                    tourStep === idx ? "w-7 bg-blue-600" : "w-2 bg-gray-200 hover:bg-gray-300"
                  }`}
                  aria-label={`Go to tour step ${idx + 1}`}
                />
              ))}
            </div>

            {/* Action Buttons */}
            <div className="flex items-center gap-2.5">
              {tourStep > 0 && (
                <button
                  type="button"
                  onClick={() => setTourStep((s) => s - 1)}
                  className="px-4 py-2.5 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-xl font-bold text-xs transition active:scale-95"
                >
                  {txt.back}
                </button>
              )}
              <button
                type="button"
                onClick={() => {
                  if (tourStep < tourSteps.length - 1) {
                    setTourStep((s) => s + 1);
                  } else {
                    finishTour();
                  }
                }}
                className="flex-1 py-2.5 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white rounded-xl font-bold text-xs shadow-md shadow-blue-500/20 transition active:scale-95 text-center"
              >
                {tourStep === tourSteps.length - 1 ? txt.finish : txt.next}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ══════════════════════════════════════════════════════
          INSTALLMENT PAYMENT & PROOF SUBMISSION SHEET
      ══════════════════════════════════════════════════════ */}
      {submitInstallmentModal && (
        <Sheet
          open={Boolean(submitInstallmentModal)}
          onClose={() => setSubmitInstallmentModal(null)}
          title={`Pay Installment #${submitInstallmentModal.installmentNo} (₹${submitInstallmentModal.amount})`}
          icon="💳"
        >
          <div className="space-y-4">
            <div className="p-3 bg-gradient-to-r from-blue-50 to-indigo-50 border border-blue-200 rounded-2xl flex items-center justify-between">
              <div>
                <span className="text-[10px] text-gray-500 uppercase font-bold tracking-wider">Installment Due</span>
                <h4 className="text-xl font-black font-display text-blue-950">₹{submitInstallmentModal.amount}</h4>
              </div>
              <div className="text-right">
                <span className="text-[10px] text-gray-500 uppercase font-bold tracking-wider">Installment No.</span>
                <p className="font-mono font-bold text-sm text-indigo-700">#{submitInstallmentModal.installmentNo}</p>
              </div>
            </div>

            {/* Payment Method Selector */}
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setInstallmentPayMethod("wallet")}
                className={`py-2.5 px-3 rounded-2xl text-xs font-bold transition flex items-center justify-center gap-1.5 cursor-pointer border ${
                  installmentPayMethod === "wallet"
                    ? "bg-blue-600 text-white border-blue-600 shadow-sm"
                    : "bg-white text-gray-700 border-gray-200 hover:bg-gray-50"
                }`}
              >
                <span>👛</span>
                <span>Wallet Balance</span>
              </button>
              <button
                type="button"
                onClick={() => setInstallmentPayMethod("upi_qr")}
                className={`py-2.5 px-3 rounded-2xl text-xs font-bold transition flex items-center justify-center gap-1.5 cursor-pointer border ${
                  installmentPayMethod === "upi_qr"
                    ? "bg-blue-600 text-white border-blue-600 shadow-sm"
                    : "bg-white text-gray-700 border-gray-200 hover:bg-gray-50"
                }`}
              >
                <span>📱</span>
                <span>UPI QR / Proof</span>
              </button>
            </div>

            {installmentPayMethod === "wallet" ? (
              <div className="space-y-3 p-4 bg-gray-50 rounded-2xl border border-gray-200 text-xs">
                <div className="flex justify-between items-center text-gray-700">
                  <span>Available Balance:</span>
                  <span className="font-bold text-emerald-700 font-mono text-sm">
                    ₹{(userProfile.balance || 0).toLocaleString("en-IN")}
                  </span>
                </div>
                {(userProfile.balance || 0) < submitInstallmentModal.amount ? (
                  <div className="p-2.5 bg-rose-50 border border-rose-200 rounded-xl text-rose-700 text-[11px] font-medium">
                    ⚠️ Insufficient wallet balance (₹{userProfile.balance || 0}). Kripya wallet me paise add karein ya "UPI QR / Proof" option chunein.
                  </div>
                ) : (
                  <p className="text-[11px] text-gray-500">
                    Aapke Primary Wallet se ₹{submitInstallmentModal.amount} turant debit honge aur installment PAID mark ho jayegi.
                  </p>
                )}

                <button
                  type="button"
                  disabled={(userProfile.balance || 0) < submitInstallmentModal.amount}
                  onClick={submitInstallmentProof}
                  className="w-full py-3 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white rounded-xl font-bold text-xs shadow-md shadow-blue-500/20 active:scale-95 transition disabled:opacity-50 cursor-pointer"
                >
                  Pay ₹{submitInstallmentModal.amount} from Wallet →
                </button>
              </div>
            ) : (
              <form onSubmit={submitInstallmentProof} className="space-y-3.5">
                {/* UPI QR & Bank Instruction */}
                <div className="p-3 bg-indigo-50/70 border border-indigo-200 rounded-2xl space-y-1.5 text-xs text-indigo-950">
                  <p className="font-bold">📱 Pay via Any UPI App (GPay, PhonePe, Paytm):</p>
                  <p className="text-[11px] text-indigo-800">
                    Aap company ke official UPI ya QR code par ₹{submitInstallmentModal.amount} transfer karein. Payment hone ke baad 12-digit UTR number aur screenshot yahan submit karein.
                  </p>
                </div>

                {/* UTR Input */}
                <div>
                  <label className="block text-[11px] font-bold text-gray-700 mb-1">
                    UTR / Transaction Reference Number <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. 423589123456 (12 Digits)"
                    value={installmentUtr}
                    onChange={(e) => setInstallmentUtr(e.target.value.trim())}
                    className="w-full px-3.5 py-2.5 bg-white border border-gray-200 rounded-xl font-mono text-xs focus:ring-2 focus:ring-blue-500 outline-none uppercase"
                  />
                </div>

                {/* Screenshot Upload */}
                <div>
                  <label className="block text-[11px] font-bold text-gray-700 mb-1">
                    Payment Screenshot / Receipt <span className="text-rose-500">*</span>
                  </label>
                  <label className="cursor-pointer py-2.5 px-3 bg-white hover:bg-gray-50 border border-dashed border-indigo-300 rounded-xl text-xs text-indigo-700 font-bold flex items-center justify-center gap-2 transition active:scale-95">
                    <span>📄</span>
                    <span className="truncate">{installmentProofName || "Upload Receipt Screenshot"}</span>
                    <input
                      type="file"
                      accept="image/*"
                      onChange={handleInstallmentProofUpload}
                      className="hidden"
                    />
                  </label>
                  {installmentProofUrl && (
                    <div className="mt-2 p-2 bg-gray-50 border border-gray-200 rounded-xl flex items-center gap-2.5">
                      <img src={installmentProofUrl} alt="Receipt Preview" className="w-10 h-10 object-cover rounded-lg border border-gray-200" />
                      <div className="text-[11px] text-gray-600 truncate flex-1">
                        <span className="font-bold text-gray-800 block truncate">{installmentProofName || "Receipt"}</span>
                        <span className="text-emerald-600 font-bold">✓ Ready to submit</span>
                      </div>
                    </div>
                  )}
                </div>

                <div className="flex gap-2.5 pt-2">
                  <button
                    type="button"
                    onClick={() => setSubmitInstallmentModal(null)}
                    className="flex-1 py-3 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-xl font-bold text-xs transition cursor-pointer"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={installmentSubmitting}
                    className="flex-1 py-3 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700 text-white rounded-xl font-bold text-xs shadow-md shadow-emerald-500/20 active:scale-95 transition disabled:opacity-50 cursor-pointer"
                  >
                    {installmentSubmitting ? "Submitting..." : "Submit Proof →"}
                  </button>
                </div>
              </form>
            )}
          </div>
        </Sheet>
      )}

      {/* FULLSCREEN DOCUMENT LIGHTBOX WITH INTERACTIVE ZOOM & PAN */}
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
              <span className="truncate">Document Viewer</span>
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

      <Toast msg={toast} onHide={() => setToast({ text: "", type: "" })} />

      <BottomNav items={navItems} active={navTab} onChange={setNavTab} />
    </div>
  );
}
