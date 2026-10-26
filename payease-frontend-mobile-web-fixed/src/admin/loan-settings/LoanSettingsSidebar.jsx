import React from "react";

export default function LoanSettingsSidebar({
  activeSection,
  onSelectSection,
  isCollapsed,
  onToggleCollapse,
  onBackToAdmin,
  onOpenReadme,
  isMobileOpen,
  onCloseMobile
}) {
  const sections = [
    {
      id: "loans-ledger",
      label: "Loans & Ledger",
      subtitle: "All Loans & Active Dues",
      icon: "📋"
    },
    {
      id: "issue-loan-desk",
      label: "Issue Loan Desk",
      subtitle: "Apply on Behalf & Disburse",
      icon: "✍️"
    },
    {
      id: "commission",
      label: "Commission Settings",
      subtitle: "Loan & 5k Deposit Offers",
      icon: "💼"
    },
    {
      id: "preclose",
      label: "Preclose Settings",
      subtitle: "Default & Loan Types",
      icon: "🏷️"
    },
    {
      id: "conditions",
      label: "Custom Conditions",
      subtitle: "Rules & Overrides",
      icon: "⚡"
    },
    {
      id: "calculator",
      label: "Calculator Preview",
      subtitle: "Live Simulation",
      icon: "🧮"
    }
  ];

  const sidebarContent = (
    <div className="h-full flex flex-col justify-between bg-white border-r border-slate-200 text-slate-800 select-none shadow-xs">
      {/* Top Header & Sleek Minimal Collapse Toggle */}
      <div className="p-3">
        {/* Sleek Minimalist Collapse Header (Desktop) & Close Drawer (Mobile) */}
        <div className={`flex items-center pb-2.5 mb-2.5 border-b border-slate-100 ${
          isCollapsed ? "justify-center" : "justify-between"
        }`}>
          {!isCollapsed && (
            <div className="flex items-center gap-2 min-w-0">
              <span className="text-sm">⚙️</span>
              <span className="text-[11px] font-black uppercase tracking-wider text-slate-700 truncate">
                Loan Settings
              </span>
            </div>
          )}

          {/* Desktop Small Professional Collapse Button (No text, just icon) */}
          <button
            type="button"
            onClick={onToggleCollapse}
            className="hidden md:flex w-7 h-7 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-600 hover:text-slate-900 items-center justify-center transition active:scale-95 cursor-pointer shadow-2xs border border-slate-200 text-xs shrink-0"
            title={isCollapsed ? "Expand Sidebar" : "Collapse Sidebar"}
          >
            <span>{isCollapsed ? "▶" : "◀"}</span>
          </button>

          {/* Mobile Drawer Close Button */}
          <button
            type="button"
            onClick={onCloseMobile}
            className="md:hidden w-7 h-7 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-600 hover:text-slate-900 flex items-center justify-center transition active:scale-95 cursor-pointer border border-slate-200 text-xs shrink-0"
            title="Close Drawer"
          >
            <span>✕</span>
          </button>
        </div>

        {/* Navigation Sections */}
        <nav className="space-y-1.5">
          {sections.map((sec) => {
            const isActive = activeSection === sec.id;
            return (
              <button
                key={sec.id}
                type="button"
                onClick={() => {
                  onSelectSection(sec.id);
                  if (onCloseMobile) onCloseMobile();
                }}
                className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-left transition active:scale-95 cursor-pointer ${
                  isActive
                    ? "bg-blue-50 text-blue-700 border border-blue-200 font-bold shadow-2xs"
                    : "text-slate-600 hover:bg-slate-50 hover:text-slate-900 font-medium border border-transparent"
                } ${isCollapsed ? "justify-center" : ""}`}
                title={sec.label}
              >
                <span className="text-base shrink-0">{sec.icon}</span>
                {!isCollapsed && (
                  <div className="min-w-0 flex-1">
                    <div className="text-xs leading-tight truncate font-bold">{sec.label}</div>
                    <div className={`text-[10px] leading-tight truncate mt-0.5 ${isActive ? "text-blue-600" : "text-slate-500"}`}>
                      {sec.subtitle}
                    </div>
                  </div>
                )}
              </button>
            );
          })}
        </nav>
      </div>

      {/* Footer Section */}
      <div className="border-t border-slate-200 space-y-2 p-3 bg-slate-50/50">
        {/* Read Me Guide Button */}
        <button
          type="button"
          onClick={() => {
            if (onOpenReadme) onOpenReadme();
            if (onCloseMobile) onCloseMobile();
          }}
          className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-xl bg-emerald-50 hover:bg-emerald-100 text-emerald-700 border border-emerald-200 transition active:scale-95 text-xs font-bold cursor-pointer shadow-2xs ${
            isCollapsed ? "justify-center" : "justify-start"
          }`}
          title="Read Me (Policy & Logic Guide)"
        >
          <span className="text-sm">📖</span>
          {!isCollapsed && <span className="truncate">Read Me Guide</span>}
        </button>

        {/* Back to Admin Panel Button */}
        <button
          type="button"
          onClick={onBackToAdmin}
          style={{ touchAction: "manipulation" }}
          className={`w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 hover:text-slate-900 transition active:scale-95 text-xs font-bold border border-slate-200 cursor-pointer shadow-2xs ${
            isCollapsed ? "justify-center" : "justify-start"
          }`}
          title="Back to Admin Panel"
        >
          <span className="text-sm font-black">←</span>
          {!isCollapsed && <span className="truncate">Back to Admin Panel</span>}
        </button>
      </div>
    </div>
  );

  return (
    <>
      {/* Desktop Persistent Sidebar */}
      <aside className={`hidden md:block shrink-0 h-full transition-all duration-200 ${
        isCollapsed ? "w-16" : "w-64"
      }`}>
        {sidebarContent}
      </aside>

      {/* Mobile Backdrop & Drawer */}
      {isMobileOpen && (
        <div className="fixed inset-0 z-50 md:hidden flex">
          <div
            className="fixed inset-0 bg-slate-900/50 backdrop-blur-xs"
            onClick={onCloseMobile}
          />
          <div className="relative w-72 max-w-[80vw] h-full z-10 animate-in slide-in-from-left duration-200">
            {sidebarContent}
          </div>
        </div>
      )}
    </>
  );
}
