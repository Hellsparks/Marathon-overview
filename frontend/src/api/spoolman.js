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

/** Consume filament from a spool by length (mm) or weight (g). Amount may be negative to add. */
export async function useFilament(spoolId, type, amount) {
    const body = type === 'length' ? { use_length: amount } : { use_weight: amount };
    const r = await fetch(`${API}/spool/${spoolId}/use`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
    });
    if (!r.ok) {
        const err = await r.json().catch(() => ({}));
        throw new Error(err.error || `HTTP ${r.status}`);
    }
    return r.json();
}

/** Set filament amount by measured gross weight of spool on a scale (g). */
export async function measureFilament(spoolId, weight) {
    const r = await fetch(`${API}/spool/${spoolId}/measure`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ weight }),
    });
    if (!r.ok) {
        const err = await r.json().catch(() => ({}));
        throw new Error(err.error || `HTTP ${r.status}`);
    }
    return r.json();
}

export async function getVendors() {
    const r = await fetch(`${API}/vendors`);
    if (!r.ok) throw new Error(`Failed to fetch vendors: ${r.status}`);
    return r.json();
}

export async function createVendor(data) {
    const r = await fetch(`${API}/vendors`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
    });
    if (!r.ok) {
        const err = await r.json().catch(() => ({}));
        throw new Error(err.error || `HTTP ${r.status}`);
    }
    return r.json();
}

export async function getFilaments() {
    const r = await fetch(`${API}/filaments`);
    if (!r.ok) throw new Error(`Failed to fetch filaments: ${r.status}`);
    return r.json();
}

export async function createFilament(data) {
    const r = await fetch(`${API}/filaments`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
    });
    if (!r.ok) {
        const err = await r.json().catch(() => ({}));
        throw new Error(err.error || `HTTP ${r.status}`);
    }
    return r.json();
}

export async function createSpool(data) {
    const r = await fetch(`${API}/spools`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
    });
    if (!r.ok) {
        const err = await r.json().catch(() => ({}));
        throw new Error(err.error || `HTTP ${r.status}`);
    }
    return r.json();
}

export async function getSpoolmanSettings() {
    const r = await fetch(`${API}/settings`);
    if (!r.ok) throw new Error(`Failed to fetch settings: ${r.status}`);
    return r.json();
}

export async function deleteSpool(id) {
    const r = await fetch(`${API}/spools/${id}`, { method: 'DELETE' });
    if (!r.ok) {
        const err = await r.json().catch(() => ({}));
        throw new Error(err.error || `HTTP ${r.status}`);
    }
    return r.json();
}

export async function getFields(entity) {
    const r = await fetch(`${API}/fields/${entity}`);
    if (!r.ok) throw new Error(`Failed to fetch fields: ${r.status}`);
    return r.json();
}

export async function updateFilament(id, data) {
    const r = await fetch(`${API}/filaments/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
    });
    if (!r.ok) {
        const err = await r.json().catch(() => ({}));
        throw new Error(err.error || `HTTP ${r.status}`);
    }
    return r.json();
}

export async function deleteFilament(id) {
    const r = await fetch(`${API}/filaments/${id}`, { method: 'DELETE' });
    if (!r.ok) {
        const err = await r.json().catch(() => ({}));
        throw new Error(err.error || `HTTP ${r.status}`);
    }
    return r.json();
}

export async function updateVendor(id, data) {
    const r = await fetch(`${API}/vendors/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
    });
    if (!r.ok) {
        const err = await r.json().catch(() => ({}));
        throw new Error(err.error || `HTTP ${r.status}`);
    }
    return r.json();
}

export async function deleteVendor(id) {
    const r = await fetch(`${API}/vendors/${id}`, { method: 'DELETE' });
    if (!r.ok) {
        const err = await r.json().catch(() => ({}));
        throw new Error(err.error || `HTTP ${r.status}`);
    }
    return r.json();
}

export async function getInventory() {
    const r = await fetch(`${API}/inventory`);
    if (!r.ok) throw new Error(`Failed to fetch inventory: ${r.status}`);
    return r.json();
}

export async function setInventoryTarget(filamentId, target_qty, min_qty) {
    const r = await fetch(`${API}/inventory/${filamentId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ target_qty, min_qty }),
    });
    if (!r.ok) {
        const err = await r.json().catch(() => ({}));
        throw new Error(err.error || `HTTP ${r.status}`);
    }
    return r.json();
}

export async function removeInventoryTarget(filamentId) {
    const r = await fetch(`${API}/inventory/${filamentId}`, { method: 'DELETE' });
    if (!r.ok) {
        const err = await r.json().catch(() => ({}));
        throw new Error(err.error || `HTTP ${r.status}`);
    }
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
