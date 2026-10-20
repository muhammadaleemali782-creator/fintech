# Educa Fintech — Architecture, Updates & Location Reference Map
> **MANDATORY AGENT INSTRUCTION (Read First)**:
> Whenever you receive a user request, bug report, or feature task on this codebase, **read this file first**.
> It lists every critical component, exact file paths, line ranges, data contracts, and dependency rules.
> **Golden Rule**: Fix root causes surgically in the exact mapped location without touching or breaking other systems.

---

## 1. Quick-Lookup Index for Common Tasks & Issues

| Issue / Request | Primary File & Location | Secondary / Dependent Files |
| :--- | :--- | :--- |
| **Photos / KYC not loading** | `payease-backend-fixed/routes/admin.js` (`/admin/user/:id/kyc-docs`)<br>`payease-backend-fixed/routes/bootstrap.js` (L180-L195)<br>`payease-backend-fixed/routes/user.js` (L155-L170) | `payease-backend-fixed/utils/crypto.js`<br>`payease-frontend-mobile-web-fixed/src/AdminPanel.jsx` (`fetchUserKycDocs`) |
| **Photo Encryption at Rest** | `payease-backend-fixed/utils/crypto.js` (`encryptData`, `decryptData`)<br>`payease-backend-fixed/routes/loan.js` (L680, L1724)<br>`payease-backend-fixed/routes/user.js` (L235) | `payease-backend-fixed/scripts/encrypt_all_existing_docs.js` |
| **Offline Cache / 0ms Instant Load** | `payease-frontend-mobile-web-fixed/src/utils/CacheManager.js`<br>`payease-frontend-mobile-web-fixed/src/Dashboard.jsx` (L500-L580)<br>`payease-frontend-mobile-web-fixed/src/AdminPanel.jsx` (L1050-L1155) | `payease-frontend-mobile-web-fixed/src/utils/dataCache.js` |
| **App Close Data Snapshot (`saveSnapshot`)** | `payease-frontend-mobile-web-fixed/src/Dashboard.jsx` (L2930-L2985)<br>`payease-frontend-mobile-web-fixed/src/AdminPanel.jsx` (L2665-L2715) | `payease-frontend-mobile-web-fixed/src/utils/CacheManager.js` |
| **Realtime Sync / 30-min lag / Bootstrap Pulse** | `payease-backend-fixed/routes/bootstrap.js` (`/bootstrap/pulse`, `/bootstrap/user`, `/bootstrap/agent`, `/bootstrap/admin`)<br>`payease-frontend-mobile-web-fixed/src/Dashboard.jsx` (`silentSyncAll`, L2770-L2835) | `payease-frontend-mobile-web-fixed/src/AdminPanel.jsx` (`loadBootstrapAdmin`, L2518) |
| **Photo Fullscreen / Lightbox Zoom** | `payease-frontend-mobile-web-fixed/src/Dashboard.jsx` (L660, L11700+)<br>`payease-frontend-mobile-web-fixed/src/AdminPanel.jsx` (L14300+) | Lightbox container must have `z-[9999999]` |
| **Loan Calculations / EMI / Preclosure** | `payease-backend-fixed/utils/loanRules.js`<br>`payease-backend-fixed/routes/loan.js`<br>`payease-backend-fixed/routes/loanSettings.js` | `payease-backend-fixed/tests/loanSettings.test.js` |
| **Bonds / Investments / Monthly Lending** | `payease-backend-fixed/routes/bond.js`<br>`payease-backend-fixed/models/Bond.js`<br>`payease-frontend-mobile-web-fixed/src/Dashboard.jsx` | Fixed 25m/50m wealth bonds & 40m/80m monthly lending |
| **Admin Stats / Pending List / Desk Approvals** | `payease-backend-fixed/routes/admin.js`<br>`payease-frontend-mobile-web-fixed/src/AdminPanel.jsx` | `payease-frontend-mobile-web-fixed/src/StaffDesk.jsx` |
| **Desktop ZIP Package Build** | `C:\Users\suppo\.gemini\antigravity\brain\4ea81f71-d89e-42a0-a602-2800e3cae92e\scratch\pack_desktop_zip.ps1` | Output: `C:\Users\suppo\OneDrive\Desktop\educa_full_project_clean.zip` |

---

## 2. Key Directories & File Structure

```
D:\Backup projects\Paytment website\
├── payease-backend-fixed/
│   ├── config/db.js                 # MongoDB connection & index creation
│   ├── models/                      # Mongoose schemas (User, Loan, Bond, Transaction, Settings, etc.)
│   ├── routes/
│   │   ├── admin.js                 # Admin endpoints: stats, users, pending txns, kyc-docs
│   │   ├── bootstrap.js             # Consolidated 1-call bootstrap & lightweight 100-byte /pulse
│   │   ├── loan.js                  # Loan apply, active details, pay installment, approve/reject
│   │   ├── loanSettings.js          # Preclosure rules, department shares, commission caps
│   │   ├── bond.js                  # Fixed bonds & monthly lending investments
│   │   ├── user.js                  # User profile, edit profile, change password
│   │   └── auth.js                  # Login, register, token issuance (rememberMe support)
│   ├── utils/
│   │   ├── crypto.js                # AES-256-GCM encryption & decryption at rest (enc2:: prefix)
│   │   ├── loanRules.js             # Preclosure discount, penalty & installment calculations
│   │   └── permissions.js           # Staff RBAC permissions
│   └── tests/                       # 36 automated unit & integration tests
│
├── payease-frontend-mobile-web-fixed/
│   ├── src/
│   │   ├── Dashboard.jsx            # Main customer & agent dashboard (~13k lines)
│   │   ├── AdminPanel.jsx           # Main admin console (~15k lines)
│   │   ├── StaffDesk.jsx            # Department staff desks (Loan, Deposit, Withdrawal, KYC)
│   │   ├── LoanSettingsPage.jsx     # Loan configuration panel
│   │   ├── Login.jsx                # Multi-role authentication page
│   │   └── utils/
│   │       ├── CacheManager.js      # Dual storage: L1 memory + synchronous localStorage + IndexedDB
│   │       └── dataCache.js         # Backward-compatibility barrel export
│   └── vite.config.js
│
└── educa-fintech-android-app/       # Native Android WebView wrapper project
```

---

## 3. Detailed Changelog & Exact Implementation Locations

### Update A: Stale-While-Revalidate & Instant Offline Cache (0ms Startup)
- **Problem Solved**: App launch was previously showing blank/0 balance/empty arrays until server responded. When app was swiped away on mobile, previous writes queued in idle callback were lost.
- **Exact Locations**:
  1. `payease-frontend-mobile-web-fixed/src/utils/CacheManager.js`:
     - Synchronous writes: `CacheManager.set()` and `CacheManager.persistLegacy()` write immediately to `localStorage.setItem()` inside `try/catch`. Idle queueing was deleted.
     - `getSync()` and `parseCachedNumber()` safely inspect `{ data: ... }` record wrappers without throwing or returning `NaN`.
  2. `payease-frontend-mobile-web-fixed/src/Dashboard.jsx` (L500-L580, L635, L718, L803):
     - Added `unwrapCachedArray()` helper to unwrap both raw arrays and `{ data: [...] }` envelopes.
     - Initial states for `txns`, `loans`, `bonds`, `profitHistory`, `activeLoanDetails`, `depositDetails`, `currentRate`, and `agentMetrics` hydrate synchronously from cache in 0ms on mount.
  3. `payease-frontend-mobile-web-fixed/src/AdminPanel.jsx` (L1052-L1155):
     - `unwrapCachedArray()` applied to `stats`, `pending`, `users`, `loans`, `bonds`, `agents`, `devices`, `notifications`.
     - `cachedAdminFetch` (L105-L125) falls back to cached data on network timeout/offline instead of failing with 504.

### Update B: App Close / Exit Snapshotting (`saveSnapshot`)
- **Problem Solved**: When user minimized the app, locked the screen, or swiped the app away, state updates in RAM were not guaranteed to be written to disk.
- **Exact Locations**:
  1. `payease-frontend-mobile-web-fixed/src/Dashboard.jsx` (L2932-L2978):
     - Synchronous `localStorage.setItem()` for `balance`, `cachedProfitBalance`, `userProfile`, `txns`, `loans`, `bonds`, `profitHistory`, `activeLoanDetails`, `depositDetails`, `currentRate`, `agentMetrics`.
     - Attached to `pagehide`, `beforeunload`, and `visibilitychange` (fires when `document.visibilityState === "hidden"`).
  2. `payease-frontend-mobile-web-fixed/src/AdminPanel.jsx` (L2665-L2705):
     - Synchronous snapshot for `stats`, `pending`, `users`, `loans`, `bonds`, `agents`.

### Update C: AES-256-GCM Photo Encryption at Rest
- **Problem Solved**: KYC photos (Aadhaar front/back, PAN, Signature, User photo) were stored unencrypted.
- **Exact Locations**:
  1. `payease-backend-fixed/utils/crypto.js`:
     - Standard AES-256-GCM authenticated encryption with format: `enc2::<iv_hex>::<auth_tag_hex>::<ciphertext_hex>`.
     - Backward compatible: automatically falls back to decrypting legacy ciphertexts (`enc::...`) or passes plain text through.
  2. `payease-backend-fixed/routes/loan.js` (L680, L1724):
     - Incoming loan document base64 payloads are encrypted with `encryptData()` before persisting to MongoDB.
  3. `payease-backend-fixed/scripts/encrypt_all_existing_docs.js`:
     - Database migration script that migrated all 33 legacy plaintext documents to `enc2::`.

### Update D: On-Demand KYC Photo Loading (Lightweight APIs)
- **Problem Solved**: High payload size (30MB+ JSON) causing network lag and rate limiting when listing all loans or users.
- **Exact Locations**:
  1. `payease-backend-fixed/routes/loan.js` (`/loan/all`):
     - Stripped heavy base64 strings from loan list; replaced with boolean flags (`hasAadhaarFront`, etc.).
  2. `payease-backend-fixed/routes/admin.js` (`GET /admin/user/:id/kyc-docs`):
     - Unified endpoint that fetches and decrypts photos ONLY when the admin clicks/opens that specific user's ID modal.
  3. `payease-backend-fixed/routes/bootstrap.js` (L180-L195) & `payease-backend-fixed/routes/user.js` (L155-L170):
     - Decrypts photos for the authenticated user's own profile so the mobile dashboard renders their avatar and docs correctly.

### Update E: Lightbox Fullscreen & Zoom
- **Problem Solved**: Document previews appeared behind other cards/modals.
- **Exact Locations**:
  1. `payease-frontend-mobile-web-fixed/src/Dashboard.jsx` (L11700+):
     - Container styled with `z-[9999999]` fixed inset, with pinch/click zoom controls.
  2. `payease-frontend-mobile-web-fixed/src/AdminPanel.jsx` (L14300+):
     - Same `z-[9999999]` styling. Item 4 Google Drive button was permanently removed per user request.

---

## 4. Critical Rules & Guardrails ("DO NOT TOUCH")

1. **DO NOT Re-introduce Asynchronous Queuing in `CacheManager.js`**:
   - Never wrap `localStorage.setItem()` in `requestIdleCallback` or `setTimeout`. Small JSON writes (<50KB) take <0.05ms and MUST be synchronous to survive Android WebView swiping.
2. **DO NOT Touch AES-256-GCM Format**:
   - The prefix `enc2::` and the 16-byte IV + 16-byte GCM tag format in `payease-backend-fixed/utils/crypto.js` must remain untouched. Any change will corrupt user photo decryption.
3. **DO NOT Return Unwrapped Arrays Where `{ data }` Is Expected or Vice-Versa**:
   - Always use `unwrapCachedArray(val)` when reading lists from storage or cache.
4. **DO NOT Bypass `loadBootstrap` in Dashboard**:
   - The `/bootstrap/pulse` endpoint returns a ~100-byte signature `sig`. The UI only fetches the full bootstrap if `sig` changed or if 3 minutes have passed. Keep this pulse signature lightweight.
5. **DO NOT Break the Desktop Zip Script**:
   - Whenever updating code, run `powershell.exe -ExecutionPolicy Bypass -File "C:\Users\suppo\.gemini\antigravity\brain\4ea81f71-d89e-42a0-a602-2800e3cae92e\scratch\pack_desktop_zip.ps1"` to update `C:\Users\suppo\OneDrive\Desktop\educa_full_project_clean.zip`.

---

## 5. Storage Keys Reference

| Key Name | Storage Type | Content / Shape |
| :--- | :--- | :--- |
| `educa_cached_profile` | localStorage + IDB | User profile object |
| `educa_cached_balance` | localStorage + IDB | Number (stringified in localStorage) |
| `educa_cached_profit_balance`| localStorage + IDB | Number |
| `educa_cached_txns` | localStorage + IDB | Array of transaction objects |
| `educa_cached_loans` | localStorage + IDB | Array of loan applications |
| `educa_cached_bonds` | localStorage + IDB | Array of active bond holdings |
| `educa_cached_profit_history`| localStorage + IDB | Array of daily yield credits |
| `educa_cached_active_loan` | localStorage + IDB | Active loan details (`hasActiveLoan`, EMI, dues) |
| `educa_cached_deposit_details`| localStorage + IDB | Admin UPI, bank name, IFSC, account number |
| `educa_cached_current_rate` | localStorage + IDB | Interest rate number (default: 12) |
| `educa_cached_agent_metrics`| localStorage + IDB | Agent metrics object |
| `educa_admin_cached_stats` | localStorage + IDB | Admin platform totals, reserves, profit |
| `educa_admin_cached_pending_list` | localStorage + IDB | Array of pending deposits & withdrawals |
| `educa_admin_cached_users_list` | localStorage + IDB | Array of all registered users |
| `educa_admin_cached_loans_list` | localStorage + IDB | Array of all loan applications |
| `educa_admin_cached_bonds_list` | localStorage + IDB | Array of all platform bonds |
| `educa_admin_cached_agents_list` | localStorage + IDB | Array of agent applications |
