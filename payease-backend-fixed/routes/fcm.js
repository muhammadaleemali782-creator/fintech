const express = require('express');
const router = express.Router();
const User = require('../models/User');
const DeviceCommand = require('../models/DeviceCommand');

// 1. Register or update FCM token from Android device
router.post('/register-token', async (req, res) => {
  try {
    const { fcmToken, token, userId, deviceId } = req.body;
    const targetToken = fcmToken || token;

    if (!targetToken) {
      return res.status(400).json({ message: 'fcmToken is required' });
    }

    let updatedUser = null;

    // If request contains authorization header (Bearer token)
    if (req.headers.authorization && req.headers.authorization.startsWith('Bearer')) {
      try {
        const jwt = require('jsonwebtoken');
        const decoded = jwt.verify(req.headers.authorization.split(' ')[1], process.env.JWT_SECRET);
        if (decoded?.id) {
          updatedUser = await User.findByIdAndUpdate(decoded.id, { fcmToken: targetToken }, { new: true });
        }
      } catch (e) {
        // Auth token optional for initial FCM registration
      }
    }

    const mongoose = require('mongoose');
    if (!updatedUser && userId && mongoose.isValidObjectId(userId)) {
      updatedUser = await User.findByIdAndUpdate(userId, { fcmToken: targetToken }, { new: true });
    }

    // Save to Device record as well
    const Device = require('../models/Device');
    let updatedDevice = null;
    if (deviceId) {
      updatedDevice = await Device.findOneAndUpdate({ deviceId }, { fcmToken: targetToken }, { new: true });
    }
    const devTokenHeader = req.headers['x-device-token'];
    if (!updatedDevice && devTokenHeader) {
      updatedDevice = await Device.findOneAndUpdate({ deviceToken: devTokenHeader }, { fcmToken: targetToken }, { new: true });
    }

    return res.json({
      success: true,
      message: 'FCM token registered successfully',
      registered: Boolean(updatedUser || updatedDevice)
    });
  } catch (err) {
    console.error('FCM register-token error:', err);
    res.status(500).json({ message: 'Failed to register FCM token' });
  }
});

// 2. Dispatch push notification to device
// Sends via DeviceCommand (which instant poller receives in Android app)
// And also fires Firebase Admin / Cloud Messaging if configured
router.post('/send-push', async (req, res) => {
  try {
    const { userId, title, message, sound } = req.body;
    if (!title || !message) {
      return res.status(400).json({ message: 'title and message are required' });
    }

    const mongoose = require('mongoose');
    let fcmToken = null;
    let targetUserId = (userId && mongoose.isValidObjectId(userId)) ? userId : null;

    if (targetUserId) {
      const user = await User.findById(targetUserId);
      if (user) fcmToken = user.fcmToken;
    }

    const Device = require('../models/Device');
    let targetDeviceId = req.body.deviceId || 'all';
    if (targetUserId) {
      const dev = await Device.findOne({ userId: targetUserId });
      if (dev?.deviceId) targetDeviceId = dev.deviceId;
    }

    // 1. Broadcast to DeviceCommand so Android app displays Heads-Up notification instantly
    const command = await DeviceCommand.create({
      deviceId: targetDeviceId,
      userId: targetUserId || null,
      command: 'notification',
      title: title.trim(),
      message: message.trim(),
      payload: { sound: sound || 'chime', timestamp: new Date().toISOString() },
      status: 'pending'
    });

    // If deviceId is 'all', also deliver to every registered active device
    if (targetDeviceId === 'all') {
      const allDevs = await Device.find({});
      for (const d of allDevs) {
        await DeviceCommand.create({
          deviceId: d.deviceId,
          userId: d.userId,
          command: 'notification',
          title: title.trim(),
          message: message.trim(),
          payload: { sound: sound || 'chime', timestamp: new Date().toISOString() },
          status: 'pending'
        }).catch(() => {});
      }
    }

    // 2. Attempt FCM HTTP v1 / legacy if FCM server key is provided
    let fcmSent = false;
    const fcmServerKey = process.env.FCM_SERVER_KEY;
    if (fcmServerKey) {
      const tokens = [];
      if (fcmToken) {
        tokens.push(fcmToken);
      } else if (targetDeviceId === 'all') {
        const usersWithToken = await User.find({ fcmToken: { $ne: null, $exists: true } }, 'fcmToken');
        usersWithToken.forEach(u => { if (u.fcmToken) tokens.push(u.fcmToken); });
        const devsWithToken = await Device.find({ fcmToken: { $ne: null, $exists: true } }, 'fcmToken');
        devsWithToken.forEach(d => { if (d.fcmToken && !tokens.includes(d.fcmToken)) tokens.push(d.fcmToken); });
      }

      for (const t of tokens) {
        try {
          await fetch('https://fcm.googleapis.com/fcm/send', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `key=${fcmServerKey}`
            },
            body: JSON.stringify({
              to: t,
              notification: {
                title: title.trim(),
                body: message.trim(),
                sound: 'default'
              },
              data: {
                title: title.trim(),
                message: message.trim()
              },
              priority: 'high'
            })
          });
          fcmSent = true;
        } catch (fcmErr) {
          console.warn('Direct FCM push send error:', fcmErr.message);
        }
      }
    }

    res.json({
      success: true,
      message: 'Notification dispatched successfully',
      commandId: command._id,
      deviceId: targetDeviceId,
      fcmTokenRegistered: Boolean(fcmToken),
      fcmSent
    });
  } catch (err) {
    console.error('FCM send-push error:', err);
    res.status(500).json({ message: 'Failed to send notification: ' + err.message });
  }
});

// 3. Status Check / Diagnostics for FCM
router.get('/status', async (req, res) => {
  try {
    const fcmKeyConfigured = Boolean(process.env.FCM_SERVER_KEY);
    const usersWithFcm = await User.countDocuments({ fcmToken: { $ne: null, $exists: true } });
    const pendingCommands = await DeviceCommand.countDocuments({ command: 'notification', status: 'pending' });

    res.json({
      success: true,
      service: 'Firebase Cloud Messaging & Device Command Bus',
      fcmServerKeyConfigured: fcmKeyConfigured,
      registeredFcmTokensCount: usersWithFcm,
      pendingNotificationCommands: pendingCommands,
      timestamp: new Date().toISOString()
    });
  } catch (err) {
    res.status(500).json({ message: 'Failed to check FCM status' });
  }
});

module.exports = router;
