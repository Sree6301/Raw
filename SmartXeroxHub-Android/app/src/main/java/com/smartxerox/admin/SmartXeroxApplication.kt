package com.smartxerox.admin

import android.app.Application
import com.smartxerox.admin.data.local.AppDatabase
import com.smartxerox.admin.data.repository.InventoryRepository
import com.smartxerox.admin.data.repository.OrderRepository
import com.smartxerox.admin.data.repository.PricingRepository
import com.smartxerox.admin.data.repository.ScannerRepository
import com.smartxerox.admin.hardware.PrinterDiscoveryManager
import com.smartxerox.admin.service.SyncForegroundService

class SmartXeroxApplication : Application() {
    val database by lazy { AppDatabase.getDatabase(this) }
    val orderRepository by lazy { OrderRepository(this, database.orderDao()) }
    val pricingRepository by lazy { PricingRepository(database.pricingDao()) }
    val inventoryRepository by lazy { InventoryRepository(database.inventoryDao()) }
    val scannerRepository by lazy { ScannerRepository(this, database.scannedPageDao()) }
    val printerDiscoveryManager by lazy { PrinterDiscoveryManager(this) }

    override fun onCreate() {
        super.onCreate()
        // Start live sync service & printer discovery
        SyncForegroundService.start(this)
        printerDiscoveryManager.startDiscovery()
    }
}
