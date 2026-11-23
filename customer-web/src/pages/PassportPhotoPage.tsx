import React, { useState, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Box,
  Container,
  Typography,
  Card,
  CardContent,
  Button,
  Stack,
  Slider,
  IconButton,
  RadioGroup,
  FormControlLabel,
  Radio,
  TextField,
  Divider,
  Alert,
  CircularProgress,
  Chip,
  Grid
} from '@mui/material';
import {
  ArrowLeft,
  Upload,
  Crop as CropIcon,
  RotateCw,
  ZoomIn,
  ZoomOut,
  Camera,
  CheckCircle2,
  Trash2,
  Edit2,
  Printer
} from 'lucide-react';
import { submitPhotoOrder, fetchPricing } from '../api.js';

// Aspect ratio: 35mm width / 45mm height = 7/9
const PASSPORT_ASPECT_RATIO = 35 / 45; // ~0.7778

export function PassportPhotoPage() {
  const navigate = useNavigate();

  // Steps: 'UPLOAD' | 'CROP' | 'PREVIEW'
  const [step, setStep] = useState<'UPLOAD' | 'CROP' | 'PREVIEW'>('UPLOAD');

  const [rawImageSrc, setRawImageSrc] = useState<string | null>(null);
  const [imageFileName, setImageFileName] = useState<string>('passport_photo.jpg');

  // Crop / Transform states
  const [zoom, setZoom] = useState<number>(1);
  const [rotation, setRotation] = useState<number>(0);
  const [pan, setPan] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState<boolean>(false);
  const [dragStart, setDragStart] = useState<{ x: number; y: number }>({ x: 0, y: 0 });

  // Cropped single photo data URL
  const [croppedDataUrl, setCroppedDataUrl] = useState<string | null>(null);

  // 8-Up sheet on 4x6 Canvas data URL and Blob
  const [sheetDataUrl, setSheetDataUrl] = useState<string | null>(null);
  const [sheetBlob, setSheetBlob] = useState<Blob | null>(null);

  // Order options
  const [copies, setCopies] = useState<number>(1); // 1 set = 8 photos
  const [colorMode, setColorMode] = useState<'COLOR' | 'BW'>('COLOR');
  const [ratePerSet, setRatePerSet] = useState<number>(30); // ₹30 default
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  // Canvas refs
  const cropCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const sheetCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const imageObjRef = useRef<HTMLImageElement | null>(null);

  useEffect(() => {
    fetchPricing().then((p) => {
      if (p?.passport8Rate) {
        setRatePerSet(p.passport8Rate);
      } else if (p?.photo4x6Rate) {
        setRatePerSet(p.photo4x6Rate + 10); // Standard passport setup rate
      }
    }).catch(() => {});
  }, []);

  // 1. File Selection Handler
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      if (!/image\/(jpeg|png|jpg)/i.test(file.type)) {
        setError('Please upload a JPEG, JPG, or PNG image.');
        return;
      }
      setError(null);
      setImageFileName(file.name);

      const reader = new FileReader();
      reader.onload = (event) => {
        const result = event.target?.result as string;
        setRawImageSrc(result);
        const img = new Image();
        img.src = result;
        img.onload = () => {
          imageObjRef.current = img;
          setZoom(1);
          setRotation(0);
          setPan({ x: 0, y: 0 });
          setStep('CROP');
        };
      };
      reader.readAsDataURL(file);
    }
  };

  // 2. Mouse/Touch Drag for Crop Alignment
  const handleMouseDown = (e: React.MouseEvent) => {
    setIsDragging(true);
    setDragStart({ x: e.clientX - pan.x, y: e.clientY - pan.y });
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!isDragging) return;
    setPan({
      x: e.clientX - dragStart.x,
      y: e.clientY - dragStart.y
    });
  };

  const handleMouseUp = () => setIsDragging(false);

  const handleTouchStart = (e: React.TouchEvent) => {
    if (e.touches.length === 1) {
      if (e.cancelable) e.preventDefault();
      setIsDragging(true);
      setDragStart({ x: e.touches[0].clientX - pan.x, y: e.touches[0].clientY - pan.y });
    }
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    if (!isDragging || e.touches.length !== 1) return;
    if (e.cancelable) e.preventDefault();
    setPan({
      x: e.touches[0].clientX - dragStart.x,
      y: e.touches[0].clientY - dragStart.y
    });
  };

  const handleTouchEnd = () => setIsDragging(false);

  // 3. Render Crop Canvas
  useEffect(() => {
    if (step !== 'CROP' || !cropCanvasRef.current || !imageObjRef.current) return;

    const canvas = cropCanvasRef.current;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const img = imageObjRef.current;
    const w = canvas.width;
    const h = canvas.height;

    ctx.clearRect(0, 0, w, h);
    ctx.save();

    // Center pivot
    ctx.translate(w / 2 + pan.x, h / 2 + pan.y);
    ctx.rotate((rotation * Math.PI) / 180);
    ctx.scale(zoom, zoom);

    // Draw image centered
    const imgRatio = img.width / img.height;
    let drawW = w;
    let drawH = w / imgRatio;
    if (drawH < h) {
      drawH = h;
      drawW = h * imgRatio;
    }
    ctx.drawImage(img, -drawW / 2, -drawH / 2, drawW, drawH);
    ctx.restore();
  }, [step, zoom, rotation, pan]);

  // 4. Save Single Cropped Photo & Generate 8-Up Sheet
  const handleSaveCropAndPreview = () => {
    if (!cropCanvasRef.current || !imageObjRef.current) return;

    const cropCanvas = cropCanvasRef.current;
    // High-resolution crop (700 x 900 px - exact 35:45 ratio)
    const singleWidth = 700;
    const singleHeight = Math.round(singleWidth / PASSPORT_ASPECT_RATIO); // 900 px

    const offscreen = document.createElement('canvas');
    offscreen.width = singleWidth;
    offscreen.height = singleHeight;
    const offCtx = offscreen.getContext('2d');
    if (!offCtx) return;

    offCtx.drawImage(cropCanvas, 0, 0, singleWidth, singleHeight);
    const singleUrl = offscreen.toDataURL('image/jpeg', 0.95);
    setCroppedDataUrl(singleUrl);

    // Generate 8-up on 4x6 HP Photo Paper (1800 x 1200 px landscape at 300 DPI)
    generate8PhotoSheet(offscreen);
  };

  const generate8PhotoSheet = (singlePhotoCanvas: HTMLCanvasElement) => {
    // 4x6 inch paper in landscape = 6 inch wide x 4 inch high (1800 x 1200 px at 300 DPI)
    const sheetW = 1800;
    const sheetH = 1200;

    const canvas = document.createElement('canvas');
    canvas.width = sheetW;
    canvas.height = sheetH;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Pure white photo paper background
    ctx.fillStyle = '#FFFFFF';
    ctx.fillRect(0, 0, sheetW, sheetH);

    // 2 rows x 4 columns = 8 photos
    const cols = 4;
    const rows = 2;

    // Standard 35 mm x 45 mm passport photo aspect ratio (7:9 = 0.7778)
    // Carefully calibrated to fit completely inside the HP Smart Tank 589 hardware printable area:
    // HP 589 trailing paper feed margin is ~14.2 mm (~168 px at 300 DPI).
    // Bottom margin is set to 170 px so bottom row chins are NEVER cropped!
    // Left & right margins are 118 px (10 mm) so right-edge photos are NEVER cropped!
    const photoH = 445;
    const photoW = Math.round(photoH * PASSPORT_ASPECT_RATIO); // 346 px

    const topMargin = 80;
    const rowGap = 60;
    // 80 + 445 + 60 + 445 + 170 = 1200 px exactly
    const leftMargin = 118;
    const colGap = 60;
    // 118 + (4 * 346) + (3 * 60) + 118 = 118 + 1384 + 180 + 118 = 1800 px exactly

    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const x = leftMargin + c * (photoW + colGap);
        const y = topMargin + r * (photoH + rowGap);

        // Draw passport photo
        ctx.drawImage(singlePhotoCanvas, x, y, photoW, photoH);

        // Draw fine, crisp photo cut border around each individual photo (matching reference image 2)
        ctx.lineWidth = 2;
        ctx.strokeStyle = '#334155'; // Dark slate border
        ctx.strokeRect(x, y, photoW, photoH);
      }
    }

    const dataUrl = canvas.toDataURL('image/jpeg', 0.95);
    setSheetDataUrl(dataUrl);

    canvas.toBlob((blob) => {
      if (blob) setSheetBlob(blob);
    }, 'image/jpeg', 0.95);

    setStep('PREVIEW');
  };

  // 5. Submit Order to Backend
  const handleSubmitOrder = async () => {
    if (!sheetBlob) {
      setError('Please crop your photo first.');
      return;
    }

    setIsSubmitting(true);
    setError(null);

    try {
      const formData = new FormData();
      const filename = `Passport8_${Date.now()}_${imageFileName.replace(/[^a-zA-Z0-9_-]/g, '_')}.jpg`;
      formData.append('photos', sheetBlob, filename);
      formData.append('paperType', 'PHOTO_4X6');
      formData.append('colorMode', colorMode);
      formData.append('copies', copies.toString());
      formData.append('photosPerSheet', '8');
      formData.append('photoType', 'PASSPORT_8');

      await submitPhotoOrder(formData);
      navigate('/my-orders');
    } catch (err: any) {
      console.error('Passport order submission failed:', err);
      setError(err.message || 'Failed to submit passport order. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const calculatedTotalPrice = copies * ratePerSet;

  return (
    <Container maxWidth="md" sx={{ py: 3, pb: 8 }}>
      {/* Top Header */}
      <Stack direction="row" alignItems="center" spacing={1} sx={{ mb: 2 }}>
        <IconButton
          onClick={() => {
            if (step === 'PREVIEW') setStep('CROP');
            else if (step === 'CROP') setStep('UPLOAD');
            else navigate('/');
          }}
          size="small"
        >
          <ArrowLeft size={20} />
        </IconButton>
        <Box>
          <Stack direction="row" spacing={1} alignItems="center">
            <Typography variant="h6" sx={{ fontWeight: 800, color: '#0f172a' }}>
              Passport Size Photos (8 Copies)
            </Typography>
            <Chip
              label="HP 4×6 Photo Paper"
              size="small"
              sx={{ bgcolor: '#0284c7', color: 'white', fontWeight: 700, fontSize: '0.7rem' }}
            />
          </Stack>
          <Typography variant="caption" color="text.secondary">
            Automatic 8-photo layout on HP Glossy 4×6 inch paper with borders & cutting margins
          </Typography>
        </Box>
      </Stack>

      {error && (
        <Alert severity="error" sx={{ mb: 2, borderRadius: 2 }}>
          {error}
        </Alert>
      )}

      {/* STEP 1: UPLOAD PHOTO */}
      {step === 'UPLOAD' && (
        <Card sx={{ borderRadius: 3, boxShadow: '0 4px 20px rgba(0,0,0,0.06)' }}>
          <CardContent sx={{ p: 4, textAlign: 'center' }}>
            <Box
              sx={{
                width: 72,
                height: 72,
                borderRadius: '50%',
                bgcolor: '#e0f2fe',
                color: '#0284c7',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                mx: 'auto',
                mb: 2
              }}
            >
              <Camera size={36} />
            </Box>

            <Typography variant="h6" sx={{ fontWeight: 800, color: '#0f172a', mb: 1 }}>
              Upload Your Portrait / Photo
            </Typography>
            <Typography variant="body2" color="text.secondary" sx={{ maxWidth: 440, mx: 'auto', mb: 3 }}>
              Upload a clear face photo or selfie. On the next step, our interactive cropper will frame your face to the exact 35 × 45 mm passport standard!
            </Typography>

            <Button
              variant="contained"
              component="label"
              size="large"
              startIcon={<Upload size={20} />}
              sx={{
                bgcolor: '#0284c7',
                '&:hover': { bgcolor: '#0369a1' },
                py: 1.5,
                px: 4,
                borderRadius: 2,
                fontWeight: 700,
                fontSize: '1rem'
              }}
            >
              Select Image from Device
              <input type="file" accept="image/jpeg,image/png,image/jpg" hidden onChange={handleFileChange} />
            </Button>

            <Box sx={{ mt: 4, p: 2.5, bgcolor: '#f8fafc', borderRadius: 2, border: '1px solid #e2e8f0', textAlign: 'left' }}>
              <Typography variant="subtitle2" sx={{ fontWeight: 700, color: '#334155', mb: 1 }}>
                💡 Guidelines for Best Passport Quality:
              </Typography>
              <Typography variant="body2" color="text.secondary" component="ul" sx={{ pl: 2, m: 0 }}>
                <li>Face looking straight into camera with natural expression.</li>
                <li>Plain white, light blue, or neutral background recommended.</li>
                <li>Both ears and shoulders visible for official passport/visa compliance.</li>
                <li>Printed at ultra-sharp 600 DPI on genuine HP Glossy Photo Paper.</li>
              </Typography>
            </Box>
          </CardContent>
        </Card>
      )}

      {/* STEP 2: INTERACTIVE CROPPER */}
      {step === 'CROP' && (
        <Card sx={{ borderRadius: 3, boxShadow: '0 4px 20px rgba(0,0,0,0.06)' }}>
          <CardContent sx={{ p: 3 }}>
            <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 2 }}>
              <Box>
                <Typography variant="subtitle1" sx={{ fontWeight: 800 }}>
                  Crop & Center Your Passport Face
                </Typography>
                <Typography variant="caption" color="text.secondary">
                  Drag with mouse/finger to align your head inside the guide. Aspect ratio: 35 mm × 45 mm.
                </Typography>
              </Box>
              <Button
                size="small"
                variant="outlined"
                startIcon={<RotateCw size={14} />}
                onClick={() => setRotation((r) => (r + 90) % 360)}
              >
                Rotate 90°
              </Button>
            </Stack>

            {/* Cropping Canvas Viewport */}
            <Box
              sx={{
                position: 'relative',
                width: 280,
                height: 360,
                mx: 'auto',
                borderRadius: 2,
                overflow: 'hidden',
                bgcolor: '#0f172a',
                cursor: isDragging ? 'grabbing' : 'grab',
                userSelect: 'none',
                WebkitUserSelect: 'none',
                touchAction: 'none',
                boxShadow: '0 10px 30px rgba(0,0,0,0.2)',
                border: '3px solid #0284c7'
              }}
              onMouseDown={handleMouseDown}
              onMouseMove={handleMouseMove}
              onMouseUp={handleMouseUp}
              onMouseLeave={handleMouseUp}
              onTouchStart={handleTouchStart}
              onTouchMove={handleTouchMove}
              onTouchEnd={handleTouchEnd}
            >
              <canvas
                ref={cropCanvasRef}
                width={280}
                height={360}
                style={{ width: '100%', height: '100%', display: 'block' }}
              />

              {/* Passport Face Framing Overlay */}
              <Box
                sx={{
                  position: 'absolute',
                  top: 0,
                  left: 0,
                  right: 0,
                  bottom: 0,
                  pointerEvents: 'none',
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  justifyContent: 'center'
                }}
              >
                {/* Oval Head Guide */}
                <Box
                  sx={{
                    width: 170,
                    height: 230,
                    borderRadius: '50%',
                    border: '2px dashed rgba(255, 255, 255, 0.85)',
                    boxShadow: '0 0 0 9999px rgba(0, 0, 0, 0.35)',
                    position: 'relative'
                  }}
                >
                  <Typography
                    variant="caption"
                    sx={{
                      position: 'absolute',
                      top: 10,
                      width: '100%',
                      textAlign: 'center',
                      color: 'white',
                      fontWeight: 700,
                      fontSize: '0.65rem',
                      textShadow: '0 1px 3px rgba(0,0,0,0.8)'
                    }}
                  >
                    TOP OF HEAD
                  </Typography>
                  <Typography
                    variant="caption"
                    sx={{
                      position: 'absolute',
                      bottom: 12,
                      width: '100%',
                      textAlign: 'center',
                      color: 'white',
                      fontWeight: 700,
                      fontSize: '0.65rem',
                      textShadow: '0 1px 3px rgba(0,0,0,0.8)'
                    }}
                  >
                    CHIN LEVEL
                  </Typography>
                </Box>
              </Box>
            </Box>

            {/* Zoom Slider */}
            <Box sx={{ maxWidth: 360, mx: 'auto', mt: 3 }}>
              <Stack direction="row" spacing={2} alignItems="center">
                <ZoomOut size={18} color="#64748b" />
                <Slider
                  value={zoom}
                  min={0.8}
                  max={3}
                  step={0.05}
                  onChange={(_, val) => setZoom(val as number)}
                  sx={{ color: '#0284c7' }}
                />
                <ZoomIn size={18} color="#64748b" />
              </Stack>
              <Typography variant="caption" sx={{ display: 'block', textAlign: 'center', color: '#64748b' }}>
                Zoom: {Math.round(zoom * 100)}% • Drag photo to center face inside the oval
              </Typography>
            </Box>

            <Divider sx={{ my: 3 }} />

            <Stack
              direction={{ xs: 'column-reverse', sm: 'row' }}
              spacing={2}
              justifyContent="space-between"
              sx={{ width: '100%' }}
            >
              <Button
                variant="outlined"
                color="inherit"
                fullWidth
                startIcon={<Trash2 size={16} />}
                onClick={() => setStep('UPLOAD')}
                sx={{ width: { xs: '100%', sm: 'auto' } }}
              >
                Change Photo
              </Button>
              <Button
                variant="contained"
                size="large"
                fullWidth
                startIcon={<CropIcon size={18} />}
                onClick={handleSaveCropAndPreview}
                sx={{
                  bgcolor: '#059669',
                  '&:hover': { bgcolor: '#047857' },
                  fontWeight: 700,
                  px: 3,
                  width: { xs: '100%', sm: 'auto' }
                }}
              >
                Save & Preview 8 Photos on 4×6
              </Button>
            </Stack>
          </CardContent>
        </Card>
      )}

      {/* STEP 3: 8-PHOTO 4×6 SHEET PREVIEW & SUBMISSION */}
      {step === 'PREVIEW' && sheetDataUrl && (
        <Card sx={{ borderRadius: 3, boxShadow: '0 4px 20px rgba(0,0,0,0.06)' }}>
          <CardContent sx={{ p: 3 }}>
            <Box sx={{ mb: 2, textAlign: 'center' }}>
              <Chip
                icon={<CheckCircle2 size={16} />}
                label="8-Up Passport Sheet Generated"
                color="success"
                sx={{ fontWeight: 700, mb: 1 }}
              />
              <Typography variant="h6" sx={{ fontWeight: 800 }}>
                Interactive 4 × 6 Inch HP Photo Paper Preview
              </Typography>
              <Typography variant="body2" color="text.secondary">
                Exact arrangement of 8 passport photos with borders & cutting margins (aligned exactly to 4×6 sheet)
              </Typography>
            </Box>

            {/* Realistic 4x6 HP Photo Paper Sheet Representation */}
            <Box
              sx={{
                maxWidth: 620,
                mx: 'auto',
                p: 2,
                bgcolor: '#f1f5f9',
                borderRadius: 3,
                border: '1px solid #cbd5e1',
                boxShadow: 'inset 0 2px 6px rgba(0,0,0,0.05)'
              }}
            >
              <Box
                sx={{
                  position: 'relative',
                  width: '100%',
                  aspectRatio: '6 / 4', // 1.5 aspect ratio for 4x6 in landscape
                  bgcolor: '#ffffff',
                  borderRadius: 1,
                  boxShadow: '0 12px 28px rgba(0,0,0,0.15)',
                  overflow: 'hidden',
                  border: '1px solid #e2e8f0'
                }}
              >
                <img
                  src={sheetDataUrl}
                  alt="8-Up Passport Preview"
                  style={{ width: '100%', height: '100%', objectFit: 'contain', display: 'block' }}
                />

                {/* HP Glossy watermark pill overlay */}
                <Box
                  sx={{
                    position: 'absolute',
                    bottom: 8,
                    right: 8,
                    bgcolor: 'rgba(15, 23, 42, 0.75)',
                    backdropFilter: 'blur(4px)',
                    color: 'white',
                    px: 1,
                    py: 0.3,
                    borderRadius: 1,
                    fontSize: '0.65rem',
                    fontWeight: 700,
                    letterSpacing: 0.5
                  }}
                >
                  HP GLOSSY PHOTO PAPER • 4×6 INCH
                </Box>
              </Box>
            </Box>

            {/* Order Configuration Bar */}
            <Box sx={{ mt: 3, p: 2.5, bgcolor: '#f8fafc', borderRadius: 2, border: '1px solid #e2e8f0' }}>
              <Grid container spacing={2} alignItems="center">
                <Grid item xs={12} sm={6}>
                  <Typography variant="subtitle2" sx={{ fontWeight: 700, mb: 0.5 }}>
                    Color Mode
                  </Typography>
                  <RadioGroup
                    row
                    value={colorMode}
                    onChange={(e) => setColorMode(e.target.value as 'COLOR' | 'BW')}
                  >
                    <FormControlLabel value="COLOR" control={<Radio size="small" />} label="Color (Vivid CMYK)" />
                    <FormControlLabel value="BW" control={<Radio size="small" />} label="Black & White" />
                  </RadioGroup>
                </Grid>

                <Grid item xs={12} sm={6}>
                  <Typography variant="subtitle2" sx={{ fontWeight: 700, mb: 0.5 }}>
                    Sets of 8 Photos (4×6 Sheets)
                  </Typography>
                  <Stack direction="row" spacing={1} alignItems="center">
                    <TextField
                      type="number"
                      size="small"
                      value={copies}
                      onChange={(e) => setCopies(Math.max(1, parseInt(e.target.value || '1', 10)))}
                      inputProps={{ min: 1, max: 20 }}
                      sx={{ width: 100 }}
                    />
                    <Typography variant="body2" color="text.secondary">
                      sheet(s) = <strong>{copies * 8} total photos</strong>
                    </Typography>
                  </Stack>
                </Grid>
              </Grid>

              <Divider sx={{ my: 2 }} />

              <Stack
                direction={{ xs: 'column', sm: 'row' }}
                justifyContent="space-between"
                alignItems={{ xs: 'stretch', sm: 'center' }}
                spacing={2}
              >
                <Box>
                  <Typography variant="caption" color="text.secondary">
                    Rate: ₹{ratePerSet.toFixed(2)} per sheet of 8 photos
                  </Typography>
                  <Typography variant="h5" sx={{ fontWeight: 800, color: '#059669' }}>
                    Total: ₹{calculatedTotalPrice.toFixed(2)}
                  </Typography>
                </Box>

                <Stack
                  direction={{ xs: 'column-reverse', sm: 'row' }}
                  spacing={1.5}
                  sx={{ width: { xs: '100%', sm: 'auto' } }}
                >
                  <Button
                    variant="outlined"
                    startIcon={<Edit2 size={16} />}
                    onClick={() => setStep('CROP')}
                    disabled={isSubmitting}
                    fullWidth
                    sx={{ width: { xs: '100%', sm: 'auto' } }}
                  >
                    Change / Re-crop
                  </Button>
                  <Button
                    variant="contained"
                    size="large"
                    startIcon={isSubmitting ? <CircularProgress size={18} color="inherit" /> : <Printer size={18} />}
                    disabled={isSubmitting}
                    onClick={handleSubmitOrder}
                    fullWidth
                    sx={{
                      bgcolor: '#0284c7',
                      '&:hover': { bgcolor: '#0369a1' },
                      fontWeight: 800,
                      px: 3,
                      width: { xs: '100%', sm: 'auto' }
                    }}
                  >
                    {isSubmitting ? 'Uploading Order...' : '🚀 Upload & Submit Print Request'}
                  </Button>
                </Stack>
              </Stack>
            </Box>
          </CardContent>
        </Card>
      )}
    </Container>
  );
}
