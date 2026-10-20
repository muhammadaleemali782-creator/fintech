const mongoose = require('mongoose');
require('dotenv').config();

const User = require('../models/User');
const Transaction = require('../models/Transaction');
const Loan = require('../models/Loan');
const Bond = require('../models/Bond');
const Notification = require('../models/Notification');
const Device = require('../models/Device');
const DeviceAlert = require('../models/DeviceAlert');
const DeviceCommand = require('../models/DeviceCommand');

// ---------------------------------------------------------------------------
// SAFETY GUARD: this script DELETES every non-admin user + all money data.
// It refuses to run against production and needs an explicit --confirm flag.
// ---------------------------------------------------------------------------
if (process.env.NODE_ENV === 'production') {
  console.error('Refusing to wipe: NODE_ENV=production. Use a separate dev database.');
  process.exit(1);
}
if (!process.argv.includes('--confirm-wipe-all-data')) {
  console.error('This will DELETE ALL DATA in the database from MONGO_URI.');
  console.error('Re-run with:  node scripts/wipe_all_data.js --confirm-wipe-all-data');
  process.exit(1);
}

async function wipeDatabase() {
  try {
    console.log('Connecting to MongoDB...');
    await mongoose.connect(process.env.MONGO_URI);
    console.log('✅ Connected to MongoDB');

    // 1. Delete all non-admin users
    const userDelResult = await User.deleteMany({ role: { $ne: 'admin' } });
    console.log(`🗑️ Deleted ${userDelResult.deletedCount} non-admin users`);

    // 2. Reset admin user balances to 0
    const adminUpdate = await User.updateMany(
      { role: 'admin' },
      {
        $set: {
          balance: 0,
          lowestBalance24h: 0,
          profitBalance: 0,
          duesBalance: 0,
          loansCount: 0,
          'wallets.savings.balance': 0,
          'wallets.debit.balance': 0,
          'wallets.lending.balance': 0
        }
      }
    );
    console.log(`✅ Reset ${adminUpdate.modifiedCount} admin balance(s) to 0`);

    // 3. Delete all transactions
    const txnDelResult = await Transaction.deleteMany({});
    console.log(`🗑️ Deleted ${txnDelResult.deletedCount} transactions`);

    // 4. Delete all loans
    const loanDelResult = await Loan.deleteMany({});
    console.log(`🗑️ Deleted ${loanDelResult.deletedCount} loans`);

    // 5. Delete all bonds
    const bondDelResult = await Bond.deleteMany({});
    console.log(`🗑️ Deleted ${bondDelResult.deletedCount} bonds`);

    // 6. Delete all notifications
    const notifDelResult = await Notification.deleteMany({});
    console.log(`🗑️ Deleted ${notifDelResult.deletedCount} notifications`);

    // 7. Delete all devices, alerts, commands
    const devDel = await Device.deleteMany({});
    const alertDel = await DeviceAlert.deleteMany({});
    const cmdDel = await DeviceCommand.deleteMany({});
    console.log(`🗑️ Deleted ${devDel.deletedCount} devices, ${alertDel.deletedCount} alerts, ${cmdDel.deletedCount} commands`);

    // Check remaining
    const remainingUsers = await User.find({}).select('name email role balance');
    console.log('\n--- FRESH DATABASE STATE ---');
    console.log('Remaining Users in DB:', remainingUsers);
    console.log('Remaining Transactions:', await Transaction.countDocuments());
    console.log('Remaining Loans:', await Loan.countDocuments());
    console.log('Remaining Bonds:', await Bond.countDocuments());
    console.log('----------------------------\n');

    process.exit(0);
  } catch (err) {
    console.error('❌ Wipe failed:', err);
    process.exit(1);
  }
}

wipeDatabase();
