// Duet Web Control (DWC3 / RepRapFirmware 3) API client.
// Normalizes responses to Marathon's internal status shape.
// Node.js 22+ has built-in fetch globals.
//
// Authentication: RepRapFirmware uses a session key obtained via
// GET /machine/connect?password=<password>. Sessions expire after ~8 s of
// inactivity so we refresh on 401/403. The session key is cached at module
// level keyed by host:port to survive across the short poll intervals.

// Module-level session cache: "host:port" → { key, refreshedAt }
const sessionCache = new Map();
const SESSION_TTL_MS = 6000; // refresh proactively before the 8 s server timeout

/**
 * Map RepRapFirmware status strings to Marathon's normalized state vocabulary.
 * RRF states: idle, printing, pausing, paused, resuming, cancelling,
 *             processing, simulating, busy, changingTool, halted
 */
function normalizeState(rrfStatus) {
  switch (rrfStatus) {
    case 'printing':
    case 'pausing':
    case 'resuming':
    case 'processing':
    case 'simulating':
    case 'busy':
    case 'changingTool':
      return 'printing';
    case 'cancelling':
      return 'cancelling';
    case 'paused':
      return 'paused';
    case 'halted':
      return 'error';
    default:
      return 'standby'; // 'idle', unrecognised
  }
}

class DuetClient {
  constructor(printer) {
    this.printer = printer;
    this.baseUrl = `http://${printer.host}:${printer.port}`;
    this.apiKey = printer.api_key; // treated as the DWC password
    this._cacheKey = `${printer.host}:${printer.port}`;
  }

  // --- Session management ---

  async _obtainSessionKey() {
    const password = this.apiKey || 'reprap'; // default Duet password
    const r = await fetch(
      `${this.baseUrl}/machine/connect?password=${encodeURIComponent(password)}`,
      { signal: AbortSignal.timeout(5000) }
    );
    if (!r.ok) throw new Error(`Duet connect failed (${r.status}): ${r.statusText}`);
    const data = await r.json();
    const key = data.sessionKey;
    if (!key) throw new Error('Duet connect returned no sessionKey');
    sessionCache.set(this._cacheKey, { key, refreshedAt: Date.now() });
    return key;
  }

  async _sessionKey() {
    const cached = sessionCache.get(this._cacheKey);
    if (cached && Date.now() - cached.refreshedAt < SESSION_TTL_MS) return cached.key;
    return this._obtainSessionKey();
  }

  _authHeaders(sessionKey) {
    return sessionKey ? { 'X-Session-Key': sessionKey } : {};
  }

  // --- HTTP helpers ---

  async _get(path) {
    // Try without auth first; if the board has no password this avoids an
    // extra /machine/connect round-trip.
    if (!this.apiKey) {
      const r = await fetch(`${this.baseUrl}${path}`, {
        signal: AbortSignal.timeout(5000),
      });
      if (r.ok) return r.json();
      if (r.status !== 401 && r.status !== 403) {
        throw new Error(`Duet ${r.status} @ ${path}: ${r.statusText}`);
      }
      // Fall through to session-auth path
    }

    const key = await this._sessionKey();
    const r = await fetch(`${this.baseUrl}${path}`, {
      headers: this._authHeaders(key),
      signal: AbortSignal.timeout(5000),
    });

    if (r.status === 401 || r.status === 403) {
      // Session expired — refresh once and retry
      sessionCache.delete(this._cacheKey);
      const newKey = await this._obtainSessionKey();
      const r2 = await fetch(`${this.baseUrl}${path}`, {
        headers: this._authHeaders(newKey),
        signal: AbortSignal.timeout(5000),
      });
      if (!r2.ok) throw new Error(`Duet ${r2.status} @ ${path}: ${r2.statusText}`);
      return r2.json();
    }

    if (!r.ok) throw new Error(`Duet ${r.status} @ ${path}: ${r.statusText}`);
    return r.json();
  }

  /**
   * Send a G-code command string via POST /machine/code.
   * RepRapFirmware expects the body to be the raw G-code text.
   */
  async _code(gcode, timeoutMs = 10000) {
    const makeRequest = (headers) =>
      fetch(`${this.baseUrl}/machine/code`, {
        method: 'POST',
        headers: { ...headers, 'Content-Type': 'text/plain' },
        body: gcode,
        signal: AbortSignal.timeout(timeoutMs),
      });

    let r;
    if (!this.apiKey) {
      r = await makeRequest({});
    } else {
      const key = await this._sessionKey();
      r = await makeRequest(this._authHeaders(key));
      if (r.status === 401 || r.status === 403) {
        sessionCache.delete(this._cacheKey);
        const newKey = await this._obtainSessionKey();
        r = await makeRequest(this._authHeaders(newKey));
      }
    }

    if (!r.ok) {
      const text = await r.text().catch(() => '');
      throw new Error(`Duet gcode failed (${r.status}): ${text}`);
    }
    return r.text(); // RRF returns the command response as plain text
  }

  // --- Status ---

  async getStatus() {
    const data = await this._get('/machine/status');

    const rrfStatus = data.state?.status ?? 'idle';
    const state = normalizeState(rrfStatus);

    // Extract bed temperature: heat.beds[0] → heaters array index
    const bedHeaterIdx = data.heat?.beds?.[0]?.heaters?.[0] ?? 0;
    const bedHeater = data.heat?.heaters?.[bedHeaterIdx] ?? {};

    // Extract first tool's first heater temperature
    const toolHeaterIdx = data.heat?.tools?.[0]?.heaters?.[0]
      ?? data.tools?.[0]?.heaters?.[0]
      ?? 1;
    const toolHeater = data.heat?.heaters?.[toolHeaterIdx] ?? {};

    const job = data.job ?? {};
    const filename = job.file?.fileName ?? job.lastFileName ?? '';
    const duration = job.duration ?? 0;

    // Progress: filePosition / file.size if available
    const fileSize = job.file?.size ?? 0;
    const filePos = job.filePosition ?? 0;
    const progress = fileSize > 0 ? filePos / fileSize : 0;

    return {
      print_stats: {
        state,
        filename,
        print_duration: duration,
        total_duration: duration,
        filament_used: 0, // RRF reports per-extruder extrusion; not easily normalized here
      },
      display_status: {
        progress,
        message: '',
      },
      virtual_sdcard: {
        progress,
        is_active: state === 'printing',
      },
      extruder: {
        temperature: toolHeater.current ?? 0,
        target: toolHeater.active ?? 0,
      },
      heater_bed: {
        temperature: bedHeater.current ?? 0,
        target: bedHeater.active ?? 0,
      },
    };
  }

  // --- Print control ---

  // Duet: select and start a file via M32
  async startPrint(filename) {
    return this._code(`M32 "${filename}"`);
  }

  async pausePrint() {
    return this._code('M25');
  }

  async resumePrint() {
    return this._code('M24');
  }

  // M0 = Emergency Stop / cancel print in RRF
  async cancelPrint() {
    return this._code('M0');
  }

  async sendGcode(script) {
    return this._code(script, 180000);
  }

  // --- File upload ---

  async uploadFile(filename, fileBuffer) {
    const makeRequest = (headers) =>
      fetch(`${this.baseUrl}/machine/file/gcodes/${encodeURIComponent(filename)}`, {
        method: 'PUT',
        headers: { ...headers, 'Content-Type': 'application/octet-stream' },
        body: fileBuffer,
        signal: AbortSignal.timeout(120000),
      });

    let r;
    if (!this.apiKey) {
      r = await makeRequest({});
    } else {
      const key = await this._sessionKey();
      r = await makeRequest(this._authHeaders(key));
      if (r.status === 401 || r.status === 403) {
        sessionCache.delete(this._cacheKey);
        const newKey = await this._obtainSessionKey();
        r = await makeRequest(this._authHeaders(newKey));
      }
    }

    if (!r.ok) {
      const text = await r.text().catch(() => '');
      throw new Error(`Duet upload failed (${r.status}): ${text}`);
    }
    return { filename };
  }

  // --- Unsupported features ---

  async getQueue() { return { queued_jobs: [], queue_state: 'ready' }; }
  async addToQueue() { throw new Error('Job queue not supported on Duet printers'); }
  async removeFromQueue() { throw new Error('Job queue not supported on Duet printers'); }
  async startQueue() { throw new Error('Job queue not supported on Duet printers'); }

  async getMacros() { return []; }
  async getWebcams() { return []; }
  async getActiveSpoolId() { return null; }
}

module.exports = DuetClient;
