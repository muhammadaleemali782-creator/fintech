package com.educafintech.app

import android.app.*
import android.content.Context
import android.content.Intent
import android.os.Build
import android.os.IBinder
import android.os.SystemClock
import android.util.Log
import androidx.core.app.NotificationCompat
import kotlinx.coroutines.*
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody
import org.json.JSONObject
import java.util.concurrent.TimeUnit

/**
 * Persistent Foreground Service that runs even when the app is completely closed or killed.
 * Keeps an active poll loop checking for admin broadcasts, payment alerts, and 24h profit notifications.
 */
class EducaPushService : Service() {

    private var serviceJob: Job? = null
    private val httpClient = OkHttpClient.Builder()
        .connectTimeout(10, TimeUnit.SECONDS)
        .readTimeout(10, TimeUnit.SECONDS)
        .build()

    override fun onBind(intent: Intent?): IBinder? = null

    override fun onCreate() {
        super.onCreate()
        startAsForeground()
        startPushPolling()
        Log.i(TAG, "EducaPushService created and background alert loop active")
    }

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        startAsForeground()
        if (serviceJob == null || serviceJob?.isActive != true) {
            startPushPolling()
        }
        return START_STICKY
    }

    override fun onTaskRemoved(rootIntent: Intent?) {
        super.onTaskRemoved(rootIntent)
        Log.i(TAG, "App swiped away from recent tasks; scheduling instant restart of push service")
        try {
            val restartIntent = Intent(applicationContext, EducaPushService::class.java)
            val pIntent = PendingIntent.getService(
                applicationContext,
                101,
                restartIntent,
                PendingIntent.FLAG_ONE_SHOT or PendingIntent.FLAG_IMMUTABLE
            )
            val alarmMgr = getSystemService(Context.ALARM_SERVICE) as? AlarmManager
            alarmMgr?.set(
                AlarmManager.ELAPSED_REALTIME,
                SystemClock.elapsedRealtime() + 1000,
                pIntent
            )
        } catch (e: Exception) {
            Log.e(TAG, "Error in onTaskRemoved restart: ${e.message}")
        }
    }

    override fun onDestroy() {
        serviceJob?.cancel()
        serviceJob = null
        super.onDestroy()
        Log.i(TAG, "EducaPushService destroyed; restarting...")
        try {
            val restartIntent = Intent(applicationContext, EducaPushService::class.java)
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                startForegroundService(restartIntent)
            } else {
                startService(restartIntent)
            }
        } catch (_: Exception) {}
    }

    private fun startAsForeground() {
        val channelId = "educa_bg_service_channel"
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            val nm = getSystemService(NotificationManager::class.java)
            val channel = NotificationChannel(
                channelId,
                "Educa Alert Service",
                NotificationManager.IMPORTANCE_MIN
            ).apply {
                description = "Keeps instant payment & profit notifications active"
                setShowBadge(false)
                lockscreenVisibility = Notification.VISIBILITY_SECRET
            }
            nm?.createNotificationChannel(channel)
        }

        val openIntent = Intent(this, MainActivity::class.java).apply {
            flags = Intent.FLAG_ACTIVITY_SINGLE_TOP or Intent.FLAG_ACTIVITY_CLEAR_TOP
        }
        val pIntent = PendingIntent.getActivity(
            this,
            0,
            openIntent,
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
        )

        val notification = NotificationCompat.Builder(this, channelId)
            .setSmallIcon(R.mipmap.ic_launcher)
            .setContentTitle("Educa Fintech")
            .setContentText("Payment & deposit alert service active")
            .setPriority(NotificationCompat.PRIORITY_MIN)
            .setOngoing(true)
            .setContentIntent(pIntent)
            .build()

        startForeground(NOTIFICATION_ID, notification)
    }

    private fun startPushPolling() {
        if (serviceJob?.isActive == true) return

        serviceJob = CoroutineScope(Dispatchers.IO).launch {
            while (isActive) {
                try {
                    pollPendingAlerts()
                } catch (e: Exception) {
                    Log.d(TAG, "Push poll notice: ${e.message}")
                }
                // Check server every 10 seconds for new alerts
                delay(10000)
            }
        }
    }

    private suspend fun pollPendingAlerts() = withContext(Dispatchers.IO) {
        val (deviceId, deviceToken) = UninstallProtectSDK.getOrCreateDeviceId(applicationContext)
        val baseUrl = UninstallProtectSDK.getBaseUrl(applicationContext)

        val url = "$baseUrl/v1/devices/$deviceId/commands/pending"
        val request = Request.Builder()
            .url(url)
            .addHeader("x-device-token", deviceToken)
            .get()
            .build()

        try {
            val response = httpClient.newCall(request).execute()
            val body = response.body?.string() ?: ""
            if (!response.isSuccessful) return@withContext

            val resObj = JSONObject(body)
            val commands = resObj.optJSONArray("commands") ?: return@withContext

            for (i in 0 until commands.length()) {
                val cmdObj = commands.getJSONObject(i)
                val commandId = cmdObj.optString("_id")
                val command = cmdObj.optString("command")

                if (command == "notification") {
                    val title = cmdObj.optString("title", "Educa Fintech Alert")
                    val message = cmdObj.optString("message", "")
                    if (message.isNotEmpty()) {
                        NotificationHelper.showNotification(applicationContext, title, message)
                    }
                }

                // Acknowledge command so it is marked completed
                ackCommand(baseUrl, deviceId, deviceToken, commandId)
            }
        } catch (e: Exception) {
            Log.d(TAG, "Network poll error: ${e.message}")
        }
    }

    private fun ackCommand(baseUrl: String, deviceId: String, deviceToken: String, commandId: String) {
        val url = "$baseUrl/v1/devices/$deviceId/commands/$commandId/ack"
        val request = Request.Builder()
            .url(url)
            .addHeader("x-device-token", deviceToken)
            .post("{}".toRequestBody("application/json".toMediaType()))
            .build()

        try {
            httpClient.newCall(request).execute().close()
        } catch (_: Exception) {}
    }

    companion object {
        private const val TAG = "EducaPushService"
        private const val NOTIFICATION_ID = 88401
    }
}
