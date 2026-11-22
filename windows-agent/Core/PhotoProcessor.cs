using System;
using System.Diagnostics;
using System.Drawing;
using System.Drawing.Drawing2D;
using System.Drawing.Imaging;
using System.Drawing.Printing;
using System.IO;

namespace SmartXeroxHub.Agent.Core
{
    public static class PhotoProcessor
    {
        private static readonly string EdgePath = Path.Combine(
            Environment.GetFolderPath(Environment.SpecialFolder.ProgramFilesX86),
            "Microsoft", "Edge", "Application", "msedge.exe"
        );

        /// <summary>
        /// Prints an image directly to the HP Smart Tank 589 on photo paper without any watermark or overlay.
        /// </summary>
        public static bool PrintPhoto(
            string imagePath,
            string printerName,
            string paperType, // "PHOTO_A4" or "PHOTO_4X6"
            string colorMode, // "COLOR" or "BW"
            string fitMode,   // "FIT" or "FILL"
            string docTitle = "SmartXerox_Photo"
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

                // Setup Paper Size
                // A4: 210 x 297 mm -> 827 x 1169 hundredths of an inch
                // 4x6: 4 x 6 inch -> 400 x 600 hundredths of an inch
                var paperSize = new PaperSize(
                    paperType == "PHOTO_4X6" ? "4x6" : "A4",
                    paperType == "PHOTO_4X6" ? 400 : 827,
                    paperType == "PHOTO_4X6" ? 600 : 1169
                );
                printDoc.DefaultPageSettings.PaperSize = paperSize;
                printDoc.DefaultPageSettings.Margins = new Margins(10, 10, 10, 10);
                printDoc.DefaultPageSettings.Color = (colorMode == "COLOR");

                using var originalBmp = new Bitmap(imagePath);

                printDoc.PrintPage += (sender, e) =>
                {
                    if (e.Graphics == null) return;

                    var printableArea = e.MarginBounds;
                    var srcW = originalBmp.Width;
                    var srcH = originalBmp.Height;

                    // Compute aspect ratio rectangle
                    Rectangle destRect;
                    if (fitMode == "FILL")
                    {
                        var scale = Math.Max((float)printableArea.Width / srcW, (float)printableArea.Height / srcH);
                        var w = (int)(srcW * scale);
                        var h = (int)(srcH * scale);
                        var x = printableArea.X + (printableArea.Width - w) / 2;
                        var y = printableArea.Y + (printableArea.Height - h) / 2;
                        destRect = new Rectangle(x, y, w, h);
                    }
                    else // FIT
                    {
                        var scale = Math.Min((float)printableArea.Width / srcW, (float)printableArea.Height / srcH);
                        var w = (int)(srcW * scale);
                        var h = (int)(srcH * scale);
                        var x = printableArea.X + (printableArea.Width - w) / 2;
                        var y = printableArea.Y + (printableArea.Height - h) / 2;
                        destRect = new Rectangle(x, y, w, h);
                    }

                    e.Graphics.InterpolationMode = InterpolationMode.HighQualityBicubic;
                    e.Graphics.SmoothingMode = SmoothingMode.HighQuality;
                    e.Graphics.PixelOffsetMode = PixelOffsetMode.HighQuality;

                    if (colorMode == "BW")
                    {
                        // Apply Grayscale ColorMatrix
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

                        e.Graphics.DrawImage(
                            originalBmp,
                            destRect,
                            0, 0, srcW, srcH,
                            GraphicsUnit.Pixel,
                            imageAttributes
                        );
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
        /// Prints a PDF document to the HP printer using official Windows spooler with zero watermarks or mock text.
        /// </summary>
        public static bool PrintPdfDocument(string pdfPath, string printerName, string docTitle)
        {
            if (!File.Exists(pdfPath))
            {
                LoggingManager.Error($"[PhotoProcessor] PDF not found: {pdfPath}");
                return false;
            }

            LoggingManager.Info($"[PhotoProcessor] Submitting PDF to HP Spooler: '{pdfPath}' -> '{printerName}'");

            // Method 1: Silent print via Microsoft Edge native PDF print engine
            if (File.Exists(EdgePath))
            {
                try
                {
                    var psi = new ProcessStartInfo
                    {
                        FileName = EdgePath,
                        Arguments = $"--headless --print-to-printer --print-to-printer-name=\"{printerName}\" \"{pdfPath}\"",
                        CreateNoWindow = true,
                        WindowStyle = ProcessWindowStyle.Hidden,
                        UseShellExecute = false
                    };

                    using var proc = Process.Start(psi);
                    if (proc != null)
                    {
                        proc.WaitForExit(30000); // Wait up to 30s
                        LoggingManager.Info($"[PhotoProcessor] PDF successfully sent via native Edge print engine to '{printerName}' (Exit Code: {proc.ExitCode})");
                        return true;
                    }
                }
                catch (Exception ex)
                {
                    LoggingManager.Warn($"[PhotoProcessor] Edge print engine notice: {ex.Message}. Falling back to Windows Shell printto verb.");
                }
            }

            // Method 2: Native Windows Shell printto verb
            try
            {
                var psi = new ProcessStartInfo
                {
                    FileName = pdfPath,
                    Verb = "printto",
                    Arguments = $"\"{printerName}\"",
                    CreateNoWindow = true,
                    WindowStyle = ProcessWindowStyle.Hidden,
                    UseShellExecute = true
                };

                using var proc = Process.Start(psi);
                LoggingManager.Info($"[PhotoProcessor] PDF sent via Windows Shell printto verb to '{printerName}'.");
                return true;
            }
            catch (Exception ex)
            {
                LoggingManager.Error($"[PhotoProcessor] Shell printto failed for '{pdfPath}'", ex);
                return false;
            }
        }
    }
}
