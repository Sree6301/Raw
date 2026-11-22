using System;
using System.Drawing;
using System.Windows;
using System.Windows.Forms;
using SmartXeroxHub.Agent.Core;
using Application = System.Windows.Application;

namespace SmartXeroxHub.Agent
{
    public partial class App : Application
    {
        private NotifyIcon? _notifyIcon;
        private DeviceManager? _deviceManager;
        private DuplexProcessor? _duplexProcessor;
        private ScanManager? _scanManager;
        private RecoveryManager? _recoveryManager;
        private BackendSync? _backendSync;
        private MainWindow? _mainWindow;

        private void Application_Startup(object sender, StartupEventArgs e)
        {
            AppDomain.CurrentDomain.UnhandledException += (s, args) =>
            {
                LoggingManager.Error("CRITICAL UNHANDLED APPDOMAIN EXCEPTION", args.ExceptionObject as Exception);
            };

            DispatcherUnhandledException += (s, args) =>
            {
                LoggingManager.Error("CRITICAL DISPATCHER EXCEPTION", args.Exception);
                System.Windows.MessageBox.Show($"Application Error: {args.Exception.Message}\n\nStack:\n{args.Exception.StackTrace}", "Smart Xerox Hub Startup Error", MessageBoxButton.OK, MessageBoxImage.Error);
                args.Handled = true;
            };

            LoggingManager.Info("=== SMART XEROX HUB WINDOWS AGENT STARTING ===");

            try
            {
                _deviceManager = new DeviceManager();
                _deviceManager.EnumeratePrinters();

                _duplexProcessor = new DuplexProcessor();
                _scanManager = new ScanManager();
                _recoveryManager = new RecoveryManager();

                _backendSync = new BackendSync(_deviceManager, _duplexProcessor, _scanManager, _recoveryManager);
                _backendSync.Start();

                // Create System Tray NotifyIcon
                SetupSystemTray();

                // Initialize and show main window
                LoggingManager.Info("Initializing MainWindow...");
                _mainWindow = new MainWindow(_deviceManager, _duplexProcessor, _scanManager, _recoveryManager, _backendSync);
                _mainWindow.Show();
                LoggingManager.Info("MainWindow shown successfully!");
            }
            catch (Exception ex)
            {
                LoggingManager.Error("FATAL EXCEPTION in Application_Startup", ex);
                System.Windows.MessageBox.Show($"Failed to start Smart Xerox Hub:\n\n{ex.Message}\n\nDetails in logs:\n{ex}", "Startup Error", MessageBoxButton.OK, MessageBoxImage.Error);
            }
        }

        private void SetupSystemTray()
        {
            _notifyIcon = new NotifyIcon
            {
                Icon = SystemIcons.Application,
                Visible = true,
                Text = "Smart Xerox Hub - HP Smart Tank 589 Agent"
            };

            var contextMenu = new ContextMenuStrip();
            contextMenu.Items.Add("Open Console", null, (s, e) => ShowMainWindow());
            contextMenu.Items.Add("Run Hardware Setup Wizard", null, (s, e) => _mainWindow?.OpenSetupWizard());
            contextMenu.Items.Add(new ToolStripSeparator());
            contextMenu.Items.Add("Switch Active to USB (USB001)", null, (s, e) => _deviceManager?.SwitchToUsb());
            contextMenu.Items.Add("Switch Active to Wi-Fi (WSD)", null, (s, e) => _deviceManager?.SwitchToWifi());
            contextMenu.Items.Add(new ToolStripSeparator());
            contextMenu.Items.Add("Print Duplex Calibration Sheet", null, (s, e) => _mainWindow?.PrintCalibrationSheet());
            contextMenu.Items.Add("Exit Agent", null, (s, e) => Shutdown());

            _notifyIcon.ContextMenuStrip = contextMenu;
            _notifyIcon.DoubleClick += (s, e) => ShowMainWindow();
        }

        private void ShowMainWindow()
        {
            if (_mainWindow != null)
            {
                _mainWindow.Show();
                _mainWindow.WindowState = WindowState.Normal;
                _mainWindow.Activate();
            }
        }

        private void Application_Exit(object sender, ExitEventArgs e)
        {
            LoggingManager.Info("=== SMART XEROX HUB WINDOWS AGENT STOPPING ===");
            _backendSync?.Stop();
            if (_notifyIcon != null)
            {
                _notifyIcon.Visible = false;
                _notifyIcon.Dispose();
            }
        }
    }
}
