import { NavLink, useMatch } from 'react-router-dom';
import { usePrinters } from '../../hooks/usePrinters';
import { usePrinterStatus } from '../../contexts/PrinterStatusContext';
import SidebarPrinterCard from '../dashboard/SidebarPrinterCard';
import { isEmbedded } from '../../utils/embedded';

const activeClass = ' active v-list-item--active router-link-active';
const linkClass = ({ isActive }) =>
  `sidebar-link nav-link v-list-item v-list-item--link${isActive ? activeClass : ''}`;

// Flat link list used when running inside a slicer's embedded WebView.
// Sub-sections are always visible and styled the same as top-level items.
const embeddedLinks = [
  { to: '/', label: 'Dashboard', icon: '▦', end: true },
  { to: '/files', label: 'Files', icon: '📁', end: true },
  { to: '/files/templates', label: 'Templates', icon: null, end: true },
  { to: '/files/projects', label: 'Projects', icon: null, end: true },
  { to: '/files/archive', label: 'Archive', icon: null, end: true },
  { to: '/spoolman', label: 'Spoolman', icon: '🧵', end: true },
  { to: '/spoolman/filaments', label: 'Filaments', icon: null, end: true },
  { to: '/spoolman/manufacturers', label: 'Manufacturers', icon: null, end: true },
  { to: '/spoolman/inventory', label: 'Inventory', icon: null, end: true },
  { to: '/history', label: 'History', icon: '🕒', end: true },
  { to: '/maintenance', label: 'Maintenance', icon: '🔧', end: true },
  { to: '/settings', label: 'Settings', icon: '⚙', end: true },
  { to: '/extras', label: 'Extras', icon: '✦', end: true },
];

export default function Sidebar({ onNavigate }) {
  const { printers } = usePrinters();
  const status = usePrinterStatus();

  // useMatch is the idiomatic React Router v6 way to detect active sections.
  // Each call must be unconditional (Rules of Hooks). end:false = prefix match.
  const matchRoot = useMatch({ path: '/', end: true });
  const matchPrinter = useMatch({ path: '/printer/:id', end: false });
  const matchFiles = useMatch({ path: '/files', end: false });
  const matchSpoolman = useMatch({ path: '/spoolman', end: false });

  const onDashboardExact = !!matchRoot;
  const onDashboard = !!(matchRoot || matchPrinter);
  const onFiles = !!matchFiles;
  const onSpoolman = !!matchSpoolman;

  // ── Embedded / slicer mode ───────────────────────────────────────────────
  // All links always visible as flat regular items (no collapsible sub-groups).
  if (isEmbedded) {
    return (
      <nav className="sidebar v-navigation-drawer v-navigation-drawer--fixed v-navigation-drawer--open">
        <div className="v-navigation-drawer__content" style={{ width: '100%' }}>
          <ul className="navi v-list" style={{ listStyle: 'none', padding: 0, margin: 0 }}>
            {embeddedLinks.map(({ to, label, icon, end }) => (
              <li key={to} style={{ width: '100%' }}>
                <NavLink to={to} end={end} className={linkClass}>
                  <span className="sidebar-icon">{icon ?? ''}</span>
                  {label}
                </NavLink>
              </li>
            ))}
          </ul>
        </div>
      </nav>
    );
  }

  // ── Normal browser mode ──────────────────────────────────────────────────
  const handleClick = () => { if (onNavigate) onNavigate(); };

  return (
    <nav className="sidebar v-navigation-drawer v-navigation-drawer--fixed v-navigation-drawer--open">
      <div className="v-navigation-drawer__content" style={{ width: '100%' }}>
        <ul className="navi v-list" style={{ listStyle: 'none', padding: 0, margin: 0 }}>

          {/* Dashboard parent link */}
          <li style={{ width: '100%' }}>
            <NavLink
              to="/"
              end
              onClick={handleClick}
              className={() => `sidebar-link nav-link v-list-item v-list-item--link${onDashboardExact ? activeClass : ''}`}
            >
              <span className="sidebar-icon">▦</span>
              Dashboard
            </NavLink>

            {/* Printer sub-tabs — shown when on Dashboard or any /printer/ route */}
            {onDashboard && printers.length > 0 && (
              <ul className="sidebar-subnav" style={{ listStyle: 'none', padding: '8px', margin: 0, display: 'flex', flexDirection: 'column', gap: '4px' }}>
                {printers.filter(p => p.firmware_type !== 'bambu').map(p => (
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

          {/* Files parent link */}
          <li style={{ width: '100%' }}>
            <NavLink
              to="/files"
              onClick={handleClick}
              className={() => `sidebar-link nav-link v-list-item v-list-item--link${onFiles ? activeClass : ''}`}
            >
              <span className="sidebar-icon">📁</span>
              Files
            </NavLink>

            {onFiles && (
              <ul className="sidebar-subnav" style={{ listStyle: 'none', padding: 0, margin: 0 }}>
                {[
                  { to: '/files', label: 'Files', end: true },
                  { to: '/files/templates', label: 'Templates' },
                  { to: '/files/projects', label: 'Projects' },
                  { to: '/files/archive', label: 'Archive' },
                ].map(({ to, label, end }) => (
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

          {/* Spoolman parent link */}
          <li style={{ width: '100%' }}>
            <NavLink
              to="/spoolman"
              onClick={handleClick}
              className={() => `sidebar-link nav-link v-list-item v-list-item--link${onSpoolman ? activeClass : ''}`}
            >
              <span className="sidebar-icon">🧵</span>
              Spoolman
            </NavLink>

            {onSpoolman && (
              <ul className="sidebar-subnav" style={{ listStyle: 'none', padding: 0, margin: 0 }}>
                {[
                  { to: '/spoolman', label: 'Spools', end: true },
                  { to: '/spoolman/filaments', label: 'Filaments' },
                  { to: '/spoolman/manufacturers', label: 'Manufacturers' },
                  { to: '/spoolman/inventory', label: 'Inventory' },
                ].map(({ to, label, end }) => (
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

          {[
            { to: '/history', label: 'History', icon: '🕒' },
            { to: '/maintenance', label: 'Maintenance', icon: '🔧' },
            { to: '/settings', label: 'Settings', icon: '⚙' },
            { to: '/extras', label: 'Extras', icon: '✦' },
          ].map(({ to, label, icon }) => (
            <li key={to} style={{ width: '100%' }}>
              <NavLink
                to={to}
                onClick={handleClick}
                className={({ isActive }) => `sidebar-link nav-link v-list-item v-list-item--link${isActive ? activeClass : ''}`}
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
