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
using OpenFileDialog = Microsoft.Win32.OpenFileDialog;

namespace SmartXeroxHub.Agent
{
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

            Loaded += async (s, e) =>
            {
                ListPrinters.ItemsSource = _deviceManager.DiscoveredPrinters;
                await RefreshOrdersAsync();
                LoadPricingAsync();
            };
        }

        private void OnLogMessageReceived(string message)
        {
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

            // Sorting
            var sortIdx = ComboSortBy?.SelectedIndex ?? 0;
            filtered = sortIdx switch
            {
                0 => filtered.OrderByDescending(o => o.CreatedAt), // Newest First
                1 => filtered.OrderBy(o => o.CreatedAt),           // Oldest First
                2 => filtered.OrderBy(o => o.Status == "COMPLETED" || o.Status == "DOWNLOAD_AVAILABLE" ? 1 : 0).ThenByDescending(o => o.CreatedAt), // Pending First
                3 => filtered.OrderByDescending(o => o.CalculatedPrice), // Price High to Low
                4 => filtered.OrderBy(o => o.CalculatedPrice),           // Price Low to High
                _ => filtered.OrderByDescending(o => o.CreatedAt)
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
                    // "📑 Approve & Duplex"
                    OpenDuplexWizard(order);
                    return;
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
                            PhotoProcessor.PrintPhoto(localFile, printerName, order.PaperType, order.ColorMode, "FIT", order.OrderNumber);
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

            // Archive to RAW_Inputs/User_Uploads
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

            // Sync with backend queue
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
                TxtDeskPhotoPath.Text = dlg.FileName;
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
            var printer = _deviceManager.ActivePrinter?.Name ?? "HP Smart Tank 580-590 series";

            // Archive to RAW_Inputs/User_Uploads
            var destPath = Path.Combine(_userUploadsDir, $"{DateTime.Now:yyyyMMdd_HHmmss}_{Path.GetFileName(path)}");
            File.Copy(path, destPath, true);
            LoggingManager.Info($"[DeskService] Photo archived to RAW_Inputs: {destPath}");

            for (int c = 1; c <= copies; c++)
            {
                PhotoProcessor.PrintPhoto(destPath, printer, paperType, colorMode, "FIT", $"DeskPhoto_c{c}");
            }

            MessageBox.Show($"Clean photo print submitted to '{printer}' on {paperType} paper!", "Photo Spooled", MessageBoxButton.OK, MessageBoxImage.Information);
        }

        // ==========================================
        // TAB 3: PRICING & SHOP RATES
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
            decimal.TryParse(TxtPriceA4BwSingle.Text, out var bw);
            decimal.TryParse(TxtPriceA4BwDuplex.Text, out var bwd);
            decimal.TryParse(TxtPriceA4ColorSingle.Text, out var col);
            decimal.TryParse(TxtPriceA4ColorDuplex.Text, out var cold);
            decimal.TryParse(TxtPricePhoto4x6.Text, out var p46);
            decimal.TryParse(TxtPricePhotoA4.Text, out var pa4);
            decimal.TryParse(TxtPriceScanPage.Text, out var scn);

            var dto = new ShopPricingDto
            {
                A4BwSingleSideRate = bw > 0 ? bw : 2.0m,
                A4BwDoubleSideRate = bwd > 0 ? bwd : 3.0m,
                A4ColorSingleSideRate = col > 0 ? col : 10.0m,
                A4ColorDoubleSideRate = cold > 0 ? cold : 18.0m,
                Photo4x6Rate = p46 > 0 ? p46 : 20.0m,
                PhotoA4Rate = pa4 > 0 ? pa4 : 40.0m,
                ScanPerPageRate = scn > 0 ? scn : 10.0m
            };

            var ok = await _backendSync.SavePricingAsync(dto);
            if (ok)
            {
                MessageBox.Show("Shop pricing rates successfully saved and synchronized across the Web Admin and Customer portals!", "Pricing Saved", MessageBoxButton.OK, MessageBoxImage.Information);
            }
            else
            {
                MessageBox.Show("Could not save pricing to backend server. Make sure backend is running.", "Save Error", MessageBoxButton.OK, MessageBoxImage.Error);
            }
        }

        private void BtnReloadPricing_Click(object sender, RoutedEventArgs e)
        {
            LoadPricingAsync();
        }

        // ==========================================
        // TAB 4: HP FLATBED SCANNER CONSOLE
        // ==========================================
        private void BtnAcquireRealScan_Click(object sender, RoutedEventArgs e)
        {
            try
            {
                var dpi = RadioScan600.IsChecked == true ? 600 : 300;
                var colorMode = RadioScanGrayscale.IsChecked == true ? "GRAYSCALE" : "COLOR";

                var scanParams = new ScanParameters
                {
                    Dpi = dpi,
                    ColorMode = colorMode,
                    Format = "JPEG"
                };

                BtnAcquireRealScan.IsEnabled = false;
                BtnAcquireRealScan.Content = "⏳ Scanning Physical Glass...";

                var pageNum = _sessionScannedPages.Count + 1;
                var scanFilePath = _scanManager.AcquireFlatbedScan(scanParams, pageNum);

                _sessionScannedPages.Add(scanFilePath);

                // Show real image preview without any watermark
                var bi = new BitmapImage();
                bi.BeginInit();
                bi.CacheOption = BitmapCacheOption.OnLoad;
                bi.UriSource = new Uri(scanFilePath);
                bi.EndInit();

                ImgScanPreview.Source = bi;
                TxtScanFileSaved.Text = $"Saved to: {Path.GetFileName(scanFilePath)} ({new FileInfo(scanFilePath).Length / 1024} KB)";

                MessageBox.Show($"Physical scan captured cleanly!\n\nSaved to RAW_Inputs/Scans:\n{scanFilePath}", "Scan Complete", MessageBoxButton.OK, MessageBoxImage.Information);
            }
            catch (Exception ex)
            {
                MessageBox.Show($"Scanner error: {ex.Message}\n\nEnsure HP Smart Tank 589 is powered on and scanner glass lid is closed.", "Scanner Error", MessageBoxButton.OK, MessageBoxImage.Error);
            }
            finally
            {
                BtnAcquireRealScan.IsEnabled = true;
                BtnAcquireRealScan.Content = "🔍 Scan Page on Glass (No Watermark)";
            }
        }

        private void BtnMergeScanPdf_Click(object sender, RoutedEventArgs e)
        {
            if (_sessionScannedPages.Count == 0)
            {
                MessageBox.Show("No scanned pages in current session to merge.", "Notice", MessageBoxButton.OK, MessageBoxImage.Warning);
                return;
            }

            var orderNum = $"Scan_{DateTime.Now:yyyyMMdd_HHmmss}";
            var pdfPath = _scanManager.CompileScannedPdf(_sessionScannedPages, orderNum);

            MessageBox.Show($"Merged {_sessionScannedPages.Count} pages into single PDF document:\n{pdfPath}", "PDF Assembled", MessageBoxButton.OK, MessageBoxImage.Information);
            _sessionScannedPages.Clear();
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
