import React from "react";

export default class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, errorInfo) {
    console.error("Educa Fintech ErrorBoundary caught an unhandled error:", error, errorInfo);

    // Auto-recover from stale dynamic chunk imports (common during new deployments)
    const errorMsg = String(error?.message || "");
    const isChunkError =
      errorMsg.includes("dynamically imported module") ||
      errorMsg.includes("Failed to fetch dynamically imported module") ||
      errorMsg.includes("Loading chunk") ||
      errorMsg.includes("Importing a module script failed");

    if (isChunkError) {
      const reloadKey = "educa_chunk_auto_reloaded";
      const alreadyReloaded = sessionStorage.getItem(reloadKey);
      if (!alreadyReloaded) {
        sessionStorage.setItem(reloadKey, "true");
        window.location.reload();
      }
    }
  }

  handleReload = () => {
    sessionStorage.removeItem("educa_chunk_auto_reloaded");
    window.location.reload();
  };

  handleGoHome = () => {
    sessionStorage.removeItem("educa_chunk_auto_reloaded");
    window.location.href = "/";
  };

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-[100dvh] bg-[#F8FAFC] text-slate-900 flex flex-col items-center justify-center p-6 select-none font-sans">
          <div className="w-full max-w-sm bg-white rounded-3xl p-6 sm:p-8 shadow-xl border border-slate-200/80 text-center flex flex-col items-center">
            {/* Logo */}
            <div className="relative mb-4 flex items-center justify-center">
              <div className="w-16 h-16 rounded-2xl bg-blue-50 border border-blue-200/80 p-2 shadow-xs flex items-center justify-center">
                <img
                  src="/icon-192.png"
                  alt="Educa Fintech"
                  className="w-12 h-12 object-contain"
                />
              </div>
            </div>

            <h2 className="text-xl font-black text-slate-900 tracking-tight mb-1">
              Educa <span className="text-blue-600">Fintech</span>
            </h2>
            <p className="text-xs font-semibold text-slate-500 mb-5">
              Secure Financial Session
            </p>

            <div className="p-3.5 bg-blue-50/70 border border-blue-100 rounded-2xl text-xs text-blue-900 mb-6 text-left w-full space-y-1">
              <div className="font-bold flex items-center gap-1.5">
                <span>🛡️</span>
                <span>Session Safe Recovery</span>
              </div>
              <p className="text-[11px] text-blue-700 leading-relaxed font-medium">
                Screen load karne me dikkat aayi thi. Naye update ko load karne ke liye neeche button dabayein.
              </p>
            </div>

            <div className="space-y-2.5 w-full">
              <button
                type="button"
                onClick={this.handleReload}
                className="w-full py-3 px-4 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white rounded-xl text-xs font-black shadow-md shadow-blue-500/20 active:scale-98 transition flex items-center justify-center gap-2 cursor-pointer"
              >
                <span>🔄</span>
                <span>Refresh & Reload App</span>
              </button>

              <button
                type="button"
                onClick={this.handleGoHome}
                className="w-full py-2.5 px-4 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-bold border border-slate-200 active:scale-98 transition flex items-center justify-center gap-2 cursor-pointer"
              >
                <span>🏠</span>
                <span>Back to Login</span>
              </button>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
