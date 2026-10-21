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

### Update F: 30ms Live Ticker Speedup
- **Problem Solved**: Profit, reserves, and ledger yield numbers were updating slowly at 1000ms/250ms intervals.
- **Exact Locations**:
  1. `payease-frontend-mobile-web-fixed/src/AdminPanel.jsx` (L389, L456, L501, L521):
     - `LiveAdminProfitTicker`: Timer changed from 1000ms to 30ms.
     - `LiveAdminReservesTicker`: Timer changed from 1000ms to 30ms.
     - `LiveLedgerDailyAdded`: Timer changed from 1000ms to 30ms.
     - `useSharedLiveClock`: Clock interval changed from 250ms to 30ms.
     - Preserved 3-second debounce before writing to `localStorage` to avoid storage lockup.

### Update G: Department Commission Removal
- **Problem Solved**: Redundant Department Commission tab and cards in Admin Panel, while all commission controls are already unified inside Loan Settings (`LoanSettingsPage.jsx`).
- **Exact Locations**:
  1. `payease-frontend-mobile-web-fixed/src/AdminPanel.jsx`:
     - Removed `deptCommissions` and `loadingCommissions` state (~L1200).
     - Removed `tab === "dept-commission"` effect listener (~L2752).
     - Removed `loadDeptCommissions` and `handleUpdateDeptCommission` helper functions (~L3562).
     - Removed `{ key: "dept-commission", label: "Department Commission" }` from `tabs` array (~L3783).
     - Deleted full `{tab === "dept-commission" && ...}` card grid JSX (~L14064).

### Update H: Profit & Capital Growth Chart Redesign (Img 4 & 5)
- **Problem Solved**: 16+ days crowded together on mobile screens, resulting in overlapping badges ("₹43.. ₹353..") and a completely illegible horizontal blue smear of "Accrued ₹..." under dates.
- **Exact Locations**:
  1. `payease-frontend-mobile-web-fixed/src/AdminPanel.jsx` (L1200, L5370-L5850):
     - Added `chartRange` state defaulting to `"5d"` (4-5 days default as requested).
     - Added compact, minimal range selector pills `[5D | 7D | 15D | All]` in chart header next to `[Daily Yield | Cumulative]`.
     - Filtered data slice: `chartRange === "5d" ? rawData.slice(-5) : ...`.
     - Generous ~132px slot width in 5D mode guarantees zero badge collisions and zero date collisions.
     - Permanently removed colliding `Accrued ₹...` floor text smear.
     - Dynamic collision guard: in ranges > 7 days, floating value badges only render for hovered and latest items.
     - Polished bottom summary strip with high-contrast day profit, cumulative yield, and total capital figures.

### Update I: 30ms Zero-Lag DOM Ref Acceleration, Precision Scaling for Low Balances, Removal of Custom APY Card Items, Today Filter Default, and Tab Background Isolation
- **Problem Solved**:
  1. Button clicks delayed and double tapping on Users & Accounts; mobile sidebar freeze caused by `useSharedLiveClock` running 30ms interval with React state `setNow()`, producing 800+ React Virtual DOM re-renders/second across user list rows.
  2. Low balances (e.g. ₹1) yielded very small numbers that didn't visually advance under 4-decimal formatting.
  3. Mobile user card contained redundant `Custom Interest APY: 12% p.a.` and bottom sub-strip `APY: 12% p.a. ≈ ₹0.0000/hr` inside `24H Expected Yield`.
  4. Both Admin Panel analytics views needed a "Today" filter as the default range.
  5. Background interval sync and window resume were firing requests across inactive tabs.
- **Exact Locations**:
  1. `payease-frontend-mobile-web-fixed/src/AdminPanel.jsx` (L353-L585):
     - Replaced React state tickers in `LiveAdminProfitTicker`, `LiveAdminReservesTicker`, `LiveLedgerDailyAdded`, and `LiveUserProfitCell` with direct DOM ref updates (`spanRef.current.textContent = ...`) throttled to 30ms with `requestAnimationFrame`. React Virtual DOM re-renders dropped from 800+/sec to 0/sec on idle, resolving all button response lag and screen freezes.
     - Deleted `useSharedLiveClock`, `__liveClockSubs`, and `__liveClockTimer`.
     - Added dynamic precision scaling in `LiveUserProfitCell` (`bal < 10 ? 10 : bal < 100 ? 9 : ...`), guaranteeing that even a ₹1 balance visually ticks up every 30ms.
  2. `payease-frontend-mobile-web-fixed/src/AdminPanel.jsx` (L10309-L10410):
     - Removed `Custom Interest APY: 12% p.a.` and unlock buttons from the mobile user card.
     - Removed the bottom sub-strip (`APY: 12% p.a. ≈ ₹0.0000/hr`) from the `24H Expected Yield` card.
  3. `payease-frontend-mobile-web-fixed/src/AdminPanel.jsx` (L1288, L1566, L5470, L5540, L5870, L6104, L6296):
     - Added `"today"` range filter option and made it the default selection for `chartRange`.
     - Added `visibleLedgerData` to `Day-by-Day Profit Breakdown Ledger` with a compact range filter `[Today | 5D | 7D | 15D | All]` defaulting to Today.
     - Defaulted `capitalTimeFilter` to `"today"` in Capital Desk analytics.
  4. `payease-frontend-mobile-web-fixed/src/AdminPanel.jsx` (L2866-L2905):
     - Tab-isolated background sync: only fetches/updates data for the active operational tab (`tab === "pending"`, `tab === "analytics"`, `tab === "capital"`, etc.).

---

### Update J: Desktop Users & Accounts Table Complete Redesign & Realignment
- **Problem Solved**:
  1. Desktop Users & Accounts table suffered severe vertical misalignment (`align-top` on varying-height cells, causing jagged rows and floating badges).
  2. Redundant per-row "Locked (5)" button was cluttering every single row in the APY column (lock is centrally controlled in the header pill).
  3. Customer details were unstyled raw stacked text with zero visual hierarchy or avatar.
  4. Card tier rendered as a broken stacked card with a chunky yellow button.
  5. Action buttons were bloated full-width buttons taking excessive vertical height.
- **Exact Locations**:
  1. `payease-frontend-mobile-web-fixed/src/AdminPanel.jsx` (L9928-L10260):
     - **Vertical Alignment**: Standardized every single `<td>` to `align-middle py-3.5 px-3/4` for uniform row baseline.
     - **Customer & Account**: Added subtle gradient initial avatar circle (`BS`, `AG`) + bold high-contrast customer name + role badge (Agent/Staff) + monospace A/C pill + phone/email with icons.
     - **KYC Verification**: Modern status badge (`✓ Verified`, `⏳ Pending`, `✕ Rejected`) + inline `📄 View Docs` button + monospace UID.
     - **Interest APY**: Single clean badge `12% p.a.` when locked (removed redundant per-row "Locked" toggle). Switches to inline input + Save button when unlocked via header.
     - **Card Tier & VIP**: Replaced yellow block with `👑 PLATINUM (VIP)` with subtle `Revoke VIP` link, or `SILVER (0/4)` with sleek `Unlock VIP` button.
     - **Wallets & Capital**: Clean rounded dot badges for wallets, high-contrast monospace active capital figures, structured 24h yield & 30ms live accrual cells.
     - **Actions**: Structured primary button (`Block` / `Unblock`) + clean secondary buttons (`🔑 Pass` / `👥 Desk`).

---

### Update K: Capital Growth Audit Trail Removal, 0ms Optimistic VIP Toggles, Global Blue Progress Bar, & Excel Icons
- **Problem Solved**:
  1. User requested removing "Capital Growth Audit Trail" from AdminPanel Profit & Reserves tab in both website and app.
  2. Mobile user Card Tier button (Unlock VIP / Revoke) was delayed and unresponsive due to waiting for slow round-trip network response and `loadUsers(true)` before updating UI state.
  3. App was missing a visible top progress indicator during user actions to communicate background activity.
  4. Mobile KYC requests list had an empty box for the 1-click Excel export button because the icon was missing and text was hidden on small screens.
- **Exact Locations**:
  1. `payease-frontend-mobile-web-fixed/src/AdminPanel.jsx` (L5940-L6060):
     - Deleted the entire "Capital Growth Audit Trail" card (70 lines of dead JSX).
     - Expanded "Capital Allocation & Sources" to full width (`w-full`).
  2. `payease-frontend-mobile-web-fixed/src/AdminPanel.jsx` (L3180-L3360, L10313-L10345):
     - Added 0ms optimistic UI updates to `toggleUserCard`, `toggleBlock`, and `toggleUninstallLock` via `setUsers(prev => ...)`, providing instant visual feedback upon tapping.
     - Redesigned mobile Card Tier control with sleek `👑 PLATINUM (VIP)` badge + Revoke link, or `Silver (Unlock VIP)` button with tactile `active:scale-95` touch feedback.
  3. `payease-frontend-mobile-web-fixed/src/components/ui/TopProgressBar.jsx` (L35-L95):
     - Added global fetch interceptor to trigger the 3px blue/cyan glowing progress bar at the top of the viewport (`z-[99999999]`) during all foreground network actions across both website and app, ignoring silent `/pulse` sync.
  4. `payease-frontend-mobile-web-fixed/src/AdminPanel.jsx` (L8050-L8065, L8170-L8180):
     - Added green spreadsheet Excel SVG icon and visible "Excel" label to both mobile KYC user cards and the bulk export toolbar.

---

### Update L: Audit History Refresh Icon & 0ms Instant Hamburger + Mobile Drawer Navigation
- **Problem Solved**:
  1. Audit History header had an empty pill button on mobile next to "Send 24h Profit Alert" due to missing SVG icon and text hidden on small screens.
  2. Hamburger menu button (☰) and drawer navigation buttons were reacting very slowly on mobile because `React.startTransition` deprioritized tab state updates, and the drawer unmounted/mounted on every open/close, causing heavy DOM recreation and touch lag.
- **Exact Locations**:
  1. `payease-frontend-mobile-web-fixed/src/AdminPanel.jsx` (L8368-L8395):
     - Added Refresh SVG icon + visible "Refresh" label to the audit history refresh button.
     - Added Notification Bell SVG icon to "Send 24h Profit Alert".
  2. `payease-frontend-mobile-web-fixed/src/AdminPanel.jsx` (L4345-L4365):
     - Enhanced Hamburger button with crisp 3-bar SVG icon, `touchAction: "manipulation"` (removes mobile 300ms tap delay), and instant `active:scale-90 active:bg-slate-200` feedback.
  3. `payease-frontend-mobile-web-fixed/src/AdminPanel.jsx` (L1114-L1125, L4445-L4535):
     - Removed `React.startTransition` from `switchTab` so `setTab(nextTab)` updates synchronously in 0ms.
     - Converted mobile drawer to persistent GPU hardware-accelerated CSS slide-in (`translate-x-0` vs `-translate-x-full`), eliminating DOM destruction/re-creation overhead.
     - Added `touchAction: "manipulation"` and `active:scale-[0.97]` to all 16 drawer navigation buttons.

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

---

## 6. Update N (2026-10-21): Base ₹5,000 Loan & Agent Profit Visibility Across Loan Settings & Agent Desk

### Problem
- In Loan Settings (`/admin/loan-settings`), the starter ₹5,000 loan amount could not be directly simulated in the Preclose matrix or the Calculator preview.
- In `CommissionSettingsSection.jsx`, agent commissions were only shown as raw percentages (e.g. `2%`), without making it clear what cash payout the agent earns on the entry-level ₹5,000 loan (which is ₹100 @ 2%).
- In `LoanSettingsReadmeModal.jsx`, the reference numerical table only showed ₹10,000 and ₹1,00,000 loans.

### Changes Made
1. **`PrecloseSettingsSection.jsx`**:
   - Added `5000` to the Quick Amount Switcher array: `[5000, 10000, 25000, 50000, 100000]`.
   - Default simulation loan amount set to `5000` so that upon loading, the matrix immediately shows the exact Customer Discount, Agent Profit (Company Paid: ₹25 / ₹50 / ₹75), and Dept Profit for a ₹5,000 loan across 15, 18, 21, and 24 kist tenures.
2. **`CalculatorPreviewSection.jsx`**:
   - Added quick loan amount selector buttons `[5000, 10000, 25000, 50000, 100000]` under `Loan Principal Amount (₹)`.
   - Initial interactive preview set to ₹5,000 loan with proportional interest.
   - Live Agent Profit (Company Paid) card directly reflects the payout on ₹5,000.
3. **`CommissionSettingsSection.jsx`**:
   - In Agent Table under `{baseRate}%`, added explicit rupee badge: `₹{((5000 * baseRate) / 100)} on ₹5k`.
   - Under Dept Net Share, added `₹{((5000 * currentNetRate) / 100)} on ₹5k`.
   - In Rate Change Requests table and Request Modal, added live rupee calculation for ₹5,000 loan.
4. **`LoanSettingsReadmeModal.jsx`**:
   - In Section 4 (Rate & Amount Reference Table), added a dedicated column for `₹5,000 Loan (Base)` displaying Customer Discount, Agent Profit (₹25, ₹50, ₹75), and Dept Profit.
5. **`AgentDesk.jsx`**:
   - Displayed the cash payout on the base ₹5,000 starter loan (e.g. `₹100 on ₹5k`) across Agent Rates & Commission tab and Loan products accordion.
