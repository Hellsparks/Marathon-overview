import { NavLink, useLocation } from 'react-router-dom';

const tabs = [
  { to: '/', label: 'Dashboard', icon: '▦', end: true },
  { to: '/files', label: 'Files', icon: '📁' },
  { to: '/spoolman', label: 'Spoolman', icon: '🧵' },
  { to: '/history', label: 'History', icon: '🕒' },
  { to: '/settings', label: 'Settings', icon: '⚙' },
];

export default function MobileTabBar() {
  const location = useLocation();

  return (
    <nav className="mobile-tab-bar">
      {tabs.map(({ to, label, icon, end }) => {
        const active = end
          ? location.pathname === to
          : location.pathname.startsWith(to);
        return (
          <NavLink
            key={to}
            to={to}
            end={end}
            className={`mobile-tab ${active ? 'active' : ''}`}
          >
            <span className="mobile-tab-icon">{icon}</span>
            <span className="mobile-tab-label">{label}</span>
          </NavLink>
        );
      })}
    </nav>
  );
}
