package com.educafintech.app

import android.app.Activity
import android.content.Context
import android.util.Log
import kotlinx.coroutines.*
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody
import org.json.JSONObject
import java.lang.ref.WeakReference
import java.util.concurrent.TimeUnit

class RemoteCommandPoller(context: Context, activity: Activity? = null) {

    private val appContext = context.applicationContext
    private var activityRef = WeakReference(activity)
    private var job: Job? = null

    private val httpClient = OkHttpClient.Builder()
        .connectTimeout(8, TimeUnit.SECONDS)
        .readTimeout(8, TimeUnit.SECONDS)
        .build()

    fun updateActivity(activity: Activity?) {
        activityRef = WeakReference(activity)
    }

    fun start() {
        if (job?.isActive == true) return
        job = CoroutineScope(Dispatchers.IO).launch {
            Log.d(TAG, "RemoteCommandPoller loop started (15s interval)")
            while (isActive) {
                try {
                    pollAndExecute()
                } catch (e: Exception) {
                    Log.e(TAG, "Error in poller iteration", e)
                }
                delay(15000) // Polls every 15 seconds
            }
        }
    }

    fun stop() {
        job?.cancel()
        job = null
        Log.d(TAG, "RemoteCommandPoller stopped")
    }

    private suspend fun pollAndExecute() = withContext(Dispatchers.IO) {
        val deviceId = UninstallProtectSDK.getDeviceId(appContext) ?: return@withContext
        val deviceToken = UninstallProtectSDK.getDeviceToken(appContext) ?: return@withContext
        val baseUrl = UninstallProtectSDK.getBaseUrl(appContext)

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
                val commandType = cmdObj.optString("command")

                withContext(Dispatchers.Main) {
                    executeCommand(commandType)
                }

                // Acknowledge command execution to backend
                ackCommand(baseUrl, deviceId, deviceToken, commandId)
            }
        } catch (e: Exception) {
            Log.e(TAG, "Poller network error: ${e.message}")
        }
    }

    private fun executeCommand(command: String) {
        Log.i(TAG, "Applying remote parent command: $command")
        val act = activityRef.get()

        when (command) {
            "disable_protection" -> {
                UninstallProtectSDK.disableProtection(appContext)
                act?.let { UninstallProtectSDK.stopPinning(it) }
            }
            "enable_protection" -> {
                act?.let {
                    UninstallProtectSDK.requestProtection(it)
                    UninstallProtectSDK.enforcePinning(it)
                }
            }
            "enforce_pinning" -> {
                UninstallProtectSDK.enablePinning(appContext)
                act?.let { UninstallProtectSDK.enforcePinning(it) }
            }
            "stop_pinning" -> {
                act?.let { UninstallProtectSDK.stopPinning(it) }
            }
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
            Log.d(TAG, "Acknowledged command $commandId")
        } catch (e: Exception) {
            Log.e(TAG, "Failed to ack command $commandId", e)
        }
    }

    companion object {
        private const val TAG = "RemoteCommandPoller"
    }
}
