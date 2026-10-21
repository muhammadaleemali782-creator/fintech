const User = require('../models/User');
const Transaction = require('../models/Transaction');
const Settings = require('../models/Settings');
const Notification = require('../models/Notification');
const { creditAgentCommission } = require('./agentCommission');

/**
 * Fetch 5k Deposit Referral & 30-Day Holding Settings
 */
async function getDepositHoldingSettings() {
  const doc = await Settings.findOne({ key: 'agentDepositReferral' }).lean();
  return doc?.value || {
    enabled: true,
    minDepositAmount: 5000,
    holdingDays: 30,
    flatRewardAmount: 100, // Flat reward amount in rupees (Admin configurable)
    description: 'Agent Flat Reward on ₹5,000 maintained for 30 Days (One-Time Payout)'
  };
}

/**
 * Triggered on Deposit Approval:
 * Starts the 30-day holding period if balance reaches ₹5,000 and user was referred by an agent.
 * Rule: ONE TIME ONLY per user.
 */
async function handleDepositHoldingStart(user, depositAmount, session) {
  try {
    if (!user || !user.referredBy) return;
    // Rule: One-time only per referred user
    if (user.referral5kBonusPaid) return;
    if (user.depositHolding5k?.active || user.depositHolding5k?.completed) return;

    const settings = await getDepositHoldingSettings();
    if (settings.enabled === false) return;

    const minAmount = Number(settings.minDepositAmount) || 5000;
    const currentBal = Number(user.balance) || 0;

    // Check if user balance satisfies min requirement
    if (currentBal >= minAmount) {
      const holdingDays = Number(settings.holdingDays) || 30;
      const flatReward = Number(settings.flatRewardAmount) || 100;
      const startDate = new Date();
      const maturityDate = new Date(startDate.getTime() + (holdingDays * 24 * 60 * 60 * 1000));

      user.depositHolding5k = {
        active: true,
        startDate,
        maturityDate,
        qualifyingAmount: minAmount,
        rewardAmount: flatReward,
        referredAgentId: user.referredBy,
        completed: false,
        completedAt: null,
        bonusPaid: false,
        broken: false,
        brokenAt: null
      };

      await user.save(session ? { session } : {});

      // Notify the referring Agent about the holding countdown
      await Notification.create([{
        userId: user.referredBy,
        targetRole: 'user',
        type: 'general',
        title: '30-Day ₹5,000 Holding Started ⏳',
        message: `Aapke referred customer ${user.name || 'Customer'} ne ₹${minAmount.toLocaleString('en-IN')} balance reach kiya hai. Agar yeh balance 30 din tak maintain rehta hai, to aapko flat ₹${flatReward} instant cash reward milega (One-Time).`,
        data: {
          customerId: user._id.toString(),
          customerName: user.name,
          startDate,
          maturityDate,
          flatReward
        }
      }], session ? { session } : {});
    }
  } catch (err) {
    console.error('handleDepositHoldingStart error:', err);
  }
}

/**
 * Triggered on Balance Deduction (Withdrawal, Transfer, Loan Repayment):
 * If user drops below ₹5,000 BEFORE the 30 days are completed, the holding is broken.
 * (Once completed, user can drop below ₹5,000 without penalty).
 */
async function handleBalanceDeductionHoldingCheck(user, newBalance, session) {
  try {
    if (!user || !user.depositHolding5k?.active) return;
    if (user.depositHolding5k.completed) return; // 30 din ke baad kam ho to koi dikkat nahi

    const minAmount = Number(user.depositHolding5k.qualifyingAmount) || 5000;
    if (Number(newBalance) < minAmount) {
      user.depositHolding5k.active = false;
      user.depositHolding5k.broken = true;
      user.depositHolding5k.brokenAt = new Date();

      await user.save(session ? { session } : {});

      // Notify agent that holding was broken
      if (user.depositHolding5k.referredAgentId) {
        await Notification.create([{
          userId: user.depositHolding5k.referredAgentId,
          targetRole: 'user',
          type: 'general',
          title: '30-Day Holding Incomplete ⚠️',
          message: `Aapke referred customer ${user.name || 'Customer'} ka balance ₹${minAmount.toLocaleString('en-IN')} se kam ho gaya hai, isliye 30-day holding reset ho gayi hai.`,
          data: {
            customerId: user._id.toString(),
            customerName: user.name
          }
        }], session ? { session } : {});
      }
    }
  } catch (err) {
    console.error('handleBalanceDeductionHoldingCheck error:', err);
  }
}

/**
 * Checks all mature holdings and releases the flat reward to Agents.
 * Runs on cron or activity pulse.
 */
async function checkAndReleaseDepositHoldingCommissions() {
  try {
    const now = new Date();
    // Find all users whose 30-day holding has reached maturity date, active, not completed, not bonus paid
    const usersToMature = await User.find({
      'depositHolding5k.active': true,
      'depositHolding5k.completed': false,
      'depositHolding5k.maturityDate': { $lte: now },
      referral5kBonusPaid: { $ne: true }
    });

    for (const user of usersToMature) {
      const minAmount = Number(user.depositHolding5k.qualifyingAmount) || 5000;
      const currentBal = Number(user.balance) || 0;
      const agentId = user.depositHolding5k.referredAgentId || user.referredBy;

      // Verify that balance is still maintained at maturity
      if (currentBal >= minAmount && agentId) {
        const reward = Number(user.depositHolding5k.rewardAmount) || 100;

        // Atomically credit Agent
        const credited = await creditAgentCommission(agentId, reward, 'deposit');

        if (credited) {
          user.depositHolding5k.completed = true;
          user.depositHolding5k.completedAt = now;
          user.depositHolding5k.bonusPaid = true;
          user.referral5kBonusPaid = true; // Permanent one-time flag

          await user.save();

          // Create transaction for Agent
          await Transaction.create({
            userId: agentId,
            type: 'referral_bonus',
            amount: reward,
            method: 'system',
            status: 'completed',
            sourceWallet: 'deposit',
            referenceId: user._id.toString(),
            remarks: `30-Day ₹5,000 Maintenance Flat Reward for referred customer ${user.name} (One-Time Payout)`
          });

          // Send congratulations notification to Agent
          await Notification.create({
            userId: agentId,
            targetRole: 'user',
            type: 'general',
            title: '30-Day ₹5,000 Reward Credited! 🎉',
            message: `Badhai ho! Aapke referred customer ${user.name} ne 30 days tak ₹${minAmount.toLocaleString('en-IN')} maintain kiya. Aapka flat ₹${reward} cash bonus wallet me credit ho gaya hai (One-Time Payout).`,
            data: {
              customerId: user._id.toString(),
              customerName: user.name,
              rewardAmount: reward,
              completedAt: now
            }
          });
        }
      } else if (currentBal < minAmount) {
        // Balance fell below threshold at the maturity check
        user.depositHolding5k.active = false;
        user.depositHolding5k.broken = true;
        user.depositHolding5k.brokenAt = now;
        await user.save();
      }
    }
  } catch (err) {
    console.error('checkAndReleaseDepositHoldingCommissions error:', err);
  }
}

module.exports = {
  getDepositHoldingSettings,
  handleDepositHoldingStart,
  handleBalanceDeductionHoldingCheck,
  checkAndReleaseDepositHoldingCommissions
};
