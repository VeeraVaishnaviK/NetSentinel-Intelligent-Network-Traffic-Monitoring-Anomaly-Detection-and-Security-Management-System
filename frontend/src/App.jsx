import React from 'react';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import DashboardLayout from './layouts/DashboardLayout';
import DiagnosticsPage from './pages/DiagnosticsPage';
import DiscoveryPage from './pages/DiscoveryPage';
import OverviewPage from './pages/OverviewPage';
import PacketAnalyzerPage from './pages/PacketAnalyzerPage';
import ReportsPage from './pages/ReportsPage';
import SecurityCenterPage from './pages/SecurityCenterPage';
import SettingsPage from './pages/SettingsPage';
import TrafficAnalyticsPage from './pages/TrafficAnalyticsPage';

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route element={<DashboardLayout />}>
          <Route path="/" element={<OverviewPage />} />
          <Route path="/discovery" element={<DiscoveryPage />} />
          <Route path="/packets" element={<PacketAnalyzerPage />} />
          <Route path="/traffic" element={<TrafficAnalyticsPage />} />
          <Route path="/security" element={<SecurityCenterPage />} />
          <Route path="/diagnostics" element={<DiagnosticsPage />} />
          <Route path="/reports" element={<ReportsPage />} />
          <Route path="/settings" element={<SettingsPage />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}

