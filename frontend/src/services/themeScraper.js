/**
 * Centralised Mainsail theme scraper.
 *
 * Rules (all state is module-level so it survives page navigation):
 *  - Give up after MAX_ATTEMPTS consecutive failures.
 *  - Wait at least RETRY_INTERVAL between any two attempts (success or fail).
 *  - On success the CSS is cached indefinitely for the session; re-scrape
 *    happens at the next RETRY_INTERVAL boundary so theme updates are picked up.
 */

import { scrapedCssCache } from './scrapedCssCache';

const MAX_ATTEMPTS    = 5;
const RETRY_INTERVAL  = 60 * 60 * 1000; // 1 hour in ms

// Per-printer scrape state  { attempts: number, lastAttempt: number }
const scrapeState = new Map();

function cacheKey(printer) {
  return `${printer.host}:${printer.port}`;
}

/**
 * Removes all cached state for a printer (call when a printer is deleted).
 */
export function clearPrinterScrapeCache(printer) {
  const key = cacheKey(printer);
  scrapeState.delete(key);
  scrapedCssCache.delete(key);
}

/**
 * Returns the currently cached CSS for a printer (may be null).
 */
export function getCachedCss(printer) {
  return scrapedCssCache.get(cacheKey(printer)) ?? null;
}

/**
 * Returns the scrape error message if the printer has exhausted all attempts.
 */
export function getScrapeError(printer) {
  const s = scrapeState.get(cacheKey(printer));
  return s?.error ?? null;
}

/**
 * Attempts to scrape the printer's Mainsail CSS.
 * Returns { css, error } — exactly one will be non-null.
 * Respects rate-limiting and max-attempt rules; resolves immediately (with
 * cached/null values) when within the quiet period.
 */
export async function scrapeTheme(printer) {
  const key   = cacheKey(printer);
  const state = scrapeState.get(key) ?? { attempts: 0, lastAttempt: 0, error: null };
  const now   = Date.now();
  const since = now - state.lastAttempt;

  // Already gave up
  if (state.attempts >= MAX_ATTEMPTS && !scrapedCssCache.has(key)) {
    return { css: null, error: state.error ?? 'Scrape failed after 5 attempts.' };
  }

  // Still within quiet period — return whatever we have
  if (state.lastAttempt && since < RETRY_INTERVAL) {
    return { css: scrapedCssCache.get(key) ?? null, error: state.error ?? null };
  }

  // Attempt a scrape
  scrapeState.set(key, { ...state, lastAttempt: now });

  try {
    const r = await fetch('/api/printers/scrape-theme', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        host: printer.host,
        port: printer.port,
        api_key: printer.api_key,
        scrape_css_path: printer.scrape_css_path,
      }),
      signal: AbortSignal.timeout(10000),
    });
    const d = await r.json();

    if (d.css) {
      scrapedCssCache.set(key, d.css);
      // Success — reset failure counter
      scrapeState.set(key, { attempts: 0, lastAttempt: now, error: null });
      return { css: d.css, error: null };
    }

    // Non-CSS response from backend (e.g. 404 / 502 error body)
    const newAttempts = state.attempts + 1;
    const err = d.error ?? 'Unknown scrape error';
    scrapeState.set(key, { attempts: newAttempts, lastAttempt: now, error: err });
    return { css: scrapedCssCache.get(key) ?? null, error: newAttempts >= MAX_ATTEMPTS ? err : null };

  } catch {
    const newAttempts = state.attempts + 1;
    const err = 'Network error during scrape';
    scrapeState.set(key, { attempts: newAttempts, lastAttempt: now, error: err });
    return { css: scrapedCssCache.get(key) ?? null, error: newAttempts >= MAX_ATTEMPTS ? err : null };
  }
}
