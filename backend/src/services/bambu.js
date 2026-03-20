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

  async sendGcode(script) {
    const lines = script.split('\n').map(l => l.trim()).filter(Boolean);
    for (const line of lines) {
      bambuManager.publishCommand(this.printer, {
        print: { command: 'gcode_line', param: line + ' \n', sequence_id: '0' },
      });
    }
    return { success: true };
  }

  /**
   * Control the chamber or work light.
   * led_node: 'chamber_light' | 'work_light'
   * on: true = on, false = off
   */
  async controlLight(on, node = 'chamber_light') {
    console.log(`[Bambu] controlLight printer=${this.printer.id} node=${node} on=${on}`);
    bambuManager.publishCommand(this.printer, {
      system: {
        sequence_id: '0',
        command: 'ledctrl',
        led_node: node,
        led_mode: on ? 'on' : 'off',
        // Required by spec even for on/off mode
        led_on_time: 500,
        led_off_time: 500,
        loop_times: 1,
        interval_time: 1000,
      },
    });
    return { success: true };
  }

  /**
   * Set a temperature target.
   * type: 'bed' | 'nozzle'
   * temp: target temperature in °C (0 = off)
   */
  async setTemperature(type, temp) {
    const t = Math.round(Math.max(0, temp));
    console.log(`[Bambu] setTemperature printer=${this.printer.id} type=${type} temp=${t}`);
    if (type === 'bed') {
      // M140 = set bed temp (no wait). M190 = wait — use M140 for async
      await this.sendGcode(`M140 S${t}`);
    } else if (type === 'nozzle') {
      // M104 = set hotend temp (no wait). M109 = wait — use M104 for async
      await this.sendGcode(`M104 S${t}`);
    } else {
      throw new Error(`Unknown temperature type: ${type}. Use 'bed' or 'nozzle'`);
    }
    return { success: true };
  }

  /**
   * Webcam stream URL for Bambu printers in Developer Mode.
   * Returns an rtsps:// URL. The frontend proxies this via the backend.
   */
  getWebcamUrl() {
    return `rtsps://bblp:${this.printer.api_key}@${this.printer.host}:322/streaming/live/1`;
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

  async setAmsTray(trayId, { tray_color, tray_type, nozzle_temp_min, nozzle_temp_max, tray_info_idx, setting_id }) {
    // OrcaSlicer-confirmed payload format:
    // - ams_id: 0 (integer, not string)
    // - tray_info_idx: must be non-empty (e.g. 'GFL99' for PLA, 'GFG02' for PETG)
    // - setting_id: filament profile preset (e.g. 'GFSL99', 'GFSG02_03')
    // Empty tray_info_idx causes silent failure (result:success but nothing changes)
    const payload = {
      sequence_id: '0',
      command: 'ams_filament_setting',
      ams_id: 0,
      tray_id: trayId,
      tray_info_idx: tray_info_idx || 'GFL99',
      setting_id: setting_id || 'GFSL99',
      tray_color: tray_color || 'FFFFFFFF',
      tray_type: tray_type || 'PLA',
      nozzle_temp_min: nozzle_temp_min ?? 190,
      nozzle_temp_max: nozzle_temp_max ?? 230,
    };

    console.log(`[Bambu] setAmsTray printer=${this.printer.id} tray=${trayId} type=${tray_type} color=${tray_color} idx=${payload.tray_info_idx}`);
    bambuManager.publishCommand(this.printer, { print: payload });
    return { success: true };
  }

  async clearAmsTray(trayId) {
    console.log(`[Bambu] clearAmsTray printer=${this.printer.id} tray=${trayId}`);
    bambuManager.publishCommand(this.printer, {
      print: {
        sequence_id: '0',
        command: 'ams_filament_setting',
        ams_id: 0,
        tray_id: trayId,
        tray_info_idx: 'GFL99',
        setting_id: 'GFSL99',
        tray_color: '00000000',
        tray_type: '',
        nozzle_temp_min: 0,
        nozzle_temp_max: 0,
      }
    });
    return { success: true };
  }

  async getMacros() { return []; }
  async getWebcams() { return []; }
  async getActiveSpoolId() { return null; }
}

module.exports = BambuClient;
