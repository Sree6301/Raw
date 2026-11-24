using System;
using System.Drawing;
using System.Drawing.Drawing2D;
using System.Drawing.Imaging;
using System.IO;
using System.Windows;
using System.Windows.Controls;
using System.Windows.Input;
using System.Windows.Media.Imaging;
using SmartXeroxHub.Agent.Core;
using MessageBox = System.Windows.MessageBox;

namespace SmartXeroxHub.Agent.UI
{
    public enum DeskPhotoCropMode
    {
        PASSPORT,
        PHOTO
    }

    public partial class DeskPhotoCropWindow : Window
    {
        private readonly string _sourceImagePath;
        private readonly DeskPhotoCropMode _mode;
        private readonly string _outputDir;

        private Bitmap? _sourceBitmap;
        private bool _isDragging;
        private System.Windows.Point _lastMousePos;
        private double _panX = 0;
        private double _panY = 0;
        private double _zoom = 1.0;
        private int _rotation = 0;

        public string ResultFilePath { get; private set; } = string.Empty;
        public bool IsBorderEnabled { get; private set; } = false;
        public string PaperType { get; private set; } = "PHOTO_4X6";
        public string Orientation { get; private set; } = "PORTRAIT";

        public DeskPhotoCropWindow(string imagePath, DeskPhotoCropMode mode, string? outputDir = null)
        {
            _sourceImagePath = imagePath;
            _mode = mode;
            _outputDir = outputDir ?? Path.Combine(AppDomain.CurrentDomain.BaseDirectory, "..", "..", "RAW_Inputs", "Photos");
            Directory.CreateDirectory(_outputDir);

            InitializeComponent();

            ConfigureModeUI();
            LoadSourceImage();
        }

        private void ConfigureModeUI()
        {
            if (_mode == DeskPhotoCropMode.PASSPORT)
            {
                TxtTitle.Text = "📷 PASSPORT PHOTO CROP & ALIGNMENT STUDIO";
                TxtSubtitle.Text = "Align face within frame • Calibrated 35:45 ratio • Outputs verified 8-Up sheet";
                TxtModeBadge.Text = "PASSPORT 8-UP";
                PanelPhotoOptions.Visibility = Visibility.Collapsed;
                BtnSubmit.Content = "✅ Submit & Generate 8-Up Sheet";
            }
            else
            {
                TxtTitle.Text = "🖼️ PHOTO PRINTING STUDIO — LAYOUT & CROP";
                TxtSubtitle.Text = "Select 4×6 or A4 layout, crop frame, and border settings before printing";
                TxtModeBadge.Text = "PHOTO DESK";
                PanelPhotoOptions.Visibility = Visibility.Visible;
                BtnSubmit.Content = "✅ Save & Set for Printing";
            }
        }

        private void LoadSourceImage()
        {
            try
            {
                if (!File.Exists(_sourceImagePath)) return;

                byte[] bytes = File.ReadAllBytes(_sourceImagePath);
                using (var ms = new MemoryStream(bytes))
                {
                    _sourceBitmap = new Bitmap(ms);
                }

                var bi = new BitmapImage();
                bi.BeginInit();
                bi.CacheOption = BitmapCacheOption.OnLoad;
                bi.CreateOptions = BitmapCreateOptions.IgnoreImageCache;
                bi.StreamSource = new MemoryStream(bytes);
                bi.EndInit();

                ImgDisplay.Source = bi;
                ImgDisplay.Width = bi.PixelWidth;
                ImgDisplay.Height = bi.PixelHeight;

                // Center initial position
                Loaded += (s, e) => ResetView();
            }
            catch (Exception ex)
            {
                MessageBox.Show($"Failed to load image: {ex.Message}", "Error", MessageBoxButton.OK, MessageBoxImage.Error);
            }
        }

        private void ResetView()
        {
            _panX = 0;
            _panY = 0;
            _zoom = 1.0;
            _rotation = 0;
            SliderZoom.Value = 1.0;

            UpdateCropFrameGeometry();
            UpdateImageTransform();
        }

        private void UpdateCropFrameGeometry()
        {
            double canvasW = CanvasInteractive.ActualWidth;
            double canvasH = CanvasInteractive.ActualHeight;
            if (canvasW <= 10 || canvasH <= 10) return;

            double targetW, targetH;

            if (_mode == DeskPhotoCropMode.PASSPORT)
            {
                // Standard 35 : 45 ratio
                double ratio = 35.0 / 45.0;
                targetH = Math.Min(canvasH * 0.75, 380);
                targetW = targetH * ratio;
            }
            else
            {
                bool isA4 = (ComboPaperSize.SelectedItem as ComboBoxItem)?.Tag?.ToString() == "PHOTO_A4";
                bool isLandscape = RadioLandscape.IsChecked == true;

                double ratio = isA4 ? (210.0 / 297.0) : (101.6 / 152.4);
                if (isLandscape) ratio = 1.0 / ratio;

                if (isLandscape)
                {
                    targetW = Math.Min(canvasW * 0.75, 460);
                    targetH = targetW / ratio;
                }
                else
                {
                    targetH = Math.Min(canvasH * 0.75, 400);
                    targetW = targetH * ratio;
                }
            }

            BorderCropFrame.Width = targetW;
            BorderCropFrame.Height = targetH;

            Canvas.SetLeft(BorderCropFrame, (canvasW - targetW) / 2);
            Canvas.SetTop(BorderCropFrame, (canvasH - targetH) / 2);
        }

        private void UpdateImageTransform()
        {
            if (ImgDisplay.Source == null) return;

            double canvasW = CanvasInteractive.ActualWidth;
            double canvasH = CanvasInteractive.ActualHeight;
            if (canvasW <= 10 || canvasH <= 10) return;

            double imgW = ImgDisplay.Width;
            double imgH = ImgDisplay.Height;

            // Base fit scale to cover crop frame
            double cropW = BorderCropFrame.Width;
            double cropH = BorderCropFrame.Height;
            double baseScale = Math.Max(cropW / imgW, cropH / imgH);
            if (baseScale <= 0) baseScale = 1.0;

            double effScale = baseScale * _zoom;
            TransformScale.ScaleX = effScale;
            TransformScale.ScaleY = effScale;

            TransformRotate.Angle = _rotation;
            TransformRotate.CenterX = imgW / 2;
            TransformRotate.CenterY = imgH / 2;

            double centerX = (canvasW - imgW) / 2;
            double centerY = (canvasH - imgH) / 2;

            TransformTranslate.X = centerX + _panX;
            TransformTranslate.Y = centerY + _panY;
        }

        private void CanvasInteractive_SizeChanged(object sender, SizeChangedEventArgs e)
        {
            UpdateCropFrameGeometry();
            UpdateImageTransform();
        }

        private void CanvasInteractive_MouseDown(object sender, System.Windows.Input.MouseButtonEventArgs e)
        {
            if (e.LeftButton == MouseButtonState.Pressed)
            {
                _isDragging = true;
                _lastMousePos = e.GetPosition(CanvasInteractive);
                CanvasInteractive.CaptureMouse();
            }
        }

        private void CanvasInteractive_MouseMove(object sender, System.Windows.Input.MouseEventArgs e)
        {
            if (_isDragging && e.LeftButton == MouseButtonState.Pressed)
            {
                var cur = e.GetPosition(CanvasInteractive);
                double dx = cur.X - _lastMousePos.X;
                double dy = cur.Y - _lastMousePos.Y;
                _lastMousePos = cur;

                _panX += dx;
                _panY += dy;
                UpdateImageTransform();
            }
        }

        private void CanvasInteractive_MouseUp(object sender, System.Windows.Input.MouseButtonEventArgs e)
        {
            if (_isDragging)
            {
                _isDragging = false;
                CanvasInteractive.ReleaseMouseCapture();
            }
        }

        private void CanvasInteractive_MouseWheel(object sender, System.Windows.Input.MouseWheelEventArgs e)
        {
            double delta = e.Delta > 0 ? 0.1 : -0.1;
            SliderZoom.Value = Math.Clamp(SliderZoom.Value + delta, SliderZoom.Minimum, SliderZoom.Maximum);
        }

        private void SliderZoom_ValueChanged(object sender, RoutedPropertyChangedEventArgs<double> e)
        {
            _zoom = SliderZoom.Value;
            if (TxtZoomLabel != null)
                TxtZoomLabel.Text = $"Zoom: {_zoom * 100:0}%";
            UpdateImageTransform();
        }

        private void BtnRotate_Click(object sender, RoutedEventArgs e)
        {
            _rotation = (_rotation + 90) % 360;
            UpdateImageTransform();
        }

        private void BtnReset_Click(object sender, RoutedEventArgs e)
        {
            ResetView();
        }

        private void OnPhotoSettingChanged(object sender, RoutedEventArgs e)
        {
            UpdateCropFrameGeometry();
            UpdateImageTransform();
        }

        private void BtnCancel_Click(object sender, RoutedEventArgs e)
        {
            DialogResult = false;
            Close();
        }

        private void BtnSubmit_Click(object sender, RoutedEventArgs e)
        {
            if (_sourceBitmap == null)
            {
                DialogResult = false;
                Close();
                return;
            }

            try
            {
                // Calculate cropped source image area
                int outW, outH;
                if (_mode == DeskPhotoCropMode.PASSPORT)
                {
                    outW = 397;
                    outH = 513;
                }
                else
                {
                    bool isA4 = (ComboPaperSize.SelectedItem as ComboBoxItem)?.Tag?.ToString() == "PHOTO_A4";
                    bool isLandscape = RadioLandscape.IsChecked == true;
                    if (isA4)
                    {
                        outW = isLandscape ? 3508 : 2480;
                        outH = isLandscape ? 2480 : 3508;
                    }
                    else
                    {
                        outW = isLandscape ? 1800 : 1200;
                        outH = isLandscape ? 1200 : 1800;
                    }
                }

                // Render cropped bitmap using transformed coordinates
                using var rotatedSrc = new Bitmap(_sourceBitmap);
                if (_rotation == 90) rotatedSrc.RotateFlip(RotateFlipType.Rotate90FlipNone);
                else if (_rotation == 180) rotatedSrc.RotateFlip(RotateFlipType.Rotate180FlipNone);
                else if (_rotation == 270) rotatedSrc.RotateFlip(RotateFlipType.Rotate270FlipNone);

                var croppedBmp = new Bitmap(outW, outH, PixelFormat.Format32bppArgb);
                croppedBmp.SetResolution(300, 300);

                using (var g = Graphics.FromImage(croppedBmp))
                {
                    g.Clear(Color.White);
                    g.InterpolationMode = InterpolationMode.HighQualityBicubic;
                    g.SmoothingMode = SmoothingMode.HighQuality;
                    g.PixelOffsetMode = PixelOffsetMode.HighQuality;

                    // Compute visible fraction of source image inside crop frame
                    double cropFrameW = BorderCropFrame.Width;
                    double cropFrameH = BorderCropFrame.Height;
                    double cropFrameLeft = Canvas.GetLeft(BorderCropFrame);
                    double cropFrameTop = Canvas.GetTop(BorderCropFrame);

                    double canvasW = CanvasInteractive.ActualWidth;
                    double canvasH = CanvasInteractive.ActualHeight;

                    double imgW = ImgDisplay.Width;
                    double imgH = ImgDisplay.Height;
                    double baseScale = Math.Max(cropFrameW / imgW, cropFrameH / imgH);
                    double effScale = baseScale * _zoom;

                    double imgScreenLeft = (canvasW - imgW) / 2 + _panX;
                    double imgScreenTop = (canvasH - imgH) / 2 + _panY;

                    // Map crop frame rectangle back into source bitmap pixels
                    double relCropX = (cropFrameLeft - imgScreenLeft) / effScale;
                    double relCropY = (cropFrameTop - imgScreenTop) / effScale;
                    double relCropW = cropFrameW / effScale;
                    double relCropH = cropFrameH / effScale;

                    var srcRect = new RectangleF((float)relCropX, (float)relCropY, (float)relCropW, (float)relCropH);
                    var destRect = new RectangleF(0, 0, outW, outH);

                    g.DrawImage(rotatedSrc, destRect, srcRect, GraphicsUnit.Pixel);
                }

                if (_mode == DeskPhotoCropMode.PASSPORT)
                {
                    // Generate permanent calibrated 8-Up sheet on 4x6 HP Photo Paper
                    string sheetPath = PhotoProcessor.BuildPassport8UpSheetFromCropped(croppedBmp, Path.GetFileName(_sourceImagePath), _outputDir);
                    ResultFilePath = sheetPath;
                }
                else
                {
                    string outFileName = $"DeskPhoto_{DateTime.Now:yyyyMMdd_HHmmss}_{Path.GetFileNameWithoutExtension(_sourceImagePath)}.jpg";
                    string savePath = Path.Combine(_outputDir, outFileName);
                    croppedBmp.Save(savePath, ImageFormat.Jpeg);
                    ResultFilePath = savePath;

                    IsBorderEnabled = RadioBorder.IsChecked == true;
                    PaperType = (ComboPaperSize.SelectedItem as ComboBoxItem)?.Tag?.ToString() ?? "PHOTO_4X6";
                    Orientation = RadioLandscape.IsChecked == true ? "LANDSCAPE" : "PORTRAIT";
                }

                DialogResult = true;
                Close();
            }
            catch (Exception ex)
            {
                MessageBox.Show($"Failed to process cropped photo: {ex.Message}", "Error", MessageBoxButton.OK, MessageBoxImage.Error);
            }
        }
    }
}
