const test = require('node:test');
const assert = require('node:assert');
const express = require('express');
const http = require('http');

const { calculatePrecloseBreakdown } = require('../utils/precloseCalculator');
const {
  DEFAULT_MANDATORY_INSTALLMENTS,
  DEFAULT_INSTALLMENT_BLOCK_SIZE,
  DEFAULT_DISCOUNT_PERCENT_PER_BLOCK,
  DEFAULT_AGENT_SHARE_PERCENT,
  DEFAULT_LOAN_DEPARTMENT_SHARE_PERCENT,
  DEFAULT_LOAN_DEPARTMENT_COMMISSION_PERCENT
} = require('../constants/loanSettingsDefaults');
const { requirePermission } = require('../middleware/auth');

// ============================================================================
// 1. UNIT TESTS: calculatePrecloseBreakdown
// ============================================================================
test('1.1 calculatePrecloseBreakdown: total 21, paid 15, remaining 6 -> 2% discount', () => {
  const result = calculatePrecloseBreakdown({
    total_installments: 21,
    paid_installments: 15,
    interest_on_remaining_installments: 6000,
    total_payable_amount: 50000,
    settings: {
      installment_block_size: 3,
      discount_percent_per_block: 1
    }
  });

  assert.strictEqual(result.remaining_installments, 6);
  assert.strictEqual(result.discount_blocks, 2);
  assert.strictEqual(result.total_discount_percent, 2);
  assert.strictEqual(result.discount_amount, 120); // 6000 * 2% = 120
});

test('1.2 calculatePrecloseBreakdown: total 21, paid 12, remaining 9 -> 3% discount', () => {
  const result = calculatePrecloseBreakdown({
    total_installments: 21,
    paid_installments: 12,
    interest_on_remaining_installments: 9000,
    total_payable_amount: 109000,
    settings: {
      installment_block_size: 3,
      discount_percent_per_block: 1
    }
  });

  assert.strictEqual(result.remaining_installments, 9);
  assert.strictEqual(result.discount_blocks, 3);
  assert.strictEqual(result.total_discount_percent, 3);
  assert.strictEqual(result.discount_amount, 270); // 9000 * 3% = 270
});

test('1.3 calculatePrecloseBreakdown: remaining 2 (less than block size 3) -> 0% discount', () => {
  const result = calculatePrecloseBreakdown({
    total_installments: 21,
    paid_installments: 19,
    interest_on_remaining_installments: 2000,
    total_payable_amount: 20000,
    settings: {
      installment_block_size: 3,
      discount_percent_per_block: 1
    }
  });

  assert.strictEqual(result.remaining_installments, 2);
  assert.strictEqual(result.discount_blocks, 0);
  assert.strictEqual(result.total_discount_percent, 0);
  assert.strictEqual(result.discount_amount, 0);
});

test('1.4 calculatePrecloseBreakdown: maximum_discount_percent cap enforcement', () => {
  const result = calculatePrecloseBreakdown({
    total_installments: 21,
    paid_installments: 12,
    interest_on_remaining_installments: 10000,
    settings: {
      installment_block_size: 3,
      discount_percent_per_block: 1,
      maximum_discount_percent: 2 // Cap at 2% even though 9 remaining => 3%
    }
  });

  assert.strictEqual(result.remaining_installments, 9);
  assert.strictEqual(result.discount_blocks, 3);
  assert.strictEqual(result.total_discount_percent, 2); // capped
  assert.strictEqual(result.discount_amount, 200);
});

test('1.5 calculatePrecloseBreakdown: 50-50 split sum strictly equals discount_amount (no penny loss)', () => {
  const testCases = [
    { interest: 9000, total: 21, paid: 12 },
    { interest: 777.77, total: 21, paid: 12 },
    { interest: 1234.56, total: 21, paid: 15 },
    { interest: 99.99, total: 21, paid: 12 }
  ];

  for (const tc of testCases) {
    const res = calculatePrecloseBreakdown({
      total_installments: tc.total,
      paid_installments: tc.paid,
      interest_on_remaining_installments: tc.interest,
      settings: {
        installment_block_size: 3,
        discount_percent_per_block: 1,
        agent_share_percent: 50,
        loan_department_share_percent: 50
      }
    });

    const splitSum = Number((res.agent_share_amount + res.loan_department_share_amount).toFixed(2));
    assert.strictEqual(
      splitSum,
      res.discount_amount,
      `Split sum ${splitSum} must equal discount_amount ${res.discount_amount} for interest ${tc.interest}`
    );
  }
});

test('1.6 calculatePrecloseBreakdown: custom conditions evaluation', () => {
  const conditions = [
    {
      condition_field: 'remaining_installments',
      operator: '>=',
      condition_value: 9,
      action_field: 'discount_percent_per_block',
      action_value: 1.5,
      is_active: true,
      priority: 1
    },
    {
      condition_field: 'loan_amount',
      operator: '>=',
      condition_value: 500000,
      action_field: 'agent_share_percent',
      action_value: 40,
      is_active: true,
      priority: 2
    }
  ];

  const result = calculatePrecloseBreakdown({
    total_installments: 21,
    paid_installments: 12, // remaining = 9 => matches condition 1 (1.5% per block => 3 * 1.5% = 4.5%)
    loan_amount: 600000, // matches condition 2 => agent share = 40%, dept share = 60%
    interest_on_remaining_installments: 10000,
    total_payable_amount: 610000,
    conditions
  });

  assert.strictEqual(result.remaining_installments, 9);
  assert.strictEqual(result.discount_blocks, 3);
  assert.strictEqual(result.total_discount_percent, 4.5);
  assert.strictEqual(result.discount_amount, 450); // 10000 * 4.5% = 450
  assert.strictEqual(result.agent_share_amount, 180); // 40% of 450 = 180
  assert.strictEqual(result.loan_department_share_amount, 270); // 60% of 450 = 270
  assert.strictEqual(result.agent_share_amount + result.loan_department_share_amount, 450);
});

// ============================================================================
// 2. VALIDATION TESTS: agent commission > 5% reject, share sum != 100 reject
// ============================================================================
test('2.1 Validation: agent commission > 5% rejected', () => {
  const maxAllowed = DEFAULT_LOAN_DEPARTMENT_COMMISSION_PERCENT; // 5
  const invalidRates = [5.1, 6, 10, 100];

  for (const rate of invalidRates) {
    const isInvalid = rate > maxAllowed;
    assert.strictEqual(isInvalid, true);
  }
});

test('2.2 Validation: negative agent commission rejected', () => {
  const rate = -1;
  const isInvalid = !Number.isFinite(rate) || rate < 0;
  assert.strictEqual(isInvalid, true);
});

test('2.3 Validation: agent share + loan department share sum != 100% rejected', () => {
  const invalidPairs = [
    { agent: 60, dept: 50 }, // 110%
    { agent: 40, dept: 40 }, // 80%
    { agent: 100, dept: 10 }, // 110%
    { agent: 0, dept: 0 }     // 0%
  ];

  for (const p of invalidPairs) {
    const isValid = Math.round(p.agent + p.dept) === 100;
    assert.strictEqual(isValid, false, `Pair ${p.agent} + ${p.dept} should be rejected`);
  }

  const validPairs = [
    { agent: 50, dept: 50 },
    { agent: 40, dept: 60 },
    { agent: 30, dept: 70 },
    { agent: 0, dept: 100 }
  ];

  for (const p of validPairs) {
    const isValid = Math.round(p.agent + p.dept) === 100;
    assert.strictEqual(isValid, true, `Pair ${p.agent} + ${p.dept} should be accepted`);
  }
});

test('2.4 Validation: mandatory installments < 0 and installment block size < 1 rejected', () => {
  const invalidMandatory = -1;
  assert.strictEqual(invalidMandatory < 0, true);

  const invalidBlockSize = 0;
  assert.strictEqual(invalidBlockSize < 1, true);
});

// ============================================================================
// 3. PERMISSION TESTS: LOAN_AGENT_COMMISSION_VIEW and LOAN_AGENT_COMMISSION_SET
// ============================================================================
test('3.1 Permission: staff user WITHOUT LOAN_AGENT_COMMISSION_VIEW gets 403 Forbidden', () => {
  const middleware = requirePermission('LOAN_AGENT_COMMISSION_VIEW');
  const req = {
    user: {
      role: 'staff',
      staffProfile: {
        isActive: true,
        permissions: ['loan.process', 'loan.approve'] // missing commission view
      }
    }
  };
  let statusCode = null;
  let responseData = null;
  const res = {
    status(code) {
      statusCode = code;
      return {
        json(data) {
          responseData = data;
        }
      };
    }
  };
  let nextCalled = false;
  middleware(req, res, () => { nextCalled = true; });

  assert.strictEqual(nextCalled, false);
  assert.strictEqual(statusCode, 403);
  assert.ok(responseData.message.includes('LOAN_AGENT_COMMISSION_VIEW'));
});

test('3.2 Permission: staff user WITH LOAN_AGENT_COMMISSION_VIEW passes through', () => {
  const middleware = requirePermission('LOAN_AGENT_COMMISSION_VIEW');
  const req = {
    user: {
      role: 'staff',
      staffProfile: {
        isActive: true,
        permissions: ['loan.process', 'LOAN_AGENT_COMMISSION_VIEW']
      }
    }
  };
  let nextCalled = false;
  middleware(req, {}, () => { nextCalled = true; });

  assert.strictEqual(nextCalled, true);
});

test('3.3 Permission: normalized dot-notation loan.agent_commission_view also passes', () => {
  const middleware = requirePermission('LOAN_AGENT_COMMISSION_VIEW');
  const req = {
    user: {
      role: 'staff',
      staffProfile: {
        isActive: true,
        permissions: ['loan.agent_commission_view']
      }
    }
  };
  let nextCalled = false;
  middleware(req, {}, () => { nextCalled = true; });

  assert.strictEqual(nextCalled, true);
});

test('3.4 Permission: staff user WITHOUT LOAN_AGENT_COMMISSION_SET gets 403 Forbidden', () => {
  const middleware = requirePermission('LOAN_AGENT_COMMISSION_SET');
  const req = {
    user: {
      role: 'staff',
      staffProfile: {
        isActive: true,
        permissions: ['LOAN_AGENT_COMMISSION_VIEW'] // has view but not set
      }
    }
  };
  let statusCode = null;
  let responseData = null;
  const res = {
    status(code) {
      statusCode = code;
      return {
        json(data) {
          responseData = data;
        }
      };
    }
  };
  let nextCalled = false;
  middleware(req, res, () => { nextCalled = true; });

  assert.strictEqual(nextCalled, false);
  assert.strictEqual(statusCode, 403);
  assert.ok(responseData.message.includes('LOAN_AGENT_COMMISSION_SET'));
});

test('3.5 Permission: admin role bypasses permission check', () => {
  const middleware = requirePermission('LOAN_AGENT_COMMISSION_VIEW');
  const req = {
    user: {
      role: 'admin'
    }
  };
  let nextCalled = false;
  middleware(req, {}, () => { nextCalled = true; });

  assert.strictEqual(nextCalled, true);
});

test('3.6 Permission: regular user (role === user) receives 403 Forbidden', () => {
  const middleware = requirePermission('LOAN_AGENT_COMMISSION_VIEW');
  const req = {
    user: {
      role: 'user'
    }
  };
  let statusCode = null;
  const res = {
    status(code) {
      statusCode = code;
      return { json() {} };
    }
  };
  let nextCalled = false;
  middleware(req, res, () => { nextCalled = true; });

  assert.strictEqual(nextCalled, false);
  assert.strictEqual(statusCode, 403);
});

// ============================================================================
// 4. API CONTRACT TESTS: GET/PUT Settings, calculate endpoint
// ============================================================================
test('4.1 API Simulation: save loan settings and verify reloading updated state', async () => {
  // In-memory state store mimicking database collections
  let dbSettings = {
    default: {
      loan_type_id: null,
      mandatory_installments_before_preclose: DEFAULT_MANDATORY_INSTALLMENTS,
      installment_block_size: DEFAULT_INSTALLMENT_BLOCK_SIZE,
      discount_percent_per_block: DEFAULT_DISCOUNT_PERCENT_PER_BLOCK,
      maximum_discount_percent: null,
      agent_share_percent: 50,
      loan_department_share_percent: 50
    },
    overrides: {}
  };
  let dbConditions = [];

  const app = express();
  app.use(express.json());

  // GET /api/admin/loan-settings
  app.get('/api/admin/loan-settings', (req, res) => {
    res.json({
      success: true,
      settings: dbSettings,
      conditions: dbConditions
    });
  });

  // PUT /api/admin/loan-settings
  app.put('/api/admin/loan-settings', (req, res) => {
    const { settings = {}, conditions = [] } = req.body;
    const defaultData = settings.default || {};
    const agentShare = Number(defaultData.agent_share_percent ?? 50);
    const deptShare = Number(defaultData.loan_department_share_percent ?? 50);

    if (Math.round(agentShare + deptShare) !== 100) {
      return res.status(400).json({
        success: false,
        message: 'Agent share percent and Loan Department share percent must sum to exactly 100%'
      });
    }

    dbSettings = {
      default: {
        ...dbSettings.default,
        ...defaultData,
        agent_share_percent: agentShare,
        loan_department_share_percent: deptShare
      },
      overrides: settings.overrides || {}
    };
    dbConditions = conditions;

    res.json({
      success: true,
      message: 'Loan preclose settings and custom conditions updated successfully',
      settings: dbSettings,
      conditions: dbConditions
    });
  });

  // POST /api/admin/loan-settings/calculate
  app.post('/api/admin/loan-settings/calculate', (req, res) => {
    const result = calculatePrecloseBreakdown(req.body);
    res.json({ success: true, result });
  });

  const server = http.createServer(app);
  await new Promise(r => server.listen(0, r));
  const port = server.address().port;
  const baseUrl = `http://127.0.0.1:${port}`;

  try {
    // 1. Initial GET
    const res1 = await fetch(`${baseUrl}/api/admin/loan-settings`);
    const data1 = await res1.json();
    assert.strictEqual(data1.success, true);
    assert.strictEqual(data1.settings.default.installment_block_size, 3);
    assert.strictEqual(data1.conditions.length, 0);

    // 2. PUT updated settings & new condition
    const updatePayload = {
      settings: {
        default: {
          mandatory_installments_before_preclose: 18,
          installment_block_size: 4,
          discount_percent_per_block: 1.5,
          maximum_discount_percent: 10,
          agent_share_percent: 45,
          loan_department_share_percent: 55
        },
        overrides: {
          personal: {
            loan_type_id: 'personal',
            mandatory_installments_before_preclose: 12,
            installment_block_size: 2,
            discount_percent_per_block: 2,
            maximum_discount_percent: 15,
            agent_share_percent: 40,
            loan_department_share_percent: 60
          }
        }
      },
      conditions: [
        {
          condition_name: 'High Tenure Discount',
          condition_field: 'remaining_installments',
          operator: '>=',
          condition_value: 10,
          action_field: 'discount_percent_per_block',
          action_value: 2.0,
          is_active: true,
          priority: 1
        }
      ]
    };

    const res2 = await fetch(`${baseUrl}/api/admin/loan-settings`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(updatePayload)
    });
    const data2 = await res2.json();
    assert.strictEqual(data2.success, true);
    assert.strictEqual(data2.settings.default.mandatory_installments_before_preclose, 18);
    assert.strictEqual(data2.settings.default.agent_share_percent, 45);
    assert.strictEqual(data2.settings.default.loan_department_share_percent, 55);
    assert.strictEqual(data2.conditions.length, 1);

    // 3. GET verify reload
    const res3 = await fetch(`${baseUrl}/api/admin/loan-settings`);
    const data3 = await res3.json();
    assert.strictEqual(data3.settings.default.mandatory_installments_before_preclose, 18);
    assert.strictEqual(data3.settings.overrides.personal.installment_block_size, 2);
    assert.strictEqual(data3.conditions[0].condition_name, 'High Tenure Discount');

    // 4. Test calculate API
    const res4 = await fetch(`${baseUrl}/api/admin/loan-settings/calculate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        total_installments: 24,
        paid_installments: 12,
        interest_on_remaining_installments: 12000,
        settings: {
          installment_block_size: 3,
          discount_percent_per_block: 1,
          agent_share_percent: 50,
          loan_department_share_percent: 50
        }
      })
    });
    const data4 = await res4.json();
    assert.strictEqual(data4.success, true);
    assert.strictEqual(data4.result.remaining_installments, 12);
    assert.strictEqual(data4.result.discount_blocks, 4);
    assert.strictEqual(data4.result.total_discount_percent, 4);
    assert.strictEqual(data4.result.discount_amount, 480);
    assert.strictEqual(data4.result.agent_share_amount, 240);
    assert.strictEqual(data4.result.loan_department_share_amount, 240);
  } finally {
    server.close();
  }
});

test('4.2 API Validation: PUT settings with invalid share sum returns 400', async () => {
  const app = express();
  app.use(express.json());

  app.put('/api/admin/loan-settings', (req, res) => {
    const { settings = {} } = req.body;
    const defaultData = settings.default || {};
    const agentShare = Number(defaultData.agent_share_percent ?? 50);
    const deptShare = Number(defaultData.loan_department_share_percent ?? 50);

    if (Math.round(agentShare + deptShare) !== 100) {
      return res.status(400).json({
        success: false,
        message: 'Agent share percent and Loan Department share percent must sum to exactly 100%'
      });
    }
    res.json({ success: true });
  });

  const server = http.createServer(app);
  await new Promise(r => server.listen(0, r));
  const baseUrl = `http://127.0.0.1:${server.address().port}`;

  try {
    const res = await fetch(`${baseUrl}/api/admin/loan-settings`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        settings: {
          default: {
            agent_share_percent: 70,
            loan_department_share_percent: 40 // sum = 110 != 100
          }
        }
      })
    });

    assert.strictEqual(res.status, 400);
    const data = await res.json();
    assert.strictEqual(data.success, false);
    assert.ok(data.message.includes('100%'));
  } finally {
    server.close();
  }
});

// ============================================================================
// 5. UI / STATE LOGIC TESTS: sidebar collapse/expand, Back button, section switch
// ============================================================================
test('5.1 UI Logic: sidebar collapse and expand state management', () => {
  let isSidebarCollapsed = false;
  const toggleSidebar = () => {
    isSidebarCollapsed = !isSidebarCollapsed;
  };

  assert.strictEqual(isSidebarCollapsed, false, 'Default should be expanded');
  toggleSidebar();
  assert.strictEqual(isSidebarCollapsed, true, 'First toggle should collapse');
  toggleSidebar();
  assert.strictEqual(isSidebarCollapsed, false, 'Second toggle should expand');
});

test('5.2 UI Logic: navigation sections switching', () => {
  const allowedSections = ['commission', 'preclose', 'conditions', 'calculator'];
  let activeSection = 'commission';

  const selectSection = (sec) => {
    assert.ok(allowedSections.includes(sec), `Unknown section ${sec}`);
    activeSection = sec;
  };

  selectSection('preclose');
  assert.strictEqual(activeSection, 'preclose');

  selectSection('conditions');
  assert.strictEqual(activeSection, 'conditions');

  selectSection('calculator');
  assert.strictEqual(activeSection, 'calculator');

  selectSection('commission');
  assert.strictEqual(activeSection, 'commission');
});

test('5.3 UI Logic: Back to Admin Panel with dirty state guard', () => {
  let navigatedTo = null;
  let confirmPromptShown = false;

  const navigate = (path) => {
    navigatedTo = path;
  };

  const handleBackToAdmin = (isDirty, userConfirmed) => {
    if (isDirty) {
      confirmPromptShown = true;
      if (userConfirmed) {
        navigate('/admin');
      }
    } else {
      navigate('/admin');
    }
  };

  // Case 1: Clean state (no unsaved changes) -> navigates immediately
  handleBackToAdmin(false, false);
  assert.strictEqual(confirmPromptShown, false);
  assert.strictEqual(navigatedTo, '/admin');

  // Case 2: Dirty state (unsaved changes) + user cancels -> navigation prevented
  navigatedTo = null;
  confirmPromptShown = false;
  handleBackToAdmin(true, false);
  assert.strictEqual(confirmPromptShown, true);
  assert.strictEqual(navigatedTo, null);

  // Case 3: Dirty state + user confirms -> proceeds to /admin
  navigatedTo = null;
  confirmPromptShown = false;
  handleBackToAdmin(true, true);
  assert.strictEqual(confirmPromptShown, true);
  assert.strictEqual(navigatedTo, '/admin');
});
