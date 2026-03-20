/**
 * BambuLab LAN Developer Mode — MQTT connection manager.
 *
 * Bambu printers expose an MQTT broker on port 8883 (TLS, self-signed cert).
 * This module maintains one persistent MQTT connection per Bambu printer.
 * Because status arrives via pub/sub rather than HTTP poll, this manager:
 *   - Receives status messages and writes them to printerCache directly
 *   - Tracks previous print state and logs completed/failed/cancelled jobs
 *     to gcode_print_jobs (mirrors the logic in poller.js for other firmwares)
 *
 * The HTTP poller skips Bambu printers and calls ensureConnected() instead.
 */

const mqtt = require('mqtt');
const { getDb } = require('../db');
const printerCache = require('./printerCache');

// printerId → mqtt.MqttClient
const connections = new Map();

// printerId → last merged Bambu "print" data object (partial updates are merged here)
const stateCache = new Map();

// printerId → { state, filename } — mirrors poller's previousStates for job logging
const previousStates = new Map();

// --- State normalization ---

/**
 * Map Bambu gcode_state strings to Marathon's normalized state vocabulary.
 * Bambu states: IDLE, RUNNING, PAUSE, FAILED, FINISH, SLICING, PREPARING, SCANNING
 */
function normalizeState(gcodeState) {
  switch ((gcodeState || '').toUpperCase()) {
    case 'RUNNING':
    case 'SLICING':
    case 'PREPARING':
    case 'SCANNING':
      return 'printing';
    case 'PAUSE':
      return 'paused';
    case 'FAILED':
      return 'error';
    case 'FINISH':
      // Brief terminal state before returning to IDLE — captured here so the
      // poller-equivalent logic below can log the completed job.
      return 'complete';
    default:
      return 'standby'; // IDLE, ''
  }
}

/**
 * Build Marathon's normalized status shape from merged Bambu print data.
 */
function buildStatus(printData) {
  const state = normalizeState(printData.gcode_state);
  const progress = Math.min((printData.mc_percent ?? 0) / 100, 1);

  return {
    print_stats: {
      state,
      filename: printData.subtask_name || printData.gcode_file || '',
      print_duration: 0, // Bambu doesn't expose elapsed time directly
      total_duration: 0,
      filament_used: 0,
    },
    display_status: {
      progress,
      message: printData.subtask_name || '',
    },
    virtual_sdcard: {
      progress,
      is_active: state === 'printing',
    },
    extruder: {
      temperature: printData.nozzle_temper ?? 0,
      target: printData.nozzle_target_temper ?? 0,
    },
    heater_bed: {
      temperature: printData.bed_temper ?? 0,
      target: printData.bed_target_temper ?? 0,
    },
    // Bambu-specific extras surfaced for the dashboard card
    _bambu: {
      mc_remaining_time: printData.mc_remaining_time ?? 0, // minutes
      layer_num: printData.layer_num ?? 0,
      total_layer_num: printData.total_layer_num ?? 0,
      wifi_signal: printData.wifi_signal ?? '',
      ams: printData.ams ?? null,
    },
  };
}

// --- Job logging (mirrors poller.js terminal-state logic) ---

function logTerminalJob(printer, terminalStatus, printData) {
  try {
    const db = getDb();
    const filename = printData.subtask_name || printData.gcode_file || 'Unknown';
    // Bambu gives remaining time (minutes) but not elapsed. We store 0 for duration
    // — a future improvement could track start time.
    db.prepare(`
      INSERT INTO gcode_print_jobs
      (printer_id, filename, total_duration_s, filament_used_mm,
       spool_id, spool_name, material, color_hex, vendor, status)
      VALUES (?, ?, ?, ?, NULL, NULL, NULL, NULL, NULL, ?)
    `).run(printer.id, filename, 0, 0, terminalStatus);
    console.log(`[Bambu] Logged print job (${terminalStatus}): "${filename}" on Printer ${printer.id}`);
  } catch (err) {
    console.error(`[Bambu] Failed to log print job for printer ${printer.id}:`, err.message);
  }
}

// --- MQTT message handler ---

function handleMessage(printer, printData) {
  // Merge partial update with previous full state
  const prev = stateCache.get(printer.id) || {};
  const merged = { ...prev, ...printData };
  stateCache.set(printer.id, merged);

  const status = buildStatus(merged);
  const currentState = status.print_stats.state;
  const prevStateObj = previousStates.get(printer.id);

  // Terminal state detection (same logic as poller.js)
  if (prevStateObj) {
    const prevState = prevStateObj.state;
    let terminalStatus = null;

    if (prevState === 'printing') {
      if (currentState === 'complete') terminalStatus = 'complete';
      else if (currentState === 'error') terminalStatus = 'error';
      // Bambu can go RUNNING → IDLE without FINISH if print is cancelled via stop command
      else if (currentState === 'standby') terminalStatus = 'complete';
    } else if (prevState === 'paused' && currentState === 'standby') {
      // Cancelled from a paused state (stop command while paused)
      terminalStatus = 'cancelled';
    }

    if (terminalStatus) {
      logTerminalJob(printer, terminalStatus, merged);
    }
  }

  previousStates.set(printer.id, {
    state: currentState,
    filename: status.print_stats.filename,
  });

  printerCache.set(printer.id, {
    ...status,
    _online: true,
    _polled_at: Date.now(),
    _active_spool: null,
  });
}

// --- Connection lifecycle ---

/**
 * Establish an MQTT connection for a Bambu printer if one doesn't already exist.
 * Safe to call repeatedly — idempotent for connected printers.
 */
function ensureConnected(printer) {
  if (!printer.serial_number) {
    printerCache.set(printer.id, {
      _online: false,
      _error: 'Serial number not configured',
      _polled_at: Date.now(),
    });
    return;
  }

  if (connections.has(printer.id)) {
    const existing = connections.get(printer.id);
    // If still connected, nothing to do
    if (existing.connected || existing.reconnecting) return;
    // Otherwise, clean up the dead connection and reconnect
    existing.end(true);
    connections.delete(printer.id);
  }

  const topicReport = `device/${printer.serial_number}/report`;
  const topicRequest = `device/${printer.serial_number}/request`;

  // Use URL-based connect — more reliable for TLS option propagation across
  // mqtt package versions. rejectUnauthorized:false bypasses the self-signed cert.
  const brokerUrl = `mqtts://${printer.host}:${printer.port || 8883}`;
  const client = mqtt.connect(brokerUrl, {
    username: 'bblp',
    password: printer.api_key || '',
    rejectUnauthorized: false,
    clientId: `marathon_${printer.id}_${Math.floor(Math.random() * 0xffff).toString(16)}`,
    reconnectPeriod: 5000,
    connectTimeout: 10000,
  });

  connections.set(printer.id, client);

  // Track the last real error so the 'offline' event doesn't overwrite it
  let lastError = null;

  client.on('connect', () => {
    lastError = null;
    console.log(`[Bambu] Connected to printer ${printer.id} (${printer.name})`);
    // Clear any previous offline error now that we're connected
    printerCache.set(printer.id, {
      _online: false, // stays false until first MQTT message arrives
      _error: 'Connected — waiting for first status message',
      _polled_at: Date.now(),
    });
    client.subscribe(topicReport, { qos: 0 });
    // Request a full status push so we don't wait for the next change event
    client.publish(topicRequest, JSON.stringify({
      pushing: { sequence_id: '0', command: 'pushall' },
    }));
  });

  client.on('message', (_topic, payload) => {
    try {
      const msg = JSON.parse(payload.toString());
      if (msg.print) {
        handleMessage(printer, msg.print);
      }
    } catch (err) {
      console.error(`[Bambu] Failed to parse MQTT message from printer ${printer.id}:`, err.message);
    }
  });

  client.on('error', (err) => {
    lastError = err.message;
    console.error(`[Bambu] MQTT error for printer ${printer.id}:`, err.message);
    printerCache.set(printer.id, {
      _online: false,
      _error: err.message,
      _polled_at: Date.now(),
    });
  });

  // 'offline' fires after 'error' during reconnect cycles — preserve the real error
  client.on('offline', () => {
    printerCache.set(printer.id, {
      _online: false,
      _error: lastError || 'MQTT offline / reconnecting',
      _polled_at: Date.now(),
    });
  });
}

/**
 * Disconnect and clean up the MQTT client for a printer.
 * Call when a printer is deleted or disabled.
 */
function disconnect(printerId) {
  const client = connections.get(printerId);
  if (client) {
    client.end(true);
    connections.delete(printerId);
    stateCache.delete(printerId);
    previousStates.delete(printerId);
  }
}

/**
 * Publish a raw command payload to the printer's request topic.
 * Throws if the MQTT client is not connected.
 */
function publishCommand(printer, payload) {
  const client = connections.get(printer.id);
  if (!client || !client.connected) {
    throw new Error('Bambu MQTT client is not connected');
  }
  client.publish(
    `device/${printer.serial_number}/request`,
    JSON.stringify(payload),
    { qos: 0 }
  );
}

/**
 * Return the last cached normalized status for a printer, or null if unknown.
 */
function getLastStatus(printerId) {
  const cached = stateCache.get(printerId);
  if (!cached) return null;
  return buildStatus(cached);
}

module.exports = { ensureConnected, disconnect, publishCommand, getLastStatus };
