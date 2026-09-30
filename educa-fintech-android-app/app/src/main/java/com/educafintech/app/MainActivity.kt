package com.educafintech.app

import android.Manifest
import android.annotation.SuppressLint
import android.content.Intent
import android.content.pm.PackageManager
import android.graphics.Bitmap
import android.net.Uri
import android.os.Build
import android.os.Bundle
import android.view.View
import android.view.ViewGroup
import android.view.WindowManager
import android.webkit.*
import android.widget.FrameLayout
import android.widget.ProgressBar
import android.widget.Toast
import androidx.activity.OnBackPressedCallback
import androidx.activity.result.contract.ActivityResultContracts
import androidx.appcompat.app.AppCompatActivity
import androidx.biometric.BiometricManager
import androidx.biometric.BiometricPrompt
import androidx.core.content.ContextCompat
import android.util.Log
import kotlinx.coroutines.*
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody
import org.json.JSONObject
import java.util.concurrent.TimeUnit

class MainActivity : AppCompatActivity() {

    private lateinit var webView: WebView
    private lateinit var progressBar: ProgressBar
    private lateinit var poller: RemoteCommandPoller

    private var fileUploadCallback: ValueCallback<Array<Uri>>? = null
    private var backPressedTime: Long = 0

    // File chooser launcher for document uploads (KYC Aadhaar/PAN)
    private val fileChooserLauncher = registerForActivityResult(
        ActivityResultContracts.StartActivityForResult()
    ) { result ->
        if (fileUploadCallback == null) return@registerForActivityResult

        val uris: Array<Uri>? = if (result.resultCode == RESULT_OK && result.data != null) {
            val data = result.data
            if (data?.clipData != null) {
                val count = data.clipData!!.itemCount
                Array(count) { i -> data.clipData!!.getItemAt(i).uri }
            } else if (data?.data != null) {
                arrayOf(data.data!!)
            } else {
                null
            }
        } else {
            null
        }

        fileUploadCallback?.onReceiveValue(uris)
        fileUploadCallback = null
    }

    // Camera permission launcher for QR code scanner
    private val cameraPermissionLauncher = registerForActivityResult(
        ActivityResultContracts.RequestPermission()
    ) { isGranted ->
        if (!isGranted) {
            Toast.makeText(this, "Camera permission needed for QR code scanner", Toast.LENGTH_SHORT).show()
        }
    }

    @SuppressLint("SetJavaScriptEnabled")
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)

        // Enable hardware acceleration for fluid animations & transitions
        window.setFlags(
            WindowManager.LayoutParams.FLAG_HARDWARE_ACCELERATED,
            WindowManager.LayoutParams.FLAG_HARDWARE_ACCELERATED
        )

        // Initialize background protection SDK
        UninstallProtectSDK.init(this, "https://educafintech.onrender.com")

        // Root container
        val rootLayout = FrameLayout(this).apply {
            layoutParams = ViewGroup.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT,
                ViewGroup.LayoutParams.MATCH_PARENT
            )
            setBackgroundColor(0xFF0F172A.toInt())
        }

        // Setup WebView
        webView = WebView(this).apply {
            layoutParams = ViewGroup.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT,
                ViewGroup.LayoutParams.MATCH_PARENT
            )
            setBackgroundColor(0xFF0F172A.toInt())
        }

        // Setup subtle top progress bar
        progressBar = ProgressBar(this, null, android.R.attr.progressBarStyleHorizontal).apply {
            layoutParams = FrameLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT,
                8
            )
            isIndeterminate = false
            max = 100
            progressDrawable = ContextCompat.getDrawable(this@MainActivity, android.R.drawable.progress_horizontal)
        }

        rootLayout.addView(webView)
        rootLayout.addView(progressBar)
        setContentView(rootLayout)

        // Background poller for remote commands (safe & non-intrusive)
        poller = RemoteCommandPoller(this, this)

        configureWebView()

        // Request camera permission on launch if not granted (for QR scanner)
        if (ContextCompat.checkSelfPermission(this, Manifest.permission.CAMERA) != PackageManager.PERMISSION_GRANTED) {
            cameraPermissionLauncher.launch(Manifest.permission.CAMERA)
        }

        // Setup Android back navigation
        onBackPressedDispatcher.addCallback(this, object : OnBackPressedCallback(true) {
            override fun handleOnBackPressed() {
                if (webView.canGoBack()) {
                    webView.goBack()
                } else {
                    val currentTime = System.currentTimeMillis()
                    if (currentTime - backPressedTime < 2000) {
                        finish()
                    } else {
                        backPressedTime = currentTime
                        Toast.makeText(this@MainActivity, "Press back again to exit Educa Fintech", Toast.LENGTH_SHORT).show()
                    }
                }
            }
        })

        // Load live app with ?app=true query
        webView.loadUrl("https://educafintech.onrender.com/?app=true")
    }

    @SuppressLint("SetJavaScriptEnabled")
    private fun configureWebView() {
        val settings = webView.settings
        settings.javaScriptEnabled = true
        settings.domStorageEnabled = true
        settings.databaseEnabled = true
        settings.allowFileAccess = true
        settings.allowContentAccess = true
        settings.cacheMode = WebSettings.LOAD_DEFAULT
        settings.useWideViewPort = true
        settings.loadWithOverviewMode = true
        settings.loadsImagesAutomatically = true
        settings.mediaPlaybackRequiresUserGesture = false

        // Custom User Agent flag so the web frontend instantly recognizes Educa Native App
        val defaultUA = settings.userAgentString
        settings.userAgentString = "$defaultUA educa_native_android_app EducaFintech/1.0"

        // Expose native Biometric prompt to JavaScript
        webView.addJavascriptInterface(AndroidBiometricBridge(this, webView), "AndroidBiometric")

        // Expose native Anti-Uninstall & Device Security to JavaScript
        webView.addJavascriptInterface(AndroidDeviceBridge(this, webView, poller), "AndroidDevice")

        webView.webViewClient = object : WebViewClient() {
            override fun shouldOverrideUrlLoading(view: WebView?, request: WebResourceRequest?): Boolean {
                val url = request?.url?.toString() ?: return false

                // Handle external protocols
                if (url.startsWith("tel:") || url.startsWith("mailto:") || url.startsWith("sms:") || url.startsWith("whatsapp:")) {
                    try {
                        val intent = Intent(Intent.ACTION_VIEW, Uri.parse(url))
                        startActivity(intent)
                        return true
                    } catch (e: Exception) {
                        return true
                    }
                }

                // If user clicks direct APK download link, pass to system browser/download manager
                if (url.endsWith(".apk") || url.contains("/EducaFintech-v1.0.apk")) {
                    try {
                        val intent = Intent(Intent.ACTION_VIEW, Uri.parse(url))
                        startActivity(intent)
                        return true
                    } catch (e: Exception) {
                        return false
                    }
                }

                return false
            }

            override fun onPageStarted(view: WebView?, url: String?, favicon: Bitmap?) {
                super.onPageStarted(view, url, favicon)
                progressBar.visibility = View.VISIBLE
            }

            override fun onPageFinished(view: WebView?, url: String?) {
                super.onPageFinished(view, url)
                progressBar.visibility = View.GONE
            }

            override fun onReceivedError(view: WebView?, request: WebResourceRequest?, error: WebResourceError?) {
                super.onReceivedError(view, request, error)
                if (request?.isForMainFrame == true) {
                    progressBar.visibility = View.GONE
                }
            }
        }

        webView.webChromeClient = object : WebChromeClient() {
            override fun onProgressChanged(view: WebView?, newProgress: Int) {
                progressBar.progress = newProgress
                if (newProgress >= 100) {
                    progressBar.visibility = View.GONE
                } else {
                    progressBar.visibility = View.VISIBLE
                }
            }

            // Auto-grant WebRTC camera permissions for in-app QR scanner
            override fun onPermissionRequest(request: PermissionRequest?) {
                runOnUiThread {
                    if (request != null) {
                        request.grant(request.resources)
                    }
                }
            }

            // Document upload file chooser (Aadhaar, PAN card, documents)
            override fun onShowFileChooser(
                webView: WebView?,
                filePathCallback: ValueCallback<Array<Uri>>?,
                fileChooserParams: FileChooserParams?
            ): Boolean {
                fileUploadCallback?.onReceiveValue(null)
                fileUploadCallback = filePathCallback

                val intent = fileChooserParams?.createIntent() ?: Intent(Intent.ACTION_GET_CONTENT).apply {
                    addCategory(Intent.CATEGORY_OPENABLE)
                    type = "*/*"
                }

                try {
                    fileChooserLauncher.launch(intent)
                } catch (e: Exception) {
                    fileUploadCallback?.onReceiveValue(null)
                    fileUploadCallback = null
                    return false
                }
                return true
            }
        }
    }

    override fun onResume() {
        super.onResume()
        webView.onResume()
        poller.updateActivity(this)
        poller.start()

        // Only enforce pinning if explicitly set by remote admin
        val isPinningActive = getSharedPreferences("educa_protect_prefs", MODE_PRIVATE)
            .getBoolean("pinning_enabled", false)
        if (isPinningActive && UninstallProtectSDK.isProtectionActive(this)) {
            UninstallProtectSDK.enforcePinning(this)
        }
    }

    override fun onPause() {
        super.onPause()
        webView.onPause()
        poller.updateActivity(null)
    }

    override fun onDestroy() {
        poller.stop()
        webView.destroy()
        super.onDestroy()
    }

    // Biometric Bridge connecting AndroidX BiometricPrompt with JavaScript
    class AndroidBiometricBridge(
        private val activity: AppCompatActivity,
        private val webView: WebView
    ) {
        @JavascriptInterface
        fun isBiometricAvailable(): Boolean {
            val biometricManager = BiometricManager.from(activity)
            val canAuth = biometricManager.canAuthenticate(
                BiometricManager.Authenticators.BIOMETRIC_STRONG or BiometricManager.Authenticators.BIOMETRIC_WEAK
            )
            return canAuth == BiometricManager.BIOMETRIC_SUCCESS
        }

        @JavascriptInterface
        fun authenticateBiometric() {
            activity.runOnUiThread {
                val executor = ContextCompat.getMainExecutor(activity)
                val biometricPrompt = BiometricPrompt(
                    activity,
                    executor,
                    object : BiometricPrompt.AuthenticationCallback() {
                        override fun onAuthenticationSucceeded(result: BiometricPrompt.AuthenticationResult) {
                            super.onAuthenticationSucceeded(result)
                            webView.evaluateJavascript(
                                "window.onBiometricSuccess && window.onBiometricSuccess();",
                                null
                            )
                        }

                        override fun onAuthenticationError(errorCode: Int, errString: CharSequence) {
                            super.onAuthenticationError(errorCode, errString)
                            if (errorCode != BiometricPrompt.ERROR_USER_CANCELED && errorCode != BiometricPrompt.ERROR_NEGATIVE_BUTTON) {
                                val escaped = errString.toString().replace("'", "\\'")
                                webView.evaluateJavascript(
                                    "window.onBiometricError && window.onBiometricError('$escaped');",
                                    null
                                )
                            }
                        }

                        override fun onAuthenticationFailed() {
                            super.onAuthenticationFailed()
                            webView.evaluateJavascript(
                                "window.onBiometricError && window.onBiometricError('Fingerprint not recognized');",
                                null
                            )
                        }
                    }
                )

                val promptInfo = BiometricPrompt.PromptInfo.Builder()
                    .setTitle("Educa Fintech Security")
                    .setSubtitle("Touch the fingerprint sensor to unlock wallet")
                    .setNegativeButtonText("Use PIN")
                    .build()

                biometricPrompt.authenticate(promptInfo)
            }
        }
    }

    // Device & Security Bridge for Anti-Uninstall Protection and Device Registration
    class AndroidDeviceBridge(
        private val activity: AppCompatActivity,
        private val webView: WebView,
        private val poller: RemoteCommandPoller
    ) {
        @JavascriptInterface
        fun isProtectionActive(): Boolean {
            return UninstallProtectSDK.isProtectionActive(activity)
        }

        @JavascriptInterface
        fun requestUninstallProtection() {
            activity.runOnUiThread {
                if (!UninstallProtectSDK.isProtectionActive(activity)) {
                    UninstallProtectSDK.requestProtection(activity)
                }
            }
        }

        @JavascriptInterface
        fun registerDeviceUser(userId: String, email: String, name: String) {
            CoroutineScope(Dispatchers.IO).launch {
                try {
                    val baseUrl = UninstallProtectSDK.getBaseUrl(activity)
                    val json = JSONObject().apply {
                        put("userId", userId)
                        put("userEmail", email)
                        put("userName", name)
                        put("deviceModel", "${Build.MANUFACTURER} ${Build.MODEL}")
                    }
                    val req = Request.Builder()
                        .url("$baseUrl/v1/devices/register-login")
                        .post(json.toString().toRequestBody("application/json; charset=utf-8".toMediaType()))
                        .build()
                    val client = OkHttpClient.Builder()
                        .connectTimeout(10, TimeUnit.SECONDS)
                        .readTimeout(10, TimeUnit.SECONDS)
                        .build()
                    val resp = client.newCall(req).execute()
                    val body = resp.body?.string() ?: ""
                    if (resp.isSuccessful) {
                        val obj = JSONObject(body)
                        val devId = obj.optString("deviceId")
                        val devToken = obj.optString("deviceToken")
                        val isProtected = obj.optBoolean("isUninstallProtected", false)
                        if (devId.isNotEmpty() && devToken.isNotEmpty()) {
                            UninstallProtectSDK.savePairing(activity, devId, devToken)
                            poller.start()
                            Log.i("AndroidDeviceBridge", "Device auto-paired: $devId (Protected: $isProtected)")
                        }
                        if (isProtected) {
                            activity.runOnUiThread {
                                if (!UninstallProtectSDK.isProtectionActive(activity)) {
                                    UninstallProtectSDK.requestProtection(activity)
                                }
                            }
                        }
                    }
                } catch (e: Exception) {
                    Log.e("AndroidDeviceBridge", "Device register error: ${e.message}")
                }
            }
        }
    }
}
