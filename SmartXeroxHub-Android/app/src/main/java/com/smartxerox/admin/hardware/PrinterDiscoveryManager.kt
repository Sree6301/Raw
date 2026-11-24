package com.smartxerox.admin.hardware

import android.content.Context
import android.hardware.usb.UsbConstants
import android.hardware.usb.UsbDevice
import android.hardware.usb.UsbManager
import android.net.nsd.NsdManager
import android.net.nsd.NsdServiceInfo
import android.util.Log
import com.smartxerox.admin.data.model.PrinterDevice
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import java.net.InetAddress

class PrinterDiscoveryManager(private val context: Context) {
    private val nsdManager = context.getSystemService(Context.NSD_SERVICE) as NsdManager
    private val usbManager = context.getSystemService(Context.USB_SERVICE) as UsbManager

    private val _discoveredPrinters = MutableStateFlow<List<PrinterDevice>>(emptyList())
    val discoveredPrinters: StateFlow<List<PrinterDevice>> = _discoveredPrinters.asStateFlow()

    private var discoveryListener: NsdManager.DiscoveryListener? = null
    private var isDiscovering = false

    fun startDiscovery() {
        checkUsbPrinters()
        startNsdDiscovery()
    }

    private fun checkUsbPrinters() {
        val deviceList = usbManager.deviceList
        for ((_, device) in deviceList) {
            // Check if device is a printer (class 7) or HP vendor ID (0x03F0 / 1008)
            var isPrinter = device.deviceClass == UsbConstants.USB_CLASS_PRINTER
            for (i in 0 until device.interfaceCount) {
                if (device.getInterface(i).interfaceClass == UsbConstants.USB_CLASS_PRINTER) {
                    isPrinter = true
                    break
                }
            }

            if (isPrinter || device.vendorId == 1008) {
                val devName = device.productName ?: "HP Smart Tank 589 (USB OTG)"
                val dev = PrinterDevice(
                    id = "usb_${device.deviceId}",
                    name = devName,
                    model = "HP Smart Tank 589",
                    connectionType = "USB",
                    status = "ONLINE",
                    isDefault = true
                )
                addOrUpdatePrinter(dev)
            }
        }
    }

    private fun startNsdDiscovery() {
        if (isDiscovering) return

        discoveryListener = object : NsdManager.DiscoveryListener {
            override fun onDiscoveryStarted(regType: String) {
                isDiscovering = true
                Log.d("PrinterDiscovery", "NSD discovery started for $regType")
            }

            override fun onServiceFound(service: NsdServiceInfo) {
                Log.d("PrinterDiscovery", "Service found: ${service.serviceName}")
                resolveService(service)
            }

            override fun onServiceLost(service: NsdServiceInfo) {
                Log.d("PrinterDiscovery", "Service lost: ${service.serviceName}")
            }

            override fun onDiscoveryStopped(serviceType: String) {
                isDiscovering = false
            }

            override fun onStartDiscoveryFailed(serviceType: String, errorCode: Int) {
                isDiscovering = false
                Log.e("PrinterDiscovery", "Start discovery failed: $errorCode")
            }

            override fun onStopDiscoveryFailed(serviceType: String, errorCode: Int) {
                isDiscovering = false
            }
        }

        try {
            nsdManager.discoverServices("_ipp._tcp.", NsdManager.PROTOCOL_DNS_SD, discoveryListener)
        } catch (e: Exception) {
            Log.e("PrinterDiscovery", "Error starting IPP discovery", e)
        }
    }

    private fun resolveService(serviceInfo: NsdServiceInfo) {
        val resolveListener = object : NsdManager.ResolveListener {
            override fun onResolveFailed(serviceInfo: NsdServiceInfo, errorCode: Int) {
                Log.w("PrinterDiscovery", "Resolve failed: $errorCode")
            }

            override fun onServiceResolved(serviceInfo: NsdServiceInfo) {
                val host = serviceInfo.host?.hostAddress ?: return
                val port = serviceInfo.port
                val name = serviceInfo.serviceName

                val dev = PrinterDevice(
                    id = "wifi_${host}_${port}",
                    name = name,
                    model = "HP Smart Tank 589",
                    connectionType = "WIFI",
                    ipAddress = host,
                    port = port,
                    status = "ONLINE",
                    isDefault = _discoveredPrinters.value.isEmpty()
                )
                addOrUpdatePrinter(dev)
            }
        }

        try {
            nsdManager.resolveService(serviceInfo, resolveListener)
        } catch (e: Exception) {
            Log.e("PrinterDiscovery", "Error resolving service", e)
        }
    }

    @Synchronized
    private fun addOrUpdatePrinter(device: PrinterDevice) {
        val current = _discoveredPrinters.value.toMutableList()
        val index = current.indexOfFirst { it.id == device.id }
        if (index >= 0) {
            current[index] = device
        } else {
            current.add(device)
        }
        _discoveredPrinters.value = current
    }

    fun stopDiscovery() {
        if (isDiscovering && discoveryListener != null) {
            try {
                nsdManager.stopServiceDiscovery(discoveryListener)
            } catch (e: Exception) {
                Log.e("PrinterDiscovery", "Error stopping discovery", e)
            }
            isDiscovering = false
        }
    }
}
