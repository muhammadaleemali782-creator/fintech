import React from "react";
import Loader from "./Loader";

export default function Button({
  children,
  onClick,
  type = "button",
  variant = "primary",
  size = "md",
  isLoading = false,
  loadingText,
  disabled = false,
  fullWidth = false,
  leftIcon,
  rightIcon,
  className = "",
  ...props
}) {
  const isDisabled = disabled || isLoading;

  const baseStyles =
    "inline-flex items-center justify-center font-bold rounded-2xl select-none transition-all duration-75 focus-visible:outline-2 focus-visible:outline-blue-600 focus-visible:outline-offset-2 touch-manipulation cursor-pointer active:scale-96";

  const sizeStyles = {
    sm: "min-h-[38px] px-3.5 py-1.5 text-xs gap-1.5",
    md: "min-h-[44px] px-4.5 py-2.5 text-xs sm:text-sm gap-2",
    lg: "min-h-[50px] px-6 py-3.5 text-sm sm:text-base gap-2.5"
  };

  const variantStyles = {
    primary:
      "bg-blue-600 hover:bg-blue-700 text-white shadow-xs hover:shadow-md active:bg-blue-800 border border-transparent",
    secondary:
      "bg-slate-100 hover:bg-slate-200 text-slate-800 active:bg-slate-300 border border-slate-200/80",
    outline:
      "bg-transparent hover:bg-slate-50 text-slate-700 active:bg-slate-100 border border-slate-300",
    ghost:
      "bg-transparent hover:bg-slate-100 text-slate-600 active:bg-slate-200 border border-transparent shadow-none",
    danger:
      "bg-rose-600 hover:bg-rose-700 text-white shadow-xs hover:shadow-md active:bg-rose-800 border border-transparent",
    success:
      "bg-emerald-600 hover:bg-emerald-700 text-white shadow-xs hover:shadow-md active:bg-emerald-800 border border-transparent",
    dark:
      "bg-slate-900 hover:bg-slate-800 text-white shadow-sm hover:shadow-md active:bg-black border border-transparent"
  };

  const disabledStyles = isDisabled
    ? "opacity-55 cursor-not-allowed pointer-events-none active:scale-100 shadow-none"
    : "";

  const widthStyle = fullWidth ? "w-full" : "";

  return (
    <button
      type={type}
      onClick={isDisabled ? undefined : onClick}
      disabled={isDisabled}
      aria-disabled={isDisabled}
      className={`
        ${baseStyles}
        ${sizeStyles[size] || sizeStyles.md}
        ${variantStyles[variant] || variantStyles.primary}
        ${widthStyle}
        ${disabledStyles}
        ${className}
      `}
      {...props}
    >
      {isLoading ? (
        <>
          <Loader
            size={size === "lg" ? "md" : "sm"}
            color={variant === "secondary" || variant === "outline" || variant === "ghost" ? "primary" : "white"}
          />
          {loadingText ? <span>{loadingText}</span> : children}
        </>
      ) : (
        <>
          {leftIcon && <span className="shrink-0">{leftIcon}</span>}
          {children}
          {rightIcon && <span className="shrink-0">{rightIcon}</span>}
        </>
      )}
    </button>
  );
}

// Touchable alias component for cards, list items, and custom touchable wrappers
export function Touchable({
  children,
  onClick,
  className = "",
  disabled = false,
  role = "button",
  tabIndex = 0,
  ...props
}) {
  return (
    <div
      role={role}
      tabIndex={disabled ? -1 : tabIndex}
      onClick={disabled ? undefined : onClick}
      onKeyDown={(e) => {
        if (!disabled && (e.key === "Enter" || e.key === " ")) {
          e.preventDefault();
          if (onClick) onClick(e);
        }
      }}
      aria-disabled={disabled}
      className={`
        touch-manipulation select-none cursor-pointer transition-transform duration-75 active:scale-97
        focus-visible:outline-2 focus-visible:outline-blue-600 focus-visible:outline-offset-2
        ${disabled ? "opacity-50 cursor-not-allowed pointer-events-none" : ""}
        ${className}
      `}
      {...props}
    >
      {children}
    </div>
  );
}
