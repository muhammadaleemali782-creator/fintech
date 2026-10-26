const Settings = require('../models/Settings');
const Loan = require('../models/Loan');
const memoryCache = require('./cache');

const POOL_CACHE_KEY = 'loan_dept_pool_dynamic';
const POOL_CACHE_TTL_SECS = 4; // Fast cache TTL for ultra-low latency & fresh data

/**
 * Calculates the dynamic Loan Department Pool.
 *
 * Mathematical Model:
 * 1. Base Pool (`basePool`): Initial capital allocated by Admin (Default ₹10,00,000 / 10 Lakhs).
 * 2. Disbursals (`marketDisbursed`): Principal lent to borrowers.
 *    - Disbursing loans does NOT increase limit. It only locks capital in the market.
 *    - Rejected/Pending loans have 0 impact.
 * 3. Repayments / Recoveries (`earnedSurplus`):
 *    - As borrowers repay installments, fees, penalties, or pre-close loans,
 *      the surplus returned above principal (Interest + Fees + Penalties)
 *      AUTOMATICALLY expands the Loan Department's total lending limit:
 *      totalPool = basePool + earnedSurplus
 * 4. Available Liquidity (`availablePool`):
 *    - availablePool = Math.max(0, totalPool - marketDisbursed)
 */
async function calculateLoanDepartmentPool(options = {}) {
  const { session, forceFresh = false } = options;

  if (!forceFresh && !session) {
    const cached = memoryCache.get(POOL_CACHE_KEY);
    if (cached) return cached;
  }

  // 1. Base capital setting
  let poolSettingQuery = Settings.findOne({ key: 'loanDepartmentPool' });
  if (session) poolSettingQuery = poolSettingQuery.session(session);
  const poolSetting = await poolSettingQuery.lean();
  const basePool = poolSetting ? Number(poolSetting.value) || 1000000 : 1000000;

  // 2. Fetch all loans that actually touched the capital pool (active, approved, closed)
  // Excludes 'rejected' and 'pending'
  let loansQuery = Loan.find({
    status: { $in: ['active', 'approved', 'closed'] }
  }).select('amount totalPayable paidAmount remainingAmount processingFee penaltyPaid status precloseCompanyProfit');

  if (session) loansQuery = loansQuery.session(session);
  const loans = await loansQuery.lean();

  let marketDisbursed = 0;
  let earnedSurplus = 0;
  let totalRecovered = 0;
  let totalPrincipalRepaid = 0;
  let activeLoansCount = 0;
  let closedLoansCount = 0;

  for (const l of loans) {
    const amt = Number(l.amount || 0);
    const payable = Number(l.totalPayable || amt);
    const paid = Number(l.paidAmount || 0);
    const procFee = Number(l.processingFee || 0);
    const penalty = Number(l.penaltyPaid || 0);
    const precloseProfit = Number(l.precloseCompanyProfit || 0);

    if (l.status === 'closed') {
      closedLoansCount += 1;
      const totalPaid = paid > 0 ? paid : payable;
      const totalCollected = totalPaid + penalty + procFee;
      const surplus = precloseProfit > 0 
        ? (precloseProfit + procFee + penalty) 
        : Math.max(0, totalCollected - amt);

      earnedSurplus += surplus;
      totalPrincipalRepaid += amt;
      totalRecovered += totalCollected;
      // marketDisbursed remains 0 for closed loans because principal has returned!
    } else if (l.status === 'active' || l.status === 'approved') {
      activeLoansCount += 1;

      if (paid > 0) {
        // Proportional split of installment payment between principal and interest
        const principalRatio = payable > 0 ? (amt / payable) : 1;
        const principalPaidSoFar = Math.min(amt, Math.round(paid * principalRatio));
        const interestPaidSoFar = Math.max(0, paid - principalPaidSoFar);

        const remainingPrincipalInMarket = Math.max(0, amt - principalPaidSoFar);
        const surplus = interestPaidSoFar + procFee + penalty;

        marketDisbursed += remainingPrincipalInMarket;
        totalPrincipalRepaid += principalPaidSoFar;
        earnedSurplus += surplus;
        totalRecovered += (paid + procFee + penalty);
      } else {
        // 0 paid so far, full principal is in the market
        marketDisbursed += amt;
        // Upfront fee collected is surplus earned
        earnedSurplus += procFee;
        totalRecovered += procFee;
      }
    }
  }

  // Round values
  marketDisbursed = Math.round(marketDisbursed);
  earnedSurplus = Math.round(earnedSurplus);
  totalRecovered = Math.round(totalRecovered);
  totalPrincipalRepaid = Math.round(totalPrincipalRepaid);

  // Dynamic Total Pool Limit = Base Pool + Returns/Surplus earned
  const totalPool = Math.round(basePool + earnedSurplus);
  const availablePool = Math.max(0, totalPool - marketDisbursed);
  const utilizationPercent = totalPool > 0 
    ? Math.min(100, Number(((marketDisbursed / totalPool) * 100).toFixed(1))) 
    : 0;

  const result = {
    success: true,
    basePool,
    earnedSurplus,
    totalPool,
    marketDisbursed,
    availablePool,
    totalRecovered,
    totalPrincipalRepaid,
    activeLoansCount,
    closedLoansCount,
    utilizationPercent,
    updatedAt: new Date().toISOString()
  };

  if (!session) {
    memoryCache.set(POOL_CACHE_KEY, result, POOL_CACHE_TTL_SECS);
    // Also keep legacy key fresh for any background consumer
    memoryCache.set('loan_dept_pool', result, POOL_CACHE_TTL_SECS);
  }

  return result;
}

function invalidateLoanDeptPoolCache() {
  memoryCache.del(POOL_CACHE_KEY);
  memoryCache.del('loan_dept_pool');
}

module.exports = {
  calculateLoanDepartmentPool,
  invalidateLoanDeptPoolCache,
  POOL_CACHE_KEY
};
