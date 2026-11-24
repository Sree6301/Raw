package com.smartxerox.admin.data.repository

import com.smartxerox.admin.data.local.InventoryDao
import com.smartxerox.admin.data.model.InventoryEntity
import kotlinx.coroutines.flow.Flow

class InventoryRepository(
    private val inventoryDao: InventoryDao
) {
    val inventory: Flow<List<InventoryEntity>> = inventoryDao.getInventory()

    suspend fun deductPaper(paperType: String, sheets: Int): Boolean {
        return inventoryDao.deductPaper(paperType, sheets) > 0
    }

    suspend fun restockPaper(paperType: String, newSheetCount: Int) {
        inventoryDao.restockPaper(paperType, newSheetCount)
    }
}
