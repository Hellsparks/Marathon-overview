import { useState, useEffect } from 'react';
import { getFilaments, getSpools } from '../api/spoolman';
import { getSettings } from '../api/settings';
import SwatchGenerator from '../components/extras/SwatchGenerator';

function uuidv4() {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
        const r = Math.random() * 16 | 0;
        return (c === 'x' ? r : (r & 0x3 | 0x8)).toString(16);
    });
}

function countStock(spools, filamentId) {
    return spools.filter(s =>
        s.filament?.id === filamentId &&
        !s.archived &&
        (s.remaining_weight == null || s.remaining_weight > (s.initial_weight ?? 1000) * 0.05)
    ).length;
}

function toHueFforge(filament, owned, tdField) {
    const tdVal = tdField ? filament.extra?.[tdField] : undefined;
    return {
        Brand: filament.vendor?.name || '',
        Color: `#${(filament.color_hex || '000000').toLowerCase()}`,
        Name: filament.name || '',
        Owned: owned,
        Tags: [],
        Transmissivity: tdVal != null ? Number(tdVal) : 1,
        Type: filament.material || 'PLA',
        uuid: `{${uuidv4()}}`,
    };
}

function downloadJson(data, filename) {
    const blob = new Blob([JSON.stringify(data, null, 4)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
}

export default function ExtrasPage() {
    const [filaments, setFilaments] = useState([]);
    const [spools, setSpools] = useState([]);
    const [tdField, setTdField] = useState('');
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);

    useEffect(() => {
        Promise.all([getFilaments(), getSpools(), getSettings().catch(() => ({}))])
            .then(([f, s, settings]) => {
                setFilaments(f || []);
                setSpools(s || []);
                setTdField(settings.hueforge_td_field || '');
            })
            .catch(e => setError(e.message))
            .finally(() => setLoading(false));
    }, []);

    function exportInStock() {
        const items = filaments
            .filter(f => countStock(spools, f.id) > 0)
            .map(f => toHueFforge(f, true, tdField));
        downloadJson({ Filaments: items }, 'hueforge-in-stock.json');
    }

    function exportAll() {
        const items = filaments.map(f => toHueFforge(f, false, tdField));
        downloadJson({ Filaments: items }, 'hueforge-all-filaments.json');
    }

    function exportWithTd() {
        const items = filaments
            .filter(f => tdField && f.extra?.[tdField] != null && f.extra?.[tdField] !== '')
            .map(f => toHueFforge(f, countStock(spools, f.id) > 0, tdField)); // Map Owned status accurately
        downloadJson({ Filaments: items }, 'hueforge-td-filaments.json');
    }

    return (
        <div className="page">
            {/* ── Swatch Generator ─────────────────────────────────── */}
            {!loading && <SwatchGenerator filaments={filaments} />}

            {/* ── HueFforge Export ─────────────────────────────────── */}
            <section style={{
                background: 'var(--surface)',
                border: '1px solid var(--border)',
                borderRadius: '10px',
                padding: '20px 24px',
                marginBottom: '24px',
            }}>
                <h2 style={{ fontSize: '16px', fontWeight: 600, marginBottom: '4px' }}>Export to HueFforge</h2>
                <p style={{ fontSize: '13px', color: 'var(--text-muted)', marginBottom: '16px', marginTop: '4px' }}>
                    Generate a HueFforge-compatible filament library JSON from your Spoolman catalogue.
                </p>

                {error && <div className="error" style={{ marginBottom: '12px' }}>{error}</div>}

                <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', alignItems: 'center' }}>
                    <button
                        className="btn btn-primary"
                        onClick={exportInStock}
                        disabled={loading}
                        style={{ height: '38px' }}
                    >
                        Export In Stock
                    </button>
                    <button
                        className="btn"
                        onClick={exportAll}
                        disabled={loading}
                        style={{ height: '38px' }}
                    >
                        Export All Filaments
                    </button>
                    <button
                        className="btn"
                        onClick={exportWithTd}
                        disabled={loading || !tdField}
                        title={!tdField ? "Configure TD extra field in Settings first" : ""}
                        style={{ height: '38px' }}
                    >
                        Filaments with TD Value
                    </button>
                    {!loading && (
                        <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
                            {filaments.length} filaments · {spools.filter(s => !s.archived).length} active spools
                        </span>
                    )}
                    {loading && <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>Loading…</span>}
                </div>

                <div style={{ marginTop: '14px', fontSize: '12px', color: 'var(--text-muted)', lineHeight: 1.6 }}>
                    <strong>Export In Stock</strong> — only filaments with at least one active spool; sets <code>Owned: true</code>.<br />
                    <strong>Export All Filaments</strong> — entire Spoolman catalogue; sets <code>Owned: false</code>.<br />
                    <strong>Filaments with TD Value</strong> — only filaments that have a defined TD value; <code>Owned</code> status depends on active spools.
                </div>
            </section>
        </div>
    );
}
