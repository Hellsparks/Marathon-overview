/**
 * BambuLab LAN Developer Mode — thin client class.
 *
 * Status monitoring is handled entirely by bambuManager (MQTT subscriptions).
 * This class is used only by the control routes (pause/resume/cancel) and
 * as the clientFactory entry point for Bambu printers.
 *
 * File upload (FTPS on port 990) and print start are not yet implemented.
 */

const bambuManager = require('./bambuManager');

class BambuClient {
  constructor(printer) {
    this.printer = printer;
  }

  /**
   * Returns the last MQTT-cached status. The actual MQTT subscription is managed
   * by bambuManager — this is a read of its state cache.
   * The HTTP poller does NOT call this; it calls bambuManager.ensureConnected() instead.
   */
  async getStatus() {
    const status = bambuManager.getLastStatus(this.printer.id);
    if (!status) throw new Error('No status received from Bambu printer yet (MQTT connecting…)');
    return status;
  }

  async pausePrint() {
    bambuManager.publishCommand(this.printer, {
      print: { command: 'pause', sequence_id: '0' },
    });
    return { success: true };
  }

  async resumePrint() {
    bambuManager.publishCommand(this.printer, {
      print: { command: 'resume', sequence_id: '0' },
    });
    return { success: true };
  }

  async cancelPrint() {
    bambuManager.publishCommand(this.printer, {
      print: { command: 'stop', sequence_id: '0', param: '' },
    });
    return { success: true };
  }

  async sendGcode() {
    throw new Error('Arbitrary G-code commands are not supported on Bambu printers in LAN mode');
  }

  // File upload requires FTPS (port 990) — not yet implemented
  async uploadFile() {
    throw new Error('File upload to Bambu printers is not yet supported (requires FTPS implementation)');
  }

  async startPrint() {
    throw new Error('Starting prints on Bambu printers is not yet supported (requires FTPS implementation)');
  }

  async getQueue() { return { queued_jobs: [], queue_state: 'ready' }; }
  async addToQueue() { throw new Error('Job queue not supported on Bambu printers'); }
  async removeFromQueue() { throw new Error('Job queue not supported on Bambu printers'); }
  async startQueue() { throw new Error('Job queue not supported on Bambu printers'); }

  async getMacros() { return []; }
  async getWebcams() { return []; }
  async getActiveSpoolId() { return null; }
}

module.exports = BambuClient;
