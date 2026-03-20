import { useState, useEffect } from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import NavBar from './NavBar';
import Sidebar from './Sidebar';
import MobileTabBar from './MobileTabBar';
import FleetInsights from './FleetInsights';
import FilesPanel from '../rightpanel/FilesPanel';
import SpoolPanel from '../rightpanel/SpoolPanel';
import FilamentsPanel from '../rightpanel/FilamentsPanel';
import InventoryPanel from '../rightpanel/InventoryPanel';
import MaintenancePanel from '../rightpanel/MaintenancePanel';
import ProjectStatusPanel from '../rightpanel/ProjectStatusPanel';
import { RightPanelContext } from '../../contexts/RightPanelContext';
import { PrinterStatusContext } from '../../contexts/PrinterStatusContext';
import { ToastProvider } from '../../contexts/ToastContext';
import { PrintersProvider } from '../../contexts/PrintersContext';
import { useStatus } from '../../hooks/useStatus';
import useIsMobile from '../../hooks/useIsMobile';

export default function AppShell() {
  const { status, error } = useStatus();
  const location = useLocation();
  const [selected, setSelected] = useState(null);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const isMobile = useIsMobile();

  // Clear selection on route change; close sidebar on mobile nav
  useEffect(() => {
    setSelected(null);
    if (isMobile) setSidebarOpen(false);
  }, [location.pathname]);

  const onlineCount = Object.values(status).filter(s => s._online).length;
  const totalCount = Object.keys(status).length;

  function getPanel() {
    const p = location.pathname;
    if (p.startsWith('/printer/')) return null;
    if (p === '/') return <FleetInsights />;
    if (p === '/files/projects' && selected?.type === 'project') return <ProjectStatusPanel project={selected.data} />;
    if (p.startsWith('/files')) return <FilesPanel selected={selected} />;
    if (p === '/spoolman/filaments') return <FilamentsPanel />;
    if (p === '/spoolman/inventory') return <InventoryPanel />;
    if (p === '/spoolman') return <SpoolPanel selected={selected} />;
    if (p === '/maintenance') return <MaintenancePanel />;
    if (p === '/history') return null;
    return null;
  }

  const panel = getPanel();

  return (
    <ToastProvider>
      <PrintersProvider>
      <PrinterStatusContext.Provider value={status}>
        <RightPanelContext.Provider value={{ selected, setSelected }}>
          <div className="app-shell">
            <NavBar
              onlineCount={onlineCount}
              totalCount={totalCount}
              isMobile={isMobile}
              onMenuToggle={() => setSidebarOpen(o => !o)}
            />
            <div className="app-body">
              {/* Desktop: always visible sidebar. Mobile: drawer overlay */}
              {isMobile ? (
                <>
                  {sidebarOpen && (
                    <div className="mobile-drawer-backdrop" onClick={() => setSidebarOpen(false)} />
                  )}
                  <div className={`mobile-drawer ${sidebarOpen ? 'open' : ''}`}>
                    <Sidebar onNavigate={() => setSidebarOpen(false)} />
                  </div>
                </>
              ) : (
                <Sidebar />
              )}

              <main className="app-main v-main">
                {error && (
                  <div className="error-banner">
                    Backend unreachable: {error}
                  </div>
                )}
                <Outlet context={{ status }} />
              </main>

              {/* Desktop: right panel. Mobile: hidden (accessed differently) */}
              {!isMobile && panel && (
                <aside className="sidebar-right">
                  {panel}
                </aside>
              )}
            </div>

            {/* Mobile bottom tab bar */}
            {isMobile && <MobileTabBar />}
          </div>
        </RightPanelContext.Provider>
      </PrinterStatusContext.Provider>
      </PrintersProvider>
    </ToastProvider>
  );
}
