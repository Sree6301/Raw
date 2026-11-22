import express, { Request, Response } from 'express';
import multer from 'multer';
import path from 'node:path';
import fs from 'node:fs';
import crypto from 'node:crypto';
import { PDFDocument } from 'pdf-lib';
import archiver from 'archiver';
import {
  DocumentOrderStatus,
  DuplexStage,
  PhotoOrderStatus,
  PrintOrder,
  PhotoOrder,
  ScanOrder,
  GuestSession
} from '@smart-xerox-hub/shared';
import { AppState, savePersistedState } from './state.js';
import { processPdfForManualDuplex } from './duplex.js';

export function getNextOrderNumber(state: AppState, serviceType: 'D' | 'S' | 'P'): string {
  const now = new Date();
  const dd = String(now.getDate()).padStart(2, '0');
  const mm = String(now.getMonth() + 1).padStart(2, '0');
  const yy = String(now.getFullYear()).slice(-2);
  const dateStr = `${dd}${mm}${yy}`; // e.g. 221126

  let count = 1;
  if (serviceType === 'D') {
    count = state.printOrders.size + 1;
  } else if (serviceType === 'S') {
    count = state.scanOrders.size + 1;
  } else if (serviceType === 'P') {
    count = state.photoOrders.size + 1;
  }
  return `${count}-${dateStr}${serviceType}`;
}

export function createRouter(
  state: AppState,
  broadcastEvent: (type: string, payload: any) => void,
  rawInputsDir: string,
  getAgentStatus?: () => any
): express.Router {
  const router = express.Router();

  const userUploadsDir = path.join(rawInputsDir, 'User_Uploads');
  const scansDir = path.join(rawInputsDir, 'Scans');
  const duplexDir = path.join(rawInputsDir, 'Duplex');

  [userUploadsDir, scansDir, duplexDir].forEach(dir => {
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  });

  // Storage engine for User Uploads (Documents & Photos)
  const userUploadStorage = multer.diskStorage({
    destination: (_req, _file, cb) => cb(null, userUploadsDir),
    filename: (_req, file, cb) => {
      const ext = path.extname(file.originalname);
      const base = path.basename(file.originalname, ext).replace(/[^a-zA-Z0-9_-]/g, '_');
      const safeName = `${Date.now()}_${base}${ext}`;
      cb(null, safeName);
    }
  });

  const scanStorage = multer.diskStorage({
    destination: (_req, _file, cb) => cb(null, scansDir),
    filename: (_req, file, cb) => {
      const ext = path.extname(file.originalname) || '.jpg';
      const safeName = `Scan_${Date.now()}_${crypto.randomBytes(4).toString('hex')}${ext}`;
      cb(null, safeName);
    }
  });

  const uploadDoc = multer({
    storage: userUploadStorage,
    limits: { fileSize: 100 * 1024 * 1024 }, // 100MB
    fileFilter: (_req, file, cb) => {
      if (file.mimetype === 'application/pdf') cb(null, true);
      else cb(new Error('Only PDF files are supported for document xerox/printing.'));
    }
  });

  const uploadPhoto = multer({
    storage: userUploadStorage,
    limits: { fileSize: 50 * 1024 * 1024 },
    fileFilter: (_req, file, cb) => {
      if (/image\/(jpeg|png|jpg)/.test(file.mimetype)) cb(null, true);
      else cb(new Error('Only JPEG, JPG, and PNG images are supported.'));
    }
  });

  const uploadScanFile = multer({
    storage: scanStorage,
    limits: { fileSize: 100 * 1024 * 1024 }
  });

  // 1. GUEST SESSIONS
  router.post('/sessions/create', (req: Request, res: Response) => {
    const sessionToken = crypto.randomBytes(24).toString('hex');
    const newSession: GuestSession = {
      id: crypto.randomUUID(),
      sessionToken,
      customerName: req.body.customerName || 'Walk-in Customer',
      customerPhone: req.body.customerPhone || '',
      createdAt: new Date().toISOString(),
      expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString()
    };
    state.guestSessions.set(sessionToken, newSession);
    savePersistedState(state);
    res.json({ success: true, session: newSession });
  });

  router.get('/sessions/verify/:token', (req: Request, res: Response) => {
    const session = state.guestSessions.get(req.params.token);
    if (!session) {
      return res.status(404).json({ success: false, error: 'Invalid or expired guest session' });
    }
    res.json({ success: true, session });
  });

  // 2. DOCUMENT ORDERS
  router.post('/orders/documents', uploadDoc.single('file'), async (req: Request, res: Response) => {
    try {
      if (!req.file) {
        return res.status(400).json({ success: false, error: 'No PDF file uploaded' });
      }

      const sessionToken = (req.headers['x-guest-session-token'] as string) || 'local-guest';
      let guestSession = state.guestSessions.get(sessionToken);
      if (!guestSession) {
        // Auto-create session if called locally from desktop software
        guestSession = {
          id: crypto.randomUUID(),
          sessionToken,
          customerName: 'Desk Customer',
          createdAt: new Date().toISOString(),
          expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString()
        };
        state.guestSessions.set(sessionToken, guestSession);
      }

      const filePath = req.file.path;
      const pdfBytes = fs.readFileSync(filePath);
      const pdfDoc = await PDFDocument.load(pdfBytes);
      const totalPages = pdfDoc.getPageCount();

      const copies = Math.max(1, parseInt(req.body.copies || '1', 10));
      const colorMode = req.body.colorMode === 'COLOR' ? 'COLOR' : 'BW';
      const sides = req.body.sides === 'MANUAL_DUPLEX' ? 'MANUAL_DUPLEX' : 'SINGLE';
      const pageRange = req.body.pageRange || 'ALL';

      // Price calculation
      let calculatedPrice = 0;
      const effectivePages = totalPages;
      if (sides === 'MANUAL_DUPLEX') {
        const ratePerSide = colorMode === 'COLOR' 
          ? state.pricingConfig.a4ColorDoubleSideRate / 2 
          : state.pricingConfig.a4BwDoubleSideRate / 2;
        calculatedPrice = effectivePages * ratePerSide * copies;
      } else {
        const ratePerSide = colorMode === 'COLOR' 
          ? state.pricingConfig.a4ColorSingleSideRate 
          : state.pricingConfig.a4BwSingleSideRate;
        calculatedPrice = effectivePages * ratePerSide * copies;
      }

      const orderId = crypto.randomUUID();
      const orderNumber = getNextOrderNumber(state, 'D');

      const newOrder: PrintOrder = {
        id: orderId,
        guestSessionId: guestSession.id,
        orderNumber,
        serviceType: 'DOCUMENT',
        status: 'SUBMITTED',
        originalFileName: req.file.originalname,
        fileUrl: `/uploads/documents/${path.basename(filePath)}`,
        fileSizeBytes: req.file.size,
        totalPages,
        copies,
        pageRange,
        paperSize: 'A4',
        paperType: 'NORMAL_A4',
        colorMode,
        sides,
        duplexStage: sides === 'MANUAL_DUPLEX' ? 'AWAITING_APPROVAL' : 'NOT_APPLICABLE',
        calculatedPrice: Math.round(calculatedPrice * 100) / 100,
        paymentStatus: 'UNPAID',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      };

      state.printOrders.set(orderId, newOrder);

      // If manual duplex, process the PDF right away into RAW_Inputs/Duplex
      if (sides === 'MANUAL_DUPLEX') {
        const duplexResult = await processPdfForManualDuplex(filePath, orderId, duplexDir);
        state.duplexJobs.set(orderId, {
          orderId,
          originalPageCount: duplexResult.originalPageCount,
          normalizedPageCount: duplexResult.normalizedPageCount,
          hasBlankPageInserted: duplexResult.blankPageAppended,
          oddPagesFileUrl: duplexResult.oddPagesRelativeUrl,
          evenPagesReverseFileUrl: duplexResult.evenPagesReverseRelativeUrl,
          currentCopyIndex: 1,
          totalCopies: copies,
          stage: 'AWAITING_APPROVAL',
          reversalInstructions: 'Flip paper stack horizontally and re-insert into top tray.'
        });
      }

      savePersistedState(state);
      broadcastEvent('ORDER_CREATED', { order: newOrder, duplex: state.duplexJobs.get(orderId) });

      res.json({ success: true, order: newOrder });
    } catch (err: any) {
      console.error('Error in document upload:', err);
      res.status(500).json({ success: false, error: err.message || 'Failed to process document' });
    }
  });

  // 3. PHOTO ORDERS
  router.post('/orders/photos', uploadPhoto.array('photos', 20), (req: Request, res: Response) => {
    try {
      const files = req.files as Express.Multer.File[];
      if (!files || files.length === 0) {
        return res.status(400).json({ success: false, error: 'No photos uploaded' });
      }

      const sessionToken = (req.headers['x-guest-session-token'] as string) || 'local-guest';
      let guestSession = state.guestSessions.get(sessionToken);
      if (!guestSession) {
        guestSession = {
          id: crypto.randomUUID(),
          sessionToken,
          customerName: 'Desk Customer',
          createdAt: new Date().toISOString(),
          expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString()
        };
        state.guestSessions.set(sessionToken, guestSession);
      }

      const paperType = req.body.paperType === 'PHOTO_4X6' ? 'PHOTO_4X6' : 'PHOTO_A4';
      const colorMode = req.body.colorMode === 'BW' ? 'BW' : 'COLOR';
      const copies = Math.max(1, parseInt(req.body.copies || '1', 10));
      const photosPerSheet = parseInt(req.body.photosPerSheet || '1', 10) as 1 | 2 | 4;

      const rate = paperType === 'PHOTO_4X6' ? state.pricingConfig.photo4x6Rate : state.pricingConfig.photoA4Rate;
      const calculatedPrice = rate * files.length * copies;

      const orderId = crypto.randomUUID();
      const orderNumber = getNextOrderNumber(state, 'P');

      const photoOrder: PhotoOrder = {
        id: orderId,
        guestSessionId: guestSession.id,
        orderNumber,
        status: 'SUBMITTED',
        paperType,
        colorMode,
        copies,
        photosPerSheet,
        calculatedPrice: Math.round(calculatedPrice * 100) / 100,
        paymentStatus: 'UNPAID',
        images: files.map(f => ({
          id: crypto.randomUUID(),
          fileName: f.originalname,
          fileUrl: `/uploads/photos/${path.basename(f.path)}`,
          fileSizeBytes: f.size,
          fitMode: 'FIT',
          rotationDegrees: 0
        })),
        createdAt: new Date().toISOString()
      };

      state.photoOrders.set(orderId, photoOrder);
      savePersistedState(state);
      broadcastEvent('PHOTO_ORDER_CREATED', { order: photoOrder });

      res.json({ success: true, order: photoOrder });
    } catch (err: any) {
      console.error('Error in photo order upload:', err);
      res.status(500).json({ success: false, error: err.message || 'Failed to process photos' });
    }
  });

  // 4. SCAN ORDERS
  router.post('/orders/scans', (req: Request, res: Response) => {
    try {
      const sessionToken = (req.headers['x-guest-session-token'] as string) || 'local-guest';
      let guestSession = state.guestSessions.get(sessionToken);
      if (!guestSession) {
        guestSession = {
          id: crypto.randomUUID(),
          sessionToken,
          customerName: 'Desk Customer',
          createdAt: new Date().toISOString(),
          expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString()
        };
        state.guestSessions.set(sessionToken, guestSession);
      }

      const format = req.body.format === 'JPEG' ? 'JPEG' : 'PDF';
      const resolution = parseInt(req.body.resolution || '300', 10) as 150 | 300 | 600;
      const colorMode = req.body.colorMode === 'GRAYSCALE' ? 'GRAYSCALE' : 'COLOR';
      const requestedPageCount = Math.max(1, parseInt(req.body.requestedPages || '1', 10));

      const calculatedPrice = requestedPageCount * state.pricingConfig.scanPerPageRate;

      const orderId = crypto.randomUUID();
      const orderNumber = getNextOrderNumber(state, 'S');

      const scanOrder: ScanOrder = {
        id: orderId,
        guestSessionId: guestSession.id,
        orderNumber,
        status: 'SUBMITTED',
        format,
        resolution,
        colorMode,
        requestedPageCount,
        scannedPages: [],
        calculatedPrice: Math.round(calculatedPrice * 100) / 100,
        paymentStatus: 'UNPAID',
        createdAt: new Date().toISOString()
      };

      state.scanOrders.set(orderId, scanOrder);
      savePersistedState(state);
      broadcastEvent('SCAN_ORDER_CREATED', { order: scanOrder });

      res.json({ success: true, order: scanOrder });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message || 'Failed to submit scan request' });
    }
  });

  // 5. GUEST ORDERS
  router.get('/orders/guest', (req: Request, res: Response) => {
    const sessionToken = req.headers['x-guest-session-token'] as string;
    const guestSession = state.guestSessions.get(sessionToken);
    if (!guestSession) {
      return res.status(401).json({ success: false, error: 'Invalid guest session' });
    }

    const printList = Array.from(state.printOrders.values())
      .filter(o => o.guestSessionId === guestSession.id)
      .map(o => ({
        ...o,
        duplexJob: state.duplexJobs.get(o.id)
      }));

    const photoList = Array.from(state.photoOrders.values())
      .filter(o => o.guestSessionId === guestSession.id);

    const scanList = Array.from(state.scanOrders.values())
      .filter(o => o.guestSessionId === guestSession.id);

    res.json({
      success: true,
      orders: {
        documents: printList,
        photos: photoList,
        scans: scanList
      }
    });
  });

  // 6. ADMIN DASHBOARD & WINDOWS AGENT ORDERS RETRIEVAL
  router.get('/admin/orders', (_req: Request, res: Response) => {
    const documents = Array.from(state.printOrders.values()).map(o => ({
      ...o,
      duplexJob: state.duplexJobs.get(o.id)
    }));
    const photos = Array.from(state.photoOrders.values());
    const scans = Array.from(state.scanOrders.values());

    res.json({
      success: true,
      documents,
      photos,
      scans,
      agentStatus: getAgentStatus ? getAgentStatus() : null
    });
  });

  // 6.5 SAVE ORDER PRINT SETTINGS (from Admin Modal)
  router.post('/admin/orders/:orderId/settings', (req: Request, res: Response) => {
    const { orderId } = req.params;
    const { printSettings } = req.body;

    if (state.printOrders.has(orderId)) {
      const order = state.printOrders.get(orderId)!;
      order.printSettings = printSettings;
      order.updatedAt = new Date().toISOString();
      savePersistedState(state);
      broadcastEvent('ORDER_UPDATED', { order });
      return res.json({ success: true, order });
    }

    if (state.photoOrders.has(orderId)) {
      const order = state.photoOrders.get(orderId)!;
      order.printSettings = printSettings;
      order.updatedAt = new Date().toISOString();
      savePersistedState(state);
      broadcastEvent('ORDER_UPDATED', { order });
      return res.json({ success: true, order });
    }

    res.status(404).json({ success: false, error: 'Order not found' });
  });

  // 7. DIRECT PRINT TRIGGER (from Admin Portal or Desktop Agent)
  router.post('/admin/orders/:orderId/print', (req: Request, res: Response) => {
    const { orderId } = req.params;
    const { printerName, printSettings } = req.body;

    if (state.printOrders.has(orderId)) {
      const order = state.printOrders.get(orderId)!;
      if (printSettings) order.printSettings = printSettings;
      order.status = order.sides === 'MANUAL_DUPLEX' ? 'FIRST_SIDE_PRINTING' : 'APPROVED';
      order.updatedAt = new Date().toISOString();

      savePersistedState(state);
      broadcastEvent('PRINT_TRIGGERED', {
        orderId,
        serviceType: 'DOCUMENT',
        order,
        duplex: state.duplexJobs.get(orderId),
        printerName: printerName || 'HP Smart Tank 580-590 series'
      });
      return res.json({ success: true, message: 'Print command dispatched to Windows Agent', order });
    }

    if (state.photoOrders.has(orderId)) {
      const order = state.photoOrders.get(orderId)!;
      if (printSettings) order.printSettings = printSettings;
      order.status = 'APPROVED';

      savePersistedState(state);
      broadcastEvent('PRINT_TRIGGERED', {
        orderId,
        serviceType: 'PHOTO',
        order,
        printerName: printerName || 'HP Smart Tank 580-590 series'
      });
      return res.json({ success: true, message: 'Photo print command dispatched to Windows Agent', order });
    }

    res.status(404).json({ success: false, error: 'Order not found' });
  });

  router.post('/admin/orders/:orderId/action', (req: Request, res: Response) => {
    const { orderId } = req.params;
    const { action, serviceType, notes, printSettings } = req.body;

    if (serviceType === 'DOCUMENT' && state.printOrders.has(orderId)) {
      const order = state.printOrders.get(orderId)!;
      if (printSettings) order.printSettings = printSettings;
      if (action === 'APPROVE') {
        order.status = 'APPROVED';
        broadcastEvent('PRINT_TRIGGERED', {
          orderId,
          serviceType: 'DOCUMENT',
          order,
          duplex: state.duplexJobs.get(orderId)
        });
      }
      else if (action === 'REJECT') order.status = 'REJECTED';
      else if (action === 'READY_TO_PRINT') order.status = 'READY_TO_PRINT';
      else if (action === 'PRINTING') order.status = 'FIRST_SIDE_PRINTING';
      else if (action === 'COMPLETE') {
        order.status = 'COMPLETED';
        // Auto-delete temporary cloud upload to free storage space
        // Local Windows Agent permanently retains RAW_Inputs/User_Uploads
        try {
          if (order.fileUrl) {
            const cloudFilePath = path.join(userUploadsDir, path.basename(order.fileUrl));
            if (fs.existsSync(cloudFilePath)) {
              fs.unlinkSync(cloudFilePath);
              console.log(`[StorageCleanup] Removed completed document from cloud server: ${path.basename(cloudFilePath)}`);
            }
          }
        } catch (delErr) {
          console.warn('[StorageCleanup] Could not remove cloud document:', delErr);
        }
      }
      else if (action === 'CANCEL') order.status = 'CANCELLED';
      if (notes) order.adminNotes = notes;
      order.updatedAt = new Date().toISOString();

      savePersistedState(state);
      broadcastEvent('ORDER_UPDATED', { order, duplex: state.duplexJobs.get(orderId) });
      return res.json({ success: true, order });
    }

    if (serviceType === 'PHOTO' && state.photoOrders.has(orderId)) {
      const order = state.photoOrders.get(orderId)!;
      if (action === 'APPROVE') {
        order.status = 'APPROVED';
        broadcastEvent('PRINT_TRIGGERED', {
          orderId,
          serviceType: 'PHOTO',
          order
        });
      }
      else if (action === 'PRINTING') order.status = 'PRINTING';
      else if (action === 'COMPLETE') {
        order.status = 'COMPLETED';
        // Auto-delete temporary cloud photo uploads to save storage space
        try {
          if (order.images && order.images.length > 0) {
            for (const img of order.images) {
              const cloudPhotoPath = path.join(userUploadsDir, path.basename(img.fileUrl));
              if (fs.existsSync(cloudPhotoPath)) {
                fs.unlinkSync(cloudPhotoPath);
                console.log(`[StorageCleanup] Removed completed photo from cloud server: ${path.basename(cloudPhotoPath)}`);
              }
            }
          }
        } catch (delErr) {
          console.warn('[StorageCleanup] Could not remove cloud photo:', delErr);
        }
      }
      else if (action === 'CANCEL') order.status = 'CANCELLED';

      savePersistedState(state);
      broadcastEvent('PHOTO_ORDER_UPDATED', { order });
      return res.json({ success: true, order });
    }

    if (serviceType === 'SCAN' && state.scanOrders.has(orderId)) {
      const order = state.scanOrders.get(orderId)!;
      if (action === 'APPROVE') order.status = 'APPROVED';
      else if (action === 'SCANNER_READY') order.status = 'SCANNER_READY';
      else if (action === 'SCANNING') order.status = 'SCANNING';
      else if (action === 'COMPLETE') {
        order.status = 'COMPLETED';
      }
      else if (action === 'CANCEL') order.status = 'CANCELLED';

      savePersistedState(state);
      broadcastEvent('SCAN_ORDER_UPDATED', { order });
      return res.json({ success: true, order });
    }

    res.status(404).json({ success: false, error: 'Order not found' });
  });

  // 8. DUPLEX STAGES
  router.post('/admin/duplex/:orderId/stage', (req: Request, res: Response) => {
    const { orderId } = req.params;
    const { stage } = req.body as { stage: DuplexStage };

    const order = state.printOrders.get(orderId);
    const duplex = state.duplexJobs.get(orderId);

    if (!order || !duplex) {
      return res.status(404).json({ success: false, error: 'Duplex order not found' });
    }

    duplex.stage = stage;
    if (stage === 'PRINTING_FIRST_SIDE') {
      order.status = 'FIRST_SIDE_PRINTING';
    } else if (stage === 'FIRST_SIDE_COMPLETED' || stage === 'AWAITING_PAPER_REVERSAL') {
      order.status = 'WAITING_FOR_PHYSICAL_CONFIRMATION';
    } else if (stage === 'PRINTING_SECOND_SIDE') {
      order.status = 'SECOND_SIDE_PRINTING';
    } else if (stage === 'COMPLETED') {
      order.status = 'COMPLETED';
      duplex.stage = 'COMPLETED';
    }

    order.duplexStage = stage;
    order.updatedAt = new Date().toISOString();

    savePersistedState(state);
    broadcastEvent('DUPLEX_STAGE_CHANGED', { order, duplex });
    res.json({ success: true, order, duplex });
  });

  // 9. SCANNER PAGES & DELIVERY (RAW_Inputs/Scans)
  router.post('/admin/scan/:orderId/acquire', (req: Request, res: Response) => {
    const { orderId } = req.params;
    const scanOrder = state.scanOrders.get(orderId);
    if (!scanOrder) {
      return res.status(404).json({ success: false, error: 'Scan order not found' });
    }

    // Find the latest physical scan in RAW_Inputs/Scans
    let latestScanPath: string | null = null;
    if (fs.existsSync(scansDir)) {
      const files = fs.readdirSync(scansDir)
        .filter(f => /\.(jpg|jpeg|png)$/i.test(f))
        .map(f => ({ name: f, time: fs.statSync(path.join(scansDir, f)).mtime.getTime() }))
        .sort((a, b) => b.time - a.time);

      if (files.length > 0) {
        latestScanPath = `/uploads/scans/${files[0].name}`;
      }
    }

    if (latestScanPath) {
      const pageIndex = scanOrder.scannedPages.length + 1;
      scanOrder.scannedPages.push({
        pageIndex,
        previewUrl: latestScanPath,
        rotationDegrees: 0
      });
      scanOrder.status = 'REVIEWING_PAGES';

      savePersistedState(state);
      broadcastEvent('SCAN_PAGE_ADDED', { order: scanOrder });
      return res.json({ success: true, order: scanOrder, scanPath: latestScanPath });
    }

    // Broadcast request to Windows Agent to acquire scan
    broadcastEvent('ACQUIRE_SCAN_REQUEST', { orderId, order: scanOrder });
    res.json({ success: true, message: 'Scan request sent to physical HP scanner agent', order: scanOrder });
  });

  router.post('/admin/scan/:orderId/page', uploadScanFile.single('pageImage'), (req: Request, res: Response) => {
    const { orderId } = req.params;
    const scanOrder = state.scanOrders.get(orderId);
    if (!scanOrder) {
      return res.status(404).json({ success: false, error: 'Scan order not found' });
    }
    if (!req.file) {
      return res.status(400).json({ success: false, error: 'No scan page image uploaded' });
    }

    const pageIndex = scanOrder.scannedPages.length + 1;
    const previewUrl = `/uploads/scans/${path.basename(req.file.path)}`;
    scanOrder.scannedPages.push({
      pageIndex,
      previewUrl,
      rotationDegrees: 0
    });
    scanOrder.status = 'REVIEWING_PAGES';

    savePersistedState(state);
    broadcastEvent('SCAN_PAGE_ADDED', { order: scanOrder });
    res.json({ success: true, order: scanOrder });
  });

  router.post('/admin/scan/:orderId/finish', async (req: Request, res: Response) => {
    const { orderId } = req.params;
    const scanOrder = state.scanOrders.get(orderId);
    if (!scanOrder || scanOrder.scannedPages.length === 0) {
      return res.status(400).json({ success: false, error: 'No scanned pages available to finish' });
    }

    try {
      scanOrder.status = 'GENERATING_FILE';

      if (scanOrder.format === 'PDF') {
        const mergedDoc = await PDFDocument.create();
        for (const page of scanOrder.scannedPages) {
          const imgFileName = path.basename(page.previewUrl);
          const imgPath = path.join(scansDir, imgFileName);
          if (fs.existsSync(imgPath)) {
            const imgBytes = fs.readFileSync(imgPath);
            let img;
            if (imgPath.endsWith('.png')) {
              img = await mergedDoc.embedPng(imgBytes);
            } else {
              img = await mergedDoc.embedJpg(imgBytes);
            }
            const pdfPage = mergedDoc.addPage([img.width, img.height]);
            pdfPage.drawImage(img, { x: 0, y: 0, width: img.width, height: img.height });
          }
        }
        const finalFileName = `ScannedDoc_${scanOrder.orderNumber}.pdf`;
        const finalFilePath = path.join(scansDir, finalFileName);
        fs.writeFileSync(finalFilePath, await mergedDoc.save());

        scanOrder.finalFileName = finalFileName;
        scanOrder.finalFileUrl = `/api/orders/scans/${scanOrder.id}/download`;
      } else {
        const firstPageName = path.basename(scanOrder.scannedPages[0].previewUrl);
        scanOrder.finalFileName = firstPageName;
        scanOrder.finalFileUrl = `/api/orders/scans/${scanOrder.id}/download`;
      }

      // If user requested e.g. 4 pages and admin completed with 3, recalculate fair price
      if (scanOrder.scannedPages.length > 0) {
        scanOrder.calculatedPrice = Math.round(scanOrder.scannedPages.length * state.pricingConfig.scanPerPageRate * 100) / 100;
      }

      scanOrder.status = 'DOWNLOAD_AVAILABLE';
      savePersistedState(state);
      broadcastEvent('SCAN_ORDER_COMPLETED', { order: scanOrder });

      res.json({ success: true, order: scanOrder });
    } catch (err: any) {
      console.error('Error generating final scan file:', err);
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // 9.5 SCAN DOWNLOAD ENDPOINTS (Direct binary attachment streams - avoids SPA index.html fallback)
  router.get('/orders/scans/:orderId/download', (req: Request, res: Response) => {
    const { orderId } = req.params;
    const scanOrder = state.scanOrders.get(orderId);
    if (!scanOrder) {
      return res.status(404).json({ success: false, error: 'Scan order not found' });
    }

    let filePath = '';
    const downloadName = scanOrder.finalFileName || `Scan_${scanOrder.orderNumber}.${scanOrder.format === 'PDF' ? 'pdf' : 'jpg'}`;

    if (scanOrder.finalFileName) {
      filePath = path.join(scansDir, scanOrder.finalFileName);
    }
    
    if (!filePath || !fs.existsSync(filePath)) {
      if (scanOrder.scannedPages.length > 0) {
        const fallbackName = path.basename(scanOrder.scannedPages[0].previewUrl);
        filePath = path.join(scansDir, fallbackName);
      }
    }

    if (!filePath || !fs.existsSync(filePath)) {
      return res.status(404).json({ success: false, error: 'Scanned file not found on server' });
    }

    const ext = path.extname(filePath).toLowerCase();
    const contentType = ext === '.pdf' ? 'application/pdf' : (ext === '.png' ? 'image/png' : 'image/jpeg');

    res.setHeader('Content-Type', contentType);
    res.setHeader('Content-Disposition', `attachment; filename="${downloadName}"`);
    fs.createReadStream(filePath).pipe(res);
  });

  router.get('/orders/scans/:orderId/download/page/:pageIndex', (req: Request, res: Response) => {
    const { orderId, pageIndex } = req.params;
    const scanOrder = state.scanOrders.get(orderId);
    if (!scanOrder) {
      return res.status(404).json({ success: false, error: 'Scan order not found' });
    }
    const idx = parseInt(pageIndex, 10);
    const page = scanOrder.scannedPages.find(p => p.pageIndex === idx);
    if (!page) {
      return res.status(404).json({ success: false, error: 'Requested scan page not found' });
    }
    const filename = path.basename(page.previewUrl);
    const filePath = path.join(scansDir, filename);
    if (!fs.existsSync(filePath)) {
      return res.status(404).json({ success: false, error: 'Page image file not found on server' });
    }
    const ext = path.extname(filePath).toLowerCase();
    const contentType = ext === '.png' ? 'image/png' : 'image/jpeg';
    res.setHeader('Content-Type', contentType);
    res.setHeader('Content-Disposition', `attachment; filename="Scan_${scanOrder.orderNumber}_page${idx}${ext}"`);
    fs.createReadStream(filePath).pipe(res);
  });

  router.get('/orders/scans/:orderId/download-zip', (req: Request, res: Response) => {
    const { orderId } = req.params;
    const scanOrder = state.scanOrders.get(orderId);
    if (!scanOrder || scanOrder.scannedPages.length === 0) {
      return res.status(404).json({ success: false, error: 'No scanned pages available for download' });
    }

    res.setHeader('Content-Type', 'application/zip');
    res.setHeader('Content-Disposition', `attachment; filename="Scan_${scanOrder.orderNumber}_AllPages.zip"`);

    const archiveCreator = (archiver as any).default || archiver;
    const archive = archiveCreator('zip', { zlib: { level: 9 } });
    archive.pipe(res);

    scanOrder.scannedPages.forEach((p, i) => {
      const filename = path.basename(p.previewUrl);
      const filePath = path.join(scansDir, filename);
      if (fs.existsSync(filePath)) {
        const ext = path.extname(filePath) || '.jpg';
        archive.file(filePath, { name: `Page_${i + 1}${ext}` });
      }
    });

    archive.finalize();
  });

  // 10. HARDWARE & DEVICES API
  router.get('/devices', (_req: Request, res: Response) => {
    res.json({
      success: true,
      devices: Array.from(state.printerDevices.values()),
      paperProfiles: Array.from(state.paperProfiles.values())
    });
  });

  router.post('/devices/select', (req: Request, res: Response) => {
    const { deviceId } = req.body;
    state.printerDevices.forEach((dev, id) => {
      dev.isDefault = id === deviceId;
    });
    savePersistedState(state);
    broadcastEvent('PRINTER_SELECTION_CHANGED', { devices: Array.from(state.printerDevices.values()) });
    res.json({ success: true, devices: Array.from(state.printerDevices.values()) });
  });

  router.post('/devices/paper/toggle', (req: Request, res: Response) => {
    const { paperType } = req.body;
    state.paperProfiles.forEach((p, type) => {
      p.isCurrentlyLoaded = type === paperType;
    });
    savePersistedState(state);
    broadcastEvent('PAPER_PROFILE_CHANGED', { profiles: Array.from(state.paperProfiles.values()) });
    res.json({ success: true, profiles: Array.from(state.paperProfiles.values()) });
  });

  // 11. SETTINGS & PRICING
  router.get('/settings', (_req: Request, res: Response) => {
    res.json({ success: true, pricing: state.pricingConfig });
  });

  router.post('/settings', (req: Request, res: Response) => {
    if (req.body.pricing) {
      state.pricingConfig = { ...state.pricingConfig, ...req.body.pricing };
      savePersistedState(state);
      broadcastEvent('SETTINGS_UPDATED', { pricing: state.pricingConfig });
    }
    res.json({ success: true, pricing: state.pricingConfig });
  });

  router.get('/admin/pricing', (_req: Request, res: Response) => {
    res.json({ success: true, pricing: state.pricingConfig });
  });

  router.post('/admin/pricing', (req: Request, res: Response) => {
    if (req.body.pricing) {
      state.pricingConfig = { ...state.pricingConfig, ...req.body.pricing };
      savePersistedState(state);
      broadcastEvent('SETTINGS_UPDATED', { pricing: state.pricingConfig });
    }
    res.json({ success: true, pricing: state.pricingConfig });
  });

  // 12. AGENT SYNC API
  router.get('/agent/sync', (_req: Request, res: Response) => {
    const pendingDocuments = Array.from(state.printOrders.values())
      .filter(o => ['APPROVED', 'FIRST_SIDE_PRINTING', 'SECOND_SIDE_PRINTING'].includes(o.status))
      .map(o => ({
        order: o,
        duplex: state.duplexJobs.get(o.id)
      }));

    const pendingPhotos = Array.from(state.photoOrders.values())
      .filter(o => ['APPROVED', 'PRINTING'].includes(o.status));

    const pendingScans = Array.from(state.scanOrders.values())
      .filter(o => ['APPROVED', 'SCANNER_READY', 'SCANNING'].includes(o.status));

    res.json({
      success: true,
      pendingDocuments,
      pendingPhotos,
      pendingScans
    });
  });

  router.post('/agent/heartbeat', (req: Request, res: Response) => {
    const { printers } = req.body;
    if (Array.isArray(printers)) {
      for (const p of printers) {
        if (state.printerDevices.has(p.id)) {
          const dev = state.printerDevices.get(p.id)!;
          dev.status = p.status || 'ONLINE';
          dev.lastSeenAt = new Date().toISOString();
        }
      }
    }
    res.json({ success: true, timestamp: new Date().toISOString() });
  });

  return router;
}

export function runTenDayScanRetentionCleanup(scansDir: string): void {
  try {
    if (!fs.existsSync(scansDir)) return;
    const now = Date.now();
    const tenDaysMs = 10 * 24 * 60 * 60 * 1000;
    const files = fs.readdirSync(scansDir);
    let count = 0;
    for (const f of files) {
      const fullPath = path.join(scansDir, f);
      try {
        const stats = fs.statSync(fullPath);
        if (now - stats.mtimeMs > tenDaysMs) {
          fs.unlinkSync(fullPath);
          count++;
        }
      } catch {}
    }
    if (count > 0) {
      console.log(`[ScanRetention] Auto-deleted ${count} scanned files older than 10 days from cloud storage`);
    }
  } catch (err) {
    console.error('[ScanRetention] Error running 10-day retention cleanup:', err);
  }
}
