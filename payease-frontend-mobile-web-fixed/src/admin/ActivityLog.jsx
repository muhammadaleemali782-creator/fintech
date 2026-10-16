import React, { useState, useEffect, useCallback } from "react";
import { API } from "../config";
import { tokenStorage } from "../utils/tokenStorage";

const DEPARTMENTS = [
  { id: "all", label: "All Departments" },
  { id: "deposit", label: "Deposits" },
  { id: "withdrawal", label: "Withdrawals" },
  { id: "loan", label: "Loans" },
  { id: "kyc", label: "KYC" },
  { id: "lending", label: "Lending" },
  { id: "bond", label: "Bonds" },
  { id: "staff", label: "Staff Admin" },
  { id: "system", label: "System" }
];

export default function ActivityLog() {
  const token = tokenStorage.getToken();

  const [logs, setLogs] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pages, setPages] = useState(1);
  const [limit] = useState(25);
  const [loading, setLoading] = useState(true);

  // Filters
  const [department, setDepartment] = useState("all");
  const [actionSearch, setActionSearch] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");

  // Inspect detail modal
  const [inspectedLog, setInspectedLog] = useState(null);

  const fetchLogs = useCallback(async (targetPage = 1) => {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        page: targetPage,
        limit,
        department
      });
      if (actionSearch.trim()) params.append("action", actionSearch.trim());
      if (startDate) params.append("startDate", startDate);
      if (endDate) params.append("endDate", endDate);

      const res = await fetch(`${API}/admin/activity-log?${params.toString()}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      const data = await res.json();
      if (data.success) {
        setLogs(data.logs || []);
        setTotal(data.total || 0);
        setPage(data.page || 1);
        setPages(data.pages || 1);
      }
    } catch (err) {
      console.error("Failed to fetch activity logs:", err);
    } finally {
      setLoading(false);
    }
  }, [token, limit, department, actionSearch, startDate, endDate]);

  useEffect(() => {
    fetchLogs(1);
  }, [fetchLogs]);

  // Download CSV export
  const handleExportCsv = () => {
    const params = new URLSearchParams({
      format: "csv",
      department
    });
    if (actionSearch.trim()) params.append("action", actionSearch.trim());
    if (startDate) params.append("startDate", startDate);
    if (endDate) params.append("endDate", endDate);

    // Fetch as blob with Authorization header to download securely
    fetch(`${API}/admin/activity-log?${params.toString()}`, {
      headers: { Authorization: `Bearer ${token}` }
    })
      .then(res => res.blob())
      .then(blob => {
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `audit_activity_log_${new Date().toISOString().split("T")[0]}.csv`;
        document.body.appendChild(a);
        a.click();
        a.remove();
        window.URL.revokeObjectURL(url);
      })
      .catch(err => alert("Failed to download CSV: " + err.message));
  };

  const getActionBadgeColor = (action = "") => {
    const a = action.toLowerCase();
    if (a.includes("approve") || a.includes("disburse")) return "bg-emerald-500/10 text-emerald-400 border-emerald-500/30";
    if (a.includes("reject")) return "bg-rose-500/10 text-rose-400 border-rose-500/30";
    if (a.includes("claim")) return "bg-blue-500/10 text-blue-400 border-blue-500/30";
    if (a.includes("waive")) return "bg-purple-500/10 text-purple-400 border-purple-500/30";
    if (a.includes("logout") || a.includes("deactivate")) return "bg-amber-500/10 text-amber-400 border-amber-500/30";
    return "bg-slate-800 text-slate-300 border-slate-700";
  };

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-3xl p-4 sm:p-6 text-slate-100 flex flex-col gap-6 shadow-xl">
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 pb-4 border-b border-slate-800">
        <div>
          <h2 className="text-lg sm:text-xl font-black text-white flex items-center gap-2">
            <span>Immutable Activity & Audit Log</span>
          </h2>
          <p className="text-xs text-slate-400 mt-0.5">
            Tamper-proof record of all staff actions, approvals, rejections, waiver changes, and department workflows.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={handleExportCsv}
            className="px-3.5 py-2 bg-emerald-600 hover:bg-emerald-500 active:scale-95 text-white text-xs font-bold rounded-xl shadow-lg shadow-emerald-600/30 transition flex items-center gap-1.5"
          >
            
            <span>Export CSV</span>
          </button>
          <button
            onClick={() => fetchLogs(page)}
            className="px-3 py-2 bg-slate-800 hover:bg-slate-700 active:scale-95 text-slate-300 text-xs font-semibold rounded-xl border border-slate-700 transition"
          >
            Refresh
          </button>
        </div>
      </div>

      {/* Filter Row */}
      <div className="grid grid-cols-1 sm:grid-cols-4 gap-3 bg-slate-950 p-3 rounded-2xl border border-slate-800 text-xs">
        <div>
          <label className="text-slate-400 font-bold block mb-1">Department</label>
          <select
            value={department}
            onChange={(e) => setDepartment(e.target.value)}
            className="w-full bg-slate-900 border border-slate-800 rounded-xl px-3 py-2 text-white focus:outline-none focus:border-blue-500"
          >
            {DEPARTMENTS.map(d => (
              <option key={d.id} value={d.id}>{d.label}</option>
            ))}
          </select>
        </div>

        <div>
          <label className="text-slate-400 font-bold block mb-1">Action / Keyword</label>
          <input
            type="text"
            value={actionSearch}
            onChange={(e) => setActionSearch(e.target.value)}
            placeholder="e.g. approve, reject, claim..."
            className="w-full bg-slate-900 border border-slate-800 rounded-xl px-3 py-2 text-white placeholder-slate-500 focus:outline-none focus:border-blue-500"
          />
        </div>

        <div>
          <label className="text-slate-400 font-bold block mb-1">Start Date</label>
          <input
            type="date"
            value={startDate}
            onChange={(e) => setStartDate(e.target.value)}
            className="w-full bg-slate-900 border border-slate-800 rounded-xl px-3 py-2 text-white focus:outline-none focus:border-blue-500"
          />
        </div>

        <div>
          <label className="text-slate-400 font-bold block mb-1">End Date</label>
          <input
            type="date"
            value={endDate}
            onChange={(e) => setEndDate(e.target.value)}
            className="w-full bg-slate-900 border border-slate-800 rounded-xl px-3 py-2 text-white focus:outline-none focus:border-blue-500"
          />
        </div>
      </div>

      {/* Logs Table */}
      {loading ? (
        <div className="py-16 text-center text-slate-500 text-xs font-semibold">
          Loading audit records...
        </div>
      ) : logs.length === 0 ? (
        <div className="py-16 text-center bg-slate-950/40 rounded-2xl border border-dashed border-slate-800 text-xs text-slate-500">
          No audit logs recorded matching this query.
        </div>
      ) : (
        <div className="overflow-x-auto rounded-2xl border border-slate-800 bg-slate-950">
          <table className="w-full text-left text-xs whitespace-nowrap">
            <thead className="bg-slate-900/80 text-slate-400 border-b border-slate-800 font-bold uppercase text-[10px] tracking-wider">
              <tr>
                <th className="py-3 px-4">Timestamp</th>
                <th className="py-3 px-4">Actor</th>
                <th className="py-3 px-4">Department</th>
                <th className="py-3 px-4">Action</th>
                <th className="py-3 px-4">Entity</th>
                <th className="py-3 px-4">Amount</th>
                <th className="py-3 px-4">Status Change</th>
                <th className="py-3 px-4 text-right">Details</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60 text-slate-200">
              {logs.map((log) => (
                <tr key={log._id} className="hover:bg-slate-900/50 transition">
                  <td className="py-3 px-4 text-[11px] text-slate-400 font-mono">
                    {new Date(log.createdAt).toLocaleString()}
                  </td>
                  <td className="py-3 px-4">
                    <div className="font-bold text-white">{log.actorName || "Unknown"}</div>
                    <div className="text-[10px] text-slate-500 uppercase">{log.actorRole || "staff"}</div>
                  </td>
                  <td className="py-3 px-4">
                    <span className="px-2 py-0.5 bg-slate-800 text-slate-300 rounded font-bold text-[10px] uppercase">
                      {log.department}
                    </span>
                  </td>
                  <td className="py-3 px-4">
                    <span className={`px-2.5 py-0.5 rounded-full font-bold text-[10px] border ${getActionBadgeColor(log.action)}`}>
                      {log.action}
                    </span>
                  </td>
                  <td className="py-3 px-4 font-mono text-[11px] text-slate-400">
                    <span className="text-slate-300">{log.entityType}</span>: {log.entityId?.slice(-6) || "—"}
                  </td>
                  <td className="py-3 px-4 font-bold text-white">
                    {log.amount !== null && log.amount !== undefined ? `₹${Number(log.amount).toLocaleString("en-IN")}` : "—"}
                  </td>
                  <td className="py-3 px-4 text-[11px]">
                    {log.fromStatus ? (
                      <span className="text-slate-400">{log.fromStatus} → <strong className="text-white">{log.toStatus}</strong></span>
                    ) : (
                      <span className="text-slate-400">{log.toStatus || "—"}</span>
                    )}
                  </td>
                  <td className="py-3 px-4 text-right">
                    <button
                      onClick={() => setInspectedLog(log)}
                      className="px-2.5 py-1 bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white rounded-lg text-[11px] font-bold transition"
                    >
                      View
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Pagination Footer */}
      {pages > 1 && (
        <div className="flex items-center justify-between text-xs text-slate-400 pt-2 border-t border-slate-800">
          <div>
            Showing page <strong className="text-white">{page}</strong> of <strong className="text-white">{pages}</strong> ({total} total records)
          </div>
          <div className="flex items-center gap-2">
            <button
              disabled={page <= 1}
              onClick={() => fetchLogs(page - 1)}
              className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 disabled:opacity-50 text-slate-300 font-bold rounded-xl"
            >
              Previous
            </button>
            <button
              disabled={page >= pages}
              onClick={() => fetchLogs(page + 1)}
              className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 disabled:opacity-50 text-slate-300 font-bold rounded-xl"
            >
              Next
            </button>
          </div>
        </div>
      )}

      {/* Log Inspection Detail Modal */}
      {inspectedLog && (
        <div className="fixed inset-0 z-50 bg-black/85 backdrop-blur-md flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-3xl max-w-lg w-full p-6 shadow-2xl flex flex-col gap-4 text-xs">
            <div className="flex items-center justify-between pb-2 border-b border-slate-800">
              <h3 className="text-base font-black text-white">Audit Entry Details</h3>
              <button
                onClick={() => setInspectedLog(null)}
                className="w-7 h-7 rounded-full bg-slate-800 text-slate-400 hover:text-white flex items-center justify-center font-bold"
              >
                ✕
              </button>
            </div>

            <div className="space-y-2 bg-slate-950 p-4 rounded-2xl border border-slate-800 font-mono text-[11px]">
              <div className="flex justify-between">
                <span className="text-slate-500">Record ID:</span>
                <span className="text-slate-300">{inspectedLog._id}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Timestamp:</span>
                <span className="text-slate-300">{new Date(inspectedLog.createdAt).toISOString()}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Actor Name:</span>
                <span className="text-white font-bold">{inspectedLog.actorName}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Actor ID:</span>
                <span className="text-slate-300">{inspectedLog.actorId}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Actor Role:</span>
                <span className="text-slate-300 uppercase">{inspectedLog.actorRole}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Department:</span>
                <span className="text-slate-300 uppercase">{inspectedLog.department}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Action:</span>
                <span className="text-blue-400 font-bold">{inspectedLog.action}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Entity Type / ID:</span>
                <span className="text-slate-300">{inspectedLog.entityType} ({inspectedLog.entityId})</span>
              </div>
              {inspectedLog.amount !== null && inspectedLog.amount !== undefined && (
                <div className="flex justify-between">
                  <span className="text-slate-500">Amount:</span>
                  <span className="text-emerald-400 font-bold">₹{inspectedLog.amount}</span>
                </div>
              )}
              {inspectedLog.note && (
                <div className="pt-2 border-t border-slate-800">
                  <span className="text-slate-500 block mb-1">Remarks / Note:</span>
                  <p className="text-slate-200 font-sans italic bg-slate-900 p-2 rounded-xl">"{inspectedLog.note}"</p>
                </div>
              )}
              {inspectedLog.ip && (
                <div className="flex justify-between pt-1">
                  <span className="text-slate-500">IP Address:</span>
                  <span className="text-slate-400">{inspectedLog.ip}</span>
                </div>
              )}
              {inspectedLog.userAgent && (
                <div className="pt-1">
                  <span className="text-slate-500 block">User Agent:</span>
                  <span className="text-slate-500 text-[10px] break-all">{inspectedLog.userAgent}</span>
                </div>
              )}
            </div>

            <div className="pt-2 border-t border-slate-800 flex justify-end">
              <button
                onClick={() => setInspectedLog(null)}
                className="px-4 py-2 bg-slate-800 text-slate-300 font-bold rounded-xl hover:bg-slate-700"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
