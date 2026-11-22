using System;
using System.Collections.Generic;
using System.IO;
using System.Net.Http;
using System.Net.WebSockets;
using System.Text;
using System.Text.Json;
using System.Threading;
using System.Threading.Tasks;

namespace SmartXeroxHub.Agent.Core
{
    public class BackendOrderDto
    {
        public string Id { get; set; } = string.Empty;
        public string OrderNumber { get; set; } = string.Empty;
        public string ServiceType { get; set; } = string.Empty;
        public string Status { get; set; } = string.Empty;
        public string OriginalFileName { get; set; } = string.Empty;
        public string FileUrl { get; set; } = string.Empty;
        public int TotalPages { get; set; }
        public int Copies { get; set; } = 1;
        public string ColorMode { get; set; } = "BW";
        public string Sides { get; set; } = "SINGLE";
        public string DuplexStage { get; set; } = "NOT_APPLICABLE";
        public decimal CalculatedPrice { get; set; }
        public string PaperType { get; set; } = "NORMAL_A4";
        public string CreatedAt { get; set; } = string.Empty;
        public string LocalFilePath { get; set; } = string.Empty;
        public string Format { get; set; } = "PDF";
        public int Resolution { get; set; } = 300;
        public string FinalFileName { get; set; } = string.Empty;
        public string FinalFileUrl { get; set; } = string.Empty;

        public bool IsScan => ServiceType == "SCAN";
        public bool IsDuplex => Sides == "MANUAL_DUPLEX";
        public string ActionButtonText => IsScan ? "🔍 Approve & Scan" : (IsDuplex ? "📑 Approve & Duplex" : "🖨️ Approve & Print");
    }

    public class ShopPricingDto
    {
        public decimal A4BwSingleSideRate { get; set; } = 2.0m;
        public decimal A4BwDoubleSideRate { get; set; } = 3.0m;
        public decimal A4ColorSingleSideRate { get; set; } = 10.0m;
        public decimal A4ColorDoubleSideRate { get; set; } = 18.0m;
        public decimal PhotoA4Rate { get; set; } = 40.0m;
        public decimal Photo4x6Rate { get; set; } = 20.0m;
        public decimal ScanPerPageRate { get; set; } = 10.0m;
        public string ShopName { get; set; } = "SMART XEROX HUB";
    }

    public class BackendSync
    {
        private readonly HttpClient _httpClient;
        private readonly DeviceManager _deviceManager;
        private readonly DuplexProcessor _duplexProcessor;
        private readonly ScanManager _scanManager;
        private readonly RecoveryManager _recoveryManager;
        private readonly string _backendBaseUrl;
        private readonly string _rawUploadsDir;
        private CancellationTokenSource? _syncCts;
        private ClientWebSocket? _webSocket;

        public bool IsConnected { get; private set; }
        public event Action<bool>? ConnectionStatusChanged;
        public event Action? OrdersUpdated;
        public event Action? PricingUpdated;
        public event Action<BackendOrderDto>? NewOrderReceived;

        public BackendSync(
            DeviceManager deviceManager,
            DuplexProcessor duplexProcessor,
            ScanManager scanManager,
            RecoveryManager recoveryManager,
            string backendBaseUrl = "http://localhost:3001"
        )
        {
            _deviceManager = deviceManager;
            _duplexProcessor = duplexProcessor;
            _scanManager = scanManager;
            _recoveryManager = recoveryManager;
            // Allow overriding via environment variable or config.json
            var resolvedUrl = backendBaseUrl;
            var envUrl = Environment.GetEnvironmentVariable("SMART_XEROX_BACKEND_URL");
            if (!string.IsNullOrWhiteSpace(envUrl))
            {
                resolvedUrl = envUrl.Trim();
            }
            else
            {
                var cfgFile = Path.Combine(AppDomain.CurrentDomain.BaseDirectory, "config.json");
                if (File.Exists(cfgFile))
                {
                    try
                    {
                        var json = File.ReadAllText(cfgFile);
                        using var doc = JsonDocument.Parse(json);
                        if (doc.RootElement.TryGetProperty("backendUrl", out var prop) && !string.IsNullOrWhiteSpace(prop.GetString()))
                        {
                            resolvedUrl = prop.GetString()!.Trim();
                        }
                    }
                    catch { }
                }
            }
            _backendBaseUrl = resolvedUrl.TrimEnd('/');
            LoggingManager.Info($"[BackendSync] Target backend URL resolved to: {_backendBaseUrl}");

            // Resolve RAW_Inputs/User_Uploads
            if (Directory.Exists(@"g:\Smart Xerox Hub\RAW_Inputs\User_Uploads"))
            {
                _rawUploadsDir = @"g:\Smart Xerox Hub\RAW_Inputs\User_Uploads";
            }
            else
            {
                var current = AppDomain.CurrentDomain.BaseDirectory;
                string candidate = Path.Combine(current, "RAW_Inputs", "User_Uploads");
                while (!Directory.Exists(Path.GetDirectoryName(candidate)) && Directory.GetParent(current) != null)
                {
                    current = Directory.GetParent(current)!.FullName;
                    candidate = Path.Combine(current, "RAW_Inputs", "User_Uploads");
                }
                if (!Directory.Exists(candidate)) Directory.CreateDirectory(candidate);
                _rawUploadsDir = candidate;
            }

            _httpClient = new HttpClient
            {
                BaseAddress = new Uri(_backendBaseUrl),
                Timeout = TimeSpan.FromSeconds(10)
            };
        }

        public string GetUserUploadsDirectory() => _rawUploadsDir;

        public void Start()
        {
            _syncCts = new CancellationTokenSource();
            Task.Run(() => MaintainWebSocketAsync(_syncCts.Token));
            Task.Run(() => PollingLoopAsync(_syncCts.Token));
            LoggingManager.Info($"[BackendSync] Outbound synchronization started to {_backendBaseUrl}");
        }

        public void Stop()
        {
            _syncCts?.Cancel();
            _webSocket?.Dispose();
        }

        /// <summary>
        /// Real-time persistent WebSocket connection: receives instant push notifications when user submits order.
        /// </summary>
        private async Task MaintainWebSocketAsync(CancellationToken ct)
        {
            var wsUri = new Uri(_backendBaseUrl.Replace("http://", "ws://").Replace("https://", "wss://") + "/ws");

            while (!ct.IsCancellationRequested)
            {
                try
                {
                    _webSocket = new ClientWebSocket();
                    await _webSocket.ConnectAsync(wsUri, ct);
                    LoggingManager.Info("[BackendSync] WebSocket real-time connection ESTABLISHED!");
                    SetConnected(true);

                    // Register Agent with Backend so Admin Dashboard knows printer/agent is ONLINE
                    try
                    {
                        var regPayload = JsonSerializer.Serialize(new
                        {
                            type = "AGENT_REGISTER",
                            agentName = "Smart Xerox Hub Windows Agent",
                            activePrinter = _deviceManager.ActivePrinter?.Name ?? "HP Smart Tank 580-590 series",
                            port = _deviceManager.ActivePrinter?.PortName ?? "USB001"
                        });
                        var regBytes = Encoding.UTF8.GetBytes(regPayload);
                        await _webSocket.SendAsync(new ArraySegment<byte>(regBytes), WebSocketMessageType.Text, true, ct);
                    }
                    catch { }

                    // Start background heartbeat while socket is open
                    _ = Task.Run(async () =>
                    {
                        while (_webSocket?.State == WebSocketState.Open && !ct.IsCancellationRequested)
                        {
                            await Task.Delay(15000, ct);
                            if (_webSocket?.State == WebSocketState.Open)
                            {
                                try
                                {
                                    var hb = JsonSerializer.Serialize(new
                                    {
                                        type = "AGENT_HEARTBEAT",
                                        activePrinter = _deviceManager.ActivePrinter?.Name ?? "HP Smart Tank 580-590 series",
                                        port = _deviceManager.ActivePrinter?.PortName ?? "USB001"
                                    });
                                    var hbBytes = Encoding.UTF8.GetBytes(hb);
                                    await _webSocket.SendAsync(new ArraySegment<byte>(hbBytes), WebSocketMessageType.Text, true, ct);
                                }
                                catch { }
                            }
                        }
                    }, ct);

                    var buffer = new byte[8192];
                    while (_webSocket.State == WebSocketState.Open && !ct.IsCancellationRequested)
                    {
                        var result = await _webSocket.ReceiveAsync(new ArraySegment<byte>(buffer), ct);
                        if (result.MessageType == WebSocketMessageType.Close)
                        {
                            await _webSocket.CloseAsync(WebSocketCloseStatus.NormalClosure, "Closing", ct);
                            break;
                        }

                        var message = Encoding.UTF8.GetString(buffer, 0, result.Count);
                        ProcessWebSocketMessage(message);
                    }
                }
                catch (Exception ex)
                {
                    LoggingManager.Warn($"[BackendSync] WebSocket reconnection in 3s... ({ex.Message})");
                }

                await Task.Delay(3000, ct);
            }
        }

        private void ProcessWebSocketMessage(string messageJson)
        {
            try
            {
                using var doc = JsonDocument.Parse(messageJson);
                var root = doc.RootElement;
                if (root.TryGetProperty("type", out var typeProp))
                {
                    var eventType = typeProp.GetString();
                    LoggingManager.Info($"[BackendSync] Real-time event received: {eventType}");

                    if (eventType == "ORDER_CREATED" || eventType == "PHOTO_ORDER_CREATED" || eventType == "SCAN_ORDER_CREATED" || eventType == "ORDER_UPDATED" || eventType == "PRINT_TRIGGERED" || eventType == "SCAN_ORDER_COMPLETED")
                    {
                        OrdersUpdated?.Invoke();

                        if (eventType == "PRINT_TRIGGERED" && root.TryGetProperty("payload", out var payload))
                        {
                            HandlePrintTriggeredAsync(payload).ConfigureAwait(false);
                        }
                    }

                    if (eventType == "SETTINGS_UPDATED")
                    {
                        PricingUpdated?.Invoke();
                    }

                    if (eventType == "ACQUIRE_SCAN_REQUEST" && root.TryGetProperty("payload", out var scanPl))
                    {
                        try
                        {
                            string oId = scanPl.GetProperty("orderId").GetString()!;
                            var ord = scanPl.GetProperty("order");
                            string oNum = ord.GetProperty("orderNumber").GetString()!;
                            string fmt = ord.TryGetProperty("format", out var f) ? f.GetString()! : "PDF";
                            int res = ord.TryGetProperty("resolution", out var r) ? r.GetInt32() : 300;
                            string mode = ord.TryGetProperty("colorMode", out var m) ? m.GetString()! : "COLOR";
                            _ = AcquireAndUploadScanAsync(oId, oNum, fmt, res, mode);
                        }
                        catch (Exception ex)
                        {
                            LoggingManager.Error("[BackendSync] Failed to dispatch ACQUIRE_SCAN_REQUEST", ex);
                        }
                    }
                }
            }
            catch (Exception ex)
            {
                LoggingManager.Error("[BackendSync] Failed to parse WebSocket message", ex);
            }
        }

        private async Task HandlePrintTriggeredAsync(JsonElement payload)
        {
            try
            {
                string orderId = payload.GetProperty("orderId").GetString()!;
                string serviceType = payload.GetProperty("serviceType").GetString()!;
                var order = payload.GetProperty("order");
                string fileUrl = order.GetProperty("fileUrl").GetString()!;
                string originalName = order.GetProperty("originalFileName").GetString()!;
                string printerName = _deviceManager.ActivePrinter?.Name ?? "HP Smart Tank 580-590 series";

                LoggingManager.Info($"[BackendSync] Executing print trigger for {originalName} on printer '{printerName}'");

                // Download / copy to RAW_Inputs/User_Uploads
                var localFilePath = await EnsureLocalFileAsync(fileUrl, originalName);

                if (serviceType == "DOCUMENT")
                {
                    string sides = order.GetProperty("sides").GetString()!;
                    int copies = order.GetProperty("copies").GetInt32();
                    string orderNum = order.GetProperty("orderNumber").GetString()!;

                    if (sides == "MANUAL_DUPLEX")
                    {
                        var duplexJob = _duplexProcessor.PrepareDuplexFiles(orderId, orderNum, localFilePath, copies, printerName);
                        _recoveryManager.TrackDuplexJob(duplexJob);
                        _duplexProcessor.PrintFirstSide(duplexJob);
                        await UpdateDuplexStageOnBackendAsync(orderId, "AWAITING_PAPER_REVERSAL");
                    }
                    else
                    {
                        for (int c = 1; c <= copies; c++)
                        {
                            PhotoProcessor.PrintPdfDocument(localFilePath, printerName, $"{orderNum}_Copy{c}");
                        }
                        await UpdateOrderStatusOnBackendAsync(orderId, "DOCUMENT", "COMPLETE");
                    }
                }
                else if (serviceType == "PHOTO")
                {
                    string paperType = order.GetProperty("paperType").GetString()!;
                    string colorMode = order.GetProperty("colorMode").GetString()!;
                    int copies = order.GetProperty("copies").GetInt32();
                    string orderNum = order.GetProperty("orderNumber").GetString()!;

                    for (int c = 1; c <= copies; c++)
                    {
                        PhotoProcessor.PrintPhoto(localFilePath, printerName, paperType, colorMode, "FIT", $"{orderNum}_Photo_Copy{c}");
                    }
                    await UpdateOrderStatusOnBackendAsync(orderId, "PHOTO", "COMPLETE");
                }

                OrdersUpdated?.Invoke();
            }
            catch (Exception ex)
            {
                LoggingManager.Error("[BackendSync] Error executing print triggered job", ex);
            }
        }

        private async Task PollingLoopAsync(CancellationToken ct)
        {
            while (!ct.IsCancellationRequested)
            {
                try
                {
                    await SendHeartbeatAsync();
                    SetConnected(true);
                }
                catch
                {
                    SetConnected(false);
                }

                await Task.Delay(2000, ct);
            }
        }

        private void SetConnected(bool connected)
        {
            if (IsConnected != connected)
            {
                IsConnected = connected;
                ConnectionStatusChanged?.Invoke(connected);
            }
        }

        public async Task<List<BackendOrderDto>> FetchAllOrdersAsync()
        {
            var list = new List<BackendOrderDto>();
            try
            {
                var res = await _httpClient.GetAsync("/api/admin/orders");
                if (!res.IsSuccessStatusCode) return list;

                var json = await res.Content.ReadAsStringAsync();
                using var doc = JsonDocument.Parse(json);
                var root = doc.RootElement;

                if (root.TryGetProperty("documents", out var docs) && docs.ValueKind == JsonValueKind.Array)
                {
                    foreach (var d in docs.EnumerateArray())
                    {
                        string fUrl = d.GetProperty("fileUrl").GetString()!;
                        string loc = Path.Combine(_rawUploadsDir, Path.GetFileName(fUrl));
                        list.Add(new BackendOrderDto
                        {
                            Id = d.GetProperty("id").GetString()!,
                            OrderNumber = d.GetProperty("orderNumber").GetString()!,
                            ServiceType = "DOCUMENT",
                            Status = d.GetProperty("status").GetString()!,
                            OriginalFileName = d.GetProperty("originalFileName").GetString()!,
                            FileUrl = fUrl,
                            LocalFilePath = loc,
                            TotalPages = d.GetProperty("totalPages").GetInt32(),
                            Copies = d.GetProperty("copies").GetInt32(),
                            ColorMode = d.GetProperty("colorMode").GetString()!,
                            Sides = d.GetProperty("sides").GetString()!,
                            DuplexStage = d.TryGetProperty("duplexStage", out var ds) ? ds.GetString()! : "NOT_APPLICABLE",
                            CalculatedPrice = d.GetProperty("calculatedPrice").GetDecimal(),
                            CreatedAt = d.GetProperty("createdAt").GetString()!
                        });
                    }
                }

                if (root.TryGetProperty("photos", out var photos) && photos.ValueKind == JsonValueKind.Array)
                {
                    foreach (var p in photos.EnumerateArray())
                    {
                        string fileName = "Photo";
                        string fileUrl = "";
                        if (p.TryGetProperty("images", out var imgs) && imgs.GetArrayLength() > 0)
                        {
                            fileName = imgs[0].GetProperty("fileName").GetString()!;
                            fileUrl = imgs[0].GetProperty("fileUrl").GetString()!;
                        }
                        string loc = !string.IsNullOrEmpty(fileUrl) ? Path.Combine(_rawUploadsDir, Path.GetFileName(fileUrl)) : "";

                        list.Add(new BackendOrderDto
                        {
                            Id = p.GetProperty("id").GetString()!,
                            OrderNumber = p.GetProperty("orderNumber").GetString()!,
                            ServiceType = "PHOTO",
                            Status = p.GetProperty("status").GetString()!,
                            OriginalFileName = fileName,
                            FileUrl = fileUrl,
                            LocalFilePath = loc,
                            TotalPages = 1,
                            Copies = p.GetProperty("copies").GetInt32(),
                            ColorMode = p.GetProperty("colorMode").GetString()!,
                            PaperType = p.GetProperty("paperType").GetString()!,
                            CalculatedPrice = p.GetProperty("calculatedPrice").GetDecimal(),
                            CreatedAt = p.GetProperty("createdAt").GetString()!
                        });
                    }
                }

                if (root.TryGetProperty("scans", out var scans) && scans.ValueKind == JsonValueKind.Array)
                {
                    string scansDir = _scanManager.GetScansDirectory();
                    foreach (var s in scans.EnumerateArray())
                    {
                        string fmt = s.TryGetProperty("format", out var f) ? f.GetString()! : "PDF";
                        int scanDpi = s.TryGetProperty("resolution", out var rVal) ? rVal.GetInt32() : 300;
                        string fName = s.TryGetProperty("finalFileName", out var fn) ? fn.GetString() ?? "" : "";
                        string fUrl = s.TryGetProperty("finalFileUrl", out var fu) ? fu.GetString() ?? "" : "";
                        string loc = !string.IsNullOrEmpty(fName) ? Path.Combine(scansDir, fName) : (!string.IsNullOrEmpty(fUrl) ? Path.Combine(scansDir, Path.GetFileName(fUrl)) : "");

                        list.Add(new BackendOrderDto
                        {
                            Id = s.GetProperty("id").GetString()!,
                            OrderNumber = s.GetProperty("orderNumber").GetString()!,
                            ServiceType = "SCAN",
                            Status = s.GetProperty("status").GetString()!,
                            OriginalFileName = !string.IsNullOrEmpty(fName) ? fName : $"Flatbed Scan ({fmt}, {scanDpi} DPI)",
                            Format = fmt,
                            Resolution = scanDpi,
                            FinalFileName = fName,
                            FinalFileUrl = fUrl,
                            LocalFilePath = loc,
                            TotalPages = s.GetProperty("requestedPageCount").GetInt32(),
                            ColorMode = s.GetProperty("colorMode").GetString()!,
                            CalculatedPrice = s.GetProperty("calculatedPrice").GetDecimal(),
                            CreatedAt = s.GetProperty("createdAt").GetString()!
                        });
                    }
                }
            }
            catch (Exception ex)
            {
                LoggingManager.Warn($"[BackendSync] Failed to fetch orders: {ex.Message}");
            }

            return list;
        }

        public async Task<bool> TriggerPrintOrderAsync(string orderId, string printerName)
        {
            try
            {
                var body = JsonSerializer.Serialize(new { printerName });
                var content = new StringContent(body, Encoding.UTF8, "application/json");
                var res = await _httpClient.PostAsync($"/api/admin/orders/{orderId}/print", content);
                return res.IsSuccessStatusCode;
            }
            catch (Exception ex)
            {
                LoggingManager.Error($"[BackendSync] Failed to trigger print for {orderId}", ex);
                return false;
            }
        }

        public async Task<bool> UpdateOrderStatusOnBackendAsync(string orderId, string serviceType, string action)
        {
            try
            {
                var body = JsonSerializer.Serialize(new { serviceType, action });
                var content = new StringContent(body, Encoding.UTF8, "application/json");
                var res = await _httpClient.PostAsync($"/api/admin/orders/{orderId}/action", content);
                return res.IsSuccessStatusCode;
            }
            catch { return false; }
        }

        public async Task<bool> UpdateDuplexStageOnBackendAsync(string orderId, string stage)
        {
            try
            {
                var body = JsonSerializer.Serialize(new { stage });
                var content = new StringContent(body, Encoding.UTF8, "application/json");
                var res = await _httpClient.PostAsync($"/api/admin/duplex/{orderId}/stage", content);
                return res.IsSuccessStatusCode;
            }
            catch { return false; }
        }

        public async Task<string> EnsureLocalFileAsync(string fileUrl, string originalFileName)
        {
            var fileName = Path.GetFileName(fileUrl);
            var localPath = Path.Combine(_rawUploadsDir, fileName);

            if (File.Exists(localPath)) return localPath;

            var fullUrl = $"{_backendBaseUrl}{fileUrl}";
            var bytes = await _httpClient.GetByteArrayAsync(fullUrl);
            await File.WriteAllBytesAsync(localPath, bytes);
            return localPath;
        }

        public async Task<bool> UploadLocalDocumentAsync(string filePath, int copies, string colorMode, string sides)
        {
            try
            {
                using var form = new MultipartFormDataContent();
                var fileBytes = await File.ReadAllBytesAsync(filePath);
                var fileContent = new ByteArrayContent(fileBytes);
                fileContent.Headers.ContentType = new System.Net.Http.Headers.MediaTypeHeaderValue("application/pdf");
                form.Add(fileContent, "file", Path.GetFileName(filePath));
                form.Add(new StringContent(copies.ToString()), "copies");
                form.Add(new StringContent(colorMode), "colorMode");
                form.Add(new StringContent(sides), "sides");

                var res = await _httpClient.PostAsync("/api/orders/documents", form);
                return res.IsSuccessStatusCode;
            }
            catch (Exception ex)
            {
                LoggingManager.Error("[BackendSync] Failed to upload local document", ex);
                return false;
            }
        }

        public async Task<bool> AcquireAndUploadScanAsync(string orderId, string orderNumber, string format = "PDF", int resolution = 300, string colorMode = "COLOR")
        {
            try
            {
                LoggingManager.Info($"[BackendSync] Triggering physical HP flatbed scan for order {orderNumber} ({format}, {resolution} DPI, {colorMode})");

                var scanParams = new ScanParameters
                {
                    Dpi = resolution,
                    ColorMode = colorMode,
                    Format = format
                };

                // Real physical WIA scan without watermarks
                var scannedImagePath = _scanManager.AcquireFlatbedScan(scanParams, 1, orderNumber);
                if (string.IsNullOrEmpty(scannedImagePath) || !File.Exists(scannedImagePath))
                {
                    LoggingManager.Error("[BackendSync] Flatbed scan acquisition produced no file");
                    return false;
                }

                LoggingManager.Info($"[BackendSync] Physical scan captured to: {scannedImagePath}");

                // Upload scan page image to backend
                using var form = new MultipartFormDataContent();
                var fileBytes = await File.ReadAllBytesAsync(scannedImagePath);
                var byteContent = new ByteArrayContent(fileBytes);
                byteContent.Headers.ContentType = new System.Net.Http.Headers.MediaTypeHeaderValue("image/jpeg");
                form.Add(byteContent, "pageImage", Path.GetFileName(scannedImagePath));

                var uploadRes = await _httpClient.PostAsync($"/api/admin/scan/{orderId}/page", form);
                if (!uploadRes.IsSuccessStatusCode)
                {
                    LoggingManager.Warn($"[BackendSync] Scan page upload returned status {uploadRes.StatusCode}");
                }

                // Finish scan order so final download is available for user
                var finishRes = await _httpClient.PostAsync($"/api/admin/scan/{orderId}/finish", new StringContent("{}", Encoding.UTF8, "application/json"));
                LoggingManager.Info($"[BackendSync] Scan order {orderNumber} finished successfully: DOWNLOAD_AVAILABLE");

                OrdersUpdated?.Invoke();
                return true;
            }
            catch (Exception ex)
            {
                LoggingManager.Error($"[BackendSync] Failed to acquire and upload scan for {orderNumber}", ex);
                return false;
            }
        }

        public async Task<ShopPricingDto?> FetchPricingAsync()
        {
            try
            {
                var res = await _httpClient.GetAsync("/api/settings");
                if (!res.IsSuccessStatusCode) return null;

                var json = await res.Content.ReadAsStringAsync();
                using var doc = JsonDocument.Parse(json);
                if (doc.RootElement.TryGetProperty("pricing", out var p))
                {
                    return new ShopPricingDto
                    {
                        A4BwSingleSideRate = p.TryGetProperty("a4BwSingleSideRate", out var bw) ? bw.GetDecimal() : 2.0m,
                        A4BwDoubleSideRate = p.TryGetProperty("a4BwDoubleSideRate", out var bwd) ? bwd.GetDecimal() : 3.0m,
                        A4ColorSingleSideRate = p.TryGetProperty("a4ColorSingleSideRate", out var c) ? c.GetDecimal() : 10.0m,
                        A4ColorDoubleSideRate = p.TryGetProperty("a4ColorDoubleSideRate", out var cd) ? cd.GetDecimal() : 18.0m,
                        PhotoA4Rate = p.TryGetProperty("photoA4Rate", out var pa4) ? pa4.GetDecimal() : 40.0m,
                        Photo4x6Rate = p.TryGetProperty("photo4x6Rate", out var p46) ? p46.GetDecimal() : 20.0m,
                        ScanPerPageRate = p.TryGetProperty("scanPerPageRate", out var sc) ? sc.GetDecimal() : 10.0m,
                        ShopName = p.TryGetProperty("shopName", out var sn) ? sn.GetString() ?? "SMART XEROX HUB" : "SMART XEROX HUB"
                    };
                }
            }
            catch (Exception ex)
            {
                LoggingManager.Warn($"[BackendSync] Failed to fetch pricing: {ex.Message}");
            }
            return null;
        }

        public async Task<bool> SavePricingAsync(ShopPricingDto pricing)
        {
            try
            {
                var payload = new
                {
                    pricing = new
                    {
                        a4BwSingleSideRate = pricing.A4BwSingleSideRate,
                        a4BwDoubleSideRate = pricing.A4BwDoubleSideRate,
                        a4ColorSingleSideRate = pricing.A4ColorSingleSideRate,
                        a4ColorDoubleSideRate = pricing.A4ColorDoubleSideRate,
                        photoA4Rate = pricing.PhotoA4Rate,
                        photo4x6Rate = pricing.Photo4x6Rate,
                        scanPerPageRate = pricing.ScanPerPageRate,
                        shopName = pricing.ShopName
                    }
                };

                var json = JsonSerializer.Serialize(payload);
                var content = new StringContent(json, Encoding.UTF8, "application/json");
                var res = await _httpClient.PostAsync("/api/settings", content);
                return res.IsSuccessStatusCode;
            }
            catch (Exception ex)
            {
                LoggingManager.Error("[BackendSync] Failed to save pricing", ex);
                return false;
            }
        }

        private async Task SendHeartbeatAsync()
        {
            var printersPayload = new List<object>();
            foreach (var p in _deviceManager.DiscoveredPrinters)
            {
                printersPayload.Add(new
                {
                    id = p.ConnectionType == "USB" ? "hp-smart-tank-usb" : "hp-smart-tank-wifi",
                    name = p.Name,
                    status = p.IsOnline ? "ONLINE" : "OFFLINE"
                });
            }

            var body = JsonSerializer.Serialize(new
            {
                printers = printersPayload,
                scannerOnline = true,
                osVersion = Environment.OSVersion.ToString()
            });

            var content = new StringContent(body, Encoding.UTF8, "application/json");
            await _httpClient.PostAsync("/api/agent/heartbeat", content);
        }
    }
}
