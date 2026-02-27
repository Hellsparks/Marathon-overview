import { apiFetch } from './client';

export const getQueue = (printerId) =>
  apiFetch(`/api/printers/${printerId}/queue`);

export const addToQueue = (printerId, filenames) =>
  apiFetch(`/api/printers/${printerId}/queue`, {
    method: 'POST',
    body: JSON.stringify({ filenames }),
  });

export const removeFromQueue = (printerId, jobId) =>
  apiFetch(`/api/printers/${printerId}/queue/${jobId}`, { method: 'DELETE' });

export const startQueue = (printerId) =>
  apiFetch(`/api/printers/${printerId}/queue/start`, { method: 'POST' });
