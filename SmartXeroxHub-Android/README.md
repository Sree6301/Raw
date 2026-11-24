# Smart Xerox Hub — Native Android Admin Application

Complete native Android mobile application built with **Kotlin**, **Jetpack Compose**, **Material 3**, **Room SQLite**, and **HP Hardware APIs**, replicating 100% of the features, workflows, calibrations, and settings of the Windows `.exe` admin portal for **Smart Xerox Hub**.

---

## Key Highlights & Capabilities

- **100% Feature Parity with Windows .exe**:
  - Dashboard with live KPI cards and order streams.
  - Customer Orders queue with one-tap status approvals and duplex stages.
  - Desk Walk-in Services (Document Xerox, Photo Printing Studio, Passport 8-Up Studio).
  - HP Flatbed Scanner Console with live page counters and multi-page PDF compilation.
  - Paper Inventory tracking with restock alerts.
  - Shop Rates and Pricing editor.
  - Completed and cancelled order history with revenue summaries.
- **Server-Side Atomic Job Claiming**:
  - Implements `POST /api/admin/orders/:orderId/claim`.
  - Guarantees zero duplicate prints between Windows PC and Android devices.
- **Permanent Verified 8-Up Passport Calibration**:
  - Exact 1:1 match with Windows `PhotoProcessor.cs` algorithm:
  - 1800 × 1200 px canvas at 300 DPI, 397 × 513 px photos, 36 px margins, 36 px gaps, and fine cutting guidelines.
- **HP Smart Tank 589 Hardware Integration**:
  - Automatic Wi-Fi mDNS discovery (`_ipp._tcp.`).
  - USB OTG host detector (`USB_CLASS_PRINTER = 7`, HP Vendor `1008`).
  - Full support for A4 Normal, A4 Glossy Photo, 4×6 Photo paper, B&W and Color modes.
  - HP eSCL Flatbed Scanner REST client.

---

## Project Directory Structure

```
SmartXeroxHub-Android/
├── app/                  # Android Application Module (Kotlin, Compose, Room, Hardware)
│   ├── src/main/
│   │   ├── java/com/smartxerox/admin/
│   │   │   ├── data/     # Room Entities, DAOs, Retrofit API, WebSocket, Repositories
│   │   │   ├── hardware/ # PrinterDiscovery, PrintAdapter, Passport8Sheet, Usb, eSCL
│   │   │   ├── service/  # SyncForegroundService, WorkManager Worker
│   │   │   └── ui/       # Jetpack Compose Screens, Navigation, Theme, Components
│   │   ├── res/          # Values, Drawables, XML Security & Device Filter Configs
│   │   └── AndroidManifest.xml
│   └── build.gradle.kts
├── assets/               # Brand logos and iconography
├── docs/                 # Architecture, Hardware Compatibility, Setup & Installation Guides
├── builds/
│   ├── debug/            # Built Android Debug APK
│   ├── release/          # Release configuration and keystore signing guides
│   └── reports/          # Verification test reports
├── settings.gradle.kts
├── build.gradle.kts
├── gradle.properties
└── README.md
```

---

## Building from Source

### Prerequisites
- JDK 17 LTS (`C:\Program Files\Java\jdk-17`)
- Android SDK Platform 34 (`platforms/android-34`)
- Gradle 8.7+

### Command
```powershell
cd "SmartXeroxHub-Android"
$env:JAVA_HOME = "C:\Program Files\Java\jdk-17"
$env:ANDROID_HOME = "C:\Users\Sree\AppData\Local\Android\Sdk"
& "C:\Users\Sree\.gradle\gradle-8.7\bin\gradle.bat" assembleDebug
```
The compiled APK will be generated at:
`SmartXeroxHub-Android/app/build/outputs/apk/debug/app-debug.apk` and copied to `SmartXeroxHub-Android/builds/debug/SmartXeroxHub-Admin-Debug.apk`.
