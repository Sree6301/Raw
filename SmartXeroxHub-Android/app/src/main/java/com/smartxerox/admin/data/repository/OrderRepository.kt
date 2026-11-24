package com.smartxerox.admin.data.repository

import android.content.Context
import android.util.Log
import com.google.gson.Gson
import com.google.gson.JsonObject
import com.smartxerox.admin.data.local.OrderDao
import com.smartxerox.admin.data.model.OrderEntity
import com.smartxerox.admin.data.remote.ApiClient
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.withContext
import java.io.File
import java.io.FileOutputStream

class OrderRepository(
    private val context: Context,
    private val orderDao: OrderDao
) {
    val activeOrders: Flow<List<OrderEntity>> = orderDao.getAllActiveOrders()
    val allOrders: Flow<List<OrderEntity>> = orderDao.getAllOrders()

    fun getOrderFlow(orderId: String): Flow<OrderEntity?> = orderDao.getOrderFlow(orderId)

    suspend fun refreshOrders(): Result<Unit> = withContext(Dispatchers.IO) {
        try {
            val response = ApiClient.service.getAdminOrders()
            if (response.isSuccessful && response.body() != null) {
                val body = response.body()!!
                val orderList = mutableListOf<OrderEntity>()
                val gson = Gson()

                // Parse documents
                if (body.has("documents") && body.get("documents").isJsonArray) {
                    val docs = body.getAsJsonArray("documents")
                    for (docEl in docs) {
                        try {
                            val obj = docEl.asJsonObject
                            val entity = OrderEntity(
                                id = obj.get("id").asString,
                                orderNumber = obj.get("orderNumber").asString,
                                serviceType = "DOCUMENT",
                                status = obj.get("status").asString,
                                originalFileName = if (obj.has("originalFileName")) obj.get("originalFileName").asString else "Document.pdf",
                                fileUrl = if (obj.has("fileUrl")) obj.get("fileUrl").asString else "",
                                totalPages = if (obj.has("totalPages")) obj.get("totalPages").asInt else 1,
                                copies = if (obj.has("copies")) obj.get("copies").asInt else 1,
                                colorMode = if (obj.has("colorMode")) obj.get("colorMode").asString else "BW",
                                sides = if (obj.has("sides")) obj.get("sides").asString else "SINGLE",
                                paperSize = if (obj.has("paperSize")) obj.get("paperSize").asString else "A4",
                                paperType = if (obj.has("paperType")) obj.get("paperType").asString else "NORMAL_A4",
                                calculatedPrice = if (obj.has("calculatedPrice")) obj.get("calculatedPrice").asDouble else 0.0,
                                duplexStage = if (obj.has("duplexStage")) obj.get("duplexStage").asString else "NOT_APPLICABLE",
                                claimedBy = if (obj.has("claimedBy") && !obj.get("claimedBy").isJsonNull) obj.get("claimedBy").asString else null,
                                claimedAt = if (obj.has("claimedAt") && !obj.get("claimedAt").isJsonNull) obj.get("claimedAt").asString else null,
                                createdAt = if (obj.has("createdAt")) obj.get("createdAt").asString else "",
                                updatedAt = if (obj.has("updatedAt")) obj.get("updatedAt").asString else ""
                            )
                            orderList.add(entity)
                        } catch (e: Exception) {
                            Log.e("OrderRepo", "Error parsing doc order", e)
                        }
                    }
                }

                // Parse photos
                if (body.has("photos") && body.get("photos").isJsonArray) {
                    val photos = body.getAsJsonArray("photos")
                    for (pEl in photos) {
                        try {
                            val obj = pEl.asJsonObject
                            var fileName = "Photo"
                            var fileUrl = ""
                            if (obj.has("images") && obj.getAsJsonArray("images").size() > 0) {
                                val firstImg = obj.getAsJsonArray("images")[0].asJsonObject
                                fileName = if (firstImg.has("fileName")) firstImg.get("fileName").asString else "Photo.jpg"
                                fileUrl = if (firstImg.has("fileUrl")) firstImg.get("fileUrl").asString else ""
                            }
                            val pps = if (obj.has("photosPerSheet")) obj.get("photosPerSheet").asInt else 1
                            val pTag = if (obj.has("photoType")) obj.get("photoType").asString else "STANDARD"
                            val isPass8 = pps == 8 || pTag == "PASSPORT_8"

                            val entity = OrderEntity(
                                id = obj.get("id").asString,
                                orderNumber = obj.get("orderNumber").asString,
                                serviceType = if (isPass8) "PASSPORT" else "PHOTO",
                                status = obj.get("status").asString,
                                originalFileName = if (isPass8) "Passport (8 Copies) - $fileName" else fileName,
                                fileUrl = fileUrl,
                                totalPages = 1,
                                copies = if (obj.has("copies")) obj.get("copies").asInt else 1,
                                colorMode = if (obj.has("colorMode")) obj.get("colorMode").asString else "COLOR",
                                sides = "SINGLE",
                                paperSize = if (isPass8 || (obj.has("paperType") && obj.get("paperType").asString.contains("4X6"))) "4X6" else "A4",
                                paperType = if (obj.has("paperType")) obj.get("paperType").asString else "PHOTO_4X6",
                                calculatedPrice = if (obj.has("calculatedPrice")) obj.get("calculatedPrice").asDouble else 0.0,
                                photosPerSheet = pps,
                                photoType = pTag,
                                enableBorder = if (obj.has("enableBorder")) obj.get("enableBorder").asBoolean else false,
                                orientation = if (obj.has("orientation")) obj.get("orientation").asString else "PORTRAIT",
                                claimedBy = if (obj.has("claimedBy") && !obj.get("claimedBy").isJsonNull) obj.get("claimedBy").asString else null,
                                claimedAt = if (obj.has("claimedAt") && !obj.get("claimedAt").isJsonNull) obj.get("claimedAt").asString else null,
                                createdAt = if (obj.has("createdAt")) obj.get("createdAt").asString else "",
                                updatedAt = if (obj.has("updatedAt")) obj.get("updatedAt").asString else ""
                            )
                            orderList.add(entity)
                        } catch (e: Exception) {
                            Log.e("OrderRepo", "Error parsing photo order", e)
                        }
                    }
                }

                // Parse scans
                if (body.has("scans") && body.get("scans").isJsonArray) {
                    val scans = body.getAsJsonArray("scans")
                    for (sEl in scans) {
                        try {
                            val obj = sEl.asJsonObject
                            val reqPages = if (obj.has("requestedPageCount")) obj.get("requestedPageCount").asInt else 1
                            var scannedCount = 0
                            if (obj.has("scannedPages") && obj.getAsJsonArray("scannedPages").isJsonArray) {
                                scannedCount = obj.getAsJsonArray("scannedPages").size()
                            }
                            val fmt = if (obj.has("format")) obj.get("format").asString else "PDF"
                            val finalName = if (obj.has("finalFileName") && !obj.get("finalFileName").isJsonNull) obj.get("finalFileName").asString else null
                            val finalUrl = if (obj.has("finalFileUrl") && !obj.get("finalFileUrl").isJsonNull) obj.get("finalFileUrl").asString else null

                            val entity = OrderEntity(
                                id = obj.get("id").asString,
                                orderNumber = obj.get("orderNumber").asString,
                                serviceType = "SCAN",
                                status = obj.get("status").asString,
                                originalFileName = finalName ?: "Flatbed Scan ($fmt, $reqPages pages)",
                                fileUrl = finalUrl ?: "",
                                totalPages = reqPages,
                                requestedPagesCount = reqPages,
                                scannedPagesCount = scannedCount,
                                copies = 1,
                                colorMode = if (obj.has("colorMode")) obj.get("colorMode").asString else "COLOR",
                                sides = "SINGLE",
                                paperSize = "A4",
                                paperType = "NORMAL_A4",
                                calculatedPrice = if (obj.has("calculatedPrice")) obj.get("calculatedPrice").asDouble else 0.0,
                                finalFileName = finalName,
                                finalFileUrl = finalUrl,
                                createdAt = if (obj.has("createdAt")) obj.get("createdAt").asString else "",
                                updatedAt = if (obj.has("updatedAt")) obj.get("updatedAt").asString else ""
                            )
                            orderList.add(entity)
                        } catch (e: Exception) {
                            Log.e("OrderRepo", "Error parsing scan order", e)
                        }
                    }
                }

                orderDao.insertOrUpdateOrders(orderList)
                Result.success(Unit)
            } else {
                Result.failure(Exception("Failed to fetch orders: ${response.code()}"))
            }
        } catch (e: Exception) {
            Log.e("OrderRepo", "Network error refreshing orders", e)
            Result.failure(e)
        }
    }

    suspend fun claimOrder(orderId: String, deviceName: String = "Android-Admin-Device"): Result<Boolean> = withContext(Dispatchers.IO) {
        try {
            val payload = mapOf(
                "deviceId" to android.os.Build.MODEL,
                "deviceName" to deviceName
            )
            val resp = ApiClient.service.claimOrder(orderId, payload)
            if (resp.isSuccessful && resp.body() != null) {
                val body = resp.body()!!
                val claimed = body.has("claimed") && body.get("claimed").asBoolean
                if (claimed) {
                    orderDao.updateOrderClaim(
                        orderId = orderId,
                        claimedBy = deviceName,
                        claimedAt = java.text.SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss.SSS'Z'", java.util.Locale.US).format(java.util.Date()),
                        status = "PRINTING"
                    )
                    Result.success(true)
                } else {
                    val alreadyBy = if (body.has("claimedBy")) body.get("claimedBy").asString else "Another device"
                    Result.failure(Exception("Order already claimed by $alreadyBy"))
                }
            } else {
                val err = resp.errorBody()?.string() ?: "Failed to claim order"
                Result.failure(Exception(err))
            }
        } catch (e: Exception) {
            Log.e("OrderRepo", "Error claiming order", e)
            // Allow offline fallback if needed
            Result.success(true)
        }
    }

    suspend fun updateOrderStatus(orderId: String, serviceType: String, action: String): Result<Unit> = withContext(Dispatchers.IO) {
        try {
            val payload = mapOf("serviceType" to serviceType, "action" to action)
            val resp = ApiClient.service.sendOrderAction(orderId, payload)
            if (resp.isSuccessful) {
                refreshOrders()
                Result.success(Unit)
            } else {
                Result.failure(Exception("Action failed: ${resp.code()}"))
            }
        } catch (e: Exception) {
            Result.failure(e)
        }
    }

    suspend fun updateDuplexStage(orderId: String, stage: String): Result<Unit> = withContext(Dispatchers.IO) {
        try {
            val payload = mapOf("stage" to stage)
            val resp = ApiClient.service.updateDuplexStage(orderId, payload)
            if (resp.isSuccessful) {
                refreshOrders()
                Result.success(Unit)
            } else {
                Result.failure(Exception("Duplex stage update failed"))
            }
        } catch (e: Exception) {
            Result.failure(e)
        }
    }

    suspend fun ensureLocalFile(fileUrl: String, fileName: String): File? = withContext(Dispatchers.IO) {
        try {
            val safeName = fileName.replace("[^a-zA-Z0-9._-]".toRegex(), "_")
            val targetFile = File(context.cacheDir, safeName)
            if (targetFile.exists() && targetFile.length() > 0) {
                return@withContext targetFile
            }

            val fullUrl = if (fileUrl.startsWith("http")) fileUrl else "${ApiClient.getBaseUrl().trimEnd('/')}/$fileUrl".replace("(?<!:)//+".toRegex(), "/")
            val resp = ApiClient.service.downloadFile(fullUrl)
            if (resp.isSuccessful && resp.body() != null) {
                val inputStream = resp.body()!!.byteStream()
                val outputStream = FileOutputStream(targetFile)
                inputStream.use { input ->
                    outputStream.use { output ->
                        input.copyTo(output)
                    }
                }
                targetFile
            } else {
                null
            }
        } catch (e: Exception) {
            Log.e("OrderRepo", "Failed to download file: $fileUrl", e)
            null
        }
    }
}
