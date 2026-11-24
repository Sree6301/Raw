package com.smartxerox.admin.data.repository

import android.content.Context
import android.graphics.Bitmap
import android.graphics.pdf.PdfDocument
import com.smartxerox.admin.data.local.ScannedPageDao
import com.smartxerox.admin.data.model.ScannedPageEntity
import com.smartxerox.admin.data.remote.ApiClient
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.withContext
import okhttp3.MediaType.Companion.toMediaTypeOrNull
import okhttp3.MultipartBody
import okhttp3.RequestBody.Companion.asRequestBody
import java.io.File
import java.io.FileOutputStream

class ScannerRepository(
    private val context: Context,
    private val scannedPageDao: ScannedPageDao
) {
    fun getPages(orderId: String): Flow<List<ScannedPageEntity>> = scannedPageDao.getPagesForOrder(orderId)

    suspend fun addScannedPage(orderId: String, bitmap: Bitmap): ScannedPageEntity = withContext(Dispatchers.IO) {
        val existing = scannedPageDao.getPagesForOrderSync(orderId)
        val nextIndex = existing.size + 1
        val file = File(context.filesDir, "scan_${orderId}_page${nextIndex}.jpg")
        FileOutputStream(file).use { out ->
            bitmap.compress(Bitmap.CompressFormat.JPEG, 92, out)
        }

        val page = ScannedPageEntity(
            orderId = orderId,
            pageIndex = nextIndex,
            localUri = file.absolutePath
        )
        val id = scannedPageDao.insertPage(page)
        page.copy(id = id)
    }

    suspend fun uploadPageToBackend(orderId: String, page: ScannedPageEntity): Result<Unit> = withContext(Dispatchers.IO) {
        try {
            val file = File(page.localUri)
            val requestFile = file.asRequestBody("image/jpeg".toMediaTypeOrNull())
            val part = MultipartBody.Part.createFormData("pageImage", file.name, requestFile)
            val resp = ApiClient.service.uploadScanPage(orderId, part)
            if (resp.isSuccessful) {
                Result.success(Unit)
            } else {
                Result.failure(Exception("Failed to upload scan page: ${resp.code()}"))
            }
        } catch (e: Exception) {
            Result.failure(e)
        }
    }

    suspend fun finalizeScanOrder(orderId: String): Result<Unit> = withContext(Dispatchers.IO) {
        try {
            val resp = ApiClient.service.finishScanOrder(orderId)
            if (resp.isSuccessful) {
                Result.success(Unit)
            } else {
                Result.failure(Exception("Failed to finalize scan order"))
            }
        } catch (e: Exception) {
            Result.failure(e)
        }
    }

    suspend fun generateLocalPdf(orderId: String): File = withContext(Dispatchers.IO) {
        val pages = scannedPageDao.getPagesForOrderSync(orderId)
        val pdfDocument = PdfDocument()

        for ((i, page) in pages.withIndex()) {
            val file = File(page.localUri)
            if (file.exists()) {
                val bmp = android.graphics.BitmapFactory.decodeFile(file.absolutePath)
                val pageInfo = PdfDocument.PageInfo.Builder(bmp.width, bmp.height, i + 1).create()
                val pdfPage = pdfDocument.startPage(pageInfo)
                val canvas = pdfPage.canvas
                canvas.drawBitmap(bmp, 0f, 0f, null)
                pdfDocument.finishPage(pdfPage)
                bmp.recycle()
            }
        }

        val outputFile = File(context.filesDir, "Scan_${orderId}.pdf")
        FileOutputStream(outputFile).use { out ->
            pdfDocument.writeTo(out)
        }
        pdfDocument.close()
        outputFile
    }
}
