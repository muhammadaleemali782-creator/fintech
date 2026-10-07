package com.educafintech.app

import android.util.Log
import com.google.firebase.messaging.FirebaseMessagingService
import com.google.firebase.messaging.RemoteMessage
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody
import org.json.JSONObject
import java.util.concurrent.TimeUnit

class EducaFirebaseMessagingService : FirebaseMessagingService() {

    override fun onNewToken(token: String) {
        super.onNewToken(token)
        Log.i(TAG, "New FCM Token received: $token")
        // Cache token in preferences
        getSharedPreferences("educa_fcm_prefs", MODE_PRIVATE)
            .edit()
            .putString("fcm_token", token)
            .apply()

        // Sync with backend device registry
        sendTokenToServer(token)
    }

    override fun onMessageReceived(remoteMessage: RemoteMessage) {
        super.onMessageReceived(remoteMessage)
        Log.i(TAG, "FCM message received from: ${remoteMessage.from}")

        // Extract title and body from notification payload or data payload
        val title = remoteMessage.notification?.title
            ?: remoteMessage.data["title"]
            ?: "Educa Fintech Alert"

        val body = remoteMessage.notification?.body
            ?: remoteMessage.data["message"]
            ?: remoteMessage.data["body"]
            ?: "Aapka transaction update ho gaya hai"

        // Drop down WhatsApp-style notification with chime and vibration
        NotificationHelper.showNotification(applicationContext, title, body)
    }

    private fun sendTokenToServer(token: String) {
        CoroutineScope(Dispatchers.IO).launch {
            try {
                val baseUrl = UninstallProtectSDK.getBaseUrl(applicationContext)
                val deviceId = UninstallProtectSDK.getDeviceId(applicationContext)
                val deviceToken = UninstallProtectSDK.getDeviceToken(applicationContext)

                val client = OkHttpClient.Builder()
                    .connectTimeout(10, TimeUnit.SECONDS)
                    .build()

                val json = JSONObject().apply {
                    put("fcmToken", token)
                    put("deviceId", deviceId ?: "")
                }

                val reqBuilder = Request.Builder()
                    .url("$baseUrl/api/fcm/register-token")
                    .post(json.toString().toRequestBody("application/json".toMediaType()))

                if (!deviceToken.isNullOrEmpty()) {
                    reqBuilder.addHeader("x-device-token", deviceToken)
                }

                client.newCall(reqBuilder.build()).execute().close()
                Log.d(TAG, "FCM token synced to server successfully")
            } catch (e: Exception) {
                Log.w(TAG, "Failed to sync FCM token to server (will retry later): ${e.message}")
            }
        }
    }

    companion object {
        private const val TAG = "EducaFCMService"
    }
}
