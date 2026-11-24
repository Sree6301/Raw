using System;
using System.Collections.Generic;
using System.IO;
using System.Runtime.InteropServices;
using PdfSharpCore.Drawing;
using PdfSharpCore.Pdf;

namespace SmartXeroxHub.Agent.Core
{
    public class ScanParameters
    {
        public int Dpi { get; set; } = 300;
        public string ColorMode { get; set; } = "COLOR"; // "COLOR" or "GRAYSCALE"
        public string Format { get; set; } = "JPEG";    // "JPEG" or "PDF"
    }

    public class ScanManager
    {
        private readonly string _rawScansDir;

        public ScanManager(string? customScansDir = null)
        {
            if (!string.IsNullOrEmpty(customScansDir) && Directory.Exists(customScansDir))
            {
                _rawScansDir = customScansDir;
            }
            else if (Directory.Exists(@"g:\Smart Xerox Hub\RAW_Inputs\Scans"))
            {
                _rawScansDir = @"g:\Smart Xerox Hub\RAW_Inputs\Scans";
            }
            else
            {
                // Find RAW_Inputs\Scans relative to workspace or application directory
                var current = AppDomain.CurrentDomain.BaseDirectory;
                string candidate = Path.Combine(current, "RAW_Inputs", "Scans");
                while (!Directory.Exists(Path.GetDirectoryName(candidate)) && Directory.GetParent(current) != null)
                {
                    current = Directory.GetParent(current)!.FullName;
                    candidate = Path.Combine(current, "RAW_Inputs", "Scans");
                }

                if (!Directory.Exists(candidate))
                {
                    Directory.CreateDirectory(candidate);
                }
                _rawScansDir = candidate;
            }

            LoggingManager.Info($"[ScanManager] Scans directory configured at: {_rawScansDir}");
        }

        public string GetScansDirectory() => _rawScansDir;

        /// <summary>
        /// Communicates directly with the physical HP Smart Tank 589 flatbed scanner via Windows Image Acquisition (WIA).
        /// Captures the EXACT physical document from the glass platen without any synthetic text, overlays, or watermarks.
        /// </summary>
        public string AcquireFlatbedScan(ScanParameters parameters, int pageNumber = 1, string? customPrefix = null)
        {
            LoggingManager.Info($"[ScanManager] Triggering real physical scan on HP Smart Tank 589 (Resolution: {parameters.Dpi} DPI, Mode: {parameters.ColorMode})");

            var prefix = string.IsNullOrEmpty(customPrefix) ? "Scan" : customPrefix;
            var timeStamp = DateTime.Now.ToString("yyyyMMdd_HHmmss");
            var outFileName = $"{prefix}_{timeStamp}_p{pageNumber}.jpg";
            var outputFilePath = Path.Combine(_rawScansDir, outFileName);

            Exception? lastException = null;

            try
            {
                var wiaDevMgrType = Type.GetTypeFromProgID("WIA.DeviceManager");
                if (wiaDevMgrType != null)
                {
                    dynamic devMgr = Activator.CreateInstance(wiaDevMgrType)!;
                    int count = devMgr.DeviceInfos.Count;
                    LoggingManager.Info($"[ScanManager] Enumerating {count} WIA imaging device(s)...");

                    dynamic? selectedDevice = null;

                    // Collect and prioritize USB scanners first over Wi-Fi
                    var candidateList = new List<dynamic>();
                    for (int i = 1; i <= count; i++)
                    {
                        candidateList.Add(devMgr.DeviceInfos.Item(i));
                    }

                    candidateList.Sort((a, b) =>
                    {
                        string nameA = ""; try { nameA = a.Properties.Item("Name").Value?.ToString() ?? ""; } catch { }
                        string nameB = ""; try { nameB = b.Properties.Item("Name").Value?.ToString() ?? ""; } catch { }
                        string idA = a.DeviceID?.ToString() ?? "";
                        string idB = b.DeviceID?.ToString() ?? "";
                        bool aIsUsb = nameA.Contains("USB", StringComparison.OrdinalIgnoreCase) || idA.Contains("0000");
                        bool bIsUsb = nameB.Contains("USB", StringComparison.OrdinalIgnoreCase) || idB.Contains("0000");
                        if (aIsUsb && !bIsUsb) return -1;
                        if (!aIsUsb && bIsUsb) return 1;
                        return 0;
                    });

                    foreach (var info in candidateList)
                    {
                        string devId = info.DeviceID?.ToString() ?? "";
                        string devName = "";
                        try { devName = info.Properties.Item("Name").Value?.ToString() ?? ""; } catch { }

                        LoggingManager.Info($"[ScanManager] Evaluating WIA Scanner: {devName} ({devId})");

                        try
                        {
                            dynamic conn = info.Connect();
                            if (conn != null)
                            {
                                selectedDevice = conn;
                                LoggingManager.Info($"[ScanManager] Successfully connected to scanner: {devName} [{devId}]");
                                break;
                            }
                        }
                        catch (Exception ex)
                        {
                            LoggingManager.Warn($"[ScanManager] Device '{devName}' connect skipped: {ex.Message}");
                            lastException = ex;
                        }
                    }

                    if (selectedDevice != null)
                    {
                        // Get primary scanner flatbed item
                        dynamic item = selectedDevice.Items.Item(1);

                        // Set scan properties
                        try
                        {
                            // Current Intent: 1 = Color, 2 = Grayscale, 4 = Text/BW
                            int intent = parameters.ColorMode.Equals("GRAYSCALE", StringComparison.OrdinalIgnoreCase) ? 2 : 1;
                            SetWiaProperty(item.Properties, "Current Intent", intent);
                        }
                        catch { }

                        try
                        {
                            SetWiaProperty(item.Properties, "Horizontal Resolution", parameters.Dpi);
                            SetWiaProperty(item.Properties, "Vertical Resolution", parameters.Dpi);
                        }
                        catch { }

                        LoggingManager.Info("[ScanManager] Transferring physical image data from HP flatbed glass...");
                        // WIA Image Format GUID: {B96B3CAE-0728-11D3-9D7B-0000F81EF32E} for JPEG
                        dynamic imageFile = item.Transfer("{B96B3CAE-0728-11D3-9D7B-0000F81EF32E}");
                        if (imageFile != null)
                        {
                            if (File.Exists(outputFilePath)) File.Delete(outputFilePath);
                            imageFile.SaveFile(outputFilePath);

                            LoggingManager.Info($"[ScanManager] SUCCESS: Physical flatbed scan saved to: {outputFilePath} ({new FileInfo(outputFilePath).Length} bytes)");
                            return outputFilePath;
                        }
                    }
                }
            }
            catch (Exception ex)
            {
                LoggingManager.Error("[ScanManager] Physical WIA scanner acquisition error", ex);
                lastException = ex;
            }

            if (lastException != null)
            {
                throw new InvalidOperationException($"Physical scanner acquisition failed: {lastException.Message}. Ensure HP Smart Tank 589 is powered on, flatbed lid is closed, and printer is not busy.");
            }

            throw new InvalidOperationException("No online HP scanner was detected by Windows Image Acquisition (WIA).");
        }

        private static void SetWiaProperty(dynamic properties, string propName, object propValue)
        {
            try
            {
                dynamic prop = properties.Item(propName);
                if (prop != null)
                {
                    prop.Value = propValue;
                }
            }
            catch (Exception ex)
            {
                LoggingManager.Warn($"[ScanManager] Property '{propName}' could not be set: {ex.Message}");
            }
        }

        /// <summary>
        /// Combines multiple captured page images into a single multi-page PDF document in RAW_Inputs\Scans.
        /// </summary>
        public string CompileScannedPdf(List<string> pageImagePaths, string orderNumber)
        {
            var outputPdfPath = Path.Combine(_rawScansDir, $"ScannedDoc_{orderNumber}.pdf");
            using var pdfDoc = new PdfDocument();

            foreach (var imgPath in pageImagePaths)
            {
                if (File.Exists(imgPath))
                {
                    var page = pdfDoc.AddPage();
                    using var xImg = XImage.FromFile(imgPath);
                    page.Width = xImg.PointWidth;
                    page.Height = xImg.PointHeight;

                    using var gfx = XGraphics.FromPdfPage(page);
                    gfx.DrawImage(xImg, 0, 0, xImg.PointWidth, xImg.PointHeight);
                }
            }

            pdfDoc.Save(outputPdfPath);
            LoggingManager.Info($"[ScanManager] Combined {pageImagePaths.Count} raw scan pages into PDF: {outputPdfPath}");
            return outputPdfPath;
        }

        /// <summary>
        /// Saves each scanned page image into its own individual PDF document in RAW_Inputs\Scans.
        /// </summary>
        public List<string> CompileIndividualPdfs(List<string> pageImagePaths, string prefix)
        {
            var results = new List<string>();
            for (int i = 0; i < pageImagePaths.Count; i++)
            {
                var imgPath = pageImagePaths[i];
                if (File.Exists(imgPath))
                {
                    var outPath = Path.Combine(_rawScansDir, $"ScannedDoc_{prefix}_p{i + 1}.pdf");
                    using var pdfDoc = new PdfDocument();
                    var page = pdfDoc.AddPage();
                    using var xImg = XImage.FromFile(imgPath);
                    page.Width = xImg.PointWidth;
                    page.Height = xImg.PointHeight;
                    using var gfx = XGraphics.FromPdfPage(page);
                    gfx.DrawImage(xImg, 0, 0, xImg.PointWidth, xImg.PointHeight);
                    pdfDoc.Save(outPath);
                    results.Add(outPath);
                }
            }
            LoggingManager.Info($"[ScanManager] Saved {results.Count} individual PDF pages for {prefix}");
            return results;
        }

        /// <summary>
        /// Saves all scanned pages as PNG format.
        /// </summary>
        public List<string> SaveAllAsPng(List<string> pageImagePaths, string prefix)
        {
            var results = new List<string>();
            for (int i = 0; i < pageImagePaths.Count; i++)
            {
                var imgPath = pageImagePaths[i];
                if (File.Exists(imgPath))
                {
                    var outPath = Path.Combine(_rawScansDir, $"ScannedDoc_{prefix}_p{i + 1}.png");
                    using var img = System.Drawing.Image.FromFile(imgPath);
                    img.Save(outPath, System.Drawing.Imaging.ImageFormat.Png);
                    results.Add(outPath);
                }
            }
            LoggingManager.Info($"[ScanManager] Exported {results.Count} pages as PNG for {prefix}");
            return results;
        }

        /// <summary>
        /// Saves all scanned pages as JPEG format.
        /// </summary>
        public List<string> SaveAllAsJpeg(List<string> pageImagePaths, string prefix)
        {
            var results = new List<string>();
            for (int i = 0; i < pageImagePaths.Count; i++)
            {
                var imgPath = pageImagePaths[i];
                if (File.Exists(imgPath))
                {
                    var outPath = Path.Combine(_rawScansDir, $"ScannedDoc_{prefix}_p{i + 1}.jpg");
                    if (Path.GetFullPath(imgPath) != Path.GetFullPath(outPath))
                    {
                        File.Copy(imgPath, outPath, true);
                    }
                    results.Add(outPath);
                }
            }
            LoggingManager.Info($"[ScanManager] Exported {results.Count} pages as JPEG for {prefix}");
            return results;
        }
    }
}
