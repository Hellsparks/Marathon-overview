import { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { getExchangeRate } from '../../api/spoolman';

export default function CurrencyConvertDialog({ source, target, onConfirm, onCancel }) {
    const [loading, setLoading] = useState(true);
    const [rate, setRate] = useState(null);
    const [error, setError] = useState('');
    const [customRate, setCustomRate] = useState('');

    useEffect(() => {
        getExchangeRate(source, target)
            .then(data => {
                setRate(data.rate);
                setCustomRate(String(data.rate));
            })
            .catch(e => setError(e.message))
            .finally(() => setLoading(false));
    }, [source, target]);

    const effectiveRate = parseFloat(customRate) || rate || 1;

    return createPortal(
        <div className="dialog-overlay" onMouseDown={e => { if (e.target === e.currentTarget) onCancel(); }}>
            <div className="dialog" style={{ maxWidth: '440px', width: '90vw' }}>
                <h2 style={{ fontSize: '17px', marginBottom: '4px' }}>Currency Mismatch</h2>
                <p style={{ fontSize: '13px', color: 'var(--text-muted)', marginBottom: '16px' }}>
                    This backup uses <strong>{source}</strong> but your Spoolman instance uses <strong>{target}</strong>.
                </p>

                {loading && <p style={{ fontSize: '13px' }}>Fetching exchange rate...</p>}
                {error && (
                    <p style={{ fontSize: '12px', color: 'var(--warning, orange)', marginBottom: '10px' }}>
                        Could not fetch live rate: {error}
                    </p>
                )}

                <div style={{ marginBottom: '16px' }}>
                    <label style={{ display: 'block', fontSize: '13px', fontWeight: 500, marginBottom: '6px' }}>
                        Exchange Rate ({source} &rarr; {target})
                    </label>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <span style={{ fontSize: '13px' }}>1 {source} =</span>
                        <input
                            type="number"
                            className="form-input"
                            value={customRate}
                            onChange={e => setCustomRate(e.target.value)}
                            step="0.0001"
                            min="0"
                            style={{ width: '120px', fontSize: '13px', padding: '6px 10px' }}
                        />
                        <span style={{ fontSize: '13px' }}>{target}</span>
                    </div>
                    {rate && (
                        <p style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '4px' }}>
                            Live rate: {rate} (frankfurter.app)
                        </p>
                    )}
                </div>

                <p style={{ fontSize: '12px', color: 'var(--text-muted)', marginBottom: '12px' }}>
                    Example: {source} 10.00 &rarr; {target} {(10 * effectiveRate).toFixed(2)}
                </p>

                <div className="dialog-actions">
                    <button className="btn btn-primary" onClick={() => onConfirm(effectiveRate)}>
                        Convert &amp; Import
                    </button>
                    <button className="btn" onClick={() => onConfirm(null)}>
                        Keep Original Prices
                    </button>
                    <button className="btn" onClick={onCancel}>Cancel</button>
                </div>
            </div>
        </div>,
        document.body
    );
}
