import { useState, useEffect } from "react";

export default function LiveRefreshBadge({
  isRefreshing = false,
  lastUpdated = 0,
  secondsToNext = 30,
  onRefresh = () => {},
  className = ""
}) {
  const [timeAgoText, setTimeAgoText] = useState("");

  useEffect(() => {
    const updateTimeAgo = () => {
      if (!lastUpdated) {
        setTimeAgoText("Saved data");
        return;
      }
      const diffSec = Math.floor((Date.now() - lastUpdated) / 1000);
      if (diffSec < 5) setTimeAgoText("Just now");
      else if (diffSec < 60) setTimeAgoText(`${diffSec}s ago`);
      else if (diffSec < 3600) setTimeAgoText(`${Math.floor(diffSec / 60)}m ago`);
      else setTimeAgoText(`${Math.floor(diffSec / 3600)}h ago`);
    };

    updateTimeAgo();
    const timer = setInterval(updateTimeAgo, 5000);
    return () => clearInterval(timer);
  }, [lastUpdated]);

  return (
    <div className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-semibold transition select-none ${
      isRefreshing
        ? "bg-amber-500/15 text-amber-700 border border-amber-400/40"
        : "bg-emerald-500/15 text-emerald-800 border border-emerald-400/30"
    } ${className}`}>
      {/* Pulsing Status Dot */}
      <span className="relative flex h-2 w-2">
        {isRefreshing ? (
          <>
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-75" />
            <span className="relative inline-flex rounded-full h-2 w-2 bg-amber-500" />
          </>
        ) : (
          <>
            <span className="animate-pulse absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-60" />
            <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-600" />
          </>
        )}
      </span>

      {/* Main Label */}
      {isRefreshing ? (
        <span className="font-bold flex items-center gap-1">
          <span className="animate-spin text-[10px]">🔄</span> Syncing...
        </span>
      ) : (
        <span className="flex items-center gap-1">
          <span className="font-bold">Live</span>
          <span className="text-gray-400">·</span>
          <span className="font-mono text-[10px]">next in {Math.max(0, secondsToNext)}s</span>
        </span>
      )}

      {/* Last Updated Counter & Manual Refresh Button */}
      <span className="text-gray-400 text-[10px]">·</span>
      <span className="text-[10px] text-gray-500 font-medium">{timeAgoText}</span>

      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          onRefresh();
        }}
        disabled={isRefreshing}
        title="Sync fresh data now"
        className="ml-0.5 text-[11px] hover:opacity-80 active:scale-95 transition disabled:opacity-40 cursor-pointer"
      >
        🔄
      </button>
    </div>
  );
}
