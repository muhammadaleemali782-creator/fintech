import { useState, useEffect, useMemo, useCallback } from "react";

const ALL_DEPARTMENTS = ["deposit", "withdrawal", "loan", "kyc", "lending", "bond"];

/**
 * Custom hook to evaluate user permissions and department access
 */
export function usePermissions() {
  const [user, setUser] = useState(() => {
    try {
      return JSON.parse(localStorage.getItem("user") || "null");
    } catch {
      return null;
    }
  });

  useEffect(() => {
    const handleStorage = () => {
      try {
        setUser(JSON.parse(localStorage.getItem("user") || "null"));
      } catch {
        setUser(null);
      }
    };
    window.addEventListener("storage", handleStorage);
    return () => window.removeEventListener("storage", handleStorage);
  }, []);

  const role = user?.role || "user";
  const isAdmin = role === "admin";
  const isStaff = role === "staff";
  const isStaffOrAdmin = isAdmin || isStaff;
  const staffProfile = user?.staffProfile || null;
  const isActive = isAdmin || (isStaff && staffProfile?.isActive !== false);

  const permissions = useMemo(() => {
    if (isAdmin) return ["*"];
    if (!isStaff || !isActive) return [];
    return Array.isArray(staffProfile?.permissions) ? staffProfile.permissions : [];
  }, [isAdmin, isStaff, isActive, staffProfile]);

  const departments = useMemo(() => {
    if (isAdmin) return ALL_DEPARTMENTS;
    if (!isStaff || !isActive) return [];
    return Array.isArray(staffProfile?.departments) ? staffProfile.departments : [];
  }, [isAdmin, isStaff, isActive, staffProfile]);

  const maxApprovalAmount = useMemo(() => {
    if (isAdmin) return 0; // 0 = unlimited
    return staffProfile?.limits?.maxApprovalAmount || 0;
  }, [isAdmin, staffProfile]);

  const hasPermission = useCallback(
    (perm) => {
      if (!perm) return true;
      if (isAdmin) return true;
      if (!isStaff || !isActive) return false;
      return permissions.includes(perm);
    },
    [isAdmin, isStaff, isActive, permissions]
  );

  const hasAnyPermission = useCallback(
    (perms = []) => {
      if (!perms || perms.length === 0) return true;
      if (isAdmin) return true;
      if (!isStaff || !isActive) return false;
      return perms.some((p) => permissions.includes(p));
    },
    [isAdmin, isStaff, isActive, permissions]
  );

  const hasAllPermissions = useCallback(
    (perms = []) => {
      if (!perms || perms.length === 0) return true;
      if (isAdmin) return true;
      if (!isStaff || !isActive) return false;
      return perms.every((p) => permissions.includes(p));
    },
    [isAdmin, isStaff, isActive, permissions]
  );

  const canAccessDepartment = useCallback(
    (dept) => {
      if (!dept) return false;
      if (isAdmin) return true;
      if (!isStaff || !isActive) return false;
      return departments.includes(dept);
    },
    [isAdmin, isStaff, isActive, departments]
  );

  const canApproveAmount = useCallback(
    () => true,
    []
  );

  return {
    user,
    role,
    isAdmin,
    isStaff,
    isStaffOrAdmin,
    isActive,
    staffProfile,
    permissions,
    departments,
    maxApprovalAmount,
    hasPermission,
    hasAnyPermission,
    hasAllPermissions,
    canAccessDepartment,
    canApproveAmount
  };
}

export default usePermissions;
