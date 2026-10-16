// Fixed bottom tab bar shown only on mobile widths (sm:hidden).
// Gives the app a native-app feel for phone users.
export default function BottomNav({ items, active, onChange }) {
  return (
    <nav className="sm:hidden fixed bottom-0 inset-x-0 z-40 bg-white/95 backdrop-blur-lg border-t border-gray-100 safe-bottom">
      <div className="grid grid-cols-5 items-center px-1 h-14">
        {items.map(({ key, label, icon, onClick, isCenter }) => {
          if (isCenter) {
            return (
              <button
                key={key}
                type="button"
                onClick={() => { onChange?.(key); onClick?.(); }}
                className="flex flex-col items-center justify-center h-14 relative active:scale-95 transition-transform cursor-pointer"
                aria-label={label}
              >
                <div className="-mt-6 w-[52px] h-[52px] rounded-full bg-gradient-to-tr from-blue-600 to-indigo-600 text-white flex items-center justify-center shadow-lg shadow-blue-500/40 border-4 border-white shrink-0">
                  {icon}
                </div>
                <span className="text-[10px] font-black text-blue-600 mt-0.5 leading-tight">{label}</span>
              </button>
            );
          }
          return (
            <button
              key={key}
              type="button"
              onClick={() => { onChange?.(key); onClick?.(); }}
              className={`flex flex-col items-center justify-center h-14 w-full py-1 text-[10px] font-semibold transition-colors active:scale-95 cursor-pointer ${
                active === key ? "text-blue-600 font-bold" : "text-gray-400"
              }`}
            >
              {icon && (
                <span className="w-6 h-6 flex items-center justify-center shrink-0">
                  {icon}
                </span>
              )}
              <span className="leading-tight mt-1 truncate max-w-full px-0.5">{label}</span>
            </button>
          );
        })}
      </div>
    </nav>
  );
}
