import React from "react";

export default function LoanSettingsSidebar({
  activeSection,
  onSelectSection,
  isCollapsed,
  onToggleCollapse,
  onBackToAdmin,
  isMobileOpen,
  onCloseMobile
}) {
  const sections = [
    {
      id: "commission",
      label: "Commission Settings",
      subtitle: "Agent Loan Commission",
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
    <div className="h-full flex flex-col justify-between bg-slate-900 border-r border-slate-800 text-slate-200 select-none">
      {/* Top Header & Navigation */}
      <div>
        {/* Back to Admin Button */}
        <div className="p-3 border-b border-slate-800">
          <button
            onClick={onBackToAdmin}
            className={`w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl bg-slate-800/80 hover:bg-slate-700/80 text-slate-300 hover:text-white transition active:scale-95 text-xs font-bold ${
              isCollapsed ? "justify-center" : "justify-start"
            }`}
            title="Back to Admin Panel"
          >
            <span className="text-sm">←</span>
            {!isCollapsed && <span className="truncate">Back to Admin Panel</span>}
          </button>
        </div>

        {/* Page Title */}
        <div className={`px-4 py-3 border-b border-slate-800/60 ${isCollapsed ? "text-center" : ""}`}>
          <div className="flex items-center gap-2">
            <span className="text-lg">⚙️</span>
            {!isCollapsed && (
              <div className="min-w-0">
                <h2 className="text-xs font-black uppercase tracking-wider text-white">Loan Settings</h2>
                <p className="text-[10px] text-slate-400 truncate">Central Policy & Rates</p>
              </div>
            )}
          </div>
        </div>

        {/* Navigation Sections */}
        <nav className="p-2 space-y-1.5">
          {sections.map((sec) => {
            const isActive = activeSection === sec.id;
            return (
              <button
                key={sec.id}
                onClick={() => {
                  onSelectSection(sec.id);
                  if (onCloseMobile) onCloseMobile();
                }}
                className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-left transition active:scale-95 cursor-pointer ${
                  isActive
                    ? "bg-blue-600 text-white shadow-md shadow-blue-600/30 font-bold"
                    : "text-slate-400 hover:bg-slate-800/60 hover:text-slate-200 font-medium"
                } ${isCollapsed ? "justify-center" : ""}`}
                title={sec.label}
              >
                <span className="text-base shrink-0">{sec.icon}</span>
                {!isCollapsed && (
                  <div className="min-w-0 flex-1">
                    <div className="text-xs leading-tight truncate">{sec.label}</div>
                    <div className={`text-[10px] leading-tight truncate ${isActive ? "text-blue-100" : "text-slate-500"}`}>
                      {sec.subtitle}
                    </div>
                  </div>
                )}
              </button>
            );
          })}
        </nav>
      </div>

      {/* Collapse/Expand Toggle (Desktop Only) */}
      <div className="p-3 border-t border-slate-800 hidden md:block">
        <button
          onClick={onToggleCollapse}
          className="w-full flex items-center justify-center gap-2 py-2 px-3 rounded-xl bg-slate-800/50 hover:bg-slate-800 text-slate-400 hover:text-slate-200 text-xs font-semibold transition"
          title={isCollapsed ? "Expand Sidebar" : "Collapse Sidebar"}
        >
          <span>{isCollapsed ? "▶" : "◀"}</span>
          {!isCollapsed && <span className="text-[11px]">Collapse Sidebar</span>}
        </button>
      </div>
    </div>
  );

  return (
    <>
      {/* Desktop Persistent Sidebar */}
      <aside
        className={`hidden md:block transition-all duration-200 shrink-0 ${
          isCollapsed ? "w-16" : "w-64"
        }`}
      >
        {sidebarContent}
      </aside>

      {/* Mobile Backdrop & Drawer */}
      {isMobileOpen && (
        <div className="fixed inset-0 z-50 md:hidden flex">
          <div
            className="fixed inset-0 bg-slate-950/80 backdrop-blur-xs"
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
