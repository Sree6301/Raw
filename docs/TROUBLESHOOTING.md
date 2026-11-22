# Smart Xerox Hub Troubleshooting & Maintenance Guide

## 1. Physical Printer Troubleshooting

### Problem: Printer Queue Shows "Offline" or Error
- **Cause**: USB cable disconnected, printer in sleep mode, or Windows Print Spooler service stalled.
- **Resolution**:
  1. Verify the green power LED is lit on the HP Smart Tank 589 control panel.
  2. In the Windows Agent console or system tray, click **"Switch to USB"**.
  3. If spooler is hung, open PowerShell as Administrator and run:
     ```powershell
     Restart-Service -Name Spooler -Force
     ```

### Problem: Duplicate Printer Queues
- **Cause**: Windows 11 Plug-and-Play created both a USB queue and a WSD network queue for the same physical HP 589 device.
- **Resolution**:
  The Agent's `DeviceManager` automatically suppresses duplicate jobs and binds to the primary USB queue `USB001`. Do not submit jobs to both queues simultaneously.

---

## 2. Manual Duplex Reversal Issues

### Problem: Second Side Printed Upside-Down
- **Cause**: Sheet was turned top-to-bottom instead of horizontally.
- **Resolution**:
  Turn the sheet like turning a page in a book (flip left-to-right). Run the Duplex Calibration Sheet from the Setup Wizard to verify alignment.

### Problem: Machine Restarted or Power Cut During Duplex Operation
- **Resolution**:
  The agent's `RecoveryManager` automatically persists the exact stage in `%LocalAppData%\SmartXeroxHub\agent_state.json`. Upon reboot, it detects that Side 1 was already printed and prompts the operator to insert the paper for Side 2 without wasting paper or reprinting Side 1.

---

## 3. Flatbed Scanner Troubleshooting

### Problem: "Scanner Device Busy or Flatbed Empty" (WIA COM Error)
- **Cause**: Scanner lid was raised during calibration or another Windows software (e.g. HP Smart app) is locking the WIA session.
- **Resolution**:
  1. Close the scanner lid firmly.
  2. Ensure the HP Smart app is closed in taskbar.
  3. In the Admin Dashboard scanner console, click **"Scan Page on Glass"** again.

---

## 4. Log Inspection
Structured audit and hardware communication logs are written to:
```
%LocalAppData%\SmartXeroxHub\logs\agent_YYYYMMDD.log
```
Inspect this file for exact WinSpool P/Invoke error codes, WIA device instances, and backend WebSocket sync events.
