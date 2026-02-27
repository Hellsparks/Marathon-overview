const { getDb } = require('../db');
const MoonrakerClient = require('./moonraker');
const printerCache = require('./printerCache');

const POLL_INTERVAL_MS = 3000;
let pollTimer = null;

async function pollAll() {
  const db = getDb();
  const printers = db.prepare('SELECT * FROM printers WHERE enabled = 1').all();

  await Promise.allSettled(
    printers.map(async (printer) => {
      const client = new MoonrakerClient(printer);
      try {
        const status = await client.getStatus();
        printerCache.set(printer.id, {
          ...status,
          _online: true,
          _polled_at: Date.now(),
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
