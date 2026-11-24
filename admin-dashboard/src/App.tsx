import React, { useEffect, useState } from 'react';
import {
  Box,
  Drawer,
  Typography,
  List,
  ListItem,
  ListItemButton,
  ListItemIcon,
  ListItemText,
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
  Stack,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Alert,
  TextField,
  Divider,
  Slider,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  RadioGroup,
  FormControlLabel,
  Radio,
  Tooltip,
  AppBar,
  Toolbar,
  Checkbox
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
  AlertTriangle,
  RefreshCw,
  ExternalLink,
  Eye,
  Sliders,
  Maximize2,
  Menu
} from 'lucide-react';
import {
  fetchAdminOrders,
  updateOrderAction,
  updateDuplexStage,
  finishScanning,
  fetchHardwareStatus,
  selectActivePrinter,
  togglePaperLoaded,
  fetchShopSettings,
  updateShopSettings,
  saveOrderPrintSettings,
  triggerDirectPrint
} from './api.js';
import {
  PrintOrder,
  PhotoOrder,
  ScanOrder,
  PrinterDevice,
  PaperProfile,
  ShopPricingConfig,
  DuplexStage,
  OrderPrintSettings
} from '@smart-xerox-hub/shared';

const DRAWER_WIDTH = 260;

export function App() {
  const [activeTab, setActiveTab] = useState<'overview' | 'documents' | 'photos' | 'scans' | 'printers' | 'paper' | 'settings'>('overview');
  const [mobileOpen, setMobileOpen] = useState(false);
  const [orders, setOrders] = useState<{
    documents: Array<PrintOrder & { duplexJob?: any }>;
    photos: PhotoOrder[];
    scans: ScanOrder[];
  }>({ documents: [], photos: [], scans: [] });
  const [devices, setDevices] = useState<PrinterDevice[]>([]);
  const [paperProfiles, setPaperProfiles] = useState<PaperProfile[]>([]);
  const [pricing, setPricing] = useState<ShopPricingConfig | null>(null);
  const [agentStatus, setAgentStatus] = useState<{ connected: boolean; agentName: string; activePrinter: string; port: string; lastSeen: string } | null>(null);

  // Live Orders Sorting State
  const [sortField, setSortField] = useState<'time' | 'status' | 'price'>('time');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');

  const handleSort = (field: 'time' | 'status' | 'price') => {
    if (sortField === field) {
      setSortOrder(prev => (prev === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortField(field);
      setSortOrder(field === 'time' ? 'desc' : 'asc');
    }
  };

  // Duplex Dialog State
  const [duplexModalOrder, setDuplexModalOrder] = useState<(PrintOrder & { duplexJob?: any }) | null>(null);

  // Scan Console State
  const [activeScanOrder, setActiveScanOrder] = useState<ScanOrder | null>(null);
  const [scannerScanning, setScannerScanning] = useState(false);
  const [previewScanImage, setPreviewScanImage] = useState<string | null>(null);

  // Print Layout Settings Dialog State
  const [settingsModalOrder, setSettingsModalOrder] = useState<(PrintOrder | PhotoOrder) | null>(null);
  const [customSettings, setCustomSettings] = useState<OrderPrintSettings>({
    dpi: 300,
    pagesPerSheet: 1,
    orientation: 'PORTRAIT',
    scalePercent: 100,
    scope: 'ALL_PAGES',
    paperType: 'NORMAL_A4',
    paperSize: 'A4',
    colorMode: 'BW'
  });
  const [duplexPreviewPass, setDuplexPreviewPass] = useState<'FRONT' | 'BACK'>('FRONT');
  const [saveSuccessMsg, setSaveSuccessMsg] = useState<string | null>(null);

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
        await triggerDirectPrint(orderId, agentStatus?.activePrinter);
      } catch (e) {
        console.warn('Could not dispatch print trigger:', e);
      }
    }
    loadAllData();
  };

  const handlePhotoAction = async (orderId: string, action: string) => {
    await updateOrderAction(orderId, 'PHOTO', action);
    if (action === 'APPROVE') {
      try {
        await triggerDirectPrint(orderId, agentStatus?.activePrinter);
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

  const handleDuplexStep = async (orderId: string, stage: DuplexStage) => {
    await updateDuplexStage(orderId, stage);
    if (stage === 'COMPLETED') {
      await updateOrderAction(orderId, 'DOCUMENT', 'COMPLETE');
    }
    loadAllData();
  };

  // Open settings modal for order
  const handleOpenSettings = (order: any) => {
    setSettingsModalOrder(order);
    const existing = order.printSettings;
    const isScan = 'format' in order || order.serviceType === 'SCAN';
    const isPhoto = !isScan && (order.images !== undefined || order.paperType?.includes('PHOTO') || order.serviceType === 'PHOTO' || order.serviceType === 'PASSPORT');
    const isPassport = (isPhoto && (order.photosPerSheet === 8 || order.photoType === 'PASSPORT_8')) || order.serviceType === 'PASSPORT';

    setCustomSettings({
      dpi: existing?.dpi || (isScan ? (order.resolution || 300) : isPhoto ? (pricing?.defaultPhotoDpi || 600) : (order.colorMode === 'COLOR' ? (pricing?.defaultColorDpi || 300) : (pricing?.defaultBwDpi || 300))),
      pagesPerSheet: isPassport ? 8 : (existing?.pagesPerSheet || 1),
      orientation: isPassport ? 'LANDSCAPE' : (existing?.orientation || 'PORTRAIT'),
      scalePercent: existing?.scalePercent || 100,
      scope: existing?.scope || 'ALL_PAGES',
      paperType: isPassport ? 'PHOTO_GLOSSY_4X6' : (existing?.paperType || order.paperType || 'NORMAL_A4'),
      paperSize: (isPassport || order.paperType?.includes('4X6')) ? '4X6' : (existing?.paperSize || 'A4'),
      colorMode: existing?.colorMode || order.colorMode || 'BW',
      enableBorder: existing?.enableBorder ?? false,
      fitMode: existing?.fitMode || order.fitMode || 'FIT'
    });
    setDuplexPreviewPass('FRONT');
  };

  const handleSaveSettingsOnly = async () => {
    if (!settingsModalOrder) return;
    await saveOrderPrintSettings(settingsModalOrder.id, customSettings);
    setSaveSuccessMsg('Print settings saved successfully!');
    setTimeout(() => {
      setSaveSuccessMsg(null);
      setSettingsModalOrder(null);
    }, 1200);
    loadAllData();
  };

  const handleSaveAndPrint = async () => {
    if (!settingsModalOrder) return;
    await saveOrderPrintSettings(settingsModalOrder.id, customSettings);
    await triggerDirectPrint(settingsModalOrder.id, agentStatus?.activePrinter, customSettings);
    setSaveSuccessMsg('Settings saved & Physical print job sent to HP 589 spooler!');
    setTimeout(() => {
      setSaveSuccessMsg(null);
      setSettingsModalOrder(null);
    }, 1500);
    loadAllData();
  };

  // Metrics
  const pendingDocs = orders.documents.filter(d => ['SUBMITTED', 'PENDING_ADMIN_APPROVAL'].includes(d.status)).length;
  const pendingPhotos = orders.photos.filter(p => ['SUBMITTED', 'PENDING_ADMIN_APPROVAL'].includes(p.status)).length;
  const activePrintJobs = orders.documents.filter(d => ['FIRST_SIDE_PRINTING', 'WAITING_FOR_PHYSICAL_CONFIRMATION', 'SECOND_SIDE_PRINTING'].includes(d.status)).length;
  const pendingScans = orders.scans.filter(s => ['SUBMITTED', 'APPROVED', 'SCANNER_READY', 'SCANNING'].includes(s.status)).length;
  const completedToday = orders.documents.filter(d => d.status === 'COMPLETED').length + orders.photos.filter(p => p.status === 'COMPLETED').length + orders.scans.filter(s => s.status === 'DOWNLOAD_AVAILABLE').length;

  const drawerContent = (
    <Box sx={{ display: 'flex', flexDirection: 'column', height: '100%', bgcolor: '#0f172a', color: '#f8fafc' }}>
      <Box sx={{ p: 2, display: 'flex', alignItems: 'center', gap: 1.5 }}>
        <Box
          component="img"
          src="/logo.png"
          alt="Logo"
          sx={{ width: 44, height: 44, borderRadius: 2 }}
        />
        <Box>
          <Typography variant="subtitle1" sx={{ fontWeight: 800, lineHeight: 1.2 }}>
            {pricing?.shopName || 'SMART XEROX HUB'}
          </Typography>
          <Typography variant="caption" sx={{ color: '#0284c7', fontWeight: 700, letterSpacing: 0.5 }}>
            ADMIN CONTROL CENTER
          </Typography>
        </Box>
      </Box>

      <Divider sx={{ borderColor: '#334155' }} />

      <List sx={{ px: 1.5, py: 2 }}>
        {[
          { id: 'overview', label: 'Dashboard Overview', icon: <LayoutDashboard size={18} /> },
          { id: 'documents', label: 'Document Xerox', icon: <FileText size={18} />, badge: pendingDocs },
          { id: 'photos', label: 'Photo Printing', icon: <ImageIcon size={18} />, badge: pendingPhotos },
          { id: 'scans', label: 'Flatbed Scanner', icon: <Scan size={18} />, badge: pendingScans },
          { id: 'printers', label: 'HP Printers & Queue', icon: <Printer size={18} /> },
          { id: 'paper', label: 'Paper Inventory', icon: <Layers size={18} /> },
          { id: 'settings', label: 'Pricing & Settings', icon: <Settings size={18} /> }
        ].map((item) => (
          <ListItem key={item.id} disablePadding sx={{ mb: 0.5 }}>
            <ListItemButton
              selected={activeTab === item.id}
              onClick={() => {
                setActiveTab(item.id as any);
                setMobileOpen(false);
              }}
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
          Active Connection: {agentStatus?.port || 'USB001'} (USB Priority)
        </Typography>
        <Typography variant="caption" sx={{ color: agentStatus?.connected ? '#34d399' : '#f87171', fontWeight: 600 }}>
          Agent: {agentStatus?.connected ? 'Online & Spooling' : 'Disconnected / Offline'}
        </Typography>
      </Box>
    </Box>
  );

  return (
    <Box sx={{ display: 'flex', minHeight: '100vh', bgcolor: '#f8fafc' }}>
      {/* Mobile Drawer (temporary) */}
      <Drawer
        variant="temporary"
        open={mobileOpen}
        onClose={() => setMobileOpen(false)}
        ModalProps={{ keepMounted: true }}
        sx={{
          display: { xs: 'block', md: 'none' },
          '& .MuiDrawer-paper': {
            width: DRAWER_WIDTH,
            boxSizing: 'border-box',
            bgcolor: '#0f172a',
            color: '#f8fafc',
            borderRight: 'none'
          }
        }}
      >
        {drawerContent}
      </Drawer>

      {/* Desktop Drawer (permanent) */}
      <Drawer
        variant="permanent"
        sx={{
          display: { xs: 'none', md: 'block' },
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
        {drawerContent}
      </Drawer>

      {/* Main Content Area */}
      <Box
        component="main"
        sx={{
          flexGrow: 1,
          p: { xs: 1.5, sm: 2, md: 3 },
          bgcolor: '#f8fafc',
          minHeight: '100vh',
          width: { xs: '100%', md: `calc(100% - ${DRAWER_WIDTH}px)` },
          overflowX: 'hidden'
        }}
      >
        {/* Top Header */}
        <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 3 }}>
          <Stack direction="row" alignItems="center" spacing={1.5}>
            <IconButton
              color="inherit"
              edge="start"
              onClick={() => setMobileOpen(true)}
              sx={{ display: { md: 'none' }, bgcolor: '#e2e8f0', color: '#0f172a' }}
            >
              <Menu size={20} />
            </IconButton>
            <Box>
              <Typography variant="h5" sx={{ fontWeight: 800, color: '#0f172a', fontSize: { xs: '1.15rem', sm: '1.35rem', md: '1.5rem' } }}>
                {activeTab === 'overview' && 'Dashboard Overview'}
                {activeTab === 'documents' && 'Document Printing & Duplex Control'}
                {activeTab === 'photos' && 'Photo Printing Engine'}
                {activeTab === 'scans' && 'HP Flatbed Scanner Console'}
                {activeTab === 'printers' && 'Printer Hardware & Spooler Management'}
                {activeTab === 'paper' && 'Paper Profiles & Tray Inventory'}
                {activeTab === 'settings' && 'Pricing Matrix & Hardware Settings'}
              </Typography>
              <Typography variant="body2" color="text.secondary">
                HP Smart Tank 589 Native GDI+ Spooler • Real-Time Synchronization
              </Typography>
            </Box>
          </Stack>
          <Button
            variant="outlined"
            size="small"
            startIcon={<RefreshCw size={16} />}
            onClick={loadAllData}
          >
            Refresh
          </Button>
        </Stack>

        {/* AGENT CONNECTIVITY STATUS BANNER */}
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
              The local desktop software (<strong>SmartXeroxHubAgent.exe</strong>) is offline. Physical printing to <strong>HP Smart Tank 589</strong> and WIA flatbed scanning will queue until the .exe is launched.
            </Typography>
          </Alert>
        ) : (
          <Alert
            severity="success"
            icon={<CheckCircle2 size={20} />}
            sx={{ mb: 3, borderRadius: 2, border: '1px solid #86efac', bgcolor: '#f0fdf4' }}
          >
            <Typography variant="body2" sx={{ fontWeight: 600 }}>
              🟢 Windows 11 Desktop Agent Online • Physical HP Smart Tank 589 Ready on {agentStatus?.port || 'USB001'} (Native GDI+ Spooler Active)
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
                      PENDING DOCUMENTS
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
                      PENDING PHOTOS
                    </Typography>
                    <Typography variant="h4" sx={{ fontWeight: 800, color: '#ec4899', mt: 0.5 }}>
                      {pendingPhotos}
                    </Typography>
                    <Typography variant="caption" color="text.secondary">
                      A4 & 4×6 photo jobs
                    </Typography>
                  </CardContent>
                </Card>
              </Grid>
              <Grid item xs={12} sm={6} md={3}>
                <Card>
                  <CardContent>
                    <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 700 }}>
                      PENDING FLATBED SCANS
                    </Typography>
                    <Typography variant="h4" sx={{ fontWeight: 800, color: '#7c3aed', mt: 0.5 }}>
                      {pendingScans}
                    </Typography>
                    <Typography variant="caption" color="text.secondary">
                      Awaiting glass placement
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

            {/* Recent Orders Table with Settings Gear & Interactive Sorting */}
            <Card>
              <CardContent>
                <Stack direction={{ xs: 'column', sm: 'row' }} justifyContent="space-between" alignItems={{ xs: 'flex-start', sm: 'center' }} spacing={1} sx={{ mb: 2 }}>
                  <Typography variant="subtitle1" sx={{ fontWeight: 700 }}>
                    Live Orders Queue (Documents &amp; Photos)
                  </Typography>
                  <Stack direction="row" spacing={1} alignItems="center">
                    <Typography variant="caption" sx={{ fontWeight: 700, color: 'text.secondary' }}>
                      Sort by:
                    </Typography>
                    <Chip
                      size="small"
                      label={`⏱️ Time ${sortField === 'time' ? (sortOrder === 'asc' ? '▲' : '▼') : ''}`}
                      onClick={() => handleSort('time')}
                      color={sortField === 'time' ? 'primary' : 'default'}
                      variant={sortField === 'time' ? 'filled' : 'outlined'}
                      sx={{ fontWeight: 700, cursor: 'pointer' }}
                    />
                    <Chip
                      size="small"
                      label={`⏳ Status (Pending) ${sortField === 'status' ? (sortOrder === 'asc' ? '▲' : '▼') : ''}`}
                      onClick={() => handleSort('status')}
                      color={sortField === 'status' ? 'primary' : 'default'}
                      variant={sortField === 'status' ? 'filled' : 'outlined'}
                      sx={{ fontWeight: 700, cursor: 'pointer' }}
                    />
                    <Chip
                      size="small"
                      label={`💰 Price ${sortField === 'price' ? (sortOrder === 'asc' ? '▲' : '▼') : ''}`}
                      onClick={() => handleSort('price')}
                      color={sortField === 'price' ? 'primary' : 'default'}
                      variant={sortField === 'price' ? 'filled' : 'outlined'}
                      sx={{ fontWeight: 700, cursor: 'pointer' }}
                    />
                  </Stack>
                </Stack>
                <TableContainer>
                  <Table size="small">
                    <TableHead>
                      <TableRow>
                        <TableCell onClick={() => handleSort('time')} sx={{ cursor: 'pointer', userSelect: 'none' }}>
                          <strong>Order # / Time {sortField === 'time' ? (sortOrder === 'asc' ? '▲' : '▼') : ''}</strong>
                        </TableCell>
                        <TableCell><strong>Type</strong></TableCell>
                        <TableCell><strong>Details</strong></TableCell>
                        <TableCell onClick={() => handleSort('status')} sx={{ cursor: 'pointer', userSelect: 'none' }}>
                          <strong>Status {sortField === 'status' ? (sortOrder === 'asc' ? '▲' : '▼') : ''}</strong>
                        </TableCell>
                        <TableCell onClick={() => handleSort('price')} sx={{ cursor: 'pointer', userSelect: 'none' }}>
                          <strong>Price {sortField === 'price' ? (sortOrder === 'asc' ? '▲' : '▼') : ''}</strong>
                        </TableCell>
                        <TableCell align="right"><strong>Action &amp; Layout</strong></TableCell>
                      </TableRow>
                    </TableHead>
                    <TableBody>
                      {[
                        ...orders.documents.filter(d => d.status !== 'CANCELLED').map((d) => ({ ...d, kind: 'DOCUMENT' as const })),
                        ...orders.photos.filter(p => p.status !== 'CANCELLED').map((p) => ({ ...p, kind: 'PHOTO' as const }))
                      ]
                        .sort((a, b) => {
                          const mult = sortOrder === 'asc' ? 1 : -1;
                          if (sortField === 'time') {
                            return (new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()) * mult;
                          }
                          if (sortField === 'status') {
                            // Priority to pending/submitted in ascending sort
                            const isPendingA = ['SUBMITTED', 'PENDING_ADMIN_APPROVAL', 'AWAITING_APPROVAL'].includes(a.status);
                            const isPendingB = ['SUBMITTED', 'PENDING_ADMIN_APPROVAL', 'AWAITING_APPROVAL'].includes(b.status);
                            if (isPendingA && !isPendingB) return -1 * mult;
                            if (!isPendingA && isPendingB) return 1 * mult;
                            return (a.status || '').localeCompare(b.status || '') * mult;
                          }
                          if (sortField === 'price') {
                            return ((a.calculatedPrice || 0) - (b.calculatedPrice || 0)) * mult;
                          }
                          return 0;
                        })
                        .slice(0, 12)
                        .map((item) => {
                          if (item.kind === 'DOCUMENT') {
                            const doc = item as typeof orders.documents[0];
                            return (
                              <TableRow key={doc.id}>
                                <TableCell sx={{ fontWeight: 700 }}>{doc.orderNumber}</TableCell>
                                <TableCell>Document ({doc.sides === 'MANUAL_DUPLEX' ? 'Duplex' : 'Single'})</TableCell>
                                <TableCell>{doc.originalFileName} ({doc.totalPages}p × {doc.copies}c)</TableCell>
                                <TableCell>
                                  <Chip size="small" label={doc.status} sx={{ fontWeight: 600, fontSize: '0.75rem' }} />
                                </TableCell>
                                <TableCell sx={{ fontWeight: 700 }}>₹{doc.calculatedPrice.toFixed(2)}</TableCell>
                                <TableCell align="right">
                                  <Stack direction="row" spacing={0.5} justifyContent="flex-end" alignItems="center">
                                    {doc.sides === 'MANUAL_DUPLEX' ? (
                                      <>
                                        {doc.duplexJob?.stage === 'AWAITING_PAPER_REVERSAL' || (doc as any).duplexStage === 'AWAITING_PAPER_REVERSAL' ? (
                                          <Button
                                            size="small"
                                            variant="contained"
                                            sx={{ bgcolor: '#d97706', '&:hover': { bgcolor: '#b45309' }, fontSize: '0.75rem', whiteSpace: 'nowrap' }}
                                            onClick={() => handleDuplexStep(doc.id, 'PAPER_REVERSAL_CONFIRMED')}
                                          >
                                            🔄 2. Page Reversed (Confirm)
                                          </Button>
                                        ) : doc.duplexJob?.stage === 'PAPER_REVERSAL_CONFIRMED' || doc.duplexJob?.stage === 'PRINTING_SECOND_SIDE' ? (
                                          <Button
                                            size="small"
                                            variant="contained"
                                            color="info"
                                            sx={{ fontSize: '0.75rem', whiteSpace: 'nowrap' }}
                                            onClick={() => handleDuplexStep(doc.id, 'PRINTING_SECOND_SIDE')}
                                          >
                                            ▶ 3. Print Other Side
                                          </Button>
                                        ) : doc.status === 'COMPLETED' || doc.duplexJob?.stage === 'COMPLETED' ? (
                                          <Chip size="small" label="Duplex Complete" color="success" />
                                        ) : (
                                          <Button
                                            size="small"
                                            variant="contained"
                                            color="primary"
                                            sx={{ fontSize: '0.75rem', whiteSpace: 'nowrap' }}
                                            onClick={() => handleDuplexStep(doc.id, 'PRINTING_FIRST_SIDE')}
                                          >
                                            ▶ 1. Print Odd Pages
                                          </Button>
                                        )}
                                      </>
                                    ) : (
                                      doc.status === 'SUBMITTED' ? (
                                        <Button size="small" variant="contained" onClick={() => handleDocAction(doc.id, 'APPROVE')}>
                                          Approve & Print
                                        </Button>
                                      ) : null
                                    )}
                                    {doc.status !== 'COMPLETED' && doc.status !== 'REJECTED' && (
                                      <Button size="small" variant="outlined" color="success" onClick={() => handleDocAction(doc.id, 'COMPLETE')}>
                                        Complete
                                      </Button>
                                    )}
                                    <Tooltip title="Configure Print Layout & Settings">
                                      <IconButton size="small" onClick={() => handleOpenSettings(doc)} sx={{ border: '1px solid #cbd5e1', ml: 0.5 }}>
                                        <Settings size={16} />
                                      </IconButton>
                                    </Tooltip>
                                  </Stack>
                                </TableCell>
                              </TableRow>
                            );
                          } else {
                            const photo = item as typeof orders.photos[0];
                            const isPassport = photo.photosPerSheet === 8 || (photo as any).photoType === 'PASSPORT_8';
                            return (
                              <TableRow key={photo.id}>
                                <TableCell sx={{ fontWeight: 700 }}>{photo.orderNumber}</TableCell>
                                <TableCell>
                                  {isPassport ? (
                                    <Chip size="small" label="Passport (8 Copies)" sx={{ bgcolor: '#e0f2fe', color: '#0369a1', fontWeight: 700 }} />
                                  ) : (
                                    `Photo (${photo.paperType})`
                                  )}
                                </TableCell>
                                <TableCell>
                                  {photo.images?.[0]?.fileName || 'Photo'} ({photo.copies} sets • {photo.colorMode})
                                </TableCell>
                                <TableCell>
                                  <Chip size="small" label={photo.status} sx={{ fontWeight: 600, fontSize: '0.75rem' }} />
                                </TableCell>
                                <TableCell sx={{ fontWeight: 700 }}>₹{photo.calculatedPrice.toFixed(2)}</TableCell>
                                <TableCell align="right">
                                  <Stack direction="row" spacing={0.5} justifyContent="flex-end" alignItems="center">
                                    {isPassport && (
                                      <Chip
                                        size="small"
                                        label="⚠️ Insert 4×6 Paper"
                                        sx={{ bgcolor: '#fef3c7', color: '#92400e', fontWeight: 800, border: '1px solid #fde68a' }}
                                      />
                                    )}
                                    {photo.status === 'SUBMITTED' ? (
                                      <Button
                                        size="small"
                                        variant="contained"
                                        onClick={() => {
                                          if (isPassport) {
                                            alert("⚠️ Operator Action:\nPlease insert 4×6 inch HP Glossy Photo Paper into printer rear tray before proceeding.");
                                          }
                                          handlePhotoAction(photo.id, 'APPROVE');
                                        }}
                                      >
                                        {isPassport ? 'Approve & Print (4×6 HP Paper)' : 'Approve & Print'}
                                      </Button>
                                    ) : (
                                      <Button size="small" variant="outlined" onClick={() => handlePhotoAction(photo.id, 'COMPLETE')}>
                                        Complete
                                      </Button>
                                    )}
                                    <Tooltip title="Configure Print Layout & Settings">
                                      <IconButton size="small" onClick={() => handleOpenSettings(photo)} sx={{ border: '1px solid #cbd5e1' }}>
                                        <Settings size={16} />
                                      </IconButton>
                                    </Tooltip>
                                  </Stack>
                                </TableCell>
                              </TableRow>
                            );
                          }
                        })}
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
                Document Printing & Manual Duplex Jobs
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
                      <TableCell><strong>Layout Settings</strong></TableCell>
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
                          <Chip
                            size="small"
                            icon={<Sliders size={12} />}
                            label={`${doc.printSettings?.pagesPerSheet || 1}-Up • ${doc.printSettings?.dpi || 300} DPI • ${doc.printSettings?.orientation || 'PORTRAIT'}`}
                            variant="outlined"
                            onClick={() => handleOpenSettings(doc)}
                            sx={{ cursor: 'pointer', fontWeight: 600 }}
                          />
                        </TableCell>
                        <TableCell>
                          <Chip size="small" label={doc.status} sx={{ fontWeight: 700 }} />
                        </TableCell>
                        <TableCell sx={{ fontWeight: 700 }}>₹{doc.calculatedPrice.toFixed(2)}</TableCell>
                        <TableCell align="right">
                          <Stack direction="row" spacing={1} justifyContent="flex-end" alignItems="center">
                            {doc.sides === 'MANUAL_DUPLEX' ? (
                              <>
                                {doc.duplexJob?.stage === 'AWAITING_PAPER_REVERSAL' || (doc as any).duplexStage === 'AWAITING_PAPER_REVERSAL' ? (
                                  <Button
                                    size="small"
                                    variant="contained"
                                    sx={{ bgcolor: '#d97706', '&:hover': { bgcolor: '#b45309' }, whiteSpace: 'nowrap' }}
                                    onClick={() => handleDuplexStep(doc.id, 'PAPER_REVERSAL_CONFIRMED')}
                                  >
                                    🔄 2. Page Reversed (Confirm)
                                  </Button>
                                ) : doc.duplexJob?.stage === 'PAPER_REVERSAL_CONFIRMED' || doc.duplexJob?.stage === 'PRINTING_SECOND_SIDE' ? (
                                  <Button
                                    size="small"
                                    variant="contained"
                                    color="info"
                                    sx={{ whiteSpace: 'nowrap' }}
                                    onClick={() => handleDuplexStep(doc.id, 'PRINTING_SECOND_SIDE')}
                                  >
                                    ▶ 3. Print Other Side
                                  </Button>
                                ) : doc.status === 'COMPLETED' || doc.duplexJob?.stage === 'COMPLETED' ? (
                                  <Chip size="small" label="Duplex Complete" color="success" />
                                ) : (
                                  <Button
                                    size="small"
                                    variant="contained"
                                    color="primary"
                                    sx={{ whiteSpace: 'nowrap' }}
                                    onClick={() => handleDuplexStep(doc.id, 'PRINTING_FIRST_SIDE')}
                                  >
                                    ▶ 1. Print Odd Pages
                                  </Button>
                                )}
                              </>
                            ) : (
                              <>
                                {doc.status === 'SUBMITTED' && (
                                  <Button size="small" variant="contained" color="primary" onClick={() => handleDocAction(doc.id, 'APPROVE')}>
                                    Approve & Print
                                  </Button>
                                )}
                                {doc.status === 'APPROVED' && (
                                  <Button size="small" variant="contained" color="success" onClick={() => handleDocAction(doc.id, 'PRINTING')}>
                                    Spool to HP 589
                                  </Button>
                                )}
                              </>
                            )}

                            {doc.status === 'SUBMITTED' && (
                              <Button size="small" variant="outlined" color="error" onClick={() => handleDocAction(doc.id, 'REJECT')}>
                                Reject
                              </Button>
                            )}

                            {doc.status !== 'COMPLETED' && doc.status !== 'REJECTED' && (
                              <Button size="small" variant="text" color="success" onClick={() => handleDocAction(doc.id, 'COMPLETE')}>
                                Mark Done
                              </Button>
                            )}

                            <Tooltip title="Configure DPI, N-Up, Scale, Orientation">
                              <IconButton size="small" onClick={() => handleOpenSettings(doc)} sx={{ border: '1px solid #cbd5e1', ml: 0.5 }}>
                                <Settings size={16} />
                              </IconButton>
                            </Tooltip>
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

        {/* 3. PHOTOS TAB */}
        {activeTab === 'photos' && (
          <Card>
            <CardContent>
              <Typography variant="subtitle1" sx={{ fontWeight: 700, mb: 2 }}>
                Photo Printing Requests (A4 & 4×6 Photo Paper)
              </Typography>
              <TableContainer>
                <Table>
                  <TableHead>
                    <TableRow>
                      <TableCell><strong>Order #</strong></TableCell>
                      <TableCell><strong>Preview</strong></TableCell>
                      <TableCell><strong>Paper Type</strong></TableCell>
                      <TableCell><strong>Color Mode</strong></TableCell>
                      <TableCell><strong>Copies</strong></TableCell>
                      <TableCell><strong>Print Settings</strong></TableCell>
                      <TableCell><strong>Status</strong></TableCell>
                      <TableCell><strong>Price</strong></TableCell>
                      <TableCell align="right"><strong>Actions</strong></TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {orders.photos.map((photo) => {
                      const firstImg = photo.images?.[0];
                      const isPassport8 = photo.photosPerSheet === 8 || (photo as any).photoType === 'PASSPORT_8';
                      return (
                        <TableRow key={photo.id}>
                          <TableCell sx={{ fontWeight: 700 }}>{photo.orderNumber}</TableCell>
                          <TableCell>
                            {firstImg ? (
                              <Stack direction="row" spacing={1} alignItems="center">
                                <Box
                                  component="img"
                                  src={firstImg.fileUrl}
                                  alt={firstImg.fileName}
                                  sx={{ width: 48, height: 48, objectFit: 'cover', borderRadius: 1, border: '1px solid #e2e8f0' }}
                                />
                                <a href={firstImg.fileUrl} target="_blank" rel="noreferrer" style={{ color: '#0284c7', textDecoration: 'none', fontWeight: 600, fontSize: '0.85rem' }}>
                                  {isPassport8 ? 'Passport Sheet (8-Up)' : firstImg.fileName}
                                </a>
                              </Stack>
                            ) : '-'}
                          </TableCell>
                          <TableCell>
                            {isPassport8 ? (
                              <Chip size="small" label="Passport (8-Up) • 4×6 HP Paper" sx={{ fontWeight: 700, bgcolor: '#e0f2fe', color: '#0369a1' }} />
                            ) : (
                              <Chip size="small" label={photo.paperType} sx={{ fontWeight: 600, bgcolor: '#fdf2f8', color: '#be185d' }} />
                            )}
                          </TableCell>
                          <TableCell>{photo.colorMode}</TableCell>
                          <TableCell>{photo.copies} {isPassport8 ? 'sets' : 'copies'}</TableCell>
                          <TableCell>
                            <Chip
                              size="small"
                              icon={<Sliders size={12} />}
                              label={`${photo.printSettings?.dpi || 600} DPI • ${photo.printSettings?.scalePercent || 100}%`}
                              variant="outlined"
                              onClick={() => handleOpenSettings(photo)}
                              sx={{ cursor: 'pointer', fontWeight: 600 }}
                            />
                          </TableCell>
                          <TableCell>
                            <Chip size="small" label={photo.status} sx={{ fontWeight: 700 }} />
                          </TableCell>
                          <TableCell sx={{ fontWeight: 700 }}>₹{photo.calculatedPrice.toFixed(2)}</TableCell>
                          <TableCell align="right">
                            <Stack direction="row" spacing={1} justifyContent="flex-end" alignItems="center">
                              {isPassport8 && (
                                <Chip
                                  size="small"
                                  label="⚠️ Insert 4×6 Paper"
                                  sx={{ bgcolor: '#fef3c7', color: '#92400e', fontWeight: 800, border: '1px solid #fde68a' }}
                                />
                              )}
                              {photo.status === 'SUBMITTED' ? (
                                <>
                                  <Button
                                    size="small"
                                    variant="contained"
                                    color="primary"
                                    onClick={() => {
                                      if (isPassport8) {
                                        alert("⚠️ Operator Instruction:\nPlease insert 4×6 inch HP Glossy Photo Paper into the printer rear tray before proceeding.");
                                      }
                                      handlePhotoAction(photo.id, 'APPROVE');
                                    }}
                                  >
                                    {isPassport8 ? 'Approve & Print (4×6 HP Paper)' : 'Approve & Print'}
                                  </Button>
                                  <Button size="small" variant="outlined" color="error" onClick={() => handlePhotoAction(photo.id, 'REJECT')}>
                                    Reject
                                  </Button>
                                </>
                              ) : photo.status === 'APPROVED' ? (
                                <Button size="small" variant="contained" color="success" onClick={() => handlePhotoAction(photo.id, 'PRINTING')}>
                                  Print to HP 589
                                </Button>
                              ) : null}

                              {photo.status !== 'COMPLETED' && photo.status !== 'REJECTED' && (
                                <Button size="small" variant="text" color="success" onClick={() => handlePhotoAction(photo.id, 'COMPLETE')}>
                                  Mark Done
                                </Button>
                              )}

                              <Tooltip title="Configure DPI, Scaling, Orientation">
                                <IconButton size="small" onClick={() => handleOpenSettings(photo)} sx={{ border: '1px solid #cbd5e1' }}>
                                  <Settings size={16} />
                                </IconButton>
                              </Tooltip>
                            </Stack>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </TableContainer>
            </CardContent>
          </Card>
        )}

        {/* 4. SCANS TAB (FLATBED SCANNER CONSOLE) */}
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
                        Target: {activeScanOrder.format} • {activeScanOrder.resolution} DPI • {activeScanOrder.colorMode} (Direct WIA Glass Scan, Zero Watermarks)
                      </Typography>
                    </Box>
                    <Stack direction="row" spacing={1} alignItems="center">
                      {activeScanOrder.scannedPages.length > 0 && (
                        <Chip
                          label={`${activeScanOrder.scannedPages.length}/${activeScanOrder.requestedPageCount} Scanned ✓`}
                          sx={{ bgcolor: '#16a34a', color: 'white', fontWeight: 800 }}
                        />
                      )}
                      <Button
                        variant="contained"
                        startIcon={<Scan size={18} />}
                        disabled={scannerScanning}
                        onClick={handleScanPageCapture}
                        sx={{ bgcolor: '#7c3aed', '&:hover': { bgcolor: '#6d28d9' } }}
                      >
                        {scannerScanning
                          ? 'Scanning Flatbed Glass...'
                          : (activeScanOrder.scannedPages.length > 0
                              ? `Insert next doc & continue scan (${activeScanOrder.scannedPages.length + 1}/${activeScanOrder.requestedPageCount})`
                              : `Approve & Scan Page 1 of ${activeScanOrder.requestedPageCount}`)}
                      </Button>
                      <Button
                        variant="contained"
                        color="success"
                        disabled={activeScanOrder.scannedPages.length === 0}
                        onClick={() => {
                          if (activeScanOrder.scannedPages.length < activeScanOrder.requestedPageCount) {
                            const confirmed = window.confirm(
                              `Warning: Only ${activeScanOrder.scannedPages.length} of ${activeScanOrder.requestedPageCount} requested pages have been scanned. Customer requested ${activeScanOrder.requestedPageCount} pages.\n\nProceed to finalize and deliver with ${activeScanOrder.scannedPages.length} pages?`
                            );
                            if (!confirmed) return;
                          }
                          handleFinishScan();
                        }}
                      >
                        Finish & Deliver to Customer
                      </Button>
                    </Stack>
                  </Stack>

                  {/* Scanned Pages Preview Grid */}
                  <Typography variant="subtitle2" sx={{ fontWeight: 700, mb: 1 }}>
                    Scanned Pages Captured ({activeScanOrder.scannedPages.length}) — Click thumbnail to inspect full resolution
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
                          <Box
                            sx={{
                              border: '1px solid #c084fc',
                              borderRadius: 2,
                              overflow: 'hidden',
                              p: 1,
                              bgcolor: 'white',
                              cursor: 'pointer',
                              '&:hover': { boxShadow: '0 4px 12px rgba(124, 58, 237, 0.2)' }
                            }}
                            onClick={() => setPreviewScanImage(page.previewUrl)}
                          >
                            <img src={page.previewUrl} alt={`Page ${idx + 1}`} style={{ width: '100%', height: 160, objectFit: 'contain' }} />
                            <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mt: 0.5 }}>
                              <Typography variant="caption" sx={{ fontWeight: 700 }}>
                                Page {idx + 1}
                              </Typography>
                              <IconButton size="small" onClick={(e) => { e.stopPropagation(); setPreviewScanImage(page.previewUrl); }}>
                                <Maximize2 size={14} />
                              </IconButton>
                            </Stack>
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
                        <TableCell><strong>Pages</strong></TableCell>
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
                            <Stack direction="row" spacing={1} justifyContent="flex-end" alignItems="center">
                              {scn.scannedPages && scn.scannedPages.length > 0 && (
                                <Chip
                                  size="small"
                                  label={`${scn.scannedPages.length}/${scn.requestedPageCount} Scanned ✓`}
                                  sx={{ bgcolor: '#dcfce7', color: '#15803d', fontWeight: 700 }}
                                />
                              )}
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
                              <Tooltip title="Configure Service Settings">
                                <IconButton size="small" onClick={() => handleOpenSettings(scn as any)} sx={{ border: '1px solid #cbd5e1' }}>
                                  <Settings size={16} />
                                </IconButton>
                              </Tooltip>
                            </Stack>
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

        {/* 5. PRINTERS TAB */}
        {activeTab === 'printers' && (
          <Stack spacing={3}>
            <Card>
              <CardContent>
                <Typography variant="subtitle1" sx={{ fontWeight: 700, mb: 2 }}>
                  HP Smart Tank 589 Hardware Discovery & Spooler
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
                        <TableCell><strong>Queue Priority</strong></TableCell>
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
                          <TableCell>{dev.connectionType === 'USB' ? 'Primary (High Speed)' : 'Secondary (Wi-Fi Fallback)'}</TableCell>
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

        {/* 6. PAPER INVENTORY TAB */}
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

        {/* 7. SETTINGS & PRICING TAB */}
        {activeTab === 'settings' && pricing && (
          <Card>
            <CardContent>
              <Typography variant="subtitle1" sx={{ fontWeight: 700, mb: 2 }}>
                Shop Pricing Matrix & Hardware Default Settings
              </Typography>
              <Grid container spacing={2}>
                <Grid item xs={12} sm={6}>
                  <TextField
                    fullWidth
                    label="A4 B&W Single-Sided Rate (₹)"
                    type="number"
                    value={pricing.a4BwSingleSideRate}
                    onChange={(e) => setPricing({ ...pricing, a4BwSingleSideRate: parseFloat(e.target.value) || 0 })}
                  />
                </Grid>
                <Grid item xs={12} sm={6}>
                  <TextField
                    fullWidth
                    label="A4 B&W Duplex Rate per Sheet (₹)"
                    type="number"
                    value={pricing.a4BwDoubleSideRate}
                    onChange={(e) => setPricing({ ...pricing, a4BwDoubleSideRate: parseFloat(e.target.value) || 0 })}
                  />
                </Grid>
                <Grid item xs={12} sm={6}>
                  <TextField
                    fullWidth
                    label="A4 Color Single-Sided Rate (₹)"
                    type="number"
                    value={pricing.a4ColorSingleSideRate}
                    onChange={(e) => setPricing({ ...pricing, a4ColorSingleSideRate: parseFloat(e.target.value) || 0 })}
                  />
                </Grid>
                <Grid item xs={12} sm={6}>
                  <TextField
                    fullWidth
                    label="A4 Color Duplex Rate per Sheet (₹)"
                    type="number"
                    value={pricing.a4ColorDoubleSideRate}
                    onChange={(e) => setPricing({ ...pricing, a4ColorDoubleSideRate: parseFloat(e.target.value) || 0 })}
                  />
                </Grid>
                <Grid item xs={12} sm={6}>
                  <TextField
                    fullWidth
                    label="4×6 Photo Rate (₹)"
                    type="number"
                    value={pricing.photo4x6Rate}
                    onChange={(e) => setPricing({ ...pricing, photo4x6Rate: parseFloat(e.target.value) || 0 })}
                  />
                </Grid>
                <Grid item xs={12} sm={6}>
                  <TextField
                    fullWidth
                    label="Flatbed Scan Rate per Page (₹)"
                    type="number"
                    value={pricing.scanPerPageRate}
                    onChange={(e) => setPricing({ ...pricing, scanPerPageRate: parseFloat(e.target.value) || 0 })}
                  />
                </Grid>

                {/* HARDWARE DEFAULT DPI SETTINGS */}
                <Grid item xs={12}>
                  <Divider sx={{ my: 1 }}>
                    <Chip label="Default DPI Profiles for HP Smart Tank 589" size="small" />
                  </Divider>
                </Grid>
                <Grid item xs={12} sm={3}>
                  <FormControl fullWidth>
                    <InputLabel>Default B&W DPI</InputLabel>
                    <Select
                      value={pricing.defaultBwDpi || 300}
                      label="Default B&W DPI"
                      onChange={(e) => setPricing({ ...pricing, defaultBwDpi: Number(e.target.value) })}
                    >
                      <MenuItem value={150}>150 DPI (Fast Draft)</MenuItem>
                      <MenuItem value={300}>300 DPI (Standard Text)</MenuItem>
                      <MenuItem value={600}>600 DPI (High Detail)</MenuItem>
                    </Select>
                  </FormControl>
                </Grid>
                <Grid item xs={12} sm={3}>
                  <FormControl fullWidth>
                    <InputLabel>Default Color DPI</InputLabel>
                    <Select
                      value={pricing.defaultColorDpi || 300}
                      label="Default Color DPI"
                      onChange={(e) => setPricing({ ...pricing, defaultColorDpi: Number(e.target.value) })}
                    >
                      <MenuItem value={300}>300 DPI (Standard Color)</MenuItem>
                      <MenuItem value={600}>600 DPI (Vibrant Color)</MenuItem>
                    </Select>
                  </FormControl>
                </Grid>
                <Grid item xs={12} sm={3}>
                  <FormControl fullWidth>
                    <InputLabel>Default Photo DPI</InputLabel>
                    <Select
                      value={pricing.defaultPhotoDpi || 600}
                      label="Default Photo DPI"
                      onChange={(e) => setPricing({ ...pricing, defaultPhotoDpi: Number(e.target.value) })}
                    >
                      <MenuItem value={300}>300 DPI (Fast Print)</MenuItem>
                      <MenuItem value={600}>600 DPI (Glossy HD)</MenuItem>
                    </Select>
                  </FormControl>
                </Grid>
                <Grid item xs={12} sm={3}>
                  <FormControl fullWidth>
                    <InputLabel>Default Scan DPI</InputLabel>
                    <Select
                      value={pricing.defaultScanDpi || 300}
                      label="Default Scan DPI"
                      onChange={(e) => setPricing({ ...pricing, defaultScanDpi: Number(e.target.value) })}
                    >
                      <MenuItem value={150}>150 DPI (Email / Fast)</MenuItem>
                      <MenuItem value={300}>300 DPI (Standard Scan)</MenuItem>
                      <MenuItem value={600}>600 DPI (Archive Quality)</MenuItem>
                    </Select>
                  </FormControl>
                </Grid>
              </Grid>
              <Box sx={{ mt: 3 }}>
                <Button variant="contained" onClick={() => updateShopSettings(pricing)}>
                  Save Pricing & Hardware Defaults
                </Button>
              </Box>
            </CardContent>
          </Card>
        )}
      </Box>

      {/* PRINT LAYOUT & ADVANCED SETTINGS MODAL WITH INTERACTIVE PREVIEW */}
      {settingsModalOrder && (() => {
        const isScan = 'format' in settingsModalOrder || (settingsModalOrder as any).serviceType === 'SCAN';
        const isPhoto = !isScan && ((settingsModalOrder as any).images !== undefined || (settingsModalOrder as any).paperType?.includes('PHOTO'));
        const isPassport = isPhoto && ((settingsModalOrder as any).photosPerSheet === 8 || (settingsModalOrder as any).photoType === 'PASSPORT_8');
        const isDoc = !isScan && !isPhoto;

        return (
          <Dialog open={true} maxWidth="md" fullWidth onClose={() => setSettingsModalOrder(null)}>
            <DialogTitle sx={{ fontWeight: 800, borderBottom: '1px solid #e2e8f0', pb: 1.5, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span>
                ⚙️ {isScan ? 'Scanner Parameters' : isPassport ? 'Passport Layout (8-Up)' : isPhoto ? 'Photo Print Settings' : 'Document Layout Settings'} — Order #{settingsModalOrder.orderNumber}
              </span>
              <Chip
                size="small"
                label={isScan ? 'SCAN' : isPassport ? 'PASSPORT 8' : isPhoto ? 'PHOTO' : (settingsModalOrder as any).sides === 'MANUAL_DUPLEX' ? 'DUPLEX' : 'DOCUMENT'}
                sx={{
                  bgcolor: isScan ? '#ede9fe' : isPassport ? '#e0f2fe' : isPhoto ? '#d1fae5' : '#f1f5f9',
                  color: isScan ? '#6b21a8' : isPassport ? '#0369a1' : isPhoto ? '#047857' : '#334155',
                  fontWeight: 800
                }}
              />
            </DialogTitle>
            <DialogContent sx={{ p: 3 }}>
              {saveSuccessMsg && (
                <Alert severity="success" sx={{ mb: 2 }}>
                  {saveSuccessMsg}
                </Alert>
              )}

              <Grid container spacing={3}>
                {/* LEFT COLUMN: CONTROLS & PARAMS */}
                <Grid item xs={12} md={6}>
                  <Stack spacing={2.5}>
                    {/* ===== 1. SCANNER SERVICE ONLY ===== */}
                    {isScan && (
                      <>
                        <Typography variant="subtitle2" sx={{ fontWeight: 700, color: '#7c3aed' }}>
                          🔍 Flatbed Scanner Acquisition Controls
                        </Typography>

                        <FormControl fullWidth size="small">
                          <InputLabel>Optical Scan Resolution (DPI)</InputLabel>
                          <Select
                            value={customSettings.dpi}
                            label="Optical Scan Resolution (DPI)"
                            onChange={(e) => setCustomSettings({ ...customSettings, dpi: Number(e.target.value) })}
                          >
                            <MenuItem value={150}>150 DPI (Fast / Compact File)</MenuItem>
                            <MenuItem value={300}>300 DPI (Standard Official Quality)</MenuItem>
                            <MenuItem value={600}>600 DPI (High Resolution Archival)</MenuItem>
                          </Select>
                        </FormControl>

                        <FormControl fullWidth size="small">
                          <InputLabel>Scan Color Mode</InputLabel>
                          <Select
                            value={customSettings.colorMode}
                            label="Scan Color Mode"
                            onChange={(e) => setCustomSettings({ ...customSettings, colorMode: e.target.value as any })}
                          >
                            <MenuItem value="COLOR">Full Color (24-bit RGB)</MenuItem>
                            <MenuItem value="BW">Grayscale (8-bit)</MenuItem>
                          </Select>
                        </FormControl>

                        <Alert severity="info" sx={{ fontSize: '0.8rem', bgcolor: '#f5f3ff', border: '1px solid #ddd6fe' }}>
                          ℹ️ Document paper sizes, manual duplex, and N-up options are hidden because they do not apply to scanner acquisition.
                        </Alert>
                      </>
                    )}

                    {/* ===== 2. PASSPORT 8-COPIES ONLY ===== */}
                    {isPassport && (
                      <>
                        <Typography variant="subtitle2" sx={{ fontWeight: 700, color: '#0369a1' }}>
                          🛂 Passport Photos (8-up Sheet Layout)
                        </Typography>

                        <FormControl fullWidth size="small">
                          <InputLabel>Paper Profile</InputLabel>
                          <Select
                            value="PHOTO_GLOSSY_4X6"
                            label="Paper Profile"
                            disabled
                          >
                            <MenuItem value="PHOTO_GLOSSY_4X6">HP Glossy Photo Paper (4 × 6 inch) [Locked]</MenuItem>
                          </Select>
                        </FormControl>

                        <FormControl fullWidth size="small">
                          <InputLabel>Print Resolution (DPI)</InputLabel>
                          <Select
                            value={customSettings.dpi}
                            label="Print Resolution (DPI)"
                            onChange={(e) => setCustomSettings({ ...customSettings, dpi: Number(e.target.value) })}
                          >
                            <MenuItem value={300}>300 DPI (Standard)</MenuItem>
                            <MenuItem value={600}>600 DPI (Recommended Studio Quality)</MenuItem>
                            <MenuItem value={1200}>1200 DPI (Ultra Max Resolution)</MenuItem>
                          </Select>
                        </FormControl>

                        <Box>
                          <Typography variant="caption" sx={{ fontWeight: 700, display: 'block', mb: 0.5 }}>
                            Photo Framing (Aspect Ratio):
                          </Typography>
                          <RadioGroup
                            row
                            value={customSettings.fitMode || 'FIT'}
                            onChange={(e) => setCustomSettings({ ...customSettings, fitMode: e.target.value as any })}
                          >
                            <FormControlLabel value="FIT" control={<Radio size="small" />} label="Fit to Paper (Preserve entire photo)" />
                            <FormControlLabel value="CROP" control={<Radio size="small" />} label="Crop to Paper (Fill paper border-to-border)" />
                          </RadioGroup>
                        </Box>

                        <Box sx={{ p: 1.5, bgcolor: '#f8fafc', borderRadius: 2, border: '1px solid #e2e8f0' }}>
                          <FormControlLabel
                            control={
                              <Checkbox
                                checked={customSettings.enableBorder ?? true}
                                onChange={(e) => setCustomSettings({ ...customSettings, enableBorder: e.target.checked })}
                                size="small"
                                color="primary"
                              />
                            }
                            label={<Typography variant="body2" sx={{ fontWeight: 700 }}>Enable Clean Margin Border (White border around photo)</Typography>}
                          />
                        </Box>

                        <Alert severity="warning" sx={{ fontSize: '0.8rem', bgcolor: '#fffbeb', border: '1px solid #fde68a' }}>
                          ⚠️ Please ensure 4×6 inch HP Glossy Photo Paper is inserted into the rear tray of the HP Smart Tank 589 before printing.
                        </Alert>
                      </>
                    )}

                    {/* ===== 3. STANDARD PHOTO PRINT ONLY ===== */}
                    {isPhoto && !isPassport && (
                      <>
                        <Typography variant="subtitle2" sx={{ fontWeight: 700, color: '#047857' }}>
                          🖼️ Photo Engine Parameters
                        </Typography>

                        <FormControl fullWidth size="small">
                          <InputLabel>Paper Profile</InputLabel>
                          <Select
                            value={customSettings.paperType}
                            label="Paper Profile"
                            onChange={(e) => setCustomSettings({
                              ...customSettings,
                              paperType: e.target.value as any,
                              paperSize: e.target.value.includes('4X6') ? '4X6' : 'A4'
                            })}
                          >
                            <MenuItem value="PHOTO_GLOSSY_4X6">HP Glossy Photo Paper (4 × 6 inch)</MenuItem>
                            <MenuItem value="PHOTO_GLOSSY_A4">HP Premium Glossy (A4 Full Sheet)</MenuItem>
                            <MenuItem value="PHOTO_MATTE_A4">HP Matte Photo Paper (A4)</MenuItem>
                          </Select>
                        </FormControl>

                        <FormControl fullWidth size="small">
                          <InputLabel>Print Resolution (DPI)</InputLabel>
                          <Select
                            value={customSettings.dpi}
                            label="Print Resolution (DPI)"
                            onChange={(e) => setCustomSettings({ ...customSettings, dpi: Number(e.target.value) })}
                          >
                            <MenuItem value={300}>300 DPI (Fast Print)</MenuItem>
                            <MenuItem value={600}>600 DPI (High Glossy Quality)</MenuItem>
                            <MenuItem value={1200}>1200 DPI (Ultra Max Resolution)</MenuItem>
                          </Select>
                        </FormControl>

                        <Box>
                          <Typography variant="caption" sx={{ fontWeight: 700, display: 'block', mb: 0.5 }}>
                            Photo Framing Mode:
                          </Typography>
                          <RadioGroup
                            row
                            value={customSettings.fitMode || 'FIT'}
                            onChange={(e) => setCustomSettings({ ...customSettings, fitMode: e.target.value as any })}
                          >
                            <FormControlLabel value="FIT" control={<Radio size="small" />} label="Fit to Paper (Preserve full image)" />
                            <FormControlLabel value="CROP" control={<Radio size="small" />} label="Crop to Paper (Fill whole sheet)" />
                          </RadioGroup>
                        </Box>

                        <Box sx={{ p: 1.5, bgcolor: '#f8fafc', borderRadius: 2, border: '1px solid #e2e8f0' }}>
                          <FormControlLabel
                            control={
                              <Checkbox
                                checked={customSettings.enableBorder ?? false}
                                onChange={(e) => setCustomSettings({ ...customSettings, enableBorder: e.target.checked })}
                                size="small"
                                color="primary"
                              />
                            }
                            label={<Typography variant="body2" sx={{ fontWeight: 700 }}>Enable Clean Margin Border</Typography>}
                          />
                        </Box>
                      </>
                    )}

                    {/* ===== 4. DOCUMENT PRINT ONLY ===== */}
                    {isDoc && (
                      <>
                        <Typography variant="subtitle2" sx={{ fontWeight: 700, color: '#0369a1' }}>
                          📄 Document Spooler &amp; Layout Controls
                        </Typography>

                        {/* DPI Resolution */}
                        <FormControl fullWidth size="small">
                          <InputLabel>Print Resolution (DPI)</InputLabel>
                          <Select
                            value={customSettings.dpi}
                            label="Print Resolution (DPI)"
                            onChange={(e) => setCustomSettings({ ...customSettings, dpi: Number(e.target.value) })}
                          >
                            <MenuItem value={150}>150 DPI (Fast / Draft)</MenuItem>
                            <MenuItem value={300}>300 DPI (Standard High Quality)</MenuItem>
                            <MenuItem value={600}>600 DPI (Ultra Fine / Text Quality)</MenuItem>
                            <MenuItem value={1200}>1200 DPI (Maximum Studio Resolution)</MenuItem>
                          </Select>
                        </FormControl>

                        {/* Pages Per Sheet (N-Up) */}
                        <FormControl fullWidth size="small">
                          <InputLabel>Pages Per Sheet (N-Up)</InputLabel>
                          <Select
                            value={customSettings.pagesPerSheet}
                            label="Pages Per Sheet (N-Up)"
                            onChange={(e) => setCustomSettings({ ...customSettings, pagesPerSheet: Number(e.target.value) as 1 | 2 | 4 | 6 | 9 | 16 })}
                          >
                            <MenuItem value={1}>1 Page Per Sheet (Standard 1-Up)</MenuItem>
                            <MenuItem value={2}>2 Pages Per Sheet (2-Up Side-by-Side)</MenuItem>
                            <MenuItem value={4}>4 Pages Per Sheet (4-Up 2×2 Grid)</MenuItem>
                            <MenuItem value={6}>6 Pages Per Sheet (6-Up 3×2 Grid)</MenuItem>
                            <MenuItem value={9}>9 Pages Per Sheet (9-Up 3×3 Grid)</MenuItem>
                            <MenuItem value={16}>16 Pages Per Sheet (16-Up 4×4 Grid)</MenuItem>
                          </Select>
                        </FormControl>

                        {/* Page Orientation */}
                        <FormControl fullWidth size="small">
                          <InputLabel>Sheet Orientation</InputLabel>
                          <Select
                            value={customSettings.orientation}
                            label="Sheet Orientation"
                            onChange={(e) => setCustomSettings({ ...customSettings, orientation: e.target.value as any })}
                          >
                            <MenuItem value="PORTRAIT">Portrait (Vertical)</MenuItem>
                            <MenuItem value="LANDSCAPE">Landscape (Horizontal)</MenuItem>
                          </Select>
                        </FormControl>

                        {/* Zoom / Scaling Slider */}
                        <Box>
                          <Stack direction="row" justifyContent="space-between" alignItems="center">
                            <Typography variant="caption" sx={{ fontWeight: 700 }}>
                              Scaling / Zoom: {customSettings.scalePercent}%
                            </Typography>
                            <Button size="small" onClick={() => setCustomSettings({ ...customSettings, scalePercent: 100 })}>
                              Reset (100%)
                            </Button>
                          </Stack>
                          <Slider
                            value={customSettings.scalePercent}
                            min={50}
                            max={150}
                            step={5}
                            valueLabelDisplay="auto"
                            onChange={(_, val) => setCustomSettings({ ...customSettings, scalePercent: val as number })}
                            sx={{ color: '#0284c7' }}
                          />
                        </Box>

                        {/* Scope: One-for-All vs Current Page */}
                        <Box>
                          <Typography variant="caption" sx={{ fontWeight: 700, display: 'block', mb: 0.5 }}>
                            Apply Configuration Scope:
                          </Typography>
                          <RadioGroup
                            row
                            value={customSettings.scope}
                            onChange={(e) => setCustomSettings({ ...customSettings, scope: e.target.value as any })}
                          >
                            <FormControlLabel value="ALL_PAGES" control={<Radio size="small" />} label="One-for-All (All Pages)" />
                            <FormControlLabel value="CURRENT_PAGE" control={<Radio size="small" />} label="Current Page Only" />
                          </RadioGroup>
                        </Box>

                        {/* Border Toggle */}
                        <Box sx={{ p: 1.5, bgcolor: '#f8fafc', borderRadius: 2, border: '1px solid #e2e8f0' }}>
                          <FormControlLabel
                            control={
                              <Checkbox
                                checked={customSettings.enableBorder ?? false}
                                onChange={(e) => setCustomSettings({ ...customSettings, enableBorder: e.target.checked })}
                                size="small"
                                color="primary"
                              />
                            }
                            label={<Typography variant="body2" sx={{ fontWeight: 700 }}>Enable Page Margin Border</Typography>}
                          />
                        </Box>

                        {/* Paper Type & Size */}
                        <Grid container spacing={1.5}>
                          <Grid item xs={6}>
                            <FormControl fullWidth size="small">
                              <InputLabel>Paper Type</InputLabel>
                              <Select
                                value={customSettings.paperType}
                                label="Paper Type"
                                onChange={(e) => setCustomSettings({ ...customSettings, paperType: e.target.value as any })}
                              >
                                <MenuItem value="NORMAL_A4">Plain Paper (A4)</MenuItem>
                                <MenuItem value="PHOTO_GLOSSY_4X6">HP Glossy (4×6")</MenuItem>
                                <MenuItem value="PHOTO_GLOSSY_A4">HP Glossy (A4)</MenuItem>
                              </Select>
                            </FormControl>
                          </Grid>
                          <Grid item xs={6}>
                            <FormControl fullWidth size="small">
                              <InputLabel>Paper Size</InputLabel>
                              <Select
                                value={customSettings.paperSize}
                                label="Paper Size"
                                onChange={(e) => setCustomSettings({ ...customSettings, paperSize: e.target.value as any })}
                              >
                                <MenuItem value="A4">A4 (210×297 mm)</MenuItem>
                                <MenuItem value="4X6">4×6 Inch</MenuItem>
                              </Select>
                            </FormControl>
                          </Grid>
                        </Grid>

                        {/* Duplex Math Breakdown Notice */}
                        {(settingsModalOrder as any).sides === 'MANUAL_DUPLEX' && (
                          <Box sx={{ p: 1.5, bgcolor: '#f0f9ff', borderRadius: 2, border: '1px solid #bae6fd' }}>
                            <Typography variant="caption" sx={{ fontWeight: 700, color: '#0369a1', display: 'block' }}>
                              Duplex N-Up Math Breakdown:
                            </Typography>
                            {(() => {
                              const totalN = (settingsModalOrder as any).totalPages || 1;
                              const k = customSettings.pagesPerSheet || 1;
                              const perSheet = 2 * k;
                              const sheets = Math.ceil(totalN / perSheet);
                              return (
                                <Typography variant="caption" sx={{ color: '#0c4a6e' }}>
                                  • Total input pages: <strong>{totalN}</strong><br />
                                  • Pages per sheet: <strong>{perSheet}</strong> ({k} per side)<br />
                                  • Physical sheets required: <strong>{sheets} sheets</strong><br />
                                  • Front pass odd sheets: 1 to {sheets}<br />
                                  • Back pass reversed sheets: {sheets} down to 1
                                </Typography>
                              );
                            })()}
                          </Box>
                        )}
                      </>
                    )}
                  </Stack>
                </Grid>

                {/* RIGHT COLUMN: INTERACTIVE SHEET VISUALIZER */}
                <Grid item xs={12} md={6}>
                  <Typography variant="subtitle2" sx={{ fontWeight: 700, color: '#0f172a', mb: 1 }}>
                    👁️ Live Physical Sheet Preview
                  </Typography>

                  {/* Duplex Pass View Switcher */}
                  {isDoc && (settingsModalOrder as any).sides === 'MANUAL_DUPLEX' && (
                    <Stack direction="row" spacing={1} sx={{ mb: 1.5 }}>
                      <Button
                        size="small"
                        variant={duplexPreviewPass === 'FRONT' ? 'contained' : 'outlined'}
                        onClick={() => setDuplexPreviewPass('FRONT')}
                        sx={{ fontSize: '0.75rem', py: 0.5 }}
                      >
                        Front Side (Odd Pass)
                      </Button>
                      <Button
                        size="small"
                        variant={duplexPreviewPass === 'BACK' ? 'contained' : 'outlined'}
                        onClick={() => setDuplexPreviewPass('BACK')}
                        sx={{ fontSize: '0.75rem', py: 0.5 }}
                      >
                        Back Side (Even Reverse)
                      </Button>
                    </Stack>
                  )}

                  {/* SHEET CONTAINER */}
                  <Box
                    sx={{
                      width: '100%',
                      height: 340,
                      bgcolor: '#334155',
                      borderRadius: 2,
                      p: 2,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      overflow: 'hidden'
                    }}
                  >
                    {/* The Physical Paper Sheet */}
                    <Box
                      sx={{
                        width: isPassport || customSettings.orientation === 'LANDSCAPE' ? '290px' : '210px',
                        height: isPassport || customSettings.orientation === 'LANDSCAPE' ? '200px' : '290px',
                        bgcolor: 'white',
                        borderRadius: 1,
                        boxShadow: '0 8px 24px rgba(0,0,0,0.3)',
                        border: customSettings.enableBorder ? '2px solid #0284c7' : '1px dashed #94a3b8',
                        position: 'relative',
                        p: 1.5,
                        display: 'flex',
                        flexDirection: 'column',
                        transition: 'all 0.3s ease'
                      }}
                    >
                      {/* Header sheet badge */}
                      <Stack direction="row" justifyContent="space-between" sx={{ mb: 0.5 }}>
                        <Typography variant="caption" sx={{ fontSize: '9px', fontWeight: 700, color: '#64748b' }}>
                          HP Smart Tank 589 • {isPassport ? '4×6 Photo Paper' : customSettings.paperSize}
                        </Typography>
                        <Typography variant="caption" sx={{ fontSize: '9px', fontWeight: 800, color: '#0284c7' }}>
                          {customSettings.dpi} DPI
                        </Typography>
                      </Stack>

                      {/* Passport 8-Up Visualization */}
                      {isPassport ? (
                        <Box sx={{ flexGrow: 1, display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gridTemplateRows: 'repeat(2, 1fr)', gap: 0.8, p: 0.5 }}>
                          {Array.from({ length: 8 }).map((_, idx) => (
                            <Box
                              key={idx}
                              sx={{
                                border: '1.5px solid #0284c7',
                                bgcolor: '#e0f2fe',
                                borderRadius: 0.5,
                                display: 'flex',
                                flexDirection: 'column',
                                alignItems: 'center',
                                justifyContent: 'center',
                                p: 0.2
                              }}
                            >
                              <Box sx={{ width: 14, height: 14, borderRadius: '50%', bgcolor: '#0284c7', mb: 0.2 }} />
                              <Typography variant="caption" sx={{ fontSize: '7px', fontWeight: 700, color: '#0369a1' }}>
                                #{idx + 1}
                              </Typography>
                            </Box>
                          ))}
                        </Box>
                      ) : isScan ? (
                        <Box sx={{ flexGrow: 1, border: '2px dashed #7c3aed', bgcolor: '#faf5ff', borderRadius: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
                          <Scan size={32} color="#7c3aed" />
                          <Typography variant="caption" sx={{ fontWeight: 800, color: '#6b21a8', mt: 1 }}>
                            HP 589 Flatbed Glass Platen
                          </Typography>
                          <Typography variant="caption" sx={{ fontSize: '9px', color: '#9333ea' }}>
                            {customSettings.dpi} DPI • {customSettings.colorMode}
                          </Typography>
                        </Box>
                      ) : (
                        /* Document Wireframe according to N-Up */
                        <Box
                          sx={{
                            flexGrow: 1,
                            display: 'grid',
                            gap: 1,
                            gridTemplateColumns:
                              customSettings.pagesPerSheet === 1 ? '1fr'
                              : customSettings.pagesPerSheet === 2 ? (customSettings.orientation === 'LANDSCAPE' ? '1fr 1fr' : '1fr')
                              : customSettings.pagesPerSheet === 4 ? '1fr 1fr'
                              : customSettings.pagesPerSheet === 6 ? '1fr 1fr 1fr'
                              : customSettings.pagesPerSheet === 9 ? '1fr 1fr 1fr'
                              : customSettings.pagesPerSheet === 16 ? 'repeat(4, 1fr)'
                              : '1fr 1fr',
                            gridTemplateRows:
                              customSettings.pagesPerSheet === 1 ? '1fr'
                              : customSettings.pagesPerSheet === 2 ? (customSettings.orientation === 'LANDSCAPE' ? '1fr' : '1fr 1fr')
                              : customSettings.pagesPerSheet === 4 ? '1fr 1fr'
                              : customSettings.pagesPerSheet === 6 ? '1fr 1fr'
                              : customSettings.pagesPerSheet === 9 ? '1fr 1fr 1fr'
                              : customSettings.pagesPerSheet === 16 ? 'repeat(4, 1fr)'
                              : '1fr 1fr',
                            transform: `scale(${customSettings.scalePercent / 100})`,
                            transformOrigin: 'center center',
                            transition: 'transform 0.2s ease'
                          }}
                        >
                          {Array.from({ length: customSettings.pagesPerSheet }).map((_, slotIdx) => {
                            const pageNum = duplexPreviewPass === 'FRONT' ? slotIdx + 1 : slotIdx + customSettings.pagesPerSheet + 1;
                            return (
                              <Box
                                key={slotIdx}
                                sx={{
                                  border: customSettings.enableBorder ? '1.5px solid #2563eb' : '1px solid #cbd5e1',
                                  borderRadius: 1,
                                  bgcolor: '#f8fafc',
                                  p: 1,
                                  display: 'flex',
                                  flexDirection: 'column',
                                  justifyContent: 'space-between'
                                }}
                              >
                                <Stack direction="row" justifyContent="space-between" alignItems="center">
                                  <Chip
                                    size="small"
                                    label={`Page ${pageNum}`}
                                    sx={{ height: 16, fontSize: '9px', fontWeight: 700, bgcolor: '#0284c7', color: 'white' }}
                                  />
                                  <Typography variant="caption" sx={{ fontSize: '8px', color: '#94a3b8' }}>
                                    {customSettings.colorMode}
                                  </Typography>
                                </Stack>

                                <Stack spacing={0.5} sx={{ my: 'auto' }}>
                                  <Box sx={{ width: '85%', height: 4, bgcolor: '#94a3b8', borderRadius: 0.5 }} />
                                  <Box sx={{ width: '95%', height: 3, bgcolor: '#cbd5e1', borderRadius: 0.5 }} />
                                  <Box sx={{ width: '70%', height: 3, bgcolor: '#cbd5e1', borderRadius: 0.5 }} />
                                  <Box sx={{ width: '80%', height: 3, bgcolor: '#cbd5e1', borderRadius: 0.5 }} />
                                </Stack>

                                <Typography variant="caption" sx={{ fontSize: '8px', color: '#64748b', textAlign: 'center' }}>
                                  {customSettings.scalePercent}% Scale
                                </Typography>
                              </Box>
                            );
                          })}
                        </Box>
                      )}
                    </Box>
                  </Box>

                  {/* Preview Metadata Footer */}
                  <Box sx={{ mt: 1.5, p: 1.5, bgcolor: '#f1f5f9', borderRadius: 2 }}>
                    <Typography variant="caption" sx={{ fontWeight: 600, color: '#334155', display: 'block' }}>
                      📐 Layout: {isPassport ? '4×6 HP Glossy (8-up)' : customSettings.orientation === 'PORTRAIT' ? '210 × 297 mm (Portrait)' : '297 × 210 mm (Landscape)'} • {customSettings.enableBorder ? 'White Margin Border ON' : 'Borderless/Edge-to-edge'}
                    </Typography>
                    <Typography variant="caption" sx={{ color: '#64748b' }}>
                      Native GDI+ Spooler sends direct clean vector instructions to the HP Smart Tank 589 spooler.
                    </Typography>
                  </Box>
                </Grid>
              </Grid>
            </DialogContent>
            <DialogActions sx={{ p: 2, borderTop: '1px solid #e2e8f0' }}>
              <Button onClick={() => setSettingsModalOrder(null)}>Cancel</Button>
              <Button variant="outlined" color="primary" onClick={handleSaveSettingsOnly}>
                Save Settings Only
              </Button>
              <Button variant="contained" color="success" onClick={handleSaveAndPrint}>
                Save & Print to HP 589
              </Button>
            </DialogActions>
          </Dialog>
        );
      })()}

      {/* FULL RESOLUTION SCAN IMAGE PREVIEW MODAL */}
      {previewScanImage && (
        <Dialog open={true} maxWidth="lg" fullWidth onClose={() => setPreviewScanImage(null)}>
          <DialogTitle sx={{ fontWeight: 800, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span>HP Smart Tank 589 Flatbed Scan Preview (Direct Glass Capture)</span>
            <IconButton onClick={() => setPreviewScanImage(null)}>
              <ExternalLink size={18} />
            </IconButton>
          </DialogTitle>
          <DialogContent sx={{ p: 2, textAlign: 'center', bgcolor: '#0f172a' }}>
            <img src={previewScanImage} alt="Scan Preview" style={{ maxWidth: '100%', maxHeight: '75vh', objectFit: 'contain' }} />
          </DialogContent>
          <DialogActions>
            <Button onClick={() => setPreviewScanImage(null)}>Close Preview</Button>
            <Button variant="contained" href={previewScanImage} download="flatbed-scan.jpg" target="_blank">
              Download Full-Res Scan
            </Button>
          </DialogActions>
        </Dialog>
      )}

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
