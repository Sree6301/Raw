import React, { useEffect, useState } from 'react';
import {
  Box,
  Drawer,
  AppBar,
  Toolbar,
  Typography,
  List,
  ListItem,
  ListItemButton,
  ListItemIcon,
  ListItemText,
  Container,
  Grid,
  Card,
  CardContent,
  Chip,
  Button,
  IconButton,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Paper,
  Stack,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Alert,
  TextField,
  Divider,
  Tab,
  Tabs
} from '@mui/material';
import {
  LayoutDashboard,
  FileText,
  Image as ImageIcon,
  Scan,
  Printer,
  Layers,
  Settings,
  CheckCircle2,
  XCircle,
  Play,
  RotateCw,
  RefreshCw,
  AlertTriangle,
  Upload,
  Plus
} from 'lucide-react';
import {
  fetchAdminOrders,
  updateOrderAction,
  updateDuplexStage,
  addScannedPage,
  finishScanning,
  fetchHardwareStatus,
  selectActivePrinter,
  togglePaperLoaded,
  fetchShopSettings,
  updateShopSettings
} from './api.js';
import {
  PrintOrder,
  PhotoOrder,
  ScanOrder,
  PrinterDevice,
  PaperProfile,
  ShopPricingConfig,
  DuplexStage
} from '@smart-xerox-hub/shared';

const DRAWER_WIDTH = 260;

export function App() {
  const [activeTab, setActiveTab] = useState<'overview' | 'documents' | 'photos' | 'scans' | 'printers' | 'paper' | 'settings'>('overview');
  const [orders, setOrders] = useState<{
    documents: Array<PrintOrder & { duplexJob?: any }>;
    photos: PhotoOrder[];
    scans: ScanOrder[];
  }>({ documents: [], photos: [], scans: [] });
  const [devices, setDevices] = useState<PrinterDevice[]>([]);
  const [paperProfiles, setPaperProfiles] = useState<PaperProfile[]>([]);
  const [pricing, setPricing] = useState<ShopPricingConfig | null>(null);
  const [agentStatus, setAgentStatus] = useState<{ connected: boolean; agentName: string; activePrinter: string; port: string; lastSeen: string } | null>(null);

  // Duplex Dialog State
  const [duplexModalOrder, setDuplexModalOrder] = useState<(PrintOrder & { duplexJob?: any }) | null>(null);

  // Scan Console State
  const [activeScanOrder, setActiveScanOrder] = useState<ScanOrder | null>(null);
  const [scannerScanning, setScannerScanning] = useState(false);

  const loadAllData = async () => {
    try {
      const [ordersData, hwData, settingsData] = await Promise.all([
        fetchAdminOrders(),
        fetchHardwareStatus(),
        fetchShopSettings()
      ]);
      setOrders(ordersData);
      if (ordersData.agentStatus) setAgentStatus(ordersData.agentStatus);
      setDevices(hwData.devices);
      setPaperProfiles(hwData.paperProfiles);
      setPricing(settingsData);
    } catch (e) {
      console.error('Failed to load admin data:', e);
    }
  };

  useEffect(() => {
    loadAllData();

    // WebSocket real-time subscription
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = ((import.meta as any).env?.VITE_WS_URL as string) || `${protocol}//${window.location.host}/ws`;
    let ws: WebSocket | null = null;
    try {
      ws = new WebSocket(wsUrl);
      ws.onmessage = (event) => {
        try {
          const msg = JSON.parse(event.data);
          if (msg.type === 'AGENT_STATUS' && msg.payload) {
            setAgentStatus(msg.payload);
          }
        } catch {}
        loadAllData();
      };
    } catch (e) {}

    const interval = setInterval(loadAllData, 4000);
    return () => {
      clearInterval(interval);
      if (ws) ws.close();
    };
  }, []);

  // Handlers
  const handleDocAction = async (orderId: string, action: string) => {
    await updateOrderAction(orderId, 'DOCUMENT', action);
    if (action === 'APPROVE') {
      try {
        await fetch(`/api/admin/orders/${orderId}/print`, { method: 'POST' });
      } catch (e) {
        console.warn('Could not dispatch print trigger:', e);
      }
    }
    loadAllData();
  };

  const handleDuplexStageChange = async (orderId: string, stage: DuplexStage) => {
    await updateDuplexStage(orderId, stage);
    if (duplexModalOrder && duplexModalOrder.id === orderId) {
      setDuplexModalOrder(prev => prev ? {
        ...prev,
        duplexStage: stage,
        duplexJob: prev.duplexJob ? { ...prev.duplexJob, stage } : undefined
      } : null);
    }
    loadAllData();
  };

  const handleScanPageCapture = async () => {
    if (!activeScanOrder) return;
    setScannerScanning(true);
    try {
      const res = await fetch(`/api/admin/scan/${activeScanOrder.id}/acquire`, {
        method: 'POST'
      });
      const data = await res.json();
      if (data.success && data.order) {
        setActiveScanOrder(data.order);
      }
      loadAllData();
    } catch (err) {
      console.error('Scan capture error:', err);
    } finally {
      setScannerScanning(false);
    }
  };

  const handleFinishScan = async () => {
    if (!activeScanOrder) return;
    await finishScanning(activeScanOrder.id);
    setActiveScanOrder(null);
    loadAllData();
  };

  // Metrics
  const pendingDocs = orders.documents.filter(d => ['SUBMITTED', 'PENDING_ADMIN_APPROVAL'].includes(d.status)).length;
  const activePrintJobs = orders.documents.filter(d => ['FIRST_SIDE_PRINTING', 'WAITING_FOR_PHYSICAL_CONFIRMATION', 'SECOND_SIDE_PRINTING'].includes(d.status)).length;
  const pendingScans = orders.scans.filter(s => ['SUBMITTED', 'APPROVED', 'SCANNER_READY', 'SCANNING'].includes(s.status)).length;
  const completedToday = orders.documents.filter(d => d.status === 'COMPLETED').length + orders.photos.filter(p => p.status === 'COMPLETED').length + orders.scans.filter(s => s.status === 'DOWNLOAD_AVAILABLE').length;

  return (
    <Box sx={{ display: 'flex' }}>
      {/* Sidebar Navigation */}
      <Drawer
        variant="permanent"
        sx={{
          width: DRAWER_WIDTH,
          flexShrink: 0,
          '& .MuiDrawer-paper': {
            width: DRAWER_WIDTH,
            boxSizing: 'border-box',
            bgcolor: '#0f172a',
            color: '#f8fafc',
            borderRight: 'none'
          }
        }}
      >
        <Box sx={{ p: 2, display: 'flex', alignItems: 'center', gap: 1.5 }}>
          <Box
            component="img"
            src="/logo.png"
            alt="Logo"
            sx={{ width: 44, height: 44, borderRadius: 2 }}
          />
          <Box>
            <Typography variant="subtitle1" sx={{ fontWeight: 800, lineHeight: 1.2 }}>
              SMART XEROX HUB
            </Typography>
            <Typography variant="caption" sx={{ color: '#94a3b8' }}>
              Admin Control Center
            </Typography>
          </Box>
        </Box>

        <Divider sx={{ borderColor: '#334155' }} />

        <List sx={{ px: 1.5, py: 2 }}>
          {[
            { id: 'overview', label: 'Dashboard Overview', icon: <LayoutDashboard size={18} /> },
            { id: 'documents', label: 'Document Xerox', icon: <FileText size={18} />, badge: pendingDocs },
            { id: 'photos', label: 'Photo Printing', icon: <ImageIcon size={18} /> },
            { id: 'scans', label: 'Flatbed Scanner', icon: <Scan size={18} />, badge: pendingScans },
            { id: 'printers', label: 'HP Printers & Queue', icon: <Printer size={18} /> },
            { id: 'paper', label: 'Paper Inventory', icon: <Layers size={18} /> },
            { id: 'settings', label: 'Pricing & Settings', icon: <Settings size={18} /> }
          ].map((item) => (
            <ListItem key={item.id} disablePadding sx={{ mb: 0.5 }}>
              <ListItemButton
                selected={activeTab === item.id}
                onClick={() => setActiveTab(item.id as any)}
                sx={{
                  borderRadius: 2,
                  py: 1.2,
                  '&.Mui-selected': {
                    bgcolor: '#0284c7',
                    color: 'white',
                    '&:hover': { bgcolor: '#0369a1' },
                    '& .MuiListItemIcon-root': { color: 'white' }
                  },
                  '&:hover': { bgcolor: '#1e293b' }
                }}
              >
                <ListItemIcon sx={{ color: '#94a3b8', minWidth: 36 }}>
                  {item.icon}
                </ListItemIcon>
                <ListItemText
                  primary={item.label}
                  primaryTypographyProps={{ fontSize: '0.875rem', fontWeight: 600 }}
                />
                {item.badge ? (
                  <Chip
                    size="small"
                    label={item.badge}
                    sx={{ height: 20, fontSize: '0.75rem', bgcolor: '#ef4444', color: 'white', fontWeight: 700 }}
                  />
                ) : null}
              </ListItemButton>
            </ListItem>
          ))}
        </List>

        {/* Windows Agent Status Widget at bottom of drawer */}
        <Box sx={{ mt: 'auto', p: 2, bgcolor: '#1e293b', m: 1.5, borderRadius: 2 }}>
          <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 0.5 }}>
            <Box sx={{ width: 8, height: 8, borderRadius: '50%', bgcolor: agentStatus?.connected ? '#10b981' : '#ef4444' }} />
            <Typography variant="caption" sx={{ fontWeight: 700, color: '#f8fafc' }}>
              HP Smart Tank 589
            </Typography>
          </Stack>
          <Typography variant="caption" sx={{ color: '#94a3b8', display: 'block' }}>
            Active Connection: {agentStatus?.port || 'USB001'}
          </Typography>
          <Typography variant="caption" sx={{ color: agentStatus?.connected ? '#34d399' : '#f87171', fontWeight: 600 }}>
            Agent: {agentStatus?.connected ? 'Online & Ready' : 'Disconnected / Offline'}
          </Typography>
        </Box>
      </Drawer>

      {/* Main Content Area */}
      <Box component="main" sx={{ flexGrow: 1, p: 3, bgcolor: '#f8fafc', minHeight: '100vh' }}>
        {/* Top Header */}
        <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 3 }}>
          <Box>
            <Typography variant="h5" sx={{ fontWeight: 800, color: '#0f172a' }}>
              {activeTab === 'overview' && 'Dashboard Overview'}
              {activeTab === 'documents' && 'Document Printing & Duplex Control'}
              {activeTab === 'photos' && 'Photo Printing Engine'}
              {activeTab === 'scans' && 'HP Flatbed Scanner Console'}
              {activeTab === 'printers' && 'Printer Hardware & Spooler Management'}
              {activeTab === 'paper' && 'Paper Profiles & Tray Inventory'}
              {activeTab === 'settings' && 'Pricing Matrix & Shop Settings'}
            </Typography>
            <Typography variant="body2" color="text.secondary">
              Managing live requests for HP Smart Tank 589 • Manual Duplex & Flatbed Scanner
            </Typography>
          </Box>
          <Button
            variant="outlined"
            size="small"
            startIcon={<RefreshCw size={16} />}
            onClick={loadAllData}
          >
            Refresh
          </Button>
        </Stack>

        {/* AGENT CONNECTIVITY WARNING BANNER */}
        {agentStatus && !agentStatus.connected ? (
          <Alert
            severity="error"
            icon={<AlertTriangle size={24} />}
            sx={{ mb: 3, borderRadius: 2, border: '1px solid #fca5a5', bgcolor: '#fef2f2' }}
          >
            <Typography variant="subtitle2" sx={{ fontWeight: 800 }}>
              ⚠️ WINDOWS 11 AGENT DISCONNECTED — HARDWARE PAUSED
            </Typography>
            <Typography variant="body2" sx={{ mt: 0.5 }}>
              The local desktop software (<strong>SmartXeroxHubAgent.exe</strong>) is not running on the Windows computer.
              Physical printing to <strong>HP Smart Tank 589</strong> and WIA flatbed scanning are paused until the .exe is launched.
            </Typography>
          </Alert>
        ) : (
          <Alert
            severity="success"
            icon={<CheckCircle2 size={20} />}
            sx={{ mb: 3, borderRadius: 2, border: '1px solid #86efac', bgcolor: '#f0fdf4' }}
          >
            <Typography variant="body2" sx={{ fontWeight: 600 }}>
              🟢 Windows 11 Desktop Agent Online • Physical HP Smart Tank 589 Connected ({agentStatus?.port || 'USB001'})
            </Typography>
          </Alert>
        )}

        {/* 1. OVERVIEW TAB */}
        {activeTab === 'overview' && (
          <Stack spacing={3}>
            {/* Metric Cards */}
            <Grid container spacing={2}>
              <Grid item xs={12} sm={6} md={3}>
                <Card>
                  <CardContent>
                    <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 700 }}>
                      PENDING APPROVAL
                    </Typography>
                    <Typography variant="h4" sx={{ fontWeight: 800, color: '#0284c7', mt: 0.5 }}>
                      {pendingDocs}
                    </Typography>
                    <Typography variant="caption" color="text.secondary">
                      Requires paper & settings check
                    </Typography>
                  </CardContent>
                </Card>
              </Grid>
              <Grid item xs={12} sm={6} md={3}>
                <Card>
                  <CardContent>
                    <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 700 }}>
                      ACTIVE PRINT JOBS
                    </Typography>
                    <Typography variant="h4" sx={{ fontWeight: 800, color: '#d97706', mt: 0.5 }}>
                      {activePrintJobs}
                    </Typography>
                    <Typography variant="caption" color="text.secondary">
                      Currently printing or flipping paper
                    </Typography>
                  </CardContent>
                </Card>
              </Grid>
              <Grid item xs={12} sm={6} md={3}>
                <Card>
                  <CardContent>
                    <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 700 }}>
                      PENDING SCAN REQUESTS
                    </Typography>
                    <Typography variant="h4" sx={{ fontWeight: 800, color: '#7c3aed', mt: 0.5 }}>
                      {pendingScans}
                    </Typography>
                    <Typography variant="caption" color="text.secondary">
                      Awaiting flatbed document placement
                    </Typography>
                  </CardContent>
                </Card>
              </Grid>
              <Grid item xs={12} sm={6} md={3}>
                <Card>
                  <CardContent>
                    <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 700 }}>
                      COMPLETED TODAY
                    </Typography>
                    <Typography variant="h4" sx={{ fontWeight: 800, color: '#059669', mt: 0.5 }}>
                      {completedToday}
                    </Typography>
                    <Typography variant="caption" color="text.secondary">
                      Delivered to customers
                    </Typography>
                  </CardContent>
                </Card>
              </Grid>
            </Grid>

            {/* Quick Action Alerts */}
            {activePrintJobs > 0 && (
              <Alert severity="warning" icon={<AlertTriangle size={20} />}>
                <strong>Attention:</strong> There are active manual duplex jobs in progress. Check the Document Xerox tab to confirm paper reversal!
              </Alert>
            )}

            {/* Recent Orders Table */}
            <Card>
              <CardContent>
                <Typography variant="subtitle1" sx={{ fontWeight: 700, mb: 2 }}>
                  Live Orders Queue
                </Typography>
                <TableContainer>
                  <Table size="small">
                    <TableHead>
                      <TableRow>
                        <TableCell><strong>Order #</strong></TableCell>
                        <TableCell><strong>Type</strong></TableCell>
                        <TableCell><strong>Details</strong></TableCell>
                        <TableCell><strong>Status</strong></TableCell>
                        <TableCell><strong>Price</strong></TableCell>
                        <TableCell align="right"><strong>Action</strong></TableCell>
                      </TableRow>
                    </TableHead>
                    <TableBody>
                      {orders.documents.slice(0, 5).map((doc) => (
                        <TableRow key={doc.id}>
                          <TableCell sx={{ fontWeight: 600 }}>{doc.orderNumber}</TableCell>
                          <TableCell>Document ({doc.sides === 'MANUAL_DUPLEX' ? 'Duplex' : 'Single'})</TableCell>
                          <TableCell>{doc.originalFileName} ({doc.totalPages}p × {doc.copies}c)</TableCell>
                          <TableCell>
                            <Chip size="small" label={doc.status} sx={{ fontWeight: 600, fontSize: '0.75rem' }} />
                          </TableCell>
                          <TableCell sx={{ fontWeight: 700 }}>₹{doc.calculatedPrice.toFixed(2)}</TableCell>
                          <TableCell align="right">
                            {doc.status === 'SUBMITTED' ? (
                              <Button size="small" variant="contained" onClick={() => handleDocAction(doc.id, 'APPROVE')}>
                                Approve
                              </Button>
                            ) : doc.sides === 'MANUAL_DUPLEX' ? (
                              <Button size="small" variant="outlined" color="primary" onClick={() => setDuplexModalOrder(doc)}>
                                Duplex Console
                              </Button>
                            ) : (
                              <Button size="small" variant="outlined" onClick={() => handleDocAction(doc.id, 'COMPLETE')}>
                                Complete
                              </Button>
                            )}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </TableContainer>
              </CardContent>
            </Card>
          </Stack>
        )}

        {/* 2. DOCUMENTS TAB */}
        {activeTab === 'documents' && (
          <Card>
            <CardContent>
              <Typography variant="subtitle1" sx={{ fontWeight: 700, mb: 2 }}>
                Document Printing & Duplex Jobs
              </Typography>
              <TableContainer>
                <Table>
                  <TableHead>
                    <TableRow>
                      <TableCell><strong>Order #</strong></TableCell>
                      <TableCell><strong>File Name</strong></TableCell>
                      <TableCell><strong>Pages</strong></TableCell>
                      <TableCell><strong>Copies</strong></TableCell>
                      <TableCell><strong>Color</strong></TableCell>
                      <TableCell><strong>Duplex / Single</strong></TableCell>
                      <TableCell><strong>Status</strong></TableCell>
                      <TableCell><strong>Price</strong></TableCell>
                      <TableCell align="right"><strong>Operator Actions</strong></TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {orders.documents.map((doc) => (
                      <TableRow key={doc.id}>
                        <TableCell sx={{ fontWeight: 700 }}>{doc.orderNumber}</TableCell>
                        <TableCell>
                          <a href={doc.fileUrl} target="_blank" rel="noreferrer" style={{ color: '#0284c7', textDecoration: 'none', fontWeight: 600 }}>
                            {doc.originalFileName}
                          </a>
                        </TableCell>
                        <TableCell>{doc.totalPages}</TableCell>
                        <TableCell>{doc.copies}</TableCell>
                        <TableCell>{doc.colorMode}</TableCell>
                        <TableCell>
                          <Chip
                            size="small"
                            label={doc.sides}
                            sx={{ bgcolor: doc.sides === 'MANUAL_DUPLEX' ? '#e0f2fe' : '#f1f5f9', fontWeight: 600 }}
                          />
                        </TableCell>
                        <TableCell>
                          <Chip size="small" label={doc.status} sx={{ fontWeight: 700 }} />
                        </TableCell>
                        <TableCell sx={{ fontWeight: 700 }}>₹{doc.calculatedPrice.toFixed(2)}</TableCell>
                        <TableCell align="right">
                          <Stack direction="row" spacing={1} justifyContent="flex-end">
                            {doc.status === 'SUBMITTED' && (
                              <>
                                <Button size="small" variant="contained" color="primary" onClick={() => handleDocAction(doc.id, 'APPROVE')}>
                                  Approve
                                </Button>
                                <Button size="small" variant="outlined" color="error" onClick={() => handleDocAction(doc.id, 'REJECT')}>
                                  Reject
                                </Button>
                              </>
                            )}

                            {doc.status === 'APPROVED' && doc.sides === 'MANUAL_DUPLEX' && (
                              <Button size="small" variant="contained" color="secondary" onClick={() => setDuplexModalOrder(doc)}>
                                Launch Duplex Control
                              </Button>
                            )}

                            {doc.status === 'APPROVED' && doc.sides === 'SINGLE' && (
                              <Button size="small" variant="contained" color="success" onClick={() => handleDocAction(doc.id, 'PRINTING')}>
                                Send to HP 589
                              </Button>
                            )}

                            {doc.sides === 'MANUAL_DUPLEX' && doc.status !== 'SUBMITTED' && (
                              <Button size="small" variant="outlined" onClick={() => setDuplexModalOrder(doc)}>
                                Duplex Progress
                              </Button>
                            )}

                            {doc.status !== 'COMPLETED' && doc.status !== 'REJECTED' && (
                              <Button size="small" variant="text" color="success" onClick={() => handleDocAction(doc.id, 'COMPLETE')}>
                                Mark Done
                              </Button>
                            )}
                          </Stack>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </TableContainer>
            </CardContent>
          </Card>
        )}

        {/* 3. SCANS TAB (FLATBED SCANNER CONSOLE) */}
        {activeTab === 'scans' && (
          <Stack spacing={3}>
            {/* Active Flatbed Scan Console */}
            {activeScanOrder && (
              <Card sx={{ border: '2px solid #7c3aed', bgcolor: '#faf5ff' }}>
                <CardContent>
                  <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 2 }}>
                    <Box>
                      <Typography variant="h6" sx={{ fontWeight: 800, color: '#581c87' }}>
                        Flatbed Scanning Console: {activeScanOrder.orderNumber}
                      </Typography>
                      <Typography variant="body2" color="text.secondary">
                        Target: {activeScanOrder.format} • {activeScanOrder.resolution} DPI • {activeScanOrder.colorMode}
                      </Typography>
                    </Box>
                    <Stack direction="row" spacing={1}>
                      <Button
                        variant="contained"
                        startIcon={<Scan size={18} />}
                        disabled={scannerScanning}
                        onClick={handleScanPageCapture}
                        sx={{ bgcolor: '#7c3aed', '&:hover': { bgcolor: '#6d28d9' } }}
                      >
                        {scannerScanning ? 'Scanning Flatbed Glass...' : 'Scan Page on Glass'}
                      </Button>
                      <Button
                        variant="contained"
                        color="success"
                        disabled={activeScanOrder.scannedPages.length === 0}
                        onClick={handleFinishScan}
                      >
                        Finish & Deliver to Customer
                      </Button>
                    </Stack>
                  </Stack>

                  {/* Scanned Pages Preview Grid */}
                  <Typography variant="subtitle2" sx={{ fontWeight: 700, mb: 1 }}>
                    Scanned Pages Captured ({activeScanOrder.scannedPages.length})
                  </Typography>
                  {activeScanOrder.scannedPages.length === 0 ? (
                    <Box sx={{ p: 4, textAlign: 'center', border: '1px dashed #d8b4fe', borderRadius: 2 }}>
                      <Typography variant="body2" color="text.secondary">
                        Place physical sheet face-down on HP Smart Tank 589 scanner glass, then click <strong>"Scan Page on Glass"</strong>.
                      </Typography>
                    </Box>
                  ) : (
                    <Grid container spacing={2}>
                      {activeScanOrder.scannedPages.map((page, idx) => (
                        <Grid item xs={3} key={idx}>
                          <Box sx={{ border: '1px solid #c084fc', borderRadius: 2, overflow: 'hidden', p: 1, bgcolor: 'white' }}>
                            <img src={page.previewUrl} alt={`Page ${idx + 1}`} style={{ width: '100%', height: 160, objectFit: 'contain' }} />
                            <Typography variant="caption" sx={{ fontWeight: 700, display: 'block', textAlign: 'center', mt: 0.5 }}>
                              Page {idx + 1}
                            </Typography>
                          </Box>
                        </Grid>
                      ))}
                    </Grid>
                  )}
                </CardContent>
              </Card>
            )}

            {/* Scan Requests Table */}
            <Card>
              <CardContent>
                <Typography variant="subtitle1" sx={{ fontWeight: 700, mb: 2 }}>
                  All Customer Scan Requests
                </Typography>
                <TableContainer>
                  <Table>
                    <TableHead>
                      <TableRow>
                        <TableCell><strong>Request #</strong></TableCell>
                        <TableCell><strong>Format</strong></TableCell>
                        <TableCell><strong>Resolution</strong></TableCell>
                        <TableCell><strong>Color Mode</strong></TableCell>
                        <TableCell><strong>Requested Pages</strong></TableCell>
                        <TableCell><strong>Status</strong></TableCell>
                        <TableCell><strong>Price</strong></TableCell>
                        <TableCell align="right"><strong>Action</strong></TableCell>
                      </TableRow>
                    </TableHead>
                    <TableBody>
                      {orders.scans.map((scn) => (
                        <TableRow key={scn.id}>
                          <TableCell sx={{ fontWeight: 700 }}>{scn.orderNumber}</TableCell>
                          <TableCell>{scn.format}</TableCell>
                          <TableCell>{scn.resolution} DPI</TableCell>
                          <TableCell>{scn.colorMode}</TableCell>
                          <TableCell>{scn.requestedPageCount}</TableCell>
                          <TableCell>
                            <Chip size="small" label={scn.status} sx={{ fontWeight: 700 }} />
                          </TableCell>
                          <TableCell sx={{ fontWeight: 700 }}>₹{scn.calculatedPrice.toFixed(2)}</TableCell>
                          <TableCell align="right">
                            {scn.status !== 'DOWNLOAD_AVAILABLE' ? (
                              <Button
                                size="small"
                                variant="contained"
                                sx={{ bgcolor: '#7c3aed' }}
                                onClick={() => setActiveScanOrder(scn)}
                              >
                                Open Scanner Console
                              </Button>
                            ) : (
                              <Chip size="small" label="Delivered" color="success" />
                            )}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </TableContainer>
              </CardContent>
            </Card>
          </Stack>
        )}

        {/* 4. PRINTERS TAB */}
        {activeTab === 'printers' && (
          <Stack spacing={3}>
            <Card>
              <CardContent>
                <Typography variant="subtitle1" sx={{ fontWeight: 700, mb: 2 }}>
                  HP Smart Tank 589 Hardware Discovery
                </Typography>
                <TableContainer>
                  <Table>
                    <TableHead>
                      <TableRow>
                        <TableCell><strong>Device Name</strong></TableCell>
                        <TableCell><strong>Connection</strong></TableCell>
                        <TableCell><strong>Port / Address</strong></TableCell>
                        <TableCell><strong>Driver</strong></TableCell>
                        <TableCell><strong>Status</strong></TableCell>
                        <TableCell><strong>Default Queue</strong></TableCell>
                        <TableCell align="right"><strong>Action</strong></TableCell>
                      </TableRow>
                    </TableHead>
                    <TableBody>
                      {devices.map((dev) => (
                        <TableRow key={dev.id}>
                          <TableCell sx={{ fontWeight: 700 }}>{dev.name}</TableCell>
                          <TableCell>
                            <Chip size="small" label={dev.connectionType} color={dev.connectionType === 'USB' ? 'primary' : 'secondary'} />
                          </TableCell>
                          <TableCell>{dev.portOrAddress}</TableCell>
                          <TableCell>{dev.driverName}</TableCell>
                          <TableCell>
                            <Chip size="small" label={dev.status} sx={{ bgcolor: '#ecfdf5', color: '#047857', fontWeight: 700 }} />
                          </TableCell>
                          <TableCell>{dev.isDefault ? 'Active Queue' : '-'}</TableCell>
                          <TableCell align="right">
                            {!dev.isDefault && (
                              <Button size="small" variant="outlined" onClick={() => selectActivePrinter(dev.id)}>
                                Set Active
                              </Button>
                            )}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </TableContainer>
              </CardContent>
            </Card>
          </Stack>
        )}

        {/* 5. PAPER INVENTORY TAB */}
        {activeTab === 'paper' && (
          <Card>
            <CardContent>
              <Typography variant="subtitle1" sx={{ fontWeight: 700, mb: 2 }}>
                Paper Trays & Media Profiles
              </Typography>
              <Grid container spacing={2}>
                {paperProfiles.map((p) => (
                  <Grid item xs={12} sm={4} key={p.id}>
                    <Card sx={{ border: p.isCurrentlyLoaded ? '2px solid #0284c7' : '1px solid #e2e8f0', p: 2 }}>
                      <Stack spacing={1}>
                        <Stack direction="row" justifyContent="space-between" alignItems="center">
                          <Typography variant="subtitle2" sx={{ fontWeight: 700 }}>
                            {p.displayName}
                          </Typography>
                          {p.isCurrentlyLoaded && <Chip size="small" label="Loaded" color="primary" />}
                        </Stack>
                        <Typography variant="caption" color="text.secondary">
                          Dimensions: {p.sheetWidthMm} × {p.sheetHeightMm} mm
                        </Typography>
                        <Typography variant="body2" sx={{ fontWeight: 700, color: p.estimatedSheetsRemaining < p.minThresholdAlert ? '#ef4444' : '#059669' }}>
                          Sheets Remaining: {p.estimatedSheetsRemaining}
                        </Typography>
                        <Button
                          size="small"
                          variant={p.isCurrentlyLoaded ? 'outlined' : 'contained'}
                          onClick={() => togglePaperLoaded(p.paperType)}
                        >
                          {p.isCurrentlyLoaded ? 'Loaded in Tray' : 'Confirm Loaded'}
                        </Button>
                      </Stack>
                    </Card>
                  </Grid>
                ))}
              </Grid>
            </CardContent>
          </Card>
        )}

        {/* 6. SETTINGS & PRICING TAB */}
        {activeTab === 'settings' && pricing && (
          <Card>
            <CardContent>
              <Typography variant="subtitle1" sx={{ fontWeight: 700, mb: 2 }}>
                Shop Pricing Matrix (Configurable)
              </Typography>
              <Grid container spacing={2}>
                <Grid item xs={6}>
                  <TextField
                    fullWidth
                    label="A4 B&W Single-Sided Rate (₹)"
                    type="number"
                    value={pricing.a4BwSingleSideRate}
                    onChange={(e) => setPricing({ ...pricing, a4BwSingleSideRate: parseFloat(e.target.value) || 0 })}
                  />
                </Grid>
                <Grid item xs={6}>
                  <TextField
                    fullWidth
                    label="A4 B&W Duplex Rate per Sheet (₹)"
                    type="number"
                    value={pricing.a4BwDoubleSideRate}
                    onChange={(e) => setPricing({ ...pricing, a4BwDoubleSideRate: parseFloat(e.target.value) || 0 })}
                  />
                </Grid>
                <Grid item xs={6}>
                  <TextField
                    fullWidth
                    label="A4 Color Single-Sided Rate (₹)"
                    type="number"
                    value={pricing.a4ColorSingleSideRate}
                    onChange={(e) => setPricing({ ...pricing, a4ColorSingleSideRate: parseFloat(e.target.value) || 0 })}
                  />
                </Grid>
                <Grid item xs={6}>
                  <TextField
                    fullWidth
                    label="A4 Color Duplex Rate per Sheet (₹)"
                    type="number"
                    value={pricing.a4ColorDoubleSideRate}
                    onChange={(e) => setPricing({ ...pricing, a4ColorDoubleSideRate: parseFloat(e.target.value) || 0 })}
                  />
                </Grid>
                <Grid item xs={6}>
                  <TextField
                    fullWidth
                    label="4×6 Photo Rate (₹)"
                    type="number"
                    value={pricing.photo4x6Rate}
                    onChange={(e) => setPricing({ ...pricing, photo4x6Rate: parseFloat(e.target.value) || 0 })}
                  />
                </Grid>
                <Grid item xs={6}>
                  <TextField
                    fullWidth
                    label="Flatbed Scan Rate per Page (₹)"
                    type="number"
                    value={pricing.scanPerPageRate}
                    onChange={(e) => setPricing({ ...pricing, scanPerPageRate: parseFloat(e.target.value) || 0 })}
                  />
                </Grid>
              </Grid>
              <Box sx={{ mt: 3 }}>
                <Button variant="contained" onClick={() => updateShopSettings(pricing)}>
                  Save Pricing Configuration
                </Button>
              </Box>
            </CardContent>
          </Card>
        )}
      </Box>

      {/* DEDICATED MANUAL DUPLEX STAGE CONTROLLER DIALOG */}
      {duplexModalOrder && (
        <Dialog open={true} maxWidth="sm" fullWidth onClose={() => setDuplexModalOrder(null)}>
          <DialogTitle sx={{ fontWeight: 800 }}>
            HP Smart Tank 589 - Manual Duplex Control Screen
          </DialogTitle>
          <DialogContent>
            <Stack spacing={2} sx={{ pt: 1 }}>
              <Alert severity="info" sx={{ fontSize: '0.875rem' }}>
                Order: <strong>{duplexModalOrder.orderNumber}</strong> ({duplexModalOrder.totalPages} pages, {duplexModalOrder.copies} copy)
              </Alert>

              {/* Stage Progress Box */}
              <Box sx={{ p: 2, bgcolor: '#f0f9ff', borderRadius: 2, border: '1px solid #bae6fd' }}>
                <Typography variant="subtitle2" sx={{ fontWeight: 700, color: '#0369a1', mb: 1 }}>
                  Current Duplex Stage:
                </Typography>
                <Chip
                  label={duplexModalOrder.duplexJob?.stage || 'AWAITING_APPROVAL'}
                  color="primary"
                  sx={{ fontWeight: 700 }}
                />
              </Box>

              {/* Physical Instruction Step-by-Step */}
              <Typography variant="subtitle2" sx={{ fontWeight: 700 }}>
                Operator Action Steps:
              </Typography>

              {/* Step 1: First Side */}
              <Card sx={{ p: 2, border: '1px solid #cbd5e1' }}>
                <Typography variant="body2" sx={{ fontWeight: 700 }}>
                  Step 1: Print Side 1 (Odd Pages 1, 3, 5...)
                </Typography>
                <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 1 }}>
                  Prints odd pages face up. Blank page appended if total pages is odd.
                </Typography>
                <Button
                  size="small"
                  variant="contained"
                  onClick={() => handleDuplexStageChange(duplexModalOrder.id, 'PRINTING_FIRST_SIDE')}
                >
                  Start First-Side Printing
                </Button>
              </Card>

              {/* Step 2: Paper Reversal Prompt */}
              <Card sx={{ p: 2, border: '2px solid #f59e0b', bgcolor: '#fffbeb' }}>
                <Typography variant="body2" sx={{ fontWeight: 700, color: '#92400e' }}>
                  Step 2: Physical Paper Reversal & Reinsertion
                </Typography>
                <Typography variant="caption" color="#78350f" sx={{ display: 'block', mb: 1 }}>
                  Take output stack from exit tray. Flip paper stack horizontally and re-insert into rear paper feed tray.
                </Typography>
                <Button
                  size="small"
                  variant="contained"
                  sx={{ bgcolor: '#d97706', '&:hover': { bgcolor: '#b45309' } }}
                  onClick={() => handleDuplexStageChange(duplexModalOrder.id, 'PAPER_REVERSAL_CONFIRMED')}
                >
                  I Confirm: Paper Stack Reversed & Inserted
                </Button>
              </Card>

              {/* Step 3: Second Side */}
              <Card sx={{ p: 2, border: '1px solid #cbd5e1' }}>
                <Typography variant="body2" sx={{ fontWeight: 700 }}>
                  Step 3: Print Side 2 (Even Pages in Reverse)
                </Typography>
                <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 1 }}>
                  Prints even pages in descending order (e.g. 6, 4, 2) on the reverse sides.
                </Typography>
                <Button
                  size="small"
                  variant="contained"
                  onClick={() => handleDuplexStageChange(duplexModalOrder.id, 'PRINTING_SECOND_SIDE')}
                >
                  Start Second-Side Printing
                </Button>
              </Card>
            </Stack>
          </DialogContent>
          <DialogActions>
            <Button onClick={() => setDuplexModalOrder(null)}>Close</Button>
            <Button
              variant="contained"
              color="success"
              onClick={() => {
                handleDuplexStageChange(duplexModalOrder.id, 'COMPLETED');
                setDuplexModalOrder(null);
              }}
            >
              Mark Duplex Job Completed
            </Button>
          </DialogActions>
        </Dialog>
      )}
    </Box>
  );
}
