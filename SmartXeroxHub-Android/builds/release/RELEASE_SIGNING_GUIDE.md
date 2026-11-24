# Smart Xerox Hub — Production Release Signing Guide

This guide explains how to generate a production release keystore and sign the Smart Xerox Hub Android Application for Google Play or internal sideload distribution.

---

## 1. Keystore Generation (One-Time Setup)

To generate a new release keystore, run the bundled script or execute the following `keytool` command (using JDK 17):

```powershell
& "C:\Program Files\Java\jdk-17\bin\keytool.exe" -genkey -v `
  -keystore "smartxerox-release.jks" `
  -alias "smartxerox" `
  -keyalg RSA `
  -keysize 2048 `
  -validity 10000 `
  -dname "CN=Smart Xerox Hub, OU=Operations, O=Smart Xerox, L=Hyderabad, ST=Telangana, C=IN" `
  -storepass "smartxerox2026" `
  -keypass "smartxerox2026"
```

---

## 2. Configuring `app/build.gradle.kts` for Release

Add your signing credentials securely via `gradle.properties` or environment variables:

```kotlin
android {
    signingConfigs {
        create("release") {
            storeFile = file("../../builds/release/smartxerox-release.jks")
            storePassword = project.findProperty("KEYSTORE_PASSWORD") as String? ?: "smartxerox2026"
            keyAlias = project.findProperty("KEY_ALIAS") as String? ?: "smartxerox"
            keyPassword = project.findProperty("KEY_PASSWORD") as String? ?: "smartxerox2026"
        }
    }
    buildTypes {
        release {
            isMinifyEnabled = true
            signingConfig = signingConfigs.getByName("release")
            proguardFiles(
                getDefaultProguardFile("proguard-android-optimize.txt"),
                "proguard-rules.pro"
            )
        }
    }
}
```

---

## 3. Building the Release APK or AAB

### To build the standalone signed Release APK:
```powershell
& "C:\Users\Sree\.gradle\gradle-8.7\bin\gradle.bat" assembleRelease
```
Output:
`app/build/outputs/apk/release/app-release.apk`

### To build the Google Play App Bundle (AAB):
```powershell
& "C:\Users\Sree\.gradle\gradle-8.7\bin\gradle.bat" bundleRelease
```
Output:
`app/build/outputs/bundle/release/app-release.aab`
