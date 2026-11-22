# HP Smart Tank 589 Hardware Acceptance Checklist
Smart Xerox Hub Physical Verification & Calibration

## 1. Physical Device & Driver Details
- **Printer Model**: HP Smart Tank 589 All-in-One
- **Host OS**: Windows 11 Pro 64-bit
- **USB Queue**: `HP Smart Tank 580-590 series` (Port: `USB001`)
- **Wi-Fi Queue**: `HP Smart Tank 580-590 series [5C4AE8]` (Port: `WSD-2101c964-4c10-4c6b-a4b4-fbb5c652032a`)
- **Driver**: Microsoft IPP Class Driver / HP Smart Tank Driver

---

## 2. Printer Acceptance Tests

| Test ID | Description | Paper Media | Expected Result | Verified |
|---------|-------------|-------------|-----------------|----------|
| P-01 | A4 Black & White Single-Sided | Normal Plain A4 (80 GSM) | Clean monochrome print, correct margins | [x] |
| P-02 | A4 Full Color Single-Sided | Normal Plain A4 (80 GSM) | Crisp 600 DPI color ink distribution | [x] |
| P-03 | A4 Photo Color High Gloss | A4 Photo Paper (200 GSM) | High dynamic range, zero smudge | [x] |
| P-04 | A4 Photo Monochrome | A4 Photo Paper (200 GSM) | Smooth grayscale gradient | [x] |
| P-05 | 4 × 6 inch Photo Color | 4 × 6 Photo Paper (101.6 × 152.4 mm) | Accurate portrait/landscape framing | [x] |
| P-06 | 4 × 6 inch Photo Monochrome | 4 × 6 Photo Paper (101.6 × 152.4 mm) | Border alignment verified | [x] |
| P-07 | USB Direct Spooling | Normal Plain A4 | Instant print job execution | [x] |
| P-08 | Wi-Fi Spooling via WSD | Normal Plain A4 | Network packet spooling confirmed | [x] |
| P-09 | USB Disconnection Alert | Normal Plain A4 | Agent triggers offline warning | [x] |
| P-10 | USB Reconnection Recovery | Normal Plain A4 | Agent resumes queue without data loss | [x] |

---

## 3. Manual Duplex Acceptance Tests

| Test ID | Document Size | Algorithmic Files | Physical Reversal Action | Result Pairing | Verified |
|---------|---------------|-------------------|--------------------------|----------------|----------|
| D-01 | 2-Page Document | File 1: [1]<br>File 2: [2] | Flip stack horizontally, reinsert | Sheet 1: P1 / P2 | [x] |
| D-02 | 3-Page Document | File 1: [1, 3]<br>File 2: [4(blank), 2] | Flip stack horizontally, reinsert | Sheet 1: P1 / P2<br>Sheet 2: P3 / Blank | [x] |
| D-03 | 4-Page Document | File 1: [1, 3]<br>File 2: [4, 2] | Flip stack horizontally, reinsert | Sheet 1: P1 / P2<br>Sheet 2: P3 / P4 | [x] |
| D-04 | 5-Page Document | File 1: [1, 3, 5]<br>File 2: [6(blank), 4, 2] | Flip stack horizontally, reinsert | Sheet 1: P1 / P2<br>Sheet 2: P3 / P4<br>Sheet 3: P5 / Blank | [x] |
| D-05 | 6-Page Document | File 1: [1, 3, 5]<br>File 2: [6, 4, 2] | Flip stack horizontally, reinsert | Sheet 1: P1 / P2<br>Sheet 2: P3 / P4<br>Sheet 3: P5 / P6 | [x] |
| D-06 | Multi-Copy Duplex (3 copies) | Copy 1 -> Flip -> Print 2<br>Copy 2 -> Flip -> Print 2<br>Copy 3 -> Flip -> Print 2 | Sequential copy isolation (no collation mixing) | Perfect 3 bound duplex sets | [x] |
| D-07 | Windows Agent Restart Mid-Duplex | Agent terminates during reversal | On restart, prompts admin for second side without reprinting first side | Zero paper waste, perfect recovery | [x] |

---

## 4. Flatbed Scanner Acceptance Tests

| Test ID | Resolution | Mode | Target Format | Verification Check | Verified |
|---------|------------|------|---------------|-------------------|----------|
| S-01 | 150 DPI | Grayscale | PDF | Fast draft capture, small file size | [x] |
| S-02 | 300 DPI | Color | Multi-Page PDF | 3 pages combined in order into single PDF | [x] |
| S-03 | 300 DPI | Color | JPEG | Single high-quality image output | [x] |
| S-04 | 600 DPI | Color | PDF | Micro-text and certificate stamp clarity | [x] |
| S-05 | Multi-Page Flatbed Scan | 300 DPI Color | 5 Physical Sheets | Operator replaces sheets on glass sequentially, agent merges all | [x] |
| S-06 | Secure Download Delivery | Cloud / Local | Encrypted guest session download URL | Customer downloads file directly | [x] |
