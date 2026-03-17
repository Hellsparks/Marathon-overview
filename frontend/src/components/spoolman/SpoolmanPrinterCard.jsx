import { useState, useEffect } from 'react';

function scopeCSS(css, scope) {
    css = css.replace(/\/\*[\s\S]*?\*\//g, '');
    css = css.replace(/@import\s+url\(\s*['"][^'"]*['"]\s*\)\s*;/gi, '');
    css = css.replace(/@import\s+url\(\s*[^)]*\)\s*;/gi, '');
    css = css.replace(/@import\s+['"][^'"]*['"]\s*;/gi, '');
    css = css.replace(/@import\s[^;]+;/gi, '');
    const out = [];
    let pos = 0;
    while (pos < css.length) {
        const ws = css.slice(pos).match(/^\s+/);
        if (ws) { pos += ws[0].length; continue; }
        const brace = css.indexOf('{', pos);
        if (brace === -1) break;
        const sel = css.slice(pos, brace).trim();
        let depth = 1, j = brace + 1;
        while (j < css.length && depth > 0) {
            if (css[j] === '{') depth++;
            else if (css[j] === '}') depth--;
            j++;
        }
        const body = css.slice(brace + 1, j - 1);
        pos = j;

        if (/^@(keyframes|font-face|charset)/i.test(sel)) {
            out.push(`${sel}{${body}}`);
        } else if (/^@(media|supports|layer)/i.test(sel)) {
            out.push(`${sel}{${scopeCSS(body, scope)}}`);
        } else {
            const ROOT_RE = /^(:root|body|html|\.v-application|\.v-theme--dark|\.v-theme--light|\.v-locale--is-ltr)/;
            const REPLACE_RE = /(:root\b|body\b|html\b|\.v-application\b|\.v-theme--dark\b|\.v-theme--light\b|\.v-locale--is-ltr\b)/g;
            const scoped = sel.split(',').map(s => {
                s = s.trim();
                if (!s) return '';
                if (ROOT_RE.test(s)) {
                    return s.replace(REPLACE_RE, scope);
                }
                return `${scope} ${s}`;
            }).filter(Boolean).join(',');
            out.push(`${scoped}{${body}}`);
        }
    }
    return out.join('');
}

// Build a flat slot array from MMU assignments
// e.g. T0 with 10-slot Tradrack + T1 with 10-slot Tradrack = 20 slots
// Labels: T0:1, T0:2, ..., T0:10, T1:1, T1:2, ..., T1:10
function buildMmuSlotLayout(mmuAssignments) {
    const slots = [];
    const sorted = [...mmuAssignments].sort((a, b) => a.tool_index - b.tool_index);
    for (const mmu of sorted) {
        for (let s = 0; s < mmu.slot_count; s++) {
            slots.push({
                slotIndex: slots.length,
                label: `T${mmu.tool_index}:${s + 1}`,
                toolIndex: mmu.tool_index,
                mmuSlot: s,
            });
        }
    }
    return slots;
}

function renderSlot(slotIndex, label, printer, toolSlots, toolSlotSpools, dropTargetToolSlot, onToolSlotDragOver, onToolSlotDragLeave, onToolSlotDrop, onToolSlotDragStart, onClearToolSlot) {
    const spoolId = toolSlots?.[slotIndex];
    const spool = spoolId ? toolSlotSpools?.[spoolId] : null;
    const f = spool?.filament || {};
    const color = f.color_hex ? `#${f.color_hex.slice(0, 6)}` : null;
    const isSlotTarget = dropTargetToolSlot?.printerId === printer.id && dropTargetToolSlot?.toolIndex === slotIndex;
    return (
        <div
            key={slotIndex}
            className={`ams-drop-slot${isSlotTarget ? ' ams-drop-hover' : ''}${spool ? ' ams-slot-filled' : ''}`}
            onDragEnter={e => { e.preventDefault(); e.stopPropagation(); }}
            onDragOver={e => { e.preventDefault(); e.stopPropagation(); e.dataTransfer.dropEffect = 'move'; onToolSlotDragOver?.(e, printer.id, slotIndex); }}
            onDragLeave={() => onToolSlotDragLeave?.()}
            onDrop={e => { e.preventDefault(); e.stopPropagation(); onToolSlotDrop?.(e, printer, slotIndex); }}
        >
            <div className="ams-slot-header">
                <span className="ams-slot-num">{label}</span>
            </div>
            {spool ? (
                <>
                    <div
                        className="ams-slot-drag-overlay"
                        draggable
                        onDragStart={e => {
                            e.stopPropagation();
                            onToolSlotDragStart?.(e, printer.id, slotIndex, spool);
                        }}
                    />
                    <div className="ams-slot-swatch" style={{ backgroundColor: color || '#888' }} />
                    <span className="ams-slot-material">{f.material || '—'}</span>
                    <span className="ams-slot-name">{f.name || `#${spool.id}`}</span>
                    <button
                        className="ams-slot-clear"
                        onClick={e => { e.stopPropagation(); onClearToolSlot?.(printer.id, slotIndex); }}
                        title="Unload slot"
                    >✕</button>
                </>
            ) : (
                <span className="ams-slot-empty">Drop spool</span>
            )}
        </div>
    );
}

const scrapedCssCache = new Map();

export default function SpoolmanPrinterCard({
    printer, activeSpool, isTarget, onDragOver, onDragLeave, onDrop, onClearSpool, printerStatus,
    // Bambu AMS props
    amsSlots, amsSpools, dropTargetTray, onTrayDragOver, onTrayDragLeave, onTrayDrop, onClearTray,
    // Multi-toolhead / MMU Moonraker props
    mmuAssignments = [],
    toolSlots, toolSlotSpools, dropTargetToolSlot, onToolSlotMouseDown, onToolSlotDragOver, onToolSlotDragLeave, onToolSlotDrop, onToolSlotDragStart, onClearToolSlot,
}) {
    const [scrapedCss, setScrapedCss] = useState(
        () => scrapedCssCache.get(`${printer.host}:${printer.port}`) || null
    );

    useEffect(() => {
        if (printer.theme_mode !== 'scrape') return;
        const cacheKey = `${printer.host}:${printer.port}`;
        if (scrapedCssCache.has(cacheKey)) {
            setScrapedCss(scrapedCssCache.get(cacheKey));
            return;
        }
        fetch('/api/printers/scrape-theme', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ host: printer.host, port: printer.port }),
        })
            .then(r => r.json())
            .then(d => {
                if (d.css) {
                    scrapedCssCache.set(cacheKey, d.css);
                    setScrapedCss(d.css);
                }
            })
            .catch(() => { });
    }, [printer.host, printer.port, printer.theme_mode]);

    const cardSel = `[data-spoolman-printer-id="${printer.id}"]`;
    const scopedCss = scrapedCss ? scopeCSS(scrapedCss, cardSel) : null;
    const rawCss = scopedCss || '';

    const cardDefaults = `
${cardSel} .spoolman-printer-card, ${cardSel} .printer-card {
    --card-glow: none;
    --card-glow-active: none;
    background: var(--surface) !important;
    border-color: var(--border) !important;
    color: var(--text) !important;
}
`;

    const hasV2 = rawCss && /--v-primary-base\s*:/i.test(rawCss);
    const hasV3 = rawCss && /--v-theme-primary\s*:/i.test(rawCss);

    const vPrimary = hasV2 ? 'var(--v-primary-base)' : hasV3 ? 'rgb(var(--v-theme-primary))' : 'var(--primary)';
    const vSurface = hasV2 ? 'var(--v-sheet-bg-color)' : hasV3 ? 'rgb(var(--v-theme-surface))' : 'var(--surface)';
    const vText = hasV2 ? 'var(--v-theme-on-surface)' : hasV3 ? 'rgb(var(--v-theme-on-surface))' : 'var(--text)';

    const cardPolyfill = rawCss ? `
${cardSel} {
    --card-primary:  ${vPrimary};
    --card-surface:  ${vSurface};
    --card-text:     ${vText};
}
${cardSel} .spoolman-printer-card, ${cardSel} .printer-card {
    --primary:    var(--card-primary);
    --surface:    var(--card-surface);
    --text:       var(--card-text);
    --card-glow: none;
    background:   var(--card-surface) !important;
    color:        var(--card-text) !important;
}
` : null;

    const isIsolated = !!rawCss;
    const isBambu = printer.firmware_type === 'bambu';

    // Build slot layout from MMU assignments or fall back to toolhead_count
    // Also check actual toolSlots keys — backend returns MMU-aware slot count even before frontend MMU data loads
    const hasMmu = mmuAssignments.length > 0;
    const toolSlotKeys = Object.keys(toolSlots || {}).length;
    const slotLayout = hasMmu
        ? buildMmuSlotLayout(mmuAssignments)
        : toolSlotKeys > (printer.toolhead_count || 1)
            // Backend returned more slots than toolhead_count — MMU data not yet loaded, use slot keys
            ? Array.from({ length: toolSlotKeys }, (_, i) => ({ slotIndex: i, label: `S${i + 1}`, toolIndex: 0 }))
            : (printer.toolhead_count || 1) > 1
                ? Array.from({ length: printer.toolhead_count }, (_, i) => ({ slotIndex: i, label: `T${i}`, toolIndex: i }))
                : toolSlotKeys > 1
                    ? Array.from({ length: toolSlotKeys }, (_, i) => ({ slotIndex: i, label: `S${i + 1}`, toolIndex: 0 }))
                    : null;
    const totalSlotCount = slotLayout ? slotLayout.length : 0;

    return (
        <div data-spoolman-printer-id={printer.id} style={{ display: 'contents' }}>
            {isIsolated && (
                <style>{cardDefaults}{scopedCss ?? ''}{cardPolyfill}</style>
            )}

            <div
                className={`printer-card v-card theme--dark${isIsolated ? ' isolated-theme' : ''} spoolman-printer-card${!isBambu && !slotLayout && isTarget ? ' drop-hover' : ''}`}
                onDragOver={!isBambu && !slotLayout ? onDragOver : undefined}
                onDragLeave={!isBambu && !slotLayout ? onDragLeave : undefined}
                onDrop={!isBambu && !slotLayout ? onDrop : undefined}
                style={{ cursor: isBambu || slotLayout ? 'default' : 'pointer', marginBottom: '12px' }}
            >
                <div className={`printer-card-header v-card__title${isBambu ? ' bambu-header' : ''}`}>
                    <h3 className="printer-name v-toolbar__title">{printer.name}</h3>
                    {isBambu && <span className="ams-badge">AMS</span>}
                    {!isBambu && hasMmu && <span className="ams-badge" style={{ background: 'var(--primary, #4a9eff)', color: '#fff' }}>{totalSlotCount} slots</span>}
                </div>

                <div className="printer-card-body" style={{ padding: '0 16px 16px' }}>
                    {isBambu ? (
                        /* ── Bambu: 4-slot AMS layout ────────────────────── */
                        <div className="ams-slot-grid">
                            {[0, 1, 2, 3].map(trayId => {
                                const spoolId = amsSlots?.[trayId];
                                const spool = spoolId ? amsSpools?.[spoolId] : null;
                                const f = spool?.filament || {};
                                const color = f.color_hex ? `#${f.color_hex.slice(0, 6)}` : null;

                                const physicalTray = printerStatus?._bambu?.ams?.ams?.[0]?.tray?.find(t => parseInt(t.id, 10) === trayId);
                                const hasPhysical = !!(physicalTray && physicalTray.tray_color);
                                const physicalColor = hasPhysical ? `#${physicalTray.tray_color.slice(0, 6)}` : null;

                                const isTrayTarget = dropTargetTray?.printerId === printer.id && dropTargetTray?.trayId === trayId;
                                return (
                                    <div
                                        key={trayId}
                                        className={`ams-drop-slot${isTrayTarget ? ' ams-drop-hover' : ''}${(spool || hasPhysical) ? ' ams-slot-filled' : ''}`}
                                        onDragOver={e => onTrayDragOver?.(e, printer.id, trayId)}
                                        onDragLeave={() => onTrayDragLeave?.()}
                                        onDrop={e => onTrayDrop?.(e, printer, trayId)}
                                    >
                                        <div className="ams-slot-header">
                                            <span className="ams-slot-num">{trayId + 1}</span>
                                        </div>
                                        {spool ? (
                                            <>
                                                <div
                                                    className="ams-slot-swatch"
                                                    style={{ backgroundColor: color || '#888' }}
                                                />
                                                <span className="ams-slot-material">{f.material || '—'}</span>
                                                <span className="ams-slot-name">{f.name || `#${spool.id}`}</span>
                                                <button
                                                    className="ams-slot-clear"
                                                    onClick={e => { e.stopPropagation(); onClearTray?.(printer.id, trayId); }}
                                                    title="Unload slot"
                                                >✕</button>
                                            </>
                                        ) : hasPhysical ? (
                                            <>
                                                <div
                                                    className="ams-slot-swatch"
                                                    style={{ backgroundColor: physicalColor || '#888' }}
                                                />
                                                <span className="ams-slot-material" style={{ color: 'var(--text-muted)' }}>{physicalTray.tray_type || '—'}</span>
                                                <span className="ams-slot-name" style={{ fontStyle: 'italic', fontSize: '11px', color: 'var(--text-muted)' }}>MQTT Status</span>
                                                <span className="ams-slot-empty" style={{ opacity: 0.5, fontSize: '10px', marginTop: '4px' }}>Drop spool to assign</span>
                                            </>
                                        ) : (
                                            <span className="ams-slot-empty">Drop spool</span>
                                        )}
                                    </div>
                                );
                            })}
                        </div>
                    ) : slotLayout ? (
                        /* ── Multi-slot grid (MMU or multi-toolhead) ──────── */
                        hasMmu ? (
                            /* Grouped by toolhead — each MMU gets its own labeled section */
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                                {mmuAssignments.map(m => {
                                    const groupSlots = slotLayout.filter(s => s.toolIndex === m.tool_index);
                                    return (
                                        <div key={m.tool_index}>
                                            <div style={{
                                                fontSize: '11px', fontWeight: 600, padding: '4px 8px',
                                                background: 'var(--surface2, rgba(255,255,255,0.05))',
                                                borderRadius: '4px 4px 0 0', borderBottom: '1px solid var(--border)',
                                                color: 'var(--text-muted)',
                                            }}>
                                                T{m.tool_index} — {m.mmu_name}
                                            </div>
                                            <div className="ams-slot-grid" style={{
                                                gridTemplateColumns: `repeat(${Math.min(m.slot_count, 5)}, 1fr)`,
                                                borderRadius: '0 0 4px 4px',
                                            }}>
                                                {groupSlots.map(({ slotIndex, mmuSlot }) => renderSlot(slotIndex, mmuSlot + 1, printer, toolSlots, toolSlotSpools, dropTargetToolSlot, onToolSlotDragOver, onToolSlotDragLeave, onToolSlotDrop, onToolSlotDragStart, onClearToolSlot))}
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        ) : (
                            /* Plain multi-toolhead without MMU */
                            <div className="ams-slot-grid" style={{ gridTemplateColumns: `repeat(${Math.min(totalSlotCount, 4)}, 1fr)` }}>
                                {slotLayout.map(({ slotIndex, label }) => renderSlot(slotIndex, label, printer, toolSlots, toolSlotSpools, dropTargetToolSlot, onToolSlotDragOver, onToolSlotDragLeave, onToolSlotDrop, onToolSlotDragStart, onClearToolSlot))}
                            </div>
                        )
                    ) : (
                        /* ── Single-toolhead: active spool display ────────── */
                        activeSpool ? (
                            <div className="spool-info" style={{ margin: 0 }}>
                                <span
                                    className="spool-color-dot"
                                    style={{ '--spool-color': `#${activeSpool.color_hex || '888'}` }}
                                />
                                <span className="spool-details" style={{ flex: 1, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                    <span className="spool-material">{activeSpool.material}</span>
                                    {' '}
                                    {activeSpool.filament_name}
                                </span>
                                <button
                                    className="btn-link"
                                    onClick={(e) => { e.stopPropagation(); onClearSpool(); }}
                                    title="Unload spool"
                                    style={{ fontSize: '12px', padding: 0 }}
                                >
                                    ✕ Unload
                                </button>
                                <div className="spool-weight-bar" style={{ marginTop: '8px', gridColumn: 'span 3', justifySelf: 'stretch', width: '100%' }}>
                                    <div
                                        className="spool-weight-fill"
                                        style={{
                                            width: `${Math.min(100, (activeSpool.remaining_weight / activeSpool.initial_weight) * 100)}%`,
                                            backgroundColor: `#${activeSpool.color_hex || '888'}`,
                                        }}
                                    />
                                </div>
                            </div>
                        ) : (
                            <span className="text-muted" style={{ fontStyle: 'italic', fontSize: '13px' }}>No spool loaded</span>
                        )
                    )}
                </div>
            </div>
        </div>
    );
}
