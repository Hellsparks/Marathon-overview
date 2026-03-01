import { useState, useEffect } from 'react';

export default function InventoryPanel() {
    const [byMaterial, setByMaterial] = useState(null);
    const [totalKg, setTotalKg] = useState(0);

    useEffect(() => {
        fetch('/api/spoolman/spools')
            .then(r => r.json())
            .then(spools => {
                const totals = {};
                for (const s of spools) {
                    if (s.archived) continue;
                    const mat = s.filament?.material || 'Unknown';
                    totals[mat] = (totals[mat] || 0) + (s.remaining_weight ?? 0);
                }
                const entries = Object.entries(totals).sort((a, b) => b[1] - a[1]);
                setByMaterial(entries);
                setTotalKg(Object.values(totals).reduce((s, v) => s + v, 0) / 1000);
            })
            .catch(() => setByMaterial([]));
    }, []);

    return (
        <div className="rp-content">
            <h3 className="rp-title">Stock Overview</h3>

            <div className="rp-big-stat">
                <span className="rp-big-number">{totalKg.toFixed(2)}</span>
                <span className="rp-big-label">kg total filament</span>
            </div>

            {byMaterial === null ? (
                <div className="rp-muted">Loading…</div>
            ) : byMaterial.length === 0 ? (
                <div className="rp-muted">No spools found</div>
            ) : (
                <>
                    <div className="rp-section-title">By Material</div>
                    <div className="rp-mat-list">
                        {byMaterial.map(([mat, grams]) => {
                            const cls = mat.replace(/[^a-zA-Z0-9]/g, '').toUpperCase();
                            return (
                                <div key={mat} className={`rp-mat-row filament-${cls}`}>
                                    <span className="rp-mat-name">{mat}</span>
                                    <span className="rp-mat-value">{(grams / 1000).toFixed(2)} kg</span>
                                </div>
                            );
                        })}
                    </div>
                </>
            )}
        </div>
    );
}
