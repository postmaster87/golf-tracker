// Same pinned toolchain as android/bakeoff (its build.gradle.kts, measured
// 2026-09-16), so the shell is built by the versions the bake-off recorder was
// built and measured with. Never "+".
//  - compileSdk 36; AGP 8.13.x supports API 36.1 and needs Gradle 8.13.
//  - Kotlin 2.3.21 is the line whose compatibility table covers AGP 8.13.
plugins {
    id("com.android.application") version "8.13.2" apply false
    id("org.jetbrains.kotlin.android") version "2.3.21" apply false
}
