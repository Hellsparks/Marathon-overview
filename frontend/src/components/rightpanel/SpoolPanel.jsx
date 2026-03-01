function toAbsUrl(url) {
    if (!url) return null;
    const clean = url.replace(/^["'\s]+|["'\s]+$/g, '');
    if (!clean) return null;
    return /^https?:\/\//i.test(clean) ? clean : `https://${clean}`;
}

export default function SpoolPanel({ selected }) {
    if (!selected) {
        return (
            <div className="rp-placeholder">
                <span className="rp-placeholder-icon">🧵</span>
                <span>Click a spool to see details</span>
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
