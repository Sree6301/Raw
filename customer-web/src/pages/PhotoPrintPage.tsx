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
  RadioGroup,
  FormControlLabel,
  Radio,
  TextField,
  Divider,
  Alert,
  CircularProgress,
  IconButton,
  Slider,
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

export function PhotoPrintPage() {
  const navigate = useNavigate();

  // Steps: 'UPLOAD' | 'CROP' | 'PREVIEW'
  const [step, setStep] = useState<'UPLOAD' | 'CROP' | 'PREVIEW'>('UPLOAD');

  const [rawImageSrc, setRawImageSrc] = useState<string | null>(null);
  const [imageFileName, setImageFileName] = useState<string>('photo.jpg');

  // Crop / Transform states
  const [zoom, setZoom] = useState<number>(1);
  const [rotation, setRotation] = useState<number>(0);
  const [pan, setPan] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState<boolean>(false);
  const [dragStart, setDragStart] = useState<{ x: number; y: number }>({ x: 0, y: 0 });

  // Print Configuration
  const [paperType, setPaperType] = useState<'PHOTO_4X6' | 'PHOTO_A4'>('PHOTO_4X6');
  const [orientation, setOrientation] = useState<'PORTRAIT' | 'LANDSCAPE'>('LANDSCAPE');
  const [colorMode, setColorMode] = useState<'COLOR' | 'BW'>('COLOR');
  const [copies, setCopies] = useState<number>(1);

  // Resulting Blobs & URLs
  const [croppedDataUrl, setCroppedDataUrl] = useState<string | null>(null);
  const [croppedBlob, setCroppedBlob] = useState<Blob | null>(null);

  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  // Pricing
  const [rate4x6, setRate4x6] = useState<number>(20.0);
  const [rateA4, setRateA4] = useState<number>(40.0);

  const cropCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const imageObjRef = useRef<HTMLImageElement | null>(null);

  useEffect(() => {
    fetchPricing().then((pricing) => {
      if (pricing) {
        if (pricing.photo4x6Rate) setRate4x6(pricing.photo4x6Rate);
        if (pricing.photoA4Rate) setRateA4(pricing.photoA4Rate);
      }
    }).catch(() => {});
  }, []);

  // Compute aspect ratio based on selected paper size and orientation
  const is4x6 = paperType === 'PHOTO_4X6';
  const aspectRatio = is4x6
    ? (orientation === 'LANDSCAPE' ? 6 / 4 : 4 / 6) // 1.5 or 0.667
    : (orientation === 'LANDSCAPE' ? 297 / 210 : 210 / 297); // 1.414 or 0.707

  // Dimensions for crop viewport box (max 320 px wide, proportional height)
  let boxW = 300;
  let boxH = Math.round(boxW / aspectRatio);
  if (boxH > 380) {
    boxH = 380;
    boxW = Math.round(boxH * aspectRatio);
  }

  // 1. File Selection Handler
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      if (!/image\/(jpeg|png|jpg)/.test(file.type)) {
        setError('Please select a valid image file (JPG, JPEG, or PNG).');
        return;
      }
      setImageFileName(file.name);
      setError(null);

      const reader = new FileReader();
      reader.onload = (ev) => {
        const result = ev.target?.result as string;
        setRawImageSrc(result);
        const img = new Image();
        img.src = result;
        img.onload = () => {
          imageObjRef.current = img;
          setZoom(1);
          setRotation(0);
          setPan({ x: 0, y: 0 });
          // Auto-detect orientation based on uploaded image dimensions
          if (img.width >= img.height) {
            setOrientation('LANDSCAPE');
          } else {
            setOrientation('PORTRAIT');
          }
          setStep('CROP');
        };
      };
      reader.readAsDataURL(file);
    }
  };

  // 2. Mouse / Touch Drag Handlers
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

  // 3. Render Live Crop Canvas
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
  }, [step, zoom, rotation, pan, aspectRatio, orientation, paperType, boxW, boxH]);

  // 4. Save Cropped Photo & Transition to Preview
  const handleSaveCrop = () => {
    if (!cropCanvasRef.current || !imageObjRef.current) return;

    const cropCanvas = cropCanvasRef.current;
    // High-resolution canvas for studio quality print (1800 x 1200 px at 300 DPI for 4x6)
    const targetWidth = is4x6
      ? (orientation === 'LANDSCAPE' ? 1800 : 1200)
      : (orientation === 'LANDSCAPE' ? 2480 : 1754);
    const targetHeight = Math.round(targetWidth / aspectRatio);

    const offscreen = document.createElement('canvas');
    offscreen.width = targetWidth;
    offscreen.height = targetHeight;
    const offCtx = offscreen.getContext('2d');
    if (!offCtx) return;

    offCtx.drawImage(cropCanvas, 0, 0, targetWidth, targetHeight);

    const dataUrl = offscreen.toDataURL('image/jpeg', 0.95);
    setCroppedDataUrl(dataUrl);

    offscreen.toBlob((blob) => {
      if (blob) setCroppedBlob(blob);
    }, 'image/jpeg', 0.95);

    setStep('PREVIEW');
  };

  // 5. Submit Photo Order to Backend
  const handleSubmitOrder = async () => {
    if (!croppedBlob) {
      setError('Please crop your photo first.');
      return;
    }

    setIsSubmitting(true);
    setError(null);

    try {
      const formData = new FormData();
      const filename = `Photo_${paperType}_${Date.now()}_${imageFileName.replace(/[^a-zA-Z0-9_-]/g, '_')}.jpg`;
      formData.append('photos', croppedBlob, filename);
      formData.append('paperType', paperType);
      formData.append('colorMode', colorMode);
      formData.append('copies', copies.toString());
      formData.append('photosPerSheet', '1');
      formData.append('photoType', 'STANDARD');

      await submitPhotoOrder(formData);
      navigate('/my-orders');
    } catch (err: any) {
      console.error('Photo order submission failed:', err);
      setError(err.message || 'Failed to submit photo order. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const ratePerPhoto = is4x6 ? rate4x6 : rateA4;
  const calculatedTotalPrice = copies * ratePerPhoto;

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
              Photo Printing Studio
            </Typography>
            <Chip
              label={is4x6 ? 'HP 4×6 Glossy' : 'HP A4 Full Sheet'}
              size="small"
              color="primary"
              sx={{ fontWeight: 700, fontSize: '0.7rem', height: 22 }}
            />
          </Stack>
          <Typography variant="caption" color="text.secondary">
            High-Definition Glossy Photo Printing • HP Smart Tank 589
          </Typography>
        </Box>
      </Stack>

      {/* Quick Passport 8-Up Shortcut Banner */}
      {step === 'UPLOAD' && (
        <Alert
          severity="info"
          icon={<Camera size={20} color="#0284c7" />}
          action={
            <Button
              color="primary"
              size="small"
              variant="contained"
              onClick={() => navigate('/passport-photo')}
              sx={{ fontWeight: 700, whiteSpace: 'nowrap' }}
            >
              Open Passport 8-Up
            </Button>
          }
          sx={{ mb: 2.5, borderRadius: 2, bgcolor: '#f0f9ff', border: '1px solid #bae6fd' }}
        >
          <Typography variant="subtitle2" sx={{ fontWeight: 700, color: '#0369a1' }}>
            Need 8 Passport Size Photos on a 4×6 Sheet?
          </Typography>
          <Typography variant="caption" color="text.secondary">
            Use our specialized 8-up passport cropper with pre-aligned cutting borders for ₹30.
          </Typography>
        </Alert>
      )}

      {error && (
        <Alert severity="error" sx={{ mb: 2, borderRadius: 2 }}>
          {error}
        </Alert>
      )}

      {/* STEP 1: UPLOAD PHOTO */}
      {step === 'UPLOAD' && (
        <Card sx={{ borderRadius: 3, boxShadow: '0 4px 20px rgba(0,0,0,0.06)' }}>
          <CardContent sx={{ p: 4, textAlign: 'center' }}>
            {/* Paper Size Selector */}
            <Box sx={{ mb: 3, p: 2, bgcolor: '#f8fafc', borderRadius: 2, border: '1px solid #e2e8f0', textAlign: 'left' }}>
              <Typography variant="subtitle2" sx={{ fontWeight: 700, color: '#334155', mb: 1 }}>
                Select Photo Paper Size:
              </Typography>
              <RadioGroup
                row
                value={paperType}
                onChange={(e) => setPaperType(e.target.value as 'PHOTO_4X6' | 'PHOTO_A4')}
              >
                <FormControlLabel
                  value="PHOTO_4X6"
                  control={<Radio size="small" />}
                  label={
                    <Box>
                      <Typography variant="body2" sx={{ fontWeight: 700, color: '#0369a1' }}>
                        4 × 6 inch Photo Paper (₹{rate4x6})
                      </Typography>
                      <Typography variant="caption" color="text.secondary">
                        Standard photo album size (100 × 150 mm)
                      </Typography>
                    </Box>
                  }
                  sx={{ mr: 4 }}
                />
                <FormControlLabel
                  value="PHOTO_A4"
                  control={<Radio size="small" />}
                  label={
                    <Box>
                      <Typography variant="body2" sx={{ fontWeight: 700, color: '#059669' }}>
                        A4 Full Sheet Photo Paper (₹{rateA4})
                      </Typography>
                      <Typography variant="caption" color="text.secondary">
                        Large frame portrait/landscape (210 × 297 mm)
                      </Typography>
                    </Box>
                  }
                />
              </RadioGroup>
            </Box>

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
              Upload Your Photo
            </Typography>
            <Typography variant="body2" color="text.secondary" sx={{ maxWidth: 440, mx: 'auto', mb: 3 }}>
              Select any photo from your phone or PC. On the next step, our interactive cropper lets you frame, zoom, and rotate for the cleanest print!
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
                💡 Studio Photo Print Features:
              </Typography>
              <Typography variant="body2" color="text.secondary" component="ul" sx={{ pl: 2, m: 0 }}>
                <li>High quality 600 DPI print output with vibrant CMYK ink tank reproduction.</li>
                <li>Full interactive cropper with zoom, 90° rotation, and aspect ratio guide.</li>
                <li>No cropping of your important photo details; accurate paper preview.</li>
                <li>Fast walk-in pickup at counter.</li>
              </Typography>
            </Box>
          </CardContent>
        </Card>
      )}

      {/* STEP 2: INTERACTIVE CROPPER */}
      {step === 'CROP' && (
        <Card sx={{ borderRadius: 3, boxShadow: '0 4px 20px rgba(0,0,0,0.06)' }}>
          <CardContent sx={{ p: 3 }}>
            <Stack
              direction={{ xs: 'column', sm: 'row' }}
              justifyContent="space-between"
              alignItems={{ xs: 'flex-start', sm: 'center' }}
              spacing={1}
              sx={{ mb: 2 }}
            >
              <Box>
                <Typography variant="subtitle1" sx={{ fontWeight: 800 }}>
                  Crop & Frame Your Photo
                </Typography>
                <Typography variant="caption" color="text.secondary">
                  Paper: {is4x6 ? '4 × 6 inch' : 'A4 Full Sheet'} • Drag with finger/mouse to adjust positioning.
                </Typography>
              </Box>

              <Stack direction="row" spacing={1}>
                <Button
                  size="small"
                  variant="outlined"
                  onClick={() => setOrientation(o => (o === 'LANDSCAPE' ? 'PORTRAIT' : 'LANDSCAPE'))}
                >
                  {orientation === 'LANDSCAPE' ? 'Landscape (Horizontal)' : 'Portrait (Vertical)'}
                </Button>
                <Button
                  size="small"
                  variant="outlined"
                  startIcon={<RotateCw size={14} />}
                  onClick={() => setRotation(r => (r + 90) % 360)}
                >
                  Rotate 90°
                </Button>
              </Stack>
            </Stack>

            {/* Cropping Canvas Viewport */}
            <Box
              sx={{
                position: 'relative',
                width: boxW,
                height: boxH,
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
                width={boxW}
                height={boxH}
                style={{ width: '100%', height: '100%', display: 'block' }}
              />

              {/* Grid Overlay for Composition */}
              <Box
                sx={{
                  position: 'absolute',
                  top: 0,
                  left: 0,
                  right: 0,
                  bottom: 0,
                  pointerEvents: 'none',
                  display: 'grid',
                  gridTemplateColumns: 'repeat(3, 1fr)',
                  gridTemplateRows: 'repeat(3, 1fr)',
                  border: '1px dashed rgba(255,255,255,0.4)'
                }}
              >
                {Array.from({ length: 9 }).map((_, idx) => (
                  <Box key={idx} sx={{ border: '0.5px dashed rgba(255,255,255,0.2)' }} />
                ))}
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
                Zoom: {Math.round(zoom * 100)}% • Touch or drag photo to center perfectly
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
                onClick={handleSaveCrop}
                sx={{
                  bgcolor: '#059669',
                  '&:hover': { bgcolor: '#047857' },
                  fontWeight: 700,
                  px: 3,
                  width: { xs: '100%', sm: 'auto' }
                }}
              >
                Save & Preview Photo on Paper
              </Button>
            </Stack>
          </CardContent>
        </Card>
      )}

      {/* STEP 3: PHOTO PAPER PREVIEW & SUBMISSION */}
      {step === 'PREVIEW' && croppedDataUrl && (
        <Card sx={{ borderRadius: 3, boxShadow: '0 4px 20px rgba(0,0,0,0.06)' }}>
          <CardContent sx={{ p: 3 }}>
            <Box sx={{ mb: 2, textAlign: 'center' }}>
              <Chip
                icon={<CheckCircle2 size={16} />}
                label="Photo Cropped & Formatted"
                color="success"
                sx={{ fontWeight: 700, mb: 1 }}
              />
              <Typography variant="h6" sx={{ fontWeight: 800 }}>
                Interactive HP Photo Paper Preview
              </Typography>
              <Typography variant="body2" color="text.secondary">
                Exact preview of your print on genuine {is4x6 ? '4×6 inch' : 'A4 Full Page'} HP Glossy Photo Paper
              </Typography>
            </Box>

            {/* Realistic HP Photo Paper Sheet Representation */}
            <Box
              sx={{
                maxWidth: orientation === 'LANDSCAPE' ? 560 : 380,
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
                  aspectRatio: `${aspectRatio}`,
                  bgcolor: '#ffffff',
                  borderRadius: 1,
                  boxShadow: '0 12px 28px rgba(0,0,0,0.15)',
                  overflow: 'hidden',
                  border: '1px solid #e2e8f0'
                }}
              >
                <img
                  src={croppedDataUrl}
                  alt="Photo Preview"
                  style={{
                    width: '100%',
                    height: '100%',
                    objectFit: 'contain',
                    display: 'block',
                    filter: colorMode === 'BW' ? 'grayscale(100%)' : 'none'
                  }}
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
                  HP GLOSSY PHOTO PAPER • {is4x6 ? '4×6 INCH' : 'A4'}
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
                    Number of Copies
                  </Typography>
                  <Stack direction="row" spacing={1} alignItems="center">
                    <TextField
                      type="number"
                      size="small"
                      value={copies}
                      onChange={(e) => setCopies(Math.max(1, parseInt(e.target.value || '1', 10)))}
                      inputProps={{ min: 1, max: 50 }}
                      sx={{ width: 100 }}
                    />
                    <Typography variant="body2" color="text.secondary">
                      sheet(s) to print
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
                    Rate: ₹{ratePerPhoto.toFixed(2)} per {is4x6 ? '4×6' : 'A4'} sheet
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
