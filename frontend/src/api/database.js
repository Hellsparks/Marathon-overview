const API = '/api/database';

/** Trigger a download of the full Marathon SQLite database backup. */
export async function exportDatabase() {
    const r = await fetch(`${API}/export`);
    if (!r.ok) {
        const err = await r.json().catch(() => ({}));
        throw new Error(err.error || `HTTP ${r.status}`);
    }
    const blob = await r.blob();
    const disposition = r.headers.get('content-disposition') || '';
    const match = disposition.match(/filename="([^"]+)"/);
    const filename = match ? match[1] : `marathon-backup-${new Date().toISOString().slice(0, 10)}.zip`;
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
}

/** Upload a .db file and restore the Marathon database from it. */
export async function importDatabase(file) {
    const form = new FormData();
    form.append('database', file);
    const r = await fetch(`${API}/import`, { method: 'POST', body: form });
    const body = await r.json();
    if (!r.ok) throw new Error(body.error || `HTTP ${r.status}`);
    return body;
}
