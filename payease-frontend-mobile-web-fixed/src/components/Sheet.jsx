import { useEffect } from "react";

// Responsive dialog: slides up as a bottom-sheet on mobile, centered modal on desktop.
export default function Sheet({ open, onClose, title, icon, extraHeader = null, children }) {
  useEffect(() => {
    if (!open) return;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = ""; };
  }, [open]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/50 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="w-full sm:max-w-md sm:w-full rounded-t-3xl sm:rounded-3xl shadow-2xl p-5 sm:p-6 pb-[calc(env(safe-area-inset-bottom,16px)+16px)] sm:pb-6 max-h-[92dvh] sm:max-h-[88vh] overflow-y-auto overscroll-contain touch-pan-y animate-[slideUp_.25s_ease-out] sm:animate-none bg-white text-gray-900"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Mobile drag handle */}
        <div className="sm:hidden w-10 h-1.5 rounded-full mx-auto mb-4 bg-gray-200" />

        <div className="flex justify-between items-center mb-5">
          <h3 className="text-xl font-bold font-display flex items-center gap-2 text-gray-900">
            {icon && <span>{icon}</span>} {title}
          </h3>
          <div className="flex items-center gap-2">
            {extraHeader}
            <button
              onClick={onClose}
              aria-label="Close"
              className="w-9 h-9 flex items-center justify-center rounded-full text-xl shrink-0 text-gray-400 hover:text-gray-700 hover:bg-gray-100 active:bg-gray-200 transition"
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
