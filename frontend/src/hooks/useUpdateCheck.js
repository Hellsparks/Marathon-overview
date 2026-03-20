import { useState, useEffect } from 'react';
import { checkForUpdate } from '../api/updates';

export function useUpdateCheck() {
  const [updateInfo, setUpdateInfo] = useState(null);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    // Delay check so it doesn't compete with page load
    const timer = setTimeout(async () => {
      try {
        const info = await checkForUpdate();
        if (info.available) setUpdateInfo(info);
      } catch {
        // Silent — don't break the app if update check fails
      }
    }, 10000);

    // For dev channel, re-check periodically (every 5 min)
    const interval = setInterval(async () => {
      try {
        const info = await checkForUpdate();
        if (info.available) setUpdateInfo(info);
        else setUpdateInfo(null);
      } catch { /* silent */ }
    }, 5 * 60 * 1000);

    return () => { clearTimeout(timer); clearInterval(interval); };
  }, []);

  return {
    updateInfo: dismissed ? null : updateInfo,
    dismiss: () => setDismissed(true),
    recheck: async () => {
      setDismissed(false);
      try {
        const info = await checkForUpdate();
        setUpdateInfo(info.available ? info : null);
        return info;
      } catch {
        return { available: false };
      }
    },
  };
}
