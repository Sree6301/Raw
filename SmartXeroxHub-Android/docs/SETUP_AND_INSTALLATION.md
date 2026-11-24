# Smart Xerox Hub Android — Setup, Installation & User Guide

This guide provides step-by-step instructions for installing, configuring, and operating the native Android application on your smartphone or tablet.

---

## 1. Quick Installation (APK)

1. **Locate the Debug APK**:
   The built APK is available in the project under:
   `SmartXeroxHub-Android/builds/debug/SmartXeroxHub-Admin-Debug.apk`
2. **Transfer to Android Device**:
   - Connect your phone via USB cable and copy the APK to your `Downloads` folder, OR
   - Install directly using ADB from terminal:
     ```bash
     adb install -r "g:\Smart Xerox Hub\SmartXeroxHub-Android\builds\debug\SmartXeroxHub-Admin-Debug.apk"
     ```
3. **Allow Installation from Unknown Sources**:
   If installing from the device's file manager, tap "Settings" and enable "Allow from this source" when prompted.
4. **Grant Permissions**:
   On first launch, grant:
   - **Notifications**: to receive instant notifications when customer web orders arrive.
   - **Local Network / Wi-Fi**: to discover the HP Smart Tank 589 on your local router.
   - **USB**: if connecting via USB OTG cable.

---

## 2. Printer Connection Setup (HP Smart Tank 589)

### Option A: Wi-Fi Wireless Connection (Recommended)
1. Ensure your Android phone and the HP Smart Tank 589 are connected to the **same Wi-Fi network**.
2. Install the **HP Print Service Plugin** from Google Play Store (recommended for background rendering).
3. In the Smart Xerox app, open **Settings & Rates** or check the Top App Bar:
   - The app will automatically discover the printer via mDNS / NSD.
   - Tap **"Print HP 589 Test Page"** to verify connection.

### Option B: USB OTG Cable Connection
1. Connect a USB OTG cable between your Android phone's USB-C port and the printer's USB-B port.
2. Android will display a pop-up: *"Allow Smart Xerox Admin to access HP Smart Tank 589?"*
3. Tap **"Always allow"** and **"OK"**.
4. The status in the app will immediately indicate: `HP Vendor 0x03F0 (Active)`.

---

## 3. Daily Operator Workflows

### A. Processing Customer Web Orders
1. Open the **Orders** tab.
2. Tap on any pending order to review specifications (copies, color, duplex, paper size).
3. Tap the big primary action button:
   - **Standard Order**: Tap **"🖨️ Approve & Print"**. The job is claimed atomically and dispatched.
   - **Manual Duplex Order**:
     1. Tap **"▶ 1. Print Odd Pages"**. Printer prints odd sheets.
     2. Flip the stack of paper horizontally and re-insert into the top tray.
     3. Tap **"🔄 2. Paper Reversed (Confirm & Print Other Side)"**. Printer completes even pages.
   - **Passport 8-Up Photo**:
     1. Insert 4×6 HP Photo Paper into the rear tray.
     2. Tap **"🖨️ Approve & Print (4×6 HP Paper)"**.

### B. Desk Walk-In Printing
1. Open the **Desk** tab.
2. Choose between **Document**, **Photo Studio**, or **Passport 8-Up**:
   - In **Passport 8-Up**, pick the customer's photo; the app automatically aligns and compiles all 8 photos according to the verified 1800×1200 px calibration matrix with fine cutting outlines.
   - Select number of copies (1 to 10) using the stepper.
   - Tap **"Print 8-Up Passport Sheet"**.

### C. Flatbed Scanning
1. Place document face-down on the platen glass of the HP Smart Tank 589.
2. Open the **Scanner** tab.
3. Select format (`PDF` or `JPEG`) and tap **"Acquire Scan Page"**.
4. Repeat for multi-page documents; reorder or review thumbnails in the gallery.
5. Tap **"Finalize & Deliver Scan"**.

---

## 4. Live Synchronization & Prevention of Duplicate Printing

- The app maintains an ongoing foreground service (`SyncForegroundService`) connected to `wss://smart-xerox-backend-errw.onrender.com/ws`.
- If both Windows PC and Android phone are open simultaneously, the server-side atomic claiming endpoint prevents accidental double printing.
