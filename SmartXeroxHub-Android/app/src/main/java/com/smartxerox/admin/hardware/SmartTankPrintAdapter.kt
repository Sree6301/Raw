package com.smartxerox.admin.hardware

import android.content.Context
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.graphics.pdf.PdfDocument
import android.os.Bundle
import android.os.CancellationSignal
import android.os.ParcelFileDescriptor
import android.print.PageRange
import android.print.PrintAttributes
import android.print.PrintDocumentAdapter
import android.print.PrintDocumentInfo
import android.print.PrintManager
import android.util.Log
import com.smartxerox.admin.data.model.PrintJobOptions
import java.io.File
import java.io.FileInputStream
import java.io.FileOutputStream

class SmartTankPrintAdapter(
    private val context: Context,
    private val printFile: File,
    private val jobName: String,
    private val options: PrintJobOptions
) : PrintDocumentAdapter() {

    private var totalPages = 1

    override fun onLayout(
        oldAttributes: PrintAttributes?,
        newAttributes: PrintAttributes,
        cancellationSignal: CancellationSignal?,
        callback: LayoutResultCallback,
        metadata: Bundle?
    ) {
        if (cancellationSignal?.isCanceled == true) {
            callback.onLayoutCancelled()
            return
        }

        // Determine if PDF or Image
        val isPdf = printFile.extension.equals("pdf", ignoreCase = true)
        totalPages = if (isPdf) {
            try {
                val pfd = ParcelFileDescriptor.open(printFile, ParcelFileDescriptor.MODE_READ_ONLY)
                val renderer = android.graphics.pdf.PdfRenderer(pfd)
                val count = renderer.pageCount
                renderer.close()
                pfd.close()
                count
            } catch (e: Exception) {
                1
            }
        } else {
            1
        }

        val info = PrintDocumentInfo.Builder(jobName)
            .setContentType(PrintDocumentInfo.CONTENT_TYPE_DOCUMENT)
            .setPageCount(totalPages)
            .build()

        callback.onLayoutFinished(info, true)
    }

    override fun onWrite(
        pages: Array<out PageRange>?,
        destination: ParcelFileDescriptor,
        cancellationSignal: CancellationSignal?,
        callback: WriteResultCallback
    ) {
        val isPdf = printFile.extension.equals("pdf", ignoreCase = true)

        if (isPdf) {
            // Stream existing PDF directly into print spooler
            try {
                FileInputStream(printFile).use { input ->
                    FileOutputStream(destination.fileDescriptor).use { output ->
                        val buf = ByteArray(16384)
                        var bytesRead: Int
                        while (input.read(buf).also { bytesRead = it } >= 0) {
                            if (cancellationSignal?.isCanceled == true) {
                                callback.onWriteCancelled()
                                return
                            }
                            output.write(buf, 0, bytesRead)
                        }
                    }
                }
                callback.onWriteFinished(arrayOf(PageRange.ALL_PAGES))
            } catch (e: Exception) {
                Log.e("SmartTankPrintAdapter", "Error writing PDF stream", e)
                callback.onWriteFailed(e.message)
            }
        } else {
            // Convert photo to PDF page matching target media dimensions
            try {
                val pdfDoc = PdfDocument()
                val is4x6 = options.paperSize.contains("4X6", ignoreCase = true) || options.paperType.contains("4X6", ignoreCase = true)
                
                // 4x6 inch = 288 x 432 pt (at 72pt/in) or 300 DPI high-res canvas
                val pageW = if (is4x6) (if (options.orientation == "LANDSCAPE") 432 else 288) else 595 // A4 standard width in pt
                val pageH = if (is4x6) (if (options.orientation == "LANDSCAPE") 288 else 432) else 842 // A4 standard height in pt

                val pageInfo = PdfDocument.PageInfo.Builder(pageW, pageH, 1).create()
                val page = pdfDoc.startPage(pageInfo)
                val canvas = page.canvas

                val bitmap = BitmapFactory.decodeFile(printFile.absolutePath)
                if (bitmap != null) {
                    val paint = android.graphics.Paint(android.graphics.Paint.ANTI_ALIAS_FLAG or android.graphics.Paint.FILTER_BITMAP_FLAG)
                    if (options.colorMode == "BW") {
                        val cm = android.graphics.ColorMatrix().apply { setSaturation(0f) }
                        paint.colorFilter = android.graphics.ColorMatrixColorFilter(cm)
                    }

                    val destRect = if (options.enableBorder) {
                        val margin = 18f // 0.25 inch border margin
                        android.graphics.RectF(margin, margin, pageW - margin, pageH - margin)
                    } else {
                        android.graphics.RectF(0f, 0f, pageW.toFloat(), pageH.toFloat())
                    }

                    canvas.drawBitmap(bitmap, null, destRect, paint)
                    bitmap.recycle()
                }

                pdfDoc.finishPage(page)
                FileOutputStream(destination.fileDescriptor).use { out ->
                    pdfDoc.writeTo(out)
                }
                pdfDoc.close()
                callback.onWriteFinished(arrayOf(PageRange.ALL_PAGES))
            } catch (e: Exception) {
                Log.e("SmartTankPrintAdapter", "Error writing photo to print document", e)
                callback.onWriteFailed(e.message)
            }
        }
    }

    companion object {
        fun launchPrint(context: Context, file: File, jobTitle: String, options: PrintJobOptions) {
            val printManager = context.getSystemService(Context.PRINT_SERVICE) as PrintManager

            val is4x6 = options.paperSize.contains("4X6", ignoreCase = true) || options.paperType.contains("4X6", ignoreCase = true)
            val mediaSize = if (is4x6) {
                if (options.orientation == "LANDSCAPE") PrintAttributes.MediaSize.NA_INDEX_4X6.asLandscape()
                else PrintAttributes.MediaSize.NA_INDEX_4X6.asPortrait()
            } else {
                if (options.orientation == "LANDSCAPE") PrintAttributes.MediaSize.ISO_A4.asLandscape()
                else PrintAttributes.MediaSize.ISO_A4.asPortrait()
            }

            val colorMode = if (options.colorMode.equals("COLOR", ignoreCase = true)) {
                PrintAttributes.COLOR_MODE_COLOR
            } else {
                PrintAttributes.COLOR_MODE_MONOCHROME
            }

            val duplexMode = if (options.pagesPerSheet > 1) {
                PrintAttributes.DUPLEX_MODE_NONE
            } else {
                PrintAttributes.DUPLEX_MODE_NONE // Android PrintManager handles manual duplex via stages
            }

            val attributes = PrintAttributes.Builder()
                .setMediaSize(mediaSize)
                .setColorMode(colorMode)
                .setDuplexMode(duplexMode)
                .setMinMargins(PrintAttributes.Margins.NO_MARGINS)
                .build()

            val adapter = SmartTankPrintAdapter(context, file, jobTitle, options)
            printManager.print(jobTitle, adapter, attributes)
        }
    }
}
