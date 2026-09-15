import org.jetbrains.kotlin.gradle.dsl.JvmTarget

plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.android")
}

android {
    namespace = "com.postmaster87.golfbakeoff"
    compileSdk = 36

    defaultConfig {
        applicationId = "com.postmaster87.golfbakeoff"
        minSdk = 30
        targetSdk = 36
        // 2 = renamed to GPS Custom / GPS Transistor (his pick, 2026-09-14); the
        // recorders are unchanged. meta.json's app_version tells the builds apart.
        versionCode = 2
        versionName = "bakeoff-2"
    }

    // TWO APPS, NOT ONE. Each recorder gets its own application id, so its own
    // process, foreground service, notification and battery state. In one app,
    // whichever recorder held a foreground service would keep the other one's
    // process alive, and the comparison would measure nothing. Carried side by
    // side on the same round, both face the same phone, pocket and sky.
    //
    // The names on the phone changed on 2026-09-14; the application ids did not,
    // so a reinstall keeps each app's sessions and grants.
    flavorDimensions += "recorder"
    productFlavors {
        create("handwritten") {
            dimension = "recorder"
            applicationIdSuffix = ".k"
            resValue("string", "app_name", "GPS Custom")
            buildConfigField("String", "RECORDER_TAG", "\"K\"")
        }
        create("transistor") {
            dimension = "recorder"
            applicationIdSuffix = ".t"
            resValue("string", "app_name", "GPS Transistor")
            buildConfigField("String", "RECORDER_TAG", "\"T\"")
        }
    }

    buildFeatures {
        buildConfig = true
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }
}

kotlin {
    compilerOptions {
        jvmTarget.set(JvmTarget.JVM_17)
    }
}

dependencies {
    implementation("androidx.core:core-ktx:1.17.0")
    implementation("org.jetbrains.kotlinx:kotlinx-coroutines-android:1.10.2")
    // The same fused-location library transistorsoft 4.5.1 pins, so both apps
    // take their fixes from the same provider version.
    implementation("com.google.android.gms:play-services-location:21.3.0")

    "transistorImplementation"("com.transistorsoft:tslocationmanager:4.5.1")
    // The SDK posts headless events on greenrobot EventBus, which it already brings
    // in at runtime; the headless task needs its @Subscribe annotation to compile.
    "transistorCompileOnly"("org.greenrobot:eventbus:3.3.1")

    testImplementation("junit:junit:4.13.2")
}
