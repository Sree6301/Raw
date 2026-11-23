/**
 * Smart Xerox Hub - Unified Shared Types & Domain Models
 * Shared across Customer Web, Admin Dashboard, Backend, and Windows Agent contracts
 */

// 1. Order Status State Machines
export type DocumentOrderStatus =
  | 'SUBMITTED'
  | 'PENDING_ADMIN_APPROVAL'
  | 'REJECTED'
  | 'APPROVED'
  | 'WAITING_FOR_PAPER'
  | 'READY_TO_PRINT'
  | 'FIRST_SIDE_PREPARATION'
  | 'FIRST_SIDE_PRINTING'
  | 'WAITING_FOR_PHYSICAL_CONFIRMATION'
  | 'SECOND_SIDE_PRINTING'
  | 'QUALITY_CHECK'
  | 'COMPLETED'
  | 'PAUSED'
  | 'FAILED'
  | 'CANCELLED';

export type DuplexStage =
  | 'NOT_APPLICABLE'
  | 'AWAITING_APPROVAL'
  | 'PREPARING_FIRST_SIDE'
  | 'PRINTING_FIRST_SIDE'
  | 'FIRST_SIDE_COMPLETED'
  | 'AWAITING_PAPER_REVERSAL'
  | 'PAPER_REVERSAL_CONFIRMED'
  | 'PRINTING_SECOND_SIDE'
  | 'SECOND_SIDE_COMPLETED'
  | 'AWAITING_QUALITY_CHECK'
  | 'COMPLETED'
  | 'ERROR_RECOVERY_PAUSED';

export type PhotoOrderStatus =
  | 'SUBMITTED'
  | 'PENDING_ADMIN_APPROVAL'
  | 'APPROVED'
  | 'WAITING_FOR_PHOTO_PAPER'
  | 'PRINTING'
  | 'COMPLETED'
  | 'FAILED'
  | 'REJECTED'
  | 'CANCELLED';

export type ScanOrderStatus =
  | 'SUBMITTED'
  | 'PENDING_ADMIN_APPROVAL'
  | 'APPROVED'
  | 'WAITING_FOR_DOCUMENT'
  | 'SCANNER_READY'
  | 'SCANNING'
  | 'REVIEWING_PAGES'
  | 'GENERATING_FILE'
  | 'UPLOADING'
  | 'DOWNLOAD_AVAILABLE'
  | 'COMPLETED'
  | 'FAILED'
  | 'CANCELLED';

// 2. Paper & Media Types
export type PaperSize = 'A4' | 'PHOTO_4X6' | '4X6';
export type PaperType = 'NORMAL_A4' | 'PHOTO_A4' | 'PHOTO_4X6' | 'PHOTO_GLOSSY_4X6' | 'PHOTO_GLOSSY_A4' | 'PHOTO_MATTE_A4';
export type PrintColorMode = 'BW' | 'COLOR';
export type PrintSides = 'SINGLE' | 'MANUAL_DUPLEX';
export type PhotoFitMode = 'FIT' | 'FILL' | 'CROP';
export type ScanFormat = 'PDF' | 'JPEG';
export type ScanResolution = 150 | 300 | 600;
export type ScanColorMode = 'COLOR' | 'GRAYSCALE';

// 3. Printer & Hardware Connection
export type ConnectionType = 'USB' | 'WIFI';
export type PrinterDeviceStatus = 'ONLINE' | 'OFFLINE' | 'PRINTING' | 'ERROR' | 'PAPER_JAM' | 'OUT_OF_PAPER';
export type AgentStatus = 'ONLINE' | 'OFFLINE' | 'BUSY';

// 4. Data Interfaces
export interface GuestSession {
  id: string;
  sessionToken: string;
  customerName?: string;
  customerPhone?: string;
  createdAt: string;
  expiresAt: string;
}

export interface OrderPrintSettings {
  dpi: number;
  pagesPerSheet: 1 | 2 | 4;
  orientation: 'PORTRAIT' | 'LANDSCAPE' | 'AUTO';
  scalePercent: number; // 50 - 150
  applyScope?: 'ALL' | 'PAGE';
  scope?: 'ALL_PAGES' | 'CURRENT_PAGE';
  targetPage?: number;
  paperType: PaperType;
  paperSize: PaperSize;
  colorMode: PrintColorMode;
  enableBorder?: boolean;
  fitMode?: 'FIT' | 'CROP';
  pageScales?: Record<number, number>;
  pageOrientations?: Record<number, 'PORTRAIT' | 'LANDSCAPE'>;
}

export interface PrintOrder {
  id: string;
  guestSessionId: string;
  orderNumber: string;
  serviceType: 'DOCUMENT' | 'PHOTO' | 'SCAN';
  status: DocumentOrderStatus;
  originalFileName: string;
  fileUrl: string;
  fileSizeBytes: number;
  totalPages: number;
  copies: number;
  pageRange: string; // e.g. "ALL" or "1-5, 8"
  paperSize: PaperSize;
  paperType: PaperType;
  colorMode: PrintColorMode;
  sides: PrintSides;
  duplexStage: DuplexStage;
  calculatedPrice: number;
  paymentStatus: 'UNPAID' | 'CASH_CONFIRMED' | 'UPI_CONFIRMED';
  paymentReference?: string;
  adminNotes?: string;
  printSettings?: OrderPrintSettings;
  createdAt: string;
  updatedAt: string;
}

export interface DuplexJobPlan {
  orderId: string;
  originalPageCount: number;
  normalizedPageCount: number; // N' = N if even, N+1 if odd
  hasBlankPageInserted: boolean;
  oddPagesFileUrl?: string; // 1, 3, 5...
  evenPagesReverseFileUrl?: string; // N', N'-2...
  currentCopyIndex: number;
  totalCopies: number;
  stage: DuplexStage;
  reversalInstructions: string;
}

export interface PhotoOrder {
  id: string;
  guestSessionId: string;
  orderNumber: string;
  status: PhotoOrderStatus;
  images: Array<{
    id: string;
    fileName: string;
    fileUrl: string;
    fileSizeBytes: number;
    fitMode: PhotoFitMode;
    rotationDegrees: number;
  }>;
  paperType: 'PHOTO_A4' | 'PHOTO_4X6';
  colorMode: PrintColorMode;
  copies: number;
  photosPerSheet: 1 | 2 | 4 | 8;
  photoType?: 'STANDARD' | 'PASSPORT_8';
  enableBorder?: boolean;
  orientation?: 'PORTRAIT' | 'LANDSCAPE';
  calculatedPrice: number;
  paymentStatus: 'UNPAID' | 'CASH_CONFIRMED' | 'UPI_CONFIRMED';
  printSettings?: OrderPrintSettings;
  createdAt: string;
  updatedAt?: string;
}

export interface ScanOrder {
  id: string;
  guestSessionId: string;
  orderNumber: string;
  status: ScanOrderStatus;
  format: ScanFormat;
  resolution: ScanResolution;
  colorMode: ScanColorMode;
  requestedPageCount: number;
  scannedPages: Array<{
    pageIndex: number;
    previewUrl: string;
    rotationDegrees: number;
  }>;
  finalFileUrl?: string;
  finalFileName?: string;
  calculatedPrice: number;
  paymentStatus: 'UNPAID' | 'CASH_CONFIRMED' | 'UPI_CONFIRMED';
  expiresAt?: string;
  createdAt: string;
}

export interface PrinterDevice {
  id: string;
  name: string;
  model: string; // e.g. "HP Smart Tank 580-590 series"
  connectionType: ConnectionType;
  portOrAddress: string;
  driverName: string;
  status: PrinterDeviceStatus;
  isDefault: boolean;
  activeQueueName: string;
  lastSeenAt: string;
  supportsColor: boolean;
  supportsA4: boolean;
  supports4x6: boolean;
}

export interface PaperProfile {
  id: string;
  paperType: PaperType;
  displayName: string;
  sheetWidthMm: number;
  sheetHeightMm: number;
  isCurrentlyLoaded: boolean;
  estimatedSheetsRemaining: number;
  minThresholdAlert: number;
  updatedAt: string;
}

export interface ShopPricingConfig {
  a4BwSingleSideRate: number; // e.g. 2.00
  a4BwDoubleSideRate: number; // e.g. 3.00 (or 1.50 per side)
  a4ColorSingleSideRate: number; // e.g. 10.00
  a4ColorDoubleSideRate: number; // e.g. 18.00
  photoA4Rate: number; // e.g. 40.00
  photo4x6Rate: number; // e.g. 20.00
  passport8Rate?: number; // e.g. 30.00 (8 passport photos on 4x6 HP Photo Paper)
  scanPerPageRate: number; // e.g. 10.00
  shopUpiId: string;
  shopName: string;
  defaultBwDpi?: number;
  defaultColorDpi?: number;
  defaultPhotoDpi?: number;
  defaultScanDpi?: number;
}

/**
 * Mathematical Duplex Calculation Helper
 * Ensures exact page sequencing according to section 7 specification:
 * If N is odd, append blank page -> N' = N + 1.
 * First print file: 1, 3, 5, ... ascending.
 * Second print file: N', N'-2, N'-4, ... 2 descending.
 */
export function calculateDuplexPages(totalPages: number): {
  normalizedTotal: number;
  blankPageAppended: boolean;
  firstSidePages: number[];
  secondSidePages: number[];
} {
  const blankPageAppended = totalPages % 2 !== 0;
  const normalizedTotal = blankPageAppended ? totalPages + 1 : totalPages;

  const firstSidePages: number[] = [];
  for (let p = 1; p <= normalizedTotal; p += 2) {
    firstSidePages.push(p);
  }

  const secondSidePages: number[] = [];
  for (let p = normalizedTotal; p >= 2; p -= 2) {
    secondSidePages.push(p);
  }

  return {
    normalizedTotal,
    blankPageAppended,
    firstSidePages,
    secondSidePages
  };
}
