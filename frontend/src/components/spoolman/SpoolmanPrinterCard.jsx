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

const scrapedCssCache = new Map();

export default function SpoolmanPrinterCard({
    printer, activeSpool, isTarget, onDragOver, onDragLeave, onDrop, onClearSpool, printerStatus,
    // Bambu AMS props
    amsSlots, amsSpools, dropTargetTray, onTrayDragOver, onTrayDragLeave, onTrayDrop, onClearTray,
    // Multi-toolhead Moonraker props
    toolSlots, toolSlotSpools, dropTargetToolSlot, onToolSlotDragOver, onToolSlotDragLeave, onToolSlotDrop, onClearToolSlot,
    onToolSlotDragStart, isDragging,
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

    return (
        <div data-spoolman-printer-id={printer.id} style={{ display: 'contents' }}>
            {isIsolated && (
                <style>{cardDefaults}{scopedCss ?? ''}{cardPolyfill}</style>
            )}

            <div
                className={`printer-card v-card theme--dark${isIsolated ? ' isolated-theme' : ''} spoolman-printer-card${!isBambu && isTarget ? ' drop-hover' : ''}`}
                onDragOver={!isBambu ? onDragOver : undefined}
                onDragLeave={!isBambu ? onDragLeave : undefined}
                onDrop={!isBambu ? onDrop : undefined}
                style={{ cursor: isBambu ? 'default' : 'pointer', marginBottom: '12px' }}
            >
                <div className={`printer-card-header v-card__title${isBambu ? ' bambu-header' : ''}`}>
                    <h3 className="printer-name v-toolbar__title">{printer.name}</h3>
                    {isBambu && <span className="ams-badge">AMS</span>}
                </div>

                <div className="printer-card-body" style={{ padding: '0 16px 16px' }}>
                    {isBambu ? (
                        /* ── Bambu: 4-slot AMS layout ────────────────────── */
                        <div className="ams-slot-grid">
                            {[0, 1, 2, 3].map(trayId => {
                                const spoolId = amsSlots?.[trayId];
                                const spool = spoolId ? amsSpools?.[spoolId] : null;
                                const f = spool?.filament || {};
                                const color = f.color_hex ? `#${f.color_hex}` : null;

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
                    ) : (printer.toolhead_count || 1) > 1 ? (
                        /* ── Multi-toolhead: N-slot grid ─────────────────── */
                        <div className="ams-slot-grid" style={{ gridTemplateColumns: `repeat(${Math.min(printer.toolhead_count, 3)}, 1fr)` }}>
                            {Array.from({ length: printer.toolhead_count }, (_, i) => {
                                const spoolId = toolSlots?.[i];
                                const spool = spoolId ? toolSlotSpools?.[spoolId] : null;
                                const f = spool?.filament || {};
                                const color = f.color_hex ? `#${f.color_hex.slice(0, 6)}` : null;
                                const isSlotTarget = dropTargetToolSlot?.printerId === printer.id && dropTargetToolSlot?.toolIndex === i;
                                return (
                                    <div
                                        key={i}
                                        className={`ams-drop-slot${isSlotTarget ? ' ams-drop-hover' : ''}${spool ? ' ams-slot-filled' : ''}`}
                                        draggable={!!spool && !isDragging}
                                        onDragStart={spool ? (e) => {
                                            console.log('[Component] onDragStart fired', { spool, printerId: printer.id, toolIndex: i });
                                            onToolSlotDragStart?.(e, spool, printer.id, i);
                                        } : undefined}
                                        onDragEnd={(e) => console.log('[Component] onDragEnd', e.dataTransfer.dropEffect)}
                                        onDragEnter={e => e.preventDefault()}
                                        onDragOver={e => onToolSlotDragOver?.(e, printer.id, i)}
                                        onDragLeave={() => onToolSlotDragLeave?.()}
                                        onDrop={e => {
                                            console.log('[Component] onDrop fired', { printerId: printer.id, toolIndex: i });
                                            onToolSlotDrop?.(e, printer, i);
                                        }}
                                        style={{ cursor: spool ? 'grab' : 'default' }}
                                        onClick={() => spool && console.log('[Component] Slot clicked - draggable:', !!spool, 'handler:', !!onToolSlotDragStart)}
                                    >
                                        <div className="ams-slot-header">
                                            <span className="ams-slot-num">T{i}</span>
                                        </div>
                                        {spool ? (
                                            <>
                                                <div className="ams-slot-swatch" style={{ backgroundColor: color || '#888' }} />
                                                <span className="ams-slot-material">{f.material || '—'}</span>
                                                <span className="ams-slot-name">{f.name || `#${spool.id}`}</span>
                                                <button
                                                    className="ams-slot-clear"
                                                    onClick={e => { e.stopPropagation(); onClearToolSlot?.(printer.id, i); }}
                                                    onMouseDown={e => e.stopPropagation()}
                                                    title="Unload slot"
                                                >✕</button>
                                            </>
                                        ) : (
                                            <span className="ams-slot-empty">Drop spool</span>
                                        )}
                                    </div>
                                );
                            })}
                        </div>
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
