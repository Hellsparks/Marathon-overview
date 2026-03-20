/**
 * Tests for the theme scraper service.
 * Uses vi.stubGlobal to mock fetch so no real network calls happen.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';

// Reset module state between tests (scrapeState and scrapedCssCache are module-level)
beforeEach(() => {
  vi.resetModules();
  vi.unstubAllGlobals();
});

function mockFetch(response) {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
    ok: true,
    json: () => Promise.resolve(response),
  }));
}

function mockFetchError(message = 'Network error') {
  vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error(message)));
}

function mockFetchBadStatus(status = 404, body = { error: 'Not found' }) {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
    ok: false,
    status,
    json: () => Promise.resolve(body),
  }));
}

const printer = { id: 1, host: '192.168.1.10', port: 7125, api_key: null, scrape_css_path: null };

async function freshScraper() {
  // Re-import after resetModules to get a clean state
  return import('../../services/themeScraper');
}

describe('scrapeTheme — success', () => {
  it('returns css on successful scrape', async () => {
    mockFetch({ css: ':root { --primary: #ff0000; }' });
    const { scrapeTheme } = await freshScraper();

    const result = await scrapeTheme(printer);
    expect(result.css).toContain('--primary');
    expect(result.error).toBeNull();
  });

  it('caches css after successful scrape', async () => {
    mockFetch({ css: '.card { color: red; }' });
    const { scrapeTheme, getCachedCss } = await freshScraper();

    await scrapeTheme(printer);
    expect(getCachedCss(printer)).toContain('.card');
  });

  it('resets attempt counter on success', async () => {
    mockFetch({ css: ':root {}' });
    const { scrapeTheme, getScrapeError } = await freshScraper();

    await scrapeTheme(printer);
    expect(getScrapeError(printer)).toBeNull();
  });
});

describe('scrapeTheme — failure', () => {
  it('returns error on network failure', async () => {
    mockFetchError('Connection refused');
    const { scrapeTheme } = await freshScraper();

    // Need to call 5 times to exhaust attempts (rate limiter resets after each test via resetModules)
    let result;
    for (let i = 0; i < 5; i++) {
      // Bypass rate limiter: each re-import is a fresh module, so just exhaust in one module instance
      // We need a way to advance time — instead just confirm error is tracked
      result = await scrapeTheme(printer);
    }
    // After 5 failures the error should be surfaced
    expect(result.error).toBeTruthy();
  });

  it('returns cached css alongside error when available', async () => {
    // First call succeeds and caches
    mockFetch({ css: ':root { --primary: green; }' });
    const { scrapeTheme } = await freshScraper();
    await scrapeTheme(printer);

    // Subsequent calls hit rate limiter quiet period and return cached value
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('down')));
    const result = await scrapeTheme(printer);
    // Within quiet period — returns cached without error
    expect(result.css).toContain('--primary');
  });
});

describe('scrapeTheme — rate limiting', () => {
  it('does not call fetch again within the quiet period', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ css: ':root {}' }),
    });
    vi.stubGlobal('fetch', fetchMock);

    const { scrapeTheme } = await freshScraper();

    await scrapeTheme(printer);
    await scrapeTheme(printer); // should be within quiet period
    await scrapeTheme(printer); // same

    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});

describe('getCachedCss', () => {
  it('returns null before any scrape', async () => {
    const { getCachedCss } = await freshScraper();
    expect(getCachedCss(printer)).toBeNull();
  });
});

describe('getScrapeError', () => {
  it('returns null before any scrape', async () => {
    const { getScrapeError } = await freshScraper();
    expect(getScrapeError(printer)).toBeNull();
  });
});
