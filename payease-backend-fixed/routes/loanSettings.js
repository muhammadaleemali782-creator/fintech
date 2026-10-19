const express = require('express');
const router = express.Router();
const { protect, admin, staffOrAdmin } = require('../middleware/auth');
const LoanPrecloseSetting = require('../models/LoanPrecloseSetting');
const LoanPrecloseCondition = require('../models/LoanPrecloseCondition');
const { calculatePrecloseBreakdown } = require('../utils/precloseCalculator');
const {
  DEFAULT_MANDATORY_INSTALLMENTS,
  DEFAULT_INSTALLMENT_BLOCK_SIZE,
  DEFAULT_DISCOUNT_PERCENT_PER_BLOCK,
  DEFAULT_MAXIMUM_DISCOUNT_PERCENT,
  DEFAULT_AGENT_SHARE_PERCENT,
  DEFAULT_LOAN_DEPARTMENT_SHARE_PERCENT
} = require('../constants/loanSettingsDefaults');

const LOAN_TYPES = ['personal', 'student', 'micro_business'];

function getDefaultSettingObject(loanTypeId = null) {
  return {
    loan_type_id: loanTypeId,
    mandatory_installments_before_preclose: DEFAULT_MANDATORY_INSTALLMENTS,
    installment_block_size: DEFAULT_INSTALLMENT_BLOCK_SIZE,
    discount_percent_per_block: DEFAULT_DISCOUNT_PERCENT_PER_BLOCK,
    maximum_discount_percent: DEFAULT_MAXIMUM_DISCOUNT_PERCENT,
    agent_share_percent: DEFAULT_AGENT_SHARE_PERCENT,
    loan_department_share_percent: DEFAULT_LOAN_DEPARTMENT_SHARE_PERCENT
  };
}

// GET /api/admin/loan-settings - Fetch preclose settings & custom conditions
router.get('/', protect, staffOrAdmin, async (req, res) => {
  try {
    const [allSettings, conditions] = await Promise.all([
      LoanPrecloseSetting.find({}).lean(),
      LoanPrecloseCondition.find({}).sort({ priority: 1, created_at: 1 }).lean()
    ]);

    let defaultSetting = allSettings.find(s => !s.loan_type_id || s.loan_type_id === 'default');
    if (!defaultSetting) {
      defaultSetting = getDefaultSettingObject(null);
    }

    const overrides = {};
    for (const lt of LOAN_TYPES) {
      const found = allSettings.find(s => s.loan_type_id === lt);
      if (found) {
        overrides[lt] = found;
      }
    }

    res.json({
      success: true,
      settings: {
        default: defaultSetting,
        overrides
      },
      conditions: conditions || []
    });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Failed to fetch loan settings: ' + err.message });
  }
});

// PUT /api/admin/loan-settings - Update preclose settings & conditions
router.put('/', protect, admin, async (req, res) => {
  try {
    const { settings = {}, conditions = [] } = req.body;
    const defaultData = settings.default || {};
    const overridesData = settings.overrides || {};

    // Validate default settings
    const agentShare = Number(defaultData.agent_share_percent ?? DEFAULT_AGENT_SHARE_PERCENT);
    const deptShare = Number(defaultData.loan_department_share_percent ?? DEFAULT_LOAN_DEPARTMENT_SHARE_PERCENT);

    if (Math.round(agentShare + deptShare) !== 100) {
      return res.status(400).json({
        success: false,
        message: 'Agent share percent and Loan Department share percent must sum to exactly 100%'
      });
    }

    if (Number(defaultData.mandatory_installments_before_preclose) < 0) {
      return res.status(400).json({ success: false, message: 'Mandatory installments cannot be negative' });
    }

    if (Number(defaultData.installment_block_size) < 1) {
      return res.status(400).json({ success: false, message: 'Installment block size must be at least 1' });
    }

    if (Number(defaultData.discount_percent_per_block) < 0) {
      return res.status(400).json({ success: false, message: 'Discount percent per block cannot be negative' });
    }

    // Upsert default setting
    const updatedDefault = await LoanPrecloseSetting.findOneAndUpdate(
      { $or: [{ loan_type_id: null }, { loan_type_id: 'default' }] },
      {
        loan_type_id: null,
        mandatory_installments_before_preclose: Number(defaultData.mandatory_installments_before_preclose ?? DEFAULT_MANDATORY_INSTALLMENTS),
        installment_block_size: Number(defaultData.installment_block_size ?? DEFAULT_INSTALLMENT_BLOCK_SIZE),
        discount_percent_per_block: Number(defaultData.discount_percent_per_block ?? DEFAULT_DISCOUNT_PERCENT_PER_BLOCK),
        maximum_discount_percent: defaultData.maximum_discount_percent !== null && defaultData.maximum_discount_percent !== '' && defaultData.maximum_discount_percent !== undefined
          ? Number(defaultData.maximum_discount_percent)
          : null,
        agent_share_percent: agentShare,
        loan_department_share_percent: deptShare,
        updated_at: new Date()
      },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    ).lean();

    // Upsert loan type overrides
    const updatedOverrides = {};
    for (const lt of LOAN_TYPES) {
      const overrideVal = overridesData[lt];
      if (overrideVal && typeof overrideVal === 'object') {
        const oAgentShare = Number(overrideVal.agent_share_percent ?? agentShare);
        const oDeptShare = Number(overrideVal.loan_department_share_percent ?? deptShare);

        if (Math.round(oAgentShare + oDeptShare) !== 100) {
          return res.status(400).json({
            success: false,
            message: `Share percentages for loan type '${lt}' must sum to 100%`
          });
        }

        const saved = await LoanPrecloseSetting.findOneAndUpdate(
          { loan_type_id: lt },
          {
            loan_type_id: lt,
            mandatory_installments_before_preclose: Number(overrideVal.mandatory_installments_before_preclose ?? defaultData.mandatory_installments_before_preclose ?? DEFAULT_MANDATORY_INSTALLMENTS),
            installment_block_size: Number(overrideVal.installment_block_size ?? defaultData.installment_block_size ?? DEFAULT_INSTALLMENT_BLOCK_SIZE),
            discount_percent_per_block: Number(overrideVal.discount_percent_per_block ?? defaultData.discount_percent_per_block ?? DEFAULT_DISCOUNT_PERCENT_PER_BLOCK),
            maximum_discount_percent: overrideVal.maximum_discount_percent !== null && overrideVal.maximum_discount_percent !== '' && overrideVal.maximum_discount_percent !== undefined
              ? Number(overrideVal.maximum_discount_percent)
              : null,
            agent_share_percent: oAgentShare,
            loan_department_share_percent: oDeptShare,
            updated_at: new Date()
          },
          { upsert: true, new: true, setDefaultsOnInsert: true }
        ).lean();
        updatedOverrides[lt] = saved;
      }
    }

    // Sync conditions
    if (Array.isArray(conditions)) {
      // Validate conditions
      for (const cond of conditions) {
        if (!cond.condition_name || !cond.condition_field || !cond.operator || cond.condition_value === undefined) {
          return res.status(400).json({ success: false, message: 'Invalid condition payload: name, field, operator, and value are required' });
        }
      }

      await LoanPrecloseCondition.deleteMany({});
      if (conditions.length > 0) {
        const toInsert = conditions.map((c, idx) => ({
          condition_name: String(c.condition_name).trim(),
          condition_field: c.condition_field,
          operator: c.operator,
          condition_value: Number(c.condition_value) || 0,
          action_field: c.action_field,
          action_value: Number(c.action_value) || 0,
          is_active: c.is_active !== false,
          priority: Number(c.priority !== undefined ? c.priority : idx + 1)
        }));
        await LoanPrecloseCondition.insertMany(toInsert);
      }
    }

    const savedConditions = await LoanPrecloseCondition.find({}).sort({ priority: 1, created_at: 1 }).lean();

    res.json({
      success: true,
      message: 'Loan preclose settings and custom conditions updated successfully',
      settings: {
        default: updatedDefault,
        overrides: updatedOverrides
      },
      conditions: savedConditions
    });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Failed to save loan settings: ' + err.message });
  }
});

// POST /api/admin/loan-settings/calculate - Server-side simulation of preclose breakdown
router.post('/calculate', protect, staffOrAdmin, async (req, res) => {
  try {
    const result = calculatePrecloseBreakdown(req.body);
    res.json({
      success: true,
      result
    });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Calculation failed: ' + err.message });
  }
});

module.exports = router;
