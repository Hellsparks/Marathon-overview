export default function TemplateCard({ template, filaments, onEdit, onDelete }) {
    // Badges for what filaments/colors are used
    const renderSlots = () => {
        if (!template.color_slots || template.color_slots.length === 0) return null;
        return (
            <div className="file-card-badges" style={{ flexWrap: 'wrap', gap: '4px' }}>
                {template.color_slots.map(slot => {
                    // Try to find the associated filament from Spoolman
                    const filament = filaments?.find(f => f.id === slot.pref_filament_id);

                    // Fallback to explicit hex if available, otherwise Spoolman filament hex, otherwise default
                    let hexValue = 'var(--surface2)';
                    if (slot.pref_hex) {
                        hexValue = slot.pref_hex.startsWith('#') ? slot.pref_hex : `#${slot.pref_hex}`;
                    } else if (filament && filament.color_hex) {
                        hexValue = filament.color_hex.startsWith('#') ? filament.color_hex : `#${filament.color_hex}`;
                    }

                    // Material text if available from Spoolman
                    let materialText = filament && filament.material ? filament.material : '';

                    // Fallback to parsed G-code metadata
                    if (!materialText && template.plates) {
                        const platesUsingSlot = template.plates.filter(p => p.slot_keys.includes(slot.slot_key));
                        const fallbackPlate = platesUsingSlot.find(p => p.filament_type);
                        if (fallbackPlate) {
                            materialText = fallbackPlate.filament_type;
                        }
                    }

                    return (
                        <div
                            key={slot.id}
                            title={slot.label || slot.slot_key}
                            style={{
                                display: 'flex',
                                alignItems: 'center',
                                gap: '6px',
                                padding: '2px 8px',
                                borderRadius: '12px',
                                backgroundColor: 'var(--surface)',
                                border: '1px solid var(--border)',
                                fontSize: '11px',
                                color: 'var(--text-muted)'
                            }}
                        >
                            <span
                                style={{
                                    display: 'inline-block',
                                    width: '10px',
                                    height: '10px',
                                    borderRadius: '50%',
                                    backgroundColor: hexValue,
                                    boxShadow: '0 0 0 1px rgba(255,255,255,0.1)'
                                }}
                            />
                            {materialText ? (
                                <span className={`badge badge-filament filament-${materialText}`} style={{ padding: '0px 6px', fontSize: '10px' }}>
                                    {materialText}
                                </span>
                            ) : null}
                            <span style={{ fontWeight: 500 }}>{slot.label || slot.slot_key}</span>
                        </div>
                    );
                })}
            </div>
        );
    };

    return (
        <div className="file-card">
            <div className="file-card-thumb-wrap" style={{ backgroundColor: 'var(--surface2)' }}>
                {template.thumbnail_path ? (
                    <img
                        className="file-card-thumb"
                        src={`/api/templates/thumb/${template.thumbnail_path.split('/').pop()}`}
                        alt={template.name}
                    />
                ) : (
                    <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1" strokeLinecap="round" strokeLinejoin="round" style={{ color: 'var(--text-muted)' }}>
                        <rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect>
                        <path d="M3 9h18"></path>
                        <path d="M9 21V9"></path>
                    </svg>
                )}
            </div>

            <button
                className="spool-adjust-btn"
                style={{ zIndex: 10, backgroundColor: 'var(--surface2)', color: 'var(--primary)', borderColor: 'var(--border)', opacity: 1 }}
                onClick={(e) => { e.stopPropagation(); onEdit(); }}
                title="Edit Template"
            >
                ⚙
            </button>
            <button
                className="spool-delete-btn"
                style={{ zIndex: 10, backgroundColor: 'color-mix(in srgb, var(--danger) 15%, var(--surface2))', color: 'var(--danger)', borderColor: 'var(--danger)', opacity: 1 }}
                onClick={(e) => { e.stopPropagation(); onDelete(); }}
                title="Delete Template"
            >
                🗑
            </button>

            <div className="file-card-body">
                <div className="file-card-title" title={template.name}>
                    {template.name}
                </div>
                <div className="file-card-metrics" style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                    <span>{template.plate_count} Plate{template.plate_count !== 1 && 's'}</span>
                    <span>{new Date(template.created_at).toLocaleDateString()}</span>
                </div>
                {renderSlots()}
            </div>
        </div>
    );
}
