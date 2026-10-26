import React, { useState, useEffect, useCallback, useMemo } from "react";
import { tokenStorage } from "../../utils/tokenStorage";
import { API_BASE_URL } from "../../config";

export default function IssueLoanSection({ onSuccess, onCancel, showToast }) {
  const getAuthToken = () => tokenStorage.getToken() || localStorage.getItem("token") || "";

  // Borrower Mode: "existing" | "new"
  const [borrowerType, setBorrowerType] = useState("existing");

  // Users & Agents Directory
  const [users, setUsers] = useState([]);
  const [agents, setAgents] = useState([]);
  const [loadingDirectory, setLoadingDirectory] = useState(false);

  // Search & Filters for Existing Users
  const [userSearch, setUserSearch] = useState("");
  const [hierarchyFilter, setHierarchyFilter] = useState("all"); // "all" | "direct" | "agent" | "subagent"
  const [selectedUser, setSelectedUser] = useState(null);

  // New Borrower Form
  const [newUser, setNewUser] = useState({
    name: "",
    phone: "",
    email: "",
    address: "",
    aadharNumber: "",
    panNumber: "",
    referredByAgentId: ""
  });

  // Loan Configuration
  const [loanType, setLoanType] = useState("personal_starter");
  const [amount, setAmount] = useState(10000);
  const [installmentsCount, setInstallmentsCount] = useState(15);
  const [interestRate, setInterestRate] = useState(1.34);
  const [frequency, setFrequency] = useState("10days"); // "10days" | "daily"
  const [firstDueDate, setFirstDueDate] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() + 10);
    return d.toISOString().split("T")[0];
  });
  const [purpose, setPurpose] = useState("");
  const [hasCheque, setHasCheque] = useState(false);
  const [chequeNumber, setChequeNumber] = useState("");
  const [disburseToWallet, setDisburseToWallet] = useState(false);

  // Backfill / Pre-paid offline installments
  const [hasBackfill, setHasBackfill] = useState(false);
  const [paidInstallmentsCount, setPaidInstallmentsCount] = useState(0);

  // Submission state
  const [submitting, setSubmitting] = useState(false);

  // Fetch Users & Agents for Borrower Selection
  const fetchDirectory = useCallback(async () => {
    setLoadingDirectory(true);
    const token = getAuthToken();
    const headers = { Authorization: `Bearer ${token}` };

    try {
      const [uRes, aRes] = await Promise.all([
        fetch(`${API_BASE_URL}/admin/users`, { headers }),
        fetch(`${API_BASE_URL}/admin/agent-applications`, { headers })
      ]);

      if (uRes.ok) {
        const uData = await uRes.json();
        if (Array.isArray(uData)) {
          setUsers(uData.filter((u) => u.role !== "admin"));
        }
      }

      if (aRes.ok) {
        const aData = await aRes.json();
        if (Array.isArray(aData)) {
          setAgents(aData);
        }
      }
    } catch {
      // Non-blocking fallback
    } finally {
      setLoadingDirectory(false);
    }
  }, []);

  useEffect(() => {
    fetchDirectory();
  }, [fetchDirectory]);

  // Sync loanType frequency
  const handleLoanTypeChange = (e) => {
    const t = e.target.value;
    setLoanType(t);
    if (t === "micro_business") {
      setFrequency("daily");
      setInstallmentsCount(30);
    } else {
      setFrequency("10days");
      setInstallmentsCount(15);
    }
  };

  // Filtered Users List for Existing Mode
  const filteredUsers = useMemo(() => {
    if (!userSearch && hierarchyFilter === "all") {
      return users.slice(0, 15);
    }

    const q = userSearch.toLowerCase().trim();
    return users
      .filter((u) => {
        if (q) {
          const match =
            (u.name && u.name.toLowerCase().includes(q)) ||
            (u.phone && u.phone.includes(q)) ||
            (u.email && u.email.toLowerCase().includes(q)) ||
            (u.accountNumber && u.accountNumber.toLowerCase().includes(q));
          if (!match) return false;
        }

        if (hierarchyFilter === "direct") {
          if (u.referredByAgentId) return false;
        } else if (hierarchyFilter === "agent") {
          if (!u.referredByAgentId) return false;
        }

        return true;
      })
      .slice(0, 30);
  }, [users, userSearch, hierarchyFilter]);

  // Financial Calculations
  const calculations = useMemo(() => {
    const pAmt = Number(amount) || 0;
    const count = Number(installmentsCount) || 1;
    const rate = Number(interestRate) || 0;

    const principalPerInst = count > 0 ? pAmt / count : 0;
    const interestPerInst = (pAmt * rate) / 100;
    const emi = Math.round(principalPerInst + interestPerInst);

    const totalPayable = emi * count;
    const totalInterest = Math.max(0, totalPayable - pAmt);

    const procFee = Math.round((pAmt * 5) / 100);
    const upiCharges = Math.round((pAmt * 1) / 100);
    const netDisbursal = Math.max(0, pAmt - (procFee + upiCharges));

    return {
      pAmt,
      count,
      rate,
      emi,
      totalPayable,
      totalInterest,
      procFee,
      upiCharges,
      netDisbursal
    };
  }, [amount, installmentsCount, interestRate]);

  // Upcoming Schedule Preview
  const schedulePreview = useMemo(() => {
    const list = [];
    const count = Number(installmentsCount) || 0;
    const paid = hasBackfill ? Math.min(Number(paidInstallmentsCount) || 0, count) : 0;
    const remaining = Math.max(0, count - paid);

    let cur = firstDueDate ? new Date(firstDueDate) : new Date();
    if (isNaN(cur.getTime())) cur = new Date();

    for (let i = 0; i < remaining; i++) {
      const kistNo = paid + i + 1;
      if (i > 0) {
        if (frequency === "daily") {
          cur.setDate(cur.getDate() + 1);
        } else {
          cur.setDate(cur.getDate() + 10);
        }
      }
      list.push({
        no: kistNo,
        date: new Date(cur).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" }),
        amount: calculations.emi
      });
    }

    return { paid, remaining, list };
  }, [installmentsCount, hasBackfill, paidInstallmentsCount, firstDueDate, frequency, calculations.emi]);

  // Form Submission
  const handleSubmit = async (e) => {
    e.preventDefault();

    if (borrowerType === "existing" && !selectedUser) {
      if (showToast) showToast("Kripya ek customer / borrower select karein", true);
      return;
    }

    if (borrowerType === "new" && (!newUser.name.trim() || !newUser.phone.trim())) {
      if (showToast) showToast("Naye borrower ka naam aur phone number zaroori hai", true);
      return;
    }

    if (calculations.pAmt < 500) {
      if (showToast) showToast("Kam se kam ₹500 loan amount daalein", true);
      return;
    }

    setSubmitting(true);
    const token = getAuthToken();

    try {
      const payload = {
        borrowerType,
        userId: borrowerType === "existing" ? selectedUser._id : undefined,
        name: borrowerType === "new" ? newUser.name.trim() : selectedUser.name,
        phone: borrowerType === "new" ? newUser.phone.trim() : selectedUser.phone,
        email: borrowerType === "new" ? newUser.email.trim() : selectedUser.email,
        address: borrowerType === "new" ? newUser.address.trim() : selectedUser.address,
        aadharNumber: borrowerType === "new" ? newUser.aadharNumber.trim() : selectedUser.aadharNumber,
        panNumber: borrowerType === "new" ? newUser.panNumber.trim() : selectedUser.panNumber,
        referredByAgentId: borrowerType === "new" ? newUser.referredByAgentId || undefined : undefined,
        loanType,
        amount: calculations.pAmt,
        installmentsCount: calculations.count,
        interestRateOption: calculations.rate,
        collectionFrequency: frequency,
        hasChequeFacility: hasCheque,
        chequeNumber: hasCheque ? chequeNumber.trim() : "",
        purpose: purpose.trim() || `${loanType.replace("_", " ").toUpperCase()} Loan`,
        firstPendingDueDate: firstDueDate || undefined,
        disburseToWallet,
        paidInstallmentsCount: hasBackfill ? Number(paidInstallmentsCount) || 0 : 0,
        directActive: hasBackfill && Number(paidInstallmentsCount) > 0,
        adminNote: `Issued via Admin Loan Desk for ${borrowerType === "new" ? newUser.name : selectedUser?.name} (${loanType})`
      };

      const res = await fetch(`${API_BASE_URL}/loan/admin/create-on-behalf`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify(payload)
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.message || "Failed to create loan");
      }

      if (showToast) showToast(data.message || "Loan successfully created and registered!", false);
      if (onSuccess) onSuccess();
    } catch (err) {
      if (showToast) showToast(err.message || "Error submitting loan application", true);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-6 max-w-5xl mx-auto pb-16">
      {/* Top Header Card */}
      <div className="bg-white rounded-2xl shadow-sm p-4 sm:p-6 border border-slate-200">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-100">
          <div>
            <h3 className="text-base sm:text-lg font-black text-slate-900 flex items-center gap-2">
              <span>✍️</span>
              <span>Issue Loan Desk / Apply on Behalf</span>
            </h3>
            <p className="text-xs text-slate-500 mt-0.5">
              Admin kisi bhi existing user ya naye customer ke behalf par loan issue kar sakte hain.
            </p>
          </div>
          {onCancel && (
            <button
              type="button"
              onClick={onCancel}
              className="px-3 py-1.5 rounded-xl border border-slate-200 text-xs font-bold text-slate-600 hover:bg-slate-50 self-start sm:self-auto cursor-pointer"
            >
              ← Wapas Ledger Me Jayein
            </button>
          )}
        </div>

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="mt-5 space-y-6">
          {/* Step 1: Borrower Selection */}
          <div className="p-4 sm:p-5 bg-slate-50/80 rounded-2xl border border-slate-200 space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
              <div className="flex items-center gap-2">
                <span className="w-6 h-6 rounded-full bg-blue-600 text-white text-xs font-black flex items-center justify-center">
                  1
                </span>
                <h4 className="text-sm font-bold text-slate-900">Borrower Selection (Kiske Liye Loan Hai?)</h4>
              </div>

              {/* Mode Toggle */}
              <div className="flex items-center gap-1 bg-white p-1 rounded-xl border border-slate-200 text-xs font-bold">
                <button
                  type="button"
                  onClick={() => setBorrowerType("existing")}
                  className={`px-3 py-1.5 rounded-lg transition cursor-pointer ${
                    borrowerType === "existing"
                      ? "bg-blue-600 text-white shadow-2xs font-black"
                      : "text-slate-600 hover:text-slate-900"
                  }`}
                >
                  Existing Customer / User
                </button>
                <button
                  type="button"
                  onClick={() => setBorrowerType("new")}
                  className={`px-3 py-1.5 rounded-lg transition cursor-pointer ${
                    borrowerType === "new"
                      ? "bg-blue-600 text-white shadow-2xs font-black"
                      : "text-slate-600 hover:text-slate-900"
                  }`}
                >
                  + New Customer Registration
                </button>
              </div>
            </div>

            {/* Existing Borrower Selector */}
            {borrowerType === "existing" ? (
              <div className="space-y-3 pt-2">
                {selectedUser ? (
                  <div className="p-3.5 bg-blue-50/70 border border-blue-200 rounded-xl flex items-center justify-between gap-3">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-full bg-blue-600 text-white font-bold flex items-center justify-center text-sm">
                        {selectedUser.name?.[0]?.toUpperCase() || "U"}
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-bold text-slate-900">{selectedUser.name}</span>
                          {selectedUser.accountNumber && (
                            <span className="px-1.5 py-0.5 rounded text-[10px] font-mono bg-white text-slate-700 border border-slate-200">
                              {selectedUser.accountNumber}
                            </span>
                          )}
                        </div>
                        <div className="text-xs text-slate-600">
                          📱 {selectedUser.phone} {selectedUser.email ? `• ✉️ ${selectedUser.email}` : ""}
                        </div>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => setSelectedUser(null)}
                      className="px-2.5 py-1 text-xs font-bold text-rose-600 hover:bg-rose-50 rounded-lg border border-rose-200 cursor-pointer"
                    >
                      Change User
                    </button>
                  </div>
                ) : (
                  <div className="space-y-2">
                    <div className="flex flex-col sm:flex-row gap-2">
                      <div className="relative flex-1">
                        <span className="absolute left-3 top-2.5 text-slate-400 text-xs">🔍</span>
                        <input
                          type="text"
                          value={userSearch}
                          onChange={(e) => setUserSearch(e.target.value)}
                          placeholder="Search borrower by name, phone, account #..."
                          className="w-full pl-8 pr-3 py-2 text-xs bg-white border border-slate-200 rounded-xl focus:outline-none focus:border-blue-500 font-medium"
                        />
                      </div>
                      <select
                        value={hierarchyFilter}
                        onChange={(e) => setHierarchyFilter(e.target.value)}
                        className="px-3 py-2 text-xs bg-white border border-slate-200 rounded-xl font-bold text-slate-700"
                      >
                        <option value="all">All Borrowers</option>
                        <option value="direct">Direct Users Only</option>
                        <option value="agent">Agent Network Users</option>
                      </select>
                    </div>

                    {/* Quick Pick List */}
                    <div className="max-h-48 overflow-y-auto divide-y divide-slate-100 bg-white border border-slate-200 rounded-xl">
                      {loadingDirectory ? (
                        <div className="p-4 text-center text-xs text-slate-400">Loading user directory...</div>
                      ) : filteredUsers.length === 0 ? (
                        <div className="p-4 text-center text-xs text-slate-400">Koi matching customer nahi mila.</div>
                      ) : (
                        filteredUsers.map((u) => (
                          <div
                            key={u._id}
                            onClick={() => setSelectedUser(u)}
                            className="p-2.5 hover:bg-blue-50/50 flex items-center justify-between gap-2 cursor-pointer transition"
                          >
                            <div>
                              <div className="text-xs font-bold text-slate-800">{u.name}</div>
                              <div className="text-[11px] text-slate-500">
                                📱 {u.phone} {u.accountNumber ? `• A/C: ${u.accountNumber}` : ""}
                              </div>
                            </div>
                            <button
                              type="button"
                              className="px-2 py-1 rounded bg-blue-50 text-blue-700 text-[11px] font-bold hover:bg-blue-100"
                            >
                              Select
                            </button>
                          </div>
                        ))
                      )}
                    </div>
                  </div>
                )}
              </div>
            ) : (
              /* New Borrower Form Fields */
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 pt-2">
                <div>
                  <label className="text-[11px] font-bold text-slate-600 block mb-1">Full Name *</label>
                  <input
                    type="text"
                    required
                    value={newUser.name}
                    onChange={(e) => setNewUser({ ...newUser, name: e.target.value })}
                    placeholder="e.g. Ramesh Kumar"
                    className="w-full px-3 py-2 text-xs bg-white border border-slate-200 rounded-xl focus:outline-none focus:border-blue-500 font-medium"
                  />
                </div>
                <div>
                  <label className="text-[11px] font-bold text-slate-600 block mb-1">Mobile Phone *</label>
                  <input
                    type="tel"
                    required
                    value={newUser.phone}
                    onChange={(e) => setNewUser({ ...newUser, phone: e.target.value })}
                    placeholder="10-digit phone"
                    className="w-full px-3 py-2 text-xs bg-white border border-slate-200 rounded-xl focus:outline-none focus:border-blue-500 font-medium"
                  />
                </div>
                <div>
                  <label className="text-[11px] font-bold text-slate-600 block mb-1">Email Address</label>
                  <input
                    type="email"
                    value={newUser.email}
                    onChange={(e) => setNewUser({ ...newUser, email: e.target.value })}
                    placeholder="borrower@example.com"
                    className="w-full px-3 py-2 text-xs bg-white border border-slate-200 rounded-xl focus:outline-none focus:border-blue-500 font-medium"
                  />
                </div>
                <div>
                  <label className="text-[11px] font-bold text-slate-600 block mb-1">Residential Address</label>
                  <input
                    type="text"
                    value={newUser.address}
                    onChange={(e) => setNewUser({ ...newUser, address: e.target.value })}
                    placeholder="City, State, Pin"
                    className="w-full px-3 py-2 text-xs bg-white border border-slate-200 rounded-xl focus:outline-none focus:border-blue-500 font-medium"
                  />
                </div>
                <div>
                  <label className="text-[11px] font-bold text-slate-600 block mb-1">Aadhaar Number</label>
                  <input
                    type="text"
                    value={newUser.aadharNumber}
                    onChange={(e) => setNewUser({ ...newUser, aadharNumber: e.target.value })}
                    placeholder="12-digit Aadhaar"
                    className="w-full px-3 py-2 text-xs bg-white border border-slate-200 rounded-xl focus:outline-none focus:border-blue-500 font-medium"
                  />
                </div>
                <div>
                  <label className="text-[11px] font-bold text-slate-600 block mb-1">PAN Number</label>
                  <input
                    type="text"
                    value={newUser.panNumber}
                    onChange={(e) => setNewUser({ ...newUser, panNumber: e.target.value })}
                    placeholder="10-digit PAN"
                    className="w-full px-3 py-2 text-xs bg-white border border-slate-200 rounded-xl focus:outline-none focus:border-blue-500 font-medium"
                  />
                </div>
              </div>
            )}
          </div>

          {/* Step 2: Loan Structure & Terms */}
          <div className="p-4 sm:p-5 bg-slate-50/80 rounded-2xl border border-slate-200 space-y-4">
            <div className="flex items-center gap-2">
              <span className="w-6 h-6 rounded-full bg-blue-600 text-white text-xs font-black flex items-center justify-center">
                2
              </span>
              <h4 className="text-sm font-bold text-slate-900">Loan Terms & Sanction Parameters</h4>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3.5">
              {/* Loan Type */}
              <div>
                <label className="text-[11px] font-bold text-slate-600 block mb-1">Loan Category</label>
                <select
                  value={loanType}
                  onChange={handleLoanTypeChange}
                  className="w-full px-3 py-2 text-xs bg-white border border-slate-200 rounded-xl font-bold text-slate-800"
                >
                  <option value="personal_starter">Personal Starter Loan</option>
                  <option value="micro_business">Micro Business (Daily EMI)</option>
                  <option value="student">Student / Education Loan</option>
                  <option value="emergency">Emergency / Instant Loan</option>
                </select>
              </div>

              {/* Principal Amount */}
              <div>
                <label className="text-[11px] font-bold text-slate-600 block mb-1">Sanctioned Principal (₹) *</label>
                <input
                  type="number"
                  min="500"
                  step="500"
                  required
                  value={amount}
                  onChange={(e) => setAmount(Math.max(0, Number(e.target.value)))}
                  className="w-full px-3 py-2 text-xs bg-white border border-slate-200 rounded-xl font-mono font-bold text-slate-900"
                />
              </div>

              {/* Installments Count */}
              <div>
                <label className="text-[11px] font-bold text-slate-600 block mb-1">Total Installments (Kist)</label>
                <input
                  type="number"
                  min="1"
                  max="120"
                  required
                  value={installmentsCount}
                  onChange={(e) => setInstallmentsCount(Math.max(1, Number(e.target.value)))}
                  className="w-full px-3 py-2 text-xs bg-white border border-slate-200 rounded-xl font-mono font-bold text-slate-900"
                />
              </div>

              {/* Interest Rate */}
              <div>
                <label className="text-[11px] font-bold text-slate-600 block mb-1">Interest Rate (% per Kist)</label>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  required
                  value={interestRate}
                  onChange={(e) => setInterestRate(Number(e.target.value))}
                  className="w-full px-3 py-2 text-xs bg-white border border-slate-200 rounded-xl font-mono font-bold text-slate-900"
                />
              </div>

              {/* Collection Frequency */}
              <div>
                <label className="text-[11px] font-bold text-slate-600 block mb-1">Cycle Frequency</label>
                <select
                  value={frequency}
                  onChange={(e) => setFrequency(e.target.value)}
                  className="w-full px-3 py-2 text-xs bg-white border border-slate-200 rounded-xl font-bold text-slate-800"
                >
                  <option value="10days">Every 10 Days (1st, 11th, 21st)</option>
                  <option value="daily">Daily Repayment</option>
                </select>
              </div>

              {/* First Due Date */}
              <div>
                <label className="text-[11px] font-bold text-slate-600 block mb-1">First Due Date</label>
                <input
                  type="date"
                  value={firstDueDate}
                  onChange={(e) => setFirstDueDate(e.target.value)}
                  className="w-full px-3 py-2 text-xs bg-white border border-slate-200 rounded-xl font-mono font-bold text-slate-900"
                />
              </div>

              {/* Loan Purpose */}
              <div>
                <label className="text-[11px] font-bold text-slate-600 block mb-1">Purpose of Loan</label>
                <input
                  type="text"
                  value={purpose}
                  onChange={(e) => setPurpose(e.target.value)}
                  placeholder="e.g. Shop renovation, fees..."
                  className="w-full px-3 py-2 text-xs bg-white border border-slate-200 rounded-xl font-medium text-slate-800"
                />
              </div>

              {/* Disburse to Wallet */}
              <div className="flex items-center pt-5">
                <label className="flex items-center gap-2 cursor-pointer text-xs font-bold text-slate-700">
                  <input
                    type="checkbox"
                    checked={disburseToWallet}
                    onChange={(e) => setDisburseToWallet(e.target.checked)}
                    className="w-4 h-4 text-blue-600 rounded border-slate-300 focus:ring-blue-500"
                  />
                  <span>Credit directly to user's wallet</span>
                </label>
              </div>
            </div>

            {/* Optional Cheque & Backfill Section */}
            <div className="pt-3 border-t border-slate-200 grid grid-cols-1 sm:grid-cols-2 gap-3">
              {/* Cheque Facility */}
              <div className="p-3 bg-white rounded-xl border border-slate-200">
                <label className="flex items-center gap-2 cursor-pointer text-xs font-bold text-slate-800 mb-2">
                  <input
                    type="checkbox"
                    checked={hasCheque}
                    onChange={(e) => setHasCheque(e.target.checked)}
                    className="w-4 h-4 text-blue-600 rounded border-slate-300"
                  />
                  <span>Security Cheque Attached?</span>
                </label>
                {hasCheque && (
                  <input
                    type="text"
                    value={chequeNumber}
                    onChange={(e) => setChequeNumber(e.target.value)}
                    placeholder="Enter Security Cheque Number"
                    className="w-full px-3 py-1.5 text-xs bg-slate-50 border border-slate-200 rounded-lg font-mono font-bold"
                  />
                )}
              </div>

              {/* Backfill / Offline paid installments */}
              <div className="p-3 bg-white rounded-xl border border-slate-200">
                <label className="flex items-center gap-2 cursor-pointer text-xs font-bold text-slate-800 mb-2">
                  <input
                    type="checkbox"
                    checked={hasBackfill}
                    onChange={(e) => setHasBackfill(e.target.checked)}
                    className="w-4 h-4 text-blue-600 rounded border-slate-300"
                  />
                  <span>Backfill Offline Installments (Already partly paid)</span>
                </label>
                {hasBackfill && (
                  <div className="flex items-center gap-2">
                    <span className="text-[11px] text-slate-500 font-medium">Already Paid Count:</span>
                    <input
                      type="number"
                      min="1"
                      max={installmentsCount - 1}
                      value={paidInstallmentsCount}
                      onChange={(e) => setPaidInstallmentsCount(Math.max(0, Number(e.target.value)))}
                      className="w-20 px-2 py-1 text-xs bg-slate-50 border border-slate-200 rounded-lg font-mono font-bold"
                    />
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Step 3: Real-Time Calculation & Payout Preview */}
          <div className="p-4 sm:p-5 bg-blue-50/50 rounded-2xl border border-blue-200 space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="w-6 h-6 rounded-full bg-blue-600 text-white text-xs font-black flex items-center justify-center">
                  3
                </span>
                <h4 className="text-sm font-bold text-slate-900">Financial Breakdown & Payout Preview</h4>
              </div>
              <span className="text-xs font-bold text-blue-700 font-mono">
                {calculations.count} Kists @ {calculations.rate}%
              </span>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2.5">
              <div className="p-3 bg-white rounded-xl border border-blue-100">
                <span className="text-[10px] font-bold text-slate-400 uppercase block">Sanctioned</span>
                <span className="text-sm sm:text-base font-black text-slate-900 font-mono">
                  ₹{calculations.pAmt.toLocaleString("en-IN")}
                </span>
              </div>
              <div className="p-3 bg-white rounded-xl border border-blue-100">
                <span className="text-[10px] font-bold text-slate-400 uppercase block">Processing (5%)</span>
                <span className="text-sm sm:text-base font-black text-rose-600 font-mono">
                  -₹{calculations.procFee.toLocaleString("en-IN")}
                </span>
              </div>
              <div className="p-3 bg-white rounded-xl border border-blue-100">
                <span className="text-[10px] font-bold text-slate-400 uppercase block">UPI (1%)</span>
                <span className="text-sm sm:text-base font-black text-rose-600 font-mono">
                  -₹{calculations.upiCharges.toLocaleString("en-IN")}
                </span>
              </div>
              <div className="p-3 bg-white rounded-xl border border-blue-100">
                <span className="text-[10px] font-bold text-slate-400 uppercase block">Net Disbursal</span>
                <span className="text-sm sm:text-base font-black text-emerald-700 font-mono">
                  ₹{calculations.netDisbursal.toLocaleString("en-IN")}
                </span>
              </div>
              <div className="p-3 bg-white rounded-xl border border-blue-100">
                <span className="text-[10px] font-bold text-slate-400 uppercase block">EMI Per Kist</span>
                <span className="text-sm sm:text-base font-black text-blue-700 font-mono">
                  ₹{calculations.emi.toLocaleString("en-IN")}
                </span>
              </div>
              <div className="p-3 bg-white rounded-xl border border-blue-100">
                <span className="text-[10px] font-bold text-slate-400 uppercase block">Total Payable</span>
                <span className="text-sm sm:text-base font-black text-indigo-700 font-mono">
                  ₹{calculations.totalPayable.toLocaleString("en-IN")}
                </span>
              </div>
            </div>

            {/* Upcoming Schedule Mini Preview */}
            <div className="pt-2">
              <span className="text-[11px] font-bold text-slate-600 block mb-1.5">
                📅 Schedule Preview ({schedulePreview.remaining} upcoming installments)
              </span>
              <div className="flex gap-2 overflow-x-auto no-scrollbar py-1">
                {schedulePreview.list.slice(0, 8).map((inst) => (
                  <div
                    key={inst.no}
                    className="p-2 bg-white rounded-lg border border-slate-200 text-center shrink-0 min-w-[90px]"
                  >
                    <span className="text-[10px] font-black text-slate-400 block">Kist #{inst.no}</span>
                    <span className="text-xs font-black text-slate-900 block font-mono">₹{inst.amount}</span>
                    <span className="text-[9px] text-slate-500 block font-mono">{inst.date}</span>
                  </div>
                ))}
                {schedulePreview.list.length > 8 && (
                  <div className="p-2 bg-slate-100 rounded-lg flex items-center justify-center shrink-0 px-3 text-[11px] font-bold text-slate-500">
                    +{schedulePreview.list.length - 8} more...
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Action Buttons */}
          <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-200">
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
              disabled={submitting}
              className="px-6 py-2.5 bg-blue-600 hover:bg-blue-700 active:scale-95 text-white font-black rounded-xl text-xs transition flex items-center gap-2 shadow-sm cursor-pointer disabled:opacity-50"
            >
              {submitting ? (
                <>
                  <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  <span>Submitting Loan...</span>
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
      </div>
    </div>
  );
}
