import React, { useState, useEffect, useCallback, useMemo } from "react";
import { API } from "../config";
import { tokenStorage } from "../utils/tokenStorage";

const ALL_DEPARTMENTS = [
  { id: "loan", label: "Loan Desk (Tum Loan wale ho)", sub: "Loans review, approve/reject & disbursal", icon: "" },
  { id: "kyc", label: "🪪 KYC Desk (Tum KYC wale ho)", sub: "Aadhaar & PAN verification & approval", icon: "🪪" },
  { id: "deposit", label: "Deposit Desk (Tum Deposit wale ho)", sub: "Bank UTR transfers verify & credit", icon: "" },
  { id: "withdrawal", label: "Withdrawal Desk (Tum Withdrawal wale ho)", sub: "Customer payouts & bank cash-outs", icon: "" },
  { id: "lending", label: "Lending Desk", sub: "Borrower & lender transactions", icon: "" },
  { id: "bond", label: "Bonds & FD Desk", sub: "Fixed yield bonds & debentures", icon: "" }
];

const DEPT_PERMISSIONS = {
  loan: ["loan.view", "loan.process", "loan.disburse", "loan.waive_penalty", "loan.create_on_behalf"],
  kyc: ["kyc.view", "kyc.process", "kyc.view_documents"],
  deposit: ["deposit.view", "deposit.process", "deposit.view_proof"],
  withdrawal: ["withdrawal.view", "withdrawal.process"],
  lending: ["lending.view", "lending.process"],
  bond: ["bond.view", "bond.process"]
};

const ALL_PERMISSIONS_LIST = [
  { key: "deposit.view", label: "View Deposits", dept: "deposit" },
  { key: "deposit.process", label: "Approve/Reject Deposits", dept: "deposit" },
  { key: "deposit.view_proof", label: "View Deposit Proofs", dept: "deposit" },
  { key: "withdrawal.view", label: "View Withdrawals", dept: "withdrawal" },
  { key: "withdrawal.process", label: "Approve/Reject Withdrawals", dept: "withdrawal" },
  { key: "loan.view", label: "View Loan Requests", dept: "loan" },
  { key: "loan.process", label: "Approve/Reject Loans", dept: "loan" },
  { key: "loan.disburse", label: "Disburse Approved Loans", dept: "loan" },
  { key: "loan.waive_penalty", label: "Waive Penalties", dept: "loan" },
  { key: "loan.create_on_behalf", label: "Create Loan for User", dept: "loan" },
  { key: "kyc.view", label: "View KYC Requests", dept: "kyc" },
  { key: "kyc.process", label: "Approve/Reject KYC", dept: "kyc" },
  { key: "kyc.view_documents", label: "View Sensitive KYC Documents", dept: "kyc" },
  { key: "lending.view", label: "View Lending Requests", dept: "lending" },
  { key: "lending.process", label: "Approve Lending", dept: "lending" },
  { key: "bond.view", label: "View Bonds & FD Applications", dept: "bond" },
  { key: "bond.process", label: "Approve/Reject Bonds", dept: "bond" }
];

export default function StaffManager() {
  const token = tokenStorage.getToken();

  const [staffList, setStaffList] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [toast, setToast] = useState({ msg: "", isError: false });

  // Create Staff Modal State
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [createForm, setCreateForm] = useState({
    name: "",
    email: "",
    phone: "",
    password: "",
    departments: ["loan"],
    permissions: DEPT_PERMISSIONS.loan
  });
  const [createdCredentials, setCreatedCredentials] = useState(null);

  // Edit Permissions Modal State
  const [editingStaff, setEditingStaff] = useState(null);
  const [editForm, setEditForm] = useState({
    departments: [],
    permissions: []
  });

  // Loan Department Central Pool State
  const [loanDeptPool, setLoanDeptPool] = useState({
    totalPool: 1000000,
    marketDisbursed: 0,
    availablePool: 1000000,
    activeLoansCount: 0,
    utilizationPercent: 0
  });
  const [poolEditing, setPoolEditing] = useState(false);
  const [editPoolInput, setEditPoolInput] = useState(1000000);
  const [poolSaving, setPoolSaving] = useState(false);

  const showToast = useCallback((msg, isError = false) => {
    setToast({ msg, isError });
    setTimeout(() => setToast({ msg: "", isError: false }), 4500);
  }, []);

  // Fetch Loan Department Central Pool
  const fetchDeptPool = useCallback(async () => {
    try {
      let res = await fetch(`${API}/loan/department-pool`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (!res.ok) {
        res = await fetch(`${API}/loans/department-pool`, {
          headers: { Authorization: `Bearer ${token}` }
        });
      }
      if (!res.ok) {
        res = await fetch(`${API}/admin/department-pool`, {
          headers: { Authorization: `Bearer ${token}` }
        });
      }
      const data = await res.json();
      if (data.success) {
        setLoanDeptPool(data);
        setEditPoolInput(data.totalPool || 1000000);
      }
    } catch (_) {}
  }, [token]);

  const handleSavePool = async () => {
    const val = Number(editPoolInput);
    if (!Number.isFinite(val) || val < 0) {
      showToast("Kripya sahi pool amount dalein", true);
      return;
    }
    setPoolSaving(true);
    try {
      let res = await fetch(`${API}/loan/department-pool`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({ totalPool: val })
      });
      if (res.status === 404) {
        res = await fetch(`${API}/loans/department-pool`, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json"
          },
          body: JSON.stringify({ totalPool: val })
        });
      }
      if (res.status === 404) {
        res = await fetch(`${API}/admin/department-pool`, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json"
          },
          body: JSON.stringify({ totalPool: val })
        });
      }
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.message || "Failed to update pool");
      setLoanDeptPool(data);
      setPoolEditing(false);
      showToast(data.message || "Loan Department pool updated!");
    } catch (err) {
      showToast(err.message, true);
    } finally {
      setPoolSaving(false);
    }
  };

  // Fetch staff accounts
  const fetchStaff = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`${API}/admin/staff`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || "Failed to fetch staff members");
      setStaffList(data.staff || []);
    } catch (err) {
      showToast(err.message, true);
    } finally {
      setLoading(false);
    }
  }, [token, showToast]);

  useEffect(() => {
    fetchStaff();
    fetchDeptPool();
  }, [fetchStaff, fetchDeptPool]);

  // Toggle Department Checkbox in Create Form (Multi-role selection)
  const toggleCreateDept = (deptId) => {
    setCreateForm(prev => {
      const exists = prev.departments.includes(deptId);
      const nextDepts = exists ? prev.departments.filter(d => d !== deptId) : [...prev.departments, deptId];
      const nextPerms = nextDepts.flatMap(d => DEPT_PERMISSIONS[d] || []);
      return { ...prev, departments: nextDepts, permissions: nextPerms };
    });
  };

  // Quick Multi-Role Shortcut
  const applyDeptsShortcut = (depts) => {
    const nextPerms = depts.flatMap(d => DEPT_PERMISSIONS[d] || []);
    setCreateForm(prev => ({
      ...prev,
      departments: depts,
      permissions: nextPerms
    }));
  };

  // Create Staff Member
  const handleCreateStaff = async (e) => {
    e.preventDefault();
    if (!createForm.name.trim() || !createForm.email.trim()) {
      showToast("Name and email are required", true);
      return;
    }
    if (!createForm.departments || createForm.departments.length === 0) {
      showToast("Kam se kam ek department / desk select karein", true);
      return;
    }
    try {
      const res = await fetch(`${API}/admin/staff`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          name: createForm.name.trim(),
          email: createForm.email.trim(),
          phone: createForm.phone.trim(),
          password: createForm.password.trim(),
          departments: createForm.departments,
          permissions: createForm.permissions
        })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || "Failed to create staff member");

      const deptsDisplay = (createForm.departments || [])
        .map(d => ALL_DEPARTMENTS.find(x => x.id === d)?.label.replace(/\s*\(.*\)/, "") || d)
        .join(" + ");

      setCreatedCredentials({
        name: data.staff?.name,
        email: data.staff?.email,
        phone: data.staff?.phone,
        deskLabel: deptsDisplay || "Staff Desk",
        tempPassword: data.temporaryPassword || createForm.password || "(as provided)"
      });

      setShowCreateModal(false);
      fetchStaff();
      showToast("Staff account created successfully!");
    } catch (err) {
      showToast(err.message, true);
    }
  };

  // Open Edit Modal
  const openEditModal = (staff) => {
    setEditingStaff(staff);
    setEditForm({
      departments: staff.staffProfile?.departments || [],
      permissions: staff.staffProfile?.permissions || []
    });
  };

  // Save Edited Permissions
  const handleSavePermissions = async () => {
    if (!editingStaff) return;
    try {
      const res = await fetch(`${API}/admin/staff/${editingStaff._id}/permissions`, {
        method: "PATCH",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          departments: editForm.departments,
          permissions: editForm.permissions
        })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || "Failed to update permissions");

      showToast("Staff permissions updated successfully!");
      setEditingStaff(null);
      fetchStaff();
    } catch (err) {
      showToast(err.message, true);
    }
  };

  // Toggle Active Status
  const handleToggleActive = async (staff) => {
    try {
      const res = await fetch(`${API}/admin/staff/${staff._id}/toggle-active`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` }
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || "Failed to toggle status");

      showToast(`Staff marked as ${data.isActive ? "Active" : "Inactive"}`);
      fetchStaff();
    } catch (err) {
      showToast(err.message, true);
    }
  };

  // Force Logout / Invalidate Session
  const handleForceLogout = async (staff) => {
    if (!window.confirm(`Force logout ${staff.name}? This will invalidate all active sessions immediately.`)) {
      return;
    }
    try {
      const res = await fetch(`${API}/admin/staff/${staff._id}/force-logout`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` }
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || "Failed to force logout");

      showToast(`Active sessions terminated for ${staff.name}.`);
      fetchStaff();
    } catch (err) {
      showToast(err.message, true);
    }
  };

  // Filtered staff
  const filteredStaff = useMemo(() => {
    if (!search.trim()) return staffList;
    const q = search.toLowerCase();
    return staffList.filter(s =>
      (s.name || "").toLowerCase().includes(q) ||
      (s.email || "").toLowerCase().includes(q) ||
      (s.phone || "").toLowerCase().includes(q) ||
      (s.staffProfile?.departments || []).some(d => d.toLowerCase().includes(q))
    );
  }, [staffList, search]);

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-3xl p-4 sm:p-6 text-slate-100 flex flex-col gap-6 shadow-xl">
      {/* Toast Notification */}
      {toast.msg && (
        <div className={`p-3 rounded-xl text-xs font-bold border flex items-center justify-between ${
          toast.isError
            ? "bg-rose-500/20 text-rose-300 border-rose-500/30"
            : "bg-emerald-500/20 text-emerald-300 border-emerald-500/30"
        }`}>
          <span>{toast.msg}</span>
          <button onClick={() => setToast({ msg: "", isError: false })}>✕</button>
        </div>
      )}

      {/* Header Bar */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 pb-4 border-b border-slate-800">
        <div>
          <h2 className="text-lg sm:text-xl font-black text-white flex items-center gap-2">
            <span>Staff & Department Desks Management</span>
          </h2>
          <p className="text-xs text-slate-400 mt-0.5">
            Create staff accounts, configure department access, manage central loan department pool, and control sessions.
          </p>
        </div>

        <button
          onClick={() => {
            setCreateForm({
              name: "",
              email: "",
              phone: "",
              password: "",
              departments: ["loan"],
              permissions: DEPT_PERMISSIONS.loan
            });
            setShowCreateModal(true);
          }}
          className="px-4 py-2 bg-blue-600 hover:bg-blue-500 active:scale-95 text-white text-xs font-black rounded-xl shadow-lg shadow-blue-600/30 transition flex items-center gap-1.5 cursor-pointer"
        >
          <span>Create Staff Account</span>
        </button>
      </div>

      {/* Credentials Banner on Newly Created Staff */}
      {createdCredentials && (
        <div className="bg-emerald-950/40 border border-emerald-500/50 rounded-2xl p-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 text-xs">
          <div>
            <div className="font-black text-emerald-400 text-sm flex items-center gap-1.5">
              <span>Staff Account Created Successfully!</span>
            </div>
            <p className="text-slate-300 mt-1">
              <strong>Name:</strong> {createdCredentials.name} • <strong>Email:</strong> {createdCredentials.email}
            </p>
            <p className="text-slate-300">
              <strong>Temporary Password:</strong>{" "}
              <code className="bg-black/60 px-2 py-0.5 rounded font-mono text-emerald-300 font-bold">
                {createdCredentials.tempPassword}
              </code>
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => {
                navigator.clipboard.writeText(
                  `Educa Fintech Staff Desk ID:\nName: ${createdCredentials.name}\nAssigned Role: ${createdCredentials.deskLabel || 'Staff'}\nLogin ID: ${createdCredentials.email}\nPassword: ${createdCredentials.tempPassword}\nLogin Link: ${window.location.origin}/login\n\n(Aapka Staff ID taiyar hai. Link par jaakar email aur password se login karein.)`
                );
                showToast("Staff ID & Password copied! Ready to paste in WhatsApp/SMS.");
              }}
              className="px-3.5 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white font-black rounded-lg text-xs shadow-md shadow-emerald-600/30 transition active:scale-95 flex items-center gap-1"
            >
               Copy for WhatsApp
            </button>
            <button
              onClick={() => setCreatedCredentials(null)}
              className="text-slate-400 hover:text-white px-2 py-1 font-bold"
            >
              Dismiss
            </button>
          </div>
        </div>
      )}

      {/* Loan Department Central Capital Pool (Department-Wide Limit) */}
      <div className="bg-gradient-to-br from-slate-900 to-slate-950 border border-blue-500/30 rounded-2xl p-4 sm:p-5 shadow-xl space-y-3">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 pb-3 border-b border-slate-800">
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-xl">🏢</span>
              <h3 className="text-sm font-black text-white uppercase tracking-wider">
                Loan Department Central Capital Pool
              </h3>
              <span className="px-2 py-0.5 text-[10px] font-extrabold rounded-full bg-blue-500/20 text-blue-300 border border-blue-400/30">
                Department-Wide Limit
              </span>
            </div>
            <p className="text-[11px] text-slate-400 mt-0.5">
              Yeh limit pure Loan Department ki hai — chahe 1 staff ho ya 100 staff, sabhi ko yahi pool aur market loan dikhega. Baki departments me koi limit nahi hai.
            </p>
          </div>

          <div className="flex items-center gap-2">
            {poolEditing ? (
              <div className="flex items-center gap-1.5">
                <input
                  type="number"
                  value={editPoolInput}
                  onChange={(e) => setEditPoolInput(e.target.value)}
                  placeholder="e.g. 1000000"
                  className="w-32 bg-slate-950 border border-blue-500 rounded-lg px-2.5 py-1 text-xs text-white font-mono focus:outline-none"
                />
                <button
                  onClick={handleSavePool}
                  disabled={poolSaving}
                  className="px-3 py-1 bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold rounded-lg shadow-sm cursor-pointer"
                >
                  {poolSaving ? "Saving..." : "Save"}
                </button>
                <button
                  onClick={() => setPoolEditing(false)}
                  className="px-2 py-1 bg-slate-800 text-slate-300 text-xs rounded-lg hover:bg-slate-700 cursor-pointer"
                >
                  ✕
                </button>
              </div>
            ) : (
              <button
                onClick={() => {
                  setEditPoolInput(loanDeptPool.totalPool || 1000000);
                  setPoolEditing(true);
                }}
                className="px-3 py-1.5 bg-blue-600/20 hover:bg-blue-600/30 border border-blue-500/40 text-blue-300 rounded-xl text-xs font-bold transition flex items-center gap-1 cursor-pointer"
              >
                ✏️ Set Limit (₹{(loanDeptPool.totalPool || 1000000).toLocaleString("en-IN")})
              </button>
            )}
          </div>
        </div>

        {/* 3 Metric Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div className="bg-slate-950 p-3 rounded-xl border border-slate-800">
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">
              Total Department Pool
            </span>
            <span className="text-lg font-black text-white mt-0.5 block font-mono">
              ₹{(loanDeptPool.totalPool || 1000000).toLocaleString("en-IN")}
            </span>
            <span className="text-[10px] text-slate-500 block mt-0.5">
              Allocated lending budget
            </span>
          </div>

          <div className="bg-amber-950/20 p-3 rounded-xl border border-amber-800/40">
            <span className="text-[10px] font-bold text-amber-400 uppercase tracking-wider block">
              Market Me Diya Loan (Disbursed)
            </span>
            <span className="text-lg font-black text-amber-300 mt-0.5 block font-mono">
              ₹{(loanDeptPool.marketDisbursed || 0).toLocaleString("en-IN")}
            </span>
            <span className="text-[10px] text-amber-400/70 block mt-0.5">
              {loanDeptPool.activeLoansCount || 0} active loans in market ({loanDeptPool.utilizationPercent || 0}%)
            </span>
          </div>

          <div className="bg-emerald-950/20 p-3 rounded-xl border border-emerald-800/40">
            <span className="text-[10px] font-bold text-emerald-400 uppercase tracking-wider block">
              Available Limit (Baki Pool)
            </span>
            <span className="text-lg font-black text-emerald-300 mt-0.5 block font-mono">
              ₹{(loanDeptPool.availablePool !== undefined ? loanDeptPool.availablePool : 1000000).toLocaleString("en-IN")}
            </span>
            <span className="text-[10px] text-emerald-400/70 block mt-0.5">
              Ready for new disbursals
            </span>
          </div>
        </div>

        {/* Visual Progress Bar */}
        <div className="space-y-1 pt-1">
          <div className="flex items-center justify-between text-[10px] text-slate-400">
            <span>Pool Utilization</span>
            <span className="font-mono text-slate-300 font-bold">{loanDeptPool.utilizationPercent || 0}% used</span>
          </div>
          <div className="w-full h-2 bg-slate-950 rounded-full overflow-hidden border border-slate-800">
            <div
              className="h-full bg-gradient-to-r from-blue-500 via-amber-500 to-emerald-500 transition-all duration-500 rounded-full"
              style={{ width: `${Math.min(100, Math.max(0, loanDeptPool.utilizationPercent || 0))}%` }}
            />
          </div>
        </div>
      </div>

      {/* Search and Filter Controls */}
      <div className="flex items-center justify-between gap-3 bg-slate-950 p-2.5 rounded-2xl border border-slate-800">
        <div className="relative flex-1">
          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500 text-xs"></span>
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search staff by name, email, department..."
            className="w-full bg-transparent pl-8 pr-3 py-1.5 text-xs text-white placeholder-slate-500 focus:outline-none"
          />
        </div>
        <button
          onClick={fetchStaff}
          className="px-3 py-1 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg text-xs font-semibold"
        >
          Refresh
        </button>
      </div>

      {/* Staff List Table / Grid */}
      {loading ? (
        <div className="py-12 text-center text-slate-500 text-xs font-semibold">
          Loading staff accounts...
        </div>
      ) : filteredStaff.length === 0 ? (
        <div className="py-12 text-center bg-slate-950/40 rounded-2xl border border-dashed border-slate-800 text-xs text-slate-500">
          No staff members found. Click "Create Staff Account" above to get started.
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {filteredStaff.map((staff) => {
            const profile = staff.staffProfile || {};
            const isActive = profile.isActive !== false;
            const depts = profile.departments || [];
            const perms = profile.permissions || [];

            return (
              <div
                key={staff._id}
                className={`bg-slate-950 border rounded-2xl p-4 flex flex-col justify-between gap-4 transition ${
                  isActive ? "border-slate-800" : "border-rose-950/50 opacity-70 bg-rose-950/10"
                }`}
              >
                <div>
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <h4 className="text-sm font-black text-white">{staff.name}</h4>
                      <p className="text-xs text-slate-400 font-mono">{staff.email}</p>
                      {staff.phone && <p className="text-[11px] text-slate-500">{staff.phone}</p>}
                    </div>
                    <span className={`px-2 py-0.5 text-[10px] font-extrabold rounded-full uppercase border ${
                      isActive
                        ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/30"
                        : "bg-rose-500/10 text-rose-400 border-rose-500/30"
                    }`}>
                      {isActive ? "Active" : "Disabled"}
                    </span>
                  </div>

                  {/* Assigned Departments */}
                  <div className="mt-3 flex flex-wrap gap-1.5 items-center">
                    <span className="text-[11px] text-slate-500 font-semibold">Desks:</span>
                    {depts.length === 0 ? (
                      <span className="text-[11px] text-slate-600 italic">None assigned</span>
                    ) : (
                      depts.map(d => (
                        <span key={d} className="px-2 py-0.5 bg-slate-800 text-slate-300 text-[10px] font-bold rounded-md">
                          {d}
                        </span>
                      ))
                    )}
                  </div>

                  {/* Permissions & Details */}
                  <div className="mt-2 text-[11px] text-slate-400 space-y-0.5">
                    <div>Permissions: <strong className="text-slate-200">{perms.length} granted</strong></div>
                    {staff.lastLogin && (
                      <div className="text-[10px] text-slate-500">
                        Last Login: {new Date(staff.lastLogin).toLocaleDateString()}
                      </div>
                    )}
                  </div>
                </div>

                {/* Control Actions */}
                <div className="pt-3 border-t border-slate-800/80 flex items-center justify-between gap-2">
                  <button
                    onClick={() => openEditModal(staff)}
                    className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-bold rounded-xl transition"
                  >
                    Edit Desks
                  </button>

                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => handleForceLogout(staff)}
                      className="px-2.5 py-1.5 bg-amber-600/20 hover:bg-amber-600/30 text-amber-300 text-xs font-bold rounded-xl border border-amber-500/30 transition"
                      title="Invalidate all active sessions immediately"
                    >
                      Force Logout
                    </button>
                    <button
                      onClick={() => handleToggleActive(staff)}
                      className={`px-3 py-1.5 text-xs font-bold rounded-xl transition ${
                        isActive
                          ? "bg-rose-600/20 hover:bg-rose-600/30 text-rose-400 border border-rose-500/30"
                          : "bg-emerald-600 hover:bg-emerald-500 text-white"
                      }`}
                    >
                      {isActive ? "Deactivate" : "Activate"}
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Modal: Create Staff Member */}
      {showCreateModal && (
        <div className="fixed inset-0 z-50 bg-slate-950/90 flex items-center justify-center p-4" style={{ isolation: "isolate" }}>
          <form
            onSubmit={handleCreateStaff}
            className="bg-slate-900 border border-slate-800 rounded-3xl max-w-xl w-full max-h-[90vh] overflow-y-auto p-5 sm:p-6 shadow-2xl flex flex-col gap-4 text-xs"
          >
            <div className="flex items-center justify-between pb-2 border-b border-slate-800">
              <h3 className="text-base font-black text-white">Create New Staff Account</h3>
              <button
                type="button"
                onClick={() => setShowCreateModal(false)}
                className="w-7 h-7 rounded-full bg-slate-800 text-slate-400 hover:text-white flex items-center justify-center font-bold"
              >
                ✕
              </button>
            </div>

            {/* Basic Info */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="text-slate-300 font-bold block mb-1">Full Name *</label>
                <input
                  type="text"
                  required
                  value={createForm.name}
                  onChange={(e) => setCreateForm({ ...createForm, name: e.target.value })}
                  placeholder="e.g. Ramesh Sharma"
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-white placeholder-slate-500 focus:outline-none focus:border-blue-500"
                />
              </div>

              <div>
                <label className="text-slate-300 font-bold block mb-1">Email Address *</label>
                <input
                  type="email"
                  required
                  value={createForm.email}
                  onChange={(e) => setCreateForm({ ...createForm, email: e.target.value })}
                  placeholder="ramesh@educa.com"
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-white placeholder-slate-500 focus:outline-none focus:border-blue-500"
                />
              </div>

              <div>
                <label className="text-slate-300 font-bold block mb-1">Phone Number (Optional)</label>
                <input
                  type="text"
                  value={createForm.phone}
                  onChange={(e) => setCreateForm({ ...createForm, phone: e.target.value })}
                  placeholder="9876543210"
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-white placeholder-slate-500 focus:outline-none focus:border-blue-500"
                />
              </div>

              <div>
                <label className="text-slate-300 font-bold block mb-1">Initial Password (Leave blank to auto-generate)</label>
                <input
                  type="text"
                  value={createForm.password}
                  onChange={(e) => setCreateForm({ ...createForm, password: e.target.value })}
                  placeholder="Auto-generated secure password"
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-white placeholder-slate-500 focus:outline-none focus:border-blue-500 font-mono"
                />
              </div>
            </div>

            {/* Multi-Role Department Selector */}
            <div className="pt-2 border-t border-slate-800 space-y-2">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <label className="text-slate-200 font-black text-xs block">
                    Role / Department Selection (Multiple Allowed)
                  </label>
                  <p className="text-[11px] text-slate-400">
                    Aap ek se zyada roles check kar sakte hain (e.g. Loan + KYC, ya All Desks):
                  </p>
                </div>
                <div className="flex items-center gap-1.5 flex-wrap">
                  <button
                    type="button"
                    onClick={() => applyDeptsShortcut(["loan", "kyc", "deposit", "withdrawal", "lending", "bond"])}
                    className="px-2 py-1 bg-blue-600/20 hover:bg-blue-600/40 text-blue-300 border border-blue-500/40 rounded-lg text-[10px] font-bold"
                  >
                    All Desks
                  </button>
                  <button
                    type="button"
                    onClick={() => applyDeptsShortcut(["loan", "kyc"])}
                    className="px-2 py-1 bg-purple-600/20 hover:bg-purple-600/40 text-purple-300 border border-purple-500/40 rounded-lg text-[10px] font-bold"
                  >
                    Loan + 🪪 KYC
                  </button>
                  <button
                    type="button"
                    onClick={() => applyDeptsShortcut(["deposit", "withdrawal"])}
                    className="px-2 py-1 bg-amber-600/20 hover:bg-amber-600/40 text-amber-300 border border-amber-500/40 rounded-lg text-[10px] font-bold"
                  >
                    Cashier
                  </button>
                  <button
                    type="button"
                    onClick={() => applyDeptsShortcut([])}
                    className="px-2 py-1 bg-slate-800 hover:bg-slate-700 text-slate-400 rounded-lg text-[10px] font-bold"
                  >
                    Clear
                  </button>
                </div>
              </div>

              {/* Grid of multi-selectable desk cards */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {ALL_DEPARTMENTS.map((dept) => {
                  const isChecked = createForm.departments.includes(dept.id);
                  return (
                    <div
                      key={dept.id}
                      onClick={() => toggleCreateDept(dept.id)}
                      className={`p-3 rounded-2xl border cursor-pointer select-none transition flex items-start gap-2.5 ${
                        isChecked
                          ? "bg-blue-950/70 border-blue-500 ring-1 ring-blue-500 text-white shadow-sm"
                          : "bg-slate-950/80 border-slate-800 text-slate-400 hover:border-slate-700 hover:text-slate-200"
                      }`}
                    >
                      <div className={`mt-0.5 w-4 h-4 rounded border flex items-center justify-center shrink-0 ${
                        isChecked ? "bg-blue-600 border-blue-400 text-white font-black" : "border-slate-700 bg-slate-900"
                      }`}>
                        {isChecked && <span className="text-[10px]">✓</span>}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between gap-1">
                          <p className={`text-xs font-black truncate ${isChecked ? "text-white" : "text-slate-300"}`}>
                            {dept.label}
                          </p>
                          <span className={`text-[9px] font-black px-1.5 py-0.2 rounded uppercase shrink-0 ${
                            isChecked ? "bg-blue-600 text-white" : "bg-slate-800 text-slate-500"
                          }`}>
                            {isChecked ? "Active" : "Off"}
                          </span>
                        </div>
                        <p className="text-[10px] text-slate-400 mt-0.5 leading-tight">{dept.sub}</p>
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Selected Desk Summary */}
              <div className="p-2.5 bg-slate-950 border border-slate-800 rounded-xl flex items-center justify-between text-xs">
                <span className="text-slate-400 font-semibold">
                  Selected Desks ({createForm.departments.length}):
                </span>
                <span className="font-bold text-blue-400 truncate max-w-[280px]">
                  {createForm.departments.length === 0
                    ? "Koi desk select nahi hai"
                    : createForm.departments.map(d => ALL_DEPARTMENTS.find(x => x.id === d)?.label.replace(/\s*\(.*\)/, "") || d).join(" + ")}
                </span>
              </div>
            </div>

            {/* Modal Actions */}
            <div className="pt-3 border-t border-slate-800 flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => setShowCreateModal(false)}
                className="px-4 py-2 bg-slate-800 text-slate-300 font-bold rounded-xl hover:bg-slate-700"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="px-5 py-2 bg-blue-600 hover:bg-blue-500 active:scale-95 text-white font-black rounded-xl shadow-lg shadow-blue-600/30"
              >
                Create Staff Account
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Modal: Edit Permissions */}
      {editingStaff && (
        <div className="fixed inset-0 z-50 bg-slate-950/90 flex items-center justify-center p-4" style={{ isolation: "isolate" }}>
          <div className="bg-slate-900 border border-slate-800 rounded-3xl max-w-xl w-full max-h-[90vh] overflow-y-auto p-5 sm:p-6 shadow-2xl flex flex-col gap-4 text-xs">
            <div className="flex items-center justify-between pb-2 border-b border-slate-800">
              <div>
                <h3 className="text-base font-black text-white">Edit Desks: {editingStaff.name}</h3>
                <span className="text-slate-400">{editingStaff.email}</span>
              </div>
              <button
                onClick={() => setEditingStaff(null)}
                className="w-7 h-7 rounded-full bg-slate-800 text-slate-400 hover:text-white flex items-center justify-center font-bold"
              >
                ✕
              </button>
            </div>

            {/* Department Selection */}
            <div className="space-y-2">
              <div className="flex items-center justify-between gap-2 flex-wrap">
                <label className="text-slate-200 font-black text-xs block">Assigned Desks (Multi-Select Allowed)</label>
                <div className="flex items-center gap-1.5 flex-wrap">
                  <button
                    type="button"
                    onClick={() => {
                      const allDepts = ["loan", "kyc", "deposit", "withdrawal", "lending", "bond"];
                      setEditForm(prev => ({
                        ...prev,
                        departments: allDepts,
                        permissions: allDepts.flatMap(d => DEPT_PERMISSIONS[d] || [])
                      }));
                    }}
                    className="px-2 py-0.5 bg-blue-600/20 hover:bg-blue-600/40 text-blue-300 rounded text-[10px] font-bold"
                  >
                    All Desks
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setEditForm(prev => ({ ...prev, departments: [], permissions: [] }));
                    }}
                    className="px-2 py-0.5 bg-slate-800 hover:bg-slate-700 text-slate-400 rounded text-[10px] font-bold"
                  >
                    Clear All
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {ALL_DEPARTMENTS.map(d => {
                  const checked = editForm.departments.includes(d.id);
                  return (
                    <div
                      key={d.id}
                      onClick={() => {
                        const exists = editForm.departments.includes(d.id);
                        const newDepts = exists ? editForm.departments.filter(x => x !== d.id) : [...editForm.departments, d.id];
                        const newPerms = newDepts.flatMap(x => DEPT_PERMISSIONS[x] || []);
                        setEditForm(prev => ({ ...prev, departments: newDepts, permissions: newPerms }));
                      }}
                      className={`p-2.5 rounded-2xl border cursor-pointer select-none transition flex items-center justify-between gap-2 ${
                        checked
                          ? "bg-blue-950/70 border-blue-500 text-white font-bold"
                          : "bg-slate-950/80 border-slate-800 text-slate-400 hover:text-slate-200"
                      }`}
                    >
                      <div className="flex items-center gap-2">
                        <span>{d.icon}</span>
                        <span className="text-xs truncate">{d.label.replace(/\s*\(.*\)/, "")}</span>
                      </div>
                      <span className={`text-[9px] font-black px-1.5 py-0.2 rounded uppercase ${
                        checked ? "bg-blue-600 text-white" : "bg-slate-800 text-slate-500"
                      }`}>
                        {checked ? "Active" : "Off"}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Granular Permissions Checkboxes */}
            <div className="pt-2 border-t border-slate-800">
              <label className="text-slate-300 font-bold block mb-1.5">Granular Permissions</label>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-56 overflow-y-auto p-2 bg-slate-950 rounded-2xl border border-slate-800">
                {ALL_PERMISSIONS_LIST.map(p => {
                  const checked = editForm.permissions.includes(p.key);
                  return (
                    <label key={p.key} className="flex items-center gap-2 p-1.5 rounded-lg hover:bg-slate-900 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() => {
                          const exists = editForm.permissions.includes(p.key);
                          const newPerms = exists ? editForm.permissions.filter(x => x !== p.key) : [...editForm.permissions, p.key];
                          setEditForm(prev => ({ ...prev, permissions: newPerms }));
                        }}
                        className="rounded border-slate-700 text-blue-600 focus:ring-0"
                      />
                      <span className="text-slate-300 font-medium">{p.label}</span>
                    </label>
                  );
                })}
              </div>
            </div>

            {/* Modal Actions */}
            <div className="pt-3 border-t border-slate-800 flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => setEditingStaff(null)}
                className="px-4 py-2 bg-slate-800 text-slate-300 font-bold rounded-xl hover:bg-slate-700"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleSavePermissions}
                className="px-5 py-2 bg-blue-600 hover:bg-blue-500 active:scale-95 text-white font-black rounded-xl shadow-lg shadow-blue-600/30"
              >
                Save Changes
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
