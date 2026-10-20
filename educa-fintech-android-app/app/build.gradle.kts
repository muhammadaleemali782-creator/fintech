plugins {
    alias(libs.plugins.android.application)
    alias(libs.plugins.kotlin.android)
    alias(libs.plugins.google.services)
}

android {
    namespace = "com.educafintech.app"
    compileSdk = 34

    defaultConfig {
        applicationId = "com.educafintech.app"
        minSdk = 24
        targetSdk = 34
        versionCode = 4
        versionName = "2.1.0-NextGen"

        testInstrumentationRunner = "androidx.test.runner.AndroidJUnitRunner"
    }

    // SECURITY: signing secrets are NOT stored in the repo any more.
    // Put these in ~/.gradle/gradle.properties (never commit it) or export them as environment variables:
    //   EDUCA_KEYSTORE_FILE=/absolute/path/to/educa-release.jks
    //   EDUCA_KEYSTORE_PASSWORD=...   EDUCA_KEY_ALIAS=...   EDUCA_KEY_PASSWORD=...
    fun secret(name: String): String? =
        (project.findProperty(name) as String?) ?: System.getenv(name)

    val releaseStoreFile = secret("EDUCA_KEYSTORE_FILE")
    signingConfigs {
        if (releaseStoreFile != null) {
            create("release") {
                storeFile = file(releaseStoreFile)
                storePassword = secret("EDUCA_KEYSTORE_PASSWORD")
                keyAlias = secret("EDUCA_KEY_ALIAS")
                keyPassword = secret("EDUCA_KEY_PASSWORD")
                enableV1Signing = true
                enableV2Signing = true
                enableV3Signing = true
                enableV4Signing = true
            }
        }
    }

    buildTypes {
        release {
            isMinifyEnabled = false
            if (releaseStoreFile != null) signingConfig = signingConfigs.getByName("release")
            proguardFiles(
                getDefaultProguardFile("proguard-android-optimize.txt"),
                "proguard-rules.pro"
            )
        }
        debug {
            // debug builds use the default debug key (the release key must never sign debug builds)
        }
    }
    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_1_8
        targetCompatibility = JavaVersion.VERSION_1_8
    }
    kotlinOptions {
        jvmTarget = "1.8"
    }
    buildFeatures {
        viewBinding = true
    }
}

dependencies {
    implementation(libs.androidx.core.ktx)
    implementation(libs.androidx.appcompat)
    implementation(libs.material)
    implementation(libs.androidx.activity)
    implementation(libs.androidx.constraintlayout)
    implementation(libs.okhttp)
    implementation(libs.kotlinx.coroutines.android)
    implementation(libs.androidx.biometric)
    implementation(libs.firebase.messaging)
}
