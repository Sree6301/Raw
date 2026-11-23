import React from 'react';
import { Routes, Route } from 'react-router-dom';
import { HomePage } from './pages/HomePage.js';
import { DocumentPrintPage } from './pages/DocumentPrintPage.js';
import { PhotoPrintPage } from './pages/PhotoPrintPage.js';
import { PassportPhotoPage } from './pages/PassportPhotoPage.js';
import { ScanRequestPage } from './pages/ScanRequestPage.js';
import { OrdersPage } from './pages/OrdersPage.js';
import { HelpPage } from './pages/HelpPage.js';

export function App() {
  return (
    <Routes>
      <Route path="/" element={<HomePage />} />
      <Route path="/print-document" element={<DocumentPrintPage />} />
      <Route path="/print-photo" element={<PhotoPrintPage />} />
      <Route path="/passport-photo" element={<PassportPhotoPage />} />
      <Route path="/scan-document" element={<ScanRequestPage />} />
      <Route path="/my-orders" element={<OrdersPage />} />
      <Route path="/help" element={<HelpPage />} />
    </Routes>
  );
}
