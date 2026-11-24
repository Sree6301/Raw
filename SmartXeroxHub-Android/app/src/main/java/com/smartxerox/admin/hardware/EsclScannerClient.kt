package com.smartxerox.admin.hardware

import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.util.Log
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import okhttp3.MediaType.Companion.toMediaTypeOrNull
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody
import java.io.InputStream
import java.util.concurrent.TimeUnit

/**
 * HP Smart Tank 589 eSCL / AirScan Flatbed Scanner REST client.
 * Connects directly to HP printer's embedded eSCL scanner server over Wi-Fi (standard HP port 8080 or 80).
 */
class EsclScannerClient(private val printerIp: String, private val port: Int = 8080) {
    private val client = OkHttpClient.Builder()
        .connectTimeout(15, TimeUnit.SECONDS)
        .readTimeout(120, TimeUnit.SECONDS)
        .build()

    private val baseUrl = "http://$printerIp:$port/eSCL"

    suspend fun checkScannerReady(): Boolean = withContext(Dispatchers.IO) {
        try {
            val request = Request.Builder().url("$baseUrl/ScannerStatus").get().build()
            val resp = client.newCall(request).execute()
            resp.isSuccessful
        } catch (e: Exception) {
            Log.w("EsclScanner", "Scanner status check failed: ${e.message}")
            false
        }
    }

    suspend fun initiateScan(resolutionDpi: Int = 300, colorMode: String = "Color"): Result<Bitmap> = withContext(Dispatchers.IO) {
        try {
            val colorXml = if (colorMode.equals("GRAYSCALE", ignoreCase = true)) "Grayscale8" else "RGB24"
            // eSCL ScanSettings XML for HP Flatbed Platen
            val scanXml = """
                <?xml version="1.0" encoding="UTF-8"?>
                <scan:ScanSettings xmlns:scan="http://schemas.hp.com/imaging/escl/2011/05/03" xmlns:pwg="http://www.pwg.org/schemas/2010/12/sm">
                    <pwg:Version>2.0</pwg:Version>
                    <scan:Intent>Document</scan:Intent>
                    <pwg:ScanRegions>
                        <pwg:ScanRegion>
                            <pwg:XOffset>0</pwg:XOffset>
                            <pwg:YOffset>0</pwg:YOffset>
                            <pwg:Width>2550</pwg:Width>
                            <pwg:Height>3508</pwg:Height>
                        </pwg:ScanRegion>
                    </pwg:ScanRegions>
                    <scan:InputSource>Platen</scan:InputSource>
                    <scan:ColorMode>$colorXml</scan:ColorMode>
                    <scan:XResolution>$resolutionDpi</scan:XResolution>
                    <scan:YResolution>$resolutionDpi</scan:YResolution>
                    <pwg:DocumentFormat>image/jpeg</pwg:DocumentFormat>
                </scan:ScanSettings>
            """.trimIndent()

            val body = scanXml.toRequestBody("text/xml".toMediaTypeOrNull())
            val createJobReq = Request.Builder()
                .url("$baseUrl/ScanJobs")
                .post(body)
                .build()

            val jobResp = client.newCall(createJobReq).execute()
            if (!jobResp.isSuccessful && jobResp.code != 201) {
                return@withContext Result.failure(Exception("Failed to initiate scan job: HTTP ${jobResp.code}"))
            }

            val jobLocation = jobResp.header("Location") ?: "$baseUrl/ScanJobs/NextDocument"
            val downloadUrl = if (jobLocation.startsWith("http")) jobLocation else "http://$printerIp:$port$jobLocation"

            // Download scanned JPEG image from printer
            val downloadReq = Request.Builder().url(downloadUrl).get().build()
            val downloadResp = client.newCall(downloadReq).execute()

            if (downloadResp.isSuccessful && downloadResp.body != null) {
                val stream: InputStream = downloadResp.body!!.byteStream()
                val bitmap = BitmapFactory.decodeStream(stream)
                if (bitmap != null) {
                    Result.success(bitmap)
                } else {
                    Result.failure(Exception("Failed to decode scanned image stream"))
                }
            } else {
                Result.failure(Exception("Failed to download scanned document: ${downloadResp.code}"))
            }
        } catch (e: Exception) {
            Log.e("EsclScanner", "Exception during eSCL scan", e)
            Result.failure(e)
        }
    }
}
