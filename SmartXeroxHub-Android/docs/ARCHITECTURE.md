# Smart Xerox Hub — Android Native Mobile Architecture

This document details the architectural design, patterns, and component interactions of the native Android application for **Smart Xerox Hub**, built using Kotlin, Jetpack Compose, Material 3, Room, OkHttp/WebSocket, and Android Hardware APIs.

---

## 1. High-Level Architecture Overview

```
                                  ┌───────────────────────────────┐
                                  │   HP Smart Tank 589 Printer   │
                                  │ (Wi-Fi IPP:631 / USB OTG:7)  │
                                  └──────────────▲────────────────┘
                                                 │
                                                 │ Android PrintManager / Custom Adapter / eSCL
                                                 │
┌─────────────────────────┐       ┌──────────────┴────────────────┐       ┌─────────────────────────┐
│     Customer Website    │◄─────►│    Smart Xerox Hub Android    │◄─────►│   Windows .exe Agent    │
│    (Next.js / Vercel)   │       │   (Admin Jetpack Compose App) │       │   (WPF / HP Spooler)    │
└─────────────────────────┘       └──────────────┬────────────────┘       └─────────────────────────┘
                                                 │
                                                 │ HTTPS / WSS / REST
                                                 ▼
                                  ┌───────────────────────────────┐
                                  │   Render Backend & Supabase   │
                                  │    (Atomic Claims, State)     │
                                  └───────────────────────────────┘
```

The application strictly adheres to the modern **Clean Architecture** and **Unidirectional Data Flow (UDF)** patterns:
- **Presentation Layer**: Jetpack Compose declarative UI screens, Material 3 theming (Deep Blue `#0B0F19`, Surface `#131B2E`, Brand Blue `#2563EB`, Emerald `#10B981`), StateFlow-driven components.
- **Domain & Repository Layer**: `OrderRepository`, `PricingRepository`, `InventoryRepository`, `ScannerRepository` orchestrating offline-first operations.
- **Data & Local Persistence Layer**: Room Database (`AppDatabase`, `OrderDao`, `PricingDao`, `InventoryDao`, `ScannedPageDao`) providing 100% offline cache and instant cold startup.
- **Remote & Networking Layer**: OkHttp client with WebSocket real-time event pipeline (`WebSocketManager`), REST API client (`SmartXeroxApiService`), and Supabase REST/Storage fallback.
- **Hardware Integration Layer**: `PrinterDiscoveryManager` (mDNS/NSD + USB OTG), `SmartTankPrintAdapter` (`PrintDocumentAdapter`), `Passport8SheetGenerator` (exact 1800×1200 px calibration), `UsbPrinterController`, and `EsclScannerClient` (HP Flatbed REST).

---

## 2. Server-Side Atomic Job Claiming (Duplicate Print Prevention)

To guarantee that an order approved on Android is **never** printed a second time on the Windows PC (or vice versa):
1. When an operator triggers "Approve & Print" on Android, `OrderRepository.claimOrder(orderId, deviceName)` dispatches an atomic `POST /api/admin/orders/:orderId/claim` to the backend.
2. The server checks if the order has already been claimed by another device within an active processing window:
   - If already claimed: server responds with HTTP 409 and `{ claimed: false, alreadyClaimed: true, claimedBy: "Windows-Agent" }`.
   - Android catches this response, halts local printing, and displays an immediate dialog: *"Order already being printed by Windows-Agent. Duplicate print rejected."*
   - If not claimed: server atomically writes `order.claimedBy = "Android-Admin-Device"`, transitions order to `PRINTING`, and broadcasts `ORDER_CLAIMED` over WebSockets.
3. Both Windows Agent and Android App update their local Room/SQLite records and reflect the live claimed status.

---

## 3. Verified 8-Up Passport Photo Calibration

The Android application implements the exact permanent calibration parameters verified on HP 4×6 Photo Paper:

| Parameter | Calibrated Value | Unit / Format | Notes |
| :--- | :--- | :--- | :--- |
| **Canvas Dimensions** | `1800 × 1200` | Pixels | 300 DPI Landscape 4×6 HP Photo Paper |
| **Grid Arrangement** | `2 Rows × 4 Columns` | Grid | 8 Photos per composite sheet |
| **Single Photo Width** | `397` | Pixels | Aspect Ratio: 35 mm × 45 mm standard |
| **Single Photo Height** | `513` | Pixels | Aspect Ratio: 35 mm × 45 mm standard |
| **Left Margin** | `36` | Pixels | Verified alignment offset |
| **Top Margin** | `12` | Pixels | Verified alignment offset |
| **Column Gap** | `36` | Pixels | Spacing between horizontal photos |
| **Row Gap** | `36` | Pixels | Spacing between vertical photos |
| **Cutting Outline** | `RGBA(180, 203, 213, 225)` | Stroke | 1.5 pt precision guide for scissors/cutter |

Implementation in `Passport8SheetGenerator.kt` accurately renders this composite bitmap and passes it to `SmartTankPrintAdapter` with 0% margin distortion.

---

## 4. HP Smart Tank 589 Hardware Integration Architecture

1. **Wi-Fi mDNS Discovery (`NsdManager`)**:
   - Listens on `_ipp._tcp.` and `_printer._tcp.` multicast groups.
   - Automatically resolves the printer's LAN IP address and IPP port (`631`).
2. **Android Print Framework (`PrintManager` & `SmartTankPrintAdapter`)**:
   - Implements `PrintDocumentAdapter` lifecycle (`onLayout`, `onWrite`).
   - Supports HP Print Service Plugin, Mopria Print Service, or Wi-Fi Direct.
   - Converts photos and composites into ISO A4 or NA Index 4×6 media specifications.
3. **USB OTG Host Controller (`UsbPrinterController`)**:
   - Enumerates connected USB devices with `deviceClass = 7` (USB Printer) or Vendor ID `1008` (HP).
   - Manages USB permissions via `PendingIntent`.
   - Claims printer interface and streams raw print commands over Bulk Out endpoints.
4. **HP Flatbed Scanner Client (`EsclScannerClient`)**:
   - Communicates with embedded HP eSCL HTTP daemon over port 8080/80.
   - Dispatches eSCL Platen scan XML jobs at 300 DPI.
   - Streams resulting JPEG pages directly into Room database for preview and multi-page PDF generation.
