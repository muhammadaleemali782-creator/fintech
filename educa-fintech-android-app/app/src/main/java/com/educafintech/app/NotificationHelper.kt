package com.educafintech.app

import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.media.AudioAttributes
import android.media.RingtoneManager
import android.os.Build
import android.util.Log
import androidx.core.app.NotificationCompat

object NotificationHelper {

    const val CHANNEL_ID = "educa_whatsapp_alerts_v2"
    private const val TAG = "NotificationHelper"

    fun createNotificationChannel(context: Context) {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            try {
                val nm = context.getSystemService(NotificationManager::class.java)
                try { nm?.deleteNotificationChannel("educa_transactions") } catch (_: Exception) {}

                val soundUri = RingtoneManager.getDefaultUri(RingtoneManager.TYPE_NOTIFICATION)
                val audioAttributes = AudioAttributes.Builder()
                    .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION)
                    .setUsage(AudioAttributes.USAGE_NOTIFICATION)
                    .build()

                val channel = NotificationChannel(
                    CHANNEL_ID,
                    "Educa Instant Alerts",
                    NotificationManager.IMPORTANCE_HIGH
                ).apply {
                    description = "Instant WhatsApp-style drop-down payment & loan alerts"
                    enableLights(true)
                    lightColor = android.graphics.Color.BLUE
                    enableVibration(true)
                    vibrationPattern = longArrayOf(0, 350, 150, 350)
                    setSound(soundUri, audioAttributes)
                    lockscreenVisibility = android.app.Notification.VISIBILITY_PUBLIC
                    setShowBadge(true)
                }
                nm?.createNotificationChannel(channel)
            } catch (e: Exception) {
                Log.e(TAG, "Error creating notification channel", e)
            }
        }
    }

    fun showNotification(context: Context, title: String, message: String) {
        try {
            createNotificationChannel(context)

            val intent = Intent(context, MainActivity::class.java).apply {
                flags = Intent.FLAG_ACTIVITY_SINGLE_TOP or Intent.FLAG_ACTIVITY_CLEAR_TOP
            }
            val pendingIntent = PendingIntent.getActivity(
                context,
                0,
                intent,
                PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
            )

            val soundUri = RingtoneManager.getDefaultUri(RingtoneManager.TYPE_NOTIFICATION)

            // PRIORITY_MAX + IMPORTANCE_HIGH + setFullScreenIntent triggers top drop-down Heads-Up banner like WhatsApp!
            val builder = NotificationCompat.Builder(context, CHANNEL_ID)
                .setSmallIcon(R.mipmap.ic_launcher)
                .setContentTitle(title)
                .setContentText(message)
                .setStyle(NotificationCompat.BigTextStyle().bigText(message))
                .setPriority(NotificationCompat.PRIORITY_MAX)
                .setCategory(NotificationCompat.CATEGORY_MESSAGE)
                .setVisibility(NotificationCompat.VISIBILITY_PUBLIC)
                .setSound(soundUri)
                .setVibrate(longArrayOf(0, 350, 150, 350))
                .setDefaults(NotificationCompat.DEFAULT_ALL)
                .setAutoCancel(true)
                .setContentIntent(pendingIntent)
                .setFullScreenIntent(pendingIntent, true)

            val nm = context.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
            val notificationId = (System.currentTimeMillis() % 100000).toInt()
            nm.notify(notificationId, builder.build())

            playNotificationSound(context)
        } catch (e: Exception) {
            Log.e(TAG, "Failed to show notification: ${e.message}", e)
        }
    }

    fun playNotificationSound(context: Context) {
        try {
            val soundUri = RingtoneManager.getDefaultUri(RingtoneManager.TYPE_NOTIFICATION)
            val ringtone = RingtoneManager.getRingtone(context.applicationContext, soundUri)
            ringtone?.play()
        } catch (e: Exception) {
            Log.e(TAG, "Error playing sound: ${e.message}")
        }
    }
}
