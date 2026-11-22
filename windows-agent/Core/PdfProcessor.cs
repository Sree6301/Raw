using System;
using System.IO;
using PdfSharpCore.Pdf;
using PdfSharpCore.Pdf.IO;

namespace SmartXeroxHub.Agent.Core
{
    public class PdfInspectionResult
    {
        public bool IsValid { get; set; }
        public int PageCount { get; set; }
        public string ErrorMessage { get; set; } = string.Empty;
    }

    public static class PdfProcessor
    {
        public static PdfInspectionResult InspectPdf(string filePath)
        {
            if (!File.Exists(filePath))
            {
                return new PdfInspectionResult { IsValid = false, ErrorMessage = "File does not exist." };
            }

            try
            {
                using var document = PdfReader.Open(filePath, PdfDocumentOpenMode.Import);
                return new PdfInspectionResult
                {
                    IsValid = true,
                    PageCount = document.PageCount
                };
            }
            catch (Exception ex)
            {
                return new PdfInspectionResult
                {
                    IsValid = false,
                    ErrorMessage = ex.Message
                };
            }
        }

        /// <summary>
        /// Ensures odd page counts receive an appended blank page of identical dimensions.
        /// </summary>
        public static (string normalizedPath, int normalizedTotal, bool blankAppended) NormalizePdfForDuplex(string inputPath, string outputDir)
        {
            if (!Directory.Exists(outputDir))
            {
                Directory.CreateDirectory(outputDir);
            }

            using var inputDoc = PdfReader.Open(inputPath, PdfDocumentOpenMode.Import);
            var pageCount = inputDoc.PageCount;
            var blankAppended = pageCount % 2 != 0;
            var normalizedTotal = blankAppended ? pageCount + 1 : pageCount;

            var fileNameWithoutExt = Path.GetFileNameWithoutExtension(inputPath);
            var normalizedPath = Path.Combine(outputDir, $"{fileNameWithoutExt}_normalized.pdf");

            using var outDoc = new PdfDocument();
            for (int i = 0; i < pageCount; i++)
            {
                outDoc.AddPage(inputDoc.Pages[i]);
            }

            if (blankAppended)
            {
                // Add blank page with matching dimensions from previous page
                var lastPage = inputDoc.Pages[pageCount - 1];
                var blankPage = outDoc.AddPage();
                blankPage.Width = lastPage.Width;
                blankPage.Height = lastPage.Height;
                LoggingManager.Info($"[DuplexProcessor] Document has odd page count ({pageCount}). Appended blank page {normalizedTotal}.");
            }

            outDoc.Save(normalizedPath);
            return (normalizedPath, normalizedTotal, blankAppended);
        }
    }
}
