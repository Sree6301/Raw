import React from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Box,
  Container,
  Typography,
  Card,
  CardContent,
  Stack,
  IconButton,
  Divider,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow
} from '@mui/material';
import {
  ArrowLeft,
  RotateCw,
  QrCode,
  CreditCard,
  FileText
} from 'lucide-react';

export function HelpPage() {
  const navigate = useNavigate();

  return (
    <Container maxWidth="sm" sx={{ py: 3, pb: 8 }}>
      <Stack direction="row" alignItems="center" spacing={1} sx={{ mb: 2 }}>
        <IconButton onClick={() => navigate('/')} size="small">
          <ArrowLeft size={20} />
        </IconButton>
        <Typography variant="h6" sx={{ fontWeight: 700 }}>
          How It Works & Rate Card
        </Typography>
      </Stack>

      <Stack spacing={2.5}>
        {/* Permanent QR Code Info */}
        <Card>
          <CardContent>
            <Stack direction="row" spacing={1.5} alignItems="center" sx={{ mb: 1 }}>
              <QrCode size={24} color="#0284c7" />
              <Typography variant="subtitle1" sx={{ fontWeight: 700 }}>
                Instant Self-Service Access
              </Typography>
            </Stack>
            <Typography variant="body2" color="text.secondary">
              Simply point your mobile camera at the permanent QR code stickers placed on the shop counters. You are instantly connected without downloading any mobile app or creating accounts.
            </Typography>
          </CardContent>
        </Card>

        {/* Manual Duplex Explanation */}
        <Card sx={{ bgcolor: '#eff6ff', border: '1px solid #bfdbfe' }}>
          <CardContent>
            <Stack direction="row" spacing={1.5} alignItems="center" sx={{ mb: 1 }}>
              <RotateCw size={24} color="#1d4ed8" />
              <Typography variant="subtitle1" sx={{ fontWeight: 700, color: '#1e40af' }}>
                How Manual Duplex Printing Works
              </Typography>
            </Stack>
            <Typography variant="body2" color="#1e3a8a" sx={{ mb: 1.5 }}>
              The HP Smart Tank 589 uses our specialized mathematical duplex engine:
            </Typography>
            <Typography variant="body2" color="#1e3a8a" component="div">
              <ol style={{ paddingLeft: 20, margin: 0 }}>
                <li><strong>First Pass:</strong> The printer outputs all odd pages (1, 3, 5, 7...) face up.</li>
                <li><strong>Paper Reversal:</strong> The operator removes the output stack, flips it horizontally without shuffling, and reinserts it into the top feed tray.</li>
                <li><strong>Second Pass:</strong> The printer outputs all even pages in reverse order (e.g. 6, 4, 2).</li>
                <li><strong>Odd-page documents:</strong> A blank final page is automatically appended so sheets never misalign!</li>
              </ol>
            </Typography>
          </CardContent>
        </Card>

        {/* Rate Card Table */}
        <Card>
          <CardContent>
            <Typography variant="subtitle1" sx={{ fontWeight: 700, mb: 1.5 }}>
              Service Rate Card
            </Typography>
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell><strong>Service</strong></TableCell>
                  <TableCell align="right"><strong>Rate</strong></TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                <TableRow>
                  <TableCell>A4 Black & White (Single-sided)</TableCell>
                  <TableCell align="right">₹2.00 / page</TableCell>
                </TableRow>
                <TableRow>
                  <TableCell>A4 Black & White (Double-sided Xerox)</TableCell>
                  <TableCell align="right">₹3.00 / sheet</TableCell>
                </TableRow>
                <TableRow>
                  <TableCell>A4 Color Print (Single-sided)</TableCell>
                  <TableCell align="right">₹10.00 / page</TableCell>
                </TableRow>
                <TableRow>
                  <TableCell>A4 Color Print (Double-sided)</TableCell>
                  <TableCell align="right">₹18.00 / sheet</TableCell>
                </TableRow>
                <TableRow>
                  <TableCell>4 × 6 inch Glossy Photo Print</TableCell>
                  <TableCell align="right">₹20.00 / photo</TableCell>
                </TableRow>
                <TableRow>
                  <TableCell>A4 Glossy Photo Print</TableCell>
                  <TableCell align="right">₹40.00 / sheet</TableCell>
                </TableRow>
                <TableRow>
                  <TableCell>Flatbed Scan to PDF / JPEG</TableCell>
                  <TableCell align="right">₹10.00 / page</TableCell>
                </TableRow>
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        {/* Payment Methods */}
        <Card>
          <CardContent>
            <Stack direction="row" spacing={1.5} alignItems="center" sx={{ mb: 1 }}>
              <CreditCard size={24} color="#059669" />
              <Typography variant="subtitle1" sx={{ fontWeight: 700 }}>
                Payment Options
              </Typography>
            </Stack>
            <Typography variant="body2" color="text.secondary">
              Pay at the counter via Cash or Scan & Pay with any UPI App (GPay, PhonePe, Paytm). The operator will confirm your payment reference upon collecting your printouts.
            </Typography>
          </CardContent>
        </Card>
      </Stack>
    </Container>
  );
}
