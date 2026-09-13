# Build, test, install and pull the recorder bake-off apps.
#
#   .\bakeoff.ps1 build     both debug APKs
#   .\bakeoff.ps1 test      JVM unit tests (the coverage measure), both flavors
#   .\bakeoff.ps1 install   both APKs onto the one device adb sees
#   .\bakeoff.ps1 pull      Download/golf-bakeoff from the phone into docs/roundDownloads/bakeoff
#
# Round data stays in docs/roundDownloads/, which git ignores.
param(
    [ValidateSet('build', 'test', 'install', 'pull')]
    [string]$Task = 'build'
)

$ErrorActionPreference = 'Stop'
$here = Split-Path -Parent $MyInvocation.MyCommand.Path
if (-not $env:ANDROID_HOME) { $env:ANDROID_HOME = Join-Path $env:LOCALAPPDATA 'Android\Sdk' }
$adb = Join-Path $env:ANDROID_HOME 'platform-tools\adb.exe'

Push-Location $here
try {
    switch ($Task) {
        'build' {
            & .\gradlew.bat --no-daemon assembleHandwrittenDebug assembleTransistorDebug
            if ($LASTEXITCODE -ne 0) { throw "build failed ($LASTEXITCODE)" }
            Get-ChildItem -Recurse app\build\outputs\apk -Filter *.apk | Select-Object FullName, Length
        }
        'test' {
            & .\gradlew.bat --no-daemon testHandwrittenDebugUnitTest testTransistorDebugUnitTest
            if ($LASTEXITCODE -ne 0) { throw "tests failed ($LASTEXITCODE)" }
        }
        'install' {
            foreach ($flavor in 'handwritten', 'transistor') {
                $apk = "app\build\outputs\apk\$flavor\debug\app-$flavor-debug.apk"
                & $adb install -r $apk
                if ($LASTEXITCODE -ne 0) { throw "install of $flavor failed ($LASTEXITCODE)" }
            }
        }
        'pull' {
            $dest = Join-Path $here '..\..\docs\roundDownloads\bakeoff'
            New-Item -ItemType Directory -Force $dest | Out-Null
            & $adb pull /sdcard/Download/golf-bakeoff $dest
            if ($LASTEXITCODE -ne 0) { throw "pull failed ($LASTEXITCODE)" }
        }
    }
}
finally {
    Pop-Location
}
