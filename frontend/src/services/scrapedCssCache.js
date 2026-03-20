// Shared module-level cache for scraped Mainsail CSS.
// Exported so PrinterCard and MaintenancePrinterCard share the same cache
// regardless of which page was visited first.
export const scrapedCssCache = new Map();
