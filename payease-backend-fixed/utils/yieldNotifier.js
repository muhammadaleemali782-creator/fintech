const User = require('../models/User');
const DeviceCommand = require('../models/DeviceCommand');
const Device = require('../models/Device');
const Notification = require('../models/Notification');
const { processDailyYield } = require('../routes/user');

/**
 * Dispatches 24-hour profit notification to an individual user's phone
 * "Aapka 24 hours me itna paisa bada hai. Aur paisa deposit kariye aur baithe-baithe kamaiye!"
 */
async function sendDailyYieldAlertToUser(user, profitAmount) {
  try {
    const formattedProfit = Number(profitAmount).toFixed(2);
    const title = `💰 ₹${formattedProfit} Daily Profit Credited!`;
    const message = `Namaste ${user.name}! Pichle 24 ghante me aapka ₹${formattedProfit} munafa (12% p.a.) credit ho gaya hai. Aur paisa deposit kariye aur baithe-baithe kamaiye! 🚀`;

    // 1. Save in in-app Notification database
    await Notification.create({
      type: 'general',
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

    // 2. Dispatch to Android App DeviceCommand queue for Heads-Up notification on phone
    let deviceId = 'all';
    try {
      const dev = await Device.findOne({ userId: user._id });
      if (dev?.deviceId) deviceId = dev.deviceId;
    } catch (_) {}

    await DeviceCommand.create({
      deviceId,
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

    return true;
  } catch (err) {
    console.error(`Error sending daily yield alert to user ${user._id}:`, err.message);
    return false;
  }
}

/**
 * Runs 24h yield calculation and dispatches phone notifications to all depositors
 */
async function distribute24hYieldAndNotifyAll() {
  console.log('⏰ Starting 24h yield calculation and notification dispatch...');
  const users = await User.find({ balance: { $gt: 0 }, isBlocked: { $ne: true } });
  let processedCount = 0;
  let notificationsSent = 0;

  for (const user of users) {
    try {
      const oldProfit = user.profitBalance || 0;
      await processDailyYield(user);
      const updatedUser = await User.findById(user._id);
      const earned = Number(((updatedUser?.profitBalance || 0) - oldProfit).toFixed(2));
      const estimated24h = Number(((user.balance * (user.interestRate || 12) / 100) / 365).toFixed(2));
      const amountToNotify = earned > 0 ? earned : (estimated24h > 0 ? estimated24h : 0);

      if (amountToNotify > 0) {
        await sendDailyYieldAlertToUser(user, amountToNotify);
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
