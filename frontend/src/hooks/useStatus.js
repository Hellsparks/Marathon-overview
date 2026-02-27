import { useState, useEffect } from 'react';
import { getAllStatus } from '../api/status';

export function useStatus(intervalMs = 3000) {
  const [status, setStatus] = useState({});
  const [error, setError] = useState(null);

  useEffect(() => {
    let cancelled = false;

    async function poll() {
      try {
        const data = await getAllStatus();
        if (!cancelled) {
          setStatus(data.printers);
          setError(null);
        }
      } catch (e) {
        if (!cancelled) setError(e.message);
      }
    }

    poll();
    const timer = setInterval(poll, intervalMs);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [intervalMs]);

  return { status, error };
}
