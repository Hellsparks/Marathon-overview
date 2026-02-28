const API = '/api/spoolman';

export async function getSpools() {
    const r = await fetch(`${API}/spools`);
    if (!r.ok) throw new Error(`Spoolman fetch failed: ${r.status}`);
    return r.json();
}

export async function testConnection() {
    const r = await fetch(`${API}/test`);
    return r.json();
}

export async function setActiveSpool(printerId, spoolId) {
    const r = await fetch(`${API}/set-active`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ printerId, spoolId }),
    });
    if (!r.ok) throw new Error(`Set active spool failed: ${r.status}`);
    return r.json();
}
