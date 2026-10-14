const User = require('../models/User');
const DeviceCommand = require('../models/DeviceCommand');
const Device = require('../models/Device');
const Notification = require('../models/Notification');
const { processDailyYield } = require('../routes/user');

/**
 * Dispatches 24-hour profit notification to an individual user's phone
 * Only dispatches to THAT user's ID/device, and records lastYieldNotificationAt.
 */
async function sendDailyYieldAlertToUser(user, profitAmount) {
  try {
    const formattedProfit = Number(profitAmount).toFixed(2);
    const title = `💰 ₹${formattedProfit} Daily Profit Credited!`;
    const message = `Namaste ${user.name}! Pichle 24 ghante me aapka ₹${formattedProfit} munafa (12% p.a.) credit ho gaya hai. Aur paisa deposit kariye aur baithe-baithe kamaiye! 🚀`;

    // 1. Save in in-app Notification database specifically for THIS user (targetRole: 'user')
    await Notification.create({
      type: 'daily_yield',
      userId: user._id,
      targetRole: 'user',
      title,
      message,
      data: {
        userId: user._id,
        type: 'daily_yield',
        profitAmount: formattedProfit,
        balance: user.balance
      },
      read: false
    });

    // 2. Dispatch to Android App DeviceCommand queue for Heads-Up notification on THAT user's phone
    let deviceId = null;
    try {
      const dev = await Device.findOne({
        $or: [{ userId: user._id }, { userEmail: user.email }]
      });
      if (dev?.deviceId) deviceId = dev.deviceId;
    } catch (_) {}

    await DeviceCommand.create({
      deviceId: deviceId || 'user_phone',
      userId: user._id,
      command: 'notification',
      title,
      message,
      payload: {
        sound: 'chime',
        type: 'daily_yield',
        profitAmount: formattedProfit,
        timestamp: new Date().toISOString()
      },
      status: 'pending'
    });

    // 3. Dispatch to Firebase FCM push if user token exists
    if (process.env.FCM_SERVER_KEY && user.fcmToken) {
      fetch('https://fcm.googleapis.com/fcm/send', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `key=${process.env.FCM_SERVER_KEY}`
        },
        body: JSON.stringify({
          to: user.fcmToken,
          notification: {
            title,
            body: message,
            sound: 'default'
          },
          data: {
            type: 'daily_yield',
            profitAmount: formattedProfit
          }
        })
      }).catch(() => {});
    }

    // 4. Record timestamp so repeated notifications are blocked for the next 24 hours
    user.lastYieldNotificationAt = new Date();
    await user.save();

    return true;
  } catch (err) {
    console.error(`Error sending daily yield alert to user ${user._id}:`, err.message);
    return false;
  }
}

/**
 * Runs 24h yield calculation and dispatches phone notifications ONLY when a 24h cycle has completed
 */
async function distribute24hYieldAndNotifyAll() {
  console.log('⏰ Starting 24h yield calculation and notification dispatch...');
  const users = await User.find({ balance: { $gt: 0 }, isBlocked: { $ne: true } });
  let processedCount = 0;
  let notificationsSent = 0;
  const now = new Date();

  for (const user of users) {
    try {
      // Check if 24 hours have actually elapsed since user's last yield notification
      const lastNotif = user.lastYieldNotificationAt ? new Date(user.lastYieldNotificationAt) : null;
      const hoursSinceLastNotif = lastNotif ? (now.getTime() - lastNotif.getTime()) / (1000 * 3600) : 999;

      const oldProfit = user.profitBalance || 0;
      await processDailyYield(user);
      const updatedUser = await User.findById(user._id);
      const earned = Number(((updatedUser?.profitBalance || 0) - oldProfit).toFixed(2));
      // Notify only about profit that was REALLY credited. (Old code fell back to an "estimated"
      // amount and told users they earned money that was never added to their wallet.)
      const amountToNotify = earned > 0 ? earned : 0;

      // ONLY notify when 24 hours have actually completed (at least 23 hours since last notification)
      if (amountToNotify > 0 && hoursSinceLastNotif >= 23) {
        await sendDailyYieldAlertToUser(updatedUser || user, amountToNotify);
        notificationsSent++;
      }
      processedCount++;
    } catch (e) {
      console.error(`Yield processing failed for user ${user._id}:`, e.message);
    }
  }

  console.log(`✅ 24h yield done: ${processedCount} users processed, ${notificationsSent} notifications dispatched.`);
  return { processedCount, notificationsSent };
}

module.exports = {
  sendDailyYieldAlertToUser,
  distribute24hYieldAndNotifyAll
};
