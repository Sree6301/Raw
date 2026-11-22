import {
  PrintOrder,
  PhotoOrder,
  ScanOrder,
  PrinterDevice,
  PaperProfile,
  ShopPricingConfig,
  DuplexStage
} from '@smart-xerox-hub/shared';

const API_BASE = ((import.meta as any).env?.VITE_API_BASE_URL as string) || '';

export async function fetchAdminOrders(): Promise<{
  documents: Array<PrintOrder & { duplexJob?: any }>;
  photos: PhotoOrder[];
  scans: ScanOrder[];
  agentStatus?: {
    connected: boolean;
    agentName: string;
    activePrinter: string;
    port: string;
    lastSeen: string;
  };
}> {
  const res = await fetch(`${API_BASE}/api/admin/orders`);
  const data = await res.json();
  return {
    documents: data.documents || [],
    photos: data.photos || [],
    scans: data.scans || [],
    agentStatus: data.agentStatus
  };
}

export async function updateOrderAction(
  orderId: string,
  serviceType: 'DOCUMENT' | 'PHOTO' | 'SCAN',
  action: string,
  notes?: string
) {
  const res = await fetch(`${API_BASE}/api/admin/orders/${orderId}/action`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ serviceType, action, notes })
  });
  return res.json();
}

export async function updateDuplexStage(orderId: string, stage: DuplexStage) {
  const res = await fetch(`${API_BASE}/api/admin/duplex/${orderId}/stage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ stage })
  });
  return res.json();
}

export async function addScannedPage(orderId: string, imageFile: Blob) {
  const formData = new FormData();
  formData.append('pageImage', imageFile, 'scan-page.jpg');
  const res = await fetch(`${API_BASE}/api/admin/scan/${orderId}/page`, {
    method: 'POST',
    body: formData
  });
  return res.json();
}

export async function finishScanning(orderId: string) {
  const res = await fetch(`${API_BASE}/api/admin/scan/${orderId}/finish`, {
    method: 'POST'
  });
  return res.json();
}

export async function fetchHardwareStatus(): Promise<{
  devices: PrinterDevice[];
  paperProfiles: PaperProfile[];
}> {
  const res = await fetch(`${API_BASE}/api/devices`);
  const data = await res.json();
  return {
    devices: data.devices || [],
    paperProfiles: data.paperProfiles || []
  };
}

export async function selectActivePrinter(deviceId: string) {
  const res = await fetch(`${API_BASE}/api/devices/select`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ deviceId })
  });
  return res.json();
}

export async function togglePaperLoaded(paperType: string) {
  const res = await fetch(`${API_BASE}/api/devices/paper/toggle`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ paperType })
  });
  return res.json();
}

export async function fetchShopSettings(): Promise<ShopPricingConfig> {
  const res = await fetch(`${API_BASE}/api/settings`);
  const data = await res.json();
  return data.pricing;
}

export async function updateShopSettings(pricing: Partial<ShopPricingConfig>) {
  const res = await fetch(`${API_BASE}/api/settings`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ pricing })
  });
  return res.json();
}
