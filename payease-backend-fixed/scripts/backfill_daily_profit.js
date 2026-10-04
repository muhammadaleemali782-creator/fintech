const path = require('path');
const mongoose = require(path.join(__dirname, '..', 'node_modules', 'mongoose'));
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });
const uri = process.env.MONGO_URI || 'mongodb+srv://placeholder_user:placeholder_password@cluster0.example.mongodb.net/paymentdb?retryWrites=true&w=majority';

async function backfillDailyProfits() {
  await mongoose.connect(uri);
  console.log('✅ Connected to MongoDB');

  const User = mongoose.model('User', new mongoose.Schema({}, { strict: false }));
  const Transaction = mongoose.model('Transaction', new mongoose.Schema({}, { strict: false }));

  // Find users who have approved deposits
  const deposits = await Transaction.find({ type: 'deposit', status: 'approved' }).sort({ createdAt: 1 });
  console.log(`Found ${deposits.length} approved deposits.`);

  const userIds = [...new Set(deposits.map(d => d.userId.toString()))];

  for (const uid of userIds) {
    const user = await User.findById(uid);
    if (!user) continue;

    console.log(`\nProcessing user: ${user.name} (${user.email}), current balance: ₹${user.balance}, profit: ₹${user.profitBalance}`);

    // Earliest deposit date
    const firstDeposit = deposits.find(d => d.userId.toString() === uid);
    const depositDate = new Date(firstDeposit.createdAt);
    console.log(`First deposit date: ${depositDate.toISOString()}`);

    const now = new Date();
    const msInDay = 24 * 60 * 60 * 1000;

    // Loop day-by-day starting 1 day after deposit until now
    let currentDate = new Date(depositDate.getTime() + msInDay);
    let totalNewlyAddedYield = 0;
    let newlyCreatedCount = 0;

    while (currentDate <= now) {
      const dateStr = currentDate.toISOString().slice(0, 10);
      const periodKey = `yield_${user._id}_${dateStr}`;

      // Check if already credited for this date
      const existing = await Transaction.findOne({ referenceId: periodKey });

      const daysInMonth = new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 0).getDate();
      const annualRate = (user.interestRate || 12) / 100;
      const monthlyRate = annualRate / 12;
      const dailyRate = monthlyRate / daysInMonth;

      // Principal amount deposited
      const principal = 600000; // Total deposit by Anand
      const dayYield = Number((principal * dailyRate).toFixed(2));

      // Format date for remarks (e.g. "27 Sep 2026")
      const formattedDateStr = currentDate.toLocaleDateString('en-IN', {
        day: '2-digit',
        month: 'short',
        year: 'numeric'
      });

      if (!existing) {
        await Transaction.create({
          userId: user._id,
          type: 'daily_yield',
          amount: dayYield,
          method: 'internal',
          status: 'completed',
          referenceId: periodKey,
          remarks: `Daily Savings Yield: ₹${dayYield.toFixed(2)} profit for ${formattedDateStr} (12% p.a. on ₹${principal.toLocaleString('en-IN')})`,
          createdAt: new Date(currentDate)
        });

        totalNewlyAddedYield += dayYield;
        newlyCreatedCount++;
        console.log(`  ➕ Added yield for ${dateStr} (${formattedDateStr}): ₹${dayYield}`);
      } else {
        console.log(`  ℹ️ Already exists for ${dateStr}: ₹${existing.amount}`);
      }

      // Advance by 1 day
      currentDate = new Date(currentDate.getTime() + msInDay);
    }

    // Now recalculate total profit balance from ALL daily_yield transactions for this user
    const allUserYields = await Transaction.find({ userId: user._id, type: 'daily_yield' });
    const totalYieldInDb = Number(allUserYields.reduce((sum, t) => sum + (t.amount || 0), 0).toFixed(2));

    console.log(`\nUser ${user.name}:`);
    console.log(`- Newly created yield transactions: ${newlyCreatedCount}`);
    console.log(`- Total yield across all transactions in DB: ₹${totalYieldInDb}`);

    // Update user: base principal + all yield
    const basePrincipal = 600000;
    const finalBalance = Number((basePrincipal + totalYieldInDb).toFixed(2));

    await User.findByIdAndUpdate(user._id, {
      balance: finalBalance,
      profitBalance: totalYieldInDb,
      lowestBalance24h: finalBalance,
      lastYieldCalculatedAt: new Date()
    });

    console.log(`- Updated balance: ₹${finalBalance}`);
    console.log(`- Updated profitBalance: ₹${totalYieldInDb}`);
    console.log(`- Updated lowestBalance24h: ₹${finalBalance}`);
  }

  console.log('\n🎉 Backfill completed successfully!');
  await mongoose.disconnect();
}

backfillDailyProfits().catch(console.error);
