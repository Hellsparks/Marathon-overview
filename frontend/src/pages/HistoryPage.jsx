import React, { useState, useEffect } from 'react';
import { usePrinters } from '../hooks/usePrinters';
import { getSpools } from '../api/spoolman';

function TimelineChart({ jobs, printers, scope, title, timelineRange, setTimelineRange }) {
    const [period, setPeriod] = useState('day'); // 'day', 'week', 'month', 'custom'
    const [tooltip, setTooltip] = useState({ show: false, x: 0, y: 0, job: null });

    if (!jobs || !printers || printers.length === 0) return <div className="chart-empty" style={{ color: 'var(--text-muted)' }}>No data available</div>;

    const now = new Date();
    const msPerPeriod = {
        'day': 24 * 60 * 60 * 1000,
        'week': 7 * 24 * 60 * 60 * 1000,
        'month': 30 * 24 * 60 * 60 * 1000
    };

    let startMs, durationMs, endMs;
    let missingCustomDate = false;
    if (period === 'custom') {
        if (timelineRange.start && timelineRange.end) {
            const [sy, sm, sd] = timelineRange.start.split('-');
            startMs = new Date(sy, sm - 1, sd, 0, 0, 0).getTime();

            const [ey, em, ed] = timelineRange.end.split('-');
            endMs = new Date(ey, em - 1, ed, 23, 59, 59, 999).getTime();
            durationMs = endMs - startMs;
        } else {
            missingCustomDate = true;
            durationMs = msPerPeriod['month'];
            startMs = now.getTime() - durationMs;
            endMs = now.getTime();
        }
    } else {
        durationMs = msPerPeriod[period] || msPerPeriod['month'];
        startMs = now.getTime() - durationMs;
        endMs = now.getTime();
    }

    // Filter jobs within window
    const visibleJobs = missingCustomDate ? [] : jobs.filter(j => {
        // SQLite CURRENT_TIMESTAMP is "YYYY-MM-DD HH:MM:SS" (UTC).
        // Replace space with T and append Z to ensure cross-browser proper parsing to UTC.
        const safeEndTime = j.end_time.replace(' ', 'T') + 'Z';
        const end = new Date(safeEndTime).getTime();
        if (isNaN(end)) return false;

        const start = end - (j.total_duration_s * 1000);
        return end >= startMs && start <= endMs;
    });

    const activePrinters = scope ? printers.filter(p => p.id == scope) : printers;

    const rowHeight = 40;
    const paddingLeft = 140; // Fixed left padding for labels
    const paddingRight = 40;
    const paddingTop = 30;
    const paddingBottom = 40;
    const height = paddingTop + paddingBottom + (activePrinters.length * rowHeight);

    return (
        <div className="svg-chart-container" style={{ overflowX: 'auto', width: '100%' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
                <h3 className="chart-title" style={{ margin: 0 }}>{title}</h3>
                <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                    {period === 'custom' && (
                        <div style={{ display: 'flex', gap: '4px', alignItems: 'center' }}>
                            <input
                                type="date"
                                className="input"
                                style={{ padding: '4px 8px', fontSize: '12px', height: 'auto', backgroundColor: 'var(--surface2)' }}
                                value={timelineRange.start}
                                onChange={e => setTimelineRange(p => ({ ...p, start: e.target.value }))}
                            />
                            <span style={{ color: 'var(--text-muted)' }}>to</span>
                            <input
                                type="date"
                                className="input"
                                style={{ padding: '4px 8px', fontSize: '12px', height: 'auto', backgroundColor: 'var(--surface2)' }}
                                value={timelineRange.end}
                                onChange={e => setTimelineRange(p => ({ ...p, end: e.target.value }))}
                            />
                        </div>
                    )}
                    <div style={{ display: 'flex', gap: '4px', background: 'var(--surface2)', padding: '4px', borderRadius: '6px' }}>
                        {['day', 'week', 'month', 'custom'].map(p => (
                            <button
                                key={p}
                                onClick={() => {
                                    setPeriod(p);
                                    if (p !== 'custom') {
                                        setTimelineRange({ start: '', end: '' });
                                    }
                                }}
                                style={{
                                    padding: '4px 12px',
                                    fontSize: '12px',
                                    borderRadius: '4px',
                                    border: 'none',
                                    background: period === p ? 'var(--primary)' : 'transparent',
                                    color: period === p ? '#fff' : 'var(--text-muted)',
                                    cursor: 'pointer',
                                    textTransform: 'capitalize',
                                    transition: 'background 0.2s, color 0.2s'
                                }}
                            >
                                {p}
                            </button>
                        ))}
                    </div>
                </div>
            </div>

            {missingCustomDate ? (
                <div className="chart-empty" style={{ color: 'var(--text-muted)', padding: '60px 0', textAlign: 'center' }}>
                    Select a date range to view your custom timeline.
                </div>
            ) : (
                <svg width="100%" height={height} style={{ display: 'block' }}>
                    <g transform={`translate(${paddingLeft}, ${paddingTop})`}>
                        {/* X Axis Guides */}
                        {[0, 0.25, 0.5, 0.75, 1].map((tick, i) => {
                            const timeVal = new Date(startMs + (durationMs * tick));
                            let label;
                            if (period === 'day' || durationMs <= 24 * 60 * 60 * 1000) {
                                const hh = String(timeVal.getHours()).padStart(2, '0');
                                const min = String(timeVal.getMinutes()).padStart(2, '0');
                                label = `${hh}:${min}`;
                            } else {
                                const yyyy = timeVal.getFullYear();
                                const mm = String(timeVal.getMonth() + 1).padStart(2, '0');
                                const dd = String(timeVal.getDate()).padStart(2, '0');
                                label = `${yyyy}.${mm}.${dd}`;
                            }

                            return (
                                <g key={i}>
                                    <line
                                        x1={`${tick * 100}%`}
                                        y1="0"
                                        x2={`${tick * 100}%`}
                                        y2={activePrinters.length * rowHeight}
                                        style={{ transform: `translateX(-${paddingRight * tick}px)` }}
                                        stroke="var(--border)" strokeDasharray="4,4"
                                    />
                                    <text
                                        x={`${tick * 100}%`}
                                        y={activePrinters.length * rowHeight + 20}
                                        style={{ transform: `translateX(-${paddingRight * tick}px)` }}
                                        textAnchor="middle" fontSize="11" fill="var(--text-muted)"
                                    >
                                        {label}
                                    </text>
                                </g>
                            );
                        })}

                        {/* Printer Tracks */}
                        {activePrinters.map((p, i) => {
                            const pJobs = visibleJobs.filter(j => j.printer_id == p.id);
                            return (
                                <g key={p.id} transform={`translate(0, ${i * rowHeight})`}>
                                    <text x="-10" y="20" textAnchor="end" fontSize="12" fill="var(--text)" style={{ alignmentBaseline: 'middle' }}>
                                        {p.name.length > 20 ? p.name.substring(0, 20) + '...' : p.name}
                                    </text>

                                    {/* Background idle track */}
                                    <rect x="0" y="6" width="100%" height="24" fill="var(--surface2)" rx="4" style={{ width: `calc(100% - ${paddingRight}px)` }} />

                                    {/* Print Segments */}
                                    {pJobs.map(j => {
                                        const end = new Date(j.end_time).getTime();
                                        const start = end - (j.total_duration_s * 1000);

                                        const segmentStart = Math.max(start, startMs);
                                        const segmentEnd = Math.min(end, now.getTime());
                                        if (segmentEnd <= segmentStart) return null;

                                        const xPct = (segmentStart - startMs) / durationMs;
                                        const wPct = (segmentEnd - segmentStart) / durationMs;

                                        const color = j.status === 'error' ? 'var(--danger)' : j.status === 'cancelled' ? 'var(--warning)' : 'var(--primary)';

                                        return (
                                            <g key={j.id}>
                                                <rect
                                                    x={`${xPct * 100}%`}
                                                    y="6"
                                                    width={`${wPct * 100}%`}
                                                    height="24"
                                                    fill={color}
                                                    rx="2"
                                                    style={{ minWidth: '2px', cursor: 'pointer', transform: `translateX(-${paddingRight * xPct}px)` }}
                                                    onMouseEnter={(e) => setTooltip({ show: true, x: e.clientX, y: e.clientY, job: j })}
                                                    onMouseMove={(e) => setTooltip(prev => ({ ...prev, x: e.clientX, y: e.clientY }))}
                                                    onMouseLeave={() => setTooltip({ show: false, x: 0, y: 0, job: null })}
                                                />
                                            </g>
                                        );
                                    })}
                                </g>
                            );
                        })}
                    </g>
                </svg>
            )}

            {/* Tooltip */}
            {tooltip.show && tooltip.job && (
                <div style={{
                    position: 'fixed',
                    left: tooltip.x + 15,
                    top: tooltip.y + 15,
                    zIndex: 9999,
                    background: 'var(--surface)',
                    border: '1px solid var(--border)',
                    padding: '12px',
                    borderRadius: '6px',
                    boxShadow: '0 4px 12px rgba(0,0,0,0.5)',
                    pointerEvents: 'none',
                    color: 'var(--text)',
                    fontSize: '13px',
                    minWidth: '220px'
                }}>
                    <div style={{ fontWeight: 600, color: 'var(--primary)', marginBottom: '4px' }}>
                        {tooltip.job.project_name || tooltip.job.filename}
                    </div>
                    {tooltip.job.project_name && <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginBottom: '8px', wordBreak: 'break-all' }}>{tooltip.job.filename}</div>}
                    <div style={{ display: 'grid', gridTemplateColumns: 'auto 1fr', gap: '4px 12px' }}>
                        <span style={{ color: 'var(--text-muted)' }}>Status:</span>
                        <span style={{
                            fontWeight: 600,
                            color: tooltip.job.status === 'complete' ? 'var(--success)' :
                                tooltip.job.status === 'error' ? 'var(--danger)' :
                                    tooltip.job.status === 'cancelled' ? 'var(--warning)' : 'var(--text)'
                        }}>{tooltip.job.status.toUpperCase()}</span>

                        <span style={{ color: 'var(--text-muted)' }}>Duration:</span>
                        <span>{formatDuration(tooltip.job.total_duration_s)}</span>

                        <span style={{ color: 'var(--text-muted)' }}>Finished:</span>
                        <span>{formatDate(tooltip.job.end_time)}</span>
                    </div>
                </div>
            )}
        </div>
    );
}

// Basic SVG Donut Chart
function DonutChart({ data, title }) {
    if (!data || data.length === 0) return <div className="chart-empty" style={{ color: 'var(--text-muted)' }}>No data available</div>;

    const total = data.reduce((sum, d) => sum + d.value, 0);
    let currentAngle = -Math.PI / 2; // Start at top

    const cx = 150;
    const cy = 150;
    const radius = 100;
    const innerRadius = 60;

    // Fallback colors if not specified
    const colors = ['#4e79a7', '#f28e2c', '#e15759', '#76b7b2', '#59a14f', '#edc949', '#af7aa1', '#ff9da7', '#9c755f', '#bab0ab'];

    const arcs = data.map((d, i) => {
        const angle = (d.value / total) * (Math.PI * 2);
        const x1 = cx + radius * Math.cos(currentAngle);
        const y1 = cy + radius * Math.sin(currentAngle);
        const x2 = cx + radius * Math.cos(currentAngle + angle);
        const y2 = cy + radius * Math.sin(currentAngle + angle);

        const largeArcFlag = angle > Math.PI ? 1 : 0;

        const pathData = [
            `M ${cx} ${cy}`,
            `L ${x1} ${y1}`,
            `A ${radius} ${radius} 0 ${largeArcFlag} 1 ${x2} ${y2}`,
            'Z'
        ].join(' ');

        currentAngle += angle;

        return (
            <path
                key={i}
                d={pathData}
                fill={d.color || colors[i % colors.length]}
                title={`${d.label}: ${d.formattedValue}`}
            />
        );
    });

    return (
        <div className="svg-chart-container" style={{ display: 'flex', alignItems: 'center', gap: '2rem' }}>
            <div style={{ flex: 1 }}>
                <h3 className="chart-title" style={{ marginBottom: '16px' }}>{title}</h3>
                <svg width="300" height="300" viewBox="0 0 300 300">
                    <g>
                        {arcs}
                        <circle cx={cx} cy={cy} r={innerRadius} fill="var(--surface)" />
                        <text x={cx} y={cy} textAnchor="middle" alignmentBaseline="middle" fill="var(--text)" fontSize="14" fontWeight="bold">
                            Top {data.length}
                        </text>
                    </g>
                </svg>
            </div>
            <div className="chart-legend" style={{ flex: 1, maxHeight: '250px', overflowY: 'auto' }}>
                <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
                    {data.map((d, i) => (
                        <li key={i} style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px', fontSize: '13px', color: 'var(--text)' }}>
                            <span style={{ width: '12px', height: '12px', backgroundColor: d.color || colors[i % colors.length], display: 'inline-block', borderRadius: '2px' }}></span>
                            <span style={{ flex: 1, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }} title={d.label}>{d.label}</span>
                            <span>{((d.value / total) * 100).toFixed(1)}%</span>
                        </li>
                    ))}
                </ul>
            </div>
        </div>
    );
}

// Basic SVG Column Chart (Weekly)
function ColumnChart({ data, title }) {
    if (!data || data.length === 0) return <div className="chart-empty" style={{ color: 'var(--text-muted)' }}>No data available</div>;

    const maxVal = Math.max(...data.map(d => d.value), 1); // Avoid div by 0
    const width = 600;
    const height = 250;
    const margin = { top: 20, right: 20, bottom: 40, left: 60 };
    const innerWidth = width - margin.left - margin.right;
    const innerHeight = height - margin.top - margin.bottom;

    const barWidth = Math.max(10, (innerWidth / data.length) - 4);

    return (
        <div className="svg-chart-container" style={{ overflowX: 'auto' }}>
            <h3 className="chart-title" style={{ marginBottom: '16px' }}>{title}</h3>
            <svg width={width} height={height} style={{ minWidth: width + 'px', display: 'block' }}>
                <g transform={`translate(${margin.left}, ${margin.top})`}>
                    {/* Y Axis Guides */}
                    {[0, 0.25, 0.5, 0.75, 1].map((tick, i) => {
                        const y = innerHeight - (tick * innerHeight);
                        return (
                            <g key={i}>
                                <line x1="0" y1={y} x2={innerWidth} y2={y} stroke="var(--border)" strokeDasharray="4,4" />
                                <text x="-10" y={y} textAnchor="end" alignmentBaseline="middle" fontSize="11" fill="var(--text-muted)">
                                    {Math.round(tick * maxVal)}h
                                </text>
                            </g>
                        );
                    })}

                    {/* Bars */}
                    {data.map((d, i) => {
                        const x = i * (innerWidth / data.length) + (innerWidth / data.length / 2) - (barWidth / 2);
                        const h = (d.value / maxVal) * innerHeight;
                        const y = innerHeight - h;

                        return (
                            <g key={i}>
                                <rect
                                    x={x}
                                    y={y}
                                    width={barWidth}
                                    height={h}
                                    fill="var(--primary)"
                                    rx="2"
                                    title={`${d.label}: ${d.formattedValue}`}
                                />
                                {/* X Axis Label (every other if too many) */}
                                {(data.length <= 15 || i % 2 === 0) && (
                                    <text
                                        x={x + barWidth / 2}
                                        y={innerHeight + 20}
                                        textAnchor="middle"
                                        fontSize="10"
                                        fill="var(--text-muted)"
                                        transform={data.length > 10 ? `rotate(-45, ${x + barWidth / 2}, ${innerHeight + 20})` : ''}
                                    >
                                        {d.label}
                                    </text>
                                )}
                            </g>
                        );
                    })}
                </g>
            </svg>
        </div>
    );
}

function formatDuration(seconds) {
    if (!seconds) return '0h 0m';
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    return `${h}h ${m}m`;
}

function formatFilament(mm) {
    if (!mm) return '0m';
    return (mm / 1000).toFixed(2) + 'm';
}

function formatDate(dateStr) {
    if (!dateStr) return '';

    // SQLite sends YYYY-MM-DD HH:MM:SS in UTC.
    // Convert spaced string to standard ISO string to ensure consistent timezone parsing across browsers.
    let safeStr = dateStr;
    if (typeof dateStr === 'string' && !dateStr.includes('T')) {
        safeStr = dateStr.replace(' ', 'T');
        if (!safeStr.endsWith('Z')) safeStr += 'Z';
    }

    const d = new Date(safeStr);
    if (isNaN(d.getTime())) return dateStr;

    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    const hh = String(d.getHours()).padStart(2, '0');
    const min = String(d.getMinutes()).padStart(2, '0');

    return `${yyyy}.${mm}.${dd} ${hh}:${min}`;
}

export default function HistoryPage() {
    const { printers } = usePrinters();
    const [activeTab, setActiveTab] = useState('utilization'); // 'utilization' or 'log'
    const [scope, setScope] = useState(''); // '' = farm-wide, otherwise printer_id

    // Utilization Data
    const [utilData, setUtilData] = useState(null);
    const [utilLoading, setUtilLoading] = useState(true);
    const [timelineRange, setTimelineRange] = useState({ start: '', end: '' });

    // Log Data
    const [logData, setLogData] = useState([]);
    const [logPagination, setLogPagination] = useState({ page: 1, limit: 50, total: 0, pages: 1 });
    const [logLoading, setLogLoading] = useState(true);
    const [logStatusFilter, setLogStatusFilter] = useState('');

    const [spoolsMap, setSpoolsMap] = useState({});

    useEffect(() => {
        // Fetch all spools to overlay details (initial/remaining weight, color)
        async function fetchAllSpools() {
            try {
                const spools = await getSpools();
                const map = {};
                for (const s of spools) {
                    map[s.id] = s;
                }
                setSpoolsMap(map);
            } catch (e) {
                console.warn('Failed to fetch spools for history', e);
            }
        }
        fetchAllSpools();
    }, []);

    useEffect(() => {
        fetchUtilization();
    }, [scope, timelineRange.start, timelineRange.end]);

    useEffect(() => {
        fetchLog();
    }, [scope, logPagination.page, logStatusFilter]);

    async function fetchUtilization() {
        setUtilLoading(true);
        try {
            let url = '/api/stats/utilization';
            let params = new URLSearchParams();
            if (scope) params.append('printer_id', scope);
            if (timelineRange.start && timelineRange.end) {
                params.append('timeline_start', timelineRange.start);
                params.append('timeline_end', timelineRange.end);
            }
            if (params.toString()) url += `?${params.toString()}`;

            const res = await fetch(url);
            if (!res.ok) throw new Error('Fetch failed');
            const data = await res.json();
            setUtilData(data);
        } catch (e) {
            console.error('Failed to fetch utilization', e);
        } finally {
            setUtilLoading(false);
        }
    }

    async function fetchLog() {
        setLogLoading(true);
        try {
            let url = `/api/stats/history?page=${logPagination.page}&limit=${logPagination.limit}`;
            if (scope) url += `&printer_id=${scope}`;
            if (logStatusFilter) url += `&status=${logStatusFilter}`;

            const res = await fetch(url);
            if (!res.ok) throw new Error('Fetch failed');
            const data = await res.json();
            setLogData(data.data);
            setLogPagination(data.pagination);
        } catch (e) {
            console.error('Failed to fetch log', e);
        } finally {
            setLogLoading(false);
        }
    }

    function renderUtilization() {
        if (utilLoading && !utilData) return <div className="loading" style={{ margin: '40px auto', textAlign: 'center', color: 'var(--text-muted)' }}>Loading charts...</div>;
        if (!utilData) return null;
        // 1. Timeline Chart Data
        const timelineJobs = utilData.timeline_jobs || [];

        // Process Top Files for Donut Chart
        const topFilesData = utilData.top_files.map(f => ({
            label: f.project_name || f.filename,
            value: f.total_print_time || 0,
            formattedValue: formatDuration(f.total_print_time)
        }));

        // Process Weekly Data for Column Chart
        // Group by week_start
        const weeklyGroups = {};
        utilData.weekly_data.forEach(w => {
            const key = w.week_start;
            if (!weeklyGroups[key]) weeklyGroups[key] = 0;
            weeklyGroups[key] += (w.total_duration_s || 0) / 3600; // in hours
        });

        const weeklyData = Object.keys(weeklyGroups).sort().map(key => {
            const date = new Date(key);
            const label = `${date.getMonth() + 1}/${date.getDate()}`;
            return {
                label,
                value: weeklyGroups[key],
                formattedValue: `${Math.round(weeklyGroups[key])}h`
            };
        });

        return (
            <div className="utilization-dashboard" style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1fr)', gap: '2rem' }}>
                {/* Timeline spanning full width */}
                <div className="card panel p-4" style={{ gridColumn: '1 / -1' }}>
                    <TimelineChart
                        title={scope ? "Printer Active Timeline" : "Farm Printer Active Timeline"}
                        jobs={timelineJobs}
                        printers={printers}
                        scope={scope}
                        timelineRange={timelineRange}
                        setTimelineRange={setTimelineRange}
                    />
                </div>

                {/* Donut Chart (Half Width) */}
                <div className="card panel p-4">
                    <DonutChart
                        title="Top Files by Print Time"
                        data={topFilesData}
                    />
                </div>
                <div className="card panel p-4" style={{ gridColumn: '1 / -1' }}>
                    <ColumnChart
                        title="Weekly Print Time (Hours)"
                        data={weeklyData}
                    />
                </div>
            </div>
        );
    }

    function renderLog() {
        return (
            <div className="log-container panel p-4 card" style={{ background: 'var(--surface)', padding: '20px', borderRadius: '8px', border: '1px solid var(--border)' }}>
                <div className="toolbar" style={{ display: 'flex', gap: '12px', marginBottom: '16px' }}>
                    <select
                        className="input"
                        value={logStatusFilter}
                        onChange={(e) => {
                            setLogStatusFilter(e.target.value);
                            setLogPagination(p => ({ ...p, page: 1 }));
                        }}
                        style={{ maxWidth: '200px', backgroundColor: 'var(--surface2)' }}
                    >
                        <option value="">All Statuses</option>
                        <option value="complete">Complete</option>
                        <option value="cancelled">Cancelled</option>
                        <option value="error">Error</option>
                    </select>
                </div>

                {logLoading ? (
                    <div className="loading">Loading log...</div>
                ) : (
                    <div className="table-responsive" style={{ overflowX: 'auto' }}>
                        <table className="v-table history-table" style={{ width: '100%', borderCollapse: 'collapse', fontSize: '14px' }}>
                            <thead>
                                <tr style={{ borderBottom: '1px solid var(--border-color)', textAlign: 'left' }}>
                                    <th style={{ padding: '12px 8px', color: 'var(--text-muted)' }}>Date</th>
                                    <th style={{ padding: '12px 8px', color: 'var(--text-muted)' }}>Printer</th>
                                    <th style={{ padding: '12px 8px', color: 'var(--text-muted)' }}>File / Project</th>
                                    <th style={{ padding: '12px 8px', color: 'var(--text-muted)' }}>Duration</th>
                                    <th style={{ padding: '12px 8px', color: 'var(--text-muted)' }}>Filament Used</th>
                                    <th style={{ padding: '12px 8px', color: 'var(--text-muted)' }}>Status</th>
                                </tr>
                            </thead>
                            <tbody>
                                {logData.length === 0 ? (
                                    <tr><td colSpan="6" style={{ textAlign: 'center', padding: '32px', color: 'var(--text-muted)' }}>No print jobs found.</td></tr>
                                ) : logData.map((job, index) => {
                                    // Construct the Spool Mini Card directly here for simplicity
                                    const spoolId = job.spool_id;
                                    const spool = spoolId ? spoolsMap[spoolId] : null;

                                    // Data priority: live spool data > logged job data
                                    const material = spool?.filament?.material || job.material || 'Unknown';
                                    const colorHex = spool?.filament?.color_hex || job.color_hex || '888888';
                                    const vendor = spool?.filament?.vendor?.name || job.vendor || '';
                                    const spoolName = spool?.filament?.name || job.spool_name || (spoolId ? `Spool #${spoolId}` : 'Untracked');

                                    // Spool Progress Calculation
                                    let progressEl = null;
                                    if (spool && spool.initial_weight > 0) {
                                        const remainingPct = Math.min(100, Math.max(0, (spool.remaining_weight / spool.initial_weight) * 100));

                                        // Estimate how much this specific print used relative to the spool capacity
                                        // We have job.filament_used_mm. Assuming density ~1.24g/cm3 and 1.75mm diameter => ~0.003g/mm
                                        // A rough estimate if actual weight isn't in print job.
                                        const estimatedPrintWeightUsed = (job.filament_used_mm || 0) * 0.003;
                                        const printUsedPct = Math.min(100, (estimatedPrintWeightUsed / spool.initial_weight) * 100);

                                        progressEl = (
                                            <div className="spool-mini-bar-container" style={{
                                                width: '100%', height: '4px', backgroundColor: 'var(--border-color)',
                                                borderRadius: '2px', marginTop: '6px', overflow: 'hidden', display: 'flex'
                                            }}>
                                                <div title={`Remaining: ${remainingPct.toFixed(1)}%`} style={{
                                                    height: '100%',
                                                    width: `${remainingPct}%`,
                                                    backgroundColor: `#${colorHex}`,
                                                    opacity: 0.8
                                                }} />
                                                {/* Stack the print usage visually on top to show what this print took */}
                                                <div title={`Used by this print: ~${printUsedPct.toFixed(1)}%`} style={{
                                                    height: '100%',
                                                    width: `${printUsedPct}%`,
                                                    backgroundColor: 'var(--danger, #f44336)'
                                                }} />
                                            </div>
                                        );
                                    }

                                    return (
                                        <tr key={job.id} style={{ borderBottom: '1px solid var(--border)', background: index % 2 === 0 ? 'transparent' : 'var(--surface2)', transition: 'background-color 0.2s' }} className="history-tr">
                                            <td style={{ padding: '12px 8px', whiteSpace: 'nowrap', verticalAlign: 'top' }}>
                                                <div style={{ fontWeight: 500 }}>{formatDate(job.end_time).split(',')[0]}</div>
                                                <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>{formatDate(job.end_time).split(',')[1]}</div>
                                            </td>
                                            <td style={{ padding: '12px 8px', verticalAlign: 'top', fontWeight: 500 }}>
                                                {job.printer_name}
                                            </td>
                                            <td style={{ padding: '12px 8px', verticalAlign: 'top' }}>
                                                <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                                                    {job.project_name && (
                                                        <span style={{
                                                            fontWeight: '600',
                                                            color: 'var(--primary)',
                                                            fontSize: '13px',
                                                            background: 'color-mix(in srgb, var(--primary) 15%, transparent)',
                                                            padding: '2px 6px',
                                                            borderRadius: '4px',
                                                            width: 'fit-content'
                                                        }}>
                                                            {job.project_name}
                                                        </span>
                                                    )}
                                                    <div title={job.filename} style={{ wordBreak: 'break-all', fontSize: '13px' }}>
                                                        {job.plate_name || job.filename}
                                                    </div>
                                                </div>
                                            </td>
                                            <td style={{ padding: '12px 8px', verticalAlign: 'top', whiteSpace: 'nowrap' }}>
                                                {formatDuration(job.total_duration_s)}
                                            </td>
                                            <td style={{ padding: '12px 8px', verticalAlign: 'top' }}>
                                                {/* Spool Mini Card */}
                                                {(job.material || job.spool_id) ? (
                                                    <div style={{
                                                        display: 'flex', flexDirection: 'column',
                                                        background: 'var(--surface2)',
                                                        padding: '8px',
                                                        borderRadius: '6px',
                                                        border: '1px solid var(--border)',
                                                        minWidth: '160px'
                                                    }}>
                                                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
                                                            <div style={{
                                                                width: '12px', height: '12px',
                                                                borderRadius: '50%', backgroundColor: `#${colorHex}`,
                                                                boxShadow: '0 0 2px rgba(0,0,0,0.5)'
                                                            }} />
                                                            <div style={{ fontWeight: 600, fontSize: '13px' }}>
                                                                {material}
                                                            </div>
                                                            {vendor && <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>{vendor}</span>}
                                                        </div>
                                                        <div style={{ fontSize: '12px', color: 'var(--text-muted)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: '180px' }} title={spoolName}>
                                                            {spoolName}
                                                        </div>
                                                        <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '2px' }}>
                                                            Used: {formatFilament(job.filament_used_mm)}
                                                        </div>
                                                        {progressEl}
                                                    </div>
                                                ) : (
                                                    <span style={{ color: 'var(--text-muted)', fontStyle: 'italic', fontSize: '13px' }}>Unknown</span>
                                                )}
                                            </td>
                                            <td style={{ padding: '12px 8px', verticalAlign: 'top' }}>
                                                <span style={{
                                                    display: 'inline-block',
                                                    padding: '4px 8px',
                                                    borderRadius: '4px',
                                                    fontSize: '12px',
                                                    fontWeight: 600,
                                                    backgroundColor: job.status === 'complete' ? 'color-mix(in srgb, var(--success) 20%, transparent)' :
                                                        job.status === 'error' ? 'color-mix(in srgb, var(--danger) 20%, transparent)' :
                                                            job.status === 'cancelled' ? 'color-mix(in srgb, var(--warning) 20%, transparent)' : 'color-mix(in srgb, var(--text-muted) 20%, transparent)',
                                                    color: job.status === 'complete' ? 'var(--success)' :
                                                        job.status === 'error' ? 'var(--danger)' :
                                                            job.status === 'cancelled' ? 'var(--warning)' : 'var(--text-muted)'
                                                }}>
                                                    {job.status ? job.status.charAt(0).toUpperCase() + job.status.slice(1) : '-'}
                                                </span>
                                            </td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>
                )}

                {/* Pagination */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '16px' }}>
                    <div style={{ fontSize: '14px', color: 'var(--text-muted)' }}>
                        Showing {logData.length} of {logPagination.total} jobs
                    </div>
                    <div style={{ display: 'flex', gap: '8px' }}>
                        <button
                            className="theme-picker-btn"
                            disabled={logPagination.page <= 1}
                            onClick={() => setLogPagination(p => ({ ...p, page: p.page - 1 }))}
                        >
                            Previous
                        </button>
                        <span style={{ display: 'flex', alignItems: 'center', padding: '0 8px', color: 'var(--text-muted)' }}>
                            Page {logPagination.page} of {logPagination.pages}
                        </span>
                        <button
                            className="theme-picker-btn"
                            disabled={logPagination.page >= logPagination.pages}
                            onClick={() => setLogPagination(p => ({ ...p, page: p.page + 1 }))}
                        >
                            Next
                        </button>
                    </div>
                </div>
            </div>
        );
    }

    return (
        <div className="page" style={{ padding: '24px', maxWidth: '1200px', margin: '0 auto' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
                <h1 style={{ margin: 0 }}>History & Utilization</h1>

                <div style={{ display: 'flex', gap: '16px' }}>
                    <select
                        className="input"
                        value={scope}
                        onChange={(e) => {
                            setScope(e.target.value);
                            setLogPagination(p => ({ ...p, page: 1 }));
                        }}
                        style={{ minWidth: '200px', backgroundColor: 'var(--surface2)' }}
                    >
                        <option value="">All Printers (Farm-wide)</option>
                        {printers.map(p => (
                            <option key={p.id} value={p.id}>{p.name}</option>
                        ))}
                    </select>
                </div>
            </div>

            <div className="v-tabs" style={{ marginBottom: '24px', borderBottom: '1px solid var(--border)', display: 'flex', gap: '8px' }}>
                <button
                    className={`v-tab ${activeTab === 'utilization' ? 'v-tab--selected' : ''}`}
                    onClick={() => setActiveTab('utilization')}
                    style={{
                        padding: '12px 24px',
                        background: 'transparent',
                        border: 'none',
                        borderBottom: activeTab === 'utilization' ? '2px solid var(--primary)' : '2px solid transparent',
                        color: activeTab === 'utilization' ? 'var(--primary)' : 'var(--text)',
                        fontWeight: activeTab === 'utilization' ? 600 : 400,
                        cursor: 'pointer',
                        fontSize: '15px'
                    }}
                >
                    Utilization
                </button>
                <button
                    className={`v-tab ${activeTab === 'log' ? 'v-tab--selected' : ''}`}
                    onClick={() => setActiveTab('log')}
                    style={{
                        padding: '12px 24px',
                        background: 'transparent',
                        border: 'none',
                        borderBottom: activeTab === 'log' ? '2px solid var(--primary)' : '2px solid transparent',
                        color: activeTab === 'log' ? 'var(--primary)' : 'var(--text)',
                        fontWeight: activeTab === 'log' ? 600 : 400,
                        cursor: 'pointer',
                        fontSize: '15px'
                    }}
                >
                    Print Log
                </button>
            </div>

            <div className="tab-contents">
                {activeTab === 'utilization' && renderUtilization()}
                {activeTab === 'log' && renderLog()}
            </div>
        </div>
    );
}
