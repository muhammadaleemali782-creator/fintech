// Fixed bottom tab bar shown only on mobile widths (sm:hidden).
// Gives the app a native-app feel for phone users.
export default function BottomNav({ items, active, onChange }) {
  return (
    <nav className="sm:hidden fixed bottom-0 inset-x-0 z-40 bg-white/95 backdrop-blur-lg border-t border-gray-100 safe-bottom">
      <div className="grid grid-cols-5 items-center px-1">
        {items.map(({ key, label, icon, onClick, isCenter }) => {
          if (isCenter) {
            return (
              <button
                key={key}
                onClick={() => { onChange?.(key); onClick?.(); }}
                className="flex flex-col items-center justify-center -mt-6 relative active:scale-95 transition-transform"
                aria-label={label}
              >
                <div className="w-13 h-13 rounded-full bg-gradient-to-tr from-blue-600 to-indigo-600 text-white flex items-center justify-center text-2xl shadow-lg shadow-blue-500/40 border-4 border-white">
                  {icon}
                </div>
                <span className="text-[10px] font-black text-blue-600 mt-0.5">{label}</span>
              </button>
            );
          }
          return (
            <button
              key={key}
              onClick={() => { onChange?.(key); onClick?.(); }}
              className={`flex flex-col items-center justify-center gap-0.5 py-2 text-[11px] font-semibold transition-colors ${
                active === key ? "text-blue-600 font-bold" : "text-gray-400"
              }`}
            >
              <span className={`text-xl leading-none transition-transform ${active === key ? "scale-110" : ""}`}>{icon}</span>
              <span>{label}</span>
            </button>
          );
        })}
      </div>
    </nav>
  );
}
