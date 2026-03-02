import ThemePicker from './ThemePicker';
import UpdateNotification from './UpdateNotification';
import { useUpdateCheck } from '../../hooks/useUpdateCheck';

export default function NavBar({ onlineCount, totalCount }) {
  const { updateInfo, dismiss } = useUpdateCheck();

  return (
    <header className="navbar v-app-bar v-toolbar v-sheet">
      <div className="navbar-brand v-toolbar__title">
        <span className="navbar-logo">&#9654;</span>
        Marathon
      </div>
      <div className="navbar-right">
        <div className="navbar-status">
          <span className={`status-dot ${onlineCount > 0 ? 'online' : 'offline'}`} />
          {onlineCount}/{totalCount} printers online
        </div>
        <UpdateNotification updateInfo={updateInfo} onDismiss={dismiss} />
        <ThemePicker />
      </div>
    </header>
  );
}
