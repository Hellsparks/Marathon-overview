export default function NavBar({ onlineCount, totalCount }) {
  return (
    <header className="navbar">
      <div className="navbar-brand">
        <span className="navbar-logo">&#9654;</span>
        Marathon
      </div>
      <div className="navbar-status">
        <span className={`status-dot ${onlineCount > 0 ? 'online' : 'offline'}`} />
        {onlineCount}/{totalCount} printers online
      </div>
    </header>
  );
}
