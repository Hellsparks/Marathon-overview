import { apiFetch } from './client';

export const startPrint = (printerId, filename) =>
  apiFetch(`/api/printers/${printerId}/print/start`, {
    method: 'POST',
    body: JSON.stringify({ filename }),
  });

export const pausePrint = (printerId) =>
  apiFetch(`/api/printers/${printerId}/print/pause`, { method: 'POST' });

export const resumePrint = (printerId) =>
  apiFetch(`/api/printers/${printerId}/print/resume`, { method: 'POST' });

export const cancelPrint = (printerId) =>
  apiFetch(`/api/printers/${printerId}/print/cancel`, { method: 'POST' });

export const sendGcode = (printerId, script) =>
  apiFetch(`/api/printers/${printerId}/gcode`, {
    method: 'POST',
    body: JSON.stringify({ script }),
  });

export const getWebcams = (printerId) =>
  apiFetch(`/api/printers/${printerId}/webcams`);

export const getMacros = (printerId) =>
  apiFetch(`/api/printers/${printerId}/macros`);

/**
 * Toggle chamber or work light on a Bambu printer.
 * node: 'chamber_light' | 'work_light'
 */
export const controlLight = (printerId, on, node = 'chamber_light') =>
  apiFetch(`/api/printers/${printerId}/light`, {
    method: 'POST',
    body: JSON.stringify({ on, node }),
  });

/**
 * Set bed or nozzle temperature.
 * type: 'bed' | 'nozzle', temp: number (°C, 0 = off)
 */
export const setTemperature = (printerId, type, temp) =>
  apiFetch(`/api/printers/${printerId}/temperature`, {
    method: 'POST',
    body: JSON.stringify({ type, temp }),
  });
