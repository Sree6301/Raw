using System;
using System.Drawing;
using System.Drawing.Drawing2D;
using System.Drawing.Imaging;
using System.IO;
using System.Windows;
using System.Windows.Media.Imaging;
using MessageBox = System.Windows.MessageBox;

namespace SmartXeroxHub.Agent.UI
{
    public partial class ScannedImageEditorWindow : Window
    {
        private readonly string _filePath;
        private readonly int _pageNumber;
        private Bitmap? _workingBitmap;

        public bool ChangesSaved { get; private set; } = false;

        public ScannedImageEditorWindow(string filePath, int pageNumber = 1)
        {
            _filePath = filePath;
            _pageNumber = pageNumber;

            InitializeComponent();

            TxtPageBadge.Text = $"PAGE {_pageNumber}";
            TxtTitle.Text = $"🔍 SCANNED PAGE {_pageNumber} EDITOR";
            TxtSubtitle.Text = Path.GetFileName(_filePath);

            Loaded += (s, e) =>
            {
                var workArea = SystemParameters.WorkArea;
                if (this.Width > workArea.Width) this.Width = Math.Max(700, workArea.Width * 0.94);
                if (this.Height > workArea.Height) this.Height = Math.Max(480, workArea.Height * 0.94);
                this.Left = workArea.Left + Math.Max(0, (workArea.Width - this.Width) / 2);
                this.Top = workArea.Top + Math.Max(0, (workArea.Height - this.Height) / 2);
            };

            LoadImage();
        }

        private void LoadImage()
        {
            try
            {
                if (!File.Exists(_filePath)) return;

                byte[] bytes = File.ReadAllBytes(_filePath);
                using var ms = new MemoryStream(bytes);
                _workingBitmap = new Bitmap(ms);

                TxtFileInfo.Text = $"Dimensions: {_workingBitmap.Width} × {_workingBitmap.Height} px\nResolution: {_workingBitmap.HorizontalResolution:0} DPI\nFile: {Path.GetFileName(_filePath)}";
                UpdatePreview();
            }
            catch (Exception ex)
            {
                MessageBox.Show($"Could not load scanned image: {ex.Message}", "Load Error", MessageBoxButton.OK, MessageBoxImage.Error);
            }
        }

        private void UpdatePreview()
        {
            if (_workingBitmap == null) return;

            try
            {
                using var displayBmp = ApplyCurrentFilter(_workingBitmap);
                using var ms = new MemoryStream();
                displayBmp.Save(ms, ImageFormat.Png);
                ms.Position = 0;

                var bi = new BitmapImage();
                bi.BeginInit();
                bi.CacheOption = BitmapCacheOption.OnLoad;
                bi.CreateOptions = BitmapCreateOptions.IgnoreImageCache;
                bi.StreamSource = ms;
                bi.EndInit();

                ImgScannedPreview.Source = bi;
                TxtFileInfo.Text = $"Dimensions: {_workingBitmap.Width} × {_workingBitmap.Height} px\nResolution: {_workingBitmap.HorizontalResolution:0} DPI\nFile: {Path.GetFileName(_filePath)}";
            }
            catch (Exception ex)
            {
                MessageBox.Show($"Preview render failed: {ex.Message}", "Render Error", MessageBoxButton.OK, MessageBoxImage.Warning);
            }
        }

        private Bitmap ApplyCurrentFilter(Bitmap src)
        {
            if (RadioGrayscale?.IsChecked == true)
            {
                var bmp = new Bitmap(src.Width, src.Height, PixelFormat.Format32bppArgb);
                using var g = Graphics.FromImage(bmp);
                var matrix = new ColorMatrix(new float[][]
                {
                    new float[] { 0.299f, 0.299f, 0.299f, 0, 0 },
                    new float[] { 0.587f, 0.587f, 0.587f, 0, 0 },
                    new float[] { 0.114f, 0.114f, 0.114f, 0, 0 },
                    new float[] { 0,      0,      0,      1, 0 },
                    new float[] { 0,      0,      0,      0, 1 }
                });
                using var attr = new ImageAttributes();
                attr.SetColorMatrix(matrix);
                g.DrawImage(src, new Rectangle(0, 0, src.Width, src.Height), 0, 0, src.Width, src.Height, GraphicsUnit.Pixel, attr);
                return bmp;
            }
            else if (RadioHighContrast?.IsChecked == true)
            {
                var bmp = new Bitmap(src.Width, src.Height, PixelFormat.Format32bppArgb);
                using var g = Graphics.FromImage(bmp);
                // Boost contrast & brightness slightly for sharp black text on white paper
                float c = 1.35f;
                float b = 0.05f;
                var matrix = new ColorMatrix(new float[][]
                {
                    new float[] { 0.299f * c, 0.299f * c, 0.299f * c, 0, 0 },
                    new float[] { 0.587f * c, 0.587f * c, 0.587f * c, 0, 0 },
                    new float[] { 0.114f * c, 0.114f * c, 0.114f * c, 0, 0 },
                    new float[] { 0,          0,          0,          1, 0 },
                    new float[] { b,          b,          b,          0, 1 }
                });
                using var attr = new ImageAttributes();
                attr.SetColorMatrix(matrix);
                g.DrawImage(src, new Rectangle(0, 0, src.Width, src.Height), 0, 0, src.Width, src.Height, GraphicsUnit.Pixel, attr);
                return bmp;
            }

            return new Bitmap(src);
        }

        private void BtnRotateCW_Click(object sender, RoutedEventArgs e)
        {
            if (_workingBitmap == null) return;
            _workingBitmap.RotateFlip(RotateFlipType.Rotate90FlipNone);
            UpdatePreview();
        }

        private void BtnRotateCCW_Click(object sender, RoutedEventArgs e)
        {
            if (_workingBitmap == null) return;
            _workingBitmap.RotateFlip(RotateFlipType.Rotate270FlipNone);
            UpdatePreview();
        }

        private void BtnRotate180_Click(object sender, RoutedEventArgs e)
        {
            if (_workingBitmap == null) return;
            _workingBitmap.RotateFlip(RotateFlipType.Rotate180FlipNone);
            UpdatePreview();
        }

        private void BtnFlipH_Click(object sender, RoutedEventArgs e)
        {
            if (_workingBitmap == null) return;
            _workingBitmap.RotateFlip(RotateFlipType.RotateNoneFlipX);
            UpdatePreview();
        }

        private void OnColorFilterChanged(object sender, RoutedEventArgs e)
        {
            UpdatePreview();
        }

        private void SliderZoom_ValueChanged(object sender, RoutedPropertyChangedEventArgs<double> e)
        {
            if (TransformScale != null)
            {
                TransformScale.ScaleX = SliderZoom.Value;
                TransformScale.ScaleY = SliderZoom.Value;
            }
        }

        private void BtnResetView_Click(object sender, RoutedEventArgs e)
        {
            SliderZoom.Value = 1.0;
        }

        private void BtnCancel_Click(object sender, RoutedEventArgs e)
        {
            DialogResult = false;
            Close();
        }

        private void BtnSave_Click(object sender, RoutedEventArgs e)
        {
            if (_workingBitmap == null)
            {
                DialogResult = false;
                Close();
                return;
            }

            try
            {
                using var finalBmp = ApplyCurrentFilter(_workingBitmap);
                using var ms = new MemoryStream();
                finalBmp.Save(ms, ImageFormat.Jpeg);
                byte[] newBytes = ms.ToArray();

                File.WriteAllBytes(_filePath, newBytes);
                ChangesSaved = true;
                DialogResult = true;
                Close();
            }
            catch (Exception ex)
            {
                MessageBox.Show($"Failed to save edits to file: {ex.Message}", "Save Error", MessageBoxButton.OK, MessageBoxImage.Error);
            }
        }
    }
}
