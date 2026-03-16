import { useState, useEffect } from 'react';
import { applyUpdate, getApplyStatus } from '../../api/updates';

export default function UpdateDialog({ updateInfo, onDismiss }) {
  const [applying, setApplying] = useState(false);
  const [log, setLog] = useState([]);
  const [done, setDone] = useState(false);

  // Poll apply-status while update is running
  useEffect(() => {
    if (!applying) return;
    const interval = setInterval(async () => {
      try {
        const status = await getApplyStatus();
        setLog(status.log || []);
        if (!status.running && status.log?.length > 0) {
          setDone(true);
          setApplying(false);
          clearInterval(interval);
        }
      } catch { /* ignore */ }
    }, 1000);
    return () => clearInterval(interval);
  }, [applying]);

  async function handleApply() {
    setApplying(true);
    setLog(['Sending update request...']);
    try {
      await applyUpdate();
    } catch (e) {
      setLog([`Failed to start update: ${e.message}`]);
      setApplying(false);
    }
  }

  const { current, latest, compatible, releaseUrl, releaseNotes, publishedAt } = updateInfo;

  return (
    <div className="update-dialog-overlay" onMouseDown={e => { if (e.target === e.currentTarget && !applying) onDismiss(); }}>
      <div className="update-dialog">
        <div className="update-dialog-header">
          <h2 className="update-dialog-title">Update Available</h2>
          {!applying && (
            <button className="update-dialog-close" onClick={onDismiss} aria-label="Close">✕</button>
          )}
        </div>

        <div className="update-dialog-versions">
          <span className="update-version-chip current">v{current}</span>
          <span className="update-arrow">→</span>
          <span className="update-version-chip latest">v{latest}</span>
        </div>

        {!compatible && (
          <div className="update-warning">
            ⚠ This is a major version update and may contain breaking changes.
            Review the release notes before updating.
          </div>
        )}

        {releaseNotes && (
          <div className="update-notes">
            <h3>What's new</h3>
            <pre className="update-notes-body">{releaseNotes}</pre>
          </div>
        )}

        {(applying || log.length > 0) && (
          <div className="update-log">
            {log.map((line, i) => <div key={i}>{line}</div>)}
            {applying && <div className="update-log-cursor">_</div>}
          </div>
        )}

        {done && (
          <p className="update-done-msg">
            Update complete. The server is restarting — refresh this page in a moment.
          </p>
        )}

        <div className="update-dialog-actions">
          {releaseUrl && (
            <a href={releaseUrl} target="_blank" rel="noopener noreferrer" className="btn btn-sm">
              Release Notes ↗
            </a>
          )}
          {!applying && !done && (
            <>
              <button className="btn btn-sm" onClick={onDismiss}>Dismiss</button>
              <button className="btn btn-sm btn-primary" onClick={handleApply}>
                Update Now
              </button>
            </>
          )}
          {done && (
            <button className="btn btn-sm btn-primary" onClick={() => window.location.reload()}>
              Reload Page
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
