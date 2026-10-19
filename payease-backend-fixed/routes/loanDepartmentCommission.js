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

      const investmentCommissionPercent = Number(agent.agentProfile?.commissions?.investment ?? DEFAULT_AGENT_COMMISSION_PERCENT);
      const investmentDeptCommissionPercent = DEFAULT_LOAN_DEPARTMENT_COMMISSION_PERCENT; // 5%
      const investmentDeptNetPercent = Math.max(0, Number((investmentDeptCommissionPercent - investmentCommissionPercent).toFixed(2)));

      return {
        agent_id: agent._id,
        agent_name: agent.name,
        agent_phone: agent.phone,
        referral_code: agent.referralCode || '—',
        email: agent.email,
        agent_commission_percent: agentCommissionPercent,
        loan_department_commission_percent: deptCommissionPercent,
        loan_department_net_percent: deptNetPercent,
        investment_commission_percent: investmentCommissionPercent,
        investment_department_commission_percent: investmentDeptCommissionPercent,
        investment_department_net_percent: investmentDeptNetPercent,
        last_updated: lastUpdated
      };
    });

    res.json({
      success: true,
      loan_department_commission_percent: DEFAULT_LOAN_DEPARTMENT_COMMISSION_PERCENT,
      investment_department_commission_percent: DEFAULT_LOAN_DEPARTMENT_COMMISSION_PERCENT,
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

// PUT /api/loan-department/agent-commission - Set/Edit agent commission (loan or investment)
router.put('/agent-commission', protect, requirePermission('LOAN_AGENT_COMMISSION_SET'), async (req, res) => {
  try {
    const { agent_id, agent_commission_percent, commission_type = 'loan' } = req.body;

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
        message: `Agent ${commission_type} commission percent cannot exceed limit (${maxAllowed}%)`
      });
    }

    const agent = await User.findById(agent_id);
    if (!agent) {
      return res.status(404).json({ success: false, message: 'Agent not found' });
    }

    if (!agent.agentProfile) agent.agentProfile = {};
    if (!agent.agentProfile.commissions) agent.agentProfile.commissions = {};

    let updatedSetting = null;

    if (commission_type === 'investment') {
      agent.agentProfile.commissions.investment = commissionNum;
      agent.markModified('agentProfile');
      await agent.save();

      const deptNetPercent = Math.max(0, Number((maxAllowed - commissionNum).toFixed(2)));

      return res.json({
        success: true,
        message: `Agent investment commission updated to ${commissionNum}%`,
        setting: {
          agent_id: agent._id,
          agent_name: agent.name,
          commission_type: 'investment',
          agent_commission_percent: commissionNum,
          loan_department_commission_percent: maxAllowed,
          loan_department_net_percent: deptNetPercent,
          last_updated: new Date()
        }
      });
    }

    // Default: Loan Commission
    updatedSetting = await AgentLoanCommissionSetting.findOneAndUpdate(
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
        commission_type: 'loan',
        agent_commission_percent: commissionNum,
        loan_department_commission_percent: maxAllowed,
        loan_department_net_percent: deptNetPercent,
        last_updated: updatedSetting ? updatedSetting.updated_at : new Date()
      }
    });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Failed to update agent commission: ' + err.message });
  }
});

module.exports = router;
