package space.voidprism.app

import android.Manifest
import android.annotation.SuppressLint
import android.app.AlarmManager
import android.content.Intent
import android.content.pm.PackageManager
import android.net.Uri
import android.os.Build
import android.os.Bundle
import android.provider.Settings
import android.util.Log
import android.view.View
import android.webkit.ConsoleMessage
import android.webkit.ValueCallback
import android.webkit.WebChromeClient
import android.webkit.WebResourceRequest
import android.webkit.WebResourceResponse
import android.webkit.WebSettings
import android.webkit.WebView
import android.webkit.WebViewClient
import androidx.activity.OnBackPressedCallback
import androidx.activity.result.contract.ActivityResultContracts
import androidx.appcompat.app.AppCompatActivity
import androidx.core.content.ContextCompat
import androidx.core.view.ViewCompat
import androidx.core.view.WindowCompat
import androidx.core.view.WindowInsetsCompat
import androidx.webkit.WebViewAssetLoader
import java.util.Locale

class MainActivity : AppCompatActivity() {
    private lateinit var webView: WebView
    private var fileCallback: ValueCallback<Array<Uri>>? = null
    private var pendingPick: Intent? = null
    private var pageReady = false

    private val pickImage = registerForActivityResult(ActivityResultContracts.StartActivityForResult()) { result ->
        val callback = fileCallback
        fileCallback = null
        val data = result.data
        if (callback == null) return@registerForActivityResult
        if (result.resultCode != RESULT_OK || data == null) {
            callback.onReceiveValue(null)
            return@registerForActivityResult
        }
        val clip = data.clipData
        val uris = when {
            clip != null && clip.itemCount > 0 -> Array(clip.itemCount) { clip.getItemAt(it).uri }
            data.data != null -> arrayOf(data.data!!)
            else -> null
        }
        callback.onReceiveValue(uris)
    }

    private val askStorage = registerForActivityResult(ActivityResultContracts.RequestPermission()) {
        launchImagePicker()
    }

    private val askRuntime = registerForActivityResult(ActivityResultContracts.RequestMultiplePermissions()) {
        maybeExactAlarm()
    }

    @SuppressLint("SetJavaScriptEnabled")
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        WindowCompat.setDecorFitsSystemWindows(window, false)

        webView = WebView(this).apply {
            id = View.generateViewId()
            setBackgroundColor(0xFF070814.toInt())
            overScrollMode = View.OVER_SCROLL_NEVER
        }
        setContentView(webView)

        ViewCompat.setOnApplyWindowInsetsListener(webView) { _, insets ->
            pushSafeInsets(insets)
            insets
        }
        ViewCompat.requestApplyInsets(webView)

        val assetLoader = WebViewAssetLoader.Builder()
            .addPathHandler("/assets/", WebViewAssetLoader.AssetsPathHandler(this))
            .build()

        webView.settings.apply {
            javaScriptEnabled = true
            domStorageEnabled = true
            databaseEnabled = true
            allowFileAccess = false
            allowContentAccess = true
            mixedContentMode = WebSettings.MIXED_CONTENT_COMPATIBILITY_MODE
            cacheMode = WebSettings.LOAD_DEFAULT
            mediaPlaybackRequiresUserGesture = false
            setSupportZoom(false)
            builtInZoomControls = false
            displayZoomControls = false
            useWideViewPort = true
            loadWithOverviewMode = true
            textZoom = 100
        }

        webView.addJavascriptInterface(AndroidBridge(this), "VoidPrismAndroid")

        webView.webChromeClient = object : WebChromeClient() {
            override fun onShowFileChooser(
                view: WebView?,
                filePathCallback: ValueCallback<Array<Uri>>?,
                fileChooserParams: FileChooserParams?,
            ): Boolean {
                fileCallback?.onReceiveValue(null)
                fileCallback = filePathCallback
                pendingPick = fileChooserParams?.createIntent() ?: Intent(Intent.ACTION_GET_CONTENT).apply {
                    addCategory(Intent.CATEGORY_OPENABLE)
                    type = "image/*"
                }
                val permission = storagePermission()
                if (permission != null &&
                    ContextCompat.checkSelfPermission(this@MainActivity, permission) != PackageManager.PERMISSION_GRANTED
                ) {
                    askStorage.launch(permission)
                } else {
                    launchImagePicker()
                }
                return true
            }

            override fun onConsoleMessage(consoleMessage: ConsoleMessage?): Boolean {
                if (consoleMessage != null) {
                    Log.d(
                        "VoidPrism",
                        "${consoleMessage.messageLevel()}: ${consoleMessage.message()} @${consoleMessage.sourceId()}:${consoleMessage.lineNumber()}",
                    )
                }
                return true
            }
        }

        webView.webViewClient = object : WebViewClient() {
            override fun shouldInterceptRequest(
                view: WebView?,
                request: WebResourceRequest?,
            ): WebResourceResponse? {
                val url = request?.url ?: return null
                return assetLoader.shouldInterceptRequest(url)
            }

            override fun shouldOverrideUrlLoading(
                view: WebView?,
                request: WebResourceRequest?,
            ): Boolean {
                val host = request?.url?.host.orEmpty()
                return host.isNotEmpty() && host != "appassets.androidplatform.net"
            }

            override fun onPageFinished(view: WebView?, url: String?) {
                pageReady = true
                ViewCompat.getRootWindowInsets(webView)?.let { pushSafeInsets(it) }
                deliverOpen(intent)
            }
        }

        onBackPressedDispatcher.addCallback(
            this,
            object : OnBackPressedCallback(true) {
                // Страница сама решает, что значит «назад»: закрыть слой, сохранить запись,
                // вернуться на прошлую вкладку. Приложение закрываем, только если она ответила false.
                override fun handleOnBackPressed() {
                    if (!pageReady) {
                        finish()
                        return
                    }
                    webView.evaluateJavascript(
                        "(function(){try{return !!(window.VoidPrismBack&&window.VoidPrismBack());}catch(e){return false;}})()",
                    ) { handled ->
                        if (handled != "true") finish()
                    }
                }
            },
        )

        if (savedInstanceState == null) {
            // https domain allows ES modules; file:// blocks them in WebView
            webView.loadUrl("https://appassets.androidplatform.net/assets/www/index.html")
        } else {
            pageReady = true
        }
        askRuntimePermissions()
        Planner.arm(this)
    }

    override fun onNewIntent(intent: Intent) {
        super.onNewIntent(intent)
        setIntent(intent)
        deliverOpen(intent)
    }

    override fun onResume() {
        super.onResume()
        Planner.arm(this)
        WidgetUpdater.refreshAll(this)
    }

    override fun onSaveInstanceState(outState: Bundle) {
        super.onSaveInstanceState(outState)
        webView.saveState(outState)
    }

    override fun onRestoreInstanceState(savedInstanceState: Bundle) {
        super.onRestoreInstanceState(savedInstanceState)
        webView.restoreState(savedInstanceState)
    }

    private fun deliverOpen(source: Intent?) {
        if (!pageReady || source == null) return
        val kind = source.getStringExtra(AppLinks.EXTRA_OPEN) ?: return
        source.removeExtra(AppLinks.EXTRA_OPEN)
        val whenAt = source.getLongExtra(AppLinks.EXTRA_WHEN, 0L)
        val id = jsString(source.getStringExtra(AppLinks.EXTRA_ID).orEmpty())
        val open = jsString(kind)
        webView.evaluateJavascript(
            "(function(){var payload={open:$open,when:$whenAt,id:$id};" +
                "if(window.VoidPrismOpen)window.VoidPrismOpen(payload);" +
                "else window.__voidprismPending=payload;})();",
            null,
        )
    }

    private fun jsString(value: String): String = buildString {
        append('\'')
        value.forEach { ch ->
            when (ch) {
                '\\' -> append("\\\\")
                '\'' -> append("\\'")
                '\n' -> append("\\n")
                '\r' -> append("\\r")
                else -> append(ch)
            }
        }
        append('\'')
    }

    private fun askRuntimePermissions() {
        val needed = mutableListOf<String>()
        if (Build.VERSION.SDK_INT >= 33) {
            if (ContextCompat.checkSelfPermission(this, Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED) {
                needed += Manifest.permission.POST_NOTIFICATIONS
            }
            if (ContextCompat.checkSelfPermission(this, Manifest.permission.READ_MEDIA_IMAGES) != PackageManager.PERMISSION_GRANTED) {
                needed += Manifest.permission.READ_MEDIA_IMAGES
            }
        } else if (ContextCompat.checkSelfPermission(this, Manifest.permission.READ_EXTERNAL_STORAGE) != PackageManager.PERMISSION_GRANTED) {
            needed += Manifest.permission.READ_EXTERNAL_STORAGE
        }
        if (needed.isNotEmpty()) askRuntime.launch(needed.toTypedArray())
        else maybeExactAlarm()
    }

    private fun maybeExactAlarm() {
        if (Build.VERSION.SDK_INT < 31) return
        val alarm = getSystemService(AlarmManager::class.java)
        if (alarm.canScheduleExactAlarms()) {
            Planner.arm(this)
            return
        }
        val prefs = getSharedPreferences("voidprism_alarms", MODE_PRIVATE)
        if (prefs.getBoolean("asked_exact", false)) return
        prefs.edit().putBoolean("asked_exact", true).apply()
        startActivity(
            Intent(Settings.ACTION_REQUEST_SCHEDULE_EXACT_ALARM).apply {
                data = Uri.parse("package:$packageName")
            },
        )
    }

    private fun storagePermission(): String? = when {
        Build.VERSION.SDK_INT >= 33 -> Manifest.permission.READ_MEDIA_IMAGES
        else -> Manifest.permission.READ_EXTERNAL_STORAGE
    }

    private fun launchImagePicker() {
        val intent = pendingPick ?: return
        try {
            pickImage.launch(intent)
        } catch (_: Exception) {
            fileCallback?.onReceiveValue(null)
            fileCallback = null
        }
    }

    private fun pushSafeInsets(insets: WindowInsetsCompat) {
        val bars = insets.getInsets(
            WindowInsetsCompat.Type.systemBars() or WindowInsetsCompat.Type.displayCutout(),
        )
        val ime = insets.getInsets(WindowInsetsCompat.Type.ime())
        val density = resources.displayMetrics.density.coerceAtLeast(1f)
        val top = bars.top / density
        val bottom = bars.bottom / density
        val keyboard = ((ime.bottom - bars.bottom).coerceAtLeast(0)) / density
        val topPx = String.format(Locale.US, "%.1f", top)
        val bottomPx = String.format(Locale.US, "%.1f", bottom)
        val keyboardPx = String.format(Locale.US, "%.1f", keyboard)
        webView.evaluateJavascript(
            "document.documentElement.style.setProperty('--safe-top','${topPx}px');" +
                "document.documentElement.style.setProperty('--safe-bottom','${bottomPx}px');" +
                "document.documentElement.style.setProperty('--ime','${keyboardPx}px');" +
                "window.dispatchEvent(new Event('voidprism-ime'));",
            null,
        )
    }

    override fun onDestroy() {
        webView.destroy()
        super.onDestroy()
    }
}
