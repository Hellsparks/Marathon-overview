import ThemePicker from './ThemePicker';

export default function NavBar({ onlineCount, totalCount }) {
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
        <ThemePicker />
      </div>
    </header>
  );
}
