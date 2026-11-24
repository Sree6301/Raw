import { GuestSession, PrintOrder, PhotoOrder, ScanOrder } from '@smart-xerox-hub/shared';

const SESSION_STORAGE_KEY = 'smart_xerox_guest_token';
const API_BASE = ((import.meta as any).env?.VITE_API_BASE_URL as string) || '';

export async function getOrCreateGuestSession(): Promise<GuestSession> {
  let token = localStorage.getItem(SESSION_STORAGE_KEY);
  if (token) {
    try {
      const res = await fetch(`${API_BASE}/api/sessions/verify/${token}`);
      const data = await res.json();
      if (data.success && data.session) {
        return data.session;
      }
    } catch (e) {
      console.warn('Failed to verify existing session, creating new one');
    }
  }

  // Create new guest session
  const res = await fetch(`${API_BASE}/api/sessions/create`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ customerName: 'Walk-in Customer' })
  });
  const data = await res.json();
  if (data.success && data.session) {
    localStorage.setItem(SESSION_STORAGE_KEY, data.session.sessionToken);
    return data.session;
  }
  throw new Error('Failed to create guest session');
}

export function getGuestToken(): string {
  return localStorage.getItem(SESSION_STORAGE_KEY) || '';
}

export async function submitDocumentOrder(formData: FormData): Promise<PrintOrder> {
  const token = getGuestToken();
  const res = await fetch(`${API_BASE}/api/orders/documents`, {
    method: 'POST',
    headers: {
      'x-guest-session-token': token
    },
    body: formData
  });
  const data = await res.json();
  if (!data.success) {
    throw new Error(data.error || 'Failed to submit document order');
  }
  return data.order;
}

export async function submitPhotoOrder(formData: FormData): Promise<PhotoOrder> {
  const token = getGuestToken();
  const res = await fetch(`${API_BASE}/api/orders/photos`, {
    method: 'POST',
    headers: {
      'x-guest-session-token': token
    },
    body: formData
  });
  const data = await res.json();
  if (!data.success) {
    throw new Error(data.error || 'Failed to submit photo order');
  }
  return data.order;
}

export async function submitScanOrder(payload: {
  format: 'PDF' | 'JPEG';
  resolution: number;
  colorMode: 'COLOR' | 'GRAYSCALE';
  requestedPages: number;
}): Promise<ScanOrder> {
  const token = getGuestToken();
  const res = await fetch(`${API_BASE}/api/orders/scans`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-guest-session-token': token
    },
    body: JSON.stringify(payload)
  });
  const data = await res.json();
  if (!data.success) {
    throw new Error(data.error || 'Failed to submit scan request');
  }
  return data.order;
}

export async function fetchGuestOrders(): Promise<{
  documents: Array<PrintOrder & { duplexJob?: any }>;
  photos: PhotoOrder[];
  scans: ScanOrder[];
}> {
  const token = getGuestToken();
  const res = await fetch(`${API_BASE}/api/orders/guest`, {
    headers: {
      'x-guest-session-token': token
    }
  });
  const data = await res.json();
  if (!data.success) {
    throw new Error(data.error || 'Failed to fetch orders');
  }
  return data.orders;
}

export async function cancelOrder(orderId: string): Promise<boolean> {
  const token = getGuestToken();
  const res = await fetch(`${API_BASE}/api/orders/${orderId}/cancel`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-guest-session-token': token
    }
  });
  const data = await res.json();
  if (!data.success) {
    throw new Error(data.error || 'Failed to cancel order');
  }
  return true;
}

export async function fetchPricing() {
  const res = await fetch(`${API_BASE}/api/settings`);
  const data = await res.json();
  return data.pricing;
}
