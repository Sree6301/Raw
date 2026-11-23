# 🛂 8 Passport Photos Calibration, Algorithm & Pixel Specification Guide
**Smart Xerox Hub • HP Smart Tank 580/589 Series Calibration Standard**

> [!IMPORTANT]
> **DO NOT MODIFY THESE CONSTANTS.**
> This document specifies the exact, mathematically calibrated, and physically verified alignment for printing **8 Passport Size Photos on standard 4×6 inch HP Glossy Photo Paper**. It eliminates all physical clipping (top, bottom, left, right), removes printer hardware errors (HP Error E2), and eliminates infinite printing loops.

---

## 1. Physical Specifications & Coordinate System

| Property | Value (Imperial / Metric) | Pixel Dimension (@ 300 DPI) | GDI+ Dimension (@ 100 DPI) |
| :--- | :--- | :--- | :--- |
| **Paper Type** | HP Glossy Photo Paper | - | - |
| **Paper Size** | $4 \times 6\text{ inches}$ ($101.6 \times 152.4\text{ mm}$) | - | `400 x 600` |
| **Orientation** | **Landscape** (6" wide $\times$ 4" high) | $1800 \times 1200\text{ px}$ | `600 x 400` |
| **Print Resolution** | $300\text{ DPI}$ | - | - |
| **GDI+ Coordinate Space** | $100\text{ DPI}$ | - | $1\text{ in} = 100\text{ units}$ |

---

## 2. The 8-Up Layout Alignment & Calibration Math

### Grid Matrix:
- **Columns**: 4
- **Rows**: 2
- **Total Photos**: $4 \times 2 = 8\text{ photos}$

### Exact Pixel Specifications (Canvas: 1800 × 1200 px @ 300 DPI):

```
┌─────────────────────────────────────────────────────────────────────────────────┐
│ topMargin = 12 px (1.02 mm)                                                     │
│   ┌───────────┐ colGap=36 ┌───────────┐        ┌───────────┐        ┌───────────┐   │
│   │  Photo 1  │           │  Photo 2  │        │  Photo 3  │        │  Photo 4  │   │
│   │ 397 x 513 │           │ 397 x 513 │        │ 397 x 513 │        │ 397 x 513 │   │
│   └───────────┘           └───────────┘        └───────────┘        └───────────┘   │
│ rowGap = 36 px (3.05 mm)                                                        │
│   ┌───────────┐           ┌───────────┐        ┌───────────┐        ┌───────────┐   │
│   │  Photo 5  │           │  Photo 6  │        │  Photo 7  │        │  Photo 8  │   │
│   │ 397 x 513 │           │ 397 x 513 │        │ 397 x 513 │        │ 397 x 513 │   │
│   └───────────┘           └───────────┘        └───────────┘        └───────────┘   │
│                                                                                 │
│ bottomMargin = 126 px (10.67 mm) [HP Trailing Feed Margin]                      │
└─────────────────────────────────────────────────────────────────────────────────┘
◄── leftMargin = 36 px (3.05 mm)                    rightMargin = 68 px (5.76 mm) ──►
```

### Numerical Constants:
```typescript
const sheetW = 1800;       // 6.00 inches @ 300 DPI
const sheetH = 1200;       // 4.00 inches @ 300 DPI

const cols = 4;
const rows = 2;

const photoW = 397;        // 33.6 mm @ 300 DPI (Standard passport portrait width)
const photoH = 513;        // 43.4 mm @ 300 DPI (Standard passport portrait height)

const colGap = 36;         // 3.05 mm spacing between horizontal photos
const rowGap = 36;         // 3.05 mm spacing between vertical photo rows

const leftMargin = 36;     // 3.05 mm from left paper edge
const topMargin = 12;      // 1.02 mm from top paper edge
```

---

## 3. Margin Verification & Hardware Alignment Calculations

### Horizontal Axis (Width = 1800 px):
$$\text{Total Active Width} = (4 \times \text{photoW}) + (3 \times \text{colGap})$$
$$\text{Total Active Width} = (4 \times 397) + (3 \times 36) = 1588 + 108 = 1696\text{ px}$$

$$\text{X End Position} = \text{leftMargin} + \text{Total Active Width} = 36 + 1696 = 1732\text{ px}$$
$$\text{rightMargin} = \text{sheetW} - \text{X End Position} = 1800 - 1732 = 68\text{ px}\ (5.76\text{ mm})$$

- **Left Margin**: $36\text{ px} = 3.05\text{ mm}$ $\rightarrow$ safely clear of the printer's $2.5\text{ mm}$ physical hardware feed roller margin.
- **Right Margin**: $68\text{ px} = 5.76\text{ mm}$ $\rightarrow$ safely clear of the printer's $3.0\text{ mm}$ physical right margin.
- **Total Clearance**: Both left and right borders print 100% complete with zero cropping!

### Vertical Axis (Height = 1200 px):
$$\text{Total Active Height} = (2 \times \text{photoH}) + (1 \times \text{rowGap})$$
$$\text{Total Active Height} = (2 \times 513) + (1 \times 36) = 1026 + 36 = 1062\text{ px}$$

$$\text{Y End Position} = \text{topMargin} + \text{Total Active Height} = 12 + 1062 = 1074\text{ px}$$
$$\text{bottomMargin} = \text{sheetH} - \text{Y End Position} = 1200 - 1074 = 126\text{ px}\ (10.67\text{ mm})$$

- **Top Margin**: $12\text{ px} = 1.02\text{ mm}$ $\rightarrow$ utilizes the top leading edge effectively.
- **Bottom Margin**: $126\text{ px} = 10.67\text{ mm}$ $\rightarrow$ **Crucial for HP Smart Tank printers**. The HP Smart Tank rear tray has a physical trailing margin of $\approx 8\text{ mm} - 10\text{ mm}$ where the feed roller releases the sheet. Having $10.67\text{ mm}$ prevents the bottom 4 photos from getting cropped.

---

## 4. Single Photo Cropping & Sharp Miter Border Algorithm

### Step A: High-Resolution Single Photo Rendering
```typescript
// Indian/Standard passport ratio = 35 : 45 (7:9)
const PASSPORT_ASPECT_RATIO = 35 / 45; // ~0.77778

const singleWidth = 700;
const singleHeight = Math.round(singleWidth / PASSPORT_ASPECT_RATIO); // 900 px

const offscreen = document.createElement('canvas');
offscreen.width = singleWidth;
offscreen.height = singleHeight;
const offCtx = offscreen.getContext('2d');

// 1. Fill pure white background
offCtx.fillStyle = '#FFFFFF';
offCtx.fillRect(0, 0, singleWidth, singleHeight);

// 2. Strict rectangular clip (prevents any curved or rounded artifacts)
offCtx.save();
offCtx.beginPath();
offCtx.rect(0, 0, singleWidth, singleHeight);
offCtx.clip();

// 3. Transform based on user zoom, pan, and rotation
const scaleFactor = singleWidth / 280; // Map from screen preview canvas
offCtx.translate(singleWidth / 2 + pan.x * scaleFactor, singleHeight / 2 + pan.y * scaleFactor);
offCtx.rotate((rotation * Math.PI) / 180);
offCtx.scale(zoom, zoom);

// 4. Center-crop image draw
const imgRatio = img.width / img.height;
let drawW = singleWidth;
let drawH = singleWidth / imgRatio;
if (drawH < singleHeight) {
  drawH = singleHeight;
  drawW = singleHeight * imgRatio;
}
offCtx.drawImage(img, -drawW / 2, -drawH / 2, drawW, drawH);
offCtx.restore();
```

### Step B: 8-Up Sheet Assembly with Sharp Miter Borders
```typescript
for (let r = 0; r < rows; r++) {
  for (let c = 0; c < cols; c++) {
    const x = leftMargin + c * (photoW + colGap);
    const y = topMargin + r * (photoH + rowGap);

    // 1. Draw photo strictly square
    ctx.save();
    ctx.beginPath();
    ctx.rect(x, y, photoW, photoH);
    ctx.clip();
    ctx.drawImage(singlePhotoCanvas, 0, 0, singlePhotoCanvas.width, singlePhotoCanvas.height, x, y, photoW, photoH);
    ctx.restore();

    // 2. Fine cutting outline (Sharp miter corners, no rounded corners)
    ctx.lineWidth = 2;
    ctx.lineJoin = 'miter';
    ctx.miterLimit = 10;
    ctx.strokeStyle = '#5ba6d1'; // Clean studio cyan cut line
    ctx.strokeRect(x, y, photoW, photoH);
  }
}
```

---

## 5. HP Smart Tank Driver & Agent Printing Pipeline

In `windows-agent/Core/PhotoProcessor.cs`:

### 1. Dual PageSettings Synchronization (Eliminates Error E2):
```csharp
// CRITICAL FOR HP SMART TANK 580:
// Set PaperSize, Landscape, and Margins on BOTH DefaultPageSettings AND PrinterSettings.DefaultPageSettings!
// This prevents HP Error E2 (paper length mismatch) and continuous feed spooler loops.
printDoc.DefaultPageSettings.PaperSize = selectedPaperSize;
printDoc.PrinterSettings.DefaultPageSettings.PaperSize = selectedPaperSize;

printDoc.DefaultPageSettings.Landscape = true;
printDoc.PrinterSettings.DefaultPageSettings.Landscape = true;

var margins = new Margins(0, 0, 0, 0);
printDoc.DefaultPageSettings.Margins = margins;
printDoc.PrinterSettings.DefaultPageSettings.Margins = margins;

printDoc.DefaultPageSettings.Color = (colorMode == "COLOR");
printDoc.PrinterSettings.DefaultPageSettings.Color = (colorMode == "COLOR");
```

### 2. Lock Exactly 1 Copy & Standard Controller (Eliminates Spooler Loop):
```csharp
// Lock to exactly 1 copy to prevent driver spooler loops
printDoc.PrinterSettings.Copies = 1;

// Use StandardPrintController to suppress the modal print status dialog
printDoc.PrintController = new StandardPrintController();
```

### 3. Exact 1:1 Scale Preservation:
```csharp
var printableArea = e.PageBounds; // 600 x 400 in 100 DPI GDI units

// 100% exact 1:1 scale without any shrinking (600 / 1800 = 0.33333, 400 / 1200 = 0.33333)
float scale = (float)printableArea.Width / srcW;

var w = (int)(srcW * scale);
var h = (int)(srcH * scale);
var x = printableArea.X + (printableArea.Width - w) / 2;
var y = printableArea.Y + (printableArea.Height - h) / 2;
var destRect = new Rectangle(x, y, w, h);

e.Graphics.InterpolationMode = InterpolationMode.HighQualityBicubic;
e.Graphics.SmoothingMode = SmoothingMode.HighQuality;
e.Graphics.PixelOffsetMode = PixelOffsetMode.HighQuality;

e.Graphics.DrawImage(originalBmp, destRect);
```

---

## 6. Codebase File Map

| Purpose | File Path |
| :--- | :--- |
| **8-Up Generation & Crop Studio** | `customer-web/src/pages/PassportPhotoPage.tsx` |
| **Windows Agent C# Printing Engine** | `windows-agent/Core/PhotoProcessor.cs` |
| **Admin Physical Action & Preview** | `admin-dashboard/src/App.tsx` |
| **Windows Agent Settings Window** | `windows-agent/UI/PrintSettingsWindow.xaml` |
| **Master Documentation** | `docs/PASSPORT_PHOTO_8_CALIBRATION_README.md` |

---
**Standard locked as of November 23, 2026.** Verified on physical HP Smart Tank 580 series hardware.
