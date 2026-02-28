import { NavLink } from 'react-router-dom';

const links = [
  { to: '/', label: 'Dashboard', icon: '▦' },
  { to: '/files', label: 'Files', icon: '📁' },
  { to: '/spoolman', label: 'Spoolman', icon: '🧵' },
  { to: '/maintenance', label: 'Maintenance', icon: '🔧' },
  { to: '/settings', label: 'Settings', icon: '⚙' },
];

export default function Sidebar() {
  return (
    <nav className="sidebar v-navigation-drawer v-navigation-drawer--fixed v-navigation-drawer--open">
      <div className="v-navigation-drawer__content" style={{ width: '100%', height: '100%' }}>
        <ul className="navi v-list" style={{ listStyle: 'none', padding: 0, margin: 0 }}>
          {links.map(({ to, label, icon }) => (
            <li key={to} style={{ width: '100%' }}>
              <NavLink
                to={to}
                end={to === '/'}
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
