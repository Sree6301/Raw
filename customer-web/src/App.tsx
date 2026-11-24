import React, { useEffect } from 'react';
import { Routes, Route, useLocation } from 'react-router-dom';
import { HomePage } from './pages/HomePage.js';
import { DocumentPrintPage } from './pages/DocumentPrintPage.js';
import { PhotoPrintPage } from './pages/PhotoPrintPage.js';
import { PassportPhotoPage } from './pages/PassportPhotoPage.js';
import { ScanRequestPage } from './pages/ScanRequestPage.js';
import { OrdersPage } from './pages/OrdersPage.js';
import { HelpPage } from './pages/HelpPage.js';

// Automatically scrolls to the top of the window on every page/section navigation
function ScrollToTop() {
  const { pathname } = useLocation();
  useEffect(() => {
    window.scrollTo({ top: 0, left: 0, behavior: 'instant' });
  }, [pathname]);
  return null;
}

export function App() {
  return (
    <>
      <ScrollToTop />
      <Routes>
        <Route path="/" element={<HomePage />} />
        <Route path="/print-document" element={<DocumentPrintPage />} />
        <Route path="/print-photo" element={<PhotoPrintPage />} />
        <Route path="/passport-photo" element={<PassportPhotoPage />} />
        <Route path="/scan-document" element={<ScanRequestPage />} />
        <Route path="/my-orders" element={<OrdersPage />} />
        <Route path="/help" element={<HelpPage />} />
      </Routes>
    </>
  );
}
