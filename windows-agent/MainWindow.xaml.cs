using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.IO;
using System.Threading.Tasks;
using System.Windows;
using System.Windows.Controls;
using System.Windows.Media.Imaging;
using Microsoft.Win32;
using SmartXeroxHub.Agent.Core;
using SmartXeroxHub.Agent.UI;
using MessageBox = System.Windows.MessageBox;
using Button = System.Windows.Controls.Button;
using TextBox = System.Windows.Controls.TextBox;
using ComboBox = System.Windows.Controls.ComboBox;
using OpenFileDialog = Microsoft.Win32.OpenFileDialog;

namespace SmartXeroxHub.Agent
{
    public class ScannedPageItem
    {
        public string FilePath { get; set; } = string.Empty;
        public int PageNumber { get; set; }
        public string DisplayName => $"Page {PageNumber} ({Path.GetFileName(FilePath)})";
        public BitmapImage Thumbnail { get; set; } = null!;
    }

    public partial class MainWindow : Window
    {
        private readonly DeviceManager _deviceManager;
        private readonly DuplexProcessor _duplexProcessor;
        private readonly ScanManager _scanManager;
        private readonly RecoveryManager _recoveryManager;
        private readonly BackendSync _backendSync;

        private List<BackendOrderDto> _currentOrders = new();
        private DuplexJob? _activeDuplexJob;
        private readonly List<string> _sessionScannedPages = new();
        private readonly System.Collections.ObjectModel.ObservableCollection<ScannedPageItem> _scannedGalleryItems = new();
        private string? _deskPassportSheetPath;
        private readonly string _rawInputsDir;
        private readonly string _userUploadsDir;
        private readonly string _scansDir;

        public MainWindow(
            DeviceManager deviceManager,
            DuplexProcessor duplexProcessor,
            ScanManager scanManager,
            RecoveryManager recoveryManager,
            BackendSync backendSync
        )
        {
            InitializeComponent();

            try
            {
                var iconUri = new Uri("pack://application:,,,/Assets/app.ico", UriKind.RelativeOrAbsolute);
                this.Icon = BitmapFrame.Create(iconUri);
            }
            catch (Exception ex)
            {
                LoggingManager.Warn($"Could not set window icon: {ex.Message}");
            }

            _deviceManager = deviceManager;
            _duplexProcessor = duplexProcessor;
            _scanManager = scanManager;
            _recoveryManager = recoveryManager;
            _backendSync = backendSync;

            // Resolve directories
            _scansDir = _scanManager.GetScansDirectory();
            _userUploadsDir = _backendSync.GetUserUploadsDirectory();
            _rawInputsDir = Path.GetDirectoryName(_scansDir) ?? AppDomain.CurrentDomain.BaseDirectory;

            LoggingManager.LogMessageReceived += OnLogMessageReceived;

            // Subscribe to device manager
            _deviceManager.PrintersDiscovered += printers =>
            {
                Dispatcher.Invoke(() =>
                {
                    ListPrinters.ItemsSource = null;
                    ListPrinters.ItemsSource = printers;
                });
            };

            _deviceManager.ActivePrinterChanged += active =>
            {
                Dispatcher.Invoke(() =>
                {
                    if (active != null)
                    {
                        TxtPrinterStatus.Text = $"● {active.Name} ({active.PortName}) ONLINE";
                    }
                });
            };

            // Real-time WebSocket / Polling updates from backend
            _backendSync.ConnectionStatusChanged += isOnline =>
            {
                Dispatcher.Invoke(() =>
                {
                    if (isOnline)
                    {
                        PillRealtime.Background = new System.Windows.Media.SolidColorBrush(System.Windows.Media.Color.FromRgb(6, 78, 59));
                        TxtRealtime.Text = "● LIVE SYNC ACTIVE";
                    }
                    else
                    {
                        PillRealtime.Background = new System.Windows.Media.SolidColorBrush(System.Windows.Media.Color.FromRgb(153, 27, 27));
                        TxtRealtime.Text = "● OFFLINE / STANDALONE";
                    }
                });
            };

            // Automatic live update when customer submits or changes an order!
            _backendSync.OrdersUpdated += () =>
            {
                Dispatcher.Invoke(async () =>
                {
                    await RefreshOrdersAsync();
                });
            };

            // Real-time price update
            _backendSync.PricingUpdated += () =>
            {
                Dispatcher.Invoke(LoadPricingAsync);
            };

            ListScannedPages.ItemsSource = _scannedGalleryItems;

            Loaded += async (s, e) =>
            {
                ListPrinters.ItemsSource = _deviceManager.DiscoveredPrinters;
                await RefreshOrdersAsync();
                LoadPricingAsync();
            };
        }

        private void OnLogMessageReceived(string message)
        {
            if (message != null && message.Contains("Real-time event received: AGENT_STATUS"))
            {
                return; // Hide AGENT_STATUS spam while keeping live sync status indicator green
            }
            Dispatcher.Invoke(() =>
            {
                TxtLogs.AppendText(message + Environment.NewLine);
                ScrollLogs.ScrollToEnd();
            });
        }

        public async Task RefreshOrdersAsync()
        {
            try
            {
                _currentOrders = await _backendSync.FetchAllOrdersAsync();
                ApplyFilterAndSort();
                TxtOrderCount.Text = $"{_currentOrders.Count} Order(s) in Live Queue";
            }
            catch (Exception ex)
            {
                LoggingManager.Warn($"[MainWindow] Could not refresh orders: {ex.Message}");
            }
        }

        private async void BtnRefreshOrders_Click(object sender, RoutedEventArgs e)
        {
            await RefreshOrdersAsync();
        }

        private bool _sortAscending = false;

        private void BtnSortDirection_Click(object sender, RoutedEventArgs e)
        {
            _sortAscending = !_sortAscending;
            if (BtnSortDirection != null)
            {
                BtnSortDirection.Content = _sortAscending ? "▲ Asc" : "▼ Desc";
            }
            ApplyFilterAndSort();
        }

        private void ComboSortBy_SelectionChanged(object sender, SelectionChangedEventArgs e)
        {
            ApplyFilterAndSort();
        }

        private void TxtSearchFilter_TextChanged(object sender, TextChangedEventArgs e)
        {
            ApplyFilterAndSort();
        }

        private void ApplyFilterAndSort()
        {
            if (_currentOrders == null) return;

            var filtered = _currentOrders.AsEnumerable();

            // Search filter
            var query = TxtSearchFilter?.Text?.Trim() ?? "";
            if (!string.IsNullOrEmpty(query))
            {
                filtered = filtered.Where(o =>
                    o.OrderNumber.Contains(query, StringComparison.OrdinalIgnoreCase) ||
                    o.OriginalFileName.Contains(query, StringComparison.OrdinalIgnoreCase) ||
                    o.ServiceType.Contains(query, StringComparison.OrdinalIgnoreCase) ||
                    o.Status.Contains(query, StringComparison.OrdinalIgnoreCase));
            }

            // Sorting: Completed, Pending, Time, Price
            var tag = (ComboSortBy?.SelectedItem as ComboBoxItem)?.Tag?.ToString() ?? "TIME";
            filtered = tag switch
            {
                "TIME" => _sortAscending
                    ? filtered.OrderBy(o => o.CreatedAt)
                    : filtered.OrderByDescending(o => o.CreatedAt),
                "PENDING" => _sortAscending
                    ? filtered.OrderBy(o => (o.Status == "COMPLETE" || o.Status == "COMPLETED" || o.Status == "DOWNLOAD_AVAILABLE") ? 1 : 0).ThenByDescending(o => o.CreatedAt)
                    : filtered.OrderBy(o => (o.Status == "COMPLETE" || o.Status == "COMPLETED" || o.Status == "DOWNLOAD_AVAILABLE") ? 0 : 1).ThenByDescending(o => o.CreatedAt),
                "COMPLETED" => _sortAscending
                    ? filtered.OrderBy(o => (o.Status == "COMPLETE" || o.Status == "COMPLETED" || o.Status == "DOWNLOAD_AVAILABLE") ? 0 : 1).ThenByDescending(o => o.CreatedAt)
                    : filtered.OrderBy(o => (o.Status == "COMPLETE" || o.Status == "COMPLETED" || o.Status == "DOWNLOAD_AVAILABLE") ? 1 : 0).ThenByDescending(o => o.CreatedAt),
                "PRICE" => _sortAscending
                    ? filtered.OrderBy(o => o.CalculatedPrice)
                    : filtered.OrderByDescending(o => o.CalculatedPrice),
                _ => _sortAscending
                    ? filtered.OrderBy(o => o.CreatedAt)
                    : filtered.OrderByDescending(o => o.CreatedAt)
            };

            if (GridOrders != null)
            {
                GridOrders.ItemsSource = filtered.ToList();
            }
        }

        // ==========================================
        // TAB 1: ORDER ROW ACTIONS & FILE OPENING
        // ==========================================
        private async void BtnRowAction_Click(object sender, RoutedEventArgs e)
        {
            if (sender is Button btn && btn.DataContext is BackendOrderDto order)
            {
                var printerName = _deviceManager.ActivePrinter?.Name ?? "HP Smart Tank 580-590 series";

                if (order.IsScan)
                {
                    // Multi-page sequential scan handler
                    int currentPageToScan = order.ScannedPagesCount + 1;
                    bool isLastPage = currentPageToScan >= order.RequestedPagesCount;

                    btn.IsEnabled = false;
                    btn.Content = $"⏳ Scanning Page {currentPageToScan}...";
                    try
                    {
                        var success = await _backendSync.AcquireAndUploadScanAsync(
                            order.Id,
                            order.OrderNumber,
                            order.Format,
                            order.Resolution,
                            order.ColorMode,
                            currentPageToScan,
                            isLastPage
                        );

                        if (success)
                        {
                            if (isLastPage)
                            {
                                MessageBox.Show(
                                    $"All {order.RequestedPagesCount} pages scanned directly from HP Smart Tank 589 flatbed glass!\n\nMerged file saved to RAW_Inputs/Scans.\nCustomer site has received the download file.",
                                    "Scanning Completed & Delivered",
                                    MessageBoxButton.OK,
                                    MessageBoxImage.Information
                                );
                            }
                            else
                            {
                                MessageBox.Show(
                                    $"Page {currentPageToScan} of {order.RequestedPagesCount} scanned successfully and saved to RAW_Inputs/Scans!\n\n👉 Place the next document on the scanner glass and click 'Continue Scan' on this row.",
                                    "Page Captured — Insert Next Document",
                                    MessageBoxButton.OK,
                                    MessageBoxImage.Information
                                );
                            }
                        }
                        else
                        {
                            var scansDir = _scanManager.GetScansDirectory();
                            var matchingFiles = Directory.GetFiles(scansDir, $"{order.OrderNumber}*.*");
                            if (matchingFiles.Length > 0)
                            {
                                MessageBox.Show($"Physical scan was captured and saved to RAW_Inputs/Scans:\n{matchingFiles[0]}\n\nCloud transmission is syncing.", "Scan Saved Locally", MessageBoxButton.OK, MessageBoxImage.Information);
                            }
                            else
                            {
                                MessageBox.Show("Physical scan could not be acquired. Ensure HP Smart Tank 589 is powered on, flatbed lid is closed, and scanner is ready.", "Scanner Warning", MessageBoxButton.OK, MessageBoxImage.Warning);
                            }
                        }
                    }
                    catch (Exception ex)
                    {
                        MessageBox.Show($"Scanner error: {ex.Message}", "Scanner Error", MessageBoxButton.OK, MessageBoxImage.Error);
                    }
                    finally
                    {
                        btn.IsEnabled = true;
                        await RefreshOrdersAsync();
                    }
                    return;
                }

                if (order.IsDuplex)
                {
                    // Duplex multi-step execution right inside the order row
                    if (order.DuplexStage == "AWAITING_PAPER_REVERSAL" || order.Status == "AWAITING_PAPER_REVERSAL")
                    {
                        // Step 2: Confirm paper reversal and spool even pages (reverse pass)
                        var res = MessageBox.Show(
                            $"📄 MANUAL DUPLEX — STEP 2 OF 2: PRINT BACK SIDE (EVEN PAGES)\n\n" +
                            $"Order #{order.OrderNumber} ({order.TotalPages} pages × {order.Copies} copy):\n\n" +
                            $"👉 Paper Check:\n" +
                            $"1. Did you collect the printed odd sheets from the front exit tray?\n" +
                            $"2. Did you flip the stack horizontally (keep top edge at the top)?\n" +
                            $"3. Did you place the stack back into the rear paper tray of '{printerName}'?\n\n" +
                            $"Click 'Yes' to print the other side (even pages).\nClick 'No' if you need more time to load paper.",
                            "Manual Duplex Step 2: Confirm Paper Reversal",
                            MessageBoxButton.YesNo,
                            MessageBoxImage.Question
                        );
                        if (res != MessageBoxResult.Yes) return;

                        btn.IsEnabled = false;
                        btn.Content = "⏳ Printing Other Side...";
                        try
                        {
                            var duplexJob = _recoveryManager.GetActiveDuplexJob(order.Id) ?? _activeDuplexJob;
                            if (duplexJob == null)
                            {
                                var localFile = await _backendSync.EnsureLocalFileAsync(order.FileUrl, order.OriginalFileName);
                                duplexJob = _duplexProcessor.PrepareDuplexFiles(order.Id, order.OrderNumber, localFile, order.Copies, printerName, order.PrintSettings?.PagesPerSheet ?? 1, order.PrintSettings);
                                _recoveryManager.TrackDuplexJob(duplexJob);
                                _activeDuplexJob = duplexJob;
                            }

                            _duplexProcessor.ConfirmPaperReversed(duplexJob);
                            bool secondSidePrinted = _duplexProcessor.PrintSecondSide(duplexJob);
                            if (!secondSidePrinted)
                            {
                                MessageBox.Show($"Failed to spool second side (even pages) to '{printerName}'. Please ensure printer is online and tray has paper.", "Duplex Error", MessageBoxButton.OK, MessageBoxImage.Warning);
                                return;
                            }

                            await _backendSync.UpdateDuplexStageOnBackendAsync(order.Id, "COMPLETED");
                            await _backendSync.UpdateOrderStatusOnBackendAsync(order.Id, "DOCUMENT", "COMPLETE");
                            order.DuplexStage = "COMPLETED";
                            order.Status = "COMPLETE";

                            MessageBox.Show(
                                $"✅ Duplex document '{order.OrderNumber}' printed successfully on both sides!\n\nAll {order.TotalPages} pages delivered cleanly to '{printerName}'.",
                                "Duplex Finished",
                                MessageBoxButton.OK,
                                MessageBoxImage.Information
                            );
                        }
                        catch (Exception ex)
                        {
                            MessageBox.Show($"Failed to print second side: {ex.Message}", "Duplex Error", MessageBoxButton.OK, MessageBoxImage.Error);
                        }
                        finally
                        {
                            btn.IsEnabled = true;
                            await RefreshOrdersAsync();
                        }
                        return;
                    }
                    else if (order.DuplexStage == "COMPLETED" || order.Status == "COMPLETE")
                    {
                        MessageBox.Show($"Duplex job '{order.OrderNumber}' has already been completed.", "Completed", MessageBoxButton.OK, MessageBoxImage.Information);
                        return;
                    }
                    else
                    {
                        // Step 1: Spool odd pages (Front pass)
                        btn.IsEnabled = false;
                        btn.Content = "⏳ Printing Odd Pages...";
                        try
                        {
                            var localFile = await _backendSync.EnsureLocalFileAsync(order.FileUrl, order.OriginalFileName);
                            var duplexJob = _duplexProcessor.PrepareDuplexFiles(order.Id, order.OrderNumber, localFile, order.Copies, printerName, order.PrintSettings?.PagesPerSheet ?? 1, order.PrintSettings);
                            _recoveryManager.TrackDuplexJob(duplexJob);
                            _activeDuplexJob = duplexJob;

                            bool firstSidePrinted = _duplexProcessor.PrintFirstSide(duplexJob);
                            if (!firstSidePrinted)
                            {
                                MessageBox.Show($"Failed to spool first side (odd pages) to '{printerName}'. Please check printer status.", "Print Error", MessageBoxButton.OK, MessageBoxImage.Warning);
                                return;
                            }

                            await _backendSync.UpdateDuplexStageOnBackendAsync(order.Id, "AWAITING_PAPER_REVERSAL");
                            order.DuplexStage = "AWAITING_PAPER_REVERSAL";

                            MessageBox.Show(
                                $"📄 MANUAL DUPLEX — STEP 1 OF 2 COMPLETE!\n\n" +
                                $"Front side (odd pages) sent to '{printerName}'.\n\n" +
                                $"👉 Next Operator Steps:\n" +
                                $"1. Wait for all odd pages to finish in the front output tray.\n" +
                                $"2. Take the stack, flip it horizontally (Front Top remains Back Top).\n" +
                                $"3. Place the flipped stack back into the rear paper tray.\n" +
                                $"4. Click '🔄 2. Page Reversed (Confirm)' on this order row to print the back side.",
                                "Step 1 Finished — Flip Paper Stack",
                                MessageBoxButton.OK,
                                MessageBoxImage.Information
                            );
                        }
                        catch (Exception ex)
                        {
                            MessageBox.Show($"Failed to start duplex: {ex.Message}", "Duplex Error", MessageBoxButton.OK, MessageBoxImage.Error);
                        }
                        finally
                        {
                            btn.IsEnabled = true;
                            await RefreshOrdersAsync();
                        }
                        return;
                    }
                }

                // If Passport 8-up: prompt operator to insert 4x6 paper
                if (order.IsPassport8)
                {
                    var res = MessageBox.Show(
                        $"⚠️ HARDWARE ACTION REQUIRED FOR ORDER '{order.OrderNumber}':\n\n1. Please insert 4×6 inch HP Glossy Photo Paper into the rear tray of HP Smart Tank 589.\n2. Adjust rear paper guide snugly to 4×6.\n\nClick OK once 4×6 photo paper is inserted to proceed with printing 8 passport photos.",
                        "Insert 4×6 HP Photo Paper",
                        MessageBoxButton.OKCancel,
                        MessageBoxImage.Information
                    );
                    if (res != MessageBoxResult.OK) return;
                }

                // Standard Single Document or Photo: "🖨️ Approve & Print"
                btn.IsEnabled = false;
                btn.Content = "⏳ Spooling...";
                try
                {
                    var success = await _backendSync.TriggerPrintOrderAsync(order.Id, printerName);
                    if (success)
                    {
                        MessageBox.Show($"Order '{order.OrderNumber}' approved! Sent to physical printer: '{printerName}'.", "Print Spooled", MessageBoxButton.OK, MessageBoxImage.Information);
                    }
                    else
                    {
                        var localFile = await _backendSync.EnsureLocalFileAsync(order.FileUrl, order.OriginalFileName);
                        if (order.ServiceType == "DOCUMENT")
                        {
                            var opt = new PrintJobOptions
                            {
                                ColorMode = order.ColorMode,
                                PaperSize = order.PaperSize,
                                PaperType = order.PaperType,
                                Dpi = 300,
                                PagesPerSheet = 1
                            };
                            PhotoProcessor.PrintPdfDocument(localFile, printerName, order.OrderNumber, opt);
                        }
                        else
                        {
                            string orientation = order.IsPassport8 ? "LANDSCAPE" : (order.PrintSettings?.Orientation ?? "PORTRAIT");
                            string fitMode = order.PrintSettings?.FitMode ?? "FIT";
                            bool enableBorder = order.PrintSettings?.EnableBorder ?? order.IsPassport8;
                            PhotoProcessor.PrintPhoto(localFile, printerName, order.PaperType, order.ColorMode, fitMode, order.OrderNumber, 100.0, orientation, enableBorder);
                        }
                        MessageBox.Show($"Printed locally to '{printerName}'!", "Print Succeeded", MessageBoxButton.OK, MessageBoxImage.Information);
                    }
                }
                finally
                {
                    btn.IsEnabled = true;
                    await RefreshOrdersAsync();
                }
            }
        }

        private void BtnOpenFile_Click(object sender, RoutedEventArgs e)
        {
            if (sender is Button btn && btn.DataContext is BackendOrderDto order)
            {
                try
                {
                    if (order.IsScan)
                    {
                        if (order.Status == "DOWNLOAD_AVAILABLE" && !string.IsNullOrEmpty(order.LocalFilePath) && File.Exists(order.LocalFilePath))
                        {
                            Process.Start(new ProcessStartInfo(order.LocalFilePath) { UseShellExecute = true });
                        }
                        else
                        {
                            MessageBox.Show($"Document '{order.OrderNumber}' has not been scanned yet.\n\nClick '🔍 Approve & Scan' on this row to capture physical page from HP Flatbed scanner.", "Scan Pending", MessageBoxButton.OK, MessageBoxImage.Information);
                        }
                        return;
                    }

                    // Document or Photo
                    if (!string.IsNullOrEmpty(order.LocalFilePath) && File.Exists(order.LocalFilePath))
                    {
                        Process.Start(new ProcessStartInfo(order.LocalFilePath) { UseShellExecute = true });
                    }
                    else if (!string.IsNullOrEmpty(order.FileUrl))
                    {
                        Task.Run(async () =>
                        {
                            var localPath = await _backendSync.EnsureLocalFileAsync(order.FileUrl, order.OriginalFileName);
                            if (File.Exists(localPath))
                            {
                                Process.Start(new ProcessStartInfo(localPath) { UseShellExecute = true });
                            }
                        });
                    }
                }
                catch (Exception ex)
                {
                    MessageBox.Show($"Could not open file: {ex.Message}", "File Open Error", MessageBoxButton.OK, MessageBoxImage.Error);
                }
            }
        }

        private async void BtnRowComplete_Click(object sender, RoutedEventArgs e)
        {
            if (sender is Button btn && btn.DataContext is BackendOrderDto order)
            {
                // Early scan finish warning if customer requested more pages than currently scanned
                if (order.IsScan && order.ScannedPagesCount > 0 && order.ScannedPagesCount < order.RequestedPagesCount)
                {
                    var result = MessageBox.Show(
                        $"Warning: Only {order.ScannedPagesCount} of {order.RequestedPagesCount} requested pages have been scanned.\n\nCustomer requested {order.RequestedPagesCount} pages.\n\nProceed to finalize and deliver with {order.ScannedPagesCount} pages?",
                        "Incomplete Scan Warning",
                        MessageBoxButton.OKCancel,
                        MessageBoxImage.Warning
                    );
                    if (result != MessageBoxResult.OK)
                    {
                        return;
                    }

                    // Finalize scan with existing pages
                    await _backendSync.FinalizeScanOrderAsync(order.Id);
                }

                await _backendSync.UpdateOrderStatusOnBackendAsync(order.Id, order.ServiceType, "COMPLETE");
                await RefreshOrdersAsync();
            }
        }

        private async void BtnRowSettings_Click(object sender, RoutedEventArgs e)
        {
            if (sender is Button btn && btn.DataContext is BackendOrderDto order)
            {
                try
                {
                    var win = new PrintSettingsWindow(order, _backendSync, _deviceManager)
                    {
                        Owner = this
                    };
                    if (win.ShowDialog() == true)
                    {
                        if (win.ShouldPrintImmediately)
                        {
                            var printerName = _deviceManager.ActivePrinter?.Name ?? "HP Smart Tank 580-590 series";
                            await _backendSync.TriggerPrintOrderAsync(order.Id, printerName);
                            MessageBox.Show($"Settings applied and print command dispatched to '{printerName}'!", "Print Spooled", MessageBoxButton.OK, MessageBoxImage.Information);
                        }
                        await RefreshOrdersAsync();
                    }
                }
                catch (Exception ex)
                {
                    LoggingManager.Error($"[MainWindow] Could not open print settings for {order.OrderNumber}", ex);
                    MessageBox.Show($"Unable to open settings window: {ex.Message}", "Settings Warning", MessageBoxButton.OK, MessageBoxImage.Warning);
                }
            }
        }

        // ============================================================
        // IN-CELL DYNAMIC ADMIN EDITING EVENT HANDLERS
        // ============================================================
        private async void TxtRowCopies_LostFocus(object sender, RoutedEventArgs e)
        {
            if (sender is TextBox tb && tb.DataContext is BackendOrderDto order)
            {
                if (int.TryParse(tb.Text, out int newCopies) && newCopies > 0)
                {
                    if (order.Copies != newCopies)
                    {
                        order.Copies = newCopies;
                        await _backendSync.ModifyOrderOnBackendAsync(order.Id, order.ServiceType, order.Copies, order.ColorMode, order.Sides, order.Status, order.CalculatedPrice, order.RequestedPagesCount);
                    }
                }
                else
                {
                    tb.Text = order.Copies.ToString();
                }
            }
        }

        private async void TxtRowPages_LostFocus(object sender, RoutedEventArgs e)
        {
            if (sender is TextBox tb && tb.DataContext is BackendOrderDto order)
            {
                if (int.TryParse(tb.Text, out int newPages) && newPages > 0)
                {
                    if (order.RequestedPagesCount != newPages)
                    {
                        order.RequestedPagesCount = newPages;
                        order.TotalPages = newPages;
                        await _backendSync.ModifyOrderOnBackendAsync(order.Id, order.ServiceType, order.Copies, order.ColorMode, order.Sides, order.Status, order.CalculatedPrice, order.RequestedPagesCount);
                    }
                }
                else
                {
                    tb.Text = order.RequestedPagesCount.ToString();
                }
            }
        }

        private async void TxtRowPrice_LostFocus(object sender, RoutedEventArgs e)
        {
            if (sender is TextBox tb && tb.DataContext is BackendOrderDto order)
            {
                if (decimal.TryParse(tb.Text, out decimal newPrice) && newPrice >= 0)
                {
                    if (order.CalculatedPrice != newPrice)
                    {
                        order.CalculatedPrice = newPrice;
                        await _backendSync.ModifyOrderOnBackendAsync(order.Id, order.ServiceType, order.Copies, order.ColorMode, order.Sides, order.Status, order.CalculatedPrice, order.RequestedPagesCount);
                    }
                }
                else
                {
                    tb.Text = order.CalculatedPrice.ToString("F2");
                }
            }
        }

        private void TxtRow_KeyDown(object sender, System.Windows.Input.KeyEventArgs e)
        {
            if (e.Key == System.Windows.Input.Key.Enter && sender is TextBox)
            {
                System.Windows.Input.Keyboard.ClearFocus();
            }
        }

        private async void ComboRowColor_SelectionChanged(object sender, SelectionChangedEventArgs e)
        {
            if (sender is ComboBox cb && cb.DataContext is BackendOrderDto order && cb.SelectedValue is string newColor)
            {
                if (order.ColorMode != newColor)
                {
                    order.ColorMode = newColor;
                    await _backendSync.ModifyOrderOnBackendAsync(order.Id, order.ServiceType, order.Copies, order.ColorMode, order.Sides, order.Status, order.CalculatedPrice, order.RequestedPagesCount);
                }
            }
        }

        private async void ComboRowSides_SelectionChanged(object sender, SelectionChangedEventArgs e)
        {
            if (sender is ComboBox cb && cb.DataContext is BackendOrderDto order && cb.SelectedValue is string newSides)
            {
                if (order.Sides != newSides)
                {
                    order.Sides = newSides;
                    await _backendSync.ModifyOrderOnBackendAsync(order.Id, order.ServiceType, order.Copies, order.ColorMode, order.Sides, order.Status, order.CalculatedPrice, order.RequestedPagesCount);
                }
            }
        }

        private async void ComboRowStatus_SelectionChanged(object sender, SelectionChangedEventArgs e)
        {
            if (sender is ComboBox cb && cb.DataContext is BackendOrderDto order && cb.SelectedValue is string newStatus)
            {
                if (order.Status != newStatus)
                {
                    order.Status = newStatus;
                    await _backendSync.ModifyOrderOnBackendAsync(order.Id, order.ServiceType, order.Copies, order.ColorMode, order.Sides, order.Status, order.CalculatedPrice, order.RequestedPagesCount);
                }
            }
        }

        // ============================================================
        // IN-WINDOW MANUAL DUPLEX STEP-BY-STEP CONTROLLER (SECTION 7)
        // ============================================================
        private BackendOrderDto? _wizardDuplexOrder;

        private void OpenDuplexWizard(BackendOrderDto order)
        {
            _wizardDuplexOrder = order;
            var printerName = _deviceManager.ActivePrinter?.Name ?? "HP Smart Tank 580-590 series";

            Task.Run(async () =>
            {
                var localFile = await _backendSync.EnsureLocalFileAsync(order.FileUrl, order.OriginalFileName);
                var job = _duplexProcessor.PrepareDuplexFiles(order.Id, order.OrderNumber, localFile, order.Copies, printerName);
                _recoveryManager.TrackDuplexJob(job);
                _activeDuplexJob = job;

                Dispatcher.Invoke(() =>
                {
                    DuplexWizardCard.Visibility = Visibility.Visible;
                    TxtDuplexWizardHeader.Text = $"Active Order: {job.OrderNumber} • Total: {job.NormalizedPageCount} Pages ({(job.NormalizedPageCount + 1) / 2} Sheets) • Copies: {job.TotalCopies}";
                    TxtDuplexStep1Detail.Text = $"Pages 1, 3, 5... ascending ({job.OddPagesFilePath})";
                    TxtDuplexStep3Detail.Text = $"Reverse even: {job.NormalizedPageCount}, {job.NormalizedPageCount - 2}... descending";

                    BtnDuplexStep1Print.IsEnabled = true;
                    BtnDuplexStep1Print.Content = "▶ 1. Print Odd Pages";
                    BtnDuplexStep2Confirm.IsEnabled = false;
                    BtnDuplexStep2Confirm.Content = "🔄 2. Page Reversed";
                    BtnDuplexStep3Print.IsEnabled = false;
                    BtnDuplexStep3Print.Content = "▶ 3. Print Other Side";
                    BtnDuplexStep4Done.IsEnabled = false;
                });
            });
        }

        private void BtnCloseDuplexWizard_Click(object sender, RoutedEventArgs e)
        {
            DuplexWizardCard.Visibility = Visibility.Collapsed;
            _wizardDuplexOrder = null;
        }

        private void BtnDuplexStep1_Click(object sender, RoutedEventArgs e)
        {
            if (_activeDuplexJob == null) return;
            _duplexProcessor.PrintFirstSide(_activeDuplexJob);
            _recoveryManager.SaveState();

            BtnDuplexStep1Print.Content = "✅ Side 1 (Odd) Printed";
            BtnDuplexStep1Print.IsEnabled = false;
            BtnDuplexStep2Confirm.IsEnabled = true;

            MessageBox.Show("Side 1 (Odd Pages) spooled to HP printer!\n\n1. Take the printed stack from the output tray.\n2. DO NOT rotate or shuffle.\n3. Flip face-down back into the rear paper tray.\n4. Click '🔄 2. Page Reversed'.", "Step 1 Finished - Reverse Paper", MessageBoxButton.OK, MessageBoxImage.Information);
        }

        private void BtnDuplexStep2_Click(object sender, RoutedEventArgs e)
        {
            if (_activeDuplexJob == null) return;
            _duplexProcessor.ConfirmPaperReversed(_activeDuplexJob);
            _recoveryManager.SaveState();

            BtnDuplexStep2Confirm.Content = "✅ Paper Reversal Confirmed";
            BtnDuplexStep2Confirm.IsEnabled = false;
            BtnDuplexStep3Print.IsEnabled = true;

            MessageBox.Show("Paper reversal confirmed! Click '▶ 3. Print Other Side' to print the reverse even pages.", "Ready for Side 2", MessageBoxButton.OK, MessageBoxImage.Information);
        }

        private void BtnDuplexStep3_Click(object sender, RoutedEventArgs e)
        {
            if (_activeDuplexJob == null) return;
            _duplexProcessor.PrintSecondSide(_activeDuplexJob);
            _recoveryManager.SaveState();

            BtnDuplexStep3Print.Content = "✅ Side 2 (Even) Printed";
            BtnDuplexStep3Print.IsEnabled = false;
            BtnDuplexStep4Done.IsEnabled = true;

            MessageBox.Show("Reverse even pages printed on the other side! Click '✅ 4. Job Complete' to finish.", "Duplex Both Sides Printed", MessageBoxButton.OK, MessageBoxImage.Information);
        }

        private async void BtnDuplexStep4_Click(object sender, RoutedEventArgs e)
        {
            if (_activeDuplexJob != null && _wizardDuplexOrder != null)
            {
                await _backendSync.UpdateOrderStatusOnBackendAsync(_wizardDuplexOrder.Id, "DOCUMENT", "COMPLETE");
                await _backendSync.UpdateDuplexStageOnBackendAsync(_wizardDuplexOrder.Id, "COMPLETED");
            }
            DuplexWizardCard.Visibility = Visibility.Collapsed;
            _wizardDuplexOrder = null;
            await RefreshOrdersAsync();
            MessageBox.Show("Manual Duplex Job marked COMPLETED!", "Job Finished", MessageBoxButton.OK, MessageBoxImage.Information);
        }

        // ==========================================
        // TAB 2: IN-SOFTWARE DESK PRINT SERVICES
        // ==========================================
        private void RadioDocSides_Changed(object sender, RoutedEventArgs e)
        {
            if (PanelDeskDuplexSteps != null)
            {
                PanelDeskDuplexSteps.Visibility = RadioDocDuplex?.IsChecked == true ? Visibility.Visible : Visibility.Collapsed;
            }
        }

        private void BtnBrowseDeskDoc_Click(object sender, RoutedEventArgs e)
        {
            var dlg = new OpenFileDialog
            {
                Filter = "PDF Documents (*.pdf)|*.pdf|All Files (*.*)|*.*",
                Title = "Select PDF Document to Print"
            };
            if (dlg.ShowDialog() == true)
            {
                TxtDeskDocPath.Text = dlg.FileName;
            }
        }

        private void BtnDeskDocSettings_Click(object sender, RoutedEventArgs e)
        {
            var path = TxtDeskDocPath.Text.Trim();
            if (string.IsNullOrEmpty(path) || !File.Exists(path))
            {
                MessageBox.Show("Please select a valid PDF document first.", "Notice", MessageBoxButton.OK, MessageBoxImage.Warning);
                return;
            }

            int.TryParse(TxtDeskDocCopies.Text.Trim(), out var copies);
            copies = Math.Max(1, copies);

            var order = new BackendOrderDto
            {
                Id = "desk-preview",
                OrderNumber = "DESK-DOC",
                ServiceType = "DOCUMENT",
                LocalFilePath = path,
                OriginalFileName = Path.GetFileName(path),
                TotalPages = 1,
                Copies = copies,
                ColorMode = RadioDocColor.IsChecked == true ? "COLOR" : "BW",
                PaperType = "NORMAL_A4"
            };

            var win = new PrintSettingsWindow(order, _backendSync, _deviceManager) { Owner = this };
            if (win.ShowDialog() == true && win.ShouldPrintImmediately)
            {
                BtnPrintDeskDoc_Click(sender, e);
            }
        }

        private async void BtnPrintDeskDoc_Click(object sender, RoutedEventArgs e)
        {
            var path = TxtDeskDocPath.Text.Trim();
            if (string.IsNullOrEmpty(path) || !File.Exists(path))
            {
                MessageBox.Show("Please select a valid PDF document.", "Notice", MessageBoxButton.OK, MessageBoxImage.Warning);
                return;
            }

            int.TryParse(TxtDeskDocCopies.Text.Trim(), out var copies);
            copies = Math.Max(1, copies);

            var colorMode = RadioDocColor.IsChecked == true ? "COLOR" : "BW";
            var sides = RadioDocDuplex.IsChecked == true ? "MANUAL_DUPLEX" : "SINGLE";
            var printer = _deviceManager.ActivePrinter?.Name ?? "HP Smart Tank 580-590 series";

            var destPath = Path.Combine(_userUploadsDir, $"{DateTime.Now:yyyyMMdd_HHmmss}_{Path.GetFileName(path)}");
            File.Copy(path, destPath, true);
            LoggingManager.Info($"[DeskService] Document copied to RAW_Inputs: {destPath}");

            if (sides == "MANUAL_DUPLEX")
            {
                var orderId = Guid.NewGuid().ToString();
                var orderNum = $"DESK-{DateTime.Now:yyyyMMdd-HHmm}";
                var duplexJob = _duplexProcessor.PrepareDuplexFiles(orderId, orderNum, destPath, copies, printer);
                _recoveryManager.TrackDuplexJob(duplexJob);
                _activeDuplexJob = duplexJob;

                DuplexWizardCard.Visibility = Visibility.Visible;
                TxtDuplexWizardHeader.Text = $"Desk Order: {orderNum} • Total: {duplexJob.NormalizedPageCount} Pages • Copies: {duplexJob.TotalCopies}";
                TxtDuplexStep1Detail.Text = $"Odd Pages: 1, 3, 5... ascending ({duplexJob.OddPagesFilePath})";
                TxtDuplexStep3Detail.Text = $"Reverse Even: {duplexJob.NormalizedPageCount}... descending";

                BtnDuplexStep1Print.IsEnabled = true;
                BtnDuplexStep1Print.Content = "▶ 1. Print Odd Pages";
                BtnDuplexStep2Confirm.IsEnabled = false;
                BtnDuplexStep3Print.IsEnabled = false;
                BtnDuplexStep4Done.IsEnabled = false;

                MessageBox.Show("Manual Duplex job prepared! In-Window Duplex Wizard opened in Live Orders. Click '1. Print Odd Pages' to begin.", "Duplex Ready", MessageBoxButton.OK, MessageBoxImage.Information);
            }
            else
            {
                for (int c = 1; c <= copies; c++)
                {
                    PhotoProcessor.PrintPdfDocument(destPath, printer, $"DeskDoc_{Path.GetFileNameWithoutExtension(path)}_c{c}");
                }
                MessageBox.Show($"Sent {copies} copy(s) to '{printer}' cleanly!", "Print Successful", MessageBoxButton.OK, MessageBoxImage.Information);
            }

            await _backendSync.UploadLocalDocumentAsync(destPath, copies, colorMode, sides);
            await RefreshOrdersAsync();
        }

        private void BtnBrowseDeskPhoto_Click(object sender, RoutedEventArgs e)
        {
            var dlg = new OpenFileDialog
            {
                Filter = "Photo Images (*.jpg;*.jpeg;*.png)|*.jpg;*.jpeg;*.png|All Files (*.*)|*.*",
                Title = "Select Photo to Print"
            };
            if (dlg.ShowDialog() == true)
            {
                var cropWin = new DeskPhotoCropWindow(dlg.FileName, DeskPhotoCropMode.PHOTO, _userUploadsDir) { Owner = this };
                if (cropWin.ShowDialog() == true && !string.IsNullOrEmpty(cropWin.ResultFilePath))
                {
                    TxtDeskPhotoPath.Text = cropWin.ResultFilePath;
                    if (cropWin.PaperType == "PHOTO_A4") RadioPhotoA4.IsChecked = true;
                    else RadioPhoto4x6.IsChecked = true;

                    if (cropWin.IsBorderEnabled) RadioDeskPhotoWithBorder.IsChecked = true;
                    else RadioDeskPhotoBorderless.IsChecked = true;

                    var bi = new BitmapImage();
                    bi.BeginInit();
                    bi.CacheOption = BitmapCacheOption.OnLoad;
                    bi.CreateOptions = BitmapCreateOptions.IgnoreImageCache;
                    bi.UriSource = new Uri(cropWin.ResultFilePath);
                    bi.EndInit();

                    ImgDeskPhotoPreview.Source = bi;
                    TxtDeskPhotoEmpty.Visibility = Visibility.Collapsed;
                }
            }
        }

        private void BtnDeskPhotoSettings_Click(object sender, RoutedEventArgs e)
        {
            var path = TxtDeskPhotoPath.Text.Trim();
            if (string.IsNullOrEmpty(path) || !File.Exists(path))
            {
                MessageBox.Show("Please select a valid photo image first.", "Notice", MessageBoxButton.OK, MessageBoxImage.Warning);
                return;
            }

            int.TryParse(TxtDeskPhotoCopies.Text.Trim(), out var copies);
            copies = Math.Max(1, copies);

            var paperType = RadioPhotoA4.IsChecked == true ? "PHOTO_A4" : "PHOTO_4X6";
            var colorMode = RadioPhotoColor.IsChecked == true ? "COLOR" : "BW";

            var order = new BackendOrderDto
            {
                Id = "desk-preview",
                OrderNumber = "DESK-PHOTO",
                ServiceType = "PHOTO",
                LocalFilePath = path,
                OriginalFileName = Path.GetFileName(path),
                TotalPages = 1,
                Copies = copies,
                PaperType = paperType,
                ColorMode = colorMode,
                PrintSettings = new PrintJobOptions
                {
                    PaperType = paperType,
                    EnableBorder = RadioDeskPhotoWithBorder.IsChecked == true
                }
            };

            var win = new PrintSettingsWindow(order, _backendSync, _deviceManager) { Owner = this };
            if (win.ShowDialog() == true && win.ShouldPrintImmediately)
            {
                BtnPrintDeskPhoto_Click(sender, e);
            }
        }

        private void BtnPrintDeskPhoto_Click(object sender, RoutedEventArgs e)
        {
            var path = TxtDeskPhotoPath.Text.Trim();
            if (string.IsNullOrEmpty(path) || !File.Exists(path))
            {
                MessageBox.Show("Please select a valid photo image.", "Notice", MessageBoxButton.OK, MessageBoxImage.Warning);
                return;
            }

            int.TryParse(TxtDeskPhotoCopies.Text.Trim(), out var copies);
            copies = Math.Max(1, copies);

            var paperType = RadioPhoto4x6.IsChecked == true ? "PHOTO_4X6" : "PHOTO_A4";
            var colorMode = RadioPhotoColor.IsChecked == true ? "COLOR" : "BW";
            var enableBorder = RadioDeskPhotoWithBorder.IsChecked == true;
            var printer = _deviceManager.ActivePrinter?.Name ?? "HP Smart Tank 580-590 series";

            var destPath = Path.Combine(_userUploadsDir, $"{DateTime.Now:yyyyMMdd_HHmmss}_{Path.GetFileName(path)}");
            File.Copy(path, destPath, true);
            LoggingManager.Info($"[DeskService] Photo archived to RAW_Inputs: {destPath}");

            for (int c = 1; c <= copies; c++)
            {
                PhotoProcessor.PrintPhoto(destPath, printer, paperType, colorMode, "FIT", $"DeskPhoto_c{c}", 100.0, "PORTRAIT", enableBorder);
            }

            MessageBox.Show($"Clean photo print submitted to '{printer}' on {paperType} paper!", "Photo Spooled", MessageBoxButton.OK, MessageBoxImage.Information);
        }

        // ==========================================
        // DESK PASSPORT SIZE PHOTOS (8-UP ON 4X6)
        // ==========================================
        private void BtnBrowseDeskPassport_Click(object sender, RoutedEventArgs e)
        {
            var dlg = new OpenFileDialog
            {
                Filter = "Photo Images (*.jpg;*.jpeg;*.png)|*.jpg;*.jpeg;*.png|All Files (*.*)|*.*",
                Title = "Select Portrait Photo for 8 Passport Copies"
            };
            if (dlg.ShowDialog() == true)
            {
                try
                {
                    var cropWin = new DeskPhotoCropWindow(dlg.FileName, DeskPhotoCropMode.PASSPORT, _userUploadsDir) { Owner = this };
                    if (cropWin.ShowDialog() == true && !string.IsNullOrEmpty(cropWin.ResultFilePath))
                    {
                        TxtDeskPassportPath.Text = dlg.FileName;
                        _deskPassportSheetPath = cropWin.ResultFilePath;

                        var bi = new BitmapImage();
                        bi.BeginInit();
                        bi.CacheOption = BitmapCacheOption.OnLoad;
                        bi.CreateOptions = BitmapCreateOptions.IgnoreImageCache;
                        bi.UriSource = new Uri(_deskPassportSheetPath);
                        bi.EndInit();

                        ImgDeskPassportPreview.Source = bi;
                        TxtDeskPassportEmpty.Visibility = Visibility.Collapsed;
                        LoggingManager.Info($"[DeskPassport] Generated calibrated 8-Up passport sheet from crop: {_deskPassportSheetPath}");
                    }
                }
                catch (Exception ex)
                {
                    MessageBox.Show($"Could not generate passport sheet: {ex.Message}", "Passport Error", MessageBoxButton.OK, MessageBoxImage.Error);
                }
            }
        }

        private void BtnDeskPassportSettings_Click(object sender, RoutedEventArgs e)
        {
            if (string.IsNullOrEmpty(_deskPassportSheetPath) || !File.Exists(_deskPassportSheetPath))
            {
                MessageBox.Show("Please browse and select a photo first to generate the 8-Up passport sheet.", "Notice", MessageBoxButton.OK, MessageBoxImage.Warning);
                return;
            }

            var order = new BackendOrderDto
            {
                Id = "desk-preview",
                OrderNumber = "DESK-PASSPORT",
                ServiceType = "PASSPORT",
                LocalFilePath = _deskPassportSheetPath,
                OriginalFileName = Path.GetFileName(_deskPassportSheetPath),
                TotalPages = 1,
                Copies = 1,
                PaperType = "PHOTO_4X6",
                ColorMode = "COLOR"
            };

            var win = new PrintSettingsWindow(order, _backendSync, _deviceManager) { Owner = this };
            if (win.ShowDialog() == true && win.ShouldPrintImmediately)
            {
                BtnPrintDeskPassport_Click(sender, e);
            }
        }

        private void BtnPrintDeskPassport_Click(object sender, RoutedEventArgs e)
        {
            if (string.IsNullOrEmpty(_deskPassportSheetPath) || !File.Exists(_deskPassportSheetPath))
            {
                MessageBox.Show("Please select a photo first to generate the 8-Up passport sheet.", "Notice", MessageBoxButton.OK, MessageBoxImage.Warning);
                return;
            }

            var printer = _deviceManager.ActivePrinter?.Name ?? "HP Smart Tank 580-590 series";
            PhotoProcessor.PrintPhoto(
                _deskPassportSheetPath,
                printer,
                "PHOTO_4X6",
                "COLOR",
                "FIT",
                "DeskPassport8_Print",
                100.0,
                "LANDSCAPE",
                false
            );

            MessageBox.Show($"8 Passport photos spooled to '{printer}' on 4×6 HP Glossy Paper with verified calibration!", "Print Dispatched", MessageBoxButton.OK, MessageBoxImage.Information);
        }

        // ==========================================
        // TAB 3: HP FLATBED SCANNER CONSOLE
        // ==========================================
        private void BtnAcquireRealScan_Click(object sender, RoutedEventArgs e)
        {
            try
            {
                int dpi = 300;
                if (RadioScan150.IsChecked == true) dpi = 150;
                else if (RadioScan600.IsChecked == true) dpi = 600;
                else if (RadioScan1200.IsChecked == true) dpi = 1200;

                var colorMode = RadioScanGrayscale.IsChecked == true ? "GRAYSCALE" : "COLOR";

                var scanParams = new ScanParameters
                {
                    Dpi = dpi,
                    ColorMode = colorMode,
                    Format = "JPEG"
                };

                BtnAcquireRealScan.IsEnabled = false;
                BtnAcquireRealScan.Content = "⏳ Scanning Physical Glass...";
                TxtScanProgress.Text = $"● Scanning page {_sessionScannedPages.Count + 1} on glass ({dpi} DPI)...";

                var pageNum = _sessionScannedPages.Count + 1;
                var scanFilePath = _scanManager.AcquireFlatbedScan(scanParams, pageNum);

                _sessionScannedPages.Add(scanFilePath);

                var bi = new BitmapImage();
                bi.BeginInit();
                bi.CacheOption = BitmapCacheOption.OnLoad;
                bi.UriSource = new Uri(scanFilePath);
                bi.EndInit();

                _scannedGalleryItems.Add(new ScannedPageItem
                {
                    FilePath = scanFilePath,
                    PageNumber = pageNum,
                    Thumbnail = bi
                });

                ImgScanPreview.Source = bi;
                TxtScanFileSaved.Text = $"Saved: {Path.GetFileName(scanFilePath)} ({new FileInfo(scanFilePath).Length / 1024} KB)";
                TxtSessionPageCount.Text = $"Current Batch: {_sessionScannedPages.Count} page(s) scanned";
                TxtScanProgress.Text = $"● Ready — Page {pageNum} captured successfully!";

                MessageBox.Show($"Physical scan captured cleanly!\n\nSaved to RAW_Inputs/Scans:\n{scanFilePath}", "Scan Complete", MessageBoxButton.OK, MessageBoxImage.Information);
            }
            catch (Exception ex)
            {
                TxtScanProgress.Text = "● Scanner Error";
                MessageBox.Show($"Scanner error: {ex.Message}\n\nEnsure HP Smart Tank 589 is powered on and scanner glass lid is closed.", "Scanner Error", MessageBoxButton.OK, MessageBoxImage.Error);
            }
            finally
            {
                BtnAcquireRealScan.IsEnabled = true;
                BtnAcquireRealScan.Content = "🔍 Scan Page on Glass (Add to Batch)";
            }
        }

        private void BtnContinueScan_Click(object sender, RoutedEventArgs e)
        {
            BtnAcquireRealScan_Click(sender, e);
        }

        private void BtnNewScanBatch_Click(object sender, RoutedEventArgs e)
        {
            if (_sessionScannedPages.Count > 0)
            {
                var res = MessageBox.Show("Start a new scan batch? Previous scanned pages remain saved in RAW_Inputs/Scans.", "New Batch", MessageBoxButton.YesNo, MessageBoxImage.Question);
                if (res != MessageBoxResult.Yes) return;
            }

            _sessionScannedPages.Clear();
            _scannedGalleryItems.Clear();
            ImgScanPreview.Source = null;
            TxtSessionPageCount.Text = "Current Batch: 0 page(s) scanned";
            TxtScanProgress.Text = "● Scanner Ready";
            TxtScanFileSaved.Text = "New batch ready";
        }

        private void ListScannedPages_SelectionChanged(object sender, SelectionChangedEventArgs e)
        {
            if (ListScannedPages.SelectedItem is ScannedPageItem item && File.Exists(item.FilePath))
            {
                var bi = new BitmapImage();
                bi.BeginInit();
                bi.CacheOption = BitmapCacheOption.OnLoad;
                bi.UriSource = new Uri(item.FilePath);
                bi.EndInit();
                ImgScanPreview.Source = bi;
                TxtScanFileSaved.Text = $"Selected: {Path.GetFileName(item.FilePath)}";
            }
        }

        private void BtnPageMoveUp_Click(object sender, RoutedEventArgs e)
        {
            if (sender is Button btn && btn.Tag is ScannedPageItem item)
            {
                int idx = _scannedGalleryItems.IndexOf(item);
                if (idx > 0)
                {
                    _scannedGalleryItems.Move(idx, idx - 1);
                    var p = _sessionScannedPages[idx];
                    _sessionScannedPages.RemoveAt(idx);
                    _sessionScannedPages.Insert(idx - 1, p);
                    RenumberScannedPages();
                }
            }
        }

        private void BtnPageMoveDown_Click(object sender, RoutedEventArgs e)
        {
            if (sender is Button btn && btn.Tag is ScannedPageItem item)
            {
                int idx = _scannedGalleryItems.IndexOf(item);
                if (idx >= 0 && idx < _scannedGalleryItems.Count - 1)
                {
                    _scannedGalleryItems.Move(idx, idx + 1);
                    var p = _sessionScannedPages[idx];
                    _sessionScannedPages.RemoveAt(idx);
                    _sessionScannedPages.Insert(idx + 1, p);
                    RenumberScannedPages();
                }
            }
        }

        private void BtnPageRotate_Click(object sender, RoutedEventArgs e)
        {
            if (sender is Button btn && btn.Tag is ScannedPageItem item && File.Exists(item.FilePath))
            {
                try
                {
                    byte[] bytes = File.ReadAllBytes(item.FilePath);
                    using var inMs = new MemoryStream(bytes);
                    using var img = System.Drawing.Image.FromStream(inMs);
                    img.RotateFlip(System.Drawing.RotateFlipType.Rotate90FlipNone);

                    using var outMs = new MemoryStream();
                    img.Save(outMs, System.Drawing.Imaging.ImageFormat.Jpeg);
                    byte[] newBytes = outMs.ToArray();
                    File.WriteAllBytes(item.FilePath, newBytes);

                    var bi = new BitmapImage();
                    bi.BeginInit();
                    bi.CacheOption = BitmapCacheOption.OnLoad;
                    bi.CreateOptions = BitmapCreateOptions.IgnoreImageCache;
                    bi.StreamSource = new MemoryStream(newBytes);
                    bi.EndInit();

                    item.Thumbnail = bi;
                    ImgScanPreview.Source = bi;
                    int idx = _scannedGalleryItems.IndexOf(item);
                    if (idx >= 0)
                    {
                        _scannedGalleryItems[idx] = new ScannedPageItem
                        {
                            FilePath = item.FilePath,
                            PageNumber = item.PageNumber,
                            Thumbnail = bi
                        };
                    }
                }
                catch (Exception ex)
                {
                    MessageBox.Show($"Could not rotate image: {ex.Message}", "Rotate Error", MessageBoxButton.OK, MessageBoxImage.Warning);
                }
            }
        }

        private void BtnPageEdit_Click(object sender, RoutedEventArgs e)
        {
            if (sender is Button btn && btn.Tag is ScannedPageItem item && File.Exists(item.FilePath))
            {
                OpenScannedPageEditor(item);
            }
        }

        private void BtnOpenActiveInEditor_Click(object sender, RoutedEventArgs e)
        {
            if (ListScannedPages.SelectedItem is ScannedPageItem item && File.Exists(item.FilePath))
            {
                OpenScannedPageEditor(item);
            }
            else if (_scannedGalleryItems.Count > 0)
            {
                OpenScannedPageEditor(_scannedGalleryItems[0]);
            }
            else
            {
                MessageBox.Show("No scanned page available to edit. Please scan a document first.", "Notice", MessageBoxButton.OK, MessageBoxImage.Information);
            }
        }

        private void OpenScannedPageEditor(ScannedPageItem item)
        {
            var win = new ScannedImageEditorWindow(item.FilePath, item.PageNumber) { Owner = this };
            if (win.ShowDialog() == true && win.ChangesSaved)
            {
                byte[] bytes = File.ReadAllBytes(item.FilePath);
                var bi = new BitmapImage();
                bi.BeginInit();
                bi.CacheOption = BitmapCacheOption.OnLoad;
                bi.CreateOptions = BitmapCreateOptions.IgnoreImageCache;
                bi.StreamSource = new MemoryStream(bytes);
                bi.EndInit();

                item.Thumbnail = bi;
                ImgScanPreview.Source = bi;
                int idx = _scannedGalleryItems.IndexOf(item);
                if (idx >= 0)
                {
                    _scannedGalleryItems[idx] = new ScannedPageItem
                    {
                        FilePath = item.FilePath,
                        PageNumber = item.PageNumber,
                        Thumbnail = bi
                    };
                }
            }
        }

        private void BtnPageDelete_Click(object sender, RoutedEventArgs e)
        {
            if (sender is Button btn && btn.Tag is ScannedPageItem item)
            {
                int idx = _scannedGalleryItems.IndexOf(item);
                if (idx >= 0)
                {
                    _scannedGalleryItems.RemoveAt(idx);
                    _sessionScannedPages.RemoveAt(idx);
                    RenumberScannedPages();
                    TxtSessionPageCount.Text = $"Current Batch: {_sessionScannedPages.Count} page(s) scanned";
                    if (_scannedGalleryItems.Count > 0)
                    {
                        ListScannedPages.SelectedIndex = Math.Min(idx, _scannedGalleryItems.Count - 1);
                    }
                    else
                    {
                        ImgScanPreview.Source = null;
                        TxtScanFileSaved.Text = "No scanned pages in batch";
                    }
                }
            }
        }

        private void RenumberScannedPages()
        {
            for (int i = 0; i < _scannedGalleryItems.Count; i++)
            {
                _scannedGalleryItems[i].PageNumber = i + 1;
            }
        }

        private void BtnSavePdf_Click(object sender, RoutedEventArgs e)
        {
            if (_sessionScannedPages.Count == 0)
            {
                MessageBox.Show("No scanned pages in current batch to save.", "Notice", MessageBoxButton.OK, MessageBoxImage.Warning);
                return;
            }

            var prefix = $"Scan_{DateTime.Now:yyyyMMdd_HHmmss}";
            if (RadioIndividualPdfs?.IsChecked == true)
            {
                var files = _scanManager.CompileIndividualPdfs(_sessionScannedPages, prefix);
                MessageBox.Show($"Saved {files.Count} individual PDF files to RAW_Inputs/Scans:\n{string.Join("\n", files.Take(3))}...", "PDFs Exported", MessageBoxButton.OK, MessageBoxImage.Information);
            }
            else
            {
                var pdfPath = _scanManager.CompileScannedPdf(_sessionScannedPages, prefix);
                MessageBox.Show($"Merged {_sessionScannedPages.Count} pages into single PDF document:\n{pdfPath}", "PDF Assembled", MessageBoxButton.OK, MessageBoxImage.Information);
            }
        }

        private void BtnSavePng_Click(object sender, RoutedEventArgs e)
        {
            if (_sessionScannedPages.Count == 0)
            {
                MessageBox.Show("No scanned pages in current batch to export.", "Notice", MessageBoxButton.OK, MessageBoxImage.Warning);
                return;
            }

            var prefix = $"Scan_{DateTime.Now:yyyyMMdd_HHmmss}";
            var files = _scanManager.SaveAllAsPng(_sessionScannedPages, prefix);
            MessageBox.Show($"Exported {files.Count} page(s) as PNG into RAW_Inputs/Scans!", "PNG Exported", MessageBoxButton.OK, MessageBoxImage.Information);
        }

        private void BtnSaveJpeg_Click(object sender, RoutedEventArgs e)
        {
            if (_sessionScannedPages.Count == 0)
            {
                MessageBox.Show("No scanned pages in current batch to export.", "Notice", MessageBoxButton.OK, MessageBoxImage.Warning);
                return;
            }

            var prefix = $"Scan_{DateTime.Now:yyyyMMdd_HHmmss}";
            var files = _scanManager.SaveAllAsJpeg(_sessionScannedPages, prefix);
            MessageBox.Show($"Exported {files.Count} page(s) as JPEG into RAW_Inputs/Scans!", "JPEG Exported", MessageBoxButton.OK, MessageBoxImage.Information);
        }

        // ==========================================
        // TAB 5: PRICING & SHOP RATES
        // ==========================================
        private async void LoadPricingAsync()
        {
            try
            {
                var p = await _backendSync.FetchPricingAsync();
                if (p != null)
                {
                    Dispatcher.Invoke(() =>
                    {
                        TxtPriceA4BwSingle.Text = p.A4BwSingleSideRate.ToString("F2");
                        TxtPriceA4BwDuplex.Text = p.A4BwDoubleSideRate.ToString("F2");
                        TxtPriceA4ColorSingle.Text = p.A4ColorSingleSideRate.ToString("F2");
                        TxtPriceA4ColorDuplex.Text = p.A4ColorDoubleSideRate.ToString("F2");
                        TxtPricePhoto4x6.Text = p.Photo4x6Rate.ToString("F2");
                        TxtPricePhotoA4.Text = p.PhotoA4Rate.ToString("F2");
                        TxtPriceScanPage.Text = p.ScanPerPageRate.ToString("F2");
                    });
                }
            }
            catch (Exception ex)
            {
                LoggingManager.Warn($"[MainWindow] Could not load pricing: {ex.Message}");
            }
        }

        private async void BtnSavePricing_Click(object sender, RoutedEventArgs e)
        {
            try
            {
                decimal.TryParse(TxtPriceA4BwSingle.Text.Trim(), out var a4BwSingle);
                decimal.TryParse(TxtPriceA4BwDuplex.Text.Trim(), out var a4BwDuplex);
                decimal.TryParse(TxtPriceA4ColorSingle.Text.Trim(), out var a4ColorSingle);
                decimal.TryParse(TxtPriceA4ColorDuplex.Text.Trim(), out var a4ColorDuplex);
                decimal.TryParse(TxtPricePhoto4x6.Text.Trim(), out var photo4x6);
                decimal.TryParse(TxtPricePhotoA4.Text.Trim(), out var photoA4);
                decimal.TryParse(TxtPriceScanPage.Text.Trim(), out var scanPage);

                var dto = new ShopPricingDto
                {
                    A4BwSingleSideRate = a4BwSingle,
                    A4BwDoubleSideRate = a4BwDuplex,
                    A4ColorSingleSideRate = a4ColorSingle,
                    A4ColorDoubleSideRate = a4ColorDuplex,
                    Photo4x6Rate = photo4x6,
                    PhotoA4Rate = photoA4,
                    ScanPerPageRate = scanPage
                };

                await _backendSync.SavePricingAsync(dto);
                MessageBox.Show("Pricing configuration saved and synchronized with server!", "Pricing Updated", MessageBoxButton.OK, MessageBoxImage.Information);
            }
            catch (Exception ex)
            {
                MessageBox.Show($"Failed to save pricing: {ex.Message}", "Error", MessageBoxButton.OK, MessageBoxImage.Error);
            }
        }

        private void BtnReloadPricing_Click(object sender, RoutedEventArgs e)
        {
            LoadPricingAsync();
        }

        // ==========================================
        // FOLDER & HARDWARE SHORTCUTS
        // ==========================================
        private void BtnOpenRawInputs_Click(object sender, RoutedEventArgs e)
        {
            if (Directory.Exists(_rawInputsDir))
                Process.Start("explorer.exe", _rawInputsDir);
        }

        private void BtnOpenUserUploadsFolder_Click(object sender, RoutedEventArgs e)
        {
            if (Directory.Exists(_userUploadsDir))
                Process.Start("explorer.exe", _userUploadsDir);
        }

        private void BtnOpenScansFolder_Click(object sender, RoutedEventArgs e)
        {
            if (Directory.Exists(_scansDir))
                Process.Start("explorer.exe", _scansDir);
        }

        private void BtnSwitchUsb_Click(object sender, RoutedEventArgs e)
        {
            _deviceManager.SwitchToUsb();
        }

        private void BtnSwitchWifi_Click(object sender, RoutedEventArgs e)
        {
            _deviceManager.SwitchToWifi();
        }

        private void BtnTestPrintA4_Click(object sender, RoutedEventArgs e)
        {
            var printer = _deviceManager.ActivePrinter?.Name ?? "HP Smart Tank 580-590 series";
            var tempDir = Path.Combine(_rawInputsDir, "User_Uploads");
            var testPdf = CalibrationSheetGenerator.GenerateCalibrationTestSheet(tempDir);
            PhotoProcessor.PrintPdfDocument(testPdf, printer, "A4_Hardware_Test_Page");
            MessageBox.Show($"Sent A4 hardware diagnostic test page to '{printer}'.", "Test Print Spooled", MessageBoxButton.OK, MessageBoxImage.Information);
        }

        public void PrintCalibrationSheet()
        {
            var tempDir = Path.Combine(_rawInputsDir, "User_Uploads");
            var testPdf = CalibrationSheetGenerator.GenerateCalibrationTestSheet(tempDir);
            var printer = _deviceManager.ActivePrinter?.Name ?? "HP Smart Tank 580-590 series";
            PhotoProcessor.PrintPdfDocument(testPdf, printer, "DuplexCalibrationSheet");
            MessageBox.Show($"Calibration sheet sent to '{printer}'. Check FRONT TOP vs BACK TOP alignment.", "Calibration Spooled", MessageBoxButton.OK, MessageBoxImage.Information);
        }

        private void BtnPrintCalibration_Click(object sender, RoutedEventArgs e) => PrintCalibrationSheet();

        public void OpenSetupWizard()
        {
            var wizard = new SetupWizardWindow(_deviceManager, _duplexProcessor, _scanManager);
            wizard.Owner = this;
            wizard.ShowDialog();
        }

        private void BtnSetupWizard_Click(object sender, RoutedEventArgs e) => OpenSetupWizard();

        protected override void OnClosing(System.ComponentModel.CancelEventArgs e)
        {
            // Minimize to tray instead of quitting
            e.Cancel = true;
            Hide();
        }
    }
}
