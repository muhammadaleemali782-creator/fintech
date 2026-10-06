import { useEffect } from "react";

export default function Toast({ msg, onHide }) {
  useEffect(() => {
    if (msg?.text) {
      const t = setTimeout(onHide, 3500);
      return () => clearTimeout(t);
    }
  }, [msg, onHide]);

  if (!msg || !msg.text) return null;

  const isSuccess = msg.type === "success";
  const isWarning = msg.type === "warning";
  const isInfo = msg.type === "info";

  return (
    <div
      onClick={onHide}
      className={`fixed top-4 left-4 right-4 sm:left-auto sm:right-6 sm:w-auto sm:max-w-md px-4 py-3 rounded-2xl shadow-2xl z-[100] text-white text-xs sm:text-sm font-semibold flex items-center justify-between gap-3 cursor-pointer active:scale-98 transition-all animate-[fadeIn_.2s_ease-out] select-none ${
        isSuccess
          ? "bg-emerald-600 border border-emerald-400/40"
          : isWarning
          ? "bg-amber-600 border border-amber-400/40"
          : isInfo
          ? "bg-blue-600 border border-blue-400/40"
          : "bg-rose-600 border border-rose-400/40"
      }`}
      role="status"
    >
      <div className="flex items-center gap-2 min-w-0 flex-1">
        <span className="text-base shrink-0">
          {isSuccess ? "✓" : isWarning ? "⚠️" : isInfo ? "ℹ️" : "✕"}
        </span>
        <span className="truncate leading-tight">{msg.text}</span>
      </div>

      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          onHide();
        }}
        aria-label="Close notification"
        className="w-7 h-7 flex items-center justify-center rounded-full bg-white/20 hover:bg-white/30 text-white font-bold text-sm shrink-0 transition active:scale-90 cursor-pointer"
        title="Dismiss (Cut)"
      >
        ✕
      </button>
    </div>
  );
}
