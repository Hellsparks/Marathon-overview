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
import { ThemeProvider } from './components/layout/ThemeProvider';

export default function App() {
  return (
    <ThemeProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<AppShell />}>
            <Route index element={<DashboardPage />} />
            <Route path="files" element={<FilesPage />} />
            <Route path="files/templates" element={<div className="page" style={{ padding: '24px' }}><h2>Templates Stub</h2></div>} />
            <Route path="files/start" element={<div className="page" style={{ padding: '24px' }}><h2>Start Template Stub</h2></div>} />
            <Route path="files/projects" element={<div className="page" style={{ padding: '24px' }}><h2>Projects Stub</h2></div>} />
            <Route path="files/archive" element={<div className="page" style={{ padding: '24px' }}><h2>Archive Stub</h2></div>} />
            <Route path="queue/:printerId" element={<QueuePage />} />
            <Route path="spoolman" element={<SpoolmanPage />} />
            <Route path="spoolman/filaments" element={<FilamentsPage />} />
            <Route path="spoolman/manufacturers" element={<ManufacturersPage />} />
            <Route path="spoolman/inventory" element={<InventoryPage />} />
            <Route path="printer/:printerId" element={<PrinterIframePage />} />
            <Route path="maintenance" element={<MaintenancePage />} />
            <Route path="settings" element={<SettingsPage />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Route>
        </Routes>
      </BrowserRouter>
    </ThemeProvider>
  );
}
