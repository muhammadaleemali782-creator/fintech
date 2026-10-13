import React from "react";

export default function Loader({
  size = "md",
  color = "primary",
  label = "",
  inline = false,
  className = ""
}) {
  const sizeMap = {
    xs: "w-3.5 h-3.5 border-2",
    sm: "w-4.5 h-4.5 border-2",
    md: "w-6 h-6 border-2.5",
    lg: "w-8 h-8 border-3",
    xl: "w-11 h-11 border-4"
  };

  const colorMap = {
    primary: "border-slate-200 border-t-blue-600",
    white: "border-white/30 border-t-white",
    emerald: "border-emerald-200 border-t-emerald-600",
    amber: "border-amber-200 border-t-amber-600",
    rose: "border-rose-200 border-t-rose-600",
    slate: "border-slate-300 border-t-slate-800"
  };

  const spinnerClass = `${sizeMap[size] || sizeMap.md} ${colorMap[color] || colorMap.primary} rounded-full animate-spin shrink-0`;

  if (inline) {
    return (
      <span className={`inline-flex items-center gap-2 ${className}`}>
        <span className={spinnerClass} />
        {label && <span className="text-xs font-semibold">{label}</span>}
      </span>
    );
  }

  return (
    <div className={`flex items-center justify-center gap-2.5 ${className}`}>
      <div className={spinnerClass} />
      {label && <span className="text-xs sm:text-sm font-bold text-slate-600">{label}</span>}
    </div>
  );
}
