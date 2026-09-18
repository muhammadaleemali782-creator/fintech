// Fixed bottom tab bar shown only on mobile widths (sm:hidden).
// Gives the app a native-app feel for phone users.
export default function BottomNav({ items, active, onChange }) {
  return (
    <nav className="sm:hidden fixed bottom-0 inset-x-0 z-40 bg-white/95 backdrop-blur-lg border-t border-gray-100 safe-bottom">
      <div className="grid grid-cols-4">
        {items.map(({ key, label, icon, onClick }) => (
          <button
            key={key}
            onClick={() => { onChange?.(key); onClick?.(); }}
            className={`flex flex-col items-center justify-center gap-0.5 py-2.5 text-[11px] font-semibold transition-colors ${
              active === key ? "text-blue-600" : "text-gray-400"
            }`}
          >
            <span className={`text-xl leading-none transition-transform ${active === key ? "scale-110" : ""}`}>{icon}</span>
            {label}
          </button>
        ))}
      </div>
    </nav>
  );
}
