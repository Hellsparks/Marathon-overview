const BASE_URL = import.meta.env.VITE_API_URL || '';

export async function fetchSwatchStl(line1, line2, signal) {
    const res = await fetch(`${BASE_URL}/api/extras/swatch`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ line1, line2 }),
        signal,
    });
    if (!res.ok) {
        const err = await res.json().catch(() => ({ error: res.statusText }));
        throw new Error(err.error || `HTTP ${res.status}`);
    }
    return res.arrayBuffer();
}

export function makeSwatchFilename(f) {
    const parts = [f.material, f.vendor?.name, f.name || `swatch_${f.id}`].filter(Boolean);
    return parts.join(' ').replace(/[^\w\s-]/g, '').replace(/\s+/g, ' ').trim() + '.stl';
}

export function getSwatchLines(filament) {
    return {
        line1: [filament.vendor?.name, filament.material].filter(Boolean).join(' ').substring(0, 28),
        line2: (filament.name || '').substring(0, 20),
    };
}

export function downloadBuffer(buf, filename) {
    const url = URL.createObjectURL(new Blob([buf], { type: 'application/octet-stream' }));
    const a = document.createElement('a');
    a.href = url; a.download = filename; a.click();
    URL.revokeObjectURL(url);
}
