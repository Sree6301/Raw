package com.smartxerox.admin.data.model

data class PrinterDevice(
    val id: String,
    val name: String,
    val model: String = "HP Smart Tank 589",
    val connectionType: String = "WIFI", // WIFI, USB
    val ipAddress: String? = null,
    val port: Int = 631,
    val isDefault: Boolean = true,
    val status: String = "ONLINE" // ONLINE, OFFLINE, PRINTING, ERROR
)

data class PaperProfile(
    val id: String,
    val paperType: String,
    val displayName: String,
    val isCurrentlyLoaded: Boolean = false
)

data class PrintJobOptions(
    var dpi: Int = 600,
    var pagesPerSheet: Int = 1,
    var orientation: String = "PORTRAIT", // PORTRAIT, LANDSCAPE, AUTO
    var scalePercent: Double = 100.0,
    var paperType: String = "NORMAL_A4",
    var paperSize: String = "A4",
    var colorMode: String = "BW",
    var enableBorder: Boolean = false,
    var fitMode: String = "FIT"
)
