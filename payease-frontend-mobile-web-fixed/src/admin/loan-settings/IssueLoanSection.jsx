import React, { useState, useEffect, useCallback, useMemo } from "react";
import { tokenStorage } from "../../utils/tokenStorage";
import { API_BASE_URL } from "../../config";

// --- LINEAGE HELPER ---
const getUserLineage = (u, allUsers = [], allAgents = []) => {
  if (!u) return { type: "direct", label: "Direct Customer", subLabel: "", badge: "Direct Customer" };

  const isAgent =
    u.role === "agent" ||
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

  if (isAgent) {
    if (refId) {
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

  let parentAgent = null;
  const referrerParentId = referrer.referredBy && typeof referrer.referredBy === "object"
    ? String(referrer.referredBy._id || "")
    : referrer.referredBy ? String(referrer.referredBy) : null;

  if (referrerParentId) {
    parentAgent = allAgents.find(a => String(a._id) === referrerParentId) || allUsers.find(x => String(x._id) === referrerParentId);
  }

  const refName = referrer.name || "Agent";
  const refCode = referrer.referralCode || u.referredByCode || agentMatch?.referralCode || "";

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

export default function IssueLoanSection({ onSuccess, onCancel, showToast }) {
  const getAuthToken = () => tokenStorage.getToken() || localStorage.getItem("token") || "";

  // Admin Language Preference
  const [adminLang, setAdminLang] = useState(() => {
    try {
      return localStorage.getItem("educa_admin_lang") || "hinglish";
    } catch {
      return "hinglish";
    }
  });

  const toggleAdminLang = (lang) => {
    setAdminLang(lang);
    try {
      localStorage.setItem("educa_admin_lang", lang);
    } catch {}
  };

  // Directories & Loans
  const [users, setUsers] = useState([]);
  const [agents, setAgents] = useState([]);
  const [loans, setLoans] = useState([]);
  const [loadingDirectory, setLoadingDirectory] = useState(false);

  // Lightbox Modal for Zooming Documents
  const [lightboxImg, setLightboxImg] = useState(null);
  const [zoomLevel, setZoomLevel] = useState(1);

  // Assign / Reassign Agent Modal State
  const [assignAgentModalUser, setAssignAgentModalUser] = useState(null);
  const [selectedAgentForAssign, setSelectedAgentForAssign] = useState("");
  const [assigningAgent, setAssigningAgent] = useState(false);

  // Step 1: Borrower Selection
  const [issueBorrowerType, setIssueBorrowerType] = useState("existing"); // "existing" | "new"
  const [issueSelectedUser, setIssueSelectedUser] = useState(null);
  const [issueUserSearch, setIssueUserSearch] = useState("");
  const [issueHierarchyFilter, setIssueHierarchyFilter] = useState("all"); // "all" | "direct" | "agent" | "subagent"
  const [issueSelectedAgentFilter, setIssueSelectedAgentFilter] = useState("all");
  const [issueTimeFilter, setIssueTimeFilter] = useState("all"); // "all" | "today" | "week" | "month"

  // Missing fields & editable borrower info
  const [issueBorrowerDetails, setIssueBorrowerDetails] = useState({
    name: "",
    phone: "",
    email: "",
    address: "",
    aadharNumber: "",
    panNumber: ""
  });

  // New user form state
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

  // KYC Documents
  const [issueDocuments, setIssueDocuments] = useState({
    doc1Url: "",
    doc1BackUrl: "",
    doc2Url: "",
    doc2BackUrl: "",
    chequeUrl: "",
    chequeBackUrl: ""
  });

  // Cheque facility
  const [issueHasCheque, setIssueHasCheque] = useState(true);
  const [issueChequeNumber, setIssueChequeNumber] = useState("");

  // Step 2: Loan Structure & Terms
  const [issueLoanType, setIssueLoanType] = useState("personal"); // "personal" | "student" | "micro"
  const [issueLoanAmount, setIssueLoanAmount] = useState(10000);
  const [issueInstallmentsCount, setIssueInstallmentsCount] = useState(15);
  const [issueInterestRate, setIssueInterestRate] = useState(1.34);
  const [issuePurpose, setIssuePurpose] = useState("Personal Financial Need");

  // Step 3: Offline Backfill / Pre-paid Installments
  const [issuePaidInstallmentsCount, setIssuePaidInstallmentsCount] = useState(0);
  const [issueBackfillInstallments, setIssueBackfillInstallments] = useState([]);
  const [issueFirstPendingDueDate, setIssueFirstPendingDueDate] = useState("");
  const [issueCustomInstallmentAmount, setIssueCustomInstallmentAmount] = useState("");
  const [issueBackfillEvidenceUrl, setIssueBackfillEvidenceUrl] = useState("");
  const [issueBackfillEvidenceName, setIssueBackfillEvidenceName] = useState("");
  const [issueDisburseToWallet, setIssueDisburseToWallet] = useState(false);
  const [showAllInstallmentsCollapse, setShowAllInstallmentsCollapse] = useState(false);

  const [issueSubmitting, setIssueSubmitting] = useState(false);

  // Sync selected user into borrower details
  useEffect(() => {
    if (issueSelectedUser) {
      setIssueBorrowerDetails({
        name: issueSelectedUser.name || "",
        phone: issueSelectedUser.phone || "",
        email: issueSelectedUser.email || "",
        address: issueSelectedUser.address || "",
        aadharNumber: issueSelectedUser.aadharNumber || issueSelectedUser.kycData?.aadharNumber || "",
        panNumber: issueSelectedUser.panNumber || issueSelectedUser.kycData?.panNumber || ""
      });
      setIssueDocuments({
        doc1Url: issueSelectedUser.kycDocuments?.doc1Url || issueSelectedUser.kycDocuments?.docUrl || "",
        doc1BackUrl: issueSelectedUser.kycDocuments?.doc1BackUrl || "",
        doc2Url: issueSelectedUser.kycDocuments?.doc2Url || "",
        doc2BackUrl: issueSelectedUser.kycDocuments?.doc2BackUrl || "",
        chequeUrl: issueSelectedUser.kycDocuments?.chequeUrl || "",
        chequeBackUrl: issueSelectedUser.kycDocuments?.chequeBackUrl || ""
      });
    }
  }, [issueSelectedUser]);

  // Load Directory & Loans
  const fetchInitialData = useCallback(async () => {
    setLoadingDirectory(true);
    const token = getAuthToken();
    const headers = { Authorization: `Bearer ${token}` };

    try {
      const [uRes, aRes, lRes] = await Promise.all([
        fetch(`${API_BASE_URL}/admin/users`, { headers }),
        fetch(`${API_BASE_URL}/admin/agent-applications`, { headers }),
        fetch(`${API_BASE_URL}/loan/all`, { headers })
      ]);

      if (uRes.ok) {
        const uData = await uRes.json();
        if (Array.isArray(uData)) setUsers(uData.filter(u => u.role !== "admin"));
      }
      if (aRes.ok) {
        const aData = await aRes.json();
        if (Array.isArray(aData)) setAgents(aData);
      }
      if (lRes.ok) {
        const lData = await lRes.json();
        if (Array.isArray(lData)) setLoans(lData);
      }
    } catch {
      // Non-blocking
    } finally {
      setLoadingDirectory(false);
    }
  }, []);

  useEffect(() => {
    fetchInitialData();
  }, [fetchInitialData]);

  // Next standard cycle date (1st, 11th, 21st)
  const getNextCycleDate = (base = new Date()) => {
    const d = new Date(base);
    d.setDate(d.getDate() + 1);
    while (!(d.getDate() === 1 || d.getDate() === 11 || d.getDate() === 21)) {
      d.setDate(d.getDate() + 1);
    }
    return d.toISOString().split("T")[0];
  };

  // Backfill helpers
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
        arr.splice(val);
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

  // Image Upload with Canvas Compression
  const handleDocFileUpload = (key, file) => {
    if (!file) return;
    if (file.type && !file.type.startsWith("image/")) {
      if (showToast) showToast("Kripya sirf photo / image file upload karein", true);
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
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext("2d");
        ctx.drawImage(img, 0, 0, w, h);
        const compressedBase64 = canvas.toDataURL("image/jpeg", 0.82);
        setIssueDocuments(prev => ({ ...prev, [key]: compressedBase64 }));
        if (showToast) showToast("Document photo uploaded & compressed successfully!", false);
      };
      img.src = event.target.result;
    };
    reader.readAsDataURL(file);
  };

  // Backfill Evidence Upload
  const handleBackfillEvidenceUpload = (file) => {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (e) => {
      setIssueBackfillEvidenceUrl(e.target.result);
      setIssueBackfillEvidenceName(file.name || "Evidence Photo");
      if (showToast) showToast("Payment evidence attached successfully!", false);
    };
    reader.readAsDataURL(file);
  };

  // Save Agent Reassignment
  const handleSaveAssignAgent = async () => {
    if (!assignAgentModalUser) return;
    setAssigningAgent(true);
    try {
      const res = await fetch(`${API_BASE_URL}/admin/users/${assignAgentModalUser._id}/assign-agent`, {
        method: "PUT",
        headers: {
          Authorization: `Bearer ${getAuthToken()}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({ agentId: selectedAgentForAssign || null })
      });
      const data = await res.json();
      if (res.ok) {
        if (showToast) showToast(data.message || "Agent linked successfully!", false);
        fetchInitialData();
        setAssignAgentModalUser(null);
      } else {
        if (showToast) showToast(data.message || "Failed to link agent", true);
      }
    } catch {
      if (showToast) showToast("Error linking agent", true);
    } finally {
      setAssigningAgent(false);
    }
  };

  // Filtered Users List
  const filteredSearchUsers = useMemo(() => {
    return users.filter(u => {
      const lineage = getUserLineage(u, users, agents);

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

      if (issueHierarchyFilter === "direct") {
        if (lineage.type !== "direct") return false;
      } else if (issueHierarchyFilter === "agent") {
        if (lineage.type !== "agent" && lineage.type !== "agent_user") return false;
      } else if (issueHierarchyFilter === "subagent") {
        if (lineage.type !== "sub_agent" && lineage.type !== "subagent" && lineage.type !== "sub_agent_user") return false;
      }

      if (issueSelectedAgentFilter !== "all") {
        const targetAgentId = String(issueSelectedAgentFilter);
        const isThisAgent = String(u._id) === targetAgentId;
        const isUserOfThisAgent = String(lineage.agentId) === targetAgentId;
        if (!isThisAgent && !isUserOfThisAgent) return false;
      }

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
  }, [users, agents, issueUserSearch, issueHierarchyFilter, issueSelectedAgentFilter, issueTimeFilter]);

  // Missing Fields Calculation
  const missingBorrowerFields = useMemo(() => {
    if (!issueSelectedUser) return [];
    const miss = [];
    if (!issueBorrowerDetails.name?.trim()) miss.push({ key: "name", label: "Borrower Full Name" });
    if (!issueBorrowerDetails.phone?.trim() || !/^[6-9]\d{9}$/.test(issueBorrowerDetails.phone.trim())) {
      miss.push({ key: "phone", label: "Valid 10-Digit Mobile" });
    }
    if (!issueBorrowerDetails.aadharNumber?.trim() || issueBorrowerDetails.aadharNumber.trim().length !== 12) {
      miss.push({ key: "aadharNumber", label: "12-Digit Aadhaar" });
    }
    if (!issueBorrowerDetails.panNumber?.trim() || issueBorrowerDetails.panNumber.trim().length !== 10) {
      miss.push({ key: "panNumber", label: "10-Digit PAN Number" });
    }
    if (!issueBorrowerDetails.address?.trim()) miss.push({ key: "address", label: "Residential / Shop Address" });
    return miss;
  }, [issueSelectedUser, issueBorrowerDetails]);

  // Financial Calculations
  const calculations = useMemo(() => {
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

    // Upcoming schedule preview
    const upcomingSchedulePreview = [];
    if (remainingNum > 0) {
      let start = issueFirstPendingDueDate ? new Date(issueFirstPendingDueDate) : new Date();
      if (isNaN(start.getTime())) start = new Date();
      start.setHours(10, 0, 0, 0);

      const isDaily = issueLoanType === "micro";
      const startDay = start.getDate();
      const followStandardCycle = startDay === 1 || startDay === 11 || startDay === 21;
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

    return {
      amt,
      count,
      rate,
      installmentAmt,
      totalPayable,
      totalInterest,
      procFee,
      upiCharges,
      netDisbursal,
      paidNum,
      remainingNum,
      effectivePerInst,
      upcomingSchedulePreview,
      livePaidSum,
      liveRemainingSum,
      liveTotalPayable
    };
  }, [
    issueLoanAmount,
    issueInstallmentsCount,
    issueInterestRate,
    issuePaidInstallmentsCount,
    issueCustomInstallmentAmount,
    issueFirstPendingDueDate,
    issueLoanType,
    issueBackfillInstallments
  ]);

  // Form Submission
  const handleIssueLoanSubmit = async (e) => {
    e?.preventDefault();
    if (issueBorrowerType === "existing" && !issueSelectedUser) {
      if (showToast) showToast("Kripya ek borrower / customer select karein", true);
      return;
    }
    if (issueBorrowerType === "new" && (!issueNewUser.name || !issueNewUser.phone)) {
      if (showToast) showToast("New borrower ka naam aur phone number zaroori hai", true);
      return;
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

      const res = await fetch(`${API_BASE_URL}/loan/admin/create-on-behalf`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${getAuthToken()}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify(payload)
      });
      const data = await res.json();

      if (res.ok) {
        if (showToast) showToast(data.message || "Loan application submitted! Review and approve in Ledger.", false);
        if (onSuccess) onSuccess();
      } else {
        if (showToast) showToast(data.message || "Failed to create loan application", true);
      }
    } catch {
      if (showToast) showToast("Network error submitting loan application", true);
    } finally {
      setIssueSubmitting(false);
    }
  };

  const { amt, count, installmentAmt, procFee, upiCharges, netDisbursal, paidNum, remainingNum, upcomingSchedulePreview } = calculations;

  return (
    <div className="bg-white rounded-2xl shadow-sm p-4 sm:p-6 border border-slate-200 space-y-6 max-w-5xl mx-auto pb-16">
      {/* Top Header & Subtab Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 pb-3 border-b border-slate-100">
        <div className="flex items-center gap-1.5 p-1 bg-slate-100 rounded-xl border border-slate-200 flex-wrap">
          {onCancel && (
            <button
              type="button"
              onClick={onCancel}
              className="px-3 py-1.5 rounded-lg text-xs font-bold transition flex items-center gap-1.5 text-slate-600 hover:text-slate-900 hover:bg-white/60 cursor-pointer"
            >
              <span>📋</span>
              <span>{adminLang === "en" ? "Loans & Ledger" : "Loans & Ledger"}</span>
            </button>
          )}
          <button
            type="button"
            className="px-3 py-1.5 rounded-lg text-xs font-bold transition flex items-center gap-1.5 bg-white text-blue-700 shadow-2xs cursor-pointer"
          >
            <span>✍️</span>
            <span>{adminLang === "en" ? "Issue Loan Desk" : "Issue Loan Desk"}</span>
          </button>
        </div>

        {/* System Language Toggle - Compact & Mobile-Optimized */}
        <div className="inline-flex items-center p-0.5 bg-slate-100 rounded-lg border border-slate-200 self-start sm:self-auto shadow-2xs">
          <button
            type="button"
            onClick={() => toggleAdminLang("en")}
            className={`px-2 py-0.5 rounded-md text-[11px] font-bold transition cursor-pointer ${
              adminLang === "en" ? "bg-white text-blue-700 shadow-2xs" : "text-slate-500 hover:text-slate-900"
            }`}
          >
            English
          </button>
          <button
            type="button"
            onClick={() => toggleAdminLang("hinglish")}
            className={`px-2 py-0.5 rounded-md text-[11px] font-bold transition cursor-pointer ${
              adminLang === "hinglish" ? "bg-white text-blue-700 shadow-2xs" : "text-slate-500 hover:text-slate-900"
            }`}
          >
            Hinglish
          </button>
        </div>
      </div>

      {/* Title Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-4 border-b border-slate-100">
        <div>
          <div className="flex items-center gap-2">
            <h3 className="text-base sm:text-lg font-bold font-display text-slate-900">
              {adminLang === "en" ? "Admin Loan Desk — Issue & Apply On Behalf" : "Admin Loan Desk — Apply On Behalf"}
            </h3>
            <span className="px-2.5 py-0.5 rounded-full text-[10px] font-black bg-blue-100 text-blue-800 uppercase">
              Admin Authority
            </span>
          </div>
          <p className="text-xs text-slate-500 mt-1">
            {adminLang === "en"
              ? "Admin can apply or backfill loans directly on behalf of any customer or register new borrowers with customized collection schedules."
              : "Admin kisi bhi agent ke existing user ka loan apply kar sakta hai ya new user register karke loan apply kar sakta hai. Application pending queue me jayegi jahan aap ise final review karke approve karenge."}
          </p>
        </div>
        {onCancel && (
          <button
            type="button"
            onClick={onCancel}
            className="self-start sm:self-auto px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-800 border border-slate-300 rounded-xl text-xs font-bold transition flex items-center gap-2 cursor-pointer active:scale-95 shadow-2xs"
          >
            <span>←</span> Back to Loans Desk ({loans.length})
          </button>
        )}
      </div>

      {/* Main Form */}
      <form onSubmit={handleIssueLoanSubmit} className="space-y-6">
        {/* Step 1: Borrower Selection */}
        <div className="p-4 sm:p-5 bg-slate-50 border border-slate-200 rounded-2xl space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
            <h4 className="text-xs sm:text-sm font-black text-slate-900 flex items-center gap-2">
              <span className="w-5 h-5 rounded-full bg-blue-600 text-white text-[10px] flex items-center justify-center font-bold">1</span>
              Borrower Selection (Kiske Liye Loan Apply Karna Hai?)
            </h4>
            {/* Mode Switcher */}
            <div className="flex items-center p-1 bg-white rounded-xl border border-slate-200 text-xs font-bold">
              <button
                type="button"
                onClick={() => setIssueBorrowerType("existing")}
                className={`px-3 py-1.5 rounded-lg transition cursor-pointer flex items-center gap-1.5 ${
                  issueBorrowerType === "existing"
                    ? "bg-blue-600 text-white shadow-xs font-black"
                    : "text-slate-500 hover:text-slate-900"
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
                    : "text-slate-500 hover:text-slate-900"
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

                  {/* Borrower KYC & Loan History Intelligence */}
                  {(() => {
                    const userPrevLoans = loans.filter(l => String(l.userId?._id || l.userId) === String(issueSelectedUser._id));
                    const hasLoanHistory = userPrevLoans.length > 0;
                    const hasNormalKyc = issueSelectedUser.kycStatus === "verified" || Boolean(issueSelectedUser.kycDocuments?.doc1Url || issueSelectedUser.kycDocuments?.docUrl);

                    // STATE A: Genuine Returning Loan Borrower
                    if (hasLoanHistory) {
                      return (
                        <div className="space-y-3 p-4 bg-emerald-50/80 border border-emerald-300 rounded-2xl">
                          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-emerald-200/70 pb-2.5">
                            <div className="flex items-center gap-2.5">
                              <div className="w-8 h-8 rounded-xl bg-emerald-600 text-white flex items-center justify-center shadow-2xs shrink-0 font-bold">
                                ✓
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

                          {/* Breakdown of all previous loans */}
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

                                const pFee = Number(pl.processingFee !== undefined && pl.processingFee !== null ? pl.processingFee : Math.round((pl.amount || 0) * 0.05));
                                const uFee = Number(pl.upiCharges !== undefined && pl.upiCharges !== null ? pl.upiCharges : Math.round((pl.amount || 0) * 0.01));
                                const inHand = Number(pl.disbursalAmount || Math.max(0, (pl.amount || 0) - pFee - uFee));

                                return (
                                  <div
                                    key={pl._id || idx}
                                    className="p-3 bg-white border border-emerald-200 rounded-xl space-y-2 shadow-2xs hover:shadow-xs transition"
                                  >
                                    <div className="flex items-start justify-between gap-1.5 border-b border-slate-100 pb-1.5">
                                      <div>
                                        <div className="flex items-center gap-1.5">
                                          <span className="text-xs font-black text-slate-900">
                                            #{idx + 1} {pl.loanType === "student" ? "Student" : pl.loanType === "micro_business" || pl.loanType === "micro" ? "Micro" : "Personal"} Loan
                                          </span>
                                          <span className={`text-[9px] font-black px-1.5 py-0.2 rounded border uppercase ${badgeColor}`}>
                                            {pl.status}
                                          </span>
                                        </div>
                                        <span className="text-[10px] font-mono text-slate-400 block">
                                          Acc: {pl.accountNumber || pl._id?.slice(-8)}
                                        </span>
                                      </div>
                                      <div className="text-right">
                                        <span className="text-xs font-black font-mono text-emerald-700 block">
                                          ₹{Number(pl.amount || 0).toLocaleString("en-IN")}
                                        </span>
                                        <span className="text-[9px] text-slate-400 font-bold block">Sanctioned</span>
                                      </div>
                                    </div>

                                    {/* Financial Grid */}
                                    <div className="grid grid-cols-3 gap-1.5 text-[10px]">
                                      <div className="p-1.5 bg-emerald-50/80 border border-emerald-200/70 rounded-lg">
                                        <span className="text-emerald-800 block text-[9px] font-bold">In-Hand Disbursed</span>
                                        <span className="font-mono font-black text-emerald-700">
                                          ₹{inHand.toLocaleString("en-IN")}
                                        </span>
                                      </div>
                                      <div className="p-1.5 bg-slate-50 rounded-lg">
                                        <span className="text-slate-500 block text-[9px]">Tenure / Kist</span>
                                        <span className="font-mono font-bold text-blue-800">
                                          {pl.installmentsCount || pl.tenure || 15} Kist
                                        </span>
                                      </div>
                                      <div className="p-1.5 bg-slate-50 rounded-lg">
                                        <span className="text-slate-500 block text-[9px]">Per Kist (EMI)</span>
                                        <span className="font-mono font-bold text-slate-900">
                                          ₹{Number(pl.installmentAmount || pl.emiAmount || 0).toLocaleString("en-IN")}
                                        </span>
                                      </div>
                                    </div>
                                  </div>
                                );
                              })}
                            </div>
                          </div>
                        </div>
                      );
                    }

                    // STATE B: Normal KYC Done, But Cheque Required
                    if (hasNormalKyc) {
                      return (
                        <div className="space-y-3 p-4 bg-amber-50/90 border-2 border-amber-300 rounded-2xl">
                          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-amber-200 pb-2.5">
                            <div className="flex items-center gap-2.5">
                              <div className="w-8 h-8 rounded-xl bg-amber-500 text-white flex items-center justify-center shadow-2xs shrink-0 font-bold">
                                !
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

                          {/* Verified KYC Docs Review */}
                          <div className="space-y-2">
                            <div className="flex items-center justify-between">
                              <span className="text-xs font-black text-slate-900 flex items-center gap-1.5">
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
                                    <div className="flex items-center justify-between text-[11px] font-bold text-slate-800">
                                      <span className="truncate">{doc.icon} {doc.label}</span>
                                      {fileUrl ? (
                                        <span className="text-emerald-700 font-black text-[9px] bg-emerald-50 px-1.5 py-0.5 rounded border border-emerald-200 shrink-0">✓ On File</span>
                                      ) : (
                                        <span className="text-amber-700 font-bold text-[9px] bg-amber-50 px-1.5 py-0.5 rounded shrink-0">Upload</span>
                                      )}
                                    </div>
                                    {fileUrl ? (
                                      <div className="relative group w-full h-16 bg-slate-100 rounded-lg overflow-hidden flex items-center justify-center border border-slate-200">
                                        <img
                                          src={fileUrl}
                                          alt={doc.label}
                                          className="max-h-full max-w-full object-contain cursor-zoom-in"
                                          onClick={() => { setLightboxImg(fileUrl); setZoomLevel(1); }}
                                        />
                                        <button
                                          type="button"
                                          onClick={() => { setLightboxImg(fileUrl); setZoomLevel(1); }}
                                          className="absolute bottom-1 right-1 bg-black/60 hover:bg-black/80 text-white text-[9px] font-bold px-1.5 py-0.5 rounded flex items-center gap-0.5 shadow-xs cursor-pointer"
                                        >
                                          Zoom
                                        </button>
                                      </div>
                                    ) : (
                                      <input
                                        type="file"
                                        accept="image/*"
                                        onChange={(e) => handleDocFileUpload(doc.key, e.target.files[0])}
                                        className="text-[9px] text-slate-500 w-full file:mr-1 file:py-0.5 file:px-1.5 file:rounded file:border-0 file:text-[9px] file:font-bold file:bg-blue-50 file:text-blue-700 cursor-pointer"
                                      />
                                    )}
                                  </div>
                                );
                              })}
                            </div>
                          </div>

                          {/* Barrier Cheque Upload Fields */}
                          <div className="p-3 bg-white border border-amber-300 rounded-xl space-y-2">
                            <div className="flex items-center justify-between">
                              <span className="text-xs font-black text-slate-900 flex items-center gap-1.5">
                                Compulsory Barrier Cheque Details for Loan / Lending
                              </span>
                              <span className="text-[10px] text-emerald-700 font-bold bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200">Photos Only (Secure Storage)</span>
                            </div>

                            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                              {/* Cheque Front */}
                              <div className="p-2.5 bg-slate-50 border border-slate-200 rounded-lg space-y-1.5">
                                <div className="flex items-center justify-between text-[11px] font-bold text-slate-800">
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
                                  className="text-[9px] text-slate-500 w-full file:mr-1 file:py-0.5 file:px-1.5 file:rounded file:border-0 file:text-[9px] file:font-bold file:bg-blue-50 file:text-blue-700 cursor-pointer"
                                />
                              </div>

                              {/* Cheque Back */}
                              <div className="p-2.5 bg-slate-50 border border-slate-200 rounded-lg space-y-1.5">
                                <div className="flex items-center justify-between text-[11px] font-bold text-slate-800">
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
                                  className="text-[9px] text-slate-500 w-full file:mr-1 file:py-0.5 file:px-1.5 file:rounded file:border-0 file:text-[9px] file:font-bold file:bg-blue-50 file:text-blue-700 cursor-pointer"
                                />
                              </div>

                              {/* Cheque Number Input */}
                              <div className="p-2.5 bg-slate-50 border border-slate-200 rounded-lg space-y-1.5 flex flex-col justify-between">
                                <div>
                                  <label className="text-[11px] font-bold text-slate-800 block">
                                    Barrier Cheque Number <span className="text-rose-500">*</span>
                                  </label>
                                  <span className="text-[9px] text-slate-500 block">Bank cheque par likha 6-digit number</span>
                                </div>
                                <input
                                  type="text"
                                  value={issueChequeNumber}
                                  onChange={(e) => setIssueChequeNumber(e.target.value)}
                                  placeholder="e.g. 000452"
                                  className="w-full px-2.5 py-1.5 bg-white border border-slate-300 rounded-lg text-xs font-mono font-bold text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
                                />
                              </div>
                            </div>
                          </div>
                        </div>
                      );
                    }

                    // STATE C: First Time Borrower
                    return (
                      <div className="p-4 bg-amber-50/90 border border-amber-300 rounded-2xl space-y-3">
                        <div className="flex items-center justify-between">
                          <div>
                            <span className="text-xs font-black text-amber-950 block">
                              First Time Borrower — Full Loan KYC Required (Aadhaar, PAN & Cheque)
                            </span>
                            <span className="text-[10px] text-amber-800 block">
                              Is borrower ke KYC documents file par nahi hain. Niche diye gaye sabhi documents upload karein:
                            </span>
                          </div>
                          <span className="text-[10px] text-emerald-700 font-bold bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200 hidden sm:inline">Photos Only</span>
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
                              <div className="flex items-center justify-between text-[11px] font-bold text-slate-800">
                                <span>{doc.icon} {doc.label}</span>
                                {issueDocuments[doc.key] ? (
                                  <span className="text-emerald-600 text-[10px] font-black">✓ Uploaded</span>
                                ) : (
                                  <span className="text-slate-400 text-[10px]">Select</span>
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
                                className="text-[9px] text-slate-500 w-full file:mr-1 file:py-0.5 file:px-1.5 file:rounded file:border-0 file:text-[9px] file:font-bold file:bg-blue-50 file:text-blue-700 cursor-pointer"
                              />
                            </div>
                          ))}
                        </div>

                        {/* Cheque Number input for First Time Borrower */}
                        <div className="p-2.5 bg-white border border-amber-200 rounded-xl flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                          <div>
                            <span className="text-xs font-bold text-slate-800 block">
                              Barrier Cheque Number (Compulsory for Loan Security)
                            </span>
                            <span className="text-[10px] text-slate-500">Security barrier cheque ka 6-digit number enter karein</span>
                          </div>
                          <input
                            type="text"
                            value={issueChequeNumber}
                            onChange={(e) => setIssueChequeNumber(e.target.value)}
                            placeholder="e.g. 000452"
                            className="w-full sm:w-48 px-3 py-1.5 border border-slate-300 rounded-lg text-xs font-mono font-bold text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
                          />
                        </div>
                      </div>
                    );
                  })()}
                </div>
              ) : (
                /* Search & Pick from Users */
                <div className="space-y-3">
                  <input
                    type="text"
                    value={issueUserSearch}
                    onChange={(e) => setIssueUserSearch(e.target.value)}
                    placeholder="Search customer by name, phone, account number, or referring agent / sub-agent..."
                    className="w-full px-3.5 py-2.5 bg-white border border-slate-300 rounded-xl text-xs text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 shadow-2xs"
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
                        className="px-2 py-1 bg-white border border-slate-300 rounded-lg text-[10px] font-bold text-slate-800 focus:outline-none cursor-pointer"
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

                  <div className="max-h-60 overflow-y-auto space-y-1.5 p-1 border border-slate-200 rounded-xl bg-white no-scrollbar">
                    {loadingDirectory ? (
                      <p className="py-6 text-center text-xs text-slate-400">Loading directory...</p>
                    ) : filteredSearchUsers.length === 0 ? (
                      <p className="py-6 text-center text-xs text-slate-400">No matching users found.</p>
                    ) : (
                      filteredSearchUsers.slice(0, 30).map(u => {
                        const lineage = getUserLineage(u, users, agents);
                        const uLoans = loans.filter(l => String(l.userId?._id || l.userId) === String(u._id));
                        return (
                          <div
                            key={u._id}
                            onClick={() => setIssueSelectedUser(u)}
                            className="p-2.5 rounded-xl hover:bg-blue-50/70 border border-slate-200 hover:border-blue-300 flex items-center justify-between gap-2 transition cursor-pointer group shadow-2xs"
                          >
                            <div className="min-w-0 flex-1">
                              <div className="flex items-center gap-2 flex-wrap">
                                <span className="font-bold text-xs text-slate-900 group-hover:text-blue-900">{u.name}</span>
                                <span className="font-mono text-[10px] text-slate-500">
                                  {u.accountNumber || `EFS${String(u._id).slice(-7).toUpperCase()}`}
                                </span>

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

                                {uLoans.length > 0 ? (
                                  <span className="px-1.5 py-0.5 rounded text-[9px] font-black bg-emerald-100 text-emerald-900 border border-emerald-300">
                                    {uLoans.length} Purane Loan
                                  </span>
                                ) : (u.kycStatus === "verified" || Boolean(u.kycDocuments?.doc1Url || u.kycDocuments?.docUrl)) ? (
                                  <span className="px-1.5 py-0.5 rounded text-[9px] font-bold bg-amber-50 text-amber-800 border border-amber-200">
                                    Normal KYC (Cheque Chahiye)
                                  </span>
                                ) : (
                                  <span className="px-1.5 py-0.5 rounded text-[9px] font-medium bg-slate-100 text-slate-500">
                                    No KYC
                                  </span>
                                )}
                              </div>
                              <p className="text-[11px] text-slate-400 mt-0.5">
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
            <div className="space-y-3 bg-white p-3.5 sm:p-4 rounded-xl border border-slate-200">
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
                <div>
                  <label className="text-[11px] font-bold text-slate-700 block mb-1">
                    Borrower Full Name <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    value={issueNewUser.name}
                    onChange={(e) => setIssueNewUser({ ...issueNewUser, name: e.target.value })}
                    placeholder="e.g. Ramesh Kumar"
                    className="w-full px-3 py-2 border border-slate-300 rounded-xl text-xs text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>

                <div>
                  <label className="text-[11px] font-bold text-slate-700 block mb-1">
                    Phone Number (10 Digits) <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="tel"
                    required
                    maxLength={10}
                    value={issueNewUser.phone}
                    onChange={(e) => setIssueNewUser({ ...issueNewUser, phone: e.target.value.replace(/\D/g, '') })}
                    placeholder="e.g. 9876543210"
                    className="w-full px-3 py-2 border border-slate-300 rounded-xl text-xs text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500 font-mono"
                  />
                </div>

                <div>
                  <label className="text-[11px] font-bold text-slate-700 block mb-1">
                    Email Address (Optional)
                  </label>
                  <input
                    type="email"
                    value={issueNewUser.email}
                    onChange={(e) => setIssueNewUser({ ...issueNewUser, email: e.target.value })}
                    placeholder="e.g. ramesh@educa.com"
                    className="w-full px-3 py-2 border border-slate-300 rounded-xl text-xs text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>

                <div>
                  <label className="text-[11px] font-bold text-slate-700 block mb-1">
                    Aadhaar Card Number (Optional)
                  </label>
                  <input
                    type="text"
                    maxLength={12}
                    value={issueNewUser.aadharNumber}
                    onChange={(e) => setIssueNewUser({ ...issueNewUser, aadharNumber: e.target.value.replace(/\D/g, '') })}
                    placeholder="12-digit UID"
                    className="w-full px-3 py-2 border border-slate-300 rounded-xl text-xs text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500 font-mono"
                  />
                </div>

                <div>
                  <label className="text-[11px] font-bold text-slate-700 block mb-1">
                    PAN Card Number (Optional)
                  </label>
                  <input
                    type="text"
                    maxLength={10}
                    value={issueNewUser.panNumber}
                    onChange={(e) => setIssueNewUser({ ...issueNewUser, panNumber: e.target.value.toUpperCase() })}
                    placeholder="10-digit PAN"
                    className="w-full px-3 py-2 border border-slate-300 rounded-xl text-xs text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500 font-mono uppercase"
                  />
                </div>

                <div>
                  <label className="text-[11px] font-bold text-slate-700 block mb-1">
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
                    className="w-full px-3 py-2 border border-slate-300 rounded-xl text-xs text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white cursor-pointer"
                  >
                    <option value="">No Agent (Direct Company Borrower)</option>
                    {agents.map(a => (
                      <option key={a._id} value={a._id}>
                        {a.name} ({a.referralCode || "Agent"})
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div>
                <label className="text-[11px] font-bold text-slate-700 block mb-1">
                  Residential / Shop Address
                </label>
                <input
                  type="text"
                  value={issueNewUser.address}
                  onChange={(e) => setIssueNewUser({ ...issueNewUser, address: e.target.value })}
                  placeholder="Full address, city, pin code..."
                  className="w-full px-3 py-2 border border-slate-300 rounded-xl text-xs text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              {/* Document Upload for New User */}
              <div className="pt-2 border-t border-slate-200 space-y-2.5">
                <div className="flex items-center justify-between">
                  <label className="text-[11px] font-bold text-slate-800 block">
                    Upload Full Loan KYC Documents (Aadhaar, PAN & Barrier Cheque)
                  </label>
                  <span className="text-[10px] text-emerald-700 font-bold bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200">Photos Only</span>
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
                    <div key={doc.key} className="p-2.5 bg-slate-50 border border-slate-200 rounded-xl space-y-1.5">
                      <div className="flex items-center justify-between text-[11px] font-bold text-slate-800">
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
                        className="text-[9px] text-slate-500 w-full file:mr-1 file:py-0.5 file:px-1.5 file:rounded file:border-0 file:text-[9px] file:font-bold file:bg-blue-50 file:text-blue-700 cursor-pointer"
                      />
                    </div>
                  ))}
                </div>

                <div className="p-2.5 bg-slate-50 border border-slate-200 rounded-xl flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                  <div>
                    <span className="text-[11px] font-bold text-slate-800 block">
                      Barrier Cheque Number (Compulsory for Loan Security)
                    </span>
                    <span className="text-[9px] text-slate-500">Security barrier cheque ka 6-digit number enter karein</span>
                  </div>
                  <input
                    type="text"
                    value={issueChequeNumber}
                    onChange={(e) => setIssueChequeNumber(e.target.value)}
                    placeholder="e.g. 000452"
                    className="w-full sm:w-48 px-2.5 py-1.5 bg-white border border-slate-300 rounded-lg text-xs font-mono font-bold text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
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

          {/* Category */}
          <div className="space-y-1.5">
            <label className="text-xs font-bold text-slate-700 block">
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
                      : "bg-white border-slate-200 hover:bg-slate-50 text-slate-700"
                  }`}
                >
                  <span className={`block text-xs font-black ${issueLoanType === cat.id ? "text-blue-900" : "text-slate-900"}`}>
                    {cat.label}
                  </span>
                  <span className="block text-[10px] text-slate-500 mt-0.5 leading-tight">
                    {cat.desc}
                  </span>
                </button>
              ))}
            </div>
          </div>

          {/* Amount Input & Quick Pills */}
          <div className="space-y-2 pt-2 border-t border-slate-200">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1">
              <label className="text-xs font-bold text-slate-700">
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
              className="w-full px-3.5 py-2.5 bg-white border border-slate-300 rounded-xl text-base font-black font-mono text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
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
                      : "bg-white text-slate-700 hover:bg-slate-100 border border-slate-300"
                  }`}
                >
                  ₹{p.toLocaleString("en-IN")}
                </button>
              ))}
            </div>
          </div>

          {/* Installments Count */}
          <div className="space-y-2 pt-2 border-t border-slate-200">
            <div className="flex items-center justify-between">
              <label className="text-xs font-bold text-slate-700">
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
                      : "bg-white text-slate-800 hover:bg-slate-50 border-slate-300"
                  }`}
                >
                  <span className="block font-black text-sm">{kist} Kist</span>
                  <span className={`text-[10px] block ${issueInstallmentsCount === kist ? "text-blue-200" : "text-slate-400"}`}>
                    {days}
                  </span>
                </button>
              ))}
            </div>
          </div>

          {/* Interest Rate & Security */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2 border-t border-slate-200 text-xs">
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <label className="font-bold text-slate-700 block">
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
                      : "bg-white text-slate-700 border-slate-300 hover:bg-slate-50"
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
                      : "bg-white text-slate-700 border-slate-300 hover:bg-slate-50"
                  }`}
                >
                  1.0% (&gt;₹20k)
                </button>
                <div className="flex-1 flex items-center gap-1 border border-slate-300 rounded-xl px-2.5 py-1.5 bg-white focus-within:ring-2 focus-within:ring-blue-500">
                  <span className="text-[10px] font-bold text-slate-400">Custom:</span>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    max="25"
                    value={issueInterestRate}
                    onChange={(e) => setIssueInterestRate(parseFloat(e.target.value) || 0)}
                    placeholder="e.g. 1.2"
                    className="w-full text-xs font-black font-mono text-slate-900 focus:outline-none"
                  />
                  <span className="text-xs font-bold text-slate-500">%</span>
                </div>
              </div>
            </div>

            <div className="space-y-1">
              <label className="font-bold text-slate-700 block">
                Security Cheque Facility
              </label>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setIssueHasCheque(false)}
                  className={`flex-1 py-2 px-3 rounded-xl border font-bold text-center transition cursor-pointer ${
                    !issueHasCheque
                      ? "bg-slate-800 text-white border-slate-800"
                      : "bg-white text-slate-700 border-slate-300"
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
                      : "bg-white text-slate-700 border-slate-300"
                  }`}
                >
                  Yes (Cheque Facility)
                </button>
              </div>
            </div>
          </div>

          {issueHasCheque && (
            <div>
              <label className="text-[11px] font-bold text-slate-700 block mb-1">
                Barrier Cheque Number
              </label>
              <input
                type="text"
                value={issueChequeNumber}
                onChange={(e) => setIssueChequeNumber(e.target.value)}
                placeholder="e.g. 000452"
                className="w-full px-3 py-2 bg-white border border-slate-300 rounded-xl text-xs text-slate-900 font-mono"
              />
            </div>
          )}

          <div>
            <label className="text-[11px] font-bold text-slate-700 block mb-1">
              Loan Purpose / Admin Remarks
            </label>
            <input
              type="text"
              value={issuePurpose}
              onChange={(e) => setIssuePurpose(e.target.value)}
              placeholder="e.g. Shop working capital, emergency medical, personal..."
              className="w-full px-3 py-2 bg-white border border-slate-300 rounded-xl text-xs text-slate-900"
            />
          </div>

          {/* Section: Offline / Backfill Loan */}
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
                <label className="text-[11px] font-bold text-slate-700 block mb-1">
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
                    className="w-9 h-9 bg-slate-200 hover:bg-slate-300 disabled:opacity-40 text-slate-800 font-black text-base rounded-xl flex items-center justify-center cursor-pointer active:scale-95 transition shrink-0"
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
                    className="flex-1 h-9 px-3 bg-white border border-slate-300 rounded-xl text-xs text-slate-900 font-black text-center"
                  />
                  <button
                    type="button"
                    onClick={() => addBackfillInstallment(installmentAmt)}
                    className="w-9 h-9 bg-emerald-600 hover:bg-emerald-500 text-white font-black text-base rounded-xl flex items-center justify-center cursor-pointer active:scale-95 transition shrink-0 shadow-2xs"
                    title="Nayi kist jodein (+)"
                  >
                    +
                  </button>
                </div>
                <span className="text-[10px] text-slate-500 block mt-0.5">
                  {Number(issuePaidInstallmentsCount) > 0 ? `✓ Kist 1 se ${issuePaidInstallmentsCount} Paid mark hongi` : "0 = Naya fresh loan"}
                </span>
              </div>

              <div>
                <label className="text-[11px] font-bold text-slate-700 block mb-1">
                  Agli Kist Ki Due Date (Next Due)
                </label>
                <input
                  type="date"
                  value={issueFirstPendingDueDate}
                  onChange={(e) => setIssueFirstPendingDueDate(e.target.value)}
                  className="w-full h-9 px-3 bg-white border border-slate-300 rounded-xl text-xs text-slate-900 font-semibold"
                />
                <span className="text-[10px] text-slate-500 block mt-0.5">
                  Kist #{Number(issuePaidInstallmentsCount) + 1} kab due hogi
                </span>
              </div>

              <div>
                <label className="text-[11px] font-bold text-slate-700 block mb-1">
                  Custom Per Kist Amount (Optional)
                </label>
                <input
                  type="number"
                  value={issueCustomInstallmentAmount}
                  onChange={(e) => setIssueCustomInstallmentAmount(e.target.value)}
                  placeholder={`Auto: ₹${installmentAmt}`}
                  className="w-full h-9 px-3 bg-white border border-slate-300 rounded-xl text-xs text-slate-900 font-bold"
                />
                <span className="text-[10px] text-slate-500 block mt-0.5">
                  Khali rakhein toh auto ₹{installmentAmt}
                </span>
              </div>
            </div>

            {/* Offline Payment Proof Upload */}
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
                  <span className="text-[11px] text-slate-500">
                    (Bank passbook / cash voucher / UPI payment screenshot attach karein)
                  </span>
                )}
              </div>
            </div>

            {/* Collapsible All-Kist Breakdown */}
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
                <span>{showAllInstallmentsCollapse ? "▲ Band Karein" : "▼ Kholein"}</span>
              </button>

              {showAllInstallmentsCollapse && (
                <div className="p-3 bg-white rounded-xl border border-slate-200 space-y-2">
                  <div className="max-h-60 overflow-y-auto divide-y divide-slate-100">
                    {issueBackfillInstallments.map((inst, idx) => (
                      <div key={idx} className="py-2 flex items-center justify-between gap-2 text-xs">
                        <span className="font-bold text-slate-800">Kist #{inst.installmentNo} (PAID)</span>
                        <div className="flex items-center gap-2">
                          <input
                            type="number"
                            value={inst.amount}
                            onChange={(e) => updateBackfillInstallmentField(idx, "amount", Number(e.target.value))}
                            className="w-20 px-2 py-1 text-xs border border-slate-200 rounded font-mono font-bold"
                          />
                          <input
                            type="date"
                            value={inst.paidOn}
                            onChange={(e) => updateBackfillInstallmentField(idx, "paidOn", e.target.value)}
                            className="px-2 py-1 text-xs border border-slate-200 rounded font-mono"
                          />
                          <button
                            type="button"
                            onClick={() => removeBackfillInstallment(idx)}
                            className="text-rose-600 hover:text-rose-800 text-xs font-bold px-1"
                          >
                            ✕
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Step 3: Financial Summary & Disbursal Breakdown */}
        <div className="p-4 sm:p-5 bg-blue-50/50 rounded-2xl border border-blue-200 space-y-4">
          <div className="flex items-center justify-between">
            <h4 className="text-xs sm:text-sm font-black text-slate-900 flex items-center gap-2">
              <span className="w-5 h-5 rounded-full bg-blue-600 text-white text-[10px] flex items-center justify-center font-bold">3</span>
              Financial Summary & Disbursal Breakdown
            </h4>
            <span className="text-xs font-bold text-blue-700 font-mono">
              {count} Kists @ {issueInterestRate}%
            </span>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2.5">
            <div className="p-3 bg-white rounded-xl border border-blue-100">
              <span className="text-[10px] font-bold text-slate-400 uppercase block">Sanctioned</span>
              <span className="text-sm sm:text-base font-black text-slate-900 font-mono">
                ₹{amt.toLocaleString("en-IN")}
              </span>
            </div>
            <div className="p-3 bg-white rounded-xl border border-blue-100">
              <span className="text-[10px] font-bold text-slate-400 uppercase block">Processing (5%)</span>
              <span className="text-sm sm:text-base font-black text-rose-600 font-mono">
                -₹{procFee.toLocaleString("en-IN")}
              </span>
            </div>
            <div className="p-3 bg-white rounded-xl border border-blue-100">
              <span className="text-[10px] font-bold text-slate-400 uppercase block">UPI (1%)</span>
              <span className="text-sm sm:text-base font-black text-rose-600 font-mono">
                -₹{upiCharges.toLocaleString("en-IN")}
              </span>
            </div>
            <div className="p-3 bg-white rounded-xl border border-blue-100">
              <span className="text-[10px] font-bold text-slate-400 uppercase block">In-Hand Disbursal</span>
              <span className="text-sm sm:text-base font-black text-emerald-700 font-mono">
                ₹{netDisbursal.toLocaleString("en-IN")}
              </span>
            </div>
            <div className="p-3 bg-white rounded-xl border border-blue-100">
              <span className="text-[10px] font-bold text-slate-400 uppercase block">EMI Per Kist</span>
              <span className="text-sm sm:text-base font-black text-blue-700 font-mono">
                ₹{installmentAmt.toLocaleString("en-IN")}
              </span>
            </div>
            <div className="p-3 bg-white rounded-xl border border-blue-100">
              <span className="text-[10px] font-bold text-slate-400 uppercase block">Total Payable</span>
              <span className="text-sm sm:text-base font-black text-indigo-700 font-mono">
                ₹{calculations.totalPayable.toLocaleString("en-IN")}
              </span>
            </div>
          </div>

          {/* Real-Time Upcoming Installments Table */}
          {remainingNum > 0 && (
            <div className="pt-2">
              <span className="text-[11px] font-bold text-slate-600 block mb-1.5">
                📅 Auto-Calculated Upcoming Installments ({remainingNum} Remaining)
              </span>
              <div className="flex gap-2 overflow-x-auto no-scrollbar py-1">
                {upcomingSchedulePreview.slice(0, 10).map((inst) => (
                  <div
                    key={inst.installmentNo}
                    className="p-2 bg-white rounded-lg border border-slate-200 text-center shrink-0 min-w-[90px]"
                  >
                    <span className="text-[10px] font-black text-slate-400 block">Kist #{inst.installmentNo}</span>
                    <span className="text-xs font-black text-slate-900 block font-mono">₹{inst.amount}</span>
                    <span className="text-[9px] text-slate-500 block font-mono">{inst.dueDate}</span>
                  </div>
                ))}
                {upcomingSchedulePreview.length > 10 && (
                  <div className="p-2 bg-slate-100 rounded-lg flex items-center justify-center shrink-0 px-3 text-[11px] font-bold text-slate-500">
                    +{upcomingSchedulePreview.length - 10} more...
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Disburse to wallet checkbox */}
          <div className="pt-2 border-t border-blue-100">
            <label className="flex items-center gap-2 cursor-pointer text-xs font-bold text-slate-800">
              <input
                type="checkbox"
                checked={issueDisburseToWallet}
                onChange={(e) => setIssueDisburseToWallet(e.target.checked)}
                className="w-4 h-4 text-blue-600 rounded border-slate-300"
              />
              <span>In-Hand payout (₹{netDisbursal}) borrower ke user wallet me turant credit karein</span>
            </label>
          </div>
        </div>

        {/* Submit Actions */}
        <div className="flex items-center justify-end gap-3 pt-4 border-t border-slate-200">
          {onCancel && (
            <button
              type="button"
              onClick={onCancel}
              className="px-4 py-2.5 rounded-xl border border-slate-300 text-xs font-bold text-slate-700 hover:bg-slate-50 cursor-pointer"
            >
              Cancel
            </button>
          )}
          <button
            type="submit"
            disabled={issueSubmitting}
            className="px-6 py-2.5 bg-blue-600 hover:bg-blue-700 active:scale-95 text-white font-black rounded-xl text-xs transition flex items-center gap-2 shadow-sm cursor-pointer disabled:opacity-50"
          >
            {issueSubmitting ? (
              <>
                <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                <span>Submitting Loan Application...</span>
              </>
            ) : (
              <>
                <span>🚀</span>
                <span>Confirm & Issue Loan Application</span>
              </>
            )}
          </button>
        </div>
      </form>

      {/* Lightbox Modal for Photo Zoom */}
      {lightboxImg && (
        <div
          className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4 backdrop-blur-xs"
          onClick={() => setLightboxImg(null)}
        >
          <div className="relative max-w-4xl max-h-[90vh] bg-white rounded-2xl overflow-hidden p-2" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between pb-2 px-2 border-b border-slate-200">
              <span className="text-xs font-bold text-slate-700">Document Photo Preview</span>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setZoomLevel(prev => Math.min(prev + 0.3, 3))}
                  className="px-2 py-0.5 bg-slate-100 rounded text-xs font-bold text-slate-800"
                >
                  Zoom +
                </button>
                <button
                  type="button"
                  onClick={() => setZoomLevel(prev => Math.max(prev - 0.3, 0.5))}
                  className="px-2 py-0.5 bg-slate-100 rounded text-xs font-bold text-slate-800"
                >
                  Zoom −
                </button>
                <button
                  type="button"
                  onClick={() => setLightboxImg(null)}
                  className="w-6 h-6 rounded-full bg-slate-200 text-slate-800 font-bold flex items-center justify-center text-xs"
                >
                  ✕
                </button>
              </div>
            </div>
            <div className="overflow-auto max-h-[80vh] flex items-center justify-center p-2">
              <img
                src={lightboxImg}
                alt="Document Preview"
                style={{ transform: `scale(${zoomLevel})`, transition: "transform 0.15s ease" }}
                className="max-h-[75vh] object-contain"
              />
            </div>
          </div>
        </div>
      )}

      {/* Assign Agent Modal */}
      {assignAgentModalUser && (
        <div
          className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4"
          onClick={() => setAssignAgentModalUser(null)}
        >
          <div className="bg-white rounded-2xl max-w-md w-full p-5 space-y-4 shadow-xl" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between border-b pb-2">
              <h4 className="text-sm font-bold text-slate-900">Reassign or Link Agent Partner</h4>
              <button
                type="button"
                onClick={() => setAssignAgentModalUser(null)}
                className="text-slate-400 hover:text-slate-600 font-bold"
              >
                ✕
              </button>
            </div>
            <div className="space-y-2 text-xs">
              <p className="text-slate-600">
                User: <strong>{assignAgentModalUser.name}</strong> ({assignAgentModalUser.phone})
              </p>
              <label className="font-bold text-slate-700 block">Select Agent Partner:</label>
              <select
                value={selectedAgentForAssign}
                onChange={(e) => setSelectedAgentForAssign(e.target.value)}
                className="w-full px-3 py-2 border border-slate-300 rounded-xl text-xs font-bold bg-white"
              >
                <option value="">No Agent (Direct Company User)</option>
                {agents.map(ag => (
                  <option key={ag._id} value={ag._id}>
                    {ag.name} ({ag.referralCode || "Agent"}) — {ag.phone}
                  </option>
                ))}
              </select>
            </div>
            <div className="flex justify-end gap-2 pt-2 border-t">
              <button
                type="button"
                onClick={() => setAssignAgentModalUser(null)}
                className="px-3 py-1.5 border rounded-xl text-xs font-bold text-slate-700"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={assigningAgent}
                onClick={handleSaveAssignAgent}
                className="px-4 py-1.5 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-xl text-xs transition"
              >
                {assigningAgent ? "Linking..." : "Save Link"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
