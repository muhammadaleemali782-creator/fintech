import React, { useState, useEffect, useCallback, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { tokenStorage } from "../../utils/tokenStorage";
import { API_BASE_URL } from "../../config";
import LoanSettingsSidebar from "./LoanSettingsSidebar";
import CommissionSettingsSection from "./CommissionSettingsSection";
import PrecloseSettingsSection from "./PrecloseSettingsSection";
import CustomConditionsSection from "./CustomConditionsSection";
import CalculatorPreviewSection from "./CalculatorPreviewSection";
import {
  DEFAULT_MANDATORY_INSTALLMENTS,
  DEFAULT_INSTALLMENT_BLOCK_SIZE,
  DEFAULT_DISCOUNT_PERCENT_PER_BLOCK,
  DEFAULT_MAXIMUM_DISCOUNT_PERCENT,
  DEFAULT_AGENT_SHARE_PERCENT,
  DEFAULT_LOAN_DEPARTMENT_SHARE_PERCENT
} from "../../constants/loanSettingsDefaults";

export default function LoanSettingsPage() {
  const navigate = useNavigate();
  const token = tokenStorage.getToken();

  // Sidebar navigation state
  const [activeSection, setActiveSection] = useState("commission");
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(() => {
    try {
      return localStorage.getItem("educa_loan_settings_sidebar_collapsed") === "true";
    } catch {
      return false;
    }
  });
  const [isMobileDrawerOpen, setIsMobileDrawerOpen] = useState(false);

  // Settings State
  const [initialData, setInitialData] = useState(null);
  const [settings, setSettings] = useState({
    default: {
      mandatory_installments_before_preclose: DEFAULT_MANDATORY_INSTALLMENTS,
      installment_block_size: DEFAULT_INSTALLMENT_BLOCK_SIZE,
      discount_percent_per_block: DEFAULT_DISCOUNT_PERCENT_PER_BLOCK,
      maximum_discount_percent: DEFAULT_MAXIMUM_DISCOUNT_PERCENT,
      agent_share_percent: DEFAULT_AGENT_SHARE_PERCENT,
      loan_department_share_percent: DEFAULT_LOAN_DEPARTMENT_SHARE_PERCENT
    },
    overrides: {}
  });
  const [conditions, setConditions] = useState([]);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState({ msg: "", isError: false });

  const showToast = useCallback((msg, isError = false) => {
    setToast({ msg, isError });
    setTimeout(() => setToast({ msg: "", isError: false }), 4500);
  }, []);

  const toggleSidebar = () => {
    setIsSidebarCollapsed((prev) => {
      const next = !prev;
      try {
        localStorage.setItem("educa_loan_settings_sidebar_collapsed", String(next));
      } catch {}
      return next;
    });
  };

  // Fetch settings from API
  const fetchSettings = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`${API_BASE_URL}/admin/loan-settings`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || "Failed to load loan settings");

      if (data.settings) {
        setSettings(data.settings);
      }
      if (Array.isArray(data.conditions)) {
        setConditions(data.conditions);
      }
      setInitialData(JSON.stringify({ settings: data.settings, conditions: data.conditions }));
    } catch (err) {
      showToast(err.message, true);
    } finally {
      setLoading(false);
    }
  }, [token, showToast]);

  useEffect(() => {
    fetchSettings();
  }, [fetchSettings]);

  // Track if preclose settings or conditions have unsaved changes
  const isDirty = useMemo(() => {
    if (!initialData) return false;
    const current = JSON.stringify({ settings, conditions });
    return current !== initialData;
  }, [initialData, settings, conditions]);

  // Warn on browser tab close / refresh if unsaved
  useEffect(() => {
    const handleBeforeUnload = (e) => {
      if (isDirty) {
        e.preventDefault();
        e.returnValue = "";
      }
    };
    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  }, [isDirty]);

  // Save Preclose Settings & Conditions
  const handleSave = async () => {
    // Validate default shares
    const agentShare = Number(settings?.default?.agent_share_percent ?? DEFAULT_AGENT_SHARE_PERCENT);
    const deptShare = Number(settings?.default?.loan_department_share_percent ?? DEFAULT_LOAN_DEPARTMENT_SHARE_PERCENT);

    if (Math.round(agentShare + deptShare) !== 100) {
      showToast(`Agent share (${agentShare}%) aur Dept share (${deptShare}%) ka sum 100% hona chahiye!`, true);
      return;
    }

    setSaving(true);
    try {
      const res = await fetch(`${API_BASE_URL}/admin/loan-settings`, {
        method: "PUT",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({ settings, conditions })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || "Failed to save settings");

      setSettings(data.settings);
      setConditions(data.conditions);
      setInitialData(JSON.stringify({ settings: data.settings, conditions: data.conditions }));
      showToast(data.message || "Loan settings saved successfully!");
    } catch (err) {
      showToast(err.message, true);
    } finally {
      setSaving(false);
    }
  };

  // Reset to default settings
  const handleResetToDefault = () => {
    if (window.confirm("Kya aap saari Preclose settings ko default values par reset karna chahte hain?")) {
      const resetSettings = {
        default: {
          mandatory_installments_before_preclose: DEFAULT_MANDATORY_INSTALLMENTS,
          installment_block_size: DEFAULT_INSTALLMENT_BLOCK_SIZE,
          discount_percent_per_block: DEFAULT_DISCOUNT_PERCENT_PER_BLOCK,
          maximum_discount_percent: DEFAULT_MAXIMUM_DISCOUNT_PERCENT,
          agent_share_percent: DEFAULT_AGENT_SHARE_PERCENT,
          loan_department_share_percent: DEFAULT_LOAN_DEPARTMENT_SHARE_PERCENT
        },
        overrides: {}
      };
      setSettings(resetSettings);
      showToast("Settings reset to defaults. Click 'Save Changes' to apply.");
    }
  };

  const handleBackToAdmin = () => {
    if (isDirty) {
      if (window.confirm("Aapke paas unsaved changes hain. Kya aap bina save kiye wapas jaana chahte hain?")) {
        navigate("/admin");
      }
    } else {
      navigate("/admin");
    }
  };

  return (
    <div className="h-screen max-h-screen flex flex-col font-sans select-none overflow-hidden bg-zinc-950 text-zinc-100">
      {/* Toast Notification */}
      {toast.msg && (
        <div
          className={`fixed top-4 right-4 z-50 px-4 py-2.5 rounded-xl text-xs font-bold shadow-2xl flex items-center gap-2 animate-in fade-in slide-in-from-top-2 duration-150 ${
            toast.isError
              ? "bg-rose-600 text-white border border-rose-500 shadow-rose-600/30"
              : "bg-emerald-600 text-white border border-emerald-500 shadow-emerald-600/30"
          }`}
        >
          <span>{toast.isError ? "⚠️" : "✓"}</span>
          <span>{toast.msg}</span>
          <button
            onClick={() => setToast({ msg: "", isError: false })}
            className="ml-2 hover:opacity-75 cursor-pointer"
          >
            ✕
          </button>
        </div>
      )}

      {/* Mobile Top Header */}
      <header className="md:hidden bg-zinc-900 border-b border-zinc-800 px-4 py-3 flex items-center justify-between sticky top-0 z-30 shrink-0">
        <div className="flex items-center gap-2.5">
          <button
            onClick={() => setIsMobileDrawerOpen(true)}
            className="p-1.5 rounded-lg bg-zinc-800 text-zinc-300 hover:text-white"
          >
            ☰
          </button>
          <span className="text-xs font-black uppercase tracking-wider text-white">Loan Settings</span>
        </div>
        <button
          onClick={handleBackToAdmin}
          className="px-2.5 py-1 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-300 text-[11px] font-bold"
        >
          ← Back
        </button>
      </header>

      {/* Main Layout Container */}
      <div className="flex-1 flex overflow-hidden min-h-0">
        {/* Collapsible Sidebar */}
        <LoanSettingsSidebar
          activeSection={activeSection}
          onSelectSection={setActiveSection}
          isCollapsed={isSidebarCollapsed}
          onToggleCollapse={toggleSidebar}
          onBackToAdmin={handleBackToAdmin}
          isMobileOpen={isMobileDrawerOpen}
          onCloseMobile={() => setIsMobileDrawerOpen(false)}
        />

        {/* Content Area with ample bottom padding to prevent any bottom bar overlap */}
        <main className="flex-1 overflow-y-auto p-4 sm:p-6 lg:p-8 space-y-6 pb-48">
          {loading ? (
            <div className="flex flex-col items-center justify-center min-h-[40vh] space-y-3">
              <div className="w-8 h-8 border-3 border-zinc-400 border-t-transparent rounded-full animate-spin" />
              <span className="text-xs text-zinc-400 font-bold">Loading Loan Settings...</span>
            </div>
          ) : (
            <>
              {activeSection === "commission" && (
                <CommissionSettingsSection showToast={showToast} />
              )}

              {activeSection === "preclose" && (
                <PrecloseSettingsSection
                  settings={settings}
                  onChangeSettings={setSettings}
                  isDirty={isDirty}
                />
              )}

              {activeSection === "conditions" && (
                <CustomConditionsSection
                  conditions={conditions}
                  onChangeConditions={setConditions}
                />
              )}

              {activeSection === "calculator" && (
                <CalculatorPreviewSection
                  settings={settings}
                  conditions={conditions}
                />
              )}
            </>
          )}
        </main>
      </div>

      {/* Sticky Bottom Actions Bar (Active on preclose and conditions sections) */}
      {(activeSection === "preclose" || activeSection === "conditions") && (
        <div className="fixed bottom-0 inset-x-0 bg-zinc-900/95 backdrop-blur-md border-t border-zinc-800 px-4 sm:px-8 py-3.5 flex items-center justify-between z-40 shadow-2xl">
          <div className="flex items-center gap-3">
            {isDirty ? (
              <span className="flex items-center gap-2 text-xs font-bold text-amber-400">
                <span className="w-2 h-2 rounded-full bg-amber-400 animate-pulse" />
                <span>Unsaved changes pending</span>
              </span>
            ) : (
              <span className="text-xs text-zinc-400 hidden sm:inline">
                All settings up to date
              </span>
            )}
          </div>

          <div className="flex items-center gap-2.5">
            <button
              onClick={handleResetToDefault}
              disabled={saving}
              className="px-3.5 py-2 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 border border-zinc-700 rounded-xl text-xs font-bold transition active:scale-95 cursor-pointer"
            >
              Reset to Default
            </button>
            <button
              onClick={handleSave}
              disabled={saving || !isDirty}
              className={`px-5 py-2 rounded-xl text-xs font-bold transition flex items-center gap-1.5 shadow-md active:scale-95 cursor-pointer ${
                isDirty
                  ? "bg-zinc-100 hover:bg-white text-zinc-950 font-black shadow-zinc-100/20"
                  : "bg-zinc-800 text-zinc-500 cursor-not-allowed border border-zinc-800"
              }`}
            >
              {saving ? (
                <>
                  <span className="w-3.5 h-3.5 border-2 border-zinc-950 border-t-transparent rounded-full animate-spin" />
                  <span>Saving...</span>
                </>
              ) : (
                <>
                  <span>💾</span>
                  <span>Save Changes</span>
                </>
              )}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
