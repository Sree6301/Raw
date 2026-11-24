# HP Smart Tank 589 Hardware Compatibility Report

**Device**: HP Smart Tank 589 All-in-One Printer  
**Target Platform**: Android 8.0+ (API 26 to API 34)  
**Supported Interfaces**: Wi-Fi (IPP / eSCL / AirPrint), USB OTG (USB Host Class 7)  

---

## 1. Wi-Fi Printing & Discovery

### A. Discovery Protocol
- **Protocol**: mDNS / DNS-SD (Multicast DNS Service Discovery)
- **Service Types**: `_ipp._tcp.` (Internet Printing Protocol), `_printer._tcp.`, `_uscan._tcp.`
- **Default Port**: 631 (IPP), 8080 (eSCL Scanner)
- **Compatibility Result**: **PASS (100% Native)**
  - Android `android.net.nsd.NsdManager` reliably discovers the printer on any 2.4GHz / 5GHz shared Wi-Fi network.

### B. Print Execution Options on Android
1. **System Print Framework (Recommended)**:
   - Uses `SmartTankPrintAdapter.kt` wrapping `android.print.PrintManager`.
   - Compatible with **HP Print Service Plugin** (installed from Google Play) or standard **Default Print Service** / **Mopria Print Service**.
   - Zero driver configuration required by the operator.
2. **Direct IPP Streaming**:
   - Raw IPP 2.0 requests over port 631.
   - Fully supported for PDF documents and JPEG photo sheets.

---

## 2. USB OTG Direct Connection

### A. Hardware Requirements
- Android phone/tablet with **USB OTG support** and **USB Host Mode**.
- Standard **USB Type-C to USB-B Printer Cable** (or USB Type-A to Type-B cable with a USB-C OTG adapter).

### B. Detection & Permissions
- Android `UsbManager` detects the printer upon cable insertion via Vendor ID `0x03F0` (HP) or Class `0x07` (Printer).
- The application automatically prompts: *"Open Smart Xerox Admin when this USB device is connected?"*
- Compatibility Result: **PASS** (Requires operator granting one-time USB permission).

---

## 3. HP Flatbed Scanner (eSCL AirScan)

### A. Protocol Details
- The HP Smart Tank 589 runs an embedded eSCL REST server:
  - Capabilities: `GET http://<printer-ip>:8080/eSCL/ScannerCapabilities`
  - Status: `GET http://<printer-ip>:8080/eSCL/ScannerStatus`
  - Scan Trigger: `POST http://<printer-ip>:8080/eSCL/ScanJobs` (XML payload)
  - Document Stream: `GET http://<printer-ip>:8080/eSCL/ScanJobs/<job-id>/NextDocument`

### B. Compatibility Matrix

| Feature | Supported | Notes |
| :--- | :--- | :--- |
| **Platen Glass Flatbed** | **YES** | InputSource: `Platen` |
| **Resolution 150 DPI** | **YES** | Fast draft scan |
| **Resolution 300 DPI** | **YES** | Standard clear document/photo scan |
| **Resolution 600 DPI** | **YES** | High-detail archival scan |
| **Color Modes** | **YES** | `RGB24` (Full Color) & `Grayscale8` (B&W) |
| **Output Formats** | **YES** | JPEG and multi-page PDF compilation |

---

## 4. Media & Paper Handling Verification

| Paper Type | Dimensions | Tray Insertion | Supported in App |
| :--- | :--- | :--- | :--- |
| **Normal A4 Paper** | 210 × 297 mm | Top Rear Tray (up to 100 sheets) | ✅ Complete (Single & Duplex) |
| **Photo Glossy A4** | 210 × 297 mm | Top Rear Tray (up to 30 sheets) | ✅ Complete |
| **Photo Glossy 4×6** | 102 × 152 mm | Top Rear Tray (width guides adjusted) | ✅ Complete (Borderless & 8-Up) |
