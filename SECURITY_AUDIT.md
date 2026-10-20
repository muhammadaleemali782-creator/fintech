# Educa Fintech: Audit + Fixes (Oct 2026)

Scope: backend (Node/Express/Mongo), web frontend (React/Vite), Android WebView app.
Ye code padh ke kiya gaya review hai. Maine app chalaya nahi, load-test nahi kiya, aur Android/Vite build nahi chala sake (offline sandbox). Neeche "Verify kaise karein" section zaroor follow karna.

---

## 1. Sabse pehle tumhe KHUD karna hai (main code se fix nahi kar sakta)

| # | Kaam | Kyun |
|---|------|------|
| 1 | **Mongo Atlas passwords (dono DB: MONGO_URI aur MESSAGES_MONGO_URI), JWT_SECRET, ADMIN_PASSWORD, MAIL_API_KEY sab rotate karo** | Zip me asli `.env` files thi (root wali me `NODE_ENV=production`). `SECURITY_FIXES.md` #1 kehta hai hata di gayi, par hataai nahi thi. Zip kahin bhi share hui ho (chat, GitHub, WhatsApp) to leak maan lo. |
| 2 | JWT_SECRET badalne se sab users logout honge. Ye theek hai | Naya secret: `node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"` |
| 3 | Render me `ENCRYPTION_KEY` (naya random) aur `LEGACY_ENCRYPTION_KEY` (= purana JWT_SECRET) set karo, **phir** JWT_SECRET rotate karo | Abhi `server.js` ENCRYPTION_KEY ko JWT_SECRET pe fallback karta hai. JWT leak = KYC data decrypt. Pehle LEGACY set karoge to purana data readable rahega |
| 4 | Android keystore + uske passwords (build.gradle.kts me plain text the) | Agar `.jks` file bhi leak hui to sirf password badalna kaafi nahi, kyunki attacker ke paas file ki copy hai. Naya keystore banao. Sideloaded APK users ko reinstall karna padega. Is zip me `.jks` hata di hai, apni original copy safe rakho |
| 5 | **Cloudflare R2 bucket private karo** (neeche finding H2) | Aadhaar/PAN images public URL pe hain |
| 6 | Render free tier ke liye external uptime pinger (UptimeRobot, 5 min) ya paid plan | Raat 10 se subah 10 baje server so jata hai, subah pehla user 30-50s cold start dekhta hai (white screen / "data nahi aaya") |
| 7 | Kaunsi `vercel.json` deploy hoti hai check karo | Sirf `payease-frontend-mobile-web-fixed/vercel.json` me CSP + security headers hain. Root wali me nahi |

---

## 2. "App me fresh data nahi aa raha + lag" ka asli reason

Website pe ye isliye kam dikhta hai kyunki desktop fast hai. Phone + WebView + slow network pe ye sab saath me bigad jata hai.

| # | Bug | Jagah | Fix |
|---|-----|-------|-----|
| 1 | **`headers` har render pe naya object** -> `loadBootstrap` -> `silentSyncAll` har render pe naye -> sync `useEffect` har render ke baad dobara chalta tha -> `/bootstrap/user` lagataar baar baar | `Dashboard.jsx` (`const headers = ...`) | `useMemo([token])` + sync engine ref-based, effect ek hi baar |
| 2 | `setSecondsToNext` **har 1 second** state update = 13,000 line wala Dashboard har second re-render (asli lag) | `Dashboard.jsx` ticker | Hata diya (badge me seconds dikhte hi nahi the) |
| 3 | `isSyncingRef` lock request freeze hone pe 60s x 3 try = ~190s tak atka rehta tha, tab resume/timer refresh sab skip | `silentSyncAll` | 30s watchdog + force refresh on resume, timeout 45s, 1 retry |
| 4 | IndexedDB load startup ke baad **purana data memory me overwrite** kar deta tha, network ke fresh data ke upar | `CacheManager.js` | Sirf naya/missing entry likhta hai |
| 5 | Bootstrap **raw loan document** ko `activeLoanDetails` me daalta tha, jabki UI `/loan/active-details` ka shape (`hasActiveLoan`, `loan`, `nextInstallment`) maangta hai. Loan close hone pe bhi kabhi clear nahi hota tha | `loadBootstrap` | Rich endpoint se load, aur loan na ho to clear |
| 6 | 429 (rate limit) silently ignore + fallback me 6 aur requests (aur bura) | `smartFetch` / `silentSyncAll` | 429 pe ruko, fan-out nahi |
| 7 | Rate limit **per IP 1500/15min**. Jio/Airtel CGNAT me hazaaron users ek IP share karte hain, plus bug #1 ka request flood = "Too many requests" = purana data | `server.js` | Per-user bucket (900/15min) + loose per-IP safety net (6000) |
| 8 | Android WebView background me JS timers pause; resume pe refresh trigger nahi | `MainActivity.onResume` | `focus` event dispatch, Dashboard turant refresh karta hai |
| 9 | Do native loops (10s push service + 15s poller) **same endpoint** ko hit karte the, har hit pe DB `save()` | Android + `devices.js` | 30s / 45s, aur server pe sirf lightweight `updateOne` |
| 10 | `GET /bootstrap/user` har poll pe **EMI auto-debit (money write)** + 8 queries chalata tha | `bootstrap.js` | EMI max 2 min me ek baar per user |

### Naya lightweight route: `GET /api/bootstrap/pulse`
- Response ~100 bytes: sirf ek `sig` (hash of balance, profit, dues, KYC, latest 8 txns, pending count, loans/bonds status).
- App har **20s** pulse puchta hai. `sig` badla tabhi full `/bootstrap/user` download hota hai. Safety net: har 3 min me full refresh, app open/resume pe hamesha full.
- Agent role ke liye `?role=agent` alag sig.
- Agar backend purana ho aur frontend naya, to app har tick full bootstrap pe girta hai (kaam karta hai, bas heavy). Isliye **pehle backend deploy karo**.

---

## 3. Security findings

### Critical
| ID | Finding | Status |
|----|---------|--------|
| C1 | Asli `.env` (Atlas creds, JWT, admin pwd) zip me | Files hata di. **Rotate karna tumhara kaam (section 1)** |
| C2 | Release keystore + passwords source me, aur APK public `/public/*.apk` se bat raha hai | Passwords source se hata ke gradle.properties/env pe shift. **Naya keystore tumhara kaam** |
| C3 | WebView `onReceivedSslError -> proceed()` (vercel/onrender): Wi-Fi/proxy pe MITM se login, PIN, paise sab padha/badla ja sakta tha | **Fixed** (cancel) |
| C4 | WebView koi bhi URL load karta tha aur `AndroidDevice`/`AndroidBiometric`/`AndroidNotification` bridges har page ko milte the | **Fixed**: sirf educafintech hosts andar, baaki system browser me |

### High
| ID | Finding | Status |
|----|---------|--------|
| H1 | Rate limit per-IP + CGNAT = innocent users block (aur stale data) | **Fixed** |
| H2 | KYC (Aadhaar/PAN/cheque) files R2 ke **public URL** pe. `encryptData` sirf URL string encrypt karta hai, file nahi. R2 fail ho to base64 Mongo me chala jata hai (user payload MBs ka) | **Not fixed** (migration chahiye). Plan: bucket private, server se short-lived signed URL, aur R2 fail pe upload reject karo, base64 fallback nahi |
| H3 | `ENCRYPTION_KEY` fallback JWT_SECRET (SECURITY_FIXES #7 ke khilaf) | Warning log add; behaviour wahi (purana data na toote). **Section 1 #3 follow karo** |
| H4 | Device routes: `requireParentAuth` sirf `jwt.verify` karta tha (blocked / force-logout / deleted user bhi chala leta); koi bhi command string queue ho jati thi; koi bhi device kisi bhi command ko ack kar sakta tha; admin panel ko `deviceToken` + `pinHash` bhej diye jate the | **Fixed**: full `protect`, command whitelist, ack sirf apna, secrets select se hataye, constant-time compare, `crypto.randomInt` pairing code |

### Medium / Low
| ID | Finding | Status |
|----|---------|--------|
| M1 | Regex injection / ReDoS: admin activity-log, admin agent search, loan borrower search, loan-department search | **Fixed** (`escapeRegex`) |
| M2 | Public `POST /loan/query` unlimited + unvalidated, seedha admin notification feed me | **Fixed**: 10/hr limiter + length caps |
| M3 | `scripts/wipe_all_data.js` bina confirm ke chal jata tha | **Fixed**: production pe refuse + `--confirm-wipe-all-data` flag |
| M4 | Android `allowBackup=true`, `usesCleartextTraffic=true`, mixed content allow, `allowFileAccess`, BootReceiver exported, debug build release key se sign | **Fixed** |
| M5 | Crash handler har crash pe app relaunch karta tha (crash loop) | **Fixed**: 15s guard |
| M6 | Signup me `gmail.com -> educa.com` rewrite aur email verification nahi: koi bhi kisi bhi naam ka educa.com account claim kar sakta hai | **Not changed** (product decision). Email/OTP verify add karna chahiye |
| M7 | Login: bcrypt sirf existing user pe chalta hai (timing) aur lockout message batata hai ki account exist karta hai | Not changed (low) |
| M8 | Token `localStorage` me (+ cookie). XSS hua to chori | Not changed (already tracked in SECURITY_FIXES). CSP (frontend vercel.json) isko kam karta hai |
| M9 | Aadhaar number DB me plain text, money `Number` float | Not changed (migration, pehle se SECURITY_FIXES me listed) |
| M10 | `public/` me 3 APK (same size, shayad same file): v1, v2, latest | Not changed. Ek hi rakho, baaki hatao |
| M11 | `AdminPanel.jsx` ~15.8k lines, `Dashboard.jsx` ~13.3k lines | Not changed. Split karoge to render/lag aur kam hoga |

### Dhyan dene wali baat (behaviour change)
Android `registerDeviceUser` ab login token bhejta hai. Pehle server route `protect` maangta tha aur app token bhejta hi nahi tha, to **device registration + FCM token sync asal me fail ho raha tha**. Fix ke baad ye kaam karega, matlab `isUninstallProtected` / Device Admin wala feature bhi actually active ho sakta hai. Ye "app uninstall nahi ho sakta" wali capability hai, to ensure karo ki user ko clear consent screen mile, uninstall ka rasta saaf ho, aur Play Store Device Admin policy + RBI digital lending guidelines ke hisaab se theek ho.

---

## 4. Jo review me cover nahi hua
Deep line-by-line nahi padha: `routes/admin.js` (3.6k), `routes/loan.js` (2.6k), `routes/user.js`, `routes/bond.js`, `AdminPanel.jsx`, `StaffDesk.jsx`. Inme money logic hai, iska alag review karwao (specially concurrency, role/permission checks). Pattern-scan kiya: unprotected routes, mass-assignment, eval, regex, secret logging. `AdminPanel` aur `AgentDesk` me `headers` already memoised the, `StaffDesk` me `headers` pattern nahi mila.

---

## 5. Deploy order
1. Secrets rotate (section 1) -> Render env update.
2. **Backend** deploy (naya `/bootstrap/pulse` pehle chahiye).
3. **Frontend** deploy (Vercel).
4. Naya **APK** build: `~/.gradle/gradle.properties` me `EDUCA_KEYSTORE_FILE`, `EDUCA_KEYSTORE_PASSWORD`, `EDUCA_KEY_ALIAS`, `EDUCA_KEY_PASSWORD`. Purane installed apps ko web fixes automatically mil jate hain (WebView site load karta hai). Native fixes (SSL, URL guard, device register) ke liye naya APK chahiye.

## 6. Verify kaise karein
- Chrome DevTools (ya `chrome://inspect` WebView) -> Network: `/bootstrap/pulse` har ~20s, chhota response. `/bootstrap/user` sirf open/resume pe, ya jab data badla ho, ya 3 min safety net pe.
- Admin se kisi user ka balance badlo -> user app ~20s me update hona chahiye bina reopen ke.
- Phone ko background me 2 min chhod ke wapas kholo -> turant refresh.
- Loan close karo -> Active loan card hat jana chahiye.
- Render logs me `SLOW API` lines aur 429 count dekho.
- Tests: `crypto` (6) aur `bondSettings` (11) pass hue. Baaki tests ko `npm ci && npm test` se chalao (yaha `node_modules` nahi the).

## 7. Files badli
Backend: `server.js`, `routes/{bootstrap,devices,admin,loan,loanDepartmentCommission}.js`, `models/{Device,DeviceCommand}.js`, `utils/security.js` (new), `scripts/wipe_all_data.js`.
Frontend: `src/Dashboard.jsx`, `src/utils/CacheManager.js`.
Android: `MainActivity.kt`, `EducaPushService.kt`, `RemoteCommandPoller.kt`, `AndroidManifest.xml`, `app/build.gradle.kts`, `.gitignore`.
Hataya: dono `.env`, `educa-release.jks`, `local.properties`.
