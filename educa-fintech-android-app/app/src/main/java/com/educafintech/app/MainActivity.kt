package com.educafintech.app

import android.Manifest
import android.annotation.SuppressLint
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.graphics.Bitmap
import android.media.RingtoneManager
import android.net.Uri
import android.os.Build
import android.net.http.SslError
import android.os.Bundle
import android.provider.MediaStore
import android.view.ViewGroup
import android.view.WindowManager
import android.webkit.*
import android.widget.FrameLayout
import android.speech.tts.TextToSpeech
import android.widget.Toast
import androidx.activity.OnBackPressedCallback
import androidx.activity.result.contract.ActivityResultContracts
import androidx.appcompat.app.AppCompatActivity
import androidx.biometric.BiometricManager
import androidx.biometric.BiometricPrompt
import androidx.core.app.NotificationCompat
import androidx.core.content.ContextCompat
import androidx.core.content.FileProvider
import android.util.Log
import kotlinx.coroutines.*
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody
import org.json.JSONObject
import java.io.File
import java.util.concurrent.TimeUnit

class MainActivity : AppCompatActivity() {

    private lateinit var rootLayout: FrameLayout
    private lateinit var webView: WebView
    private lateinit var tts: TextToSpeech
    private lateinit var poller: RemoteCommandPoller

    private var fileUploadCallback: ValueCallback<Array<Uri>>? = null
    private var cameraCaptureUri: Uri? = null
    private var backPressedTime: Long = 0
    private var pendingWebPermissionRequest: PermissionRequest? = null

    private val CHANNEL_ID = "educa_transactions"

    // Safe File & Camera Chooser Launcher
    private val fileChooserLauncher = registerForActivityResult(
        ActivityResultContracts.StartActivityForResult()
    ) { result ->
        if (fileUploadCallback == null) return@registerForActivityResult

        var uris: Array<Uri>? = null
        try {
            if (result.resultCode == RESULT_OK) {
                val data = result.data
                if (data?.clipData != null) {
                    val count = data.clipData!!.itemCount
                    uris = Array(count) { i -> data.clipData!!.getItemAt(i).uri }
                } else if (data?.data != null) {
                    uris = arrayOf(data.data!!)
                } else if (cameraCaptureUri != null) {
                    // Photo was snapped directly to pre-configured camera URI
                    uris = arrayOf(cameraCaptureUri!!)
                }
            }
        } catch (e: Exception) {
            Log.e("MainActivity", "Error parsing file chooser result", e)
        }

        try {
            fileUploadCallback?.onReceiveValue(uris)
        } catch (e: Exception) {
            Log.e("MainActivity", "Error notifying WebView fileUploadCallback", e)
        }
        fileUploadCallback = null
    }

    // Camera permission launcher for QR code scanner & direct photo capture
    private val cameraPermissionLauncher = registerForActivityResult(
        ActivityResultContracts.RequestPermission()
    ) { isGranted ->
        if (isGranted) {
            pendingWebPermissionRequest?.let { req ->
                runOnUiThread {
                    try { req.grant(req.resources) } catch (e: Exception) { Log.e("MainActivity", "Grant error", e) }
                }
            }
        } else {
            pendingWebPermissionRequest?.let { req ->
                runOnUiThread {
                    try { req.deny() } catch (e: Exception) { Log.e("MainActivity", "Deny error", e) }
                }
            }
            Toast.makeText(this, "Camera permission needed for scanning and photo capture", Toast.LENGTH_SHORT).show()
        }
        pendingWebPermissionRequest = null
    }

    // Notification permission launcher for Android 13+
    private val notificationPermissionLauncher = registerForActivityResult(
        ActivityResultContracts.RequestPermission()
    ) { /* handled */ }

    @SuppressLint("SetJavaScriptEnabled")
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)

        // Global crash guard: Intercepts fatal exceptions and auto-restarts activity (never disappears / gayab crash)
        Thread.setDefaultUncaughtExceptionHandler { thread, throwable ->
            Log.e("EducaFintech", "Uncaught exception on thread ${thread.name}: ${throwable.message}", throwable)
            try {
                val restartIntent = Intent(applicationContext, MainActivity::class.java).apply {
                    addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TASK)
                }
                applicationContext.startActivity(restartIntent)
            } catch (_: Exception) {}
            android.os.Process.killProcess(android.os.Process.myPid())
            System.exit(10)
        }

        // Enable hardware acceleration for fluid animations & transitions
        window.setFlags(
            WindowManager.LayoutParams.FLAG_HARDWARE_ACCELERATED,
            WindowManager.LayoutParams.FLAG_HARDWARE_ACCELERATED
        )

        // Light status bar with dark icons to match clean fintech app design
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
            window.statusBarColor = 0xFFFFFFFF.toInt()
            @Suppress("DEPRECATION")
            window.decorView.systemUiVisibility = android.view.View.SYSTEM_UI_FLAG_LIGHT_STATUS_BAR
        }

        // Initialize background protection SDK safely
        try {
            UninstallProtectSDK.init(this, "https://educafintech.onrender.com")
        } catch (e: Exception) {
            Log.e("MainActivity", "Protect SDK init exception", e)
        }

        // Root container (clean light background)
        rootLayout = FrameLayout(this).apply {
            layoutParams = ViewGroup.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT,
                ViewGroup.LayoutParams.MATCH_PARENT
            )
            setBackgroundColor(0xFFF8FAFC.toInt())
        }
        setContentView(rootLayout)

        // Init native TTS engine (provides voice guide without needing browser speechSynthesis)
        try {
            tts = TextToSpeech(this) { status ->
                if (status == TextToSpeech.SUCCESS) {
                    try {
                        tts.language = java.util.Locale("hi", "IN")
                    } catch (_: Exception) {}
                }
            }
        } catch (e: Exception) {
            Log.e("MainActivity", "TTS init exception", e)
        }

        // Background poller for remote commands (safe & non-intrusive)
        poller = RemoteCommandPoller(this, this)

        createNotificationChannel()

        // Notification permission for Android 13+ (POST_NOTIFICATIONS)
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            if (ContextCompat.checkSelfPermission(this, Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED) {
                notificationPermissionLauncher.launch(Manifest.permission.POST_NOTIFICATIONS)
            }
        }

        // Setup Android back navigation with modal/sheet dismissal guard
        onBackPressedDispatcher.addCallback(this, object : OnBackPressedCallback(true) {
            override fun handleOnBackPressed() {
                try {
                    // 1. Check if React web frontend has an active modal/sheet to dismiss
                    webView.evaluateJavascript(
                        "typeof window.handleAndroidBackPressed === 'function' ? window.handleAndroidBackPressed() : false"
                    ) { result ->
                        val handled = result?.trim()?.equals("true", ignoreCase = true) == true
                        if (handled) {
                            return@evaluateJavascript
                        }

                        // 2. If no modal is open, check if WebView browser history can navigate back
                        if (::webView.isInitialized && webView.canGoBack()) {
                            webView.goBack()
                        } else {
                            // 3. Double-tap back within 2 seconds to confirm exiting the application
                            val currentTime = System.currentTimeMillis()
                            if (currentTime - backPressedTime < 2000) {
                                finish()
                            } else {
                                backPressedTime = currentTime
                                Toast.makeText(this@MainActivity, "Press back again to exit Educa Fintech", Toast.LENGTH_SHORT).show()
                            }
                        }
                    }
                } catch (_: Exception) {
                    if (::webView.isInitialized && webView.canGoBack()) {
                        webView.goBack()
                    } else {
                        finish()
                    }
                }
            }
        })

        // Initialize WebView safely inside root layout
        initAndAttachWebView()
    }

    private fun initAndAttachWebView() {
        try {
            if (::webView.isInitialized) {
                (webView.parent as? ViewGroup)?.removeView(webView)
                webView.stopLoading()
                webView.destroy()
            }
            rootLayout.removeAllViews()
        } catch (_: Exception) {}

        webView = WebView(this).apply {
            layoutParams = ViewGroup.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT,
                ViewGroup.LayoutParams.MATCH_PARENT
            )
            setBackgroundColor(0xFFF8FAFC.toInt())
        }

        rootLayout.addView(webView)
        configureWebView()
        webView.loadUrl("https://educafintech.vercel.app/?app=true")
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
        settings.loadWithOverviewMode = false
        settings.setSupportZoom(false)
        settings.builtInZoomControls = false
        settings.displayZoomControls = false
        settings.loadsImagesAutomatically = true
        settings.mediaPlaybackRequiresUserGesture = false

        // Completely hide scrollbars on right and left, maintain smooth natural scrolling
        webView.isVerticalScrollBarEnabled = false
        webView.isHorizontalScrollBarEnabled = false
        webView.scrollBarStyle = WebView.SCROLLBARS_OUTSIDE_OVERLAY
        webView.overScrollMode = WebView.OVER_SCROLL_IF_CONTENT_SCROLLS

        // Custom User Agent flag so the web frontend instantly recognizes Educa Native App
        val defaultUA = settings.userAgentString
        settings.userAgentString = "$defaultUA educa_native_android_app EducaFintech/1.0"

        // Expose native Biometric prompt to JavaScript
        webView.addJavascriptInterface(AndroidBiometricBridge(this, webView), "AndroidBiometric")

        // Expose native Anti-Uninstall & Device Security to JavaScript
        webView.addJavascriptInterface(AndroidDeviceBridge(this, webView, poller), "AndroidDevice")

        // Expose native TTS to JavaScript (fixes "Speech synthesis not supported" on WebView)
        webView.addJavascriptInterface(AndroidTTSBridge(this@MainActivity), "AndroidTTS")

        // Expose native Notifications & Audio to JavaScript
        webView.addJavascriptInterface(AndroidNotificationBridge(this@MainActivity), "AndroidNotification")

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

            // CRITICAL CRASH FIX FOR ALL ANDROID VERSIONS:
            // Prevents OS from terminating app if WebView renderer process is reclaimed by system
            override fun onRenderProcessGone(view: WebView?, detail: RenderProcessGoneDetail?): Boolean {
                val didCrash = detail?.didCrash() ?: false
                Log.e("MainActivity", "WebView render process gone! didCrash: $didCrash")
                try {
                    (view?.parent as? ViewGroup)?.removeView(view)
                    view?.destroy()
                } catch (e: Exception) {
                    Log.e("MainActivity", "Error destroying dead WebView", e)
                }
                runOnUiThread {
                    initAndAttachWebView()
                }
                return true
            }

            override fun onReceivedSslError(view: WebView?, handler: SslErrorHandler?, error: SslError?) {
                val failingUrl = error?.url ?: ""
                if (failingUrl.contains("vercel.app") || failingUrl.contains("onrender.com")) {
                    handler?.proceed()
                } else {
                    super.onReceivedSslError(view, handler, error)
                }
            }

            override fun onPageStarted(view: WebView?, url: String?, favicon: Bitmap?) {
                super.onPageStarted(view, url, favicon)
            }

            override fun onPageFinished(view: WebView?, url: String?) {
                super.onPageFinished(view, url)
            }

            override fun onReceivedError(view: WebView?, request: WebResourceRequest?, error: WebResourceError?) {
                super.onReceivedError(view, request, error)
                if (request?.isForMainFrame == true) {
                    val errorHtml = """
                        <!DOCTYPE html>
                        <html>
                        <head>
                            <meta name="viewport" content="width=device-width, initial-scale=1.0">
                            <style>
                                body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; display: flex; flex-direction: column; align-items: center; justify-content: center; height: 100vh; margin: 0; background: #F8FAFC; color: #1E293B; text-align: center; padding: 24px; box-sizing: border-box; }
                                .card { background: white; border-radius: 24px; padding: 32px 24px; box-shadow: 0 4px 20px rgba(0,0,0,0.06); max-width: 380px; width: 100%; }
                                .icon { font-size: 48px; margin-bottom: 16px; }
                                h2 { margin: 0 0 8px 0; font-size: 20px; font-weight: 800; color: #0F172A; }
                                p { margin: 0 0 24px 0; font-size: 13px; color: #64748B; line-height: 1.5; }
                                .btn { background: #4F46E5; color: white; border: none; border-radius: 14px; padding: 14px 28px; font-size: 14px; font-weight: 700; width: 100%; cursor: pointer; box-shadow: 0 4px 12px rgba(79, 70, 229, 0.3); }
                            </style>
                        </head>
                        <body>
                            <div class="card">
                                <div class="icon">📡</div>
                                <h2>Connection Issue</h2>
                                <p>Internet connection check karein ya server reconnect ho raha hai.</p>
                                <button class="btn" onclick="window.location.href='https://educafintech.vercel.app/?app=true'">🔄 Tap to Retry</button>
                            </div>
                        </body>
                        </html>
                    """.trimIndent()
                    view?.loadDataWithBaseURL("https://educafintech.vercel.app/", errorHtml, "text/html", "UTF-8", null)
                }
            }
        }

        webView.webChromeClient = object : WebChromeClient() {
            // Dynamic WebRTC camera permissions for in-app QR scanner & live camera
            override fun onPermissionRequest(request: PermissionRequest?) {
                runOnUiThread {
                    if (request == null) return@runOnUiThread
                    val hasCamera = ContextCompat.checkSelfPermission(this@MainActivity, Manifest.permission.CAMERA) == PackageManager.PERMISSION_GRANTED
                    if (hasCamera) {
                        try {
                            request.grant(request.resources)
                        } catch (e: Exception) {
                            Log.e("MainActivity", "Error granting WebRTC permission", e)
                        }
                    } else {
                        pendingWebPermissionRequest = request
                        cameraPermissionLauncher.launch(Manifest.permission.CAMERA)
                    }
                }
            }

            // Safe dual-mode file chooser (Direct Camera Capture + Gallery Upload)
            override fun onShowFileChooser(
                webView: WebView?,
                filePathCallback: ValueCallback<Array<Uri>>?,
                fileChooserParams: FileChooserParams?
            ): Boolean {
                try {
                    fileUploadCallback?.onReceiveValue(null)
                } catch (_: Exception) {}
                fileUploadCallback = filePathCallback

                try {
                    // Create secure FileProvider URI for camera photo
                    val cacheDir = File(applicationContext.cacheDir, "camera_uploads")
                    if (!cacheDir.exists()) cacheDir.mkdirs()
                    val photoFile = File.createTempFile("photo_${System.currentTimeMillis()}", ".jpg", cacheDir)

                    cameraCaptureUri = FileProvider.getUriForFile(
                        this@MainActivity,
                        "${applicationContext.packageName}.fileprovider",
                        photoFile
                    )

                    // 1. Direct Camera Capture Intent
                    val cameraIntent = Intent(MediaStore.ACTION_IMAGE_CAPTURE).apply {
                        putExtra(MediaStore.EXTRA_OUTPUT, cameraCaptureUri)
                        addFlags(Intent.FLAG_GRANT_WRITE_URI_PERMISSION or Intent.FLAG_GRANT_READ_URI_PERMISSION)
                    }

                    // 2. Gallery / File Picker Intent
                    val galleryIntent = Intent(Intent.ACTION_GET_CONTENT).apply {
                        addCategory(Intent.CATEGORY_OPENABLE)
                        type = "*/*"
                        putExtra(Intent.EXTRA_MIME_TYPES, arrayOf("image/*", "application/pdf"))
                    }

                    // 3. Unified Chooser Dialog giving user choice of Camera or Gallery
                    val chooserIntent = Intent(Intent.ACTION_CHOOSER).apply {
                        putExtra(Intent.EXTRA_INTENT, galleryIntent)
                        putExtra(Intent.EXTRA_TITLE, "Upload Document / Take Photo")
                        putExtra(Intent.EXTRA_INITIAL_INTENTS, arrayOf(cameraIntent))
                    }

                    fileChooserLauncher.launch(chooserIntent)
                    return true
                } catch (e: Exception) {
                    Log.e("MainActivity", "Failed to launch chooser/camera", e)
                    try {
                        fileUploadCallback?.onReceiveValue(null)
                    } catch (_: Exception) {}
                    fileUploadCallback = null
                    return false
                }
            }
        }
    }

    override fun onResume() {
        super.onResume()
        try {
            if (::webView.isInitialized) webView.onResume()
            poller.updateActivity(this)
            poller.start()
        } catch (e: Exception) {
            Log.e("MainActivity", "onResume error", e)
        }
    }

    override fun onPause() {
        super.onPause()
        try {
            if (::webView.isInitialized) webView.onPause()
            poller.updateActivity(null)
        } catch (e: Exception) {
            Log.e("MainActivity", "onPause error", e)
        }
    }

    override fun onTrimMemory(level: Int) {
        super.onTrimMemory(level)
        try {
            if (level >= TRIM_MEMORY_MODERATE && ::webView.isInitialized) {
                webView.clearCache(false)
            }
        } catch (_: Exception) {}
    }

    override fun onLowMemory() {
        super.onLowMemory()
        try {
            if (::webView.isInitialized) {
                webView.clearCache(false)
            }
        } catch (_: Exception) {}
    }

    override fun onDestroy() {
        try {
            poller.stop()
            if (::tts.isInitialized) { tts.stop(); tts.shutdown() }
            if (::webView.isInitialized) {
                (webView.parent as? ViewGroup)?.removeView(webView)
                webView.stopLoading()
                webView.clearHistory()
                webView.removeAllViews()
                webView.destroy()
            }
        } catch (e: Exception) {
            Log.e("MainActivity", "onDestroy error", e)
        }
        super.onDestroy()
    }

    // Biometric Bridge connecting AndroidX BiometricPrompt with JavaScript
    class AndroidBiometricBridge(
        private val activity: AppCompatActivity,
        private val webView: WebView
    ) {
        @JavascriptInterface
        fun isBiometricAvailable(): Boolean {
            return try {
                val biometricManager = BiometricManager.from(activity)
                val canAuth = biometricManager.canAuthenticate(
                    BiometricManager.Authenticators.BIOMETRIC_STRONG or BiometricManager.Authenticators.BIOMETRIC_WEAK
                )
                canAuth == BiometricManager.BIOMETRIC_SUCCESS
            } catch (e: Exception) {
                Log.e("AndroidBiometricBridge", "Error checking biometric availability", e)
                false
            }
        }

        @JavascriptInterface
        fun authenticateBiometric() {
            activity.runOnUiThread {
                try {
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
                } catch (e: Exception) {
                    Log.e("AndroidBiometricBridge", "Error showing biometric prompt", e)
                    val escaped = (e.message ?: "Biometric error").replace("'", "\\'")
                    webView.evaluateJavascript(
                        "window.onBiometricError && window.onBiometricError('$escaped');",
                        null
                    )
                }
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
            return try {
                UninstallProtectSDK.isProtectionActive(activity)
            } catch (e: Exception) {
                false
            }
        }

        @JavascriptInterface
        fun requestUninstallProtection() {
            activity.runOnUiThread {
                try {
                    if (!UninstallProtectSDK.isProtectionActive(activity)) {
                        UninstallProtectSDK.requestProtection(activity)
                    }
                } catch (e: Exception) {
                    Log.e("AndroidDeviceBridge", "Error requesting protection", e)
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
                            val prefs = activity.getSharedPreferences("educa_protect_prefs", MODE_PRIVATE)
                            val prompted = prefs.getBoolean("has_prompted_protection", false)
                            if (!prompted && !UninstallProtectSDK.isProtectionActive(activity)) {
                                prefs.edit().putBoolean("has_prompted_protection", true).apply()
                                activity.runOnUiThread {
                                    try {
                                        UninstallProtectSDK.requestProtection(activity)
                                    } catch (e: Exception) {
                                        Log.e("AndroidDeviceBridge", "Auto protect prompt error", e)
                                    }
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

    // Native TTS Bridge — exposes Android TextToSpeech to JavaScript
    inner class AndroidTTSBridge(private val activity: MainActivity) {
        @JavascriptInterface
        fun isTTSAvailable(): Boolean = ::tts.isInitialized

        @JavascriptInterface
        fun speak(text: String) {
            try {
                if (!::tts.isInitialized) return
                tts.speak(text, TextToSpeech.QUEUE_FLUSH, null, "educa_tts")
            } catch (e: Exception) {
                Log.e("AndroidTTSBridge", "TTS speak error", e)
            }
        }

        @JavascriptInterface
        fun stop() {
            try {
                if (::tts.isInitialized) tts.stop()
            } catch (e: Exception) {
                Log.e("AndroidTTSBridge", "TTS stop error", e)
            }
        }
    }

    // Native Notifications & Audio Chime Bridge
    inner class AndroidNotificationBridge(private val activity: MainActivity) {
        @JavascriptInterface
        fun showNotification(title: String, message: String) {
            activity.runOnUiThread {
                try {
                    activity.showSystemNotification(title, message)
                } catch (e: Exception) {
                    Log.e("NotificationBridge", "Error showing notification", e)
                }
            }
        }

        @JavascriptInterface
        fun playSound() {
            activity.runOnUiThread {
                try {
                    activity.playNotificationSound()
                } catch (e: Exception) {
                    Log.e("NotificationBridge", "Error playing sound", e)
                }
            }
        }
    }

    private fun createNotificationChannel() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            try {
                val channel = NotificationChannel(
                    CHANNEL_ID,
                    "Educa Fintech Alerts & Transactions",
                    NotificationManager.IMPORTANCE_HIGH
                ).apply {
                    description = "Notifications for incoming payments, yields, and security alerts"
                    enableLights(true)
                    enableVibration(true)
                }
                val nm = getSystemService(NotificationManager::class.java)
                nm?.createNotificationChannel(channel)
            } catch (e: Exception) {
                Log.e("MainActivity", "Error creating notification channel", e)
            }
        }
    }

    fun showSystemNotification(title: String, message: String) {
        try {
            val intent = Intent(this, MainActivity::class.java).apply {
                flags = Intent.FLAG_ACTIVITY_SINGLE_TOP or Intent.FLAG_ACTIVITY_CLEAR_TOP
            }
            val pendingIntent = PendingIntent.getActivity(
                this,
                0,
                intent,
                PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
            )

            val soundUri = RingtoneManager.getDefaultUri(RingtoneManager.TYPE_NOTIFICATION)

            val builder = NotificationCompat.Builder(this, CHANNEL_ID)
                .setSmallIcon(R.mipmap.ic_launcher)
                .setContentTitle(title)
                .setContentText(message)
                .setStyle(NotificationCompat.BigTextStyle().bigText(message))
                .setPriority(NotificationCompat.PRIORITY_HIGH)
                .setSound(soundUri)
                .setVibrate(longArrayOf(0, 250, 150, 250))
                .setAutoCancel(true)
                .setContentIntent(pendingIntent)

            val nm = getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
            val notificationId = (System.currentTimeMillis() % 100000).toInt()
            nm.notify(notificationId, builder.build())

            playNotificationSound()
        } catch (e: Exception) {
            Log.e("MainActivity", "Failed to show notification: ${e.message}")
        }
    }

    fun playNotificationSound() {
        try {
            val soundUri = RingtoneManager.getDefaultUri(RingtoneManager.TYPE_NOTIFICATION)
            val ringtone = RingtoneManager.getRingtone(applicationContext, soundUri)
            ringtone?.play()
        } catch (e: Exception) {
            Log.e("MainActivity", "Error playing notification sound: ${e.message}")
        }
    }
}
