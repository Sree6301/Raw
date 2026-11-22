using System;
using System.IO;

namespace SmartXeroxHub.Agent.Core
{
    public static class LoggingManager
    {
        private static readonly string LogDir = Path.Combine(
            Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData),
            "SmartXeroxHub",
            "logs"
        );

        private static readonly object LockObj = new();

        public static event Action<string>? LogMessageReceived;

        static LoggingManager()
        {
            try
            {
                if (!Directory.Exists(LogDir))
                {
                    Directory.CreateDirectory(LogDir);
                }
            }
            catch (Exception ex)
            {
                Console.WriteLine($"[LoggingManager] Failed to create log dir: {ex.Message}");
            }
        }

        public static void Info(string message) => Log("INFO", message);
        public static void Warn(string message) => Log("WARN", message);
        public static void Error(string message, Exception? ex = null)
        {
            var msg = ex == null ? message : $"{message} | Exception: {ex.Message}\n{ex.StackTrace}";
            Log("ERROR", msg);
        }

        private static void Log(string level, string message)
        {
            var timestamp = DateTime.Now.ToString("yyyy-MM-dd HH:mm:ss.fff");
            var line = $"[{timestamp}] [{level}] {message}";

            Console.WriteLine(line);
            LogMessageReceived?.Invoke(line);

            try
            {
                lock (LockObj)
                {
                    var fileName = $"agent_{DateTime.Now:yyyyMMdd}.log";
                    var filePath = Path.Combine(LogDir, fileName);
                    File.AppendAllText(filePath, line + Environment.NewLine);
                }
            }
            catch
            {
                // Suppress disk write failures during shutdown
            }
        }
    }
}
