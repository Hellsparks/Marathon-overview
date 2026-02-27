import { useState, useEffect, useCallback } from 'react';
import { getQueue } from '../api/queue';

export function useQueue(printerId) {
  const [queue, setQueue] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const refresh = useCallback(async () => {
    if (!printerId) return;
    try {
      setLoading(true);
      const data = await getQueue(printerId);
      setQueue(data);
      setError(null);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, [printerId]);

  useEffect(() => {
    refresh();
    const timer = setInterval(refresh, 5000);
    return () => clearInterval(timer);
  }, [refresh]);

  return { queue, loading, error, refresh };
}
