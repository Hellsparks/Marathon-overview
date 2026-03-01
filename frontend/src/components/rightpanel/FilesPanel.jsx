import FileUpload from '../files/FileUpload';

export default function FilesPanel({ selected }) {
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
