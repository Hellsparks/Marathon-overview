import { useState, useEffect, useCallback } from 'react';
import { getPrinters } from '../api/printers';

export function usePrinters() {
  const [printers, setPrinters] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const refresh = useCallback(async () => {
    try {
      setLoading(true);
      const data = await getPrinters();
      setPrinters(data);
      setError(null);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  return { printers, loading, error, refresh };
}
