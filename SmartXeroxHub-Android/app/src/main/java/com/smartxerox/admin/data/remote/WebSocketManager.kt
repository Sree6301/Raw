package com.smartxerox.admin.data.remote

import android.content.Context
import android.util.Log
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch
import okhttp3.*
import java.util.concurrent.TimeUnit

class WebSocketManager(
    private val wsUrl: String,
    private val onEventReceived: (eventType: String, jsonString: String) -> Unit
) {
    private val client = OkHttpClient.Builder()
        .readTimeout(0, TimeUnit.MILLISECONDS)
        .pingInterval(15, TimeUnit.SECONDS)
        .retryOnConnectionFailure(true)
        .build()

    private var webSocket: WebSocket? = null
    private val scope = CoroutineScope(Dispatchers.IO + SupervisorJob())

    private val _isConnected = MutableStateFlow(false)
    val isConnected: StateFlow<Boolean> = _isConnected.asStateFlow()

    private var shouldReconnect = true

    fun connect() {
        shouldReconnect = true
        initWebSocket()
    }

    private fun initWebSocket() {
        try {
            val request = Request.Builder().url(wsUrl).build()
            webSocket = client.newWebSocket(request, object : WebSocketListener() {
                override fun onOpen(webSocket: WebSocket, response: Response) {
                    Log.i("WebSocketManager", "WebSocket Connected to $wsUrl")
                    _isConnected.value = true
                }

                override fun onMessage(webSocket: WebSocket, text: String) {
                    try {
                        val gson = com.google.gson.JsonParser.parseString(text).asJsonObject
                        val eventType = if (gson.has("type")) gson.get("type").asString else "UNKNOWN"
                        onEventReceived(eventType, text)
                    } catch (e: Exception) {
                        Log.e("WebSocketManager", "Failed to parse ws message", e)
                    }
                }

                override fun onClosing(webSocket: WebSocket, code: Int, reason: String) {
                    _isConnected.value = false
                }

                override fun onClosed(webSocket: WebSocket, code: Int, reason: String) {
                    _isConnected.value = false
                    scheduleReconnect()
                }

                override fun onFailure(webSocket: WebSocket, t: Throwable, response: Response?) {
                    Log.w("WebSocketManager", "WebSocket failure: ${t.message}")
                    _isConnected.value = false
                    scheduleReconnect()
                }
            })
        } catch (e: Exception) {
            Log.e("WebSocketManager", "Exception initiating websocket", e)
            scheduleReconnect()
        }
    }

    private fun scheduleReconnect() {
        if (!shouldReconnect) return
        scope.launch {
            delay(3000)
            if (shouldReconnect && !_isConnected.value) {
                Log.i("WebSocketManager", "Attempting WebSocket reconnect...")
                initWebSocket()
            }
        }
    }

    fun disconnect() {
        shouldReconnect = false
        webSocket?.close(1000, "Normal closure")
        webSocket = null
        _isConnected.value = false
    }
}
