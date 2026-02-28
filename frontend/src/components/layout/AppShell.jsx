import { Outlet } from 'react-router-dom';
import NavBar from './NavBar';
import Sidebar from './Sidebar';
import { useStatus } from '../../hooks/useStatus';

export default function AppShell() {
  const { status, error } = useStatus();

  // Count online printers
  const onlineCount = Object.values(status).filter(s => s._online).length;
  const totalCount = Object.keys(status).length;

  return (
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
      </div>
    </div>
  );
}
