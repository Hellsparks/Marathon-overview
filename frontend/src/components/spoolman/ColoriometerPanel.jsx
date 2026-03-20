/**
 * ColoriometerPanel — inline toolbar button + dropdown for the TD1 USB colorimeter.
 * Renders as a compact trigger in the toolbar; dropdown opens below on click.
 * The connection (colorimeter.js singleton) persists across dialog open/close.
 */
import { useState, useEffect, useRef } from 'react';
import {
    isSupported, connect, disconnect,
    onLine, onStatus, onReading,
    getStatus, getLastReading, parseReading,
} from '../../services/colorimeter';

const MAX_LOG = 80;
const BAUD_RATES = [9600, 19200, 38400, 57600, 115200, 230400];

export default function ColoriometerPanel() {
    const [open, setOpen]         = useState(false);
    const [status, setStatus]     = useState(getStatus());
    const [baudRate, setBaudRate] = useState(115200);
    const [log, setLog]           = useState([]);
    const [reading, setReading]   = useState(getLastReading());
    const [error, setError]       = useState('');
    const [dropdownPos, setDropdownPos] = useState({ top: 0, right: 0 });
    const wrapperRef = useRef(null);
    const logRef     = useRef(null);

    useEffect(() => {
        const u1 = onStatus(setStatus);
        const u2 = onReading(r => setReading(r));
        const u3 = onLine(line => {
            const ts = new Date().toLocaleTimeString([], { hour12: false });
            const entry = { ts, raw: line, parsed: parseReading(line) };
            setLog(prev => {
                const next = [...prev, entry];
                return next.length > MAX_LOG ? next.slice(-MAX_LOG) : next;
            });
        });
        return () => { u1(); u2(); u3(); };
    }, []);

    // Position dropdown via fixed coords and close on outside click
    useEffect(() => {
        if (!open) return;
        if (wrapperRef.current) {
            const rect = wrapperRef.current.getBoundingClientRect();
            setDropdownPos({
                top: rect.bottom + 6,
                right: window.innerWidth - rect.right,
            });
        }
        function handler(e) {
            if (wrapperRef.current && !wrapperRef.current.contains(e.target)) setOpen(false);
        }
        document.addEventListener('mousedown', handler);
        return () => document.removeEventListener('mousedown', handler);
    }, [open]);

    // Auto-scroll log
    useEffect(() => {
        if (logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight;
    }, [log]);

    async function handleConnect(e) {
        e.stopPropagation();
        setError('');
        try { await connect(baudRate); }
        catch (err) { setError(err.message); }
    }

    if (!isSupported()) {
        const isSecure = typeof window !== 'undefined' && window.isSecureContext;
        const tip = isSecure
            ? 'TD1 colorimeter requires Chrome or Edge (Web Serial API not available in this browser)'
            : 'TD1 colorimeter requires a secure context — access Marathon via HTTPS or use localhost instead of an IP address';
        return (
            <button
                type="button"
                className="btn colorimeter-trigger"
                disabled
                title={tip}
                style={{ display: 'inline-flex', alignItems: 'center', gap: 6, opacity: 0.45, cursor: 'not-allowed' }}
            >
                <span className="colorimeter-dot colorimeter-dot--disconnected" />
                <span>TD1</span>
                <span style={{ fontSize: 11, color: 'var(--danger, #ef4444)' }}>{isSecure ? '✕' : '🔒'}</span>
            </button>
        );
    }

    const isConnected  = status === 'connected';
    const isConnecting = status === 'connecting';

    return (
        <div className="colorimeter-widget" ref={wrapperRef}>
            {/* ── Toolbar trigger ── */}
            <button
                type="button"
                className={`btn colorimeter-trigger${isConnected ? ' colorimeter-trigger--on' : ''}`}
                style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}
                onClick={() => setOpen(o => !o)}
                title="TD1 Colorimeter"
            >
                <span className={`colorimeter-dot colorimeter-dot--${status}`} />
                <span>TD1</span>
                {reading && (
                    <span className="colorimeter-mini-swatch" style={{ background: `#${reading.hex}` }} />
                )}
                <span className="colorimeter-chevron" style={{ fontSize: 9 }}>{open ? '▲' : '▼'}</span>
            </button>

            {/* ── Dropdown panel ── */}
            {open && (
                <div className="colorimeter-dropdown" style={{ top: dropdownPos.top, right: dropdownPos.right }}>
                    {/* Status + connect row */}
                    <div className="colorimeter-controls">
                        <span className={`colorimeter-dot colorimeter-dot--${status}`} style={{ flexShrink: 0 }} />
                        <span style={{ fontSize: 12, color: 'var(--text-muted)', flex: 1 }}>
                            {isConnected ? 'Connected' : isConnecting ? 'Connecting…' : 'Not connected'}
                        </span>

                        {!isConnected && !isConnecting && (
                            <select
                                className="sm-input sm-select colorimeter-baud"
                                value={baudRate}
                                onChange={e => setBaudRate(parseInt(e.target.value))}
                                onClick={e => e.stopPropagation()}
                            >
                                {BAUD_RATES.map(b => <option key={b} value={b}>{b}</option>)}
                            </select>
                        )}

                        {!isConnected ? (
                            <button type="button" className="btn btn-primary" onClick={handleConnect} disabled={isConnecting} style={{ whiteSpace: 'nowrap' }}>
                                Connect
                            </button>
                        ) : (
                            <button type="button" className="btn" onClick={e => { e.stopPropagation(); disconnect(); }} style={{ whiteSpace: 'nowrap' }}>
                                Disconnect
                            </button>
                        )}
                    </div>

                    {error && <div className="colorimeter-error">{error}</div>}

                    {/* Last reading */}
                    {reading && (
                        <div className="colorimeter-reading">
                            <span className="colorimeter-swatch" style={{ background: `#${reading.hex}` }} />
                            <span className="colorimeter-reading-hex">#{reading.hex}</span>
                            {reading.td !== null && (
                                <span className="colorimeter-reading-td">TD: <strong>{reading.td}</strong></span>
                            )}
                        </div>
                    )}

                    {/* Raw log */}
                    <div className="colorimeter-log-header">
                        <span>Serial log</span>
                        <button type="button" className="btn" style={{ padding: '1px 6px', fontSize: '11px' }} onClick={() => setLog([])}>
                            Clear
                        </button>
                    </div>
                    <div className="colorimeter-log" ref={logRef}>
                        {log.length === 0 ? (
                            <span className="colorimeter-log-empty">
                                {isConnected ? 'Waiting for data…' : 'Not connected.'}
                            </span>
                        ) : (
                            log.map((e, i) => (
                                <div key={i} className={`colorimeter-log-line${e.parsed ? ' colorimeter-log-line--parsed' : ''}`}>
                                    <span className="colorimeter-log-ts">{e.ts}</span>
                                    <span className="colorimeter-log-raw">{e.raw}</span>
                                    {e.parsed && (
                                        <span className="colorimeter-log-tag">
                                            #{e.parsed.hex}{e.parsed.td !== null ? ` TD:${e.parsed.td}` : ''}
                                        </span>
                                    )}
                                </div>
                            ))
                        )}
                    </div>
                </div>
            )}
        </div>
    );
}
