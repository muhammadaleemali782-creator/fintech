import React from "react";

export default function Skeleton({
  variant = "rect",
  lines = 1,
  className = "",
  width,
  height,
  ...props
}) {
  const baseShimmer = "bg-slate-200/80 animate-pulse rounded-xl";

  const style = {
    width: width || undefined,
    height: height || undefined
  };

  if (variant === "circle") {
    return (
      <div
        className={`${baseShimmer} rounded-full shrink-0 ${className}`}
        style={style}
        {...props}
      />
    );
  }

  if (variant === "card") {
    return (
      <div
        className={`p-4 bg-white border border-slate-100 rounded-2xl shadow-2xs space-y-3 ${className}`}
        style={style}
        {...props}
      >
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-full bg-slate-200 animate-pulse shrink-0" />
          <div className="space-y-1.5 flex-1">
            <div className="h-3.5 bg-slate-200 rounded w-2/3 animate-pulse" />
            <div className="h-2.5 bg-slate-200 rounded w-1/3 animate-pulse" />
          </div>
        </div>
        <div className="space-y-2 pt-2">
          <div className="h-3 bg-slate-200 rounded w-full animate-pulse" />
          <div className="h-3 bg-slate-200 rounded w-4/5 animate-pulse" />
        </div>
      </div>
    );
  }

  if (variant === "text" && lines > 1) {
    return (
      <div className={`space-y-2 ${className}`} {...props}>
        {Array.from({ length: lines }).map((_, i) => (
          <div
            key={i}
            className={`${baseShimmer} h-3.5 ${i === lines - 1 ? "w-3/5" : "w-full"}`}
            style={i === lines - 1 ? { width: width || "60%" } : {}}
          />
        ))}
      </div>
    );
  }

  const defaultHeight = variant === "text" ? "h-3.5" : "h-12";

  return (
    <div
      className={`${baseShimmer} ${defaultHeight} ${className}`}
      style={style}
      {...props}
    />
  );
}
