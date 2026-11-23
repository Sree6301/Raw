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

        public bool ShouldPrintImmediately { get; private set; }

        public PrintSettingsWindow(BackendOrderDto order, BackendSync backendSync, DeviceManager deviceManager)
        {
            _order = order;
            _backendSync = backendSync;
            _deviceManager = deviceManager;

            InitializeComponent();

            TxtOrderHeader.Text = $"PRINT SETTINGS • ORDER {_order.OrderNumber}";
            TxtOrderSub.Text = $"{_order.ServiceType} — {_order.OriginalFileName} ({_order.TotalPages} pages × {_order.Copies} copies)";

            _totalPages = Math.Max(1, _order.TotalPages);

            SetupServiceAdaptiveUI();
            _isInitialized = true;
            _ = InitializePreviewAsync();
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
                }
                else
                {
                    string pType = (_order.PaperType ?? "").Contains("A4", StringComparison.OrdinalIgnoreCase) ? "PHOTO_A4" : "PHOTO_4X6";
                    SelectComboTag(ComboPhotoPaperType, pType);
                }

                if (_order.ColorMode == "BW") RadioPhotoBw.IsChecked = true;
                else RadioPhotoColor.IsChecked = true;

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
                    BorderVisualOverlay.Visibility = Visibility.Collapsed;

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
                    int dpi = 150; // High speed preview render
                    using var docReader = DocLib.Instance.GetDocReader(_resolvedFilePath, new PageDimensions(dpi / 72.0));
                    _totalPages = Math.Max(1, docReader.GetPageCount());
                    _currentPage = Math.Clamp(_currentPage, 1, _totalPages);

                    TxtPageCounter.Text = $"{_currentPage} / {_totalPages}";
                    TxtPreviewSubtitle.Text = $"Page {_currentPage} of {_totalPages}";

                    using var pageBmp = RenderPdfPage(docReader, _currentPage - 1, dpi);

                    // Determine orientation for current page
                    string orient = RadioOrientLandscape.IsChecked == true ? "LANDSCAPE" : "PORTRAIT";
                    if (_pageOrientations.TryGetValue(_currentPage, out var customOrient)) orient = customOrient;

                    if (orient == "LANDSCAPE" && pageBmp.Width < pageBmp.Height)
                    {
                        pageBmp.RotateFlip(RotateFlipType.Rotate90FlipNone);
                    }
                    else if (orient == "PORTRAIT" && pageBmp.Width > pageBmp.Height)
                    {
                        pageBmp.RotateFlip(RotateFlipType.Rotate270FlipNone);
                    }

                    // Scaling / zoom
                    double scalePercent = SliderScale.Value;
                    if (_pageScales.TryGetValue(_currentPage, out var customScale)) scalePercent = customScale;

                    bool isLandscape = orient == "LANDSCAPE";
                    BorderSheetFrame.Width = isLandscape ? 380 : 270;
                    BorderSheetFrame.Height = isLandscape ? 270 : 380;

                    bool enableBorder = ChkDocBorder.IsChecked == true;
                    BorderVisualOverlay.Visibility = enableBorder ? Visibility.Visible : Visibility.Collapsed;

                    ImgPreview.Source = BitmapToSource(pageBmp);
                    TxtPreviewDimensions.Text = $"A4 Sheet ({pageBmp.Width} × {pageBmp.Height} px) • {GetSelectedTag(ComboDocDpi)} DPI";
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

        private void BtnPrevPage_Click(object sender, RoutedEventArgs e)
        {
            if (_currentPage > 1)
            {
                _currentPage--;
                UpdateLivePreview();
            }
        }

        private void BtnNextPage_Click(object sender, RoutedEventArgs e)
        {
            if (_currentPage < _totalPages)
            {
                _currentPage++;
                UpdateLivePreview();
            }
        }

        private void SliderScale_ValueChanged(object sender, RoutedPropertyChangedEventArgs<double> e)
        {
            if (!_isInitialized || _order == null) return;
            if (TxtScaleLabel != null)
            {
                TxtScaleLabel.Text = $"Zoom / Scaling: {SliderScale.Value:0}%";
            }

            if (RadioScaleScopeCurrent?.IsChecked == true)
            {
                _pageScales[_currentPage] = SliderScale.Value;
            }
            else
            {
                _pageScales.Clear();
            }

            UpdateLivePreview();
        }

        private void BtnResetZoom_Click(object sender, RoutedEventArgs e)
        {
            SliderScale.Value = 100;
            _pageScales.Clear();
            UpdateLivePreview();
        }

        private void OnSettingChanged(object sender, RoutedEventArgs e)
        {
            if (!_isInitialized || _order == null) return;
            if (RadioOrientScopeCurrent?.IsChecked == true)
            {
                _pageOrientations[_currentPage] = RadioOrientLandscape?.IsChecked == true ? "LANDSCAPE" : "PORTRAIT";
            }
            else
            {
                _pageOrientations.Clear();
            }

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
                    EnableBorder = false,
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
            _order.PrintSettings = options;
            _order.PaperType = options.PaperType;
            _order.PaperSize = options.PaperSize;
            _order.ColorMode = options.ColorMode;

            await _backendSync.SaveOrderSettingsAsync(_order.Id, options);
            MessageBox.Show($"Settings saved for Order {_order.OrderNumber}!", "Settings Saved", MessageBoxButton.OK, MessageBoxImage.Information);
            DialogResult = true;
            Close();
        }

        private async void BtnSaveAndPrint_Click(object sender, RoutedEventArgs e)
        {
            var options = BuildOptions();
            _order.PrintSettings = options;
            _order.PaperType = options.PaperType;
            _order.PaperSize = options.PaperSize;
            _order.ColorMode = options.ColorMode;

            await _backendSync.SaveOrderSettingsAsync(_order.Id, options);
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
