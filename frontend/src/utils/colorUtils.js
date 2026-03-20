/**
 * Builds the inline style object for a filament color swatch (circle or dot).
 * Handles single-color (#RRGGBB or #RRGGBBAA) and multi-color filaments.
 *
 * @param {object} filament - Spoolman filament object
 * @returns {object} React inline style
 */
export function buildColorStyle(filament) {
    const hexRaw = (filament?.color_hex || '888888').slice(0, 6);
    const multiHexes = filament?.multi_color_hexes;
    const direction = filament?.multi_color_direction;

    if (!multiHexes) {
        // Single color — use CSS var so checkerboard shows for translucent colors
        return { '--spool-color': `#${hexRaw}` };
    }

    const colors = multiHexes.split(',').map(h => `#${h.trim().slice(0, 6)}`).filter(h => h.length >= 4);
    if (colors.length === 0) return { '--spool-color': `#${hexRaw}` };
    if (colors.length === 1) return { '--spool-color': colors[0] };

    if (direction === 'coaxial') {
        // Equal pie-chart slices using conic-gradient
        const sliceDeg = 360 / colors.length;
        const stops = colors.map((c, i) =>
            `${c} ${(i * sliceDeg).toFixed(1)}deg ${((i + 1) * sliceDeg).toFixed(1)}deg`
        ).join(', ');
        return { background: `conic-gradient(${stops})`, borderRadius: '50%' };
    } else {
        // Longitudinal — equal horizontal hard-stop bands, shown as a rounded rectangle
        const stops = colors.flatMap((c, i) => {
            const a = `${(i / colors.length * 100).toFixed(1)}%`;
            const b = `${((i + 1) / colors.length * 100).toFixed(1)}%`;
            return [`${c} ${a}`, `${c} ${b}`];
        });
        return { background: `linear-gradient(to bottom, ${stops.join(', ')})`, borderRadius: '4px' };
    }
}

/**
 * Returns true if the filament has multiple colors defined.
 */
export function isMultiColor(filament) {
    if (!filament?.multi_color_hexes) return false;
    const colors = filament.multi_color_hexes.split(',').filter(h => h.trim().length > 0);
    return colors.length > 1;
}
