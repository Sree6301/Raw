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
        /// Generates the two separate print-ready PDF files according to section 7 mathematical logic:
        /// First file: Odd pages 1, 3, 5, ... ascending.
        /// Second file: Reverse even pages N', N'-2, ... 2 descending.
        /// </summary>
        public DuplexJob PrepareDuplexFiles(string orderId, string orderNumber, string inputPdfPath, int copies, string printerName)
        {
            LoggingManager.Info($"[DuplexProcessor] Preparing duplex job {orderNumber} (Copies: {copies})");

            var (normalizedPdfPath, normalizedTotal, blankAppended) = PdfProcessor.NormalizePdfForDuplex(inputPdfPath, _workDir);

            using var normDoc = PdfReader.Open(normalizedPdfPath, PdfDocumentOpenMode.Import);

            // 1. First Print File: Odd pages (1, 3, 5, 7...) ascending (0-indexed: 0, 2, 4...)
            var oddPdfPath = Path.Combine(_workDir, $"{orderId}_odd_pages.pdf");
            using (var oddDoc = new PdfDocument())
            {
                for (int p = 1; p <= normalizedTotal; p += 2)
                {
                    oddDoc.AddPage(normDoc.Pages[p - 1]);
                }
                oddDoc.Save(oddPdfPath);
            }

            // 2. Second Print File: Even pages descending (N', N'-2, N'-4... 2) (0-indexed: N'-1, N'-3...)
            var evenReversePdfPath = Path.Combine(_workDir, $"{orderId}_even_reverse.pdf");
            using (var evenDoc = new PdfDocument())
            {
                for (int p = normalizedTotal; p >= 2; p -= 2)
                {
                    evenDoc.AddPage(normDoc.Pages[p - 1]);
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
                OriginalPageCount = normDoc.PageCount - (blankAppended ? 1 : 0),
                NormalizedPageCount = normalizedTotal,
                HasBlankPageInserted = blankAppended,
                TotalCopies = copies,
                CurrentCopyIndex = 1,
                Stage = DuplexStage.AWAITING_APPROVAL,
                TargetPrinterName = printerName
            };

            LoggingManager.Info($"[DuplexProcessor] Job {orderNumber} prepared: {oddPdfPath} and {evenReversePdfPath}");
            return job;
        }

        /// <summary>
        /// Executes First-Side printing using the Windows Print Engine.
        /// </summary>
        public bool PrintFirstSide(DuplexJob job)
        {
            LoggingManager.Info($"[DuplexProcessor] Printing First Side for {job.OrderNumber} (Copy {job.CurrentCopyIndex}/{job.TotalCopies})");
            job.Stage = DuplexStage.PRINTING_FIRST_SIDE;

            // In actual printing on Windows, render pages via System.Drawing / PrintDocument
            var success = PhotoProcessor.PrintPdfDocument(job.OddPagesFilePath, job.TargetPrinterName, $"{job.OrderNumber}_Side1_Copy{job.CurrentCopyIndex}");

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
        /// Executes Second-Side printing with the reverse even pages file.
        /// </summary>
        public bool PrintSecondSide(DuplexJob job)
        {
            if (job.Stage != DuplexStage.PAPER_REVERSAL_CONFIRMED)
            {
                LoggingManager.Warn($"[DuplexProcessor] Refusing second-side print: physical paper reversal not confirmed!");
                return false;
            }

            LoggingManager.Info($"[DuplexProcessor] Printing Second Side for {job.OrderNumber} (Copy {job.CurrentCopyIndex}/{job.TotalCopies})");
            job.Stage = DuplexStage.PRINTING_SECOND_SIDE;

            var success = PhotoProcessor.PrintPdfDocument(job.ReverseEvenPagesFilePath, job.TargetPrinterName, $"{job.OrderNumber}_Side2_Copy{job.CurrentCopyIndex}");

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
