using System;
using System.Collections.Generic;
using System.Management;
using System.Printing;

namespace SmartXeroxHub.Agent.Core
{
    public class DiscoveredPrinter
    {
        public string Name { get; set; } = string.Empty;
        public string DriverName { get; set; } = string.Empty;
        public string PortName { get; set; } = string.Empty;
        public string ConnectionType { get; set; } = "UNKNOWN"; // USB or WIFI
        public bool IsDefault { get; set; }
        public bool IsOnline { get; set; }
        public bool IsHpSmartTank { get; set; }
        public string StatusDescription { get; set; } = "Ready";
    }

    public class DeviceManager
    {
        public List<DiscoveredPrinter> DiscoveredPrinters { get; private set; } = new();
        public DiscoveredPrinter? ActivePrinter { get; private set; }

        public event Action<List<DiscoveredPrinter>>? PrintersDiscovered;
        public event Action<DiscoveredPrinter?>? ActivePrinterChanged;

        public void EnumeratePrinters()
        {
            var list = new List<DiscoveredPrinter>();

            try
            {
                using var searcher = new ManagementObjectSearcher("SELECT * FROM Win32_Printer");
                foreach (ManagementObject printer in searcher.Get())
                {
                    var name = printer["Name"]?.ToString() ?? "";
                    var driver = printer["DriverName"]?.ToString() ?? "";
                    var port = printer["PortName"]?.ToString() ?? "";
                    var isDefault = Convert.ToBoolean(printer["Default"] ?? false);
                    var workOffline = Convert.ToBoolean(printer["WorkOffline"] ?? false);
                    var printerStatus = Convert.ToUInt32(printer["PrinterStatus"] ?? 3); // 3 = Idle/Ready

                    var isUsb = port.StartsWith("USB", StringComparison.OrdinalIgnoreCase);
                    var isWsdOrNetwork = port.StartsWith("WSD", StringComparison.OrdinalIgnoreCase) ||
                                         port.StartsWith("IP_", StringComparison.OrdinalIgnoreCase) ||
                                         port.Contains("192.") || port.Contains("10.");

                    var isHp = name.Contains("HP", StringComparison.OrdinalIgnoreCase) ||
                               driver.Contains("HP", StringComparison.OrdinalIgnoreCase) ||
                               name.Contains("Smart Tank", StringComparison.OrdinalIgnoreCase);

                    var device = new DiscoveredPrinter
                    {
                        Name = name,
                        DriverName = driver,
                        PortName = port,
                        ConnectionType = isUsb ? "USB" : (isWsdOrNetwork ? "WIFI" : "OTHER"),
                        IsDefault = isDefault,
                        IsOnline = !workOffline,
                        IsHpSmartTank = isHp,
                        StatusDescription = workOffline ? "Offline" : "Online"
                    };

                    list.Add(device);
                }
            }
            catch (Exception ex)
            {
                LoggingManager.Error("Error enumerating printers via WMI", ex);
            }

            DiscoveredPrinters = list;
            PrintersDiscovered?.Invoke(list);

            // Resolution logic: Prefer HP Smart Tank connected over USB
            ResolveActivePrinter();
        }

        private readonly System.Timers.Timer _monitorTimer = new(5000);

        public DeviceManager()
        {
            _monitorTimer.Elapsed += (s, e) =>
            {
                try
                {
                    EnumeratePrinters();
                }
                catch { }
            };
            _monitorTimer.AutoReset = true;
            _monitorTimer.Start();
        }

        private void ResolveActivePrinter()
        {
            // 1. First Preference: HP Smart Tank connected over USB
            var hpUsb = DiscoveredPrinters.Find(p => p.IsHpSmartTank && p.ConnectionType == "USB");
            if (hpUsb != null && hpUsb.IsOnline)
            {
                if (ActivePrinter?.Name != hpUsb.Name || ActivePrinter?.PortName != hpUsb.PortName)
                {
                    SetActivePrinter(hpUsb);
                    LoggingManager.Info($"[DeviceManager] Selected primary USB printer: {hpUsb.Name} on {hpUsb.PortName} (ONLINE)");
                }
                return;
            }

            // 2. Second Preference: HP Smart Tank connected over Wi-Fi / WSD
            var hpWifi = DiscoveredPrinters.Find(p => p.IsHpSmartTank && p.ConnectionType == "WIFI");
            if (hpWifi != null && hpWifi.IsOnline)
            {
                if (ActivePrinter?.Name != hpWifi.Name || ActivePrinter?.PortName != hpWifi.PortName)
                {
                    SetActivePrinter(hpWifi);
                    LoggingManager.Info($"[DeviceManager] USB offline or disconnected. Switched to secondary Wi-Fi printer: {hpWifi.Name} on {hpWifi.PortName} (ONLINE)");
                }
                return;
            }

            // 3. If neither reports strictly online, still favor USB then Wi-Fi
            if (hpUsb != null)
            {
                if (ActivePrinter?.Name != hpUsb.Name) SetActivePrinter(hpUsb);
                return;
            }
            if (hpWifi != null)
            {
                if (ActivePrinter?.Name != hpWifi.Name) SetActivePrinter(hpWifi);
                return;
            }

            // 4. Fallback: Any default printer
            var fallback = DiscoveredPrinters.Find(p => p.IsDefault) ?? DiscoveredPrinters.Find(p => p.IsOnline);
            if (fallback != null && ActivePrinter?.Name != fallback.Name)
            {
                SetActivePrinter(fallback);
                LoggingManager.Warn($"[DeviceManager] HP Smart Tank not specifically matched. Fallback active printer: {fallback.Name}");
            }
        }

        public void SetActivePrinter(DiscoveredPrinter printer)
        {
            ActivePrinter = printer;
            ActivePrinterChanged?.Invoke(printer);
        }

        public void SwitchToWifi()
        {
            var wifiQueue = DiscoveredPrinters.Find(p => p.IsHpSmartTank && p.ConnectionType == "WIFI");
            if (wifiQueue != null)
            {
                SetActivePrinter(wifiQueue);
                LoggingManager.Info($"Manually switched active queue to Wi-Fi: {wifiQueue.Name}");
            }
            else
            {
                LoggingManager.Warn("No Wi-Fi queue found for HP Smart Tank.");
            }
        }

        public void SwitchToUsb()
        {
            var usbQueue = DiscoveredPrinters.Find(p => p.IsHpSmartTank && p.ConnectionType == "USB");
            if (usbQueue != null)
            {
                SetActivePrinter(usbQueue);
                LoggingManager.Info($"Manually switched active queue to USB: {usbQueue.Name}");
            }
            else
            {
                LoggingManager.Warn("No USB queue found for HP Smart Tank.");
            }
        }
    }
}
