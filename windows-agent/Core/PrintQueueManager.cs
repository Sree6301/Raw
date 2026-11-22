using System;
using System.IO;
using System.Runtime.InteropServices;

namespace SmartXeroxHub.Agent.Core
{
    public class PrintQueueManager
    {
        [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Auto)]
        public struct DOCINFO
        {
            [MarshalAs(UnmanagedType.LPTStr)] public string pDocName;
            [MarshalAs(UnmanagedType.LPTStr)] public string pOutputFile;
            [MarshalAs(UnmanagedType.LPTStr)] public string pDataType;
        }

        [DllImport("winspool.drv", EntryPoint = "OpenPrinterA", SetLastError = true, CharSet = CharSet.Ansi, ExactSpelling = true, CallingConvention = CallingConvention.StdCall)]
        public static extern bool OpenPrinter([MarshalAs(UnmanagedType.LPStr)] string szPrinter, out IntPtr hPrinter, IntPtr pd);

        [DllImport("winspool.drv", EntryPoint = "ClosePrinter", SetLastError = true, ExactSpelling = true, CallingConvention = CallingConvention.StdCall)]
        public static extern bool ClosePrinter(IntPtr hPrinter);

        [DllImport("winspool.drv", EntryPoint = "StartDocPrinterA", SetLastError = true, CharSet = CharSet.Ansi, ExactSpelling = true, CallingConvention = CallingConvention.StdCall)]
        public static extern uint StartDocPrinter(IntPtr hPrinter, int level, [In] ref DOCINFO di);

        [DllImport("winspool.drv", EntryPoint = "EndDocPrinter", SetLastError = true, ExactSpelling = true, CallingConvention = CallingConvention.StdCall)]
        public static extern bool EndDocPrinter(IntPtr hPrinter);

        [DllImport("winspool.drv", EntryPoint = "StartPagePrinter", SetLastError = true, ExactSpelling = true, CallingConvention = CallingConvention.StdCall)]
        public static extern bool StartPagePrinter(IntPtr hPrinter);

        [DllImport("winspool.drv", EntryPoint = "EndPagePrinter", SetLastError = true, ExactSpelling = true, CallingConvention = CallingConvention.StdCall)]
        public static extern bool EndPagePrinter(IntPtr hPrinter);

        [DllImport("winspool.drv", EntryPoint = "WritePrinter", SetLastError = true, ExactSpelling = true, CallingConvention = CallingConvention.StdCall)]
        public static extern bool WritePrinter(IntPtr hPrinter, IntPtr pBytes, int dwCount, out int dwWritten);

        /// <summary>
        /// Sends raw print bytes directly into the Windows Spooler queue for the specified printer.
        /// </summary>
        public static bool SendBytesToPrinter(string printerName, byte[] bytes, string documentTitle, string dataType = "RAW")
        {
            var di = new DOCINFO
            {
                pDocName = documentTitle,
                pDataType = dataType,
                pOutputFile = null!
            };

            if (!OpenPrinter(printerName, out var hPrinter, IntPtr.Zero))
            {
                var errorCode = Marshal.GetLastWin32Error();
                LoggingManager.Error($"OpenPrinter failed for '{printerName}'. Win32 Error: {errorCode}");
                return false;
            }

            try
            {
                if (StartDocPrinter(hPrinter, 1, ref di) == 0)
                {
                    var errorCode = Marshal.GetLastWin32Error();
                    LoggingManager.Error($"StartDocPrinter failed. Win32 Error: {errorCode}");
                    return false;
                }

                if (!StartPagePrinter(hPrinter))
                {
                    EndDocPrinter(hPrinter);
                    return false;
                }

                var pUnmanagedBytes = Marshal.AllocCoTaskMem(bytes.Length);
                Marshal.Copy(bytes, 0, pUnmanagedBytes, bytes.Length);

                var success = WritePrinter(hPrinter, pUnmanagedBytes, bytes.Length, out var bytesWritten);
                Marshal.FreeCoTaskMem(pUnmanagedBytes);

                EndPagePrinter(hPrinter);
                EndDocPrinter(hPrinter);

                LoggingManager.Info($"Spooler job submitted: {documentTitle} ({bytesWritten} bytes sent to '{printerName}')");
                return success;
            }
            finally
            {
                ClosePrinter(hPrinter);
            }
        }

        /// <summary>
        /// Sends a raw file (e.g. PRN or raw stream) to the spooler.
        /// </summary>
        public static bool SendFileToPrinter(string printerName, string filePath, string documentTitle)
        {
            if (!File.Exists(filePath))
            {
                LoggingManager.Error($"File not found for spooler: {filePath}");
                return false;
            }

            var bytes = File.ReadAllBytes(filePath);
            return SendBytesToPrinter(printerName, bytes, documentTitle);
        }
    }
}
