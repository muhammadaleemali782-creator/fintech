# STAFF_DESKS_DESIGN.md
# Department-based Staff Desks with Permission Control

## 1. Executive Summary & Reconnaissance Findings

Educa Fintech currently operates on a 3-role system (`user`, `agent`, `admin`). All administrative capabilities are restricted to super administrators (`role === 'admin'`). As the business scales, operations need to be segregated into dedicated departmental desks (Loan, KYC, Deposit, Withdrawal, Lending, Bond) so staff members can process only the requests assigned to their jurisdiction, while super administrators retain global control, oversight, and a comprehensive audit trail.

### Key Discoveries in Existing Codebase
1. **User Schema & Authentication**:
   - `models/User.js` defines `role: { type: String, enum: ['user', 'admin', 'agent'], default: 'user' }`.
   - `tokenVersion` (`tv`) did not exist yet in `models/User.js`. Tokens are signed directly in `routes/auth.js` (`jwt.sign({ id: user._id }, ...)` with 30d expiry) and verified in `middleware/auth.js`.
   - There was no `staff` role, `staffProfile`, or sub-admin permission structure.
2. **Current Admin Routes**:
   - Routes in `routes/admin.js`, `routes/loan.js`, `routes/bond.js`, and `routes/bootstrap.js` guard endpoints via `protect, admin` (`req.user.role === 'admin'`).
   - Transaction approvals (`POST /admin/transaction/:id/approve|reject`) currently handle deposits, withdrawals, and wallet operations within a single endpoint.
   - Audit logging is rudimentary: `approverName` is sometimes accepted from client payload (`req.body.approverName`), which is spoofable.
3. **Lending vs Bond Architecture**:
   - Bonds and lending are both managed through `models/Bond.js` and `routes/bond.js`.
   - `bondType === 'debit_365'` (365-day fixed 18% maturity) and `bond_25k` represent **Bond Desk**.
   - `bondType === 'lending_40'` (40-month ₹3,500/mo payout) and `bondType === 'lending_80'` (80-month ₹2,500/mo payout), along with `wallets.lending`, represent **Lending Desk**.
   - In KYC, `isLoanLending` (cheque / PAN) designates loan & lending underwriting barrier KYC.
4. **Real-time Notifications & Streams**:
   - `GET /admin/notifications/stream` uses Server-Sent Events (SSE) broadcasting events to all connected admins.
5. **Frontend & Mobile Clients**:
   - `App.jsx` protects `/admin` via `PrivateRoute adminOnly`.
   - `Dashboard.jsx` shows an admin persistence banner and nav link for `role === 'admin'`.
   - Android WebView shell (`MainActivity.kt`) interfaces directly with the web application.

---

## 2. Department & Permission Architecture

### Departments & Actions
* **Departments**: `loan`, `kyc`, `deposit`, `withdrawal`, `lending`, `bond`.
* **Actions**:
  * Standard: `view`, `process` (approve, reject, hold, note).
  * Sensitive: `loan.disburse`, `loan.waive_penalty`, `loan.create_on_behalf`, `kyc.view_documents`, `deposit.view_proof`.
* **Presets**:
  * `Full Desk`: All permissions across all 6 departments.
  * `Loan Desk`: `loan.view`, `loan.process`, `loan.disburse`, `loan.waive_penalty`, `loan.create_on_behalf`.
  * `KYC Desk`: `kyc.view`, `kyc.process`, `kyc.view_documents`.
  * `Deposit Desk`: `deposit.view`, `deposit.process`, `deposit.view_proof`.
  * `Withdrawal Desk`: `withdrawal.view`, `withdrawal.process`.
  * `Lending Desk`: `lending.view`, `lending.process`.
  * `Bond Desk`: `bond.view`, `bond.process`.

### Security Guarantees & Invariants
1. **Admin Invariant**: `role === 'admin'` always possesses all permissions implicitly. Admin accounts remain untouched and fully operational.
2. **Staff Boundaries**: Staff cannot access user management, settings, agent applications, interest rates, card unlocks, yield distribution, backup exports, or staff management.
3. **Immediate Revocation**: Bumping `user.tokenVersion` instantly invalidates staff JWT tokens. Real-time `permissions_changed` SSE event gracefully redirects active Desk sessions.
4. **Self-Approval Guard**: Staff cannot approve, reject, or disburse requests where `entity.userId === req.user._id`.
5. **Approval Limits**: Staff with `limits.maxApprovalAmount` cannot approve amounts exceeding their threshold.
6. **Short-Lived Tokens**: Staff JWT tokens expire in 12 hours (users remain 30 days).

---

## 3. Backend Implementation Plan

1. **Model Updates**:
   - `User.js`: Add `'staff'` to `role` enum. Add `tokenVersion` (`Number`, default `0`). Add `staffProfile` (`departments`, `permissions`, `isActive`, `createdBy`, `createdAt`, `limits`, `lastActiveAt`).
   - `AuditLog.js` (new append-only collection): `actorId`, `actorName`, `actorRole`, `department`, `action`, `entityType`, `entityId`, `userId`, `amount`, `fromStatus`, `toStatus`, `note`, `ip`, `userAgent`, `createdAt`.
   - `handledBy` field added to `Transaction`, `Loan`, `Bond`, and `User` (for KYC).
2. **Token & Middleware Helpers**:
   - `utils/token.js`: `signAuthToken(user, { expiresIn })` encoding `{ id, tv }`.
   - `utils/permissions.js`: Permission catalog, department definitions, preset generators, and validation helpers.
   - `middleware/auth.js`:
     - Update `protect` to enforce token version check (`tv`).
     - Add `requirePermission(...perms)` middleware.
3. **Route Migration & Atomic Idempotency**:
   - `POST /admin/transaction/:id/approve|reject`: Look up transaction type inside handler session. Require `deposit.process` for deposits, `withdrawal.process` for withdrawals, and `lending.process` for lending items.
   - Atomic status guard: `findOneAndUpdate({ _id, status: { $in: ['pending', 'hold'] } }, ...)` to ensure parallel attempts yield exactly 1 approval and 1 balance credit.
   - Loan endpoints (`/loan/:id/approve|reject`, installments, penalty waivers) migrated to `requirePermission`.
   - Bond endpoints (`/bond/:id/approve|reject`) migrated to `requirePermission`.
   - `GET /bootstrap/admin`: Dynamically filters response blocks according to caller permissions.
   - SSE notification stream: Filters events per staff department permissions.
4. **Staff Management API (Admin only)**:
   - `GET /admin/staff`: List staff with activity & departments.
   - `POST /admin/staff`: Create staff member with cryptographically random temporary password.
   - `PATCH /admin/staff/:id/permissions`: Update departments, granular permissions, amount limit.
   - `POST /admin/staff/:id/toggle-active`: Suspend or reinstate staff member.
   - `POST /admin/staff/:id/force-logout`: Bump `tokenVersion` to immediately invalidate all sessions.
5. **Activity Log API (Admin only)**:
   - `GET /admin/activity-log`: Paginated, indexed search with filters (staff, department, action, date range) and CSV export.

---

## 4. Frontend & Mobile Implementation Plan

1. **Modular Architecture (New Files Only)**:
   - `src/hooks/usePermissions.js`: Reactive permission consumer.
   - `src/components/Can.jsx`: Strict permission gate rendering `null` on unauthorized items.
   - `src/desk/StaffDesk.jsx`: Lightweight, high-performance operational desk with department tabs, queue counts, request drawers, and double-click guards.
   - `src/admin/StaffManager.jsx`: Admin management UI for staff creation and permission control.
   - `src/admin/ActivityLog.jsx`: Admin audit log viewer.
2. **Routing & Navigation**:
   - `App.jsx`: `/desk` route protected by `PrivateRoute` allowing `role === 'admin' || role === 'staff'`. Staff users automatically land on `/desk`.
   - `Dashboard.jsx`: Staff profile displays **"Desk"** button.
   - `AdminPanel.jsx`: Embeds `StaffManager` and `ActivityLog` tabs; request cards display **Handled by** badges.
3. **Double-Click & Concurrency Safeguards**:
   - In-flight action locks per item ID.
   - Explicit confirmation sheets for financial disburse/reject actions.
4. **Android WebView & Responsive Polish**:
   - Safe-area insets, mobile touch targets >= 44px, zero layout shift, smooth transitions (<200ms).

---

## 5. Assumptions & Confirmation Items

1. **Lending Department**: Any transactions with `sourceWallet === 'lending'` or remarks referencing lending, and loans/bonds of type `lending_40` / `lending_80` belong to the Lending Desk.
2. **Claim Feature**: Soft claim locking ("In review by <name>") expires after 10 minutes and does not block super admins.
3. **Backward Compatibility**: All existing admin credentials and user session tokens continue to function seamlessly without forced logouts.
