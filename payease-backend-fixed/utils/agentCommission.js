const User = require('../models/User');

const CATEGORIES = ['loan', 'lending', 'investment', 'bond'];

/**
 * Credit an agent's referral commission ATOMICALLY (single update, no read-modify-write).
 *
 * Replaces the old pattern:
 *     agentUser.balance = Number(((agentUser.balance || 0) + amt).toFixed(2));
 *     await agentUser.save({ session });
 * which could lose updates if the agent's wallet was touched by another request in between.
 *
 * It uses an aggregation-pipeline update so that each field is  round(old + amt, 2)  inside
 * MongoDB itself. That keeps the exact 2-decimal rounding the app always had (no 0.1+0.2
 * float drift piling up in the database) while staying atomic.
 *
 * Updates: balance, profitBalance, referralEarnings and agentProfile.earningsBreakdown.<category>.
 *
 * @param {ObjectId|string} agentId
 * @param {number} amount   rupees, > 0
 * @param {'loan'|'lending'|'investment'|'bond'} category
 * @param {ClientSession} [session]  pass the active transaction session
 * @returns {Promise<boolean>} true if the agent document was updated
 */
async function creditAgentCommission(agentId, amount, category, session) {
  if (!CATEGORIES.includes(category)) {
    throw new Error(`creditAgentCommission: invalid category "${category}"`);
  }
  const amt = Number(Number(amount).toFixed(2));
  if (!Number.isFinite(amt) || amt <= 0) return false;

  const plus = (field) => ({ $round: [{ $add: [{ $ifNull: [field, 0] }, amt] }, 2] });
  const breakdownPath = `agentProfile.earningsBreakdown.${category}`;

  const res = await User.updateOne(
    { _id: agentId },
    [
      {
        $set: {
          balance: plus('$balance'),
          profitBalance: plus('$profitBalance'),
          referralEarnings: plus('$referralEarnings'),
          [breakdownPath]: plus(`$${breakdownPath}`)
        }
      }
    ],
    session ? { session } : {}
  );
  return res.modifiedCount === 1;
}

module.exports = { creditAgentCommission };
