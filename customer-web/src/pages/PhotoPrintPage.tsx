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
  IconButton,
  Grid,
  Chip
} from '@mui/material';
import {
  ArrowLeft,
  Upload,
  Image as ImageIcon,
  CheckCircle2,
  Trash2
} from 'lucide-react';
import { submitPhotoOrder } from '../api.js';

export function PhotoPrintPage() {
  const navigate = useNavigate();
  const [selectedPhotos, setSelectedPhotos] = useState<File[]>([]);
  const [previewUrls, setPreviewUrls] = useState<string[]>([]);
  const [paperType, setPaperType] = useState<'PHOTO_A4' | 'PHOTO_4X6'>('PHOTO_4X6');
  const [colorMode, setColorMode] = useState<'COLOR' | 'BW'>('COLOR');
  const [copies, setCopies] = useState<number>(1);
  const [photosPerSheet, setPhotosPerSheet] = useState<1 | 2 | 4>(1);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleFilesChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      const files = Array.from(e.target.files);
      const validFiles = files.filter(f => /image\/(jpeg|png|jpg)/.test(f.type));
      if (validFiles.length === 0) {
        setError('Please upload JPEG, JPG or PNG image files.');
        return;
      }
      setSelectedPhotos(prev => [...prev, ...validFiles]);
      const urls = validFiles.map(f => URL.createObjectURL(f));
      setPreviewUrls(prev => [...prev, ...urls]);
      setError(null);
    }
  };

  const removePhoto = (index: number) => {
    setSelectedPhotos(prev => prev.filter((_, i) => i !== index));
    setPreviewUrls(prev => prev.filter((_, i) => i !== index));
  };

  const pricePerPhoto = paperType === 'PHOTO_4X6' ? 20.0 : 40.0;
  const estimatedTotal = (selectedPhotos.length * pricePerPhoto * copies).toFixed(2);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (selectedPhotos.length === 0) {
      setError('Please upload at least one photo.');
      return;
    }

    try {
      setIsSubmitting(true);
      setError(null);

      const formData = new FormData();
      selectedPhotos.forEach(p => formData.append('photos', p));
      formData.append('paperType', paperType);
      formData.append('colorMode', colorMode);
      formData.append('copies', copies.toString());
      formData.append('photosPerSheet', photosPerSheet.toString());

      const order = await submitPhotoOrder(formData);
      navigate('/my-orders', { state: { newOrderId: order.id } });
    } catch (err: any) {
      setError(err.message || 'Failed to submit photo order.');
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
          Photo Printing
        </Typography>
      </Stack>

      <form onSubmit={handleSubmit}>
        <Stack spacing={2.5}>
          {/* Upload Card */}
          <Card sx={{ border: '2px dashed #cbd5e1', bgcolor: '#f8fafc', textAlign: 'center', p: 3 }}>
            <input
              type="file"
              multiple
              accept="image/jpeg,image/png,image/jpg"
              id="photo-upload-input"
              style={{ display: 'none' }}
              onChange={handleFilesChange}
            />
            <label htmlFor="photo-upload-input" style={{ cursor: 'pointer', display: 'block' }}>
              <Box sx={{ mb: 1, display: 'inline-flex', p: 1.5, bgcolor: '#d1fae5', borderRadius: '50%' }}>
                <Upload size={32} color="#059669" />
              </Box>
              <Typography variant="subtitle1" sx={{ fontWeight: 700, color: '#0f172a' }}>
                Tap to Select Photos
              </Typography>
              <Typography variant="caption" color="text.secondary">
                Upload JPG, JPEG, PNG • Multiple photos supported
              </Typography>
            </label>
          </Card>

          {/* Photo Previews */}
          {previewUrls.length > 0 && (
            <Box>
              <Typography variant="subtitle2" sx={{ fontWeight: 700, mb: 1, color: '#334155' }}>
                Selected Photos ({previewUrls.length})
              </Typography>
              <Grid container spacing={1}>
                {previewUrls.map((url, i) => (
                  <Grid item xs={4} key={i}>
                    <Box sx={{ position: 'relative', borderRadius: 2, overflow: 'hidden', height: 100, border: '1px solid #e2e8f0' }}>
                      <img src={url} alt={`Preview ${i}`} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                      <IconButton
                        size="small"
                        onClick={() => removePhoto(i)}
                        sx={{ position: 'absolute', top: 2, right: 2, bgcolor: 'rgba(0,0,0,0.6)', color: 'white', '&:hover': { bgcolor: 'rgba(0,0,0,0.8)' } }}
                      >
                        <Trash2 size={14} />
                      </IconButton>
                    </Box>
                  </Grid>
                ))}
              </Grid>
            </Box>
          )}

          {/* Paper & Quality Options */}
          <Card>
            <CardContent>
              <Typography variant="subtitle2" sx={{ fontWeight: 700, mb: 1.5, color: '#334155' }}>
                1. Photo Paper Size
              </Typography>
              <RadioGroup
                value={paperType}
                onChange={(e) => setPaperType(e.target.value as 'PHOTO_A4' | 'PHOTO_4X6')}
              >
                <FormControlLabel
                  value="PHOTO_4X6"
                  control={<Radio />}
                  label={
                    <Box>
                      <Stack direction="row" spacing={1} alignItems="center">
                        <Typography variant="body2" sx={{ fontWeight: 700, color: '#0369a1' }}>
                          HP Photo Paper (4 × 6 inch Glossy)
                        </Typography>
                        <Chip label="Auto-Selected" size="small" color="primary" sx={{ height: 20, fontSize: '0.7rem', fontWeight: 700 }} />
                      </Stack>
                      <Typography variant="caption" color="text.secondary">
                        101.6 × 152.4 mm • HP Glossy Photo Paper • Vivid Color Reproduction
                      </Typography>
                    </Box>
                  }
                />
                <FormControlLabel
                  value="PHOTO_A4"
                  control={<Radio />}
                  label={
                    <Box>
                      <Typography variant="body2" sx={{ fontWeight: 600 }}>HP Photo Paper (A4 Full Sheet)</Typography>
                      <Typography variant="caption" color="text.secondary">210 × 297 mm • High Gloss HP Premium Photo Paper</Typography>
                    </Box>
                  }
                  sx={{ mt: 1.5 }}
                />
              </RadioGroup>

              <Divider sx={{ my: 2 }} />

              <Typography variant="subtitle2" sx={{ fontWeight: 700, mb: 1, color: '#334155' }}>
                2. Color Mode
              </Typography>
              <RadioGroup
                row
                value={colorMode}
                onChange={(e) => setColorMode(e.target.value as 'COLOR' | 'BW')}
              >
                <FormControlLabel value="COLOR" control={<Radio />} label="Vibrant Color" sx={{ flex: 1 }} />
                <FormControlLabel value="BW" control={<Radio />} label="Classic Black & White" sx={{ flex: 1 }} />
              </RadioGroup>

              <Divider sx={{ my: 2 }} />

              <Typography variant="subtitle2" sx={{ fontWeight: 700, mb: 1, color: '#334155' }}>
                Copies per Photo
              </Typography>
              <TextField
                type="number"
                size="small"
                value={copies}
                onChange={(e) => setCopies(Math.max(1, parseInt(e.target.value || '1', 10)))}
                inputProps={{ min: 1, max: 50 }}
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
                    {selectedPhotos.length} photo(s) × {copies} copy • {paperType === 'PHOTO_4X6' ? '4×6' : 'A4'}
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
            disabled={selectedPhotos.length === 0 || isSubmitting}
            sx={{ py: 1.5, fontSize: '1rem', fontWeight: 700, bgcolor: '#059669', '&:hover': { bgcolor: '#047857' } }}
          >
            {isSubmitting ? (
              <Stack direction="row" spacing={1} alignItems="center">
                <CircularProgress size={20} color="inherit" />
                <span>Uploading Photos...</span>
              </Stack>
            ) : (
              'Submit Photo Print Order'
            )}
          </Button>
        </Stack>
      </form>
    </Container>
  );
}
