import { useState, useEffect } from 'react';

export default function FleetInsights() {
    const [stats, setStats] = useState(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        fetch('/api/stats/fleet')
            .then(r => r.json())
            .then(data => {
                setStats(data);
                setLoading(false);
            })
            .catch(err => {
                console.error('Failed to load fleet stats', err);
                setLoading(false);
            });
    }, []);

    if (loading) {
        return <div style={{ fontSize: '13px', color: 'var(--text-muted)' }}>Loading insights...</div>;
    }

    if (!stats) {
        return <div style={{ fontSize: '13px', color: 'var(--text-muted)' }}>No statistics available broadly.</div>;
    }

    const formatHours = (seconds) => {
        if (!seconds) return '0 hrs';
        return `${(seconds / 3600).toFixed(1)} hrs`;
    };

    const formatFilament = (mm) => {
        if (!mm) return '0 m';
        return `${(mm / 1000).toFixed(2)} m`;
    };

    return (
        <div className="fleet-insights">
            <h3 style={{ fontSize: '14px', fontWeight: '600', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '16px' }}>
                Fleet Analytics
            </h3>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                <div className="insight-card">
                    <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginBottom: '4px' }}>Total Print Jobs</div>
                    <div style={{ fontSize: '24px', fontWeight: '600', color: 'var(--text)' }}>
                        {stats.total_jobs} <span style={{ fontSize: '14px', color: 'var(--text-muted)', fontWeight: '400' }}>prints</span>
                    </div>
                </div>

                <div className="insight-card">
                    <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginBottom: '4px' }}>Total Print Time</div>
                    <div style={{ fontSize: '24px', fontWeight: '600', color: 'var(--text)' }}>
                        {formatHours(stats.total_duration_s)}
                    </div>
                </div>

                <div className="insight-card">
                    <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginBottom: '4px' }}>Filament Extruded</div>
                    <div style={{ fontSize: '24px', fontWeight: '600', color: 'var(--text)' }}>
                        {formatFilament(stats.total_filament_mm)}
                    </div>
                </div>

                {stats.top_material && (
                    <div className="insight-card">
                        <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginBottom: '4px' }}>Most Used Material</div>
                        <div style={{ fontSize: '24px', fontWeight: '600', color: 'var(--text)' }}>
                            {stats.top_material}
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}
