# SMART XEROX HUB
### Production QR-Based Xerox, Photo Printing & Flatbed Scanning Management Ecosystem
**Target Hardware: HP Smart Tank 589 All-in-One Printer & Flatbed Scanner**  
**Host Environment: Windows 11 Pro 64-bit**

---

## 1. Latest Upgrades & Deliverables

1. **Clean Physical Flatbed Scanning (Zero Watermarks)**:
   - WIA 2.0 COM integration automatically connects to the online HP Smart Tank 589 scanner.
   - Captures the exact, raw document from the physical glass platen without any synthetic text, overlays, or watermarks.
   - Saves directly to `RAW_Inputs\Scans\Scan_YYYYMMDD_HHMMSS_p1.jpg`.
2. **Centralized `RAW_Inputs` Storage**:
   - `RAW_Inputs\User_Uploads\`: Stores all customer-submitted and locally uploaded PDF documents and photo files.
   - `RAW_Inputs\Scans\`: Stores all high-resolution raw scans acquired directly from the HP flatbed scanner.
   - `RAW_Inputs\Duplex\`: Stores the mathematical odd-page and reverse-even page PDF splits for manual duplex printing.
3. **Admin Portal & Live Real-Time Queue Inside the Desktop Application (`.exe`)**:
   - The Windows Agent `.exe` now embeds the complete categorized Admin Portal directly inside the application!
   - Real-time live synchronization via WebSockets: new customer orders appear instantly without having to refresh, reopen, or close the app.
   - One-click **"Approve & Print"** immediately routes the physical print job to the HP Smart Tank 589 spooler.
4. **Customer / Desk Printing Services Inside the Desktop Software**:
   - Operators can upload PDF documents or photos directly from the local computer via file browser.
   - Choose B&W / Color, Single-Sided or Manual Duplex, Copies, 4×6 Photo or A4 Photo.
   - Automatically archives files to `RAW_Inputs\User_Uploads` and prints cleanly to the HP printer.
5. **Software Branding & Logo**:
   - High-resolution Smart Xerox Hub logo and `.ico` icon integrated across the desktop application, window header, mobile web portal, and installer.
6. **Physical Printing Verification**:
   - Clean, direct printing using the official Windows Print Spooler and Microsoft Edge print engine with zero synthetic mock headers or watermarks.

---

## 2. Directory Layout

```
g:\Smart Xerox Hub/
├── RAW_Inputs/
│   ├── User_Uploads/        # Customer documents & photos
│   ├── Scans/               # Exact flatbed scans from HP 589 glass (no watermarks)
│   └── Duplex/              # Mathematical duplex odd/even page splits
├── windows-agent/           # Windows 11 C# .NET 8 desktop application (WPF + System Tray)
│   ├── Assets/              # Software Logo (logo.png) & Application Icon (app.ico)
│   ├── Core/                # ScanManager, PrintQueueManager, DuplexProcessor, PhotoProcessor, BackendSync
│   └── bin/publish/         # Published standalone win-x64 executable (SmartXeroxHubAgent.exe)
├── customer-web/            # Mobile-first QR guest web app
├── admin-dashboard/         # Desktop-first web administration console
├── backend/                 # REST API, WebSocket server, RAW_Inputs file server
├── database/                # 20 normalized PostgreSQL / Supabase tables & RLS
├── installer/
│   └── releases/
│       └── SmartXeroxHubAgent-Setup.exe # Production Windows 11 Installer
└── docs/                    # Architecture, setup manuals, calibration guide
```

---

## 3. How to Test & Run in Local Environment

### Step 1: Start Backend & Web Portals
```powershell
.\scripts\start-all.ps1
```
- **Customer Web (Mobile QR Portal)**: [http://localhost:5173](http://localhost:5173)
- **Admin Dashboard**: [http://localhost:5174](http://localhost:5174)
- **Backend API & Realtime**: [http://localhost:3001](http://localhost:3001)

### Step 2: Run the Windows Desktop Application (`.exe`)
Run either the published standalone executable:
```powershell
.\windows-agent\bin\publish\SmartXeroxHubAgent.exe
```
Or install the production Windows 11 setup package:
```powershell
.\installer\releases\SmartXeroxHubAgent-Setup.exe
```

### Step 3: Verify Real Scanner & Printing
1. Open the **"HP Flatbed Scanner Console"** tab in the desktop application.
2. Place a document on the HP Smart Tank 589 glass platen and click **"Scan Page on Glass (No Watermark)"**.
3. Verify that the exact scanned document appears in the preview and is saved to `RAW_Inputs\Scans\`.
4. Open the **"Live Orders & Admin Queue"** tab: whenever a customer submits an order, it appears instantly.
5. Click **"Approve & Print"** to physically spool the clean document to the HP Smart Tank 589 printer!
