import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import QRCode from "qrcode";
import { Html5Qrcode } from "html5-qrcode";
import Sheet from "./components/Sheet";
import Toast from "./components/Toast";
import StatusBadge from "./components/StatusBadge";
import BottomNav from "./components/BottomNav";
import FloatingCuteRobotAdvisor from "./components/FloatingCuteRobotAdvisor";

import { API } from "./config";
import { tokenStorage } from "./utils/tokenStorage";

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
    appTitle: "Educa Fintech",
    scanQr: "Scan QR",
    voiceGuide: "Voice Guide",
    listening: "Bol raha hai...",
    profitWallet: "Profit Wallet",
    profitYield: "1% Monthly Daily Yield & 365d Bonds",
    duesWallet: "Dues Wallet",
    duesClear: "No Active Dues • All Clear (₹0)",
    duesPending: "Pending Easy Installments & upcoming collections",
    tenDayCycle: "10-Day Cycle (1st, 11th, 21st)",
    historyBonds: "History & Bonds →",
    payInstallment: "Pay Installment →",
    viewDetails: "View Details →",
    scanAnyQr: "Scan Any QR Code",
    cameraGallery: "Camera Scanner & Gallery Upload",
    instantP2p: "Instant P2P & Merchant Pay",
    sendMoney: "Send Money",
    myQrCode: "My QR Code",
    addMoney: "Add Money",
    cashOut: "Cash Out",
    primaryBalance: "Primary Wallet Balance",
    checkBalance: "Check Balance",
    hide: "Hide",
    cardsAndVip: "My Educa Cards & VIP",
    cardsSubtitle: "Silver Debit & Platinum VIP Criteria",
    appTour: "App Feature Tour",
    passbookHistory: "View Wallet Amount & Passbook History",
    passbookSub: "Check balance, incoming & outgoing transactions",
    resetPin: "Change / Reset 6-Digit Wallet PIN",
    logout: "Log Out",
    settings: "Settings",
    activeAccount: "Active Account",
    lifetimeId: "LIFETIME",
    copyId: "Copy ID",
    copied: "✓ Copied",
    skipTour: "Skip Tour",
    next: "Next →",
    finish: "Got It, Let's Go! 🚀",
    back: "← Back",
    // Bank Passbook Details
    bankCardTitle: "Educa Fintech Digital Bank",
    bankCardSub: "Official Digital Banking & Passbook",
    branchName: "Jhalwa Branch, Prayagraj",
    accountNumberLabel: "Account Number",
    ifscLabel: "IFSC Code",
    upiIdLabel: "App UPI ID",
    copy: "Copy",
    shareBankDetails: "Share Bank & UPI Details",
    shareSuccess: "Bank details copy ho gaye!",
    sendMoneyPlaceholder: "Phone number, Account No (EFS0000XXX), ya UPI ID (@educa)",
    accountsHubTitle: "6 Modular Accounts Hub",
    accountsHubSub: "Sabhi accounts ka pura data dekhne ke liye card par click karein",
    openAccount: "Open Account →",
    walletAccount: "Wallet Account",
    debtAccount: "Debt & Bond Account",
    lendingAccount: "Lending Account",
    personalLoanAccount: "Personal Loan Account",
    studentLoanAccount: "Student Loan Account",
    businessLoanAccount: "Micro Business Loan Account",
    navHome: "Home",
    navLoans: "Loans",
    navScan: "Scan QR",
    navBonds: "Bonds",
    navProfile: "Profile",
  },
  hindi: {
    appTitle: "एड्युका फिनटेक",
    scanQr: "QR स्कैन",
    voiceGuide: "आवाज़ गाइड",
    listening: "बोल रहा है...",
    profitWallet: "प्रॉफ़िट वॉलेट",
    profitYield: "1% मासिक दैनिक यील्ड और 365 दिन बॉन्ड",
    duesWallet: "देय राशि (Dues)",
    duesClear: "कोई देय राशि नहीं • पूर्ण भुगतान (₹0)",
    duesPending: "लंबित आसान किश्तें और आगामी वसूली",
    tenDayCycle: "10-दिवसीय चक्र (1, 11, 21 तारीख)",
    historyBonds: "इतिहास और बॉन्ड्स →",
    payInstallment: "किश्त भुगतान करें →",
    viewDetails: "विवरण देखें →",
    scanAnyQr: "कोई भी QR कोड स्कैन करें",
    cameraGallery: "कैमरा स्कैनर व गैलरी से अपलोड",
    instantP2p: "त्वरित P2P और मर्चेंट भुगतान",
    sendMoney: "पैसे भेजें",
    myQrCode: "मेरा QR कोड",
    addMoney: "पैसे जोड़ें",
    cashOut: "निकासी करें",
    primaryBalance: "प्राइमरी वॉलेट बैलेंस",
    checkBalance: "बैलेंस देखें",
    hide: "छिपाएं",
    cardsAndVip: "मेरे एड्युका कार्ड्स व VIP",
    cardsSubtitle: "सिल्वर डेबिट और प्लैटिनम VIP की शर्तें",
    appTour: "ऐप फ़ीचर टूर गाइड",
    passbookHistory: "वॉलेट राशि व पासबुक इतिहास देखें",
    passbookSub: "बैलेंस और लेन-देन का पूरा विवरण",
    resetPin: "6-अंकों का पिन बदलें / रीसेट करें",
    logout: "लॉग आउट",
    settings: "सेटिंग्स",
    activeAccount: "सक्रिय खाता",
    lifetimeId: "लाइफटाइम",
    copyId: "ID कॉपी करें",
    copied: "✓ कॉपी हुआ",
    skipTour: "टूर छोड़ें",
    next: "आगे →",
    finish: "समझ गया, शुरू करें! 🚀",
    back: "← पीछे",
    // Bank Passbook Details
    bankCardTitle: "एड्युका फिनटेक डिजिटल बैंक",
    bankCardSub: "आधिकारिक डिजिटल बैंकिंग व पासबुक",
    branchName: "झलवा शाखा, प्रयागराज",
    accountNumberLabel: "खाता संख्या",
    ifscLabel: "IFSC कोड",
    upiIdLabel: "ऐप UPI ID",
    copy: "कॉपी",
    shareBankDetails: "बैंक व UPI विवरण शेयर करें",
    shareSuccess: "बैंक विवरण कॉपी हो गया!",
    sendMoneyPlaceholder: "फ़ोन नंबर, खाता संख्या (EFS0000XXX), या UPI ID (@educa)",
    accountsHubTitle: "6 मॉड्यूलर खाता हब",
    accountsHubSub: "सभी खातों का पूरा डेटा देखने के लिए कार्ड पर क्लिक करें",
    openAccount: "खाता खोलें →",
    walletAccount: "वॉलेट खाता",
    debtAccount: "ऋण व बॉन्ड खाता",
    lendingAccount: "लेंडिंग खाता",
    personalLoanAccount: "पर्सनल लोन खाता",
    studentLoanAccount: "छात्र लोन खाता",
    businessLoanAccount: "माइक्रो बिजनेस लोन खाता",
    navHome: "होम",
    navLoans: "लोन",
    navScan: "QR स्कैन",
    navBonds: "बॉन्ड्स",
    navProfile: "प्रोफ़ाइल",
  },
  english: {
    appTitle: "Educa Fintech",
    scanQr: "Scan QR",
    voiceGuide: "Voice Guide",
    listening: "Speaking...",
    profitWallet: "Profit Wallet",
    profitYield: "1% Monthly Daily Yield & 365d Bonds",
    duesWallet: "Dues Wallet",
    duesClear: "No Active Dues • All Clear (₹0)",
    duesPending: "Pending Easy Installments & upcoming collections",
    tenDayCycle: "10-Day Cycle (1st, 11th, 21st)",
    historyBonds: "History & Bonds →",
    payInstallment: "Pay Installment →",
    viewDetails: "View Details →",
    scanAnyQr: "Scan Any QR Code",
    cameraGallery: "Camera Scanner & Gallery Upload",
    instantP2p: "Instant P2P & Merchant Pay",
    sendMoney: "Send Money",
    myQrCode: "My QR Code",
    addMoney: "Add Money",
    cashOut: "Cash Out",
    primaryBalance: "Primary Wallet Balance",
    checkBalance: "Check Balance",
    hide: "Hide",
    cardsAndVip: "My Educa Cards & VIP",
    cardsSubtitle: "Silver Debit & Platinum VIP Criteria",
    appTour: "App Feature Tour",
    passbookHistory: "View Wallet Amount & Passbook History",
    passbookSub: "Check balance, incoming & outgoing transactions",
    resetPin: "Change / Reset 6-Digit Wallet PIN",
    logout: "Log Out",
    settings: "Settings",
    activeAccount: "Active Account",
    lifetimeId: "LIFETIME",
    copyId: "Copy ID",
    copied: "✓ Copied",
    skipTour: "Skip Tour",
    next: "Next →",
    finish: "Got It, Let's Go! 🚀",
    back: "← Back",
    // Bank Passbook Details
    bankCardTitle: "Educa Fintech Digital Bank",
    bankCardSub: "Official Digital Banking & Passbook",
    branchName: "Jhalwa Branch, Prayagraj",
    accountNumberLabel: "Account Number",
    ifscLabel: "IFSC Code",
    upiIdLabel: "App UPI ID",
    copy: "Copy",
    shareBankDetails: "Share Bank & UPI Details",
    shareSuccess: "Bank details copied to clipboard!",
    sendMoneyPlaceholder: "Phone number, Account No (EFS0000XXX), or UPI ID (@educa)",
    accountsHubTitle: "6 Modular Accounts Hub",
    accountsHubSub: "Click any card to inspect full account details & transactions",
    openAccount: "Open Account →",
    walletAccount: "Wallet Account",
    debtAccount: "Debt & Bond Account",
    lendingAccount: "Lending Account",
    personalLoanAccount: "Personal Loan Account",
    studentLoanAccount: "Student Loan Account",
    businessLoanAccount: "Micro Business Loan Account",
    navHome: "Home",
    navLoans: "Loans",
    navScan: "Scan QR",
    navBonds: "Bonds",
    navProfile: "Profile",
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
  const navigate = useNavigate();
  const token = tokenStorage.getToken();
  const userStored = JSON.parse(localStorage.getItem("user") || "{}");
  useEffect(() => { if (!token) window.location.href = "/"; }, [token]);

  const headers = { "Content-Type": "application/json", Authorization: `Bearer ${token}` };
  const [balance, setBalance] = useState(() => {
    const cached = localStorage.getItem("educa_cached_balance");
    return cached !== null ? Number(cached) : (userStored.balance || 0);
  });
  const [cachedProfitBalance, setCachedProfitBalance] = useState(() => {
    const cached = localStorage.getItem("educa_cached_profit_balance");
    return cached !== null ? Number(cached) : Number(userStored.profitBalance || 0);
  });
  const [loadingDashboard, setLoadingDashboard] = useState(!localStorage.getItem("educa_cached_profile"));
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
  const [copiedField, setCopiedField] = useState(null);
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
  const [qrDataUrl, setQrDataUrl] = useState("");
  const [qrTab, setQrTab] = useState("fintech"); // "fintech" | "custom"
  const [customQrUrl, setCustomQrUrl] = useState(() => {
    try {
      const uId = userStored?.id || userStored?._id || "guest";
      return localStorage.getItem(`educa_custom_qr_${uId}`) || "";
    } catch { return ""; }
  });
  const [customQrUpi, setCustomQrUpi] = useState(() => {
    try {
      const uId = userStored?.id || userStored?._id || "guest";
      return localStorage.getItem(`educa_custom_upi_${uId}`) || "";
    } catch { return ""; }
  });
  const [customQrApp, setCustomQrApp] = useState(() => {
    try {
      const uId = userStored?.id || userStored?._id || "guest";
      return localStorage.getItem(`educa_custom_app_${uId}`) || "Google Pay / PhonePe";
    } catch { return "Google Pay / PhonePe"; }
  });
  const [customQrUploadDraft, setCustomQrUploadDraft] = useState("");
  const [customQrUpiDraft, setCustomQrUpiDraft] = useState("");
  const [customQrAppDraft, setCustomQrAppDraft] = useState("Google Pay");
  const [savingCustomQr, setSavingCustomQr] = useState(false);
  const [editLoanLimitCustomer, setEditLoanLimitCustomer] = useState(null);
  const [editLimitVal, setEditLimitVal] = useState("");
  const [updatingLimit, setUpdatingLimit] = useState(false);

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
  const [installmentProofBackUrl, setInstallmentProofBackUrl] = useState("");
  const [installmentProofBackName, setInstallmentProofBackName] = useState("");
  const [installmentSubmitting, setInstallmentSubmitting] = useState(false);
  const [installmentPayMethod, setInstallmentPayMethod] = useState("wallet");
  const [installmentSourceWallet, setInstallmentSourceWallet] = useState("main");
  const [advisorLang, setAdvisorLang] = useState("hinglish");
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
  const [appLocked, setAppLocked] = useState(() => Boolean(tokenStorage.getToken() && localStorage.getItem("hasWalletPin") === "true"));
  const [appLockPin, setAppLockPin] = useState("");
  const [appLockError, setAppLockError] = useState("");
  const [appLockLoading, setAppLockLoading] = useState(false);

  // Profit Compounding & Transfer State
  const [transferringProfit, setTransferringProfit] = useState(false);

  // Agent Performance Dashboard State
  const [agentMetrics, setAgentMetrics] = useState(null);
  const [loadingAgentMetrics, setLoadingAgentMetrics] = useState(false);
  const [agentCustomerSearch, setAgentCustomerSearch] = useState("");
  const [agentBroadcastModalOpen, setAgentBroadcastModalOpen] = useState(false);
  const [broadcastMessage, setBroadcastMessage] = useState("");
  const [broadcastTitle, setBroadcastTitle] = useState("");
  const [broadcastSending, setBroadcastSending] = useState(false);
  const [addCustomerModalOpen, setAddCustomerModalOpen] = useState(false);
  const [newCustomerForm, setNewCustomerForm] = useState({ name: "", phone: "", email: "", password: "12345678" });
  const [submittingCustomer, setSubmittingCustomer] = useState(false);

  const getAdvisorGreeting = (l = "hinglish") => {
    if (l === "english") {
      return "Hello! What would you like to know? Are you facing any issue or do you need assistance?\n\nYou can ask anything regarding Loans, EMI calculations, 12% Interest, Deposits, or your Account.";
    }
    return "Namaste! Aapko kya poochna hai? Kya aapko kisi cheez me koi dikkat ya pareshani hai?\n\nAap mujhse Loan, EMI hisaab, 12% Byaj (Interest), Deposit ya Account se juda koi bhi sawaal pooch sakte hain.";
  };

  // AI Financial Advisor Agent State
  const [showAiAdvisor, setShowAiAdvisor] = useState(false);
  const [advisorInput, setAdvisorInput] = useState("");
  const [advisorMessages, setAdvisorMessages] = useState([
    {
      sender: "ai",
      text: "Namaste! Aapko kya poochna hai? Kya aapko kisi cheez me koi dikkat ya pareshani hai?\n\nAap mujhse Loan, EMI hisaab, 12% Byaj (Interest), Deposit ya Account se juda koi bhi sawaal pooch sakte hain.",
      time: "Just now"
    }
  ]);

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
  const [langDropdownOpen, setLangDropdownOpen] = useState(false);
  const langDropdownRef = useRef(null);
  const [isSpeaking, setIsSpeaking] = useState(false);

  useEffect(() => {
    const handleOutsideClick = (e) => {
      if (langDropdownRef.current && !langDropdownRef.current.contains(e.target)) {
        setLangDropdownOpen(false);
      }
    };
    if (langDropdownOpen) {
      document.addEventListener("mousedown", handleOutsideClick);
      document.addEventListener("touchstart", handleOutsideClick);
    }
    return () => {
      document.removeEventListener("mousedown", handleOutsideClick);
      document.removeEventListener("touchstart", handleOutsideClick);
    };
  }, [langDropdownOpen]);

  // Guided Feature Tour State
  const [showTour, setShowTour] = useState(false);
  const [tourStep, setTourStep] = useState(0);

  const txt = UI_TEXT[lang] || UI_TEXT.hinglish;

  const [depForm, setDepForm] = useState({ amount: "", method: "upi", utrNumber: "", proofUrl: "", proofName: "" });
  const [depositDetails, setDepositDetails] = useState({
    upiId: "educafinance@upi",
    upiName: "Educa Finance & Payments",
    accountNumber: "5010045239128",
    ifsc: "BARB0JHALWA",
    bankName: "Bank of Baroda",
    branch: "Jhalwa Branch, Prayagraj",
    accountHolder: "Educa Fintech Admin",
    instructions: "Payment complete karne ke baad 12-digit UTR / Ref Number enter karke Submit karein."
  });
  const [copiedDepField, setCopiedDepField] = useState("");
  const [wdForm, setWdForm] = useState({ amount: "", method: "upi", upiId: "", accountNumber: "", ifsc: "", sourceWallet: "main" });
  
  // P2P Transfer & 6-Digit UPI PIN Intercept State
  const [sendForm, setSendForm] = useState({ recipient: "", amount: "", notes: "", pin: "", sourceWallet: "main" });
  const [isSendingMoney, setIsSendingMoney] = useState(false);
  const [recipientInfo, setRecipientInfo] = useState(null);
  const [lookingUp, setLookingUp] = useState(false);
  const [lookupError, setLookupError] = useState("");
  const [pendingPinAction, setPendingPinAction] = useState(null);
  const pendingPinActionRef = useRef(null);
  useEffect(() => {
    pendingPinActionRef.current = pendingPinAction;
  }, [pendingPinAction]);

  // Personal Loan Application State (₹5k-₹100k, 15-30 Easy Installments, 1.34% or 1.0% per installment)
  const [loanForm, setLoanForm] = useState({
    amount: 5000,
    hasChequeFacility: true,
    chequeNumber: "",
    chequeUrl: "",
    chequeBackUrl: "",
    installmentsCount: 15,
    useSpecialRate: false,
    purpose: "Personal Needs",
    aadharNumber: "",
    aadharUrl: "",
    aadharBackUrl: "",
    doc1Url: "",
    doc1BackUrl: "",
    panNumber: "",
    panUrl: "",
    panBackUrl: "",
    doc2Url: "",
    doc2BackUrl: "",
    bankName: "",
    bankAccountNumber: "",
    bankIfsc: "",
    upiId: "",
    nomineeName: "",
    nomineeRelation: "Father",
    nomineePhone: "",
    email: "",
    phone: ""
  });

  // Micro Business Loan State (Daily collection: 60d@18%, 80d@24%, 100d@30%, 120d@36%)
  const [mblForm, setMblForm] = useState({
    amount: 5000,
    days: 60,
    purpose: "Shop Inventory & Working Capital",
    businessName: "",
    hasChequeFacility: true,
    chequeNumber: "",
    chequeUrl: "",
    chequeBackUrl: "",
    aadharNumber: "",
    aadharUrl: "",
    aadharBackUrl: "",
    doc1Url: "",
    doc1BackUrl: "",
    panNumber: "",
    panUrl: "",
    panBackUrl: "",
    doc2Url: "",
    doc2BackUrl: "",
    bankName: "",
    bankAccountNumber: "",
    bankIfsc: "",
    upiId: "",
    nomineeName: "",
    nomineeRelation: "Father",
    nomineePhone: "",
    email: "",
    phone: ""
  });

  // Student Loan Application State (Subsidized: 8% p.a., 15-30 Easy Installments)
  const [studentLoanForm, setStudentLoanForm] = useState({
    amount: 5000,
    installmentsCount: 15,
    instituteName: "",
    purpose: "School & College Fee",
    hasChequeFacility: true,
    chequeNumber: "",
    chequeUrl: "",
    chequeBackUrl: "",
    aadharNumber: "",
    aadharUrl: "",
    aadharBackUrl: "",
    doc1Url: "",
    doc1BackUrl: "",
    panNumber: "",
    panUrl: "",
    panBackUrl: "",
    doc2Url: "",
    doc2BackUrl: "",
    studentProofUrl: "",
    studentProofBackUrl: "",
    bankName: "",
    bankAccountNumber: "",
    bankIfsc: "",
    upiId: "",
    nomineeName: "",
    nomineeRelation: "Father",
    nomineePhone: "",
    email: "",
    phone: ""
  });

  // Bond Multi-unit Selectors (1L, 2L, 3L etc.)
  const [debitBondUnits, setDebitBondUnits] = useState(1);
  const [lendingBondUnits, setLendingBondUnits] = useState(1);

  // Lending Bond Selection (40 or 80 months)
  const [lendingBondType, setLendingBondType] = useState("lending_40");
  const [lendingForm, setLendingForm] = useState({
    aadharNumber: "",
    aadharUrl: "",
    aadharBackUrl: "",
    doc1Url: "",
    doc1BackUrl: "",
    panNumber: "",
    panUrl: "",
    panBackUrl: "",
    doc2Url: "",
    doc2BackUrl: "",
    chequeNumber: "",
    chequeUrl: "",
    chequeBackUrl: "",
    bankName: "",
    bankAccountNumber: "",
    bankIfsc: "",
    upiId: "",
    nomineeName: "",
    nomineeRelation: "Father",
    nomineePhone: "",
    email: "",
    phone: ""
  });

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
    doc1BackName: "",
    doc1BackUrl: "",
    doc2Type: "pan", // 'pan' or 'cheque'
    panNumber: "",
    chequeNumber: "",
    doc2Name: "",
    doc2Url: "",
    doc2BackName: "",
    doc2BackUrl: "",
    address: ""
  });
  const [kycSubmitting, setKycSubmitting] = useState(false);
  const [kycError, setKycError] = useState("");

  // Auto-dismiss KYC red error message after 4 seconds
  useEffect(() => {
    if (!kycError) return;
    const t = setTimeout(() => setKycError(""), 4000);
    return () => clearTimeout(t);
  }, [kycError]);

  // Clear KYC error immediately whenever user touches or modifies any form field
  useEffect(() => {
    if (kycError) setKycError("");
  }, [kycForm]);

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

  useEffect(() => {
    try {
      if (window.AndroidNotification?.requestPermission) {
        window.AndroidNotification.requestPermission();
      } else if ("Notification" in window && Notification.permission === "default") {
        Notification.requestPermission();
      }
    } catch {}
  }, []);

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
    setLightboxImg(null);
    setSubmitInstallmentModal(null);
    setAgentBroadcastModalOpen(false);
    setShowLoans(false);
  };

  // Intercept Android Hardware Back Button & Step-by-Step Back Navigation
  useEffect(() => {
    let lastTap = 0;
    window.handleAndroidBackPressed = (hasDirtyInputs) => {
      // 1. If an input or textarea is currently focused, blur it and dismiss keyboard without closing screen!
      const active = document.activeElement;
      if (active && (active.tagName === "INPUT" || active.tagName === "TEXTAREA" || active.isContentEditable)) {
        active.blur();
        return "keyboard_dismissed";
      }

      // Check if modal has any text inputs filled
      const modalContainer = document.querySelector(".fixed.inset-0, [role='dialog']");
      let inputsFilled = hasDirtyInputs;
      if (modalContainer) {
        const inputs = modalContainer.querySelectorAll("input:not([type=hidden]):not([type=checkbox]):not([type=radio]), textarea");
        for (const input of inputs) {
          if (input.value && input.value.trim().length > 0) {
            inputsFilled = true;
            break;
          }
        }
      }

      // 2. Lightbox open
      if (lightboxImg) {
        setLightboxImg(null);
        return true;
      }

      // 3. AI Advisor Sheet open
      if (showAiAdvisor) {
        setShowAiAdvisor(false);
        return true;
      }

      // 4. Any overlay / modal / sheet open
      const isOverlayOpen = Boolean(
        modal ||
        accountModal ||
        showLoans ||
        showTour ||
        activeLoanDetails ||
        submitInstallmentModal ||
        agentBroadcastModalOpen ||
        addCustomerModalOpen ||
        editLoanLimitCustomer
      );

      if (isOverlayOpen) {
        if (inputsFilled) {
          const now = Date.now();
          if (now - lastTap > 2500) {
            lastTap = now;
            setToast({ text: "⚠️ Form me details bhari hui hain. Dobara back dabayein band karne ke liye.", type: "info" });
            return "dirty_prevented";
          }
        }
        closeModal();
        setShowTour(false);
        setActiveLoanDetails(null);
        setSubmitInstallmentModal(null);
        setAgentBroadcastModalOpen(false);
        setAddCustomerModalOpen(false);
        setEditLoanLimitCustomer(null);
        return true;
      }

      // 5. If in QR custom tab, step back to fintech QR
      if (qrTab === "custom") {
        setQrTab("fintech");
        return true;
      }

      // 6. If in card non-default tab, step back to debit card
      if (cardTab !== "debit") {
        setCardTab("debit");
        return true;
      }

      // 7. If in any sub navigation tab ('cards', 'loans', 'profile', 'passbook' etc.), step back to 'home'
      if (navTab !== "home") {
        setNavTab("home");
        return true;
      }

      // 8. If on root Dashboard home with nothing open, return false so Android prompts exit confirmation
      return false;
    };

    window.forceDismissActiveModal = () => {
      closeModal();
      setShowTour(false);
      setShowAiAdvisor(false);
      setActiveLoanDetails(null);
      setSubmitInstallmentModal(null);
      setAgentBroadcastModalOpen(false);
      setAddCustomerModalOpen(false);
      setEditLoanLimitCustomer(null);
      setLightboxImg(null);
    };

    return () => {
      window.handleAndroidBackPressed = null;
      window.forceDismissActiveModal = null;
    };
  }, [
    modal,
    accountModal,
    showLoans,
    showTour,
    lightboxImg,
    showAiAdvisor,
    activeLoanDetails,
    submitInstallmentModal,
    agentBroadcastModalOpen,
    addCustomerModalOpen,
    editLoanLimitCustomer,
    qrTab,
    cardTab,
    navTab
  ]);

  useEffect(() => {
    const isOverlayOpen = Boolean(modal || accountModal || showLoans || lightboxImg || submitInstallmentModal || agentBroadcastModalOpen || addCustomerModalOpen);
    if (isOverlayOpen) {
      window.history.pushState({ educaSheetOpen: true }, "");
      const onPopState = () => {
        // Guard against losing dirty form on popstate
        const modalContainer = document.querySelector(".fixed.inset-0, [role='dialog']");
        let inputsFilled = false;
        if (modalContainer) {
          const inputs = modalContainer.querySelectorAll("input:not([type=hidden]):not([type=checkbox]):not([type=radio]), textarea");
          for (const input of inputs) {
            if (input.value && input.value.trim().length > 0) {
              inputsFilled = true;
              break;
            }
          }
        }
        if (inputsFilled) {
          // Re-push state so user doesn't get evicted, show warning
          window.history.pushState({ educaSheetOpen: true }, "");
          setToast({ text: "⚠️ Form me details bhari hui hain. Band karne ke liye Cancel button dabayein.", type: "info" });
          return;
        }
        closeModal();
      };
      window.addEventListener("popstate", onPopState);
      return () => {
        window.removeEventListener("popstate", onPopState);
      };
    }
  }, [modal, accountModal, showLoans, lightboxImg, submitInstallmentModal, agentBroadcastModalOpen]);

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
      const nextAction = pendingPinActionRef.current;
      setPendingPinAction(null);
      if (nextAction?.type === "passbook") {
        setModal("passbook");
      } else if (nextAction?.type === "wallet") {
        setModal(null);
        setAccountModal("wallet");
      } else if (nextAction?.type === "send_money") {
        setModal("send_money");
      } else {
        setModal(null);
      }
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
          setUserProfile(prev => ({
            ...prev,
            profitBalance: data.profitBalance,
            balance: data.balance !== undefined ? data.balance : prev.balance
          }));
        }
        if (data.balance !== undefined) {
          setBalance(data.balance);
          localStorage.setItem("educa_cached_balance", String(data.balance));
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

  const handleOpenPassbook = () => {
    setPinError("");
    setPinInput("");
    setConfirmPinInput("");
    if (!userProfile.hasWalletPin) {
      showToast("Kripya pehle 6-digit UPI PIN set karein", "info");
      setPendingPinAction({ type: "passbook" });
      setPinSetupMode(true);
      setModal("wallet_pin");
    } else if (!balanceRevealed) {
      setPendingPinAction({ type: "passbook" });
      setPinSetupMode(false);
      setModal("wallet_pin");
      if (window.AndroidBiometric?.isBiometricAvailable && window.AndroidBiometric.isBiometricAvailable()) {
        setTimeout(() => {
          triggerBiometricAuth();
        }, 200);
      }
    } else {
      setModal("passbook");
    }
  };

  const handleOpenWalletAccount = () => {
    setPinError("");
    setPinInput("");
    setConfirmPinInput("");
    if (!userProfile.hasWalletPin) {
      showToast("Kripya pehle 6-digit UPI PIN set karein", "info");
      setPendingPinAction({ type: "wallet" });
      setPinSetupMode(true);
      setModal("wallet_pin");
    } else if (!balanceRevealed) {
      setPendingPinAction({ type: "wallet" });
      setPinSetupMode(false);
      setModal("wallet_pin");
      if (window.AndroidBiometric?.isBiometricAvailable && window.AndroidBiometric.isBiometricAvailable()) {
        setTimeout(() => {
          triggerBiometricAuth();
        }, 200);
      }
    } else {
      setAccountModal("wallet");
    }
  };

  const handleOpenSendMoney = () => {
    requireKyc(() => {
      if (!userProfile.hasWalletPin) {
        showToast("Kripya pehle 6-digit UPI PIN set karein", "info");
        setPendingPinAction({ type: "send_money" });
        setPinSetupMode(true);
        setPinError("");
        setPinInput("");
        setConfirmPinInput("");
        setModal("wallet_pin");
      } else {
        setModal("send_money");
      }
    });
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
          localStorage.setItem("hasWalletPin", "true");
          setBalanceRevealed(true);
          const nextAction = pendingPinActionRef.current;
          setPendingPinAction(null);
          if (nextAction?.type === "passbook") {
            setModal("passbook");
          } else if (nextAction?.type === "wallet") {
            setModal(null);
            setAccountModal("wallet");
          } else if (nextAction?.type === "send_money") {
            setModal("send_money");
          } else {
            setModal(null);
          }
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
          const nextAction = pendingPinActionRef.current;
          setPendingPinAction(null);
          if (nextAction?.type === "passbook") {
            setModal("passbook");
          } else if (nextAction?.type === "wallet") {
            setModal(null);
            setAccountModal("wallet");
          } else if (nextAction?.type === "send_money") {
            setModal("send_money");
          } else {
            setModal(null);
          }
          showToast("Wallet & Passbook Unlocked!", "success");
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
    if (!userProfile.hasWalletPin) {
      showToast("Kripya pehle 6-digit UPI PIN set karein", "info");
      setPendingPinAction({ type: "send_money" });
      setPinSetupMode(true);
      setPinError("");
      setPinInput("");
      setConfirmPinInput("");
      setModal("wallet_pin");
    } else {
      setModal("send_money");
      showToast(name ? `QR Scanned: ${name}` : `QR Scanned: ${recipient}`, "success");
    }
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

  const userUniqueId = userProfile.accountNumber || (userProfile._id ? `EDUCA-${String(userProfile._id).slice(-8).toUpperCase()}` : (userStored._id || userStored.id ? `EDUCA-${String(userStored._id || userStored.id).slice(-8).toUpperCase()}` : "EDUCA-MEMBER"));

  const isAgent = Boolean(
    userProfile.role === "agent" ||
    userStored.role === "agent" ||
    userProfile.agentProfile?.status === "approved"
  );

  // 5-Day Due Date Alert Calculation: checks active loans for any installment with daysLeft <= 5
  const upcomingDueInstallment = useMemo(() => {
    if (!loans || loans.length === 0) return null;
    const now = Date.now();
    let soonest = null;

    for (const l of loans) {
      if (l.status !== "active") continue;
      const schedule = (l.installmentSchedule && l.installmentSchedule.length > 0) ? l.installmentSchedule : (l.emiSchedule || []);
      for (const inst of schedule) {
        if (inst.status === "pending" || inst.status === "overdue") {
          const dueDate = inst.dueDate ? new Date(inst.dueDate).getTime() : null;
          if (!dueDate) continue;
          const diffDays = Math.ceil((dueDate - now) / (1000 * 60 * 60 * 24));
          // If due within 5 days or overdue (diffDays <= 5)
          if (diffDays <= 5) {
            if (!soonest || diffDays < soonest.daysLeft) {
              soonest = {
                loan: l,
                installment: inst,
                daysLeft: diffDays,
                isOverdue: diffDays < 0,
                amount: inst.amount || l.installmentAmount || 0,
                dueDate: inst.dueDate,
                installmentNo: inst.installmentNo
              };
            }
          }
        }
      }
    }
    return soonest;
  }, [loans]);

  // Agent 1-Click Mass Broadcast Message
  const handleSendAgentBroadcast = async () => {
    if (!broadcastMessage.trim()) {
      setToast({ text: "Kripya broadcast message type karein", type: "error" });
      return;
    }
    setBroadcastSending(true);
    try {
      const res = await fetch(`${API}/user/agent/broadcast`, {
        method: "POST",
        headers,
        body: JSON.stringify({
          title: broadcastTitle.trim() || undefined,
          message: broadcastMessage.trim()
        })
      });
      const data = await res.json();
      if (res.ok) {
        setToast({ text: data.message || "Mass broadcast sabhi customers ko bhej diya gaya!", type: "success" });
        setAgentBroadcastModalOpen(false);
        setBroadcastMessage("");
        setBroadcastTitle("");
      } else {
        setToast({ text: data.message || "Broadcast bhejne me error aaya", type: "error" });
      }
    } catch {
      setToast({ text: "Network issue: Broadcast message send nahi ho saka", type: "error" });
    } finally {
      setBroadcastSending(false);
    }
  };

  const handleAgentAddCustomer = async (e) => {
    e.preventDefault();
    if (!newCustomerForm.name.trim()) {
      setToast({ text: "Customer name zaroori hai", type: "error" });
      return;
    }
    const cleanPhone = newCustomerForm.phone ? String(newCustomerForm.phone).trim() : "";
    if (!cleanPhone || !/^[6-9]\d{9}$/.test(cleanPhone)) {
      setToast({ text: "Valid 10-digit mobile number enter karein (6-9 se shuru)", type: "error" });
      return;
    }
    setSubmittingCustomer(true);
    try {
      const res = await fetch(`${API}/user/agent/add-customer`, {
        method: "POST",
        headers: { ...headers, "Content-Type": "application/json" },
        body: JSON.stringify(newCustomerForm)
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || "Customer add karne me error aaya");
      setToast({ text: data.message || "Customer safaltapoorvak link ho gaya!", type: "success" });
      setAddCustomerModalOpen(false);
      setNewCustomerForm({ name: "", phone: "", email: "", password: "12345678" });
      loadAgentMetrics();
    } catch (err) {
      setToast({ text: err.message, type: "error" });
    } finally {
      setSubmittingCustomer(false);
    }
  };

  const activeAccountNum = userProfile.accountNumber || "EFS0000001";
  const activeUpiId = userProfile.upiId || ((activeAccountNum).toLowerCase() + "@educa");

  // Generate QR Code matching App UPI ID & Digital Bank Passbook
  useEffect(() => {
    const upiUri = `upi://pay?pa=${encodeURIComponent(activeUpiId)}&pn=${encodeURIComponent(userProfile.name || userStored.name || "Educa Customer")}&cu=INR`;
    QRCode.toDataURL(upiUri, {
      width: 250,
      margin: 2,
      color: { dark: "#0A192F", light: "#ffffff" }
    })
      .then(url => setQrDataUrl(url))
      .catch(() => {});
  }, [activeUpiId, userProfile.name, userStored.name]);

  // Custom QR persistence (survives app reinstallation & backed up to user account)
  useEffect(() => {
    const uId = userProfile?._id || userStored?.id || userStored?._id;
    if (!uId) return;
    const localQr = localStorage.getItem(`educa_custom_qr_${uId}`);
    if (userProfile.customQrUrl && (!localQr || localQr !== userProfile.customQrUrl)) {
      try { localStorage.setItem(`educa_custom_qr_${uId}`, userProfile.customQrUrl); } catch (e) {}
      setCustomQrUrl(userProfile.customQrUrl);
    } else if (localQr && !customQrUrl) {
      setCustomQrUrl(localQr);
    }
    if (userProfile.customQrUpi) {
      try { localStorage.setItem(`educa_custom_upi_${uId}`, userProfile.customQrUpi); } catch (e) {}
      setCustomQrUpi(userProfile.customQrUpi);
    }
    if (userProfile.customQrApp) {
      try { localStorage.setItem(`educa_custom_app_${uId}`, userProfile.customQrApp); } catch (e) {}
      setCustomQrApp(userProfile.customQrApp);
    }
  }, [userProfile?._id, userProfile?.customQrUrl, userProfile?.customQrUpi, userProfile?.customQrApp]);

  const handleQrFilePick = (file) => {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement("canvas");
        let width = img.width;
        let height = img.height;
        const maxDim = 800;
        if (width > maxDim || height > maxDim) {
          if (width > height) {
            height = Math.round((height * maxDim) / width);
            width = maxDim;
          } else {
            width = Math.round((width * maxDim) / height);
            height = maxDim;
          }
        }
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext("2d");
        ctx.drawImage(img, 0, 0, width, height);
        const compressedBase64 = canvas.toDataURL("image/jpeg", 0.85);
        setCustomQrUploadDraft(compressedBase64);
      };
      img.src = e.target.result;
    };
    reader.readAsDataURL(file);
  };

  const handleSaveCustomQr = async (overrideDataUrl) => {
    const uId = userProfile?._id || userStored?.id || userStored?._id;
    const finalUrl = overrideDataUrl || customQrUploadDraft;
    const finalUpi = customQrUpiDraft.trim();
    const finalApp = customQrAppDraft.trim() || "Google Pay / PhonePe";

    if (!finalUrl) {
      alert("Kripya pehle QR code image upload karein!");
      return;
    }

    if (uId) {
      try {
        localStorage.setItem(`educa_custom_qr_${uId}`, finalUrl);
        if (finalUpi) localStorage.setItem(`educa_custom_upi_${uId}`, finalUpi);
        if (finalApp) localStorage.setItem(`educa_custom_app_${uId}`, finalApp);
      } catch (err) {}
    }

    setCustomQrUrl(finalUrl);
    setCustomQrUpi(finalUpi);
    setCustomQrApp(finalApp);
    setCustomQrUploadDraft("");

    setSavingCustomQr(true);
    try {
      const res = await fetch(`${API}/user/custom-qr`, {
        method: "POST",
        headers,
        body: JSON.stringify({
          customQrUrl: finalUrl,
          customQrUpi: finalUpi,
          customQrApp: finalApp
        })
      });
      if (res.ok) {
        setUserProfile(prev => ({
          ...prev,
          customQrUrl: finalUrl,
          customQrUpi: finalUpi,
          customQrApp: finalApp
        }));
      }
    } catch (e) {
      console.warn("Could not sync custom QR to server, saved in local device:", e);
    } finally {
      setSavingCustomQr(false);
    }
  };

  const handleRemoveCustomQr = async () => {
    const uId = userProfile?._id || userStored?.id || userStored?._id;
    if (uId) {
      try {
        localStorage.removeItem(`educa_custom_qr_${uId}`);
        localStorage.removeItem(`educa_custom_upi_${uId}`);
        localStorage.removeItem(`educa_custom_app_${uId}`);
      } catch (err) {}
    }
    setCustomQrUrl("");
    setCustomQrUpi("");
    setCustomQrApp("Google Pay");
    try {
      await fetch(`${API}/user/custom-qr`, { method: "DELETE", headers });
      setUserProfile(prev => ({ ...prev, customQrUrl: "", customQrUpi: "", customQrApp: "" }));
    } catch (e) {}
  };

  const handleUpdateCustomerLoanLimit = async () => {
    if (!editLoanLimitCustomer) return;
    const limitNum = Number(editLimitVal);
    if (!limitNum || limitNum < 5000 || limitNum > 100000) {
      alert("Valid loan limit dalein (₹5,000 se ₹1,00,000)");
      return;
    }
    setUpdatingLimit(true);
    try {
      const res = await fetch(`${API}/user/agent/update-loan-limit`, {
        method: "POST",
        headers,
        body: JSON.stringify({
          customerId: editLoanLimitCustomer.customerId,
          newLimit: limitNum
        })
      });
      const data = await res.json();
      if (res.ok) {
        alert(data.message || "Loan limit updated!");
        setAgentMetrics(prev => {
          if (!prev || !prev.customers) return prev;
          return {
            ...prev,
            customers: prev.customers.map(c =>
              (c.id === editLoanLimitCustomer.customerId || c._id === editLoanLimitCustomer.customerId)
                ? { ...c, loanLimit: limitNum }
                : c
            )
          };
        });
        setEditLoanLimitCustomer(null);
        setEditLimitVal("");
      } else {
        alert(data.message || "Loan limit update failed");
      }
    } catch (e) {
      alert("Failed to update limit");
    } finally {
      setUpdatingLimit(false);
    }
  };

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

  const loadAgentMetrics = useCallback(async () => {
    setLoadingAgentMetrics(true);
    try {
      const res = await fetch(`${API}/user/agent/stats`, { headers });
      const data = await res.json();
      if (res.ok && data) {
        setAgentMetrics(data);
      }
    } catch {}
    finally {
      setLoadingAgentMetrics(false);
    }
  }, [headers]);

  const loadDashboard = useCallback(async () => {
    try {
      const res = await fetch(`${API}/user/me`, { headers });
      if (res.status === 401) {
        tokenStorage.removeToken();
        localStorage.removeItem("user");
        localStorage.removeItem("educa_cached_profile");
        navigate("/login");
        return;
      }
      const data = await res.json();
      if (res.ok && data) {
        setUserProfile(data);
        localStorage.setItem("educa_cached_profile", JSON.stringify(data));
        // Keep user object in localStorage fresh and strictly preserve role
        const currentUser = JSON.parse(localStorage.getItem("user") || "{}");
        localStorage.setItem("user", JSON.stringify({ ...currentUser, ...data, role: data.role || currentUser.role }));
        setBalance(data.balance || 0);
        localStorage.setItem("educa_cached_balance", String(data.balance || 0));
        if (data.profitBalance !== undefined) {
          setCachedProfitBalance(Number(data.profitBalance));
          localStorage.setItem("educa_cached_profit_balance", String(data.profitBalance));
        }

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
        if (data.role === "agent" || data.agentProfile?.status === "approved") {
          loadAgentMetrics();
        }
      }
      loadTransactions();
      loadBonds();
      try {
        const depRes = await fetch(`${API}/settings/deposit-details`);
        const depData = await depRes.json();
        if (depData && depData.upiId) setDepositDetails(depData);
      } catch {}
    } catch {}
    finally {
      setLoadingDashboard(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (isAgent) {
      loadAgentMetrics();
    }
  }, [isAgent, loadAgentMetrics]);

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

    // Auto-refresh live balances every 15 seconds (only when app is in foreground to prevent Vivo Y20 crash)
    const interval = setInterval(() => {
      if (typeof document !== "undefined" && !document.hidden) {
        loadDashboard();
      }
    }, 15000);

    // Check if new user guided feature tour should run
    const tourDone = localStorage.getItem("educa_tour_completed");
    let tourTimer;
    if (!tourDone) {
      tourTimer = setTimeout(() => setShowTour(true), 1200);
    }
    return () => {
      clearInterval(interval);
      if (tourTimer) clearTimeout(tourTimer);
    };
  }, [loadDashboard]);

  // Clean up speech synthesis on component unmount
  useEffect(() => {
    return () => {
      if (typeof window !== "undefined" && "speechSynthesis" in window) {
        window.speechSynthesis.cancel();
      }
    };
  }, []);

  const activeCapital = Number(userProfile.balance ?? balance ?? 0);

  // Live Mini-Second Profit Stream for Users (Optimized for Vivo Y20 & budget Android devices)
  const [liveMs, setLiveMs] = useState(Date.now());
  const [userAnchorTime, setUserAnchorTime] = useState(() => Date.now());

  useEffect(() => {
    let timer = null;
    const startTimer = () => {
      if (timer) clearInterval(timer);
      if (activeCapital > 0 && typeof document !== "undefined" && !document.hidden) {
        timer = setInterval(() => {
          setLiveMs(Date.now());
        }, 50); // 50ms rapid real-time counter
      }
    };

    const handleVisibility = () => {
      if (document.hidden) {
        if (timer) clearInterval(timer);
      } else {
        setLiveMs(Date.now());
        startTimer();
      }
    };

    startTimer();
    document.addEventListener("visibilitychange", handleVisibility);
    return () => {
      if (timer) clearInterval(timer);
      document.removeEventListener("visibilitychange", handleVisibility);
    };
  }, [activeCapital]);
  // Dynamic calculation based on current balance (kam/zyada hone par auto-update)
  const dailyYieldEst = activeCapital > 0 ? (activeCapital * 0.12) / 365 : 0;
  const perSecondYield = dailyYieldEst / 86400;
  const perMinuteYield = perSecondYield * 60;
  const perHourYield = perMinuteYield * 60;
  const perMsYield = perSecondYield / 1000;

  useEffect(() => {
    if (userProfile?.profitBalance !== undefined) {
      const serverVal = Number(userProfile.profitBalance);
      setCachedProfitBalance(prev => Math.max(prev || 0, serverVal));
      try {
        localStorage.setItem("educa_cached_profit_balance", String(Math.max(cachedProfitBalance || 0, serverVal)));
      } catch {}
      const sTime = userProfile.serverTime || userProfile.lastYieldCalculatedAt;
      if (sTime) {
        const parsed = new Date(sTime).getTime();
        if (!isNaN(parsed)) setUserAnchorTime(parsed);
      }
    }
  }, [userProfile?.profitBalance, userProfile?.serverTime, userProfile?.lastYieldCalculatedAt]);

  // Real-time ticking profit balance (monotonically increasing, NEVER resets or drops to old value on refresh)
  const baseProfit = Math.max(Number(userProfile?.profitBalance || 0), Number(cachedProfitBalance || 0));
  const elapsedUserMs = Math.max(0, liveMs - userAnchorTime);
  // Dynamic micro-rolling fraction so even small balances (₹10, ₹100, etc.) roll visibly every 50ms
  const microRoll = ((liveMs % 10000) / 10000) * 0.000008;
  const liveProfitBalance = baseProfit + (elapsedUserMs * perMsYield) + (activeCapital > 0 ? microRoll : 0);

  // Dynamic high-precision formatter: always shows 6 to 8 decimal places so numbers roll rapidly
  const formatLiveProfit = (val, bal = activeCapital) => {
    const num = Number(val || 0);
    const b = Number(bal || 0);
    if (b <= 0 && num === 0) return "0.000000";
    const decimals = b < 100 ? 8 : (b < 50000 ? 7 : 6);
    return num.toLocaleString("en-IN", { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
  };

  useEffect(() => {
    if (liveProfitBalance > 0) {
      try {
        localStorage.setItem("educa_cached_profit_balance", String(liveProfitBalance));
      } catch {}
    }
  }, [liveProfitBalance]);

  // Today's accrued profit since midnight
  const startOfToday = new Date().setHours(0, 0, 0, 0);
  const msElapsedToday = Math.max(0, liveMs - startOfToday);
  const liveTodayEarned = msElapsedToday * perMsYield;

  // Loan Calculations (First time borrower starts at userProfile.loanLimit or 5,000; can be raised by Agent/Admin, capped at 50,000)
  const isFirstTime = (userProfile.loansCount || 0) === 0;
  const maxLimit = Math.min(userProfile.loanLimit ? userProfile.loanLimit : (isFirstTime ? 5000 : 10000), 50000);

  // Personal Loan Calculations
  const quoteAmount = Math.min(Math.max(Number(loanForm.amount) || 5000, 5000), maxLimit);
  const quoteCount = Math.min(Math.max(Number(loanForm.installmentsCount) || 15, 15), 24);
  // Option: For loans > ₹20,000, 1.0% per installment option is supported (optional)!
  const quoteRate = (quoteAmount > 20000 && loanForm.useSpecialRate) ? 1.0 : 1.34;
  const principalPerInstallment = quoteAmount / quoteCount;
  const interestPerInstallment = (quoteAmount * quoteRate) / 100;
  const installmentAmount = Math.round(principalPerInstallment + interestPerInstallment);
  const totalPayable = installmentAmount * quoteCount;
  const processingFee = Math.round(quoteAmount * 0.05); // 5%
  const upiCharges = Math.round(quoteAmount * 0.01); // 1%
  const advanceDeduction = 0; // Optional - decided by Admin upon approval
  const disbursalAmount = Math.max(0, quoteAmount - (processingFee + upiCharges));
  const previewDates = getUpcomingDates(Math.min(quoteCount, 6));

  // Micro Business Loan Calculations (Daily collection: Up to ₹20k with cheque, ₹10k without)
  const mblMaxLimit = mblForm.hasChequeFacility ? 20000 : 10000;
  const mblAmount = Math.min(Math.max(Number(mblForm.amount) || 5000, 1000), mblMaxLimit);
  const mblDays = Number(mblForm.days) || 60;
  const mblRateMap = { 60: 18, 80: 24, 100: 30, 120: 36 };
  const mblRate = mblRateMap[mblDays] || 18;
  const mblInterest = Math.round((mblAmount * mblRate) / 100);
  const mblTotalPayable = mblAmount + mblInterest;
  const mblDailyInstallment = Math.round(mblTotalPayable / mblDays);
  const mblPreviewDates = getUpcomingDailyDates(6);

  // Student Loan Calculations (Subsidized: 8% p.a., 10-day cycle)
  const studentAmount = Math.min(Math.max(Number(studentLoanForm.amount) || 5000, 5000), maxLimit);
  const studentCount = Math.min(Math.max(Number(studentLoanForm.installmentsCount) || 15, 15), 24);
  const studentRate = 0.67; // Subsidized rate (~8% annual over 10-day cycles)
  const studentPrincipal = studentAmount / studentCount;
  const studentInterest = (studentAmount * studentRate) / 100;
  const studentInstallment = Math.round(studentPrincipal + studentInterest);
  const studentTotalPayable = studentInstallment * studentCount;
  const studentFee = Math.round(studentAmount * 0.02); // Subsidized 2%
  const studentUpi = Math.round(studentAmount * 0.01); // 1%
  const studentDisbursal = Math.max(0, studentAmount - (studentFee + studentUpi));
  const studentPreviewDates = getUpcomingDates(Math.min(studentCount, 6));

  // Client-side Native Image Compression for Loan Documents (Photos only, unlimited MB support)
  const handleLoanDocFile = (file, setter, field) => {
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
        setter(prev => ({ ...prev, [field]: canvas.toDataURL("image/jpeg", 0.85) }));
      };
      img.onerror = () => {
        setter(prev => ({ ...prev, [field]: event.target.result }));
      };
      img.src = event.target.result;
    };
    reader.readAsDataURL(file);
  };

  const handleDepositReceiptChange = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    handleLoanDocFile(file, setDepForm, "proofUrl");
    setDepForm(prev => ({ ...prev, proofName: file.name }));
    showToast("Receipt screenshot select ho gaya!", "success");
    try { e.target.value = ""; } catch (_) {}
  };

  const handleTransferProfitToWallet = async () => {
    if (transferringProfit) return;
    const currentProfit = Number((userProfile.profitBalance || 0).toFixed(2));
    if (currentProfit <= 0) {
      showToast("Transfer karne ke liye profit balance hona zaroori hai (min ₹1)", "error");
      return;
    }
    setTransferringProfit(true);
    try {
      const res = await fetch(`${API}/user/transfer-profit-to-wallet`, {
        method: "POST",
        headers
      });
      const data = await res.json();
      if (res.ok) {
        showToast(data.message || "Profit Main Wallet me transfer ho gaya!", "success");
        setUserAnchorTime(Date.now());
        setLiveMs(Date.now());
        setCachedProfitBalance(0);
        localStorage.setItem("educa_cached_profit_balance", "0");
        setUserProfile(prev => ({
          ...prev,
          balance: data.newBalance !== undefined ? data.newBalance : (prev.balance + currentProfit),
          profitBalance: 0
        }));
        if (data.newBalance !== undefined) setBalance(data.newBalance);
        loadDashboard();
      } else {
        showToast(data.message || "Profit transfer fail hua", "error");
      }
    } catch {
      showToast("Network error profit transfer me", "error");
    } finally {
      setTransferringProfit(false);
    }
  };

  const exportPdfStatement = (type = "passbook") => {
    const isProfit = type === "profit";
    const title = isProfit ? "PROFIT WALLET & DAILY YIELD STATEMENT" : "PRIMARY ACCOUNT PASSBOOK STATEMENT";
    const acct = activeAccountNum;
    const name = userProfile.name || userStored.name || "Educa Customer";
    const phone = userProfile.phone || userStored.phone || "N/A";
    const memId = userUniqueId;
    const todayStr = new Date().toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });

    const records = isProfit
      ? (profitHistory.length ? profitHistory : txns.filter(t => ["profit_transfer", "daily_yield", "interest", "bond_payout"].includes(t.type)))
      : txns;

    const rowsHtml = records.slice(0, 100).map((t, idx) => {
      const dateStr = t.createdAt ? new Date(t.createdAt).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" }) : "-";
      const isCredit = ["deposit", "transfer_received", "bond_payout", "loan_disbursal", "daily_yield", "profit_transfer", "referral_bonus"].includes(t.type);
      const amtStr = `₹${Number(t.amount || 0).toLocaleString("en-IN", { minimumFractionDigits: 2 })}`;
      return `
        <tr style="border-bottom: 1px solid #e2e8f0; font-size: 12px;">
          <td style="padding: 8px 6px; text-align: center; color: #64748b;">${idx + 1}</td>
          <td style="padding: 8px 6px; font-weight: 600;">${dateStr}</td>
          <td style="padding: 8px 6px; text-transform: uppercase;">${t.type?.replace(/_/g, " ") || "-"}</td>
          <td style="padding: 8px 6px; font-family: monospace; color: #475569;">${t.utrNumber || t.referenceId || "-"}</td>
          <td style="padding: 8px 6px; color: #64748b;">${t.remarks || (isCredit ? "Credit transaction" : "Debit transaction")}</td>
          <td style="padding: 8px 6px; text-align: right; font-weight: bold; color: ${isCredit ? '#16a34a' : '#dc2626'};">${isCredit ? '+' + amtStr : '-' + amtStr}</td>
          <td style="padding: 8px 6px; text-align: center;"><span style="background: ${t.status === 'completed' || t.status === 'approved' ? '#dcfce7; color: #15803d' : '#fef9c3; color: #854d0e'}; padding: 2px 6px; border-radius: 4px; font-size: 10px; font-weight: bold; text-transform: uppercase;">${t.status || 'completed'}</span></td>
        </tr>
      `;
    }).join("");

    const printHtml = `
      <!DOCTYPE html>
      <html>
      <head>
        <title>Educa Fintech Statement - ${name}</title>
        <meta charset="utf-8" />
        <style>
          @page { size: A4; margin: 15mm; }
          body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif; color: #0f172a; margin: 0; padding: 20px; }
          .header { display: flex; justify-content: space-between; align-items: flex-start; border-bottom: 2px solid #2563eb; padding-bottom: 12px; margin-bottom: 20px; }
          .bank-title { font-size: 24px; font-weight: 900; color: #1e3a8a; letter-spacing: -0.5px; }
          .bank-sub { font-size: 11px; color: #64748b; margin-top: 2px; }
          .tag { font-size: 10px; background: #dbeafe; color: #1d4ed8; padding: 3px 8px; border-radius: 999px; font-weight: bold; }
          .info-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 12px; padding: 14px; margin-bottom: 20px; }
          .info-item { font-size: 12px; }
          .info-label { color: #64748b; font-size: 10px; text-transform: uppercase; font-weight: bold; }
          .info-val { font-weight: bold; color: #0f172a; margin-top: 2px; }
          table { width: 100%; border-collapse: collapse; margin-top: 10px; }
          th { background: #1e293b; color: #ffffff; font-size: 11px; font-weight: 700; text-transform: uppercase; padding: 8px 6px; text-align: left; }
          .footer { margin-top: 30px; border-top: 1px dashed #cbd5e1; padding-top: 14px; display: flex; justify-content: space-between; align-items: center; font-size: 10px; color: #64748b; }
          .seal { border: 2px solid #16a34a; color: #16a34a; font-size: 10px; font-weight: 900; padding: 4px 10px; border-radius: 6px; text-transform: uppercase; letter-spacing: 1px; display: inline-block; }
          @media print {
            body { padding: 0; }
          }
        </style>
      </head>
      <body>
        <div class="header">
          <div>
            <div class="bank-title">EDUCA FINTECH & SAVINGS</div>
            <div class="bank-sub">Regd. Digital Microfinance & Compounding Savings • Jhalwa, Prayagraj</div>
          </div>
          <div style="text-align: right;">
            <span class="tag">OFFICIAL E-STATEMENT</span>
            <div style="font-size: 10px; color: #64748b; margin-top: 6px;">Generated: ${todayStr}</div>
          </div>
        </div>

        <div style="font-size: 16px; font-weight: 800; color: #1e3a8a; margin-bottom: 12px; text-transform: uppercase; letter-spacing: 0.5px;">
          ${title}
        </div>

        <div class="info-grid">
          <div class="info-item">
            <div class="info-label">Account Holder</div>
            <div class="info-val">${name}</div>
          </div>
          <div class="info-item">
            <div class="info-label">Permanent Member ID</div>
            <div class="info-val" style="font-family: monospace;">${memId}</div>
          </div>
          <div class="info-item">
            <div class="info-label">Account Number</div>
            <div class="info-val" style="font-family: monospace;">${acct}</div>
          </div>
          <div class="info-item">
            <div class="info-label">Registered Mobile</div>
            <div class="info-val">${phone}</div>
          </div>
          <div class="info-item">
            <div class="info-label">Primary Wallet Balance</div>
            <div class="info-val" style="color: #2563eb;">₹${Number(userProfile.balance ?? balance ?? 0).toLocaleString("en-IN", { minimumFractionDigits: 2 })}</div>
          </div>
          <div class="info-item">
            <div class="info-label">Live Profit Balance (12% APY)</div>
            <div class="info-val" style="color: #16a34a;">₹${Number(userProfile.profitBalance || 0).toLocaleString("en-IN", { minimumFractionDigits: 2 })}</div>
          </div>
        </div>

        <table>
          <thead>
            <tr>
              <th style="width: 30px; text-align: center;">#</th>
              <th style="width: 85px;">Date</th>
              <th style="width: 100px;">Type</th>
              <th style="width: 110px;">Ref / UTR</th>
              <th>Particulars / Description</th>
              <th style="width: 90px; text-align: right;">Amount</th>
              <th style="width: 70px; text-align: center;">Status</th>
            </tr>
          </thead>
          <tbody>
            ${rowsHtml || '<tr><td colspan="7" style="padding: 20px; text-align: center; color: #94a3b8;">Koi transaction record uplabdh nahi hai.</td></tr>'}
          </tbody>
        </table>

        <div class="footer">
          <div>
            <div>Computer generated statement. Does not require physical signature.</div>
            <div style="margin-top: 2px;">Educa Financial Services Support: support@educa.com | Helpline: 1800-EDUCA-FIN</div>
          </div>
          <div class="seal">
            ✓ DIGITALLY VERIFIED
          </div>
        </div>
      </body>
      </html>
    `;

    const printWin = window.open("", "_blank", "width=850,height=750");
    if (printWin) {
      printWin.document.open();
      printWin.document.write(printHtml);
      printWin.document.close();
      setTimeout(() => {
        try {
          printWin.focus();
          printWin.print();
        } catch (e) {}
      }, 500);
    } else {
      showToast("Pop-up blocked. Kripya browser pop-ups allow karein.", "error");
    }
  };

  const handleAdvisorSend = (queryText) => {
    const q = (queryText || advisorInput).trim();
    if (!q) return;

    const userMsg = {
      sender: "user",
      text: q,
      time: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
    };

    setAdvisorMessages(prev => [...prev, userMsg]);
    setAdvisorInput("");

    const lower = q.toLowerCase();
    const isEn = advisorLang === "english";
    let reply = "";

    // Check specific informational topics FIRST (so 12% interest or profit transfer chips aren't caught by calc parser)
    const isCalcQuery = lower.includes("emi") || lower.includes("kist") || lower.includes("count") || lower.includes("calculate") || lower.includes("hisaab") || lower.includes("dena hai") || lower.includes("repay") || lower.includes("kitna dena");

    if (!isCalcQuery && (lower.includes("profit") && (lower.includes("transfer") || lower.includes("wallet") || lower.includes("main") || lower.includes("primary")))) {
      reply = isEn
        ? `🔄 Dual Wallet & Instant Profit Transfer Rules:\n\n` +
          `• Real-Time Accrual: Your 12% p.a. profit accrues live second-by-second into your Profit Wallet.\n` +
          `• 1-Click Transfer: Transfer any amount from Profit Wallet to Primary Wallet instantly with zero fee!\n` +
          `• Complete Freedom: Once in Primary Wallet, cash out immediately to Bank/UPI or spend via QR.\n\n` +
          `🔥 Your money works 24/7 for you in Educa Fintech!`
        : `🔄 Dual Wallet & Instant Profit Transfer Niyam:\n\n` +
          `• Har Second Live Profit: Aapka 12% p.a. munafa har second live aapke Profit Wallet me judta hai.\n` +
          `• 1-Click Transfer: Profit Wallet se Primary Wallet me jab chahein 1-click me transfer karein, zero charges!\n` +
          `• Pura Control: Primary Wallet me aate hi seedha Bank/UPI Cash Out karein ya QR scan se payment karein!\n\n` +
          `🔥 Educa Fintech me aapka paisa har second aapke liye kamata hai! 🚀`;
    } else if (!isCalcQuery && (lower.includes("12") || lower.includes("compounding") || lower.includes("munafa") || lower.includes("bachat") || (lower.includes("interest") && !lower.includes("loan")))) {
      reply = isEn
        ? `📈 Educa Fintech 12% p.a. Compounding Wealth Model:\n\n` +
          `• 12% Annual Interest: 4x higher returns than traditional bank savings accounts!\n` +
          `• Real-Time Accrual: Your money earns profit second-by-second on your live dashboard.\n` +
          `• Dual Wallet Power: Transfer profit to Primary Wallet anytime with 1-click or withdraw to Bank/UPI!\n\n` +
          `🔥 "With Educa Fintech, you only go higher!" Invest and grow with complete confidence. 🚀`
        : `📈 Educa Fintech 12% p.a. Compounding Wealth Model:\n\n` +
          `• 12% p.a. Compounding Return: Bank ke aam bachat khate se 4 guna zyada munafa!\n` +
          `• Har Second Live Profit: Aapka balance har second live dashboard par profit kamata hai.\n` +
          `• Dual Wallet Azadi: Profit ko 1-click me Primary Wallet me bhejein ya seedha Cash Out karein!\n\n` +
          `🔥 "Educa Fintech me aap sirf upar hi jayenge!" Aaj hi shuru karein aur daulat badhayein! 🚀`;
    } else if (!isCalcQuery && (lower.includes("fayde") || lower.includes("fyde") || lower.includes("benefit") || lower.includes("advantage"))) {
      reply = isEn
        ? `🎯 Key Advantages of Educa Fintech Loans:\n\n` +
          `1. ⚡ Instant Disbursal: No bank queues or physical paperwork. Direct to wallet!\n` +
          `2. 📈 Limit Doubling: Repay your 18 installments on time and your limit doubles up to ₹50,000!\n` +
          `3. 💼 Business Growth: Up to ₹20,000 with cheque facility or ₹10,000 direct capital for your trade!\n` +
          `4. 🛡️ Complete Transparency: Transparent 1.34% per installment rate, zero hidden penalties!\n\n` +
          `🚀 In Educa Fintech, you only move upwards towards financial freedom!`
        : `🎯 Educa Fintech Loan Ke Zabardast Fayde:\n\n` +
          `1. ⚡ Turant Wallet Disbursal: Kisi bank ki lambi line ya paperwork ke bina turant aapke wallet me paisa!\n` +
          `2. 📈 Limit Double Guarantee: 18 kistein samay par bharte hi aapki limit double ho jati hai (₹5,000 → ₹10,000 → ₹50,000 tak)!\n` +
          `3. 💼 Business Growth Boost: Cheque ke sath ₹20,000 aur bina cheque ₹10,000 tak ki instant capital suvidha!\n` +
          `4. 🛡️ 100% Transparent: Sirf 1.34% per installment ka transparent rate, zero hidden deduction!\n\n` +
          `🚀 Educa Fintech me aap sirf upar hi jayenge — aaj hi apply karein aur aage badhein! 🌟`;
    } else if (!isCalcQuery && (lower.includes("business") || lower.includes("cheque") || lower.includes("check") || lower.includes("dukan") || lower.includes("vyapar"))) {
      reply = isEn
        ? `💼 Educa Micro Business Loan Limits:\n\n` +
          `• With Cheque Facility: Up to ₹20,000 maximum eligible capital!\n` +
          `• Without Cheque: Up to ₹10,000 instant capital!\n` +
          `• Repayment: Flexible daily collection (60 to 120 days) or 10-day installments!\n\n` +
          `Expand your inventory and scale your daily revenue with Educa Fintech! 🚀`
        : `💼 Educa Micro Business Loan Suvidha:\n\n` +
          `• Cheque Ke Sath: Maximum ₹20,000 tak working capital!\n` +
          `• Bina Cheque Ke: Maximum ₹10,000 tak instant capital!\n` +
          `• Repayment: 60 se 120 din ke rozana aasan daily collections ya 10-day installments!\n\n` +
          `Apne vyapar ko double karein — Educa Fintech me aap sirf unchaiyon pe jayenge! 🚀`;
    } else {
      // Loan / EMI Calculation Engine (ignores percentage numbers like 12% or 1.34%)
      let tenureVal = null;
      const tenureMatch = lower.match(/(\d+)\s*(?:kist(?:ein|o|on)?|installment(?:s)?|cycle|mahine)\b/i);
      if (tenureMatch) {
        const n = parseInt(tenureMatch[1], 10);
        if (n >= 1 && n <= 60) tenureVal = n;
      }

      let emiVal = null;
      const emiMatch = lower.match(/(?:emi|har\s+kist|per\s+installment)\s*(?:hai|bani|bana|of|is|=|:)?\s*(\d+(?:\.\d+)?\s*k?)\b/i) ||
                       lower.match(/(\d+(?:\.\d+)?\s*k?)\s*(?:ki|ka|har)?\s*(?:emi|har\s+kist|per\s+kist)\b/i);
      if (emiMatch) {
        let raw = emiMatch[1].trim().toLowerCase();
        let n = parseFloat(raw);
        if (raw.endsWith("k")) n *= 1000;
        if (n !== tenureVal) emiVal = Math.round(n);
      }

      let totalVal = null;
      const totalMatch = lower.match(/(\d+(?:\.\d+)?\s*k?)\s*(?:dena|wapas|repay|bharna|total)\b/i);
      if (totalMatch) {
        let raw = totalMatch[1].trim().toLowerCase();
        let n = parseFloat(raw);
        if (raw.endsWith("k")) n *= 1000;
        totalVal = Math.round(n);
      }

      const nums = [];
      const numRe = /(?:₹|rs\.?|inr)?\s*(\d+(?:\.\d+)?)\s*(k)?(?!\s*(?:%|percent))\b/gi;
      let m;
      while ((m = numRe.exec(lower)) !== null) {
        let val = parseFloat(m[1]);
        if (m[2] && m[2].toLowerCase() === "k") val *= 1000;
        nums.push(Math.round(val));
      }

      let principalVal = null;
      const principalMatch = lower.match(/(\d+(?:\.\d+)?\s*k?)\s*(?:ka\s+loan|liya|udhar|borrow|chahiye)\b/i);
      if (principalMatch) {
        let raw = principalMatch[1].trim().toLowerCase();
        let n = parseFloat(raw);
        if (raw.endsWith("k")) n *= 1000;
        principalVal = Math.round(n);
      }

      if (!principalVal && nums.length > 0) {
        const candidates = nums.filter(x => x >= 500 && x !== tenureVal && x !== emiVal && x !== totalVal);
        if (candidates.length > 0) {
          principalVal = Math.max(...candidates);
        } else if (nums[0] >= 500) {
          principalVal = nums[0];
        }
      }

      const hasCalcIntent = principalVal || emiVal || totalVal || isCalcQuery || lower.includes("liya");

      if (principalVal && emiVal && emiVal < principalVal) {
        // User scenario: e.g. "maine 10000 liya 600 ki emi bani to kitna dena hai"
        const tenure = tenureVal || 18;
        const totalRepay = emiVal * tenure;
        const totalInterest = Math.max(0, totalRepay - principalVal);
        const interestRate = ((totalInterest / principalVal) * 100).toFixed(1);

        if (isEn) {
          reply = `🧮 Custom Loan & EMI Breakdown:\n\n` +
            `• Loan Amount Borrowed: ₹${principalVal.toLocaleString("en-IN")}\n` +
            `• Your EMI Amount: ₹${emiVal.toLocaleString("en-IN")} / installment\n` +
            `• Total Installments: ${tenure} Installments (Every 10-day cycle, ~${Math.round(tenure * 10 / 30)} months)\n` +
            `• Total Repayment: ₹${totalRepay.toLocaleString("en-IN")}\n` +
            `• Total Interest: ₹${totalInterest.toLocaleString("en-IN")} (${interestRate}% total)\n\n` +
            `🔥 With Educa Fintech, You Only Go Higher! 🚀\n` +
            `Pay each installment on time and your credit limit doubles automatically up to ₹50,000!`;
        } else {
          reply = `🧮 Aapke Hisaab Ka Pura Breakdown:\n\n` +
            `• Aapne Liya (Loan Amount): ₹${principalVal.toLocaleString("en-IN")}\n` +
            `• Aapki EMI (Har Kist): Sirf ₹${emiVal.toLocaleString("en-IN")} / 10-din\n` +
            `• Kul Kistein (Tenure): ${tenure} Kistein (Har 10 din me 1 kist, ~${Math.round(tenure * 10 / 30)} mahine)\n` +
            `• Kul Bhugtan (Total Repayment): ₹${totalRepay.toLocaleString("en-IN")}\n` +
            `• Kul Byaj (Total Interest): ₹${totalInterest.toLocaleString("en-IN")} (Sirf ${interestRate}%)\n\n` +
            `🔥 Educa Fintech Me Aap Sirf Upar Hi Jayenge! 🚀\n` +
            `Samay par kist chukane par aapka credit record mazboot hota hai aur agla loan instant double limit ke sath milta hai!`;
        }
      } else if (principalVal && totalVal && totalVal > principalVal) {
        // User scenario: e.g. "10000 liya 12000 dena hai emi kitni banegi"
        const tenure = tenureVal || 18;
        const totalInterest = totalVal - principalVal;
        const emiAmt = Math.round(totalVal / tenure);
        const interestRate = ((totalInterest / principalVal) * 100).toFixed(1);

        if (isEn) {
          reply = `🧮 Repayment & EMI Breakdown for ₹${principalVal.toLocaleString("en-IN")}:\n\n` +
            `• Loan Amount Borrowed: ₹${principalVal.toLocaleString("en-IN")}\n` +
            `• Total Repayment: ₹${totalVal.toLocaleString("en-IN")}\n` +
            `• Total Interest: ₹${totalInterest.toLocaleString("en-IN")} (${interestRate}%)\n` +
            `• Tenure: ${tenure} Installments (Every 10-day cycle)\n` +
            `• Each Installment (EMI): ₹${emiAmt.toLocaleString("en-IN")} / cycle\n\n` +
            `🚀 With Educa Fintech, you only go higher! Repay easily and grow.`;
        } else {
          reply = `🧮 ₹${principalVal.toLocaleString("en-IN")} Loan Ka Repayment Hisaab:\n\n` +
            `• Aapne Liya: ₹${principalVal.toLocaleString("en-IN")}\n` +
            `• Kul Wapas Dena Hai: ₹${totalVal.toLocaleString("en-IN")}\n` +
            `• Kul Byaj (Interest): ₹${totalInterest.toLocaleString("en-IN")} (${interestRate}%)\n` +
            `• Kul Kistein: ${tenure} Kistein (Har 10 din me 1 kist)\n` +
            `• Har Kist (EMI): Sirf ₹${emiAmt.toLocaleString("en-IN")} per kist\n\n` +
            `🚀 Samay par bhugtan karein aur agla loan instant double limit ke sath paayein!`;
        }
      } else if (hasCalcIntent) {
        const amt = principalVal || 10000;
        const installments = tenureVal || 18;
        const ratePerInstallment = 1.34; // 1.34% per 10-day cycle
        const totalInterest = Math.round((amt * (ratePerInstallment * installments)) / 100);
        const totalPayable = amt + totalInterest;
        const emiAmt = Math.round(totalPayable / installments);

        if (isEn) {
          reply = `🧮 Instant EMI Breakdown for ₹${amt.toLocaleString("en-IN")}:\n\n` +
            `• Loan Amount: ₹${amt.toLocaleString("en-IN")}\n` +
            `• Tenure: ${installments} Installments (Every 10-day cycle, ~${Math.round(installments * 10 / 30)} months)\n` +
            `• Each Installment (EMI): ₹${emiAmt.toLocaleString("en-IN")} / cycle\n` +
            `• Total Interest: ₹${totalInterest.toLocaleString("en-IN")} (Just 1.34% per installment)\n` +
            `• Total Repayment: ₹${totalPayable.toLocaleString("en-IN")}\n\n` +
            `🔥 With Educa Fintech, You Only Go Higher! 🚀\n` +
            `Partner with us and elevate your business. Repay on time and your credit limit doubles automatically! 100% digital disbursal, zero hidden fees!`;
        } else {
          reply = `🧮 ₹${amt.toLocaleString("en-IN")} Loan Ka Turant EMI Hisaab:\n\n` +
            `• Loan Amount: ₹${amt.toLocaleString("en-IN")}\n` +
            `• Kul Kist (Tenure): ${installments} Kistein (Har 10 din me 1 kist, ~${Math.round(installments * 10 / 30)} mahine)\n` +
            `• Har Kist (EMI): Sirf ₹${emiAmt.toLocaleString("en-IN")} / 10-din\n` +
            `• Kul Byaj (Interest): ₹${totalInterest.toLocaleString("en-IN")} (Sirf 1.34% per kist)\n` +
            `• Total Repayment (Kul Dena Hai): ₹${totalPayable.toLocaleString("en-IN")}\n\n` +
            `🔥 Educa Fintech Me Aap Sirf Upar Hi Jayenge! 🚀\n` +
            `Aap hamare sath kaam karenge aur judenge to aapka business aur balance dono tezi se unchaiyon par jayenge! Samay par kist chukane par aapki loan limit turant double ho jati hai. Zero hidden charges, seedha aapke wallet me instant paisa!`;
        }
      } else if (lower.includes("unchai") || lower.includes("vision") || lower.includes("safal") || lower.includes("upar")) {
        reply = isEn
          ? "Yes! 'With Educa Fintech, you only go higher! 🚀' That is our core mission — idle funds earn 12% p.a. compounding returns, and you get instant loans up to ₹50,000 without paperwork hassle!"
          : "Haan bilkul! 'Educa Fintech me aap sirf upar hi jayenge! 🚀' — Har aam insaan ka paisa har second 12% p.a. ki tezi se badhe aur emergency me instant ₹5,000 se ₹50,000 ka loan mile bina kisi paper chakkar ke!";
      } else {
        reply = isEn
          ? "Welcome to Educa Fintech! 🚀\n• 12% p.a. live compounding savings interest\n• Instant Business Loans (Up to ₹20K with cheque / ₹10K direct)\n• Instant Personal Loans with 18 easy installments (1.34%/cycle)\n• Ask any amount to calculate instant EMI!"
          : "Educa Fintech me aapka swagat hai! 🚀\n• 12% p.a. live compounding munafa\n• Instant Business Loans (₹20,000 cheque ke sath / ₹10,000 direct)\n• Instant Personal Loans 18 aasan kiston me (1.34% per kist)\n• Koi bhi amount likhein (jaise 10000, 20000) aur turant EMI hisaab dekhein!";
      }
    }

    setTimeout(() => {
      setAdvisorMessages(prev => [
        ...prev,
        {
          sender: "ai",
          text: reply,
          time: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
        }
      ]);
    }, 400);
  };

  const handleAdvisorLangChange = (newLang) => {
    setAdvisorLang(newLang);
    setAdvisorMessages(prev => {
      if (prev.length <= 1) {
        return [
          {
            sender: "ai",
            text: getAdvisorGreeting(newLang),
            time: "Just now"
          }
        ];
      }
      return [
        ...prev,
        {
          sender: "ai",
          text: newLang === "english"
            ? "Language switched to English. How can I help you?"
            : "Bhasha Hinglish me badal di gayi hai. Aap kya poochna chahte hain?",
          time: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
        }
      ];
    });
  };

  const handleResolveAdvisorChat = () => {
    setAdvisorMessages([
      {
        sender: "ai",
        text: getAdvisorGreeting(advisorLang),
        time: "Just now"
      }
    ]);
    setShowAiAdvisor(false);
    showToast(advisorLang === "english" ? "Issue resolved! Chat cleared." : "Aapka issue resolve ho gaya! Chat clear kar di gayi hai.", "success");
  };

  const copyText = (text) => {
    navigator.clipboard?.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const copyToClipboard = (text, fieldName = "generic") => {
    try {
      if (navigator.clipboard?.writeText) {
        navigator.clipboard.writeText(text);
      } else {
        const el = document.createElement("textarea");
        el.value = text;
        document.body.appendChild(el);
        el.select();
        document.execCommand("copy");
        document.body.removeChild(el);
      }
    } catch (e) {
      console.warn("Copy fallback error", e);
    }
    setCopiedField(fieldName);
    setCopied(true);
    showToast(txt.copied || "Copied to clipboard!", "success");
    setTimeout(() => {
      setCopiedField(null);
      setCopied(false);
    }, 2200);
  };

  const shareFullBankDetails = () => {
    const accNum = userProfile.accountNumber || "EFS0000001";
    const upi = userProfile.upiId || `${accNum.toLowerCase()}@educa`;
    const userName = userProfile.name || userStored.name || "Customer";
    const shareText = `🏦 Educa Fintech Digital Bank Details\n` +
      `👤 Name: ${userName}\n` +
      `🔢 A/C No: ${accNum}\n` +
      `🏛️ IFSC: EFS0000JHAL\n` +
      `📍 Branch: Jhalwa Branch, Prayagraj - 211012\n` +
      `⚡ App UPI ID: ${upi}\n\n` +
      `📲 Transfer directly to this Account Number or UPI ID using Educa Fintech App!`;

    if (navigator.share) {
      navigator.share({
        title: "Educa Fintech Bank Details",
        text: shareText
      }).catch(() => {
        copyToClipboard(shareText, "share");
      });
    } else {
      copyToClipboard(shareText, "share");
      showToast(txt.shareSuccess || "Bank details copied to share!", "success");
    }
  };

  // Client-side image compression for KYC (Photos only, any MB size supported)
  const handleKycFileChange = (e, slot = 1, side = "front") => {
    setKycError(""); // Immediately remove red error when user picks a photo
    const file = e.target.files?.[0];
    if (!file) return;
    try { e.target.value = ""; } catch (_) {} // Android re-selection fix

    if (file.type && !file.type.startsWith("image/")) {
      setKycError("Kripya sirf photo / image file upload karein");
      return;
    }
    const nameKey = slot === 1
      ? (side === "back" ? "doc1BackName" : "doc1Name")
      : (side === "back" ? "doc2BackName" : "doc2Name");
    const urlKey = slot === 1
      ? (side === "back" ? "doc1BackUrl" : "doc1Url")
      : (side === "back" ? "doc2BackUrl" : "doc2Url");

    // Android/Mobile: Instant ObjectURL avoids heavy base64 memory overhead for 48MP+ camera photos
    const blobUrl = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(blobUrl);
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
      setKycForm(prev => ({ ...prev, [nameKey]: file.name, [urlKey]: compressed }));
    };
    img.onerror = () => {
      URL.revokeObjectURL(blobUrl);
      const reader = new FileReader();
      reader.onload = (event) => {
        setKycForm(prev => ({ ...prev, [nameKey]: file.name, [urlKey]: event.target.result }));
      };
      reader.readAsDataURL(file);
    };
    img.src = blobUrl;
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
      setKycError("Document 1: Aadhaar Card (Front) ki photo/document upload zaroori hai.");
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
      setKycError(`Document 2: ${kycForm.doc2Type === "pan" ? "PAN Card" : "Bank Cheque"} (Front) ki photo/document upload zaroori hai.`);
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
          doc1BackUrl: kycForm.doc1BackUrl || "",
          doc2Type: kycForm.doc2Type,
          panNumber: kycForm.panNumber.trim().toUpperCase(),
          chequeNumber: kycForm.chequeNumber.trim(),
          doc2Url: kycForm.doc2Url,
          doc2BackUrl: kycForm.doc2BackUrl || "",
          address: kycForm.aadhaarAddress.trim()
        })
      });
      const data = await res.json();
      if (res.ok) {
        showToast(data.message || "KYC documents successfully submit ho gaye!", "success");
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
            doc1BackUrl: kycForm.doc1BackUrl || "",
            doc2Type: kycForm.doc2Type,
            doc2Url: kycForm.doc2Url,
            doc2BackUrl: kycForm.doc2BackUrl || "",
            aadharNumber: cleanAadhaar,
            panNumber: kycForm.panNumber,
            chequeNumber: kycForm.chequeNumber,
            address: kycForm.address,
            submittedAt: new Date()
          }
        }));
        closeModal();
      } else {
        if (res.status === 401) {
          setKycError(data.message || "Aapka session expire ho chuka hai ya account reset hua hai. Kripya dobara login ya sign up karein.");
          setTimeout(() => {
            tokenStorage.removeToken();
            localStorage.removeItem("user");
            localStorage.removeItem("educa_cached_profile");
            navigate("/login");
          }, 2500);
          return;
        }
        setKycError(data.message || "KYC submit karne me samasya aayi.");
      }
    } catch {
      setKycError("Network error. Kripya dobara try karein.");
    } finally {
      setKycSubmitting(false);
    }
  };

  const submitDeposit = async () => {
    if (!depForm.amount || !depForm.utrNumber) return showToast("Amount aur UTR number daalna zaroori hai", "error");
    if (+depForm.amount < 1) return showToast("Kripya valid deposit amount enter karein (min ₹1)", "error");
    if (!depForm.proofUrl) return showToast("Kripya payment screenshot / receipt evidence attach karein", "error");
    const res = await fetch(`${API}/transaction/deposit`, {
      method: "POST",
      headers,
      body: JSON.stringify({
        amount: +depForm.amount,
        method: depForm.method,
        utrNumber: depForm.utrNumber.trim(),
        proofUrl: depForm.proofUrl || "",
        screenshotUrl: depForm.proofUrl || ""
      })
    });
    const data = await res.json();
    showToast(data.message, res.ok ? "success" : "error");
    if (res.ok) {
      closeModal();
      setDepForm({ amount: "", method: "upi", utrNumber: "", proofUrl: "", proofName: "" });
      loadDashboard();
    }
  };

  const submitWithdraw = async () => {
    const amt = Number(wdForm.amount);
    if (!amt || amt < 100) return showToast("Amount kam se kam ₹100 hona chahiye", "error");
    const isProfit = wdForm.sourceWallet === "profit";
    const availableFunds = isProfit ? (userProfile.profitBalance || 0) : balance;
    if (amt > availableFunds) {
      return showToast(
        isProfit
          ? `Profit Wallet me paryapt balance nahi hai. Available: ₹${Number(userProfile.profitBalance || 0).toLocaleString("en-IN", { minimumFractionDigits: 2 })}`
          : `Main Wallet me paryapt balance nahi hai. Available: ₹${balance.toLocaleString("en-IN")}`,
        "error"
      );
    }
    const paymentDetails = wdForm.method === "upi" ? { upiId: wdForm.upiId } : { accountNumber: wdForm.accountNumber, ifsc: wdForm.ifsc };
    const res = await fetch(`${API}/transaction/withdraw`, {
      method: "POST",
      headers,
      body: JSON.stringify({
        amount: amt,
        method: wdForm.method,
        paymentDetails,
        sourceWallet: wdForm.sourceWallet || "main"
      })
    });
    const data = await res.json();
    showToast(data.message, res.ok ? "success" : "error");
    if (res.ok) {
      closeModal();
      setWdForm({ amount: "", method: "upi", upiId: "", accountNumber: "", ifsc: "", sourceWallet: "main" });
      loadDashboard();
    }
  };

  // Submit P2P Transfer (App-to-App)
  const submitTransfer = async () => {
    if (isSendingMoney) return; // Prevent double execution
    const amt = Number(sendForm.amount);
    if (!amt || amt < 1 || !Number.isInteger(amt)) {
      return showToast("Valid amount daalein (minimum ₹1, bina decimals)", "error");
    }
    const isProfit = sendForm.sourceWallet === "profit";
    const availableFunds = isProfit ? (userProfile.profitBalance || 0) : balance;
    if (amt > availableFunds) {
      return showToast(
        isProfit
          ? `Profit Wallet me paryapt balance nahi hai. Available: ₹${Number(userProfile.profitBalance || 0).toLocaleString("en-IN", { minimumFractionDigits: 2 })}`
          : `Main Wallet me paryapt balance nahi hai. Available: ₹${balance.toLocaleString("en-IN")}`,
        "error"
      );
    }
    if (!sendForm.recipient) {
      return showToast("Recipient Phone, Email ya Unique ID daalein", "error");
    }
    if (!userProfile.hasWalletPin) {
      showToast("Kripya pehle apna 6-digit UPI PIN set karein", "info");
      setPendingPinAction({ type: "send_money" });
      setPinSetupMode(true);
      setPinError("");
      setPinInput("");
      setConfirmPinInput("");
      setModal("wallet_pin");
      return;
    }
    if (!sendForm.pin || sendForm.pin.length !== 6) {
      return showToast("Kripya apna 6-digit UPI PIN enter karein", "error");
    }

    setIsSendingMoney(true);
    try {
      const res = await fetch(`${API}/transaction/transfer`, {
        method: "POST",
        headers,
        body: JSON.stringify({
          recipient: sendForm.recipient.trim(),
          amount: amt,
          notes: sendForm.notes.trim(),
          pin: sendForm.pin,
          sourceWallet: sendForm.sourceWallet || "main"
        })
      });
      const data = await res.json();
      if (res.ok) {
        showToast(data.message || "🎉 Transfer successful!", "success");
        closeModal();
        setSendForm({ recipient: "", amount: "", notes: "", pin: "", sourceWallet: "main" });
        setRecipientInfo(null);
        loadDashboard();
      } else {
        if (data.needsSetup) {
          showToast(data.message || "Kripya pehle 6-digit UPI PIN banayein", "info");
          setPendingPinAction({ type: "send_money" });
          setPinSetupMode(true);
          setPinError("");
          setPinInput("");
          setConfirmPinInput("");
          setModal("wallet_pin");
        } else {
          showToast(data.message || "Transfer fail ho gaya", "error");
        }
      }
    } catch {
      showToast("Network error transferring funds", "error");
    } finally {
      setIsSendingMoney(false);
    }
  };

  // Helper to render dual camera/gallery document picker box
  const renderDocUploadBox = (title, frontUrl, backUrl, setter, frontField, backField, accentColor = "emerald") => {
    const isEmerald = accentColor === "emerald";
    const isAmber = accentColor === "amber";
    const bgAccent = isEmerald
      ? "bg-emerald-50 hover:bg-emerald-100 text-emerald-800 border-emerald-200"
      : isAmber
      ? "bg-amber-50 hover:bg-amber-100 text-amber-800 border-amber-200"
      : "bg-cyan-50 hover:bg-cyan-100 text-cyan-800 border-cyan-200";

    return (
      <div className="p-3 bg-slate-50/90 rounded-2xl border border-slate-200/80 space-y-2">
        <div className="flex items-center justify-between">
          <div className="text-[11px] font-black text-slate-800 flex items-center gap-1.5">
            <span>{title}</span>
            <span className="text-[9px] font-black uppercase tracking-wider text-rose-600 bg-rose-50 px-1.5 py-0.5 rounded border border-rose-200">
              अनिवार्य (Mandatory)
            </span>
          </div>
          {frontUrl && backUrl ? (
            <span className="text-[10px] font-bold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-full border border-emerald-200">
              ✓ Ready
            </span>
          ) : (
            <span className="text-[10px] font-semibold text-gray-400">Front & Back Needed</span>
          )}
        </div>

        <div className="grid grid-cols-2 gap-2">
          {/* Front Side */}
          <div className="p-2 bg-white rounded-xl border border-gray-200 space-y-1.5 shadow-2xs">
            <div className="text-[10px] font-bold text-gray-600 flex items-center justify-between">
              <span>Front Side</span>
              {frontUrl ? <span className="text-emerald-600 font-black text-[10px]">✓ Done</span> : <span className="text-rose-500 font-bold text-[9px]">Required</span>}
            </div>
            <div className="grid grid-cols-2 gap-1">
              <label className={`cursor-pointer py-1 px-1 rounded-lg text-[10px] font-bold text-center flex items-center justify-center gap-0.5 border active:scale-95 transition ${bgAccent}`}>
                <span>📷 Cam</span>
                <input
                  type="file"
                  accept="image/*"
                  capture="environment"
                  className="hidden"
                  onChange={e => handleLoanDocFile(e.target.files?.[0], setter, frontField)}
                />
              </label>
              <label className="cursor-pointer py-1 px-1 bg-gray-50 hover:bg-gray-100 text-gray-700 rounded-lg text-[10px] font-bold text-center flex items-center justify-center gap-0.5 border border-gray-200 active:scale-95 transition">
                <span>📁 Upload</span>
                <input
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={e => handleLoanDocFile(e.target.files?.[0], setter, frontField)}
                />
              </label>
            </div>
            {frontUrl && (
              <button
                type="button"
                onClick={() => { setLightboxImg(frontUrl); setZoomLevel(1); }}
                className="w-full py-0.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-md text-[10px] font-bold text-center flex items-center justify-center gap-1 transition"
              >
                🔍 View Front
              </button>
            )}
          </div>

          {/* Back Side */}
          <div className="p-2 bg-white rounded-xl border border-gray-200 space-y-1.5 shadow-2xs">
            <div className="text-[10px] font-bold text-gray-600 flex items-center justify-between">
              <span>Back Side</span>
              {backUrl ? <span className="text-emerald-600 font-black text-[10px]">✓ Done</span> : <span className="text-rose-500 font-bold text-[9px]">Required</span>}
            </div>
            <div className="grid grid-cols-2 gap-1">
              <label className={`cursor-pointer py-1 px-1 rounded-lg text-[10px] font-bold text-center flex items-center justify-center gap-0.5 border active:scale-95 transition ${bgAccent}`}>
                <span>📷 Cam</span>
                <input
                  type="file"
                  accept="image/*"
                  capture="environment"
                  className="hidden"
                  onChange={e => handleLoanDocFile(e.target.files?.[0], setter, backField)}
                />
              </label>
              <label className="cursor-pointer py-1 px-1 bg-gray-50 hover:bg-gray-100 text-gray-700 rounded-lg text-[10px] font-bold text-center flex items-center justify-center gap-0.5 border border-gray-200 active:scale-95 transition">
                <span>📁 Upload</span>
                <input
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={e => handleLoanDocFile(e.target.files?.[0], setter, backField)}
                />
              </label>
            </div>
            {backUrl && (
              <button
                type="button"
                onClick={() => { setLightboxImg(backUrl); setZoomLevel(1); }}
                className="w-full py-0.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-md text-[10px] font-bold text-center flex items-center justify-center gap-1 transition"
              >
                🔍 View Back
              </button>
            )}
          </div>
        </div>
      </div>
    );
  };

  // Helper to validate all mandatory requirements before loan submission
  const validateLoanInputs = (form, isStudent = false, isBusiness = false) => {
    const aadhar = (form.aadharNumber || userProfile?.aadharNumber || "").toString().trim();
    if (!aadhar || aadhar.replace(/\D/g, "").length !== 12) {
      showToast("12-digit Aadhaar Card number darj karna anivarya hai", "error");
      return false;
    }
    const aadharFront = form.doc1Url || form.aadharUrl || userProfile?.kycDocuments?.doc1Url;
    const aadharBack = form.doc1BackUrl || form.aadharBackUrl || userProfile?.kycDocuments?.doc1BackUrl;
    if (!aadharFront) {
      showToast("Aadhaar Card Front photo capture ya upload karein", "error");
      return false;
    }
    if (!aadharBack) {
      showToast("Aadhaar Card Back photo capture ya upload karein", "error");
      return false;
    }

    const pan = (form.panNumber || userProfile?.kycDocuments?.panNumber || "").toString().trim();
    if (!pan || pan.length !== 10) {
      showToast("Valid 10-character PAN Card number darj karna anivarya hai", "error");
      return false;
    }
    const panFront = form.doc2Url || form.panUrl || userProfile?.kycDocuments?.doc2Url;
    const panBack = form.doc2BackUrl || form.panBackUrl || userProfile?.kycDocuments?.doc2BackUrl;
    if (!panFront) {
      showToast("PAN Card Front photo capture ya upload karein", "error");
      return false;
    }
    if (!panBack) {
      showToast("PAN Card Back photo capture ya upload karein", "error");
      return false;
    }

    if (!form.chequeNumber?.trim()) {
      showToast("Barrier Cheque number darj karna anivarya hai", "error");
      return false;
    }
    if (!form.chequeUrl) {
      showToast("Barrier Cheque Front photo capture ya upload karein", "error");
      return false;
    }
    if (!form.chequeBackUrl) {
      showToast("Barrier Cheque Back photo capture ya upload karein", "error");
      return false;
    }

    if (!form.bankName?.trim()) {
      showToast("Bank ka naam (Bank Name) darj karein", "error");
      return false;
    }
    if (!form.bankAccountNumber?.trim() || form.bankAccountNumber.trim().length < 8) {
      showToast("Valid Bank Account Number darj karein", "error");
      return false;
    }
    if (!form.bankIfsc?.trim() || form.bankIfsc.trim().length < 9) {
      showToast("Valid Bank IFSC Code darj karein", "error");
      return false;
    }
    if (!form.upiId?.trim() || !form.upiId.includes("@")) {
      showToast("Valid UPI ID (jaise name@upi ya mobile@bank) darj karein", "error");
      return false;
    }

    if (!form.nomineeName?.trim()) {
      showToast("Nominee ka pura naam darj karein", "error");
      return false;
    }
    if (!form.nomineeRelation?.trim()) {
      showToast("Nominee ke sath rishta select karein", "error");
      return false;
    }
    if (!form.nomineePhone?.trim() || form.nomineePhone.replace(/\D/g, "").length < 10) {
      showToast("Nominee ka 10-digit mobile number darj karein", "error");
      return false;
    }

    const email = (form.email || userProfile?.email || "").trim();
    if (!email || !email.includes("@")) {
      showToast("Valid E-mail address darj karein", "error");
      return false;
    }
    const phone = (form.phone || userProfile?.phone || "").trim();
    if (!phone || phone.replace(/\D/g, "").length < 10) {
      showToast("Valid mobile number darj karein", "error");
      return false;
    }

    if (isBusiness && !form.businessName?.trim()) {
      showToast("Business / Dukan ka naam darj karein", "error");
      return false;
    }
    if (isStudent) {
      if (!form.instituteName?.trim()) {
        showToast("School / College / Institute ka naam darj karein", "error");
        return false;
      }
      if (!form.studentProofUrl) {
        showToast("Student ID / Fee Slip Front photo upload karein", "error");
        return false;
      }
    }

    return true;
  };

  // Submit Personal Loan Application
  const submitPersonalLoan = async () => {
    if (!validateLoanInputs(loanForm, false, false)) return;

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
          interestRateOption: quoteRate,
          hasChequeFacility: true,
          chequeNumber: loanForm.chequeNumber.trim(),
          purpose: loanForm.purpose || "Personal Needs",
          documents: {
            aadharNumber: loanForm.aadharNumber.trim() || userProfile?.aadharNumber,
            aadharUrl: loanForm.doc1Url || loanForm.aadharUrl,
            aadharBackUrl: loanForm.doc1BackUrl || loanForm.aadharBackUrl,
            doc1Url: loanForm.doc1Url || loanForm.aadharUrl,
            doc1BackUrl: loanForm.doc1BackUrl || loanForm.aadharBackUrl,
            panNumber: loanForm.panNumber.trim().toUpperCase(),
            panUrl: loanForm.doc2Url || loanForm.panUrl,
            panBackUrl: loanForm.doc2BackUrl || loanForm.panBackUrl,
            doc2Url: loanForm.doc2Url || loanForm.panUrl,
            doc2BackUrl: loanForm.doc2BackUrl || loanForm.panBackUrl,
            chequeNumber: loanForm.chequeNumber.trim(),
            chequeUrl: loanForm.chequeUrl,
            chequeBackUrl: loanForm.chequeBackUrl,
            bankName: loanForm.bankName.trim(),
            bankAccountNumber: loanForm.bankAccountNumber.trim(),
            bankIfsc: loanForm.bankIfsc.trim().toUpperCase(),
            upiId: loanForm.upiId.trim(),
            nomineeName: loanForm.nomineeName.trim(),
            nomineeRelation: loanForm.nomineeRelation.trim(),
            nomineePhone: loanForm.nomineePhone.trim(),
            applicantEmail: (loanForm.email || userProfile?.email || "").trim(),
            applicantPhone: (loanForm.phone || userProfile?.phone || "").trim()
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
    if (!validateLoanInputs(mblForm, false, true)) return;

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
          hasChequeFacility: true,
          chequeNumber: mblForm.chequeNumber.trim(),
          documents: {
            businessName: mblForm.businessName.trim(),
            aadharNumber: mblForm.aadharNumber.trim() || userProfile?.aadharNumber,
            aadharUrl: mblForm.doc1Url || mblForm.aadharUrl,
            aadharBackUrl: mblForm.doc1BackUrl || mblForm.aadharBackUrl,
            doc1Url: mblForm.doc1Url || mblForm.aadharUrl,
            doc1BackUrl: mblForm.doc1BackUrl || mblForm.aadharBackUrl,
            panNumber: mblForm.panNumber.trim().toUpperCase(),
            panUrl: mblForm.doc2Url || mblForm.panUrl,
            panBackUrl: mblForm.doc2BackUrl || mblForm.panBackUrl,
            doc2Url: mblForm.doc2Url || mblForm.panUrl,
            doc2BackUrl: mblForm.doc2BackUrl || mblForm.panBackUrl,
            chequeNumber: mblForm.chequeNumber.trim(),
            chequeUrl: mblForm.chequeUrl,
            chequeBackUrl: mblForm.chequeBackUrl,
            bankName: mblForm.bankName.trim(),
            bankAccountNumber: mblForm.bankAccountNumber.trim(),
            bankIfsc: mblForm.bankIfsc.trim().toUpperCase(),
            upiId: mblForm.upiId.trim(),
            nomineeName: mblForm.nomineeName.trim(),
            nomineeRelation: mblForm.nomineeRelation.trim(),
            nomineePhone: mblForm.nomineePhone.trim(),
            applicantEmail: (mblForm.email || userProfile?.email || "").trim(),
            applicantPhone: (mblForm.phone || userProfile?.phone || "").trim()
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
    if (!validateLoanInputs(studentLoanForm, true, false)) return;

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
          hasChequeFacility: true,
          chequeNumber: studentLoanForm.chequeNumber.trim(),
          purpose: `Student Fee - ${studentLoanForm.instituteName}`,
          documents: {
            instituteName: studentLoanForm.instituteName.trim(),
            aadharNumber: studentLoanForm.aadharNumber.trim() || userProfile?.aadharNumber,
            aadharUrl: studentLoanForm.doc1Url || studentLoanForm.aadharUrl,
            aadharBackUrl: studentLoanForm.doc1BackUrl || studentLoanForm.aadharBackUrl,
            doc1Url: studentLoanForm.doc1Url || studentLoanForm.aadharUrl,
            doc1BackUrl: studentLoanForm.doc1BackUrl || studentLoanForm.aadharBackUrl,
            panNumber: studentLoanForm.panNumber.trim().toUpperCase(),
            panUrl: studentLoanForm.doc2Url || studentLoanForm.panUrl,
            panBackUrl: studentLoanForm.doc2BackUrl || studentLoanForm.panBackUrl,
            doc2Url: studentLoanForm.doc2Url || studentLoanForm.panUrl,
            doc2BackUrl: studentLoanForm.doc2BackUrl || studentLoanForm.panBackUrl,
            chequeNumber: studentLoanForm.chequeNumber.trim(),
            chequeUrl: studentLoanForm.chequeUrl,
            chequeBackUrl: studentLoanForm.chequeBackUrl,
            studentProofUrl: studentLoanForm.studentProofUrl,
            studentProofBackUrl: studentLoanForm.studentProofBackUrl || "",
            bankName: studentLoanForm.bankName.trim(),
            bankAccountNumber: studentLoanForm.bankAccountNumber.trim(),
            bankIfsc: studentLoanForm.bankIfsc.trim().toUpperCase(),
            upiId: studentLoanForm.upiId.trim(),
            nomineeName: studentLoanForm.nomineeName.trim(),
            nomineeRelation: studentLoanForm.nomineeRelation.trim(),
            nomineePhone: studentLoanForm.nomineePhone.trim(),
            applicantEmail: (studentLoanForm.email || userProfile?.email || "").trim(),
            applicantPhone: (studentLoanForm.phone || userProfile?.phone || "").trim()
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
    const units = Math.max(1, parseInt(debitBondUnits) || 1);
    const amount = units * 100000;
    const profitReturn = Math.round(amount * 1.18);
    if (balance < amount) {
      return showToast(`${units} Lakh (₹${amount.toLocaleString("en-IN")}) ka bond banane ke liye wallet me kam se kam ₹${amount.toLocaleString("en-IN")} hona chahiye`, "error");
    }
    if (!window.confirm(`₹${amount.toLocaleString("en-IN")} (${units} Lakh) ka 365-Day Fixed Bond lock karein? Maturity par ₹${profitReturn.toLocaleString("en-IN")} Profit Wallet me add hoga.`)) return;
    try {
      const res = await fetch(`${API}/bond/create`, {
        method: "POST",
        headers,
        body: JSON.stringify({ bondType: "debit_365", amount })
      });
      const data = await res.json();
      if (res.ok) {
        showToast(`🎉 ${units} Lakh 365-Day Bond created! ₹${profitReturn.toLocaleString("en-IN")} maturity scheduled.`, "success");
        loadDashboard();
        loadBonds();
      } else {
        showToast(data.message || "Failed to create bond", "error");
      }
    } catch {
      showToast("Network error creating bond", "error");
    }
  };

  // Create Lending Monthly Bond (40 or 80 Months) with Mandatory Document Verification
  const createLendingBond = async (type = "lending_40") => {
    const units = Math.max(1, parseInt(lendingBondUnits) || 1);
    const amount = units * 100000;
    const monthlyPayout = type === "lending_40" ? Math.round(3500 * units) : Math.round(2500 * units);
    const totalReturn = type === "lending_40" ? Math.round(140000 * units) : Math.round(200000 * units);

    if (balance < amount) {
      return showToast(`Lending Bond (${units} Lakh) lock karne ke liye wallet me kam se kam ₹${amount.toLocaleString("en-IN")} hona chahiye`, "error");
    }

    const form = lendingForm;
    // Strict Mandatory Field Validation
    if (!form.aadharNumber || form.aadharNumber.replace(/\D/g, "").length !== 12) {
      return showToast("12-digit Aadhaar Card number darj karna anivarya (mandatory) hai", "error");
    }
    if (!form.doc1Url) {
      return showToast("Aadhaar Card Front photo upload/capture karna anivarya hai", "error");
    }
    if (!form.doc1BackUrl) {
      return showToast("Aadhaar Card Back photo upload/capture karna anivarya hai", "error");
    }
    if (!form.panNumber || form.panNumber.length !== 10) {
      return showToast("Valid 10-character PAN Card number darj karna anivarya hai", "error");
    }
    if (!form.doc2Url) {
      return showToast("PAN Card Front photo upload/capture karna anivarya hai", "error");
    }
    if (!form.doc2BackUrl) {
      return showToast("PAN Card Back photo upload/capture karna anivarya hai", "error");
    }
    if (!form.chequeNumber?.trim()) {
      return showToast("Barrier Cheque number darj karna anivarya hai", "error");
    }
    if (!form.chequeUrl) {
      return showToast("Barrier Cheque Front photo upload/capture karna anivarya hai", "error");
    }
    if (!form.chequeBackUrl) {
      return showToast("Barrier Cheque Back photo upload/capture karna anivarya hai", "error");
    }
    if (!form.bankName?.trim()) {
      return showToast("Bank ka naam darj karna anivarya hai", "error");
    }
    if (!form.bankAccountNumber?.trim() || form.bankAccountNumber.trim().length < 8) {
      return showToast("Valid Bank Account Number darj karna anivarya hai", "error");
    }
    if (!form.bankIfsc?.trim() || form.bankIfsc.trim().length < 9) {
      return showToast("Valid Bank IFSC Code darj karna anivarya hai", "error");
    }
    if (!form.upiId?.trim() || !form.upiId.includes("@")) {
      return showToast("Valid UPI ID darj karna anivarya hai", "error");
    }
    if (!form.nomineeName?.trim()) {
      return showToast("Nominee ka pura naam darj karna anivarya hai", "error");
    }
    if (!form.nomineePhone?.trim() || form.nomineePhone.replace(/\D/g, "").length < 10) {
      return showToast("Nominee ka 10-digit mobile number darj karna anivarya hai", "error");
    }
    if (!form.email?.trim() || !form.email.includes("@")) {
      return showToast("Valid E-mail address darj karna anivarya hai", "error");
    }
    if (!form.phone?.trim() || form.phone.replace(/\D/g, "").length < 10) {
      return showToast("Valid 10-digit phone number darj karna anivarya hai", "error");
    }

    const msg = type === "lending_40"
      ? `₹${amount.toLocaleString("en-IN")} (${units} Lakh) ka 40 Months Lending Bond lock karein? (Total ₹${totalReturn.toLocaleString("en-IN")} return @ ₹${monthlyPayout.toLocaleString("en-IN")}/month)`
      : `₹${amount.toLocaleString("en-IN")} (${units} Lakh) ka 80 Months Lending Bond lock karein? (Total ₹${totalReturn.toLocaleString("en-IN")} return @ ₹${monthlyPayout.toLocaleString("en-IN")}/month)`;
    if (!window.confirm(msg)) return;

    try {
      const res = await fetch(`${API}/bond/create`, {
        method: "POST",
        headers,
        body: JSON.stringify({
          bondType: type,
          amount,
          documents: {
            aadharNumber: form.aadharNumber.replace(/\D/g, ""),
            aadharUrl: form.doc1Url,
            aadharBackUrl: form.doc1BackUrl,
            doc1Url: form.doc1Url,
            doc1BackUrl: form.doc1BackUrl,
            panNumber: form.panNumber.toUpperCase(),
            panUrl: form.doc2Url,
            panBackUrl: form.doc2BackUrl,
            doc2Url: form.doc2Url,
            doc2BackUrl: form.doc2BackUrl,
            chequeNumber: form.chequeNumber.trim(),
            chequeUrl: form.chequeUrl,
            chequeBackUrl: form.chequeBackUrl,
            bankName: form.bankName.trim(),
            bankAccountNumber: form.bankAccountNumber.trim(),
            bankIfsc: form.bankIfsc.trim().toUpperCase(),
            upiId: form.upiId.trim(),
            nomineeName: form.nomineeName.trim(),
            nomineeRelation: form.nomineeRelation || "Father",
            nomineePhone: form.nomineePhone.replace(/\D/g, ""),
            applicantEmail: form.email.trim(),
            applicantPhone: form.phone.replace(/\D/g, "")
          }
        })
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

  // Pay Easy Installment (Primary Wallet vs Profit Wallet)
  const payInstallment = async (id, instAmount, sourceWallet = "main") => {
    const isProfit = sourceWallet === "profit";
    const walletLabel = isProfit ? "Profit Wallet" : "Primary Wallet";
    if (!window.confirm(`Pay Easy Installment of ₹${instAmount} from ${walletLabel}?`)) return;
    const res = await fetch(`${API}/loan/${id}/pay-installment`, {
      method: "POST",
      headers,
      body: JSON.stringify({ sourceWallet })
    });
    const data = await res.json();
    showToast(data.message, res.ok ? "success" : "error");
    if (res.ok) { loadLoans(); loadActiveLoanDetails(); loadDashboard(); }
  };

  const handleInstallmentProofUpload = (e, side = "front") => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) {
      showToast("File size 5MB se kam honi chahiye", "error");
      return;
    }
    if (side === "back") setInstallmentProofBackName(file.name);
    else setInstallmentProofName(file.name);

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
        const dataUrl = canvas.toDataURL("image/jpeg", 0.8);
        if (side === "back") setInstallmentProofBackUrl(dataUrl);
        else setInstallmentProofUrl(dataUrl);
      };
      img.src = reader.result;
    };
    reader.readAsDataURL(file);
  };

  const submitInstallmentProof = async (e) => {
    e?.preventDefault();
    if (!submitInstallmentModal) return;

    if (installmentPayMethod === "wallet") {
      await payInstallment(submitInstallmentModal.loanId, submitInstallmentModal.amount, installmentSourceWallet);
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
          proofUrl: installmentProofUrl,
          proofBackUrl: installmentProofBackUrl || ""
        })
      });
      const data = await res.json();
      showToast(data.message, res.ok ? "success" : "error");
      if (res.ok) {
        setSubmitInstallmentModal(null);
        setInstallmentUtr("");
        setInstallmentProofUrl("");
        setInstallmentProofName("");
        setInstallmentProofBackUrl("");
        setInstallmentProofBackName("");
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

  // Settle & Close Loan Early in Full (With 3-Part Pre-Close Discount Calculation)
  const closeLoanEarly = async (id, payoffAmount, userDiscount = 0, xPercent = 0) => {
    const confirmMsg = userDiscount > 0
      ? `Kya aap loan ko ₹${payoffAmount.toLocaleString("en-IN")} me early payoff karke close karna chahte hain?\n\n🎉 Early Settlement Fayda:\nAapko samay se pehle loan payoff karne par ₹${userDiscount.toLocaleString("en-IN")} ki chhoot (fayda) milegi!`
      : `Kya aap loan ko ₹${payoffAmount.toLocaleString("en-IN")} me early payoff karke close karna chahte hain?`;
    if (!window.confirm(confirmMsg)) return;
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

  const logout = () => {
    tokenStorage.removeToken();
    localStorage.clear();
    sessionStorage.clear();
    window.location.href = "/";
  };

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

  const openLendingSheet = () => {
    const existingDoc1 = userProfile.kycDocuments?.doc1Url || userProfile.kycDocuments?.docUrl || "";
    const existingDoc1Back = userProfile.kycDocuments?.doc1BackUrl || "";
    const existingDoc2 = userProfile.kycDocuments?.doc2Url || "";
    const existingDoc2Back = userProfile.kycDocuments?.doc2BackUrl || "";
    setLendingForm(prev => ({
      ...prev,
      aadharNumber: prev.aadharNumber || userProfile.aadharNumber || userProfile.kycDocuments?.aadharNumber || "",
      doc1Url: prev.doc1Url || existingDoc1,
      doc1BackUrl: prev.doc1BackUrl || existingDoc1Back,
      panNumber: prev.panNumber || userProfile.kycDocuments?.panNumber || "",
      doc2Url: prev.doc2Url || existingDoc2,
      doc2BackUrl: prev.doc2BackUrl || existingDoc2Back,
      chequeNumber: prev.chequeNumber || userProfile.kycDocuments?.chequeNumber || "",
      bankAccountNumber: prev.bankAccountNumber || userProfile.bankAccount?.accountNumber || "",
      bankIfsc: prev.bankIfsc || userProfile.bankAccount?.ifsc || "",
      upiId: prev.upiId || userProfile.upiId || "",
      email: prev.email || userProfile.email || "",
      phone: prev.phone || userProfile.phone || ""
    }));
    setAccountModal("lending");
  };

  const quickActions = [
    { icon: "📱", label: txt.myQrCode, sub: lang === "hindi" ? "पेमेंट प्राप्त करें" : "Scan to receive", color: "bg-blue-100", action: () => setModal("my_qr") },
    { icon: "⚡", label: txt.sendMoney, sub: lang === "hindi" ? "तत्काल ट्रांसफर" : "Instant P2P", color: "bg-emerald-100", action: handleOpenSendMoney },
    { icon: "🏦", label: txt.personalLoanAccount, sub: lang === "hindi" ? "10-दिवसीय चक्र" : "10-day cycle", color: "bg-indigo-100", action: () => openLoanSheet("personal_loan") },
    { icon: "🏬", label: txt.businessLoanAccount, sub: lang === "hindi" ? "दैनिक कलेक्शन" : "Daily collection", color: "bg-amber-100", action: () => openLoanSheet("business_loan") },
  ];

  const navItems = [
    { key: "home", label: txt.navHome, icon: "🏠", onClick: () => { setModal(null); setShowLoans(false); setNavTab("home"); window.scrollTo({ top: 0, behavior: "smooth" }); } },
    { key: "loans", label: txt.navLoans, icon: "🏦", onClick: openLoansHub, heroBadge: heroFlyId === "loans_hub" },
    { key: "scan", label: txt.navScan, icon: <ScannerIcon className="w-6 h-6 text-white" />, isCenter: true, onClick: () => setModal("scan_qr") },
    { key: "bonds", label: txt.navBonds, icon: "📈", onClick: () => setAccountModal("debt") },
    { key: "profile", label: txt.navProfile, icon: "👤", onClick: () => setModal("profile") },
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
    <div className="bg-gray-50 min-h-[100dvh] w-full max-w-full overflow-x-hidden pb-safe-nav sm:pb-0 font-sans">
      {/* ADMIN PERSISTENCE BANNER */}
      {(userStored.role === "admin" || userProfile?.role === "admin") && (
        <div className="bg-gradient-to-r from-gray-950 via-indigo-950 to-gray-950 border-b border-indigo-500/40 text-white px-3.5 sm:px-6 py-2.5 flex items-center justify-between text-xs sticky top-0 z-50 shadow-md">
          <div className="flex items-center gap-2 font-bold min-w-0">
            <span className="text-base shrink-0">🛡️</span>
            <span className="truncate">Administrator Account Active</span>
            <span className="hidden sm:inline text-indigo-300 font-normal">| Full Platform Controls</span>
          </div>
          <a
            href="/admin"
            className="shrink-0 px-3 py-1 bg-indigo-600 hover:bg-indigo-500 active:scale-95 text-white font-black rounded-lg shadow-sm flex items-center gap-1 transition"
          >
            <span>⚡</span> Open Admin Panel →
          </a>
        </div>
      )}

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
            {(userStored.role === "admin" || userProfile?.role === "admin") && (
              <a
                href="/admin"
                className="px-2.5 sm:px-3 py-1.5 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 border border-indigo-200 rounded-xl font-black text-xs flex items-center gap-1 transition active:scale-95"
                title="Return to Admin Panel"
              >
                <span>🛡️</span> <span>Admin</span>
              </a>
            )}

            {/* Collapsible Language Selector - Ultra Compact (EN / HI / HN) */}
            <div className="relative" ref={langDropdownRef}>
              <button
                type="button"
                onClick={() => setLangDropdownOpen(prev => !prev)}
                className="px-2.5 py-1.5 bg-blue-50 hover:bg-blue-100 text-blue-700 border border-blue-200 rounded-xl font-black text-xs flex items-center gap-1 transition active:scale-95 cursor-pointer shadow-2xs"
                title="Select Language / भाषा चुनें"
                aria-haspopup="true"
                aria-expanded={langDropdownOpen}
              >
                <span className="font-extrabold uppercase">
                  {lang === "hindi" ? "HI" : lang === "english" ? "EN" : "HN"}
                </span>
                <svg
                  className={`w-3 h-3 text-blue-600 transition-transform duration-200 ${langDropdownOpen ? "rotate-180" : ""}`}
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M19 9l-7 7-7-7" />
                </svg>
              </button>

              {langDropdownOpen && (
                <div className="absolute right-0 mt-1.5 w-40 bg-white border border-gray-200 rounded-2xl shadow-xl z-50 py-1.5 animate-in fade-in slide-in-from-top-2 duration-150">
                  <div className="px-3 py-1 text-[10px] font-bold uppercase tracking-wider text-gray-400 border-b border-gray-100 mb-1">
                    {lang === "hindi" ? "भाषा चुनें" : lang === "english" ? "Choose Language" : "Bhasha Chunein"}
                  </div>
                  {[
                    { code: "english", label: "EN • English", flag: "🇬🇧" },
                    { code: "hindi", label: "HI • हिंदी", flag: "🇮🇳" },
                    { code: "hinglish", label: "HN • Hinglish", flag: "🗣️" },
                  ].map(item => {
                    const isSelected = lang === item.code;
                    return (
                      <button
                        key={item.code}
                        type="button"
                        onClick={() => {
                          handleLanguageChange(item.code);
                          setLangDropdownOpen(false);
                        }}
                        className={`w-full px-3 py-2 text-left flex items-center justify-between transition cursor-pointer ${
                          isSelected ? "bg-blue-50 text-blue-700 font-bold" : "text-gray-700 hover:bg-gray-50"
                        }`}
                      >
                        <div className="flex items-center gap-2">
                          <span className="text-sm">{item.flag}</span>
                          <span className="text-xs font-bold">{item.label}</span>
                        </div>
                        {isSelected && (
                          <span className="text-blue-600 text-xs font-bold">✓</span>
                        )}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>

            <button onClick={logout} className="hidden sm:inline-block px-3 py-1.5 bg-red-50 text-red-600 rounded-lg hover:bg-red-100 transition font-semibold text-xs cursor-pointer">
              {txt.logout}
            </button>
          </div>
        </div>
      </nav>

      <div className="w-full max-w-7xl mx-auto px-3.5 sm:px-6 py-4 sm:py-8 overflow-x-hidden">

        {/* ══════════════════════════════════════════════════════
            0.1 AGENT EXECUTIVE PORTFOLIO (ONLY VISIBLE FOR AGENTS)
        ══════════════════════════════════════════════════════ */}
        {isAgent && (
          <div className="mb-4 bg-gradient-to-br from-slate-900 via-indigo-950 to-blue-950 rounded-3xl p-4 sm:p-5 text-white shadow-xl border border-indigo-400/30 relative overflow-hidden">
            <div className="absolute top-0 right-0 w-36 h-36 bg-blue-500/10 rounded-full -mr-12 -mt-12 pointer-events-none" />
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-white/10 pb-3 mb-4">
              <div className="flex items-center gap-2.5">
                <div className="w-10 h-10 rounded-2xl bg-indigo-600/30 border border-indigo-400/30 flex items-center justify-center text-xl">
                  🏢
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="font-extrabold text-sm sm:text-base text-white">Agent Executive Portfolio</h3>
                    <span className="px-2 py-0.5 rounded-full text-[10px] font-black bg-indigo-500/30 text-indigo-300 border border-indigo-400/30 uppercase">
                      Agent Account
                    </span>
                    {((agentMetrics?.agentInfo?.commissionRate ?? userProfile.agentProfile?.commissionRate) ?? 0) > 0 && (
                      <span className="px-2 py-0.5 rounded-full text-[10px] font-black bg-amber-400/20 text-amber-200 border border-amber-400/30">
                        {agentMetrics?.agentInfo?.commissionRate ?? userProfile.agentProfile?.commissionRate}% Commission
                      </span>
                    )}
                  </div>
                  <p className="text-[11px] text-indigo-200">
                    {agentMetrics?.agentInfo?.businessName || userProfile.name} • {agentMetrics?.stats?.customerCount ?? 0} Onboarded Customers
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={loadAgentMetrics}
                className="text-[11px] font-bold text-indigo-300 hover:text-white flex items-center gap-1 bg-white/10 hover:bg-white/20 px-2.5 py-1 rounded-lg transition"
              >
                <span>🔄</span> {loadingAgentMetrics ? "Updating..." : "Refresh Stats"}
              </button>
            </div>

            {/* 5 Core Agent Metrics requested by user */}
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2.5">
              {/* 1. Total Deposit */}
              <div className="bg-white/5 border border-white/10 rounded-2xl p-3">
                <span className="text-[10px] text-indigo-200 uppercase font-bold block mb-1">💰 Total Deposit</span>
                <div className="text-lg sm:text-xl font-black font-mono text-emerald-400">
                  ₹{(agentMetrics?.stats?.totalDeposits || 0).toLocaleString("en-IN")}
                </div>
                <span className="text-[9px] text-gray-400">Customer Deposits</span>
              </div>

              {/* 2. Total Disbursal */}
              <div className="bg-white/5 border border-white/10 rounded-2xl p-3">
                <span className="text-[10px] text-indigo-200 uppercase font-bold block mb-1">📤 Total Disbursal</span>
                <div className="text-lg sm:text-xl font-black font-mono text-blue-400">
                  ₹{(agentMetrics?.stats?.totalDisbursal || 0).toLocaleString("en-IN")}
                </div>
                <span className="text-[9px] text-gray-400">Loans Disbursed</span>
              </div>

              {/* 3. Total Collection */}
              <div className="bg-white/5 border border-white/10 rounded-2xl p-3">
                <span className="text-[10px] text-indigo-200 uppercase font-bold block mb-1">📥 Total Collection</span>
                <div className="text-lg sm:text-xl font-black font-mono text-cyan-400">
                  ₹{(agentMetrics?.stats?.totalCollection || 0).toLocaleString("en-IN")}
                </div>
                <span className="text-[9px] text-gray-400">Repayments Received</span>
              </div>

              {/* 4. Total Due */}
              <div className="bg-white/5 border border-white/10 rounded-2xl p-3">
                <span className="text-[10px] text-indigo-200 uppercase font-bold block mb-1">⚠️ Total Due</span>
                <div className="text-lg sm:text-xl font-black font-mono text-rose-400">
                  ₹{(agentMetrics?.stats?.totalDue || 0).toLocaleString("en-IN")}
                </div>
                <span className="text-[9px] text-gray-400">Pending Customer Dues</span>
              </div>

              {/* 5. Pre-Closing */}
              <div className="bg-white/5 border border-white/10 rounded-2xl p-3 col-span-2 sm:col-span-1">
                <span className="text-[10px] text-indigo-200 uppercase font-bold block mb-1">🔄 Pre-Closing</span>
                <div className="text-lg sm:text-xl font-black font-mono text-amber-300">
                  {agentMetrics?.stats?.preClosingCount || 0}
                </div>
                <span className="text-[9px] text-amber-200/80">₹{(agentMetrics?.stats?.preClosingAmount || 0).toLocaleString("en-IN")} Closed Early</span>
              </div>
            </div>

            {/* Agent Referral Onboarding Section */}
            <div className="mt-4 pt-3 border-t border-white/10 flex flex-wrap items-center justify-between gap-2 text-xs">
              <div className="flex items-center gap-2">
                <span className="text-indigo-200 font-bold">Your Referral Code:</span>
                <span className="font-mono font-black text-amber-300 bg-black/40 px-2 py-0.5 rounded border border-amber-400/30">
                  {agentMetrics?.agentInfo?.referralCode || userProfile.referralCode || referralCode || "AGENT"}
                </span>
              </div>
              <div className="flex items-center gap-2 flex-wrap">
                <button
                  type="button"
                  onClick={() => setAddCustomerModalOpen(true)}
                  className="px-3 py-1.5 bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-400 hover:to-teal-400 text-slate-950 font-black rounded-xl transition active:scale-95 text-xs shadow-xs flex items-center gap-1.5 cursor-pointer"
                >
                  <span>➕</span> Add Customer
                </button>
                <button
                  type="button"
                  onClick={() => setAgentBroadcastModalOpen(true)}
                  className="px-3 py-1.5 bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-600 hover:to-orange-600 text-slate-950 font-black rounded-xl transition active:scale-95 text-xs shadow-xs flex items-center gap-1.5 cursor-pointer"
                >
                  <span>📢</span> Send Mass Message
                </button>
                <button
                  type="button"
                  onClick={() => {
                    const code = agentMetrics?.agentInfo?.referralCode || userProfile.referralCode || referralCode;
                    copyText(`${window.location.origin}/register?ref=${code}`);
                  }}
                  className="px-3 py-1.5 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white rounded-xl font-bold transition active:scale-95 text-xs shadow-xs cursor-pointer"
                >
                  {copied ? "✓ Copied" : "📋 Copy Link"}
                </button>
              </div>
            </div>

            {/* Early Settlement Commission Benefit Guide */}
            <div className="mt-3 p-3.5 bg-white/5 border border-amber-400/25 rounded-2xl text-xs space-y-2">
              <div className="flex items-center justify-between">
                <span className="font-bold text-amber-300 flex items-center gap-1.5">
                  <span>⚡</span> Early Loan Pre-Closure Benefits
                </span>
                <span className="text-[10px] bg-amber-400/20 text-amber-200 border border-amber-400/30 px-2 py-0.5 rounded-full font-bold">
                  Extra Commission
                </span>
              </div>
              <p className="text-[11px] text-amber-100/90 leading-relaxed">
                Agar aapka referred borrower loan ko <strong>samay se pehle (9 kiston se pehle)</strong> close karta hai, to borrower ko loan me vishesh chhoot (fayda) milta hai aur aapko bhi instant early settlement bonus credit hota hai!
              </p>
              <div className="p-2.5 bg-black/40 rounded-xl border border-amber-400/30 text-[11px] text-amber-200 flex items-center justify-between">
                <span>💡 Jitna jaldi pre-close hoga, borrower aur aap dono ko utna fayda milega!</span>
                <span className="text-[10px] bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 px-2 py-0.5 rounded-md font-bold">Auto Payout</span>
              </div>
            </div>

            {/* Agent Referred Customers Breakdown Section */}
            <div className="mt-4 pt-3 border-t border-white/10">
              <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
                <div className="flex items-center gap-2">
                  <span className="text-xs sm:text-sm font-extrabold text-white flex items-center gap-1.5">
                    <span>👥</span> Referred Customers Portfolio ({agentMetrics?.customers?.length || 0})
                  </span>
                  <span className="text-[10px] text-indigo-300 bg-white/10 px-2 py-0.5 rounded-full font-medium">
                    Individual Breakdown
                  </span>
                </div>
                {agentMetrics?.customers && agentMetrics.customers.length > 2 && (
                  <input
                    type="text"
                    value={agentCustomerSearch}
                    onChange={(e) => setAgentCustomerSearch(e.target.value)}
                    placeholder="Search name or phone..."
                    className="bg-black/30 border border-white/15 rounded-xl px-2.5 py-1 text-xs text-white placeholder-gray-400 focus:outline-hidden focus:border-indigo-400 w-full sm:w-48"
                  />
                )}
              </div>

              {/* Customer Cards List */}
              {agentMetrics?.customers && agentMetrics.customers.length > 0 ? (
                <div className="space-y-2.5 max-h-[420px] overflow-y-auto pr-1">
                  {agentMetrics.customers
                    .filter((c) => {
                      if (!agentCustomerSearch) return true;
                      const q = agentCustomerSearch.toLowerCase();
                      return (
                        (c.name && c.name.toLowerCase().includes(q)) ||
                        (c.phone && c.phone.includes(q))
                      );
                    })
                    .map((c, idx) => (
                      <div
                        key={c.id || idx}
                        className="bg-white/5 hover:bg-white/[0.08] border border-white/10 rounded-2xl p-3 transition"
                      >
                        {/* Customer Header */}
                        <div className="flex flex-wrap items-center justify-between gap-2 pb-2 mb-2.5 border-b border-white/5">
                          <div className="flex items-center gap-2">
                            <div className="w-7 h-7 rounded-full bg-gradient-to-tr from-indigo-600 to-blue-500 text-white font-extrabold flex items-center justify-center text-xs shadow-xs">
                              {c.name ? c.name[0].toUpperCase() : "U"}
                            </div>
                            <div>
                              <div className="text-xs font-bold text-white flex items-center gap-1.5">
                                <span>{c.name}</span>
                                {c.phone && (
                                  <span className="text-[10px] text-gray-300 font-mono">({c.phone})</span>
                                )}
                              </div>
                              <div className="text-[9px] text-indigo-200/80">
                                Joined: {c.joinedAt ? new Date(c.joinedAt).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" }) : "-"}
                              </div>
                            </div>
                          </div>

                          <div className="flex items-center gap-1.5">
                            <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 font-bold font-mono">
                              Wallet: ₹{Number(c.balance || 0).toLocaleString("en-IN")}
                            </span>
                          </div>
                        </div>

                        {/* Customer's 5 Metrics Breakdown */}
                        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2 text-[11px]">
                          {/* 1. Deposit */}
                          <div className="bg-black/25 rounded-xl p-2 border border-white/5">
                            <span className="text-[9px] text-indigo-200 uppercase font-bold block mb-0.5">💰 Total Deposit</span>
                            <span className="font-mono font-bold text-emerald-400">
                              ₹{(c.totalDeposit || 0).toLocaleString("en-IN")}
                            </span>
                          </div>

                          {/* 2. Disbursal */}
                          <div className="bg-black/25 rounded-xl p-2 border border-white/5">
                            <span className="text-[9px] text-indigo-200 uppercase font-bold block mb-0.5">📤 Total Disbursal</span>
                            <span className="font-mono font-bold text-blue-400">
                              ₹{(c.totalDisbursal || 0).toLocaleString("en-IN")}
                            </span>
                          </div>

                          {/* 3. Collection */}
                          <div className="bg-black/25 rounded-xl p-2 border border-white/5">
                            <span className="text-[9px] text-indigo-200 uppercase font-bold block mb-0.5">📥 Total Collection</span>
                            <span className="font-mono font-bold text-cyan-400">
                              ₹{(c.totalCollection || 0).toLocaleString("en-IN")}
                            </span>
                          </div>

                          {/* 4. Due */}
                          <div className="bg-black/25 rounded-xl p-2 border border-white/5">
                            <span className="text-[9px] text-indigo-200 uppercase font-bold block mb-0.5">⚠️ Total Due</span>
                            <span className="font-mono font-bold text-rose-400">
                              ₹{(c.totalDue || 0).toLocaleString("en-IN")}
                            </span>
                          </div>

                          {/* 5. Pre-Closing */}
                          <div className="bg-black/25 rounded-xl p-2 border border-white/5 col-span-2 sm:col-span-1">
                            <span className="text-[9px] text-indigo-200 uppercase font-bold block mb-0.5">🔄 Pre-Closing</span>
                            <span className="font-mono font-bold text-amber-300">
                              {c.preClosingCount || 0}
                            </span>
                            <span className="text-[9px] text-amber-200/80 block">
                              ₹{(c.preClosingAmount || 0).toLocaleString("en-IN")}
                            </span>
                          </div>
                        </div>

                        {/* Loan Limit & Agent Limit Increase */}
                        <div className="mt-2.5 pt-2 border-t border-white/10 flex items-center justify-between text-xs">
                          <div className="flex items-center gap-1.5">
                            <span className="text-[10px] text-gray-300">Eligible Loan Limit:</span>
                            <span className="font-mono font-bold text-amber-300">₹{Number(c.loanLimit || 5000).toLocaleString("en-IN")}</span>
                          </div>
                          <button
                            type="button"
                            onClick={() => {
                              setEditLoanLimitCustomer({ customerId: c.id || c._id, name: c.name, currentLimit: c.loanLimit || 5000 });
                              setEditLimitVal(String(c.loanLimit || 5000));
                            }}
                            className="px-2.5 py-1 rounded-lg bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 border border-amber-500/30 text-[10px] font-bold transition active:scale-95 cursor-pointer flex items-center gap-1"
                          >
                            <span>✏️</span> Limit Badhayein
                          </button>
                        </div>
                      </div>
                    ))}
                </div>
              ) : (
                <div className="text-center py-4 px-3 bg-white/5 rounded-2xl border border-white/10 text-xs text-indigo-200/90">
                  {loadingAgentMetrics
                    ? "Customer data load ho raha hai..."
                    : "Abhi tak koi referred customer onboard nahi hua hai. Upar diye gaye link se customers ko onboard karein."}
                </div>
              )}
            </div>
          </div>
        )}

        {/* AGENT EDIT CUSTOMER LOAN LIMIT MODAL */}
        {editLoanLimitCustomer && (
          <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
            <div className="bg-white rounded-3xl max-w-sm w-full p-5 shadow-2xl border border-gray-100 space-y-4 text-gray-900">
              <div className="flex items-center justify-between border-b border-gray-100 pb-2">
                <h4 className="font-extrabold text-sm text-gray-900 flex items-center gap-1.5">
                  <span>📈</span> Customer Loan Limit Badhayein
                </h4>
                <button
                  type="button"
                  onClick={() => setEditLoanLimitCustomer(null)}
                  className="w-7 h-7 rounded-full bg-gray-100 hover:bg-gray-200 text-gray-600 flex items-center justify-center text-xs font-bold cursor-pointer"
                >
                  ✕
                </button>
              </div>
              <div className="space-y-1 text-xs">
                <p className="text-gray-600">
                  Customer: <strong>{editLoanLimitCustomer.name}</strong>
                </p>
                <p className="text-gray-500 text-[11px]">
                  Vartamaan Limit: ₹{Number(editLoanLimitCustomer.currentLimit).toLocaleString("en-IN")}
                </p>
              </div>
              <div>
                <label className="block text-xs font-bold text-gray-700 mb-1">
                  Nayi Loan Limit (₹5,000 se ₹1,00,000 tak)
                </label>
                <input
                  type="number"
                  step="1000"
                  min="5000"
                  max="100000"
                  value={editLimitVal}
                  onChange={e => setEditLimitVal(e.target.value)}
                  placeholder="e.g. 20000, 30000, 50000"
                  className="w-full p-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm font-mono font-bold text-gray-900 outline-none focus:ring-2 focus:ring-amber-500"
                />
              </div>
              <div className="flex items-center justify-end gap-2 pt-2 border-t border-gray-100">
                <button
                  type="button"
                  onClick={() => setEditLoanLimitCustomer(null)}
                  className="px-3.5 py-2 rounded-xl text-xs font-bold text-gray-600 hover:bg-gray-100 cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  disabled={updatingLimit}
                  onClick={handleUpdateCustomerLoanLimit}
                  className="px-4 py-2 rounded-xl bg-amber-500 hover:bg-amber-600 text-slate-950 font-bold text-xs shadow-sm transition active:scale-95 disabled:opacity-50 cursor-pointer"
                >
                  {updatingLimit ? "Updating..." : "Limit Update Karein →"}
                </button>
              </div>
            </div>
          </div>
        )}

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
              <h3 className="text-xl sm:text-2xl lg:text-3xl font-black font-display font-mono mb-1 truncate text-white tracking-tight">
                {loadingDashboard && userProfile.profitBalance === undefined ? (
                  <span className="inline-block h-8 w-28 bg-white/20 rounded-lg animate-pulse" />
                ) : (
                  `₹${formatLiveProfit(liveProfitBalance, activeCapital)}`
                )}
              </h3>
              <p className="text-emerald-100/90 text-[11px] hidden sm:block mt-1">1% Monthly Daily Yield & 365d Bonds</p>
            </div>
            <div className="pt-2 border-t border-emerald-500/40 flex flex-wrap justify-between items-center gap-1 text-[11px] text-emerald-100 relative z-10 mt-2">
              <span>{userProfile.interestRate || currentRate}% APY</span>
              <div className="flex items-center gap-2">
                {(userProfile.profitBalance || 0) > 0 && (
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      handleTransferProfitToWallet();
                    }}
                    disabled={transferringProfit}
                    className="px-2 py-0.5 rounded-lg bg-white/20 hover:bg-white/30 text-white font-bold text-[10px] transition active:scale-95 cursor-pointer"
                  >
                    {transferringProfit ? "Transferring..." : "🔄 Main Wallet"}
                  </button>
                )}
                <span className="font-bold underline">History →</span>
              </div>
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
                {loadingDashboard && userProfile.duesBalance === undefined ? (
                  <span className="inline-block h-8 w-24 bg-white/20 rounded-lg animate-pulse" />
                ) : (
                  `₹${(userProfile.duesBalance || 0).toLocaleString("en-IN")}`
                )}
              </h3>
              <p className="text-red-100/90 text-[11px] hidden sm:block">
                {(userProfile.duesBalance || 0) > 0
                  ? "Pending Easy Installments & upcoming collections"
                  : "No Active Dues • All Clear (₹0)"}
              </p>
              {upcomingDueInstallment && (
                <div className="mt-2 p-1.5 px-2 bg-gradient-to-r from-amber-400 to-yellow-300 text-slate-950 rounded-xl text-[10px] font-black flex items-center gap-1.5 shadow-md animate-pulse">
                  <span className="text-xs">⏰</span>
                  <div className="truncate leading-tight">
                    <span>
                      {upcomingDueInstallment.daysLeft <= 0
                        ? `Aaj kist ka din hai! (₹${upcomingDueInstallment.amount})`
                        : `${upcomingDueInstallment.daysLeft} din bache hain (₹${upcomingDueInstallment.amount}) - Bhar dijiye`}
                    </span>
                  </div>
                </div>
              )}
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
                onClick={handleOpenSendMoney}
                className="py-2 px-4 bg-white/20 hover:bg-white/30 backdrop-blur text-white rounded-xl font-bold text-xs border border-white/30 active:scale-95 transition flex items-center gap-1.5 cursor-pointer"
              >
                <span>⚡</span> {txt.sendMoney}
              </button>
              <button
                onClick={() => setModal("my_qr")}
                className="py-2 px-4 bg-white/20 hover:bg-white/30 backdrop-blur text-white rounded-xl font-bold text-xs border border-white/30 active:scale-95 transition flex items-center gap-1.5 cursor-pointer"
              >
                <span>📱</span> {txt.myQrCode}
              </button>
              <button
                onClick={() => setModal("deposit")}
                className="py-2 px-4 bg-white/20 hover:bg-white/30 backdrop-blur text-white rounded-xl font-bold text-xs border border-white/30 active:scale-95 transition flex items-center gap-1.5 cursor-pointer"
              >
                <span>➕</span> {txt.addMoney}
              </button>
              <button
                onClick={() => requireKyc(() => setModal("withdraw"))}
                className="py-2 px-4 bg-white/10 hover:bg-white/20 backdrop-blur text-white/90 rounded-xl font-bold text-xs border border-white/20 active:scale-95 transition flex items-center gap-1.5 cursor-pointer"
              >
                <span>↓</span> {txt.cashOut}
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
            OFFICIAL DIGITAL BANK ACCOUNT & UPI PASSBOOK CARD
        ══════════════════════════════════════════════════════ */}
        <div className="bg-gradient-to-br from-slate-900 via-indigo-950 to-slate-900 rounded-3xl p-5 sm:p-7 text-white shadow-xl border border-indigo-500/30 mb-6 sm:mb-8 relative overflow-hidden">
          <div className="absolute top-0 right-0 w-64 h-64 bg-indigo-500/10 rounded-full blur-3xl pointer-events-none" />
          <div className="absolute bottom-0 left-0 w-48 h-48 bg-blue-500/10 rounded-full blur-2xl pointer-events-none" />

          {/* Header Row */}
          <div className="relative z-10 flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-white/10 pb-4">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 rounded-2xl bg-gradient-to-tr from-blue-600 to-indigo-500 flex items-center justify-center text-2xl shadow-md border border-white/20 shrink-0">
                🏛️
              </div>
              <div>
                <div className="flex items-center gap-2 flex-wrap">
                  <h3 className="text-base sm:text-lg font-black tracking-tight text-white font-display">
                    {txt.bankCardTitle}
                  </h3>
                  <span className="px-2.5 py-0.5 rounded-full text-[10px] font-black bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 flex items-center gap-1">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                    {lang === "hindi" ? "सक्रिय खाता" : "Verified Account"}
                  </span>
                </div>
                <p className="text-xs text-indigo-200/80 font-medium mt-0.5 flex items-center gap-1.5">
                  <span>📍</span>
                  <strong>{txt.branchName}</strong> • IFSC: <span className="font-mono font-bold text-amber-300">EFS0000JHAL</span>
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={shareFullBankDetails}
                className="px-3.5 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-xs font-bold transition flex items-center gap-1.5 cursor-pointer shadow-sm active:scale-95"
              >
                <svg className="w-3.5 h-3.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.368 2.684 3 3 0 00-5.368-2.684z" />
                </svg>
                <span>{txt.shareBankDetails}</span>
              </button>
            </div>
          </div>

          {/* Details Grid */}
          <div className="relative z-10 grid grid-cols-1 md:grid-cols-3 gap-3.5 pt-4">
            {/* Account Number */}
            <div className="p-3.5 sm:p-4 rounded-2xl bg-white/5 border border-white/10 backdrop-blur-xs flex flex-col justify-between hover:bg-white/10 transition">
              <div className="flex justify-between items-center mb-1.5">
                <span className="text-[11px] font-bold text-gray-400 uppercase tracking-wider">
                  {txt.accountNumberLabel}
                </span>
                <button
                  type="button"
                  onClick={() => copyToClipboard(userProfile.accountNumber || "EFS0000001", "acc")}
                  className="px-2.5 py-1 rounded-md text-[10px] font-bold bg-white/10 hover:bg-white/20 text-indigo-300 flex items-center gap-1 cursor-pointer transition active:scale-95"
                >
                  {copiedField === "acc" ? "✓ " + txt.copied : "📋 " + txt.copy}
                </button>
              </div>
              <div className="font-mono font-black text-xl sm:text-2xl text-white tracking-widest my-1">
                {userProfile.accountNumber || "EFS0000001"}
              </div>
              <p className="text-[11px] text-gray-400 mt-0.5">
                {lang === "hindi" ? "खाता धारक:" : "Holder:"} <span className="text-white font-semibold">{userProfile.name || userStored.name || "Customer"}</span>
              </p>
            </div>

            {/* IFSC Code & Branch */}
            <div className="p-3.5 sm:p-4 rounded-2xl bg-white/5 border border-white/10 backdrop-blur-xs flex flex-col justify-between hover:bg-white/10 transition">
              <div className="flex justify-between items-center mb-1.5">
                <span className="text-[11px] font-bold text-gray-400 uppercase tracking-wider">
                  {txt.ifscLabel}
                </span>
                <button
                  type="button"
                  onClick={() => copyToClipboard("EFS0000JHAL", "ifsc")}
                  className="px-2.5 py-1 rounded-md text-[10px] font-bold bg-white/10 hover:bg-white/20 text-indigo-300 flex items-center gap-1 cursor-pointer transition active:scale-95"
                >
                  {copiedField === "ifsc" ? "✓ " + txt.copied : "📋 " + txt.copy}
                </button>
              </div>
              <div className="font-mono font-black text-xl sm:text-2xl text-amber-300 tracking-wider my-1">
                EFS0000JHAL
              </div>
              <p className="text-[11px] text-gray-400 mt-0.5 truncate">
                {txt.branchName} - 211012
              </p>
            </div>

            {/* App UPI ID */}
            <div className="p-3.5 sm:p-4 rounded-2xl bg-white/5 border border-white/10 backdrop-blur-xs flex flex-col justify-between hover:bg-white/10 transition">
              <div className="flex justify-between items-center mb-1.5">
                <span className="text-[11px] font-bold text-gray-400 uppercase tracking-wider">
                  {txt.upiIdLabel}
                </span>
                <button
                  type="button"
                  onClick={() => copyToClipboard(userProfile.upiId || ((userProfile.accountNumber || "efs0000001").toLowerCase() + "@educa"), "upi")}
                  className="px-2.5 py-1 rounded-md text-[10px] font-bold bg-white/10 hover:bg-white/20 text-indigo-300 flex items-center gap-1 cursor-pointer transition active:scale-95"
                >
                  {copiedField === "upi" ? "✓ " + txt.copied : "📋 " + txt.copy}
                </button>
              </div>
              <div className="font-mono font-black text-lg sm:text-xl text-emerald-300 tracking-wide truncate my-1">
                {userProfile.upiId || ((userProfile.accountNumber || "efs0000001").toLowerCase() + "@educa")}
              </div>
              <p className="text-[11px] text-gray-400 mt-0.5">
                {lang === "hindi" ? "पैसे भेजने हेतु यह UPI ID दें" : "Virtual UPI ID for receiving payments"}
              </p>
            </div>
          </div>
        </div>

        {/* ══════════════════════════════════════════════════════
            6 MODULAR ACCOUNTS SECTION (CLICK TO VIEW FULL DATA)
        ══════════════════════════════════════════════════════ */}
        <div className="bg-white rounded-3xl p-5 sm:p-7 shadow-sm border border-gray-100 mb-6 sm:mb-8">
          <div className="flex justify-between items-center mb-5">
            <div>
              <h3 className="text-base sm:text-lg font-black text-gray-900 flex items-center gap-2">
                <span>📑</span> {txt.accountsHubTitle}
              </h3>
              <p className="text-xs text-gray-500">{txt.accountsHubSub}</p>
            </div>
            <span className="hidden sm:inline-block px-3 py-1 bg-blue-50 text-[#1D6AE5] rounded-full text-xs font-bold">
              {txt.openAccount}
            </span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {/* 1. Wallet Account */}
            <div
              onClick={handleOpenWalletAccount}
              className="p-5 rounded-2xl border-2 border-gray-200 hover:border-blue-500 bg-white hover:bg-blue-50/20 shadow-xs hover:shadow-md transition cursor-pointer flex flex-col justify-between"
            >
              <div>
                <div className="flex justify-between items-start mb-3">
                  <div className="w-11 h-11 rounded-xl bg-blue-100 text-blue-700 flex items-center justify-center text-xl">
                    💰
                  </div>
                  <span className="px-2.5 py-0.5 rounded-full text-[11px] font-mono font-black bg-blue-100 text-blue-800">
                    {userProfile.accountNumber || "EFS0000001"}
                  </span>
                </div>
                <h4 className="font-extrabold text-base text-gray-900">Wallet Account</h4>
                <p className="text-xs text-gray-500 mt-1 mb-3">
                  Available cash balance, QR payments, instant app-to-app transfer aur statement.
                </p>
              </div>
              <div className="pt-3 border-t border-gray-100 flex items-center justify-between text-xs">
                {loadingDashboard && balance === 0 ? (
                  <span className="inline-block h-4 w-20 bg-gray-200 rounded animate-pulse" />
                ) : (
                  <span className="font-bold text-gray-900">₹{balance.toLocaleString("en-IN")}</span>
                )}
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
                {loadingDashboard && userProfile.duesBalance === undefined ? (
                  <span className="inline-block h-4 w-20 bg-gray-200 rounded animate-pulse" />
                ) : (
                  <span className="font-bold text-rose-600">₹{(userProfile.duesBalance || 0).toLocaleString("en-IN")} Due</span>
                )}
                <span className="text-rose-600 font-bold">Open Bonds & Dues →</span>
              </div>
            </div>

            {/* 3. Lending Account (40 & 80 Months Monthly Return Bonds) */}
            <div
              onClick={openLendingSheet}
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
                  1 Lakh par ₹1,40,000 (₹3,500/mo x 40m) ya ₹2,00,000 (₹2,500/mo x 80m) monthly payouts.
                </p>
              </div>
              <div className="pt-3 border-t border-gray-100 flex items-center justify-between text-xs">
                <span className="font-bold text-indigo-700">₹3,500/mo or ₹2,500/mo</span>
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
                  <span className="px-2.5 py-0.5 rounded-full text-[11px] font-mono font-black bg-emerald-100 text-emerald-800">
                    {activePersonalLoan ? (activePersonalLoan.accountNumber || "EFS0000001") : "10-Day Cycle"}
                  </span>
                </div>
                <h4 className="font-extrabold text-base text-gray-900">Personal Loan Account</h4>
                <p className="text-xs text-gray-500 mt-1 mb-3">
                  {activePersonalLoan
                    ? `Active: ${activePersonalLoan.accountNumber || "EFS0000001"} • Early payoff option available.`
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
                  <span className="px-2.5 py-0.5 rounded-full text-[11px] font-mono font-black bg-cyan-100 text-cyan-800">
                    {activeStudentLoan ? (activeStudentLoan.accountNumber || "EFS0000001") : "8% p.a."}
                  </span>
                </div>
                <h4 className="font-extrabold text-base text-gray-900">Student Loan Account</h4>
                <p className="text-xs text-gray-500 mt-1 mb-3">
                  {activeStudentLoan
                    ? `Active: ${activeStudentLoan.accountNumber || "EFS0000001"} • Subsidized student fee support.`
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
                  const isDaily = l.collectionFrequency === "daily" || l.loanType === "micro_business";
                  const schedule = (l.installmentSchedule && l.installmentSchedule.length > 0) ? l.installmentSchedule : (l.emiSchedule || []);
                  const paidCount = schedule.filter(s => s.status === "paid").length;
                  const totalCount = schedule.length || l.installmentsCount || l.dailyTenureDays || l.tenure || 15;
                  const penaltyAmt = l.penaltyDue || 0;
                  const isPrecloseEligible = !isDaily && paidCount < 9 && totalCount > 15;
                  const xPercent = isPrecloseEligible ? Math.max(0, totalCount - 15) : 0;
                  const totalPool = (l.amount * xPercent) / 100;
                  const userDiscount = isPrecloseEligible ? Math.round(totalPool / 3) : 0;
                  const basePayoff = (!isDaily && paidCount < 15
                    ? (Math.min(15, totalCount) - paidCount) * instAmt
                    : (l.remainingAmount || (l.totalPayable - l.paidAmount)));
                  const payoffAmt = Math.max(0, basePayoff - userDiscount) + penaltyAmt;
                  const nextDueAmt = instAmt + penaltyAmt;
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
                      {penaltyAmt > 0 && (
                        <div className="mb-3 p-2.5 bg-rose-50 border border-rose-200 rounded-xl text-xs text-rose-700 font-medium">
                          ⚠️ Overdue Penalty Due: <strong>₹{penaltyAmt}</strong> (Pehle penalty clear hogi, phir installment)
                        </div>
                      )}
                      {userDiscount > 0 && (
                        <div className="mb-3 p-2.5 bg-emerald-50 border border-emerald-200 rounded-xl text-xs text-emerald-800 font-medium flex items-center justify-between">
                          <span>🎉 Early Settlement Offer: <strong>₹{userDiscount.toLocaleString("en-IN")} ki Chhoot (Fayda)</strong></span>
                          <span className="text-[10px] font-bold bg-emerald-200 text-emerald-900 px-2 py-0.5 rounded-full">Fayda Active</span>
                        </div>
                      )}
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
                          <button onClick={() => payInstallment(l._id, nextDueAmt)} className="flex-1 py-2.5 bg-gradient-to-r from-blue-600 to-cyan-600 text-white rounded-xl font-bold text-xs hover:shadow-lg active:scale-[0.98] transition">
                            Pay Kist ₹{nextDueAmt}{penaltyAmt > 0 ? ` (incl ₹${penaltyAmt} penalty)` : ""}
                          </button>
                          <button onClick={() => closeLoanEarly(l._id, payoffAmt, userDiscount, xPercent)} className="px-4 py-2.5 bg-emerald-50 hover:bg-emerald-100 text-emerald-800 rounded-xl font-bold text-xs border border-emerald-300 transition active:scale-[0.98]">
                            ⚡ 15-Kist Payoff (₹{payoffAmt}){userDiscount > 0 ? ` [₹${userDiscount} Fayda]` : ""}
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
                const isCredit = ["deposit", "transfer_received", "bond_payout", "loan_disbursal", "daily_yield", "referral_bonus"].includes(t.type);
                let title = t.type.replace(/_/g, " ");
                if (t.type === "daily_yield") title = "Daily Savings Profit";
                else if (t.type === "referral_bonus") title = "Referral Bonus";
                return (
                  <div key={t._id} className="flex items-center justify-between border border-gray-100 rounded-xl p-3.5 hover:bg-gray-50/50 transition">
                    <div className="flex items-center gap-3">
                      <div className={`w-9 h-9 rounded-full flex items-center justify-center text-lg shrink-0 ${isCredit ? "bg-green-50" : "bg-red-50"}`}>
                        {isCredit ? "🟢" : "🔴"}
                      </div>
                      <div>
                        <p className="font-semibold text-sm capitalize">
                          {title} <span className="text-gray-400 font-normal uppercase text-[10px]">{t.method}</span>
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
          1. MY QR CODE SHEET (DUAL TAB: FINTECH & CUSTOM UPI)
      ══════════════════════════════════════════════════════ */}
      <Sheet open={modal === "my_qr"} onClose={closeModal} title={txt.myQrCode || "My QR Code"} icon="📱">
        <div className="space-y-4">
          {/* Dual Tab Switcher */}
          <div className="flex bg-gray-100 p-1 rounded-2xl text-xs font-bold">
            <button
              type="button"
              onClick={() => setQrTab("fintech")}
              className={`flex-1 py-2 rounded-xl transition cursor-pointer flex items-center justify-center gap-1.5 ${
                qrTab === "fintech"
                  ? "bg-white text-indigo-900 shadow-xs"
                  : "text-gray-500 hover:text-gray-900"
              }`}
            >
              <span>🏛️</span> Fintech QR
            </button>
            <button
              type="button"
              onClick={() => setQrTab("custom")}
              className={`flex-1 py-2 rounded-xl transition cursor-pointer flex items-center justify-center gap-1.5 ${
                qrTab === "custom"
                  ? "bg-white text-indigo-900 shadow-xs"
                  : "text-gray-500 hover:text-gray-900"
              }`}
            >
              <span>📱</span> Other App QR {customQrUrl ? "✓" : ""}
            </button>
          </div>

          {qrTab === "fintech" ? (
            /* TAB 1: FINTECH SYSTEM QR */
            <div className="text-center space-y-4">
              <p className="text-xs text-gray-600 font-medium">
                {lang === "hindi"
                  ? "Educa Fintech यूज़र से डायरेक्ट 0% फीस पर पेमेंट प्राप्त करने के लिए यह Fintech QR स्कैन कराएं:"
                  : "Scan this Fintech QR code from Educa Fintech App to transfer & receive instant payments:"}
              </p>

              <div className="p-4 bg-white rounded-3xl border-2 border-indigo-100 shadow-xl inline-block mx-auto relative">
                <div className="absolute top-2 left-2 w-3 h-3 border-t-2 border-l-2 border-blue-600 rounded-tl" />
                <div className="absolute top-2 right-2 w-3 h-3 border-t-2 border-r-2 border-blue-600 rounded-tr" />
                <div className="absolute bottom-2 left-2 w-3 h-3 border-b-2 border-l-2 border-blue-600 rounded-bl" />
                <div className="absolute bottom-2 right-2 w-3 h-3 border-b-2 border-r-2 border-blue-600 rounded-br" />
                {qrDataUrl ? (
                  <img src={qrDataUrl} alt="Educa QR" className="w-56 h-56 mx-auto rounded-2xl" />
                ) : (
                  <div className="w-56 h-56 flex items-center justify-center text-xs text-gray-400">Generating QR...</div>
                )}
              </div>

              {/* Official Bank Passbook & App UPI Identity Card */}
              <div className="bg-slate-900 text-white rounded-2xl p-4 text-left space-y-2.5 shadow-md border border-white/10">
                <div className="flex items-center justify-between pb-2 border-b border-white/10">
                  <div className="flex items-center gap-2">
                    <span className="text-base">🏛️</span>
                    <div>
                      <h4 className="font-extrabold text-xs text-white leading-tight">{userProfile.name || userStored.name || "Educa Customer"}</h4>
                      <p className="text-[10px] text-indigo-300">{txt.branchName} • IFSC: EFS0000JHAL</p>
                    </div>
                  </div>
                  <span className="px-2 py-0.5 rounded-full text-[9px] font-black bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                    ✓ Active
                  </span>
                </div>

                {/* App UPI ID Row */}
                <div className="flex items-center justify-between p-2 rounded-xl bg-white/5 border border-white/10">
                  <div>
                    <span className="text-[10px] text-gray-400 font-bold uppercase block">{txt.upiIdLabel}</span>
                    <span className="font-mono font-black text-xs text-emerald-300">{activeUpiId}</span>
                  </div>
                  <button
                    type="button"
                    onClick={() => copyToClipboard(activeUpiId, "qr_upi")}
                    className="px-2.5 py-1 rounded-lg text-[10px] font-bold bg-white/10 hover:bg-white/20 text-indigo-300 flex items-center gap-1 transition active:scale-95 cursor-pointer"
                  >
                    {copiedField === "qr_upi" ? "✓ " + txt.copied : "📋 " + txt.copy}
                  </button>
                </div>

                {/* Account Number Row */}
                <div className="flex items-center justify-between p-2 rounded-xl bg-white/5 border border-white/10">
                  <div>
                    <span className="text-[10px] text-gray-400 font-bold uppercase block">{txt.accountNumberLabel}</span>
                    <span className="font-mono font-black text-xs text-white tracking-wider">{activeAccountNum}</span>
                  </div>
                  <button
                    type="button"
                    onClick={() => copyToClipboard(activeAccountNum, "qr_acc")}
                    className="px-2.5 py-1 rounded-lg text-[10px] font-bold bg-white/10 hover:bg-white/20 text-indigo-300 flex items-center gap-1 transition active:scale-95 cursor-pointer"
                  >
                    {copiedField === "qr_acc" ? "✓ " + txt.copied : "📋 " + txt.copy}
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2 pt-1">
                <button
                  type="button"
                  onClick={() => copyToClipboard(activeUpiId, "qr_upi_btn")}
                  className="py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-bold text-xs shadow-md transition active:scale-95 flex items-center justify-center gap-1 cursor-pointer"
                >
                  <span>📋</span> {copiedField === "qr_upi_btn" ? txt.copied : "Copy UPI ID"}
                </button>
                <button
                  type="button"
                  onClick={shareFullBankDetails}
                  className="py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl font-bold text-xs shadow-md transition active:scale-95 flex items-center justify-center gap-1.5 cursor-pointer"
                >
                  <svg className="w-4 h-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.368 2.684 3 3 0 00-5.368-2.684z" />
                  </svg>
                  <span>{txt.shareBankDetails}</span>
                </button>
              </div>
            </div>
          ) : (
            /* TAB 2: CUSTOM OTHER APP QR (GPAY, PHONEPE, PAYTM, ETC.) */
            <div className="space-y-3.5 text-center">
              <p className="text-xs text-gray-600 font-medium">
                {lang === "hindi"
                  ? "आप किसी भी UPI ऐप (GPay, PhonePe, Paytm, BHIM आदि) से पेमेंट प्राप्त करने के लिए यह QR कोड स्कैन कराएं:"
                  : "Scan this QR code from any UPI app (GPay, PhonePe, Paytm, BHIM) to receive direct payments:"}
              </p>
              {customQrUrl && !customQrUploadDraft ? (
                /* ALREADY SAVED CUSTOM QR */
                <div className="space-y-3">
                  <div className="p-4 bg-white rounded-3xl border-2 border-emerald-200 shadow-xl inline-block mx-auto relative">
                    <img
                      src={customQrUrl}
                      alt="My Custom QR"
                      className="w-56 h-56 mx-auto rounded-2xl object-contain bg-white"
                    />
                  </div>

                  <div className="bg-slate-900 text-white rounded-2xl p-3.5 text-left space-y-2 border border-white/10">
                    <div className="flex items-center justify-between pb-2 border-b border-white/10">
                      <div className="flex items-center gap-2">
                        <span className="text-base">📱</span>
                        <div>
                          <h4 className="font-black text-xs text-white">{customQrApp || "Custom UPI QR"}</h4>
                          <p className="text-[10px] text-gray-400">Direct Payment QR</p>
                        </div>
                      </div>
                      <span className="px-2 py-0.5 rounded-full text-[9px] font-black bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                        ✓ Saved
                      </span>
                    </div>

                    {customQrUpi && (
                      <div className="flex items-center justify-between p-2 rounded-xl bg-white/5 border border-white/10">
                        <div>
                          <span className="text-[10px] text-gray-400 font-bold uppercase block">Custom UPI ID</span>
                          <span className="font-mono font-black text-xs text-emerald-300">{customQrUpi}</span>
                        </div>
                        <button
                          type="button"
                          onClick={() => copyToClipboard(customQrUpi, "custom_upi_copy")}
                          className="px-2.5 py-1 rounded-lg text-[10px] font-bold bg-white/10 hover:bg-white/20 text-indigo-300 transition active:scale-95 cursor-pointer"
                        >
                          {copiedField === "custom_upi_copy" ? "✓ Copied" : "📋 Copy"}
                        </button>
                      </div>
                    )}

                    <div className="p-2 rounded-xl bg-blue-950/60 border border-blue-500/30 text-[10px] text-blue-200 flex items-center gap-1.5">
                      <span>💾</span>
                      <span>Yeh QR aapke device me hamesha save rahega aur app re-install karne par bhi restore ho jayega.</span>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-2 pt-1">
                    <label
                      htmlFor="custom-qr-replace-file"
                      className="py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-bold text-xs shadow-md transition active:scale-95 flex items-center justify-center gap-1 cursor-pointer"
                    >
                      <span>🔄</span> Dusra QR Lagayein
                    </label>
                    <input
                      id="custom-qr-replace-file"
                      type="file"
                      accept="image/*"
                      className="hidden"
                      onChange={e => {
                        if (e.target.files && e.target.files[0]) {
                          handleQrFilePick(e.target.files[0]);
                        }
                      }}
                    />
                    <button
                      type="button"
                      onClick={handleRemoveCustomQr}
                      className="py-2.5 bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 rounded-xl font-bold text-xs transition active:scale-95 flex items-center justify-center gap-1 cursor-pointer"
                    >
                      <span>🗑️</span> Remove QR
                    </button>
                  </div>
                </div>
              ) : (
                /* UPLOAD NEW CUSTOM QR DRAFT */
                <div className="space-y-3 text-left">
                  <div className="p-3 bg-blue-50 border border-blue-200 rounded-2xl text-xs text-blue-900 space-y-1">
                    <p className="font-bold flex items-center gap-1.5">
                      <span>📲</span> Apna Personal UPI QR Code Lagayein
                    </p>
                    <p className="text-[11px] text-blue-700">
                      Aap kisi bhi payment app (Google Pay, PhonePe, Paytm, BHIM, BharatPe) ka QR code apni profile me laga sakte hain. Yeh QR aapke phone aur ID me permanently save rahega.
                    </p>
                  </div>

                  {customQrUploadDraft ? (
                    <div className="text-center space-y-2">
                      <div className="p-3 bg-white rounded-2xl border-2 border-indigo-200 shadow-md inline-block mx-auto">
                        <img
                          src={customQrUploadDraft}
                          alt="QR Preview"
                          className="w-48 h-48 mx-auto rounded-xl object-contain"
                        />
                      </div>
                      <p className="text-[11px] text-emerald-700 font-bold">✓ QR Image Selected</p>
                    </div>
                  ) : (
                    <label className="border-2 border-dashed border-indigo-200 hover:border-indigo-400 bg-indigo-50/40 rounded-2xl p-6 flex flex-col items-center justify-center text-center cursor-pointer transition">
                      <span className="text-3xl mb-1.5">📷</span>
                      <span className="text-xs font-bold text-indigo-900">Gallery / Camera se QR Upload Karein</span>
                      <span className="text-[10px] text-gray-500 mt-0.5">Google Pay, PhonePe, Paytm ya kisi bhi app ka QR</span>
                      <input
                        type="file"
                        accept="image/*"
                        className="hidden"
                        onChange={e => {
                          if (e.target.files && e.target.files[0]) {
                            handleQrFilePick(e.target.files[0]);
                          }
                        }}
                      />
                    </label>
                  )}

                  <div className="space-y-2 text-xs">
                    <div>
                      <label className="block font-bold text-gray-700 mb-1">Select App</label>
                      <select
                        value={customQrAppDraft}
                        onChange={e => setCustomQrAppDraft(e.target.value)}
                        className="w-full p-2.5 bg-gray-50 border border-gray-200 rounded-xl text-xs font-semibold outline-none"
                      >
                        <option value="Google Pay">Google Pay (GPay)</option>
                        <option value="PhonePe">PhonePe</option>
                        <option value="Paytm">Paytm</option>
                        <option value="BharatPe">BharatPe</option>
                        <option value="BHIM UPI">BHIM UPI</option>
                        <option value="Other UPI">Other UPI App</option>
                      </select>
                    </div>

                    <div>
                      <label className="block font-bold text-gray-700 mb-1">UPI ID (Optional)</label>
                      <input
                        type="text"
                        placeholder="e.g. mobile@okaxis, user@ybl"
                        value={customQrUpiDraft}
                        onChange={e => setCustomQrUpiDraft(e.target.value)}
                        className="w-full p-2.5 bg-gray-50 border border-gray-200 rounded-xl text-xs font-mono outline-none"
                      />
                    </div>
                  </div>

                  {customQrUploadDraft && (
                    <div className="grid grid-cols-2 gap-2 pt-2">
                      <button
                        type="button"
                        onClick={() => setCustomQrUploadDraft("")}
                        className="py-2.5 rounded-xl border border-gray-200 text-xs font-bold text-gray-700 hover:bg-gray-100"
                      >
                        Cancel
                      </button>
                      <button
                        type="button"
                        disabled={savingCustomQr}
                        onClick={() => handleSaveCustomQr()}
                        className="py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl font-bold text-xs shadow-md transition active:scale-95 disabled:opacity-50"
                      >
                        {savingCustomQr ? "Saving..." : "Save QR to Device & ID →"}
                      </button>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
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
            <div className="text-3xl sm:text-4xl font-black font-display font-mono my-1 tracking-tight">
              {loadingProfitHistory || (loadingDashboard && userProfile.profitBalance === undefined) ? (
                <span className="inline-block h-9 w-36 bg-white/20 rounded-lg animate-pulse" />
              ) : (
                `₹${formatLiveProfit(liveProfitBalance, activeCapital)}`
              )}
            </div>
            <div className="flex items-center gap-2 mt-2 pt-2 border-t border-emerald-500/30 text-xs text-emerald-100">
              <span>Daily Profit Added to Savings Account (12% Annual Yield)</span>
            </div>
          </div>

          {/* Action Row: Transfer to Main Wallet for Compounding & Export PDF */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
            <button
              type="button"
              onClick={handleTransferProfitToWallet}
              disabled={transferringProfit || (userProfile.profitBalance || 0) <= 0}
              className="py-3 px-4 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white rounded-2xl font-black text-xs sm:text-sm flex items-center justify-center gap-2 shadow-md disabled:opacity-50 disabled:cursor-not-allowed active:scale-[0.98] transition cursor-pointer"
            >
              <span>🔄</span>
              <span>{transferringProfit ? "Transferring to Wallet..." : "Main Wallet me Bhejein"}</span>
            </button>
            <button
              type="button"
              onClick={() => exportPdfStatement("profit")}
              className="py-3 px-4 bg-white hover:bg-gray-50 border border-gray-200 text-slate-800 rounded-2xl font-bold text-xs sm:text-sm flex items-center justify-center gap-2 shadow-2xs active:scale-[0.98] transition cursor-pointer"
            >
              <span>📄</span>
              <span>Export / Print PDF Statement</span>
            </button>
          </div>

          {/* Live Real-Time Ticker Stream */}
          <div className="bg-gradient-to-r from-emerald-950 via-teal-950 to-slate-900 border border-emerald-500/30 rounded-3xl p-4 sm:p-5 text-white shadow-xl relative overflow-hidden">
            {/* Live Accruing Counter Box */}
            <div className="bg-black/40 rounded-2xl p-3.5 border border-emerald-500/20 flex items-center justify-between">
              <div>
                <span className="text-[10px] text-gray-400 block font-bold uppercase tracking-wider">Aaj Ka Real-Time Accrued Profit:</span>
                <div className="text-2xl sm:text-3xl font-black font-mono text-emerald-400 tracking-tight flex items-baseline gap-1">
                  <span>₹{liveTodayEarned.toLocaleString("en-IN", { minimumFractionDigits: 4, maximumFractionDigits: 4 })}</span>
                </div>
              </div>
              <div className="text-right">
                <span className="text-[10px] text-gray-400 block font-bold uppercase tracking-wider">Added Every Second:</span>
                <div className="text-xs sm:text-sm font-black font-mono text-emerald-200 bg-emerald-900/60 px-2.5 py-1.5 rounded-xl border border-emerald-500/30 inline-block">
                  ⚡ +₹{perSecondYield.toFixed(4)}/sec
                </div>
              </div>
            </div>
          </div>

          {/* Collapsible Profit Rules & Lending/Loan Returns Explanation */}
          <details className="group bg-indigo-50/80 border border-indigo-200/80 rounded-2xl p-3.5 text-xs text-indigo-950 transition shadow-xs">
            <summary className="font-extrabold flex items-center justify-between cursor-pointer list-none select-none">
              <span className="flex items-center gap-2">
                <span className="text-sm">💡</span>
                <span>Profit Wallet & Transfer Ka Niyam</span>
              </span>
              <span className="text-[11px] font-bold text-indigo-600 group-open:rotate-180 transition-transform">▼</span>
            </summary>
            <div className="mt-3 pt-3 border-t border-indigo-200/60 space-y-2.5 text-[11px] text-indigo-900 leading-relaxed">
              <p>
                <strong>📌 Base Balance Rule:</strong> Jab tak aap apne profit ko transfer nahi karte, tab tak aapke Main Account me mojud balance (jaise ₹6 Lakh) ke hisaab se hi rozana profit banta rahega.
              </p>
              <div className="p-2 rounded-xl bg-white/80 border border-indigo-100 text-[10px] text-indigo-900 space-y-1">
                <p>✅ <strong>Manual Transfer:</strong> Jaise hi aap 'Main Wallet me Bhejein' dabayenge, pura profit Main Wallet me jud jayega, Profit Wallet wapas ₹0 ho jayega, aur agle second se badhe hue naye total balance par profit calculate hoga.</p>
                <p>🤝 <strong>Lending & Loan Returns:</strong> Aapka Lending Bond ka payout aur Loan disbursal ka paisa bhi seedha isi Profit Wallet me aayega.</p>
              </div>
            </div>
          </details>


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
      <Sheet open={modal === "send_money"} onClose={closeModal} title={txt.sendMoney || "Send Money"} icon="⚡">
        <div className="space-y-4">
          <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-3 text-xs text-emerald-900">
            ⚡ <strong>Instant Transfer:</strong> {lang === "hindi" ? "फ़ोन नंबर, खाता संख्या (EFS0000XXX), UPI ID (@educa) या ईमेल द्वारा तुरंत ट्रांसफर करें।" : "Transfer directly using Phone Number, Account Number (EFS0000XXX), UPI ID (@educa), or Email."}
          </div>

          <div>
            <div className="flex justify-between items-center mb-1">
              <label className="text-xs font-bold text-gray-700">
                {lang === "hindi" ? "फ़ोन / खाता संख्या / UPI ID / ईमेल" : "Recipient Phone / A/C No / UPI ID / Email"}
              </label>
              <button
                type="button"
                onClick={() => setModal("scan_qr")}
                className="text-xs font-bold text-emerald-600 hover:text-emerald-700 flex items-center gap-1 bg-emerald-50 px-2 py-0.5 rounded-lg border border-emerald-200 transition active:scale-95 cursor-pointer"
              >
                <ScannerIcon className="w-3.5 h-3.5 text-emerald-600 inline mr-0.5" /> Scan QR / Gallery
              </button>
            </div>
            <input
              type="text"
              placeholder={txt.sendMoneyPlaceholder || "e.g. 9876543210, EFS0000101 ya efs0000101@educa"}
              value={sendForm.recipient}
              onChange={e => setSendForm({ ...sendForm, recipient: e.target.value })}
              className="w-full px-3.5 py-2.5 border border-gray-200 rounded-xl text-xs outline-none focus:ring-2 focus:ring-emerald-500 font-medium"
            />
            {lookingUp && <p className="text-[11px] text-blue-600 mt-1">Checking recipient...</p>}
            {recipientInfo && (
              <div className="p-3 bg-emerald-50 border-2 border-emerald-300 rounded-xl text-xs text-emerald-950 font-bold mt-2 flex items-center justify-between shadow-xs">
                <div className="flex items-center gap-2.5">
                  <div className="w-9 h-9 rounded-full bg-emerald-600 text-white font-black text-xs flex items-center justify-center shrink-0">
                    {(recipientInfo.name || "U")[0].toUpperCase()}
                  </div>
                  <div>
                    <span className="text-emerald-800 text-[10px] uppercase font-bold block">{lang === "hindi" ? "सत्यापित प्राप्तकर्ता" : "Paying To (Verified User)"}</span>
                    <span className="text-sm font-black text-emerald-950">{recipientInfo.name}</span>
                    <div className="flex flex-wrap items-center gap-1.5 text-[10px] font-mono text-emerald-800 mt-0.5">
                      {recipientInfo.accountNumber && (
                        <span className="bg-emerald-100/80 px-1.5 py-0.2 rounded font-bold">A/C: {recipientInfo.accountNumber}</span>
                      )}
                      {recipientInfo.upiId && (
                        <span className="bg-emerald-100/80 px-1.5 py-0.2 rounded">UPI: {recipientInfo.upiId}</span>
                      )}
                    </div>
                  </div>
                </div>
                <span className="font-mono text-[10px] bg-emerald-100 text-emerald-800 px-2 py-0.5 rounded-md font-bold">
                  ✓ Verified
                </span>
              </div>
            )}
            {lookupError && <p className="text-[11px] text-red-500 mt-1">{lookupError}</p>}
          </div>

          {/* Source Wallet Picker (Main Account vs Profit Account) */}
          <div>
            <label className="text-xs font-bold text-gray-700 mb-1.5 block">
              {lang === "hindi" ? "पैसे कहाँ से भेजें? (Wallet चुनें):" : "Send From (Source Wallet):"}
            </label>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setSendForm({ ...sendForm, sourceWallet: "main" })}
                className={`p-2.5 rounded-xl border text-left transition flex flex-col justify-between cursor-pointer ${
                  (sendForm.sourceWallet || "main") === "main"
                    ? "bg-emerald-50 border-emerald-500 ring-2 ring-emerald-500/30 text-emerald-950 font-bold"
                    : "bg-gray-50 border-gray-200 text-gray-600 hover:bg-gray-100"
                }`}
              >
                <div className="flex items-center justify-between text-xs font-bold">
                  <span>🏛️ {lang === "hindi" ? "प्राइमरी वॉलेट" : "Main Wallet"}</span>
                  {(sendForm.sourceWallet || "main") === "main" && <span className="text-emerald-600 text-xs">✓</span>}
                </div>
                <div className="text-sm font-black mt-1 text-emerald-700">
                  ₹{balance.toLocaleString("en-IN")}
                </div>
                <span className="text-[10px] text-gray-500">{lang === "hindi" ? "मुख्य बैलेंस" : "Primary Balance"}</span>
              </button>

              <button
                type="button"
                onClick={() => setSendForm({ ...sendForm, sourceWallet: "profit" })}
                className={`p-2.5 rounded-xl border text-left transition flex flex-col justify-between cursor-pointer ${
                  sendForm.sourceWallet === "profit"
                    ? "bg-emerald-50 border-emerald-500 ring-2 ring-emerald-500/30 text-emerald-950 font-bold"
                    : "bg-gray-50 border-gray-200 text-gray-600 hover:bg-gray-100"
                }`}
              >
                <div className="flex items-center justify-between text-xs font-bold">
                  <span>📈 {lang === "hindi" ? "प्रॉफ़िट वॉलेट" : "Profit Wallet"}</span>
                  {sendForm.sourceWallet === "profit" && <span className="text-emerald-600 text-xs">✓</span>}
                </div>
                <div className="text-sm font-black mt-1 text-emerald-700">
                  ₹{Number(userProfile.profitBalance || 0).toLocaleString("en-IN", { minimumFractionDigits: 2 })}
                </div>
                <span className="text-[10px] text-gray-500">{lang === "hindi" ? "जमा मुनाफ़ा" : "Accrued Profit"}</span>
              </button>
            </div>
          </div>

          <div>
            <div className="flex justify-between text-xs font-bold mb-1">
              <span className="text-gray-700">Amount (₹)</span>
              <span className="text-gray-500 font-semibold">
                Available: ₹{sendForm.sourceWallet === "profit"
                  ? Number(userProfile.profitBalance || 0).toLocaleString("en-IN", { minimumFractionDigits: 2 })
                  : balance.toLocaleString("en-IN")}
              </span>
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

          <div>
            <div className="flex justify-between items-center mb-1">
              <label className="text-xs font-bold text-gray-700">
                {lang === "hindi" ? "6-अंकों का UPI PIN" : "6-Digit UPI PIN"} <span className="text-rose-500">*</span>
              </label>
              {!userProfile.hasWalletPin && (
                <span className="text-[10px] text-amber-600 font-bold bg-amber-50 px-2 py-0.5 rounded border border-amber-200">
                  ⚠️ PIN Not Set
                </span>
              )}
            </div>
            <input
              type="password"
              inputMode="numeric"
              maxLength={6}
              placeholder="••••••"
              value={sendForm.pin || ""}
              onChange={e => setSendForm({ ...sendForm, pin: e.target.value.replace(/\D/g, "").slice(0, 6) })}
              className="w-full px-4 py-2.5 border border-gray-200 rounded-xl text-center text-xl tracking-[0.35em] font-mono font-bold focus:ring-2 focus:ring-emerald-500 outline-none"
            />
            <p className="text-[10px] text-gray-400 mt-1 text-center">
              🔒 Transaction confirm karne ke liye apna 6-digit secret UPI PIN dalein
            </p>
          </div>

          <button
            onClick={submitTransfer}
            disabled={isSendingMoney}
            className="w-full py-3 bg-gradient-to-r from-emerald-600 to-teal-600 text-white rounded-xl font-bold text-xs shadow-md active:scale-95 transition disabled:opacity-50 disabled:cursor-not-allowed disabled:pointer-events-none"
          >
            {isSendingMoney
              ? "Processing Transfer..."
              : !userProfile.hasWalletPin
              ? "Set UPI PIN & Send Money →"
              : "Send Money Now →"}
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
                {activePersonalLoan.accountNumber || "EFS0000001"}
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

            {/* Overdue Penalty Alert */}
            {activePersonalLoan.penaltyDue > 0 && (
              <div className="p-3 bg-rose-50 border border-rose-300 rounded-2xl text-xs text-rose-900 space-y-1.5">
                <div className="flex items-center justify-between font-bold">
                  <span className="flex items-center gap-1.5 text-rose-700">
                    <span>⚠️</span> Overdue Penalty Active
                  </span>
                  <span className="text-rose-800 text-sm font-black">₹{activePersonalLoan.penaltyDue.toLocaleString("en-IN")}</span>
                </div>
                <p className="text-[11px] text-rose-700 leading-relaxed">
                  Kist time par jama na hone ke karan penalty lagi hai. Niyam anusaar <strong>pehle penalty clear hogi</strong>, phir installment. Har overdue cycle me penalty double hoti jayegi.
                </p>
              </div>
            )}

            {/* Loan Metrics */}
            <div className="border border-gray-100 rounded-2xl p-4 bg-gray-50 space-y-2 text-xs">
              <div className="flex justify-between"><span className="text-gray-500">Tenure:</span><span className="font-bold">{activePersonalLoan.installmentsCount || activePersonalLoan.tenure} Easy Installments</span></div>
              <div className="flex justify-between"><span className="text-gray-500">Repayment Cycle:</span><span className="font-bold">10 Days (1st, 11th, 21st of month)</span></div>
              <div className="flex justify-between"><span className="text-gray-500">Per Installment:</span><span className="font-bold text-emerald-700">₹{activePersonalLoan.installmentAmount || activePersonalLoan.emiAmount}</span></div>
              <div className="flex justify-between"><span className="text-gray-500">Total Paid Amount:</span><span className="font-bold text-emerald-600">₹{(activePersonalLoan.paidAmount || 0).toLocaleString("en-IN")}</span></div>
              <div className="flex justify-between"><span className="text-gray-500">Remaining Dues Balance:</span><span className="font-bold text-rose-600">₹{(activePersonalLoan.remainingAmount ?? activePersonalLoan.amount).toLocaleString("en-IN")}</span></div>
              {activePersonalLoan.penaltyDue > 0 && (
                <div className="flex justify-between"><span className="text-rose-600 font-bold">Pending Penalty:</span><span className="font-bold text-rose-700">₹{activePersonalLoan.penaltyDue.toLocaleString("en-IN")}</span></div>
              )}
            </div>

            {/* Primary Action Buttons */}
            {activePersonalLoan.status === "active" && (() => {
              const list = (activeLoanDetails?.installments || activePersonalLoan.installmentSchedule || []);
              const paidCount = list.filter(x => x.status === "paid").length;
              const totalCount = activePersonalLoan.installmentsCount || activePersonalLoan.tenure || list.length || 15;
              const instAmt = activePersonalLoan.installmentAmount || activePersonalLoan.emiAmount || 0;
              const penalty = activePersonalLoan.penaltyDue || 0;
              const pendingInst = list.find(x => x.status === "overdue") || list.find(x => x.status === "pending") || list[0];
              const isPrecloseEligible = paidCount < 9 && totalCount > 15;
              const xPercent = isPrecloseEligible ? Math.max(0, totalCount - 15) : 0;
              const totalPool = (activePersonalLoan.amount * xPercent) / 100;
              const userDiscount = isPrecloseEligible ? Math.round(totalPool / 3) : 0;
              const basePayoff = (paidCount < 15
                ? (Math.min(15, totalCount) - paidCount) * instAmt
                : (activePersonalLoan.remainingAmount || 0));
              const payoffAmount = Math.max(0, basePayoff - userDiscount) + penalty;

              return (
                <div className="space-y-2.5">
                  <button
                    type="button"
                    onClick={() => {
                      setSubmitInstallmentModal({
                        loanId: activePersonalLoan._id,
                        installmentNo: pendingInst ? pendingInst.installmentNo : 1,
                        amount: totalNextDue
                      });
                    }}
                    className="w-full py-3 bg-gradient-to-r from-blue-600 to-indigo-600 text-white rounded-xl font-bold text-xs shadow-md active:scale-95 transition cursor-pointer"
                  >
                    Pay Next Easy Installment (₹{totalNextDue.toLocaleString("en-IN")}{penalty > 0 ? ` incl. ₹${penalty} penalty` : ""}) →
                  </button>
                  <div className="p-3 bg-amber-50 border border-amber-200 rounded-xl text-[11px] text-amber-900 space-y-1">
                    <p>⚡ <strong>15-Installment Early Pre-Closure Rule:</strong> Minimum 15 kiston ka bhugtan karke loan samay se pehle band kiya ja sakta hai.</p>
                    {userDiscount > 0 ? (
                      <p className="text-emerald-800 font-bold">
                        🎉 Samay se pehle (9 kiston se pehle) loan payoff karne par aapko ₹{userDiscount.toLocaleString("en-IN")} ka vishesh fayda (chhoot) mila hai! (Payoff: ₹{payoffAmount.toLocaleString("en-IN")})
                      </p>
                    ) : (
                      paidCount >= 9 && <p className="text-gray-500">Notice: 9 kist ke baad early settlement discount lagu nahi hota hai.</p>
                    )}
                  </div>
                  <button
                    type="button"
                    onClick={() => closeLoanEarly(activePersonalLoan._id, payoffAmount, userDiscount, xPercent)}
                    className="w-full py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl font-bold text-xs shadow-sm active:scale-95 transition cursor-pointer"
                  >
                    Close Loan Early (15-Kist Payoff ₹{payoffAmount.toLocaleString("en-IN")}{userDiscount > 0 ? ` • ₹${userDiscount} Fayda` : ""}) →
                  </button>
                </div>
              );
            })()}

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
                max="24"
                step="1"
                value={quoteCount}
                onChange={e => setLoanForm({ ...loanForm, installmentsCount: Number(e.target.value) })}
                className="w-full accent-blue-600 cursor-pointer"
              />
              <div className="flex justify-between text-[10px] text-gray-400 mt-0.5">
                <span>Min 15 Installments</span>
                <span>Max 24 Installments</span>
              </div>
            </div>

            {/* Optional Special Rate for Loans > ₹20,000 */}
            {quoteAmount > 20000 && (
              <div className="p-3 bg-emerald-50 border border-emerald-300 rounded-2xl space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-emerald-950 flex items-center gap-1.5">
                    <span>✨</span> Special Interest Rate Option (&gt;₹20,000)
                  </span>
                  <span className="text-[10px] font-extrabold bg-emerald-600 text-white px-2 py-0.5 rounded-full">
                    Optional
                  </span>
                </div>
                <p className="text-[11px] text-emerald-800">
                  ₹20,000 se upar ke loan par aap optional 1.0% per installment rate select kar sakte hain:
                </p>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setLoanForm({ ...loanForm, useSpecialRate: false })}
                    className={`p-2.5 rounded-xl text-left transition border cursor-pointer ${
                      !loanForm.useSpecialRate
                        ? "bg-white border-emerald-600 ring-2 ring-emerald-500 shadow-xs font-bold text-gray-900"
                        : "bg-emerald-50/60 border-emerald-200 text-gray-600 hover:bg-white"
                    }`}
                  >
                    <div className="text-[11px] font-semibold text-gray-700">Standard Rate</div>
                    <div className="font-mono text-xs font-black text-slate-800">1.34% / installment</div>
                  </button>
                  <button
                    type="button"
                    onClick={() => setLoanForm({ ...loanForm, useSpecialRate: true })}
                    className={`p-2.5 rounded-xl text-left transition border cursor-pointer ${
                      loanForm.useSpecialRate
                        ? "bg-white border-emerald-600 ring-2 ring-emerald-500 shadow-xs font-bold text-emerald-900"
                        : "bg-emerald-50/60 border-emerald-200 text-gray-600 hover:bg-white"
                    }`}
                  >
                    <div className="text-[11px] text-emerald-700 font-extrabold">🌟 Special Rate</div>
                    <div className="font-mono text-xs font-black text-emerald-800">1.00% / installment</div>
                  </button>
                </div>
              </div>
            )}

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
                <span className="font-bold text-emerald-700">
                  {quoteRate}% per installment {quoteAmount > 20000 && loanForm.useSpecialRate ? " (Special 1% Option)" : ""}
                </span>
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

            {/* All Mandatory Loan Verification Details */}
            <div className="space-y-3 pt-2 border-t border-gray-100">
              <div className="bg-amber-50/90 border border-amber-200/90 rounded-xl p-2.5 text-[11px] text-amber-900 font-semibold flex items-center gap-1.5">
                <span>⚠️</span>
                <span>Yeh sabhi dastavej (documents) aur details submit karna <strong>100% anivarya (mandatory)</strong> hai.</span>
              </div>

              {/* 1. Aadhaar Card Details */}
              <div className="space-y-1.5">
                <label className="block text-[11px] font-bold text-gray-700">
                  1. Aadhaar Card Details <span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  maxLength={12}
                  placeholder="12-Digit Aadhaar Number"
                  value={loanForm.aadharNumber}
                  onChange={e => setLoanForm({ ...loanForm, aadharNumber: e.target.value.replace(/\D/g, "") })}
                  className="w-full px-3.5 py-2.5 border border-gray-200 rounded-xl text-xs outline-none focus:ring-2 focus:ring-emerald-500 font-mono tracking-wider"
                />
                {renderDocUploadBox("Aadhaar Card (Doc 1)", loanForm.doc1Url, loanForm.doc1BackUrl, setLoanForm, "doc1Url", "doc1BackUrl", "emerald")}
              </div>

              {/* 2. PAN Card Details */}
              <div className="space-y-1.5 pt-1">
                <label className="block text-[11px] font-bold text-gray-700">
                  2. PAN Card Details <span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  maxLength={10}
                  placeholder="10-Character PAN Number (ABCDE1234F)"
                  value={loanForm.panNumber}
                  onChange={e => setLoanForm({ ...loanForm, panNumber: e.target.value.toUpperCase() })}
                  className="w-full px-3.5 py-2.5 border border-gray-200 rounded-xl text-xs outline-none focus:ring-2 focus:ring-emerald-500 uppercase font-mono tracking-wider"
                />
                {renderDocUploadBox("PAN Card (Doc 2)", loanForm.doc2Url, loanForm.doc2BackUrl, setLoanForm, "doc2Url", "doc2BackUrl", "emerald")}
              </div>

              {/* 3. Barrier Cheque Details */}
              <div className="space-y-1.5 pt-1">
                <label className="block text-[11px] font-bold text-gray-700">
                  3. Barrier Cheque Details <span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  placeholder="Barrier Cheque Number (e.g. 000123)"
                  value={loanForm.chequeNumber}
                  onChange={e => setLoanForm({ ...loanForm, chequeNumber: e.target.value })}
                  className="w-full px-3.5 py-2.5 border border-gray-200 rounded-xl text-xs outline-none focus:ring-2 focus:ring-emerald-500 font-mono tracking-wider"
                />
                {renderDocUploadBox("Barrier Cheque (Doc 3)", loanForm.chequeUrl, loanForm.chequeBackUrl, setLoanForm, "chequeUrl", "chequeBackUrl", "emerald")}
              </div>

              {/* 4. Banking & UPI Details */}
              <div className="space-y-2 pt-2 border-t border-gray-100">
                <label className="block text-[11px] font-bold text-gray-700">
                  4. Bank & UPI Details (Disbursal Account) <span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  placeholder="Bank ka Naam (e.g. State Bank of India)"
                  value={loanForm.bankName}
                  onChange={e => setLoanForm({ ...loanForm, bankName: e.target.value })}
                  className="w-full px-3.5 py-2.5 border border-gray-200 rounded-xl text-xs outline-none focus:ring-2 focus:ring-emerald-500"
                />
                <div className="grid grid-cols-2 gap-2">
                  <input
                    type="text"
                    placeholder="Account Number"
                    value={loanForm.bankAccountNumber}
                    onChange={e => setLoanForm({ ...loanForm, bankAccountNumber: e.target.value })}
                    className="w-full px-3.5 py-2.5 border border-gray-200 rounded-xl text-xs outline-none focus:ring-2 focus:ring-emerald-500 font-mono"
                  />
                  <input
                    type="text"
                    placeholder="IFSC Code"
                    value={loanForm.bankIfsc}
                    onChange={e => setLoanForm({ ...loanForm, bankIfsc: e.target.value.toUpperCase() })}
                    className="w-full px-3.5 py-2.5 border border-gray-200 rounded-xl text-xs outline-none focus:ring-2 focus:ring-emerald-500 uppercase font-mono"
                  />
                </div>
                <input
                  type="text"
                  placeholder="UPI ID (e.g. 9876543210@paytm ya user@okhdfcbank)"
                  value={loanForm.upiId}
                  onChange={e => setLoanForm({ ...loanForm, upiId: e.target.value })}
                  className="w-full px-3.5 py-2.5 border border-gray-200 rounded-xl text-xs outline-none focus:ring-2 focus:ring-emerald-500 font-mono"
                />
              </div>

              {/* 5. Nominee Details */}
              <div className="space-y-2 pt-2 border-t border-gray-100">
                <label className="block text-[11px] font-bold text-gray-700">
                  5. Nominee Details <span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  placeholder="Nominee ka Pura Naam (Full Name)"
                  value={loanForm.nomineeName}
                  onChange={e => setLoanForm({ ...loanForm, nomineeName: e.target.value })}
                  className="w-full px-3.5 py-2.5 border border-gray-200 rounded-xl text-xs outline-none focus:ring-2 focus:ring-emerald-500"
                />
                <div className="grid grid-cols-2 gap-2">
                  <select
                    value={loanForm.nomineeRelation}
                    onChange={e => setLoanForm({ ...loanForm, nomineeRelation: e.target.value })}
                    className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-xs outline-none focus:ring-2 focus:ring-emerald-500 bg-white"
                  >
                    <option value="Father">Father (पिता)</option>
                    <option value="Mother">Mother (माता)</option>
                    <option value="Spouse">Spouse (पति / पत्नी)</option>
                    <option value="Brother">Brother (भाई)</option>
                    <option value="Sister">Sister (बहन)</option>
                    <option value="Son">Son (बेटा)</option>
                    <option value="Daughter">Daughter (बेटी)</option>
                    <option value="Other">Other (अन्य)</option>
                  </select>
                  <input
                    type="tel"
                    maxLength={10}
                    placeholder="Nominee Mobile (10 digits)"
                    value={loanForm.nomineePhone}
                    onChange={e => setLoanForm({ ...loanForm, nomineePhone: e.target.value.replace(/\D/g, "") })}
                    className="w-full px-3.5 py-2.5 border border-gray-200 rounded-xl text-xs outline-none focus:ring-2 focus:ring-emerald-500 font-mono"
                  />
                </div>
              </div>

              {/* 6. Applicant Contact Details */}
              <div className="space-y-2 pt-2 border-t border-gray-100">
                <label className="block text-[11px] font-bold text-gray-700">
                  6. Applicant Contact Details <span className="text-rose-500">*</span>
                </label>
                <div className="grid grid-cols-2 gap-2">
                  <input
                    type="email"
                    placeholder="E-mail Address"
                    value={loanForm.email || userProfile?.email || ""}
                    onChange={e => setLoanForm({ ...loanForm, email: e.target.value })}
                    className="w-full px-3.5 py-2.5 border border-gray-200 rounded-xl text-xs outline-none focus:ring-2 focus:ring-emerald-500"
                  />
                  <input
                    type="tel"
                    maxLength={10}
                    placeholder="Phone Number"
                    value={loanForm.phone || userProfile?.phone || ""}
                    onChange={e => setLoanForm({ ...loanForm, phone: e.target.value.replace(/\D/g, "") })}
                    className="w-full px-3.5 py-2.5 border border-gray-200 rounded-xl text-xs outline-none focus:ring-2 focus:ring-emerald-500 font-mono"
                  />
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
              <div className="text-2xl font-black font-mono my-1">{activeBusinessLoan.accountNumber || "EFS0000001"}</div>
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
                min="1000"
                max={mblMaxLimit}
                step="1000"
                value={mblAmount}
                onChange={e => setMblForm({ ...mblForm, amount: Number(e.target.value) })}
                className="w-full accent-amber-600 cursor-pointer"
              />
              <div className="flex justify-between text-[10px] text-gray-400 mt-0.5">
                <span>Min ₹1,000</span>
                <span>Max ₹{mblMaxLimit.toLocaleString("en-IN")}</span>
              </div>
            </div>

            {/* Cheque Facility Toggle (₹20,000 with Cheque, ₹10,000 without) */}
            <div className="p-3.5 bg-amber-50/80 border border-amber-200 rounded-xl space-y-2">
              <label className="flex items-center gap-2 cursor-pointer text-xs font-bold text-amber-900">
                <input
                  type="checkbox"
                  checked={mblForm.hasChequeFacility}
                  onChange={e => {
                    const checked = e.target.checked;
                    setMblForm({
                      ...mblForm,
                      hasChequeFacility: checked,
                      amount: !checked && mblAmount > 10000 ? 10000 : mblAmount
                    });
                  }}
                  className="w-4 h-4 text-amber-600 rounded cursor-pointer"
                />
                <span>Cheque Facility Available (Check ke sath apply karein)</span>
              </label>
              <div className="text-[11px] font-semibold text-amber-800">
                {mblForm.hasChequeFacility
                  ? "✅ Cheque ke sath: Maximum ₹20,000 limit active"
                  : "ℹ️ Bina Cheque ke: Maximum ₹10,000 limit (₹20,000 ke liye check lagayein)"}
              </div>
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
            {/* All Mandatory Business Loan Verification Details */}
            <div className="space-y-3 pt-2 border-t border-gray-100">
              <div className="bg-amber-50/90 border border-amber-200/90 rounded-xl p-2.5 text-[11px] text-amber-900 font-semibold flex items-center gap-1.5">
                <span>⚠️</span>
                <span>Yeh sabhi dastavej (documents) aur details submit karna <strong>100% anivarya (mandatory)</strong> hai.</span>
              </div>

              {/* Shop / Business Name */}
              <div className="space-y-1">
                <label className="block text-[11px] font-bold text-gray-700">
                  Business / Shop Name <span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  placeholder="Dukan ya Business ka Naam"
                  value={mblForm.businessName}
                  onChange={e => setMblForm({ ...mblForm, businessName: e.target.value })}
                  className="w-full px-3.5 py-2.5 border border-gray-200 rounded-xl text-xs outline-none focus:ring-2 focus:ring-amber-500"
                />
              </div>

              {/* 1. Aadhaar Card Details */}
              <div className="space-y-1.5 pt-1">
                <label className="block text-[11px] font-bold text-gray-700">
                  1. Aadhaar Card Details <span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  maxLength={12}
                  placeholder="12-Digit Aadhaar Number"
                  value={mblForm.aadharNumber}
                  onChange={e => setMblForm({ ...mblForm, aadharNumber: e.target.value.replace(/\D/g, "") })}
                  className="w-full px-3.5 py-2.5 border border-gray-200 rounded-xl text-xs outline-none focus:ring-2 focus:ring-amber-500 font-mono tracking-wider"
                />
                {renderDocUploadBox("Aadhaar Card (Doc 1)", mblForm.doc1Url, mblForm.doc1BackUrl, setMblForm, "doc1Url", "doc1BackUrl", "amber")}
              </div>

              {/* 2. PAN Card Details */}
              <div className="space-y-1.5 pt-1">
                <label className="block text-[11px] font-bold text-gray-700">
                  2. PAN Card Details <span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  maxLength={10}
                  placeholder="10-Character PAN Number (ABCDE1234F)"
                  value={mblForm.panNumber}
                  onChange={e => setMblForm({ ...mblForm, panNumber: e.target.value.toUpperCase() })}
                  className="w-full px-3.5 py-2.5 border border-gray-200 rounded-xl text-xs outline-none focus:ring-2 focus:ring-amber-500 uppercase font-mono tracking-wider"
                />
                {renderDocUploadBox("PAN Card (Doc 2)", mblForm.doc2Url, mblForm.doc2BackUrl, setMblForm, "doc2Url", "doc2BackUrl", "amber")}
              </div>

              {/* 3. Barrier Cheque Details */}
              <div className="space-y-1.5 pt-1">
                <label className="block text-[11px] font-bold text-gray-700">
                  3. Barrier Cheque Details <span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  placeholder="Barrier Cheque Number (e.g. 000123)"
                  value={mblForm.chequeNumber}
                  onChange={e => setMblForm({ ...mblForm, chequeNumber: e.target.value })}
                  className="w-full px-3.5 py-2.5 border border-gray-200 rounded-xl text-xs outline-none focus:ring-2 focus:ring-amber-500 font-mono tracking-wider"
                />
                {renderDocUploadBox("Barrier Cheque (Doc 3)", mblForm.chequeUrl, mblForm.chequeBackUrl, setMblForm, "chequeUrl", "chequeBackUrl", "amber")}
              </div>

              {/* 4. Banking & UPI Details */}
              <div className="space-y-2 pt-2 border-t border-gray-100">
                <label className="block text-[11px] font-bold text-gray-700">
                  4. Bank & UPI Details (Disbursal Account) <span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  placeholder="Bank ka Naam (e.g. State Bank of India)"
                  value={mblForm.bankName}
                  onChange={e => setMblForm({ ...mblForm, bankName: e.target.value })}
                  className="w-full px-3.5 py-2.5 border border-gray-200 rounded-xl text-xs outline-none focus:ring-2 focus:ring-amber-500"
                />
                <div className="grid grid-cols-2 gap-2">
                  <input
                    type="text"
                    placeholder="Account Number"
                    value={mblForm.bankAccountNumber}
                    onChange={e => setMblForm({ ...mblForm, bankAccountNumber: e.target.value })}
                    className="w-full px-3.5 py-2.5 border border-gray-200 rounded-xl text-xs outline-none focus:ring-2 focus:ring-amber-500 font-mono"
                  />
                  <input
                    type="text"
                    placeholder="IFSC Code"
                    value={mblForm.bankIfsc}
                    onChange={e => setMblForm({ ...mblForm, bankIfsc: e.target.value.toUpperCase() })}
                    className="w-full px-3.5 py-2.5 border border-gray-200 rounded-xl text-xs outline-none focus:ring-2 focus:ring-amber-500 uppercase font-mono"
                  />
                </div>
                <input
                  type="text"
                  placeholder="UPI ID (e.g. 9876543210@paytm ya user@okhdfcbank)"
                  value={mblForm.upiId}
                  onChange={e => setMblForm({ ...mblForm, upiId: e.target.value })}
                  className="w-full px-3.5 py-2.5 border border-gray-200 rounded-xl text-xs outline-none focus:ring-2 focus:ring-amber-500 font-mono"
                />
              </div>

              {/* 5. Nominee Details */}
              <div className="space-y-2 pt-2 border-t border-gray-100">
                <label className="block text-[11px] font-bold text-gray-700">
                  5. Nominee Details <span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  placeholder="Nominee ka Pura Naam (Full Name)"
                  value={mblForm.nomineeName}
                  onChange={e => setMblForm({ ...mblForm, nomineeName: e.target.value })}
                  className="w-full px-3.5 py-2.5 border border-gray-200 rounded-xl text-xs outline-none focus:ring-2 focus:ring-amber-500"
                />
                <div className="grid grid-cols-2 gap-2">
                  <select
                    value={mblForm.nomineeRelation}
                    onChange={e => setMblForm({ ...mblForm, nomineeRelation: e.target.value })}
                    className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-xs outline-none focus:ring-2 focus:ring-amber-500 bg-white"
                  >
                    <option value="Father">Father (पिता)</option>
                    <option value="Mother">Mother (माता)</option>
                    <option value="Spouse">Spouse (पति / पत्नी)</option>
                    <option value="Brother">Brother (भाई)</option>
                    <option value="Sister">Sister (बहन)</option>
                    <option value="Son">Son (बेटा)</option>
                    <option value="Daughter">Daughter (बेटी)</option>
                    <option value="Other">Other (अन्य)</option>
                  </select>
                  <input
                    type="tel"
                    maxLength={10}
                    placeholder="Nominee Mobile (10 digits)"
                    value={mblForm.nomineePhone}
                    onChange={e => setMblForm({ ...mblForm, nomineePhone: e.target.value.replace(/\D/g, "") })}
                    className="w-full px-3.5 py-2.5 border border-gray-200 rounded-xl text-xs outline-none focus:ring-2 focus:ring-amber-500 font-mono"
                  />
                </div>
              </div>

              {/* 6. Applicant Contact Details */}
              <div className="space-y-2 pt-2 border-t border-gray-100">
                <label className="block text-[11px] font-bold text-gray-700">
                  6. Applicant Contact Details <span className="text-rose-500">*</span>
                </label>
                <div className="grid grid-cols-2 gap-2">
                  <input
                    type="email"
                    placeholder="E-mail Address"
                    value={mblForm.email || userProfile?.email || ""}
                    onChange={e => setMblForm({ ...mblForm, email: e.target.value })}
                    className="w-full px-3.5 py-2.5 border border-gray-200 rounded-xl text-xs outline-none focus:ring-2 focus:ring-amber-500"
                  />
                  <input
                    type="tel"
                    maxLength={10}
                    placeholder="Phone Number"
                    value={mblForm.phone || userProfile?.phone || ""}
                    onChange={e => setMblForm({ ...mblForm, phone: e.target.value.replace(/\D/g, "") })}
                    className="w-full px-3.5 py-2.5 border border-gray-200 rounded-xl text-xs outline-none focus:ring-2 focus:ring-amber-500 font-mono"
                  />
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

          {/* 365-DAY MULTI-UNIT FIXED BOND CREATION */}
          <div className="p-4 bg-emerald-50 border-2 border-emerald-300 rounded-2xl space-y-3 shadow-xs">
            <div className="flex justify-between items-start">
              <div>
                <h5 className="font-extrabold text-sm text-emerald-950 flex items-center gap-1.5">
                  <span>📜</span> 365-Day Fixed Bond (Multiple Units Allowed)
                </h5>
                <p className="text-xs text-emerald-800 mt-0.5">
                  1 Lakh, 2 Lakh, 3 Lakh ya multiple bonds lock karein. Har bond par guaranteed <strong>18% Profit</strong> maturity par Profit Wallet me credit hoga!
                </p>
              </div>
              <span className="px-2 py-0.5 bg-emerald-200 text-emerald-900 rounded-md font-black text-[10px] shrink-0 border border-emerald-300">
                18% PROFIT
              </span>
            </div>

            {/* Units Selector (1 Lakh, 2 Lakh, 3 Lakh, 5 Lakh) */}
            <div className="space-y-1.5 bg-white/80 p-3 rounded-xl border border-emerald-200">
              <div className="flex justify-between items-center text-xs font-bold text-emerald-950">
                <span>Select Bond Amount / Units:</span>
                <span className="text-emerald-700 font-extrabold font-mono">
                  {debitBondUnits} Unit ({debitBondUnits} Lakh = ₹{(debitBondUnits * 100000).toLocaleString("en-IN")})
                </span>
              </div>
              <div className="flex flex-wrap gap-1.5 items-center">
                {[1, 2, 3, 5].map(u => (
                  <button
                    key={u}
                    type="button"
                    onClick={() => setDebitBondUnits(u)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-black transition cursor-pointer ${
                      debitBondUnits === u
                        ? "bg-emerald-600 text-white shadow-xs"
                        : "bg-emerald-100/60 hover:bg-emerald-200/80 text-emerald-900 border border-emerald-200"
                    }`}
                  >
                    ₹{u} Lakh
                  </button>
                ))}
                <div className="flex items-center gap-1 bg-emerald-50 border border-emerald-300 rounded-lg px-2 py-1 ml-auto">
                  <button
                    type="button"
                    onClick={() => setDebitBondUnits(prev => Math.max(1, prev - 1))}
                    className="w-5 h-5 flex items-center justify-center bg-white text-emerald-900 font-black rounded text-xs hover:bg-emerald-100 cursor-pointer"
                  >
                    -
                  </button>
                  <span className="text-xs font-black text-emerald-950 px-1 font-mono">{debitBondUnits}L</span>
                  <button
                    type="button"
                    onClick={() => setDebitBondUnits(prev => prev + 1)}
                    className="w-5 h-5 flex items-center justify-center bg-white text-emerald-900 font-black rounded text-xs hover:bg-emerald-100 cursor-pointer"
                  >
                    +
                  </button>
                </div>
              </div>

              {/* Dynamic Maturity Breakdown */}
              <div className="pt-2 border-t border-emerald-100 flex justify-between items-center text-xs">
                <span className="text-gray-600">
                  Principal: <strong>₹{(debitBondUnits * 100000).toLocaleString("en-IN")}</strong>
                </span>
                <span className="text-emerald-800 font-black">
                  Maturity Payout: <span className="text-emerald-600 font-mono text-sm">₹{Math.round(debitBondUnits * 118000).toLocaleString("en-IN")}</span>
                </span>
              </div>
            </div>

            <button
              onClick={createDebitBond}
              className="w-full py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl font-bold text-xs shadow-sm transition active:scale-95 cursor-pointer"
            >
              Lock ₹{(debitBondUnits * 100000).toLocaleString("en-IN")} ({debitBondUnits} Lakh) Fixed Bond Now →
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
            <span className="text-xs text-blue-100 font-bold uppercase tracking-wider">Lending Monthly Bonds (Multi-Unit Supported)</span>
            <div className="text-2xl sm:text-3xl font-black font-display my-1">
              {lendingBondType === "lending_40"
                ? `₹${(3500 * lendingBondUnits).toLocaleString("en-IN")} / Month (40 Mo)`
                : `₹${(2500 * lendingBondUnits).toLocaleString("en-IN")} / Month (80 Mo)`}
            </div>
            <p className="text-xs text-blue-100">
              {lendingBondUnits} Lakh par {lendingBondType === "lending_40" ? `₹${(140000 * lendingBondUnits).toLocaleString("en-IN")}` : `₹${(200000 * lendingBondUnits).toLocaleString("en-IN")}`} total guaranteed returns. Multiple bonds allow hain!
            </p>
          </div>

          <div className="p-4 bg-indigo-50 border-2 border-indigo-200 rounded-2xl space-y-3">
            {/* Units Selector (1 Lakh, 2 Lakh, 3 Lakh, 5 Lakh) */}
            <div className="space-y-1.5 bg-white p-3 rounded-xl border border-indigo-200">
              <div className="flex justify-between items-center text-xs font-bold text-indigo-950">
                <span>Select Investment Amount / Units:</span>
                <span className="text-indigo-700 font-extrabold font-mono">
                  {lendingBondUnits} Unit ({lendingBondUnits} Lakh = ₹{(lendingBondUnits * 100000).toLocaleString("en-IN")})
                </span>
              </div>
              <div className="flex flex-wrap gap-1.5 items-center">
                {[1, 2, 3, 5].map(u => (
                  <button
                    key={u}
                    type="button"
                    onClick={() => setLendingBondUnits(u)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-black transition cursor-pointer ${
                      lendingBondUnits === u
                        ? "bg-indigo-600 text-white shadow-xs"
                        : "bg-indigo-50 hover:bg-indigo-100 text-indigo-900 border border-indigo-200"
                    }`}
                  >
                    ₹{u} Lakh
                  </button>
                ))}
                <div className="flex items-center gap-1 bg-indigo-50/70 border border-indigo-300 rounded-lg px-2 py-1 ml-auto">
                  <button
                    type="button"
                    onClick={() => setLendingBondUnits(prev => Math.max(1, prev - 1))}
                    className="w-5 h-5 flex items-center justify-center bg-white text-indigo-900 font-black rounded text-xs hover:bg-indigo-100 cursor-pointer"
                  >
                    -
                  </button>
                  <span className="text-xs font-black text-indigo-950 px-1 font-mono">{lendingBondUnits}L</span>
                  <button
                    type="button"
                    onClick={() => setLendingBondUnits(prev => prev + 1)}
                    className="w-5 h-5 flex items-center justify-center bg-white text-indigo-900 font-black rounded text-xs hover:bg-indigo-100 cursor-pointer"
                  >
                    +
                  </button>
                </div>
              </div>
            </div>

            <div className="text-xs font-bold text-indigo-900">Select Monthly Bond Option (₹{(lendingBondUnits * 100000).toLocaleString("en-IN")} Investment):</div>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setLendingBondType("lending_40")}
                className={`p-3 rounded-xl border text-center transition cursor-pointer ${
                  lendingBondType === "lending_40"
                    ? "bg-indigo-600 text-white border-indigo-600 shadow-md font-bold"
                    : "bg-white text-gray-700 border-gray-200 hover:bg-indigo-100"
                }`}
              >
                <div className="text-xs font-bold">40 Months</div>
                <div className="text-sm font-black mt-0.5">₹{(140000 * lendingBondUnits).toLocaleString("en-IN")} Return</div>
                <div className="text-[10px] opacity-80">₹{(3500 * lendingBondUnits).toLocaleString("en-IN")} / month</div>
              </button>
              <button
                type="button"
                onClick={() => setLendingBondType("lending_80")}
                className={`p-3 rounded-xl border text-center transition cursor-pointer ${
                  lendingBondType === "lending_80"
                    ? "bg-indigo-600 text-white border-indigo-600 shadow-md font-bold"
                    : "bg-white text-gray-700 border-gray-200 hover:bg-indigo-100"
                }`}
              >
                <div className="text-xs font-bold">80 Months</div>
                <div className="text-sm font-black mt-0.5">₹{(200000 * lendingBondUnits).toLocaleString("en-IN")} Return</div>
                <div className="text-[10px] opacity-80">₹{(2500 * lendingBondUnits).toLocaleString("en-IN")} / month</div>
              </button>
            </div>

            {/* MANDATORY DOCUMENTS FOR LENDING (SAME COMPULSORY SET AS LOANS) */}
            <div className="p-3.5 bg-white border border-indigo-100 rounded-xl space-y-3 shadow-2xs">
              <div className="flex items-center justify-between">
                <span className="text-xs font-black text-indigo-950 flex items-center gap-1.5">
                  <span>📑</span> Mandatory Lending Verification Documents
                </span>
                <span className="text-[9px] font-black uppercase tracking-wider text-rose-600 bg-rose-50 px-2 py-0.5 rounded border border-rose-200">
                  Compulsory 100%
                </span>
              </div>
              <p className="text-[11px] text-gray-500">
                Lending bond account open karne ke liye sabhi document dono taraf (Front & Back) photo ya camera scan ke sath anivarya hain.
              </p>

              {/* 1. Aadhaar Card */}
              <div className="space-y-1.5">
                <label className="text-[11px] font-bold text-gray-700 flex items-center justify-between">
                  <span>1. Aadhaar Card Number <span className="text-rose-500">*</span></span>
                  <span className="text-[10px] text-gray-400 font-mono">12 Digits</span>
                </label>
                <input
                  type="text"
                  maxLength={12}
                  placeholder="12-digit Aadhaar Number"
                  value={lendingForm.aadharNumber}
                  onChange={e => setLendingForm({ ...lendingForm, aadharNumber: e.target.value.replace(/\D/g, "") })}
                  className="w-full px-3.5 py-2.5 border border-gray-200 rounded-xl text-xs outline-none focus:ring-2 focus:ring-indigo-500 font-mono"
                />
                {renderDocUploadBox("Aadhaar Card (Doc 1)", lendingForm.doc1Url, lendingForm.doc1BackUrl, setLendingForm, "doc1Url", "doc1BackUrl", "cyan")}
              </div>

              {/* 2. PAN Card */}
              <div className="space-y-1.5">
                <label className="text-[11px] font-bold text-gray-700 flex items-center justify-between">
                  <span>2. PAN Card Number <span className="text-rose-500">*</span></span>
                  <span className="text-[10px] text-gray-400 font-mono">10 Characters</span>
                </label>
                <input
                  type="text"
                  maxLength={10}
                  placeholder="10-digit PAN (e.g. ABCDE1234F)"
                  value={lendingForm.panNumber}
                  onChange={e => setLendingForm({ ...lendingForm, panNumber: e.target.value.toUpperCase() })}
                  className="w-full px-3.5 py-2.5 border border-gray-200 rounded-xl text-xs outline-none focus:ring-2 focus:ring-indigo-500 uppercase font-mono"
                />
                {renderDocUploadBox("PAN Card (Doc 2)", lendingForm.doc2Url, lendingForm.doc2BackUrl, setLendingForm, "doc2Url", "doc2BackUrl", "cyan")}
              </div>

              {/* 3. Barrier Cheque */}
              <div className="space-y-1.5">
                <label className="text-[11px] font-bold text-gray-700 flex items-center justify-between">
                  <span>3. Barrier Cheque Number <span className="text-rose-500">*</span></span>
                  <span className="text-[10px] text-gray-400 font-mono">Cheque / Leaf No.</span>
                </label>
                <input
                  type="text"
                  placeholder="Barrier Cheque Number"
                  value={lendingForm.chequeNumber}
                  onChange={e => setLendingForm({ ...lendingForm, chequeNumber: e.target.value })}
                  className="w-full px-3.5 py-2.5 border border-gray-200 rounded-xl text-xs outline-none focus:ring-2 focus:ring-indigo-500 font-mono"
                />
                {renderDocUploadBox("Barrier Cheque (Doc 3)", lendingForm.chequeUrl, lendingForm.chequeBackUrl, setLendingForm, "chequeUrl", "chequeBackUrl", "cyan")}
              </div>

              {/* 4. Banking Details */}
              <div className="space-y-1.5 pt-1">
                <label className="text-[11px] font-bold text-gray-700">
                  4. Monthly Return Bank Account Details <span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  placeholder="Bank Name (e.g. State Bank of India, HDFC)"
                  value={lendingForm.bankName}
                  onChange={e => setLendingForm({ ...lendingForm, bankName: e.target.value })}
                  className="w-full px-3.5 py-2.5 border border-gray-200 rounded-xl text-xs outline-none focus:ring-2 focus:ring-indigo-500"
                />
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  <input
                    type="text"
                    placeholder="Bank Account Number"
                    value={lendingForm.bankAccountNumber}
                    onChange={e => setLendingForm({ ...lendingForm, bankAccountNumber: e.target.value })}
                    className="w-full px-3.5 py-2.5 border border-gray-200 rounded-xl text-xs outline-none focus:ring-2 focus:ring-indigo-500 font-mono"
                  />
                  <input
                    type="text"
                    placeholder="Bank IFSC Code"
                    value={lendingForm.bankIfsc}
                    onChange={e => setLendingForm({ ...lendingForm, bankIfsc: e.target.value.toUpperCase() })}
                    className="w-full px-3.5 py-2.5 border border-gray-200 rounded-xl text-xs outline-none focus:ring-2 focus:ring-indigo-500 uppercase font-mono"
                  />
                </div>
              </div>

              {/* 5. UPI Details */}
              <div className="space-y-1.5">
                <label className="text-[11px] font-bold text-gray-700">
                  5. UPI ID for Payout / Backup <span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  placeholder="UPI ID (e.g. name@okhdfcbank, 9876543210@paytm)"
                  value={lendingForm.upiId}
                  onChange={e => setLendingForm({ ...lendingForm, upiId: e.target.value })}
                  className="w-full px-3.5 py-2.5 border border-gray-200 rounded-xl text-xs outline-none focus:ring-2 focus:ring-indigo-500 font-mono"
                />
              </div>

              {/* 6. Nominee Details */}
              <div className="space-y-1.5">
                <label className="text-[11px] font-bold text-gray-700">
                  6. Nominee Details (Secured Nominee) <span className="text-rose-500">*</span>
                </label>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                  <input
                    type="text"
                    placeholder="Nominee Full Name"
                    value={lendingForm.nomineeName}
                    onChange={e => setLendingForm({ ...lendingForm, nomineeName: e.target.value })}
                    className="w-full px-3.5 py-2.5 border border-gray-200 rounded-xl text-xs outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                  <select
                    value={lendingForm.nomineeRelation}
                    onChange={e => setLendingForm({ ...lendingForm, nomineeRelation: e.target.value })}
                    className="w-full px-3.5 py-2.5 border border-gray-200 rounded-xl text-xs outline-none focus:ring-2 focus:ring-indigo-500 bg-white"
                  >
                    <option value="Father">Father</option>
                    <option value="Mother">Mother</option>
                    <option value="Spouse">Spouse</option>
                    <option value="Brother">Brother</option>
                    <option value="Sister">Sister</option>
                    <option value="Son">Son</option>
                    <option value="Daughter">Daughter</option>
                    <option value="Other">Other</option>
                  </select>
                  <input
                    type="tel"
                    maxLength={10}
                    placeholder="Nominee 10-digit Phone"
                    value={lendingForm.nomineePhone}
                    onChange={e => setLendingForm({ ...lendingForm, nomineePhone: e.target.value.replace(/\D/g, "") })}
                    className="w-full px-3.5 py-2.5 border border-gray-200 rounded-xl text-xs outline-none focus:ring-2 focus:ring-indigo-500 font-mono"
                  />
                </div>
              </div>

              {/* 7. Contact Details */}
              <div className="space-y-1.5">
                <label className="text-[11px] font-bold text-gray-700">
                  7. Investor Contact Verification <span className="text-rose-500">*</span>
                </label>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  <input
                    type="email"
                    placeholder="E-mail Address"
                    value={lendingForm.email || userProfile?.email || ""}
                    onChange={e => setLendingForm({ ...lendingForm, email: e.target.value })}
                    className="w-full px-3.5 py-2.5 border border-gray-200 rounded-xl text-xs outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                  <input
                    type="tel"
                    maxLength={10}
                    placeholder="10-digit Phone Number"
                    value={lendingForm.phone || userProfile?.phone || ""}
                    onChange={e => setLendingForm({ ...lendingForm, phone: e.target.value.replace(/\D/g, "") })}
                    className="w-full px-3.5 py-2.5 border border-gray-200 rounded-xl text-xs outline-none focus:ring-2 focus:ring-indigo-500 font-mono"
                  />
                </div>
              </div>
            </div>

            <button
              onClick={() => createLendingBond(lendingBondType)}
              className="w-full py-3 bg-gradient-to-r from-indigo-600 to-blue-600 hover:from-indigo-700 hover:to-blue-700 text-white rounded-xl font-black text-xs shadow-md shadow-indigo-500/25 transition active:scale-95 cursor-pointer"
            >
              Invest ₹{(lendingBondUnits * 100000).toLocaleString("en-IN")} in {lendingBondType === "lending_40" ? `40M (₹${(3500 * lendingBondUnits).toLocaleString("en-IN")}/mo)` : `80M (₹${(2500 * lendingBondUnits).toLocaleString("en-IN")}/mo)`} Lending Bond →
            </button>
          </div>

          {/* LENDING MONTHLY PAYOUTS & CREDITS HISTORY */}
          <div className="space-y-2 border-t border-gray-100 pt-3">
            <div className="flex justify-between items-center">
              <h5 className="text-xs font-bold text-indigo-900 uppercase">Monthly Payouts & Credits Ledger</h5>
              <span className="text-[10px] text-gray-400 font-semibold">Automatic Monthly Credits</span>
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
                        <div className="flex items-center gap-1.5">
                          <span className="text-indigo-950">{b.bondType === "lending_40" ? "40 Months Bond" : "80 Months Bond"}</span>
                          {b.accountNumber && (
                            <span className="px-2 py-0.5 rounded-md text-[10px] font-mono font-bold bg-indigo-100 text-indigo-900 border border-indigo-200">
                              {b.accountNumber}
                            </span>
                          )}
                        </div>
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
      <Sheet open={accountModal === "wallet"} onClose={closeModal} title={txt.walletAccount || "Wallet Account"} icon="💰">
        <div className="space-y-4">
          <div className="bg-gradient-to-r from-blue-600 to-indigo-700 rounded-2xl p-5 text-white shadow-md">
            <div className="flex justify-between items-center mb-1">
              <span className="text-xs text-blue-100 font-bold uppercase tracking-wider">{txt.primaryBalance || "Available Cash Balance"}</span>
              <span className="px-2.5 py-0.5 rounded-full text-[11px] font-mono font-black bg-white/20 text-white">
                A/C: {userProfile.accountNumber || "EFS0000001"}
              </span>
            </div>
            <div className="text-3xl font-black font-display my-1">
              {loadingDashboard && balance === 0 ? (
                <span className="inline-block h-9 w-32 bg-white/20 rounded-lg animate-pulse" />
              ) : (
                `₹${balance.toLocaleString("en-IN")}`
              )}
            </div>
            <p className="text-xs text-blue-100">Ready for instant UPI, recharge aur withdrawal</p>
          </div>

          {/* Bank Passbook Summary */}
          <div className="p-4 bg-slate-50 border border-slate-200 rounded-2xl space-y-3 text-xs">
            <div className="flex items-center justify-between pb-2 border-b border-slate-200">
              <div className="flex items-center gap-2">
                <span className="text-base">🏛️</span>
                <div>
                  <h4 className="font-extrabold text-gray-900">{txt.bankCardTitle}</h4>
                  <p className="text-[11px] text-gray-500">{txt.branchName} • IFSC: EFS0000JHAL</p>
                </div>
              </div>
              <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-800">
                ✓ Active
              </span>
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between p-2.5 bg-white rounded-xl border border-gray-200">
                <div>
                  <span className="text-[10px] text-gray-400 font-bold uppercase block">{txt.accountNumberLabel}</span>
                  <span className="font-mono font-bold text-sm text-gray-900">{userProfile.accountNumber || "EFS0000001"}</span>
                </div>
                <button
                  type="button"
                  onClick={() => copyToClipboard(userProfile.accountNumber || "EFS0000001", "w_acc")}
                  className="px-2.5 py-1 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 rounded-lg text-[11px] font-bold transition cursor-pointer active:scale-95"
                >
                  {copiedField === "w_acc" ? "✓ " + txt.copied : "📋 " + txt.copy}
                </button>
              </div>

              <div className="flex items-center justify-between p-2.5 bg-white rounded-xl border border-gray-200">
                <div>
                  <span className="text-[10px] text-gray-400 font-bold uppercase block">{txt.ifscLabel}</span>
                  <span className="font-mono font-bold text-sm text-amber-700">EFS0000JHAL</span>
                </div>
                <button
                  type="button"
                  onClick={() => copyToClipboard("EFS0000JHAL", "w_ifsc")}
                  className="px-2.5 py-1 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 rounded-lg text-[11px] font-bold transition cursor-pointer active:scale-95"
                >
                  {copiedField === "w_ifsc" ? "✓ " + txt.copied : "📋 " + txt.copy}
                </button>
              </div>

              <div className="flex items-center justify-between p-2.5 bg-white rounded-xl border border-gray-200">
                <div>
                  <span className="text-[10px] text-gray-400 font-bold uppercase block">{txt.upiIdLabel}</span>
                  <span className="font-mono font-bold text-xs text-emerald-700">{userProfile.upiId || ((userProfile.accountNumber || "efs0000001").toLowerCase() + "@educa")}</span>
                </div>
                <button
                  type="button"
                  onClick={() => copyToClipboard(userProfile.upiId || ((userProfile.accountNumber || "efs0000001").toLowerCase() + "@educa"), "w_upi")}
                  className="px-2.5 py-1 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 rounded-lg text-[11px] font-bold transition cursor-pointer active:scale-95"
                >
                  {copiedField === "w_upi" ? "✓ " + txt.copied : "📋 " + txt.copy}
                </button>
              </div>
            </div>

            <button
              type="button"
              onClick={shareFullBankDetails}
              className="w-full py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl font-bold text-xs transition flex items-center justify-center gap-1.5 cursor-pointer shadow-xs active:scale-95"
            >
              <svg className="w-3.5 h-3.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.368 2.684 3 3 0 00-5.368-2.684z" />
              </svg>
              <span>{txt.shareBankDetails}</span>
            </button>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <button onClick={() => { setAccountModal(null); setModal("deposit"); }} className="py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-bold text-xs transition cursor-pointer active:scale-95">
              + {txt.addMoney || "Add Funds"}
            </button>
            <button onClick={() => { setAccountModal(null); setModal("withdraw"); }} className="py-2.5 bg-gray-100 hover:bg-gray-200 text-gray-900 rounded-xl font-bold text-xs transition cursor-pointer active:scale-95">
              ↓ {txt.cashOut || "Withdraw Cash"}
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
                {activeStudentLoan.accountNumber || "EFS0000001"}
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

            {activeStudentLoan.status === "active" && (() => {
              const studentSchedule = activeStudentLoan.installmentSchedule || [];
              const studentPaidCount = studentSchedule.filter(s => s.status === 'paid').length;
              const isPrecloseEligible = studentPaidCount < 9 && studentTotalCount > 15;
              const xPercent = isPrecloseEligible ? Math.max(0, studentTotalCount - 15) : 0;
              const totalPool = (activeStudentLoan.amount * xPercent) / 100;
              const userDiscount = isPrecloseEligible ? Math.round(totalPool / 3) : 0;
              const basePayoff = (studentPaidCount < 15
                ? (Math.min(15, studentTotalCount) - studentPaidCount) * studentInstAmt
                : (activeStudentLoan.remainingAmount || activeStudentLoan.amount));
              const studentPayoff = Math.max(0, basePayoff - userDiscount) + studentPenalty;
              const studentNextDue = studentInstAmt + studentPenalty;

              return (
                <div className="space-y-2">
                  {studentPenalty > 0 && (
                    <div className="p-2.5 bg-rose-50 border border-rose-200 rounded-xl text-xs text-rose-700">
                      ⚠️ Overdue Penalty Due: <strong>₹{studentPenalty}</strong> (Pehle penalty clear hogi)
                    </div>
                  )}
                  {userDiscount > 0 && (
                    <div className="p-2.5 bg-emerald-50 border border-emerald-200 rounded-xl text-xs text-emerald-800 font-medium">
                      🎉 Early Settlement Offer: Samay se pehle band karne par <strong>₹{userDiscount.toLocaleString("en-IN")} ka fayda (chhoot)</strong> milega!
                    </div>
                  )}
                  <button
                    type="button"
                    onClick={() => setSubmitInstallmentModal({
                      loanId: activeStudentLoan._id,
                      installmentNo: (activeStudentLoan.installmentsPaidCount || 0) + 1,
                      amount: studentNextDue
                    })}
                    className="w-full py-3 bg-cyan-600 hover:bg-cyan-700 text-white rounded-xl font-bold text-xs shadow-md active:scale-95 transition cursor-pointer"
                  >
                    Pay Next Installment (₹{studentNextDue}{studentPenalty > 0 ? ` incl ₹${studentPenalty} penalty` : ""}) →
                  </button>
                  <button
                    type="button"
                    onClick={() => closeLoanEarly(activeStudentLoan._id, studentPayoff, userDiscount, xPercent)}
                    className="w-full py-2.5 bg-gray-100 hover:bg-gray-200 text-gray-800 rounded-xl font-bold text-xs transition cursor-pointer"
                  >
                    ⚡ Close Loan Early (15-Kist Payoff ₹{studentPayoff.toLocaleString("en-IN")}{userDiscount > 0 ? ` • ₹${userDiscount} Fayda` : ""})
                  </button>
                </div>
              );
            })()}
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
                max="24"
                step="1"
                value={studentCount}
                onChange={e => setStudentLoanForm({ ...studentLoanForm, installmentsCount: Number(e.target.value) })}
                className="w-full accent-cyan-600 cursor-pointer"
              />
              <div className="flex justify-between text-[10px] text-gray-400 mt-0.5">
                <span>Min 15 Installments</span>
                <span>Max 24 Installments</span>
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

            {/* All Mandatory Student Loan Verification Details */}
            <div className="space-y-3 pt-2 border-t border-gray-100">
              <div className="bg-amber-50/90 border border-amber-200/90 rounded-xl p-2.5 text-[11px] text-amber-900 font-semibold flex items-center gap-1.5">
                <span>⚠️</span>
                <span>Yeh sabhi dastavej (documents) aur details submit karna <strong>100% anivarya (mandatory)</strong> hai.</span>
              </div>

              {/* School / College / Institute Name */}
              <div className="space-y-1">
                <label className="block text-[11px] font-bold text-gray-700">
                  School / College / Institute Name <span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  placeholder="Institute ka Naam"
                  value={studentLoanForm.instituteName}
                  onChange={e => setStudentLoanForm({ ...studentLoanForm, instituteName: e.target.value })}
                  className="w-full px-3.5 py-2.5 border border-gray-200 rounded-xl text-xs outline-none focus:ring-2 focus:ring-cyan-500"
                />
              </div>

              {/* 1. Aadhaar Card Details */}
              <div className="space-y-1.5 pt-1">
                <label className="block text-[11px] font-bold text-gray-700">
                  1. Aadhaar Card Details <span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  maxLength={12}
                  placeholder="12-Digit Aadhaar Number"
                  value={studentLoanForm.aadharNumber}
                  onChange={e => setStudentLoanForm({ ...studentLoanForm, aadharNumber: e.target.value.replace(/\D/g, "") })}
                  className="w-full px-3.5 py-2.5 border border-gray-200 rounded-xl text-xs outline-none focus:ring-2 focus:ring-cyan-500 font-mono tracking-wider"
                />
                {renderDocUploadBox("Aadhaar Card (Doc 1)", studentLoanForm.doc1Url, studentLoanForm.doc1BackUrl, setStudentLoanForm, "doc1Url", "doc1BackUrl", "cyan")}
              </div>

              {/* 2. PAN Card Details */}
              <div className="space-y-1.5 pt-1">
                <label className="block text-[11px] font-bold text-gray-700">
                  2. PAN Card Details <span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  maxLength={10}
                  placeholder="10-Character PAN Number (ABCDE1234F)"
                  value={studentLoanForm.panNumber}
                  onChange={e => setStudentLoanForm({ ...studentLoanForm, panNumber: e.target.value.toUpperCase() })}
                  className="w-full px-3.5 py-2.5 border border-gray-200 rounded-xl text-xs outline-none focus:ring-2 focus:ring-cyan-500 uppercase font-mono tracking-wider"
                />
                {renderDocUploadBox("PAN Card (Doc 2)", studentLoanForm.doc2Url, studentLoanForm.doc2BackUrl, setStudentLoanForm, "doc2Url", "doc2BackUrl", "cyan")}
              </div>

              {/* 3. Barrier Cheque Details */}
              <div className="space-y-1.5 pt-1">
                <label className="block text-[11px] font-bold text-gray-700">
                  3. Barrier Cheque Details <span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  placeholder="Barrier Cheque Number (e.g. 000123)"
                  value={studentLoanForm.chequeNumber}
                  onChange={e => setStudentLoanForm({ ...studentLoanForm, chequeNumber: e.target.value })}
                  className="w-full px-3.5 py-2.5 border border-gray-200 rounded-xl text-xs outline-none focus:ring-2 focus:ring-cyan-500 font-mono tracking-wider"
                />
                {renderDocUploadBox("Barrier Cheque (Doc 3)", studentLoanForm.chequeUrl, studentLoanForm.chequeBackUrl, setStudentLoanForm, "chequeUrl", "chequeBackUrl", "cyan")}
              </div>

              {/* 4. Student ID / Fee Slip Details */}
              <div className="space-y-1.5 pt-1">
                <label className="block text-[11px] font-bold text-gray-700">
                  4. Student ID / Fee Slip (Proof) <span className="text-rose-500">*</span>
                </label>
                {renderDocUploadBox("Student ID / Fee Slip", studentLoanForm.studentProofUrl, studentLoanForm.studentProofBackUrl, setStudentLoanForm, "studentProofUrl", "studentProofBackUrl", "cyan")}
              </div>

              {/* 5. Banking & UPI Details */}
              <div className="space-y-2 pt-2 border-t border-gray-100">
                <label className="block text-[11px] font-bold text-gray-700">
                  5. Bank & UPI Details (Disbursal Account) <span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  placeholder="Bank ka Naam (e.g. State Bank of India)"
                  value={studentLoanForm.bankName}
                  onChange={e => setStudentLoanForm({ ...studentLoanForm, bankName: e.target.value })}
                  className="w-full px-3.5 py-2.5 border border-gray-200 rounded-xl text-xs outline-none focus:ring-2 focus:ring-cyan-500"
                />
                <div className="grid grid-cols-2 gap-2">
                  <input
                    type="text"
                    placeholder="Account Number"
                    value={studentLoanForm.bankAccountNumber}
                    onChange={e => setStudentLoanForm({ ...studentLoanForm, bankAccountNumber: e.target.value })}
                    className="w-full px-3.5 py-2.5 border border-gray-200 rounded-xl text-xs outline-none focus:ring-2 focus:ring-cyan-500 font-mono"
                  />
                  <input
                    type="text"
                    placeholder="IFSC Code"
                    value={studentLoanForm.bankIfsc}
                    onChange={e => setStudentLoanForm({ ...studentLoanForm, bankIfsc: e.target.value.toUpperCase() })}
                    className="w-full px-3.5 py-2.5 border border-gray-200 rounded-xl text-xs outline-none focus:ring-2 focus:ring-cyan-500 uppercase font-mono"
                  />
                </div>
                <input
                  type="text"
                  placeholder="UPI ID (e.g. 9876543210@paytm ya user@okhdfcbank)"
                  value={studentLoanForm.upiId}
                  onChange={e => setStudentLoanForm({ ...studentLoanForm, upiId: e.target.value })}
                  className="w-full px-3.5 py-2.5 border border-gray-200 rounded-xl text-xs outline-none focus:ring-2 focus:ring-cyan-500 font-mono"
                />
              </div>

              {/* 6. Nominee Details */}
              <div className="space-y-2 pt-2 border-t border-gray-100">
                <label className="block text-[11px] font-bold text-gray-700">
                  6. Nominee Details <span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  placeholder="Nominee ka Pura Naam (Full Name)"
                  value={studentLoanForm.nomineeName}
                  onChange={e => setStudentLoanForm({ ...studentLoanForm, nomineeName: e.target.value })}
                  className="w-full px-3.5 py-2.5 border border-gray-200 rounded-xl text-xs outline-none focus:ring-2 focus:ring-cyan-500"
                />
                <div className="grid grid-cols-2 gap-2">
                  <select
                    value={studentLoanForm.nomineeRelation}
                    onChange={e => setStudentLoanForm({ ...studentLoanForm, nomineeRelation: e.target.value })}
                    className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-xs outline-none focus:ring-2 focus:ring-cyan-500 bg-white"
                  >
                    <option value="Father">Father (पिता)</option>
                    <option value="Mother">Mother (माता)</option>
                    <option value="Spouse">Spouse (पति / पत्नी)</option>
                    <option value="Brother">Brother (भाई)</option>
                    <option value="Sister">Sister (बहन)</option>
                    <option value="Son">Son (बेटा)</option>
                    <option value="Daughter">Daughter (बेटी)</option>
                    <option value="Other">Other (अन्य)</option>
                  </select>
                  <input
                    type="tel"
                    maxLength={10}
                    placeholder="Nominee Mobile (10 digits)"
                    value={studentLoanForm.nomineePhone}
                    onChange={e => setStudentLoanForm({ ...studentLoanForm, nomineePhone: e.target.value.replace(/\D/g, "") })}
                    className="w-full px-3.5 py-2.5 border border-gray-200 rounded-xl text-xs outline-none focus:ring-2 focus:ring-cyan-500 font-mono"
                  />
                </div>
              </div>

              {/* 7. Applicant Contact Details */}
              <div className="space-y-2 pt-2 border-t border-gray-100">
                <label className="block text-[11px] font-bold text-gray-700">
                  7. Applicant Contact Details <span className="text-rose-500">*</span>
                </label>
                <div className="grid grid-cols-2 gap-2">
                  <input
                    type="email"
                    placeholder="E-mail Address"
                    value={studentLoanForm.email || userProfile?.email || ""}
                    onChange={e => setStudentLoanForm({ ...studentLoanForm, email: e.target.value })}
                    className="w-full px-3.5 py-2.5 border border-gray-200 rounded-xl text-xs outline-none focus:ring-2 focus:ring-cyan-500"
                  />
                  <input
                    type="tel"
                    maxLength={10}
                    placeholder="Phone Number"
                    value={studentLoanForm.phone || userProfile?.phone || ""}
                    onChange={e => setStudentLoanForm({ ...studentLoanForm, phone: e.target.value.replace(/\D/g, "") })}
                    className="w-full px-3.5 py-2.5 border border-gray-200 rounded-xl text-xs outline-none focus:ring-2 focus:ring-cyan-500 font-mono"
                  />
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

          {/* 5-DAY UPCOMING DUE ALERT BANNER (FROM ACTIVE DETAILS OR LOANS SCHEDULE) */}
          {(upcomingDueInstallment || (activeLoanDetails?.isUpcomingSoon && activeLoanDetails?.nextInstallment)) && (() => {
            const dueLoanId = upcomingDueInstallment?.loan?._id || activeLoanDetails?.loan?._id || loans[0]?._id;
            const dueInstNo = upcomingDueInstallment?.installmentNo || activeLoanDetails?.nextInstallment?.installmentNo || 1;
            const dueAmt = upcomingDueInstallment?.amount || activeLoanDetails?.nextInstallment?.amount || 0;
            const dueDays = upcomingDueInstallment ? upcomingDueInstallment.daysLeft : activeLoanDetails?.daysUntilDue;
            const dueDate = upcomingDueInstallment?.dueDate || activeLoanDetails?.nextInstallment?.dueDate;

            return (
              <div className="p-3.5 bg-gradient-to-r from-amber-500 via-amber-400 to-yellow-400 border border-amber-500 rounded-2xl space-y-2 text-slate-950 shadow-md">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="text-xl animate-bounce">⏰</span>
                    <span className="font-black text-xs uppercase tracking-wide text-slate-950">
                      Installment Due Alert (#{dueInstNo})
                    </span>
                  </div>
                  <span className="px-2 py-0.5 rounded-full text-[10px] font-black bg-slate-950 text-amber-300 uppercase">
                    Due Alert
                  </span>
                </div>
                <p className="text-xs font-bold text-slate-900 leading-snug">
                  {dueDays <= 0
                    ? `Aapki kist (₹${dueAmt}) ka din aa gaya hai! Kripya abhi bhar dijiye.`
                    : `Aapki kist (₹${dueAmt}) bharne me sirf ${dueDays} din bache hain (${dueDate ? new Date(dueDate).toLocaleDateString("en-IN") : "Upcoming"}). Kripya time par bhar dijiye!`
                  }
                </p>
                <button
                  type="button"
                  onClick={() => {
                    triggerHeroFly("pay_upcoming");
                    setSubmitInstallmentModal({
                      loanId: dueLoanId,
                      installmentNo: dueInstNo,
                      amount: dueAmt
                    });
                  }}
                  className="relative overflow-visible w-full py-2.5 bg-slate-950 hover:bg-slate-900 text-amber-300 rounded-xl text-xs font-black shadow-md active:scale-95 transition cursor-pointer flex items-center justify-center gap-1.5"
                >
                  {heroFlyId === "pay_upcoming" && <LoanHeroFlyBadge />}
                  <span>Pay Installment Now (₹{dueAmt}) →</span>
                </button>
              </div>
            );
          })()}

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
                  const isDaily = l.collectionFrequency === "daily" || l.loanType === "micro_business";
                  const isStudent = l.loanType === "student";
                  const isExpanded = expandedLoanId === l._id;
                  const penaltyAmt = l.penaltyDue || 0;
                  const isPrecloseEligible = !isDaily && paidCount < 9 && totalCount > 15;
                  const xPercent = isPrecloseEligible ? Math.max(0, totalCount - 15) : 0;
                  const totalPool = (l.amount * xPercent) / 100;
                  const userDiscount = isPrecloseEligible ? Math.round(totalPool / 3) : 0;
                  const basePayoff = (!isDaily && paidCount < 15
                    ? (Math.min(15, totalCount) - paidCount) * instAmt
                    : (l.remainingAmount ?? (l.totalPayable ? Math.max(0, l.totalPayable - (l.paidAmount || 0)) : l.amount)));
                  const payoffAmt = Math.max(0, basePayoff - userDiscount) + penaltyAmt;

                  return (
                    <div key={l._id} className="p-4 bg-white border border-gray-200 rounded-2xl shadow-xs space-y-3">
                      <div className="flex justify-between items-start">
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="font-mono font-bold text-xs bg-slate-100 text-slate-800 px-2 py-0.5 rounded-lg border border-slate-200">
                              {l.accountNumber || "EFS0000001"}
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
                      {l.status === "active" && (() => {
                        const nextInst = schedule.find(s => s.status === "overdue") || schedule.find(s => s.status === "pending") || { installmentNo: paidCount + 1, amount: instAmt };
                        const totalNextDue = (nextInst.amount || instAmt) + penaltyAmt;
                        return (
                          <div className="space-y-2 pt-1">
                            {penaltyAmt > 0 && (
                              <div className="p-2 bg-rose-50 border border-rose-200 rounded-xl text-xs text-rose-700">
                                ⚠️ Overdue Penalty Due: <strong>₹{penaltyAmt}</strong> (Pehle penalty clear hogi)
                              </div>
                            )}
                            {userDiscount > 0 && (
                              <div className="p-2 bg-emerald-50 border border-emerald-200 rounded-xl text-xs text-emerald-800 font-medium flex items-center justify-between">
                                <span>🎉 Early Settlement Offer: <strong>₹{userDiscount.toLocaleString("en-IN")} ki Chhoot (Fayda)</strong></span>
                                <span className="text-[10px] font-bold bg-emerald-200 text-emerald-900 px-2 py-0.5 rounded-full">Fayda Active</span>
                              </div>
                            )}
                            <div className="flex gap-2">
                              <button
                                type="button"
                                onClick={() => {
                                  triggerHeroFly("pay_kist_" + l._id);
                                  setSubmitInstallmentModal({
                                    loanId: l._id,
                                    installmentNo: nextInst.installmentNo,
                                    amount: totalNextDue
                                  });
                                }}
                                className="relative overflow-visible flex-1 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-bold text-xs shadow-xs active:scale-95 transition cursor-pointer flex items-center justify-center gap-1.5"
                              >
                                {heroFlyId === ("pay_kist_" + l._id) && <LoanHeroFlyBadge />}
                                <span>Pay Kist ₹{totalNextDue}{penaltyAmt > 0 ? ` (incl ₹${penaltyAmt} penalty)` : ""} →</span>
                              </button>
                              <button
                                type="button"
                                onClick={() => closeLoanEarly(l._id, payoffAmt, userDiscount, xPercent)}
                                className="px-3 py-2.5 bg-emerald-50 hover:bg-emerald-100 text-emerald-800 border border-emerald-300 rounded-xl font-bold text-xs active:scale-95 transition cursor-pointer"
                                title="Close loan early with 15-installment payoff"
                              >
                                ⚡ 15-Kist Payoff (₹{payoffAmt}){userDiscount > 0 ? ` [₹${userDiscount} Fayda]` : ""}
                              </button>
                            </div>
                          </div>
                        );
                      })()}

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
        <div className="bg-gradient-to-br from-slate-900 to-indigo-950 text-white rounded-2xl p-4 mb-4 shadow-lg border border-indigo-800/40 space-y-3">
          <div className="flex items-center justify-between pb-2 border-b border-white/10">
            <div className="flex items-center gap-2">
              <span className="text-lg">🏦</span>
              <div>
                <p className="text-[10px] text-indigo-300 font-bold uppercase tracking-wider">Official Deposit Account</p>
                <p className="text-xs font-black">{depositDetails.bankName || "Bank of Baroda"}</p>
              </div>
            </div>
            <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 font-bold border border-emerald-400/30">
              Verified Self-Deposit
            </span>
          </div>

          {depForm.method === "upi" ? (
            <div className="bg-white/10 backdrop-blur-md rounded-xl p-3 space-y-2 border border-white/10">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-[10px] text-gray-300 uppercase font-semibold">Admin UPI ID</p>
                  <p className="font-mono font-bold text-sm text-cyan-300 select-all">{depositDetails.upiId}</p>
                  <p className="text-[10px] text-gray-400 font-medium">{depositDetails.upiName}</p>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    copyToClipboard(depositDetails.upiId);
                    setCopiedDepField("UPI ID");
                    showToast(`Copied UPI ID: ${depositDetails.upiId}`, "success");
                    setTimeout(() => setCopiedDepField(""), 2000);
                  }}
                  className="px-3 py-1.5 bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-black text-xs rounded-lg shadow-sm transition active:scale-95 flex items-center gap-1"
                >
                  {copiedDepField === "UPI ID" ? "✓ Copied" : "Copy UPI"}
                </button>
              </div>
              {depForm.amount && Number(depForm.amount) >= 100 && (
                <a
                  href={`upi://pay?pa=${encodeURIComponent(depositDetails.upiId)}&pn=${encodeURIComponent(depositDetails.upiName || "Educa")}&am=${depForm.amount}&cu=INR`}
                  className="w-full py-2 bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-400 hover:to-teal-400 text-slate-950 font-black text-xs rounded-lg flex items-center justify-center gap-1 shadow transition"
                >
                  ⚡ Open GPay / PhonePe / Paytm to Pay ₹{depForm.amount}
                </a>
              )}
            </div>
          ) : (
            <div className="bg-white/10 backdrop-blur-md rounded-xl p-3 space-y-2.5 border border-white/10 text-xs">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-[10px] text-gray-300 uppercase font-semibold">Account Number</p>
                  <p className="font-mono font-bold text-sm text-cyan-300 select-all">{depositDetails.accountNumber}</p>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    copyToClipboard(depositDetails.accountNumber);
                    setCopiedDepField("Account No");
                    showToast(`Copied Account No: ${depositDetails.accountNumber}`, "success");
                    setTimeout(() => setCopiedDepField(""), 2000);
                  }}
                  className="px-2.5 py-1 bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-bold text-[11px] rounded-lg transition"
                >
                  {copiedDepField === "Account No" ? "✓ Copied" : "Copy A/C"}
                </button>
              </div>
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-[10px] text-gray-300 uppercase font-semibold">IFSC Code</p>
                  <p className="font-mono font-bold text-xs text-white">{depositDetails.ifsc}</p>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    copyToClipboard(depositDetails.ifsc);
                    setCopiedDepField("IFSC");
                    showToast(`Copied IFSC: ${depositDetails.ifsc}`, "success");
                    setTimeout(() => setCopiedDepField(""), 2000);
                  }}
                  className="px-2.5 py-1 bg-white/20 hover:bg-white/30 text-white font-bold text-[11px] rounded-lg transition"
                >
                  {copiedDepField === "IFSC" ? "✓ Copied" : "Copy IFSC"}
                </button>
              </div>
              <div className="grid grid-cols-2 gap-2 text-[11px] text-gray-300 pt-1 border-t border-white/10">
                <div>
                  <span className="text-[10px] text-gray-400 block">Branch:</span>
                  <span className="font-medium text-white">{depositDetails.branch || "Jhalwa Branch"}</span>
                </div>
                <div>
                  <span className="text-[10px] text-gray-400 block">Beneficiary:</span>
                  <span className="font-medium text-white">{depositDetails.accountHolder || "Educa Admin"}</span>
                </div>
              </div>
            </div>
          )}

          <p className="text-[11px] text-indigo-200">
            ℹ️ {depositDetails.instructions || "Payment karne ke baad apna 12-digit UTR number enter karein."}
          </p>
        </div>

        <div className="space-y-3">
          <div>
            <label className="text-xs font-bold text-gray-700 block mb-1">Payment Method</label>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setDepForm({ ...depForm, method: "upi" })}
                className={`py-2.5 px-3 rounded-xl border text-xs font-bold flex items-center justify-center gap-2 transition ${
                  depForm.method === "upi"
                    ? "bg-blue-50 border-blue-600 text-blue-700 shadow-xs"
                    : "bg-white border-gray-200 text-gray-600 hover:bg-gray-50"
                }`}
              >
                <span>⚡</span> UPI Payment
              </button>
              <button
                type="button"
                onClick={() => setDepForm({ ...depForm, method: "bank" })}
                className={`py-2.5 px-3 rounded-xl border text-xs font-bold flex items-center justify-center gap-2 transition ${
                  depForm.method === "bank"
                    ? "bg-blue-50 border-blue-600 text-blue-700 shadow-xs"
                    : "bg-white border-gray-200 text-gray-600 hover:bg-gray-50"
                }`}
              >
                <span>🏦</span> Bank Transfer
              </button>
            </div>
          </div>

          <div>
            <div className="flex justify-between items-center mb-1">
              <label className="text-xs font-bold text-gray-700 block">Deposit Amount (₹)</label>
              <span className="text-[10px] font-bold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-full border border-emerald-200">
                ♾️ {lang === "hindi" ? "अनंत सीमा (No Upper Limit)" : "Infinite Range (No Upper Limit)"}
              </span>
            </div>
            <input
              type="number"
              inputMode="numeric"
              placeholder={lang === "hindi" ? "राशि दर्ज करें (कोई अधिकतम सीमा नहीं • min ₹1)" : "Enter Amount (No Upper Limit • Infinite Range • min ₹1)"}
              min="1"
              value={depForm.amount}
              onChange={e => setDepForm({ ...depForm, amount: e.target.value })}
              className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none text-base sm:text-sm font-bold"
            />
          </div>

          <div>
            <label className="text-xs font-bold text-gray-700 block mb-1">12-Digit UTR / Transaction ID <span className="text-rose-500">*</span></label>
            <input
              type="text"
              placeholder="Enter 12-digit UTR number from receipt"
              value={depForm.utrNumber}
              onChange={e => setDepForm({ ...depForm, utrNumber: e.target.value })}
              className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none text-base sm:text-sm font-mono"
            />
          </div>

          <div>
            <label className="text-xs font-bold text-gray-700 block mb-1">
              Payment Screenshot / Receipt Evidence <span className="text-rose-500 font-bold">*</span>
            </label>
            <div className="border-2 border-dashed border-gray-200 rounded-xl p-3 text-center bg-gray-50/60 hover:bg-gray-100/60 transition">
              {depForm.proofUrl ? (
                <div className="relative inline-block">
                  <img src={depForm.proofUrl} alt="Receipt proof" className="max-h-36 rounded-lg shadow-sm border border-gray-200 mx-auto object-contain" />
                  <button
                    type="button"
                    onClick={() => setDepForm(prev => ({ ...prev, proofUrl: "", proofName: "" }))}
                    className="absolute -top-2 -right-2 bg-red-500 hover:bg-red-600 text-white rounded-full w-6 h-6 flex items-center justify-center text-xs font-bold shadow cursor-pointer"
                  >
                    ✕
                  </button>
                  <p className="text-[10px] text-emerald-600 font-bold mt-1.5">✓ Screenshot attached</p>
                </div>
              ) : (
                <label className="cursor-pointer flex flex-col items-center justify-center py-2.5">
                  <span className="text-2xl mb-1">📸</span>
                  <span className="text-xs font-bold text-blue-600">Payment Screenshot Attach Karein</span>
                  <span className="text-[10px] text-gray-400 mt-0.5">JPG, PNG (Max 15MB)</span>
                  <input
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={handleDepositReceiptChange}
                  />
                </label>
              )}
            </div>
          </div>
        </div>

        <div className="flex gap-3 mt-5">
          <button onClick={closeModal} className="flex-1 py-3 bg-gray-100 rounded-xl font-semibold text-sm hover:bg-gray-200 active:bg-gray-300 transition">Cancel</button>
          <button onClick={submitDeposit} className="flex-1 py-3 bg-gradient-to-r from-blue-600 to-cyan-600 text-white rounded-xl font-bold text-sm hover:shadow-lg active:scale-[0.98] transition">Submit Deposit</button>
        </div>
      </Sheet>

      {/* WITHDRAW SHEET */}
      <Sheet open={modal === "withdraw"} onClose={closeModal} title="Withdraw Money (Money Out)" icon="💰">
        <div className="bg-gradient-to-r from-amber-50 to-orange-50 border border-amber-200 rounded-xl p-3.5 mb-4 text-xs text-amber-950 space-y-2">
          <div className="flex items-center justify-between font-bold">
            <span className="flex items-center gap-1.5">🏛️ Money Out SLA (Bank / UPI Transfer)</span>
            <span className="text-[10px] bg-amber-100/90 text-amber-900 border border-amber-300 px-2 py-0.5 rounded-full font-bold">Admin Verification</span>
          </div>
          <div className="grid grid-cols-2 gap-2 text-[11px]">
            <div className="bg-white/80 p-2 rounded-lg border border-amber-100 shadow-2xs">
              <span className="font-bold text-emerald-800 block">⚡ ₹100 – ₹5,000:</span>
              <span className="text-gray-600 font-medium">24 ghante ke andar Admin Approval & Transfer</span>
            </div>
            <div className="bg-white/80 p-2 rounded-lg border border-amber-100 shadow-2xs">
              <span className="font-bold text-indigo-800 block">🛡️ ₹5,000 se upar:</span>
              <span className="text-gray-600 font-medium">72 ghante ke darmiyan Admin Approval & Transfer</span>
            </div>
          </div>
          <p className="text-[10px] text-amber-800/80 italic font-medium pt-0.5">
            💡 Fintech ke andar (Send Money) bina kisi SLA ke instant transfer hota hai.
          </p>
        </div>
        <div className="space-y-3">
          {/* Source Wallet Picker (Main Account vs Profit Account) */}
          <div>
            <label className="text-xs font-bold text-gray-700 mb-1.5 block">
              {lang === "hindi" ? "पैसे कहाँ से निकालें? (Wallet चुनें):" : "Withdraw From (Source Wallet):"}
            </label>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setWdForm({ ...wdForm, sourceWallet: "main" })}
                className={`p-2.5 rounded-xl border text-left transition flex flex-col justify-between cursor-pointer ${
                  (wdForm.sourceWallet || "main") === "main"
                    ? "bg-blue-50 border-blue-500 ring-2 ring-blue-500/30 text-blue-950 font-bold"
                    : "bg-gray-50 border-gray-200 text-gray-600 hover:bg-gray-100"
                }`}
              >
                <div className="flex items-center justify-between text-xs font-bold">
                  <span>🏛️ {lang === "hindi" ? "प्राइमरी वॉलेट" : "Main Wallet"}</span>
                  {(wdForm.sourceWallet || "main") === "main" && <span className="text-blue-600 text-xs">✓</span>}
                </div>
                <div className="text-sm font-black mt-1 text-blue-700">
                  ₹{balance.toLocaleString("en-IN")}
                </div>
                <span className="text-[10px] text-gray-500">{lang === "hindi" ? "मुख्य बैलेंस" : "Primary Balance"}</span>
              </button>

              <button
                type="button"
                onClick={() => setWdForm({ ...wdForm, sourceWallet: "profit" })}
                className={`p-2.5 rounded-xl border text-left transition flex flex-col justify-between cursor-pointer ${
                  wdForm.sourceWallet === "profit"
                    ? "bg-blue-50 border-blue-500 ring-2 ring-blue-500/30 text-blue-950 font-bold"
                    : "bg-gray-50 border-gray-200 text-gray-600 hover:bg-gray-100"
                }`}
              >
                <div className="flex items-center justify-between text-xs font-bold">
                  <span>📈 {lang === "hindi" ? "प्रॉफ़िट वॉलेट" : "Profit Wallet"}</span>
                  {wdForm.sourceWallet === "profit" && <span className="text-blue-600 text-xs">✓</span>}
                </div>
                <div className="text-sm font-black mt-1 text-blue-700">
                  ₹{Number(userProfile.profitBalance || 0).toLocaleString("en-IN", { minimumFractionDigits: 2 })}
                </div>
                <span className="text-[10px] text-gray-500">{lang === "hindi" ? "जमा मुनाफ़ा" : "Accrued Profit"}</span>
              </button>
            </div>
          </div>

          <div>
            <div className="flex justify-between text-xs font-bold mb-1">
              <span className="text-gray-700">Amount (₹)</span>
              <span className="text-gray-500 font-semibold">
                Available: ₹{wdForm.sourceWallet === "profit"
                  ? Number(userProfile.profitBalance || 0).toLocaleString("en-IN", { minimumFractionDigits: 2 })
                  : balance.toLocaleString("en-IN")}
              </span>
            </div>
            <input type="number" inputMode="numeric" placeholder="Amount (min ₹100)" min="100" value={wdForm.amount} onChange={e => setWdForm({ ...wdForm, amount: e.target.value })} className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none text-base sm:text-sm font-bold" />
            {Number(wdForm.amount) > 0 && (
              <div className={`mt-2 p-2 rounded-lg text-xs font-bold flex items-center justify-between transition ${
                Number(wdForm.amount) <= 5000
                  ? "bg-emerald-50 text-emerald-800 border border-emerald-200"
                  : "bg-indigo-50 text-indigo-800 border border-indigo-200"
              }`}>
                <span>{Number(wdForm.amount) <= 5000 ? "⏱️ SLA: 24 Ghante ke andar processed" : "🛡️ SLA: 72 Ghante ke darmiyan processed (High-Value)"}</span>
                <span className="text-[10px] px-1.5 py-0.5 rounded-sm bg-white/70 uppercase tracking-wider">{Number(wdForm.amount) <= 5000 ? "Standard SLA" : "72h SLA"}</span>
              </div>
            )}
          </div>
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

          {/* OFFICIAL EDUCA DIGITAL BANK PASSBOOK CARD IN PROFILE */}
          <div className="p-4 bg-gradient-to-br from-slate-900 to-indigo-950 text-white rounded-2xl shadow-sm border border-indigo-500/30 space-y-3">
            <div className="flex items-center justify-between pb-2 border-b border-white/10">
              <div className="flex items-center gap-2">
                <span className="text-base">🏛️</span>
                <div>
                  <h4 className="font-extrabold text-xs text-white">{txt.bankCardTitle}</h4>
                  <p className="text-[10px] text-indigo-200">{txt.branchName}</p>
                </div>
              </div>
              <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                ✓ Active
              </span>
            </div>

            <div className="grid grid-cols-2 gap-2 text-xs">
              <div className="p-2 bg-white/5 rounded-xl border border-white/10">
                <span className="text-[10px] text-gray-400 font-bold uppercase block">{txt.accountNumberLabel}</span>
                <div className="flex items-center justify-between mt-0.5">
                  <span className="font-mono font-bold text-white text-xs">{userProfile.accountNumber || "EFS0000001"}</span>
                  <button
                    type="button"
                    onClick={() => copyToClipboard(userProfile.accountNumber || "EFS0000001", "p_acc")}
                    className="text-[10px] text-indigo-300 font-bold hover:underline cursor-pointer"
                  >
                    {copiedField === "p_acc" ? "✓" : "📋"}
                  </button>
                </div>
              </div>

              <div className="p-2 bg-white/5 rounded-xl border border-white/10">
                <span className="text-[10px] text-gray-400 font-bold uppercase block">{txt.ifscLabel}</span>
                <div className="flex items-center justify-between mt-0.5">
                  <span className="font-mono font-bold text-amber-300 text-xs">EFS0000JHAL</span>
                  <button
                    type="button"
                    onClick={() => copyToClipboard("EFS0000JHAL", "p_ifsc")}
                    className="text-[10px] text-indigo-300 font-bold hover:underline cursor-pointer"
                  >
                    {copiedField === "p_ifsc" ? "✓" : "📋"}
                  </button>
                </div>
              </div>

              <div className="col-span-2 p-2 bg-white/5 rounded-xl border border-white/10">
                <span className="text-[10px] text-gray-400 font-bold uppercase block">{txt.upiIdLabel}</span>
                <div className="flex items-center justify-between mt-0.5">
                  <span className="font-mono font-bold text-emerald-300 text-xs truncate max-w-[210px]">{userProfile.upiId || ((userProfile.accountNumber || "efs0000001").toLowerCase() + "@educa")}</span>
                  <button
                    type="button"
                    onClick={() => copyToClipboard(userProfile.upiId || ((userProfile.accountNumber || "efs0000001").toLowerCase() + "@educa"), "p_upi")}
                    className="text-[10px] text-indigo-300 font-bold hover:underline cursor-pointer shrink-0 ml-1"
                  >
                    {copiedField === "p_upi" ? "✓ Copied" : "📋 Copy"}
                  </button>
                </div>
              </div>
            </div>

            <button
              type="button"
              onClick={shareFullBankDetails}
              className="w-full py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl font-bold text-xs transition flex items-center justify-center gap-1.5 cursor-pointer shadow-xs active:scale-95"
            >
              <span>📤</span> {txt.shareBankDetails}
            </button>
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
                  {userProfile.agentProfile?.commissionRate
                    ? `${userProfile.agentProfile.commissionRate}% • ${userProfile.agentProfile?.commissionModel === "team_1" ? "Team Model" : "Solo Direct"}`
                    : (userProfile.agentProfile?.commissionModel === "team_1" ? "Team Model" : "Solo Direct")}
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
              onClick={() => { closeModal(); setTimeout(() => handleOpenPassbook(), 150); }}
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

          {/* SETTINGS & ACCESSIBILITY SECTION (CONSOLIDATED INSIDE PROFILE) */}
          <div className="p-3.5 bg-gray-50 border border-gray-200 rounded-2xl space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-black text-gray-900 flex items-center gap-1.5">
                <span>⚙️</span> <span>App Settings & Preferences</span>
              </span>
              <span className="text-[10px] text-gray-500 font-bold uppercase tracking-wider">Preferences</span>
            </div>

            {/* Language Selector in Profile */}
            <div>
              <span className="text-[11px] font-bold text-gray-700 block mb-1.5">App Language / भाषा चुनें:</span>
              <div className="grid grid-cols-3 gap-1.5">
                {[
                  { code: "hinglish", label: "Hinglish", flag: "🗣️" },
                  { code: "hindi", label: "हिंदी", flag: "🇮🇳" },
                  { code: "english", label: "English", flag: "🇬🇧" },
                ].map(item => (
                  <button
                    key={item.code}
                    type="button"
                    onClick={() => handleLanguageChange(item.code)}
                    className={`py-1.5 px-2 rounded-xl text-xs font-bold transition flex items-center justify-center gap-1 border cursor-pointer ${
                      lang === item.code
                        ? "bg-blue-600 text-white border-blue-600 shadow-2xs"
                        : "bg-white text-gray-700 border-gray-200 hover:bg-gray-100"
                    }`}
                  >
                    <span>{item.flag}</span>
                    <span>{item.label}</span>
                  </button>
                ))}
              </div>
            </div>

            {/* Voice Guide Audio Reader */}
            <div className="p-2.5 bg-white border border-gray-200 rounded-xl flex items-center justify-between">
              <div>
                <span className="text-xs font-bold text-gray-900 block">Voice Guide (दृष्टिबाधित सहायता)</span>
                <span className="text-[10px] text-gray-500">Screen reader for blind assistance</span>
              </div>
              <button
                type="button"
                onClick={speakDashboard}
                className={`px-3 py-1.5 rounded-lg font-bold text-xs flex items-center gap-1 transition cursor-pointer ${
                  isSpeaking ? "bg-amber-500 text-white" : "bg-blue-50 text-blue-700 border border-blue-200 hover:bg-blue-100"
                }`}
              >
                <span>{isSpeaking ? "⏹️" : "🔊"}</span>
                <span>{isSpeaking ? "Stop" : "Sunayein"}</span>
              </button>
            </div>

            {/* Feature Tour */}
            <button
              type="button"
              onClick={() => { closeModal(); setTourStep(0); setShowTour(true); }}
              className="w-full py-2 px-3 bg-white hover:bg-gray-100 border border-gray-200 text-gray-800 rounded-xl font-bold text-xs flex items-center justify-between transition cursor-pointer"
            >
              <span className="flex items-center gap-1.5"><span>🎓</span> Replay App Feature Tour</span>
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
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mt-1">
                    {(userProfile.kycDocuments?.doc1Url || userProfile.kycDocuments?.docUrl) && (
                      <div
                        onClick={() => { setLightboxImg(userProfile.kycDocuments?.doc1Url || userProfile.kycDocuments?.docUrl); setZoomLevel(1); }}
                        className="rounded-xl overflow-hidden border border-blue-200 bg-blue-50/40 p-1.5 flex flex-col items-center cursor-pointer group hover:border-blue-400 transition"
                        title="Tap to open fullscreen & zoom"
                      >
                        <img
                          src={userProfile.kycDocuments.doc1Url || userProfile.kycDocuments.docUrl}
                          alt="Aadhaar Card Front"
                          className="max-h-36 object-contain rounded-lg group-hover:scale-[1.02] transition"
                        />
                        <span className="text-[10px] font-bold text-blue-600 mt-1 flex items-center gap-1 group-hover:underline">
                          🔍 Front (Zoom)
                        </span>
                      </div>
                    )}
                    {userProfile.kycDocuments?.doc1BackUrl && (
                      <div
                        onClick={() => { setLightboxImg(userProfile.kycDocuments.doc1BackUrl); setZoomLevel(1); }}
                        className="rounded-xl overflow-hidden border border-blue-200 bg-blue-50/40 p-1.5 flex flex-col items-center cursor-pointer group hover:border-blue-400 transition"
                        title="Tap to open fullscreen & zoom"
                      >
                        <img
                          src={userProfile.kycDocuments.doc1BackUrl}
                          alt="Aadhaar Card Back"
                          className="max-h-36 object-contain rounded-lg group-hover:scale-[1.02] transition"
                        />
                        <span className="text-[10px] font-bold text-blue-600 mt-1 flex items-center gap-1 group-hover:underline">
                          🔍 Back (Zoom)
                        </span>
                      </div>
                    )}
                  </div>
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
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mt-1">
                      {userProfile.kycDocuments?.doc2Url && (
                        <div
                          onClick={() => { setLightboxImg(userProfile.kycDocuments.doc2Url); setZoomLevel(1); }}
                          className="rounded-xl overflow-hidden border border-indigo-200 bg-indigo-50/40 p-1.5 flex flex-col items-center cursor-pointer group hover:border-indigo-400 transition"
                          title="Tap to open fullscreen & zoom"
                        >
                          <img
                            src={userProfile.kycDocuments.doc2Url}
                            alt="Financial Proof Front"
                            className="max-h-36 object-contain rounded-lg group-hover:scale-[1.02] transition"
                          />
                          <span className="text-[10px] font-bold text-indigo-600 mt-1 flex items-center gap-1 group-hover:underline">
                            🔍 Front (Zoom)
                          </span>
                        </div>
                      )}
                      {userProfile.kycDocuments?.doc2BackUrl && (
                        <div
                          onClick={() => { setLightboxImg(userProfile.kycDocuments.doc2BackUrl); setZoomLevel(1); }}
                          className="rounded-xl overflow-hidden border border-indigo-200 bg-indigo-50/40 p-1.5 flex flex-col items-center cursor-pointer group hover:border-indigo-400 transition"
                          title="Tap to open fullscreen & zoom"
                        >
                          <img
                            src={userProfile.kycDocuments.doc2BackUrl}
                            alt="Financial Proof Back"
                            className="max-h-36 object-contain rounded-lg group-hover:scale-[1.02] transition"
                          />
                          <span className="text-[10px] font-bold text-indigo-600 mt-1 flex items-center gap-1 group-hover:underline">
                            🔍 Back (Zoom)
                          </span>
                        </div>
                      )}
                    </div>
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
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mt-1">
                    {(userProfile.kycDocuments?.doc1Url || userProfile.kycDocuments?.docUrl) && (
                      <div
                        onClick={() => { setLightboxImg(userProfile.kycDocuments?.doc1Url || userProfile.kycDocuments?.docUrl); setZoomLevel(1); }}
                        className="rounded-xl overflow-hidden border border-amber-200 bg-amber-50/40 p-1.5 flex flex-col items-center cursor-pointer group hover:border-amber-400 transition"
                        title="Tap to open fullscreen & zoom"
                      >
                        <img
                          src={userProfile.kycDocuments.doc1Url || userProfile.kycDocuments.docUrl}
                          alt="Submitted Aadhaar Front"
                          className="max-h-36 object-contain rounded-lg group-hover:scale-[1.02] transition"
                        />
                        <span className="text-[10px] font-bold text-amber-800 mt-1 flex items-center gap-1 group-hover:underline">
                          🔍 Front (Zoom)
                        </span>
                      </div>
                    )}
                    {userProfile.kycDocuments?.doc1BackUrl && (
                      <div
                        onClick={() => { setLightboxImg(userProfile.kycDocuments.doc1BackUrl); setZoomLevel(1); }}
                        className="rounded-xl overflow-hidden border border-amber-200 bg-amber-50/40 p-1.5 flex flex-col items-center cursor-pointer group hover:border-amber-400 transition"
                        title="Tap to open fullscreen & zoom"
                      >
                        <img
                          src={userProfile.kycDocuments.doc1BackUrl}
                          alt="Submitted Aadhaar Back"
                          className="max-h-36 object-contain rounded-lg group-hover:scale-[1.02] transition"
                        />
                        <span className="text-[10px] font-bold text-amber-800 mt-1 flex items-center gap-1 group-hover:underline">
                          🔍 Back (Zoom)
                        </span>
                      </div>
                    )}
                  </div>
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
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mt-1">
                      {userProfile.kycDocuments?.doc2Url && (
                        <div
                          onClick={() => { setLightboxImg(userProfile.kycDocuments.doc2Url); setZoomLevel(1); }}
                          className="rounded-xl overflow-hidden border border-indigo-200 bg-indigo-50/40 p-1.5 flex flex-col items-center cursor-pointer group hover:border-indigo-400 transition"
                          title="Tap to open fullscreen & zoom"
                        >
                          <img
                            src={userProfile.kycDocuments.doc2Url}
                            alt="Submitted Financial Proof Front"
                            className="max-h-36 object-contain rounded-lg group-hover:scale-[1.02] transition"
                          />
                          <span className="text-[10px] font-bold text-indigo-700 mt-1 flex items-center gap-1 group-hover:underline">
                            🔍 Front (Zoom)
                          </span>
                        </div>
                      )}
                      {userProfile.kycDocuments?.doc2BackUrl && (
                        <div
                          onClick={() => { setLightboxImg(userProfile.kycDocuments.doc2BackUrl); setZoomLevel(1); }}
                          className="rounded-xl overflow-hidden border border-indigo-200 bg-indigo-50/40 p-1.5 flex flex-col items-center cursor-pointer group hover:border-indigo-400 transition"
                          title="Tap to open fullscreen & zoom"
                        >
                          <img
                            src={userProfile.kycDocuments.doc2BackUrl}
                            alt="Submitted Financial Proof Back"
                            className="max-h-36 object-contain rounded-lg group-hover:scale-[1.02] transition"
                          />
                          <span className="text-[10px] font-bold text-indigo-700 mt-1 flex items-center gap-1 group-hover:underline">
                            🔍 Back (Zoom)
                          </span>
                        </div>
                      )}
                    </div>
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

                <div className="space-y-2">
                  <label className="block text-[11px] font-bold text-gray-700">
                    Upload Aadhaar Card (Front & Back) <span className="text-rose-500">*</span>
                  </label>
                  <div className="grid grid-cols-2 gap-2">
                    {/* Front */}
                    <div>
                      <div className="text-[10px] font-bold text-gray-500 mb-1">Front Side *</div>
                      <div className="flex items-center gap-1.5">
                        <label className="flex-1 cursor-pointer py-2 px-2 bg-white hover:bg-gray-50 border border-dashed border-blue-300 rounded-xl text-xs text-blue-700 font-bold flex items-center justify-center gap-1.5 transition active:scale-95">
                          <span>📄</span>
                          <span className="truncate text-[11px]">{kycForm.doc1Name ? "Change" : "Front File"}</span>
                          <input
                            type="file"
                            accept="image/*"
                            onChange={e => handleKycFileChange(e, 1, "front")}
                            className="hidden"
                          />
                        </label>
                        {kycForm.doc1Url && (
                          <button
                            type="button"
                            onClick={() => setKycForm({ ...kycForm, doc1Name: "", doc1Url: "" })}
                            className="p-2 bg-rose-50 text-rose-600 rounded-xl text-xs font-bold hover:bg-rose-100 transition cursor-pointer"
                            title="Remove Front"
                          >
                            ✕
                          </button>
                        )}
                      </div>
                      {kycForm.doc1Url && (
                        <div className="mt-1.5 p-1.5 bg-white border border-gray-200 rounded-xl flex items-center gap-2">
                          <img src={kycForm.doc1Url} alt="Aadhaar Front" className="w-8 h-8 object-cover rounded-lg border border-gray-200 shrink-0" />
                          <div className="text-[10px] text-gray-600 truncate flex-1">
                            <span className="font-bold text-emerald-600 block">✓ Front Added</span>
                          </div>
                        </div>
                      )}
                    </div>

                    {/* Back */}
                    <div>
                      <div className="text-[10px] font-bold text-gray-500 mb-1">Back Side (Optional)</div>
                      <div className="flex items-center gap-1.5">
                        <label className="flex-1 cursor-pointer py-2 px-2 bg-white hover:bg-gray-50 border border-dashed border-blue-300 rounded-xl text-xs text-blue-700 font-bold flex items-center justify-center gap-1.5 transition active:scale-95">
                          <span>📄</span>
                          <span className="truncate text-[11px]">{kycForm.doc1BackName ? "Change" : "Back File"}</span>
                          <input
                            type="file"
                            accept="image/*"
                            onChange={e => handleKycFileChange(e, 1, "back")}
                            className="hidden"
                          />
                        </label>
                        {kycForm.doc1BackUrl && (
                          <button
                            type="button"
                            onClick={() => setKycForm({ ...kycForm, doc1BackName: "", doc1BackUrl: "" })}
                            className="p-2 bg-rose-50 text-rose-600 rounded-xl text-xs font-bold hover:bg-rose-100 transition cursor-pointer"
                            title="Remove Back"
                          >
                            ✕
                          </button>
                        )}
                      </div>
                      {kycForm.doc1BackUrl && (
                        <div className="mt-1.5 p-1.5 bg-white border border-gray-200 rounded-xl flex items-center gap-2">
                          <img src={kycForm.doc1BackUrl} alt="Aadhaar Back" className="w-8 h-8 object-cover rounded-lg border border-gray-200 shrink-0" />
                          <div className="text-[10px] text-gray-600 truncate flex-1">
                            <span className="font-bold text-emerald-600 block">✓ Back Added</span>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
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

                <div className="space-y-2">
                  <label className="block text-[11px] font-bold text-gray-700">
                    Upload {kycForm.doc2Type === "pan" ? "PAN Card" : "Bank Cheque / Passbook"} (Front & Back) <span className="text-rose-500">*</span>
                  </label>
                  <div className="grid grid-cols-2 gap-2">
                    {/* Front */}
                    <div>
                      <div className="text-[10px] font-bold text-gray-500 mb-1">Front Side *</div>
                      <div className="flex items-center gap-1.5">
                        <label className="flex-1 cursor-pointer py-2 px-2 bg-white hover:bg-gray-50 border border-dashed border-indigo-300 rounded-xl text-xs text-indigo-700 font-bold flex items-center justify-center gap-1.5 transition active:scale-95">
                          <span>📄</span>
                          <span className="truncate text-[11px]">{kycForm.doc2Name ? "Change" : "Front File"}</span>
                          <input
                            type="file"
                            accept="image/*"
                            onChange={e => handleKycFileChange(e, 2, "front")}
                            className="hidden"
                          />
                        </label>
                        {kycForm.doc2Url && (
                          <button
                            type="button"
                            onClick={() => setKycForm({ ...kycForm, doc2Name: "", doc2Url: "" })}
                            className="p-2 bg-rose-50 text-rose-600 rounded-xl text-xs font-bold hover:bg-rose-100 transition cursor-pointer"
                            title="Remove Front"
                          >
                            ✕
                          </button>
                        )}
                      </div>
                      {kycForm.doc2Url && (
                        <div className="mt-1.5 p-1.5 bg-white border border-gray-200 rounded-xl flex items-center gap-2">
                          <img src={kycForm.doc2Url} alt="Doc 2 Front" className="w-8 h-8 object-cover rounded-lg border border-gray-200 shrink-0" />
                          <div className="text-[10px] text-gray-600 truncate flex-1">
                            <span className="font-bold text-emerald-600 block">✓ Front Added</span>
                          </div>
                        </div>
                      )}
                    </div>

                    {/* Back */}
                    <div>
                      <div className="text-[10px] font-bold text-gray-500 mb-1">Back Side (Optional)</div>
                      <div className="flex items-center gap-1.5">
                        <label className="flex-1 cursor-pointer py-2 px-2 bg-white hover:bg-gray-50 border border-dashed border-indigo-300 rounded-xl text-xs text-indigo-700 font-bold flex items-center justify-center gap-1.5 transition active:scale-95">
                          <span>📄</span>
                          <span className="truncate text-[11px]">{kycForm.doc2BackName ? "Change" : "Back File"}</span>
                          <input
                            type="file"
                            accept="image/*"
                            onChange={e => handleKycFileChange(e, 2, "back")}
                            className="hidden"
                          />
                        </label>
                        {kycForm.doc2BackUrl && (
                          <button
                            type="button"
                            onClick={() => setKycForm({ ...kycForm, doc2BackName: "", doc2BackUrl: "" })}
                            className="p-2 bg-rose-50 text-rose-600 rounded-xl text-xs font-bold hover:bg-rose-100 transition cursor-pointer"
                            title="Remove Back"
                          >
                            ✕
                          </button>
                        )}
                      </div>
                      {kycForm.doc2BackUrl && (
                        <div className="mt-1.5 p-1.5 bg-white border border-gray-200 rounded-xl flex items-center gap-2">
                          <img src={kycForm.doc2BackUrl} alt="Doc 2 Back" className="w-8 h-8 object-cover rounded-lg border border-gray-200 shrink-0" />
                          <div className="text-[10px] text-gray-600 truncate flex-1">
                            <span className="font-bold text-emerald-600 block">✓ Back Added</span>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
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
                <div className="p-3 bg-rose-50 border border-rose-200 text-rose-700 rounded-xl text-xs font-semibold flex items-center justify-between gap-2 animate-in fade-in duration-200 shadow-2xs">
                  <div className="flex items-center gap-2 flex-1">
                    <span className="shrink-0 text-sm">⚠️</span>
                    <span className="leading-snug">{kycError}</span>
                  </div>
                  <button
                    type="button"
                    onClick={() => setKycError("")}
                    className="text-rose-400 hover:text-rose-700 font-black text-sm px-1.5 py-0.5 rounded-lg hover:bg-rose-100 transition shrink-0 cursor-pointer"
                    title="Dismiss"
                  >
                    ✕
                  </button>
                </div>
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
                  {loadingDashboard && (userProfile.balance ?? balance) === 0 ? (
                    <span className="inline-block h-9 w-32 bg-white/20 rounded-lg animate-pulse" />
                  ) : (
                    `₹${(userProfile.balance ?? balance ?? 0).toLocaleString("en-IN")}`
                  )}
                </div>
                <div className="flex flex-wrap items-center gap-2 text-[11px] text-blue-100 mt-1">
                  <span>A/C: <strong className="font-mono text-white">{activeAccountNum}</strong></span>
                  <span>•</span>
                  <span>UPI: <strong className="font-mono text-emerald-300">{activeUpiId}</strong></span>
                </div>
              </div>
              <span className="px-2.5 py-1 bg-white/20 text-white text-[10px] font-black rounded-full uppercase">
                Primary Wallet
              </span>
            </div>
          </div>

          {/* Export PDF Statement Action */}
          <div className="flex justify-between items-center bg-blue-50/70 border border-blue-200/80 rounded-2xl p-3">
            <div>
              <p className="text-xs font-bold text-blue-950">Official Bank E-Statement</p>
              <p className="text-[10px] text-blue-700">Digitally verified passbook report</p>
            </div>
            <button
              type="button"
              onClick={() => exportPdfStatement("passbook")}
              className="px-3.5 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-bold text-xs flex items-center gap-1.5 transition active:scale-95 shadow-xs cursor-pointer"
            >
              <span>📄</span> Export / Print PDF
            </button>
          </div>

          {/* FILTER TABS */}
          <div className="flex gap-1.5 p-1 bg-gray-100 rounded-xl">
            {[
              { id: "all", label: `All (${txns.length})` },
              { id: "in", label: `In / Received (${txns.filter(t => ["deposit", "transfer_received", "bond_payout", "loan_disbursal", "daily_yield", "referral_bonus"].includes(t.type)).length})` },
              { id: "out", label: `Out / Sent (${txns.filter(t => !["deposit", "transfer_received", "bond_payout", "loan_disbursal", "daily_yield", "referral_bonus"].includes(t.type)).length})` },
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
                const isCredit = ["deposit", "transfer_received", "bond_payout", "loan_disbursal", "daily_yield", "referral_bonus"].includes(t.type);
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
                const isCredit = ["deposit", "transfer_received", "bond_payout", "loan_disbursal", "daily_yield", "referral_bonus"].includes(t.type);
                
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
                } else if (t.type === "daily_yield") {
                  title = `Daily Savings Profit Credited`;
                  details = t.remarks || `Daily 12% p.a. savings profit credited`;
                } else if (t.type === "referral_bonus") {
                  title = `Referral Bonus Credited`;
                  details = t.remarks || `Referral reward bonus credited`;
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
                {/* Source Wallet Selector */}
                <div>
                  <label className="text-xs font-bold text-gray-700 mb-1.5 block">
                    Kahan se pay karein? (Source Wallet):
                  </label>
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      onClick={() => setInstallmentSourceWallet("main")}
                      className={`p-2.5 rounded-xl border text-left transition flex flex-col justify-between cursor-pointer ${
                        installmentSourceWallet === "main"
                          ? "bg-blue-50 border-blue-500 ring-2 ring-blue-500/30 text-blue-950 font-bold"
                          : "bg-white border-gray-200 text-gray-600 hover:bg-gray-100"
                      }`}
                    >
                      <div className="flex items-center justify-between text-xs font-bold">
                        <span>🏛️ Primary Wallet</span>
                        {installmentSourceWallet === "main" && <span className="text-blue-600 text-xs">✓</span>}
                      </div>
                      <div className="text-sm font-black mt-1 text-blue-700">
                        ₹{(userProfile.balance || 0).toLocaleString("en-IN")}
                      </div>
                      <span className="text-[10px] text-gray-500">Main Account</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => setInstallmentSourceWallet("profit")}
                      className={`p-2.5 rounded-xl border text-left transition flex flex-col justify-between cursor-pointer ${
                        installmentSourceWallet === "profit"
                          ? "bg-blue-50 border-blue-500 ring-2 ring-blue-500/30 text-blue-950 font-bold"
                          : "bg-white border-gray-200 text-gray-600 hover:bg-gray-100"
                      }`}
                    >
                      <div className="flex items-center justify-between text-xs font-bold">
                        <span>📈 Profit Wallet</span>
                        {installmentSourceWallet === "profit" && <span className="text-blue-600 text-xs">✓</span>}
                      </div>
                      <div className="text-sm font-black mt-1 text-blue-700">
                        ₹{Number(userProfile.profitBalance || 0).toLocaleString("en-IN", { minimumFractionDigits: 2 })}
                      </div>
                      <span className="text-[10px] text-gray-500">Accrued Profit</span>
                    </button>
                  </div>
                </div>

                <div className="flex justify-between items-center text-gray-700 pt-1 border-t border-gray-200">
                  <span>Selected Wallet Balance:</span>
                  <span className="font-bold text-emerald-700 font-mono text-sm">
                    ₹{installmentSourceWallet === "profit"
                      ? Number(userProfile.profitBalance || 0).toLocaleString("en-IN", { minimumFractionDigits: 2 })
                      : (userProfile.balance || 0).toLocaleString("en-IN")}
                  </span>
                </div>

                {((installmentSourceWallet === "profit" ? (userProfile.profitBalance || 0) : (userProfile.balance || 0)) < submitInstallmentModal.amount) ? (
                  <div className="p-2.5 bg-rose-50 border border-rose-200 rounded-xl text-rose-700 text-[11px] font-medium">
                    ⚠️ Insufficient balance in {installmentSourceWallet === "profit" ? "Profit Wallet" : "Primary Wallet"}. Kripya doosra wallet chunein ya "UPI QR / Proof" option use karein.
                  </div>
                ) : (
                  <p className="text-[11px] text-gray-500">
                    Aapke {installmentSourceWallet === "profit" ? "Profit Wallet" : "Primary Wallet"} se ₹{submitInstallmentModal.amount} turant debit honge aur installment PAID mark ho jayegi.
                  </p>
                )}

                <button
                  type="button"
                  disabled={(installmentSourceWallet === "profit" ? (userProfile.profitBalance || 0) : (userProfile.balance || 0)) < submitInstallmentModal.amount}
                  onClick={submitInstallmentProof}
                  className="w-full py-3 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white rounded-xl font-bold text-xs shadow-md shadow-blue-500/20 active:scale-95 transition disabled:opacity-50 cursor-pointer"
                >
                  Pay ₹{submitInstallmentModal.amount} from {installmentSourceWallet === "profit" ? "Profit Wallet" : "Primary Wallet"} →
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

                {/* Screenshot Upload (Front & Back) */}
                <div className="space-y-2">
                  <label className="block text-[11px] font-bold text-gray-700">
                    Payment Screenshots / Proof (Front & Back) <span className="text-rose-500">*</span>
                  </label>
                  <div className="grid grid-cols-2 gap-2">
                    {/* Front Receipt */}
                    <div>
                      <div className="text-[10px] font-bold text-gray-500 mb-1">Receipt (Front) *</div>
                      <label className="cursor-pointer py-2 px-2 bg-white hover:bg-gray-50 border border-dashed border-indigo-300 rounded-xl text-xs text-indigo-700 font-bold flex items-center justify-center gap-1.5 transition active:scale-95">
                        <span>📄</span>
                        <span className="truncate text-[11px]">{installmentProofName ? "Change" : "Upload"}</span>
                        <input
                          type="file"
                          accept="image/*"
                          onChange={e => handleInstallmentProofUpload(e, "front")}
                          className="hidden"
                        />
                      </label>
                      {installmentProofUrl && (
                        <div className="mt-1.5 p-1.5 bg-gray-50 border border-gray-200 rounded-xl flex items-center gap-2">
                          <img src={installmentProofUrl} alt="Receipt Front" className="w-8 h-8 object-cover rounded-lg border border-gray-200 shrink-0" />
                          <div className="text-[10px] text-gray-600 truncate flex-1">
                            <span className="font-bold text-emerald-600 block">✓ Attached</span>
                          </div>
                        </div>
                      )}
                    </div>

                    {/* Back / Extra Proof */}
                    <div>
                      <div className="text-[10px] font-bold text-gray-500 mb-1">Back / Confirmation</div>
                      <label className="cursor-pointer py-2 px-2 bg-white hover:bg-gray-50 border border-dashed border-indigo-300 rounded-xl text-xs text-indigo-700 font-bold flex items-center justify-center gap-1.5 transition active:scale-95">
                        <span>📄</span>
                        <span className="truncate text-[11px]">{installmentProofBackName ? "Change" : "Upload"}</span>
                        <input
                          type="file"
                          accept="image/*"
                          onChange={e => handleInstallmentProofUpload(e, "back")}
                          className="hidden"
                        />
                      </label>
                      {installmentProofBackUrl && (
                        <div className="mt-1.5 p-1.5 bg-gray-50 border border-gray-200 rounded-xl flex items-center gap-2">
                          <img src={installmentProofBackUrl} alt="Receipt Back" className="w-8 h-8 object-cover rounded-lg border border-gray-200 shrink-0" />
                          <div className="text-[10px] text-gray-600 truncate flex-1">
                            <span className="font-bold text-emerald-600 block">✓ Attached</span>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
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

      {/* ══════════════════════════════════════════════════════
          EDUCA SUPPORT & ADVISOR SHEET (90% SCREEN HEIGHT)
      ══════════════════════════════════════════════════════ */}
      <Sheet
        open={showAiAdvisor}
        onClose={() => setShowAiAdvisor(false)}
        title="Educa Support & Advisor"
        icon="💬"
        className="h-[90dvh] sm:h-[88vh] flex flex-col"
      >
        <div className="flex-1 flex flex-col min-h-0 space-y-3 bg-white">
          {/* Header Row: Live Status + Language Toggle */}
          <div className="flex items-center justify-between pb-2 border-b border-gray-100 shrink-0">
            <span className="text-[11px] font-semibold text-gray-500 flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-emerald-500"></span>
              <span>{advisorLang === "english" ? "24/7 Live Support & Advisor" : "24/7 Live Sahayata & Advisor"}</span>
            </span>
            <div className="flex items-center bg-gray-100 p-0.5 rounded-lg border border-gray-200">
              <button
                type="button"
                onClick={() => handleAdvisorLangChange("hinglish")}
                className={`px-2.5 py-1 rounded-md text-[11px] font-bold transition cursor-pointer ${
                  advisorLang === "hinglish" ? "bg-blue-600 text-white shadow-xs" : "text-gray-600 hover:text-gray-900"
                }`}
                title="Hinglish / हिंदी"
              >
                HN
              </button>
              <button
                type="button"
                onClick={() => handleAdvisorLangChange("english")}
                className={`px-2.5 py-1 rounded-md text-[11px] font-bold transition cursor-pointer ${
                  advisorLang === "english" ? "bg-blue-600 text-white shadow-xs" : "text-gray-600 hover:text-gray-900"
                }`}
                title="Global English"
              >
                EN
              </button>
            </div>
          </div>

          {/* Quick Helpful Questions (Clean Light White Pills - Pure /ponytail) */}
          <div className="overflow-x-auto no-scrollbar flex items-center gap-1.5 py-0.5 shrink-0">
            {(advisorLang === "english" ? [
              { label: "🧮 Custom EMI Calculator", q: "I borrowed 10000 with 600 emi how much to repay" },
              { label: "💼 Business Loan", q: "Tell me about business loan with cheque" },
              { label: "⚡ ₹10K Loan EMI", q: "10000 loan ka emi count karo" },
              { label: "🎯 Loan Benefits", q: "What are the advantages of Educa loan" },
              { label: "📈 12% Interest", q: "How does 12% compounding interest work" },
              { label: "🔄 Profit Transfer", q: "How to transfer profit to primary wallet" },
            ] : [
              { label: "🧮 10000 liya 600 emi hisaab", q: "maine 10000 liya 600 ki emi bani to kitna dena hai" },
              { label: "💼 Business Loan Niyam", q: "Cheque ke sath business loan 20000" },
              { label: "⚡ ₹20K Loan Hisaab", q: "maine 20000 liya 18 kist me kitna dena hai" },
              { label: "🎯 Loan Ke Fayde", q: "Loan ke fayde ginwao motivation wale" },
              { label: "📈 12% Munafa Byaj", q: "12% interest compounding kaise milta hai" },
              { label: "🔄 Profit Transfer Help", q: "Profit wallet se main wallet transfer" },
            ]).map((chip) => (
              <button
                key={chip.label}
                type="button"
                onClick={() => handleAdvisorSend(chip.q)}
                className="text-[11px] font-medium bg-white hover:bg-blue-50 text-gray-700 hover:text-blue-700 border border-gray-200 hover:border-blue-300 px-3 py-1.5 rounded-full transition active:scale-95 cursor-pointer whitespace-nowrap shrink-0 shadow-2xs"
              >
                {chip.label}
              </button>
            ))}
          </div>

          {/* Chat Messages Feed - Expanded 90% Screen Height */}
          <div className="flex-1 min-h-0 overflow-y-auto space-y-3 bg-white border border-gray-200 rounded-2xl p-3.5 shadow-inner">
            {advisorMessages.map((msg, index) => (
              <div
                key={index}
                className={`flex flex-col ${msg.sender === "user" ? "items-end" : "items-start"}`}
              >
                <div
                  className={`max-w-[88%] rounded-2xl px-3.5 py-2.5 text-xs sm:text-sm leading-relaxed whitespace-pre-line shadow-2xs ${
                    msg.sender === "user"
                      ? "bg-blue-600 text-white rounded-tr-none font-medium"
                      : "bg-gray-50 text-gray-800 border border-gray-200/90 rounded-tl-none font-normal"
                  }`}
                >
                  {msg.text}
                </div>
                <span className="text-[9px] text-gray-400 mt-0.5 px-1">{msg.time}</span>
              </div>
            ))}
          </div>

          {/* Input & Send Form - Clean White & Blue */}
          <form
            onSubmit={(e) => {
              e.preventDefault();
              handleAdvisorSend();
            }}
            className="flex gap-2 shrink-0 pt-1"
          >
            <input
              type="text"
              value={advisorInput}
              onChange={(e) => setAdvisorInput(e.target.value)}
              placeholder={advisorLang === "english" ? "Type amount or question (e.g. 10000 liya 600 emi...)" : "Apna hisaab likhein (e.g. 10000 liya 600 emi kitna dena hai...)"}
              className="flex-1 px-3.5 py-2.5 border border-gray-200 rounded-xl text-xs sm:text-sm outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 bg-white text-gray-800"
            />
            <button
              type="submit"
              disabled={!advisorInput.trim()}
              className="px-4 py-2.5 bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs sm:text-sm rounded-xl transition active:scale-95 disabled:opacity-50 shadow-xs cursor-pointer shrink-0"
            >
              {advisorLang === "english" ? "Send" : "Bhejein"}
            </button>
          </form>

          {/* Clear Chat / Issue Resolved Action Button */}
          <div className="pt-1 border-t border-gray-100 flex justify-center shrink-0">
            <button
              type="button"
              onClick={handleResolveAdvisorChat}
              className="w-full py-2 px-4 bg-gray-50 hover:bg-gray-100 text-gray-700 border border-gray-200 rounded-xl font-medium text-xs flex items-center justify-center gap-2 transition active:scale-95 cursor-pointer"
            >
              <span>✓</span>
              <span>{advisorLang === "english" ? "Issue resolved? (Clear Chat)" : "Aapka issue resolve hua? (Chat Clear Karein)"}</span>
            </button>
          </div>
        </div>
      </Sheet>

      {/* ══════════════════════════════════════════════════════
          AGENT 1-CLICK MASS BROADCAST MESSAGE SHEET
      ══════════════════════════════════════════════════════ */}
      {agentBroadcastModalOpen && (
        <Sheet
          open={agentBroadcastModalOpen}
          onClose={() => setAgentBroadcastModalOpen(false)}
          title="Send Mass Broadcast Message"
          icon="📢"
        >
          <div className="space-y-4">
            <div className="p-3 bg-gradient-to-r from-amber-500/10 via-orange-500/10 to-amber-500/5 border border-amber-300 rounded-2xl flex items-center justify-between">
              <div>
                <span className="text-[10px] text-amber-800 uppercase font-black tracking-wider">Recipients</span>
                <h4 className="text-base font-black text-amber-950">
                  {agentMetrics?.stats?.customerCount || agentMetrics?.customers?.length || 0} Registered Customers
                </h4>
              </div>
              <span className="px-2.5 py-1 rounded-full text-[10px] font-black bg-amber-500 text-slate-950 uppercase shadow-2xs">
                1-Click Mass Send
              </span>
            </div>

            {/* Quick Templates */}
            <div>
              <span className="text-[11px] font-bold text-gray-500 block mb-1.5">Quick Message Templates:</span>
              <div className="flex flex-wrap gap-1.5">
                {[
                  {
                    label: "⏰ Kist Due Date Reminder",
                    title: "⏰ Installment Due Reminder",
                    msg: "Namaste! Aapke loan ki installment date najdeek hai. Kripya samay par kist jama karein taaki aapka credit score aur card limit dono secure rahein."
                  },
                  {
                    label: "⚡ Early Settlement Offer",
                    title: "⚡ Pre-Closure Discount Offer",
                    msg: "Special Notice: Aap apna loan samay se pehle pre-close kar sakte hain aur extra interest bacha sakte hain. Loan pre-close karne ke liye abhi sampark karein."
                  },
                  {
                    label: "📢 Important Notice",
                    title: "📢 Official Notice from Agent",
                    msg: "Namaste! Educa Fintech account aur loan payments ke sambandh me kisi bhi jaankari ya sahayata ke liye aap mujhse sidhe sampark kar sakte hain."
                  }
                ].map((tmpl, idx) => (
                  <button
                    key={idx}
                    type="button"
                    onClick={() => {
                      setBroadcastTitle(tmpl.title);
                      setBroadcastMessage(tmpl.msg);
                    }}
                    className="text-[11px] font-bold bg-amber-50 hover:bg-amber-100 text-amber-900 border border-amber-200 px-2.5 py-1 rounded-xl transition active:scale-95 cursor-pointer"
                  >
                    {tmpl.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Message Title */}
            <div>
              <label className="block text-xs font-bold text-gray-700 mb-1">
                Notice Title (Optional)
              </label>
              <input
                type="text"
                value={broadcastTitle}
                onChange={(e) => setBroadcastTitle(e.target.value)}
                placeholder="e.g. ⏰ Loan Installment Alert"
                className="w-full px-3.5 py-2.5 border border-gray-300 rounded-xl text-xs outline-none focus:border-amber-500 focus:ring-1 focus:ring-amber-500 bg-white"
              />
            </div>

            {/* Message Body */}
            <div>
              <label className="block text-xs font-bold text-gray-700 mb-1">
                Broadcast Message Content <span className="text-rose-500">*</span>
              </label>
              <textarea
                rows={4}
                value={broadcastMessage}
                onChange={(e) => setBroadcastMessage(e.target.value)}
                placeholder="Sabhi referred customers ko bhejne ke liye sandesh yahan likhein..."
                className="w-full p-3 border border-gray-300 rounded-xl text-xs outline-none focus:border-amber-500 focus:ring-1 focus:ring-amber-500 bg-white resize-none"
              />
            </div>

            {/* Send Button */}
            <div className="pt-2">
              <button
                type="button"
                onClick={handleSendAgentBroadcast}
                disabled={broadcastSending || !broadcastMessage.trim()}
                className="w-full py-3 bg-gradient-to-r from-amber-500 via-orange-500 to-amber-600 hover:from-amber-600 hover:to-orange-600 text-slate-950 font-black rounded-xl text-xs shadow-md transition active:scale-95 disabled:opacity-50 cursor-pointer flex items-center justify-center gap-2"
              >
                {broadcastSending ? (
                  <span>Sending broadcast to all customers...</span>
                ) : (
                  <>
                    <span>📢</span>
                    <span>Send to All {agentMetrics?.stats?.customerCount || agentMetrics?.customers?.length || 0} Customers (1-Click)</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </Sheet>
      )}

      {/* ══════════════════════════════════════════════════════
          AGENT ADD / ONBOARD CUSTOMER MODAL SHEET
      ══════════════════════════════════════════════════════ */}
      {addCustomerModalOpen && (
        <Sheet
          open={addCustomerModalOpen}
          onClose={() => setAddCustomerModalOpen(false)}
          title="Onboard Customer Under My Portfolio"
          icon="👥"
        >
          <form onSubmit={handleAgentAddCustomer} className="space-y-4">
            <div className="p-3 bg-gradient-to-r from-emerald-500/10 via-teal-500/10 to-emerald-500/5 border border-emerald-300 rounded-2xl flex items-center justify-between">
              <div>
                <span className="text-[10px] text-emerald-800 uppercase font-black tracking-wider">Direct Referral Linking</span>
                <h4 className="text-sm font-black text-emerald-950">
                  New Customer Addition
                </h4>
              </div>
              <span className="px-2.5 py-1 rounded-full text-[10px] font-black bg-emerald-500 text-slate-950 uppercase shadow-2xs font-mono">
                Code: {userProfile.referralCode || "AGENT"}
              </span>
            </div>

            <p className="text-[11px] text-slate-600 leading-tight">
              Aap apne referral network ke antargat naye customer ko sidhe registered kar sakte hain. Customer ka account turant ban jayega aur aapke portfolio me link ho jayega.
            </p>

            {/* Customer Name */}
            <div>
              <label className="block text-[11px] font-bold text-gray-700 mb-1">
                Customer Full Name <span className="text-rose-500">*</span>
              </label>
              <input
                type="text"
                required
                value={newCustomerForm.name}
                onChange={(e) => setNewCustomerForm({ ...newCustomerForm, name: e.target.value })}
                placeholder="e.g. Ramesh Kumar"
                className="w-full p-2.5 bg-gray-50 border border-gray-200 rounded-xl text-xs font-semibold text-gray-900 outline-none focus:ring-2 focus:ring-emerald-500"
              />
            </div>

            {/* Mobile Number */}
            <div>
              <label className="block text-[11px] font-bold text-gray-700 mb-1">
                10-Digit Mobile Number <span className="text-rose-500">*</span>
              </label>
              <input
                type="tel"
                required
                maxLength={10}
                value={newCustomerForm.phone}
                onChange={(e) => setNewCustomerForm({ ...newCustomerForm, phone: e.target.value.replace(/\D/g, '') })}
                placeholder="e.g. 9876543210"
                className="w-full p-2.5 bg-gray-50 border border-gray-200 rounded-xl text-xs font-mono font-semibold text-gray-900 outline-none focus:ring-2 focus:ring-emerald-500"
              />
            </div>

            {/* Email (Optional) */}
            <div>
              <label className="block text-[11px] font-bold text-gray-700 mb-1">
                Email Address (Optional)
              </label>
              <input
                type="email"
                value={newCustomerForm.email}
                onChange={(e) => setNewCustomerForm({ ...newCustomerForm, email: e.target.value })}
                placeholder="agar email na ho to khali chhod dein"
                className="w-full p-2.5 bg-gray-50 border border-gray-200 rounded-xl text-xs font-medium text-gray-900 outline-none focus:ring-2 focus:ring-emerald-500"
              />
            </div>

            {/* Initial Password */}
            <div>
              <label className="block text-[11px] font-bold text-gray-700 mb-1">
                Initial Login Password
              </label>
              <input
                type="text"
                value={newCustomerForm.password}
                onChange={(e) => setNewCustomerForm({ ...newCustomerForm, password: e.target.value })}
                placeholder="Default: 12345678"
                className="w-full p-2.5 bg-gray-50 border border-gray-200 rounded-xl text-xs font-mono font-semibold text-gray-900 outline-none focus:ring-2 focus:ring-emerald-500"
              />
              <span className="text-[10px] text-gray-400 mt-0.5 block">
                Customer is password se login kar sakta hai aur baad me change kar sakta hai.
              </span>
            </div>

            {/* Submit Button */}
            <div className="pt-2">
              <button
                type="submit"
                disabled={submittingCustomer}
                className="w-full py-3 bg-gradient-to-r from-emerald-600 via-teal-600 to-emerald-700 hover:from-emerald-700 hover:to-teal-700 text-white font-black rounded-xl text-xs shadow-md transition active:scale-95 disabled:opacity-50 cursor-pointer flex items-center justify-center gap-2"
              >
                {submittingCustomer ? (
                  <span>Registering & Linking Customer...</span>
                ) : (
                  <>
                    <span>✓</span>
                    <span>Create & Link Customer Under Me →</span>
                  </>
                )}
              </button>
            </div>
          </form>
        </Sheet>
      )}

      {/* 24/7 Cute Animated Robot AI Advisor (Floating in bottom-right corner) */}
      <FloatingCuteRobotAdvisor
        onOpen={() => setShowAiAdvisor(true)}
        isOpen={showAiAdvisor}
      />

      <Toast msg={toast} onHide={() => setToast({ text: "", type: "" })} />

      <BottomNav items={navItems} active={navTab} onChange={setNavTab} />
    </div>
  );
}
