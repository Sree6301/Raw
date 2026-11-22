using System;
using System.Windows;
using System.Windows.Controls;
using ComboBox = System.Windows.Controls.ComboBox;
using ComboBoxItem = System.Windows.Controls.ComboBoxItem;
using MessageBox = System.Windows.MessageBox;
using SmartXeroxHub.Agent.Core;

namespace SmartXeroxHub.Agent.UI
{
    public partial class PrintSettingsWindow : Window
    {
        private readonly BackendOrderDto _order;
        private readonly BackendSync _backendSync;
        private readonly DeviceManager _deviceManager;

        public bool ShouldPrintImmediately { get; private set; }

        public PrintSettingsWindow(BackendOrderDto order, BackendSync backendSync, DeviceManager deviceManager)
        {
            InitializeComponent();
            _order = order;
            _backendSync = backendSync;
            _deviceManager = deviceManager;

            TxtOrderHeader.Text = $"PRINT SETTINGS • ORDER {_order.OrderNumber}";
            TxtOrderSub.Text = $"{_order.ServiceType} — {_order.OriginalFileName} ({_order.TotalPages} pages × {_order.Copies} copies)";

            // Initialize controls
            bool isPhoto = _order.ServiceType == "PHOTO";
            
            // Auto-select paper type
            if (isPhoto)
            {
                if (_order.PaperType.Contains("A4", StringComparison.OrdinalIgnoreCase))
                {
                    SelectComboTag(ComboPaperType, "PHOTO_A4");
                }
                else
                {
                    // Default for photos is HP Glossy Photo Paper 4x6
                    SelectComboTag(ComboPaperType, "PHOTO_4X6");
                }
            }
            else
            {
                SelectComboTag(ComboPaperType, "NORMAL_A4");
            }

            // Color mode
            if (_order.ColorMode == "BW")
            {
                RadioBw.IsChecked = true;
            }
            else
            {
                RadioColor.IsChecked = true;
            }

            // DPI
            int initialDpi = _order.PrintSettings?.Dpi ?? (isPhoto ? 600 : 300);
            SelectComboTag(ComboDpi, initialDpi.ToString());

            // N-Up
            int nup = _order.PrintSettings?.PagesPerSheet ?? 1;
            SelectComboTag(ComboNUp, nup.ToString());

            // Orientation
            string orient = _order.PrintSettings?.Orientation ?? "PORTRAIT";
            SelectComboTag(ComboOrientation, orient);
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

        private void ComboPaperType_SelectionChanged(object sender, SelectionChangedEventArgs e)
        {
            var tag = GetSelectedTag(ComboPaperType);
            if (tag.StartsWith("PHOTO"))
            {
                SelectComboTag(ComboDpi, "600");
                RadioColor.IsChecked = true;
            }
        }

        public PrintJobOptions BuildOptions()
        {
            var pType = GetSelectedTag(ComboPaperType);
            int.TryParse(GetSelectedTag(ComboDpi), out int dpi);
            if (dpi <= 0) dpi = pType.StartsWith("PHOTO") ? 600 : 300;

            int.TryParse(GetSelectedTag(ComboNUp), out int nup);
            if (nup <= 0) nup = 1;

            var orientation = GetSelectedTag(ComboOrientation);
            if (string.IsNullOrEmpty(orientation)) orientation = "PORTRAIT";

            var scaleTag = GetSelectedTag(ComboScale);
            double scale = scaleTag == "FIT" ? 95.0 : 100.0;

            return new PrintJobOptions
            {
                Dpi = dpi,
                PagesPerSheet = nup,
                Orientation = orientation,
                PaperType = pType,
                PaperSize = pType.Contains("4X6") ? "4X6" : "A4",
                ColorMode = RadioColor.IsChecked == true ? "COLOR" : "BW",
                ScalePercent = scale,
                Scope = "ALL_PAGES"
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
