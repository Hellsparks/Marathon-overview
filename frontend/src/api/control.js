import { apiFetch } from './client';

export const startPrint = (printerId, filename) =>
  apiFetch(`/api/printers/${printerId}/print/start`, {
    method: 'POST',
    body: JSON.stringify({ filename }),
  });

export const pausePrint  = (printerId) =>
  apiFetch(`/api/printers/${printerId}/print/pause`,  { method: 'POST' });

export const resumePrint = (printerId) =>
  apiFetch(`/api/printers/${printerId}/print/resume`, { method: 'POST' });

export const cancelPrint = (printerId) =>
  apiFetch(`/api/printers/${printerId}/print/cancel`, { method: 'POST' });
