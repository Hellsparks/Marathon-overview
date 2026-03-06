const { getDb } = require('../db');
const { getClient } = require('./clientFactory');
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
        const prevStateObj = previousStates.get(printer.id);

        if (prevStateObj) {
          const prevState = prevStateObj.state;

          // Detect terminal transition and determine logged status.
          // Handles all firmware types:
          //   Moonraker:   printing → complete | cancelled | error
          //   OctoPrint:   printing → complete (via "Finishing" mapping)
          //                cancelling → standby (cancel completed)
          //   Duet:        printing → standby (print completed naturally)
          //                cancelling → standby (cancel completed)
          let terminalStatus = null;

          if (prevState === 'printing') {
            if (['complete', 'cancelled', 'error'].includes(currentState)) {
              terminalStatus = currentState;
            } else if (currentState === 'standby') {
              // Duet (and any firmware without an explicit 'complete' state) arrives
              // here after a successful print. Treat as complete.
              terminalStatus = 'complete';
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

            try {
              db.prepare(`
                INSERT INTO gcode_print_jobs
                (printer_id, filename, total_duration_s, filament_used_mm, spool_id, spool_name, material, color_hex, vendor, status)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
              `).run(
                printer.id,
                prevStateObj.filename || currentFilename || 'Unknown',
                Math.round(duration),
                filamentUsed,
                spoolUsed?.id || null,
                spoolUsed?.filament_name || null,
                spoolUsed?.material || null,
                spoolUsed?.color_hex || null,
                spoolUsed?.vendor || null,
                terminalStatus
              );
              console.log(`[Poller] Logged print job (${terminalStatus}): ${prevStateObj.filename} on Printer ${printer.id}`);
              if (duration > 0) {
                db.prepare('UPDATE printers SET runtime_s = runtime_s + ? WHERE id = ?').run(Math.round(duration), printer.id);
              }
            } catch (jobErr) {
              console.error(`[Poller] Failed to log print job:`, jobErr.message);
            }
          }
        }

        // Update previous state tracker
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
