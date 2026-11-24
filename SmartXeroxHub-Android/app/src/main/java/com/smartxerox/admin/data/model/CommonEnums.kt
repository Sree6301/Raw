package com.smartxerox.admin.data.model

enum class ServiceType {
    DOCUMENT,
    PHOTO,
    SCAN,
    PASSPORT
}

enum class DocumentOrderStatus {
    SUBMITTED,
    PENDING_ADMIN_APPROVAL,
    REJECTED,
    APPROVED,
    WAITING_FOR_PAPER,
    READY_TO_PRINT,
    FIRST_SIDE_PREPARATION,
    FIRST_SIDE_PRINTING,
    WAITING_FOR_PHYSICAL_CONFIRMATION,
    SECOND_SIDE_PRINTING,
    QUALITY_CHECK,
    COMPLETED,
    PAUSED,
    FAILED,
    CANCELLED
}

enum class DuplexStage {
    NOT_APPLICABLE,
    AWAITING_APPROVAL,
    PREPARING_FIRST_SIDE,
    PRINTING_FIRST_SIDE,
    FIRST_SIDE_COMPLETED,
    AWAITING_PAPER_REVERSAL,
    PAPER_REVERSAL_CONFIRMED,
    PRINTING_SECOND_SIDE,
    SECOND_SIDE_COMPLETED,
    AWAITING_QUALITY_CHECK,
    COMPLETED,
    ERROR_RECOVERY_PAUSED
}

enum class PhotoOrderStatus {
    SUBMITTED,
    PENDING_ADMIN_APPROVAL,
    APPROVED,
    WAITING_FOR_PHOTO_PAPER,
    PRINTING,
    COMPLETED,
    FAILED,
    REJECTED,
    CANCELLED
}

enum class ScanOrderStatus {
    SUBMITTED,
    PENDING_ADMIN_APPROVAL,
    APPROVED,
    WAITING_FOR_DOCUMENT,
    SCANNER_READY,
    SCANNING,
    REVIEWING_PAGES,
    GENERATING_FILE,
    UPLOADING,
    DOWNLOAD_AVAILABLE,
    COMPLETED,
    FAILED,
    CANCELLED
}

enum class PaperSize(val displayName: String, val widthMm: Float, val heightMm: Float) {
    A4("A4", 210f, 297f),
    PHOTO_4X6("4×6", 102f, 152f)
}

enum class PaperType(val displayName: String) {
    NORMAL_A4("Normal A4 (75-80 GSM)"),
    PHOTO_A4("Photo Glossy A4"),
    PHOTO_4X6("Photo Glossy 4×6"),
    PHOTO_GLOSSY_4X6("Photo Glossy 4×6"),
    PHOTO_GLOSSY_A4("Photo Glossy A4"),
    PHOTO_MATTE_A4("Photo Matte A4")
}

enum class PrintColorMode(val displayName: String) {
    BW("Black & White"),
    COLOR("Full Color")
}

enum class PrintSides(val displayName: String) {
    SINGLE("Single Sided"),
    MANUAL_DUPLEX("Manual Duplex (Double Sided)")
}

enum class PhotoFitMode {
    FIT,
    FILL,
    CROP
}

enum class ScanFormat {
    PDF,
    JPEG
}
