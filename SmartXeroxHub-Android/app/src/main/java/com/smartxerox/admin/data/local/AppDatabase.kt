package com.smartxerox.admin.data.local

import android.content.Context
import androidx.room.Database
import androidx.room.Room
import androidx.room.RoomDatabase
import androidx.sqlite.db.SupportSQLiteDatabase
import com.smartxerox.admin.data.model.InventoryEntity
import com.smartxerox.admin.data.model.OrderEntity
import com.smartxerox.admin.data.model.PricingEntity
import com.smartxerox.admin.data.model.ScannedPageEntity
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch

@Database(
    entities = [
        OrderEntity::class,
        PricingEntity::class,
        InventoryEntity::class,
        ScannedPageEntity::class
    ],
    version = 1,
    exportSchema = false
)
abstract class AppDatabase : RoomDatabase() {
    abstract fun orderDao(): OrderDao
    abstract fun pricingDao(): PricingDao
    abstract fun inventoryDao(): InventoryDao
    abstract fun scannedPageDao(): ScannedPageDao

    companion object {
        @Volatile
        private var INSTANCE: AppDatabase? = null

        fun getDatabase(context: Context): AppDatabase {
            return INSTANCE ?: synchronized(this) {
                val instance = Room.databaseBuilder(
                    context.applicationContext,
                    AppDatabase::class.java,
                    "smart_xerox_hub.db"
                )
                .fallbackToDestructiveMigration()
                .addCallback(object : RoomDatabase.Callback() {
                    override fun onCreate(db: SupportSQLiteDatabase) {
                        super.onCreate(db)
                        // Seed default pricing and inventory
                        CoroutineScope(Dispatchers.IO).launch {
                            val database = getDatabase(context)
                            database.pricingDao().savePricing(PricingEntity())
                            database.inventoryDao().insertOrUpdate(
                                listOf(
                                    InventoryEntity("NORMAL_A4", "Normal A4 (75-80 GSM)", 500, 50),
                                    InventoryEntity("PHOTO_A4", "Glossy Photo Paper A4", 100, 20),
                                    InventoryEntity("PHOTO_4X6", "Glossy Photo Paper 4×6", 200, 30)
                                )
                            )
                        }
                    }
                })
                .build()
                INSTANCE = instance
                instance
            }
        }
    }
}
