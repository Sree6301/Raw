package com.smartxerox.admin.service

import android.content.Context
import androidx.work.CoroutineWorker
import androidx.work.WorkerParameters
import com.smartxerox.admin.SmartXeroxApplication

class BackgroundSyncWorker(
    appContext: Context,
    workerParams: WorkerParameters
) : CoroutineWorker(appContext, workerParams) {

    override suspend fun doWork(): Result {
        val app = applicationContext as SmartXeroxApplication
        return try {
            app.orderRepository.refreshOrders()
            app.pricingRepository.refreshPricing()
            Result.success()
        } catch (e: Exception) {
            Result.retry()
        }
    }
}
