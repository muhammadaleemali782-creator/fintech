package com.educafintech.app

import android.app.AlertDialog
import android.os.Build
import android.os.Bundle
import android.text.InputType
import android.widget.*
import androidx.appcompat.app.AppCompatActivity
import androidx.lifecycle.lifecycleScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody
import org.json.JSONObject

class MainActivity : AppCompatActivity() {

    private lateinit var poller: RemoteCommandPoller
    private lateinit var statusText: TextView
    private lateinit var pairBtn: Button
    private lateinit var parentUnlockBtn: Button
    private lateinit var activateAdminBtn: Button

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)

        // Initialize SDK with live Render backend
        UninstallProtectSDK.init(this, "https://educafintech.onrender.com")

        // Programmatic modern UI
        val rootLayout = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            setPadding(48, 64, 48, 48)
            setBackgroundColor(0xFFFAFBFF.toInt())
        }

        val title = TextView(this).apply {
            text = "Educa Fintech"
            textSize = 24f
            setTextColor(0xFF0C1B3A.toInt())
            setTypeface(null, android.graphics.Typeface.BOLD)
        }
        rootLayout.addView(title)

        val subTitle = TextView(this).apply {
            text = "Student Account & Parental Protection Active"
            textSize = 13f
            setTextColor(0xFF64748B.toInt())
            setPadding(0, 8, 0, 32)
        }
        rootLayout.addView(subTitle)

        // Status Card
        statusText = TextView(this).apply {
            textSize = 14f
            setPadding(32, 32, 32, 32)
            setBackgroundColor(0xFFE2E8F0.toInt())
            setTextColor(0xFF0F172A.toInt())
        }
        rootLayout.addView(statusText)

        // Activate Admin Protection Button
        activateAdminBtn = Button(this).apply {
            text = "Activate OS Protection (Device Admin)"
            setBackgroundColor(0xFF1D6AE5.toInt())
            setTextColor(0xFFFFFFFF.toInt())
            setOnClickListener {
                UninstallProtectSDK.requestProtection(this@MainActivity)
            }
        }
        rootLayout.addView(activateAdminBtn)

        // Pairing Button
        pairBtn = Button(this).apply {
            text = "Pair with Parent Account"
            setOnClickListener { showPairingDialog() }
        }
        rootLayout.addView(pairBtn)

        // Parent Unlock Button
        parentUnlockBtn = Button(this).apply {
            text = "Parent In-Person Unlock (Enter PIN)"
            setBackgroundColor(0xFF0DC98A.toInt())
            setTextColor(0xFFFFFFFF.toInt())
            setOnClickListener { showParentPinDialog() }
        }
        rootLayout.addView(parentUnlockBtn)

        setContentView(rootLayout)

        poller = RemoteCommandPoller(this, this)
    }

    override fun onResume() {
        super.onResume()
        poller.updateActivity(this)
        poller.start()

        updateStatusUI()

        // Enforce screen pinning as specified
        if (UninstallProtectSDK.isProtectionActive(this)) {
            UninstallProtectSDK.enforcePinning(this)
        }
    }

    override fun onPause() {
        super.onPause()
        poller.updateActivity(null)
    }

    private fun updateStatusUI() {
        val isPaired = UninstallProtectSDK.getDeviceId(this) != null
        val isAdminActive = UninstallProtectSDK.isProtectionActive(this)

        val statusMsg = buildString {
            append("Pairing: ").append(if (isPaired) "PAIRED (Child Device)" else "NOT PAIRED").append("\n")
            append("OS Protection: ").append(if (isAdminActive) "ACTIVE (Protected from Uninstall)" else "INACTIVE")
        }
        statusText.text = statusMsg

        activateAdminBtn.isEnabled = !isAdminActive
        activateAdminBtn.text = if (isAdminActive) "Protection Active" else "Activate Protection"
    }

    private fun showPairingDialog() {
        val input = EditText(this).apply {
            hint = "Enter 6-digit Code from Parent"
            inputType = InputType.TYPE_CLASS_NUMBER
        }

        AlertDialog.Builder(this)
            .setTitle("Pair Child Phone")
            .setMessage("Ask parent for the 6-digit pairing code:")
            .setView(input)
            .setPositiveButton("Pair") { _, _ ->
                val code = input.text.toString().trim()
                if (code.isNotEmpty()) redeemPairing(code)
            }
            .setNegativeButton("Cancel", null)
            .show()
    }

    private fun redeemPairing(code: String) {
        lifecycleScope.launch(Dispatchers.IO) {
            val baseUrl = UninstallProtectSDK.getBaseUrl(this@MainActivity)
            val json = JSONObject().apply {
                put("pairingCode", code)
                put("deviceModel", "${Build.MANUFACTURER} ${Build.MODEL}")
            }
            val request = Request.Builder()
                .url("$baseUrl/v1/pairing/redeem")
                .post(json.toString().toRequestBody("application/json".toMediaType()))
                .build()

            try {
                val client = OkHttpClient()
                val response = client.newCall(request).execute()
                val body = response.body?.string() ?: ""
                if (response.isSuccessful) {
                    val obj = JSONObject(body)
                    val deviceId = obj.getString("deviceId")
                    val deviceToken = obj.getString("deviceToken")
                    UninstallProtectSDK.savePairing(this@MainActivity, deviceId, deviceToken)

                    withContext(Dispatchers.Main) {
                        Toast.makeText(this@MainActivity, "Paired successfully!", Toast.LENGTH_LONG).show()
                        updateStatusUI()
                        UninstallProtectSDK.requestProtection(this@MainActivity)
                    }
                } else {
                    withContext(Dispatchers.Main) {
                        Toast.makeText(this@MainActivity, "Invalid code or expired", Toast.LENGTH_SHORT).show()
                    }
                }
            } catch (e: Exception) {
                withContext(Dispatchers.Main) {
                    Toast.makeText(this@MainActivity, "Network error: ${e.message}", Toast.LENGTH_SHORT).show()
                }
            }
        }
    }

    private fun showParentPinDialog() {
        val input = EditText(this).apply {
            hint = "Enter Parent Secret PIN"
            inputType = InputType.TYPE_CLASS_NUMBER or InputType.TYPE_NUMBER_VARIATION_PASSWORD
        }

        AlertDialog.Builder(this)
            .setTitle("Parent Authorization")
            .setMessage("Enter the parent PIN to temporarily disable pinning/protection:")
            .setView(input)
            .setPositiveButton("Verify & Unlock") { _, _ ->
                val pin = input.text.toString().trim()
                if (pin.isNotEmpty()) {
                    lifecycleScope.launch {
                        val verified = UninstallProtectSDK.verifyParentPin(this@MainActivity, pin)
                        if (verified) {
                            Toast.makeText(this@MainActivity, "PIN Verified! Unlocking...", Toast.LENGTH_SHORT).show()
                            UninstallProtectSDK.stopPinning(this@MainActivity)
                            UninstallProtectSDK.disableProtection(this@MainActivity)
                            updateStatusUI()
                        } else {
                            Toast.makeText(this@MainActivity, "Invalid PIN or Device Locked", Toast.LENGTH_LONG).show()
                        }
                    }
                }
            }
            .setNegativeButton("Cancel", null)
            .show()
    }
}
