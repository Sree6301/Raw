import fs from 'node:fs';
import path from 'node:path';
import { PDFDocument } from 'pdf-lib';
import { calculateDuplexPages, DuplexJobPlan } from '@smart-xerox-hub/shared';

export interface ProcessedDuplexPdfResult {
  originalPageCount: number;
  normalizedPageCount: number;
  blankPageAppended: boolean;
  oddPagesFilePath: string;
  evenPagesReverseFilePath: string;
  oddPagesRelativeUrl: string;
  evenPagesReverseRelativeUrl: string;
}

export async function processPdfForManualDuplex(
  inputPdfPath: string,
  orderId: string,
  outputDir: string
): Promise<ProcessedDuplexPdfResult> {
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  const existingPdfBytes = fs.readFileSync(inputPdfPath);
  const pdfDoc = await PDFDocument.load(existingPdfBytes);
  const totalPages = pdfDoc.getPageCount();

  const duplexMath = calculateDuplexPages(totalPages);

  // If blank page needed, create normalized PDF doc
  let normalizedDoc = pdfDoc;
  if (duplexMath.blankPageAppended) {
    // Clone or add blank page
    normalizedDoc = await PDFDocument.load(existingPdfBytes);
    const lastPage = normalizedDoc.getPage(totalPages - 1);
    const { width, height } = lastPage.getSize();
    normalizedDoc.addPage([width, height]);
  }

  // 1. Generate First Side Print File: 1, 3, 5, 7, ... (Ascending 0-indexed: 0, 2, 4...)
  const firstSideDoc = await PDFDocument.create();
  const oddZeroIndices = duplexMath.firstSidePages.map(p => p - 1);
  const oddCopiedPages = await firstSideDoc.copyPages(normalizedDoc, oddZeroIndices);
  for (const page of oddCopiedPages) {
    firstSideDoc.addPage(page);
  }

  const oddFileName = `duplex_${orderId}_odd_pages.pdf`;
  const oddFilePath = path.join(outputDir, oddFileName);
  fs.writeFileSync(oddFilePath, await firstSideDoc.save());

  // 2. Generate Second Side Print File: N', N'-2, N'-4, ... 2 (Descending 0-indexed: N'-1, N'-3...)
  const secondSideDoc = await PDFDocument.create();
  const evenZeroIndices = duplexMath.secondSidePages.map(p => p - 1);
  const evenCopiedPages = await secondSideDoc.copyPages(normalizedDoc, evenZeroIndices);
  for (const page of evenCopiedPages) {
    secondSideDoc.addPage(page);
  }

  const evenFileName = `duplex_${orderId}_even_reverse.pdf`;
  const evenFilePath = path.join(outputDir, evenFileName);
  fs.writeFileSync(evenFilePath, await secondSideDoc.save());

  return {
    originalPageCount: totalPages,
    normalizedPageCount: duplexMath.normalizedTotal,
    blankPageAppended: duplexMath.blankPageAppended,
    oddPagesFilePath: oddFilePath,
    evenPagesReverseFilePath: evenFilePath,
    oddPagesRelativeUrl: `/uploads/duplex/${oddFileName}`,
    evenPagesReverseRelativeUrl: `/uploads/duplex/${evenFileName}`
  };
}
