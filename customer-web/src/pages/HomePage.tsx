import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Box,
  Container,
  Typography,
  Card,
  CardContent,
  CardActionArea,
  Grid,
  Chip,
  Stack,
  Button
} from '@mui/material';
import {
  FileText,
  Image as ImageIcon,
  Scan,
  Clock,
  HelpCircle,
  Printer,
  ChevronRight,
  ShieldCheck,
  Camera
} from 'lucide-react';
import { getOrCreateGuestSession, fetchGuestOrders, fetchPricing } from '../api.js';

export function HomePage() {
  const navigate = useNavigate();
  const [activeOrderCount, setActiveOrderCount] = useState<number>(0);
  const [shopName, setShopName] = useState('SMART XEROX HUB');
  const [guestToken, setGuestToken] = useState<string>('');
  const [pricing, setPricing] = useState<any>(null);

  useEffect(() => {
    getOrCreateGuestSession().then((session) => {
      if (session?.sessionToken) {
        setGuestToken(session.sessionToken);
      }
      fetchGuestOrders().then(data => {
        const total = (data.documents?.length || 0) + (data.photos?.length || 0) + (data.scans?.length || 0);
        setActiveOrderCount(total);
      }).catch(() => {});
    });

    fetchPricing().then(p => {
      if (p) {
        setPricing(p);
        if (p.shopName) setShopName(p.shopName);
      }
    }).catch(() => {});
  }, []);

  const services = [
    {
      id: 'document',
      title: 'Document Xerox & Print',
      desc: 'PDF documents, notes, assignments. B&W, Color, Single or Manual Duplex.',
      icon: <FileText size={32} color="#0284c7" />,
      tag: 'A4 Plain Paper',
      color: '#e0f2fe',
      route: '/print-document'
    },
    {
      id: 'passport',
      title: 'Passport Photos (8 Copies)',
      desc: '8 professional passport photos on HP 4×6 Glossy Paper with precise face-cropper & cutting borders.',
      icon: <Camera size={32} color="#0284c7" />,
      tag: 'HP 4×6 Photo Paper • ₹30',
      color: '#e0f2fe',
      route: '/passport-photo'
    },
    {
      id: 'photo',
      title: 'Photo Printing',
      desc: 'High-gloss photo prints. Full A4 or 4×6 single/custom prints.',
      icon: <ImageIcon size={32} color="#059669" />,
      tag: 'A4 & 4×6 Photo Paper',
      color: '#d1fae5',
      route: '/print-photo'
    },
    {
      id: 'scan',
      title: 'Scan Document',
      desc: 'High-resolution flatbed scanning. Save as combined PDF or high-quality JPG.',
      icon: <Scan size={32} color="#7c3aed" />,
      tag: '150 - 600 DPI',
      color: '#ede9fe',
      route: '/scan-document'
    },
    {
      id: 'orders',
      title: 'My Orders & Downloads',
      desc: 'Live tracking of current print status, paper reversals, and scan downloads.',
      icon: <Clock size={32} color="#d97706" />,
      tag: activeOrderCount > 0 ? `${activeOrderCount} Active` : 'Track Live',
      color: '#fef3c7',
      route: '/my-orders'
    },
    {
      id: 'help',
      title: 'How It Works & Pricing',
      desc: 'Duplex paper flip instructions, rate list, and payment guide.',
      icon: <HelpCircle size={32} color="#475569" />,
      tag: 'Guide & Rates',
      color: '#f1f5f9',
      route: '/help'
    }
  ];

  return (
    <Container maxWidth="lg" sx={{ py: { xs: 2, sm: 3, md: 4 }, pb: 8 }}>
      {/* Header Banner */}
      <Box sx={{ textAlign: 'center', mb: 3 }}>
        <Stack direction="row" spacing={1.5} justifyContent="center" alignItems="center" sx={{ mb: 1 }}>
          <Box
            component="img"
            src="/logo.png"
            alt="Smart Xerox Hub"
            sx={{ width: 48, height: 48, borderRadius: 2 }}
          />
          <Typography variant="h5" component="h1" sx={{ fontWeight: 800, letterSpacing: -0.5, color: '#0f172a' }}>
            {shopName}
          </Typography>
        </Stack>

        <Stack direction="row" spacing={1} justifyContent="center" sx={{ mb: 1.5 }}>
          <Chip
            size="small"
            icon={<Printer size={14} color="#059669" />}
            label="HP Smart Tank 589 Ready"
            sx={{ bgcolor: '#ecfdf5', color: '#047857', fontWeight: 600, border: '1px solid #a7f3d0' }}
          />
          <Chip
            size="small"
            icon={<ShieldCheck size={14} color="#0284c7" />}
            label="No Account Required"
            sx={{ bgcolor: '#f0f9ff', color: '#0369a1', fontWeight: 600, border: '1px solid #bae6fd' }}
          />
        </Stack>

        <Typography variant="body2" color="text.secondary">
          Scan QR code, select service, upload files, and collect from counter.
        </Typography>

        {/* Guest Device Token Card (Private Device Isolation) */}
        {guestToken && (
          <Box sx={{ mt: 2, p: 1.5, bgcolor: '#f8fafc', borderRadius: 2, border: '1px dashed #cbd5e1', textAlign: 'left' }}>
            <Stack direction="row" justifyContent="space-between" alignItems="center">
              <Box>
                <Typography variant="caption" sx={{ fontWeight: 700, color: '#475569', display: 'block' }}>
                  📱 YOUR DEVICE SESSION TOKEN
                </Typography>
                <Typography variant="body2" sx={{ fontFamily: 'monospace', fontWeight: 800, color: '#0284c7' }}>
                  #{guestToken.slice(0, 10).toUpperCase()}
                </Typography>
              </Box>
              <Chip size="small" label="Device Storage Active" sx={{ bgcolor: '#ecfdf5', color: '#047857', fontSize: '0.7rem', fontWeight: 700 }} />
            </Stack>
            <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 0.5, fontSize: '0.7rem' }}>
              🔒 Private to this phone. Only you can view your uploads and order statuses.
            </Typography>
          </Box>
        )}

        {/* Live Shop Pricing Card */}
        {pricing && (
          <Box sx={{ mt: 2, p: 2, bgcolor: '#f0f9ff', borderRadius: 1, border: '1px solid #bae6fd', textAlign: 'left' }}>
            <Typography variant="subtitle2" sx={{ fontWeight: 800, color: '#0369a1', mb: 1 }}>
              🏷️ LIVE SHOP RATES &amp; PRICING
            </Typography>
            <Grid container spacing={1}>
              <Grid item xs={6}>
                <Typography variant="caption" color="text.secondary" sx={{ display: 'block' }}>A4 B&amp;W Single</Typography>
                <Typography variant="body2" sx={{ fontWeight: 700, color: '#0f172a' }}>₹{Number(pricing.a4BwSingleSideRate).toFixed(2)}/pg</Typography>
              </Grid>
              <Grid item xs={6}>
                <Typography variant="caption" color="text.secondary" sx={{ display: 'block' }}>A4 B&amp;W Duplex</Typography>
                <Typography variant="body2" sx={{ fontWeight: 700, color: '#0f172a' }}>₹{Number(pricing.a4BwDoubleSideRate).toFixed(2)}/sheet</Typography>
              </Grid>
              <Grid item xs={6}>
                <Typography variant="caption" color="text.secondary" sx={{ display: 'block' }}>A4 Color Single</Typography>
                <Typography variant="body2" sx={{ fontWeight: 700, color: '#0f172a' }}>₹{Number(pricing.a4ColorSingleSideRate).toFixed(2)}/pg</Typography>
              </Grid>
              <Grid item xs={6}>
                <Typography variant="caption" color="text.secondary" sx={{ display: 'block' }}>A4 Color Duplex</Typography>
                <Typography variant="body2" sx={{ fontWeight: 700, color: '#0f172a' }}>₹{Number(pricing.a4ColorDoubleSideRate).toFixed(2)}/sheet</Typography>
              </Grid>
              <Grid item xs={6}>
                <Typography variant="caption" color="text.secondary" sx={{ display: 'block' }}>Photo 4×6 inch</Typography>
                <Typography variant="body2" sx={{ fontWeight: 700, color: '#0f172a' }}>₹{Number(pricing.photo4x6Rate).toFixed(2)}/photo</Typography>
              </Grid>
              <Grid item xs={6}>
                <Typography variant="caption" color="text.secondary" sx={{ display: 'block' }}>Flatbed Scan</Typography>
                <Typography variant="body2" sx={{ fontWeight: 700, color: '#0f172a' }}>₹{Number(pricing.scanPerPageRate).toFixed(2)}/page</Typography>
              </Grid>
            </Grid>
          </Box>
        )}
      </Box>

      {/* Services Grid (Responsive: 1 col on mobile, 2 col on tablet, 3 col on desktop) */}
      <Grid container spacing={2}>
        {services.map((item) => (
          <Grid item xs={12} sm={6} md={4} key={item.id}>
            <Card
              sx={{
                height: '100%',
                display: 'flex',
                borderRadius: 1,
                transition: 'transform 0.15s ease, box-shadow 0.15s ease',
                '&:hover': {
                  transform: 'translateY(-2px)',
                  boxShadow: '0 8px 20px -4px rgba(0,0,0,0.08)'
                }
              }}
            >
              <CardActionArea onClick={() => navigate(item.route)} sx={{ p: 2.5, width: '100%', display: 'flex', flexDirection: 'column', alignItems: 'flex-start', justifyContent: 'space-between' }}>
                <Box sx={{ width: '100%' }}>
                  <Stack direction="row" spacing={1.5} alignItems="center" sx={{ mb: 1.5 }}>
                    <Box
                      sx={{
                        width: 50,
                        height: 50,
                        borderRadius: 1,
                        bgcolor: item.color,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        flexShrink: 0
                      }}
                    >
                      {item.icon}
                    </Box>
                    <Box sx={{ flexGrow: 1, minWidth: 0 }}>
                      <Chip
                        size="small"
                        label={item.tag}
                        sx={{
                          fontSize: '0.7rem',
                          fontWeight: 700,
                          bgcolor: item.color,
                          color: '#0f172a',
                          mb: 0.5
                        }}
                      />
                      <Typography variant="subtitle1" sx={{ fontWeight: 800, color: '#0f172a', lineHeight: 1.2 }}>
                        {item.title}
                      </Typography>
                    </Box>
                  </Stack>
                  <Typography variant="body2" color="text.secondary" sx={{ fontSize: '0.85rem', lineHeight: 1.4 }}>
                    {item.desc}
                  </Typography>
                </Box>
                <Stack direction="row" alignItems="center" spacing={0.5} sx={{ mt: 2, color: '#0284c7', fontWeight: 700, fontSize: '0.85rem' }}>
                  <span>Proceed</span>
                  <ChevronRight size={16} />
                </Stack>
              </CardActionArea>
            </Card>
          </Grid>
        ))}
      </Grid>

      {/* Quick Status Bar */}
      {activeOrderCount > 0 && (
        <Box sx={{ mt: 3, p: 2, bgcolor: '#eff6ff', borderRadius: 1, border: '1px solid #bfdbfe' }}>
          <Stack direction="row" justifyContent="space-between" alignItems="center">
            <Box>
              <Typography variant="subtitle2" sx={{ fontWeight: 700, color: '#1e40af' }}>
                You have {activeOrderCount} order(s) in progress
              </Typography>
              <Typography variant="caption" color="#3b82f6">
                Check status or paper flipping instructions
              </Typography>
            </Box>
            <Button
              size="small"
              variant="contained"
              onClick={() => navigate('/my-orders')}
              sx={{ bgcolor: '#2563eb' }}
            >
              View Orders
            </Button>
          </Stack>
        </Box>
      )}
    </Container>
  );
}
