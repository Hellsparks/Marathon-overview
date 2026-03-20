import { useState, useEffect } from 'react';

export default function MaintenancePanel() {
    const [data, setData] = useState(null);

    useEffect(() => {
        fetch('/api/maintenance')
            .then(r => r.json())
            .then(setData)
            .catch(() => {});
    }, []);

    if (!data) return <div className="rp-muted" style={{ padding: '12px 0' }}>Loading…</div>;

    const totalHours = data.printers.reduce((sum, p) => sum + (p.runtime_s || 0), 0) / 3600;

    const overdue = [];
    for (const printer of data.printers) {
        for (const task of data.tasks) {
            const key = `${task.id}_${printer.id}`;
            const intervalH = data.intervals[key];
            if (!intervalH) continue;
            const hist = data.history[key];
            const hoursUsed = hist
                ? (printer.runtime_s - hist.runtime_s_at_performance) / 3600
                : printer.runtime_s / 3600;
            if (hoursUsed >= intervalH) {
                overdue.push({ printer: printer.name, task: task.name });
            }
        }
    }

    return (
        <div className="rp-content">
            <h3 className="rp-title">Maintenance</h3>

            <div className="rp-big-stat">
                <span className="rp-big-number">{totalHours.toFixed(0)}</span>
                <span className="rp-big-label">fleet hours total</span>
            </div>

            {overdue.length > 0 ? (
                <>
                    <div className="rp-section-title rp-overdue-title">
                        Overdue ({overdue.length})
                    </div>
                    <div className="rp-overdue-list">
                        {overdue.map((o, i) => (
                            <div key={i} className="rp-overdue-item">
                                <span className="rp-overdue-task">{o.task}</span>
                                <span className="rp-overdue-printer">{o.printer}</span>
                            </div>
                        ))}
                    </div>
                </>
            ) : (
                <div className="rp-ok-badge">All tasks up to date ✓</div>
            )}
        </div>
    );
}
