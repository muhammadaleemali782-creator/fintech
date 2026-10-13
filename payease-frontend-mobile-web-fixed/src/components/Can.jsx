import React from "react";
import usePermissions from "../hooks/usePermissions";

/**
 * Declarative component for permission-gated UI elements
 *
 * Usage:
 * <Can do="loan.process">
 *   <button>Approve Loan</button>
 * </Can>
 *
 * <Can any={["deposit.process", "withdrawal.process"]}>
 *   <QuickActions />
 * </Can>
 *
 * <Can department="loan">
 *   <LoanTab />
 * </Can>
 */
export default function Can({
  do: permission,
  any: anyPermissions,
  all: allPermissions,
  department,
  maxAmount,
  fallback = null,
  children
}) {
  const {
    hasPermission,
    hasAnyPermission,
    hasAllPermissions,
    canAccessDepartment,
    canApproveAmount
  } = usePermissions();

  if (permission && !hasPermission(permission)) {
    return fallback;
  }

  if (anyPermissions && !hasAnyPermission(anyPermissions)) {
    return fallback;
  }

  if (allPermissions && !hasAllPermissions(allPermissions)) {
    return fallback;
  }

  if (department && !canAccessDepartment(department)) {
    return fallback;
  }

  if (maxAmount !== undefined && !canApproveAmount(maxAmount)) {
    return fallback;
  }

  return <>{children}</>;
}
