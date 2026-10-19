import {
  DEFAULT_MANDATORY_INSTALLMENTS,
  DEFAULT_INSTALLMENT_BLOCK_SIZE,
  DEFAULT_DISCOUNT_PERCENT_PER_BLOCK,
  DEFAULT_AGENT_SHARE_PERCENT,
  DEFAULT_LOAN_DEPARTMENT_SHARE_PERCENT
} from "../constants/loanSettingsDefaults";

/**
 * Shared Preclose Breakdown Calculator for Frontend
 *
 * Formula:
 * remaining_installments = total_installments - paid_installments
 * discount_blocks = floor(remaining_installments / installment_block_size)
 * total_discount_percent = discount_blocks * discount_percent_per_block (capped by maximum_discount_percent)
 * discount_amount = interest_on_remaining_installments * total_discount_percent / 100
 * agent_share_amount = discount_amount * agent_share_percent / 100
 * loan_department_share_amount = discount_amount * loan_department_share_percent / 100
 * user_payable_amount = total_payable_amount - discount_amount
 */
export function calculatePrecloseBreakdown(params = {}) {
  const {
    total_installments = 21,
    paid_installments = 15,
    interest_on_remaining_installments = 0,
    total_payable_amount = 0,
    loan_amount = 0,
    penalty_amount = 0,
    loan_type = "default",
    settings = {},
    conditions = []
  } = params;

  let mandatory_installments = Number(
    settings.mandatory_installments_before_preclose !== undefined && settings.mandatory_installments_before_preclose !== null
      ? settings.mandatory_installments_before_preclose
      : DEFAULT_MANDATORY_INSTALLMENTS
  );
  let block_size = Math.max(1, Number(
    settings.installment_block_size !== undefined && settings.installment_block_size !== null
      ? settings.installment_block_size
      : DEFAULT_INSTALLMENT_BLOCK_SIZE
  ));
  let discount_percent_per_block = Number(
    settings.discount_percent_per_block !== undefined && settings.discount_percent_per_block !== null
      ? settings.discount_percent_per_block
      : DEFAULT_DISCOUNT_PERCENT_PER_BLOCK
  );
  let maximum_discount_percent = settings.maximum_discount_percent !== undefined &&
    settings.maximum_discount_percent !== null &&
    settings.maximum_discount_percent !== ""
      ? Number(settings.maximum_discount_percent)
      : null;
  let agent_share_percent = Number(
    settings.agent_share_percent !== undefined && settings.agent_share_percent !== null
      ? settings.agent_share_percent
      : DEFAULT_AGENT_SHARE_PERCENT
  );
  let loan_department_share_percent = Number(
    settings.loan_department_share_percent !== undefined && settings.loan_department_share_percent !== null
      ? settings.loan_department_share_percent
      : DEFAULT_LOAN_DEPARTMENT_SHARE_PERCENT
  );
  let allow_partial_blocks = settings.allow_partial_blocks !== false;

  const totalInst = Math.max(0, Number(total_installments) || 0);
  const paidInst = Math.max(0, Number(paid_installments) || 0);
  const remaining_installments = Math.max(0, totalInst - paidInst);

  // Evaluate Custom Conditions (sorted by priority ascending)
  const context = {
    remaining_installments,
    loan_amount: Number(loan_amount) || 0,
    paid_installments: paidInst,
    total_installments: totalInst
  };

  const activeConditions = (conditions || [])
    .filter(c => c && c.is_active !== false)
    .sort((a, b) => (Number(a.priority) || 0) - (Number(b.priority) || 0));

  for (const cond of activeConditions) {
    const fieldVal = context[cond.condition_field];
    if (fieldVal === undefined) continue;
    const condVal = Number(cond.condition_value);
    let matched = false;

    switch (cond.operator) {
      case ">": matched = fieldVal > condVal; break;
      case ">=": matched = fieldVal >= condVal; break;
      case "=":
      case "==": matched = fieldVal === condVal; break;
      case "<": matched = fieldVal < condVal; break;
      case "<=": matched = fieldVal <= condVal; break;
      default: break;
    }

    if (matched) {
      const actVal = Number(cond.action_value);
      if (cond.action_field === "discount_percent_per_block") discount_percent_per_block = actVal;
      else if (cond.action_field === "installment_block_size") block_size = Math.max(1, actVal);
      else if (cond.action_field === "maximum_discount_percent") maximum_discount_percent = actVal;
      else if (cond.action_field === "agent_share_percent") {
        agent_share_percent = actVal;
        loan_department_share_percent = Math.max(0, 100 - actVal);
      } else if (cond.action_field === "loan_department_share_percent") {
        loan_department_share_percent = actVal;
        agent_share_percent = Math.max(0, 100 - actVal);
      }
    }
  }

  // Mandatory installments breakdown:
  // If paid < mandatory, borrower is locked in to paying interest up to mandatory target.
  const mandatory_target = Math.min(totalInst, mandatory_installments);
  const mandatory_remaining_installments = Math.max(0, mandatory_target - paidInst);
  const discount_eligible_installments = Math.max(0, totalInst - Math.max(paidInst, mandatory_target));

  // Calculate discount blocks & rate
  const full_blocks = block_size > 0 ? Math.floor(remaining_installments / block_size) : 0;
  let discount_blocks = full_blocks;
  let total_discount_percent = 0;

  if (allow_partial_blocks) {
    if (block_size > 0 && remaining_installments > 0) {
      const rawBlocks = remaining_installments / block_size;
      discount_blocks = Number(rawBlocks.toFixed(2));
      total_discount_percent = Number((rawBlocks * discount_percent_per_block).toFixed(2));
    } else {
      discount_blocks = 0;
      total_discount_percent = 0;
    }
  } else {
    total_discount_percent = Number((full_blocks * discount_percent_per_block).toFixed(2));
  }

  // Apply maximum discount percent cap if specified
  if (maximum_discount_percent !== null && maximum_discount_percent > 0 && total_discount_percent > maximum_discount_percent) {
    total_discount_percent = Number(maximum_discount_percent.toFixed(2));
  }

  const interest_pool = Number(interest_on_remaining_installments) || 0;
  const penalty = Math.max(0, Number(penalty_amount) || 0);

  // Break down mandatory interest vs discount eligible interest
  let mandatory_interest_amount = 0;
  let discount_eligible_interest = interest_pool;
  if (remaining_installments > 0) {
    const interestPerInst = interest_pool / remaining_installments;
    mandatory_interest_amount = Number((interestPerInst * mandatory_remaining_installments).toFixed(2));
    discount_eligible_interest = Number((interest_pool - mandatory_interest_amount).toFixed(2));
  }

  const discount_amount = Number(((interest_pool * total_discount_percent) / 100).toFixed(2));

  // Split discount pool:
  // Note: agent_share_amount + loan_department_share_amount = discount_amount guaranteed
  const agent_share_amount = Number(((discount_amount * agent_share_percent) / 100).toFixed(2));
  const loan_department_share_amount = Number((discount_amount - agent_share_amount).toFixed(2));

  const total_payable = Number(total_payable_amount) || 0;
  const user_payable_amount = Math.max(0, Number((total_payable - discount_amount + penalty).toFixed(2)));

  return {
    remaining_installments,
    mandatory_remaining_installments,
    discount_eligible_installments,
    mandatory_interest_amount,
    penalty_amount: penalty,
    full_blocks,
    discount_blocks,
    total_discount_percent,
    discount_amount,
    agent_share_amount,
    loan_department_share_amount,
    user_payable_amount,
    applied_settings: {
      mandatory_installments_before_preclose: mandatory_installments,
      installment_block_size: block_size,
      discount_percent_per_block,
      maximum_discount_percent,
      agent_share_percent,
      loan_department_share_percent,
      allow_partial_blocks
    }
  };
}
