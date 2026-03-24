import { useState, useEffect } from 'react';
import { checkForUpdate } from '../api/updates';

const NOTIFS_KEY = 'marathon_update_notifs_enabled';

export function getUpdateNotifsEnabled() {
  return localStorage.getItem(NOTIFS_KEY) !== 'false';
}

export function setUpdateNotifsEnabled(val) {
  localStorage.setItem(NOTIFS_KEY, val ? 'true' : 'false');
}

export function useUpdateCheck() {
  const [updateInfo, setUpdateInfo] = useState(null);
  const [dismissed, setDismissed] = useState(false);
  const [notifsEnabled, setNotifsEnabled] = useState(getUpdateNotifsEnabled);

  useEffect(() => {
    if (!notifsEnabled) return;

    const timer = setTimeout(async () => {
      try {
        const info = await checkForUpdate();
        if (info.available) setUpdateInfo(info);
      } catch { /* silent */ }
    }, 10000);

    const interval = setInterval(async () => {
      try {
        const info = await checkForUpdate();
        if (info.available) setUpdateInfo(info);
        else setUpdateInfo(null);
      } catch { /* silent */ }
    }, 5 * 60 * 1000);

    return () => { clearTimeout(timer); clearInterval(interval); };
  }, [notifsEnabled]);

  function toggleNotifs(val) {
    setUpdateNotifsEnabled(val);
    setNotifsEnabled(val);
    if (!val) setUpdateInfo(null);
  }

  return {
    updateInfo: dismissed || !notifsEnabled ? null : updateInfo,
    notifsEnabled,
    toggleNotifs,
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
