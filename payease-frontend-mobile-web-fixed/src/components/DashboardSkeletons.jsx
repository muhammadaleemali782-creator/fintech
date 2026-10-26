import React from "react";

/**
 * TransactionListSkeleton
 * Shimmer loader for Recent Transactions feed in user dashboard (app and website).
 */
export function TransactionListSkeleton({ count = 4 }) {
  return (
    <div className="space-y-2.5">
      {Array.from({ length: count }).map((_, i) => (
        <div
          key={i}
          className="flex items-center justify-between border border-gray-100 rounded-xl p-2.5 bg-white animate-pulse"
        >
          <div className="flex items-center gap-2.5 flex-1 min-w-0">
            <div className="w-8 h-8 rounded-full bg-slate-200 shrink-0" />
            <div className="space-y-1.5 flex-1 min-w-0 pr-2">
              <div className="h-3 bg-slate-200 rounded w-28" />
              <div className="h-2 bg-slate-100 rounded w-40" />
            </div>
          </div>
          <div className="w-16 h-4 bg-slate-200 rounded shrink-0" />
        </div>
      ))}
    </div>
  );
}

/**
 * UserLoansSkeleton
 * Shimmer loader for Active Loans in user dashboard.
 */
export function UserLoansSkeleton({ count = 2 }) {
  return (
    <div className="space-y-3">
      {Array.from({ length: count }).map((_, i) => (
        <div
          key={i}
          className="bg-white border border-gray-200/80 rounded-2xl p-4 shadow-2xs space-y-3 animate-pulse"
        >
          <div className="flex justify-between items-start">
            <div className="space-y-1.5">
              <div className="h-4 bg-slate-200 rounded w-32" />
              <div className="h-2.5 bg-slate-100 rounded w-24" />
            </div>
            <div className="h-5 w-20 bg-slate-200 rounded-full" />
          </div>
          <div className="h-2 bg-slate-100 rounded-full w-full overflow-hidden">
            <div className="h-full bg-slate-200 rounded-full w-1/3" />
          </div>
          <div className="grid grid-cols-3 gap-2 pt-1 border-t border-gray-100">
            <div className="space-y-1">
              <div className="h-2 bg-slate-100 rounded w-10" />
              <div className="h-3.5 bg-slate-200 rounded w-14" />
            </div>
            <div className="space-y-1">
              <div className="h-2 bg-slate-100 rounded w-12" />
              <div className="h-3.5 bg-slate-200 rounded w-16" />
            </div>
            <div className="space-y-1">
              <div className="h-2 bg-slate-100 rounded w-12" />
              <div className="h-3.5 bg-slate-200 rounded w-14" />
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

/**
 * ProfitStatementSkeleton
 * Shimmer loader for daily profit statement entries.
 */
export function ProfitStatementSkeleton({ count = 4 }) {
  return (
    <div className="space-y-2">
      {Array.from({ length: count }).map((_, i) => (
        <div
          key={i}
          className="flex items-center justify-between p-3 bg-white border border-slate-100 rounded-xl animate-pulse"
        >
          <div className="space-y-1.5 flex-1">
            <div className="h-3.5 bg-slate-200 rounded w-32" />
            <div className="h-2.5 bg-slate-100 rounded w-44" />
          </div>
          <div className="h-4 bg-slate-200 rounded w-16 ml-2" />
        </div>
      ))}
    </div>
  );
}
