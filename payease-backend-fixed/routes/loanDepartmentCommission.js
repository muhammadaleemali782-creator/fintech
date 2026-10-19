const express = require('express');
const router = express.Router();
const { protect, requirePermission } = require('../middleware/auth');
const User = require('../models/User');
const AgentLoanCommissionSetting = require('../models/AgentLoanCommissionSetting');
const {
  DEFAULT_LOAN_DEPARTMENT_COMMISSION_PERCENT,
  DEFAULT_AGENT_COMMISSION_PERCENT
} = require('../constants/loanSettingsDefaults');

// GET /api/loan-department/agent-commission - View agent loan commission list
router.get('/agent-commission', protect, requirePermission('LOAN_AGENT_COMMISSION_VIEW'), async (req, res) => {
  try {
    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit, 10) || 25));
    const search = (req.query.search || '').trim();

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
            { name: { $regex: search, $options: 'i' } },
            { phone: { $regex: search, $options: 'i' } },
            { referralCode: { $regex: search, $options: 'i' } },
            { email: { $regex: search, $options: 'i' } }
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
    const commissionSettings = await AgentLoanCommissionSetting.find({
      agent_id: { $in: agentIds }
    }).lean();

    const commissionMap = new Map();
    commissionSettings.forEach(s => {
      commissionMap.set(String(s.agent_id), s);
    });

    const rows = agents.map(agent => {
      const aId = String(agent._id);
      const setting = commissionMap.get(aId);
      const agentCommissionPercent = setting !== undefined
        ? Number(setting.agent_commission_percent)
        : Number(agent.agentProfile?.commissions?.loan ?? DEFAULT_AGENT_COMMISSION_PERCENT);

      const deptCommissionPercent = setting?.loan_department_commission_percent !== undefined
        ? Number(setting.loan_department_commission_percent)
        : DEFAULT_LOAN_DEPARTMENT_COMMISSION_PERCENT;

      const deptNetPercent = Math.max(0, Number((deptCommissionPercent - agentCommissionPercent).toFixed(2)));
      const lastUpdated = setting?.updated_at || agent.updatedAt || agent.createdAt;

      return {
        agent_id: agent._id,
        agent_name: agent.name,
        agent_phone: agent.phone,
        referral_code: agent.referralCode || '—',
        email: agent.email,
        agent_commission_percent: agentCommissionPercent,
        loan_department_commission_percent: deptCommissionPercent,
        loan_department_net_percent: deptNetPercent,
        last_updated: lastUpdated
      };
    });

    res.json({
      success: true,
      loan_department_commission_percent: DEFAULT_LOAN_DEPARTMENT_COMMISSION_PERCENT,
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

// PUT /api/loan-department/agent-commission - Set/Edit agent loan commission
router.put('/agent-commission', protect, requirePermission('LOAN_AGENT_COMMISSION_SET'), async (req, res) => {
  try {
    const { agent_id, agent_commission_percent } = req.body;

    if (!agent_id) {
      return res.status(400).json({ success: false, message: 'Agent ID is required' });
    }

    const commissionNum = Number(agent_commission_percent);
    if (!Number.isFinite(commissionNum) || commissionNum < 0) {
      return res.status(400).json({ success: false, message: 'Agent commission percent must be a positive number' });
    }

    const maxAllowed = DEFAULT_LOAN_DEPARTMENT_COMMISSION_PERCENT; // 5%
    if (commissionNum > maxAllowed) {
      return res.status(400).json({
        success: false,
        message: `Agent commission percent cannot exceed Loan Department commission limit (${maxAllowed}%)`
      });
    }

    const agent = await User.findById(agent_id);
    if (!agent) {
      return res.status(404).json({ success: false, message: 'Agent not found' });
    }

    // Upsert AgentLoanCommissionSetting
    const updatedSetting = await AgentLoanCommissionSetting.findOneAndUpdate(
      { agent_id: agent._id },
      {
        agent_id: agent._id,
        loan_department_user_id: req.user._id,
        agent_commission_percent: commissionNum,
        loan_department_commission_percent: maxAllowed,
        updated_at: new Date()
      },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );

    // Sync User.agentProfile.commissions.loan
    if (!agent.agentProfile) agent.agentProfile = {};
    if (!agent.agentProfile.commissions) agent.agentProfile.commissions = {};
    agent.agentProfile.commissions.loan = commissionNum;
    agent.markModified('agentProfile');
    await agent.save();

    const deptNetPercent = Math.max(0, Number((maxAllowed - commissionNum).toFixed(2)));

    res.json({
      success: true,
      message: `Agent loan commission updated to ${commissionNum}%`,
      setting: {
        agent_id: agent._id,
        agent_name: agent.name,
        agent_commission_percent: commissionNum,
        loan_department_commission_percent: maxAllowed,
        loan_department_net_percent: deptNetPercent,
        last_updated: updatedSetting.updated_at
      }
    });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Failed to update agent commission: ' + err.message });
  }
});

module.exports = router;
