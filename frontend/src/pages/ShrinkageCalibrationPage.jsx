import { useState, useCallback, useEffect, useMemo } from 'react';
import { getFilaments, updateFilament } from '../api/spoolman';
import { getSettings } from '../api/settings';
import { buildColorStyle } from '../utils/colorUtils';

const STLS = [
    { w: 80,  pts: 2 },
    { w: 100, pts: 2 },
    { w: 120, pts: 2 },
    { w: 120, pts: 3 },
    { w: 140, pts: 4 },
    { w: 150, pts: 3 },
    { w: 150, pts: 5 },
    { w: 180, pts: 4 },
    { w: 180, pts: 5 },
];
const STL_BASE = 'https://raw.githubusercontent.com/dirtdigger/fleur_de_cali/main/stl';

// ──────────────────────────── Math (ported from Calistar calibration.js) ────────────────────────────

/**
 * Build the 28-element nominal array.
 * Rows 0-4: X outer, 5-9: X inner, 10-14: Y outer, 15-19: Y inner
 * Rows 20-23: D diagonal, 24-27: d diagonal
 * Only the first M rows of each axis section and M-1 rows of each diagonal are active.
 */
function getNominals(N, M, S) {
    const n = new Array(28).fill(NaN);
    for (let i = 0; i < M; i++) {
        const v = Math.max((N - N * i / M) * S, 0);
        n[i] = n[i + 5] = n[i + 10] = n[i + 15] = v;
    }
    for (let i = 0; i < M - 1; i++) {
        const v = Math.max((N - N * i / M) * S, 0);
        n[i + 20] = n[i + 24] = v;
    }
    return n;
}

function computeRowStats(readings) {
    const vals = readings.map(v => parseFloat(v)).filter(v => !isNaN(v) && v > 0);
    if (!vals.length) return { mean: NaN, sigma: 0, n: 0 };
    const mean = vals.reduce((a, b) => a + b, 0) / vals.length;
    const sigma = vals.length > 1
        ? Math.sqrt(vals.reduce((a, b) => a + (b - mean) ** 2, 0) / (vals.length - 1))
        : 0;
    return { mean, sigma, n: vals.length };
}

function computeAllStats(meas) {
    return Array.from({ length: 28 }, (_, i) => computeRowStats(meas[i]));
}

// Returns { err, sigma, n } for axis rows, or null if insufficient data
function calcDimensionality(rows, stats, noms, calErr, useSample) {
    let sum = 0, sumsq = 0, nv = 0;
    const s0 = useSample ? calErr : 0;
    for (const r of rows) {
        const { mean, sigma } = stats[r];
        const nom = noms[r];
        if (isNaN(mean) || isNaN(nom) || nom <= 0) continue;
        sum += (mean - nom) / nom;
        sumsq += (sigma ** 2 + s0 ** 2) / nom ** 2;
        nv++;
    }
    if (!nv) return null;
    return { err: sum / nv, sigma: Math.sqrt(sumsq / nv ** 2), n: nv };
}

// sum(mean where valid) / sum(nominal where valid) — the total length ratio
function totalLength(rows, stats, noms) {
    let sm = 0, sn = 0;
    for (const r of rows) {
        const { mean, n } = stats[r];
        const nom = noms[r];
        if (n > 0 && !isNaN(mean)) sm += mean;
        if (!isNaN(nom) && nom > 0) sn += nom;
    }
    return sn > 0 ? sm / sn : NaN;
}

// Propagated variance for totalLength (used in skew uncertainty)
function sig2(rows, stats, noms, calErr, useSample) {
    const s0 = useSample ? calErr : 0;
    let s = 0, sn = 0;
    for (const r of rows) {
        const nom = noms[r];
        if (isNaN(nom) || nom <= 0) continue;
        s += stats[r].sigma ** 2;
        sn += nom;
    }
    return sn > 0 ? (s + s0 ** 2) / sn ** 2 : 0;
}

function rng(a, b) { return Array.from({ length: b - a + 1 }, (_, i) => a + i); }

// Returns { alpha (degrees), sigma } or null if insufficient data
function calcSkew(M, stats, noms, calErr, useSample) {
    // D diagonal rows: 20..18+M (M-1 rows), d diagonal rows: 24..22+M (M-1 rows)
    const dRows = rng(20, 18 + M);
    const dSmRows = rng(24, 22 + M);
    const xRows = rng(0, M - 1);
    const yRows = rng(10, 9 + M);

    const p = totalLength(dRows, stats, noms);    // D (major diagonal)
    const q = totalLength(dSmRows, stats, noms);  // d (minor diagonal)
    const a = totalLength(xRows, stats, noms) * Math.SQRT2 / 2;
    const b = totalLength(yRows, stats, noms) * Math.SQRT2 / 2;

    if ([p, q, a, b].some(x => isNaN(x) || x === 0)) return null;

    const cos = (p * p - q * q) / (4 * a * b);
    if (cos < -1 || cos > 1) return null;

    const ar = Math.acos(cos);
    const alpha = ar * 180 / Math.PI;
    const sinA = Math.sin(ar);
    if (sinA === 0) return { alpha, sigma: 0 };

    const sp = sig2(dRows, stats, noms, calErr, useSample);
    const sq = sig2(dSmRows, stats, noms, calErr, useSample);
    const sa = sig2(xRows, stats, noms, calErr, useSample) * 0.5;
    const sb = sig2(yRows, stats, noms, calErr, useSample) * 0.5;

    const gp = Math.abs(p / (2 * a * b * sinA));
    const gq = Math.abs(q / (2 * a * b * sinA));
    const ga = Math.abs((p * p - q * q) / (4 * a * a * b * sinA));
    const gb = Math.abs((p * p - q * q) / (4 * a * b * b * sinA));

    const sigma = Math.sqrt(gp ** 2 * sp + gq ** 2 * sq + ga ** 2 * sa + gb ** 2 * sb) * 180 / Math.PI;
    return { alpha, sigma };
}

// ──────────────────────────── Component ────────────────────────────

function initMeas() {
    return Array.from({ length: 28 }, () => ['', '', '']);
}

export default function ShrinkageCalibrationPage() {
    const [filaments, setFilaments] = useState([]);
    const [selectedFilament, setSelectedFilament] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [settings, setSettings] = useState({});

    // Print config
    const [variant, setVariant] = useState(STLS[3]); // 120×3 default
    const [printScale, setPrintScale] = useState('1');
    const [calErr, setCalErr] = useState('0.01');
    const [useSample, setUseSample] = useState(true);

    // Measurements: 28 rows × 3 readings
    const [meas, setMeas] = useState(initMeas);

    // Firmware inputs (optional)
    const [xStepMarlin, setXStepMarlin] = useState('');
    const [yStepMarlin, setYStepMarlin] = useState('');
    const [xRotKlipper, setXRotKlipper] = useState('');
    const [yRotKlipper, setYRotKlipper] = useState('');
    const [oldShrinkage, setOldShrinkage] = useState('');
    const [klipperAC, setKlipperAC] = useState('');
    const [klipperBD, setKlipperBD] = useState('');
    const [klipperAD, setKlipperAD] = useState('');

    const [filamentSearch, setFilamentSearch] = useState('');
    const [materialFilter, setMaterialFilter] = useState([]);
    const [vendorFilter, setVendorFilter] = useState([]);
    const [showFilterPopover, setShowFilterPopover] = useState(false);
    const [filamentPickerOpen, setFilamentPickerOpen] = useState(true);

    const [saving, setSaving] = useState(false);
    const [saveMsg, setSaveMsg] = useState('');

    const M = variant.pts;
    const N = variant.w;
    const S = parseFloat(printScale) || 1;
    const ce = parseFloat(calErr) || 0.01;

    const noms = useMemo(() => getNominals(N, M, S), [N, M, S]);
    const stats = useMemo(() => computeAllStats(meas), [meas]);

    const xDim = useMemo(() => calcDimensionality(rng(0, 9), stats, noms, ce, useSample), [stats, noms, ce, useSample]);
    const yDim = useMemo(() => calcDimensionality(rng(10, 19), stats, noms, ce, useSample), [stats, noms, ce, useSample]);
    const skew = useMemo(() => calcSkew(M, stats, noms, ce, useSample), [M, stats, noms, ce, useSample]);

    // OrcaSlicer shrinkage_xy = 100 * (nominal/measured) = 100/(1+err)
    const shrinkageXY = useMemo(() => {
        if (!xDim && !yDim) return null;
        const ex = xDim?.err ?? 0;
        const ey = yDim?.err ?? 0;
        const n = (xDim ? 1 : 0) + (yDim ? 1 : 0);
        return 100 / (1 + (ex + ey) / n);
    }, [xDim, yDim]);

    // SuperSlicer/PrusaSlicer shrinkage (applies old value)
    const ssSlicerShrinkage = useMemo(() => {
        if (shrinkageXY === null) return null;
        const old = parseFloat(oldShrinkage) || 100;
        return (old * (shrinkageXY / 100)).toFixed(3);
    }, [shrinkageXY, oldShrinkage]);

    // Marlin M92: new_steps = old_steps * (nominal_sum / measured_sum)
    const marlinM92 = useMemo(() => {
        if (!xDim && !yDim) return null;
        const xs = parseFloat(xStepMarlin) || 80;
        const ys = parseFloat(yStepMarlin) || 80;
        let xn = 0, xm = 0, yn = 0, ym = 0;
        for (let i = 0; i < 10; i++) {
            const { mean, n } = stats[i];
            if (!isNaN(noms[i]) && noms[i] > 0) xn += noms[i];
            if (n > 0 && !isNaN(mean)) xm += mean;
        }
        for (let i = 10; i < 20; i++) {
            const { mean, n } = stats[i];
            if (!isNaN(noms[i]) && noms[i] > 0) yn += noms[i];
            if (n > 0 && !isNaN(mean)) ym += mean;
        }
        const rx = xm > 0 ? xn / xm : 1;
        const ry = ym > 0 ? yn / ym : 1;
        return `M92 X${(xs * rx).toFixed(3)} Y${(ys * ry).toFixed(3)}`;
    }, [stats, noms, xStepMarlin, yStepMarlin, xDim, yDim]);

    // Klipper rotation_distance: new = old / (nominal/measured) = old * measured/nominal
    const klipperRot = useMemo(() => {
        if (!xDim && !yDim) return null;
        const xr = parseFloat(xRotKlipper) || 40;
        const yr = parseFloat(yRotKlipper) || 40;
        let xn = 0, xm = 0, yn = 0, ym = 0;
        for (let i = 0; i < 10; i++) {
            const { mean, n } = stats[i];
            if (!isNaN(noms[i]) && noms[i] > 0) xn += noms[i];
            if (n > 0 && !isNaN(mean)) xm += mean;
        }
        for (let i = 10; i < 20; i++) {
            const { mean, n } = stats[i];
            if (!isNaN(noms[i]) && noms[i] > 0) yn += noms[i];
            if (n > 0 && !isNaN(mean)) ym += mean;
        }
        const rx = xm > 0 ? xn / xm : 1;
        const ry = ym > 0 ? yn / ym : 1;
        return { x: (xr / rx).toFixed(3), y: (yr / ry).toFixed(3) };
    }, [stats, noms, xRotKlipper, yRotKlipper, xDim, yDim]);

    // Klipper SET_SKEW (combines old correction with newly measured)
    const klipperSkew = useMemo(() => {
        if (!skew || isNaN(skew.alpha)) return null;
        const alphaRad = skew.alpha * Math.PI / 180;
        const oldAC = parseFloat(klipperAC) || 100;
        const oldBD = parseFloat(klipperBD) || 100;
        const oldAD = parseFloat(klipperAD) || (100 * Math.SQRT2 / 2);
        const oldA = Math.sqrt(0.5 * (oldAC ** 2 + oldBD ** 2 - 2 * oldAD ** 2));
        if (oldA === 0) return null;
        const oldAlpha = Math.acos((oldAC ** 2 - oldBD ** 2) / (4 * oldA * oldAD));
        const oldCorr = Math.PI / 2 - oldAlpha;
        const totalCorr = oldCorr - (alphaRad - Math.PI / 2);
        const newP = Math.sqrt(100 ** 2 - 100 ** 2 * Math.cos(totalCorr + Math.PI / 2));
        const newQ = Math.sqrt(100 ** 2 + 100 ** 2 * Math.cos(totalCorr + Math.PI / 2));
        const newB = Math.SQRT2 / 2 * 100;
        if (isNaN(newP) || isNaN(newQ)) return null;
        return `SET_SKEW XY=${newP.toFixed(5)},${newQ.toFixed(5)},${newB.toFixed(5)}`;
    }, [skew, klipperAC, klipperBD, klipperAD]);

    // Marlin M582 skew factor
    const marlinSkew = useMemo(() => {
        if (!skew || isNaN(skew.alpha)) return null;
        const factor = Math.tan((90 - skew.alpha) * Math.PI / 180);
        return `M582 I${factor.toFixed(5)}`;
    }, [skew]);

    const load = useCallback(async () => {
        try {
            const [f, s] = await Promise.all([getFilaments(), getSettings()]);
            setFilaments(f || []);
            setSettings(s || {});
            setError(null);
        } catch (e) { setError(e.message); }
        finally { setLoading(false); }
    }, []);

    useEffect(() => { load(); }, [load]);

    function handleVariantChange(e) {
        const [w, pts] = e.target.value.split('x').map(Number);
        const v = STLS.find(s => s.w === w && s.pts === pts);
        if (v) { setVariant(v); setMeas(initMeas()); }
    }

    function setCell(row, col, val) {
        setMeas(prev => {
            const next = prev.map(r => [...r]);
            next[row][col] = val;
            return next;
        });
    }

    const orcaField = settings?.orcaslicer_config_field;

    function getCurrentShrinkage(f) {
        if (!orcaField || !f?.extra?.[orcaField]) return null;
        try { return JSON.parse(f.extra[orcaField])?.shrinkage_xy ?? null; }
        catch { return null; }
    }

    async function handleSave() {
        if (!selectedFilament || shrinkageXY === null || !orcaField) return;
        setSaving(true); setSaveMsg('');
        try {
            let cfg = {};
            if (selectedFilament.extra?.[orcaField]) {
                try { cfg = JSON.parse(selectedFilament.extra[orcaField]); } catch { /* */ }
            }
            cfg.shrinkage_xy = parseFloat(shrinkageXY.toFixed(3));
            await updateFilament(selectedFilament.id, { extra: { [orcaField]: JSON.stringify(cfg) } });
            setSaveMsg(`Saved shrinkage_xy = ${shrinkageXY.toFixed(3)}% to "${selectedFilament.name}"`);
            await load();
        } catch (e) { setSaveMsg(`Error: ${e.message}`); }
        finally { setSaving(false); }
    }

    const stlUrl = `${STL_BASE}/calistar_${variant.w}x${variant.pts}.stl`;

    // Measurement sections: label + active row indices
    const sections = [
        { label: 'X Outer', desc: 'Full spans across X axis', rows: rng(0, M - 1) },
        { label: 'X Inner', desc: 'Inner spans along X axis', rows: rng(5, 4 + M) },
        { label: 'Y Outer', desc: 'Full spans across Y axis', rows: rng(10, 9 + M) },
        { label: 'Y Inner', desc: 'Inner spans along Y axis', rows: rng(15, 14 + M) },
        { label: 'D (major)', desc: 'Major diagonal (AC)', rows: rng(20, 18 + M) },
        { label: 'd (minor)', desc: 'Minor diagonal (BD)', rows: rng(24, 22 + M) },
    ];

    const hasResults = xDim || yDim || skew;

    // Filament picker content — shared between open/closed states
    const filamentPickerContent = (() => {
        if (loading) return <div className="loading">Loading…</div>;
        if (error) return <div className="error">{error}</div>;
        if (selectedFilament && !filamentPickerOpen) {
            return (
                <div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
                        <div style={{ width: 20, height: 20, borderRadius: '50%', flexShrink: 0, ...buildColorStyle(selectedFilament) }} />
                        <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ fontSize: 14, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{selectedFilament.name}</div>
                            <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                                {[selectedFilament.vendor?.name, selectedFilament.material].filter(Boolean).join(' · ')}
                            </div>
                            {(() => { const s = getCurrentShrinkage(selectedFilament); return s !== null ? <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2 }}>shrinkage_xy: <strong>{s}%</strong></div> : null; })()}
                        </div>
                    </div>
                    <button className="btn btn-sm" style={{ width: '100%' }} onClick={() => { setFilamentPickerOpen(true); setFilamentSearch(''); }}>
                        Change filament
                    </button>
                </div>
            );
        }
        const uniqueMaterials = [...new Set(filaments.map(f => f.material).filter(Boolean))].sort();
        const uniqueVendors = [...new Set(filaments.map(f => f.vendor?.name).filter(Boolean))].sort();
        const filtered = filaments.filter(f => {
            if (materialFilter.length && !materialFilter.includes(f.material)) return false;
            if (vendorFilter.length && !vendorFilter.includes(f.vendor?.name)) return false;
            const q = filamentSearch.toLowerCase();
            if (!q) return true;
            return (
                (f.name || '').toLowerCase().includes(q) ||
                (f.material || '').toLowerCase().includes(q) ||
                (f.vendor?.name || '').toLowerCase().includes(q)
            );
        });
        return (
            <div style={{ position: 'relative' }}>
                <div className="sm-vendor-row" style={{ marginBottom: 6 }}>
                    <div style={{ position: 'relative', flex: 1 }}>
                        <input
                            className="sm-input"
                            type="text"
                            autoFocus={!!selectedFilament}
                            placeholder="Search…"
                            value={filamentSearch}
                            onChange={e => setFilamentSearch(e.target.value)}
                            style={{ paddingRight: 36, width: '100%' }}
                        />
                        <button type="button" onClick={() => setShowFilterPopover(v => !v)}
                            style={{ position: 'absolute', right: 4, top: '50%', transform: 'translateY(-50%)', padding: '6px 10px', fontSize: 13, border: 'none', background: 'transparent', cursor: 'pointer', color: (materialFilter.length || vendorFilter.length) ? 'var(--primary)' : 'var(--text-muted)' }}
                            title="Filter filaments">⚙</button>
                    </div>
                    {selectedFilament && (
                        <button className="btn btn-sm" onClick={() => setFilamentPickerOpen(false)}>Cancel</button>
                    )}
                </div>
                {showFilterPopover && (
                    <>
                        <div style={{ position: 'fixed', inset: 0, zIndex: 999 }} onClick={() => setShowFilterPopover(false)} />
                        <div style={{ position: 'absolute', top: '100%', right: 0, marginTop: 4, background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 8, padding: 12, zIndex: 1000, minWidth: 220, boxShadow: '0 4px 12px rgba(0,0,0,0.3)' }} onClick={e => e.stopPropagation()}>
                            <div style={{ marginBottom: 12 }}>
                                <label style={{ display: 'block', fontSize: 12, fontWeight: 600, marginBottom: 6, color: 'var(--text-muted)' }}>Material</label>
                                <div style={{ maxHeight: 120, overflowY: 'auto', border: '1px solid var(--border)', borderRadius: 4, padding: 6 }}>
                                    {uniqueMaterials.map(m => (
                                        <label key={m} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '3px 0', cursor: 'pointer', fontSize: 13 }}>
                                            <input type="checkbox" checked={materialFilter.includes(m)} onChange={e => setMaterialFilter(e.target.checked ? [...materialFilter, m] : materialFilter.filter(x => x !== m))} /> {m}
                                        </label>
                                    ))}
                                </div>
                            </div>
                            <div style={{ marginBottom: 12 }}>
                                <label style={{ display: 'block', fontSize: 12, fontWeight: 600, marginBottom: 6, color: 'var(--text-muted)' }}>Vendor</label>
                                <div style={{ maxHeight: 120, overflowY: 'auto', border: '1px solid var(--border)', borderRadius: 4, padding: 6 }}>
                                    {uniqueVendors.map(v => (
                                        <label key={v} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '3px 0', cursor: 'pointer', fontSize: 13 }}>
                                            <input type="checkbox" checked={vendorFilter.includes(v)} onChange={e => setVendorFilter(e.target.checked ? [...vendorFilter, v] : vendorFilter.filter(x => x !== v))} /> {v}
                                        </label>
                                    ))}
                                </div>
                            </div>
                            <button type="button" className="btn btn-sm" onClick={() => { setMaterialFilter([]); setVendorFilter([]); setShowFilterPopover(false); }} style={{ width: '100%', fontSize: 12 }}>
                                Clear Filters
                            </button>
                        </div>
                    </>
                )}
                <div className="sm-filament-list" style={{ maxHeight: 480 }}>
                    {filtered.length === 0 && <div className="sm-filament-empty">No filaments found</div>}
                    {filtered.map(f => (
                        <div key={f.id} className={`sm-filament-row${selectedFilament?.id === f.id ? ' selected' : ''}`}
                            onClick={() => { setSelectedFilament(f); setFilamentPickerOpen(false); setSaveMsg(''); }}>
                            <div className="sm-filament-dot" style={buildColorStyle(f)} />
                            <div className="sm-filament-info">
                                <span className="sm-filament-name">{f.name}</span>
                                <span className="sm-filament-meta">
                                    {[f.vendor?.name, f.material].filter(Boolean).join(' · ')}
                                    {(() => { const s = getCurrentShrinkage(f); return s !== null ? ` · ${s}%` : null; })()}
                                </span>
                            </div>
                            {selectedFilament?.id === f.id && <span className="sm-filament-check">✓</span>}
                        </div>
                    ))}
                </div>
                {!orcaField && (
                    <div style={{ marginTop: 8, fontSize: 12, color: 'var(--warning,#f59e0b)', background: 'rgba(245,158,11,0.1)', padding: '6px 10px', borderRadius: 6 }}>
                        OrcaSlicer config field not set in Settings.
                    </div>
                )}
            </div>
        );
    })();

    return (
        <div className="page">
            <div style={{ maxWidth: 1140, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 16 }}>

                {/* Header */}
                <div>
                    <h2 style={{ margin: 0, fontSize: 20, fontWeight: 700 }}>Shrinkage &amp; Skew Calibration</h2>
                    <p style={{ margin: '6px 0 0', fontSize: 13, color: 'var(--text-muted)' }}>
                        Full <a href="https://github.com/dirtdigger/fleur_de_cali" target="_blank" rel="noopener noreferrer" className="sm-link">Calistar</a> workflow — inner+outer measurements cancel flow errors; diagonal measurements compute skew correction.
                    </p>
                </div>

                {/* 3-column grid */}
                <div style={{ display: 'grid', gridTemplateColumns: '260px 1fr 230px', gap: 16, alignItems: 'start' }}>

                    {/* LEFT: Filament */}
                    <CardSection title="Filament">
                        {filamentPickerContent}
                    </CardSection>

                    {/* MIDDLE: Measurements */}
                    <CardSection title="Measurements">
                        <p style={{ margin: '0 0 10px', fontSize: 12, color: 'var(--text-muted)' }}>
                            X outer → X inner → Y outer → Y inner → D (major diagonal) → d (minor diagonal). 1–3 readings per row. <a href="https://github.com/dirtdigger/fleur_de_cali/wiki/Measuring" target="_blank" rel="noopener noreferrer" className="sm-link">diagram ↗</a>
                        </p>
                        <div style={{ overflowX: 'auto' }}>
                            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                                <thead>
                                    <tr style={{ background: 'var(--background)' }}>
                                        <th style={TH}>Section</th>
                                        <th style={TH}>Pt</th>
                                        <th style={{ ...TH, fontWeight: 400, color: 'var(--text-muted)' }}>Nom.</th>
                                        <th style={TH}>Reading 1</th>
                                        <th style={TH}>Reading 2</th>
                                        <th style={TH}>Reading 3</th>
                                        <th style={{ ...TH, fontWeight: 400, color: 'var(--text-muted)' }}>Avg</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {sections.map(({ label, rows }) =>
                                        rows.map((row, ri) => {
                                            const st = stats[row];
                                            const nom = noms[row];
                                            const avg = st.n > 0 ? st.mean : null;
                                            const errPct = avg !== null && nom > 0 ? (avg - nom) / nom * 100 : null;
                                            const isOff = errPct !== null && Math.abs(errPct) > 0.5;
                                            return (
                                                <tr key={row} style={{ borderBottom: '1px solid var(--border)' }}>
                                                    {ri === 0 && (
                                                        <td rowSpan={rows.length} style={{ ...TD, fontWeight: 600, verticalAlign: 'top', paddingTop: 10, width: 90, borderRight: '1px solid var(--border)' }}>
                                                            {label}
                                                        </td>
                                                    )}
                                                    <td style={{ ...TD, color: 'var(--text-muted)', width: 24, textAlign: 'center' }}>{ri + 1}</td>
                                                    <td style={{ ...TD, color: 'var(--text-muted)', width: 52, textAlign: 'right', paddingRight: 8 }}>
                                                        {isNaN(nom) ? '—' : nom.toFixed(0)}
                                                    </td>
                                                    {[0, 1, 2].map(col => (
                                                        <td key={col} style={{ ...TD, padding: '3px 4px' }}>
                                                            <input
                                                                type="number" step="0.01" min="0"
                                                                className="input meas-input"
                                                                style={{ width: 76, fontSize: 13, padding: '4px 6px' }}
                                                                placeholder="—"
                                                                value={meas[row][col]}
                                                                onChange={e => setCell(row, col, e.target.value)}
                                                            />
                                                        </td>
                                                    ))}
                                                    <td style={{ ...TD, color: isOff ? 'var(--warning,#f59e0b)' : 'var(--text-muted)', minWidth: 80, textAlign: 'right', paddingRight: 4 }}>
                                                        {avg !== null ? (
                                                            <>
                                                                <span style={{ fontWeight: 600 }}>{avg.toFixed(3)}</span>
                                                                {errPct !== null && (
                                                                    <span style={{ fontSize: 11, marginLeft: 4, opacity: 0.85 }}>
                                                                        ({errPct > 0 ? '+' : ''}{errPct.toFixed(2)}%)
                                                                    </span>
                                                                )}
                                                            </>
                                                        ) : '—'}
                                                    </td>
                                                </tr>
                                            );
                                        })
                                    )}
                                </tbody>
                            </table>
                        </div>
                    </CardSection>

                    {/* RIGHT: Model + Parameters */}
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                        <CardSection title="Model">
                            <FieldLabel label="Variant">
                                <select className="input" style={{ width: '100%' }} value={`${variant.w}x${variant.pts}`} onChange={handleVariantChange}>
                                    {STLS.map(s => (
                                        <option key={`${s.w}x${s.pts}`} value={`${s.w}x${s.pts}`}>{s.w} mm × {s.pts} pts</option>
                                    ))}
                                </select>
                            </FieldLabel>
                            <a href={stlUrl} download={`calistar_${variant.w}x${variant.pts}.stl`}
                                className="btn btn-primary"
                                style={{ textDecoration: 'none', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, marginTop: 10 }}>
                                ⭳ {variant.w}×{variant.pts}.stl
                            </a>
                            <p style={{ margin: '8px 0 0', fontSize: 11, color: 'var(--text-muted)', lineHeight: 1.5 }}>
                                Print at 100% scale. Cool fully, remove from bed. <a href="https://github.com/dirtdigger/fleur_de_cali/wiki/Measuring" target="_blank" rel="noopener noreferrer" className="sm-link">measuring guide ↗</a>
                            </p>
                        </CardSection>
                        <CardSection title="Parameters">
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                                <FieldLabel label="Slicer scaling">
                                    <input type="number" step="0.01" className="input" style={{ width: '100%' }}
                                        value={printScale} onChange={e => setPrintScale(e.target.value)} />
                                </FieldLabel>
                                <FieldLabel label="Caliper error (mm)">
                                    <input type="number" step="0.001" min="0" className="input" style={{ width: '100%' }}
                                        value={calErr} onChange={e => setCalErr(e.target.value)} />
                                </FieldLabel>
                                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                    <input type="checkbox" checked={useSample} id="useSample" onChange={e => setUseSample(e.target.checked)} />
                                    <label htmlFor="useSample" style={{ fontSize: 13, cursor: 'pointer', color: 'var(--text-muted)' }}>Use sample variance</label>
                                </div>
                            </div>
                        </CardSection>
                    </div>

                </div>{/* end 3-col grid */}

                {/* Results: full width */}
                {hasResults && (
                    <CardSection title="Results">
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 12, marginBottom: 20 }}>
                            <DimCard label="X error" dim={xDim} />
                            <DimCard label="Y error" dim={yDim} />
                            <SkewCard skew={skew} />
                        </div>

                        {shrinkageXY !== null && (
                            <div style={{ marginBottom: 20 }}>
                                <SectionHeading>Slicer Correction</SectionHeading>
                                <div style={{ display: 'flex', gap: 24, flexWrap: 'wrap', alignItems: 'flex-start' }}>
                                    <div>
                                        <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 2 }}>OrcaSlicer <code>shrinkage_xy</code></div>
                                        <div style={{ fontSize: 28, fontWeight: 700, color: 'var(--primary)' }}>{shrinkageXY.toFixed(3)}%</div>
                                    </div>
                                    <div>
                                        <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 4 }}>SuperSlicer / PrusaSlicer — enter current value to update:</div>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                            <input type="number" step="0.1" className="input" style={{ width: 80 }}
                                                placeholder="100" value={oldShrinkage} onChange={e => setOldShrinkage(e.target.value)} />
                                            {ssSlicerShrinkage && <span style={{ fontSize: 15, fontWeight: 600 }}>→ {ssSlicerShrinkage}%</span>}
                                        </div>
                                    </div>
                                </div>
                            </div>
                        )}

                        {(xDim || yDim) && (
                            <details style={{ marginBottom: 16 }}>
                                <summary style={summaryStyle}>Firmware Step Correction</summary>
                                <div style={{ paddingTop: 12, display: 'flex', flexDirection: 'column', gap: 20 }}>
                                    <div>
                                        <div style={firmwareLabel}>Marlin — M92 (steps/mm)</div>
                                        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 8 }}>
                                            <FieldLabel label="Current X steps/mm">
                                                <input type="number" step="0.001" className="input" style={{ width: 90 }} placeholder="80" value={xStepMarlin} onChange={e => setXStepMarlin(e.target.value)} />
                                            </FieldLabel>
                                            <FieldLabel label="Current Y steps/mm">
                                                <input type="number" step="0.001" className="input" style={{ width: 90 }} placeholder="80" value={yStepMarlin} onChange={e => setYStepMarlin(e.target.value)} />
                                            </FieldLabel>
                                        </div>
                                        {marlinM92 && <CodeBlock>{marlinM92}</CodeBlock>}
                                    </div>
                                    <div>
                                        <div style={firmwareLabel}>Klipper — rotation_distance</div>
                                        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 8 }}>
                                            <FieldLabel label="Current X rotation_distance">
                                                <input type="number" step="0.001" className="input" style={{ width: 90 }} placeholder="40" value={xRotKlipper} onChange={e => setXRotKlipper(e.target.value)} />
                                            </FieldLabel>
                                            <FieldLabel label="Current Y rotation_distance">
                                                <input type="number" step="0.001" className="input" style={{ width: 90 }} placeholder="40" value={yRotKlipper} onChange={e => setYRotKlipper(e.target.value)} />
                                            </FieldLabel>
                                        </div>
                                        {klipperRot && <CodeBlock>{`[stepper_x]\nrotation_distance: ${klipperRot.x}\n\n[stepper_y]\nrotation_distance: ${klipperRot.y}`}</CodeBlock>}
                                    </div>
                                </div>
                            </details>
                        )}

                        {skew && (
                            <details style={{ marginBottom: 16 }}>
                                <summary style={summaryStyle}>Skew Correction</summary>
                                <div style={{ paddingTop: 12, display: 'flex', flexDirection: 'column', gap: 20 }}>
                                    <div>
                                        <div style={firmwareLabel}>Klipper — SET_SKEW</div>
                                        <p style={{ margin: '0 0 8px', fontSize: 12, color: 'var(--text-muted)' }}>
                                            Optional: enter current AC, BD, AD from <code>printer.cfg</code> to preserve prior correction.
                                        </p>
                                        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 8 }}>
                                            <FieldLabel label="Old AC (mm)">
                                                <input type="number" step="0.001" className="input" style={{ width: 80 }} placeholder="100" value={klipperAC} onChange={e => setKlipperAC(e.target.value)} />
                                            </FieldLabel>
                                            <FieldLabel label="Old BD (mm)">
                                                <input type="number" step="0.001" className="input" style={{ width: 80 }} placeholder="100" value={klipperBD} onChange={e => setKlipperBD(e.target.value)} />
                                            </FieldLabel>
                                            <FieldLabel label="Old AD (mm)">
                                                <input type="number" step="0.001" className="input" style={{ width: 80 }} placeholder="70.711" value={klipperAD} onChange={e => setKlipperAD(e.target.value)} />
                                            </FieldLabel>
                                        </div>
                                        {klipperSkew && <CodeBlock>{klipperSkew}</CodeBlock>}
                                    </div>
                                    <div>
                                        <div style={firmwareLabel}>Marlin — M582 (skew factor)</div>
                                        {marlinSkew && <CodeBlock>{marlinSkew}</CodeBlock>}
                                    </div>
                                </div>
                            </details>
                        )}

                        <div style={{ borderTop: '1px solid var(--border)', paddingTop: 16 }}>
                            <SectionHeading>Save to Spoolman</SectionHeading>
                            {!orcaField && (
                                <div style={{ fontSize: 12, color: 'var(--warning,#f59e0b)', background: 'rgba(245,158,11,0.1)', padding: '6px 10px', borderRadius: 6, marginBottom: 10 }}>
                                    OrcaSlicer config extra field not configured in Settings.
                                </div>
                            )}
                            <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
                                <button className="btn btn-primary"
                                    disabled={!selectedFilament || shrinkageXY === null || !orcaField || saving}
                                    onClick={handleSave}>
                                    {saving ? 'Saving…' : `Apply shrinkage_xy to "${selectedFilament?.name || '…'}"`}
                                </button>
                                {saveMsg && (
                                    <span style={{ fontSize: 13, color: saveMsg.startsWith('Error') ? 'var(--danger,#ef4444)' : 'var(--success,#22c55e)' }}>
                                        {saveMsg}
                                    </span>
                                )}
                            </div>
                        </div>
                    </CardSection>
                )}

            </div>
        </div>
    );
}

// ──────────────────────────── Sub-components ────────────────────────────

function CardSection({ title, children }) {
    return (
        <section style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 8, padding: 16 }}>
            <h3 style={{ margin: '0 0 12px', fontSize: 14, fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                {title}
            </h3>
            {children}
        </section>
    );
}

function FieldLabel({ label, children }) {
    return (
        <div>
            <label style={{ display: 'block', fontSize: 12, color: 'var(--text-muted)', marginBottom: 4 }}>{label}</label>
            {children}
        </div>
    );
}

function SectionHeading({ children }) {
    return (
        <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 10 }}>
            {children}
        </div>
    );
}

function sigBadge(nsig) {
    const color = nsig < 1 ? '#22c55e' : nsig < 2 ? '#f59e0b' : nsig < 3 ? '#f97316' : '#ef4444';
    return (
        <span style={{ marginLeft: 6, fontSize: 11, background: color + '22', color, borderRadius: 4, padding: '1px 5px' }}>
            {nsig.toFixed(1)}σ
        </span>
    );
}

function DimCard({ label, dim }) {
    const style = {
        background: 'var(--background)', border: '1px solid var(--border)', borderRadius: 8, padding: '12px 14px',
    };
    if (!dim) return (
        <div style={style}>
            <div style={CARD_LABEL}>{label}</div>
            <div style={{ fontSize: 14, color: 'var(--text-muted)' }}>—</div>
        </div>
    );
    const pct = dim.err * 100;
    const unc = dim.sigma * 100;
    const nsig = Math.abs(dim.err / dim.sigma);
    return (
        <div style={style}>
            <div style={CARD_LABEL}>{label}</div>
            <div style={{ fontSize: 21, fontWeight: 700, color: Math.abs(pct) < 0.1 ? '#22c55e' : 'var(--text)' }}>
                {pct > 0 ? '+' : ''}{pct.toFixed(3)}%
                {sigBadge(nsig)}
            </div>
            <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 3 }}>
                ± {unc.toFixed(3)}% · correction: {(-pct).toFixed(3)}%
            </div>
        </div>
    );
}

function SkewCard({ skew }) {
    const style = {
        background: 'var(--background)', border: '1px solid var(--border)', borderRadius: 8, padding: '12px 14px',
    };
    if (!skew || isNaN(skew.alpha)) return (
        <div style={style}>
            <div style={CARD_LABEL}>Skew angle</div>
            <div style={{ fontSize: 13, color: 'var(--text-muted)' }}>Need diagonal measurements</div>
        </div>
    );
    const dev = skew.alpha - 90;
    const nsig = Math.abs(dev / skew.sigma);
    return (
        <div style={style}>
            <div style={CARD_LABEL}>Skew (α − 90°)</div>
            <div style={{ fontSize: 21, fontWeight: 700, color: Math.abs(dev) < 0.05 ? '#22c55e' : 'var(--text)' }}>
                {dev > 0 ? '+' : ''}{dev.toFixed(4)}°
                {sigBadge(nsig)}
            </div>
            <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 3 }}>
                α = {skew.alpha.toFixed(5)}° · ± {skew.sigma.toFixed(4)}°
            </div>
        </div>
    );
}

function CodeBlock({ children }) {
    return (
        <code style={{
            display: 'block', background: 'var(--background)', border: '1px solid var(--border)',
            borderRadius: 6, padding: '8px 12px', fontSize: 12, fontFamily: 'monospace',
            whiteSpace: 'pre', overflowX: 'auto',
        }}>
            {children}
        </code>
    );
}

const TH = { padding: '8px 8px', textAlign: 'left', fontWeight: 600, fontSize: 12, color: 'var(--text)', borderBottom: '1px solid var(--border)' };
const TD = { padding: '5px 8px', verticalAlign: 'middle' };
const CARD_LABEL = { fontSize: 11, color: 'var(--text-muted)', marginBottom: 4, textTransform: 'uppercase', letterSpacing: '0.05em' };
const summaryStyle = { cursor: 'pointer', fontSize: 13, fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', userSelect: 'none' };
const firmwareLabel = { fontSize: 12, fontWeight: 600, marginBottom: 8, color: 'var(--text)' };
