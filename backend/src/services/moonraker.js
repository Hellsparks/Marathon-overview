// Node.js 22+ has built-in fetch and FormData globals — no imports needed.

class MoonrakerClient {
  constructor(printer) {
    this.baseUrl = `http://${printer.host}:${printer.port}`;
    this.apiKey = printer.api_key;
  }

  _headers() {
    const h = { 'Content-Type': 'application/json' };
    if (this.apiKey) h['X-Api-Key'] = this.apiKey;
    return h;
  }

  async getStatus() {
    const url = `${this.baseUrl}/printer/objects/query` +
      `?print_stats&display_status&virtual_sdcard&extruder&heater_bed&toolhead&idle_timeout`;
    const r = await fetch(url, {
      headers: this._headers(),
      signal: AbortSignal.timeout(5000),
    });
    if (!r.ok) throw new Error(`Moonraker ${r.status}: ${r.statusText}`);
    const data = await r.json();
    return data.result.status;
  }

  async startPrint(filename) {
    return this._post('/printer/print/start', { filename });
  }

  async pausePrint() {
    return this._post('/printer/print/pause');
  }

  async resumePrint() {
    return this._post('/printer/print/resume');
  }

  async cancelPrint() {
    return this._post('/printer/print/cancel');
  }

  async getQueue() {
    const r = await fetch(`${this.baseUrl}/server/job_queue/status`, {
      headers: this._headers(),
      signal: AbortSignal.timeout(5000),
    });
    if (!r.ok) throw new Error(`Moonraker queue ${r.status}`);
    return (await r.json()).result;
  }

  async addToQueue(filenames) {
    return this._post('/server/job_queue/job', { filenames });
  }

  async removeFromQueue(jobIds) {
    const params = jobIds.map(id => `job_ids[]=${encodeURIComponent(id)}`).join('&');
    const r = await fetch(`${this.baseUrl}/server/job_queue/job?${params}`, {
      method: 'DELETE',
      headers: this._headers(),
      signal: AbortSignal.timeout(5000),
    });
    if (!r.ok) throw new Error(`Moonraker remove-queue ${r.status}`);
    return (await r.json()).result;
  }

  async startQueue() {
    return this._post('/server/job_queue/start');
  }

  // Long timeout — gcode commands like G28 and QUAD_GANTRY_LEVEL can take 2+ minutes
  async sendGcode(script) {
    return this._post('/printer/gcode/script', { script }, 180000);
  }

  async getWebcams() {
    const r = await fetch(`${this.baseUrl}/server/webcams/list`, {
      headers: this._headers(),
      signal: AbortSignal.timeout(5000),
    });
    if (!r.ok) throw new Error(`Moonraker webcams ${r.status}`);
    return (await r.json()).result.webcams ?? [];
  }

  async getMacros() {
    const r = await fetch(`${this.baseUrl}/printer/objects/list`, {
      headers: this._headers(),
      signal: AbortSignal.timeout(5000),
    });
    if (!r.ok) throw new Error(`Moonraker objects list ${r.status}`);
    const data = await r.json();
    const objects = data.result?.objects || [];
    return objects
      .filter(obj => obj.startsWith('gcode_macro '))
      .map(obj => obj.replace('gcode_macro ', ''));
  }

  async uploadFile(filename, fileBuffer) {
    const form = new FormData();
    form.append('file', new Blob([fileBuffer]), filename);
    form.append('root', 'gcodes');

    const headers = {};
    if (this.apiKey) headers['X-Api-Key'] = this.apiKey;
    // Do NOT set Content-Type manually — built-in fetch sets it with the correct boundary

    const r = await fetch(`${this.baseUrl}/server/files/upload`, {
      method: 'POST',
      headers,
      body: form,
      signal: AbortSignal.timeout(120000),
    });
    if (!r.ok) {
      const text = await r.text().catch(() => '');
      throw new Error(`Moonraker upload failed (${r.status}): ${text}`);
    }
    return (await r.json()).item;
  }

  async _post(path, body, timeoutMs = 10000) {
    const r = await fetch(`${this.baseUrl}${path}`, {
      method: 'POST',
      headers: this._headers(),
      body: body ? JSON.stringify(body) : undefined,
      signal: AbortSignal.timeout(timeoutMs),
    });
    if (!r.ok) {
      const text = await r.text().catch(() => '');
      throw new Error(`Moonraker ${r.status} @ ${path}: ${text}`);
    }
    return (await r.json()).result;
  }
}

module.exports = MoonrakerClient;
