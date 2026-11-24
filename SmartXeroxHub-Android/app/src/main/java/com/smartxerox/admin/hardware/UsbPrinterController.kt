package com.smartxerox.admin.hardware

import android.app.PendingIntent
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.hardware.usb.*
import android.util.Log
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import java.io.File
import java.io.FileInputStream

class UsbPrinterController(private val context: Context) {
    private val usbManager = context.getSystemService(Context.USB_SERVICE) as UsbManager
    private val ACTION_USB_PERMISSION = "com.smartxerox.admin.USB_PERMISSION"

    var connectedDevice: UsbDevice? = null
        private set
    private var usbConnection: UsbDeviceConnection? = null
    private var usbInterface: UsbInterface? = null
    private var endpointOut: UsbEndpoint? = null

    fun findAttachedPrinter(): UsbDevice? {
        val deviceList = usbManager.deviceList
        for ((_, device) in deviceList) {
            if (device.deviceClass == UsbConstants.USB_CLASS_PRINTER || device.vendorId == 1008) {
                connectedDevice = device
                return device
            }
            for (i in 0 until device.interfaceCount) {
                if (device.getInterface(i).interfaceClass == UsbConstants.USB_CLASS_PRINTER) {
                    connectedDevice = device
                    return device
                }
            }
        }
        return null
    }

    fun requestPermission(device: UsbDevice, onGranted: (Boolean) -> Unit) {
        if (usbManager.hasPermission(device)) {
            openDevice(device)
            onGranted(true)
            return
        }

        val permissionIntent = PendingIntent.getBroadcast(
            context,
            0,
            Intent(ACTION_USB_PERMISSION),
            PendingIntent.FLAG_IMMUTABLE
        )

        val receiver = object : BroadcastReceiver() {
            override fun onReceive(c: Context?, intent: Intent?) {
                if (intent?.action == ACTION_USB_PERMISSION) {
                    val granted = intent.getBooleanExtra(UsbManager.EXTRA_PERMISSION_GRANTED, false)
                    if (granted) {
                        openDevice(device)
                    }
                    onGranted(granted)
                    context.unregisterReceiver(this)
                }
            }
        }

        context.registerReceiver(receiver, IntentFilter(ACTION_USB_PERMISSION))
        usbManager.requestPermission(device, permissionIntent)
    }

    private fun openDevice(device: UsbDevice): Boolean {
        val conn = usbManager.openDevice(device) ?: return false
        usbConnection = conn

        // Find Printer Interface and Bulk Out endpoint
        for (i in 0 until device.interfaceCount) {
            val iface = device.getInterface(i)
            for (e in 0 until iface.endpointCount) {
                val ep = iface.getEndpoint(e)
                if (ep.direction == UsbConstants.USB_DIR_OUT && ep.type == UsbConstants.USB_ENDPOINT_XFER_BULK) {
                    usbInterface = iface
                    endpointOut = ep
                    conn.claimInterface(iface, true)
                    Log.i("UsbPrinterController", "Successfully claimed printer bulk OUT endpoint: ${ep.address}")
                    return true
                }
            }
        }
        return false
    }

    suspend fun sendRawFile(file: File): Result<Unit> = withContext(Dispatchers.IO) {
        val conn = usbConnection
        val ep = endpointOut
        if (conn == null || ep == null) {
            return@withContext Result.failure(Exception("USB Printer is not connected or endpoint not claimed"))
        }

        try {
            FileInputStream(file).use { input ->
                val buffer = ByteArray(4096)
                var bytesRead: Int
                while (input.read(buffer).also { bytesRead = it } > 0) {
                    val transferred = conn.bulkTransfer(ep, buffer, bytesRead, 5000)
                    if (transferred < 0) {
                        return@withContext Result.failure(Exception("USB Bulk transfer failed with code: $transferred"))
                    }
                }
            }
            Result.success(Unit)
        } catch (e: Exception) {
            Result.failure(e)
        }
    }

    fun close() {
        try {
            if (usbInterface != null && usbConnection != null) {
                usbConnection?.releaseInterface(usbInterface)
            }
            usbConnection?.close()
        } catch (e: Exception) {
            Log.e("UsbPrinterController", "Error closing USB connection", e)
        }
        usbConnection = null
        usbInterface = null
        endpointOut = null
    }
}
