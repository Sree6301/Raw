package com.smartxerox.admin.data.model

import androidx.room.Entity
import androidx.room.PrimaryKey
import com.google.gson.annotations.SerializedName

@Entity(tableName = "orders")
data class OrderEntity(
    @PrimaryKey
    val id: String,
    val orderNumber: String,
    val serviceType: String, // DOCUMENT, PHOTO, SCAN, PASSPORT
    val status: String,
    val originalFileName: String,
    val fileUrl: String,
    val totalPages: Int = 1,
    val copies: Int = 1,
    val colorMode: String = "BW",
    val sides: String = "SINGLE",
    val paperSize: String = "A4",
    val paperType: String = "NORMAL_A4",
    val calculatedPrice: Double = 0.0,
    val duplexStage: String = "NOT_APPLICABLE",
    val photosPerSheet: Int = 1,
    val photoType: String = "STANDARD",
    val enableBorder: Boolean = false,
    val orientation: String = "PORTRAIT",
    val requestedPagesCount: Int = 1,
    val scannedPagesCount: Int = 0,
    val claimedBy: String? = null,
    val claimedAt: String? = null,
    val finalFileName: String? = null,
    val finalFileUrl: String? = null,
    val localFilePath: String? = null,
    val createdAt: String = "",
    val updatedAt: String = ""
) {
    val isDocument: Boolean get() = serviceType.equals("DOCUMENT", ignoreCase = true)
    val isPhoto: Boolean get() = serviceType.equals("PHOTO", ignoreCase = true)
    val isScan: Boolean get() = serviceType.equals("SCAN", ignoreCase = true)
    val isPassport8: Boolean get() = serviceType.equals("PASSPORT", ignoreCase = true) || photoType == "PASSPORT_8" || photosPerSheet == 8
    val isDuplex: Boolean get() = sides.equals("MANUAL_DUPLEX", ignoreCase = true)
    val isCompleted: Boolean get() = status.equals("COMPLETED", ignoreCase = true) || status.equals("COMPLETE", ignoreCase = true)
    val isCancelled: Boolean get() = status.equals("CANCELLED", ignoreCase = true)
}

@Entity(tableName = "pricing")
data class PricingEntity(
    @PrimaryKey
    val id: Int = 1,
    val a4BwSingleSideRate: Double = 2.0,
    val a4BwDoubleSideRate: Double = 3.0,
    val a4ColorSingleSideRate: Double = 10.0,
    val a4ColorDoubleSideRate: Double = 18.0,
    val photoA4Rate: Double = 40.0,
    val photo4x6Rate: Double = 20.0,
    val passport8Rate: Double = 30.0,
    val scanPerPageRate: Double = 10.0,
    val shopName: String = "SMART XEROX HUB",
    val lastUpdated: Long = System.currentTimeMillis()
)

@Entity(tableName = "inventory")
data class InventoryEntity(
    @PrimaryKey
    val paperType: String, // NORMAL_A4, PHOTO_A4, PHOTO_4X6
    val name: String,
    val currentSheets: Int,
    val minThreshold: Int = 50,
    val lastRestocked: Long = System.currentTimeMillis()
) {
    val isLowStock: Boolean get() = currentSheets <= minThreshold
}

@Entity(tableName = "scanned_pages")
data class ScannedPageEntity(
    @PrimaryKey(autoGenerate = true)
    val id: Long = 0,
    val orderId: String,
    val pageIndex: Int,
    val localUri: String,
    val cloudUrl: String? = null,
    val rotationDegrees: Int = 0,
    val timestamp: Long = System.currentTimeMillis()
)
