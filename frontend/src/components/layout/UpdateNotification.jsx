import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import UpdateDialog from './UpdateDialog';

export default function UpdateNotification({ updateInfo, onDismiss }) {
  const [dialogOpen, setDialogOpen] = useState(false);
  const navigate = useNavigate();

  if (!updateInfo) return null;

  // Dev channel: show commit count badge, click goes to settings
  if (updateInfo.channel === 'dev' && updateInfo.devStatus) {
    return (
      <button
        className="update-badge"
        onClick={() => navigate('/settings')}
        title={`${updateInfo.devStatus.ahead} new commit${updateInfo.devStatus.ahead !== 1 ? 's' : ''} on dev`}
      >
        {updateInfo.devStatus.ahead} new commit{updateInfo.devStatus.ahead !== 1 ? 's' : ''}
      </button>
    );
  }

  // Release channel: existing behavior
  return (
    <>
      <button
        className="update-badge"
        onClick={() => setDialogOpen(true)}
        title={`Update available: v${updateInfo.latest}`}
      >
        v{updateInfo.latest}
      </button>
      {dialogOpen && (
        <UpdateDialog
          updateInfo={updateInfo}
          onDismiss={() => {
            setDialogOpen(false);
            onDismiss();
          }}
        />
      )}
    </>
  );
}
