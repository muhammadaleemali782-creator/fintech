// Pehla admin account banane ke liye script.
// Kyun zaroori hai: register route (routes/auth.js) hamesha role: 'user' hi
// banata hai -- app me koi bhi API route nahi hai jo kisi user ko admin bana
// sake (ye jaan-bujh kar hai, taaki koi API se khud ko admin na bana sake).
// Isliye pehla admin bootstrap karne ke liye ye standalone script chalana
// padta hai, jo .env me diye ADMIN_EMAIL / ADMIN_PASSWORD use karta hai.
//
// Usage:
//   node scripts/createAdmin.js
//   (ya)  npm run seed:admin
//
// .env me ye values honi chahiye:
//   ADMIN_EMAIL=admin@yourdomain.com
//   ADMIN_PASSWORD=<ek strong password>
//
// Agar us email ka user already exist karta hai, to script use safely
// 'admin' role me upgrade kar degi (password nahi badlega). Agar exist nahi
// karta, to naya admin user bana degi.

require('dotenv').config();
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const User = require('../models/User');

async function run() {
  const { MONGO_URI, ADMIN_EMAIL, ADMIN_PASSWORD } = process.env;

  if (!MONGO_URI) {
    console.error('❌ MONGO_URI .env me set nahi hai.');
    process.exit(1);
  }
  if (!ADMIN_EMAIL || !ADMIN_PASSWORD) {
    console.error('❌ ADMIN_EMAIL aur ADMIN_PASSWORD dono .env me set karo, phir dobara chalao.');
    process.exit(1);
  }
  if (ADMIN_PASSWORD.length < 8) {
    console.error('❌ ADMIN_PASSWORD kam se kam 8 characters ki honi chahiye.');
    process.exit(1);
  }

  await mongoose.connect(MONGO_URI);
  console.log('✅ MongoDB se connect ho gaya');

  try {
    const existing = await User.findOne({ email: ADMIN_EMAIL.toLowerCase() });

    if (existing) {
      if (existing.role === 'admin') {
        console.log(`ℹ️  ${ADMIN_EMAIL} already admin hai. Kuch nahi kiya.`);
      } else {
        existing.role = 'admin';
        await existing.save();
        console.log(`✅ ${ADMIN_EMAIL} ko admin bana diya gaya (password same rahega).`);
      }
      return;
    }

    const hashed = await bcrypt.hash(ADMIN_PASSWORD, 12);
    await User.create({
      name: 'Admin',
      email: ADMIN_EMAIL.toLowerCase(),
      phone: '0000000000',
      password: hashed,
      role: 'admin'
    });
    console.log(`✅ Naya admin account ban gaya: ${ADMIN_EMAIL}`);
    console.log('   Ab isi email/password se /admin panel me login kar sakte ho.');
  } finally {
    await mongoose.connection.close();
  }
}

run().catch(err => {
  console.error('❌ Admin seed fail ho gaya:', err.message);
  process.exit(1);
});
