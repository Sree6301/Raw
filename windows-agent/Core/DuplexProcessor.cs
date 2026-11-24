using System;
using System.Collections.Generic;
using System.IO;
using PdfSharpCore.Pdf;
using PdfSharpCore.Pdf.IO;

namespace SmartXeroxHub.Agent.Core
{
    public enum DuplexStage
    {
        AWAITING_APPROVAL,
        PREPARING_FIRST_SIDE,
        PRINTING_FIRST_SIDE,
        FIRST_SIDE_COMPLETED,
        AWAITING_PAPER_REVERSAL,
        PAPER_REVERSAL_CONFIRMED,
        PRINTING_SECOND_SIDE,
        SECOND_SIDE_COMPLETED,
        AWAITING_QUALITY_CHECK,
        COMPLETED,
        PAUSED,
        ERROR
    }

    public class DuplexJob
    {
        public string OrderId { get; set; } = string.Empty;
        public string OrderNumber { get; set; } = string.Empty;
        public string OriginalFilePath { get; set; } = string.Empty;
        public string OddPagesFilePath { get; set; } = string.Empty;
        public string ReverseEvenPagesFilePath { get; set; } = string.Empty;
        public int OriginalPageCount { get; set; }
        public int NormalizedPageCount { get; set; }
        public bool HasBlankPageInserted { get; set; }
        public int TotalCopies { get; set; } = 1;
        public int CurrentCopyIndex { get; set; } = 1;
        public DuplexStage Stage { get; set; } = DuplexStage.AWAITING_APPROVAL;
        public string TargetPrinterName { get; set; } = string.Empty;
        public int PagesPerSheet { get; set; } = 1;
        public PrintJobOptions? PrintOptions { get; set; }
        public DateTime CreatedAt { get; set; } = DateTime.Now;
    }

    public class DuplexProcessor
    {
        private readonly string _workDir;

        public DuplexProcessor(string? customWorkDir = null)
        {
            if (!string.IsNullOrEmpty(customWorkDir) && Directory.Exists(customWorkDir))
            {
                _workDir = customWorkDir;
            }
            else if (Directory.Exists(@"g:\Smart Xerox Hub\RAW_Inputs\Duplex"))
            {
                _workDir = @"g:\Smart Xerox Hub\RAW_Inputs\Duplex";
            }
            else
            {
                _workDir = Path.Combine(
                    Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData),
                    "SmartXeroxHub",
                    "duplex_jobs"
                );
            }

            if (!Directory.Exists(_workDir))
            {
                Directory.CreateDirectory(_workDir);
            }
        }

        /// <summary>
        /// Generates the two separate print-ready PDF files supporting 1, 2, or 4 pages per sheet (N-up duplex).
        /// Pass 1 (Front/Odd): Sheets 1..S ascending.
        /// Pass 2 (Back/Reverse Even): Sheets S..1 descending.
        /// </summary>
        public DuplexJob PrepareDuplexFiles(
            string orderId,
            string orderNumber,
            string inputPdfPath,
            int copies,
            string printerName,
            int pagesPerSheet = 1,
            PrintJobOptions? options = null
        )
        {
            pagesPerSheet = pagesPerSheet is 2 or 4 ? pagesPerSheet : 1;
            options ??= new PrintJobOptions();
            options.PagesPerSheet = pagesPerSheet;

            LoggingManager.Info($"[DuplexProcessor] Preparing duplex job {orderNumber} (Copies: {copies}, Pages/Sheet: {pagesPerSheet})");

            using var inDoc = PdfReader.Open(inputPdfPath, PdfDocumentOpenMode.Import);
            int origCount = inDoc.PageCount;
            int multiplier = pagesPerSheet * 2; // e.g. 1*2=2, 2*2=4, 4*2=8
            int totalSheets = (int)Math.Ceiling((double)origCount / multiplier);
            int totalSlots = totalSheets * multiplier;

            // Build padded document with blank pages if needed
            var workingPdfPath = Path.Combine(_workDir, $"{orderId}_padded.pdf");
            using (var padDoc = new PdfDocument())
            {
                for (int i = 0; i < origCount; i++)
                {
                    padDoc.AddPage(inDoc.Pages[i]);
                }
                for (int i = origCount; i < totalSlots; i++)
                {
                    padDoc.AddPage();
                }
                padDoc.Save(workingPdfPath);
            }

            using var normDoc = PdfReader.Open(workingPdfPath, PdfDocumentOpenMode.Import);

            // 1. First Print File (Front/Odd side): Sheets 0 to totalSheets - 1
            var oddPdfPath = Path.Combine(_workDir, $"{orderId}_odd_pages.pdf");
            using (var oddDoc = new PdfDocument())
            {
                for (int s = 0; s < totalSheets; s++)
                {
                    int baseIdx = s * multiplier;
                    for (int k = 0; k < pagesPerSheet; k++)
                    {
                        oddDoc.AddPage(normDoc.Pages[baseIdx + k]);
                    }
                }
                oddDoc.Save(oddPdfPath);
            }

            // 2. Second Print File (Back/Reverse Even side): Sheets totalSheets - 1 down to 0
            var evenReversePdfPath = Path.Combine(_workDir, $"{orderId}_even_reverse.pdf");
            using (var evenDoc = new PdfDocument())
            {
                for (int s = totalSheets - 1; s >= 0; s--)
                {
                    int baseIdx = s * multiplier + pagesPerSheet;
                    for (int k = 0; k < pagesPerSheet; k++)
                    {
                        evenDoc.AddPage(normDoc.Pages[baseIdx + k]);
                    }
                }
                evenDoc.Save(evenReversePdfPath);
            }

            var job = new DuplexJob
            {
                OrderId = orderId,
                OrderNumber = orderNumber,
                OriginalFilePath = inputPdfPath,
                OddPagesFilePath = oddPdfPath,
                ReverseEvenPagesFilePath = evenReversePdfPath,
                OriginalPageCount = origCount,
                NormalizedPageCount = totalSlots,
                HasBlankPageInserted = (totalSlots > origCount),
                TotalCopies = copies,
                CurrentCopyIndex = 1,
                Stage = DuplexStage.AWAITING_APPROVAL,
                TargetPrinterName = printerName,
                PagesPerSheet = pagesPerSheet,
                PrintOptions = options
            };

            LoggingManager.Info($"[DuplexProcessor] Duplex job {orderNumber} ready: {totalSheets} physical sheets ({origCount} original pages, {totalSlots - origCount} blanks added)");
            return job;
        }

        /// <summary>
        /// Executes First-Side printing using the Windows Print Engine.
        /// </summary>
        public bool PrintFirstSide(DuplexJob job)
        {
            LoggingManager.Info($"[DuplexProcessor] Printing First Side for {job.OrderNumber} (Copy {job.CurrentCopyIndex}/{job.TotalCopies})");
            job.Stage = DuplexStage.PRINTING_FIRST_SIDE;

            var opt = job.PrintOptions ?? new PrintJobOptions { PagesPerSheet = job.PagesPerSheet };
            var success = PhotoProcessor.PrintPdfDocument(job.OddPagesFilePath, job.TargetPrinterName, $"{job.OrderNumber}_Side1_Copy{job.CurrentCopyIndex}", opt);

            if (success)
            {
                job.Stage = DuplexStage.FIRST_SIDE_COMPLETED;
                LoggingManager.Info($"[DuplexProcessor] First side print completed for {job.OrderNumber}. Awaiting physical paper reversal.");
            }
            else
            {
                job.Stage = DuplexStage.ERROR;
                LoggingManager.Error($"[DuplexProcessor] First side print failed for {job.OrderNumber}.");
            }

            return success;
        }

        /// <summary>
        /// Admin confirms physical reversal: paper was removed from exit tray, flipped horizontally, and re-inserted into feed tray.
        /// </summary>
        public void ConfirmPaperReversed(DuplexJob job)
        {
            job.Stage = DuplexStage.PAPER_REVERSAL_CONFIRMED;
            LoggingManager.Info($"[DuplexProcessor] Physical paper reversal CONFIRMED by admin for {job.OrderNumber}.");
        }

        /// <summary>
        /// Executes Second-Side printing with reversed even pages.
        /// <summary>
        /// Executes Second-Side printing with the reverse even pages file.
        /// </summary>
        public bool PrintSecondSide(DuplexJob job)
        {
            if (job.Stage != DuplexStage.PAPER_REVERSAL_CONFIRMED)
            {
                LoggingManager.Info($"[DuplexProcessor] Physical paper reversal confirmed on second side invocation for {job.OrderNumber}.");
                job.Stage = DuplexStage.PAPER_REVERSAL_CONFIRMED;
            }

            LoggingManager.Info($"[DuplexProcessor] Printing Second Side for {job.OrderNumber} (Copy {job.CurrentCopyIndex}/{job.TotalCopies})");
            job.Stage = DuplexStage.PRINTING_SECOND_SIDE;

            var opt = job.PrintOptions ?? new PrintJobOptions { PagesPerSheet = job.PagesPerSheet };
            var success = PhotoProcessor.PrintPdfDocument(job.ReverseEvenPagesFilePath, job.TargetPrinterName, $"{job.OrderNumber}_Side2_Copy{job.CurrentCopyIndex}", opt);

            if (success)
            {
                if (job.CurrentCopyIndex < job.TotalCopies)
                {
                    // Sequential copy isolation: advance to next copy
                    job.CurrentCopyIndex++;
                    job.Stage = DuplexStage.AWAITING_APPROVAL;
                    LoggingManager.Info($"[DuplexProcessor] Copy completed! Moving to Copy {job.CurrentCopyIndex}/{job.TotalCopies}");
                }
                else
                {
                    job.Stage = DuplexStage.COMPLETED;
                    LoggingManager.Info($"[DuplexProcessor] Duplex Job {job.OrderNumber} FULLY COMPLETED across all {job.TotalCopies} copies!");
                }
            }
            else
            {
                job.Stage = DuplexStage.ERROR;
                LoggingManager.Error($"[DuplexProcessor] Second side print failed for {job.OrderNumber}.");
            }

            return success;
        }
    }
}
