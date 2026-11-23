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
  Divider,
  Alert,
  CircularProgress,
  IconButton,
  Chip
} from '@mui/material';
import {
  ArrowLeft,
  Upload,
  FileCheck,
  Layers,
  Copy,
  Info
} from 'lucide-react';
import { PDFDocument } from 'pdf-lib';
import { submitDocumentOrder } from '../api.js';
import { calculateDuplexPages } from '@smart-xerox-hub/shared';
import { CopiesInput } from '../components/CopiesInput';

export function DocumentPrintPage() {
  const navigate = useNavigate();
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [colorMode, setColorMode] = useState<'BW' | 'COLOR'>('BW');
  const [sides, setSides] = useState<'SINGLE' | 'MANUAL_DUPLEX'>('SINGLE');
  const [copies, setCopies] = useState<number>(1);
  const [pageRange, setPageRange] = useState<string>('ALL');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Exact PDF page count detected directly from uploaded PDF
  const [detectedPages, setDetectedPages] = useState<number | null>(null);
  const [isDetectingPages, setIsDetectingPages] = useState<boolean>(false);

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      if (file.type !== 'application/pdf') {
        setError('Please upload a valid PDF document.');
        return;
      }
      setError(null);
      setSelectedFile(file);
      setIsDetectingPages(true);

      try {
        const buffer = await file.arrayBuffer();
        const pdfDoc = await PDFDocument.load(buffer, { ignoreEncryption: true });
        const count = pdfDoc.getPageCount();
        setDetectedPages(count);
      } catch (err: any) {
        console.error('Failed to parse PDF page count:', err);
        // Fallback: estimate from binary markers
        try {
          const buffer = await file.arrayBuffer();
          const text = new TextDecoder('latin1').decode(new Uint8Array(buffer));
          const matches = text.match(/\/Type\s*\/Page\b(?!\s*s)/g);
          setDetectedPages(matches ? matches.length : 1);
        } catch {
          setDetectedPages(1);
        }
      } finally {
        setIsDetectingPages(false);
      }
    }
  };

  // Pricing calculation
  const bwSingleRate = 2.0;
  const bwDoubleRate = 1.5; // per printed side
  const colorSingleRate = 10.0;
  const colorDoubleRate = 9.0; // per printed side

  const ratePerSide =
    colorMode === 'COLOR'
      ? sides === 'MANUAL_DUPLEX'
        ? colorDoubleRate
        : colorSingleRate
      : sides === 'MANUAL_DUPLEX'
      ? bwDoubleRate
      : bwSingleRate;

  const effectivePageCount = detectedPages || 1;
  const estimatedTotal = (effectivePageCount * ratePerSide * copies).toFixed(2);
  const duplexMath = sides === 'MANUAL_DUPLEX' ? calculateDuplexPages(effectivePageCount) : null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedFile) {
      setError('Please select a PDF file to upload.');
      return;
    }

    try {
      setIsSubmitting(true);
      setError(null);

      const formData = new FormData();
      formData.append('file', selectedFile);
      formData.append('colorMode', colorMode);
      formData.append('sides', sides);
      formData.append('copies', copies.toString());
      formData.append('pageRange', pageRange);
      if (detectedPages) {
        formData.append('totalPages', detectedPages.toString());
      }

      const order = await submitDocumentOrder(formData);
      navigate('/my-orders', { state: { newOrderId: order.id } });
    } catch (err: any) {
      setError(err.message || 'Failed to submit document order.');
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
          Document Xerox &amp; Print
        </Typography>
      </Stack>

      <form onSubmit={handleSubmit}>
        <Stack spacing={2.5}>
          {/* File Upload Box */}
          <Card sx={{ border: '2px dashed #cbd5e1', bgcolor: '#f8fafc', textAlign: 'center', p: 3, borderRadius: 1 }}>
            <input
              type="file"
              accept="application/pdf"
              id="pdf-upload-input"
              style={{ display: 'none' }}
              onChange={handleFileChange}
            />
            <label htmlFor="pdf-upload-input" style={{ cursor: 'pointer', display: 'block' }}>
              <Box sx={{ mb: 1, display: 'inline-flex', p: 1.5, bgcolor: '#e0f2fe', borderRadius: '50%' }}>
                {selectedFile ? <FileCheck size={32} color="#0284c7" /> : <Upload size={32} color="#0284c7" />}
              </Box>
              <Typography variant="subtitle1" sx={{ fontWeight: 700, color: '#0f172a' }}>
                {selectedFile ? selectedFile.name : 'Tap to Upload PDF'}
              </Typography>
              <Typography variant="caption" color="text.secondary">
                {selectedFile
                  ? `${(selectedFile.size / (1024 * 1024)).toFixed(2)} MB • PDF Document`
                  : 'Supported format: PDF up to 50 MB'}
              </Typography>
            </label>
          </Card>

          {/* Static Number of Pages Display Card (Appears when PDF is uploaded) */}
          {selectedFile && (
            <Card sx={{ bgcolor: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: 1 }}>
              <CardContent sx={{ py: 2, '&:last-child': { pb: 2 } }}>
                <Stack direction="row" justifyContent="space-between" alignItems="center">
                  <Box>
                    <Typography variant="caption" sx={{ fontWeight: 800, color: '#166534', textTransform: 'uppercase', letterSpacing: 0.5 }}>
                      📄 Verified PDF Page Count
                    </Typography>
                    <Typography variant="h5" sx={{ fontWeight: 800, color: '#15803d', mt: 0.5 }}>
                      {isDetectingPages ? (
                        <Stack direction="row" spacing={1} alignItems="center">
                          <CircularProgress size={18} color="inherit" />
                          <span>Reading document pages...</span>
                        </Stack>
                      ) : (
                        `${detectedPages} Page${detectedPages && detectedPages > 1 ? 's' : ''}`
                      )}
                    </Typography>
                    <Typography variant="caption" color="text.secondary">
                      Static document page count read directly from your PDF file.
                    </Typography>
                  </Box>

                  {detectedPages !== null && !isDetectingPages && (
                    <Chip
                      label={`${detectedPages} Pages (Static)`}
                      color="success"
                      sx={{ fontWeight: 800, fontSize: '0.85rem', height: 32, borderRadius: 1 }}
                    />
                  )}
                </Stack>
              </CardContent>
            </Card>
          )}

          {/* Print Configuration Card */}
          <Card sx={{ borderRadius: 1 }}>
            <CardContent>
              <Typography variant="subtitle2" sx={{ fontWeight: 700, mb: 1.5, color: '#334155' }}>
                1. Print Color Mode
              </Typography>
              <RadioGroup
                row
                value={colorMode}
                onChange={(e) => setColorMode(e.target.value as 'BW' | 'COLOR')}
              >
                <FormControlLabel
                  value="BW"
                  control={<Radio />}
                  label="Black &amp; White (Economical)"
                  sx={{ flex: 1 }}
                />
                <FormControlLabel
                  value="COLOR"
                  control={<Radio />}
                  label="Full Color"
                  sx={{ flex: 1 }}
                />
              </RadioGroup>

              <Divider sx={{ my: 2 }} />

              <Typography variant="subtitle2" sx={{ fontWeight: 700, mb: 1, color: '#334155' }}>
                2. Printing Sides
              </Typography>
              <RadioGroup
                value={sides}
                onChange={(e) => setSides(e.target.value as 'SINGLE' | 'MANUAL_DUPLEX')}
              >
                <FormControlLabel
                  value="SINGLE"
                  control={<Radio />}
                  label={
                    <Box>
                      <Typography variant="body2" sx={{ fontWeight: 600 }}>
                        Single-Sided (One side per sheet)
                      </Typography>
                      <Typography variant="caption" color="text.secondary">
                        Standard one-sided printing (₹{colorMode === 'COLOR' ? colorSingleRate : bwSingleRate}/page)
                      </Typography>
                    </Box>
                  }
                />
                <FormControlLabel
                  value="MANUAL_DUPLEX"
                  control={<Radio />}
                  label={
                    <Box>
                      <Typography variant="body2" sx={{ fontWeight: 600 }}>
                        Manual Double-Sided (Duplex Xerox)
                      </Typography>
                      <Typography variant="caption" color="text.secondary">
                        Saves paper. Uses odd/even stack reversal engine on A4 paper (₹{colorMode === 'COLOR' ? colorDoubleRate : bwDoubleRate}/side).
                      </Typography>
                    </Box>
                  }
                  sx={{ mt: 1 }}
                />
              </RadioGroup>

              {sides === 'MANUAL_DUPLEX' && (
                <Alert severity="info" icon={<Info size={18} />} sx={{ mt: 1.5, fontSize: '0.8rem', borderRadius: 1 }}>
                  <strong>Manual Duplex Engine:</strong> Prints odd pages first, prompts admin to flip paper, then prints reverse even pages. Odd-count documents automatically receive a blank last page.
                  {duplexMath && (
                    <Box sx={{ mt: 0.5, fontWeight: 600 }}>
                      • Uses {duplexMath.firstSidePages.length} physical paper sheet(s) for {effectivePageCount} page(s).
                    </Box>
                  )}
                </Alert>
              )}

              <Divider sx={{ my: 2 }} />

              <Stack direction="row" spacing={2} alignItems="center">
                <Box sx={{ flex: 1 }}>
                  <Typography variant="subtitle2" sx={{ fontWeight: 700, mb: 1, color: '#334155' }}>
                    Number of Copies (Max 10)
                  </Typography>
                  <CopiesInput
                    value={copies}
                    onChange={(val) => setCopies(val)}
                    min={1}
                    max={10}
                    label="copy(s)"
                  />
                </Box>
                <Box sx={{ flex: 1 }}>
                  <Typography variant="subtitle2" sx={{ fontWeight: 700, mb: 1, color: '#334155' }}>
                    Paper Type
                  </Typography>
                  <Chip label="Normal A4 (80 GSM)" sx={{ height: 40, width: '100%', fontWeight: 600, borderRadius: 1 }} />
                </Box>
              </Stack>
            </CardContent>
          </Card>

          {/* Pricing Estimation Summary */}
          <Card sx={{ bgcolor: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: 1 }}>
            <CardContent sx={{ py: 1.5, '&:last-child': { pb: 1.5 } }}>
              <Stack direction="row" justifyContent="space-between" alignItems="center">
                <Box>
                  <Typography variant="subtitle2" sx={{ fontWeight: 700, color: '#166534' }}>
                    Estimated Total
                  </Typography>
                  <Typography variant="caption" color="#15803d">
                    {effectivePageCount} page(s) × ₹{ratePerSide.toFixed(2)} × {copies} copy(s) •{' '}
                    {colorMode === 'COLOR' ? 'Color' : 'B&W'} •{' '}
                    {sides === 'MANUAL_DUPLEX' ? 'Double-Sided' : 'Single-Sided'}
                  </Typography>
                </Box>
                <Typography variant="h5" sx={{ fontWeight: 800, color: '#15803d' }}>
                  ₹{estimatedTotal}
                </Typography>
              </Stack>
            </CardContent>
          </Card>

          {error && <Alert severity="error" sx={{ borderRadius: 1 }}>{error}</Alert>}

          <Button
            type="submit"
            variant="contained"
            size="large"
            disabled={!selectedFile || isSubmitting || isDetectingPages}
            sx={{
              py: 1.5,
              fontSize: '1rem',
              fontWeight: 700,
              borderRadius: 1,
              bgcolor: '#0284c7',
              '&:hover': { bgcolor: '#0369a1' }
            }}
          >
            {isSubmitting ? (
              <Stack direction="row" spacing={1} alignItems="center">
                <CircularProgress size={20} color="inherit" />
                <span>Uploading &amp; Generating Print Files...</span>
              </Stack>
            ) : (
              'Submit Order for Xerox Approval'
            )}
          </Button>
        </Stack>
      </form>
    </Container>
  );
}
