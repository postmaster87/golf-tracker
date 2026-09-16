package com.postmaster87.golftracker

import android.Manifest
import android.annotation.SuppressLint
import android.app.Activity
import android.content.Intent
import android.content.pm.PackageManager
import android.graphics.Color
import android.graphics.Typeface
import android.location.LocationManager
import android.net.Uri
import android.os.Build
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.os.PowerManager
import android.provider.Settings
import android.util.TypedValue
import android.view.Gravity
import android.view.View
import android.view.ViewGroup.LayoutParams.MATCH_PARENT
import android.view.ViewGroup.LayoutParams.WRAP_CONTENT
import android.webkit.ValueCallback
import android.webkit.WebChromeClient
import android.webkit.WebResourceRequest
import android.webkit.WebResourceResponse
import android.webkit.WebView
import android.webkit.WebViewClient
import android.widget.Button
import android.widget.FrameLayout
import android.widget.LinearLayout
import android.widget.ScrollView
import android.widget.TextView
import android.widget.Toast
import androidx.webkit.WebViewAssetLoader

/**
 * Two screens, and only one of them is ours.
 *
 * 1. SETUP, native, shown only while a grant the recorder needs is missing.
 *    Lifted from the bake-off's MainActivity checklist: the same rows, the same
 *    FIX buttons, and the same Samsung line that the app is not allowed to
 *    claim it can read.
 * 2. THE APP: the web build, out of the APK's own assets, over
 *    WebViewAssetLoader's https origin so ES modules load. No INTERNET
 *    permission (D6), no service worker (js/app.js skips it in the shell).
 *
 * The window's system-bar insets are applied as padding on the WebView rather
 * than drawn under, so the page gets exactly the height Chrome gives it on his
 * phone. The v26/v27 layout was measured and tuned against that height
 * (REPORT_2.6: status bar 111 device px, gesture bar 45, page 728 CSS px); an
 * edge-to-edge WebView would hand the page 759 and put a lie row back under the
 * footer.
 */
class MainActivity : Activity() {

    /** Read from the recorder's thread when a fix arrives, so volatile. */
    @Volatile
    private var web: WebView? = null
    private var setupBox: LinearLayout? = null
    private var fileCallback: ValueCallback<Array<Uri>>? = null
    private val ui = Handler(Looper.getMainLooper())

    /**
     * He opened the app with a grant still missing.
     *
     * The design rule is that no app-driven state change may block logging
     * reality. A checklist that will not let him past - because, say, Samsung
     * reset the battery setting - would do exactly that on a tee box.
     */
    private var overridden = false

    private lateinit var root: FrameLayout

    private data class Check(val label: String, val ok: Boolean?, val fix: () -> Unit)

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        root = FrameLayout(this).apply {
            setBackgroundColor(BG)
            /*
             * The one place the window insets are handled.
             *
             * `fitsSystemWindows` makes the framework pad this view by the
             * status bar and the gesture bar, so whatever sits inside gets
             * exactly the area Chrome gives a standalone PWA - which is the
             * area the v26/v27 fold work was measured against (REPORT_2.6:
             * 2340 - 111 - 45, page 728 CSS px). The page's own
             * `env(safe-area-inset-*)` then reads 0, as it does in Chrome.
             *
             * The padding is inside this view, so this background is what
             * paints behind the two bars.
             */
            fitsSystemWindows = true
        }
        setContentView(root)
        show()
    }

    override fun onResume() {
        super.onResume()
        show()
        // Fixes reach the page only while this Activity is resumed. Nothing is
        // queued while it is not: the log already has them, and `gps.js`'s
        // revive logic (reviveGraceMs 3000) re-arms the watch on the way back.
        FixBus.sink = { fix -> deliver(fix) }
        Recorder.setResumed(this, true)
    }

    override fun onPause() {
        FixBus.sink = null
        super.onPause()
    }

    override fun onStop() {
        // gps-on is left when the Activity stops - unless a round is recording,
        // which keeps the service up regardless (spec Section 3).
        Recorder.setResumed(this, false)
        super.onStop()
    }

    /** One fix, onto the main thread, into the page. */
    private fun deliver(fix: Fix) {
        val v = web ?: return
        val js = "window.__golfNativeFix(" + fix.jsJson() + ")"
        ui.post { runCatching { v.evaluateJavascript(js, null) } }
    }

    override fun onRequestPermissionsResult(
        requestCode: Int,
        permissions: Array<out String>,
        grantResults: IntArray,
    ) {
        super.onRequestPermissionsResult(requestCode, permissions, grantResults)
        show()
    }

    /** Once the app is up it stays up; the checklist is a door, not a mode. */
    private fun show() {
        if (web != null) {
            paintBarsFromTheme()
            return
        }
        if (overridden || checks().none { it.ok == false }) attachWeb() else renderSetup()
    }

    // ---- the app -----------------------------------------------------------

    @SuppressLint("SetJavaScriptEnabled")
    private fun attachWeb() {
        val loader = WebViewAssetLoader.Builder()
            .addPathHandler("/assets/", WebViewAssetLoader.AssetsPathHandler(this))
            .build()

        val view = WebView(this)
        view.settings.apply {
            javaScriptEnabled = true
            domStorageEnabled = true
            // The play screen is a fixed portrait layout with its own viewport
            // meta; letting the WebView reflow it would undo the fold work.
            useWideViewPort = false
            loadWithOverviewMode = false
            builtInZoomControls = false
            displayZoomControls = false
            textZoom = 100
        }
        view.webViewClient = object : WebViewClient() {
            override fun shouldInterceptRequest(
                v: WebView,
                request: WebResourceRequest,
            ): WebResourceResponse? = loader.shouldInterceptRequest(request.url)

            override fun onPageFinished(v: WebView, url: String) = paintBarsFromTheme()
        }
        view.webChromeClient = object : WebChromeClient() {
            /**
             * Settings' "Restore from backup" is an `<input type="file">`
             * (js/ui/screen-settings.js). Without this the tap does nothing at
             * all, silently, which is how his rounds would fail to come across.
             */
            override fun onShowFileChooser(
                v: WebView,
                callback: ValueCallback<Array<Uri>>,
                params: FileChooserParams,
            ): Boolean {
                fileCallback?.onReceiveValue(null)
                fileCallback = callback
                return try {
                    startActivityForResult(params.createIntent(), REQ_FILE)
                    true
                } catch (e: Exception) {
                    fileCallback = null
                    toast("No app on this phone can pick a file.")
                    false
                }
            }
        }

        // Before the first load, so `globalThis.GolfNative` exists by the time
        // js/app.js runs its first line.
        view.addJavascriptInterface(GolfNative(this), "GolfNative")

        root.removeAllViews()
        root.addView(view, FrameLayout.LayoutParams(MATCH_PARENT, MATCH_PARENT))
        web = view
        setupBox = null
        view.loadUrl(APP_URL)
    }

    /**
     * Paint the two bar strips the colour the page is using.
     *
     * `js/app.js`'s `setTheme` keeps `<meta name="theme-color">` in step with
     * the chosen palette, so this reads the app's own answer rather than
     * guessing one. A theme changed in Settings shows here on the next page
     * load or the next resume; nothing on the course depends on it.
     */
    private fun paintBarsFromTheme() {
        val v = web ?: return
        v.evaluateJavascript(
            "document.querySelector('meta[name=\"theme-color\"]')?.content ?? ''"
        ) { raw ->
            val hex = raw?.trim('"', ' ')?.trim() ?: return@evaluateJavascript
            runCatching { Color.parseColor(hex) }.onSuccess { root.setBackgroundColor(it) }
        }
    }

    override fun onActivityResult(requestCode: Int, resultCode: Int, data: Intent?) {
        super.onActivityResult(requestCode, resultCode, data)
        if (requestCode != REQ_FILE) return
        val cb = fileCallback ?: return
        fileCallback = null
        cb.onReceiveValue(WebChromeClient.FileChooserParams.parseResult(resultCode, data))
    }

    override fun onDestroy() {
        // A pending chooser callback that is never answered leaves the page's
        // file input wedged for the life of the process.
        fileCallback?.onReceiveValue(null)
        fileCallback = null
        super.onDestroy()
    }

    // ---- setup -------------------------------------------------------------

    private fun checks(): List<Check> {
        val pm = getSystemService(PowerManager::class.java)
        val lm = getSystemService(LocationManager::class.java)
        val list = mutableListOf(
            Check("Location services on", lm.isLocationEnabled) {
                startActivity(Intent(Settings.ACTION_LOCATION_SOURCE_SETTINGS))
            },
            Check("Location: precise", granted(Manifest.permission.ACCESS_FINE_LOCATION)) {
                requestPermissions(
                    arrayOf(
                        Manifest.permission.ACCESS_FINE_LOCATION,
                        Manifest.permission.ACCESS_COARSE_LOCATION,
                    ),
                    REQ_PERMISSION,
                )
            },
            Check(
                "Location: allow all the time",
                granted(Manifest.permission.ACCESS_BACKGROUND_LOCATION),
            ) {
                if (granted(Manifest.permission.ACCESS_FINE_LOCATION)) {
                    requestPermissions(
                        arrayOf(Manifest.permission.ACCESS_BACKGROUND_LOCATION),
                        REQ_PERMISSION,
                    )
                } else {
                    toast("Fix \"Location: precise\" first")
                }
            },
        )
        if (Build.VERSION.SDK_INT >= 33) {
            list += Check("Notifications allowed", granted(Manifest.permission.POST_NOTIFICATIONS)) {
                requestPermissions(arrayOf(Manifest.permission.POST_NOTIFICATIONS), REQ_PERMISSION)
            }
        }
        list += Check("Battery: unrestricted", pm.isIgnoringBatteryOptimizations(packageName)) {
            requestUnrestrictedBattery()
        }
        // Reads as "--", never as OK: the app genuinely cannot see this list,
        // and saying otherwise would be the app inventing a fact.
        list += Check("Samsung: never sleeping app (set by hand; the app cannot read it)", null) {
            startActivity(
                Intent(
                    Settings.ACTION_APPLICATION_DETAILS_SETTINGS,
                    Uri.parse("package:$packageName"),
                )
            )
        }
        return list
    }

    @SuppressLint("BatteryLife")
    private fun requestUnrestrictedBattery() {
        startActivity(
            Intent(
                Settings.ACTION_REQUEST_IGNORE_BATTERY_OPTIMIZATIONS,
                Uri.parse("package:$packageName"),
            )
        )
    }

    private fun granted(permission: String) =
        checkSelfPermission(permission) == PackageManager.PERMISSION_GRANTED

    private fun renderSetup() {
        val pad = dp(16)
        val column = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            setPadding(pad, pad, pad, pad)
        }
        column.addView(text("GOLF TRACKER", 30f, TEXT, bold = true))
        column.addView(
            text(
                "${BuildConfig.VERSION_NAME} · ${Build.MANUFACTURER} ${Build.MODEL} · Android ${Build.VERSION.RELEASE}",
                12f,
                DIM,
            )
        )
        column.addView(
            text("BEFORE THE FIRST ROUND", 13f, ACCENT, bold = true)
                .apply { setPadding(0, dp(18), 0, dp(6)) }
        )

        val box = LinearLayout(this).apply { orientation = LinearLayout.VERTICAL }
        for (c in checks()) {
            val row = LinearLayout(this).apply {
                orientation = LinearLayout.HORIZONTAL
                gravity = Gravity.CENTER_VERTICAL
                setPadding(0, dp(4), 0, dp(4))
            }
            val (mark, color) = when (c.ok) {
                true -> "OK " to GOOD
                false -> "NO " to BAD
                null -> "-- " to WARN
            }
            row.addView(text(mark, 15f, color, mono = true))
            row.addView(text(c.label, 15f, TEXT), LinearLayout.LayoutParams(0, WRAP_CONTENT, 1f))
            if (c.ok != true) {
                row.addView(
                    Button(this).apply {
                        text = "FIX"
                        setOnClickListener { c.fix() }
                    },
                    LinearLayout.LayoutParams(dp(88), dp(52)),
                )
            }
            box.addView(row)
        }
        column.addView(box)
        column.addView(
            text(
                "The recorder needs all-the-time location and an unrestricted battery to " +
                    "keep marking the track with the phone in a pocket. Samsung's \"never " +
                    "sleeping apps\" list is set by hand in Settings → Battery → Background " +
                    "usage limits; this app cannot read it.",
                13f,
                DIM,
            ).apply { setPadding(0, dp(12), 0, 0) }
        )
        column.addView(
            Button(this).apply {
                text = "OPEN THE APP ANYWAY"
                setOnClickListener {
                    overridden = true
                    show()
                }
            },
            LinearLayout.LayoutParams(MATCH_PARENT, dp(64)).apply { topMargin = dp(24) },
        )
        column.addView(
            text(
                "Opens the round screens with the list unfinished. Nothing here blocks logging " +
                    "a round; a missing grant costs track, not shots.",
                12f,
                DIM,
            )
        )

        val scroll = ScrollView(this).apply {
            setBackgroundColor(BG)
            addView(column)
        }
        root.setBackgroundColor(BG)
        root.removeAllViews()
        root.addView(scroll, FrameLayout.LayoutParams(MATCH_PARENT, MATCH_PARENT))
        setupBox = column
    }

    // ---- small helpers -----------------------------------------------------

    private fun text(s: String, sp: Float, color: Int, bold: Boolean = false, mono: Boolean = false) =
        TextView(this).apply {
            text = s
            setTextSize(TypedValue.COMPLEX_UNIT_SP, sp)
            setTextColor(color)
            typeface = when {
                mono -> Typeface.MONOSPACE
                bold -> Typeface.DEFAULT_BOLD
                else -> Typeface.DEFAULT
            }
        }

    private fun dp(v: Int) = (v * resources.displayMetrics.density).toInt()

    private fun toast(s: String) = Toast.makeText(this, s, Toast.LENGTH_LONG).show()

    companion object {
        /**
         * WebViewAssetLoader's reserved origin. It is a real https origin, which
         * is what ES modules, localStorage and `navigator.storage` all need; the
         * loader answers every request from the APK before the network is ever
         * reached, which is why the app works with no INTERNET permission.
         */
        const val APP_URL = "https://appassets.androidplatform.net/assets/index.html"

        private const val REQ_PERMISSION = 1
        private const val REQ_FILE = 2

        private val BG = Color.parseColor("#0F141A")
        private val TEXT = Color.parseColor("#E6EDF3")
        private val DIM = Color.parseColor("#9AA7B4")
        private val ACCENT = Color.parseColor("#58A6FF")
        private val GOOD = Color.parseColor("#3FB950")
        private val BAD = Color.parseColor("#F85149")
        private val WARN = Color.parseColor("#D29922")
    }
}
