import org.jetbrains.kotlin.gradle.dsl.JvmTarget

plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.android")
}

// The repo root: android/tracker -> android -> golf-tracker.
val repoRoot: File = rootDir.parentFile.parentFile

/*
 * D9: the APK's version IS the web build's id.
 *
 * `js/data/build.js` is the one place `BUILD.id` is written, and Settings shows
 * it inside the WebView. Reading it here means the APK and the screen cannot
 * disagree, and nothing has to be bumped twice. The suite's BUILD.id /
 * gt-shell-<id> check is untouched by this.
 */
val buildJs = File(repoRoot, "js/data/build.js")
val webBuildId: String = Regex("""id:\s*'([^']+)'""")
    .find(buildJs.readText())?.groupValues?.get(1)
    ?: throw GradleException("could not read BUILD.id from $buildJs")
val webBuildNumber: Int = Regex("""\d+""").find(webBuildId)?.value?.toInt()
    ?: throw GradleException("BUILD.id '$webBuildId' carries no number")

/*
 * Bumped by hand when the shell itself changes without a web build. The
 * versionCode has to rise for every install, and `BUILD.id` only moves on a
 * Pages deploy - which this app does not do.
 */
val shellBuild = 1

/*
 * The web build, copied into the APK's assets at build time.
 *
 * One source of truth: the files at the repo root. The copy is generated into
 * build/ and is never committed. `sw.js` is not copied (the service worker is a
 * Pages-caching mechanism and would only cache what is already local; the shell
 * does not register it), and neither are `test/`, `tools/` or `docs/`.
 * `js/dev/` is excluded - the GPS simulator has no business in a build that can
 * record a round.
 *
 * Sync, not Copy: a file deleted at the root must disappear from the APK too.
 */
val webAssetsDir = layout.buildDirectory.dir("generated/webAssets")

val copyWebAssets by tasks.registering(Sync::class) {
    description = "Copies the web build (index.html, css/, js/, icons) into the APK assets."
    // Every file index.html and manifest.webmanifest reference, read from them
    // on 2026-09-16: ./manifest.webmanifest, ./icon.svg, ./css/themes.css,
    // ./css/base.css, ./js/app.js and its import graph.
    from(repoRoot) {
        include("index.html", "manifest.webmanifest", "icon.svg")
    }
    from(File(repoRoot, "css")) { into("css") }
    from(File(repoRoot, "js")) {
        into("js")
        exclude("dev/**")
    }
    into(webAssetsDir)
}

android {
    namespace = "com.postmaster87.golftracker"
    compileSdk = 36

    defaultConfig {
        applicationId = "com.postmaster87.golftracker"
        minSdk = 30
        targetSdk = 36
        versionCode = webBuildNumber * 100 + shellBuild
        versionName = webBuildId
    }

    sourceSets["main"].assets.srcDir(webAssetsDir)

    buildFeatures {
        buildConfig = true
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }
}

// preBuild runs before the asset merge, so the copy is on disk before anything
// reads the assets source set.
tasks.named("preBuild") { dependsOn(copyWebAssets) }

kotlin {
    compilerOptions {
        jvmTarget.set(JvmTarget.JVM_17)
    }
}

dependencies {
    implementation("androidx.core:core-ktx:1.17.0")
    // WebViewAssetLoader: serves the APK's assets over a real https origin
    // (appassets.androidplatform.net) so ES modules load, without the app
    // holding INTERNET (D6).
    implementation("androidx.webkit:webkit:1.12.1")
    // The same fused-location library the bake-off measured K on.
    implementation("com.google.android.gms:play-services-location:21.3.0")

    testImplementation("junit:junit:4.13.2")
}
