import { useState } from 'react';
import UpdateDialog from './UpdateDialog';

export default function UpdateNotification({ updateInfo, onDismiss }) {
  const [dialogOpen, setDialogOpen] = useState(false);

  if (!updateInfo) return null;

  return (
    <>
      <button
        className="update-badge"
        onClick={() => setDialogOpen(true)}
        title={`Update available: v${updateInfo.latest}`}
      >
        ↑ v{updateInfo.latest}
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
