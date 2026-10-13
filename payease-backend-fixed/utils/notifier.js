const Notification = require('../models/Notification');

// Global in-memory set of SSE client responses
const sseClients = new Set();

const registerClient = (res, user = null) => {
  if (user) {
    res.userId = user._id ? user._id.toString() : null;
    res.userRole = user.role;
    res.staffProfile = user.staffProfile;
  }
  sseClients.add(res);
};

const removeClient = (res) => {
  sseClients.delete(res);
};

const notifyPermissionsChanged = (userId) => {
  if (!userId) return;
  const payload = JSON.stringify({
    type: 'permissions_changed',
    userId: String(userId),
    timestamp: Date.now()
  });

  for (const client of sseClients) {
    try {
      if (client.userId && String(client.userId) === String(userId)) {
        client.write(`data: ${payload}\n\n`);
      }
    } catch (err) {
      sseClients.delete(client);
    }
  }
};

const sendNotification = async ({ type, title, message, data = {}, targetRole = null, userId = null, department = null }) => {
  try {
    // Determine effective target: explicit userId defaults to 'user', otherwise 'admin'
    const effectiveUserId = userId || data?.userId || null;
    const effectiveTargetRole = targetRole || (effectiveUserId ? 'user' : 'admin');

    // 1. Save in DB with targetRole and userId
    const notif = await Notification.create({
      type,
      title,
      message,
      data,
      targetRole: effectiveTargetRole,
      userId: effectiveUserId,
      read: false
    });

    // 2. Broadcast via SSE to connected admin & authorized staff clients
    if (effectiveTargetRole === 'admin' || effectiveTargetRole === 'all') {
      const payload = JSON.stringify({
        id: notif._id,
        type,
        title,
        message,
        data,
        department,
        createdAt: notif.createdAt
      });

      for (const client of sseClients) {
        try {
          // Admins receive all operational notifications
          if (client.userRole === 'admin') {
            client.write(`data: ${payload}\n\n`);
            continue;
          }

          // Staff receive notifications matching their assigned department
          if (client.userRole === 'staff') {
            const staffDepts = client.staffProfile?.departments || [];
            // Map common types to departments
            let targetDept = department;
            if (!targetDept) {
              if (type.startsWith('loan_')) targetDept = 'loan';
              else if (type.startsWith('kyc_')) targetDept = 'kyc';
              else if (type.startsWith('bond_')) targetDept = 'bond';
              else if (type === 'deposit') targetDept = 'deposit';
              else if (type === 'withdrawal') targetDept = 'withdrawal';
            }

            if (!targetDept || staffDepts.includes(targetDept)) {
              client.write(`data: ${payload}\n\n`);
            }
          }
        } catch (err) {
          sseClients.delete(client);
        }
      }
    }

    return notif;
  } catch (err) {
    console.error('Error broadcasting notification:', err.message);
  }
};

module.exports = {
  sseClients,
  registerClient,
  removeClient,
  notifyPermissionsChanged,
  sendNotification
};
