import { apiFetch } from './client';

export const getPrinters = () => apiFetch('/api/printers');

export const createPrinter = (data) =>
  apiFetch('/api/printers', { method: 'POST', body: JSON.stringify(data) });

export const updatePrinter = (id, data) =>
  apiFetch(`/api/printers/${id}`, { method: 'PUT', body: JSON.stringify(data) });

export const deletePrinter = (id) =>
  apiFetch(`/api/printers/${id}`, { method: 'DELETE' });

export const scrapePrinterTheme = (host, port) =>
  apiFetch('/api/printers/scrape-theme', { method: 'POST', body: JSON.stringify({ host, port }) });
