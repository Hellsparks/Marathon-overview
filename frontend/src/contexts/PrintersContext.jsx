import { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { getPrinters, reorderPrinters } from '../api/printers';
import { useToast } from './ToastContext';

const PrintersContext = createContext(null);

export function PrintersProvider({ children }) {
    const [printers, setPrinters] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const addToast = useToast();

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

    const reorder = useCallback(async (orderedIds) => {
        // Optimistic: reorder locally first
        setPrinters(prev => {
            const map = new Map(prev.map(p => [p.id, p]));
            return orderedIds.map(id => map.get(id)).filter(Boolean);
        });
        try {
            const data = await reorderPrinters(orderedIds);
            setPrinters(data);
            addToast?.('Printer order saved', 'success');
        } catch { /* optimistic state is close enough */ }
    }, [addToast]);

    return (
        <PrintersContext.Provider value={{ printers, loading, error, refresh, reorder }}>
            {children}
        </PrintersContext.Provider>
    );
}

export function usePrintersContext() {
    return useContext(PrintersContext);
}
