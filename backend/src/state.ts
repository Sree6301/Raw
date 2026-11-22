import fs from 'node:fs';
import path from 'node:path';
import {
  PrintOrder,
  PhotoOrder,
  ScanOrder,
  PrinterDevice,
  PaperProfile,
  ShopPricingConfig,
  GuestSession,
  DuplexJobPlan,
  calculateDuplexPages
} from '@smart-xerox-hub/shared';

export interface AppState {
  guestSessions: Map<string, GuestSession>;
  printOrders: Map<string, PrintOrder>;
  duplexJobs: Map<string, DuplexJobPlan>;
  photoOrders: Map<string, PhotoOrder>;
  scanOrders: Map<string, ScanOrder>;
  printerDevices: Map<string, PrinterDevice>;
  paperProfiles: Map<string, PaperProfile>;
  pricingConfig: ShopPricingConfig;
  auditLogs: Array<{ id: string; timestamp: string; actor: string; action: string; details: any }>;
}

const DATA_DIR = path.resolve(process.cwd(), 'data');
const DB_FILE = path.join(DATA_DIR, 'db.json');

export function initDefaultState(): AppState {
  return {
    guestSessions: new Map(),
    printOrders: new Map(),
    duplexJobs: new Map(),
    photoOrders: new Map(),
    scanOrders: new Map(),
    printerDevices: new Map([
      [
        'hp-smart-tank-usb',
        {
          id: 'hp-smart-tank-usb',
          name: 'HP Smart Tank 580-590 series (USB)',
          model: 'HP Smart Tank 589',
          connectionType: 'USB',
          portOrAddress: 'USB001',
          driverName: 'Microsoft IPP Class Driver',
          status: 'ONLINE',
          isDefault: true,
          activeQueueName: 'HP Smart Tank 580-590 series',
          lastSeenAt: new Date().toISOString(),
          supportsColor: true,
          supportsA4: true,
          supports4x6: true
        }
      ],
      [
        'hp-smart-tank-wifi',
        {
          id: 'hp-smart-tank-wifi',
          name: 'HP Smart Tank 580-590 series (Wi-Fi)',
          model: 'HP Smart Tank 589',
          connectionType: 'WIFI',
          portOrAddress: 'WSD-2101c964-4c10-4c6b-a4b4-fbb5c652032a',
          driverName: 'Microsoft IPP Class Driver',
          status: 'ONLINE',
          isDefault: false,
          activeQueueName: 'HP Smart Tank 580-590 series [5C4AE8]',
          lastSeenAt: new Date().toISOString(),
          supportsColor: true,
          supportsA4: true,
          supports4x6: true
        }
      ]
    ]),
    paperProfiles: new Map([
      [
        'NORMAL_A4',
        {
          id: 'p-normal-a4',
          paperType: 'NORMAL_A4',
          displayName: 'Normal Plain Paper A4 (75-80 GSM)',
          sheetWidthMm: 210,
          sheetHeightMm: 297,
          isCurrentlyLoaded: true,
          estimatedSheetsRemaining: 450,
          minThresholdAlert: 50,
          updatedAt: new Date().toISOString()
        }
      ],
      [
        'PHOTO_A4',
        {
          id: 'p-photo-a4',
          paperType: 'PHOTO_A4',
          displayName: 'Glossy Photo Paper A4 (180-200 GSM)',
          sheetWidthMm: 210,
          sheetHeightMm: 297,
          isCurrentlyLoaded: false,
          estimatedSheetsRemaining: 80,
          minThresholdAlert: 15,
          updatedAt: new Date().toISOString()
        }
      ],
      [
        'PHOTO_4X6',
        {
          id: 'p-photo-4x6',
          paperType: 'PHOTO_4X6',
          displayName: 'Glossy Photo Paper 4x6 inch (101.6 x 152.4 mm)',
          sheetWidthMm: 101.6,
          sheetHeightMm: 152.4,
          isCurrentlyLoaded: false,
          estimatedSheetsRemaining: 120,
          minThresholdAlert: 20,
          updatedAt: new Date().toISOString()
        }
      ]
    ]),
    pricingConfig: {
      a4BwSingleSideRate: 2.0,
      a4BwDoubleSideRate: 3.0,
      a4ColorSingleSideRate: 10.0,
      a4ColorDoubleSideRate: 18.0,
      photoA4Rate: 40.0,
      photo4x6Rate: 20.0,
      scanPerPageRate: 10.0,
      shopUpiId: 'smartxerox@upi',
      shopName: 'SMART XEROX HUB',
      defaultBwDpi: 300,
      defaultColorDpi: 300,
      defaultPhotoDpi: 600,
      defaultScanDpi: 300
    },
    auditLogs: []
  };
}

export function loadPersistedState(): AppState {
  const state = initDefaultState();
  if (fs.existsSync(DB_FILE)) {
    try {
      const raw = fs.readFileSync(DB_FILE, 'utf-8');
      const data = JSON.parse(raw);
      if (data.guestSessions) state.guestSessions = new Map(data.guestSessions);
      if (data.printOrders) state.printOrders = new Map(data.printOrders);
      if (data.duplexJobs) state.duplexJobs = new Map(data.duplexJobs);
      if (data.photoOrders) state.photoOrders = new Map(data.photoOrders);
      if (data.scanOrders) state.scanOrders = new Map(data.scanOrders);
      if (data.printerDevices) state.printerDevices = new Map(data.printerDevices);
      if (data.paperProfiles) state.paperProfiles = new Map(data.paperProfiles);
      if (data.pricingConfig) state.pricingConfig = data.pricingConfig;
      if (data.auditLogs) state.auditLogs = data.auditLogs;
    } catch (e) {
      console.warn('Could not parse persisted state, using default initialized state:', e);
    }
  }
  return state;
}

export function savePersistedState(state: AppState) {
  try {
    if (!fs.existsSync(DATA_DIR)) {
      fs.mkdirSync(DATA_DIR, { recursive: true });
    }
    const data = {
      guestSessions: Array.from(state.guestSessions.entries()),
      printOrders: Array.from(state.printOrders.entries()),
      duplexJobs: Array.from(state.duplexJobs.entries()),
      photoOrders: Array.from(state.photoOrders.entries()),
      scanOrders: Array.from(state.scanOrders.entries()),
      printerDevices: Array.from(state.printerDevices.entries()),
      paperProfiles: Array.from(state.paperProfiles.entries()),
      pricingConfig: state.pricingConfig,
      auditLogs: state.auditLogs.slice(-200) // keep last 200 logs
    };
    fs.writeFileSync(DB_FILE, JSON.stringify(data, null, 2), 'utf-8');
  } catch (err) {
    console.error('Failed to persist database state:', err);
  }
}
