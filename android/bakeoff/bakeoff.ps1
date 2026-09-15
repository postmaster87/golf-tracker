# The bake-off, driven from the desktop. Claude runs every task.
#
# Matt's part, on the phone, and nothing else: USB debugging on, Auto Blocker
# off, unlock it, plug it in, tap Allow on "Allow USB debugging?", and leave it
# unlocked on the desk until Claude says it is done.
#
#   .\bakeoff.ps1 build      both debug APKs
#   .\bakeoff.ps1 test       JVM unit tests of the measure, both apps
#   .\bakeoff.ps1 devices    what adb sees, and the device the other tasks will use
#   .\bakeoff.ps1 setup      install both apps, grant everything, unrestricted battery, read it all back
#   .\bakeoff.ps1 samsung    read-only: neither app on Samsung's Sleeping / Deep sleeping lists
#   .\bakeoff.ps1 start      START both sessions
#   .\bakeoff.ps1 status     both recording? how many fixes?
#   .\bakeoff.ps1 stop       HOLD TO STOP and EXPORT in both apps
#   .\bakeoff.ps1 pull       Download/golf-bakeoff -> docs/roundDownloads/bakeoff/<time>, then score it
#
# -Serial picks a device. Without it: the one phone attached, or the emulator
# when it is the only device. -Dest overrides where pull (and screenshots) go.
# -Only K or -Only T limits start, status and stop to that app alone: a carry of
# one recorder, because GPS Custom's wake lock keeps the phone awake for both
# (Fable, docs/handoff/REPORT_2.3.md, Section 9). setup still installs both.
param(
    [ValidateSet('build', 'test', 'devices', 'setup', 'samsung', 'start', 'status', 'stop', 'pull')]
    [string]$Task = 'devices',
    [string]$Serial = '',
    [string]$Dest = '',
    [ValidateSet('K', 'T')]
    [string]$Only
)

$ErrorActionPreference = 'Stop'
$here = Split-Path -Parent $MyInvocation.MyCommand.Path
$repo = (Resolve-Path (Join-Path $here '..\..')).Path
if (-not $env:ANDROID_HOME) { $env:ANDROID_HOME = Join-Path $env:LOCALAPPDATA 'Android\Sdk' }
$adbExe = Join-Path $env:ANDROID_HOME 'platform-tools\adb.exe'
$Apps = [ordered]@{ K = 'com.postmaster87.golfbakeoff.k'; T = 'com.postmaster87.golfbakeoff.t' }
# The names on the phone, his pick 2026-09-14: "GPS Custom / GPS Transistor". Bake-off K and T before.
$AppNames = @{ K = 'GPS Custom'; T = 'GPS Transistor' }
$Run = @($Apps.Keys | Where-Object { -not $Only -or $_ -eq $Only })
$Apks = @{
    K = Join-Path $here 'app\build\outputs\apk\handwritten\debug\app-handwritten-debug.apk'
    T = Join-Path $here 'app\build\outputs\apk\transistor\debug\app-transistor-debug.apk'
}
$Activity = 'com.postmaster87.golfbakeoff.MainActivity'
$Grants = @('ACCESS_FINE_LOCATION', 'ACCESS_COARSE_LOCATION', 'ACCESS_BACKGROUND_LOCATION', 'POST_NOTIFICATIONS')
$script:dev = $null

# ---- plumbing ---------------------------------------------------------------

function Gradle([string[]]$tasks) {
    & (Join-Path $here 'gradlew.bat') -p $here --no-daemon @tasks
    if ($LASTEXITCODE -ne 0) { throw "gradle $($tasks -join ' ') failed ($LASTEXITCODE)" }
}

function Sh([string]$command) {
    return (& $adbExe -s $script:dev shell $command)
}

function Use-Device {
    $rows = @(& $adbExe devices | Select-Object -Skip 1 | Where-Object { $_ -match '\S' } | ForEach-Object {
            $p = $_ -split '\s+'
            [pscustomobject]@{ Serial = $p[0]; State = $p[1] }
        })
    $d = $null
    if ($Serial) {
        $d = $rows | Where-Object { $_.Serial -eq $Serial } | Select-Object -First 1
    } else {
        $phones = @($rows | Where-Object { $_.Serial -notlike 'emulator-*' })
        if ($phones.Count -gt 1) { throw 'More than one phone is attached; pass -Serial.' }
        if ($phones.Count -eq 1) { $d = $phones[0] } elseif ($rows.Count -eq 1) { $d = $rows[0] }
    }
    if (-not $d) { throw 'No phone. On the phone: USB debugging on, Auto Blocker off, unlock it, plug it in, tap Allow.' }
    if ($d.State -eq 'unauthorized') { throw "$($d.Serial) is plugged in but not authorized: tap Allow on the phone's 'Allow USB debugging?' prompt." }
    if ($d.State -ne 'device') { throw "$($d.Serial) is '$($d.State)', not ready." }
    $script:dev = $d.Serial
    $oneUi = "$(Sh 'getprop ro.build.version.oneui')".Trim()
    Write-Host ('device {0}: {1} {2}, Android {3}{4}' -f $d.Serial, "$(Sh 'getprop ro.product.manufacturer')".Trim(),
        "$(Sh 'getprop ro.product.model')".Trim(), "$(Sh 'getprop ro.build.version.release')".Trim(),
        $(if ($oneUi) { ", ro.build.version.oneui=$oneUi" } else { '' }))
}

function Require-Unlocked {
    Sh 'input keyevent 224' | Out-Null
    Sh 'wm dismiss-keyguard' | Out-Null
    Start-Sleep -Milliseconds 800
    $state = ((Sh 'dumpsys activity activities') + (Sh 'dumpsys window')) -join "`n"
    if ($state -match 'keyguardShowing=true') {
        throw 'The phone is locked. Unlock it and leave it on the desk; nothing was tapped.'
    }
}

function Save-Screen([string]$name) {
    $dir = if ($Dest) { $Dest } else { Join-Path $repo 'docs\roundDownloads\bakeoff\screens' }
    New-Item -ItemType Directory -Force $dir | Out-Null
    $file = Join-Path $dir ('{0}-{1}.png' -f (Get-Date -Format 'yyyyMMdd-HHmmss'), $name)
    Sh 'screencap -p /sdcard/gt-screen.png' | Out-Null
    & $adbExe -s $script:dev pull /sdcard/gt-screen.png $file | Out-Null
    return $file
}

# ---- driving the screen -----------------------------------------------------

function Ui-Nodes {
    for ($try = 1; $try -le 3; $try++) {
        Sh 'uiautomator dump /sdcard/gt-ui.xml' | Out-Null
        $raw = (& $adbExe -s $script:dev exec-out cat /sdcard/gt-ui.xml) -join "`n"
        $at = $raw.IndexOf('<?xml')
        if ($at -ge 0) {
            [xml]$doc = $raw.Substring($at)
            return @($doc.SelectNodes('//node'))
        }
        Start-Sleep -Milliseconds 800
    }
    throw 'uiautomator could not read the screen.'
}

function Ui-Label($n) {
    if ($n.GetAttribute('text')) { return $n.GetAttribute('text') }
    return $n.GetAttribute('content-desc')
}

function Ui-Find([string[]]$labels) {
    $nodes = Ui-Nodes
    foreach ($label in $labels) {
        foreach ($n in $nodes) {
            if ($n.GetAttribute('text') -eq $label -or $n.GetAttribute('content-desc') -eq $label) { return $n }
        }
    }
    return $null
}

function Ui-Scroll {
    $size = "$(Sh 'wm size' | Select-Object -Last 1)"
    $m = [regex]::Match($size, '(\d+)x(\d+)')
    $w = [int]$m.Groups[1].Value
    $h = [int]$m.Groups[2].Value
    Sh ('input swipe {0} {1} {0} {2} 350' -f [int]($w / 2), [int]($h * 0.75), [int]($h * 0.3)) | Out-Null
    Start-Sleep -Milliseconds 800
}

# Taps (or holds) the first of $labels found on screen, scrolling up to $scrolls
# times to look for it. Returns the label it hit, or $null.
function Ui-Tap([string[]]$labels, [int]$scrolls = 0, [int]$holdMs = 0) {
    for ($i = 0; $i -le $scrolls; $i++) {
        $n = Ui-Find $labels
        if ($n) {
            $m = [regex]::Match($n.GetAttribute('bounds'), '\[(\d+),(\d+)\]\[(\d+),(\d+)\]')
            $x = [int](([int]$m.Groups[1].Value + [int]$m.Groups[3].Value) / 2)
            $y = [int](([int]$m.Groups[2].Value + [int]$m.Groups[4].Value) / 2)
            if ($holdMs -gt 0) {
                Sh "input swipe $x $y $x $y $holdMs" | Out-Null
                Write-Host ("  held '{0}' {1} ms" -f (Ui-Label $n), $holdMs)
            } else {
                Sh "input tap $x $y" | Out-Null
                Write-Host ("  tapped '{0}'" -f (Ui-Label $n))
            }
            Start-Sleep -Milliseconds 1500
            return (Ui-Label $n)
        }
        if ($i -lt $scrolls) { Ui-Scroll }
    }
    return $null
}

# Like Ui-Tap, but stops the whole task - with a screenshot and every label on
# screen - rather than tap anything it was not sent to tap.
function Ui-Must([string[]]$labels, [string]$what, [int]$scrolls = 0, [int]$holdMs = 0) {
    $hit = Ui-Tap $labels $scrolls $holdMs
    if ($hit) { return $hit }
    $shot = Save-Screen ('stuck-' + ($what -replace '[^A-Za-z0-9]+', '-'))
    $seen = (Ui-Nodes | ForEach-Object { Ui-Label $_ } | Where-Object { $_ }) -join ' | '
    throw "Could not find $what ($($labels -join ' / ')). Nothing further was tapped.`nScreenshot: $shot`nOn screen: $seen"
}

function Open-App([string]$pkg) {
    Sh "am start -n $pkg/$Activity" | Out-Null
    Start-Sleep -Seconds 3
}

# ---- the steps --------------------------------------------------------------

function Grant-All([string]$tag, [string]$pkg) {
    $perms = @($Grants)
    if ($tag -eq 'T') { $perms += 'ACTIVITY_RECOGNITION' }
    foreach ($p in $perms) {
        $out = "$(Sh "pm grant $pkg android.permission.$p")".Trim()
        if ($out) { Write-Host "  pm grant $p said: $out" }
    }
    Sh "dumpsys deviceidle whitelist +$pkg" | Out-Null
    Sh "cmd appops set $pkg RUN_ANY_IN_BACKGROUND allow" | Out-Null

    # Read every one back from the system, not from what the commands printed.
    $problems = @()
    $dump = (Sh "dumpsys package $pkg") -join "`n"
    foreach ($p in $perms) {
        if ($dump -match "android\.permission\.$($p): granted=true") { Write-Host "  granted  $p" }
        else { $problems += "$($AppNames[$tag]): $p not granted" }
    }
    if (((Sh 'dumpsys deviceidle whitelist') -join "`n") -match [regex]::Escape($pkg)) { Write-Host '  battery  unrestricted (Doze whitelist)' }
    else { $problems += "$($AppNames[$tag]): not on the Doze whitelist" }
    $bg = "$(Sh "cmd appops get $pkg RUN_ANY_IN_BACKGROUND")".Trim()
    if ($bg -match 'allow') { Write-Host "  background  $bg" } else { $problems += "$($AppNames[$tag]): RUN_ANY_IN_BACKGROUND is '$bg'" }
    return $problems
}

function Read-Checklist([string]$tag) {
    $texts = @(Ui-Nodes | ForEach-Object { $_.GetAttribute('text') })
    $problems = @()
    Write-Host "  $($AppNames[$tag]) checklist, as the app shows it:"
    for ($i = 0; $i -lt $texts.Count - 1; $i++) {
        $mark = "$($texts[$i])".Trim()
        if (@('OK', 'NO', '--') -contains $mark) {
            Write-Host "    $mark  $($texts[$i + 1])"
            if ($mark -eq 'NO') { $problems += "$($AppNames[$tag]): $($texts[$i + 1])" }
        }
    }
    return $problems
}

function Show-Status {
    foreach ($tag in $Run) {
        $pkg = $Apps[$tag]
        $prefs = (Sh "run-as $pkg cat shared_prefs/sessions.xml 2>/dev/null") -join ' '
        $m = [regex]::Match($prefs, 'name="active">([^<]+)<')
        $fg = ((Sh "dumpsys activity services $pkg") -join "`n") -match 'isForeground=true'
        if ($m.Success) {
            $session = $m.Groups[1].Value
            $lines = "$(Sh "run-as $pkg sh -c 'wc -l < files/sessions/$session/fixes.csv'")".Trim()
            Write-Host ("  {0}: RECORDING {1}; foreground service {2}; fixes.csv {3} lines" -f $AppNames[$tag], $session,
                $(if ($fg) { 'running' } else { 'NOT RUNNING' }), $lines)
        } else {
            Write-Host ("  {0}: not recording; foreground service {1}" -f $AppNames[$tag], $(if ($fg) { 'running' } else { 'off' }))
        }
    }
}

switch ($Task) {
    'build' { Gradle @('assembleHandwrittenDebug', 'assembleTransistorDebug') }

    'test' { Gradle @('testHandwrittenDebugUnitTest', 'testTransistorDebugUnitTest') }

    'devices' {
        & $adbExe devices -l
        Use-Device
    }

    'setup' {
        Use-Device
        if (-not (Test-Path $Apks.K) -or -not (Test-Path $Apks.T)) { Gradle @('assembleHandwrittenDebug', 'assembleTransistorDebug') }
        $problems = @()
        foreach ($tag in $Apps.Keys) {
            Write-Host "$($AppNames[$tag]) ($($Apps[$tag]))"
            & $adbExe -s $script:dev install -r $Apks[$tag] | Out-Host
            if ($LASTEXITCODE -ne 0) { throw "install of $($AppNames[$tag]) failed ($LASTEXITCODE)" }
            $problems += Grant-All $tag $Apps[$tag]
        }
        Require-Unlocked
        foreach ($tag in $Apps.Keys) {
            Open-App $Apps[$tag]
            $problems += Read-Checklist $tag
        }
        Sh 'input keyevent 3' | Out-Null
        if ($problems.Count) { throw ("Setup is not complete:`n  " + ($problems -join "`n  ")) }
        Write-Host 'Setup done. Next: .\bakeoff.ps1 samsung'
    }

    'samsung' {
        # Measured on the S26 (One UI 8.5), 2026-09-13: an app whose battery is Unrestricted -
        # what setup sets - is not offered in "Never auto sleeping apps". Switched to Optimized,
        # Bake-off K (now GPS Custom) was offered and added; set back to Unrestricted, Samsung removed it from
        # that list. The two settings exclude each other, so this task changes nothing. It
        # reads Samsung's three lists and fails if either app is on Sleeping or Deep sleeping.
        Use-Device
        if ("$(Sh 'getprop ro.product.manufacturer')".Trim() -ne 'samsung') { throw 'Not a Samsung phone: there are no Samsung sleeping lists to check.' }
        Require-Unlocked
        $names = @($Apps.Keys | ForEach-Object { $AppNames[$_] })
        $report = @()
        $asleep = $false
        foreach ($list in @('Never auto sleeping apps', 'Sleeping apps', 'Deep sleeping apps')) {
            Sh 'input keyevent 3' | Out-Null
            # Settings reopens on whatever page it was left on, so start it fresh each time.
            Sh 'am force-stop com.android.settings' | Out-Null
            Sh 'am start -a android.settings.SETTINGS' | Out-Null
            Start-Sleep -Seconds 3
            $hit = Ui-Must @('Battery', 'Battery and device care') 'Battery in Settings' 10
            if ($hit -eq 'Battery and device care') { Ui-Must @('Battery') 'Battery' 3 | Out-Null }
            Ui-Must @('Background usage limits') 'Background usage limits' 6 | Out-Null
            Ui-Must @($list) $list 4 | Out-Null
            $seen = New-Object System.Collections.Generic.List[string]
            for ($page = 0; $page -lt 4; $page++) {
                foreach ($l in @(Ui-Nodes | ForEach-Object { Ui-Label $_ } | Where-Object { $_ })) {
                    if (-not $seen.Contains($l)) { $seen.Add($l) }
                }
                Ui-Scroll
            }
            $on = @($names | Where-Object { $seen.Contains($_) })
            if ($on.Count -and $list -ne 'Never auto sleeping apps') { $asleep = $true }
            $shot = Save-Screen ($list -replace '[^A-Za-z]+', '-')
            $report += ('{0}: {1} (screenshot {2})' -f $list, $(if ($on.Count) { $on -join ', ' } else { 'neither test app' }), $shot)
        }
        Sh 'input keyevent 3' | Out-Null
        $report | ForEach-Object { Write-Host "  $_" }
        if ($asleep) { throw 'A test app is on a Samsung sleeping list.' }
    }

    'start' {
        Use-Device
        Require-Unlocked
        foreach ($tag in $Run) {
            Open-App $Apps[$tag]
            if (Ui-Find @('HOLD TO STOP')) { Write-Host "  $($AppNames[$tag]) is already recording" }
            else { Ui-Must @('START') "START in $($AppNames[$tag])" | Out-Null }
        }
        Sh 'input keyevent 3' | Out-Null
        Start-Sleep -Seconds 8
        Show-Status
    }

    'status' {
        Use-Device
        Show-Status
    }

    'stop' {
        Use-Device
        Require-Unlocked
        foreach ($tag in $Run) {
            Open-App $Apps[$tag]
            if (Ui-Find @('HOLD TO STOP')) { Ui-Must @('HOLD TO STOP') "HOLD TO STOP in $($AppNames[$tag])" 0 2300 | Out-Null }
            else { Write-Host "  $($AppNames[$tag]) was not recording" }
            Ui-Must @('EXPORT ALL TO DOWNLOADS') "EXPORT in $($AppNames[$tag])" 4 | Out-Null
            Start-Sleep -Seconds 8
        }
        Sh 'input keyevent 3' | Out-Null
        Show-Status
        Sh 'ls -R /sdcard/Download/golf-bakeoff' | Out-Host
    }

    'pull' {
        Use-Device
        $target = if ($Dest) { $Dest } else { Join-Path $repo ('docs\roundDownloads\bakeoff\' + (Get-Date -Format 'yyyyMMdd-HHmmss')) }
        New-Item -ItemType Directory -Force $target | Out-Null
        & $adbExe -s $script:dev pull /sdcard/Download/golf-bakeoff $target
        if ($LASTEXITCODE -ne 0) { throw "pull failed ($LASTEXITCODE)" }
        python (Join-Path $repo 'tools\track-coverage.py') $target
    }
}
