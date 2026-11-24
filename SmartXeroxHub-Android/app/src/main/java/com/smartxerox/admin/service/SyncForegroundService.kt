package com.smartxerox.admin.service

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.Context
import android.content.Intent
import android.os.Build
import android.os.IBinder
import androidx.core.app.NotificationCompat
import com.smartxerox.admin.BuildConfig
import com.smartxerox.admin.SmartXeroxApplication
import com.smartxerox.admin.data.remote.WebSocketManager
import com.smartxerox.admin.ui.MainActivity
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.cancel
import kotlinx.coroutines.launch

class SyncForegroundService : Service() {
    private val scope = CoroutineScope(Dispatchers.IO + SupervisorJob())
    private var webSocketManager: WebSocketManager? = null

    override fun onCreate() {
        super.onCreate()
        createNotificationChannel()
        val notification = buildNotification("Live Sync Active", "Connected to Smart Xerox backend")
        startForeground(NOTIFICATION_ID, notification)

        val app = application as SmartXeroxApplication
        val orderRepo = app.orderRepository

        webSocketManager = WebSocketManager(BuildConfig.BACKEND_WS_URL) { eventType, json ->
            scope.launch {
                when (eventType) {
                    "ORDER_CREATED", "PHOTO_ORDER_CREATED", "SCAN_ORDER_CREATED",
                    "ORDER_UPDATED", "PHOTO_ORDER_UPDATED", "SCAN_ORDER_UPDATED",
                    "ORDER_CANCELLED", "ORDER_CLAIMED", "DUPLEX_STAGE_CHANGED" -> {
                        orderRepo.refreshOrders()
                        updateNotification("New Activity", "Received event: $eventType")
                    }
                }
            }
        }
        webSocketManager?.connect()

        scope.launch {
            orderRepo.refreshOrders()
        }
    }

    private fun createNotificationChannel() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            val channel = NotificationChannel(
                CHANNEL_ID,
                "Smart Xerox Sync Service",
                NotificationManager.IMPORTANCE_LOW
            ).apply {
                description = "Keeps print orders and scanner status synchronized in real time"
            }
            val manager = getSystemService(NotificationManager::class.java)
            manager.createNotificationChannel(channel)
        }
    }

    private fun buildNotification(title: String, text: String): Notification {
        val pendingIntent = PendingIntent.getActivity(
            this,
            0,
            Intent(this, MainActivity::class.java),
            PendingIntent.FLAG_IMMUTABLE
        )

        return NotificationCompat.Builder(this, CHANNEL_ID)
            .setContentTitle(title)
            .setContentText(text)
            .setSmallIcon(android.R.drawable.ic_menu_rotate)
            .setContentIntent(pendingIntent)
            .setOngoing(true)
            .build()
    }

    private fun updateNotification(title: String, text: String) {
        val manager = getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
        manager.notify(NOTIFICATION_ID, buildNotification(title, text))
    }

    override fun onDestroy() {
        super.onDestroy()
        webSocketManager?.disconnect()
        scope.cancel()
    }

    override fun onBind(intent: Intent?): IBinder? = null

    companion object {
        const val CHANNEL_ID = "smart_xerox_sync_channel"
        const val NOTIFICATION_ID = 1001

        fun start(context: Context) {
            val intent = Intent(context, SyncForegroundService::class.java)
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                context.startForegroundService(intent)
            } else {
                context.startService(intent)
            }
        }

        fun stop(context: Context) {
            val intent = Intent(context, SyncForegroundService::class.java)
            context.stopService(intent)
        }
    }
}
