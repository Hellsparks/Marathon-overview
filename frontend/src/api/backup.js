const API = '/api/backup';

export async function getBackupStatus() {
    const r = await fetch(`${API}/status`);
    if (!r.ok) throw new Error(await r.text());
    return r.json();
}

export async function runBackup(target = 'all') {
    const r = await fetch(`${API}/run`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ target }),
    });
    return r.json();
}

export async function deleteBackup(filename) {
    const r = await fetch(`${API}/${encodeURIComponent(filename)}`, { method: 'DELETE' });
    return r.json();
}
