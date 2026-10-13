/**
 * Staff Desks & Permission System Reference Architecture
 * Educa Fintech Department Desks
 */

const STAFF_DESKS_ENABLED = process.env.STAFF_DESKS_ENABLED !== 'false';

// Valid departments
const DEPARTMENTS = ['loan', 'kyc', 'deposit', 'withdrawal', 'lending', 'bond'];

// All granular permissions catalog
const PERMISSIONS = {
  // Loan
  LOAN_VIEW: 'loan.view',
  LOAN_PROCESS: 'loan.process',
  LOAN_DISBURSE: 'loan.disburse',
  LOAN_WAIVE_PENALTY: 'loan.waive_penalty',
  LOAN_CREATE_ON_BEHALF: 'loan.create_on_behalf',

  // KYC
  KYC_VIEW: 'kyc.view',
  KYC_PROCESS: 'kyc.process',
  KYC_VIEW_DOCUMENTS: 'kyc.view_documents',

  // Deposit
  DEPOSIT_VIEW: 'deposit.view',
  DEPOSIT_PROCESS: 'deposit.process',
  DEPOSIT_VIEW_PROOF: 'deposit.view_proof',

  // Withdrawal
  WITHDRAWAL_VIEW: 'withdrawal.view',
  WITHDRAWAL_PROCESS: 'withdrawal.process',

  // Lending
  LENDING_VIEW: 'lending.view',
  LENDING_PROCESS: 'lending.process',

  // Bond
  BOND_VIEW: 'bond.view',
  BOND_PROCESS: 'bond.process'
};

// Standard Department Presets
const PRESETS = {
  full_desk: {
    label: 'Full Desk (All Departments)',
    departments: ['loan', 'kyc', 'deposit', 'withdrawal', 'lending', 'bond'],
    permissions: Object.values(PERMISSIONS)
  },
  loan_desk: {
    label: 'Loan Desk',
    departments: ['loan'],
    permissions: [
      'loan.view',
      'loan.process',
      'loan.disburse',
      'loan.waive_penalty',
      'loan.create_on_behalf'
    ]
  },
  kyc_desk: {
    label: 'KYC Desk',
    departments: ['kyc'],
    permissions: [
      'kyc.view',
      'kyc.process',
      'kyc.view_documents'
    ]
  },
  deposit_desk: {
    label: 'Deposit Desk',
    departments: ['deposit'],
    permissions: [
      'deposit.view',
      'deposit.process',
      'deposit.view_proof'
    ]
  },
  withdrawal_desk: {
    label: 'Withdrawal Desk',
    departments: ['withdrawal'],
    permissions: [
      'withdrawal.view',
      'withdrawal.process'
    ]
  },
  lending_desk: {
    label: 'Lending Desk',
    departments: ['lending'],
    permissions: [
      'lending.view',
      'lending.process'
    ]
  },
  bond_desk: {
    label: 'Bond Desk',
    departments: ['bond'],
    permissions: [
      'bond.view',
      'bond.process'
    ]
  }
};

/**
 * Check if a user has a specific permission.
 * Super Admin (role === 'admin') has all permissions implicitly.
 */
function hasPermission(user, permission) {
  if (!user) return false;
  if (user.role === 'admin') return true;
  if (user.role !== 'staff') return false;
  if (!user.staffProfile || user.staffProfile.isActive === false) return false;

  const perms = Array.isArray(user.staffProfile.permissions) ? user.staffProfile.permissions : [];
  return perms.includes(permission);
}

/**
 * Check if a user has ANY of the specified permissions.
 */
function hasAnyPermission(user, permissionsList = []) {
  if (!user) return false;
  if (user.role === 'admin') return true;
  if (user.role !== 'staff') return false;
  if (!user.staffProfile || user.staffProfile.isActive === false) return false;

  const perms = Array.isArray(user.staffProfile.permissions) ? user.staffProfile.permissions : [];
  return permissionsList.some(p => perms.includes(p));
}

/**
 * Check if a user has ALL of the specified permissions.
 */
function hasAllPermissions(user, permissionsList = []) {
  if (!user) return false;
  if (user.role === 'admin') return true;
  if (user.role !== 'staff') return false;
  if (!user.staffProfile || user.staffProfile.isActive === false) return false;

  const perms = Array.isArray(user.staffProfile.permissions) ? user.staffProfile.permissions : [];
  return permissionsList.every(p => perms.includes(p));
}

/**
 * Returns allowed department list for a given user.
 */
function getAllowedDepartments(user) {
  if (!user) return [];
  if (user.role === 'admin') return [...DEPARTMENTS];
  if (user.role !== 'staff' || !user.staffProfile || user.staffProfile.isActive === false) return [];
  return Array.isArray(user.staffProfile.departments) ? user.staffProfile.departments : [];
}

module.exports = {
  STAFF_DESKS_ENABLED,
  DEPARTMENTS,
  PERMISSIONS,
  PRESETS,
  hasPermission,
  hasAnyPermission,
  hasAllPermissions,
  getAllowedDepartments
};
