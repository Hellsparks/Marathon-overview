const { getDb } = require('../db');
const MoonrakerClient = require('./moonraker');
const printerCache = require('./printerCache');

const POLL_INTERVAL_MS = 3000;
let pollTimer = null;

const scrapeCache = new Map();
const SCRAPE_COOLDOWN_MS = 60 * 60 * 1000; // 1 hour

async function pollAll() {
  const db = getDb();
  const printers = db.prepare('SELECT * FROM printers WHERE enabled = 1').all();

  await Promise.allSettled(
    printers.map(async (printer) => {
      const client = new MoonrakerClient(printer);
      try {
        const status = await client.getStatus();

        // Auto-scrape logic
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
                  printer.custom_css = css; // update local object for context
                }
                scrapeCache.set(printer.id, Date.now());
              }
            } catch (scrapeErr) {
              console.error(`[Poller] Failed to auto-scrape theme for printer ${printer.id}:`, scrapeErr.message);
            }
          }
        }

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
