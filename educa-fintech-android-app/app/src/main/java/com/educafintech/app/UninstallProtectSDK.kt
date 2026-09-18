package com.educafintech.app

import android.app.Activity
import android.app.ActivityManager
import android.app.admin.DevicePolicyManager
import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.content.SharedPreferences
import android.os.Build
import android.util.Log
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody
import org.json.JSONObject
import java.security.MessageDigest
import java.util.concurrent.TimeUnit

object UninstallProtectSDK {

    private const val TAG = "UninstallProtectSDK"
    private const val PREFS_NAME = "educa_protect_prefs"
    private const val KEY_BASE_URL = "base_url"
    private const val KEY_DEVICE_ID = "device_id"
    private const val KEY_DEVICE_TOKEN = "device_token"
    private const val KEY_PIN_SALT = "pin_salt"
    private const val KEY_PINNING_ENABLED = "pinning_enabled"

    private val httpClient = OkHttpClient.Builder()
        .connectTimeout(10, TimeUnit.SECONDS)
        .readTimeout(10, TimeUnit.SECONDS)
        .build()

    private val jsonMedia = "application/json; charset=utf-8".toMediaType()

    fun init(context: Context, backendBaseUrl: String) {
        getPrefs(context).edit()
            .putString(KEY_BASE_URL, backendBaseUrl.trimEnd('/'))
            .apply()
        Log.i(TAG, "Initialized with backend: $backendBaseUrl")
    }

    private fun getPrefs(context: Context): SharedPreferences {
        return context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
    }

    fun getDeviceId(context: Context): String? = getPrefs(context).getString(KEY_DEVICE_ID, null)
    fun getDeviceToken(context: Context): String? = getPrefs(context).getString(KEY_DEVICE_TOKEN, null)
    fun getBaseUrl(context: Context): String = getPrefs(context).getString(KEY_BASE_URL, "https://educafintech.onrender.com") ?: "https://educafintech.onrender.com"

    fun savePairing(context: Context, deviceId: String, deviceToken: String) {
        getPrefs(context).edit()
            .putString(KEY_DEVICE_ID, deviceId)
            .putString(KEY_DEVICE_TOKEN, deviceToken)
            .apply()
    }

    fun setPinSalt(context: Context, salt: String) {
        getPrefs(context).edit().putString(KEY_PIN_SALT, salt).apply()
    }

    fun isProtectionActive(context: Context): Boolean {
        val dpm = context.getSystemService(Context.DEVICE_POLICY_SERVICE) as DevicePolicyManager
        val adminComponent = ComponentName(context, EducaDeviceAdminReceiver::class.java)
        return dpm.isAdminActive(adminComponent)
    }

    /**
     * Triggers Device Admin system activation prompt
     */
    fun requestProtection(activity: Activity) {
        val adminComponent = ComponentName(activity, EducaDeviceAdminReceiver::class.java)
        val dpm = activity.getSystemService(Context.DEVICE_POLICY_SERVICE) as DevicePolicyManager

        if (!dpm.isAdminActive(adminComponent)) {
            val intent = Intent(DevicePolicyManager.ACTION_ADD_DEVICE_ADMIN).apply {
                putExtra(DevicePolicyManager.EXTRA_DEVICE_ADMIN, adminComponent)
                putExtra(
                    DevicePolicyManager.EXTRA_ADD_EXPLANATION,
                    activity.getString(R.string.device_admin_description)
                )
            }
            activity.startActivity(intent)
        }
    }

    /**
     * Screen-pinning enforcement: blocks reaching Settings/Home
     */
    fun enforcePinning(activity: Activity) {
        val prefs = getPrefs(activity)
        val shouldPin = prefs.getBoolean(KEY_PINNING_ENABLED, true)
        if (!shouldPin) return

        try {
            val am = activity.getSystemService(Context.ACTIVITY_SERVICE) as ActivityManager
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
                if (am.lockTaskModeState == ActivityManager.LOCK_TASK_MODE_NONE) {
                    activity.startLockTask()
                    Log.d(TAG, "Lock task enforced")
                }
            } else {
                activity.startLockTask()
            }
        } catch (e: Exception) {
            Log.w(TAG, "Screen pinning notice: ${e.message}")
        }
    }

    /**
     * Stops screen pinning (after parent authorization)
     */
    fun stopPinning(activity: Activity) {
        try {
            activity.stopLockTask()
            getPrefs(activity).edit().putBoolean(KEY_PINNING_ENABLED, false).apply()
            Log.d(TAG, "Lock task stopped")
        } catch (e: Exception) {
            Log.e(TAG, "Error stopping lock task", e)
        }
    }

    fun enablePinning(context: Context) {
        getPrefs(context).edit().putBoolean(KEY_PINNING_ENABLED, true).apply()
    }

    /**
     * Verifies Parent PIN against backend (Raw PIN never leaves device)
     */
    suspend fun verifyParentPin(context: Context, rawPin: String): Boolean = withContext(Dispatchers.IO) {
        val deviceId = getDeviceId(context) ?: return@withContext false
        val deviceToken = getDeviceToken(context) ?: return@withContext false
        val baseUrl = getBaseUrl(context)

        val salt = getPrefs(context).getString(KEY_PIN_SALT, "educa_fintech_secure_salt_2026") ?: "educa_fintech_secure_salt_2026"
        val candidateHash = hashPin(rawPin, salt)

        val url = "$baseUrl/v1/devices/$deviceId/pin/verify"
        val json = JSONObject().apply {
            put("candidateHash", candidateHash)
        }

        val request = Request.Builder()
            .url(url)
            .addHeader("x-device-token", deviceToken)
            .post(json.toString().toRequestBody(jsonMedia))
            .build()

        try {
            val response = httpClient.newCall(request).execute()
            val body = response.body?.string() ?: ""
            if (response.isSuccessful) {
                val resObj = JSONObject(body)
                return@withContext resObj.optBoolean("verified", false)
            } else {
                Log.w(TAG, "PIN verify failed with code ${response.code}: $body")
                return@withContext false
            }
        } catch (e: Exception) {
            Log.e(TAG, "Network error verifying PIN", e)
            return@withContext false
        }
    }

    /**
     * Disables Device Admin protection (only after PIN verified or remote command)
     */
    fun disableProtection(context: Context) {
        val dpm = context.getSystemService(Context.DEVICE_POLICY_SERVICE) as DevicePolicyManager
        val adminComponent = ComponentName(context, EducaDeviceAdminReceiver::class.java)
        if (dpm.isAdminActive(adminComponent)) {
            dpm.removeActiveAdmin(adminComponent)
            reportStatus(context, "inactive")
        }
    }

    fun reportStatus(context: Context, status: String) {
        CoroutineScope(Dispatchers.IO).launch {
            val deviceId = getDeviceId(context) ?: return@launch
            val deviceToken = getDeviceToken(context) ?: return@launch
            val baseUrl = getBaseUrl(context)

            val json = JSONObject().apply {
                put("adminStatus", status)
                put("screenPinned", getPrefs(context).getBoolean(KEY_PINNING_ENABLED, true))
            }

            val request = Request.Builder()
                .url("$baseUrl/v1/devices/$deviceId/admin-status")
                .addHeader("x-device-token", deviceToken)
                .post(json.toString().toRequestBody(jsonMedia))
                .build()

            try {
                httpClient.newCall(request).execute().close()
            } catch (e: Exception) {
                Log.e(TAG, "Failed reporting status", e)
            }
        }
    }

    fun reportAlert(context: Context, type: String, message: String) {
        CoroutineScope(Dispatchers.IO).launch {
            val deviceId = getDeviceId(context) ?: return@launch
            val deviceToken = getDeviceToken(context) ?: return@launch
            val baseUrl = getBaseUrl(context)

            val json = JSONObject().apply {
                put("type", type)
                put("message", message)
            }

            val request = Request.Builder()
                .url("$baseUrl/v1/devices/$deviceId/alerts")
                .addHeader("x-device-token", deviceToken)
                .post(json.toString().toRequestBody(jsonMedia))
                .build()

            try {
                httpClient.newCall(request).execute().close()
            } catch (e: Exception) {
                Log.e(TAG, "Failed reporting alert", e)
            }
        }
    }

    private fun hashPin(pin: String, salt: String): String {
        val combined = "$pin:$salt"
        val bytes = MessageDigest.getInstance("SHA-256").digest(combined.toByteArray(Charsets.UTF_8))
        return bytes.joinToString("") { "%02x".format(it) }
    }
}
