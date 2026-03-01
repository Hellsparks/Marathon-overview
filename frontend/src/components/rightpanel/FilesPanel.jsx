export default function FilesPanel({ selected }) {
    if (!selected) {
        return (
            <div className="rp-placeholder">
                <span className="rp-placeholder-icon">📄</span>
                <span>Click a file to see details</span>
            </div>
        );
    }

    const { file, stats } = selected;

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
        <div className="rp-content">
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
                            <span className="rp-stat-label">Times printed</span>
                            <span className="rp-stat-value rp-stat-highlight">{stats.print_count}</span>
                        </div>
                        <div className="rp-stat-row">
                            <span className="rp-stat-label">Total print time</span>
                            <span className="rp-stat-value">{fmtDuration(stats.total_duration_s)}</span>
                        </div>
                        <div className="rp-stat-row">
                            <span className="rp-stat-label">Filament used</span>
                            <span className="rp-stat-value">{fmtFilament(stats.total_filament_mm)}</span>
                        </div>
                        {stats.print_count > 1 && stats.total_duration_s && (
                            <div className="rp-stat-row">
                                <span className="rp-stat-label">Avg time</span>
                                <span className="rp-stat-value">{fmtDuration(stats.total_duration_s / stats.print_count)}</span>
                            </div>
                        )}
                    </div>
                </>
            ) : (
                <div className="rp-muted">Not printed yet</div>
            )}
        </div>
    );
}
