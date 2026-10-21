const express = require('express');
const { escapeRegex } = require('../utils/security');
const router = express.Router();
const { protect, requirePermission, admin } = require('../middleware/auth');
const User = require('../models/User');
const Settings = require('../models/Settings');
const AgentLoanCommissionSetting = require('../models/AgentLoanCommissionSetting');
const AgentCommissionRequest = require('../models/AgentCommissionRequest');
const {
  DEFAULT_LOAN_DEPARTMENT_COMMISSION_PERCENT,
  DEFAULT_AGENT_COMMISSION_PERCENT
} = require('../constants/loanSettingsDefaults');

// Helper: Get department pool percentages from Settings
async function getDepartmentPools() {
  const [loanDoc, invDoc] = await Promise.all([
    Settings.findOne({ key: 'loan_department_commission_percent' }).lean(),
    Settings.findOne({ key: 'investment_department_commission_percent' }).lean()
  ]);

  const loanPool = loanDoc && Number.isFinite(Number(loanDoc.value))
    ? Number(loanDoc.value)
    : DEFAULT_LOAN_DEPARTMENT_COMMISSION_PERCENT;

  const invPool = invDoc && Number.isFinite(Number(invDoc.value))
    ? Number(invDoc.value)
    : DEFAULT_LOAN_DEPARTMENT_COMMISSION_PERCENT;

  return { loanPool, invPool };
}

// GET /api/loan-department/department-pools - Get Loan & Investment Department Pool %
router.get('/department-pools', protect, requirePermission('LOAN_AGENT_COMMISSION_VIEW'), async (req, res) => {
  try {
    const { loanPool, invPool } = await getDepartmentPools();
    res.json({
      success: true,
      loan_department_commission_percent: loanPool,
      investment_department_commission_percent: invPool
    });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Failed to fetch department pools: ' + err.message });
  }
});

// PUT /api/loan-department/department-pools - Admin sets Department Pools
router.put('/department-pools', protect, admin, async (req, res) => {
  try {
    const { loan_department_commission_percent, investment_department_commission_percent } = req.body;

    const loanVal = Number(loan_department_commission_percent);
    const invVal = Number(investment_department_commission_percent);

    if (!Number.isFinite(loanVal) || loanVal < 0 || loanVal > 100) {
      return res.status(400).json({ success: false, message: 'Valid Loan Department Pool % (0-100) is required' });
    }
    if (!Number.isFinite(invVal) || invVal < 0 || invVal > 100) {
      return res.status(400).json({ success: false, message: 'Valid Investment Department Pool % (0-100) is required' });
    }

    await Promise.all([
      Settings.findOneAndUpdate(
        { key: 'loan_department_commission_percent' },
        { key: 'loan_department_commission_percent', value: loanVal, updatedAt: new Date() },
        { upsert: true, new: true }
      ),
      Settings.findOneAndUpdate(
        { key: 'investment_department_commission_percent' },
        { key: 'investment_department_commission_percent', value: invVal, updatedAt: new Date() },
        { upsert: true, new: true }
      )
    ]);

    res.json({
      success: true,
      message: 'Department commission pools updated successfully',
      loan_department_commission_percent: loanVal,
      investment_department_commission_percent: invVal
    });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Failed to save department pools: ' + err.message });
  }
});

// GET /api/loan-department/agent-commission - View agent loan & investment commission list
router.get('/agent-commission', protect, requirePermission('LOAN_AGENT_COMMISSION_VIEW'), async (req, res) => {
  try {
    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit, 10) || 25));
    const search = (req.query.search || '').trim();

    const { loanPool, invPool } = await getDepartmentPools();

    const query = {
      $or: [
        { role: 'agent' },
        { 'agentProfile.status': 'approved' }
      ]
    };

    if (search) {
      query.$and = [
        {
          $or: [
            { name: { $regex: escapeRegex(search), $options: 'i' } },
            { phone: { $regex: escapeRegex(search), $options: 'i' } },
            { referralCode: { $regex: escapeRegex(search), $options: 'i' } },
            { email: { $regex: escapeRegex(search), $options: 'i' } }
          ]
        }
      ];
    }

    const [totalAgents, agents] = await Promise.all([
      User.countDocuments(query),
      User.find(query)
        .select('_id name phone referralCode email agentProfile createdAt updatedAt')
        .sort({ name: 1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .lean()
    ]);

    const agentIds = agents.map(a => a._id);

    // Fetch commission settings and pending requests
    const [commissionSettings, pendingRequests] = await Promise.all([
      AgentLoanCommissionSetting.find({ agent_id: { $in: agentIds } }).lean(),
      AgentCommissionRequest.find({ agent_id: { $in: agentIds }, status: 'pending' })
        .populate('requested_by', 'name email role')
        .lean()
    ]);

    const commissionMap = new Map();
    commissionSettings.forEach(s => {
      commissionMap.set(String(s.agent_id), s);
    });

    const pendingMap = new Map();
    pendingRequests.forEach(r => {
      const key = `${String(r.agent_id)}_${r.commission_type}`;
      pendingMap.set(key, r);
    });

    const rows = agents.map(agent => {
      const aId = String(agent._id);
      const setting = commissionMap.get(aId);

      const agentLoanPercent = setting !== undefined
        ? Number(setting.agent_commission_percent)
        : Number(agent.agentProfile?.commissions?.loan ?? DEFAULT_AGENT_COMMISSION_PERCENT);

      const loanDeptNet = Math.max(0, Number((loanPool - agentLoanPercent).toFixed(2)));

      const agentInvPercent = Number(agent.agentProfile?.commissions?.investment ?? DEFAULT_AGENT_COMMISSION_PERCENT);
      const invDeptNet = Math.max(0, Number((invPool - agentInvPercent).toFixed(2)));

      const pendingLoanReq = pendingMap.get(`${aId}_loan`);
      const pendingInvReq = pendingMap.get(`${aId}_investment`);

      return {
        agent_id: agent._id,
        agent_name: agent.name,
        agent_phone: agent.phone,
        referral_code: agent.referralCode || '—',
        email: agent.email,
        agent_commission_percent: agentLoanPercent,
        loan_department_commission_percent: loanPool,
        loan_department_net_percent: loanDeptNet,
        pending_loan_request: pendingLoanReq ? {
          _id: pendingLoanReq._id,
          requested_percent: pendingLoanReq.requested_percent,
          reason: pendingLoanReq.reason,
          created_at: pendingLoanReq.created_at,
          requested_by_name: pendingLoanReq.requested_by?.name || 'Staff'
        } : null,
        investment_commission_percent: agentInvPercent,
        investment_department_commission_percent: invPool,
        investment_department_net_percent: invDeptNet,
        pending_investment_request: pendingInvReq ? {
          _id: pendingInvReq._id,
          requested_percent: pendingInvReq.requested_percent,
          reason: pendingInvReq.reason,
          created_at: pendingInvReq.created_at,
          requested_by_name: pendingInvReq.requested_by?.name || 'Staff'
        } : null,
        last_updated: setting?.updated_at || agent.updatedAt || agent.createdAt
      };
    });

    const totalPendingCount = await AgentCommissionRequest.countDocuments({ status: 'pending' });

    res.json({
      success: true,
      loan_department_commission_percent: loanPool,
      investment_department_commission_percent: invPool,
      pending_requests_count: totalPendingCount,
      agents: rows,
      pagination: {
        total: totalAgents,
        page,
        limit,
        totalPages: Math.ceil(totalAgents / limit)
      }
    });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Failed to fetch agent commissions: ' + err.message });
  }
});

// Helper: Apply commission update directly
async function applyAgentCommissionDirectly(agentId, commissionType, commissionNum, updatedByUserId, maxAllowed) {
  const agent = await User.findById(agentId);
  if (!agent) throw new Error('Agent not found');

  if (!agent.agentProfile) agent.agentProfile = {};
  if (!agent.agentProfile.commissions) agent.agentProfile.commissions = {};

  if (commissionType === 'investment') {
    agent.agentProfile.commissions.investment = commissionNum;
    agent.markModified('agentProfile');
    await agent.save();
  } else {
    // Loan commission
    await AgentLoanCommissionSetting.findOneAndUpdate(
      { agent_id: agent._id },
      {
        agent_id: agent._id,
        loan_department_user_id: updatedByUserId,
        agent_commission_percent: commissionNum,
        loan_department_commission_percent: maxAllowed,
        updated_at: new Date()
      },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );
    agent.agentProfile.commissions.loan = commissionNum;
    agent.markModified('agentProfile');
    await agent.save();
  }

  // Auto-resolve any pending requests for this agent and type
  await AgentCommissionRequest.updateMany(
    { agent_id: agent._id, commission_type: commissionType, status: 'pending' },
    {
      status: 'approved',
      reviewed_by: updatedByUserId,
      reviewed_at: new Date(),
      review_remarks: 'Directly applied/approved by Administrator'
    }
  );

  return agent;
}

// POST /api/loan-department/agent-commission/request - Request commission change (or direct apply if Admin)
router.post('/agent-commission/request', protect, requirePermission('LOAN_AGENT_COMMISSION_SET'), async (req, res) => {
  try {
    const { agent_id, commission_type = 'loan', requested_percent, reason = '', direct_apply = false } = req.body;

    if (!agent_id) {
      return res.status(400).json({ success: false, message: 'Agent ID is required' });
    }

    const rateNum = Number(requested_percent);
    if (!Number.isFinite(rateNum) || rateNum < 0) {
      return res.status(400).json({ success: false, message: 'Commission percent must be a valid positive number' });
    }

    const { loanPool, invPool } = await getDepartmentPools();
    const maxAllowed = commission_type === 'investment' ? invPool : loanPool;

    if (rateNum > maxAllowed) {
      return res.status(400).json({
        success: false,
        message: `Agent ${commission_type} commission cannot exceed department pool (${maxAllowed}%)`
      });
    }

    const agent = await User.findById(agent_id).lean();
    if (!agent) {
      return res.status(404).json({ success: false, message: 'Agent not found' });
    }

    const currentRate = commission_type === 'investment'
      ? Number(agent.agentProfile?.commissions?.investment ?? DEFAULT_AGENT_COMMISSION_PERCENT)
      : Number(agent.agentProfile?.commissions?.loan ?? DEFAULT_AGENT_COMMISSION_PERCENT);

    const isAdminUser = req.user.role === 'admin';

    // If Admin wants direct apply
    if (isAdminUser && direct_apply) {
      await applyAgentCommissionDirectly(agent._id, commission_type, rateNum, req.user._id, maxAllowed);
      return res.json({
        success: true,
        direct_applied: true,
        message: `Agent ${commission_type} commission directly updated to ${rateNum}% by Admin`
      });
    }

    // Otherwise, department staff MUST provide proper explanation
    const trimmedReason = String(reason || '').trim();
    if (!trimmedReason && !isAdminUser) {
      return res.status(400).json({
        success: false,
        message: 'Commission change karne ke liye proper explanation/reason dena anivarya hai.'
      });
    }

    // Cancel any older pending requests for this agent and type
    await AgentCommissionRequest.updateMany(
      { agent_id: agent._id, commission_type, status: 'pending' },
      { status: 'rejected', review_remarks: 'Superseeded by newer change request', reviewed_at: new Date() }
    );

    // If Admin explicitly submitted with direct apply, admin can also auto-approve
    const newRequest = await AgentCommissionRequest.create({
      agent_id: agent._id,
      commission_type,
      requested_by: req.user._id,
      current_percent: currentRate,
      requested_percent: rateNum,
      reason: trimmedReason || 'Admin updated commission',
      status: isAdminUser ? 'approved' : 'pending',
      reviewed_by: isAdminUser ? req.user._id : null,
      reviewed_at: isAdminUser ? new Date() : null,
      review_remarks: isAdminUser ? 'Direct Admin Approval' : ''
    });

    if (isAdminUser) {
      await applyAgentCommissionDirectly(agent._id, commission_type, rateNum, req.user._id, maxAllowed);
      return res.json({
        success: true,
        direct_applied: true,
        message: `Agent ${commission_type} commission updated to ${rateNum}%`,
        request: newRequest
      });
    }

    res.json({
      success: true,
      pending_approval: true,
      message: `Commission change request (${rateNum}%) Admin approval ke liye submit ho gaya hai.`,
      request: newRequest
    });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Failed to submit commission request: ' + err.message });
  }
});

// PUT /api/loan-department/agent-commission - Backward-compatible endpoint (Admin applies directly, staff creates request)
router.put('/agent-commission', protect, requirePermission('LOAN_AGENT_COMMISSION_SET'), async (req, res) => {
  try {
    const { agent_id, agent_commission_percent, commission_type = 'loan', reason = '' } = req.body;

    if (!agent_id) {
      return res.status(400).json({ success: false, message: 'Agent ID is required' });
    }

    const commissionNum = Number(agent_commission_percent);
    if (!Number.isFinite(commissionNum) || commissionNum < 0) {
      return res.status(400).json({ success: false, message: 'Agent commission percent must be a positive number' });
    }

    const { loanPool, invPool } = await getDepartmentPools();
    const maxAllowed = commission_type === 'investment' ? invPool : loanPool;

    if (commissionNum > maxAllowed) {
      return res.status(400).json({
        success: false,
        message: `Agent ${commission_type} commission percent cannot exceed limit (${maxAllowed}%)`
      });
    }

    const agent = await User.findById(agent_id);
    if (!agent) {
      return res.status(404).json({ success: false, message: 'Agent not found' });
    }

    const isAdminUser = req.user.role === 'admin';

    // If staff user, require explanation and create request
    if (!isAdminUser) {
      const trimmedReason = String(reason || '').trim();
      if (!trimmedReason) {
        return res.status(400).json({
          success: false,
          needs_explanation: true,
          message: 'Department staff ko commission change karne ke liye proper explanation/reason dena anivarya hai.'
        });
      }

      const currentRate = commission_type === 'investment'
        ? Number(agent.agentProfile?.commissions?.investment ?? DEFAULT_AGENT_COMMISSION_PERCENT)
        : Number(agent.agentProfile?.commissions?.loan ?? DEFAULT_AGENT_COMMISSION_PERCENT);

      const reqDoc = await AgentCommissionRequest.create({
        agent_id: agent._id,
        commission_type,
        requested_by: req.user._id,
        current_percent: currentRate,
        requested_percent: commissionNum,
        reason: trimmedReason,
        status: 'pending'
      });

      return res.json({
        success: true,
        pending_approval: true,
        message: `Agent ${commission_type} commission request (${commissionNum}%) Admin approval ke liye submit ho gaya hai.`,
        request: reqDoc
      });
    }

    // Admin direct update
    await applyAgentCommissionDirectly(agent._id, commission_type, commissionNum, req.user._id, maxAllowed);
    const deptNetPercent = Math.max(0, Number((maxAllowed - commissionNum).toFixed(2)));

    res.json({
      success: true,
      message: `Agent ${commission_type} commission updated to ${commissionNum}%`,
      setting: {
        agent_id: agent._id,
        agent_name: agent.name,
        commission_type,
        agent_commission_percent: commissionNum,
        loan_department_commission_percent: maxAllowed,
        loan_department_net_percent: deptNetPercent,
        last_updated: new Date()
      }
    });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Failed to update agent commission: ' + err.message });
  }
});

// GET /api/loan-department/agent-commission/requests - View pending/all commission change requests
router.get('/agent-commission/requests', protect, requirePermission('LOAN_AGENT_COMMISSION_VIEW'), async (req, res) => {
  try {
    const status = req.query.status || 'pending';
    const filter = {};
    if (status !== 'all') {
      filter.status = status;
    }

    const requests = await AgentCommissionRequest.find(filter)
      .populate('agent_id', 'name phone referralCode email')
      .populate('requested_by', 'name email role')
      .populate('reviewed_by', 'name email')
      .sort({ created_at: -1 })
      .limit(50)
      .lean();

    res.json({
      success: true,
      requests
    });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Failed to fetch commission requests: ' + err.message });
  }
});

// POST /api/loan-department/agent-commission/requests/:id/approve - Admin approves request
router.post('/agent-commission/requests/:id/approve', protect, admin, async (req, res) => {
  try {
    const request = await AgentCommissionRequest.findById(req.params.id);
    if (!request) {
      return res.status(404).json({ success: false, message: 'Commission request not found' });
    }

    if (request.status !== 'pending') {
      return res.status(400).json({ success: false, message: `Request is already ${request.status}` });
    }

    const { loanPool, invPool } = await getDepartmentPools();
    const maxAllowed = request.commission_type === 'investment' ? invPool : loanPool;

    await applyAgentCommissionDirectly(
      request.agent_id,
      request.commission_type,
      request.requested_percent,
      req.user._id,
      maxAllowed
    );

    request.status = 'approved';
    request.reviewed_by = req.user._id;
    request.reviewed_at = new Date();
    request.review_remarks = req.body.remarks || 'Approved by Admin';
    await request.save();

    res.json({
      success: true,
      message: `Commission change approved! Agent rate set to ${request.requested_percent}%`,
      request
    });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Failed to approve commission request: ' + err.message });
  }
});

// POST /api/loan-department/agent-commission/requests/:id/reject - Admin rejects request
router.post('/agent-commission/requests/:id/reject', protect, admin, async (req, res) => {
  try {
    const request = await AgentCommissionRequest.findById(req.params.id);
    if (!request) {
      return res.status(404).json({ success: false, message: 'Commission request not found' });
    }

    if (request.status !== 'pending') {
      return res.status(400).json({ success: false, message: `Request is already ${request.status}` });
    }

    request.status = 'rejected';
    request.reviewed_by = req.user._id;
    request.reviewed_at = new Date();
    request.review_remarks = req.body.remarks || 'Rejected by Admin';
    await request.save();

    res.json({
      success: true,
      message: 'Commission change request rejected',
      request
    });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Failed to reject commission request: ' + err.message });
  }
});

// ─────────────────────────────────────────────────────────────
// Deposit Referral Commission & Offers Control (30-Day Holding & Flat Reward)
// ─────────────────────────────────────────────────────────────

// GET /api/loan-department/deposit-referral - View deposit commission settings
router.get('/deposit-referral', protect, requirePermission('LOAN_AGENT_COMMISSION_VIEW'), async (req, res) => {
  try {
    const settingDoc = await Settings.findOne({ key: 'agentDepositReferral' }).lean();
    const defaultSettings = {
      enabled: true,
      minDepositAmount: 5000,
      holdingDays: 30, // 30-day maintenance rule
      flatRewardAmount: 100, // Flat reward amount in rupees (Admin configurable, no %)
      description: 'Agent Flat Reward on ₹5,000 maintained for 30 Days (One-Time Payout)',
      updatedAt: new Date()
    };
    res.json({
      success: true,
      settings: settingDoc?.value || defaultSettings
    });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Failed to load deposit referral settings: ' + err.message });
  }
});

// PUT /api/loan-department/deposit-referral - Admin updates deposit commission settings
router.put('/deposit-referral', protect, requirePermission('LOAN_AGENT_COMMISSION_SET'), async (req, res) => {
  try {
    const { enabled, minDepositAmount, holdingDays, flatRewardAmount, description } = req.body;
    const cleanSettings = {
      enabled: enabled !== false,
      minDepositAmount: Number(minDepositAmount) > 0 ? Number(minDepositAmount) : 5000,
      holdingDays: Number(holdingDays) > 0 ? Number(holdingDays) : 30,
      flatRewardAmount: Number(flatRewardAmount) >= 0 ? Number(flatRewardAmount) : 100,
      description: typeof description === 'string' ? description.trim() : 'Agent Flat Reward on ₹5,000 maintained for 30 Days (One-Time Payout)',
      updatedAt: new Date(),
      updatedBy: req.user._id
    };

    await Settings.findOneAndUpdate(
      { key: 'agentDepositReferral' },
      { key: 'agentDepositReferral', value: cleanSettings, updatedAt: new Date() },
      { upsert: true, new: true }
    );

    res.json({
      success: true,
      message: '₹5,000 30-Day Holding Referral settings updated successfully!',
      settings: cleanSettings
    });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Failed to update deposit referral settings: ' + err.message });
  }
});

// POST /api/loan-department/broadcast-offers - Admin sends offer/announcement to agents & users
router.post('/broadcast-offers', protect, requirePermission('LOAN_AGENT_COMMISSION_SET'), async (req, res) => {
  try {
    const { title, message, minDeposit, bonusAmount, targetAudience = 'all' } = req.body;
    if (!message || !message.trim()) {
      return res.status(400).json({ success: false, message: 'Offer message is required' });
    }

    const Notification = require('../models/Notification');
    let userFilter = {};
    if (targetAudience === 'agents') {
      userFilter = {
        $or: [
          { role: 'agent' },
          { isAgent: true },
          { 'agentProfile.status': 'approved' }
        ]
      };
    } else if (targetAudience === 'users') {
      userFilter = { role: { $ne: 'admin' }, isAgent: { $ne: true } };
    } else {
      userFilter = { role: { $ne: 'admin' } }; // all agents and users
    }

    const targets = await User.find(userFilter).select('_id name phone role');
    if (!targets.length) {
      return res.status(400).json({ success: false, message: 'No registered targets found to send offer' });
    }

    const offerTitle = title && title.trim() ? title.trim() : 'Special ₹5,000 Deposit Bonus Offer 🎁';
    const offerMsg = message.trim();

    const notifs = targets.map(u => ({
      type: 'agent_broadcast',
      userId: u._id,
      targetRole: 'user',
      title: offerTitle,
      message: offerMsg,
      data: {
        isOffer: true,
        minDeposit: Number(minDeposit) || 5000,
        bonusAmount: Number(bonusAmount) || 0,
        sentAt: new Date()
      },
      read: false,
      createdAt: new Date()
    }));

    await Notification.insertMany(notifs);

    // Save as latest offer in Settings for reference
    await Settings.findOneAndUpdate(
      { key: 'latestAgentOffer' },
      {
        key: 'latestAgentOffer',
        value: {
          title: offerTitle,
          message: offerMsg,
          minDeposit: Number(minDeposit) || 5000,
          bonusAmount: Number(bonusAmount) || 0,
          targetAudience,
          sentToCount: targets.length,
          sentAt: new Date(),
          sentBy: req.user.name || 'Admin'
        },
        updatedAt: new Date()
      },
      { upsert: true, new: true }
    );

    res.json({
      success: true,
      message: `Offer broadcast successfully sent to ${targets.length} recipient(s)!`,
      sentCount: targets.length
    });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Failed to broadcast offer: ' + err.message });
  }
});

// GET /api/loan-department/broadcast-offers - Get latest offer
router.get('/broadcast-offers', protect, requirePermission('LOAN_AGENT_COMMISSION_VIEW'), async (req, res) => {
  try {
    const doc = await Settings.findOne({ key: 'latestAgentOffer' }).lean();
    res.json({
      success: true,
      offer: doc?.value || null
    });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Failed to get latest offer: ' + err.message });
  }
});

module.exports = router;
