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

// ------------------ SECURITY HEADERS ------------------
app.use(helmet());

// ------------------ CORS (sirf apni frontend domain allow) ------------------
const allowedOrigins = (process.env.CLIENT_URL || 'http://localhost:5173').split(',').map(s => s.trim());
app.use(cors({
  origin: function (origin, callback) {
    if (!origin || allowedOrigins.includes('*') || allowedOrigins.includes(origin) || (origin && origin.includes('.vercel.app'))) {
      callback(null, true);
    } else {
      callback(new Error('Not allowed by CORS: ' + origin));
    }
  },
  credentials: true
}));

// ------------------ BODY PARSER (size limit chhota rakha, bade payload attack se bachne ke liye) ------------------
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true, limit: '1mb' }));

// ------------------ NoSQL INJECTION PROTECTION ------------------
// Request body/query/params me se $ aur . operators nikal deta hai
// (MongoDB injection jaise { "email": { "$gt": "" } } se bachata hai)
app.use(mongoSanitize());

// ------------------ HTTP PARAMETER POLLUTION PROTECTION ------------------
app.use(hpp());

// ------------------ GENERAL RATE LIMIT (bot / flooding protection) ------------------
// Har IP se 15 min me max 100 request -> uske baad block
const generalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: 'Too many requests, please try again after some time.' }
});
app.use('/api/', generalLimiter);

// ------------------ SLOW DOWN (bot/script tarah tarah repeated request bhejein to unhe artificially slow kar deta hai) ------------------
const speedLimiter = slowDown({
  windowMs: 15 * 60 * 1000,
  delayAfter: 50,       // pehle 50 request normal speed
  delayMs: () => 500     // uske baad har request 500ms slow
});
app.use('/api/', speedLimiter);

// ------------------ STRICT LIMIT sirf LOGIN/REGISTER pe (brute-force / credential-stuffing bot attack se bachne ke liye) ------------------
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 8, // 15 min me sirf 8 login/register attempt per IP
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: 'Too many login attempts. Please try again after 15 minutes.' }
});
app.use('/api/auth', authLimiter);

// ------------------ HEALTH CHECK (hosting platform isse check karta hai ki server zinda hai) ------------------
app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    dbConnected: mongoose.connection.readyState === 1
  });
});

// ------------------ ROUTES ------------------
app.use('/api/auth', require('./routes/auth'));
app.use('/api/user', require('./routes/user'));
app.use('/api/transaction', require('./routes/transaction'));
app.use('/api/loan', require('./routes/loan'));
app.use('/api/admin', require('./routes/admin'));
app.use('/api/settings', require('./routes/settings'));
app.use('/v1', require('./routes/devices'));
app.use('/api/v1', require('./routes/devices'));

// ------------------ 404 HANDLER ------------------
app.use((req, res) => {
  res.status(404).json({ message: 'Route not found' });
});

// ------------------ GLOBAL ERROR HANDLER (stack trace client ko leak nahi hoga) ------------------
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(err.status || 500).json({ message: 'Something went wrong. Please try again.' });
});

// ------------------ DB CONNECTION ------------------
mongoose.connect(process.env.MONGO_URI)
  .then(() => console.log('✅ MongoDB Connected'))
  .catch(err => {
    console.error('❌ MongoDB connection failed:', err.message);
    // DB ke bina payment app chalana khatarnak hai -> server hi band kar do
    process.exit(1);
  });

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
