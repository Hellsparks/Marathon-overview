const fetch = (...args) => import('node-fetch').then(({ default: f }) => f(...args));
const FormData = require('form-data');

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

  async uploadFile(filename, fileBuffer) {
    const form = new FormData();
    form.append('file', fileBuffer, { filename });
    form.append('root', 'gcodes');

    const headers = form.getHeaders();
    if (this.apiKey) headers['X-Api-Key'] = this.apiKey;

    const r = await fetch(`${this.baseUrl}/server/files/upload`, {
      method: 'POST',
      headers,
      body: form,
      signal: AbortSignal.timeout(120000), // 2 min for large files
    });
    if (!r.ok) {
      const body = await r.text().catch(() => '');
      throw new Error(`Moonraker upload failed (${r.status}): ${body}`);
    }
    return (await r.json()).item;
  }

  async _post(path, body) {
    const r = await fetch(`${this.baseUrl}${path}`, {
      method: 'POST',
      headers: this._headers(),
      body: body ? JSON.stringify(body) : undefined,
      signal: AbortSignal.timeout(10000),
    });
    if (!r.ok) {
      const body = await r.text().catch(() => '');
      throw new Error(`Moonraker ${r.status} @ ${path}: ${body}`);
    }
    return (await r.json()).result;
  }
}

module.exports = MoonrakerClient;
