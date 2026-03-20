const API = '/api/settings';

export async function getSettings() {
    const r = await fetch(API);
    if (!r.ok) throw new Error(`Settings fetch failed: ${r.status}`);
    return r.json();
}

export async function updateSetting(key, value) {
    const r = await fetch(API, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ key, value }),
    });
    if (!r.ok) throw new Error(`Settings update failed: ${r.status}`);
    return r.json();
}
