import { apiFetch } from './client';

export const getPresets = () => apiFetch('/api/presets');

export const createPreset = (data) =>
    apiFetch('/api/presets', { method: 'POST', body: JSON.stringify(data) });

export const updatePreset = (id, data) =>
    apiFetch(`/api/presets/${id}`, { method: 'PUT', body: JSON.stringify(data) });

export const deletePreset = (id) =>
    apiFetch(`/api/presets/${id}`, { method: 'DELETE' });

export const checkCompatibility = (fileId, printerId) =>
    apiFetch(`/api/files/${fileId}/compatibility/${printerId}`);
