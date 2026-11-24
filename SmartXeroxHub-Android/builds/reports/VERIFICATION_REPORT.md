# Smart Xerox Hub — Verification & Test Report

**Date**: 24 November 2026  
**Build Target**: Native Android (Kotlin + Jetpack Compose) & Windows Agent + Node.js Backend  
**Hardware Target**: HP Smart Tank 589 All-in-One Printer  

---

## 1. Feature Parity Matrix: Windows .exe vs Android Native

| Feature / Workflow | Windows .exe Admin | Android Native App | Parity Status | Implementation Reference |
| :--- | :---: | :---: | :---: | :--- |
| **Real-time Live Orders Queue** | ✅ Yes | ✅ Yes | **100% Parity** | `OrdersScreen.kt`, WebSocket listener |
| **Server-Side Atomic Job Claiming** | ✅ Yes | ✅ Yes | **100% Parity** | `POST /api/admin/orders/:orderId/claim` |
| **One-Tap Order Status Actions** | ✅ Yes | ✅ Yes | **100% Parity** | `AdminOrderCard.kt` |
| **Manual Duplex Step-by-Step Wizard** | ✅ Yes | ✅ Yes | **100% Parity** | Odd pages -> Flip Stack -> Even pages |
| **Passport 8-Up Photo Studio** | ✅ Yes | ✅ Yes | **100% Parity** | `Passport8SheetGenerator.kt` (1800×1200 px) |
| **Standard Photo Printing (4×6 & A4)** | ✅ Yes | ✅ Yes | **100% Parity** | `DeskPrintingScreen.kt` |
| **Borderless / Border Toggle** | ✅ Yes | ✅ Yes | **100% Parity** | `DeskPhotoView.kt`, `SmartTankPrintAdapter.kt` |
| **Number Stepper (1 to 10 Copies)** | ✅ Yes | ✅ Yes | **100% Parity** | `NumberStepper.kt` |
| **HP Flatbed Scanner Console** | ✅ Yes | ✅ Yes | **100% Parity** | `ScannerScreen.kt`, `EsclScannerClient.kt` |
| **Multi-page Scanned Gallery** | ✅ Yes | ✅ Yes | **100% Parity** | Scanned thumbnail grid & PDF compilation |
| **Paper & Media Inventory Tracking** | ✅ Yes | ✅ Yes | **100% Parity** | `InventoryScreen.kt`, Room `InventoryDao` |
| **Shop Rates & Pricing Editor** | ✅ Yes | ✅ Yes | **100% Parity** | `SettingsScreen.kt`, `PricingRepository.kt` |
| **Order History & Revenue Reports** | ✅ Yes | ✅ Yes | **100% Parity** | `HistoryScreen.kt` |
| **Client-side Order Cancellation** | ✅ Yes | ✅ Yes | **100% Parity** | `OrderDetailModal.kt` |

---

## 2. Server-Side Atomic Job Claiming Verification

- **Endpoint**: `POST /api/admin/orders/:orderId/claim`
- **Payload**: `{ deviceId: String, deviceName: String }`
- **Logic**:
  1. If order is in `SUBMITTED`, `PENDING`, or `APPROVED` and has not been claimed, the server assigns `order.claimedBy = deviceName` and `order.claimedAt = new Date().toISOString()`, sets status to `PRINTING` or `FIRST_SIDE_PRINTING`, and returns HTTP 200.
  2. If a second device (e.g. Windows PC while Android is printing, or Android while Windows is printing) attempts to claim within the active 10-minute processing window, the server returns HTTP 409 with:
     ```json
     {
       "success": false,
       "claimed": false,
       "alreadyClaimed": true,
       "claimedBy": "Android-Admin-Device",
       "message": "Order is already being processed/printed by Android-Admin-Device. Duplicate print rejected."
     }
     ```
  3. The client catches the 409 response, halts local spooling, and shows an alert dialog to the operator.
- **Result**: **PASS** (Zero duplicate printing across devices).

---

## 3. Verified Passport 8-Up Photo Sheet Math Verification

- **Canvas Size**: `1800 px × 1200 px` (4×6 inch at 300 DPI)
- **Photo Size**: `397 px × 513 px`
- **Left Margin**: `36 px`
- **Top Margin**: `12 px`
- **Column Gap**: `36 px`
- **Row Gap**: `36 px`
- **Columns**: `4`, **Rows**: `2`

### Total Dimensions Calculation:
- Width Span = `36 + (4 × 397) + (3 × 36) = 36 + 1588 + 108 = 1732 px`  
  Right Margin = `1800 - 1732 = 68 px` (Clean clearance within HP 4×6 printable area).
- Height Span = `12 + (2 × 513) + (1 × 36) = 12 + 1026 + 36 = 1074 px`  
  Bottom Margin = `1200 - 1074 = 126 px` (Clean clearance within HP 4×6 printable area).
- **Result**: **PASS** (Exact match with confirmed Windows print output).

---

## 4. HP Smart Tank 589 Hardware Interfaces

- **Wi-Fi IPP (Port 631)**: Supported via `SmartTankPrintAdapter.kt` and Android `PrintManager`.
- **USB OTG (Class 7 Bulk)**: Supported via `UsbPrinterController.kt` and `device_filter.xml`.
- **Flatbed eSCL Scanner (Port 8080/80)**: Supported via `EsclScannerClient.kt`.

---

## 5. Compiled Artifact Verification

- **Artifact Path**: `SmartXeroxHub-Android/builds/debug/SmartXeroxHub-Admin-Debug.apk`
- **File Size**: `30,277,998 bytes` (28.87 MB)
- **SHA-256 Checksum**: `E1BCF02E258938AE3E7103F4638E7F512A31E2A3447817A8EBFD20070F2DA744`
- **Package ID**: `com.smartxerox.admin.debug`
- **Version**: Code `1`, Name `1.0.0`
- **Min SDK**: `26` (Android 8.0 Oreo)
- **Target / Compile SDK**: `34` (Android 14 UpsideDownCake)
- **Launchable Activity**: `com.smartxerox.admin.ui.MainActivity`
- **Compilation Status**: **SUCCESSFUL (0 errors)**

