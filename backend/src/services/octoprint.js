// OctoPrint REST API client — normalizes responses to Marathon's internal status shape.
// Node.js 22+ has built-in fetch and FormData globals.

/**
 * Map OctoPrint state strings to Marathon's normalized state vocabulary.
 * OctoPrint states: Operational, Printing, Pausing, Paused, Resuming,
 *                   Cancelling, Finishing, Error, Offline, Offline after error,
 *                   Connecting, Opening serial connection
 */
function normalizeState(octoprintState) {
  switch (octoprintState) {
    case 'Printing':
    case 'Pausing':
    case 'Resuming':
      return 'printing';
    case 'Cancelling':
      return 'cancelling';
    case 'Finishing':
      // OctoPrint briefly enters "Finishing" before returning to "Operational".
      // Mapping to 'complete' here lets the poller detect the job-done transition.
      return 'complete';
    case 'Paused':
      return 'paused';
    case 'Error':
    case 'Offline':
    case 'Offline after error':
      return 'error';
    default:
      return 'standby'; // Operational, Connecting, etc.
  }
}

class OctoPrintClient {
  constructor(printer) {
    this.baseUrl = `http://${printer.host}:${printer.port}`;
    this.apiKey = printer.api_key;
  }

  _headers() {
    const h = { 'Content-Type': 'application/json' };
    if (this.apiKey) h['X-Api-Key'] = this.apiKey;
    return h;
  }

  async _get(path) {
    const r = await fetch(`${this.baseUrl}${path}`, {
      headers: this._headers(),
      signal: AbortSignal.timeout(5000),
    });
    if (!r.ok) throw new Error(`OctoPrint ${r.status} @ ${path}: ${r.statusText}`);
    return r.json();
  }

  async _post(path, body, timeoutMs = 10000) {
    const r = await fetch(`${this.baseUrl}${path}`, {
      method: 'POST',
      headers: this._headers(),
      body: body !== undefined ? JSON.stringify(body) : undefined,
      signal: AbortSignal.timeout(timeoutMs),
    });
    if (!r.ok) {
      const text = await r.text().catch(() => '');
      throw new Error(`OctoPrint ${r.status} @ ${path}: ${text}`);
    }
    // Some OctoPrint endpoints return 204 No Content
    const ct = r.headers.get('content-type') || '';
    if (ct.includes('application/json')) return r.json();
    return null;
  }

  /**
   * Returns a normalized status object matching the Moonraker shape used by
   * the poller and frontend.
   */
  async getStatus() {
    // Both calls in parallel to minimise latency
    const [printerData, jobData] = await Promise.all([
      this._get('/api/printer'),
      this._get('/api/job'),
    ]);

    const rawState = jobData.state || printerData?.state?.text || 'Operational';
    const state = normalizeState(rawState);

    const progress = jobData.progress?.completion != null
      ? jobData.progress.completion / 100
      : 0;
    const filename = jobData.job?.file?.name || '';
    const printDuration = jobData.progress?.printTime ?? 0;

    return {
      print_stats: {
        state,
        filename,
        print_duration: printDuration,
        total_duration: printDuration,
        filament_used: 0, // OctoPrint doesn't expose live filament usage via REST
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
        temperature: printerData?.temperature?.tool0?.actual ?? 0,
        target: printerData?.temperature?.tool0?.target ?? 0,
      },
      heater_bed: {
        temperature: printerData?.temperature?.bed?.actual ?? 0,
        target: printerData?.temperature?.bed?.target ?? 0,
      },
    };
  }

  /**
   * Start printing a file that has already been uploaded to OctoPrint.
   * Uses the "select and print" command.
   */
  async startPrint(filename) {
    return this._post(`/api/files/local/${encodeURIComponent(filename)}`, {
      command: 'select',
      print: true,
    });
  }

  async pausePrint() {
    return this._post('/api/job', { command: 'pause', action: 'pause' });
  }

  async resumePrint() {
    return this._post('/api/job', { command: 'pause', action: 'resume' });
  }

  async cancelPrint() {
    return this._post('/api/job', { command: 'cancel' });
  }

  async sendGcode(script) {
    return this._post('/api/printer/command', { commands: script.split('\n').filter(Boolean) }, 180000);
  }

  async uploadFile(filename, fileBuffer) {
    const form = new FormData();
    form.append('file', new Blob([fileBuffer]), filename);
    // Don't set Content-Type manually — fetch sets it with the correct boundary

    const headers = {};
    if (this.apiKey) headers['X-Api-Key'] = this.apiKey;

    const r = await fetch(`${this.baseUrl}/api/files/local`, {
      method: 'POST',
      headers,
      body: form,
      signal: AbortSignal.timeout(120000),
    });
    if (!r.ok) {
      const text = await r.text().catch(() => '');
      throw new Error(`OctoPrint upload failed (${r.status}): ${text}`);
    }
    return r.json();
  }

  // OctoPrint does not have a native job queue compatible with Moonraker's model
  async getQueue() { return { queued_jobs: [], queue_state: 'ready' }; }
  async addToQueue() { throw new Error('Job queue not supported on OctoPrint printers'); }
  async removeFromQueue() { throw new Error('Job queue not supported on OctoPrint printers'); }
  async startQueue() { throw new Error('Job queue not supported on OctoPrint printers'); }

  // OctoPrint has no Klipper-style macros
  async getMacros() { return []; }

  // Webcam: OctoPrint exposes webcams via the webcam plugin; fall back to auto-guess in control.js
  async getWebcams() { return []; }

  // No Spoolman integration on OctoPrint
  async getActiveSpoolId() { return null; }
}

module.exports = OctoPrintClient;
