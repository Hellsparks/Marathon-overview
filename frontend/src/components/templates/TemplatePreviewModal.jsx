import { useState } from 'react';

export default function TemplatePreviewModal({ template, filaments, onClose, onEdit }) {
    if (!template) return null;

    const formatTime = (seconds) => {
        if (!seconds) return 'Unknown';
        const h = Math.floor(seconds / 3600);
        const m = Math.floor((seconds % 3600) / 60);
        if (h > 0) return `${h}h ${m}m`;
        return `${m}m`;
    };

    const totalTime = template.plates?.reduce((acc, p) => acc + (p.estimated_time_s || 0), 0) || 0;

    // Calculate filament usage per slot (type + color)
    const usageBySlot = {};
    template.plates?.forEach(p => {
        const slotKey = p.slot_keys?.[0] || '1'; // Default to first slot if missing
        const slot = template.color_slots?.find(s => s.slot_key === slotKey);

        if (!usageBySlot[slotKey]) {
            usageBySlot[slotKey] = {
                type: p.filament_type || 'Filament',
                weight: 0,
                color: slot?.pref_hex || 'cccccc',
                label: slot?.label || `Slot ${slotKey}`
            };
        }
        usageBySlot[slotKey].weight += (p.filament_usage_g || 0);
    });

    return (
        <div className="template-preview-overlay" onClick={onClose}>
            <div
                className="template-preview-content"
                onClick={e => e.stopPropagation()}
                style={{ position: 'relative', overflowY: 'auto', maxHeight: '90vh' }}
            >
                {/* Header Section with Template Thumbnail Backdrop */}
                <div style={{ position: 'relative', height: '180px', overflow: 'hidden', borderRadius: '20px 20px 0 0' }}>
                    {template.thumbnail_path ? (
                        <img
                            src={`/api/templates/thumb/${template.thumbnail_path.split('/').pop()}`}
                            alt={template.name}
                            style={{ width: '100%', height: '100%', objectFit: 'cover', opacity: 0.3, filter: 'blur(4px)' }}
                        />
                    ) : (
                        <div style={{ width: '100%', height: '100%', background: 'linear-gradient(45deg, var(--surface), var(--surface2))' }} />
                    )}
                    <div style={{
                        position: 'absolute',
                        bottom: 0,
                        left: 0,
                        right: 0,
                        padding: '24px',
                        background: 'linear-gradient(to top, var(--surface), transparent)',
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'flex-end'
                    }}>
                        <div>
                            <h1 style={{ margin: 0, fontSize: '28px', fontWeight: 700, color: 'var(--text)' }}>{template.name}</h1>
                            {template.description && <p style={{ margin: '4px 0 0 0', color: 'var(--text-muted)', fontSize: '14px' }}>{template.description}</p>}
                        </div>
                        <div style={{ display: 'flex', gap: '8px' }}>
                            <button className="btn btn-primary" onClick={() => { onEdit(); onClose(); }}>Edit Template</button>
                            <button className="btn btn-outline" onClick={onClose}>Close</button>
                        </div>
                    </div>
                </div>

                <div style={{ padding: '24px' }}>
                    {/* Summary Stats */}
                    <div style={{
                        display: 'grid',
                        gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))',
                        gap: '16px',
                        marginBottom: '32px'
                    }}>
                        <div className="card" style={{ padding: '12px', textAlign: 'center', background: 'var(--surface2)', border: '1px solid var(--border)' }}>
                            <div style={{ fontSize: '11px', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '4px' }}>Print Time</div>
                            <div style={{ fontSize: '18px', fontWeight: 700 }}>{formatTime(totalTime)}</div>
                        </div>
                        <div className="card" style={{ padding: '12px', textAlign: 'center', background: 'var(--surface2)', border: '1px solid var(--border)' }}>
                            <div style={{ fontSize: '11px', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '4px' }}>Plate Count</div>
                            <div style={{ fontSize: '18px', fontWeight: 700 }}>{template.plates?.length || 0} Plates</div>
                        </div>
                        {Object.entries(usageBySlot).map(([slotKey, data]) => (
                            <div key={slotKey} className="card" style={{ padding: '12px', textAlign: 'center', background: 'var(--surface2)', border: '1px solid var(--border)' }}>
                                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px', marginBottom: '4px' }}>
                                    <span style={{
                                        width: '10px',
                                        height: '10px',
                                        borderRadius: '50%',
                                        backgroundColor: data.color.startsWith('#') ? data.color : `#${data.color}`,
                                        border: '1px solid rgba(255,255,255,0.2)'
                                    }}></span>
                                    <div style={{ fontSize: '11px', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                                        {data.label}
                                    </div>
                                </div>
                                <div style={{ fontSize: '18px', fontWeight: 700 }}>
                                    {Math.round(data.weight)}g <span style={{ fontSize: '12px', opacity: 0.6, fontWeight: 400 }}>({data.type})</span>
                                </div>
                            </div>
                        ))}
                    </div>

                    <h3 style={{ marginBottom: '16px', fontSize: '18px' }}>Plates & Requirements</h3>

                    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                        {template.plates?.map((plate, idx) => (
                            <div
                                key={plate.id}
                                className="template-preview-plate-card"
                            >
                                {/* Plate Thumbnail */}
                                <div style={{
                                    width: '100px',
                                    height: '100px',
                                    borderRadius: '8px',
                                    background: 'var(--bg)',
                                    overflow: 'hidden',
                                    border: '1px solid var(--border)',
                                    flexShrink: 0
                                }}>
                                    {plate.has_thumbnail ? (
                                        <img
                                            src={`/api/templates/thumb/${encodeURIComponent(plate.filename)}.png`}
                                            alt={plate.display_name}
                                            style={{ width: '100%', height: '100%', objectFit: 'contain' }}
                                        />
                                    ) : (
                                        <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-muted)', fontSize: '24px' }}>
                                            📦
                                        </div>
                                    )}
                                </div>

                                <div style={{ flex: 1 }}>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                                        <h4 style={{ margin: 0 }}>{plate.display_name || `Plate ${idx + 1}`}</h4>
                                        <div className="badge badge-info">{plate.sliced_for || 'Generic Printer'}</div>
                                    </div>

                                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginTop: '12px' }}>
                                        <div>
                                            <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>Print Time</div>
                                            <div style={{ fontSize: '13px', fontWeight: 500 }}>{formatTime(plate.estimated_time_s)}</div>
                                        </div>
                                        <div>
                                            <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>Filament Selection</div>
                                            <div style={{ display: 'flex', gap: '4px', alignItems: 'center' }}>
                                                {plate.slot_keys?.map(key => {
                                                    const slot = template.color_slots?.find(s => s.slot_key === key);
                                                    const filament = filaments?.find(f => f.id === slot?.pref_filament_id);
                                                    const color = slot?.pref_hex || filament?.color_hex || 'cccccc';
                                                    return (
                                                        <div
                                                            key={key}
                                                            title={slot?.label || key}
                                                            style={{
                                                                width: '14px',
                                                                height: '14px',
                                                                borderRadius: '50%',
                                                                backgroundColor: color.startsWith('#') ? color : `#${color}`,
                                                                border: '1px solid rgba(255,255,255,0.2)'
                                                            }}
                                                        />
                                                    );
                                                })}
                                            </div>
                                        </div>
                                        <div>
                                            <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>Usage (Length / Weight)</div>
                                            <div style={{ fontSize: '13px', fontWeight: 500 }}>
                                                {plate.filament_usage_mm ? `${(plate.filament_usage_mm / 1000).toFixed(1)}m` : '-'}
                                                {plate.filament_usage_g ? ` / ${plate.filament_usage_g.toFixed(1)}g` : ''}
                                            </div>
                                        </div>
                                        <div>
                                            <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>Material</div>
                                            <div style={{ marginTop: '2px' }}>
                                                {plate.filament_type ? (
                                                    <span className={`badge badge-filament filament-${plate.filament_type}`} style={{ padding: '0px 6px', fontSize: '10px' }}>
                                                        {plate.filament_type}
                                                    </span>
                                                ) : <span style={{ fontSize: '13px' }}>—</span>}
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            </div>
        </div>
    );
}
