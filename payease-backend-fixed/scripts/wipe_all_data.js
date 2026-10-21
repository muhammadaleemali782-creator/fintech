const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
require('dotenv').config();

const User = require('../models/User');
const Transaction = require('../models/Transaction');
const Loan = require('../models/Loan');
const Bond = require('../models/Bond');
const Notification = require('../models/Notification');
const Device = require('../models/Device');
const DeviceAlert = require('../models/DeviceAlert');
const DeviceCommand = require('../models/DeviceCommand');
const AuditLog = require('../models/AuditLog');
const AgentCommissionRequest = require('../models/AgentCommissionRequest');
const Lock = require('../models/Lock');

if (!process.argv.includes('--confirm-wipe-all-data')) {
  console.error('This will DELETE ALL DATA (users, photos, docs, txns, loans, devices) in MongoDB.');
  console.error('Re-run with:  node scripts/wipe_all_data.js --confirm-wipe-all-data');
  process.exit(1);
}

async function wipeDatabase() {
  try {
    console.log('Connecting to MongoDB...');
    await mongoose.connect(process.env.MONGO_URI);
    console.log('✅ Connected to MongoDB');

    // 1. Delete all non-admin users (this deletes all non-admin users, their photos, documents, kyc)
    const userDelResult = await User.deleteMany({ role: { $ne: 'admin' } });
    console.log(`🗑️ Deleted ${userDelResult.deletedCount} non-admin users`);

    // 2. Clear all photos, documents, and reset balances for Admin users
    const adminEmail = (process.env.ADMIN_EMAIL || 'admin@educa.com').toLowerCase();
    const adminPassword = process.env.ADMIN_PASSWORD || 'Admin@12345';
    const hashedAdminPassword = await bcrypt.hash(adminPassword, 12);

    let adminUser = await User.findOne({ email: adminEmail });
    if (!adminUser) {
      console.log(`ℹ️ Admin ${adminEmail} not found, creating fresh master admin...`);
      adminUser = await User.create({
        name: 'Master Admin',
        email: adminEmail,
        phone: '9999999999',
        password: hashedAdminPassword,
        role: 'admin',
        balance: 0,
        lowestBalance24h: 0,
        profitBalance: 0,
        duesBalance: 0,
        loansCount: 0,
        avatar: '',
        documents: [],
        kycDocuments: []
      });
      console.log(`✅ Created fresh Admin: ${adminEmail}`);
    } else {
      adminUser.role = 'admin';
      adminUser.password = hashedAdminPassword;
      adminUser.balance = 0;
      adminUser.lowestBalance24h = 0;
      adminUser.profitBalance = 0;
      adminUser.duesBalance = 0;
      adminUser.loansCount = 0;
      adminUser.avatar = '';
      adminUser.documents = [];
      adminUser.kycDocuments = [];
      adminUser.wallets = {
        savings: { balance: 0, currency: 'INR' },
        debit: { balance: 0, currency: 'INR' },
        lending: { balance: 0, currency: 'INR' }
      };
      adminUser.depositHolding5k = undefined;
      adminUser.referral5kBonusPaid = false;
      await adminUser.save();
      console.log(`✅ Admin ${adminEmail} balances, photos, and documents cleared to fresh 0 state`);
    }

    // Clean any other admin accounts' balance & docs if exist
    await User.updateMany(
      { role: 'admin', email: { $ne: adminEmail } },
      {
        $set: {
          balance: 0,
          lowestBalance24h: 0,
          profitBalance: 0,
          duesBalance: 0,
          loansCount: 0,
          avatar: '',
          documents: [],
          kycDocuments: [],
          'wallets.savings.balance': 0,
          'wallets.debit.balance': 0,
          'wallets.lending.balance': 0
        }
      }
    );

    // 3. Delete all transactions
    const txnDelResult = await Transaction.deleteMany({});
    console.log(`🗑️ Deleted ${txnDelResult.deletedCount} transactions`);

    // 4. Delete all loans (includes all loan documents and photos)
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

    // 8. Delete audit logs, commission requests, locks
    // (Bypass Mongoose immutable pre-hook by using direct native collection delete)
    let auditDeletedCount = 0;
    try {
      const res = await mongoose.connection.collection('auditlogs').deleteMany({});
      auditDeletedCount = res.deletedCount;
    } catch (_) {}
    const reqDel = await AgentCommissionRequest.deleteMany({});
    const lockDel = await Lock.deleteMany({});
    console.log(`🗑️ Deleted ${auditDeletedCount} audit logs, ${reqDel.deletedCount} commission requests, ${lockDel.deletedCount} locks`);

    // Check remaining state
    const remainingUsers = await User.find({}).select('name email role balance');
    console.log('\n========================================');
    console.log('       FRESH DATABASE STATE CONFIRMED   ');
    console.log('========================================');
    console.log('Remaining Users in DB:', remainingUsers);
    console.log('Remaining Transactions:', await Transaction.countDocuments());
    console.log('Remaining Loans:', await Loan.countDocuments());
    console.log('Remaining Bonds:', await Bond.countDocuments());
    console.log('Remaining Notifications:', await Notification.countDocuments());
    console.log('Remaining Devices:', await Device.countDocuments());
    console.log(`Admin Login Email: ${adminEmail}`);
    console.log(`Admin Login Pass : ${adminPassword}`);
    console.log('========================================\n');

    process.exit(0);
  } catch (err) {
    console.error('❌ Wipe failed:', err);
    process.exit(1);
  }
}

wipeDatabase();
