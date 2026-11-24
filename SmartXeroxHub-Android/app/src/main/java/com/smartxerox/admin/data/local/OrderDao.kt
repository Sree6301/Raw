package com.smartxerox.admin.data.local

import androidx.room.*
import com.smartxerox.admin.data.model.InventoryEntity
import com.smartxerox.admin.data.model.OrderEntity
import com.smartxerox.admin.data.model.PricingEntity
import com.smartxerox.admin.data.model.ScannedPageEntity
import kotlinx.coroutines.flow.Flow

@Dao
interface OrderDao {
    @Query("SELECT * FROM orders WHERE status != 'CANCELLED' ORDER BY createdAt DESC")
    fun getAllActiveOrders(): Flow<List<OrderEntity>>

    @Query("SELECT * FROM orders ORDER BY createdAt DESC")
    fun getAllOrders(): Flow<List<OrderEntity>>

    @Query("SELECT * FROM orders WHERE id = :orderId")
    suspend fun getOrderById(orderId: String): OrderEntity?

    @Query("SELECT * FROM orders WHERE id = :orderId")
    fun getOrderFlow(orderId: String): Flow<OrderEntity?>

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun insertOrUpdateOrders(orders: List<OrderEntity>)

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun insertOrUpdateOrder(order: OrderEntity)

    @Query("UPDATE orders SET status = :status, updatedAt = :updatedAt WHERE id = :orderId")
    suspend fun updateOrderStatus(orderId: String, status: String, updatedAt: String)

    @Query("UPDATE orders SET claimedBy = :claimedBy, claimedAt = :claimedAt, status = :status WHERE id = :orderId")
    suspend fun updateOrderClaim(orderId: String, claimedBy: String, claimedAt: String, status: String)

    @Query("UPDATE orders SET duplexStage = :stage, status = :status WHERE id = :orderId")
    suspend fun updateDuplexStage(orderId: String, stage: String, status: String)

    @Query("DELETE FROM orders WHERE id = :orderId")
    suspend fun deleteOrder(orderId: String)
}

@Dao
interface PricingDao {
    @Query("SELECT * FROM pricing WHERE id = 1")
    fun getPricing(): Flow<PricingEntity?>

    @Query("SELECT * FROM pricing WHERE id = 1")
    suspend fun getPricingSync(): PricingEntity?

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun savePricing(pricing: PricingEntity)
}

@Dao
interface InventoryDao {
    @Query("SELECT * FROM inventory")
    fun getInventory(): Flow<List<InventoryEntity>>

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun insertOrUpdate(items: List<InventoryEntity>)

    @Query("UPDATE inventory SET currentSheets = currentSheets - :usedSheets WHERE paperType = :paperType AND currentSheets >= :usedSheets")
    suspend fun deductPaper(paperType: String, usedSheets: Int): Int

    @Query("UPDATE inventory SET currentSheets = :newSheets, lastRestocked = :timestamp WHERE paperType = :paperType")
    suspend fun restockPaper(paperType: String, newSheets: Int, timestamp: Long = System.currentTimeMillis())
}

@Dao
interface ScannedPageDao {
    @Query("SELECT * FROM scanned_pages WHERE orderId = :orderId ORDER BY pageIndex ASC")
    fun getPagesForOrder(orderId: String): Flow<List<ScannedPageEntity>>

    @Query("SELECT * FROM scanned_pages WHERE orderId = :orderId ORDER BY pageIndex ASC")
    suspend fun getPagesForOrderSync(orderId: String): List<ScannedPageEntity>

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun insertPage(page: ScannedPageEntity): Long

    @Query("DELETE FROM scanned_pages WHERE id = :pageId")
    suspend fun deletePage(pageId: Long)

    @Query("DELETE FROM scanned_pages WHERE orderId = :orderId")
    suspend fun deleteAllForOrder(orderId: String)
}
