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

export async function createField(entity, data) {
    const r = await fetch(`${API}/fields/${entity}`, {
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

export async function validateImport(jsonData) {
    const r = await fetch(`${API}/import/validate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(jsonData),
    });
    if (!r.ok) {
        const err = await r.json().catch(() => ({}));
        throw new Error(err.error || `HTTP ${r.status}`);
    }
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

export async function setActiveSpool(printerId, spoolId, trayId) {
    const body = { printerId, spoolId };
    if (trayId !== undefined) body.trayId = trayId;
    const r = await fetch(`${API}/set-active`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
    });
    if (!r.ok) {
        const err = await r.json().catch(() => ({}));
        throw new Error(err.error || `Set active spool failed: ${r.status}`);
    }
    return r.json();
}

export async function getAmsSlots(printerId) {
    const r = await fetch(`${API}/ams-slots/${printerId}`);
    if (!r.ok) throw new Error(`Failed to fetch AMS slots: ${r.status}`);
    return r.json();
}

export async function getToolSlots(printerId) {
    const r = await fetch(`${API}/tool-slots/${printerId}`);
    if (!r.ok) throw new Error(`Failed to fetch tool slots: ${r.status}`);
    return r.json();
}

export async function setToolSlot(printerId, toolIndex, spoolId) {
    const r = await fetch(`${API}/tool-slots/${printerId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ toolIndex, spoolId }),
    });
    if (!r.ok) throw new Error(`Failed to set tool slot: ${r.status}`);
    return r.json();
}

export async function getBambuWarnings() {
    const r = await fetch(`${API}/bambu-warnings`);
    if (!r.ok) throw new Error(`Failed to fetch Bambu warnings: ${r.status}`);
    return r.json();
}

export async function dismissBambuWarning(spoolId) {
    const r = await fetch(`${API}/bambu-warnings/${spoolId}`, { method: 'DELETE' });
    if (!r.ok) throw new Error(`Failed to dismiss warning: ${r.status}`);
    return r.json();
}

/** Fetch vendor list with filament/spool counts for export selection. */
export async function getExportPreview() {
    const r = await fetch(`${API}/export/preview`);
    if (!r.ok) {
        const err = await r.json().catch(() => ({}));
        throw new Error(err.error || `HTTP ${r.status}`);
    }
    return r.json();
}

/** Download Spoolman data as a JSON file. Options: { filament_ids, vendor_ids, include_spools } */
export async function exportSpoolman(opts) {
    let r;
    if (opts && (opts.filament_ids?.length > 0 || opts.vendor_ids?.length > 0 || opts.include_spools === false)) {
        r = await fetch(`${API}/export`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(opts),
        });
    } else {
        r = await fetch(`${API}/export`);
    }
    if (!r.ok) {
        const err = await r.json().catch(() => ({}));
        throw new Error(err.error || `HTTP ${r.status}`);
    }
    const blob = await r.blob();
    const disposition = r.headers.get('content-disposition') || '';
    const match = disposition.match(/filename="([^"]+)"/);
    const filename = match ? match[1] : `spoolman-backup-${new Date().toISOString().slice(0, 10)}.json`;
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
}

/** Fetch exchange rate between two currencies. */
export async function getExchangeRate(from, to) {
    const r = await fetch(`${API}/exchange-rate?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`);
    if (!r.ok) {
        const err = await r.json().catch(() => ({}));
        throw new Error(err.error || `HTTP ${r.status}`);
    }
    return r.json();
}

/** Import (restore) Spoolman data from a parsed JSON object. */
export async function importSpoolman(jsonData) {
    const r = await fetch(`${API}/import`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(jsonData),
    });
    const body = await r.json();
    if (!r.ok) throw new Error(body.error || `HTTP ${r.status}`);
    return body;
}

/** Get the status of the managed Spoolman Docker container. */
export async function getDockerStatus() {
    const r = await fetch(`${API}/docker/status`);
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    return r.json();
}

/** Install and start the Spoolman Docker container. */
export async function installSpoolman(port = 7912) {
    const r = await fetch(`${API}/docker/install`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ port }),
        // Image pull can take a while
        signal: AbortSignal.timeout(300000),
    });
    const body = await r.json();
    if (!r.ok) throw new Error(body.error || `HTTP ${r.status}`);
    return body;
}

/** Stop the running Spoolman Docker container (keeps it installed). */
export async function stopSpoolman() {
    const r = await fetch(`${API}/docker/stop`, { method: 'POST' });
    const body = await r.json();
    if (!r.ok) throw new Error(body.error || `HTTP ${r.status}`);
    return body;
}

/** Start a stopped Spoolman Docker container. */
export async function startSpoolman() {
    const r = await fetch(`${API}/docker/start`, { method: 'POST' });
    const body = await r.json();
    if (!r.ok) throw new Error(body.error || `HTTP ${r.status}`);
    return body;
}

/** Stop and remove the Spoolman Docker container. */
export async function uninstallSpoolman(removeData = false) {
    const r = await fetch(`${API}/docker/uninstall?removeData=${removeData}`, { method: 'DELETE' });
    const body = await r.json();
    if (!r.ok) throw new Error(body.error || `HTTP ${r.status}`);
    return body;
}

// ── Native (Python venv) management ──────────────────────────────────────────

export async function getNativeStatus() {
    const r = await fetch(`${API}/native/status`);
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    return r.json();
}

export async function installNative(port = 7912) {
    const r = await fetch(`${API}/native/install`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ port }),
        signal: AbortSignal.timeout(600000), // pip install can be slow
    });
    const body = await r.json();
    if (!r.ok) throw new Error(body.error || `HTTP ${r.status}`);
    return body;
}

export async function startNative() {
    const r = await fetch(`${API}/native/start`, { method: 'POST' });
    const body = await r.json();
    if (!r.ok) throw new Error(body.error || `HTTP ${r.status}`);
    return body;
}

export async function stopNative() {
    const r = await fetch(`${API}/native/stop`, { method: 'POST' });
    const body = await r.json();
    if (!r.ok) throw new Error(body.error || `HTTP ${r.status}`);
    return body;
}

export async function uninstallNative(removeData = false) {
    const r = await fetch(`${API}/native/uninstall?removeData=${removeData}`, { method: 'DELETE' });
    const body = await r.json();
    if (!r.ok) throw new Error(body.error || `HTTP ${r.status}`);
    return body;
}

// ── Spool Storage management ─────────────────────────────────────────────────

/** Get the configured storage location name (default: "Storage"). */
export async function getStorageLocation() {
    const r = await fetch(`${API}/storage-location`);
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    return r.json(); // { storage_location: string }
}

/** Update the storage location name. */
export async function setStorageLocation(storage_location) {
    const r = await fetch(`${API}/storage-location`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ storage_location }),
    });
    const body = await r.json();
    if (!r.ok) throw new Error(body.error || `HTTP ${r.status}`);
    return body;
}

/** Fetch live weight reading from the Teamster load cell scale via the backend proxy. */
export async function fetchTeamsterWeight() {
    const r = await fetch('/api/spoolman/teamster/weight');
    if (!r.ok) {
        const err = await r.json().catch(() => ({}));
        throw new Error(err.error || `HTTP ${r.status}`);
    }
    return r.json(); // { weight_g, ready }
}

/** Test connectivity to the Teamster device. */
export async function testTeamsterConnection() {
    const r = await fetch('/api/spoolman/teamster/test');
    return r.json();
}

/** Zero the Teamster scale. */
export async function tareTeamster() {
    const r = await fetch('/api/spoolman/teamster/tare', { method: 'POST' });
    if (!r.ok) {
        const err = await r.json().catch(() => ({}));
        throw new Error(err.error || `HTTP ${r.status}`);
    }
    return r.json();
}

/** Calibrate the Teamster scale with a known weight in grams. */
export async function calibrateTeamster(grams) {
    const r = await fetch('/api/spoolman/teamster/calibrate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ grams }),
    });
    if (!r.ok) {
        const err = await r.json().catch(() => ({}));
        throw new Error(err.error || `HTTP ${r.status}`);
    }
    return r.json();
}

/** Partial-update a spool in Spoolman (e.g. set/clear location field). */
export async function patchSpool(id, data) {
    const r = await fetch(`${API}/spools/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
    });
    const body = await r.json();
    if (!r.ok) throw new Error(body.error || `HTTP ${r.status}`);
    return body;
}

// ── Swatch generator management ───────────────────────────────────────────────

/** Start a swatch Docker install (non-blocking). Poll getSwatchInstallStatus() for progress. */
export async function installSwatchDocker(port = 7321) {
    const r = await fetch(`${API}/swatch/install`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ port }),
    });
    const body = await r.json();
    if (!r.ok) throw new Error(body.error || `HTTP ${r.status}`);
    return body;
}

/** Poll progress of a swatch Docker install. */
export async function getSwatchInstallStatus() {
    const r = await fetch(`${API}/swatch/install-status`);
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    return r.json();
}

/** Remove the swatch Docker container. */
export async function uninstallSwatchDocker() {
    const r = await fetch(`${API}/swatch/uninstall`, { method: 'DELETE' });
    const body = await r.json();
    if (!r.ok) throw new Error(body.error || `HTTP ${r.status}`);
    return body;
}

/** Get the status of the local (uv) swatch service. */
export async function getSwatchLocalStatus() {
    const r = await fetch(`${API}/swatch/local/status`);
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    return r.json();
}

/** Start the local (uv) swatch service. */
export async function startSwatchLocal(port = 7321) {
    const r = await fetch(`${API}/swatch/local/start`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ port }),
    });
    const body = await r.json();
    if (!r.ok) throw new Error(body.error || `HTTP ${r.status}`);
    return body;
}

/** Stop the local (uv) swatch service. */
export async function stopSwatchLocal() {
    const r = await fetch(`${API}/swatch/local/stop`, { method: 'POST' });
    const body = await r.json();
    if (!r.ok) throw new Error(body.error || `HTTP ${r.status}`);
    return body;
}
