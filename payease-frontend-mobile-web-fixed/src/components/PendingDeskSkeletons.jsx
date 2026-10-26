import React from "react";

/**
 * PendingActiveSkeleton
 * Responsive skeleton loader for Active Pending Approvals desk.
 * Renders a full shimmer table on Desktop (website) and shimmer cards on Mobile (app).
 */
export function PendingActiveSkeleton() {
  return (
    <div className="space-y-4">
      {/* Desktop Table View (Website / Tablet / Desktop) */}
      <div className="hidden md:block overflow-x-auto rounded-2xl border border-slate-200/90 bg-white p-4 shadow-2xs">
        <table className="w-full">
          <thead>
            <tr className="text-left text-xs uppercase border-b border-slate-100">
              {["User", "Type", "Amount", "Method", "Details", "Action"].map(h => (
                <th key={h} className="pb-3 font-semibold pr-4">
                  <div className="h-3 w-16 bg-slate-200 rounded animate-pulse" />
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="text-sm">
            {[1, 2, 3, 4].map(i => (
              <tr key={i} className="border-b border-slate-50">
                {/* User */}
                <td className="py-3.5 pr-4">
                  <div className="space-y-1.5">
                    <div className="h-3.5 bg-slate-200 rounded w-28 animate-pulse" />
                    <div className="h-2.5 bg-slate-100 rounded w-36 animate-pulse" />
                  </div>
                </td>
                {/* Type */}
                <td className="py-3.5 pr-4">
                  <div className="h-6 w-16 bg-slate-200 rounded-full animate-pulse" />
                </td>
                {/* Amount */}
                <td className="py-3.5 pr-4">
                  <div className="h-4 w-20 bg-slate-200 rounded animate-pulse" />
                </td>
                {/* Method */}
                <td className="py-3.5 pr-4">
                  <div className="h-3.5 w-14 bg-slate-200 rounded animate-pulse" />
                </td>
                {/* Details */}
                <td className="py-3.5 pr-4">
                  <div className="space-y-1.5">
                    <div className="h-3 w-28 bg-slate-200 rounded animate-pulse" />
                    <div className="flex items-center gap-2 mt-1">
                      <div className="w-8 h-8 rounded-md bg-slate-200 animate-pulse" />
                      <div className="h-2.5 w-16 bg-slate-100 rounded animate-pulse" />
                    </div>
                  </div>
                </td>
                {/* Action buttons */}
                <td className="py-3.5">
                  <div className="flex gap-2">
                    <div className="h-8 w-20 bg-slate-200 rounded-lg animate-pulse" />
                    <div className="h-8 w-16 bg-slate-200 rounded-lg animate-pulse" />
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Mobile / App View (Responsive Cards) */}
      <div className="md:hidden space-y-3">
        {[1, 2, 3].map(i => (
          <div
            key={i}
            className="border border-slate-200/90 rounded-2xl p-4 bg-white shadow-2xs space-y-3 animate-pulse"
          >
            {/* Header: User + Type */}
            <div className="flex justify-between items-start">
              <div className="space-y-1.5">
                <div className="h-4 bg-slate-200 rounded w-28" />
                <div className="h-3 bg-slate-100 rounded w-36" />
              </div>
              <div className="h-6 w-16 bg-slate-200 rounded-full" />
            </div>

            {/* Amount & Method Rows */}
            <div className="space-y-2 pt-1 border-t border-slate-100">
              <div className="flex justify-between items-center">
                <div className="h-3 w-12 bg-slate-200 rounded" />
                <div className="h-4 w-20 bg-slate-200 rounded" />
              </div>
              <div className="flex justify-between items-center">
                <div className="h-3 w-14 bg-slate-100 rounded" />
                <div className="h-3 w-16 bg-slate-200 rounded" />
              </div>
            </div>

            {/* UTR & Screenshot Box */}
            <div className="p-2.5 bg-slate-50 border border-slate-200 rounded-xl flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="w-9 h-9 rounded-lg bg-slate-200" />
                <div className="space-y-1">
                  <div className="h-3 w-20 bg-slate-200 rounded" />
                  <div className="h-2 w-28 bg-slate-100 rounded" />
                </div>
              </div>
              <div className="h-6 w-12 bg-slate-200 rounded-lg" />
            </div>

            {/* Buttons */}
            <div className="flex gap-2 pt-1">
              <div className="flex-1 h-9 bg-slate-200 rounded-lg" />
              <div className="flex-1 h-9 bg-slate-200 rounded-lg" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

/**
 * PendingLoansSkeleton
 * Shimmer loader for Pending Loan Applications.
 */
export function PendingLoansSkeleton() {
  return (
    <div className="space-y-4">
      {[1, 2, 3].map(i => (
        <div
          key={i}
          className="border border-slate-200/90 rounded-2xl p-4 sm:p-5 bg-white shadow-2xs space-y-4 animate-pulse"
        >
          {/* Header */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-100 pb-3">
            <div className="flex items-center gap-3">
              <div className="w-11 h-11 rounded-full bg-slate-200 shrink-0" />
              <div className="space-y-1.5">
                <div className="flex items-center gap-2">
                  <div className="h-4 bg-slate-200 rounded w-28" />
                  <div className="h-4 bg-slate-100 rounded w-20" />
                </div>
                <div className="h-2.5 bg-slate-100 rounded w-44" />
              </div>
            </div>
            <div className="h-3 bg-slate-200 rounded w-24" />
          </div>

          {/* Terms Grid */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 bg-slate-50 p-3.5 rounded-xl">
            {[1, 2, 3, 4].map(j => (
              <div key={j} className="space-y-1">
                <div className="h-2.5 bg-slate-200 rounded w-16" />
                <div className="h-4 bg-slate-300 rounded w-20" />
              </div>
            ))}
          </div>

          {/* Action Row */}
          <div className="flex items-center justify-between pt-1">
            <div className="h-8 bg-slate-100 rounded-xl w-28" />
            <div className="flex items-center gap-2">
              <div className="h-9 bg-slate-200 rounded-xl w-24" />
              <div className="h-9 bg-slate-200 rounded-xl w-20" />
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

/**
 * PendingBondsSkeleton
 * Shimmer loader for Pending Bond & Lending Requests.
 */
export function PendingBondsSkeleton() {
  return (
    <div className="space-y-4">
      {[1, 2, 3].map(i => (
        <div
          key={i}
          className="border border-slate-200/90 rounded-2xl p-4 sm:p-5 bg-white shadow-2xs space-y-4 animate-pulse"
        >
          {/* Header */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-100 pb-3">
            <div className="flex items-center gap-3">
              <div className="w-11 h-11 rounded-full bg-slate-200 shrink-0" />
              <div className="space-y-1.5">
                <div className="flex items-center gap-2">
                  <div className="h-4 bg-slate-200 rounded w-28" />
                  <div className="h-4 bg-slate-100 rounded w-24" />
                </div>
                <div className="h-2.5 bg-slate-100 rounded w-36" />
              </div>
            </div>
            <div className="h-3 bg-slate-200 rounded w-24" />
          </div>

          {/* Terms Grid */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 bg-slate-50 p-3.5 rounded-xl">
            {[1, 2, 3, 4].map(j => (
              <div key={j} className="space-y-1">
                <div className="h-2.5 bg-slate-200 rounded w-16" />
                <div className="h-4 bg-slate-300 rounded w-20" />
              </div>
            ))}
          </div>

          {/* Buttons */}
          <div className="flex items-center justify-end gap-2 pt-1">
            <div className="h-9 bg-slate-200 rounded-xl w-24" />
            <div className="h-9 bg-slate-200 rounded-xl w-20" />
          </div>
        </div>
      ))}
    </div>
  );
}

/**
 * PendingHoldSkeleton
 * Shimmer loader for On Hold Duplicate UTRs.
 */
export function PendingHoldSkeleton() {
  return (
    <div className="space-y-4">
      {[1, 2].map(i => (
        <div
          key={i}
          className="border-2 border-rose-200/80 rounded-2xl p-4 sm:p-5 bg-white shadow-2xs space-y-4 animate-pulse"
        >
          <div className="flex items-center justify-between border-b border-rose-100 pb-3">
            <div className="h-5 bg-rose-100 rounded-full w-44" />
            <div className="h-4 bg-slate-200 rounded w-24" />
          </div>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-3.5">
            {[1, 2].map(j => (
              <div key={j} className="rounded-2xl p-4 border border-rose-200 bg-rose-50/40 space-y-3">
                <div className="space-y-1.5">
                  <div className="h-3.5 bg-slate-200 rounded w-28" />
                  <div className="h-2.5 bg-slate-100 rounded w-36" />
                </div>
                <div className="h-5 bg-slate-200 rounded w-20" />
                <div className="h-9 bg-slate-200 rounded-xl" />
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

/**
 * ApprovedRequestsSkeleton
 * Shimmer loader for Approved Audit Records.
 */
export function ApprovedRequestsSkeleton() {
  return (
    <div className="space-y-3">
      {[1, 2, 3, 4].map(i => (
        <div
          key={i}
          className="bg-white border border-slate-200/90 rounded-2xl p-4 shadow-2xs space-y-3 animate-pulse"
        >
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <div className="w-6 h-6 rounded-full bg-slate-200" />
              <div className="h-4 bg-slate-200 rounded w-20" />
            </div>
            <div className="h-3 bg-slate-100 rounded w-24" />
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 bg-slate-50 p-2.5 rounded-xl">
            <div className="h-3.5 bg-slate-200 rounded w-24" />
            <div className="h-3.5 bg-slate-200 rounded w-20" />
            <div className="h-3.5 bg-slate-200 rounded w-16" />
            <div className="h-3.5 bg-slate-200 rounded w-20" />
          </div>
        </div>
      ))}
    </div>
  );
}
