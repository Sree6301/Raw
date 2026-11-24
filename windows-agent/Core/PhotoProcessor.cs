using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.Drawing;
using System.Drawing.Drawing2D;
using System.Drawing.Imaging;
using System.Drawing.Printing;
using System.IO;
using System.Runtime.InteropServices;
using Docnet.Core;
using Docnet.Core.Models;
using Docnet.Core.Readers;

namespace SmartXeroxHub.Agent.Core
{
    public class PrintJobOptions
    {
        public int Dpi { get; set; } = 300;
        public int PagesPerSheet { get; set; } = 1; // 1, 2, or 4
        public string Orientation { get; set; } = "PORTRAIT"; // PORTRAIT, LANDSCAPE, AUTO
        public double ScalePercent { get; set; } = 100.0;
        public string PaperSize { get; set; } = "A4"; // A4, 4X6
        public string PaperType { get; set; } = "NORMAL_A4"; // NORMAL_A4, PHOTO_A4, PHOTO_4X6
        public string ColorMode { get; set; } = "BW"; // BW, COLOR
        public string Scope { get; set; } = "ALL_PAGES"; // ALL_PAGES, CURRENT_PAGE
        public bool EnableBorder { get; set; } = false;
        public string FitMode { get; set; } = "FIT"; // FIT or CROP
        public List<int>? PageNumbers { get; set; } = null; // null = all pages (1-based)
        public Dictionary<int, double>? PageScales { get; set; } = null; // 1-based page -> scale percent
        public Dictionary<int, string>? PageOrientations { get; set; } = null; // 1-based page -> orientation
    }

    public static class PhotoProcessor
    {
        /// <summary>
        /// Prints an image directly to the HP Smart Tank 589 on photo paper without any watermark or overlay.
        /// </summary>
        public static bool PrintPhoto(
            string imagePath,
            string printerName,
            string paperType, // "PHOTO_A4" or "PHOTO_4X6"
            string colorMode, // "COLOR" or "BW"
            string fitMode,   // "FIT" or "CROP" / "FILL"
            string docTitle = "SmartXerox_Photo",
            double scalePercent = 100.0,
            string orientation = "PORTRAIT",
            bool enableBorder = false
        )
        {
            if (!File.Exists(imagePath))
            {
                LoggingManager.Error($"[PhotoProcessor] Photo file not found: {imagePath}");
                return false;
            }

            try
            {
                using var printDoc = new PrintDocument();
                printDoc.PrinterSettings.PrinterName = printerName;
                printDoc.DocumentName = docTitle;
                printDoc.PrintController = new StandardPrintController();
                printDoc.PrinterSettings.Copies = 1;

                var is4x6 = paperType == "PHOTO_4X6";
                bool isLandscape = (orientation == "LANDSCAPE");

                // Select printer's native paper size from driver if available
                PaperSize? selectedPaperSize = null;
                if (is4x6)
                {
                    foreach (PaperSize ps in printDoc.PrinterSettings.PaperSizes)
                    {
                        if (ps.PaperName.Contains("4x6", StringComparison.OrdinalIgnoreCase) ||
                            ps.PaperName.Contains("10x15", StringComparison.OrdinalIgnoreCase) ||
                            ps.PaperName.Contains("4 x 6", StringComparison.OrdinalIgnoreCase))
                        {
                            selectedPaperSize = ps;
                            break;
                        }
                    }
                }
                else
                {
                    foreach (PaperSize ps in printDoc.PrinterSettings.PaperSizes)
                    {
                        if (ps.PaperName.Contains("A4", StringComparison.OrdinalIgnoreCase))
                        {
                            selectedPaperSize = ps;
                            break;
                        }
                    }
                }

                if (selectedPaperSize == null)
                {
                    selectedPaperSize = new PaperSize(
                        is4x6 ? "4x6" : "A4",
                        is4x6 ? 400 : 827,
                        is4x6 ? 600 : 1169
                    );
                }

                // =========================================================================
                // 🔒 PERMANENT CALIBRATION STANDARD - DO NOT MODIFY!
                // See PASSPORT_PHOTO_8_CALIBRATION_README.md for exact specifications.
                // CRITICAL FOR HP SMART TANK 580:
                // Set PaperSize, Landscape, and Margins on BOTH DefaultPageSettings AND PrinterSettings.DefaultPageSettings!
                // This prevents HP Error E2 (paper length mismatch) and continuous feed spooler loops.
                // =========================================================================
                printDoc.DefaultPageSettings.PaperSize = selectedPaperSize;
                printDoc.PrinterSettings.DefaultPageSettings.PaperSize = selectedPaperSize;

                printDoc.DefaultPageSettings.Landscape = isLandscape;
                printDoc.PrinterSettings.DefaultPageSettings.Landscape = isLandscape;

                // Borderless (default): Margins 0,0,0,0 -> full edge-to-edge bleed.
                // With Border: Outside white empty margin border (0.2" on 4x6, 0.3" on A4).
                var margins = !enableBorder
                    ? new Margins(0, 0, 0, 0)
                    : (is4x6 ? new Margins(20, 20, 20, 20) : new Margins(30, 30, 30, 30));
                printDoc.DefaultPageSettings.Margins = margins;
                printDoc.PrinterSettings.DefaultPageSettings.Margins = margins;

                printDoc.DefaultPageSettings.Color = (colorMode == "COLOR");
                printDoc.PrinterSettings.DefaultPageSettings.Color = (colorMode == "COLOR");

                using var originalBmp = new Bitmap(imagePath);

                printDoc.PrintPage += (sender, e) =>
                {
                    if (e.Graphics == null) return;

                    var srcW = originalBmp.Width;
                    var srcH = originalBmp.Height;

                    // Borderless prints full page e.PageBounds; With Border prints inside e.MarginBounds leaving white paper margin
                    var printableArea = !enableBorder ? e.PageBounds : e.MarginBounds;

                    float scale;
                    if (is4x6 && !enableBorder)
                    {
                        // 100% exact 1:1 scale without any shrinking (600 / 1800 = 0.33333, 400 / 1200 = 0.33333)
                        // Preserves exact original photo height and length
                        scale = (float)printableArea.Width / srcW;
                    }
                    else if (enableBorder)
                    {
                        // Clean fit inside margin bounds with white border surround
                        scale = Math.Min((float)printableArea.Width / srcW, (float)printableArea.Height / srcH);
                    }
                    else if (fitMode == "FILL" || fitMode == "CROP")
                    {
                        scale = Math.Max((float)printableArea.Width / srcW, (float)printableArea.Height / srcH);
                    }
                    else
                    {
                        scale = Math.Min((float)printableArea.Width / srcW, (float)printableArea.Height / srcH);
                    }
                    scale *= (float)(scalePercent / 100.0);

                    var w = (int)(srcW * scale);
                    var h = (int)(srcH * scale);
                    var x = printableArea.X + (printableArea.Width - w) / 2;
                    var y = printableArea.Y + (printableArea.Height - h) / 2;
                    var destRect = new Rectangle(x, y, w, h);

                    e.Graphics.InterpolationMode = InterpolationMode.HighQualityBicubic;
                    e.Graphics.SmoothingMode = SmoothingMode.HighQuality;
                    e.Graphics.PixelOffsetMode = PixelOffsetMode.HighQuality;

                    if (colorMode == "BW")
                    {
                        var colorMatrix = new ColorMatrix(new float[][]
                        {
                            new float[] {.3f, .3f, .3f, 0, 0},
                            new float[] {.59f, .59f, .59f, 0, 0},
                            new float[] {.11f, .11f, .11f, 0, 0},
                            new float[] {0, 0, 0, 1, 0},
                            new float[] {0, 0, 0, 0, 1}
                        });
                        using var imageAttributes = new ImageAttributes();
                        imageAttributes.SetColorMatrix(colorMatrix);

                        e.Graphics.DrawImage(originalBmp, destRect, 0, 0, srcW, srcH, GraphicsUnit.Pixel, imageAttributes);
                    }
                    else
                    {
                        e.Graphics.DrawImage(originalBmp, destRect);
                    }

                    e.HasMorePages = false;
                };

                printDoc.Print();
                LoggingManager.Info($"[PhotoProcessor] Clean photo print executed: '{imagePath}' sent to '{printerName}' ({paperType})");
                return true;
            }
            catch (Exception ex)
            {
                LoggingManager.Error($"[PhotoProcessor] Failed to print photo '{imagePath}'", ex);
                return false;
            }
        }

        /// <summary>
        /// Renders a PDF page from Docnet.Core IDocReader into a GDI+ Bitmap.
        /// </summary>
        private static Bitmap RenderPdfPage(IDocReader docReader, int pageIndex, int dpi)
        {
            using var pageReader = docReader.GetPageReader(pageIndex);
            int width = pageReader.GetPageWidth();
            int height = pageReader.GetPageHeight();
            byte[] rawBytes = pageReader.GetImage(); // BGRA raw bytes

            var bmp = new Bitmap(width, height, PixelFormat.Format32bppArgb);
            var bmpData = bmp.LockBits(new Rectangle(0, 0, width, height), ImageLockMode.WriteOnly, bmp.PixelFormat);
            try
            {
                Marshal.Copy(rawBytes, 0, bmpData.Scan0, rawBytes.Length);
            }
            finally
            {
                bmp.UnlockBits(bmpData);
            }
            bmp.SetResolution(dpi, dpi);
            return bmp;
        }

        /// <summary>
        /// Generates the verified 8-Up Passport photo composite sheet for 4x6 HP Photo Paper (1800 x 1200 px at 300 DPI)
        /// using the exact permanent calibration parameters: photo size 397x513, left margin 36, top margin 12, gaps 36.
        /// </summary>
        public static string BuildPassport8UpSheet(string inputPhotoPath, string? outputDir = null)
        {
            using var srcImg = Image.FromFile(inputPhotoPath);
            const int sheetW = 1800;
            const int sheetH = 1200;
            const int photoW = 397;
            const int photoH = 513;
            const int leftMargin = 36;
            const int colGap = 36;
            const int topMargin = 12;
            const int rowGap = 36;
            const int cols = 4;
            const int rows = 2;

            var bmp = new Bitmap(sheetW, sheetH, PixelFormat.Format32bppArgb);
            bmp.SetResolution(300, 300);

            using (var g = Graphics.FromImage(bmp))
            {
                g.Clear(Color.White);
                g.InterpolationMode = InterpolationMode.HighQualityBicubic;
                g.SmoothingMode = SmoothingMode.HighQuality;
                g.PixelOffsetMode = PixelOffsetMode.HighQuality;

                // Crop source image to 397x513 aspect ratio
                double targetAspect = (double)photoW / photoH;
                double srcAspect = (double)srcImg.Width / srcImg.Height;
                int cropW = srcImg.Width;
                int cropH = srcImg.Height;
                int cropX = 0;
                int cropY = 0;

                if (srcAspect > targetAspect)
                {
                    cropW = (int)(srcImg.Height * targetAspect);
                    cropX = (srcImg.Width - cropW) / 2;
                }
                else
                {
                    cropH = (int)(srcImg.Width / targetAspect);
                    cropY = (srcImg.Height - cropH) / 2;
                }

                using var croppedBmp = new Bitmap(photoW, photoH, PixelFormat.Format32bppArgb);
                croppedBmp.SetResolution(300, 300);
                using (var cg = Graphics.FromImage(croppedBmp))
                {
                    cg.Clear(Color.White);
                    cg.InterpolationMode = InterpolationMode.HighQualityBicubic;
                    cg.SmoothingMode = SmoothingMode.HighQuality;
                    cg.PixelOffsetMode = PixelOffsetMode.HighQuality;
                    cg.DrawImage(srcImg, new Rectangle(0, 0, photoW, photoH), new Rectangle(cropX, cropY, cropW, cropH), GraphicsUnit.Pixel);
                }

                for (int r = 0; r < rows; r++)
                {
                    for (int c = 0; c < cols; c++)
                    {
                        int x = leftMargin + c * (photoW + colGap);
                        int y = topMargin + r * (photoH + rowGap);

                        g.DrawImage(croppedBmp, x, y, photoW, photoH);

                        // Sharp cutting border outline
                        using var borderPen = new Pen(Color.FromArgb(180, 203, 213, 225), 1.5f);
                        borderPen.LineJoin = LineJoin.Miter;
                        g.DrawRectangle(borderPen, x, y, photoW, photoH);
                    }
                }
            }

            var dir = outputDir ?? Path.GetDirectoryName(inputPhotoPath) ?? AppDomain.CurrentDomain.BaseDirectory;
            var outPath = Path.Combine(dir, $"Passport8Up_{DateTime.Now:yyyyMMdd_HHmmss}_{Path.GetFileNameWithoutExtension(inputPhotoPath)}.jpg");
            bmp.Save(outPath, ImageFormat.Jpeg);
            return outPath;
        }

        /// <summary>
        /// Prints a PDF document to the HP printer using official Windows GDI+ spooler (PrintDocument)
        /// with zero external browser dependencies, supporting N-up (1, 2, 4 pages/sheet), scaling, and rotation.
        /// </summary>
        public static bool PrintPdfDocument(
            string pdfPath,
            string printerName,
            string docTitle,
            PrintJobOptions? options = null
        )
        {
            if (!File.Exists(pdfPath))
            {
                LoggingManager.Error($"[PhotoProcessor] PDF not found: {pdfPath}");
                return false;
            }

            options ??= new PrintJobOptions();
            int dpi = options.Dpi > 0 ? options.Dpi : 300;
            int pagesPerSheet = options.PagesPerSheet is 2 or 4 ? options.PagesPerSheet : 1;

            LoggingManager.Info($"[PhotoProcessor] Spooling PDF: '{pdfPath}' -> '{printerName}' ({pagesPerSheet} pg/sheet, {options.ColorMode}, {dpi} DPI)");

            try
            {
                using var docReader = DocLib.Instance.GetDocReader(pdfPath, new PageDimensions(dpi / 72.0));
                int totalPdfPages = docReader.GetPageCount();
                if (totalPdfPages == 0)
                {
                    LoggingManager.Warn("[PhotoProcessor] PDF contains 0 pages.");
                    return false;
                }

                // Determine ordered list of page indices (0-based) to print
                List<int> pagesToPrint = new();
                if (options.PageNumbers != null && options.PageNumbers.Count > 0)
                {
                    foreach (var p in options.PageNumbers)
                    {
                        if (p >= 1 && p <= totalPdfPages) pagesToPrint.Add(p - 1);
                    }
                }
                else
                {
                    for (int i = 0; i < totalPdfPages; i++) pagesToPrint.Add(i);
                }

                if (pagesToPrint.Count == 0)
                {
                    LoggingManager.Warn("[PhotoProcessor] No valid pages selected to print.");
                    return false;
                }

                int totalSheets = (int)Math.Ceiling((double)pagesToPrint.Count / pagesPerSheet);
                int currentSheetIndex = 0;

                using var printDoc = new PrintDocument();
                printDoc.PrinterSettings.PrinterName = printerName;
                printDoc.DocumentName = string.IsNullOrWhiteSpace(docTitle) ? Path.GetFileNameWithoutExtension(pdfPath) : docTitle;

                var isPhoto4x6 = options.PaperSize == "PHOTO_4X6" || options.PaperType == "PHOTO_4X6";
                var paperSize = new PaperSize(
                    isPhoto4x6 ? "4x6" : "A4",
                    isPhoto4x6 ? 400 : 827,
                    isPhoto4x6 ? 600 : 1169
                );
                printDoc.DefaultPageSettings.PaperSize = paperSize;
                printDoc.DefaultPageSettings.Margins = new Margins(15, 15, 15, 15);
                printDoc.DefaultPageSettings.Color = (options.ColorMode == "COLOR");
                printDoc.DefaultPageSettings.Landscape = (options.Orientation == "LANDSCAPE");

                // Grayscale color matrix for black & white printing
                var grayMatrix = new ColorMatrix(new float[][]
                {
                    new float[] {.3f, .3f, .3f, 0, 0},
                    new float[] {.59f, .59f, .59f, 0, 0},
                    new float[] {.11f, .11f, .11f, 0, 0},
                    new float[] {0, 0, 0, 1, 0},
                    new float[] {0, 0, 0, 0, 1}
                });

                printDoc.PrintPage += (sender, e) =>
                {
                    if (e.Graphics == null) return;

                    var printableArea = e.MarginBounds;
                    e.Graphics.InterpolationMode = InterpolationMode.HighQualityBicubic;
                    e.Graphics.SmoothingMode = SmoothingMode.HighQuality;
                    e.Graphics.PixelOffsetMode = PixelOffsetMode.HighQuality;

                    int startIndex = currentSheetIndex * pagesPerSheet;
                    int countThisSheet = Math.Min(pagesPerSheet, pagesToPrint.Count - startIndex);

                    // Compute grid slot bounds
                    List<Rectangle> slots = new();
                    if (pagesPerSheet == 1)
                    {
                        slots.Add(printableArea);
                    }
                    else if (pagesPerSheet == 2)
                    {
                        if (printableArea.Width > printableArea.Height)
                        {
                            // Landscape: 2 columns
                            int halfW = printableArea.Width / 2;
                            slots.Add(new Rectangle(printableArea.X, printableArea.Y, halfW - 10, printableArea.Height));
                            slots.Add(new Rectangle(printableArea.X + halfW + 10, printableArea.Y, halfW - 10, printableArea.Height));
                        }
                        else
                        {
                            // Portrait: 2 rows
                            int halfH = printableArea.Height / 2;
                            slots.Add(new Rectangle(printableArea.X, printableArea.Y, printableArea.Width, halfH - 10));
                            slots.Add(new Rectangle(printableArea.X, printableArea.Y + halfH + 10, printableArea.Width, halfH - 10));
                        }
                    }
                    else // 4 pages per sheet (2x2 grid)
                    {
                        int halfW = printableArea.Width / 2;
                        int halfH = printableArea.Height / 2;
                        slots.Add(new Rectangle(printableArea.X, printableArea.Y, halfW - 8, halfH - 8));
                        slots.Add(new Rectangle(printableArea.X + halfW + 8, printableArea.Y, halfW - 8, halfH - 8));
                        slots.Add(new Rectangle(printableArea.X, printableArea.Y + halfH + 8, halfW - 8, halfH - 8));
                        slots.Add(new Rectangle(printableArea.X + halfW + 8, printableArea.Y + halfH + 8, halfW - 8, halfH - 8));
                    }

                    for (int s = 0; s < countThisSheet; s++)
                    {
                        int pageIdx = pagesToPrint[startIndex + s];
                        int pageNumber = pageIdx + 1; // 1-based

                        using var pageBmp = RenderPdfPage(docReader, pageIdx, dpi);

                        // Per-page or global scale
                        double scaleFactor = options.ScalePercent / 100.0;
                        if (options.PageScales != null && options.PageScales.TryGetValue(pageNumber, out var customScale))
                        {
                            scaleFactor = customScale / 100.0;
                        }

                        // Per-page or global orientation
                        string orientation = options.Orientation;
                        if (options.PageOrientations != null && options.PageOrientations.TryGetValue(pageNumber, out var customOrient))
                        {
                            orientation = customOrient;
                        }

                        if (orientation == "LANDSCAPE" && pageBmp.Width < pageBmp.Height)
                        {
                            pageBmp.RotateFlip(RotateFlipType.Rotate90FlipNone);
                        }
                        else if (orientation == "PORTRAIT" && pageBmp.Width > pageBmp.Height)
                        {
                            pageBmp.RotateFlip(RotateFlipType.Rotate270FlipNone);
                        }

                        var slot = slots[s];
                        float aspectScale = Math.Min((float)slot.Width / pageBmp.Width, (float)slot.Height / pageBmp.Height) * (float)scaleFactor;
                        int drawW = (int)(pageBmp.Width * aspectScale);
                        int drawH = (int)(pageBmp.Height * aspectScale);
                        int drawX = slot.X + (slot.Width - drawW) / 2;
                        int drawY = slot.Y + (slot.Height - drawH) / 2;
                        var destRect = new Rectangle(drawX, drawY, drawW, drawH);

                        if (options.ColorMode == "BW")
                        {
                            using var imgAttr = new ImageAttributes();
                            imgAttr.SetColorMatrix(grayMatrix);
                            e.Graphics.DrawImage(pageBmp, destRect, 0, 0, pageBmp.Width, pageBmp.Height, GraphicsUnit.Pixel, imgAttr);
                        }
                        else
                        {
                            e.Graphics.DrawImage(pageBmp, destRect);
                        }

                        if (options.EnableBorder)
                        {
                            using var borderPen = new Pen(Color.FromArgb(160, 160, 160), 1.5f);
                            e.Graphics.DrawRectangle(borderPen, destRect);
                        }
                    }

                    currentSheetIndex++;
                    e.HasMorePages = (currentSheetIndex < totalSheets);
                };

                printDoc.Print();
                LoggingManager.Info($"[PhotoProcessor] PDF successfully spooled directly to '{printerName}'! Physical sheets: {totalSheets}");
                return true;
            }
            catch (Exception ex)
            {
                LoggingManager.Error($"[PhotoProcessor] Failed to spool PDF '{pdfPath}'", ex);
                return false;
            }
        }
    }
}
