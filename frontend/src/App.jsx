import { useState, useEffect } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import AppShell from './components/layout/AppShell';
import DashboardPage from './pages/DashboardPage';
import FilesPage from './pages/FilesPage';
import QueuePage from './pages/QueuePage';
import SettingsPage from './pages/SettingsPage';
import SpoolmanPage from './pages/SpoolmanPage';
import FilamentsPage from './pages/FilamentsPage';
import ManufacturersPage from './pages/ManufacturersPage';
import InventoryPage from './pages/InventoryPage';
import MaintenancePage from './pages/MaintenancePage';
import PrinterIframePage from './pages/PrinterIframePage';
import TemplatesPage from './pages/TemplatesPage';
import ProjectsPage from './pages/ProjectsPage';
import ArchivePage from './pages/ArchivePage';
import HistoryPage from './pages/HistoryPage';
import ExtrasPage from './pages/ExtrasPage';
import ShrinkageCalibrationPage from './pages/ShrinkageCalibrationPage';
import SetupWizardPage from './pages/SetupWizardPage';
import { ThemeProvider } from './components/layout/ThemeProvider';

export default function App() {
  const [setupChecked, setSetupChecked] = useState(false);
  const [needsSetup, setNeedsSetup] = useState(false);

  useEffect(() => {
    fetch('/api/setup/status')
      .then(r => r.json())
      .then(data => {
        setNeedsSetup(!data.setup_completed);
        setSetupChecked(true);
      })
      .catch(() => {
        // If the endpoint fails (older backend), skip wizard
        setSetupChecked(true);
      });
  }, []);

  if (!setupChecked) return null; // Avoid flash while checking

  return (
    <ThemeProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/setup" element={<SetupWizardPage />} />
          {needsSetup ? (
            <Route path="*" element={<Navigate to="/setup" replace />} />
          ) : (
            <Route path="/" element={<AppShell />}>
              <Route index element={<DashboardPage />} />
              <Route path="files" element={<FilesPage />} />
              <Route path="files/templates" element={<TemplatesPage />} />
              <Route path="files/projects" element={<ProjectsPage />} />
              <Route path="files/archive" element={<ArchivePage />} />
              <Route path="queue/:printerId" element={<QueuePage />} />
              <Route path="spoolman" element={<SpoolmanPage />} />
              <Route path="spoolman/filaments" element={<FilamentsPage />} />
              <Route path="spoolman/manufacturers" element={<ManufacturersPage />} />
              <Route path="spoolman/inventory" element={<InventoryPage />} />
              <Route path="spoolman/calibration" element={<ShrinkageCalibrationPage />} />
              <Route path="printer/:printerId" element={<PrinterIframePage />} />
              <Route path="maintenance" element={<MaintenancePage />} />
              <Route path="history" element={<HistoryPage />} />
              <Route path="settings" element={<SettingsPage />} />
              <Route path="extras" element={<ExtrasPage />} />
              <Route path="*" element={<Navigate to="/" replace />} />
            </Route>
          )}
        </Routes>
      </BrowserRouter>
    </ThemeProvider>
  );
}
