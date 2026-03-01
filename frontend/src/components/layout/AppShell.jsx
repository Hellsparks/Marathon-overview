import { useState, useEffect } from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import NavBar from './NavBar';
import Sidebar from './Sidebar';
import FleetInsights from './FleetInsights';
import FilesPanel from '../rightpanel/FilesPanel';
import SpoolPanel from '../rightpanel/SpoolPanel';
import FilamentsPanel from '../rightpanel/FilamentsPanel';
import InventoryPanel from '../rightpanel/InventoryPanel';
import MaintenancePanel from '../rightpanel/MaintenancePanel';
import { RightPanelContext } from '../../contexts/RightPanelContext';
import { useStatus } from '../../hooks/useStatus';

export default function AppShell() {
  const { status, error } = useStatus();
  const location = useLocation();
  const [selected, setSelected] = useState(null);

  // Clear selection on route change
  useEffect(() => {
    setSelected(null);
  }, [location.pathname]);

  const onlineCount = Object.values(status).filter(s => s._online).length;
  const totalCount = Object.keys(status).length;

  function getPanel() {
    const p = location.pathname;
    if (p === '/') return <FleetInsights />;
    if (p === '/files') return <FilesPanel selected={selected} />;
    if (p === '/spoolman') return <SpoolPanel selected={selected} />;
    if (p === '/spoolman/filaments') return <FilamentsPanel />;
    if (p === '/spoolman/inventory') return <InventoryPanel />;
    if (p === '/maintenance') return <MaintenancePanel />;
    return null;
  }

  const panel = getPanel();

  return (
    <RightPanelContext.Provider value={{ selected, setSelected }}>
      <div className="app-shell">
        <NavBar onlineCount={onlineCount} totalCount={totalCount} />
        <div className="app-body">
          <Sidebar />
          <main className="app-main v-main">
            {error && (
              <div className="error-banner">
                Backend unreachable: {error}
              </div>
            )}
            <Outlet context={{ status }} />
          </main>
          {panel && (
            <aside className="sidebar-right">
              {panel}
            </aside>
          )}
        </div>
      </div>
    </RightPanelContext.Provider>
  );
}
