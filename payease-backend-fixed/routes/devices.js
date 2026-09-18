const express = require('express');
const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const Device = require('../models/Device');
const DeviceCommand = require('../models/DeviceCommand');
const DeviceAlert = require('../models/DeviceAlert');
const { sendNotification } = require('../utils/notifier');
const router = express.Router();

// Middleware: Verify parent auth token
const requireParentAuth = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ message: 'Parent authentication required' });
    }
    const token = authHeader.split(' ')[1];
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.parentId = decoded.id;
    next();
  } catch (err) {
    return res.status(401).json({ message: 'Invalid or expired parent session' });
  }
};

// Middleware: Verify child device token
const requireDeviceAuth = async (req, res, next) => {
  try {
    const { deviceId } = req.params;
    const token = req.headers['x-device-token'] || req.headers.authorization?.replace('Bearer ', '');
    if (!token) return res.status(401).json({ message: 'Device token required' });

    const device = await Device.findOne({ deviceId });
    if (!device || device.deviceToken !== token) {
      return res.status(403).json({ message: 'Device authentication failed' });
    }
    req.device = device;
    next();
  } catch (err) {
    return res.status(500).json({ message: 'Device auth error' });
  }
};

// ==========================================
// 1. PAIRING ENDPOINTS
// ==========================================

// Parent generates a 6-digit pairing code
router.post('/pairing/generate', requireParentAuth, async (req, res) => {
  try {
    const { deviceName = "Child's Phone" } = req.body;
    const pairingCode = Math.floor(100000 + Math.random() * 900000).toString();
    const deviceId = 'dev_' + crypto.randomBytes(8).toString('hex');

    const device = await Device.create({
      deviceId,
      parentId: req.parentId,
      deviceName,
      pairingCode,
      pairingCodeExpires: new Date(Date.now() + 15 * 60 * 1000), // 15 mins
      isPaired: false,
    });

    res.json({
      success: true,
      deviceId,
      pairingCode,
      expiresInMinutes: 15,
      message: 'Pairing code generated. Enter this in child app.',
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Failed to generate pairing code' });
  }
});

// Child device redeems the pairing code
router.post('/pairing/redeem', async (req, res) => {
  try {
    const { pairingCode, deviceModel } = req.body;
    if (!pairingCode) return res.status(400).json({ message: 'Pairing code required' });

    const device = await Device.findOne({
      pairingCode: pairingCode.trim(),
      pairingCodeExpires: { $gt: new Date() },
      isPaired: false,
    });

    if (!device) {
      return res.status(400).json({ message: 'Invalid or expired pairing code' });
    }

    const deviceToken = crypto.randomBytes(32).toString('hex');
    device.isPaired = true;
    device.deviceToken = deviceToken;
    device.pairingCode = null; // Single use
    if (deviceModel) device.deviceName = deviceModel;
    device.lastSeenAt = new Date();
    await device.save();

    res.json({
      success: true,
      deviceId: device.deviceId,
      deviceToken,
      message: 'Device successfully paired with parent account',
    });
  } catch (err) {
    res.status(500).json({ message: 'Pairing redeem failed' });
  }
});

// ==========================================
// 2. DEVICE ADMIN STATUS
// ==========================================

// Child reports status
router.post('/devices/:deviceId/admin-status', requireDeviceAuth, async (req, res) => {
  try {
    const { adminStatus, screenPinned } = req.body;
    req.device.adminStatus = adminStatus || req.device.adminStatus;
    if (typeof screenPinned === 'boolean') req.device.screenPinned = screenPinned;
    req.device.lastSeenAt = new Date();
    await req.device.save();

    res.json({ success: true, status: req.device.adminStatus });
  } catch (err) {
    res.status(500).json({ message: 'Failed to update status' });
  }
});

// Parent reads device status
router.get('/devices/:deviceId/admin-status', requireParentAuth, async (req, res) => {
  try {
    const { deviceId } = req.params;
    const device = await Device.findOne({ deviceId, parentId: req.parentId });
    if (!device) return res.status(404).json({ message: 'Device not found' });

    res.json({
      deviceId: device.deviceId,
      deviceName: device.deviceName,
      adminStatus: device.adminStatus,
      screenPinned: device.screenPinned,
      isPaired: device.isPaired,
      lastSeenAt: device.lastSeenAt,
    });
  } catch (err) {
    res.status(500).json({ message: 'Failed to read status' });
  }
});

// ==========================================
// 3. PIN SETTING & VERIFICATION (SECURE)
// ==========================================

// Parent sets PIN
router.post('/devices/:deviceId/pin', requireParentAuth, async (req, res) => {
  try {
    const { deviceId } = req.params;
    const { pinHash, pinSalt } = req.body;
    if (!pinHash || !pinSalt) return res.status(400).json({ message: 'pinHash and pinSalt required' });

    const device = await Device.findOne({ deviceId, parentId: req.parentId });
    if (!device) return res.status(404).json({ message: 'Device not found' });

    device.pinHash = pinHash;
    device.pinSalt = pinSalt;
    device.failedAttempts = 0;
    device.lockedUntil = null;
    await device.save();

    res.json({ success: true, message: 'Parent PIN hash configured' });
  } catch (err) {
    res.status(500).json({ message: 'Failed to set PIN' });
  }
});

// Verify PIN from Child App (Rate limited + Lockout)
router.post('/devices/:deviceId/pin/verify', requireDeviceAuth, async (req, res) => {
  try {
    const { candidateHash } = req.body;
    const device = req.device;

    if (!device.pinHash) {
      return res.status(400).json({ message: 'No PIN set for this device' });
    }

    // Check lockout
    if (device.lockedUntil && device.lockedUntil > new Date()) {
      const waitSec = Math.ceil((device.lockedUntil - Date.now()) / 1000);
      return res.status(429).json({
        verified: false,
        message: `Too many failed attempts. Device locked for ${waitSec}s`,
        locked: true,
      });
    }

    if (candidateHash === device.pinHash) {
      device.failedAttempts = 0;
      device.lockedUntil = null;
      await device.save();
      return res.json({ verified: true, message: 'PIN verified successfully' });
    } else {
      device.failedAttempts += 1;
      if (device.failedAttempts >= 5) {
        device.lockedUntil = new Date(Date.now() + 10 * 60 * 1000); // 10 min lockout
        // Log security alert
        await DeviceAlert.create({
          deviceId: device.deviceId,
          type: 'pin_bruteforce_lockout',
          message: '5 consecutive invalid PIN attempts. Device locked for 10 minutes.',
        });
      }
      await device.save();
      return res.status(401).json({
        verified: false,
        message: 'Invalid PIN',
        remainingAttempts: Math.max(0, 5 - device.failedAttempts),
      });
    }
  } catch (err) {
    res.status(500).json({ message: 'PIN verification failed' });
  }
});

// ==========================================
// 4. REMOTE COMMANDS QUEUE
// ==========================================

// Parent queues a remote command
router.post('/devices/:deviceId/commands', requireParentAuth, async (req, res) => {
  try {
    const { deviceId } = req.params;
    const { command } = req.body; // 'enable_protection' | 'disable_protection' | 'enforce_pinning' | 'stop_pinning'

    const device = await Device.findOne({ deviceId, parentId: req.parentId });
    if (!device) return res.status(404).json({ message: 'Device not found' });

    const newCmd = await DeviceCommand.create({
      deviceId,
      command,
      status: 'pending',
    });

    res.json({
      success: true,
      commandId: newCmd._id,
      command: newCmd.command,
      message: `Remote command '${command}' queued. Will be executed within 15 seconds.`,
    });
  } catch (err) {
    res.status(500).json({ message: 'Failed to queue command' });
  }
});

// Child polls for pending commands (every ~15s)
router.get('/devices/:deviceId/commands/pending', requireDeviceAuth, async (req, res) => {
  try {
    const { deviceId } = req.params;
    req.device.lastSeenAt = new Date();
    await req.device.save();

    const pending = await DeviceCommand.find({ deviceId, status: 'pending' }).sort({ createdAt: 1 });
    res.json({ commands: pending });
  } catch (err) {
    res.status(500).json({ message: 'Failed to poll commands' });
  }
});

// Child acknowledges command
router.post('/devices/:deviceId/commands/:commandId/ack', requireDeviceAuth, async (req, res) => {
  try {
    const { commandId } = req.params;
    const cmd = await DeviceCommand.findByIdAndUpdate(
      commandId,
      { status: 'acknowledged', acknowledgedAt: new Date() },
      { new: true }
    );
    res.json({ success: true, cmd });
  } catch (err) {
    res.status(500).json({ message: 'Failed to ack command' });
  }
});

// ==========================================
// 5. ALERTS & LOGS
// ==========================================

// Child reports alert
router.post('/devices/:deviceId/alerts', requireDeviceAuth, async (req, res) => {
  try {
    const { deviceId } = req.params;
    const { type, message, metadata } = req.body;
    const alert = await DeviceAlert.create({
      deviceId,
      type,
      message,
      metadata: metadata || {},
    });

    sendNotification({
      type: 'device_alert',
      title: '📱 Device Activity',
      message: message || 'Device activity detected',
      data: { deviceId, alertType: type }
    }).catch(() => {});

    res.json({ success: true, alertId: alert._id });
  } catch (err) {
    res.status(500).json({ message: 'Failed to record alert' });
  }
});

// Parent reads alerts
router.get('/devices/:deviceId/alerts', requireParentAuth, async (req, res) => {
  try {
    const { deviceId } = req.params;
    const alerts = await DeviceAlert.find({ deviceId }).sort({ timestamp: -1 }).limit(50);
    res.json({ alerts });
  } catch (err) {
    res.status(500).json({ message: 'Failed to fetch alerts' });
  }
});

// ==========================================
// 6. AUTO-REGISTRATION & ADMIN DEVICE CONTROL
// ==========================================

// App auto-registers logged in user device
router.post('/devices/register-login', async (req, res) => {
  try {
    const { userId, userEmail, userName, deviceModel } = req.body;
    if (!userEmail) return res.status(400).json({ message: 'userEmail required' });

    let device = await Device.findOne({ userEmail });
    if (!device) {
      const deviceId = 'dev_' + crypto.randomBytes(8).toString('hex');
      const deviceToken = crypto.randomBytes(32).toString('hex');
      device = await Device.create({
        deviceId,
        deviceToken,
        userId,
        userEmail,
        userName: userName || userEmail.split('@')[0],
        deviceName: deviceModel || 'Android Phone',
        isPaired: true,
        adminStatus: 'inactive',
        lastSeenAt: new Date()
      });
    } else {
      if (userId) device.userId = userId;
      if (userName) device.userName = userName;
      if (deviceModel) device.deviceName = deviceModel;
      device.lastSeenAt = new Date();
      if (!device.deviceToken) {
        device.deviceToken = crypto.randomBytes(32).toString('hex');
      }
      await device.save();
    }

    sendNotification({
      type: 'device_online',
      title: '📱 Device Connected',
      message: `${device.userName || device.deviceName} opened the app`,
      data: { deviceId: device.deviceId, userEmail: device.userEmail }
    }).catch(() => {});

    res.json({
      success: true,
      deviceId: device.deviceId,
      deviceToken: device.deviceToken,
      adminStatus: device.adminStatus
    });
  } catch (err) {
    console.error('Device register error:', err);
    res.status(500).json({ message: 'Failed to register device' });
  }
});

// Admin fetches all devices
router.get('/admin/devices', async (req, res) => {
  try {
    const devices = await Device.find().sort({ lastSeenAt: -1 }).limit(100);
    res.json({ success: true, devices });
  } catch (err) {
    res.status(500).json({ message: 'Failed to fetch devices' });
  }
});

// Admin locks device (sends enable_protection)
router.post('/admin/devices/:deviceId/lock', async (req, res) => {
  try {
    const { deviceId } = req.params;
    const device = await Device.findOne({ deviceId });
    if (!device) return res.status(404).json({ message: 'Device not found' });

    await DeviceCommand.create({
      deviceId,
      command: 'enable_protection',
      status: 'pending'
    });

    res.json({ success: true, message: 'Lock command queued for device!' });
  } catch (err) {
    res.status(500).json({ message: 'Failed to send lock command' });
  }
});

// Admin unlocks device (sends disable_protection)
router.post('/admin/devices/:deviceId/unlock', async (req, res) => {
  try {
    const { deviceId } = req.params;
    const device = await Device.findOne({ deviceId });
    if (!device) return res.status(404).json({ message: 'Device not found' });

    await DeviceCommand.create({
      deviceId,
      command: 'disable_protection',
      status: 'pending'
    });

    res.json({ success: true, message: 'Unlock command queued for device!' });
  } catch (err) {
    res.status(500).json({ message: 'Failed to send unlock command' });
  }
});

module.exports = router;
