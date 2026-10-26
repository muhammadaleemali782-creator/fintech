const Settings = require('../models/Settings');
const Loan = require('../models/Loan');
const memoryCache = require('./cache');

const POOL_CACHE_KEY = 'loan_dept_pool_dynamic';
const POOL_CACHE_TTL_SECS = 4; // Fast cache TTL for ultra-low latency & fresh data

/**
 * Calculates the dynamic Loan Department Pool.
 *
 * Mathematical & Business Rules:
 * 1. Base Pool (`basePool`):
 *    - Initial capital allocated by Admin (Default ₹10,00,000 / 10 Lakhs).
 * 2. Disbursals (`marketDisbursed`):
 *    - Principal amount lent out to borrowers for active / approved loans.
 *    - When loans are disbursed, available cash decreases: (basePool - marketDisbursed).
 *    - Disbursing loans does NOT increase limit. Limit remains basePool.
 * 3. Repayments / Recoveries (`totalRecovered`):
 *    - Actual repayments received back from borrowers (paidAmount + penaltyPaid).
 *    - As repayments come in, the available pool fills back up.
 * 4. Automatic Limit Expansion (`totalPool`):
 *    - When repayments are 0, totalPool is strictly basePool (₹10,00,000).
 *    - Upfront fees do NOT inflate the limit.
 *    - ONLY when borrowers repay returns/interest/penalties exceeding principal,
 *      or closed loans produce net profit above principal, does totalPool expand:
 *      totalPool = basePool + earnedSurplus!
 * 5. Available Lending Pool (`availablePool`):
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
    const penalty = Number(l.penaltyPaid || 0);
    const precloseProfit = Number(l.precloseCompanyProfit || 0);

    if (l.status === 'closed') {
      closedLoansCount += 1;
      const totalPaid = paid > 0 ? paid : payable;
      const totalCollected = totalPaid + penalty;
      // Realized profit strictly above principal
      const surplus = precloseProfit > 0 
        ? (precloseProfit + penalty) 
        : Math.max(0, totalCollected - amt);

      earnedSurplus += surplus;
      totalPrincipalRepaid += amt;
      totalRecovered += totalCollected;
      // For closed loans, principal is 100% returned; marketDisbursed is 0
    } else if (l.status === 'active' || l.status === 'approved') {
      activeLoansCount += 1;

      if (paid > 0 || penalty > 0) {
        // Borrower has actually paid money back!
        const totalReceivedFromBorrower = paid + penalty;
        totalRecovered += totalReceivedFromBorrower;

        // How much of this paid amount covers principal vs surplus
        const principalRepaid = Math.min(amt, paid);
        const remainingPrincipal = Math.max(0, amt - principalRepaid);

        marketDisbursed += remainingPrincipal;
        totalPrincipalRepaid += principalRepaid;

        // Only expand surplus above principal if total returned exceeds loan amount
        if (totalReceivedFromBorrower > amt) {
          earnedSurplus += (totalReceivedFromBorrower - amt);
        }
      } else {
        // Zero paid so far: Full principal is in the market, 0 recovered, 0 surplus
        marketDisbursed += amt;
      }
    }
  }

  // Round values
  marketDisbursed = Math.round(marketDisbursed);
  earnedSurplus = Math.round(earnedSurplus);
  totalRecovered = Math.round(totalRecovered);
  totalPrincipalRepaid = Math.round(totalPrincipalRepaid);

  // Dynamic Total Pool Limit = Base Pool + Returns/Surplus earned above principal
  // If no repayments returned or no surplus earned, totalPool is strictly basePool (e.g. ₹10,00,000)
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
