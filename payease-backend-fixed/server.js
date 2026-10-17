require('dotenv').config();

// Forward errors thrown/rejected inside async route handlers to the Express error middleware
// (Express 4 does not do this by itself -> the request used to hang until timeout).
require('express-async-errors');

// ------------------ GLOBAL CRASH HANDLING ------------------
// uncaughtException = the process is in an unknown state. For a payments app it is SAFER to log
// and restart (Render/PM2 restarts automatically) than to keep serving with possibly broken state.
// All money moves use atomic DB operations/transactions, so a restart can never leave half-done transfers.
process.on('uncaughtException', (err) => {
  console.error('💥 Uncaught Exception - shutting down so the platform can restart cleanly:', err);
  setTimeout(() => process.exit(1), 500);
});
// An unhandled rejection from a fire-and-forget task (mail sync, notifications...) is logged, not fatal.
process.on('unhandledRejection', (reason) => {
  console.error('⚠️ Unhandled Promise Rejection:', reason);
});

const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const helmet = require('helmet');
const compression = require('compression');
const mongoSanitize = require('express-mongo-sanitize');
const hpp = require('hpp');
const rateLimit = require('express-rate-limit');
const slowDown = require('express-slow-down');
const { acquireLock } = require('./utils/lock');

// ------------------ REQUIRED ENV VAR CHECK ------------------
// Production me agar koi zaroori .env value missing hui, to server
// turant clear error ke saath band ho jayega -- baad me confusing
// runtime bug dhundne se accha hai abhi hi pakad lena
const requiredEnvVars = ['PORT', 'MONGO_URI', 'JWT_SECRET'];
const missingVars = requiredEnvVars.filter(v => !process.env[v]);
if (missingVars.length > 0) {
  console.error(`❌ Missing required environment variables: ${missingVars.join(', ')}`);
  console.error('   .env file check karo (.env.example dekho reference ke liye)');
  process.exit(1);
}
if (process.env.JWT_SECRET.length < 32) {
  console.error('❌ JWT_SECRET kam se kam 32 characters ki honi chahiye (production security ke liye)');
  console.error('   Generate karo: node -e "console.log(require(\'crypto\').randomBytes(32).toString(\'hex\'))"');
  process.exit(1);
}

// KYC documents encryption key: fallback cleanly to JWT_SECRET if hosting environment (Render) hasn't set ENCRYPTION_KEY
if (!process.env.ENCRYPTION_KEY) {
  process.env.ENCRYPTION_KEY = process.env.JWT_SECRET;
}


const app = express();

// Agar Render/Vercel/Nginx jaise reverse proxy ke peeche deploy ho, to
// real client IP sahi milta hai (rate-limiter ke liye zaroori)
app.set('trust proxy', 1);

// ------------------ HIGH-PRECISION RESPONSE TIME PROFILER ------------------
app.use((req, res, next) => {
  const startHr = process.hrtime();
  res.on('finish', () => {
    const [seconds, nanoseconds] = process.hrtime(startHr);
    const durationMs = ((seconds * 1000) + (nanoseconds / 1e6)).toFixed(1);
    try {
      if (!res.headersSent) res.setHeader('X-Response-Time', `${durationMs}ms`);
    } catch {}
    if (Number(durationMs) > 300 && req.originalUrl?.startsWith('/api')) {
      console.warn(`⚡ [SLOW API ${durationMs}ms] ${req.method} ${req.originalUrl} (${res.statusCode})`);
    }
  });
  next();
});

// ------------------ SPEED (compression) ------------------
// Har response ko gzip karke bhejta hai -> data kam, site fast
app.use(compression());

// ------------------ NATIVE COOKIE PARSER (Stdlib, zero new dependencies) ------------------
app.use((req, res, next) => {
  req.cookies = {};
  const cookieHeader = req.headers.cookie;
  if (cookieHeader) {
    cookieHeader.split(';').forEach(c => {
      const [key, ...v] = c.split('=');
      if (key) {
        try {
          req.cookies[key.trim()] = decodeURIComponent(v.join('=').trim() || '');
        } catch {
          req.cookies[key.trim()] = v.join('=').trim() || '';
        }
      }
    });
  }
  next();
});

// ------------------ SECURITY HEADERS (Helmet + CSP) ------------------
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'", 'https://educafintech.vercel.app'],
      scriptSrc: ["'self'", 'https://cdn.jsdelivr.net'], // API serves JSON only: no inline scripts
      styleSrc: ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com'],
      fontSrc: ["'self'", 'https://fonts.gstatic.com', 'data:'],
      imgSrc: ["'self'", 'data:', 'blob:', 'https:'],
      connectSrc: [
        "'self'",
        'https://educafintech.vercel.app',
        'https://*.render.com',
        'https://*.mongodb.net',
        'wss:'
      ],
      objectSrc: ["'none'"],
      upgradeInsecureRequests: [],
    },
  },
  crossOriginResourcePolicy: { policy: 'cross-origin' },
  xXssProtection: true,
  xContentTypeOptions: true,
  referrerPolicy: { policy: 'strict-origin-when-cross-origin' },
}));

// ------------------ CORS (TIGHTENED WHITELIST) ------------------
const envClients = (process.env.CLIENT_URL || '').split(',').map(s => s.trim()).filter(Boolean);
const allowedOriginList = [
  'https://educafintech.vercel.app',
  'http://localhost:5173',
  'http://localhost:3000',
  'http://localhost:5000',
  ...envClients
];

function isOriginAllowed(origin) {
  if (!origin) return true; // Android WebView, curl, server-to-server have no Origin header
  if (allowedOriginList.includes(origin)) return true;
  // Allow only genuine educafintech vercel preview subdomains (never any arbitrary .vercel.app)
  if (/^https:\/\/educafintech(-[a-z0-9-]+)?\.vercel\.app$/.test(origin)) return true;
  return false;
}

app.use(cors({
  origin: function (origin, callback) {
    if (isOriginAllowed(origin)) {
      callback(null, true);
    } else {
      callback(new Error('Blocked by CORS policy: ' + origin));
    }
  },
  credentials: true
}));

// ------------------ CSRF PROTECTION (Origin verification on state-changing requests) ------------------
app.use((req, res, next) => {
  if (['POST', 'PUT', 'DELETE', 'PATCH'].includes(req.method)) {
    const origin = req.headers.origin;
    if (origin && !isOriginAllowed(origin)) {
      return res.status(403).json({ message: 'Cross-site request blocked (CSRF protection)' });
    }
  }
  next();
});

// ------------------ BODY PARSER ------------------
// Body size limits: 1 MB everywhere by default (stops unauthenticated 25 MB request floods).
// The 25 MB limit (base64 KYC / proof / QR images) applies only to the upload endpoints below
// AND only when the request carries credentials.
// Multi-document uploads (several base64 images per request): 25 MB.
const BIG_BODY_PREFIXES = [
  '/api/user/kyc', '/api/user/update', '/api/user/custom-qr',
  '/api/loan', '/api/bond',
  '/api/transaction/deposit', '/api/transaction/withdraw'
];
// Admin/settings only carry a single evidence image (each file is capped at 5 MB by validateUpload): 10 MB.
const MEDIUM_BODY_PREFIXES = ['/api/settings', '/api/admin'];
const smallJson = express.json({ limit: '1mb' });
const mediumJson = express.json({ limit: '10mb' });
const bigJson = express.json({ limit: '25mb' });
app.use((req, res, next) => {
  const hasCredentials = Boolean(req.headers.authorization || (req.cookies && req.cookies.token));
  if (!hasCredentials) return smallJson(req, res, next);
  if (BIG_BODY_PREFIXES.some(p => req.path.startsWith(p))) return bigJson(req, res, next);
  if (MEDIUM_BODY_PREFIXES.some(p => req.path.startsWith(p))) return mediumJson(req, res, next);
  return smallJson(req, res, next);
});
app.use(express.urlencoded({ extended: true, limit: '1mb' }));

// ------------------ NoSQL INJECTION PROTECTION ------------------
// Request body/query/params me se $ aur . operators sanitize karta hai
app.use(mongoSanitize({ replaceWith: '_' }));

// ------------------ HTTP PARAMETER POLLUTION PROTECTION ------------------
app.use(hpp());

// ------------------ RATE LIMITING (STRICT & SPECIFIC) ------------------
// General Rate Limiter: Protects against DOS/flooding without breaking normal dashboard polling
const generalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 1500,
  standardHeaders: true,
  legacyHeaders: false,
  skip: (req) => {
    const url = req.originalUrl || req.url || '';
    return url.includes('/health') || url.includes('/notifications/stream');
  },
  message: { message: 'Too many requests, please slow down.' }
});
app.use('/api/', generalLimiter);

// Auth Limiter: Brute-force protection on login / register
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: 'Too many login attempts. Please try again after 15 minutes.' }
});
app.use('/api/auth/login', authLimiter);
app.use('/api/auth/register', authLimiter);
app.use('/api/auth/mail-login', authLimiter);

// Forgot Password Limiter: Anti-spam & email bombing protection
const forgotPasswordLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: 'Too many password reset requests. Please try again after 1 hour.' }
});
app.use('/api/auth/forgot-password', forgotPasswordLimiter);

// Password Reset Limiter: Anti-brute-force on token verification
const resetPasswordLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: 'Too many password reset attempts. Please try again after 15 minutes.' }
});
app.use('/api/auth/reset-password', resetPasswordLimiter);

// PIN Verification & Reset Limiter: Protects wallet PIN against brute-forcing
const pinLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: 'Too many PIN attempts. Locked for 15 minutes.' }
});
app.use('/api/user/pin/verify', pinLimiter);
app.use('/api/user/pin/reset', pinLimiter);
app.use('/api/user/pin/set', pinLimiter);

// Sensitive Account Mutation Limiter
const sensitiveAuthLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 15,
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: 'Too many password change attempts. Please wait 15 minutes.' }
});
app.use('/api/auth/change-password', sensitiveAuthLimiter);
app.use('/api/user/change-password', sensitiveAuthLimiter);

// Device pairing: stops brute-forcing of short pairing codes
const pairingLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: 'Too many pairing attempts. Please try again after 15 minutes.' }
});
app.use('/v1/pairing/redeem', pairingLimiter);
app.use('/api/v1/pairing/redeem', pairingLimiter);

// Financial Transaction Limiter: Protects money transfers & withdrawals from spam/race conditions
const txLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 60,
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: 'Transaction rate limit reached. Please wait a few moments.' }
});
app.use('/api/transaction/transfer', txLimiter);
app.use('/api/transaction/withdraw', txLimiter);
app.use('/api/transaction/deposit', txLimiter);

// Recipient lookup limiter: stops harvesting of names/accounts by trying many identifiers
const lookupLimiter = rateLimit({
  windowMs: 5 * 60 * 1000,
  max: 40,
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: 'Too many lookups. Please slow down.' }
});
app.use('/api/transaction/lookup', lookupLimiter);

// Root redirect to live frontend
app.get('/', (req, res) => {
  res.redirect('https://educafintech.vercel.app');
});

// ------------------ HEALTH CHECK (hosting platform isse check karta hai ki server zinda hai) ------------------
app.get(['/health', '/api/health'], (req, res) => {
  res.json({
    status: 'ok',
    dbConnected: mongoose.connection.readyState === 1
  });
});

// Disable Express ETag so client fetch() always receives complete 200 OK JSON bodies
app.set('etag', false);

// ------------------ FRESH LIVE DATA (PREVENTS STALE BROWSER CACHE) ------------------
// Mobile browsers and PWAs must never serve stale HTTP responses for API queries
app.use('/api', (req, res, next) => {
  res.set('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
  res.set('Pragma', 'no-cache');
  res.set('Expires', '0');
  next();
});

// ------------------ ROUTES ------------------
app.use('/api/bootstrap', require('./routes/bootstrap'));
app.use('/api/auth', require('./routes/auth'));
app.use('/api/user', require('./routes/user'));
app.use('/api/transaction', require('./routes/transaction'));
app.use('/api/loan', require('./routes/loan'));
app.use('/api/loans', require('./routes/loan'));
app.use('/api/admin', require('./routes/admin'));
app.use('/api/settings', require('./routes/settings'));
app.use('/api/bond', require('./routes/bond'));
app.use('/v1', require('./routes/devices'));
app.use('/api/v1', require('./routes/devices'));
app.use('/api/fcm', require('./routes/fcm'));

// ------------------ 404 HANDLER ------------------
app.use((req, res) => {
  res.status(404).json({ message: 'Route not found' });
});

app.use((err, req, res, next) => {
  if (process.env.NODE_ENV === 'production') {
    console.error(`⚠️ Server Error [${req.method} ${req.path}]: ${err.message || 'Internal error'}`);
  } else {
    console.error(err.stack);
  }
  res.status(err.status || 500).json({ message: err.status ? err.message : 'Something went wrong. Please try again.' });
});

// ------------------ DB CONNECTION (CONNECTION POOLING OPTIMIZED) ------------------
mongoose.connect(process.env.MONGO_URI, {
  maxPoolSize: 25,
  minPoolSize: 2,
  serverSelectionTimeoutMS: 30000,
  socketTimeoutMS: 60000,
  connectTimeoutMS: 30000,
  maxIdleTimeMS: 60000
})
  .then(() => {
    console.log('✅ MongoDB Connected with Connection Pooling');
    scheduleDailyYield(); // Start daily yield processor after DB is ready
  })
  .catch(err => {
    console.error('❌ MongoDB connection failed:', err.message);
    // DB ke bina payment app chalana khatarnak hai -> server hi band kar do
    process.exit(1);
  });

// ------------------ DAILY YIELD SCHEDULER ------------------
// Midnight IST (18:30 UTC) pe sab active users ka daily profit credit karta hai
// Even if user never logs in — server-side cron without external dependency
function scheduleDailyYield() {
  const User = require('./models/User');
  const { processDailyYield } = require('./routes/user');

  async function runYieldForAllUsers() {
    // Cluster-safe: with several instances (or a restart at midnight) only ONE runs the job per IST day
    const istDay = new Date(Date.now() + 5.5 * 60 * 60 * 1000).toISOString().slice(0, 10);
    let gotLock = false;
    try { gotLock = await acquireLock(`yield-cron:${istDay}`, 20 * 60 * 60 * 1000); } catch (_) {}
    if (!gotLock) {
      console.log(`⏰ Daily yield for ${istDay} already handled by another run - skipping`);
      return;
    }
    console.log('⏰ Daily 24h yield & phone notification run started:', new Date().toISOString());
    try {
      const { distribute24hYieldAndNotifyAll } = require('./utils/yieldNotifier');
      const result = await distribute24hYieldAndNotifyAll();
      console.log(`✅ Daily yield complete: ${result.processedCount} users processed, ${result.notificationsSent} notifications sent`);
    } catch (e) {
      console.error('Daily yield scheduler error:', e.message);
    }
  }

  // Run at next midnight IST (UTC+5:30 = UTC 18:30)
  function msUntilNextMidnightIST() {
    const now = new Date();
    const istOffset = 5.5 * 60 * 60 * 1000; // IST = UTC + 5:30
    const istNow = new Date(now.getTime() + istOffset);
    const istMidnight = new Date(istNow);
    istMidnight.setUTCHours(0, 0, 0, 0); // next midnight IST = 18:30 UTC prev day
    istMidnight.setUTCDate(istMidnight.getUTCDate() + 1);
    return istMidnight.getTime() - now.getTime() - istOffset; // ms until 00:00 IST
  }

  // Scheduled to run precisely at midnight IST (once every 24 hours)
  const delay = Math.max(0, msUntilNextMidnightIST());
  console.log(`⏰ Daily yield scheduled in ${Math.round(delay / 3600000)}h`);
  setTimeout(() => {
    runYieldForAllUsers();
    setInterval(runYieldForAllUsers, 24 * 60 * 60 * 1000); // every 24h after first run
  }, delay);
}



const server = app.listen(process.env.PORT, () => {
  console.log(`🚀 Server running on port ${process.env.PORT} [${process.env.NODE_ENV || 'development'}]`);
});

// ------------------ RENDER KEEP-ALIVE PING (10:00 AM - 10:00 PM IST ONLY) ------------------
// Free-tier quota protection: Only keep alive between 10:00 AM and 10:00 PM IST.
// Raat bhar (10:00 PM se 10:00 AM IST) ping band rahega taaki Render monthly hours na khtm hon.
const PING_BASE_URL = process.env.RENDER_EXTERNAL_URL || 'https://educafintech.onrender.com';
if (process.env.NODE_ENV === 'production') setInterval(() => {
  const now = new Date();
  const istHours = new Date(now.getTime() + (5.5 * 60 * 60 * 1000)).getUTCHours();
  if (istHours >= 10 && istHours < 22) {
    fetch(`${PING_BASE_URL}/api/health`)
      .then(r => r.json())
      .catch(err => {
        if (process.env.NODE_ENV === 'production') {
          console.warn('💓 Keep-alive ping notice:', err.message);
        }
      });
  }
}, 10 * 60 * 1000); // 10 minutes

// ------------------ GRACEFUL SHUTDOWN ------------------
// Jab hosting platform deploy/restart karta hai, to ye pehle se chal
// rahi requests ko poora hone deta hai, phir band hota hai -- taaki
// beech me kisi user ka transaction/payment adhoora na kate
function shutdown(signal) {
  console.log(`\n${signal} received. Shutting down gracefully...`);
  server.close(() => {
    mongoose.connection.close(false, () => {
      console.log('✅ Server and DB connections closed.');
      process.exit(0);
    });
  });
  // Agar 10 second me graceful shutdown na ho, to force band karo
  setTimeout(() => process.exit(1), 10000);
}
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
