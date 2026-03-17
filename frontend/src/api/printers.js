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

// MMU presets & assignments
export const getMmuPresets = () => apiFetch('/api/printers/mmu-presets');

export const getPrinterMmus = (printerId) =>
  apiFetch(`/api/printers/${printerId}/mmus`);

export const updatePrinterMmus = (printerId, mmus) =>
  apiFetch(`/api/printers/${printerId}/mmus`, { method: 'PUT', body: JSON.stringify({ mmus }) });
