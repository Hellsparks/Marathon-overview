import { apiFetch } from './client';

export const getAllStatus = () => apiFetch('/api/status');
export const getPrinterStatus = (id) => apiFetch(`/api/status/${id}`);
