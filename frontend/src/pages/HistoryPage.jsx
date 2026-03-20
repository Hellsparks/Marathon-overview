import { useState, useEffect } from 'react';

const PRINTER_COLORS = ['#4fc3f7', '#81c784', '#ffb74d', '#e57373', '#9575cd', '#4db6ac', '#f06292', '#a1887f', '#90a4ae'];

function fmtDuration(s) {
    if (!s || s <= 0) return '—';
    const h = Math.floor(s / 3600);
    const m = Math.floor((s % 3600) / 60);
    return h > 0 ? `${h}h ${m}m` : `${m}m`;
}

function fmtFilament(mm) {
    if (!mm || mm <= 0) return '—';
    return `${(mm / 1000).toFixed(1)} m`;
}

function fmtDate(iso) {
    if (!iso) return '—';
    return new Date(iso).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}

function StatusBadge({ status }) {
    const bg = status === 'complete' ? '#2e7d32' : status === 'error' ? '#c62828' : 'var(--surface2)';
    const color = status === 'cancelled' ? 'var(--text-muted)' : '#fff';
    return (
        <span style={{ background: bg, color, padding: '2px 8px', borderRadius: '999px', fontSize: '11px', fontWeight: 600 }}>
            {status}
        </span>
    );
}

// Horizontal bar chart — total print time per printer
function PrinterBarChart({ printerTotals, scopePrinterId }) {
    if (!printerTotals?.length) return <p className="rp-muted">No completed prints yet</p>;
    const max = Math.max(...printerTotals.map(p => p.total_s || 0), 1);
    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            {printerTotals.map((p, i) => {
                const pct = (p.total_s / max) * 100;
                const color = PRINTER_COLORS[i % PRINTER_COLORS.length];
                const dimmed = scopePrinterId !== 'all' && String(p.printer_id) !== scopePrinterId;
                return (
                    <div key={p.printer_id} style={{ opacity: dimmed ? 0.3 : 1, transition: 'opacity .2s' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px', fontSize: '13px' }}>
                            <span style={{ fontWeight: 600 }}>{p.printer_name || `Printer ${p.printer_id}`}</span>
                            <span style={{ color: 'var(--text-muted)' }}>{fmtDuration(p.total_s)} · {p.job_count} jobs</span>
                        </div>
                        <div style={{ height: '8px', background: 'var(--surface2)', borderRadius: '4px', overflow: 'hidden' }}>
                            <div style={{ height: '100%', width: `${pct}%`, background: color, borderRadius: '4px', transition: 'width .4s' }} />
                        </div>
                    </div>
                );
            })}
        </div>
    );
}

// Donut chart — proportion of print time by file (top 8)
function DonutChart({ topFiles }) {
    if (!topFiles?.length) return <p className="rp-muted">No data</p>;
    const total = topFiles.reduce((s, f) => s + (f.total_s || 0), 0);
    if (!total) return <p className="rp-muted">No data</p>;

    const shown = topFiles.slice(0, 7);
    const otherS = topFiles.slice(7).reduce((s, f) => s + (f.total_s || 0), 0);
    const slices = otherS > 0 ? [...shown, { filename: 'Other', total_s: otherS }] : shown;

    const cx = 80, cy = 80, R = 70, r = 44;
    let angle = -Math.PI / 2;
    const paths = slices.map((f, i) => {
        const sweep = (f.total_s / total) * 2 * Math.PI;
        const end = angle + sweep;
        const large = sweep > Math.PI ? 1 : 0;
        const d = [
            `M ${cx + R * Math.cos(angle)} ${cy + R * Math.sin(angle)}`,
            `A ${R} ${R} 0 ${large} 1 ${cx + R * Math.cos(end)} ${cy + R * Math.sin(end)}`,
            `L ${cx + r * Math.cos(end)} ${cy + r * Math.sin(end)}`,
            `A ${r} ${r} 0 ${large} 0 ${cx + r * Math.cos(angle)} ${cy + r * Math.sin(angle)}`,
            'Z',
        ].join(' ');
        const color = (i < slices.length - 1 || !otherS) ? PRINTER_COLORS[i % PRINTER_COLORS.length] : '#666';
        angle = end;
        return { d, color, label: f.filename, pct: Math.round((f.total_s / total) * 100), total_s: f.total_s };
    });

    return (
        <div style={{ display: 'flex', gap: '20px', alignItems: 'center', flexWrap: 'wrap' }}>
            <svg width={160} height={160} style={{ flexShrink: 0 }}>
                {paths.map((p, i) => (
                    <path key={i} d={p.d} fill={p.color} stroke="var(--bg)" strokeWidth={2}>
                        <title>{p.label.replace(/\.gcode$/i, '')} — {fmtDuration(p.total_s)} ({p.pct}%)</title>
                    </path>
                ))}
            </svg>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '5px', minWidth: 0 }}>
                {paths.map((p, i) => (
                    <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '7px', fontSize: '12px' }}>
                        <div style={{ width: 9, height: 9, borderRadius: '50%', background: p.color, flexShrink: 0 }} />
                        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: 'var(--text-muted)', maxWidth: '160px' }} title={p.label}>
                            {p.label.replace(/\.gcode$/i, '')}
                        </span>
                        <span style={{ marginLeft: 'auto', flexShrink: 0, fontWeight: 600 }}>{p.pct}%</span>
                    </div>
                ))}
            </div>
        </div>
    );
}

// Stacked weekly bar chart — last 12 weeks, one stack per printer
function WeeklyChart({ weeklyActivity, printerTotals }) {
    if (!weeklyActivity?.length) return <p className="rp-muted">No activity in the last 12 weeks</p>;

    const weeks = [...new Set(weeklyActivity.map(r => r.week))].sort();
    const printerIds = [...new Set(weeklyActivity.map(r => r.printer_id))];
    const printerColorIdx = {};
    (printerTotals || []).forEach((p, i) => { printerColorIdx[p.printer_id] = i; });

    const lookup = {};
    const printerNames = {};
    for (const r of weeklyActivity) {
        if (!lookup[r.week]) lookup[r.week] = {};
        lookup[r.week][r.printer_id] = (lookup[r.week][r.printer_id] || 0) + (r.total_s || 0);
        printerNames[r.printer_id] = r.printer_name;
    }

    const maxH = Math.max(...weeks.map(w => printerIds.reduce((s, pid) => s + (lookup[w]?.[pid] || 0), 0)), 1);
    const BAR_W = 28, GAP = 6, CHART_H = 100;
    const svgW = weeks.length * (BAR_W + GAP);

    return (
        <div style={{ overflowX: 'auto' }}>
            <svg width={Math.max(svgW, 180)} height={CHART_H + 36} style={{ display: 'block' }}>
                {weeks.map((week, wi) => {
                    const x = wi * (BAR_W + GAP);
                    let yOff = CHART_H;
                    return (
                        <g key={week}>
                            {printerIds.map(pid => {
                                const s = lookup[week]?.[pid] || 0;
                                if (!s) return null;
                                const h = Math.max((s / maxH) * CHART_H, 2);
                                yOff -= h;
                                const ci = printerColorIdx[pid] ?? (printerIds.indexOf(pid) % PRINTER_COLORS.length);
                                return (
                                    <rect key={pid} x={x} y={yOff} width={BAR_W} height={h} fill={PRINTER_COLORS[ci]} rx={2}>
                                        <title>{printerNames[pid]} — {fmtDuration(s)}</title>
                                    </rect>
                                );
                            })}
                            <text x={x + BAR_W / 2} y={CHART_H + 14} textAnchor="middle" fontSize={9} fill="var(--text-muted)">
                                {week.replace(/^\d{4}-W0?/, 'W')}
                            </text>
                        </g>
                    );
                })}
            </svg>
            <div style={{ display: 'flex', gap: '14px', flexWrap: 'wrap', marginTop: '6px' }}>
                {printerIds.map(pid => {
                    const ci = printerColorIdx[pid] ?? (printerIds.indexOf(pid) % PRINTER_COLORS.length);
                    return (
                        <div key={pid} style={{ display: 'flex', alignItems: 'center', gap: '5px', fontSize: '12px', color: 'var(--text-muted)' }}>
                            <div style={{ width: 9, height: 9, borderRadius: 2, background: PRINTER_COLORS[ci] }} />
                            {printerNames[pid] || `Printer ${pid}`}
                        </div>
                    );
                })}
            </div>
        </div>
    );
}

export default function HistoryPage() {
    const [tab, setTab] = useState('charts');
    const [printers, setPrinters] = useState([]);
    const [scopePrinterId, setScopePrinterId] = useState('all');

    const [utilization, setUtilization] = useState(null);
    const [utilLoading, setUtilLoading] = useState(true);

    const [jobs, setJobs] = useState([]);
    const [histTotal, setHistTotal] = useState(0);
    const [histPage, setHistPage] = useState(1);
    const [histStatus, setHistStatus] = useState('all');
    const [histLoading, setHistLoading] = useState(false);

    useEffect(() => {
        fetch('/api/printers').then(r => r.json()).then(setPrinters).catch(() => {});
    }, []);

    useEffect(() => {
        setUtilLoading(true);
        const qs = scopePrinterId !== 'all' ? `?printer_id=${scopePrinterId}` : '';
        fetch(`/api/stats/utilization${qs}`)
            .then(r => r.json())
            .then(data => { setUtilization(data); setUtilLoading(false); })
            .catch(() => setUtilLoading(false));
    }, [scopePrinterId]);

    useEffect(() => {
        setHistLoading(true);
        const params = new URLSearchParams({ page: histPage, limit: 50 });
        if (scopePrinterId !== 'all') params.set('printer_id', scopePrinterId);
        if (histStatus !== 'all') params.set('status', histStatus);
        fetch(`/api/stats/history?${params}`)
            .then(r => r.json())
            .then(data => { setJobs(data.jobs || []); setHistTotal(data.total || 0); setHistLoading(false); })
            .catch(() => setHistLoading(false));
    }, [scopePrinterId, histStatus, histPage]);

    // Reset to page 1 when filters change
    useEffect(() => { setHistPage(1); }, [scopePrinterId, histStatus]);

    const printerColorMap = {};
    (utilization?.printerTotals || []).forEach((p, i) => {
        printerColorMap[p.printer_id] = PRINTER_COLORS[i % PRINTER_COLORS.length];
    });

    const totalPages = Math.ceil(histTotal / 50);

    return (
        <div className="page" style={{ padding: '24px', maxWidth: '1200px' }}>

            {/* Header + scope selector */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '20px', flexWrap: 'wrap', gap: '12px' }}>
                <h2 style={{ margin: 0, fontSize: '20px', fontWeight: 700 }}>History</h2>
                <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                    <button className={`btn btn-sm${scopePrinterId === 'all' ? ' btn-primary' : ''}`} onClick={() => setScopePrinterId('all')}>
                        All Printers
                    </button>
                    {printers.map(p => (
                        <button
                            key={p.id}
                            className={`btn btn-sm${scopePrinterId === String(p.id) ? ' btn-primary' : ''}`}
                            onClick={() => setScopePrinterId(String(p.id))}
                        >{p.name}</button>
                    ))}
                </div>
            </div>

            {/* Tab bar */}
            <div style={{ display: 'flex', marginBottom: '24px', borderBottom: '1px solid var(--border)' }}>
                {[['charts', 'Utilization'], ['log', 'Print Log']].map(([key, label]) => (
                    <button key={key} onClick={() => setTab(key)} style={{
                        background: 'none', border: 'none', cursor: 'pointer',
                        padding: '8px 18px', fontSize: '14px', fontWeight: 600,
                        color: tab === key ? 'var(--accent, #4fc3f7)' : 'var(--text-muted)',
                        borderBottom: `2px solid ${tab === key ? 'var(--accent, #4fc3f7)' : 'transparent'}`,
                        marginBottom: '-1px',
                    }}>{label}</button>
                ))}
            </div>

            {/* ── Utilization tab ── */}
            {tab === 'charts' && (
                utilLoading
                    ? <div className="loading">Loading…</div>
                    : <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>

                        <div className="card" style={{ padding: '20px' }}>
                            <div className="rp-section-title" style={{ marginBottom: '16px' }}>Printer Utilization</div>
                            <PrinterBarChart printerTotals={utilization?.printerTotals} scopePrinterId={scopePrinterId} />
                        </div>

                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '20px' }}>
                            <div className="card" style={{ padding: '20px' }}>
                                <div className="rp-section-title" style={{ marginBottom: '16px' }}>
                                    Print Time by File
                                    {scopePrinterId !== 'all' && (
                                        <span style={{ fontWeight: 400, color: 'var(--text-muted)', fontSize: '12px', marginLeft: '6px' }}>
                                            — {printers.find(p => String(p.id) === scopePrinterId)?.name}
                                        </span>
                                    )}
                                </div>
                                <DonutChart topFiles={utilization?.topFiles} />
                            </div>

                            <div className="card" style={{ padding: '20px' }}>
                                <div className="rp-section-title" style={{ marginBottom: '16px' }}>Weekly Activity (last 12 weeks)</div>
                                <WeeklyChart weeklyActivity={utilization?.weeklyActivity} printerTotals={utilization?.printerTotals} />
                            </div>
                        </div>
                    </div>
            )}

            {/* ── Print Log tab ── */}
            {tab === 'log' && (
                <div>
                    <div style={{ display: 'flex', gap: '8px', marginBottom: '16px', alignItems: 'center', flexWrap: 'wrap' }}>
                        <span style={{ fontSize: '13px', color: 'var(--text-muted)' }}>Status:</span>
                        {['all', 'complete', 'cancelled', 'error'].map(s => (
                            <button key={s} className={`btn btn-sm${histStatus === s ? ' btn-primary' : ''}`} onClick={() => setHistStatus(s)}>
                                {s === 'all' ? 'All' : s.charAt(0).toUpperCase() + s.slice(1)}
                            </button>
                        ))}
                        <span style={{ marginLeft: 'auto', fontSize: '13px', color: 'var(--text-muted)' }}>
                            {histTotal} job{histTotal !== 1 ? 's' : ''}
                        </span>
                    </div>

                    {histLoading ? <div className="loading">Loading…</div> : <>
                        <div className="file-table-wrap">
                            <table className="file-table">
                                <thead>
                                    <tr>
                                        <th>Date</th>
                                        <th>Printer</th>
                                        <th>File</th>
                                        <th>Project</th>
                                        <th>Status</th>
                                        <th>Duration</th>
                                        <th>Filament</th>
                                        <th>Material</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {jobs.length === 0
                                        ? <tr><td colSpan={8} style={{ textAlign: 'center', padding: '32px', color: 'var(--text-muted)' }}>No print jobs found</td></tr>
                                        : jobs.map(job => {
                                            const dotColor = printerColorMap[job.printer_id] || '#888';
                                            return (
                                                <tr key={job.id}>
                                                    <td style={{ whiteSpace: 'nowrap', color: 'var(--text-muted)', fontSize: '12px' }}>{fmtDate(job.end_time)}</td>
                                                    <td>
                                                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                                            <div style={{ width: 8, height: 8, borderRadius: '50%', background: dotColor, flexShrink: 0 }} />
                                                            <span style={{ fontSize: '13px' }}>{job.printer_name || `#${job.printer_id}`}</span>
                                                        </div>
                                                    </td>
                                                    <td style={{ maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={job.filename}>
                                                        {job.filename?.replace(/\.gcode$/i, '')}
                                                    </td>
                                                    <td style={{ fontSize: '13px', color: 'var(--text-muted)' }}>
                                                        {job.project_name
                                                            ? <>
                                                                <span style={{ fontWeight: 600, color: 'var(--text)' }}>{job.project_name}</span>
                                                                {job.plate_display_name && <span style={{ fontSize: '11px', marginLeft: '4px' }}>· {job.plate_display_name}</span>}
                                                              </>
                                                            : <span style={{ opacity: 0.35 }}>—</span>}
                                                    </td>
                                                    <td><StatusBadge status={job.status} /></td>
                                                    <td style={{ whiteSpace: 'nowrap' }}>{fmtDuration(job.total_duration_s)}</td>
                                                    <td style={{ whiteSpace: 'nowrap', color: 'var(--text-muted)' }}>{fmtFilament(job.filament_used_mm)}</td>
                                                    <td>
                                                        {job.material
                                                            ? <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
                                                                {job.color_hex && <div style={{ width: 10, height: 10, borderRadius: '50%', background: `#${job.color_hex}`, border: '1px solid var(--border)', flexShrink: 0 }} />}
                                                                <span style={{ fontSize: '12px' }}>{job.material}</span>
                                                              </div>
                                                            : <span style={{ opacity: 0.35 }}>—</span>}
                                                    </td>
                                                </tr>
                                            );
                                        })
                                    }
                                </tbody>
                            </table>
                        </div>

                        {totalPages > 1 && (
                            <div style={{ display: 'flex', gap: '8px', alignItems: 'center', justifyContent: 'center', marginTop: '16px' }}>
                                <button className="btn btn-sm" disabled={histPage === 1} onClick={() => setHistPage(p => p - 1)}>← Prev</button>
                                <span style={{ fontSize: '13px', color: 'var(--text-muted)' }}>Page {histPage} of {totalPages}</span>
                                <button className="btn btn-sm" disabled={histPage >= totalPages} onClick={() => setHistPage(p => p + 1)}>Next →</button>
                            </div>
                        )}
                    </>}
                </div>
            )}
        </div>
    );
}
