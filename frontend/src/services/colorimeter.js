/**
 * Web Serial API service for the TD1 USB colorimeter (CircuitPython device).
 *
 * TD1 serial output (key line):
 *   3205354246,,,,6.6,2B446F
 *   CSV: <device_id>,,,,<TD_float>,<HEX_6chars>
 *
 * Also emits intermediate display lines during a scan:
 *   display, 2B446F, 74, 20   ← hex color
 *   display, 6.6, 74, 5       ← TD value
 *
 * Exports:
 *   isSupported()        — true in Chrome/Edge (Web Serial API required)
 *   getStatus()          — 'disconnected' | 'connecting' | 'connected' | 'error'
 *   getLastReading()     — { hex, td } | null
 *   connect(baudRate)    — prompts port picker, opens connection
 *   disconnect()         — closes port
 *   onStatus(cb)         — subscribe to status changes; returns unsubscribe fn
 *   onLine(cb)           — subscribe to raw text lines; returns unsubscribe fn
 *   onReading(cb)        — subscribe to parsed { hex, td } readings; returns unsubscribe fn
 *   parseReading(line)   — parse one line → { hex, td } | null
 */

let port = null;
let readerRef = null;
let statusValue = 'disconnected';
let lastReading = null;

const lineListeners    = new Set();
const statusListeners  = new Set();
const readingListeners = new Set();

export function isSupported() {
    return typeof navigator !== 'undefined' && 'serial' in navigator;
}

export function getStatus() { return statusValue; }
export function getLastReading() { return lastReading; }

function setStatus(s) {
    statusValue = s;
    for (const cb of statusListeners) cb(s);
}

function emitLine(line) {
    for (const cb of lineListeners) cb(line);
    const reading = parseReading(line);
    if (reading) {
        lastReading = reading;
        for (const cb of readingListeners) cb(reading);
    }
}

export function onStatus(cb) {
    statusListeners.add(cb);
    cb(statusValue);
    return () => statusListeners.delete(cb);
}

export function onLine(cb) {
    lineListeners.add(cb);
    return () => lineListeners.delete(cb);
}

export function onReading(cb) {
    readingListeners.add(cb);
    return () => readingListeners.delete(cb);
}

export async function connect(baudRate = 115200) {
    if (!isSupported()) throw new Error('Web Serial API not supported — use Chrome or Edge');
    if (statusValue === 'connected' || statusValue === 'connecting') return;
    setStatus('connecting');
    try {
        port = await navigator.serial.requestPort();
        await port.open({ baudRate });
        setStatus('connected');
        _startReading();
    } catch (err) {
        port = null;
        setStatus('error');
        throw err;
    }
}

export async function disconnect() {
    if (readerRef) {
        try { await readerRef.cancel(); } catch { /* ignore */ }
        readerRef = null;
    }
    if (port) {
        try { await port.close(); } catch { /* ignore */ }
        port = null;
    }
    setStatus('disconnected');
}

function _startReading() {
    if (!port?.readable) return;
    const decoder = new TextDecoderStream();
    port.readable.pipeTo(decoder.writable).catch(() => { });
    const reader = decoder.readable.getReader();
    readerRef = reader;
    let buffer = '';
    (async () => {
        try {
            while (true) {
                const { value, done } = await reader.read();
                if (done) break;
                buffer += value;
                const parts = buffer.split(/\r?\n/);
                buffer = parts.pop() ?? '';
                for (const part of parts) {
                    const line = part.trim();
                    if (line) emitLine(line);
                }
            }
        } catch { /* port closed */ } finally {
            readerRef = null;
            if (port) { try { await port.close(); } catch { } port = null; }
            setStatus('disconnected');
        }
    })();
}

/**
 * Parse a raw serial line into { hex: 'RRGGBB', td: number|null } or null.
 *
 * Priority order:
 *  1. TD1 CSV result line:  3205354246,,,,6.6,2B446F
 *  2. TD1 display line:     display, 2B446F, 74, 20  /  display, 6.6, 74, 5
 *  3. Labeled:              HEX:FF0000 TD:25.3
 *  4. JSON:                 {"hex":"FF0000","td":25.3}
 *  5. R:G:B components
 *  6. Bare hex [+ td]
 */
export function parseReading(line) {
    if (!line) return null;

    // 1. TD1 CSV: <id>,,,,<td>,<hex6>  (exactly 6 comma-separated fields, last is 6-char hex)
    const csvParts = line.split(',');
    if (csvParts.length === 6) {
        const maybeHex = csvParts[5].trim();
        const maybeTd  = csvParts[4].trim();
        if (/^[0-9A-Fa-f]{6}$/.test(maybeHex)) {
            return { hex: maybeHex.toUpperCase(), td: maybeTd ? parseFloat(maybeTd) : null };
        }
    }

    // 2. TD1 display line: "display, 2B446F, 74, 20"  (hex at position 1 of comma-list, 6 chars no #)
    //    or "display, 6.6, 74, 5"  (TD value — only hex triggers a reading)
    if (line.toLowerCase().startsWith('display,')) {
        const parts = line.split(',').map(s => s.trim());
        if (parts.length >= 2 && /^[0-9A-Fa-f]{6}$/.test(parts[1])) {
            return { hex: parts[1].toUpperCase(), td: null };
        }
        return null; // display line but not a hex value — skip
    }

    // 3. JSON
    if (line.startsWith('{')) {
        try {
            const obj = JSON.parse(line);
            const rawHex = (obj.hex ?? obj.color ?? obj.HEX ?? obj.COLOR ?? '').replace('#', '');
            const td = obj.td ?? obj.TD ?? obj.transmission ?? null;
            if (/^[0-9A-Fa-f]{6}$/.test(rawHex))
                return { hex: rawHex.toUpperCase(), td: td !== null ? parseFloat(td) : null };
        } catch { /* not JSON */ }
    }

    // 4. Labeled: HEX:FF0000 TD:25.3
    const labeled = line.match(/(?:hex|color)[:\s]+#?([0-9A-Fa-f]{6}).*?(?:td|t)[:\s]+(\d+(?:\.\d+)?)/i);
    if (labeled) return { hex: labeled[1].toUpperCase(), td: parseFloat(labeled[2]) };

    // 5. R:G:B components
    const rgb = line.match(/R[:\s]+(\d+).*G[:\s]+(\d+).*B[:\s]+(\d+)/i);
    if (rgb) {
        const r = parseInt(rgb[1]).toString(16).padStart(2, '0');
        const g = parseInt(rgb[2]).toString(16).padStart(2, '0');
        const b = parseInt(rgb[3]).toString(16).padStart(2, '0');
        const tdM = line.match(/(?:td|t)[:\s]+(\d+(?:\.\d+)?)/i);
        return { hex: `${r}${g}${b}`.toUpperCase(), td: tdM ? parseFloat(tdM[1]) : null };
    }

    // 6. Bare hex [+ optional td]
    const bare = line.match(/^#?([0-9A-Fa-f]{6})(?:\s+(\d+(?:\.\d+)?))?$/);
    if (bare) return { hex: bare[1].toUpperCase(), td: bare[2] !== undefined ? parseFloat(bare[2]) : null };

    return null;
}
