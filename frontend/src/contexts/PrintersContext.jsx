import { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { getPrinters } from '../api/printers';

const PrintersContext = createContext(null);

export function PrintersProvider({ children }) {
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

    return (
        <PrintersContext.Provider value={{ printers, loading, error, refresh }}>
            {children}
        </PrintersContext.Provider>
    );
}

export function usePrintersContext() {
    return useContext(PrintersContext);
}
