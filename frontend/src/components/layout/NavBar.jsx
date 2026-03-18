import { useState } from 'react';
import ThemePicker from './ThemePicker';
import GitHubLinks from './GitHubLinks';
import UpdateNotification from './UpdateNotification';
import BugReportDialog from './BugReportDialog';
import { useUpdateCheck } from '../../hooks/useUpdateCheck';

export default function NavBar({ onlineCount, totalCount, isMobile, onMenuToggle }) {
  const { updateInfo, dismiss } = useUpdateCheck();
  const [showBugReport, setShowBugReport] = useState(false);

  return (
    <header className="navbar v-app-bar v-toolbar v-sheet">
      {isMobile && (
        <button className="mobile-hamburger" onClick={onMenuToggle} aria-label="Menu">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <line x1="3" y1="6" x2="21" y2="6"/>
            <line x1="3" y1="12" x2="21" y2="12"/>
            <line x1="3" y1="18" x2="21" y2="18"/>
          </svg>
        </button>
      )}
      <div className="navbar-brand v-toolbar__title">
        <span className="navbar-logo">&#9654;</span>
        {!isMobile && 'Marathon'}
      </div>
      <div className="navbar-right">
        {isMobile ? (
          <>
            <div className="navbar-status">
              <span className={`status-dot ${onlineCount > 0 ? 'online' : 'offline'}`} />
              {onlineCount}/{totalCount}
            </div>
            <UpdateNotification updateInfo={updateInfo} onDismiss={dismiss} />
          </>
        ) : (
          <>
            <div className="navbar-status">
              <span className={`status-dot ${onlineCount > 0 ? 'online' : 'offline'}`} />
              {onlineCount}/{totalCount} printers online
            </div>
            <UpdateNotification updateInfo={updateInfo} onDismiss={dismiss} />
            <ThemePicker />
            <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
              <button
                onClick={() => setShowBugReport(true)}
                title="Report a bug or request a feature"
                style={{
                  background: 'none',
                  border: 'none',
                  cursor: 'pointer',
                  padding: '4px 6px',
                  borderRadius: '6px',
                  color: 'var(--text-muted)',
                  display: 'flex',
                  alignItems: 'center',
                  transition: 'color 0.15s, background 0.15s',
                }}
                onMouseEnter={e => {
                  e.currentTarget.style.color = 'var(--text)';
                  e.currentTarget.style.background = 'var(--surface2)';
                }}
                onMouseLeave={e => {
                  e.currentTarget.style.color = 'var(--text-muted)';
                  e.currentTarget.style.background = 'none';
                }}
              >
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <rect width="8" height="14" x="8" y="6" rx="4"/>
                  <path d="m19 7-3 2"/>
                  <path d="m5 7 3 2"/>
                  <path d="m19 19-3-2"/>
                  <path d="m5 19 3-2"/>
                  <path d="M20 13h-4"/>
                  <path d="M4 13h4"/>
                  <path d="m10 4 1 2"/>
                  <path d="m14 4-1 2"/>
                </svg>
              </button>
              <GitHubLinks />
            </div>
          </>
        )}
      </div>

      {showBugReport && <BugReportDialog onClose={() => setShowBugReport(false)} />}
    </header>
  );
}
