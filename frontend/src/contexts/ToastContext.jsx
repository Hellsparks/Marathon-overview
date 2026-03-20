import { createContext, useContext, useState, useCallback } from 'react';

const ToastContext = createContext(null);

export function useToast() {
    return useContext(ToastContext);
}

export function ToastProvider({ children }) {
    const [toasts, setToasts] = useState([]);

    const addToast = useCallback((message, type = 'info', duration = 3000) => {
        const id = Date.now() + Math.random();
        setToasts(prev => [...prev, { id, message, type }]);
        setTimeout(() => setToasts(prev => prev.filter(t => t.id !== id)), duration);
    }, []);

    return (
        <ToastContext.Provider value={addToast}>
            {children}
            <div style={{
                position: 'fixed', top: '16px', right: '16px',
                display: 'flex', flexDirection: 'column', gap: '8px',
                zIndex: 9999, pointerEvents: 'none',
            }}>
                {toasts.map(t => (
                    <div key={t.id} style={{
                        padding: '10px 16px',
                        borderRadius: '10px',
                        fontSize: '13px',
                        fontWeight: 600,
                        color: '#fff',
                        background: t.type === 'error' ? '#e53935'
                            : t.type === 'success' ? '#2e7d32'
                            : '#1565c0',
                        boxShadow: '0 4px 16px rgba(0,0,0,0.4)',
                        animation: 'toast-in 0.2s ease',
                        maxWidth: '320px',
                    }}>
                        {t.message}
                    </div>
                ))}
            </div>
        </ToastContext.Provider>
    );
}
