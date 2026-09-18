import { useEffect } from "react";

// Responsive dialog: slides up as a bottom-sheet on mobile (easy thumb reach),
// appears as a centered modal card on tablet/desktop.
export default function Sheet({ open, onClose, title, icon, children }) {
  useEffect(() => {
    if (!open) return;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = ""; };
  }, [open]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-end sm:items-center justify-center"
      onClick={onClose}
    >
      <div
        className="bg-white w-full sm:max-w-md sm:w-full rounded-t-3xl sm:rounded-3xl shadow-2xl p-6 pb-safe sm:pb-6 max-h-[90vh] overflow-y-auto animate-[slideUp_.25s_ease-out] sm:animate-none"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Mobile drag handle */}
        <div className="sm:hidden w-10 h-1.5 bg-gray-200 rounded-full mx-auto mb-4" />

        <div className="flex justify-between items-center mb-5">
          <h3 className="text-xl font-bold font-display flex items-center gap-2">
            {icon && <span>{icon}</span>} {title}
          </h3>
          <button
            onClick={onClose}
            aria-label="Close"
            className="w-9 h-9 flex items-center justify-center rounded-full hover:bg-gray-100 active:bg-gray-200 text-gray-400 text-xl shrink-0"
          >
            ×
          </button>
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
