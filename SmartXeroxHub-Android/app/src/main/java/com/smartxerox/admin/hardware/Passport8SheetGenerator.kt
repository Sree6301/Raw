package com.smartxerox.admin.hardware

import android.graphics.*
import java.io.File
import java.io.FileOutputStream

/**
 * Permanent verified calibration parameters for 8 Passport size photos on 4×6 HP Photo Paper.
 * Exact 1:1 match with Windows .exe PhotoProcessor.cs algorithm.
 *
 * Sheet: 1800 x 1200 px (300 DPI, 4×6 Landscape)
 * Grid: 2 rows × 4 columns = 8 photos
 * Photo: 397 x 513 px
 * Left Margin: 36 px
 * Top Margin: 12 px
 * Column Gap: 36 px
 * Row Gap: 36 px
 * Cutting Outline: RGBA(180, 203, 213, 225) 1.5px
 */
object Passport8SheetGenerator {
    const val SHEET_WIDTH = 1800
    const val SHEET_HEIGHT = 1200
    const val PHOTO_WIDTH = 397
    const val PHOTO_HEIGHT = 513
    const val LEFT_MARGIN = 36
    const val TOP_MARGIN = 12
    const val COL_GAP = 36
    const val ROW_GAP = 36
    const val COLS = 4
    const val ROWS = 2

    /**
     * Builds the verified 8-Up passport photo sheet bitmap from a cropped or source bitmap.
     */
    fun buildPassport8UpBitmap(sourceBitmap: Bitmap): Bitmap {
        val composite = Bitmap.createBitmap(SHEET_WIDTH, SHEET_HEIGHT, Bitmap.Config.ARGB_8888)
        val canvas = Canvas(composite)
        canvas.drawColor(Color.WHITE)

        val paint = Paint(Paint.ANTI_ALIAS_FLAG or Paint.FILTER_BITMAP_FLAG).apply {
            isDither = true
        }

        // Cutting border pen
        val borderPaint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
            style = Paint.Style.STROKE
            strokeWidth = 1.5f
            color = Color.argb(180, 203, 213, 225)
            strokeJoin = Paint.Join.MITER
        }

        // Crop source to 397:513 aspect ratio if not already exact
        val targetAspect = PHOTO_WIDTH.toFloat() / PHOTO_HEIGHT.toFloat()
        val srcAspect = sourceBitmap.width.toFloat() / sourceBitmap.height.toFloat()

        val croppedSrc: Bitmap = if (Math.abs(srcAspect - targetAspect) > 0.01f) {
            val cropW: Int
            val cropH: Int
            val cropX: Int
            val cropY: Int
            if (srcAspect > targetAspect) {
                cropH = sourceBitmap.height
                cropW = (cropH * targetAspect).toInt()
                cropX = (sourceBitmap.width - cropW) / 2
                cropY = 0
            } else {
                cropW = sourceBitmap.width
                cropH = (cropW / targetAspect).toInt()
                cropX = 0
                cropY = (sourceBitmap.height - cropH) / 2
            }
            Bitmap.createBitmap(sourceBitmap, cropX, cropY, cropW, cropH)
        } else {
            sourceBitmap
        }

        val scaledPhoto = Bitmap.createScaledBitmap(croppedSrc, PHOTO_WIDTH, PHOTO_HEIGHT, true)

        // Draw 2 rows x 4 columns with exact verified offsets
        for (r in 0 until ROWS) {
            for (c in 0 until COLS) {
                val x = LEFT_MARGIN + c * (PHOTO_WIDTH + COL_GAP)
                val y = TOP_MARGIN + r * (PHOTO_HEIGHT + ROW_GAP)

                canvas.drawBitmap(scaledPhoto, x.toFloat(), y.toFloat(), paint)
                canvas.drawRect(
                    x.toFloat(),
                    y.toFloat(),
                    (x + PHOTO_WIDTH).toFloat(),
                    (y + PHOTO_HEIGHT).toFloat(),
                    borderPaint
                )
            }
        }

        if (croppedSrc != sourceBitmap) {
            croppedSrc.recycle()
        }
        if (scaledPhoto != croppedSrc && scaledPhoto != sourceBitmap) {
            scaledPhoto.recycle()
        }

        return composite
    }

    fun savePassport8UpSheetToFile(sourceBitmap: Bitmap, destinationFile: File): File {
        val composite = buildPassport8UpBitmap(sourceBitmap)
        FileOutputStream(destinationFile).use { out ->
            composite.compress(Bitmap.CompressFormat.JPEG, 98, out)
        }
        composite.recycle()
        return destinationFile
    }
}
