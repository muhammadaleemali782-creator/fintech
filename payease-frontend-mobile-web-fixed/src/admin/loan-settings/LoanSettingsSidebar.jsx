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
    <div className="h-full flex flex-col justify-between bg-zinc-900 border-r border-zinc-800 text-zinc-200 select-none">
      {/* Top Header & Navigation */}
      <div>
        {/* Back to Admin Button */}
        <div className="p-3 border-b border-zinc-800">
          <button
            onClick={onBackToAdmin}
            className={`w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-zinc-300 hover:text-white transition active:scale-95 text-xs font-bold border border-zinc-700/60 ${
              isCollapsed ? "justify-center" : "justify-start"
            }`}
            title="Back to Admin Panel"
          >
            <span className="text-sm">←</span>
            {!isCollapsed && <span className="truncate">Back to Admin Panel</span>}
          </button>
        </div>

        {/* Page Title */}
        <div className={`px-4 py-3 border-b border-zinc-800/60 ${isCollapsed ? "text-center" : ""}`}>
          <div className="flex items-center gap-2">
            <span className="text-lg">⚙️</span>
            {!isCollapsed && (
              <div className="min-w-0">
                <h2 className="text-xs font-black uppercase tracking-wider text-white">Loan Settings</h2>
                <p className="text-[10px] text-zinc-400 truncate">Central Policy & Rates</p>
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
                    ? "bg-zinc-800 text-white border border-zinc-700 shadow-sm font-bold"
                    : "text-zinc-400 hover:bg-zinc-800/60 hover:text-zinc-200 font-medium border border-transparent"
                } ${isCollapsed ? "justify-center" : ""}`}
                title={sec.label}
              >
                <span className="text-base shrink-0">{sec.icon}</span>
                {!isCollapsed && (
                  <div className="min-w-0 flex-1">
                    <div className="text-xs leading-tight truncate">{sec.label}</div>
                    <div className={`text-[10px] leading-tight truncate ${isActive ? "text-zinc-300" : "text-zinc-500"}`}>
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
      <div className="border-t border-zinc-800 space-y-2 p-3">
        {/* Read Me Guide Button */}
        <button
          onClick={() => {
            if (onOpenReadme) onOpenReadme();
            if (onCloseMobile) onCloseMobile();
          }}
          className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-xl bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 hover:text-emerald-300 border border-emerald-500/30 transition active:scale-95 text-xs font-bold cursor-pointer shadow-xs ${
            isCollapsed ? "justify-center" : "justify-start"
          }`}
          title="Read Me (Policy & Logic Guide)"
        >
          <span className="text-sm">📖</span>
          {!isCollapsed && <span className="truncate">Read Me Guide</span>}
        </button>

        {/* Collapse/Expand Toggle (Desktop Only) */}
        <div className="hidden md:block">
          <button
            onClick={onToggleCollapse}
            className="w-full flex items-center justify-center gap-2 py-2 px-3 rounded-xl bg-zinc-800/50 hover:bg-zinc-800 text-zinc-400 hover:text-zinc-200 text-xs font-semibold transition border border-zinc-800"
            title={isCollapsed ? "Expand Sidebar" : "Collapse Sidebar"}
          >
            <span>{isCollapsed ? "▶" : "◀"}</span>
            {!isCollapsed && <span className="text-[11px]">Collapse Sidebar</span>}
          </button>
        </div>
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
            className="fixed inset-0 bg-zinc-950/80 backdrop-blur-xs"
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
