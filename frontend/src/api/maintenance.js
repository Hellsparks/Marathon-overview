import { apiFetch } from './client';

export const getMaintenance = () => apiFetch('/api/maintenance');

export const createTask = (name) =>
  apiFetch('/api/maintenance/tasks', { method: 'POST', body: JSON.stringify({ name }) });

export const deleteTask = (taskId) =>
  apiFetch(`/api/maintenance/tasks/${taskId}`, { method: 'DELETE' });

export const setInterval = (taskId, printerId, interval_hours) =>
  apiFetch(`/api/maintenance/intervals/${taskId}/${printerId}`, {
    method: 'PUT',
    body: JSON.stringify({ interval_hours }),
  });

export const markDone = (taskId, printerId) =>
  apiFetch(`/api/maintenance/done/${taskId}/${printerId}`, { method: 'POST' });
