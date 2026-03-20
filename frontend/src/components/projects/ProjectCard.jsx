export default function ProjectCard({ project, onClick, onDelete }) {
    const progress = project.total_plates > 0
        ? Math.round((project.completed_plates / project.total_plates) * 100)
        : 0;

    return (
        <div className="file-card template-card-clickable" onClick={onClick}>
            <div className="file-card-thumb-wrap" style={{ backgroundColor: 'var(--surface2)' }}>
                {project.thumbnail_path ? (
                    <img
                        className="file-card-thumb"
                        src={`/api/templates/thumb/${project.thumbnail_path.split('/').pop()}`}
                        alt={project.name}
                    />
                ) : (
                    <div className="file-card-icon">📁</div>
                )}
            </div>

            <button
                className="spool-delete-btn"
                style={{ zIndex: 10, backgroundColor: 'color-mix(in srgb, var(--danger) 15%, var(--surface2))', color: 'var(--danger)', borderColor: 'var(--danger)', opacity: 1 }}
                onClick={(e) => { e.stopPropagation(); onDelete(); }}
                title="Delete Project"
            >
                🗑
            </button>

            <div className="file-card-info" style={{ padding: '16px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                    <div style={{ flex: 1 }}>
                        <div className="file-card-name" style={{ fontSize: '15px', fontWeight: 600, lineHeight: 1.2 }}>{project.name}</div>
                        <div className="file-card-meta" style={{ fontSize: '12px', opacity: 0.8, marginTop: '2px' }}>
                            {project.completed_plates} / {project.total_plates} Plates Done
                        </div>
                    </div>
                    {project.template_id && (
                        <div className="badge badge-outline" style={{ opacity: 0.6 }}>Template</div>
                    )}
                </div>

                <div className="progress-bar-wrap" style={{ marginTop: '4px' }}>
                    <div className="progress-bar-track" style={{ height: '6px' }}>
                        <div
                            className="progress-bar-fill"
                            style={{ width: `${progress}%`, transition: 'width 0.4s ease' }}
                        />
                    </div>
                </div>

                <div className="file-card-badges" style={{ flexWrap: 'wrap', gap: '4px' }}>
                    {project.assignments?.map((a, i) => (
                        <div
                            key={i}
                            title={`${a.material} - ${a.color_hex}`}
                            style={{
                                width: '10px',
                                height: '10px',
                                borderRadius: '50%',
                                backgroundColor: a.color_hex || 'var(--surface2)',
                                border: '1px solid rgba(255,255,255,0.1)'
                            }}
                        />
                    ))}
                </div>
            </div>
        </div>
    );
}
