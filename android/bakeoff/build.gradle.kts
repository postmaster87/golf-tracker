// Versions are pinned, never "+". Why these:
//  - compileSdk 36 is what transistorsoft's Kotlin setup page requires.
//  - AGP 8.13.x supports API 36.1 and needs Gradle 8.13 (its release notes).
//  - Kotlin 2.3.20-2.3.21 is the line whose compatibility table covers AGP 8.13.
plugins {
    id("com.android.application") version "8.13.2" apply false
    id("org.jetbrains.kotlin.android") version "2.3.21" apply false
}
