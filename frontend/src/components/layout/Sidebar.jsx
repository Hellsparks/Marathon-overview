import { NavLink, useLocation } from 'react-router-dom';
import { usePrinters } from '../../hooks/usePrinters';
import { usePrinterStatus } from '../../contexts/PrinterStatusContext';
import SidebarPrinterCard from '../dashboard/SidebarPrinterCard';

const spoolmanSubLinks = [
  { to: '/spoolman', label: 'Spools', end: true },
  { to: '/spoolman/filaments', label: 'Filaments' },
  { to: '/spoolman/manufacturers', label: 'Manufacturers' },
  { to: '/spoolman/inventory', label: 'Inventory' },
];

const bottomLinks = [
  { to: '/maintenance', label: 'Maintenance', icon: '🔧' },
  { to: '/settings', label: 'Settings', icon: '⚙' },
];

export default function Sidebar() {
  const location = useLocation();
  const { printers } = usePrinters();
  const status = usePrinterStatus();

  const onSpoolman = location.pathname.startsWith('/spoolman');
  const onDashboard = location.pathname === '/' || location.pathname.startsWith('/printer/');

  return (
    <nav className="sidebar v-navigation-drawer v-navigation-drawer--fixed v-navigation-drawer--open">
      <div className="v-navigation-drawer__content" style={{ width: '100%' }}>
        <ul className="navi v-list" style={{ listStyle: 'none', padding: 0, margin: 0 }}>

          {/* Dashboard parent link */}
          <li style={{ width: '100%' }}>
            <NavLink
              to="/"
              end
              className={() => `sidebar-link nav-link v-list-item v-list-item--link${onDashboard && location.pathname === '/' ? ' active v-list-item--active router-link-active' : ''}`}
            >
              <span className="sidebar-icon">▦</span>
              Dashboard
            </NavLink>

            {/* Printer sub-tabs — shown when on Dashboard or any /printer/ route */}
            {onDashboard && printers.length > 0 && (
              <ul className="sidebar-subnav" style={{ listStyle: 'none', padding: '8px', margin: 0, display: 'flex', flexDirection: 'column', gap: '4px' }}>
                {printers.map(p => (
                  <li key={p.id} style={{ width: '100%' }}>
                    <NavLink
                      to={`/printer/${p.id}`}
                      style={{ display: 'block', textDecoration: 'none', color: 'inherit' }}
                    >
                      {({ isActive }) => (
                        <SidebarPrinterCard
                          printer={p}
                          status={status[p.id]}
                          active={isActive}
                        />
                      )}
                    </NavLink>
                  </li>
                ))}
              </ul>
            )}
          </li>

          <li style={{ width: '100%' }}>
            <NavLink
              to="/files"
              className={({ isActive }) => `sidebar-link nav-link v-list-item v-list-item--link${isActive ? ' active v-list-item--active router-link-active' : ''}`}
            >
              <span className="sidebar-icon">📁</span>
              Files
            </NavLink>
          </li>

          {/* Spoolman parent link */}
          <li style={{ width: '100%' }}>
            <NavLink
              to="/spoolman"
              className={() => `sidebar-link nav-link v-list-item v-list-item--link${onSpoolman ? ' active v-list-item--active router-link-active' : ''}`}
            >
              <span className="sidebar-icon">🧵</span>
              Spoolman
            </NavLink>

            {/* Sub-links — shown when on any /spoolman route */}
            {onSpoolman && (
              <ul className="sidebar-subnav" style={{ listStyle: 'none', padding: 0, margin: 0 }}>
                {spoolmanSubLinks.map(({ to, label, end }) => (
                  <li key={to}>
                    <NavLink
                      to={to}
                      end={end}
                      className={({ isActive }) => `sidebar-sublink${isActive ? ' active' : ''}`}
                    >
                      {label}
                    </NavLink>
                  </li>
                ))}
              </ul>
            )}
          </li>

          {bottomLinks.map(({ to, label, icon }) => (
            <li key={to} style={{ width: '100%' }}>
              <NavLink
                to={to}
                className={({ isActive }) => `sidebar-link nav-link v-list-item v-list-item--link${isActive ? ' active v-list-item--active router-link-active' : ''}`}
              >
                <span className="sidebar-icon">{icon}</span>
                {label}
              </NavLink>
            </li>
          ))}

        </ul>
      </div>
    </nav>
  );
}
