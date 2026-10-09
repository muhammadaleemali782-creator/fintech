require('dotenv').config();

// ------------------ GLOBAL CRASH SAFETY NET ------------------
// Agar kisi route me galti se try/catch chhoot bhi jaye, to bhi
// poora server crash NAHI hoga -- sirf error log hoga.
// (Isse pehle ek chhoti si bug poori site ko sabke liye down kar sakti thi)
process.on('unhandledRejection', (reason) => {
  console.error('⚠️ Unhandled Promise Rejection:', reason);
});
process.on('uncaughtException', (err) => {
  console.error('⚠️ Uncaught Exception:', err);
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

const app = express();

// Agar Render/Vercel/Nginx jaise reverse proxy ke peeche deploy ho, to
// real client IP sahi milta hai (rate-limiter ke liye zaroori)
app.set('trust proxy', 1);

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
      scriptSrc: ["'self'", "'unsafe-inline'", 'https://cdn.jsdelivr.net'],
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
app.use(express.json({ limit: '25mb' }));
app.use(express.urlencoded({ extended: true, limit: '25mb' }));

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

// PIN Verification Limiter: Protects 6-digit wallet PIN against brute-forcing
const pinLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: 'Too many incorrect PIN attempts. Locked for 15 minutes.' }
});
app.use('/api/user/pin/verify', pinLimiter);

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

// ------------------ FAST 304 & CACHE-CONTROL HEADERS ------------------
// Mobile clients send If-None-Match to receive instant 304 Not Modified (<20ms)
app.use('/api', (req, res, next) => {
  if (req.method === 'GET') {
    res.setHeader('Cache-Control', 'private, no-cache, must-revalidate');
  }
  next();
});

// Render Free Tier Keep-Alive Self Ping (prevents 1-4 min cold start spin down)
const keepAliveUrl = process.env.RENDER_EXTERNAL_URL || 'https://educafintech.onrender.com';
setInterval(() => {
  try {
    const https = require('https');
    https.get(`${keepAliveUrl}/health`, () => {}).on('error', () => {});
  } catch {}
}, 10 * 60 * 1000).unref();

// ------------------ ROUTES ------------------
app.use('/api/auth', require('./routes/auth'));
app.use('/api/user', require('./routes/user'));
app.use('/api/transaction', require('./routes/transaction'));
app.use('/api/loan', require('./routes/loan'));
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

// ------------------ DB CONNECTION ------------------
mongoose.connect(process.env.MONGO_URI)
  .then(() => {
    console.log('✅ MongoDB Connected');
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

  // Run once on startup to catch up any missed daily yields
  runYieldForAllUsers().catch(e => console.error('Initial yield run error:', e.message));

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
