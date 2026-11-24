package com.smartxerox.admin.data.repository

import com.google.gson.Gson
import com.smartxerox.admin.data.local.PricingDao
import com.smartxerox.admin.data.model.PricingEntity
import com.smartxerox.admin.data.remote.ApiClient
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.withContext

class PricingRepository(
    private val pricingDao: PricingDao
) {
    val pricing: Flow<PricingEntity?> = pricingDao.getPricing()

    suspend fun refreshPricing(): Result<PricingEntity> = withContext(Dispatchers.IO) {
        try {
            val resp = ApiClient.service.getPricingSettings()
            if (resp.isSuccessful && resp.body() != null) {
                val body = resp.body()!!
                if (body.has("pricing")) {
                    val pObj = body.getAsJsonObject("pricing")
                    val entity = PricingEntity(
                        id = 1,
                        a4BwSingleSideRate = if (pObj.has("a4BwSingleSideRate")) pObj.get("a4BwSingleSideRate").asDouble else 2.0,
                        a4BwDoubleSideRate = if (pObj.has("a4BwDoubleSideRate")) pObj.get("a4BwDoubleSideRate").asDouble else 3.0,
                        a4ColorSingleSideRate = if (pObj.has("a4ColorSingleSideRate")) pObj.get("a4ColorSingleSideRate").asDouble else 10.0,
                        a4ColorDoubleSideRate = if (pObj.has("a4ColorDoubleSideRate")) pObj.get("a4ColorDoubleSideRate").asDouble else 18.0,
                        photoA4Rate = if (pObj.has("photoA4Rate")) pObj.get("photoA4Rate").asDouble else 40.0,
                        photo4x6Rate = if (pObj.has("photo4x6Rate")) pObj.get("photo4x6Rate").asDouble else 20.0,
                        passport8Rate = if (pObj.has("passport8Rate")) pObj.get("passport8Rate").asDouble else 30.0,
                        scanPerPageRate = if (pObj.has("scanPerPageRate")) pObj.get("scanPerPageRate").asDouble else 10.0,
                        shopName = if (pObj.has("shopName")) pObj.get("shopName").asString else "SMART XEROX HUB",
                        lastUpdated = System.currentTimeMillis()
                    )
                    pricingDao.savePricing(entity)
                    return@withContext Result.success(entity)
                }
            }
            Result.failure(Exception("Failed to fetch pricing"))
        } catch (e: Exception) {
            Result.failure(e)
        }
    }

    suspend fun updatePricing(newPricing: PricingEntity): Result<Unit> = withContext(Dispatchers.IO) {
        try {
            val map = mapOf(
                "pricing" to mapOf(
                    "a4BwSingleSideRate" to newPricing.a4BwSingleSideRate,
                    "a4BwDoubleSideRate" to newPricing.a4BwDoubleSideRate,
                    "a4ColorSingleSideRate" to newPricing.a4ColorSingleSideRate,
                    "a4ColorDoubleSideRate" to newPricing.a4ColorDoubleSideRate,
                    "photoA4Rate" to newPricing.photoA4Rate,
                    "photo4x6Rate" to newPricing.photo4x6Rate,
                    "passport8Rate" to newPricing.passport8Rate,
                    "scanPerPageRate" to newPricing.scanPerPageRate,
                    "shopName" to newPricing.shopName
                )
            )
            val resp = ApiClient.service.updatePricingSettings(map)
            if (resp.isSuccessful) {
                pricingDao.savePricing(newPricing)
                Result.success(Unit)
            } else {
                Result.failure(Exception("Failed to save pricing to backend"))
            }
        } catch (e: Exception) {
            Result.failure(e)
        }
    }
}
