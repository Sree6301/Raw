package com.smartxerox.admin.data.remote

import com.google.gson.JsonObject
import okhttp3.MultipartBody
import okhttp3.RequestBody
import okhttp3.ResponseBody
import retrofit2.Response
import retrofit2.http.*

interface SmartXeroxApiService {

    @GET("/api/admin/orders")
    suspend fun getAdminOrders(): Response<JsonObject>

    @POST("/api/admin/orders/{orderId}/claim")
    suspend fun claimOrder(
        @Path("orderId") orderId: String,
        @Body body: Map<String, String>
    ): Response<JsonObject>

    @POST("/api/admin/orders/{orderId}/action")
    suspend fun sendOrderAction(
        @Path("orderId") orderId: String,
        @Body body: Map<String, Any?>
    ): Response<JsonObject>

    @POST("/api/admin/orders/{orderId}/modify")
    suspend fun modifyOrder(
        @Path("orderId") orderId: String,
        @Body body: Map<String, Any?>
    ): Response<JsonObject>

    @POST("/api/admin/duplex/{orderId}/stage")
    suspend fun updateDuplexStage(
        @Path("orderId") orderId: String,
        @Body body: Map<String, String>
    ): Response<JsonObject>

    @GET("/api/settings")
    suspend fun getPricingSettings(): Response<JsonObject>

    @POST("/api/settings")
    suspend fun updatePricingSettings(
        @Body body: Map<String, Any>
    ): Response<JsonObject>

    @Multipart
    @POST("/api/admin/scan/{orderId}/page")
    suspend fun uploadScanPage(
        @Path("orderId") orderId: String,
        @Part pageImage: MultipartBody.Part
    ): Response<JsonObject>

    @POST("/api/admin/scan/{orderId}/finish")
    suspend fun finishScanOrder(
        @Path("orderId") orderId: String
    ): Response<JsonObject>

    @Multipart
    @POST("/api/orders/documents")
    suspend fun uploadDocumentOrder(
        @Part file: MultipartBody.Part,
        @Part("copies") copies: RequestBody,
        @Part("colorMode") colorMode: RequestBody,
        @Part("sides") sides: RequestBody,
        @Part("paperSize") paperSize: RequestBody
    ): Response<JsonObject>

    @Multipart
    @POST("/api/orders/photos")
    suspend fun uploadPhotoOrder(
        @Part photos: List<MultipartBody.Part>,
        @Part("paperType") paperType: RequestBody,
        @Part("colorMode") colorMode: RequestBody,
        @Part("copies") copies: RequestBody,
        @Part("photosPerSheet") photosPerSheet: RequestBody,
        @Part("photoType") photoType: RequestBody,
        @Part("enableBorder") enableBorder: RequestBody,
        @Part("orientation") orientation: RequestBody
    ): Response<JsonObject>

    @Streaming
    @GET
    suspend fun downloadFile(@Url fileUrl: String): Response<ResponseBody>
}
