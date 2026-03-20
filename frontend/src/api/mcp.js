const BASE = '/api/mcp';

export async function getMcpStatus() {
    const res = await fetch(`${BASE}/status`);
    if (!res.ok) throw new Error(await res.text());
    return res.json();
}

export async function startMcp(port, marathonUrl) {
    const res = await fetch(`${BASE}/start`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ port, marathonUrl }),
    });
    if (!res.ok) throw new Error((await res.json()).error || await res.text());
    return res.json();
}

export async function stopMcp() {
    const res = await fetch(`${BASE}/stop`, { method: 'POST' });
    if (!res.ok) throw new Error((await res.json()).error || await res.text());
    return res.json();
}
