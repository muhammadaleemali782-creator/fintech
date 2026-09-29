import { useEffect } from "react";

// Responsive dialog: slides up as a bottom-sheet on mobile (easy thumb reach),
// appears as a centered modal card on tablet/desktop.
export default function Sheet({ open, onClose, title, icon, dark = false, extraHeader = null, children }) {
  useEffect(() => {
    if (!open) return;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = ""; };
  }, [open]);

  if (!open) return null;

  return (
    <div
      className={`fixed inset-0 z-50 flex items-end sm:items-center justify-center transition-all ${
        dark ? "bg-black/80 backdrop-blur-md" : "bg-black/50 backdrop-blur-sm"
      }`}
      onClick={onClose}
    >
      <div
        className={`w-full sm:max-w-md sm:w-full rounded-t-3xl sm:rounded-3xl shadow-2xl p-6 pb-safe sm:pb-6 max-h-[92vh] overflow-y-auto animate-[slideUp_.25s_ease-out] sm:animate-none transition-colors ${
          dark
            ? "bg-slate-900 text-white border-t border-slate-800 sm:border"
            : "bg-white text-gray-900"
        }`}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Mobile drag handle */}
        <div className={`sm:hidden w-10 h-1.5 rounded-full mx-auto mb-4 ${dark ? "bg-slate-700" : "bg-gray-200"}`} />

        <div className="flex justify-between items-center mb-5">
          <h3 className="text-xl font-bold font-display flex items-center gap-2">
            {icon && <span>{icon}</span>} {title}
          </h3>
          <div className="flex items-center gap-2">
            {extraHeader}
            <button
              onClick={onClose}
              aria-label="Close"
              className={`w-9 h-9 flex items-center justify-center rounded-full text-xl shrink-0 transition ${
                dark
                  ? "text-slate-400 hover:text-white hover:bg-slate-800 active:bg-slate-700"
                  : "text-gray-400 hover:text-gray-700 hover:bg-gray-100 active:bg-gray-200"
              }`}
            >
              ×
            </button>
          </div>
        </div>
        {children}
      </div>

      <style>{`
        @keyframes slideUp {
          from { transform: translateY(100%); }
          to { transform: translateY(0); }
        }
      `}</style>
    </div>
  );
}
