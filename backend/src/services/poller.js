const { getDb } = require('../db');
const { getClient } = require('./clientFactory');
const bambuManager = require('./bambuManager');
const printerCache = require('./printerCache');

const POLL_INTERVAL_MS = 3000;
let pollTimer = null;

const scrapeCache = new Map();
const SCRAPE_COOLDOWN_MS = 60 * 60 * 1000; // 1 hour

// Spool detail cache: spoolId → { data, fetchedAt }
const spoolCache = new Map();
const SPOOL_CACHE_TTL_MS = 30_000; // 30 seconds

// Printer state tracking to log finished/cancelled jobs
// Maps printerId -> { state, filename, startTime, activeSpool }
const previousStates = new Map();

/** Fetch full spool details from Spoolman, with caching */
async function getSpoolDetails(spoolId, spoolmanUrl) {
  if (!spoolId || !spoolmanUrl) return null;
  const cached = spoolCache.get(spoolId);
  if (cached && Date.now() - cached.fetchedAt < SPOOL_CACHE_TTL_MS) return cached.data;
  try {
    const r = await fetch(`${spoolmanUrl}/api/v1/spool/${spoolId}`, {
      signal: AbortSignal.timeout(5000),
    });
    if (!r.ok) return null;
    const spool = await r.json();
    const data = {
      id: spool.id,
      filament_name: spool.filament?.name ?? '',
      material: spool.filament?.material ?? '',
      color_hex: spool.filament?.color_hex ?? '',
      vendor: spool.filament?.vendor?.name ?? '',
      remaining_weight: Math.round(spool.remaining_weight ?? 0),
      initial_weight: Math.round(spool.initial_weight ?? 0),
    };
    spoolCache.set(spoolId, { data, fetchedAt: Date.now() });
    return data;
  } catch {
    return null;
  }
}

async function pollAll() {
  const db = getDb();
  const printers = db.prepare('SELECT * FROM printers WHERE enabled = 1').all();

  // Get Spoolman URL once per poll cycle
  const settingsRow = db.prepare("SELECT value FROM settings WHERE key = 'spoolman_url'").get();
  const spoolmanUrl = settingsRow?.value || '';

  await Promise.allSettled(
    printers.map(async (printer) => {
      // Bambu printers are managed entirely by bambuManager (MQTT).
      // The manager writes to printerCache and handles job logging itself.
      if (printer.firmware_type === 'bambu') {
        bambuManager.ensureConnected(printer);
        return;
      }

      const client = getClient(printer);
      try {
        const status = await client.getStatus();

        // Auto-scrape Mainsail CSS — Moonraker-only feature
        if (printer.firmware_type === 'moonraker' || !printer.firmware_type) {
          if (printer.theme_mode === 'scrape') {
            const lastScrape = scrapeCache.get(printer.id) || 0;
            if (!printer.custom_css || Date.now() - lastScrape > SCRAPE_COOLDOWN_MS) {
              try {
                const url = `http://${printer.host}:${printer.port || 7125}/server/files/config/.theme/custom.css`;
                const res = await fetch(url);
                if (res.ok) {
                  const css = await res.text();
                  if (css !== printer.custom_css) {
                    db.prepare('UPDATE printers SET custom_css = ? WHERE id = ?').run(css, printer.id);
                    printer.custom_css = css;
                  }
                  scrapeCache.set(printer.id, Date.now());
                }
              } catch (scrapeErr) {
                console.error(`[Poller] Failed to auto-scrape theme for printer ${printer.id}:`, scrapeErr.message);
              }
            }
          }
        }

        // Fetch active spool from Moonraker → Spoolman (Moonraker-only)
        let activeSpool = null;
        if (spoolmanUrl && (!printer.firmware_type || printer.firmware_type === 'moonraker')) {
          const spoolId = await client.getActiveSpoolId();
          if (spoolId) {
            activeSpool = await getSpoolDetails(spoolId, spoolmanUrl);
          }
        }

        // --- Print Job Tracking Logic ---
        const currentState = status.print_stats?.state;
        const currentFilename = status.print_stats?.filename;

        // Guard: if state is missing (Moonraker startup race, Klippy disconnect, etc.)
        // do NOT update previousStates — preserve last known good state so we don't
        // poison the tracker with undefined and permanently miss future transitions.
        if (!currentState) {
          printerCache.set(printer.id, {
            ...status,
            _online: true,
            _polled_at: Date.now(),
            _active_spool: activeSpool,
          });
          return;
        }

        const prevStateObj = previousStates.get(printer.id);

        // Startup recovery: if we have no previousState for this printer but there's an
        // active job record in the DB and the printer is in a terminal state, the backend
        // must have restarted during a print. Log the job now so the plate gets updated.
        if (!prevStateObj) {
          const TERMINAL = ['complete', 'cancelled', 'error', 'standby'];
          const durationNow = status.print_stats?.total_duration || status.print_stats?.print_duration || 0;
          // Only recover if there's evidence a print actually finished (duration > 0 or non-standby terminal state)
          const shouldRecover = TERMINAL.includes(currentState) && (currentState !== 'standby' || durationNow > 0);
          if (shouldRecover) {
            try {
              const staleJob = db.prepare('SELECT * FROM printer_active_jobs WHERE printer_id = ?').get(printer.id);
              if (staleJob) {
                const terminalStatus = currentState === 'complete' ? 'complete'
                  : currentState === 'cancelled' ? 'cancelled'
                  : currentState === 'error' ? 'error'
                  : 'complete'; // standby after active job = assume complete
                const duration = status.print_stats?.total_duration || status.print_stats?.print_duration || 0;
                const filamentUsed = status.print_stats?.filament_used || 0;
                const result = db.prepare(`
                  INSERT INTO gcode_print_jobs
                  (printer_id, filename, total_duration_s, filament_used_mm, status, plate_id)
                  VALUES (?, ?, ?, ?, ?, ?)
                `).run(printer.id, staleJob.filename, Math.round(duration), filamentUsed, terminalStatus, staleJob.plate_id || null);
                if (staleJob.plate_id) {
                  db.prepare(`UPDATE project_plates SET status = ?, print_job_id = ?, completed_at = datetime('now') WHERE id = ?`)
                    .run(terminalStatus === 'complete' ? 'done' : terminalStatus === 'cancelled' ? 'pending' : 'failed', result.lastInsertRowid, staleJob.plate_id);
                }
                db.prepare('DELETE FROM printer_active_jobs WHERE printer_id = ?').run(printer.id);
                if (duration > 0) db.prepare('UPDATE printers SET runtime_s = runtime_s + ? WHERE id = ?').run(Math.round(duration), printer.id);
                console.log(`[Poller] Startup recovery: logged stale job "${staleJob.filename}" (${terminalStatus}) on Printer ${printer.id}`);
              }
            } catch (e) {
              console.error('[Poller] Startup recovery failed:', e.message);
            }
          }
        }

        if (prevStateObj) {
          const prevState = prevStateObj.state;

          // Detect terminal transition.
          // Active states: printing, paused, cancelling (any state where a job is in flight)
          // Terminal states: complete, cancelled, error, standby (job is done)
          //
          // Firmware notes:
          //   Moonraker:   printing/paused → complete | cancelled | error
          //   OctoPrint:   printing → complete (via "Finishing" mapping), cancelling → standby
          //   Duet:        printing → standby (natural finish), cancelling → standby (cancel done)
          let terminalStatus = null;

          if (prevState === 'printing' || prevState === 'paused') {
            // A job was active. Any move to a terminal state ends it.
            if (currentState === 'complete') {
              terminalStatus = 'complete';
            } else if (currentState === 'cancelled') {
              terminalStatus = 'cancelled';
            } else if (currentState === 'error') {
              terminalStatus = 'error';
            } else if (currentState === 'standby') {
              if (prevState === 'paused') {
                // Cancelled while paused
                terminalStatus = 'cancelled';
              } else {
                // printing → standby can mean:
                //   (a) Natural finish on firmware without explicit 'complete' state (Duet, etc.)
                //   (b) Klipper FIRMWARE_RESTART / hard crash
                //
                // Klipper resets print_stats on restart: filename → "" AND duration → 0.
                // A natural finish leaves filename intact with duration > 0.
                const durationAfter = status.print_stats?.total_duration
                  || status.print_stats?.print_duration || 0;
                if (durationAfter === 0 && !currentFilename) {
                  terminalStatus = 'error'; // firmware restart or hard crash
                } else {
                  terminalStatus = 'complete'; // natural finish (Duet, etc.)
                }
              }
            }
          } else if (prevState === 'cancelling') {
            if (currentState === 'standby') {
              terminalStatus = 'cancelled';
            } else if (currentState === 'error') {
              terminalStatus = 'error';
            }
          }

          if (terminalStatus) {
            const duration = status.print_stats?.total_duration || status.print_stats?.print_duration || 0;
            const filamentUsed = status.print_stats?.filament_used || 0;
            const spoolUsed = prevStateObj.activeSpool || activeSpool;
            const loggedFilename = prevStateObj.filename || currentFilename || 'Unknown';

            try {
              // Check if this print was associated with a project plate
              // Wrapped separately so a missing table never blocks job logging
              let activeJob = null;
              try {
                activeJob = db.prepare(
                  'SELECT plate_id FROM printer_active_jobs WHERE printer_id = ? AND filename = ?'
                ).get(printer.id, loggedFilename);
              } catch { /* table may not exist yet */ }

              const result = db.prepare(`
                INSERT INTO gcode_print_jobs
                (printer_id, filename, total_duration_s, filament_used_mm, spool_id, spool_name, material, color_hex, vendor, status, plate_id)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
              `).run(
                printer.id,
                loggedFilename,
                Math.round(duration),
                filamentUsed,
                spoolUsed?.id || null,
                spoolUsed?.filament_name || null,
                spoolUsed?.material || null,
                spoolUsed?.color_hex || null,
                spoolUsed?.vendor || null,
                terminalStatus,
                activeJob?.plate_id || null
              );

              // Always clear the active job record (prevents stale entries from triggering false startup recovery)
              db.prepare('DELETE FROM printer_active_jobs WHERE printer_id = ?').run(printer.id);

              // If linked to a project plate, update its status
              if (activeJob?.plate_id) {
                db.prepare(
                  `UPDATE project_plates SET status = ?, print_job_id = ?, completed_at = datetime('now') WHERE id = ?`
                ).run(
                  terminalStatus === 'complete' ? 'done' : terminalStatus === 'cancelled' ? 'pending' : 'failed',
                  result.lastInsertRowid,
                  activeJob.plate_id
                );
              }

              console.log(`[Poller] Logged print job (${terminalStatus}): "${loggedFilename}" on Printer ${printer.id}`);
              if (duration > 0) {
                db.prepare('UPDATE printers SET runtime_s = runtime_s + ? WHERE id = ?').run(Math.round(duration), printer.id);
              }
            } catch (jobErr) {
              console.error(`[Poller] Failed to log print job:`, jobErr.message);
            }
          }
        }

        // Only update previousStates with valid, known states
        previousStates.set(printer.id, {
          state: currentState,
          filename: currentFilename,
          activeSpool: activeSpool
        });

        printerCache.set(printer.id, {
          ...status,
          _online: true,
          _polled_at: Date.now(),
          _active_spool: activeSpool,
        });
      } catch (err) {
        printerCache.set(printer.id, {
          _online: false,
          _error: err.message,
          _polled_at: Date.now(),
        });
      }
    })
  );
}

function startPolling() {
  if (pollTimer) clearInterval(pollTimer);
  pollAll(); // immediate first poll
  pollTimer = setInterval(pollAll, POLL_INTERVAL_MS);
  console.log('[Poller] Started polling every', POLL_INTERVAL_MS, 'ms');
}

function stopPolling() {
  if (pollTimer) {
    clearInterval(pollTimer);
    pollTimer = null;
  }
}

module.exports = { startPolling, stopPolling, pollAll };
