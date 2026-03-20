import { useState, useEffect } from 'react';
import FileUpload from '../files/FileUpload';

export default function FilesPanel({ selected }) {
    const [stats, setStats] = useState(null);

    // Fetch stats for the selected file; re-fetch whenever selection changes or every 10s
    useEffect(() => {
        if (!selected?.file) { setStats(null); return; }
        let cancelled = false;
        function load() {
            fetch('/api/stats/files')
                .then(r => r.json())
                .then(data => {
                if (!cancelled) {
                    const s = data[selected.file.display_name];
                    // Only show stats if there's at least one job (success, cancelled, or error)
                    setStats((s && (s.print_count > 0 || s.cancelled_count > 0 || s.error_count > 0)) ? s : null);
                }
            })
                .catch(() => {});
        }
        load();
        const interval = setInterval(load, 10_000);
        return () => { cancelled = true; clearInterval(interval); };
    }, [selected?.file?.id]);

    if (!selected) {
        return (
            <div className="rp-placeholder" style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
                <div style={{ flexGrow: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center' }}>
                    <span className="rp-placeholder-icon">📄</span>
                    <span>Click a file to see details</span>
                </div>
                <div style={{ padding: '16px' }}>
                    <hr className="rp-divider" style={{ margin: '0 0 16px 0', borderColor: 'var(--border)' }} />
                    <div className="rp-section-title">Upload File</div>
                    <FileUpload onUploaded={() => window.dispatchEvent(new Event('files_updated'))} />
                </div>
            </div>
        );
    }

    const { file } = selected || {};

    if (!file) {
        return (
            <div className="rp-placeholder">
                <span className="rp-placeholder-icon">📄</span>
                <span>Select a file to see details</span>
            </div>
        );
    }

    function fmt(bytes) {
        if (!bytes) return '—';
        if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
        return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
    }

    function fmtDuration(s) {
        if (!s) return '—';
        const h = Math.floor(s / 3600);
        const m = Math.floor((s % 3600) / 60);
        return h > 0 ? `${h}h ${m}m` : `${m}m`;
    }

    function fmtFilament(mm) {
        if (!mm) return '—';
        return `${(mm / 1000).toFixed(1)} m`;
    }

    const dims = (file.max_x != null && file.min_x != null)
        ? `${(file.max_x - file.min_x).toFixed(1)} × ${(file.max_y - file.min_y).toFixed(1)} × ${(file.max_z - (file.min_z || 0)).toFixed(1)} mm`
        : file.max_z != null ? `H: ${(file.max_z - (file.min_z || 0)).toFixed(1)} mm`
            : null;

    return (
        <div className="rp-content" style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
            <div style={{ flexGrow: 1, overflowY: 'auto' }}>
                <h3 className="rp-title">File Details</h3>

                {file.has_thumbnail && (
                    <img
                        src={`/api/files/thumb/${file.filename}`}
                        alt="preview"
                        className="rp-file-thumb"
                    />
                )}

                <div className="rp-file-name">{file.display_name}</div>

                <div className="rp-stats-grid">
                    <div className="rp-stat-row">
                        <span className="rp-stat-label">Size</span>
                        <span className="rp-stat-value">{fmt(file.size_bytes)}</span>
                    </div>
                    {file.filament_type && (
                        <div className="rp-stat-row">
                            <span className="rp-stat-label">Material</span>
                            <span className="rp-stat-value">{file.filament_type}</span>
                        </div>
                    )}
                    {dims && (
                        <div className="rp-stat-row">
                            <span className="rp-stat-label">Dimensions</span>
                            <span className="rp-stat-value">{dims}</span>
                        </div>
                    )}
                    {file.sliced_for && (
                        <div className="rp-stat-row">
                            <span className="rp-stat-label">Target</span>
                            <span className="rp-stat-value">{file.sliced_for}</span>
                        </div>
                    )}
                </div>

                {stats ? (
                    <>
                        <div className="rp-section-title">Print History</div>
                        <div className="rp-stats-grid">
                            <div className="rp-stat-row">
                                <span className="rp-stat-label">Completed</span>
                                <span className="rp-stat-value rp-stat-highlight">{stats.print_count}</span>
                            </div>
                            {stats.cancelled_count > 0 && (
                                <div className="rp-stat-row">
                                    <span className="rp-stat-label">Cancelled</span>
                                    <span className="rp-stat-value" style={{ color: 'var(--text-muted)' }}>{stats.cancelled_count}</span>
                                </div>
                            )}
                            {stats.error_count > 0 && (
                                <div className="rp-stat-row">
                                    <span className="rp-stat-label">Failed</span>
                                    <span className="rp-stat-value" style={{ color: '#e53935' }}>{stats.error_count}</span>
                                </div>
                            )}
                            {stats.print_count > 0 && (
                                <>
                                    <div className="rp-stat-row">
                                        <span className="rp-stat-label">Total print time</span>
                                        <span className="rp-stat-value">{fmtDuration(stats.total_duration_s)}</span>
                                    </div>
                                    <div className="rp-stat-row">
                                        <span className="rp-stat-label">Filament used</span>
                                        <span className="rp-stat-value">{fmtFilament(stats.total_filament_mm)}</span>
                                    </div>
                                </>
                            )}
                        </div>
                    </>
                ) : (
                    <div className="rp-muted" style={{ marginBottom: '24px' }}>Not printed yet</div>
                )}
            </div>

            <div style={{ flexShrink: 0 }}>
                <hr className="rp-divider" style={{ margin: '16px 0', borderColor: 'var(--border)' }} />
                <div className="rp-section-title">Upload File</div>
                <FileUpload onUploaded={() => window.dispatchEvent(new Event('files_updated'))} />
            </div>
        </div>
    );
}
