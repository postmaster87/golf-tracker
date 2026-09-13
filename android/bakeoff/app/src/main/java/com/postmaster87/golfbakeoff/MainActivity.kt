package com.postmaster87.golfbakeoff

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
import android.view.MotionEvent
import android.view.View
import android.view.ViewGroup.LayoutParams.MATCH_PARENT
import android.view.ViewGroup.LayoutParams.WRAP_CONTENT
import android.view.WindowInsets
import android.widget.Button
import android.widget.LinearLayout
import android.widget.ScrollView
import android.widget.TextView
import android.widget.Toast
import java.io.File
import java.util.Locale
import java.util.concurrent.Executors

/**
 * One screen: what the phone still needs before a fair test, START / HOLD TO
 * STOP, the live numbers against the bar, and every session on the phone.
 *
 * Nothing on the course needs this screen. START, lock the phone, play. STOP
 * is a 1.5 s hold so a pocket cannot end a session.
 */
class MainActivity : Activity() {

    private val ui = Handler(Looper.getMainLooper())
    private val io = Executors.newSingleThreadExecutor()
    /** Session id -> (fixes.csv length, its coverage). Touched on `io` only. */
    private val historyCache = HashMap<String, Pair<Long, Coverage>>()

    private lateinit var checksBox: LinearLayout
    private lateinit var button: Button
    private lateinit var live: TextView
    private lateinit var history: TextView

    private var visible = false
    private var pressBeganWhileRecording = false

    private val holdToStop = Runnable { stopRecording() }
    private val refresh = object : Runnable {
        override fun run() {
            if (!visible) return
            refreshStats()
            ui.postDelayed(this, REFRESH_MS)
        }
    }

    private data class Check(val label: String, val ok: Boolean?, val fix: () -> Unit)

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        Recorder.attachActivity(this)
        setContentView(buildUi())
    }

    override fun onResume() {
        super.onResume()
        Recorder.onActivityResumed(this)
        visible = true
        renderChecks()
        renderButton()
        ui.post(refresh)
    }

    override fun onPause() {
        visible = false
        ui.removeCallbacks(refresh)
        ui.removeCallbacks(holdToStop)
        super.onPause()
    }

    override fun onRequestPermissionsResult(
        requestCode: Int,
        permissions: Array<out String>,
        grantResults: IntArray,
    ) {
        super.onRequestPermissionsResult(requestCode, permissions, grantResults)
        renderChecks()
    }

    // ---- checks ------------------------------------------------------------

    private fun checks(): List<Check> {
        val pm = getSystemService(PowerManager::class.java)
        val lm = getSystemService(LocationManager::class.java)
        val list = mutableListOf(
            Check("Location services on", lm.isLocationEnabled) {
                startActivity(Intent(Settings.ACTION_LOCATION_SOURCE_SETTINGS))
            },
            Check("Location: precise", granted(Manifest.permission.ACCESS_FINE_LOCATION)) {
                requestPermissions(
                    arrayOf(Manifest.permission.ACCESS_FINE_LOCATION, Manifest.permission.ACCESS_COARSE_LOCATION),
                    REQ_PERMISSION,
                )
            },
            Check("Location: allow all the time", granted(Manifest.permission.ACCESS_BACKGROUND_LOCATION)) {
                if (granted(Manifest.permission.ACCESS_FINE_LOCATION)) {
                    requestPermissions(arrayOf(Manifest.permission.ACCESS_BACKGROUND_LOCATION), REQ_PERMISSION)
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
        for ((permission, label) in Recorder.extraPermissions) {
            list += Check(label, granted(permission)) {
                requestPermissions(arrayOf(permission), REQ_PERMISSION)
            }
        }
        list += Check("Battery: unrestricted", pm.isIgnoringBatteryOptimizations(packageName)) {
            requestUnrestrictedBattery()
        }
        list += Check("Samsung: never sleeping app (set by hand; the app cannot read it)", null) {
            startActivity(Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS, Uri.parse("package:$packageName")))
        }
        return list
    }

    @SuppressLint("BatteryLife")
    private fun requestUnrestrictedBattery() {
        startActivity(Intent(Settings.ACTION_REQUEST_IGNORE_BATTERY_OPTIMIZATIONS, Uri.parse("package:$packageName")))
    }

    private fun granted(permission: String) =
        checkSelfPermission(permission) == PackageManager.PERMISSION_GRANTED

    // ---- start / stop ------------------------------------------------------

    private fun startRecording() {
        if (!granted(Manifest.permission.ACCESS_FINE_LOCATION)) {
            toast("Fix \"Location: precise\" first")
            return
        }
        val id = Sessions.begin(this)
        SessionLog.open(this, id, "start")
        SessionLog.event(
            "start",
            "recorder=${Recorder.NAME};checks=" + checks().joinToString("|") { "${it.label}:${it.ok}" },
        )
        Recorder.start(this)
        renderButton()
        refreshStats()
    }

    private fun stopRecording() {
        Recorder.stop(this)
        SessionLog.event("stop")
        Sessions.end(this)
        SessionLog.close("stop")
        renderButton()
        refreshStats()
        toast("Stopped")
    }

    // ---- rendering ---------------------------------------------------------

    private fun buildUi(): View {
        val pad = dp(16)
        val column = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            setPadding(pad, pad, pad, pad)
        }
        column.addView(text("BAKE-OFF ${BuildConfig.RECORDER_TAG}", 30f, TEXT, bold = true))
        column.addView(text(Recorder.NAME, 14f, DIM))
        column.addView(
            text("${BuildConfig.VERSION_NAME} · ${Build.MANUFACTURER} ${Build.MODEL} · Android ${Build.VERSION.RELEASE}", 12f, DIM),
        )

        column.addView(section("BEFORE YOU START"))
        checksBox = LinearLayout(this).apply { orientation = LinearLayout.VERTICAL }
        column.addView(checksBox)

        button = Button(this).apply {
            textSize = 26f
            setTextColor(Color.WHITE)
            typeface = Typeface.DEFAULT_BOLD
            isAllCaps = false
        }
        column.addView(
            button,
            LinearLayout.LayoutParams(MATCH_PARENT, dp(112)).apply {
                topMargin = dp(20)
                bottomMargin = dp(12)
            },
        )
        attachPressHandler()

        live = text("", 15f, TEXT, mono = true)
        column.addView(live)

        column.addView(section("SESSIONS ON THIS PHONE"))
        column.addView(
            Button(this).apply {
                text = "EXPORT ALL TO DOWNLOADS"
                setOnClickListener { export() }
            },
            LinearLayout.LayoutParams(MATCH_PARENT, dp(64)).apply { topMargin = dp(24) },
        )
        history = text("", 12f, TEXT, mono = true)
        column.addView(history)

        val scroll = ScrollView(this).apply {
            setBackgroundColor(BG)
            addView(column)
        }
        // targetSdk 36 draws edge to edge; keep text out from under the bars.
        scroll.setOnApplyWindowInsetsListener { _, insets ->
            val bars = insets.getInsets(WindowInsets.Type.systemBars())
            column.setPadding(pad + bars.left, pad + bars.top, pad + bars.right, pad + bars.bottom)
            insets
        }
        return scroll
    }

    private fun renderChecks() {
        checksBox.removeAllViews()
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
            checksBox.addView(row)
        }
    }

    private fun renderButton() {
        val recording = Sessions.active(this) != null
        button.text = if (recording) "HOLD TO STOP" else "START"
        button.setBackgroundColor(if (recording) STOP_RED else START_GREEN)
    }

    @SuppressLint("ClickableViewAccessibility")
    private fun attachPressHandler() {
        button.setOnTouchListener { v, ev ->
            when (ev.actionMasked) {
                MotionEvent.ACTION_DOWN -> {
                    pressBeganWhileRecording = Sessions.active(this) != null
                    if (pressBeganWhileRecording) {
                        button.text = "KEEP HOLDING…"
                        ui.postDelayed(holdToStop, HOLD_TO_STOP_MS)
                    }
                }
                MotionEvent.ACTION_UP -> {
                    ui.removeCallbacks(holdToStop)
                    val inside = ev.x >= 0 && ev.y >= 0 && ev.x <= v.width && ev.y <= v.height
                    // A press that began while recording never starts a new session,
                    // including the release after a completed hold-to-stop.
                    if (!pressBeganWhileRecording && inside && Sessions.active(this) == null) {
                        startRecording()
                    } else {
                        renderButton()
                    }
                }
                MotionEvent.ACTION_CANCEL -> {
                    ui.removeCallbacks(holdToStop)
                    renderButton()
                }
            }
            true
        }
    }

    private fun refreshStats() {
        val app = applicationContext
        val active = Sessions.active(app)
        io.execute {
            val liveText = if (active != null) liveText(active) else "NOT RECORDING"
            val all = Sessions.all(app)
            val historyText = if (all.isEmpty()) "No sessions yet." else all.joinToString("\n\n") { historyEntry(it) }
            ui.post {
                live.text = liveText
                history.text = historyText
            }
        }
    }

    private fun liveText(id: String): String {
        val app = applicationContext
        val c = Coverage.ofCsv(File(Sessions.dir(app, id), "fixes.csv"))
        val now = System.currentTimeMillis()
        val started = Sessions.startedWallMs(app, id)
        return buildString {
            appendLine("RECORDING    $id")
            appendLine("recorder     ${if (Recorder.isRunning()) "running" else "NOT RUNNING"}")
            appendLine("elapsed      ${started?.let { clock(now - it) } ?: "-"}")
            appendLine("fixes        ${String.format(Locale.US, "%,d", c.fixes)}")
            appendLine("last fix     ${age(now, SessionLog.lastFixWallMs)}   acc ${SessionLog.lastAccM?.let { one(it.toDouble()) + " m" } ?: "-"}")
            appendLine("covered      ${c.coveredPct?.let { one(it) + "%" } ?: "-"}  (${one(c.coveredMs / 60000.0)} of ${one(c.spanMs / 60000.0)} min)")
            appendLine("gaps > 20 s  ${c.gapsOver}   longest ${one(c.longestGapMs / 1000.0)} s")
            appendLine("median acc   ${c.medianAccM?.let { one(it) + " m" } ?: "-"}")
            appendLine("bar          ${Exporter.verdict(c)}")
            append("heartbeat    ${age(now, SessionLog.lastHeartbeatWallMs)}")
            if (SessionLog.writeFailures > 0) append("\nWRITE FAILURES ${SessionLog.writeFailures}")
        }
    }

    private fun historyEntry(id: String): String {
        val f = File(Sessions.dir(applicationContext, id), "fixes.csv")
        val length = f.length()
        val c = historyCache[id]?.takeIf { it.first == length }?.second
            ?: Coverage.ofCsv(f).also { historyCache[id] = length to it }
        return "$id\n" + String.format(
            Locale.US,
            "  %.1f min  %,d fixes  covered %s  gaps %d  longest %.0f s  acc %s\n  %s",
            c.spanMs / 60000.0,
            c.fixes,
            c.coveredPct?.let { one(it) + "%" } ?: "-",
            c.gapsOver,
            c.longestGapMs / 1000.0,
            c.medianAccM?.let { one(it) + " m" } ?: "-",
            Exporter.verdict(c),
        )
    }

    private fun export() {
        val app = applicationContext
        toast("Exporting…")
        io.execute {
            val message = runCatching {
                "Exported ${Exporter.exportAll(app)} files to Download/golf-bakeoff/${BuildConfig.RECORDER_TAG}"
            }.getOrElse { "Export failed: ${it.javaClass.simpleName}: ${it.message}" }
            ui.post { toast(message) }
        }
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

    private fun section(s: String) = text(s, 13f, ACCENT, bold = true).apply { setPadding(0, dp(18), 0, dp(6)) }

    private fun dp(v: Int) = (v * resources.displayMetrics.density).toInt()

    private fun toast(s: String) = Toast.makeText(this, s, Toast.LENGTH_LONG).show()

    private fun one(x: Double) = String.format(Locale.US, "%.1f", x)

    private fun age(now: Long, then: Long) =
        if (then <= 0) "none yet" else String.format(Locale.US, "%.1f s ago", (now - then) / 1000.0)

    private fun clock(ms: Long): String {
        val s = ms / 1000
        return String.format(Locale.US, "%d:%02d:%02d", s / 3600, (s / 60) % 60, s % 60)
    }

    companion object {
        private const val REQ_PERMISSION = 1
        private const val REFRESH_MS = 2_000L
        private const val HOLD_TO_STOP_MS = 1_500L

        private val BG = Color.parseColor("#0F141A")
        private val TEXT = Color.parseColor("#E6EDF3")
        private val DIM = Color.parseColor("#9AA7B4")
        private val ACCENT = Color.parseColor("#58A6FF")
        private val GOOD = Color.parseColor("#3FB950")
        private val BAD = Color.parseColor("#F85149")
        private val WARN = Color.parseColor("#D29922")
        private val START_GREEN = Color.parseColor("#238636")
        private val STOP_RED = Color.parseColor("#B62324")
    }
}
