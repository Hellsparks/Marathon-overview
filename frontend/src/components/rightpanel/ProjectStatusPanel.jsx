import React from 'react';

export default function ProjectStatusPanel({ project }) {
    if (!project) {
        return (
            <div className="rp-placeholder">
                <span className="rp-placeholder-icon">📋</span>
                <span>Select a project to see status</span>
            </div>
        );
    }

    const totalPlates = project.plates?.length || 0;
    const donePlates = project.plates?.filter(p => p.status === 'done')?.length || 0;
    const progress = totalPlates > 0 ? Math.round((donePlates / totalPlates) * 100) : 0;

    return (
        <div className="rp-content">
            <h3 className="rp-title">Project Status</h3>

            <div className="rp-file-name" style={{ marginBottom: '16px' }}>{project.name}</div>

            <div className="rp-stats-grid">
                <div className="rp-stat-row">
                    <span className="rp-stat-label">Progress</span>
                    <span className="rp-stat-value rp-stat-highlight">{progress}%</span>
                </div>
                <div className="rp-stat-row">
                    <span className="rp-stat-label">Plates</span>
                    <span className="rp-stat-value">{donePlates} / {totalPlates}</span>
                </div>
                {project.template_name && (
                    <div className="rp-stat-row">
                        <span className="rp-stat-label">Template</span>
                        <span className="rp-stat-value">{project.template_name}</span>
                    </div>
                )}
                <div className="rp-stat-row">
                    <span className="rp-stat-label">Created</span>
                    <span className="rp-stat-value">{new Date(project.created_at).toLocaleDateString()}</span>
                </div>
            </div>

            <div className="rp-weight-bar" style={{ marginTop: '16px', height: '10px' }}>
                <div
                    className="rp-weight-fill"
                    style={{
                        width: `${progress}%`,
                        backgroundColor: progress === 100 ? 'var(--success)' : 'var(--primary)'
                    }}
                />
            </div>

            {progress === 100 && (
                <div style={{
                    marginTop: '20px',
                    padding: '12px',
                    background: 'rgba(76, 175, 135, 0.1)',
                    border: '1px solid var(--success)',
                    borderRadius: '8px',
                    color: 'var(--success)',
                    fontSize: '13px',
                    textAlign: 'center',
                    fontWeight: 600
                }}>
                    Project Completed! 🎉
                </div>
            )}
        </div>
    );
}
