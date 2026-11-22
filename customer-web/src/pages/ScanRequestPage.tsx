import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Box,
  Container,
  Typography,
  Card,
  CardContent,
  Button,
  Stack,
  RadioGroup,
  FormControlLabel,
  Radio,
  TextField,
  Divider,
  Alert,
  CircularProgress,
  IconButton
} from '@mui/material';
import {
  ArrowLeft,
  Scan,
  CheckCircle2,
  FileText,
  Sparkles
} from 'lucide-react';
import { submitScanOrder } from '../api.js';

export function ScanRequestPage() {
  const navigate = useNavigate();
  const [format, setFormat] = useState<'PDF' | 'JPEG'>('PDF');
  const [resolution, setResolution] = useState<number>(300);
  const [colorMode, setColorMode] = useState<'COLOR' | 'GRAYSCALE'>('COLOR');
  const [requestedPages, setRequestedPages] = useState<number>(1);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const pricePerPage = 10.0;
  const estimatedTotal = (requestedPages * pricePerPage).toFixed(2);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      setIsSubmitting(true);
      setError(null);

      const order = await submitScanOrder({
        format,
        resolution,
        colorMode,
        requestedPages
      });

      navigate('/my-orders', { state: { newOrderId: order.id } });
    } catch (err: any) {
      setError(err.message || 'Failed to submit scan request.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Container maxWidth="sm" sx={{ py: 3, pb: 8 }}>
      <Stack direction="row" alignItems="center" spacing={1} sx={{ mb: 2 }}>
        <IconButton onClick={() => navigate('/')} size="small">
          <ArrowLeft size={20} />
        </IconButton>
        <Typography variant="h6" sx={{ fontWeight: 700 }}>
          Scan Physical Document
        </Typography>
      </Stack>

      <form onSubmit={handleSubmit}>
        <Stack spacing={2.5}>
          {/* Explanation Alert */}
          <Alert severity="info" icon={<Scan size={20} />} sx={{ bgcolor: '#ede9fe', color: '#5b21b6', border: '1px solid #ddd6fe' }}>
            <strong>Flatbed Scanner Workflow:</strong> Hand your physical document to the shop operator. They will place it on the HP Smart Tank flatbed scanner glass, scan all requested pages, and the digital file will instantly appear in your <strong>My Orders</strong> tab for download.
          </Alert>

          {/* Format & Resolution Card */}
          <Card>
            <CardContent>
              <Typography variant="subtitle2" sx={{ fontWeight: 700, mb: 1.5, color: '#334155' }}>
                1. Output File Format
              </Typography>
              <RadioGroup
                row
                value={format}
                onChange={(e) => setFormat(e.target.value as 'PDF' | 'JPEG')}
              >
                <FormControlLabel
                  value="PDF"
                  control={<Radio />}
                  label="Multi-Page PDF (Recommended)"
                  sx={{ flex: 1 }}
                />
                <FormControlLabel
                  value="JPEG"
                  control={<Radio />}
                  label="JPEG Image"
                  sx={{ flex: 1 }}
                />
              </RadioGroup>

              <Divider sx={{ my: 2 }} />

              <Typography variant="subtitle2" sx={{ fontWeight: 700, mb: 1.5, color: '#334155' }}>
                2. Color Mode
              </Typography>
              <RadioGroup
                row
                value={colorMode}
                onChange={(e) => setColorMode(e.target.value as 'COLOR' | 'GRAYSCALE')}
              >
                <FormControlLabel value="COLOR" control={<Radio />} label="Full Color" sx={{ flex: 1 }} />
                <FormControlLabel value="GRAYSCALE" control={<Radio />} label="Grayscale (Document)" sx={{ flex: 1 }} />
              </RadioGroup>

              <Divider sx={{ my: 2 }} />

              <Typography variant="subtitle2" sx={{ fontWeight: 700, mb: 1, color: '#334155' }}>
                Estimated Number of Pages
              </Typography>
              <TextField
                type="number"
                size="small"
                fullWidth
                value={requestedPages}
                onChange={(e) => setRequestedPages(Math.max(1, parseInt(e.target.value || '1', 10)))}
                inputProps={{ min: 1, max: 50 }}
                helperText="Operator will scan this many physical pages on the flatbed"
              />
            </CardContent>
          </Card>

          {/* Pricing Estimation */}
          <Card sx={{ bgcolor: '#f0fdf4', border: '1px solid #bbf7d0' }}>
            <CardContent sx={{ py: 1.5, '&:last-child': { pb: 1.5 } }}>
              <Stack direction="row" justifyContent="space-between" alignItems="center">
                <Box>
                  <Typography variant="subtitle2" sx={{ fontWeight: 700, color: '#166534' }}>
                    Estimated Total
                  </Typography>
                  <Typography variant="caption" color="#15803d">
                    {requestedPages} page(s) @ ₹{pricePerPage.toFixed(2)}/page
                  </Typography>
                </Box>
                <Typography variant="h6" sx={{ fontWeight: 800, color: '#15803d' }}>
                  ₹{estimatedTotal}
                </Typography>
              </Stack>
            </CardContent>
          </Card>

          {error && <Alert severity="error">{error}</Alert>}

          <Button
            type="submit"
            variant="contained"
            size="large"
            disabled={isSubmitting}
            sx={{ py: 1.5, fontSize: '1rem', fontWeight: 700, bgcolor: '#7c3aed', '&:hover': { bgcolor: '#6d28d9' } }}
          >
            {isSubmitting ? (
              <Stack direction="row" spacing={1} alignItems="center">
                <CircularProgress size={20} color="inherit" />
                <span>Creating Scan Request...</span>
              </Stack>
            ) : (
              'Submit Scan Request'
            )}
          </Button>
        </Stack>
      </form>
    </Container>
  );
}
