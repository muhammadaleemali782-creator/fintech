# Security & stability fixes (review round 1)

| # | Problem | Fix | Files |
|---|---|---|---|
| 1 | Real `.env` (DB passwords, JWT secret…) inside the zip | Removed from project, `.env.example` rewritten, root `.gitignore` added. **You must still rotate all those secrets.** | `backend/.env*`, `.gitignore` |
| 2 | Profit→wallet transfer could be replayed in parallel (money multiplied) | Single atomic `findOneAndUpdate` with balance guard | `routes/user.js` |
| 2b | Yield credit could be applied twice / overwrite concurrent changes | Compare-and-set on `lastYieldCalculatedAt` + `$inc` | `routes/user.js` |
| 2c | EMI auto-debit could charge the same installment twice | Per-user DB lock + atomic debit + refund if loan save fails | `routes/loan.js` |
| 3 | Unlimited PIN guesses | 5 wrong PINs ⇒ 30 min lock (transfer, verify, reset). Login: 10 wrong ⇒ 15 min lock | `utils/lockout.js`, `routes/*` |
| 3b | `/pin/reset` accepted ANY Aadhaar if none on file, and a 1-digit phone suffix | Requires Aadhaar from KYC, phone must match last 10 digits | `routes/user.js` |
| 4 | `uncaughtException` swallowed | Log + exit (platform restarts); async route errors now reach error middleware | `server.js` |
| 5 | Float money | Writes now round to paise & atomic `$inc`. (Schema still `Number` – see notes) | – |
| 6 | Mail-server SSO overwrote local passwords | SSO can only create new accounts | `routes/auth.js` |
| 7 | AES-CBC, hardcoded fallback key, key tied to JWT_SECRET | AES-256-GCM, mandatory `ENCRYPTION_KEY` in prod, old data still readable | `utils/cryptoHelper.js` |
| 8 | 25 MB body limit on every endpoint | 1 MB default; 25 MB only for authenticated upload routes | `server.js` |
| 9 | Daily yield cron could run twice / on several instances | DB lock per IST day | `server.js` |
| 10 | Lookup revealed full phone numbers, unlimited | Phone masked, rate-limited | `routes/transaction.js`, `server.js` |
| 11 | SSE login token in URL, CORS reflected any origin | 60 s one-purpose ticket, reconnect with fresh ticket, reflection removed | `routes/admin.js`, `AdminPanel.jsx`, `StaffDesk.jsx` |
| 12 | `verifyAuthToken` not pinned, token-version check skippable | Pinned HS256, strict version check | `utils/token.js`, `middleware/auth.js` |
| 13 | Transfer de-duplication in process memory | MongoDB lock | `routes/transaction.js` |
| 14 | Yield notification claimed money that was never credited | Notify only real credits | `utils/yieldNotifier.js` |
| 15 | No tests / CI / README / engines | Added | `tests/`, `.github/`, `README.md`, `package.json` |

## Not changed (needs a bigger decision)
* Money is still stored as `Number` (not integer paise / Decimal128) – changing the schema needs a data migration.
* Aadhaar number is still stored in plain text in MongoDB.
* Login token still lives in `localStorage` (88 usages across the frontend) next to the cookie.
* `AdminPanel.jsx` (~15k lines) and `Dashboard.jsx` (~13k lines) are not split up.
* `gmail.com → educa.com` email rewrite kept as is (product behaviour).
