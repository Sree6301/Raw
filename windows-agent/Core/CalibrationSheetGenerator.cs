using System;
using System.IO;
using PdfSharpCore.Drawing;
using PdfSharpCore.Pdf;

namespace SmartXeroxHub.Agent.Core
{
    public static class CalibrationSheetGenerator
    {
        /// <summary>
        /// Generates the physical duplex calibration test page specified in section 7.6.
        /// Contains FRONT TOP, FRONT BOTTOM, BACK TOP, BACK BOTTOM markers and orientation arrows.
        /// </summary>
        public static string GenerateCalibrationTestSheet(string outputDir)
        {
            if (!Directory.Exists(outputDir))
            {
                Directory.CreateDirectory(outputDir);
            }

            var filePath = Path.Combine(outputDir, "DuplexCalibrationSheet_HP589.pdf");
            using var document = new PdfDocument();

            // Page 1: Front Side
            var page1 = document.AddPage();
            page1.Width = XUnit.FromMillimeter(210);
            page1.Height = XUnit.FromMillimeter(297);
            using (var gfx = XGraphics.FromPdfPage(page1))
            {
                var titleFont = new XFont("Arial", 22, XFontStyle.Bold);
                var labelFont = new XFont("Arial", 16, XFontStyle.Bold);
                var textFont = new XFont("Arial", 11, XFontStyle.Regular);

                // Top Banner
                gfx.DrawRectangle(XBrushes.Navy, 30, 30, page1.Width - 60, 40);
                gfx.DrawString("FRONT TOP  ▲  (FEED THIS EDGE FIRST)", titleFont, XBrushes.White,
                    new XRect(30, 30, page1.Width - 60, 40), XStringFormats.Center);

                // Center Guide
                gfx.DrawString("SMART XEROX HUB - HP SMART TANK 589 DUPLEX CALIBRATION", labelFont, XBrushes.Black,
                    new XRect(0, 150, page1.Width, 30), XStringFormats.Center);
                gfx.DrawString("1. Print this sheet.\n2. Observe which edge emerges first.\n3. Turn over horizontally and verify BACK markers.\n4. Use this orientation profile in the Setup Wizard.", textFont, XBrushes.DarkSlateGray,
                    new XRect(60, 200, page1.Width - 120, 100), XStringFormats.TopLeft);

                // Alignment Crosshair in Center
                var cx = page1.Width / 2;
                var cy = page1.Height / 2;
                gfx.DrawLine(XPens.Red, cx - 50, cy, cx + 50, cy);
                gfx.DrawLine(XPens.Red, cx, cy - 50, cx, cy + 50);
                gfx.DrawEllipse(XPens.Red, cx - 30, cy - 30, 60, 60);

                // Bottom Banner
                gfx.DrawRectangle(XBrushes.Navy, 30, page1.Height - 70, page1.Width - 60, 40);
                gfx.DrawString("FRONT BOTTOM  ▼", titleFont, XBrushes.White,
                    new XRect(30, page1.Height - 70, page1.Width - 60, 40), XStringFormats.Center);
            }

            // Page 2: Back Side
            var page2 = document.AddPage();
            page2.Width = XUnit.FromMillimeter(210);
            page2.Height = XUnit.FromMillimeter(297);
            using (var gfx = XGraphics.FromPdfPage(page2))
            {
                var titleFont = new XFont("Arial", 22, XFontStyle.Bold);
                var labelFont = new XFont("Arial", 16, XFontStyle.Bold);

                // Top Banner
                gfx.DrawRectangle(XBrushes.DarkGreen, 30, 30, page2.Width - 60, 40);
                gfx.DrawString("BACK TOP  ▲  (VERIFY MATCHES FRONT TOP)", titleFont, XBrushes.White,
                    new XRect(30, 30, page2.Width - 60, 40), XStringFormats.Center);

                // Center Guide
                gfx.DrawString("CALIBRATION SUCCESS IF BOTH 'TOP' EDGES ALIGN", labelFont, XBrushes.DarkGreen,
                    new XRect(0, 200, page2.Width, 30), XStringFormats.Center);

                // Bottom Banner
                gfx.DrawRectangle(XBrushes.DarkGreen, 30, page2.Height - 70, page2.Width - 60, 40);
                gfx.DrawString("BACK BOTTOM  ▼", titleFont, XBrushes.White,
                    new XRect(30, page2.Height - 70, page2.Width - 60, 40), XStringFormats.Center);
            }

            document.Save(filePath);
            LoggingManager.Info($"[Calibration] Calibration test sheet generated: {filePath}");
            return filePath;
        }
    }
}
