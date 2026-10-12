export default function LiveRefreshBadge({
  isRefreshing = false,
  lastUpdated = 0,
  secondsToNext = 30,
  onRefresh = () => {},
  className = ""
}) {
  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        if (!isRefreshing && onRefresh) onRefresh();
      }}
      disabled={isRefreshing}
      title={isRefreshing ? "Syncing fresh data from server..." : "Click to refresh now"}
      className={`inline-flex items-center gap-1 sm:gap-1.5 px-2 sm:px-2.5 py-1 rounded-full text-[10px] sm:text-[11px] font-bold transition select-none shrink-0 cursor-pointer active:scale-95 border ${
        isRefreshing
          ? "bg-amber-50 text-amber-700 border-amber-300 shadow-2xs"
          : "bg-emerald-50 hover:bg-emerald-100/70 text-emerald-800 border-emerald-200/80 shadow-2xs"
      } ${className}`}
    >
      {/* Pulsing Status Dot */}
      <span className="relative flex h-2 w-2 shrink-0">
        {isRefreshing ? (
          <>
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-75" />
            <span className="relative inline-flex rounded-full h-2 w-2 bg-amber-500" />
          </>
        ) : (
          <>
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-40" />
            <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-600" />
          </>
        )}
      </span>

      {/* Main Label */}
      {isRefreshing ? (
        <span className="flex items-center gap-1 font-extrabold whitespace-nowrap">
          <span className="inline-block animate-spin text-[9px]">⏳</span>
          <span>Syncing...</span>
        </span>
      ) : (
        <span className="flex items-center gap-1 font-extrabold whitespace-nowrap">
          <span className="text-emerald-700">Live Sync</span>
        </span>
      )}

      {/* Refresh Icon */}
      <span
        className={`text-[11px] leading-none ml-0.5 transition-transform ${
          isRefreshing ? "animate-spin text-amber-600" : "text-emerald-600/70 hover:text-emerald-900"
        }`}
      >
        ↻
      </span>
    </button>
  );
}
