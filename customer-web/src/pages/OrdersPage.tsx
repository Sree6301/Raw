import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Box,
  Container,
  Typography,
  Card,
  CardContent,
  Stack,
  Chip,
  Button,
  IconButton,
  Divider,
  LinearProgress,
  Alert
} from '@mui/material';
import {
  ArrowLeft,
  FileText,
  Image as ImageIcon,
  Scan,
  Download,
  RotateCw,
  CheckCircle2,
  Clock,
  Printer,
  AlertCircle
} from 'lucide-react';
import { fetchGuestOrders } from '../api.js';
import { PrintOrder, PhotoOrder, ScanOrder } from '@smart-xerox-hub/shared';

export function OrdersPage() {
  const navigate = useNavigate();
  const [orders, setOrders] = useState<{
    documents: Array<PrintOrder & { duplexJob?: any }>;
    photos: PhotoOrder[];
    scans: ScanOrder[];
  }>({ documents: [], photos: [], scans: [] });
  const [loading, setLoading] = useState(true);

  const loadData = () => {
    fetchGuestOrders()
      .then(data => setOrders(data))
      .catch(console.error)
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    loadData();

    // Connect to WebSocket for instant updates
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${protocol}//${window.location.host}/ws`;
    let ws: WebSocket | null = null;
    try {
      ws = new WebSocket(wsUrl);
      ws.onmessage = () => {
        loadData();
      };
    } catch (e) {}

    // Polling fallback
    const interval = setInterval(loadData, 3000);
    return () => {
      clearInterval(interval);
      if (ws) ws.close();
    };
  }, []);

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'COMPLETED':
      case 'DOWNLOAD_AVAILABLE':
        return { bg: '#ecfdf5', text: '#047857', border: '#a7f3d0' };
      case 'FIRST_SIDE_PRINTING':
      case 'SECOND_SIDE_PRINTING':
      case 'PRINTING':
      case 'SCANNING':
        return { bg: '#eff6ff', text: '#1d4ed8', border: '#bfdbfe' };
      case 'WAITING_FOR_PHYSICAL_CONFIRMATION':
      case 'WAITING_FOR_PAPER':
        return { bg: '#fef3c7', text: '#b45309', border: '#fde68a' };
      default:
        return { bg: '#f1f5f9', text: '#475569', border: '#cbd5e1' };
    }
  };

  const totalOrders = orders.documents.length + orders.photos.length + orders.scans.length;

  return (
    <Container maxWidth="sm" sx={{ py: 3, pb: 8 }}>
      <Stack direction="row" alignItems="center" spacing={1} sx={{ mb: 2 }}>
        <IconButton onClick={() => navigate('/')} size="small">
          <ArrowLeft size={20} />
        </IconButton>
        <Typography variant="h6" sx={{ fontWeight: 700 }}>
          My Orders & Live Status
        </Typography>
      </Stack>

      {loading ? (
        <LinearProgress sx={{ my: 4 }} />
      ) : totalOrders === 0 ? (
        <Card sx={{ p: 4, textAlign: 'center', bgcolor: '#f8fafc' }}>
          <Clock size={40} color="#94a3b8" style={{ marginBottom: 12 }} />
          <Typography variant="subtitle1" sx={{ fontWeight: 700 }}>
            No Orders Placed Yet
          </Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
            Upload a document, print photos, or request a scan from the home screen.
          </Typography>
          <Button variant="contained" onClick={() => navigate('/')}>
            Explore Services
          </Button>
        </Card>
      ) : (
        <Stack spacing={2}>
          {/* Document Orders */}
          {orders.documents.map((doc) => {
            const sc = getStatusColor(doc.status);
            return (
              <Card key={doc.id}>
                <CardContent>
                  <Stack direction="row" justifyContent="space-between" alignItems="flex-start" sx={{ mb: 1 }}>
                    <Stack direction="row" spacing={1} alignItems="center">
                      <FileText size={20} color="#0284c7" />
                      <Typography variant="subtitle2" sx={{ fontWeight: 700 }}>
                        {doc.orderNumber}
                      </Typography>
                    </Stack>
                    <Chip
                      size="small"
                      label={doc.status.replace(/_/g, ' ')}
                      sx={{ bgcolor: sc.bg, color: sc.text, border: `1px solid ${sc.border}`, fontWeight: 700, fontSize: '0.75rem' }}
                    />
                  </Stack>

                  <Typography variant="body2" color="text.primary" sx={{ fontWeight: 600 }}>
                    {doc.originalFileName}
                  </Typography>

                  <Typography variant="caption" color="text.secondary">
                    {doc.totalPages} pages • {doc.copies} copy(s) • {doc.colorMode} • {doc.sides === 'MANUAL_DUPLEX' ? 'Manual Double-Sided' : 'Single-Sided'}
                  </Typography>

                  {/* Manual Duplex Workflow Indicator */}
                  {doc.sides === 'MANUAL_DUPLEX' && doc.duplexJob && (
                    <Box sx={{ mt: 1.5, p: 1.5, bgcolor: '#f0f9ff', borderRadius: 2, border: '1px solid #bae6fd' }}>
                      <Typography variant="caption" sx={{ fontWeight: 700, color: '#0369a1', display: 'block', mb: 0.5 }}>
                        Manual Duplex Progress:
                      </Typography>
                      <Typography variant="body2" sx={{ fontSize: '0.8rem', color: '#0c4a6e' }}>
                        {doc.duplexJob.stage === 'AWAITING_APPROVAL' && 'Awaiting operator approval at counter.'}
                        {doc.duplexJob.stage === 'PRINTING_FIRST_SIDE' && 'Printing Side 1 (Odd Pages: 1, 3, 5...)'}
                        {doc.duplexJob.stage === 'AWAITING_PAPER_REVERSAL' && 'Side 1 complete! Operator is reversing paper stack.'}
                        {doc.duplexJob.stage === 'PRINTING_SECOND_SIDE' && 'Printing Side 2 (Even Pages in Reverse)'}
                        {doc.duplexJob.stage === 'COMPLETED' && 'Double-sided printing complete! Ready for pickup.'}
                      </Typography>
                    </Box>
                  )}

                  <Divider sx={{ my: 1.5 }} />

                  <Stack direction="row" justifyContent="space-between" alignItems="center">
                    <Typography variant="subtitle2" sx={{ fontWeight: 700, color: '#166534' }}>
                      ₹{doc.calculatedPrice.toFixed(2)}
                    </Typography>
                    <Chip
                      size="small"
                      label={doc.paymentStatus}
                      variant="outlined"
                      sx={{ fontSize: '0.7rem' }}
                    />
                  </Stack>
                </CardContent>
              </Card>
            );
          })}

          {/* Photo Orders */}
          {orders.photos.map((pho) => {
            const sc = getStatusColor(pho.status);
            return (
              <Card key={pho.id}>
                <CardContent>
                  <Stack direction="row" justifyContent="space-between" alignItems="flex-start" sx={{ mb: 1 }}>
                    <Stack direction="row" spacing={1} alignItems="center">
                      <ImageIcon size={20} color="#059669" />
                      <Typography variant="subtitle2" sx={{ fontWeight: 700 }}>
                        {pho.orderNumber}
                      </Typography>
                    </Stack>
                    <Chip
                      size="small"
                      label={pho.status.replace(/_/g, ' ')}
                      sx={{ bgcolor: sc.bg, color: sc.text, border: `1px solid ${sc.border}`, fontWeight: 700, fontSize: '0.75rem' }}
                    />
                  </Stack>

                  <Typography variant="body2" sx={{ fontWeight: 600 }}>
                    {pho.images.length} Photo(s) • {pho.paperType === 'PHOTO_4X6' ? '4×6 inch Photo Paper' : 'A4 Photo Paper'}
                  </Typography>

                  <Typography variant="caption" color="text.secondary">
                    {pho.copies} copy(s) • {pho.colorMode}
                  </Typography>

                  <Divider sx={{ my: 1.5 }} />

                  <Stack direction="row" justifyContent="space-between" alignItems="center">
                    <Typography variant="subtitle2" sx={{ fontWeight: 700, color: '#166534' }}>
                      ₹{pho.calculatedPrice.toFixed(2)}
                    </Typography>
                    <Chip size="small" label={pho.paymentStatus} variant="outlined" sx={{ fontSize: '0.7rem' }} />
                  </Stack>
                </CardContent>
              </Card>
            );
          })}

          {/* Scan Orders with Instant Download */}
          {orders.scans.map((scn) => {
            const sc = getStatusColor(scn.status);
            return (
              <Card key={scn.id}>
                <CardContent>
                  <Stack direction="row" justifyContent="space-between" alignItems="flex-start" sx={{ mb: 1 }}>
                    <Stack direction="row" spacing={1} alignItems="center">
                      <Scan size={20} color="#7c3aed" />
                      <Typography variant="subtitle2" sx={{ fontWeight: 700 }}>
                        {scn.orderNumber}
                      </Typography>
                    </Stack>
                    <Chip
                      size="small"
                      label={scn.status.replace(/_/g, ' ')}
                      sx={{ bgcolor: sc.bg, color: sc.text, border: `1px solid ${sc.border}`, fontWeight: 700, fontSize: '0.75rem' }}
                    />
                  </Stack>

                  <Typography variant="body2" sx={{ fontWeight: 600 }}>
                    Physical Flatbed Scan • {scn.format} ({scn.resolution} DPI)
                  </Typography>

                  <Typography variant="caption" color="text.secondary">
                    {scn.scannedPages.length > 0 ? `${scn.scannedPages.length} page(s) captured` : `Requested: ${scn.requestedPageCount} page(s)`} • {scn.colorMode}
                  </Typography>

                  {/* Download Button if available */}
                  {scn.status === 'DOWNLOAD_AVAILABLE' && (() => {
                    const apiBase = ((import.meta as any).env?.VITE_API_BASE_URL as string) || '';
                    const downloadUrl = `${apiBase}/api/orders/scans/${scn.id}/download`;
                    const downloadZipUrl = `${apiBase}/api/orders/scans/${scn.id}/download-zip`;

                    if (scn.format === 'PDF') {
                      return (
                        <Box sx={{ mt: 2 }}>
                          <Button
                            variant="contained"
                            fullWidth
                            href={downloadUrl}
                            download={scn.finalFileName || `ScannedDoc_${scn.orderNumber}.pdf`}
                            startIcon={<Download size={18} />}
                            sx={{ bgcolor: '#059669', '&:hover': { bgcolor: '#047857' } }}
                          >
                            Download Scanned PDF Document
                          </Button>
                        </Box>
                      );
                    }

                    // JPEG format
                    if (scn.scannedPages && scn.scannedPages.length > 1) {
                      return (
                        <Box sx={{ mt: 2 }}>
                          <Stack spacing={1}>
                            <Button
                              variant="contained"
                              fullWidth
                              href={downloadZipUrl}
                              download={`${scn.orderNumber}_all_scans.zip`}
                              startIcon={<Download size={18} />}
                              sx={{ bgcolor: '#059669', '&:hover': { bgcolor: '#047857' } }}
                            >
                              Download All {scn.scannedPages.length} Pages (ZIP)
                            </Button>
                            <Typography variant="caption" sx={{ fontWeight: 600, color: '#334155', mt: 0.5, display: 'block' }}>
                              Or download individual JPG pages:
                            </Typography>
                            <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
                              {scn.scannedPages.map((p) => (
                                <Button
                                  key={p.pageIndex}
                                  size="small"
                                  variant="outlined"
                                  href={`${apiBase}/api/orders/scans/${scn.id}/download/page/${p.pageIndex}`}
                                  download={`${scn.orderNumber}_page${p.pageIndex}.jpg`}
                                  startIcon={<Download size={14} />}
                                >
                                  Page {p.pageIndex} (JPG)
                                </Button>
                              ))}
                            </Stack>
                          </Stack>
                        </Box>
                      );
                    }

                    return (
                      <Box sx={{ mt: 2 }}>
                        <Button
                          variant="contained"
                          fullWidth
                          href={downloadUrl}
                          download={`${scn.orderNumber}_page1.jpg`}
                          startIcon={<Download size={18} />}
                          sx={{ bgcolor: '#059669', '&:hover': { bgcolor: '#047857' } }}
                        >
                          Download Scanned JPG Image
                        </Button>
                      </Box>
                    );
                  })()}

                  <Divider sx={{ my: 1.5 }} />

                  <Stack direction="row" justifyContent="space-between" alignItems="center">
                    <Typography variant="subtitle2" sx={{ fontWeight: 700, color: '#166534' }}>
                      ₹{scn.calculatedPrice.toFixed(2)}
                    </Typography>
                    <Chip size="small" label={scn.paymentStatus} variant="outlined" sx={{ fontSize: '0.7rem' }} />
                  </Stack>
                </CardContent>
              </Card>
            );
          })}
        </Stack>
      )}
    </Container>
  );
}
