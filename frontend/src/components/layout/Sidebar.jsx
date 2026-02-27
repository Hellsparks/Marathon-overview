import { NavLink } from 'react-router-dom';

const links = [
  { to: '/',        label: 'Dashboard', icon: '▦' },
  { to: '/files',   label: 'Files',     icon: '📁' },
  { to: '/settings',label: 'Settings',  icon: '⚙' },
];

export default function Sidebar() {
  return (
    <nav className="sidebar">
      {links.map(({ to, label, icon }) => (
        <NavLink
          key={to}
          to={to}
          end={to === '/'}
          className={({ isActive }) => `sidebar-link${isActive ? ' active' : ''}`}
        >
          <span className="sidebar-icon">{icon}</span>
          {label}
        </NavLink>
      ))}
    </nav>
  );
}
