import { useState, useEffect } from 'react';
import { getSpools, getBambuWarnings } from '../../api/spoolman';

function toAbsUrl(url) {
    if (!url) return null;
    const clean = url.replace(/^["'\s]+|["'\s]+$/g, '');
    if (!clean) return null;
    return /^https?:\/\//i.test(clean) ? clean : `https://${clean}`;
}

export default function SpoolPanel({ selected, spools = null, bambuWarnings = null }) {
    const [localSpools, setLocalSpools] = useState([]);
    const [localWarnings, setLocalWarnings] = useState([]);

    // Fetch spools and warnings if not provided
    useEffect(() => {
        if (spools === null) {
            getSpools()
                .then(data => setLocalSpools(data.filter(s => !s.archived)))
                .catch(() => setLocalSpools([]));
        }
    }, [spools]);

    useEffect(() => {
        if (bambuWarnings === null) {
            getBambuWarnings()
                .then(data => setLocalWarnings(data))
                .catch(() => setLocalWarnings([]));
        }
    }, [bambuWarnings]);

    const displaySpools = spools !== null ? spools : localSpools;
    const displayWarnings = bambuWarnings !== null ? bambuWarnings : localWarnings;

    // Calculate summary stats
    const totalSpools = displaySpools.length;
    const trackedSpools = displaySpools.filter(s => !displayWarnings.some(w => w.spool_id === s.id)).length;
    const untrackedSpools = displayWarnings.length;

    if (!selected) {
        return (
            <div className="rp-placeholder" style={{ display: 'flex', flexDirection: 'column', justifyContent: 'space-between', height: '100%' }}>
                <div style={{ textAlign: 'center', paddingTop: '20px' }}>
                    <span className="rp-placeholder-icon">🧵</span>
                    <span>Click a spool to see details</span>
                </div>

                {/* Summary Cards at Bottom */}
                <div style={{ padding: '12px', display: 'flex', flexDirection: 'column', gap: '8px', borderTop: '1px solid var(--border)' }}>
                    <div style={{ padding: '10px 12px', background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: '6px', textAlign: 'center' }}>
                        <div style={{ fontSize: '11px', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '4px' }}>Total Spools</div>
                        <div style={{ fontSize: '20px', fontWeight: 700, color: 'var(--text)' }}>{totalSpools}</div>
                    </div>
                    <div style={{ display: 'flex', gap: '8px' }}>
                        <div style={{ flex: 1, padding: '10px 12px', background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: '6px', textAlign: 'center' }}>
                            <div style={{ fontSize: '11px', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '4px' }}>Tracked</div>
                            <div style={{ fontSize: '18px', fontWeight: 700, color: 'var(--success)' }}>{trackedSpools}</div>
                        </div>
                        <div style={{ flex: 1, padding: '10px 12px', background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: '6px', textAlign: 'center' }}>
                            <div style={{ fontSize: '11px', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '4px' }}>Untracked 📦</div>
                            <div style={{ fontSize: '18px', fontWeight: 700, color: 'var(--warning)' }}>{untrackedSpools}</div>
                        </div>
                    </div>
                </div>
            </div>
        );
    }

    const spool = selected.data;
    const f = spool.filament || {};
    const color = `#${f.color_hex || '888888'}`;
    const storeUrl = toAbsUrl(f.extra?.url);
    const pct = spool.initial_weight
        ? Math.min(100, Math.round((spool.remaining_weight / spool.initial_weight) * 100))
        : 100;

    return (
        <div className="rp-content">
            <h3 className="rp-title">Spool Details</h3>

            <div className="rp-spool-header">
                <div className="rp-spool-dot" style={{ backgroundColor: color }} />
                <div>
                    <div className="rp-spool-name">{f.name || `Spool #${spool.id}`}</div>
                    <div className="rp-spool-meta">
                        {[f.vendor?.name, f.material].filter(Boolean).join(' · ')}
                    </div>
                </div>
            </div>

            <div className="rp-stats-grid">
                <div className="rp-stat-row">
                    <span className="rp-stat-label">Spool ID</span>
                    <span className="rp-stat-value rp-stat-mono">#{spool.id}</span>
                </div>
                <div className="rp-stat-row">
                    <span className="rp-stat-label">Remaining</span>
                    <span className="rp-stat-value">{Math.round(spool.remaining_weight ?? 0)} g</span>
                </div>
                <div className="rp-stat-row">
                    <span className="rp-stat-label">Total</span>
                    <span className="rp-stat-value">{Math.round(spool.initial_weight ?? 0)} g</span>
                </div>
                <div className="rp-stat-row">
                    <span className="rp-stat-label">Used</span>
                    <span className="rp-stat-value">{pct}%</span>
                </div>
                {f.diameter && (
                    <div className="rp-stat-row">
                        <span className="rp-stat-label">Diameter</span>
                        <span className="rp-stat-value">{f.diameter} mm</span>
                    </div>
                )}
                {f.color_hex && (
                    <div className="rp-stat-row">
                        <span className="rp-stat-label">Color</span>
                        <span className="rp-stat-value rp-stat-mono">#{f.color_hex.toUpperCase()}</span>
                    </div>
                )}
            </div>

            <div className="rp-weight-bar">
                <div className="rp-weight-fill" style={{ width: `${pct}%`, backgroundColor: color }} />
            </div>

            <div className="rp-section-title">QR Code</div>
            <img
                src={`/api/spoolman/spool/${spool.id}/qr`}
                alt="Spool QR code"
                className="rp-qr"
                onError={e => { e.currentTarget.style.display = 'none'; }}
            />

            {storeUrl && (
                <a
                    href={storeUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="btn btn-primary rp-buy-btn"
                >
                    Buy →
                </a>
            )}
        </div>
    );
}
