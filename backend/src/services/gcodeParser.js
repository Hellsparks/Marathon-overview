const fs = require('fs');
const path = require('path');
const readline = require('readline');

const UPLOADS_DIR = process.env.UPLOADS_DIR || path.join(__dirname, '../../uploads');

/**
 * Parse G-code metadata in two passes:
 * 1. Quick pass: read header (first 8 KB) + tail (last 64 KB) for slicer comments
 * 2. Full scan: stream through all G0/G1 moves to find actual bounding box
 *
 * Returns a Promise with { min_x, max_x, min_y, max_y, min_z, max_z, filament_type, estimated_time_s }
 */
async function parseGcodeFile(filename) {
    const filePath = path.join(UPLOADS_DIR, filename);
    if (!fs.existsSync(filePath)) return null;

    const fd = fs.openSync(filePath, 'r');
    const stat = fs.fstatSync(fd);

    // --- Pass 1: Quick header + tail for slicer comments ---
    const headBuf = Buffer.alloc(Math.min(8192, stat.size));
    fs.readSync(fd, headBuf, 0, headBuf.length, 0);
    const headStr = headBuf.toString('utf8');

    let tailStr = '';
    if (stat.size > 8192) {
        const tailSize = Math.min(65536, stat.size);
        const tailBuf = Buffer.alloc(tailSize);
        fs.readSync(fd, tailBuf, 0, tailSize, Math.max(0, stat.size - tailSize));
        tailStr = tailBuf.toString('utf8');
    }
    fs.closeSync(fd);

    const meta = {
        min_x: null, max_x: null,
        min_y: null, max_y: null,
        min_z: null, max_z: null,
        filament_type: null,
        estimated_time_s: null,
        sliced_for: null,
    };

    // Parse slicer comments from header
    parseComments(headStr, meta);
    // Parse slicer comments from tail (config block)
    parseComments(tailStr, meta);

    // --- Pass 2: Scan G-code moves for bounding box ---
    await scanMoves(filePath, meta);

    return meta;
}

/**
 * Extract metadata from slicer comment lines.
 */
function parseComments(text, meta) {
    for (const line of text.split('\n')) {
        const l = line.trim();
        if (!l.startsWith(';')) continue;
        const c = l.slice(1).trim();

        // Height: OrcaSlicer "max_z_height: 24.40" / PrusaSlicer "max_print_height = 24.6"
        matchFloat(c, /^max_z_height\s*[:=]\s*([\d.]+)/i, v => { meta.max_z = maxOf(meta.max_z, v); });
        matchFloat(c, /^max_print_height\s*[:=]\s*([\d.]+)/i, v => { meta.max_z = maxOf(meta.max_z, v); });

        // Cura bounding box: ";MAXX:219.883"
        matchFloat(c, /^MAXX\s*[:=]\s*([\d.]+)/i, v => { meta.max_x = maxOf(meta.max_x, v); });
        matchFloat(c, /^MINX\s*[:=]\s*([\d.]+)/i, v => { meta.min_x = minOf(meta.min_x, v); });
        matchFloat(c, /^MAXY\s*[:=]\s*([\d.]+)/i, v => { meta.max_y = maxOf(meta.max_y, v); });
        matchFloat(c, /^MINY\s*[:=]\s*([\d.]+)/i, v => { meta.min_y = minOf(meta.min_y, v); });
        matchFloat(c, /^MAXZ\s*[:=]\s*([\d.]+)/i, v => { meta.max_z = maxOf(meta.max_z, v); });
        matchFloat(c, /^MINZ\s*[:=]\s*([\d.]+)/i, v => { meta.min_z = minOf(meta.min_z, v); });

        // Filament type: "; filament_type = ASA;ASA;ASA"
        if (!meta.filament_type) {
            matchString(c, /^filament_type\s*=\s*(.+)/i, v => {
                const first = v.trim().split(/[;,]/)[0].trim();
                if (first && first.length < 30) meta.filament_type = first;
            });
        }

        // Estimated time
        if (!meta.estimated_time_s) {
            const timeMatch = c.match(/^estimated\s*printing\s*time.*=\s*(.+)/i);
            if (timeMatch) meta.estimated_time_s = parseTimeString(timeMatch[1]);
        }
        if (!meta.estimated_time_s) {
            matchFloat(c, /^estimated_?printing_?time(?:_?in_?seconds)?\s*=\s*([\d.]+)/i, v => {
                meta.estimated_time_s = Math.round(v);
            });
        }

        // Target Printer Model
        if (!meta.sliced_for) {
            matchString(c, /^(?:printer_model|machine_type|TargetMachine|FLAVOR)\s*[:=]\s*(.+)/i, v => {
                const model = v.trim().split(/[;,]/)[0].trim();
                // Strip out some common noisy prefixes/suffixes from slicers if desired
                if (model && model.length < 50) meta.sliced_for = model;
            });
        }
    }
}

/**
 * Stream through the G-code file and track X/Y/Z coordinates from G0/G1 moves.
 * Only updates bounding box values that weren't already found in slicer comments.
 * Skips travel-only moves by only tracking when extruding (E > 0).
 */
function scanMoves(filePath, meta) {
    return new Promise((resolve) => {
        const rl = readline.createInterface({
            input: fs.createReadStream(filePath, { encoding: 'utf8' }),
            crlfDelay: Infinity,
        });

        // Track current position (absolute mode, which is default)
        let curX = 0, curY = 0, curZ = 0;
        let hasExtrusion = false;      // seen at least one E move
        let scanMinX = Infinity, scanMaxX = -Infinity;
        let scanMinY = Infinity, scanMaxY = -Infinity;
        let scanMinZ = Infinity, scanMaxZ = -Infinity;
        let hasMoveData = false;

        // Regex to match G0/G1 lines
        const moveRegex = /^G[01]\s/i;
        const xRegex = /X([\d.+-]+)/i;
        const yRegex = /Y([\d.+-]+)/i;
        const zRegex = /Z([\d.+-]+)/i;
        const eRegex = /E([\d.+-]+)/i;

        rl.on('line', (line) => {
            const trimmed = line.trim();

            // Skip comments and empty lines
            if (!trimmed || trimmed.startsWith(';')) return;

            // Strip inline comments
            const cmd = trimmed.split(';')[0].trim();
            if (!moveRegex.test(cmd)) return;

            // Parse coordinates
            const xm = cmd.match(xRegex);
            const ym = cmd.match(yRegex);
            const zm = cmd.match(zRegex);
            const em = cmd.match(eRegex);

            if (xm) curX = parseFloat(xm[1]);
            if (ym) curY = parseFloat(ym[1]);
            if (zm) curZ = parseFloat(zm[1]);

            // Only count moves that extrude material (have positive E or we've seen extrusion)
            if (em) {
                const eVal = parseFloat(em[1]);
                if (eVal > 0) hasExtrusion = true;
            }

            // Track bounding box from extrusion moves (not just travel moves)
            if (hasExtrusion && (xm || ym)) {
                hasMoveData = true;
                if (curX < scanMinX) scanMinX = curX;
                if (curX > scanMaxX) scanMaxX = curX;
                if (curY < scanMinY) scanMinY = curY;
                if (curY > scanMaxY) scanMaxY = curY;
            }
            if (zm) {
                hasMoveData = true;
                if (curZ < scanMinZ) scanMinZ = curZ;
                if (curZ > scanMaxZ) scanMaxZ = curZ;
            }
        });

        rl.on('close', () => {
            if (hasMoveData) {
                // Only fill in values not already provided by slicer comments
                if (meta.min_x == null && scanMinX !== Infinity) meta.min_x = scanMinX;
                if (meta.max_x == null && scanMaxX !== -Infinity) meta.max_x = scanMaxX;
                if (meta.min_y == null && scanMinY !== Infinity) meta.min_y = scanMinY;
                if (meta.max_y == null && scanMaxY !== -Infinity) meta.max_y = scanMaxY;
                if (meta.min_z == null && scanMinZ !== Infinity) meta.min_z = scanMinZ;
                if (meta.max_z == null && scanMaxZ !== -Infinity) meta.max_z = scanMaxZ;
            }
            resolve();
        });

        rl.on('error', () => resolve()); // Don't fail the whole parse on stream error
    });
}

// --- Helpers ---
function matchFloat(comment, regex, cb) {
    const m = comment.match(regex);
    if (m) cb(parseFloat(m[1]));
}

function matchString(comment, regex, cb) {
    const m = comment.match(regex);
    if (m) cb(m[1]);
}

function maxOf(current, value) {
    return current == null ? value : Math.max(current, value);
}

function minOf(current, value) {
    return current == null ? value : Math.min(current, value);
}

function parseTimeString(str) {
    let total = 0;
    const d = str.match(/([\d.]+)\s*d/i);
    const h = str.match(/([\d.]+)\s*h/i);
    const m = str.match(/([\d.]+)\s*m/i);
    const s = str.match(/([\d.]+)\s*s/i);
    if (d) total += parseFloat(d[1]) * 86400;
    if (h) total += parseFloat(h[1]) * 3600;
    if (m) total += parseFloat(m[1]) * 60;
    if (s) total += parseFloat(s[1]);
    return total > 0 ? Math.round(total) : null;
}

module.exports = { parseGcodeFile };
