# HP Smart Tank 589 Duplex Calibration Guide

## 1. Why Calibration is Required
Different printer drivers and rear feed trays feed sheets either short-edge first or long-edge first, and deliver printed sheets face-up. To ensure that Page 1 and Page 2 are perfectly aligned and not printed upside-down, execute the calibration sheet test before entering full production.

---

## 2. Generating the Calibration Sheet
1. Open the **Smart Xerox Hub Windows Agent** on Windows 11.
2. Click **"Print Duplex Calibration Sheet"** from the top action bar or run the 15-step Setup Wizard.
3. The application generates a 2-page calibration document:
   - **Page 1 (Front)**: Has a large Navy banner labeled `FRONT TOP ▲` and `FRONT BOTTOM ▼` with center crosshairs.
   - **Page 2 (Back)**: Has a large Dark Green banner labeled `BACK TOP ▲` and `BACK BOTTOM ▼`.

---

## 3. Step-by-Step Calibration Procedure

1. **Print Front Side**:
   - Send Page 1 to the printer.
   - Note which edge comes out of the exit tray first.
2. **Perform Reversal**:
   - Pick up the printed sheet.
   - Flip the sheet horizontally (turn left-to-right, like turning a page in a book).
   - Reinsert the sheet into the rear feed tray so that the blank back face is now pointing forward.
3. **Print Back Side**:
   - Send Page 2 to the printer.
4. **Verification**:
   - Hold the finished sheet up against a light source.
   - If `FRONT TOP ▲` and `BACK TOP ▲` are both located at the top of the sheet, the flip orientation is **100% Correct**.
   - If one of the markers is upside down, update the profile setting in `agent_state.json` to flip along long-edge instead of short-edge.
