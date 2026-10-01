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

// Root redirect to live frontend
app.get('/', (req, res) => {
  res.redirect('https://educafintech.vercel.app');
});

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
app.use('/api/bond', require('./routes/bond'));
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
  const Transaction = require('./models/Transaction');

  async function runYieldForAllUsers() {
    console.log('⏰ Daily yield run started:', new Date().toISOString());
    try {
      // Only process users with balance > 0
      const users = await User.find({ balance: { $gt: 0 }, isBlocked: { $ne: true } })
        .select('_id balance lowestBalance24h lastYieldCalculatedAt profitBalance interestRate');

      let credited = 0;
      for (const user of users) {
        try {
          const now = new Date();
          if (!user.lastYieldCalculatedAt) {
            user.lastYieldCalculatedAt = now;
            user.lowestBalance24h = user.balance;
            await user.save();
            continue;
          }

          const msDiff = now.getTime() - new Date(user.lastYieldCalculatedAt).getTime();
          const msInDay = 24 * 60 * 60 * 1000;
          const days = Math.floor(msDiff / msInDay);
          if (days < 1) continue;

          const cappedDays = Math.min(days, 30);
          const minBal = Math.max(0, user.lowestBalance24h || user.balance || 0);
          const annualRate = (user.interestRate || 12) / 100;
          const monthlyRate = annualRate / 12;
          const calcFromDate = new Date(user.lastYieldCalculatedAt);

          let totalYield = 0;
          for (let d = 0; d < cappedDays; d++) {
            const calcDate = new Date(calcFromDate.getTime() + d * msInDay);
            const daysInMonth = new Date(calcDate.getFullYear(), calcDate.getMonth() + 1, 0).getDate();
            totalYield += minBal * (monthlyRate / daysInMonth);
          }
          totalYield = Number(totalYield.toFixed(2));

          if (totalYield > 0) {
            const periodKey = `yield_${user._id}_${calcFromDate.toISOString().slice(0, 10)}`;
            const alreadyCredited = await Transaction.findOne({ referenceId: periodKey });
            if (!alreadyCredited) {
              const newBalance = Number(((user.balance || 0) + totalYield).toFixed(2));
              await User.findByIdAndUpdate(user._id, {
                $inc: { balance: totalYield, profitBalance: totalYield },
                lastYieldCalculatedAt: new Date(calcFromDate.getTime() + cappedDays * msInDay),
                lowestBalance24h: newBalance
              });
              await Transaction.create({
                userId: user._id,
                type: 'daily_yield',
                amount: totalYield,
                method: 'internal',
                status: 'completed',
                referenceId: periodKey,
                remarks: `Daily Savings Yield (${(monthlyRate * 100).toFixed(2)}% monthly on ₹${minBal.toLocaleString('en-IN')} for ${cappedDays} day${cappedDays > 1 ? 's' : ''})`
              });
              credited++;
            }
          }
        } catch (e) {
          console.error(`Yield error for user ${user._id}:`, e.message);
        }
      }
      console.log(`✅ Daily yield done: ${credited} users credited`);
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
