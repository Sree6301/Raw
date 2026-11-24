using System;
using System.Collections.Generic;
using System.Drawing;
using System.Drawing.Imaging;
using System.IO;
using System.Runtime.InteropServices;
using System.Threading.Tasks;
using System.Windows;
using System.Windows.Controls;
using System.Windows.Interop;
using System.Windows.Media.Imaging;
using Docnet.Core;
using Docnet.Core.Models;
using Docnet.Core.Readers;
using SmartXeroxHub.Agent.Core;
using ComboBox = System.Windows.Controls.ComboBox;
using ComboBoxItem = System.Windows.Controls.ComboBoxItem;
using MessageBox = System.Windows.MessageBox;

namespace SmartXeroxHub.Agent.UI
{
    public partial class PrintSettingsWindow : Window
    {
        [DllImport("gdi32.dll")]
        public static extern bool DeleteObject(IntPtr hObject);

        private readonly BackendOrderDto _order;
        private readonly BackendSync _backendSync;
        private readonly DeviceManager _deviceManager;

        private int _currentPage = 1;
        private int _totalPages = 1;
        private string _resolvedFilePath = string.Empty;
        private bool _isInitialized = false;

        private readonly Dictionary<int, double> _pageScales = new();
        private readonly Dictionary<int, string> _pageOrientations = new();
        private bool _isNavigating = false;

        public bool ShouldPrintImmediately { get; private set; }
        public PrintJobOptions? SelectedOptions { get; private set; }

        public PrintSettingsWindow(BackendOrderDto order, BackendSync backendSync, DeviceManager deviceManager)
        {
            _order = order;
            _backendSync = backendSync;
            _deviceManager = deviceManager;

            InitializeComponent();

            TxtOrderHeader.Text = $"PRINT SETTINGS • ORDER {_order.OrderNumber}";
            TxtOrderSub.Text = $"{_order.ServiceType} — {_order.OriginalFileName} ({_order.TotalPages} pages × {_order.Copies} copies)";

            _totalPages = Math.Max(1, _order.TotalPages);

            if (_order.PrintSettings?.PageOrientations != null)
            {
                foreach (var kv in _order.PrintSettings.PageOrientations) _pageOrientations[kv.Key] = kv.Value;
            }
            if (_order.PrintSettings?.PageScales != null)
            {
                foreach (var kv in _order.PrintSettings.PageScales) _pageScales[kv.Key] = kv.Value;
            }

            SetupServiceAdaptiveUI();
            _isInitialized = true;
            _ = InitializePreviewAsync();

            Loaded += (s, e) =>
            {
                var workArea = SystemParameters.WorkArea;
                if (this.Width > workArea.Width) this.Width = Math.Max(750, workArea.Width * 0.94);
                if (this.Height > workArea.Height) this.Height = Math.Max(480, workArea.Height * 0.94);
                this.Left = workArea.Left + Math.Max(0, (workArea.Width - this.Width) / 2);
                this.Top = workArea.Top + Math.Max(0, (workArea.Height - this.Height) / 2);
            };
        }

        private void SetupServiceAdaptiveUI()
        {
            if (_order.IsScan)
            {
                TxtBadgeService.Text = "SCANNER SERVICE";
                BadgeServiceType.Background = new System.Windows.Media.SolidColorBrush(System.Windows.Media.Color.FromRgb(124, 58, 237));
                PanelScanSettings.Visibility = Visibility.Visible;
                PanelPhotoSettings.Visibility = Visibility.Collapsed;
                PanelDocSettings.Visibility = Visibility.Collapsed;
                PanelPageNav.Visibility = Visibility.Collapsed;

                SelectComboTag(ComboScanDpi, _order.Resolution.ToString());
                if (_order.ColorMode == "COLOR") RadioScanColor.IsChecked = true;
                else RadioScanBw.IsChecked = true;
                SelectComboTag(ComboScanFormat, _order.Format);
            }
            else if (_order.IsPassport8 || _order.ServiceType == "PHOTO")
            {
                bool isPass = _order.IsPassport8;
                TxtBadgeService.Text = isPass ? "PASSPORT 8-COPIES (4×6)" : "PHOTO PRINT";
                BadgeServiceType.Background = new System.Windows.Media.SolidColorBrush(System.Windows.Media.Color.FromRgb(3, 105, 161));
                PanelScanSettings.Visibility = Visibility.Collapsed;
                PanelPhotoSettings.Visibility = Visibility.Visible;
                PanelDocSettings.Visibility = Visibility.Collapsed;
                PanelPageNav.Visibility = Visibility.Collapsed;

                if (isPass)
                {
                    TxtPhotoHeader.Text = "🛂 Passport Photos (8-up Sheet Layout)";
                    TxtPhotoSub.Text = "Pre-configured for standard 4×6 inch HP Glossy Photo Paper";
                    SelectComboTag(ComboPhotoPaperType, "PHOTO_4X6");
                    ComboPhotoPaperType.IsEnabled = false; // Locked to 4x6
                    if (PanelPhotoBorderFraming != null) PanelPhotoBorderFraming.Visibility = Visibility.Collapsed;
                }
                else
                {
                    string pType = (_order.PaperType ?? "").Contains("A4", StringComparison.OrdinalIgnoreCase) ? "PHOTO_A4" : "PHOTO_4X6";
                    SelectComboTag(ComboPhotoPaperType, pType);
                    if (PanelPhotoBorderFraming != null) PanelPhotoBorderFraming.Visibility = Visibility.Visible;
                }

                if (_order.ColorMode == "BW") RadioPhotoBw.IsChecked = true;
                else RadioPhotoColor.IsChecked = true;

                bool photoBorder = _order.PrintSettings?.EnableBorder ?? false;
                if (photoBorder) RadioPhotoWithBorder.IsChecked = true;
                else RadioPhotoBorderless.IsChecked = true;

                int dpi = _order.PrintSettings?.Dpi ?? 600;
                SelectComboTag(ComboPhotoDpi, dpi.ToString());
            }
            else // DOCUMENT (SINGLE OR DUPLEX)
            {
                TxtBadgeService.Text = _order.IsDuplex ? "MANUAL DUPLEX" : "DOCUMENT";
                BadgeServiceType.Background = new System.Windows.Media.SolidColorBrush(
                    _order.IsDuplex ? System.Windows.Media.Color.FromRgb(14, 165, 233) : System.Windows.Media.Color.FromRgb(5, 150, 105)
                );
                PanelScanSettings.Visibility = Visibility.Collapsed;
                PanelPhotoSettings.Visibility = Visibility.Collapsed;
                PanelDocSettings.Visibility = Visibility.Visible;
                PanelPageNav.Visibility = _totalPages > 1 ? Visibility.Visible : Visibility.Collapsed;

                SelectComboTag(ComboDocPaperType, (_order.PaperType ?? "").Contains("PHOTO") ? "PHOTO_4X6" : "NORMAL_A4");
                SelectComboTag(ComboDocColorMode, _order.ColorMode ?? "BW");
                SelectComboTag(ComboDocNUp, (_order.PrintSettings?.PagesPerSheet ?? 1).ToString());
                SelectComboTag(ComboDocDpi, (_order.PrintSettings?.Dpi ?? 300).ToString());

                string ori = _order.PrintSettings?.Orientation ?? "PORTRAIT";
                if (ori == "LANDSCAPE") RadioOrientLandscape.IsChecked = true;
                else RadioOrientPortrait.IsChecked = true;

                double scale = _order.PrintSettings?.ScalePercent ?? 100.0;
                SliderScale.Value = scale;
                TxtScaleLabel.Text = $"Zoom / Scaling: {scale:0}%";

                ChkDocBorder.IsChecked = _order.PrintSettings?.EnableBorder ?? false;
            }

            TxtPageCounter.Text = $"{_currentPage} / {_totalPages}";
            TxtPreviewSubtitle.Text = $"Page {_currentPage} of {_totalPages}";
        }

        private async Task InitializePreviewAsync()
        {
            try
            {
                // Ensure local file is downloaded to RAW folder
                if (!string.IsNullOrEmpty(_order.LocalFilePath) && File.Exists(_order.LocalFilePath))
                {
                    _resolvedFilePath = _order.LocalFilePath;
                }
                else if (!string.IsNullOrEmpty(_order.FileUrl))
                {
                    _resolvedFilePath = await _backendSync.EnsureLocalFileAsync(_order.FileUrl, _order.OriginalFileName);
                }

                UpdateLivePreview();
            }
            catch (Exception ex)
            {
                LoggingManager.Error("[PrintSettings] Failed to initialize preview", ex);
            }
        }

        private void UpdateLivePreview()
        {
            if (!_isInitialized || _order == null) return;
            try
            {
                if (string.IsNullOrEmpty(_resolvedFilePath) || !File.Exists(_resolvedFilePath))
                {
                    TxtPreviewStatus.Text = "File loading...";
                    return;
                }

                // Check service type
                if (_order.IsScan)
                {
                    // Render image if image file
                    if (_resolvedFilePath.EndsWith(".jpg", StringComparison.OrdinalIgnoreCase) ||
                        _resolvedFilePath.EndsWith(".png", StringComparison.OrdinalIgnoreCase))
                    {
                        using var fs = new FileStream(_resolvedFilePath, FileMode.Open, FileAccess.Read, FileShare.ReadWrite);
                        using var bmp = new Bitmap(fs);
                        ImgPreview.Source = BitmapToSource(bmp);
                    }
                    TxtPreviewDimensions.Text = $"HP 589 Flatbed Scan • {GetSelectedTag(ComboScanDpi)} DPI";
                    TxtPreviewStatus.Text = "Scanner Acquisition Preview";
                    return;
                }

                if (_order.IsPassport8 || _order.ServiceType == "PHOTO")
                {
                    using var fs = new FileStream(_resolvedFilePath, FileMode.Open, FileAccess.Read, FileShare.ReadWrite);
                    using var bmp = new Bitmap(fs);
                    bool isLandscape = _order.IsPassport8 || bmp.Width > bmp.Height;

                    BorderSheetFrame.Width = isLandscape ? 360 : 250;
                    BorderSheetFrame.Height = isLandscape ? 250 : 360;

                    ImgPreview.Source = BitmapToSource(bmp);
                    TxtPreviewDimensions.Text = _order.IsPassport8 ? "HP 4×6 Glossy (1800 × 1200 px • 8-Up)" : $"Photo: {bmp.Width} × {bmp.Height} px";
                    TxtPreviewStatus.Text = $"{(_order.IsPassport8 ? "HP 4×6" : GetSelectedTag(ComboPhotoPaperType))} • 100% Studio Scale • Borderless";
                    return;
                }

                // Document (PDF)
                if (_resolvedFilePath.EndsWith(".pdf", StringComparison.OrdinalIgnoreCase))
                {
                    System.Windows.Media.RenderOptions.SetBitmapScalingMode(ImgPreview, System.Windows.Media.BitmapScalingMode.HighQuality);
                    System.Windows.Media.RenderOptions.SetEdgeMode(ImgPreview, System.Windows.Media.EdgeMode.Aliased);

                    int dpi = 300; // High resolution studio preview render for crisp text
                    using var docReader = DocLib.Instance.GetDocReader(_resolvedFilePath, new PageDimensions(dpi / 72.0));
                    int totalRawPages = Math.Max(1, docReader.GetPageCount());

                    int.TryParse(GetSelectedTag(ComboDocNUp), out int nup);
                    if (nup <= 0) nup = 1;

                    _totalPages = Math.Max(1, (int)Math.Ceiling((double)totalRawPages / nup));
                    _currentPage = Math.Clamp(_currentPage, 1, _totalPages);

                    TxtPageCounter.Text = $"{_currentPage} / {_totalPages}";
                    TxtPreviewSubtitle.Text = nup > 1 
                        ? $"Sheet {_currentPage} of {_totalPages} ({nup}-Up Grid • Pages {(_currentPage - 1) * nup + 1}–{Math.Min(totalRawPages, _currentPage * nup)})"
                        : $"Page {_currentPage} of {_totalPages}";

                    // Determine orientation for current page
                    string orient = RadioOrientLandscape.IsChecked == true ? "LANDSCAPE" : "PORTRAIT";
                    if (_pageOrientations.TryGetValue(_currentPage, out var customOrient)) orient = customOrient;
                    bool isLandscape = orient == "LANDSCAPE";

                    // Scaling / zoom
                    double scalePercent = SliderScale.Value;
                    if (_pageScales.TryGetValue(_currentPage, out var customScale)) scalePercent = customScale;

                    if (PreviewScaleTransform != null)
                    {
                        PreviewScaleTransform.ScaleX = scalePercent / 100.0;
                        PreviewScaleTransform.ScaleY = scalePercent / 100.0;
                    }
                    if (PreviewOverflowScaleTransform != null)
                    {
                        PreviewOverflowScaleTransform.ScaleX = scalePercent / 100.0;
                        PreviewOverflowScaleTransform.ScaleY = scalePercent / 100.0;
                    }

                    BorderSheetFrame.Width = isLandscape ? 380 : 270;
                    BorderSheetFrame.Height = isLandscape ? 270 : 380;

                    bool enableBorder = (_order.ServiceType == "PHOTO" || _order.IsPassport8) ? (RadioPhotoWithBorder.IsChecked == true) : (ChkDocBorder.IsChecked == true);
                    if (GridPreviewCanvas != null)
                    {
                        GridPreviewCanvas.Margin = enableBorder ? new Thickness(14) : new Thickness(0);
                    }

                    if (nup == 1)
                    {
                        using var pageBmp = RenderPdfPage(docReader, _currentPage - 1, dpi);

                        if (orient == "LANDSCAPE" && pageBmp.Width < pageBmp.Height)
                        {
                            pageBmp.RotateFlip(RotateFlipType.Rotate90FlipNone);
                        }
                        else if (orient == "PORTRAIT" && pageBmp.Width > pageBmp.Height)
                        {
                            pageBmp.RotateFlip(RotateFlipType.Rotate270FlipNone);
                        }

                        ImgPreview.Source = BitmapToSource(pageBmp);
                        TxtPreviewDimensions.Text = $"A4 Sheet ({pageBmp.Width} × {pageBmp.Height} px • 300 DPI) • {GetSelectedTag(ComboDocDpi)} DPI";
                    }
                    else
                    {
                        // Render N-Up Composite Sheet
                        int cols = 1, rows = 1;
                        if (nup == 2) { cols = 2; rows = 1; }
                        else if (nup == 4) { cols = 2; rows = 2; }
                        else if (nup == 6) { cols = 3; rows = 2; }
                        else if (nup == 9) { cols = 3; rows = 3; }
                        else if (nup == 16) { cols = 4; rows = 4; }

                        int sheetW = isLandscape ? 3508 : 2480;
                        int sheetH = isLandscape ? 2480 : 3508;
                        using var sheetBmp = new Bitmap(sheetW, sheetH);
                        using (var g = Graphics.FromImage(sheetBmp))
                        {
                            g.Clear(Color.White);
                            g.InterpolationMode = System.Drawing.Drawing2D.InterpolationMode.HighQualityBicubic;
                            g.SmoothingMode = System.Drawing.Drawing2D.SmoothingMode.HighQuality;

                            int margin = 60;
                            int cellW = (sheetW - margin * 2) / cols;
                            int cellH = (sheetH - margin * 2) / rows;
                            int startIdx = (_currentPage - 1) * nup;

                            for (int i = 0; i < nup; i++)
                            {
                                int pageIdx = startIdx + i;
                                if (pageIdx >= totalRawPages) break;
                                int r = i / cols;
                                int c = i % cols;
                                int x = margin + c * cellW;
                                int y = margin + r * cellH;

                                using var pBmp = RenderPdfPage(docReader, pageIdx, 150);
                                g.DrawImage(pBmp, x + 8, y + 8, cellW - 16, cellH - 16);

                                using var framePen = new Pen(Color.FromArgb(148, 163, 184), 3);
                                g.DrawRectangle(framePen, x + 8, y + 8, cellW - 16, cellH - 16);
                            }
                        }

                        ImgPreview.Source = BitmapToSource(sheetBmp);
                        TxtPreviewDimensions.Text = $"A4 N-Up Sheet ({nup} pages/sheet • {sheetW} × {sheetH} px) • {GetSelectedTag(ComboDocDpi)} DPI";
                    }

                    if (ImgPreviewOverflow != null)
                    {
                        ImgPreviewOverflow.Source = (scalePercent > 100.0) ? ImgPreview.Source : null;
                    }

                    TxtPreviewStatus.Text = $"{scalePercent:0}% Zoom • {orient} • {(enableBorder ? "Border ON" : "No Border")}";
                }
            }
            catch (Exception ex)
            {
                LoggingManager.Warn($"[PrintSettings] Preview error: {ex.Message}");
            }
        }

        private static Bitmap RenderPdfPage(IDocReader docReader, int pageIndex, int dpi)
        {
            using var pageReader = docReader.GetPageReader(pageIndex);
            int width = pageReader.GetPageWidth();
            int height = pageReader.GetPageHeight();
            byte[] rawBytes = pageReader.GetImage();

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

        public static BitmapSource BitmapToSource(Bitmap bmp)
        {
            IntPtr hBitmap = bmp.GetHbitmap();
            try
            {
                return Imaging.CreateBitmapSourceFromHBitmap(
                    hBitmap,
                    IntPtr.Zero,
                    Int32Rect.Empty,
                    BitmapSizeOptions.FromEmptyOptions()
                );
            }
            finally
            {
                DeleteObject(hBitmap);
            }
        }

        private void NavigateToPage(int newPage)
        {
            _currentPage = Math.Clamp(newPage, 1, _totalPages);
            _isNavigating = true;

            // Load orientation for this page: if set, select it; otherwise default to Portrait
            string orient = _pageOrientations.TryGetValue(_currentPage, out var o) ? o : "PORTRAIT";
            if (RadioOrientLandscape != null) RadioOrientLandscape.IsChecked = (orient == "LANDSCAPE");
            if (RadioOrientPortrait != null) RadioOrientPortrait.IsChecked = (orient == "PORTRAIT");

            // Load zoom scale for this page: if set, restore it; otherwise default to 100%
            double scale = _pageScales.TryGetValue(_currentPage, out var s) ? s : 100.0;
            if (SliderScale != null) SliderScale.Value = scale;
            if (TxtScaleLabel != null) TxtScaleLabel.Text = $"Zoom / Scaling: {scale:0}%";

            _isNavigating = false;
            UpdateLivePreview();
        }

        private void BtnPrevPage_Click(object sender, RoutedEventArgs e)
        {
            if (_currentPage > 1)
            {
                NavigateToPage(_currentPage - 1);
            }
        }

        private void BtnNextPage_Click(object sender, RoutedEventArgs e)
        {
            if (_currentPage < _totalPages)
            {
                NavigateToPage(_currentPage + 1);
            }
        }

        private void SliderScale_ValueChanged(object sender, RoutedPropertyChangedEventArgs<double> e)
        {
            if (!_isInitialized || _isNavigating || _order == null) return;
            if (TxtScaleLabel != null)
            {
                TxtScaleLabel.Text = $"Zoom / Scaling: {SliderScale.Value:0}%";
            }

            _pageScales[_currentPage] = SliderScale.Value;
            UpdateLivePreview();
        }

        private void BtnResetZoom_Click(object sender, RoutedEventArgs e)
        {
            if (SliderScale != null) SliderScale.Value = 100;
            _pageScales[_currentPage] = 100;
            UpdateLivePreview();
        }

        private void OnSettingChanged(object sender, RoutedEventArgs e)
        {
            if (!_isInitialized || _isNavigating || _order == null) return;
            _pageOrientations[_currentPage] = RadioOrientLandscape?.IsChecked == true ? "LANDSCAPE" : "PORTRAIT";
            UpdateLivePreview();
        }

        private void ComboPhotoPaperType_SelectionChanged(object sender, SelectionChangedEventArgs e)
        {
            if (!_isInitialized || _order == null) return;
            UpdateLivePreview();
        }

        private void SelectComboTag(ComboBox combo, string tag)
        {
            foreach (ComboBoxItem item in combo.Items)
            {
                if (item.Tag?.ToString() == tag)
                {
                    item.IsSelected = true;
                    return;
                }
            }
        }

        private string GetSelectedTag(ComboBox combo)
        {
            if (combo.SelectedItem is ComboBoxItem item && item.Tag != null)
            {
                return item.Tag.ToString()!;
            }
            return "";
        }

        public PrintJobOptions BuildOptions()
        {
            if (_order.IsScan)
            {
                int.TryParse(GetSelectedTag(ComboScanDpi), out int scanDpi);
                return new PrintJobOptions
                {
                    Dpi = scanDpi > 0 ? scanDpi : 300,
                    ColorMode = RadioScanColor.IsChecked == true ? "COLOR" : "BW",
                    Scope = "ALL_PAGES"
                };
            }

            if (_order.IsPassport8 || _order.ServiceType == "PHOTO")
            {
                var pType = _order.IsPassport8 ? "PHOTO_4X6" : GetSelectedTag(ComboPhotoPaperType);
                int.TryParse(GetSelectedTag(ComboPhotoDpi), out int dpi);
                if (dpi <= 0) dpi = 600;

                string orient = _order.IsPassport8 ? "LANDSCAPE" : "PORTRAIT";

                return new PrintJobOptions
                {
                    Dpi = dpi,
                    PagesPerSheet = _order.IsPassport8 ? 8 : 1,
                    Orientation = orient,
                    PaperType = pType,
                    PaperSize = pType.Contains("4X6") ? "4X6" : "A4",
                    ColorMode = RadioPhotoColor.IsChecked == true ? "COLOR" : "BW",
                    FitMode = "FIT",
                    EnableBorder = RadioPhotoWithBorder.IsChecked == true,
                    ScalePercent = 100.0,
                    Scope = "ALL_PAGES"
                };
            }

            // Document
            var docPType = GetSelectedTag(ComboDocPaperType);
            int.TryParse(GetSelectedTag(ComboDocDpi), out int docDpi);
            if (docDpi <= 0) docDpi = 300;

            int.TryParse(GetSelectedTag(ComboDocNUp), out int nup);
            if (nup <= 0) nup = 1;

            string docOrient = RadioOrientLandscape.IsChecked == true ? "LANDSCAPE" : "PORTRAIT";
            double docScale = SliderScale.Value;
            bool docBorder = ChkDocBorder.IsChecked == true;
            string docColor = GetSelectedTag(ComboDocColorMode);
            if (string.IsNullOrEmpty(docColor)) docColor = "BW";

            return new PrintJobOptions
            {
                Dpi = docDpi,
                PagesPerSheet = nup,
                Orientation = docOrient,
                PaperType = docPType,
                PaperSize = docPType.Contains("4X6") ? "4X6" : "A4",
                ColorMode = docColor,
                ScalePercent = docScale,
                EnableBorder = docBorder,
                Scope = RadioScaleScopeCurrent?.IsChecked == true ? "CURRENT_PAGE" : "ALL_PAGES",
                PageScales = _pageScales.Count > 0 ? new Dictionary<int, double>(_pageScales) : null,
                PageOrientations = _pageOrientations.Count > 0 ? new Dictionary<int, string>(_pageOrientations) : null
            };
        }

        private async void BtnSave_Click(object sender, RoutedEventArgs e)
        {
            var options = BuildOptions();
            SelectedOptions = options;
            _order.PrintSettings = options;
            _order.PaperType = options.PaperType;
            _order.PaperSize = options.PaperSize;
            _order.ColorMode = options.ColorMode;

            if (_backendSync != null && !string.IsNullOrEmpty(_order.Id) && _order.Id != "desk-preview")
            {
                await _backendSync.SaveOrderSettingsAsync(_order.Id, options);
            }
            MessageBox.Show($"Settings saved for Order {_order.OrderNumber}!", "Settings Saved", MessageBoxButton.OK, MessageBoxImage.Information);
            DialogResult = true;
            Close();
        }

        private async void BtnSaveAndPrint_Click(object sender, RoutedEventArgs e)
        {
            var options = BuildOptions();
            SelectedOptions = options;
            _order.PrintSettings = options;
            _order.PaperType = options.PaperType;
            _order.PaperSize = options.PaperSize;
            _order.ColorMode = options.ColorMode;

            if (_backendSync != null && !string.IsNullOrEmpty(_order.Id) && _order.Id != "desk-preview")
            {
                await _backendSync.SaveOrderSettingsAsync(_order.Id, options);
            }
            ShouldPrintImmediately = true;
            DialogResult = true;
            Close();
        }

        private void BtnCancel_Click(object sender, RoutedEventArgs e)
        {
            DialogResult = false;
            Close();
        }
    }
}
